"""In-memory pub-sub event bus az onboarding pipeline-hoz.

A pipeline minden fontos átmenete (Phase indítás/befejezés, attempt log,
hibák) eseménybe csomagolva fut át a buszon. A buszra feliratkozhat:

- a `OnboardingStorage.log_event` (perzisztens audit trail) — ezt az
  orchestrator alapból minden eventnél meghívja, NEM a busz feladata.
- in-memory subscriber-ek (real-time UI, CLI progress bar, tesztek).
  Ezeket a `EventBus.subscribe(callback)` regisztrálja.

Tervezési alapelvek:

1. **Sync először, async-ra előkészített.** A `publish()` szinkronan
   meghívja az összes subscriber callback-et. Egy subscriber saját maga
   választhat async-et, de a publish nem `await`-el. Az SSE / websocket
   layer később egy köztes adapter-t kap.
2. **Subscriber-szigetelés.** Egy hibás callback nem akadályozza a
   többit; a kivételt elnyeljük és warning-ként logoljuk a stderr-re.
   Ez fontos, mert ha egy subscriber kivételt dob, az NEM dönti meg az
   orchestrator pipeline-ját.
3. **Sorszám-stabilitás.** A `OnboardingEvent.event_id` az
   `OnboardingStorage.log_event` által visszaadott DB sequence —
   monoton, FIFO. A hívó (orchestrator) kapcsolja össze a kettőt.
4. **Pydantic event-payload.** Az event payload `dict` — szabad-formájú,
   de JSON-szerializálható kell legyen (a storage `json.dumps`-szal írja).

A modul nem ismeri a storage-t — a kapcsolódást az orchestrator hozza
létre. Ez teszi a modult önmagában is tesztelhetővé.
"""

from __future__ import annotations

import sys
import threading
from datetime import datetime
from typing import Any, Callable, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


OnboardingEventPhase = Literal[
    "phase0",  # brief-driven flow Phase 0 (expander + brief_received/updated)
    "phase1",
    "phase2",
    "phase3a",
    "phase3b",
    "end_node_generation",  # Card 4A AI hívás
    "pipeline",
]


class OnboardingEvent(BaseModel):
    """Egy pipeline-event in-memory + DB-projekciója.

    A `kind` szabad-formájú string — konvenció:

    - `*_started` / `*_completed` — fázis-átmenetek.
    - `node_attempt` — egy Phase 2 attempt feljegyzése.
    - `node_accepted` / `node_rejected` — egy node végkifejlete.
    - `error` / `warning` — strukturális gondok.
    """

    model_config = ConfigDict(extra="forbid")

    event_id: int = Field(
        ...,
        description="DB sequence id (storage.log_event-ből); monoton FIFO.",
    )
    job_id: str
    phase: OnboardingEventPhase
    kind: str = Field(..., min_length=1)
    at: datetime
    payload: Optional[dict[str, Any]] = None


# Subscriber callback: szinkron, return value ignored.
EventCallback = Callable[[OnboardingEvent], None]


class EventBus:
    """Thread-safe in-memory pub-sub.

    Egy bus-példány egy futási tér (tipikusan: egy orchestrator-hívás
    alatt élő subscriber halmaz). A subscriber-eket `subscribe()`
    visszaadta `int` ID-vel lehet eltávolítani; a publish FIFO sorrendben
    hívja őket.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[int, EventCallback] = {}
        self._next_id: int = 1

    def subscribe(self, callback: EventCallback) -> int:
        """Új feliratkozás. Visszaad: subscription ID (unsubscribe-hoz)."""
        with self._lock:
            sub_id = self._next_id
            self._next_id += 1
            self._subscribers[sub_id] = callback
        return sub_id

    def unsubscribe(self, sub_id: int) -> None:
        """Subscriber eltávolítása. No-op, ha az ID nem létezik."""
        with self._lock:
            self._subscribers.pop(sub_id, None)

    def publish(self, event: OnboardingEvent) -> None:
        """Sync fan-out minden subscriber-hez.

        A subscriber callback-ek szinkronan futnak a publish thread-jén.
        Egy callback kivétele NEM dönti meg a többit; a hibát stderr-re
        logoljuk.
        """
        with self._lock:
            current = list(self._subscribers.items())
        for sub_id, cb in current:
            try:
                cb(event)
            except Exception as exc:  # noqa: BLE001 — szándékos catch-all
                print(
                    f"[event_bus] subscriber {sub_id} kivétele lenyelve: "
                    f"{type(exc).__name__}: {exc}",
                    file=sys.stderr,
                )

    def __len__(self) -> int:
        with self._lock:
            return len(self._subscribers)


__all__ = [
    "OnboardingEvent",
    "OnboardingEventPhase",
    "EventBus",
    "EventCallback",
]


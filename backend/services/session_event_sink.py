"""Session event log sink — turn-szintű JSONL audit.

Minden turn végén egy esemény íródik a session-specifikus fájlba:
    <SESSION_EVENTS_DIR>/<session_id>.jsonl

A `JsonlFileTicketSink` mintáját követi: szinkron írás, idempotens egy adott
(sessionId, turn) kulcsra.

Két fogyasztó használja:
  * runtime: a cross-node user_facing_context lookup-hoz olvassa a látogatott
    node-ok listáját (`read_visited_nodes`)
  * analytics: batch módon dolgozza fel a JSONL fájlokat routing-rekonstrukcióhoz
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from services.runtime_config import BASE_DIR

logger = logging.getLogger(__name__)

SESSION_EVENTS_DIR = os.path.abspath(
    os.getenv(
        "SESSION_EVENTS_DIR",
        os.path.join(BASE_DIR, "data", "session_events"),
    )
)


_ALLOWED_EVENT_KEYS: frozenset[str] = frozenset(
    {
        "sessionId",
        "turn",
        "timestamp",
        "fromNodeId",
        "toNodeId",
        "fromStepId",
        "toStepId",
        "satisfied_before",
        "satisfied_after",
        "newlySatisfied",
        "userHasOpenQuestion",
        "userQuestionSummary",
        "branchTaken",
        "endPageId",
    }
)


def utc_now_iso() -> str:
    """ISO timestamp UTC-ben (JsonlFileTicketSink-konvenció)."""
    return datetime.now(timezone.utc).isoformat()


class SessionEventSink:
    """Turn-szintű JSONL sink — egy fájl session_id-onként.

    Idempotens kulcs: (sessionId, turn). Ha ugyanazzal a turn számmal már
    érkezett esemény, nem ír duplikátot.
    """

    def __init__(self, base_dir: Path | str | None = None) -> None:
        self.base_dir = (
            Path(base_dir) if base_dir is not None else Path(SESSION_EVENTS_DIR)
        )

    def _get_path(self, session_id: str) -> Path:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        safe_id = _safe_filename(session_id)
        return self.base_dir / f"{safe_id}.jsonl"

    def submit(self, event: dict) -> bool:
        """Az eseményt írja a session fájlba. Visszatér True ha valóban írt,
        False ha duplikátum vagy hibás esemény.
        """
        session_id = event.get("sessionId")
        turn = event.get("turn")
        if not isinstance(session_id, str) or not session_id.strip():
            logger.debug("SessionEventSink: sessionId hiányzik, kihagyás")
            return False
        if not isinstance(turn, int) or turn < 1:
            logger.debug("SessionEventSink: turn hiányzik vagy érvénytelen")
            return False

        normalized = {k: event.get(k) for k in _ALLOWED_EVENT_KEYS if k in event}
        normalized.setdefault("timestamp", utc_now_iso())

        path = self._get_path(session_id.strip())
        try:
            if _event_exists(path, session_id.strip(), turn):
                logger.debug(
                    "SessionEvent már létezik, kihagyás: session=%s turn=%s",
                    session_id,
                    turn,
                )
                return False
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(normalized, ensure_ascii=False) + "\n")
            return True
        except Exception as exc:
            logger.error("SessionEventSink írási hiba: %s", exc)
            return False


def _safe_filename(session_id: str) -> str:
    """Csak alfanumerikus, kötőjel és aláhúzás engedélyezett a fájlnévben."""
    cleaned = "".join(
        c if c.isalnum() or c in ("-", "_") else "_" for c in session_id.strip()
    )
    return cleaned or "anonymous"


def _event_exists(path: Path, session_id: str, turn: int) -> bool:
    if not path.exists():
        return False
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    existing = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if (
                    existing.get("sessionId") == session_id
                    and existing.get("turn") == turn
                ):
                    return True
    except OSError:
        return False
    return False


def _iter_session_events(
    session_id: str,
    base_dir: Path | str | None = None,
):
    """Iterates over session events in write order (oldest first)."""
    if not isinstance(session_id, str) or not session_id.strip():
        return
    root = Path(base_dir) if base_dir is not None else Path(SESSION_EVENTS_DIR)
    path = root / f"{_safe_filename(session_id.strip())}.jsonl"
    if not path.exists():
        return
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


def read_visited_nodes(
    session_id: str,
    *,
    base_dir: Path | str | None = None,
    max_items: int = 10,
) -> list[str]:
    """Visszaadja a session során látogatott node ID-kat sorrendben, dedupolva.

    A `toNodeId` mezőkből építkezik (a turn-ek céljai). Hard cap: max_items
    legutóbbi különböző node. Új session vagy hiányzó fájl esetén üres lista.
    """
    if max_items < 1:
        return []
    seen: dict[str, None] = {}
    for event in _iter_session_events(session_id, base_dir=base_dir):
        node = event.get("toNodeId")
        if isinstance(node, str) and node.strip():
            key = node.strip()
            # Move-to-end semantics (őrizzük a legutóbbi sorrendet)
            seen.pop(key, None)
            seen[key] = None
    if not seen:
        return []
    nodes = list(seen.keys())
    if len(nodes) > max_items:
        nodes = nodes[-max_items:]
    return nodes


def read_last_event(
    session_id: str,
    *,
    base_dir: Path | str | None = None,
) -> dict | None:
    """Visszaadja a session legutolsó eseményét (vagy None ha nincs)."""
    last: dict | None = None
    for event in _iter_session_events(session_id, base_dir=base_dir):
        last = event
    return last


_default_sink: SessionEventSink | None = None


def get_default_session_event_sink() -> SessionEventSink:
    """Process-szintű singleton — a base_dir env változóból olvasódik be."""
    global _default_sink
    if _default_sink is None:
        _default_sink = SessionEventSink()
    return _default_sink


def reset_default_session_event_sink() -> None:
    """Tesztekben hívható, ha az env változó megváltozott (pl. tmp_path fixture)."""
    global _default_sink
    _default_sink = None

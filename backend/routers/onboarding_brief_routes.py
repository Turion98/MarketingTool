"""FastAPI route-ok a brief-driven onboarding flow-hoz.

Endpoint katalógus (prefix `/api/onboarding/brief`):

* `POST /jobs` — új job `SupportChatbotBrief`-ből. Body egyenes
  `SupportChatbotBrief` JSON. Háttérben Phase 0-t fut (determinisztikus).
* `GET /jobs/{job_id}` — teljes `OnboardingJob` aggregátum.
* `GET /jobs` — header-szintű job-lista (Dashboard listához).
* `PUT /jobs/{job_id}/brief` — brief UPSERT (kártya mentés). Re-runs Phase 0.
* `POST /jobs/{job_id}/end-nodes/generate` — Card 4A AI hívás (SYNC, 5-20s).
* `POST /jobs/{job_id}/build` — Phase 1-3 BG indítás (a "Chatbot építése" gomb).
* `GET /jobs/{job_id}/events` — SSE event stream a UI progress követéséhez.
* `POST /coach` — onboarding coach chat (magyarázat + highlight + javaslat).

Tervezési alapelvek:

1. **Thin wrapper az orchestrator felett.** A logika a service rétegben él
   (`OnboardingOrchestrator`, `OnboardingStorage`); a route csak HTTP-vé
   csomagolja.
2. **Lazy singleton storage + orchestrator.** Egy modul-szintű cache, ami
   az első hívásra felépíti a `OnboardingStorage`-et (`init_schema`-val)
   és a default `AnthropicOnboardingClient`-et. A teszt-injection a
   `_override_*` helper-eken keresztül megy.
3. **BG task a build-re.** A teljes pipeline (Phase 1-3) 10-60 sec, ezért
   `BackgroundTasks`-tel BG-be tesszük. A frontend SSE-n követi a progresst.
4. **Polling-based SSE.** Az event-bus pub-sub jelenleg sync (`EventBus.subscribe`),
   ami nehéz aszinkron generátorral összerakni. V1 polling: a server 0.5 sec
   loop-ban lekéri a `storage.list_events(since=last_id)`-t, és az új
   event-eket küldi. Lezárás amikor a job státusza terminal.

Hibák:
* Pydantic ValidationError → 422 Unprocessable Entity (FastAPI default).
* `JobNotFound` → 404 Not Found (handler-ben fordítva).
* `OrchestratorError` → 500 Internal Server Error (a status_detail-ben részletek).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.onboarding.anthropic_client import AnthropicOnboardingClient
from services.onboarding.brief_contracts import (
    EndNodeKind,
    SupportChatbotBrief,
)
from services.onboarding.contracts import OnboardingJob, RetryConfig
from services.onboarding.end_node_text_generator import EndNodeTextClient
from services.onboarding.event_bus import EventBus
from services.onboarding.onboarding_coach import CoachRequest, CoachResponse, run_coach
from services.onboarding.orchestrator import (
    OnboardingOrchestrator,
    OrchestratorError,
)
from services.onboarding.storage import JobNotFound, OnboardingStorage


router = APIRouter(prefix="/onboarding/brief", tags=["onboarding-brief"])
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Lazy singletons                                                             #
# --------------------------------------------------------------------------- #


_DEFAULT_DB_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "onboarding.db"
)


_singleton_lock = threading.Lock()
_storage_singleton: Optional[OnboardingStorage] = None
_event_bus_singleton: Optional[EventBus] = None
_anthropic_client_singleton: Optional[AnthropicOnboardingClient] = None


def _get_storage() -> OnboardingStorage:
    """Lazy singleton: az első hívásra felépíti a DB-t."""
    global _storage_singleton
    if _storage_singleton is not None:
        return _storage_singleton
    with _singleton_lock:
        if _storage_singleton is None:
            db_path = Path(
                os.getenv("ONBOARDING_DB_PATH", str(_DEFAULT_DB_PATH))
            )
            db_path.parent.mkdir(parents=True, exist_ok=True)
            s = OnboardingStorage(db_path)
            s.init_schema()
            _storage_singleton = s
    return _storage_singleton


def _get_event_bus() -> EventBus:
    global _event_bus_singleton
    if _event_bus_singleton is None:
        with _singleton_lock:
            if _event_bus_singleton is None:
                _event_bus_singleton = EventBus()
    return _event_bus_singleton


def _get_anthropic_client() -> AnthropicOnboardingClient:
    """Lazy singleton az Anthropic kliens-hez.

    Csak akkor jön létre, ha valaki ténylegesen AI hívást indít (Card 4A
    generálás vagy build). A `start_job_from_brief` és Phase 0 NEM
    igényli, így a route-ok akkor is működnek ha ANTHROPIC_API_KEY hiányzik
    (csak a Card 4A és build hibázik).
    """
    global _anthropic_client_singleton
    if _anthropic_client_singleton is None:
        with _singleton_lock:
            if _anthropic_client_singleton is None:
                _anthropic_client_singleton = AnthropicOnboardingClient()
    return _anthropic_client_singleton


def _get_orchestrator(
    *,
    end_node_client: Optional[EndNodeTextClient] = None,
) -> OnboardingOrchestrator:
    """Új orchestrator példány hívásonként (lightweight: storage shared)."""
    return OnboardingOrchestrator(
        storage=_get_storage(),
        client=_get_anthropic_client(),  # type: ignore[arg-type]
        event_bus=_get_event_bus(),
    )


# --- Test injection hooks ---------------------------------------------------
# A pytest-integration tesztek a tömeges singleton-okat felülírják ezzel.


def _override_singletons(
    *,
    storage: Optional[OnboardingStorage] = None,
    anthropic_client: Optional[Any] = None,
    event_bus: Optional[EventBus] = None,
) -> None:  # pragma: no cover — csak tesztelési segéd
    global _storage_singleton, _anthropic_client_singleton, _event_bus_singleton
    if storage is not None:
        _storage_singleton = storage
    if anthropic_client is not None:
        _anthropic_client_singleton = anthropic_client  # type: ignore[assignment]
    if event_bus is not None:
        _event_bus_singleton = event_bus


def _reset_singletons() -> None:  # pragma: no cover
    global _storage_singleton, _anthropic_client_singleton, _event_bus_singleton
    _storage_singleton = None
    _anthropic_client_singleton = None
    _event_bus_singleton = None


# --------------------------------------------------------------------------- #
# Request / response DTO-k                                                    #
# --------------------------------------------------------------------------- #


class OnboardingJobSummary(BaseModel):
    """Header-szintű job-info (dashboard list + create response)."""

    job_id: str
    status: str
    status_detail: Optional[str] = None
    domain_name: str
    target_locale: str
    vendor_policy: str
    vendor_name: Optional[str] = None
    created_at: str
    updated_at: str
    has_brief: bool
    has_phase0_result: bool
    has_blueprint: bool
    has_final_story: bool


class OnboardingJobListResponse(BaseModel):
    jobs: list[OnboardingJobSummary]


class EndNodeGenerationRequest(BaseModel):
    overwrite_user_edits: bool = False


class EndNodeGenerationResponse(BaseModel):
    job_id: str
    applied_kinds: list[str]
    skipped_user_edited_count: int
    generated: dict[str, str]


class BuildRequest(BaseModel):
    """Opcionális retry-config override a Build hívásnál."""

    max_attempts_per_node: Optional[int] = None
    escalate_after_attempts: Optional[bool] = None


class BuildAcceptedResponse(BaseModel):
    job_id: str
    status: str
    message: str


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _job_to_summary(job: OnboardingJob) -> OnboardingJobSummary:
    return OnboardingJobSummary(
        job_id=job.job_id,
        status=job.status,
        status_detail=job.status_detail,
        domain_name=job.domain_name,
        target_locale=job.target_locale,
        vendor_policy=job.vendor_policy,
        vendor_name=job.vendor_name,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        has_brief=job.brief is not None,
        has_phase0_result=job.phase0_result is not None,
        has_blueprint=job.blueprint is not None,
        has_final_story=job.final_story is not None,
    )


def _load_or_404(job_id: str) -> OnboardingJob:
    storage = _get_storage()
    try:
        return storage.load_job(job_id)
    except JobNotFound as exc:
        raise HTTPException(
            status_code=404, detail=f"Job not found: {job_id}"
        ) from exc


def _generate_job_id(brief: SupportChatbotBrief) -> str:
    """Determinisztikus job_id: `brief-<brief_id első 8 char>`."""
    short = brief.brief_id.replace("-", "")[:8]
    return f"brief-{short}"


# --------------------------------------------------------------------------- #
# Background pipeline runner                                                  #
# --------------------------------------------------------------------------- #


def _run_full_pipeline(job_id: str) -> None:
    """Szinkron pipeline-futtatás BG task-ban.

    Az orchestrator `run()` metódusa minden fázis-átmenetnél event-et
    emittál a (perzisztens) storage-ba és az event-bus-ra. A frontend
    az SSE-n követi a haladást.

    A `BackgroundTasks` mechanizmus ezt FastAPI saját thread-poolján
    futtatja a HTTP response visszaküldése után. Nincs separate worker
    szükség — V1-ben ez elegendő.
    """
    try:
        orch = _get_orchestrator()
        orch.run(job_id)
    except Exception:  # noqa: BLE001 — BG task; logoljuk de ne propagáljuk
        logger.exception("Onboarding pipeline crashed for job %s", job_id)


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #


@router.post(
    "/jobs",
    response_model=OnboardingJobSummary,
    status_code=201,
    summary="Új onboarding job egy SupportChatbotBrief-ből (Phase 0 sync).",
)
def create_job_from_brief(brief: SupportChatbotBrief) -> OnboardingJobSummary:
    job_id = _generate_job_id(brief)
    try:
        job = _get_orchestrator().start_job_from_brief(
            job_id=job_id, brief=brief
        )
    except Exception as exc:
        # Pl. duplikált job_id (StorageError) — ritka, de védjük.
        logger.exception("start_job_from_brief failed for brief %s", brief.brief_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _job_to_summary(job)


@router.post(
    "/coach",
    response_model=CoachResponse,
    summary="Onboarding coach — kérdés-válasz, highlight, javaslat.",
)
def coach_chat(body: CoachRequest) -> CoachResponse:
    client: Optional[AnthropicOnboardingClient]
    try:
        client = _get_anthropic_client()
    except Exception:
        client = None
    return run_coach(body, client)


@router.get(
    "/jobs",
    response_model=OnboardingJobListResponse,
    summary="Header-szintű job-lista (dashboard listához).",
)
def list_jobs(limit: int = 50) -> OnboardingJobListResponse:
    storage = _get_storage()
    # `list_jobs` csak az `onboarding_jobs` táblát olvassa, így a "has_*"
    # mezőket egyenkénti load_job-bal pótoljuk. Limit kicsi (default 50),
    # így a O(N) overhead elhanyagolható.
    headers = storage.list_jobs(limit=limit)
    summaries: list[OnboardingJobSummary] = []
    for h in headers:
        try:
            summaries.append(_job_to_summary(storage.load_job(h["job_id"])))
        except JobNotFound:
            # Race condition védelem (törölt job a list_jobs és load_job között).
            continue
    return OnboardingJobListResponse(jobs=summaries)


@router.get(
    "/jobs/{job_id}",
    summary="Teljes OnboardingJob aggregátum (brief + phase0_result + state).",
)
def get_job(job_id: str) -> dict[str, Any]:
    job = _load_or_404(job_id)
    # Az `OnboardingJob` model_dump-ja a Pydantic mezőket dump-olja. A
    # `final_story` és `blueprint` opcionálisan benne; a frontend ezeket
    # is megkapja (a Card 4 state-machine-hez kell az `brief.card4`).
    return json.loads(job.model_dump_json())


@router.put(
    "/jobs/{job_id}/brief",
    response_model=OnboardingJobSummary,
    summary="Brief UPSERT (kártya mentés). Újrafuttatja a Phase 0-t.",
)
def update_brief(
    job_id: str, brief: SupportChatbotBrief
) -> OnboardingJobSummary:
    storage = _get_storage()
    # Sanity: a job-nak léteznie kell.
    _ = _load_or_404(job_id)
    # A brief új tartalommal jön; mentjük és re-run Phase 0.
    storage.save_brief(job_id, brief)
    from services.onboarding.brief_expander import expand_brief_to_research

    result = expand_brief_to_research(brief)
    storage.save_phase0_result(job_id, result)
    # A job-rekord meta mezőit szinkronizáljuk az új Phase 0 derived
    # értékekkel (vendor_name, domain_name, locale).
    storage.update_job_meta(
        job_id,
        domain_name=result.domain_name,
        target_locale=result.locale,
        vendor_policy=result.vendor_policy,
        vendor_name=result.vendor_name,
    )
    # In-memory cache frissítés a következő `run_phase1`-hez.
    orch = _get_orchestrator()
    orch._research_cache[job_id] = result.research_text  # type: ignore[attr-defined]
    # Status: ha azelőtt `phase0_ready` volt, marad; ha `failed_*` volt,
    # most "újrapróbálkozás" jellegű — visszaállítjuk `phase0_ready`-re.
    storage.update_job_status(
        job_id,
        "phase0_ready",
        status_detail="Brief updated, Phase 0 re-run",
    )
    storage.log_event(
        job_id, phase="phase0", kind="brief_updated",
        payload={"brief_id": brief.brief_id},
    )
    return _job_to_summary(storage.load_job(job_id))


@router.post(
    "/jobs/{job_id}/end-nodes/generate",
    response_model=EndNodeGenerationResponse,
    summary="Card 4A AI hívás (SYNC). Frissíti a brief.card4 állapotát.",
)
def generate_end_nodes(
    job_id: str, body: Optional[EndNodeGenerationRequest] = None
) -> EndNodeGenerationResponse:
    body = body or EndNodeGenerationRequest()
    job = _load_or_404(job_id)
    if job.brief is None:
        raise HTTPException(
            status_code=409,
            detail="Job has no brief — Card 4A generálás csak brief-driven flow-ban érhető el.",
        )
    try:
        orch = _get_orchestrator()
        generated = orch.run_end_node_generation(
            job_id=job_id,
            client=_get_anthropic_client(),
            overwrite_user_edits=body.overwrite_user_edits,
        )
    except OrchestratorError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    # Visszaolvassuk a brief-et és kiszámítjuk hány slot frissült valóban.
    refreshed = _get_storage().get_brief(job_id)
    applied: list[str] = []
    if refreshed is not None:
        for kind, slot in refreshed.card4.end_node_texts.items():
            if (
                slot.status == "ai_prefilled"
                and slot.content == generated.get(kind, None)
            ):
                applied.append(kind)
    return EndNodeGenerationResponse(
        job_id=job_id,
        applied_kinds=applied,
        skipped_user_edited_count=6 - len(applied),
        generated=dict(generated),
    )


@router.post(
    "/jobs/{job_id}/build",
    response_model=BuildAcceptedResponse,
    status_code=202,
    summary="Phase 1-3 BG indítás. A frontend SSE-n követi a progresst.",
)
def build_chatbot(
    job_id: str,
    background_tasks: BackgroundTasks,
    body: Optional[BuildRequest] = None,
) -> BuildAcceptedResponse:
    body = body or BuildRequest()
    job = _load_or_404(job_id)
    if job.phase0_result is None:
        raise HTTPException(
            status_code=409,
            detail="Job not ready: Phase 0 nem futott le (start_job_from_brief?).",
        )
    if job.status == "node_generating" or job.status == "blueprint_extracting":
        raise HTTPException(
            status_code=409,
            detail=f"Job már fut (status={job.status}). Várd meg az `events` stream-en.",
        )

    # Retry config override (opcionális).
    if (
        body.max_attempts_per_node is not None
        or body.escalate_after_attempts is not None
    ):
        rc_kwargs: dict[str, Any] = {}
        if body.max_attempts_per_node is not None:
            rc_kwargs["max_attempts_per_node"] = body.max_attempts_per_node
        if body.escalate_after_attempts is not None:
            rc_kwargs["escalate_after_attempts"] = body.escalate_after_attempts
        # A retry_config-ot a jobs táblában tárolt JSON-ba kell mentenünk.
        # A meglévő OnboardingStorage nem ad direkt API-t erre — egy ad-hoc
        # update path-ra most NEM megyünk; V2 task. Most loggolunk és skip-eljük.
        logger.info(
            "Retry override ignored (V1 limitation): %s for job %s",
            rc_kwargs,
            job_id,
        )

    background_tasks.add_task(_run_full_pipeline, job_id)
    return BuildAcceptedResponse(
        job_id=job_id,
        status="building",
        message=(
            "A pipeline a háttérben fut. Kövesd az "
            f"/api/onboarding/brief/jobs/{job_id}/events SSE stream-et."
        ),
    )


# --------------------------------------------------------------------------- #
# SSE event stream                                                            #
# --------------------------------------------------------------------------- #


_TERMINAL_STATUSES = {
    "done",
    "failed_brief",
    "failed_phase0",
    "failed_end_node_generation",
    "failed_blueprint",
    "failed_generation",
    "failed_lint",
    "failed_audit",
}


def _sse_format(data: dict[str, Any], *, event: Optional[str] = None) -> str:
    """SSE message formatter (`event:` + `data:` mezők, `\\n\\n` delim)."""
    lines: list[str] = []
    if event:
        lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    return "\n".join(lines) + "\n\n"


async def _event_stream(
    job_id: str, *, request: Request, poll_interval_sec: float = 0.6
) -> AsyncGenerator[str, None]:
    """Polling-based SSE generátor.

    Minden 0.6 sec-ben lekéri a storage-ből az új event-eket, és kiküldi
    azokat amelyek a `last_seen_id` után jöttek. A loop kilép amikor a
    job státusza terminal állapotba kerül VAGY a kliens lecsatlakozik.

    A `since_id` mechanizmus: nem az event ID-t használjuk
    (`AUTOINCREMENT`-tel a storage-ben él), hanem a `list_events()` rendezett
    list-jét + egy in-memory tracker-t.
    """
    storage = _get_storage()
    last_seen_id = 0

    # Kezdeti hello — a kliens tudja hogy felcsatlakozott.
    initial_events = storage.list_events(job_id)
    for ev in initial_events:
        if ev["event_id"] > last_seen_id:
            yield _sse_format(
                {
                    "event_id": ev["event_id"],
                    "phase": ev["phase"],
                    "kind": ev["kind"],
                    "payload": ev["payload"],
                    "at": ev["at"],
                },
                event="onboarding-event",
            )
            last_seen_id = ev["event_id"]

    while True:
        if await request.is_disconnected():
            break

        try:
            job = storage.load_job(job_id)
        except JobNotFound:
            yield _sse_format(
                {"error": "job_not_found", "job_id": job_id}, event="error"
            )
            break

        new_events = [
            e for e in storage.list_events(job_id) if e["event_id"] > last_seen_id
        ]
        for ev in new_events:
            yield _sse_format(
                {
                    "event_id": ev["event_id"],
                    "phase": ev["phase"],
                    "kind": ev["kind"],
                    "payload": ev["payload"],
                    "at": ev["at"],
                },
                event="onboarding-event",
            )
            last_seen_id = ev["event_id"]

        if job.status in _TERMINAL_STATUSES:
            yield _sse_format(
                {
                    "job_id": job_id,
                    "status": job.status,
                    "status_detail": job.status_detail,
                    "has_final_story": job.final_story is not None,
                },
                event="terminal",
            )
            break

        await asyncio.sleep(poll_interval_sec)


@router.get(
    "/jobs/{job_id}/events",
    summary="SSE stream a pipeline progress követéséhez (terminal-on bezár).",
)
async def get_job_events(
    job_id: str, request: Request
) -> StreamingResponse:
    # Sanity: a job-nak léteznie kell.
    _ = _load_or_404(job_id)
    return StreamingResponse(
        _event_stream(job_id, request=request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx proxy guard
        },
    )


__all__ = [
    "router",
    "OnboardingJobSummary",
    "OnboardingJobListResponse",
    "EndNodeGenerationRequest",
    "EndNodeGenerationResponse",
    "BuildRequest",
    "BuildAcceptedResponse",
]

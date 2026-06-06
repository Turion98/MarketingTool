"""Pytest cases for `services.onboarding.storage.OnboardingStorage`.

Lefedett területek:

1. **Schema lifecycle** — idempotens `init_schema`, WAL mode, FK on,
   schema verzió-rekord.
2. **Job CRUD** — create + load round-trip, status update, list_jobs,
   missing job → JobNotFound.
3. **Phase 1** — save/get blueprint round-trip, Pydantic egyenértékűség.
4. **Phase 2 attempts** — append-only attempt log, FIFO sorrend
   `attempt_index` szerint, multi-node izoláció.
5. **Phase 2 outcomes** — UPSERT viselkedés, lazy attempts a load_job-ban.
6. **Phase 3** — structural lint + semantic audit + final story
   round-trip.
7. **Multi-job izoláció** — két job nem keveredik egymás adataival.
8. **FK CASCADE** — job törlés tisztítja az összes kapcsolódó rekordot.
9. **Events** — FIFO sorrend, phase-szűrés.

A tesztek izolált tmpdir-fájlokat használnak (NEM in-memory, mert a
storage `_connect` mindig új connection-t nyit, és a `:memory:` minden
connection-höz külön DB-t adna).
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from services.onboarding.contracts import (
    DomainBlueprint,
    NodeCandidate,
    NodeGenerationAttempt,
    NodeGenerationOutcome,
    RetryConfig,
    SemanticAuditFinding,
    SemanticAuditResult,
    StructuralLintResult,
)
from services.onboarding.storage import (
    JobNotFound,
    OnboardingStorage,
    StorageError,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


@pytest.fixture
def storage(tmp_path: Path) -> OnboardingStorage:
    db = tmp_path / "onboarding.db"
    s = OnboardingStorage(db)
    s.init_schema()
    return s


def _make_blueprint(domain_name: str = "Test domain") -> DomainBlueprint:
    return DomainBlueprint(
        locale="hu",
        domain_name=domain_name,
        vendor_policy="generic_blended",
        vendor_name=None,
        summary=(
            "Ez a domain a tesztelési célokra szolgál. Minimum 80 karakter — "
            "ezért tölteni kell egy rövid leírással a release-ready validációhoz."
        ),
        nodes=[
            NodeCandidate(
                proposed_id="intake-node",
                domain_intent="Az ügyfél kezdeti megkeresését kezeli.",
                triggering_examples=["Szia", "Kéne segítség"],
                closing_step_required=False,
            )
        ],
    )


def _make_attempt(idx: int, *, accepted: bool = False) -> NodeGenerationAttempt:
    now = datetime.now(timezone.utc)
    return NodeGenerationAttempt(
        attempt_index=idx,
        started_at=now,
        finished_at=now,
        raw_node_dict={"id": f"node-{idx}", "type": "ai"} if accepted else None,
        lint_errors=[] if accepted else ["dummy error"],
        lint_warnings=[],
        lint_info=[],
        accepted=accepted,
        rejection_reason=None if accepted else "dummy reason",
    )


def _make_outcome(node_id: str = "intake-node") -> NodeGenerationOutcome:
    return NodeGenerationOutcome(
        node_id=node_id,
        attempts=[],
        final_status="accepted",
        final_node_dict={"id": node_id, "type": "ai", "fallback_message": "x"},
        declared_condition_ids=["has_topic", "has_order_id"],
        exposed_handoff_condition_ids=["package_lost"],
    )


# --------------------------------------------------------------------------- #
# 1. Schema lifecycle                                                         #
# --------------------------------------------------------------------------- #


def test_init_schema_idempotent(tmp_path: Path):
    db = tmp_path / "x.db"
    s = OnboardingStorage(db)
    s.init_schema()
    s.init_schema()
    s.init_schema()
    # Ha bárhol IntegrityError-t / OperationalError-t kapnánk, a teszt elhasal.


def test_wal_mode_is_enabled(storage: OnboardingStorage):
    conn = storage._connect()
    try:
        row = conn.execute("PRAGMA journal_mode").fetchone()
    finally:
        conn.close()
    assert row[0].lower() == "wal"


def test_foreign_keys_are_enabled(storage: OnboardingStorage):
    conn = storage._connect()
    try:
        row = conn.execute("PRAGMA foreign_keys").fetchone()
    finally:
        conn.close()
    assert row[0] == 1


def test_schema_version_recorded(storage: OnboardingStorage):
    conn = storage._connect()
    try:
        row = conn.execute(
            "SELECT version FROM onboarding_schema_version"
        ).fetchone()
    finally:
        conn.close()
    assert row["version"] == 1


# --------------------------------------------------------------------------- #
# 2. Job CRUD                                                                 #
# --------------------------------------------------------------------------- #


def test_create_and_load_job_round_trip(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-1",
        domain_name="My domain",
        target_locale="en",
        vendor_policy="specific",
        vendor_name="Acme Inc",
        retry_config=RetryConfig(max_attempts_per_node=5),
    )
    j = storage.load_job("job-1")
    assert j.job_id == "job-1"
    assert j.domain_name == "My domain"
    assert j.target_locale == "en"
    assert j.vendor_policy == "specific"
    assert j.vendor_name == "Acme Inc"
    assert j.retry_config.max_attempts_per_node == 5
    assert j.status == "created"
    assert j.blueprint is None
    assert j.node_outcomes == []
    assert j.structural_lint is None
    assert j.semantic_audit is None
    assert j.final_story is None


def test_create_duplicate_job_id_raises(storage: OnboardingStorage):
    storage.create_job(job_id="dup-1", domain_name="dom", target_locale="hu")
    with pytest.raises(StorageError):
        storage.create_job(job_id="dup-1", domain_name="dom", target_locale="hu")


def test_update_job_status_changes_fields(storage: OnboardingStorage):
    storage.create_job(job_id="job-2", domain_name="dom", target_locale="hu")
    storage.update_job_status(
        "job-2",
        "node_generating",
        status_detail="processing 1/3",
        current_node_index=1,
    )
    j = storage.load_job("job-2")
    assert j.status == "node_generating"
    assert j.status_detail == "processing 1/3"
    assert j.current_node_index == 1


def test_update_status_for_missing_job_raises(storage: OnboardingStorage):
    with pytest.raises(JobNotFound):
        storage.update_job_status("ghost", "done")


def test_load_missing_job_raises(storage: OnboardingStorage):
    with pytest.raises(JobNotFound):
        storage.load_job("ghost")


def test_list_jobs_filters_by_status(storage: OnboardingStorage):
    storage.create_job(job_id="job-aa", domain_name="dom", target_locale="hu")
    storage.create_job(job_id="job-bb", domain_name="dom", target_locale="hu")
    storage.update_job_status("job-bb", "done")

    all_jobs = storage.list_jobs()
    assert {j["job_id"] for j in all_jobs} == {"job-aa", "job-bb"}

    done = storage.list_jobs(status="done")
    assert [j["job_id"] for j in done] == ["job-bb"]

    created = storage.list_jobs(status="created")
    assert [j["job_id"] for j in created] == ["job-aa"]


# --------------------------------------------------------------------------- #
# 3. Phase 1 — blueprint                                                      #
# --------------------------------------------------------------------------- #


def test_save_and_get_blueprint(storage: OnboardingStorage):
    storage.create_job(job_id="job-bp", domain_name="dom", target_locale="hu")
    bp = _make_blueprint("Refurbished")
    storage.save_blueprint("job-bp", bp)
    got = storage.get_blueprint("job-bp")
    assert got is not None
    assert got.domain_name == "Refurbished"
    assert got.nodes[0].proposed_id == "intake-node"


def test_blueprint_appears_in_load_job(storage: OnboardingStorage):
    storage.create_job(job_id="job-bp2", domain_name="dom", target_locale="hu")
    bp = _make_blueprint()
    storage.save_blueprint("job-bp2", bp)
    j = storage.load_job("job-bp2")
    assert j.blueprint is not None
    assert j.blueprint.domain_name == bp.domain_name


def test_save_blueprint_for_missing_job_raises(storage: OnboardingStorage):
    bp = _make_blueprint()
    with pytest.raises(JobNotFound):
        storage.save_blueprint("ghost", bp)


def test_save_blueprint_upsert_overwrites(storage: OnboardingStorage):
    storage.create_job(job_id="job-up", domain_name="dom", target_locale="hu")
    storage.save_blueprint("job-up", _make_blueprint("First"))
    storage.save_blueprint("job-up", _make_blueprint("Second"))
    got = storage.get_blueprint("job-up")
    assert got is not None
    assert got.domain_name == "Second"


# --------------------------------------------------------------------------- #
# 4. Phase 2 — attempts (append-only)                                         #
# --------------------------------------------------------------------------- #


def test_append_node_attempts_appends_in_order(storage: OnboardingStorage):
    storage.create_job(job_id="job-att", domain_name="dom", target_locale="hu")
    a1 = _make_attempt(0)
    a2 = _make_attempt(1)
    a3 = _make_attempt(2, accepted=True)
    id1 = storage.append_node_attempt("job-att", "intake-node", a1)
    id2 = storage.append_node_attempt("job-att", "intake-node", a2)
    id3 = storage.append_node_attempt("job-att", "intake-node", a3)
    assert id1 < id2 < id3

    attempts = storage.list_node_attempts("job-att", "intake-node")
    assert [a.attempt_index for a in attempts] == [0, 1, 2]
    assert attempts[2].accepted is True
    assert attempts[0].accepted is False
    assert attempts[0].rejection_reason == "dummy reason"


def test_attempts_isolated_per_node(storage: OnboardingStorage):
    storage.create_job(job_id="job-iso", domain_name="dom", target_locale="hu")
    storage.append_node_attempt("job-iso", "node-a", _make_attempt(0))
    storage.append_node_attempt("job-iso", "node-b", _make_attempt(0))
    storage.append_node_attempt("job-iso", "node-a", _make_attempt(1))

    a_attempts = storage.list_node_attempts("job-iso", "node-a")
    b_attempts = storage.list_node_attempts("job-iso", "node-b")
    assert len(a_attempts) == 2
    assert len(b_attempts) == 1


def test_attempts_isolated_per_job(storage: OnboardingStorage):
    storage.create_job(job_id="job-x", domain_name="dom", target_locale="hu")
    storage.create_job(job_id="job-y", domain_name="dom", target_locale="hu")
    storage.append_node_attempt("job-x", "intake-node", _make_attempt(0))
    storage.append_node_attempt("job-y", "intake-node", _make_attempt(0))

    x_attempts = storage.list_node_attempts("job-x", "intake-node")
    y_attempts = storage.list_node_attempts("job-y", "intake-node")
    assert len(x_attempts) == 1
    assert len(y_attempts) == 1


# --------------------------------------------------------------------------- #
# 5. Phase 2 — outcomes                                                       #
# --------------------------------------------------------------------------- #


def test_save_node_outcome_round_trip(storage: OnboardingStorage):
    storage.create_job(job_id="job-out", domain_name="dom", target_locale="hu")
    outcome = _make_outcome("intake-node")
    storage.save_node_outcome("job-out", outcome)

    j = storage.load_job("job-out")
    assert len(j.node_outcomes) == 1
    o = j.node_outcomes[0]
    assert o.node_id == "intake-node"
    assert o.final_status == "accepted"
    assert o.final_node_dict == {"id": "intake-node", "type": "ai", "fallback_message": "x"}
    assert set(o.declared_condition_ids) == {"has_topic", "has_order_id"}
    assert o.exposed_handoff_condition_ids == ["package_lost"]
    # Lazy attempts: load_job nem tölti az attempts-listát.
    assert o.attempts == []


def test_save_node_outcome_upsert(storage: OnboardingStorage):
    storage.create_job(job_id="job-up2", domain_name="dom", target_locale="hu")
    storage.save_node_outcome("job-up2", _make_outcome("nx"))
    # Felülírjuk egy másik final_status-szal.
    overwritten = NodeGenerationOutcome(
        node_id="nx",
        attempts=[],
        final_status="rejected_human_review",
        final_node_dict=None,
        declared_condition_ids=[],
        exposed_handoff_condition_ids=[],
    )
    storage.save_node_outcome("job-up2", overwritten)
    j = storage.load_job("job-up2")
    assert len(j.node_outcomes) == 1
    assert j.node_outcomes[0].final_status == "rejected_human_review"
    assert j.node_outcomes[0].final_node_dict is None


# --------------------------------------------------------------------------- #
# 6. Phase 3 — structural lint, semantic audit, final story                   #
# --------------------------------------------------------------------------- #


def test_save_structural_lint_round_trip(storage: OnboardingStorage):
    storage.create_job(job_id="job-l", domain_name="dom", target_locale="hu")
    lint = StructuralLintResult(
        errors=[],
        warnings=["W1"],
        info=["I1"],
        verdict="warnings_only",
    )
    storage.save_structural_lint("job-l", lint)
    j = storage.load_job("job-l")
    assert j.structural_lint is not None
    assert j.structural_lint.verdict == "warnings_only"
    assert j.structural_lint.warnings == ["W1"]
    assert j.structural_lint.info == ["I1"]


def test_save_semantic_audit_round_trip(storage: OnboardingStorage):
    storage.create_job(job_id="job-s", domain_name="dom", target_locale="hu")
    now = datetime.now(timezone.utc)
    audit = SemanticAuditResult(
        findings=[
            SemanticAuditFinding(
                kind="routing_logic",
                severity="warning",
                description="Routing nem kezeli az X esetet.",
            )
        ],
        verdict="warnings_only",
        audit_model="claude-opus-4-5",
        audit_started_at=now,
        audit_finished_at=now,
        summary_for_human="Egy figyelmeztetés routing-logikára.",
    )
    storage.save_semantic_audit("job-s", audit)
    j = storage.load_job("job-s")
    assert j.semantic_audit is not None
    assert j.semantic_audit.verdict == "warnings_only"
    assert len(j.semantic_audit.findings) == 1
    assert j.semantic_audit.findings[0].kind == "routing_logic"


def test_save_final_story_round_trip(storage: OnboardingStorage):
    storage.create_job(job_id="job-f", domain_name="dom", target_locale="hu")
    story = {"meta": {"name": "demo"}, "pages": {"p1": {"type": "ai"}}}
    storage.save_final_story("job-f", story, version=42)
    j = storage.load_job("job-f")
    assert j.final_story == story
    assert j.final_story_version == 42


# --------------------------------------------------------------------------- #
# 7. Multi-job izoláció                                                       #
# --------------------------------------------------------------------------- #


def test_two_jobs_do_not_leak(storage: OnboardingStorage):
    storage.create_job(job_id="job-aa", domain_name="dom-a", target_locale="hu")
    storage.create_job(job_id="job-bb", domain_name="dom-b", target_locale="hu")

    storage.save_blueprint("job-aa", _make_blueprint("A-domain"))
    storage.save_blueprint("job-bb", _make_blueprint("B-domain"))
    storage.save_node_outcome("job-aa", _make_outcome("only-in-a"))
    storage.save_node_outcome("job-bb", _make_outcome("only-in-b"))

    a = storage.load_job("job-aa")
    b = storage.load_job("job-bb")
    assert a.blueprint is not None and a.blueprint.domain_name == "A-domain"
    assert b.blueprint is not None and b.blueprint.domain_name == "B-domain"
    assert [o.node_id for o in a.node_outcomes] == ["only-in-a"]
    assert [o.node_id for o in b.node_outcomes] == ["only-in-b"]


# --------------------------------------------------------------------------- #
# 8. FK CASCADE — delete_job tisztítja a kapcsolódó rekordokat                #
# --------------------------------------------------------------------------- #


def test_delete_job_cascades(storage: OnboardingStorage):
    storage.create_job(job_id="job-del", domain_name="dom", target_locale="hu")
    storage.save_blueprint("job-del", _make_blueprint())
    storage.save_node_outcome("job-del", _make_outcome())
    storage.append_node_attempt("job-del", "intake-node", _make_attempt(0))
    storage.log_event("job-del", phase="phase1", kind="started")
    storage.save_structural_lint(
        "job-del",
        StructuralLintResult(verdict="clean"),
    )

    storage.delete_job("job-del")

    with pytest.raises(JobNotFound):
        storage.load_job("job-del")
    assert storage.get_blueprint("job-del") is None
    assert storage.list_node_attempts("job-del", "intake-node") == []
    assert storage.list_events("job-del") == []


def test_delete_missing_job_raises(storage: OnboardingStorage):
    with pytest.raises(JobNotFound):
        storage.delete_job("ghost")


# --------------------------------------------------------------------------- #
# 9. Events — telemetry log                                                   #
# --------------------------------------------------------------------------- #


def test_log_and_list_events_fifo(storage: OnboardingStorage):
    storage.create_job(job_id="job-e", domain_name="dom", target_locale="hu")
    e1 = storage.log_event("job-e", phase="phase1", kind="started")
    e2 = storage.log_event(
        "job-e", phase="phase1", kind="api_call", payload={"tokens": 1234}
    )
    e3 = storage.log_event("job-e", phase="phase2", kind="node_started")
    assert e1 < e2 < e3

    events = storage.list_events("job-e")
    assert [e["kind"] for e in events] == ["started", "api_call", "node_started"]
    assert events[1]["payload"] == {"tokens": 1234}
    assert events[0]["payload"] is None
    assert events[2]["phase"] == "phase2"


def test_list_events_filtered_by_phase(storage: OnboardingStorage):
    storage.create_job(job_id="job-ef", domain_name="dom", target_locale="hu")
    storage.log_event("job-ef", phase="phase1", kind="a")
    storage.log_event("job-ef", phase="phase2", kind="b")
    storage.log_event("job-ef", phase="phase1", kind="c")

    p1 = storage.list_events("job-ef", phase="phase1")
    assert [e["kind"] for e in p1] == ["a", "c"]
    p2 = storage.list_events("job-ef", phase="phase2")
    assert [e["kind"] for e in p2] == ["b"]


def test_log_event_for_missing_job_raises(storage: OnboardingStorage):
    with pytest.raises(JobNotFound):
        storage.log_event("ghost", phase="phase1", kind="x")


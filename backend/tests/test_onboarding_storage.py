"""Pytest cases for `support_engine.services.onboarding.storage.OnboardingStorage`.

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

from support_engine.services.onboarding.contracts import (
    DomainBlueprint,
    NodeCandidate,
    NodeGenerationAttempt,
    NodeGenerationOutcome,
    RetryConfig,
    SemanticAuditFinding,
    SemanticAuditResult,
    StructuralLintResult,
)
from support_engine.services.onboarding.storage import (
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
    """Friss DB-ben az `_CURRENT_SCHEMA_VERSION`-t kell tükrözze (v2)."""
    from support_engine.services.onboarding.storage import _CURRENT_SCHEMA_VERSION

    conn = storage._connect()
    try:
        row = conn.execute(
            "SELECT version FROM onboarding_schema_version"
        ).fetchone()
    finally:
        conn.close()
    assert row["version"] == _CURRENT_SCHEMA_VERSION
    assert _CURRENT_SCHEMA_VERSION == 2


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


# --------------------------------------------------------------------------- #
# 10. Schema v2 — brief & Phase 0 result perzisztencia                       #
# --------------------------------------------------------------------------- #


def _sample_support_brief():
    """Minimális, érvényes `SupportChatbotBrief` v2 tesztekhez."""
    from support_engine.services.onboarding.brief_contracts import (
        Card1CompanyBasics,
        Card2Operations,
        Card2aReturns,
        Card2bRemedy,
        Card2cShipping,
        Card3Backend,
        Card3aHelpdesk,
        Card5aOffTopic,
        Card5bSupportAvailability,
        Card5Boundaries,
        SupportChatbotBrief,
    )
    return SupportChatbotBrief(
        card1=Card1CompanyBasics(
            vendor_name="Storage Test Vendor",
            business_model="own_inventory",
            target_market="b2c",
            locale="hu",
        ),
        card2=Card2Operations(
            returns=Card2aReturns(
                return_window_days=14,
                return_window_starts_from="delivery",
                return_shipping_paid_by="customer",
            ),
            remedy=Card2bRemedy(
                has_own_repair_capacity=False,
                primary_remedy_order=["refund"],
                instant_replacement="no",
                refund_timeline="3_business_days",
            ),
            shipping=Card2cShipping(
                carriers=["DPD"],
                lost_package_handled_by="company",
                damage_report_window_value=24,
                damage_report_window_unit="hours",
            ),
        ),
        card3=Card3Backend(helpdesk=Card3aHelpdesk(has_helpdesk=False)),
        card5=Card5Boundaries(
            off_topic=Card5aOffTopic(),
            support_availability=Card5bSupportAvailability(
                has_support_team=False
            ),
        ),
    )


def _sample_phase0_result(brief_id: str = "brief-xyz"):
    from support_engine.services.onboarding.brief_contracts import BriefExpansionResult

    return BriefExpansionResult(
        research_text="# Storage Test Vendor\n\n" + ("Lorem ipsum dolor. " * 30),
        domain_name="Storage Test Vendor — Customer support intake",
        locale="hu",
        vendor_name="Storage Test Vendor",
        source_brief_id=brief_id,
        metadata={"enricher_used": False},
    )


def test_save_brief_round_trip(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-brief-rt", domain_name="dom", target_locale="hu"
    )
    brief = _sample_support_brief()
    storage.save_brief("job-brief-rt", brief)
    loaded = storage.get_brief("job-brief-rt")
    assert loaded is not None
    assert loaded.brief_id == brief.brief_id
    assert loaded.card1.vendor_name == "Storage Test Vendor"
    assert loaded.card2.returns.return_window_days == 14


def test_save_brief_upserts_on_resave(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-brief-up", domain_name="dom", target_locale="hu"
    )
    brief = _sample_support_brief()
    storage.save_brief("job-brief-up", brief)
    # Módosít és újrament.
    brief.card1.vendor_name = "Renamed Vendor"
    storage.save_brief("job-brief-up", brief)
    loaded = storage.get_brief("job-brief-up")
    assert loaded is not None
    assert loaded.card1.vendor_name == "Renamed Vendor"


def test_get_brief_returns_none_when_missing(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-no-brief", domain_name="dom", target_locale="hu"
    )
    assert storage.get_brief("job-no-brief") is None


def test_save_phase0_result_round_trip(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-p0", domain_name="dom", target_locale="hu"
    )
    result = _sample_phase0_result(brief_id="brief-abc")
    storage.save_phase0_result("job-p0", result)
    loaded = storage.get_phase0_result("job-p0")
    assert loaded is not None
    assert loaded.domain_name == "Storage Test Vendor — Customer support intake"
    assert loaded.source_brief_id == "brief-abc"
    assert loaded.vendor_policy == "specific"


def test_save_phase0_result_upserts(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-p0-up", domain_name="dom", target_locale="hu"
    )
    r1 = _sample_phase0_result(brief_id="b1")
    storage.save_phase0_result("job-p0-up", r1)
    r2 = _sample_phase0_result(brief_id="b2")
    storage.save_phase0_result("job-p0-up", r2)
    loaded = storage.get_phase0_result("job-p0-up")
    assert loaded is not None
    assert loaded.source_brief_id == "b2"


def test_load_job_includes_brief_and_phase0(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-full-v2", domain_name="dom", target_locale="hu"
    )
    brief = _sample_support_brief()
    result = _sample_phase0_result(brief_id=brief.brief_id)
    storage.save_brief("job-full-v2", brief)
    storage.save_phase0_result("job-full-v2", result)
    job = storage.load_job("job-full-v2")
    assert job.brief is not None
    assert job.brief.card1.vendor_name == "Storage Test Vendor"
    assert job.phase0_result is not None
    assert job.phase0_result.domain_name.startswith("Storage Test Vendor")


def test_load_job_brief_is_none_when_not_saved(storage: OnboardingStorage):
    storage.create_job(
        job_id="job-no-brief2", domain_name="dom", target_locale="hu"
    )
    job = storage.load_job("job-no-brief2")
    assert job.brief is None
    assert job.phase0_result is None


def test_brief_save_requires_existing_job(storage: OnboardingStorage):
    """A v1-es mintát követve: FK-validáció a brief mentésekor is."""
    brief = _sample_support_brief()
    with pytest.raises(JobNotFound):
        storage.save_brief("ghost-job", brief)


def test_brief_and_phase0_cascade_with_job_delete(
    storage: OnboardingStorage,
):
    storage.create_job(
        job_id="job-cascade-v2", domain_name="dom", target_locale="hu"
    )
    brief = _sample_support_brief()
    storage.save_brief("job-cascade-v2", brief)
    storage.save_phase0_result(
        "job-cascade-v2", _sample_phase0_result(brief_id=brief.brief_id)
    )
    storage.delete_job("job-cascade-v2")
    assert storage.get_brief("job-cascade-v2") is None
    assert storage.get_phase0_result("job-cascade-v2") is None


# --------------------------------------------------------------------------- #
# 11. Schema v1 → v2 migráció                                                #
# --------------------------------------------------------------------------- #


def test_v1_db_is_migrated_to_v2_idempotently(tmp_path):
    """Egy "v1-stílusú" DB-t felépítünk kézzel, majd init_schema migrál."""
    import sqlite3

    db = tmp_path / "v1_migration.db"

    # Manuálisan szimulálunk egy v1 állapotú DB-t: csak a v1 táblák + a
    # verzió rekord létezik (v=1). Nincs benne `onboarding_briefs` vagy
    # `onboarding_phase0_results`.
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            """
            CREATE TABLE onboarding_schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE onboarding_jobs (
                job_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                status_detail TEXT,
                domain_name TEXT NOT NULL,
                target_locale TEXT NOT NULL,
                vendor_policy TEXT NOT NULL,
                vendor_name TEXT,
                research_source_path TEXT,
                retry_config_json TEXT NOT NULL,
                current_node_index INTEGER NOT NULL DEFAULT 0,
                blueprint_error TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO onboarding_schema_version (version, applied_at) "
            "VALUES (1, '2026-01-01T00:00:00+00:00')"
        )
        conn.commit()
    finally:
        conn.close()

    # init_schema-nak idempotens migrációt kell csinálnia.
    storage = OnboardingStorage(db)
    storage.init_schema()

    conn = storage._connect()
    try:
        version_rows = conn.execute(
            "SELECT version FROM onboarding_schema_version ORDER BY version ASC"
        ).fetchall()
        table_rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    finally:
        conn.close()

    versions = {r["version"] for r in version_rows}
    assert 2 in versions
    table_names = {r["name"] for r in table_rows}
    assert "onboarding_briefs" in table_names
    assert "onboarding_phase0_results" in table_names

    # Második meghívás → változatlan állapot (no-op).
    storage.init_schema()


def test_init_schema_panics_on_future_version(tmp_path):
    import sqlite3

    db = tmp_path / "future_version.db"
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            """
            CREATE TABLE onboarding_schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT INTO onboarding_schema_version (version, applied_at) "
            "VALUES (99, '2099-01-01T00:00:00+00:00')"
        )
        conn.commit()
    finally:
        conn.close()

    storage = OnboardingStorage(db)
    with pytest.raises(StorageError):
        storage.init_schema()


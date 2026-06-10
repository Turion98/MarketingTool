"""Pytest cases for `services.onboarding.orchestrator` + `event_bus`.

Lefedett területek:

1. **EventBus** — subscribe/publish/unsubscribe/failing-callback isolation.
2. **assemble_story** — happy path skeleton struktúra, üres outcomes.
3. **start_job** — research_text cache + perzisztens job-rekord.
4. **Phase 1** — happy path + API-error → failed_blueprint.
5. **Phase 2** — happy path (single attempt accept), retry success
   (1. attempt rossz, 2. accepted), max-retry exhausted (escalate_after_
   attempts True/False), API-error per attempt.
6. **Phase 3a** — happy path (clean / warnings_only), hard_fail →
   failed_lint.
7. **Phase 3b** — happy path, hard_fail verdict → failed_audit.
8. **End-to-end run()** — minden fázis végigfut, status = done.
9. **Event log perzisztencia** — `storage.list_events` visszaadja a
   teljes eseményláncot.

A teszt egyetlen `MockOnboardingClient`-et használ, amelyet a fixture
fest fel: blueprint, generate_node response-ok per-node listával,
audit verdict + findings.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pytest

from services.onboarding.contracts import (
    ConditionCandidate,
    DomainBlueprint,
    EndPageSpec,
    GenerationContext,
    NodeCandidate,
    RetryConfig,
    SemanticAuditResult,
    VendorPolicyKind,
)
from services.onboarding.event_bus import EventBus, OnboardingEvent
from services.onboarding.orchestrator import (
    OnboardingOrchestrator,
    OrchestratorError,
    assemble_story,
)
from services.onboarding.storage import OnboardingStorage


# --------------------------------------------------------------------------- #
# MockOnboardingClient                                                        #
# --------------------------------------------------------------------------- #


class MockOnboardingClient:
    """Deterministic test-double az orchestrator AI-hívásaihoz.

    Konfigurálható:

    - `blueprint_response`: a `extract_blueprint`-ből visszaadott
      DomainBlueprint, vagy egy `Exception` (akkor exception-t dob).
    - `node_responses`: dict[node_id -> list[response]]. Minden hívás
      a következő elemet konzumálja a listából. Egy elem lehet:
        - dict (a generate_node által visszaadott page-dict)
        - Exception (egyszeri raise)
    - `audit_response`: a `report_semantic_issues`-ből visszaadott
      SemanticAuditResult vagy Exception.
    """

    def __init__(self) -> None:
        self.blueprint_response: Any = None
        self.node_responses: dict[str, list[Any]] = {}
        self.audit_response: Any = None
        self.extract_calls = 0
        self.generate_calls = 0
        self.audit_calls = 0
        self.last_context: Optional[GenerationContext] = None

    def extract_blueprint(
        self,
        *,
        research_text: str,
        locale: str,
        domain_name: str,
        vendor_policy: VendorPolicyKind,
        vendor_name: Optional[str],
    ) -> DomainBlueprint:
        self.extract_calls += 1
        if isinstance(self.blueprint_response, Exception):
            raise self.blueprint_response
        assert isinstance(self.blueprint_response, DomainBlueprint)
        return self.blueprint_response

    def generate_node(
        self, *, context: GenerationContext
    ) -> dict[str, Any]:
        self.generate_calls += 1
        self.last_context = context
        node_id = context.target_node_candidate.proposed_id
        responses = self.node_responses.get(node_id, [])
        if not responses:
            raise RuntimeError(
                f"MockOnboardingClient: no scheduled response for node {node_id!r}"
            )
        item = responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def report_semantic_issues(
        self, *, story: dict[str, Any], audit_model: str
    ) -> SemanticAuditResult:
        self.audit_calls += 1
        if isinstance(self.audit_response, Exception):
            raise self.audit_response
        assert isinstance(self.audit_response, SemanticAuditResult)
        return self.audit_response


# --------------------------------------------------------------------------- #
# Fixtures + helpers                                                          #
# --------------------------------------------------------------------------- #


@pytest.fixture
def storage(tmp_path: Path) -> OnboardingStorage:
    db = tmp_path / "onboarding.db"
    s = OnboardingStorage(db)
    s.init_schema()
    return s


@pytest.fixture
def bus() -> EventBus:
    return EventBus()


@pytest.fixture
def client() -> MockOnboardingClient:
    return MockOnboardingClient()


@pytest.fixture
def orchestrator(
    storage: OnboardingStorage,
    bus: EventBus,
    client: MockOnboardingClient,
) -> OnboardingOrchestrator:
    return OnboardingOrchestrator(storage=storage, client=client, event_bus=bus)


def _make_blueprint(
    *,
    locale: str = "hu",
    domain_name: str = "Test domain",
    node_ids: tuple[str, ...] = ("intake-node",),
    end_page_ids: tuple[str, ...] = ("end-default",),
) -> DomainBlueprint:
    nodes = [
        NodeCandidate(
            proposed_id=nid,
            domain_intent=f"Intent for {nid}, handles a piece of the flow.",
            triggering_examples=[
                "Hello, I have an issue",
                "Need help with something",
            ],
            closing_step_required=False,
            suggested_end_pages=list(end_page_ids),
        )
        for nid in node_ids
    ]
    end_pages = [
        EndPageSpec(
            id=epid,
            purpose="Default closing message for the case.",
            ticket_category="generic_case",
            priority="normal",
            routing_target="generic_team",
            sla_hours=72,
        )
        for epid in end_page_ids
    ]
    return DomainBlueprint(
        locale=locale,
        domain_name=domain_name,
        vendor_policy="generic_blended",
        summary=(
            "Egy egyszerű happy-path domain a tesztekhez. Minimum 80 karakter — "
            "ezért tölteni kell egy rövid leírással a release-ready validációhoz."
        ),
        nodes=nodes,
        conditions=[
            ConditionCandidate(
                id="user_has_issue",
                description_seed="Az ügyfél problémát jelzett.",
            )
        ],
        end_pages=end_pages,
    )


def _make_valid_node_dict(
    node_id: str,
    *,
    end_target: str = "end-default",
) -> dict[str, Any]:
    """Lint-clean ai-page dict, amit a `lint_single_node` és a Phase 3a
    `lint_full_story` is elfogad (ha az `end_target` is jelen van a
    pages-ben)."""
    return {
        "id": node_id,
        "type": "ai",
        "fallback_message": "Sajnálom, nem értettem.",
        "knowledge": {
            "description": "Az ügyfél kezdeti megkeresését kezeli.",
            "scope": "Új ügy felvétele, kezdeti azonosítás.",
            "examples": ["Hello", "Új ügyem van"],
        },
        "conditions": [
            {
                "id": "user_provided_topic",
                "description": "Az ügyfél megadta a téma típusát.",
                "required": True,
            }
        ],
        "routing": [
            {"if": ["user_provided_topic"], "goto": end_target},
            {"default": "ask"},
        ],
    }


def _make_invalid_node_dict(node_id: str) -> dict[str, Any]:
    """Lint-error node: hiányzó knowledge.description és üres examples
    a `lint_single_node`-ban warn-ol; viszont a `routing` rossz
    formátuma (`{"jump": "x"}`) error-t triggerel."""
    return {
        "id": node_id,
        "type": "ai",
        "fallback_message": "fallback",
        "knowledge": {
            "description": "ok",
            "scope": "ok",
            "examples": ["a", "b"],
        },
        "conditions": [],
        "routing": [
            {"jump": "wat"},  # érvénytelen routing forma → lint error
        ],
    }


def _make_audit(
    *,
    verdict: str = "warnings_only",
    finding_count: int = 0,
) -> SemanticAuditResult:
    findings = []
    for i in range(finding_count):
        findings.append(
            {
                "kind": "tone_or_style",
                "severity": "warning",
                "node_id": None,
                "description": f"Tone could be more friendly ({i}).",
            }
        )
    now = datetime.now(timezone.utc)
    return SemanticAuditResult(
        findings=findings,  # type: ignore[arg-type]
        verdict=verdict,  # type: ignore[arg-type]
        audit_model="claude-mock",
        audit_started_at=now,
        audit_finished_at=now,
        summary_for_human="Mock audit summary.",
    )


# --------------------------------------------------------------------------- #
# 1. EventBus                                                                 #
# --------------------------------------------------------------------------- #


def _mk_event(kind: str, event_id: int = 1) -> OnboardingEvent:
    return OnboardingEvent(
        event_id=event_id,
        job_id="job-aa",
        phase="pipeline",
        kind=kind,
        at=datetime.now(timezone.utc),
        payload=None,
    )


def test_event_bus_subscribe_publish(bus: EventBus):
    captured: list[OnboardingEvent] = []
    bus.subscribe(captured.append)
    bus.publish(_mk_event("a", 1))
    bus.publish(_mk_event("b", 2))
    assert [e.kind for e in captured] == ["a", "b"]
    assert [e.event_id for e in captured] == [1, 2]


def test_event_bus_unsubscribe(bus: EventBus):
    captured: list[OnboardingEvent] = []
    sub = bus.subscribe(captured.append)
    bus.publish(_mk_event("a"))
    bus.unsubscribe(sub)
    bus.publish(_mk_event("b"))
    assert [e.kind for e in captured] == ["a"]
    assert len(bus) == 0


def test_event_bus_failing_subscriber_does_not_break_others(
    bus: EventBus, capsys
):
    bad_calls = []

    def bad_cb(_e):
        bad_calls.append("called")
        raise RuntimeError("boom")

    good_calls: list[OnboardingEvent] = []
    bus.subscribe(bad_cb)
    bus.subscribe(good_calls.append)

    bus.publish(_mk_event("a"))

    assert bad_calls == ["called"]
    assert [e.kind for e in good_calls] == ["a"]
    err = capsys.readouterr().err
    assert "boom" in err


# --------------------------------------------------------------------------- #
# 2. assemble_story                                                           #
# --------------------------------------------------------------------------- #


def test_assemble_story_minimal_skeleton(storage: OnboardingStorage):
    job = storage.create_job(
        job_id="job-as",
        domain_name="My Test Domain",
        target_locale="hu",
    )
    bp = _make_blueprint()
    from services.onboarding.contracts import NodeGenerationOutcome

    accepted = [
        NodeGenerationOutcome(
            node_id="intake-node",
            attempts=[],
            final_status="accepted",
            final_node_dict=_make_valid_node_dict("intake-node"),
            declared_condition_ids=["user_provided_topic"],
            exposed_handoff_condition_ids=[],
        )
    ]
    story = assemble_story(job=job, blueprint=bp, accepted_outcomes=accepted)

    assert story["schemaVersion"] == "1.0"
    assert story["storyId"] == "my-test-domain"
    assert story["locale"] == "hu"
    assert story["meta"]["startPageId"] == "intake-node"
    assert "intake-node" in story["pages"]
    assert "end-default" in story["pages"]
    assert story["pages"]["end-default"]["type"] == "end"


def test_assemble_story_no_accepted_raises(storage: OnboardingStorage):
    job = storage.create_job(
        job_id="job-em", domain_name="dom", target_locale="hu"
    )
    bp = _make_blueprint()
    with pytest.raises(ValueError):
        assemble_story(job=job, blueprint=bp, accepted_outcomes=[])


# --------------------------------------------------------------------------- #
# 3. start_job                                                                #
# --------------------------------------------------------------------------- #


def test_start_job_persists_and_caches(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
):
    job = orchestrator.start_job(
        job_id="job-st",
        domain_name="dom",
        target_locale="hu",
        research_text="research blob",
    )
    assert job.status == "created"
    loaded = storage.load_job("job-st")
    assert loaded.status == "created"
    events = storage.list_events("job-st")
    assert any(e["kind"] == "job_started" for e in events)


# --------------------------------------------------------------------------- #
# 4. Phase 1                                                                  #
# --------------------------------------------------------------------------- #


def test_phase1_happy_path(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint()
    client.blueprint_response = bp
    orchestrator.start_job(
        job_id="job-p1",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    result = orchestrator.run_phase1("job-p1")
    assert result.domain_name == bp.domain_name
    j = storage.load_job("job-p1")
    assert j.status == "blueprint_ready"
    assert j.blueprint is not None
    events = storage.list_events("job-p1", phase="phase1")
    assert {e["kind"] for e in events} == {"started", "completed"}


def test_phase1_api_error_marks_failed_blueprint(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    client.blueprint_response = RuntimeError("upstream-down")
    orchestrator.start_job(
        job_id="job-p1f",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    with pytest.raises(OrchestratorError):
        orchestrator.run_phase1("job-p1f")
    j = storage.load_job("job-p1f")
    assert j.status == "failed_blueprint"
    assert "upstream-down" in (j.status_detail or "")


# --------------------------------------------------------------------------- #
# 5. Phase 2                                                                  #
# --------------------------------------------------------------------------- #


def test_phase2_single_attempt_accept(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]

    orchestrator.start_job(
        job_id="job-p2", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-p2")
    outcomes = orchestrator.run_phase2("job-p2")

    assert len(outcomes) == 1
    o = outcomes[0]
    assert o.final_status == "accepted"
    assert o.final_node_dict is not None
    assert o.final_node_dict["id"] == "intake-node"
    assert "user_provided_topic" in o.declared_condition_ids


def test_phase2_retry_success_after_failure(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    # 1. attempt invalid (lint error), 2. attempt valid.
    client.node_responses["intake-node"] = [
        _make_invalid_node_dict("intake-node"),
        _make_valid_node_dict("intake-node"),
    ]
    orchestrator.start_job(
        job_id="job-rs", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-rs")
    outcomes = orchestrator.run_phase2("job-rs")

    assert outcomes[0].final_status == "accepted"
    attempts = storage.list_node_attempts("job-rs", "intake-node")
    assert len(attempts) == 2
    assert attempts[0].accepted is False
    assert attempts[1].accepted is True
    assert client.last_context is not None
    assert client.last_context.retry_attempt_index == 1
    assert len(client.last_context.last_attempt_errors) > 0


def test_phase2_max_retry_exhausted_escalate(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [
        _make_invalid_node_dict("intake-node") for _ in range(3)
    ]
    orchestrator.start_job(
        job_id="job-mx",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
        retry_config=RetryConfig(
            max_attempts_per_node=3, escalate_after_attempts=True
        ),
    )
    orchestrator.run_phase1("job-mx")
    outcomes = orchestrator.run_phase2("job-mx")
    assert outcomes[0].final_status == "rejected_human_review"
    attempts = storage.list_node_attempts("job-mx", "intake-node")
    assert len(attempts) == 3
    assert all(a.accepted is False for a in attempts)


def test_phase2_max_retry_exhausted_no_escalate_raises(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [
        _make_invalid_node_dict("intake-node") for _ in range(2)
    ]
    orchestrator.start_job(
        job_id="job-ne",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
        retry_config=RetryConfig(
            max_attempts_per_node=2, escalate_after_attempts=False
        ),
    )
    orchestrator.run_phase1("job-ne")
    with pytest.raises(OrchestratorError):
        orchestrator.run_phase2("job-ne")
    j = storage.load_job("job-ne")
    assert j.status == "failed_generation"


def test_phase2_api_error_in_attempt_recorded(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [
        RuntimeError("rate-limit"),
        _make_valid_node_dict("intake-node"),
    ]
    orchestrator.start_job(
        job_id="job-ae", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-ae")
    outcomes = orchestrator.run_phase2("job-ae")
    assert outcomes[0].final_status == "accepted"
    attempts = storage.list_node_attempts("job-ae", "intake-node")
    assert attempts[0].api_error is not None
    assert "rate-limit" in attempts[0].api_error
    assert attempts[1].accepted is True


# --------------------------------------------------------------------------- #
# 6. Phase 3a                                                                 #
# --------------------------------------------------------------------------- #


def test_phase3a_clean_or_warnings(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]
    orchestrator.start_job(
        job_id="job-p3a", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-p3a")
    orchestrator.run_phase2("job-p3a")
    result = orchestrator.run_phase3a("job-p3a")
    assert result.verdict in {"clean", "warnings_only"}
    j = storage.load_job("job-p3a")
    assert j.structural_lint is not None
    assert j.final_story is not None
    assert j.final_story_version == 1


# --------------------------------------------------------------------------- #
# 7. Phase 3b                                                                 #
# --------------------------------------------------------------------------- #


def test_phase3b_happy_marks_done(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]
    client.audit_response = _make_audit(verdict="warnings_only", finding_count=1)

    orchestrator.start_job(
        job_id="job-p3b", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-p3b")
    orchestrator.run_phase2("job-p3b")
    orchestrator.run_phase3a("job-p3b")
    audit = orchestrator.run_phase3b("job-p3b")
    assert audit.verdict == "warnings_only"
    j = storage.load_job("job-p3b")
    assert j.status == "done"
    assert j.semantic_audit is not None
    assert len(j.semantic_audit.findings) == 1


def test_phase3b_hard_fail_marks_failed_audit(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]
    client.audit_response = _make_audit(verdict="hard_fail", finding_count=2)

    orchestrator.start_job(
        job_id="job-p3bf", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run_phase1("job-p3bf")
    orchestrator.run_phase2("job-p3bf")
    orchestrator.run_phase3a("job-p3bf")
    orchestrator.run_phase3b("job-p3bf")
    j = storage.load_job("job-p3bf")
    assert j.status == "failed_audit"


# --------------------------------------------------------------------------- #
# 8. End-to-end run()                                                         #
# --------------------------------------------------------------------------- #


def test_run_end_to_end_happy(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]
    client.audit_response = _make_audit(verdict="clean")

    orchestrator.start_job(
        job_id="job-e2e", domain_name="dom", target_locale="hu", research_text="r"
    )
    final = orchestrator.run("job-e2e")
    assert final.status == "done"
    assert final.blueprint is not None
    assert len(final.node_outcomes) == 1
    assert final.structural_lint is not None
    assert final.semantic_audit is not None
    assert final.final_story is not None


def test_run_end_to_end_blueprint_fail_short_circuits(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
):
    client.blueprint_response = RuntimeError("api-down")
    orchestrator.start_job(
        job_id="job-bp-bad",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    final = orchestrator.run("job-bp-bad")
    assert final.status == "failed_blueprint"
    assert client.generate_calls == 0
    assert client.audit_calls == 0


# --------------------------------------------------------------------------- #
# 9. Event log perzisztencia                                                  #
# --------------------------------------------------------------------------- #


def test_event_log_captures_full_lifecycle(
    orchestrator: OnboardingOrchestrator,
    storage: OnboardingStorage,
    client: MockOnboardingClient,
    bus: EventBus,
):
    bp = _make_blueprint(node_ids=("intake-node",))
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]
    client.audit_response = _make_audit(verdict="clean")

    captured: list[OnboardingEvent] = []
    bus.subscribe(captured.append)

    orchestrator.start_job(
        job_id="job-ev", domain_name="dom", target_locale="hu", research_text="r"
    )
    orchestrator.run("job-ev")

    persisted = storage.list_events("job-ev")
    persisted_kinds = [e["kind"] for e in persisted]
    bus_kinds = [e.kind for e in captured]

    expected_subset = {
        "job_started",
        "started",
        "completed",
        "node_attempt",
        "node_accepted",
        "job_done",
    }
    assert expected_subset.issubset(set(persisted_kinds))
    assert expected_subset.issubset(set(bus_kinds))

    persisted_ids = [e["event_id"] for e in persisted]
    assert persisted_ids == sorted(persisted_ids)
    assert [e.event_id for e in captured] == persisted_ids


# --------------------------------------------------------------------------- #
# 10. Domain-specific extended pool — auto-propagation                        #
# --------------------------------------------------------------------------- #
#
# A Phase 1 `DomainBlueprint.proposed_new_external_fields` listája egy
# job-scope, domain-specifikus pool. Két kontrakt-bizonyíték kell:
#
# (a) **Phase 2 propagation**: a `OnboardingClient.generate_node` által
#     kapott `GenerationContext.blueprint` tartalmazza a propos listát,
#     hogy a kliens implementáció a prompt-építéskor lássa.
# (b) **Phase 3a propagation**: a `lint_full_story` `extra_known_external_fields`
#     paraméterét a `run_phase3a` az aktuális blueprint propos field_name-jeivel
#     hívja (monkeypatch-spy igazolja).


def _blueprint_with_proposed(
    *,
    node_ids: tuple[str, ...] = ("intake-node",),
    end_page_ids: tuple[str, ...] = ("end-default",),
) -> DomainBlueprint:
    from services.onboarding.contracts import ProposedNewExternalField

    bp = _make_blueprint(node_ids=node_ids, end_page_ids=end_page_ids)
    return bp.model_copy(update={
        "proposed_new_external_fields": [
            ProposedNewExternalField(
                field_name="device_model",
                description="The exact model/SKU of the refurbished device.",
                rationale="Critical for wrong-item detection and device-specific troubleshooting.",
                suggested_type="str",
            ),
            ProposedNewExternalField(
                field_name="issue_start_date",
                description="The date when the customer first noticed the issue.",
                rationale="Required for warranty eligibility and proof-burden timing.",
                suggested_type="date",
            ),
        ],
    })


def test_phase2_context_carries_proposed_external_fields(
    orchestrator: OnboardingOrchestrator,
    client: MockOnboardingClient,
):
    bp = _blueprint_with_proposed()
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]

    orchestrator.start_job(
        job_id="job-p2pp",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    orchestrator.run_phase1("job-p2pp")
    orchestrator.run_phase2("job-p2pp")

    # A `MockOnboardingClient` minden generate_node hívásnál felveszi a
    # context-et — ennek ugyanazt a propos listát kell tartalmaznia.
    ctx = client.last_context
    assert ctx is not None
    forwarded = {p.field_name for p in ctx.blueprint.proposed_new_external_fields}
    assert forwarded == {"device_model", "issue_start_date"}


def test_phase3a_passes_extra_known_external_fields_to_lint(
    orchestrator: OnboardingOrchestrator,
    client: MockOnboardingClient,
    monkeypatch,
):
    bp = _blueprint_with_proposed()
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]

    orchestrator.start_job(
        job_id="job-p3pp",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    orchestrator.run_phase1("job-p3pp")
    orchestrator.run_phase2("job-p3pp")

    captured_kwargs: dict[str, Any] = {}
    real = __import__(
        "services.onboarding.orchestrator", fromlist=["lint_full_story"]
    ).lint_full_story

    def spy(story, *, extra_known_external_fields=None):
        captured_kwargs["extra_known_external_fields"] = extra_known_external_fields
        return real(story, extra_known_external_fields=extra_known_external_fields)

    monkeypatch.setattr(
        "services.onboarding.orchestrator.lint_full_story", spy
    )
    orchestrator.run_phase3a("job-p3pp")

    forwarded = captured_kwargs.get("extra_known_external_fields")
    assert forwarded is not None
    assert set(forwarded) == {"device_model", "issue_start_date"}


def test_router_node_known_pages_includes_other_blueprint_nodes(
    orchestrator: OnboardingOrchestrator,
    client: MockOnboardingClient,
):
    """Router heuristic: ha a target node `suggested_end_pages`-e üres, a
    `_run_node_with_retries` minden blueprint AI-node-id-t a
    `known_page_ids_so_far`-ba kell tegyen, hogy a router routing.goto-i
    rátalálhassanak az első generáláskor (mielőtt bármi accepted lenne).
    """
    bp = _make_blueprint(node_ids=("complaint-intake", "doa-no-power"))
    router = bp.nodes[0].model_copy(update={"suggested_end_pages": []})
    bp = bp.model_copy(update={"nodes": [router, bp.nodes[1]]})
    client.blueprint_response = bp

    captured_contexts: list[GenerationContext] = []
    original_generate = client.generate_node

    def spy(*, context: GenerationContext) -> dict[str, Any]:
        captured_contexts.append(context)
        return original_generate(context=context)

    client.generate_node = spy  # type: ignore[method-assign]

    # Router routol a worker-re; worker az end-default-ra.
    client.node_responses["complaint-intake"] = [
        _make_valid_node_dict("complaint-intake", end_target="doa-no-power")
    ]
    client.node_responses["doa-no-power"] = [
        _make_valid_node_dict("doa-no-power")
    ]

    orchestrator.start_job(
        job_id="job-router",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    orchestrator.run_phase1("job-router")
    orchestrator.run_phase2("job-router")

    assert len(captured_contexts) == 2

    # 1. hívás: a router. A heuristic miatt a `doa-no-power` is bent kell
    # legyen a known_page_ids-ban, MIELŐTT bárki accepted lenne.
    router_ctx = captured_contexts[0]
    assert router_ctx.target_node_candidate.proposed_id == "complaint-intake"
    assert router_ctx.accepted_nodes_summary == []
    assert "complaint-intake" in router_ctx.known_page_ids_so_far
    assert "doa-no-power" in router_ctx.known_page_ids_so_far
    assert "end-default" in router_ctx.known_page_ids_so_far

    # 2. hívás: a worker (regular node, suggested_end_pages NEM üres a default
    # _make_blueprint-ből). Itt a heuristic NEM lép be, de a `complaint-intake`
    # az accepted_so_far miatt kerül a known_pages-be.
    worker_ctx = captured_contexts[1]
    assert worker_ctx.target_node_candidate.proposed_id == "doa-no-power"
    assert worker_ctx.target_node_candidate.suggested_end_pages == ["end-default"]
    assert "complaint-intake" in worker_ctx.known_page_ids_so_far


def test_phase3a_extra_pool_does_not_break_clean_lint(
    orchestrator: OnboardingOrchestrator,
    client: MockOnboardingClient,
):
    # Smoke: a propos lista jelenléte nem ronthat el egy egyébként clean
    # lint-et, mert az `assemble_story` skeleton nem termel
    # `order_context_mapping.field_rules`-t. Tehát az extra paraméter
    # idle, és a verdict ugyanaz marad mint propos nélkül.
    bp = _blueprint_with_proposed()
    client.blueprint_response = bp
    client.node_responses["intake-node"] = [_make_valid_node_dict("intake-node")]

    orchestrator.start_job(
        job_id="job-p3sm",
        domain_name="dom",
        target_locale="hu",
        research_text="r",
    )
    orchestrator.run_phase1("job-p3sm")
    orchestrator.run_phase2("job-p3sm")
    result = orchestrator.run_phase3a("job-p3sm")
    assert result.verdict in {"clean", "warnings_only"}


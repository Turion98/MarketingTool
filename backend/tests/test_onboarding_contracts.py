"""Pytest cases for `services.onboarding.contracts` Phase 2/3 modellek.

Lefedett területek:

1. **Happy path round-trip** — minden új modell `model_dump()` →
   `model_validate()` veszteségmentesen tér vissza.
2. **`extra="forbid"` rejection** — egyetlen modell sem fogad el
   ismeretlen mezőt (regresszió-védelem hallucinált AI-output ellen).
3. **`StructuralLintResult.from_report` adapter** — az `errors` /
   `warnings` / `info` listák átkerülnek, és a verdict logika helyes:
   error → `hard_fail`, csak warning → `warnings_only`, semmi →
   `clean`.
4. **`NodeGenerationOutcome.accepted_summary()`** — a következő
   `GenerationContext.accepted_nodes_summary` formátumát adja vissza.
5. **`GenerationContext` forward-ref** — a `blueprint: DomainBlueprint`
   forward annotation tényleg feloldódik (importáláskor és
   model_validate-kor is).
6. **`OnboardingJob` minimal init** — a kötelező mezőkkel létrehozható,
   default state `created`, opcionális mezők `None`-ok.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from services.onboarding.contracts import (
    ConditionCandidate,
    DomainBlueprint,
    EndPageSpec,
    GenerationContext,
    NodeCandidate,
    NodeGenerationAttempt,
    NodeGenerationOutcome,
    OnboardingJob,
    RetryConfig,
    SemanticAuditFinding,
    SemanticAuditResult,
    StructuralLintResult,
)
from services.story_lint import Report


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _node_candidate(node_id: str = "delivery-issue") -> NodeCandidate:
    return NodeCandidate(
        proposed_id=node_id,
        domain_intent="Kezeli a kézbesítési problémákat: hiányzó csomag, késés.",
        scope_keywords=["delivery", "courier", "tracking"],
        triggering_examples=[
            "Még nem érkezett meg a csomagom",
            "A futár visszavitte a terméket",
        ],
        required_conditions=["has_order_id", "delivery_problem_kind"],
        optional_conditions=["tracking_number_known"],
        closing_step_required=True,
        suggested_end_pages=["delivery-not-received", "delivery-delayed"],
    )


def _blueprint() -> DomainBlueprint:
    return DomainBlueprint(
        locale="hu",
        domain_name="Test domain",
        vendor_policy="generic_blended",
        summary=(
            "Ez egy teszt-domain, amit a Phase 2 unit-tesztek használnak. "
            "Van egy minta node és néhány kondíció, hogy a kontraktok "
            "validálhatók legyenek."
        ),
        nodes=[_node_candidate()],
        conditions=[
            ConditionCandidate(
                id="has_order_id",
                description_seed="Az ügyfél megadta a rendelési azonosítót.",
                needs_validation_pattern=True,
            ),
        ],
        end_pages=[
            EndPageSpec(
                id="delivery-not-received",
                purpose="A futár soha nem kézbesítette a csomagot.",
                ticket_category="delivery_not_received",
                routing_target="courier_investigation_team",
                sla_hours=48,
            )
        ],
    )


# --------------------------------------------------------------------------- #
# 1. Round-trip                                                               #
# --------------------------------------------------------------------------- #


def test_generation_context_round_trip() -> None:
    bp = _blueprint()
    ctx = GenerationContext(
        blueprint=bp,
        target_node_candidate=_node_candidate("battery-issue"),
        accepted_nodes_summary=[
            {
                "node_id": "intake",
                "declared_conditions": ["has_order_id"],
                "exposed_handoff_conditions": [],
            }
        ],
        accumulated_condition_pool=["has_order_id", "within_return_window"],
        meta_under_construction={"id": "test-domain", "title": "Test"},
        known_page_ids_so_far=["intake", "battery-issue"],
        retry_attempt_index=0,
        last_attempt_errors=[],
    )
    payload = ctx.model_dump()
    again = GenerationContext.model_validate(payload)
    assert again == ctx


def test_node_generation_attempt_round_trip() -> None:
    now = datetime.now(timezone.utc)
    attempt = NodeGenerationAttempt(
        attempt_index=0,
        started_at=now,
        finished_at=now,
        raw_node_dict={"id": "x", "type": "ai"},
        lint_errors=[],
        lint_warnings=["[x] fallback_message hiányzik"],
        lint_info=[],
        accepted=True,
    )
    again = NodeGenerationAttempt.model_validate(attempt.model_dump(mode="json"))
    assert again.accepted is True
    assert again.lint_warnings == attempt.lint_warnings


def test_node_generation_outcome_round_trip() -> None:
    outcome = NodeGenerationOutcome(
        node_id="delivery-issue",
        attempts=[],
        final_status="accepted",
        final_node_dict={"id": "delivery-issue", "type": "ai"},
        declared_condition_ids=["delivery_problem_kind"],
        exposed_handoff_condition_ids=[],
    )
    again = NodeGenerationOutcome.model_validate(outcome.model_dump())
    assert again == outcome


def test_semantic_audit_result_round_trip() -> None:
    now = datetime.now(timezone.utc)
    result = SemanticAuditResult(
        findings=[
            SemanticAuditFinding(
                kind="routing_logic",
                severity="warning",
                node_id="delivery-issue",
                description="A routing nem kezeli a 'tracking ismeretlen' esetet.",
                suggested_fix="Adj hozzá egy default → 'ask' szabályt.",
            )
        ],
        verdict="warnings_only",
        audit_model="claude-opus-4-5",
        audit_started_at=now,
        audit_finished_at=now,
        summary_for_human="Egy kisebb routing-rés kezelendő.",
    )
    again = SemanticAuditResult.model_validate(result.model_dump(mode="json"))
    assert again.findings[0].kind == "routing_logic"
    assert again.verdict == "warnings_only"


# --------------------------------------------------------------------------- #
# 2. extra="forbid" regression                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "model_cls, base_payload",
    [
        (
            GenerationContext,
            {
                "blueprint": _blueprint().model_dump(),
                "target_node_candidate": _node_candidate("xy").model_dump(),
            },
        ),
        (
            RetryConfig,
            {},
        ),
        (
            StructuralLintResult,
            {"errors": [], "warnings": [], "info": [], "verdict": "clean"},
        ),
    ],
)
def test_extra_forbid_rejects_unknown_field(model_cls, base_payload):
    bad = {**base_payload, "hallucinated_field": "wat"}
    with pytest.raises(ValidationError):
        model_cls.model_validate(bad)


# --------------------------------------------------------------------------- #
# 3. StructuralLintResult.from_report adapter                                 #
# --------------------------------------------------------------------------- #


def test_from_report_clean() -> None:
    rep = Report()
    res = StructuralLintResult.from_report(rep)
    assert res.verdict == "clean"
    assert res.errors == []
    assert res.warnings == []
    assert res.info == []


def test_from_report_warnings_only() -> None:
    rep = Report()
    rep.warn("first warning")
    rep.note("info note")
    res = StructuralLintResult.from_report(rep)
    assert res.verdict == "warnings_only"
    assert res.errors == []
    assert res.warnings == ["first warning"]
    assert res.info == ["info note"]


def test_from_report_hard_fail_when_errors_present() -> None:
    rep = Report()
    rep.err("boom")
    rep.warn("also a warning")
    res = StructuralLintResult.from_report(rep)
    assert res.verdict == "hard_fail"
    assert res.errors == ["boom"]
    assert res.warnings == ["also a warning"]


def test_from_report_returns_independent_lists() -> None:
    # Regresszió: a Report mutable, ezért az adapter másolatot kell készítsen.
    rep = Report()
    rep.warn("w1")
    res = StructuralLintResult.from_report(rep)
    rep.warn("w2 added later")
    assert res.warnings == ["w1"]


# --------------------------------------------------------------------------- #
# 4. NodeGenerationOutcome.accepted_summary()                                 #
# --------------------------------------------------------------------------- #


def test_accepted_summary_shape_matches_generation_context_field() -> None:
    outcome = NodeGenerationOutcome(
        node_id="intake",
        final_status="accepted",
        declared_condition_ids=["has_order_id"],
        exposed_handoff_condition_ids=["intake_completed"],
    )
    summary = outcome.accepted_summary()
    assert summary == {
        "node_id": "intake",
        "declared_conditions": ["has_order_id"],
        "exposed_handoff_conditions": ["intake_completed"],
    }
    # A summary közvetlenül beengedhető a GenerationContext.accepted_nodes_summary-ba.
    ctx = GenerationContext(
        blueprint=_blueprint(),
        target_node_candidate=_node_candidate("battery-issue"),
        accepted_nodes_summary=[summary],
    )
    assert ctx.accepted_nodes_summary == [summary]


# --------------------------------------------------------------------------- #
# 5. GenerationContext forward-ref                                            #
# --------------------------------------------------------------------------- #


def test_generation_context_forward_ref_resolves() -> None:
    # A `blueprint: "DomainBlueprint"` forward-string annotation Pydantic v2
    # alatt automatikusan feloldódik. Ha bármi visszafelé töri (pl. egy
    # __future__ annotations-cseréje), a model_validate hibát ad.
    bp = _blueprint()
    ctx = GenerationContext(
        blueprint=bp,
        target_node_candidate=_node_candidate(),
    )
    assert isinstance(ctx.blueprint, DomainBlueprint)
    assert ctx.blueprint.domain_name == bp.domain_name


# --------------------------------------------------------------------------- #
# 6. OnboardingJob minimal init                                               #
# --------------------------------------------------------------------------- #


def test_onboarding_job_minimal_init() -> None:
    now = datetime.now(timezone.utc)
    job = OnboardingJob(
        job_id="job-0001",
        created_at=now,
        updated_at=now,
        domain_name="Test",
        target_locale="hu",
    )
    assert job.status == "created"
    assert job.vendor_policy == "generic_blended"
    assert job.blueprint is None
    assert job.node_outcomes == []
    assert job.current_node_index == 0
    assert isinstance(job.retry_config, RetryConfig)
    assert job.retry_config.max_attempts_per_node == 3
    assert job.final_story is None


def test_onboarding_job_full_state_round_trip() -> None:
    now = datetime.now(timezone.utc)
    job = OnboardingJob(
        job_id="job-full",
        created_at=now,
        updated_at=now,
        domain_name="Refurbished",
        target_locale="en",
        vendor_policy="specific",
        vendor_name="Refurbed",
        research_source_path="C:/research/spec.docx",
        retry_config=RetryConfig(max_attempts_per_node=5),
        blueprint=_blueprint(),
        node_outcomes=[
            NodeGenerationOutcome(
                node_id="intake",
                final_status="accepted",
                declared_condition_ids=["has_order_id"],
            )
        ],
        current_node_index=1,
        structural_lint=StructuralLintResult(
            errors=[],
            warnings=[],
            info=[],
            verdict="clean",
        ),
        final_story={"schemaVersion": "1.1.0", "pages": {}},
        final_story_version=1,
    )
    again = OnboardingJob.model_validate(job.model_dump(mode="json"))
    assert again.status == "created"
    assert again.retry_config.max_attempts_per_node == 5
    assert again.domain_name == "Refurbished"
    assert again.vendor_name == "Refurbed"
    assert again.blueprint is not None
    # A blueprint domain_name a Phase 1 felelőssége — a teszt fixture-é, nem
    # az OnboardingJob.domain_name-é.
    assert again.blueprint.domain_name == "Test domain"
    assert len(again.node_outcomes) == 1
    assert again.structural_lint is not None
    assert again.structural_lint.verdict == "clean"


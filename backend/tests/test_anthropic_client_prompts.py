"""Smoke tests for the prompt builders in `services.onboarding.anthropic_client`.

No Anthropic API calls. The tests cover:

1. **Phase 1 system prompt** — vendor-policy branching, field-pool listing.
2. **Phase 1 user message** — research markers and length.
3. **Phase 2 system prompt** — embeds the catalog markdown (including any
   domain-specific extensions) and the Phase 2 instructions block; vendor
   clause matches the blueprint policy.
4. **Phase 2 user message** — target node intent / scope keywords /
   triggering examples / suggested end-pages, the required + optional
   condition seeds, accepted-nodes summary, retry feedback.
5. **Phase 3b** — embeds the catalog and audit instructions.

The Phase 2 builders are the most important here because they are the
rendezvous point where the layered external-field pool surfaces in the
prompt; we explicitly check that proposed_new_external_fields appear when
present and stay invisible when absent.
"""
from __future__ import annotations

from services.onboarding.anthropic_client import (
    build_phase1_system_prompt,
    build_phase1_user_message,
    build_phase2_system_prompt,
    build_phase2_user_message,
    build_phase3b_system_prompt,
    build_phase3b_user_message,
)
from services.onboarding.constraints import build_constraint_catalog
from services.onboarding.contracts import (
    ConditionCandidate,
    DomainBlueprint,
    EndPageSpec,
    GenerationContext,
    NodeCandidate,
    ProposedNewExternalField,
)


# --------------------------------------------------------------------------- #
# Fixtures (helpers)                                                          #
# --------------------------------------------------------------------------- #


def _make_blueprint(
    *,
    proposed_fields: list[ProposedNewExternalField] | None = None,
    extra_conditions: list[ConditionCandidate] | None = None,
    end_pages: list[EndPageSpec] | None = None,
) -> DomainBlueprint:
    return DomainBlueprint(
        locale="en",
        domain_name="Refurbished electronics complaint intake",
        vendor_policy="generic_blended",
        summary=(
            "A blended-vendor complaint intake domain across refurbished "
            "electronics. The summary is at least 80 characters long for "
            "the Pydantic minimum."
        ),
        nodes=[
            NodeCandidate(
                proposed_id="doa-no-power",
                domain_intent=(
                    "Handles devices that do not power on or boot at all "
                    "upon arrival."
                ),
                scope_keywords=["dead", "no power", "won't turn on"],
                triggering_examples=[
                    "My phone won't turn on out of the box",
                    "Laptop is dead on arrival",
                ],
                required_conditions=["has_order_id", "delivery_date_known"],
                optional_conditions=["transit_damage_suspected"],
                closing_step_required=True,
                suggested_end_pages=[
                    "doa-inspection-approved",
                    "doa-rejected",
                ],
                references_research_section=["DOA flow"],
            ),
        ],
        conditions=[
            ConditionCandidate(
                id="has_order_id",
                description_seed="Customer has provided a valid order id.",
                derived_from_external_data=True,
                derived_external_field="order_id",
            ),
            ConditionCandidate(
                id="delivery_date_known",
                description_seed="The delivery date is known from order records.",
                derived_from_external_data=True,
                derived_external_field="delivery_date",
            ),
            ConditionCandidate(
                id="transit_damage_suspected",
                description_seed=(
                    "Customer reports visible damage to the outer packaging."
                ),
                derived_from_external_data=False,
            ),
            *(extra_conditions or []),
        ],
        end_pages=end_pages or [
            EndPageSpec(
                id="doa-inspection-approved",
                purpose="DOA confirmed; device approved for warranty inspection.",
                ticket_category="doa_inspection",
                priority="high",
                routing_target="warranty_inspection_queue",
                sla_hours=48,
            ),
            EndPageSpec(
                id="doa-rejected",
                purpose="DOA rejected because exclusion checks fired.",
                ticket_category="doa_rejection",
                priority="normal",
                routing_target="rejection_notification_queue",
                sla_hours=72,
            ),
        ],
        proposed_new_external_fields=proposed_fields or [],
    )


def _make_context(
    *,
    blueprint: DomainBlueprint,
    accepted_summary: list[dict] | None = None,
    accumulated_pool: list[str] | None = None,
    retry_attempt_index: int = 0,
    last_attempt_errors: list[str] | None = None,
) -> GenerationContext:
    candidate = blueprint.nodes[0]
    return GenerationContext(
        blueprint=blueprint,
        target_node_candidate=candidate,
        accepted_nodes_summary=accepted_summary or [],
        accumulated_condition_pool=accumulated_pool or [],
        meta_under_construction={"runtime": {"model": "claude", "max_tokens": 1024}},
        known_page_ids_so_far=[candidate.proposed_id, *candidate.suggested_end_pages],
        retry_attempt_index=retry_attempt_index,
        last_attempt_errors=last_attempt_errors or [],
    )


# --------------------------------------------------------------------------- #
# 1. Phase 1 system prompt                                                    #
# --------------------------------------------------------------------------- #


def test_phase1_system_prompt_generic_blended():
    p = build_phase1_system_prompt(
        target_locale="en",
        domain_name="Test domain",
        vendor_policy="generic_blended",
        vendor_name=None,
    )
    assert "TARGET DOMAIN: Test domain" in p
    assert "TARGET LOCALE: en" in p
    assert "VENDOR POLICY: generic_blended" in p
    assert "extract_blueprint" in p
    assert "STRICT FIELD POOL" in p


def test_phase1_system_prompt_specific_vendor_anchors_name():
    p = build_phase1_system_prompt(
        target_locale="en",
        domain_name="Test domain",
        vendor_policy="specific",
        vendor_name="Refurbed",
    )
    assert "VENDOR POLICY: specific" in p
    assert "Refurbed" in p


def test_phase1_system_prompt_lists_every_known_field():
    from services.story_lint import KNOWN_OCM_FIELDS

    p = build_phase1_system_prompt(
        target_locale="en",
        domain_name="d",
        vendor_policy="generic_blended",
        vendor_name=None,
    )
    for f in KNOWN_OCM_FIELDS:
        assert f in p, f"field missing from phase1 prompt: {f}"


# --------------------------------------------------------------------------- #
# 2. Phase 1 user message                                                     #
# --------------------------------------------------------------------------- #


def test_phase1_user_message_wraps_research_text():
    msg = build_phase1_user_message(
        research_text="Some research material about complaints.",
        research_source_label="my_doc.docx",
    )
    assert "RESEARCH SOURCE: my_doc.docx" in msg
    assert "RESEARCH LENGTH: 40 characters" in msg
    assert "=== RESEARCH MATERIAL BEGIN ===" in msg
    assert "=== RESEARCH MATERIAL END ===" in msg
    assert "Some research material about complaints." in msg


# --------------------------------------------------------------------------- #
# 3. Phase 2 system prompt                                                    #
# --------------------------------------------------------------------------- #


def test_phase2_system_prompt_embeds_catalog_and_instructions():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog,
        target_locale="en",
        vendor_policy="generic_blended",
    )
    # Catalog markdown markers
    assert "Story-node generation constraints" in p
    assert "## Routing" in p
    assert "## External data (OrderContext)" in p
    # Phase 2 instructions block
    assert "PHASE 2 - GENERATE ONE AI-NODE" in p
    assert "`generate_node`" in p
    assert "TARGET LOCALE: en" in p
    assert "VENDOR POLICY: generic_blended" in p


def test_phase2_prompt_describes_closing_step_bundle():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog, target_locale="en", vendor_policy="generic_blended"
    )
    assert "CLOSING STEPS" in p
    assert "is_terminal" in p
    assert "permit_goto_auto_ack" in p
    assert "silent_on_matched_goto" in p
    assert "fallback_reason" in p


def test_phase2_prompt_describes_condition_implications_pattern():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog, target_locale="en", vendor_policy="generic_blended"
    )
    assert "condition_implications" in p
    assert "when_all" in p and '"then"' in p


def test_phase2_prompt_describes_session_facts_whitelist_contract():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog, target_locale="en", vendor_policy="generic_blended"
    )
    assert "session_facts_whitelist" in p
    # The "explicit propagation contract" wording is the load-bearing term.
    assert "propagation contract" in p


def test_phase2_prompt_describes_inject_conditions_handoff_payload():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog, target_locale="en", vendor_policy="generic_blended"
    )
    assert "inject_conditions" in p
    assert "cross-node handoff payload" in p


def test_phase2_system_prompt_surfaces_domain_specific_extensions():
    proposals = [
        ProposedNewExternalField(
            field_name="device_model",
            description="The exact model/SKU of the refurbished device.",
            rationale="Critical for wrong-item detection.",
            suggested_type="str",
        ),
        ProposedNewExternalField(
            field_name="issue_start_date",
            description="The date when the customer first noticed the issue.",
            rationale="Required for warranty proof-burden timing.",
            suggested_type="date",
        ),
    ]
    catalog = build_constraint_catalog(proposed_external_fields=proposals)
    p = build_phase2_system_prompt(
        catalog,
        target_locale="en",
        vendor_policy="generic_blended",
    )
    assert "Domain-specific extensions" in p
    assert "BACKEND IMPLEMENTATION PENDING" in p
    assert "device_model" in p and "(str)" in p
    assert "issue_start_date" in p and "(date)" in p
    assert "GLOBAL POOL" in p


def test_phase2_system_prompt_omits_extension_section_when_pool_empty():
    catalog = build_constraint_catalog()  # no proposed fields
    p = build_phase2_system_prompt(
        catalog,
        target_locale="en",
        vendor_policy="generic_blended",
    )
    assert "Domain-specific extensions" not in p
    assert "BACKEND IMPLEMENTATION PENDING" not in p


def test_phase2_system_prompt_specific_vendor_policy_clause():
    catalog = build_constraint_catalog()
    p = build_phase2_system_prompt(
        catalog,
        target_locale="en",
        vendor_policy="specific",
        vendor_name="Refurbed",
    )
    assert "VENDOR POLICY: specific = 'Refurbed'" in p


# --------------------------------------------------------------------------- #
# 4. Phase 2 user message                                                     #
# --------------------------------------------------------------------------- #


def test_phase2_user_message_carries_target_node_metadata():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)

    # Top-level metadata
    assert "DOMAIN: Refurbished electronics complaint intake" in msg
    assert "locale=en" in msg
    assert "TARGET NODE: doa-no-power" in msg
    assert "Handles devices that do not power on" in msg
    # Scope keywords listed (the Python list repr is fine for the prompt)
    assert "dead" in msg and "no power" in msg
    # Triggering examples emitted as bullets
    assert "My phone won't turn on out of the box" in msg
    assert "Laptop is dead on arrival" in msg
    assert "closing_step_required: True" in msg


def test_phase2_user_message_emits_required_and_optional_condition_seeds():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)

    # Required conditions section + seeds
    assert "REQUIRED CONDITIONS" in msg
    assert "has_order_id: Customer has provided a valid order id." in msg
    assert "delivery_date_known: The delivery date is known" in msg
    # Optional
    assert "OPTIONAL CONDITIONS" in msg
    assert "transit_damage_suspected" in msg


def test_phase2_user_message_lists_suggested_end_pages_with_metadata():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)

    assert "SUGGESTED END PAGES" in msg
    assert "doa-inspection-approved" in msg
    assert "priority=high" in msg
    assert "sla=48h" in msg
    assert "warranty_inspection_queue" in msg


def test_phase2_user_message_emits_accepted_nodes_summary_when_present():
    bp = _make_blueprint()
    summary = [
        {
            "node_id": "complaint-intake",
            "declared_conditions": ["has_order_id"],
            "exposed_handoff_conditions": ["within_doa_window"],
        }
    ]
    ctx = _make_context(blueprint=bp, accepted_summary=summary)
    msg = build_phase2_user_message(ctx)

    assert "ACCEPTED NODES SO FAR" in msg
    assert "complaint-intake" in msg
    assert "within_doa_window" in msg


def test_phase2_user_message_omits_accepted_nodes_summary_when_empty():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp, accepted_summary=[])
    msg = build_phase2_user_message(ctx)
    assert "ACCEPTED NODES SO FAR" not in msg


def test_phase2_user_message_emits_retry_feedback():
    bp = _make_blueprint()
    ctx = _make_context(
        blueprint=bp,
        retry_attempt_index=1,
        last_attempt_errors=[
            "page.routing[0].goto: ismeretlen target 'wrong-id'",
            "step['ask']: hiányzik az 'id' mező",
        ],
    )
    msg = build_phase2_user_message(ctx)
    assert "PREVIOUS ATTEMPT ERRORS" in msg
    assert "attempt 1 failed" in msg
    assert "wrong-id" in msg
    assert "hiányzik az" in msg


def test_phase2_user_message_skips_retry_block_on_first_attempt():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp, retry_attempt_index=0, last_attempt_errors=[])
    msg = build_phase2_user_message(ctx)
    assert "PREVIOUS ATTEMPT ERRORS" not in msg


def test_phase2_user_message_emits_accumulated_condition_pool():
    bp = _make_blueprint()
    ctx = _make_context(
        blueprint=bp,
        accumulated_pool=["topic_known", "delivery_date_known"],
    )
    msg = build_phase2_user_message(ctx)
    assert "CROSS-NODE CONDITION POOL" in msg
    assert "topic_known" in msg


def test_phase2_user_message_router_node_with_no_end_pages_signals_router_hint():
    bp = _make_blueprint()
    # Mutate the candidate to behave like a router (no end pages).
    bp = bp.model_copy(update={
        "nodes": [bp.nodes[0].model_copy(update={"suggested_end_pages": []})],
    })
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)
    assert "router/dispatcher node" in msg


def test_phase2_user_message_router_node_lists_other_blueprint_nodes_as_targets():
    bp = _make_blueprint()
    extra = NodeCandidate(
        proposed_id="battery-issue",
        domain_intent="Handles devices reporting low battery health or rapid drain.",
        scope_keywords=["battery", "drain"],
        triggering_examples=["Battery dies fast"],
        required_conditions=[],
        optional_conditions=[],
        closing_step_required=True,
        suggested_end_pages=["battery-replacement"],
        references_research_section=["Battery flow"],
    )
    router = bp.nodes[0].model_copy(update={
        "proposed_id": "complaint-intake",
        "suggested_end_pages": [],
    })
    bp = bp.model_copy(update={"nodes": [router, extra]})
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)

    assert "ROUTER TARGETS" in msg
    assert "battery-issue" in msg
    assert "low battery health" in msg
    # The router itself MUST NOT appear in its own target list.
    assert "  - complaint-intake:" not in msg


def test_phase2_user_message_router_targets_omitted_for_regular_nodes():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)
    # `doa-no-power` has suggested_end_pages, so the router-targets block
    # should NOT appear.
    assert "ROUTER TARGETS" not in msg


def test_phase2_user_message_invokes_generate_node_at_end():
    bp = _make_blueprint()
    ctx = _make_context(blueprint=bp)
    msg = build_phase2_user_message(ctx)
    assert msg.rstrip().endswith(
        "Generate the AI-page dict via the `generate_node` tool now."
    )


# --------------------------------------------------------------------------- #
# 5. Phase 3b prompts (smoke)                                                 #
# --------------------------------------------------------------------------- #


def test_phase3b_system_prompt_embeds_catalog_and_audit_instructions():
    catalog = build_constraint_catalog()
    p = build_phase3b_system_prompt(catalog)
    assert "Story-node generation constraints" in p
    assert "PHASE 3B - SEMANTIC AUDIT" in p
    assert "report_semantic_issues" in p
    assert "hard_fail" in p


def test_phase3b_user_message_serializes_story():
    story = {
        "schemaVersion": "1.0",
        "storyId": "test-domain",
        "locale": "en",
        "meta": {"id": "test-domain", "title": "T"},
        "pages": {"intake": {"id": "intake", "type": "ai"}},
    }
    msg = build_phase3b_user_message(story)
    assert "=== STORY BEGIN ===" in msg
    assert "=== STORY END ===" in msg
    assert "test-domain" in msg
    assert "intake" in msg
    assert "report_semantic_issues" in msg

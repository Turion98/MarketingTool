"""Anthropic-backed implementation of the OnboardingClient protocol.

Production-ready client for the onboarding pipeline. The orchestrator
remains AI-agnostic — it depends on the OnboardingClient protocol — and
this module provides the concrete Anthropic SDK wiring.

The module is split into three concerns:

1. Pure prompt builders (``build_phase1_*``, ``build_phase2_*``,
   ``build_phase3b_*``). These are deterministic and have no I/O, which
   makes them unit-testable without any API keys.
2. A thin streaming helper that wraps ``client.messages.stream(...).
   get_final_message()``.
3. ``AnthropicOnboardingClient`` — the protocol-compatible class.

Streaming is used unconditionally because the Anthropic SDK requires it
for any request whose ``max_tokens`` estimate could exceed 10 minutes
(>= ~32K out tokens for Sonnet 4.5). For shorter requests streaming is
also safe, so we keep one path.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional, cast

from services.onboarding.constraints import (
    ConstraintCatalog,
    build_constraint_catalog,
    render_catalog_for_prompt,
)
from services.onboarding.contracts import (
    DomainBlueprint,
    GenerationContext,
    SemanticAuditResult,
    VendorPolicyKind,
)
from services.onboarding.reply_rules_generator import (
    build_generate_reply_rules_tool,
    build_phase3c_system_prompt,
    build_phase3c_user_message,
)
from services.onboarding.text_triggers_generator import (
    build_generate_text_triggers_tool,
    build_phase3g_system_prompt,
    build_phase3g_user_message,
)
from services.onboarding.tool_schemas import (
    build_extract_blueprint_tool,
    build_generate_node_tool,
    build_report_semantic_issues_tool,
)
from services.story_lint import KNOWN_OCM_FIELDS


# --------------------------------------------------------------------------- #
# Phase 1 — extract_blueprint                                                 #
# --------------------------------------------------------------------------- #


def build_phase1_system_prompt(
    *,
    target_locale: str,
    domain_name: str,
    vendor_policy: VendorPolicyKind,
    vendor_name: Optional[str],
) -> str:
    """System prompt for the Phase 1 blueprint extraction.

    Mirrors the prompt logic from ``scripts/onboarding_phase1_poc.py`` so
    that the production client and the standalone PoC stay in sync. The
    field pool is read from ``KNOWN_OCM_FIELDS`` (single source of truth);
    the Phase 1 prompt does NOT yet know about domain-specific extensions
    because they are an OUTPUT of Phase 1, not an input.
    """
    if vendor_policy == "generic_blended":
        vendor_clause = (
            "VENDOR POLICY: generic_blended. The research mentions multiple "
            "benchmark vendors with different rules (e.g. different return "
            "windows, different battery thresholds). DO NOT pick a single "
            "vendor. Instead, abstract the COMMON pattern. Where numbers "
            "differ, choose a sensible middle-ground value and note it in "
            "`notes` so a human can override later. Do NOT name any specific "
            "vendor in the generated `domain_intent` or `summary`."
        )
    elif vendor_policy == "specific" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: specific. Anchor all rules, thresholds, and "
            f"windows to {vendor_name!r}. If the research lacks a specific "
            f"value for {vendor_name!r}, use the closest analogue and note "
            f"it in `notes`."
        )
    elif vendor_policy == "mock" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: mock. The story is for a fictional vendor "
            f"named {vendor_name!r}. Use neutral middle-ground values from "
            f"the benchmark set as defaults. Treat this as a clean-slate "
            f"design, not as modelling any real vendor."
        )
    else:
        vendor_clause = (
            "VENDOR POLICY: generic_blended (fallback). Abstract the common "
            "pattern across vendors mentioned in the research."
        )

    field_pool_str = ", ".join(sorted(KNOWN_OCM_FIELDS))

    return (
        "You are a domain deconstructor for a customer-service workflow "
        "generation pipeline. Your job is Phase 1: read research material "
        "and extract a structured DomainBlueprint. The next phases (node "
        "generation, validation) will use your blueprint as input - so the "
        "STRUCTURE matters more than the prose.\n\n"
        f"TARGET DOMAIN: {domain_name}\n"
        f"TARGET LOCALE: {target_locale}\n\n"
        "SCOPE / NODE COUNT:\n"
        "- The number of ai-nodes and end-pages is YOURS to decide. Let the "
        "research material's actual complexity drive the count, NOT a quota.\n"
        "- An ai-node should map to a coherent CASE FAMILY with its own "
        "evidence requirements, exclusion checks, and routing decisions. A "
        "logical STEP within a flow is NOT a node.\n"
        "- An end-page should exist for each materially distinct OUTCOME "
        "with different ticket category, SLA, or routing target.\n\n"
        f"{vendor_clause}\n\n"
        "STRUCTURE-VS-CONTENT SPLIT (critical):\n"
        "- You produce STRUCTURAL CANDIDATES - node ids, condition ids, "
        "routing branches, end-page slots. The next phase fills in the "
        "actual ai_action, reply_rules, and full descriptions.\n"
        "- DO NOT write step definitions. DO NOT write reply rules. "
        "DO NOT write knowledge.description for nodes (only domain_intent).\n"
        "- DO write 1-2 sentence description_seed for each condition.\n\n"
        "ENTRY/DISPATCHER NODE:\n"
        "- Always include one entry node (suggested id: 'complaint-intake' "
        "or analogous) whose role is to detect the case family from the "
        "user's first message and route to the correct specific node.\n"
        "- Always include one off-topic node (suggested id: 'off-topic') "
        "for messages that fall outside the domain scope.\n\n"
        "EXTERNAL DATA DEPS - STRICT FIELD POOL:\n"
        "You may ONLY reference these fields in `external_data_deps`:\n"
        f"  {field_pool_str}\n"
        "If a derivation needs a field NOT in this pool, put it in "
        "`proposed_new_external_fields` with a clear rationale. Do NOT put "
        "non-pool fields in `external_data_deps`.\n\n"
        "RULE_KIND semantics:\n"
        "- 'truthy': field is non-empty/non-zero\n"
        "- 'not_null': field exists (any value, including 0/false)\n"
        "- 'when_value': field equals a specific value (must set when_value)\n"
        "- 'when_any_value': field is one of a set (must set when_any_value)\n\n"
        "CROSS-NODE HANDOFF:\n"
        "If a condition is detected in node A but consumed by node B's "
        "routing, list B in the condition's `cross_node_handoff_targets`.\n\n"
        "NOTES FIELD:\n"
        "Use `notes` for ambiguities, choices between conflicting sources, "
        "missing evidence-collection steps, and values you guessed (e.g. SLA "
        "hours). Be explicit. Empty notes is suspicious for a non-trivial "
        "domain.\n\n"
        "Call the `extract_blueprint` tool exactly once with your result."
    )


def build_phase1_user_message(
    *,
    research_text: str,
    research_source_label: str,
) -> str:
    return (
        f"RESEARCH SOURCE: {research_source_label}\n"
        f"RESEARCH LENGTH: {len(research_text)} characters\n\n"
        "=== RESEARCH MATERIAL BEGIN ===\n"
        f"{research_text}\n"
        "=== RESEARCH MATERIAL END ===\n\n"
        "Extract the DomainBlueprint via the extract_blueprint tool."
    )


# --------------------------------------------------------------------------- #
# Phase 2 — generate_node                                                     #
# --------------------------------------------------------------------------- #


_PHASE2_INSTRUCTIONS = """
PHASE 2 - GENERATE ONE AI-NODE.

You produce a single AI-page dict that will be added to the assembled story
under `pages[<id>]`. The structural lint validates your output BEFORE it is
accepted; lint errors trigger a retry. Optimize for lint-clean output and
faithful adherence to the target node's intent.

OUTPUT SHAPE (call `generate_node` exactly once):
- `id` MUST equal the target candidate's proposed_id verbatim.
- `type` MUST be exactly the literal string "ai".
- `fallback_message`: 1-2 sentences in the target locale, polite and on-domain.
- `knowledge.description` (1-3 sentences) describes what THIS node does for
  the agent prompt at runtime. Concrete, in the target locale.
- `knowledge.scope` (1 sentence) describes which messages route TO this node.
- `knowledge.examples` (2-5 strings) are paraphrases of triggering examples.
  Vary phrasing, do not copy-paste.
- `conditions[]` declares EVERY condition id this node references (in
  routing.if-rules, in steps, in condition_implications, in
  session_facts_whitelist). The required_conditions from the candidate are
  declared with `required: true`; optional_conditions with `required: false`.
- `routing[]`: at LEAST 1 default rule (`{"default": "<page>"}`) and zero or
  more if-rules (`{"if": ["cond_a", "cond_b"], "goto": "<page>"}`). The
  default rule is the LAST element by convention. AND-only inside `if` -
  no OR, no negation.
- `routing[*].goto` MUST be one of: a page-id from `suggested_end_pages`, an
  id from `accepted_nodes_summary`, the literal "ask", or - for the entry/
  dispatcher node only - other proposed node ids from the blueprint that the
  router branches TO (cross-node).

OPTIONAL FIELDS (use when they sharpen routing):
- `steps[]`: pattern is identify entity -> extract facts -> run exclusion
  checks -> decide route. Each step has a unique `id` and a `type` from the
  allowed set.
  CLOSING STEPS: if the candidate's `closing_step_required` is true OR the
  node otherwise terminates a flow on a fallback (no further routing
  possible), the closing step MUST carry the FULL closing bundle:
    - `is_closing: true`
    - `is_terminal: true`
    - `permit_goto_auto_ack: true`
    - `silent_on_matched_goto: true`
    - `fallback_reason: "<short reason in target locale, >=10 chars>"`
  The runtime relies on this bundle to safely close the session; missing
  any of these on a closing step is rejected by the schema AND by lint.
  Example:
    {"id":"step_resolved","type":"info","is_closing":true,"is_terminal":true,
     "permit_goto_auto_ack":true,"silent_on_matched_goto":true,
     "fallback_reason":"Az ügyfél igazolt csere-csomagot kapott."}

- `condition_implications[]`: `{when_all: [...], then: <derived_cond>}` -
  derive a condition deterministically from a combination already true.
  USE THIS when the routing graph would otherwise repeat the same multi-
  condition AND in many `if` rules. The derived `then` MUST be declared in
  `conditions[]` like any other condition; the implication then guarantees
  the runtime auto-satisfies it whenever ALL of `when_all` are satisfied.
  Examples (illustrative shapes, not literal text):
    {"when_all":["product_ordered","unboxed","item_arrived_damaged"],
     "then":"doa_confirmed"}
    {"when_all":["return_window_active","not_used","not_damaged"],
     "then":"refund_eligible"}

- `session_facts_whitelist[]`: condition IDs that THIS node owns and that
  OTHER nodes' routing depends on. The session_facts_whitelist is the
  explicit propagation contract - if a condition declared here is true at
  the moment this node hands off to another node, the runtime keeps it
  satisfied for the next node. Include EVERY condition that appears in
  another node's `routing.if[]` and is owned/derived here. (The Phase 2.5
  deterministic linker may also fill these post-hoc, but you should declare
  them yourself when you can - retry feedback will list cross-node refs
  you missed.)

- `routing[*].inject_conditions[]` (cross-node handoff payload): on a rule
  with `goto: <other_ai_page>`, list the condition IDs that should be
  pushed into the satisfied set for the target node. Use this for facts
  the target node would otherwise re-ask. Common pattern:
    {"if":["is_doa","item_received"], "goto":"doa-flow",
     "inject_conditions":["topic_known","is_doa","item_received"]}
  Only include conditions that the target node's whitelist accepts. The
  Phase 2.5 linker can refine this deterministically; declaring it here
  when obvious shortens retry loops.

- `steps[*].extract_hint` (per-step content-shaping for the runtime LLM
  extractor): a SHORT free-form guidance string (8-800 chars, target
  locale) that the runtime appends to the per-step extraction prompt.
  Use it ONLY to enable IMPLICIT MULTI-EXTRACTION or DISAMBIGUATION that
  the bare condition descriptions would not unlock. Skip it on closing
  steps (the runtime does not call the extractor there).
  WHEN TO ADD an extract_hint:
  * The step's done_when references several conditions and ONE user
    reply can plausibly satisfy MORE THAN ONE of them in a single turn.
  * A condition has a tricky natural-language signal (e.g. "the seal
    was already broken" -> doa_confirmed) that the LLM would otherwise
    miss without an example phrase.
  * The same step needs to disambiguate between two near-synonym
    conditions (e.g. wrong_item_received vs wrong_size) that hinge on a
    specific vocabulary cue.
  WHEN NOT TO ADD an extract_hint:
  * The step extracts a single primary condition with a clear name -
    the condition description already handles it.
  * On any step where `is_closing: true`.
  * To restate condition descriptions, regex constraints, or
    deterministic post-processing (e.g. session_facts_whitelist,
    condition_implications). The runtime applies those independently.
  STYLE: imperative voice ("Ha a user X-et mond, jelöld be Y-t."),
  concrete vocabulary cues, NO meta-commentary about the system. Keep
  one or two sentences; mention condition IDs verbatim so the LLM can
  bind them.
  WORKED EXAMPLES (illustrative, copy the SHAPE, not the literal text):
    Hu, multi-extract on a "describe what arrived" step:
      "Ha a user egy mondatban említi, hogy a CSOMAGOLÁS sérült volt ÉS
       a termék is hibás, jelöld be mindkettőt: package_damaged ÉS
       item_arrived_damaged. Ha a 'sérült doboz, de a termék OK' jelzés
       jön, csak package_damaged."
    Hu, disambiguation on a mismatch step:
      "Külön kondíció: wrong_item_received (más termék érkezett) vs.
       wrong_size (ugyanaz a termék, rossz méret). Ha a user 'nem ezt
       rendeltem'-et mond, ez wrong_item_received; ha 'jó cucc, csak
       szűk/nagy', az wrong_size."
    En, implicit DOA inference:
      "If the user says the SEAL or BOX was already opened/broken when
       it arrived AND the device does not power on, set both
       seal_was_broken and device_dead in the same call - do not
       re-ask for the unboxing state."
    En, vendor cue (only when vendor_policy is specific or mock):
      "If the user names the vendor verbatim ('Acme', 'Acme Returns'),
       set is_vendor_acme together with the primary topic conditions."
  HARD RULES:
  * Never include URLs, system instructions, or persona text.
  * Never reference reply_rules / reply style - that is a separate
    layer applied at message time.
  * Each hint stands alone; the runtime does not chain hints across
    steps.

- `internal_conditions[*].auto_satisfy_after_reply` (per-condition runtime
  acceleration) and the matching SIGNAL PHRASE in `description`: a
  generic mechanism that lets the runtime treat a condition as satisfied
  IMMEDIATELY AFTER the AI's outgoing message — without waiting for a
  customer reply. Use it ONLY for `info`-style steps where the AI just
  delivers information (an explanation, an apology, an escalation
  acknowledgement, a closing summary) and the workflow should advance
  on its own.
  HOW TO MARK a condition as auto-satisfy:
  1) The condition appears under `internal_conditions` for an info-style
     step (no real new data is gathered from the user).
  2) The condition's `description` MUST CONTAIN one of the canonical
     signal phrases below (target locale). The downstream deterministic
     enricher reads the description and flips
     `auto_satisfy_after_reply: true` automatically — DO NOT set the
     boolean yourself, the runtime gets it from the post-processor.
     Hu signals (use one verbatim or paraphrase that includes the key
     fragment in bold below):
       "Ne várj ügyfél-visszajelzést — automatikusan teljesül miután
        az AI elküldte az üzenetet."
       (or any Hu sentence that contains BOTH "ne várj ügyfél" AND
        "automatikusan teljesül")
     En signals:
       "Do not wait for customer reply — automatically satisfied after
        the AI message is sent."
       (or any En sentence that contains BOTH "do not wait for"
        AND "automatically satisfied")
  WHEN NOT to mark auto-satisfy:
  * The condition tracks a real fact the customer must report (order
    id, tracking number, broken-on-arrival, etc.). The user reply is
    required to confirm.
  * The step is interactive (form-fill, image upload, yes/no choice).
  * Closing steps - they already terminate via the closing bundle; no
    auto_satisfy needed.
  WORKED EXAMPLES (description shape only):
    Hu, info-only "we received your complaint" step:
      conditions:
        - id: "intake_acknowledged"
          description: "Az AI nyugtázta az ügyfélnek, hogy a panaszt
                        rögzítette. Ne várj ügyfél-visszajelzést —
                        automatikusan teljesül miután az AI elküldte
                        az üzenetet."
    En, escalation-confirmation step:
      conditions:
        - id: "escalation_communicated"
          description: "The AI told the customer that the case has been
                        escalated to a human agent. Do not wait for
                        customer reply — automatically satisfied after
                        the AI message is sent."
    Hu, REJECT example (do NOT auto-satisfy):
      - id: "tracking_number_provided"
        description: "Az ügyfél megadta a rendelési tracking számát."
        # No signal phrase — this needs a user reply with a real value.
  HARD RULES:
  * Each auto_satisfy condition MUST have the signal phrase in its
    description; the deterministic enricher relies on it.
  * NEVER set the boolean directly on the JSON output — let the
    enricher derive it. The schema accepts the boolean for backwards
    compatibility, but you should not produce it.
  * The signal phrase is RUN-TIME documentation: it must remain in the
    description even after enrichment runs.

VENDOR POLICY: this node MUST honour the same vendor policy declared in the
blueprint - do not reintroduce specific vendor names if the policy is
generic_blended.

RETRY FEEDBACK:
If the user message includes a "PREVIOUS ATTEMPT ERRORS" block, your previous
attempt failed structural lint. Address the listed errors precisely; do not
rewrite the whole node from scratch unless the errors require it.
""".strip()


def build_phase2_system_prompt(
    catalog: ConstraintCatalog,
    *,
    target_locale: str,
    vendor_policy: VendorPolicyKind,
    vendor_name: Optional[str] = None,
) -> str:
    """Phase 2 system prompt: catalog markdown + Phase 2 instructions.

    The catalog is rendered first because it carries the strict rule set and
    - importantly - the layered external-field pool (global + domain-specific
    extensions). The Phase 2 instructions then describe HOW to produce one
    AI-page that respects those rules.
    """
    if vendor_policy == "generic_blended":
        vendor_clause = (
            "VENDOR POLICY: generic_blended. Stay vendor-neutral; do NOT name "
            "any specific real vendor in `knowledge.description`, "
            "`knowledge.scope`, or `fallback_message`."
        )
    elif vendor_policy == "specific" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: specific = {vendor_name!r}. You MAY name "
            f"{vendor_name!r} where it adds clarity (e.g. policy references)."
        )
    elif vendor_policy == "mock" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: mock vendor {vendor_name!r}. Use neutral defaults; "
            "name the mock vendor where useful but do not cite real vendor "
            "policies."
        )
    else:
        vendor_clause = "VENDOR POLICY: generic_blended (fallback)."

    return (
        f"{render_catalog_for_prompt(catalog)}\n\n"
        f"TARGET LOCALE: {target_locale}\n"
        f"{vendor_clause}\n\n"
        f"{_PHASE2_INSTRUCTIONS}"
    )


def _format_condition_seeds(
    *,
    blueprint: DomainBlueprint,
    relevant_ids: list[str],
) -> list[str]:
    """Return ``"<id>: <description_seed>"`` lines for every blueprint
    condition whose id is in ``relevant_ids``. Ids that have no matching
    seed are still emitted so the prompt cannot silently drop a referenced
    condition."""
    by_id = {c.id: c.description_seed for c in blueprint.conditions}
    out: list[str] = []
    for cid in relevant_ids:
        seed = by_id.get(cid)
        out.append(f"  - {cid}: {seed}" if seed else f"  - {cid}: (no seed)")
    return out


def build_phase2_user_message(context: GenerationContext) -> str:
    """User message for one Phase 2 generation call.

    Carries the focused per-node payload: target candidate metadata, the
    relevant condition seeds, the suggested end pages, and - if any - the
    accepted-nodes summary plus retry feedback. The full blueprint is NOT
    re-serialized because the catalog markdown in the system prompt already
    covers structural rules; here we want a tight, action-oriented brief.
    """
    bp = context.blueprint
    cand = context.target_node_candidate

    parts: list[str] = []

    parts.append(f"DOMAIN: {bp.domain_name}  (locale={bp.locale})")
    parts.append(f"TARGET NODE: {cand.proposed_id}")
    parts.append(f"  intent: {cand.domain_intent}")
    if cand.scope_keywords:
        parts.append(f"  scope_keywords: {cand.scope_keywords}")
    if cand.triggering_examples:
        parts.append("  triggering_examples:")
        for ex in cand.triggering_examples:
            parts.append(f"    - {ex}")
    parts.append(
        f"  closing_step_required: {cand.closing_step_required}"
    )
    parts.append("")

    parts.append("REQUIRED CONDITIONS (declare with required: true):")
    if cand.required_conditions:
        parts.extend(
            _format_condition_seeds(
                blueprint=bp, relevant_ids=cand.required_conditions
            )
        )
    else:
        parts.append("  (none)")
    parts.append("")

    parts.append("OPTIONAL CONDITIONS (declare with required: false):")
    if cand.optional_conditions:
        parts.extend(
            _format_condition_seeds(
                blueprint=bp, relevant_ids=cand.optional_conditions
            )
        )
    else:
        parts.append("  (none)")
    parts.append("")

    parts.append("SUGGESTED END PAGES (valid `goto` targets):")
    if cand.suggested_end_pages:
        for ep_id in cand.suggested_end_pages:
            ep = next((e for e in bp.end_pages if e.id == ep_id), None)
            if ep is not None:
                parts.append(
                    f"  - {ep_id} (priority={ep.priority}, sla={ep.sla_hours}h, "
                    f"target={ep.routing_target})"
                )
                parts.append(f"      purpose: {ep.purpose}")
            else:
                parts.append(f"  - {ep_id} (no spec found)")
    else:
        parts.append(
            "  (none — this looks like a router/dispatcher node; "
            "use other accepted node ids as goto targets.)"
        )
        # Router targets: enumerate the rest of the blueprint so the
        # dispatcher has a concrete, valid set of `goto` ids even on the
        # very first generation when accepted_nodes_summary is empty.
        other_nodes = [
            n for n in bp.nodes if n.proposed_id != cand.proposed_id
        ]
        if other_nodes:
            parts.append("")
            parts.append("ROUTER TARGETS (other AI-nodes you may branch TO):")
            for n in other_nodes:
                intent = n.domain_intent
                if len(intent) > 110:
                    intent = intent[:107] + "..."
                parts.append(f"  - {n.proposed_id}: {intent}")
    parts.append("")

    if context.accepted_nodes_summary:
        parts.append(
            "ACCEPTED NODES SO FAR (other nodes you may route TO):"
        )
        for s in context.accepted_nodes_summary:
            nid = s.get("node_id")
            decl = s.get("declared_conditions") or []
            handoff = s.get("exposed_handoff_conditions") or []
            parts.append(
                f"  - {nid}: declared={decl}, handoff={handoff}"
            )
        parts.append("")

    if context.accumulated_condition_pool:
        parts.append(
            "CROSS-NODE CONDITION POOL (already declared somewhere; you may "
            "reference these in routing.if without redeclaring them — but "
            "if you DO declare them locally, the local declaration wins):"
        )
        parts.append(f"  {context.accumulated_condition_pool}")
        parts.append("")

    if context.retry_attempt_index > 0 and context.last_attempt_errors:
        parts.append(
            f"PREVIOUS ATTEMPT ERRORS (attempt {context.retry_attempt_index} "
            "failed structural lint; fix these and re-emit):"
        )
        for err in context.last_attempt_errors:
            parts.append(f"  - {err}")
        parts.append("")

    parts.append(
        "Generate the AI-page dict via the `generate_node` tool now."
    )

    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# Phase 3b — report_semantic_issues (stub system prompt)                      #
# --------------------------------------------------------------------------- #


_PHASE3B_INSTRUCTIONS = """
PHASE 3B - SEMANTIC AUDIT.

The structural lint has already passed. Your job is to find logical /
policy / tone issues that the lint cannot detect:

- routing_logic: gaps, unreachable rules, contradictions
- condition_naming: inconsistent or misleading ids
- node_overlap: two nodes claim the same case family
- missing_path: a realistic case has no end-page
- vendor_policy_violation: vendor-specific text where the policy is generic
- tone_or_style: tone drift, formality mismatch, locale issues
- scope_creep: a node handles cases outside its intent
- data_dependency: external field used incorrectly

Verdict semantics:
- "clean": no findings worth fixing
- "warnings_only": all findings are info/warning severity
- "needs_human_review": at least one finding is severity=error but the
  story is still safe to ship with caveats
- "hard_fail": at least one finding is severity=error and renders the story
  unsafe (e.g. routing dead-end on a critical path)

Call `report_semantic_issues` exactly once.
""".strip()


def build_phase3b_system_prompt(catalog: ConstraintCatalog) -> str:
    """Phase 3b system prompt — catalog + audit instructions."""
    return (
        f"{render_catalog_for_prompt(catalog)}\n\n"
        f"{_PHASE3B_INSTRUCTIONS}"
    )


def build_phase3b_user_message(story: dict[str, Any]) -> str:
    """Phase 3b user message — the assembled story as JSON."""
    import json as _json
    return (
        "Audit the assembled story below.\n\n"
        "=== STORY BEGIN ===\n"
        f"{_json.dumps(story, ensure_ascii=False, indent=2)}\n"
        "=== STORY END ===\n\n"
        "Call `report_semantic_issues` with your findings."
    )


# --------------------------------------------------------------------------- #
# Streaming helper                                                            #
# --------------------------------------------------------------------------- #


@dataclass
class _ToolCallResult:
    tool_input: dict[str, Any]
    stop_reason: Optional[str]
    input_tokens: int
    output_tokens: int


def _stream_tool_call(
    *,
    client: Any,
    model: str,
    max_tokens: int,
    temperature: float,
    system_prompt: str,
    user_message: str,
    tool: dict[str, Any],
) -> _ToolCallResult:
    """Wrapper around ``client.messages.stream(...)`` that returns the tool
    input as a dict plus token / stop-reason metadata.

    Streaming is mandatory in the Anthropic SDK once max_tokens crosses the
    ~32K threshold (per the `Streaming is required for operations that may
    take longer than 10 minutes` rule). Using it unconditionally keeps a
    single code path.
    """
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool["name"]},
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = stream.get_final_message()

    stop_reason = getattr(response, "stop_reason", None)
    tool_input: dict[str, Any] = {}
    for block in getattr(response, "content", None) or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == tool["name"]
        ):
            tool_input = cast(dict, block.input)
            break

    if not tool_input:
        raise RuntimeError(
            f"Model did not call tool {tool['name']!r}. "
            f"Stop reason: {stop_reason}"
        )

    usage = getattr(response, "usage", None)
    return _ToolCallResult(
        tool_input=tool_input,
        stop_reason=stop_reason,
        input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
        output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
    )


# --------------------------------------------------------------------------- #
# AnthropicOnboardingClient                                                   #
# --------------------------------------------------------------------------- #


class AnthropicOnboardingClient:
    """Concrete OnboardingClient implementation using the Anthropic SDK.

    The client is instantiated once per pipeline run; it caches its own
    ``anthropic.Anthropic`` instance and exposes the three protocol methods.
    Each call records its last tool-call result on ``self.last_*`` for
    debugging / observability — the orchestrator does not look at these
    attributes, but the PoC scripts and integration tests do.

    The catalog used in Phase 2 / Phase 3b is rebuilt FROM THE BLUEPRINT
    each time a method is called: this is the rendezvous point where the
    domain-specific extended pool (`proposed_new_external_fields`) gets
    layered into the constraint catalog and surfaces in the system prompt.
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        model: str = "claude-sonnet-4-5-20250929",
        phase1_max_tokens: int = 32000,
        phase2_max_tokens: int = 8000,
        phase3b_max_tokens: int = 16000,
        phase3c_max_tokens: int = 4000,
        phase3g_max_tokens: int = 4000,
        temperature: float = 0.2,
    ) -> None:
        try:
            import anthropic
        except ImportError as e:
            raise RuntimeError(
                "AnthropicOnboardingClient requires the `anthropic` package. "
                "Install via: pip install anthropic"
            ) from e

        key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is missing. Set it via env var or pass "
                "api_key= to the constructor."
            )
        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=key)
        self._model = model
        self._phase1_max_tokens = phase1_max_tokens
        self._phase2_max_tokens = phase2_max_tokens
        self._phase3b_max_tokens = phase3b_max_tokens
        self._phase3c_max_tokens = phase3c_max_tokens
        self._phase3g_max_tokens = phase3g_max_tokens
        self._temperature = temperature

        # Last-call observability hooks; the PoC scripts read these.
        self.last_phase1_result: Optional[_ToolCallResult] = None
        self.last_phase2_result: Optional[_ToolCallResult] = None
        self.last_phase3b_result: Optional[_ToolCallResult] = None
        self.last_phase3c_result: Optional[_ToolCallResult] = None
        self.last_phase3g_result: Optional[_ToolCallResult] = None
        self.last_card4_result: Optional[_ToolCallResult] = None

    # ------------------------------------------------------------------ #
    # Phase 1                                                             #
    # ------------------------------------------------------------------ #

    def extract_blueprint(
        self,
        *,
        research_text: str,
        locale: str,
        domain_name: str,
        vendor_policy: VendorPolicyKind,
        vendor_name: Optional[str],
        research_source_label: str = "research_text",
    ) -> DomainBlueprint:
        catalog = build_constraint_catalog()
        tool = build_extract_blueprint_tool(catalog)
        system_prompt = build_phase1_system_prompt(
            target_locale=locale,
            domain_name=domain_name,
            vendor_policy=vendor_policy,
            vendor_name=vendor_name,
        )
        user_message = build_phase1_user_message(
            research_text=research_text,
            research_source_label=research_source_label,
        )
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=self._phase1_max_tokens,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        self.last_phase1_result = result
        return DomainBlueprint.model_validate(result.tool_input)

    # ------------------------------------------------------------------ #
    # Phase 2                                                             #
    # ------------------------------------------------------------------ #

    def generate_node(
        self,
        *,
        context: GenerationContext,
    ) -> dict[str, Any]:
        # The catalog is rebuilt from the blueprint so the layered pool
        # (global KNOWN_OCM_FIELDS + per-job proposed_new_external_fields)
        # appears in the rendered prompt. The orchestrator reuses
        # `proposed_new_external_fields` again at Phase 3a as
        # `extra_known_external_fields` for `lint_full_story`.
        catalog = build_constraint_catalog(
            proposed_external_fields=context.blueprint.proposed_new_external_fields
        )
        tool = build_generate_node_tool(catalog)
        system_prompt = build_phase2_system_prompt(
            catalog,
            target_locale=context.blueprint.locale,
            vendor_policy=context.blueprint.vendor_policy,
            vendor_name=context.blueprint.vendor_name,
        )
        user_message = build_phase2_user_message(context)
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=self._phase2_max_tokens,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        self.last_phase2_result = result
        return result.tool_input

    # ------------------------------------------------------------------ #
    # Phase 3b                                                            #
    # ------------------------------------------------------------------ #

    def report_semantic_issues(
        self,
        *,
        story: dict[str, Any],
        audit_model: str,
    ) -> SemanticAuditResult:
        catalog = build_constraint_catalog()
        tool = build_report_semantic_issues_tool(catalog)
        system_prompt = build_phase3b_system_prompt(catalog)
        user_message = build_phase3b_user_message(story)
        started = datetime.now(timezone.utc)
        result = _stream_tool_call(
            client=self._client,
            model=audit_model or self._model,
            max_tokens=self._phase3b_max_tokens,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        finished = datetime.now(timezone.utc)
        self.last_phase3b_result = result

        payload = dict(result.tool_input)
        payload.setdefault("audit_model", audit_model or self._model)
        payload.setdefault("audit_started_at", started.isoformat())
        payload.setdefault("audit_finished_at", finished.isoformat())
        return SemanticAuditResult.model_validate(payload)

    # ------------------------------------------------------------------ #
    # Phase 3c — reply_rules generator (per AI-page)                      #
    # ------------------------------------------------------------------ #

    def generate_reply_rules(
        self,
        *,
        page: dict[str, Any],
        locale: str,
        vendor_policy: Optional[str],
        vendor_name: Optional[str],
    ) -> dict[str, list[str]]:
        """Generate step-level reply_rules for one AI page.

        Returns a ``{step_id: reply_rules[]}`` mapping covering all
        non-closing steps for which the model produced rules. Closing
        steps are explicitly excluded by both the system prompt and the
        user message.

        Raises ``RuntimeError`` if the tool output deviates from the
        expected schema (caller can treat this as a node-level failure
        and skip).
        """
        tool = build_generate_reply_rules_tool()
        system_prompt = build_phase3c_system_prompt(
            locale=locale,
            vendor_policy=vendor_policy,
            vendor_name=vendor_name,
        )
        user_message = build_phase3c_user_message(page=page, locale=locale)
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=self._phase3c_max_tokens,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        self.last_phase3c_result = result

        payload = result.tool_input
        if not isinstance(payload, dict):
            raise RuntimeError(
                "Phase 3c tool output is not a dict; got "
                f"{type(payload).__name__}"
            )
        step_rules_raw = payload.get("step_rules")
        if not isinstance(step_rules_raw, list):
            raise RuntimeError(
                "Phase 3c tool output missing or invalid `step_rules`."
            )

        out: dict[str, list[str]] = {}
        for entry in step_rules_raw:
            if not isinstance(entry, dict):
                continue
            sid = entry.get("step_id")
            rules = entry.get("reply_rules")
            if not isinstance(sid, str) or not sid.strip():
                continue
            if not isinstance(rules, list):
                continue
            cleaned = [r for r in rules if isinstance(r, str) and r.strip()]
            if cleaned:
                out[sid.strip()] = cleaned
        return out

    # ------------------------------------------------------------------ #
    # Phase 3g — text_triggers                                            #
    # ------------------------------------------------------------------ #

    # ------------------------------------------------------------------ #
    # Card 4A — end-node texts (brief-driven flow)                        #
    # ------------------------------------------------------------------ #

    def generate_end_node_texts(
        self,
        *,
        system_prompt: str,
        user_message: str,
    ) -> dict[str, str]:
        """`EndNodeTextClient` Protocol implementáció.

        A prompt-építés a hívó (`services.onboarding.end_node_text_generator.
        generate_end_node_texts`) felelőssége — ez a metódus csak az AI
        round-trip-et csinálja, a tool schemával validálva.

        Visszaad: `{<EndNodeKind>: str}` dict. A 6 kulcsot a tool-schema
        kényszeríti; egyenkénti validációt a hívó utánvalidálja.
        """
        # Lazy import a cirkuláris dependencia elkerülésére (end_node_text_generator
        # NEM importál visszafelé az anthropic_client-re, de a top-level
        # importok rendezett listájában tartjuk magunkat).
        from services.onboarding.end_node_text_generator import (
            build_generate_end_node_texts_tool,
        )

        tool = build_generate_end_node_texts_tool()
        # A Card 4A egy rövid tool-call (~6 mező × max 800 char); 4k token
        # bőven elég.
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=4000,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        self.last_card4_result = result
        payload = result.tool_input
        if not isinstance(payload, dict):
            raise RuntimeError(
                "Card 4A tool output is not a dict; got "
                f"{type(payload).__name__}"
            )
        # Csak a string értékeket adjuk vissza — a végső validációt
        # (mind a 6 kulcs jelen, üres-string filter) a hívó csinálja a
        # `generate_end_node_texts` modul-szintű függvényben.
        return {k: v for k, v in payload.items() if isinstance(v, str)}

    def coach_reply(
        self,
        *,
        system_prompt: str,
        user_message: str,
    ) -> dict[str, Any]:
        """Onboarding coach tool-call — `CoachClient` implementáció."""
        from services.onboarding.onboarding_coach import build_coach_tool

        tool = build_coach_tool()
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=1200,
            temperature=0.3,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        payload = result.tool_input
        if not isinstance(payload, dict):
            raise RuntimeError(
                f"coach_reply tool output is not a dict; got {type(payload).__name__}"
            )
        return payload

    def generate_text_triggers(
        self,
        *,
        page: dict[str, Any],
        locale: str,
    ) -> dict[str, list[str]]:
        """Generate condition-level `text_triggers` for one AI page.

        Returns a ``{condition_id: triggers[]}`` mapping covering only
        the conditions for which the model produced triggers (eligible
        content-pattern conds; extract-style conds were filtered out
        in the user message and the model is instructed to skip them).

        Raises ``RuntimeError`` if the tool output deviates from the
        expected schema (caller can treat this as a node-level failure
        and skip).
        """
        tool = build_generate_text_triggers_tool()
        system_prompt = build_phase3g_system_prompt(locale=locale)
        user_message = build_phase3g_user_message(page=page, locale=locale)
        result = _stream_tool_call(
            client=self._client,
            model=self._model,
            max_tokens=self._phase3g_max_tokens,
            temperature=self._temperature,
            system_prompt=system_prompt,
            user_message=user_message,
            tool=tool,
        )
        self.last_phase3g_result = result

        payload = result.tool_input
        if not isinstance(payload, dict):
            raise RuntimeError(
                "Phase 3g tool output is not a dict; got "
                f"{type(payload).__name__}"
            )
        cond_triggers_raw = payload.get("condition_triggers")
        if not isinstance(cond_triggers_raw, list):
            raise RuntimeError(
                "Phase 3g tool output missing or invalid `condition_triggers`."
            )

        out: dict[str, list[str]] = {}
        for entry in cond_triggers_raw:
            if not isinstance(entry, dict):
                continue
            cid = entry.get("condition_id")
            triggers = entry.get("triggers")
            if not isinstance(cid, str) or not cid.strip():
                continue
            if not isinstance(triggers, list):
                continue
            cleaned = [t for t in triggers if isinstance(t, str) and t.strip()]
            if cleaned:
                out[cid.strip()] = cleaned
        return out


__all__ = [
    "AnthropicOnboardingClient",
    "build_phase1_system_prompt",
    "build_phase1_user_message",
    "build_phase2_system_prompt",
    "build_phase2_user_message",
    "build_phase3b_system_prompt",
    "build_phase3b_user_message",
]

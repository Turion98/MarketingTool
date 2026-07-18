"""Domain-onboarding constraint catalog.

A pipeline minden fázisának (Phase 1 / Phase 2 / Phase 3) közös igazságforrása
arról, hogy mit fogad el a futtatórendszer és a strukturális lint:

* `services.story_runtime.resolve_ai_node_routing` — routing AND-only,
  no negation, kétmenetes (if-rules → default), `goto` ∈ pages ∪ {"ask"}.
* `services.story_lint.validate_*` — page / step / condition / routing /
  order_context_mapping struktúra.
* `services.order_context._apply_field_rules` — `when` ∈ {"truthy", "not_null"},
  vagy `when_value` / `when_any_value`; modifier-ek (`requires_field_not_null`,
  `requires_field_lt_today`).
* `services.order_context.OrderContext` — engedélyezett külső mező-pool
  (a `services.story_lint.KNOWN_OCM_FIELDS` ezt tükrözi).

A katalógust a Phase 2 KÖTELEZŐEN megkapja a rendszer-promptban
(`render_catalog_for_prompt(catalog)`), és a Step 5 Anthropic tool
input_schema-k itt rögzített `enum` listákat használnak. A regresszió-
tesztek bizonyítják, hogy a katalógus értékei a tényleges runtime
konstansokból táplálkoznak (drift detection).

A katalógus immutable per-process: `build_constraint_catalog()` egyszer
hív, és a teljes pipeline ugyanazt a snapshot-ot látja.
"""

from __future__ import annotations

from typing import Iterable, Literal

from pydantic import BaseModel, ConfigDict, Field

from services.onboarding.contracts import ProposedNewExternalField
from services.story_lint import (
    KNOWN_OCM_FIELDS,
    REQUIRED_COMPUTED_KEYS,
    RUNTIME_INT_KEYS,
    RUNTIME_STR_KEYS,
)


# --------------------------------------------------------------------------- #
# Section: Routing                                                            #
# --------------------------------------------------------------------------- #


class RoutingConstraints(BaseModel):
    """A `services.story_runtime.resolve_ai_node_routing` által támogatott
    routing-formák és kombinációk.

    A runtime-igazságok (kódból kinyerve):

    1. Csak két szabály-forma létezik: `{if: list[str], goto: str}` és
       `{default: str}`. Bármi más → strukturális lint ERROR.
    2. Az `if` lista AND-joined: minden kondíciónak satisfied kell legyen
       a `satisfied_conditions` halmazban. NINCS OR és NINCS negáció
       (`!cond`) — a runtime mindkettőt elutasítja.
    3. Kétmenetes kiértékelés: az első menet az if-szabályokat nézi
       sorrendben (első match nyer); ha egyik sem teljesül, a második
       menet keresi az első `default` szabályt.
    4. `goto` érték lehet: létező page-id (a story `pages` alatt), vagy
       a literál `"ask"` (a runtime ekkor pontosítást kér).
    5. Konvenció: a `default` szabály utolsóként jön. A runtime helyesen
       kezeli máshol is, de a lint warningot ad.
    6. `inject_conditions: list[str]` opcionális mező a routing rule-on:
       ha a szabály matchel, ezek a kondíciók bekerülnek a satisfied
       halmazba a következő node-on.
    """

    model_config = ConfigDict(extra="forbid")

    allowed_rule_forms: list[str] = Field(
        default_factory=lambda: [
            '{"if": ["cond_a", "cond_b"], "goto": "page_id"}',
            '{"if": ["cond_a"], "goto": "ask"}',
            '{"default": "page_id"}',
            '{"default": "ask"}',
            '{"if": ["cond_a"], "goto": "page_id", "inject_conditions": ["new_cond"]}',
        ],
        description="Példa-formák; minden más rejection.",
    )
    logic_kind: Literal["AND_only"] = Field(
        default="AND_only",
        description="A runtime csak AND-logikát ismer az `if` listán belül.",
    )
    negation_supported: bool = Field(
        default=False,
        description="`!cond` szintaxis NINCS támogatva. Ha negációt akarsz, "
        "használj inverz kondíciót (pl. 'within_return_window' helyett "
        "'outside_return_window').",
    )
    evaluation_passes: int = Field(default=2, ge=2, le=2)
    default_convention: str = Field(
        default="A `default` szabály konvencionálisan az utolsó. Lint "
        "warning ha nem, de a runtime működik.",
    )
    valid_goto_targets: list[str] = Field(
        default_factory=lambda: ["<existing-page-id>", "ask"],
        description="A `goto` mező csak létező page-id-t vagy 'ask'-t fogad el.",
    )
    inject_conditions_supported: bool = Field(default=True)


# --------------------------------------------------------------------------- #
# Section: Condition                                                          #
# --------------------------------------------------------------------------- #


class ConditionConstraints(BaseModel):
    """Egy condition definícióra vonatkozó szabályok (`page.conditions[]`
    és `step.internal_conditions[]`).

    Forrás: `services.story_lint.validate_conditions` és `validate_steps`
    `internal_conditions` ága.
    """

    model_config = ConfigDict(extra="forbid")

    id_format: str = Field(
        default="snake_case (kisbetűk + aláhúzás), pl. 'has_order_id', 'package_lost'",
    )
    id_min_length: int = 2
    id_max_length: int = 64
    required_fields: list[str] = Field(
        default_factory=lambda: ["id", "description"],
    )
    optional_fields: list[str] = Field(
        default_factory=lambda: [
            "required",
            "validation_pattern_ref",
            "do_not_reask_if_satisfied",
        ],
    )
    validation_pattern_ref_rule: str = Field(
        default=(
            "Ha jelen van: a `meta.<ref>` kulcs alatt egy nem-üres regex "
            "string-et kell találni. A runtime ezzel validálja a felhasználó "
            "által megadott értéket (pl. order_id formátum)."
        ),
    )
    declaration_scopes: list[str] = Field(
        default_factory=lambda: [
            "page.conditions[]",
            "step.internal_conditions[] (string vagy {id, description, ...} dict)",
            "page.condition_implications[].then (származtatott)",
            "page.session_facts_whitelist (cross-node terjesztés engedélyezés)",
            "page.routing[].inject_conditions (futás közbeni injektálás)",
            "step.inject_conditions / branch.inject_conditions",
            "meta.order_context_mapping.field_rules[].condition (külső adatból)",
            "meta.order_context_mapping.computed_condition_ids.<key> (runtime computed)",
        ],
        description="Hol DEKLARÁLHATÓ vagy INJEKTÁLHATÓ egy kondíció ID.",
    )


# --------------------------------------------------------------------------- #
# Section: Step                                                               #
# --------------------------------------------------------------------------- #


# A `services.story_lint.validate_steps` által elfogadott step típusok.
# A runtime a step.type-ot nem érvényesíti külön, így az igazságforrás a
# strukturális lint.
ALLOWED_STEP_TYPES: tuple[str, ...] = ("prompt", "info", "decision", "auto")

# Boolean flag-ek a step-en — a `validate_steps` típus-ellenőrzi őket.
KNOWN_STEP_BOOL_FLAGS: tuple[str, ...] = (
    "is_closing",
    "is_terminal",
    "skippable",
    "silent_on_matched_goto",
    "suppress_goto_auto_ack",
    "permit_goto_auto_ack",
    "advance_requires_new_satisfaction",
    "chain_on_complete",
)


class StepConstraints(BaseModel):
    """Step-szintű szabályok (`page.steps[]`).

    Forrás: `services.story_lint.validate_steps` (~200 sor).
    """

    model_config = ConfigDict(extra="forbid")

    allowed_step_types: list[str] = Field(
        default_factory=lambda: list(ALLOWED_STEP_TYPES),
        description="A `step.type` mező megengedett értékei.",
    )
    required_fields: list[str] = Field(
        default_factory=lambda: ["id", "type"],
    )
    optional_string_fields: list[str] = Field(
        default_factory=lambda: [
            "goal", "ai_action", "done_when", "default_next", "fallback_reason",
        ],
    )
    boolean_flag_fields: list[str] = Field(
        default_factory=lambda: list(KNOWN_STEP_BOOL_FLAGS),
        description="Csak bool érték — string/int rejection.",
    )
    closing_step_required_bundle: list[str] = Field(
        default_factory=lambda: [
            "is_terminal", "permit_goto_auto_ack",
            "silent_on_matched_goto", "fallback_reason",
        ],
        description=(
            "Ha `is_closing: true`, ezek MIND kötelezőek a step-en: "
            "`is_terminal: true`, `permit_goto_auto_ack: true`, "
            "`silent_on_matched_goto: true`, és nem-üres `fallback_reason` string. "
            "A runtime ezen a bundle-on alapul a session lezárásához."
        ),
    )
    branches_form: str = Field(
        default=(
            "Lista; minden elem dict: {if: list[str], (next_step|goto): str, "
            "inject_conditions?: list[str]}. A `next_step` step-id-t ad ezen "
            "a node-on belül; a `goto` page-id-t (vagy 'ask')."
        ),
    )
    internal_conditions_form: str = Field(
        default=(
            "Lista, elemei lehetnek string-ek (csak ID hivatkozás) vagy dict-ek "
            "({id, description, required?, validation_pattern_ref?, "
            "do_not_reask_if_satisfied?}). A duplikált id-k rejection."
        ),
    )
    image_conditions_form: str = Field(
        default="Lista string ID-kből; ezek a kondíciók kép-input módot triggerelnek.",
    )
    step_id_uniqueness: str = Field(
        default="Egy node-on belül a step.id-k egyediek kell legyenek.",
    )


# --------------------------------------------------------------------------- #
# Section: Page                                                               #
# --------------------------------------------------------------------------- #


# A `services.story_lint.validate_page` által elfogadott page típusok.
ALLOWED_PAGE_TYPES: tuple[str, ...] = ("ai", "end")


class PageConstraints(BaseModel):
    """Page-szintű szabályok (`pages[<id>]`).

    Forrás: `services.story_lint.validate_page`.
    """

    model_config = ConfigDict(extra="forbid")

    allowed_page_types: list[str] = Field(
        default_factory=lambda: list(ALLOWED_PAGE_TYPES),
    )
    ai_required_fields: list[str] = Field(
        default_factory=lambda: ["id", "type", "knowledge", "routing"],
        description=(
            "Erősen ajánlott + kötelező: id, type='ai', knowledge "
            "(description/scope/examples), routing (legalább 1 default)."
        ),
    )
    ai_recommended_fields: list[str] = Field(
        default_factory=lambda: [
            "fallback_message",
            "conditions",
            "steps",
            "condition_implications",
            "session_facts_whitelist",
        ],
        description="Hiánya warning, nem error — de production-quality node-hoz kellenek.",
    )
    end_required_fields: list[str] = Field(
        default_factory=lambda: ["id", "type", "content"],
        description="End page-en a `content` egy nem-üres string kell legyen.",
    )
    knowledge_subfields: list[str] = Field(
        default_factory=lambda: ["description", "scope", "examples"],
        description="Mind a 3 hiánya warning. examples: nem-üres string lista.",
    )
    page_id_uniqueness: str = Field(
        default=(
            "A pages dict kulcsa egyedi (Python dict miatt automatikus). "
            "A page['id'] mezőnek meg kell egyeznie a kulccsal."
        ),
    )


# --------------------------------------------------------------------------- #
# Section: Order Context (external data)                                      #
# --------------------------------------------------------------------------- #


# A `services.order_context._apply_field_rules` által támogatott `when` módok.
ALLOWED_FIELD_RULE_WHEN_VALUES: tuple[str, ...] = ("truthy", "not_null")

# Field-rule modifierek (a runtime külön-külön értékeli őket).
ALLOWED_FIELD_RULE_MODIFIERS: tuple[str, ...] = (
    "requires_field_not_null",
    "requires_field_lt_today",
    "session_guard_not",
)


class OrderContextConstraints(BaseModel):
    """Külső adat (OrderContext) integrációjának szabályai.

    A `services.order_context.OrderContext` a per-rendelés tényhalmaz; a
    `meta.order_context_mapping` deklaratívan írja le, melyik mező milyen
    érték esetén satisfy-jeli melyik kondíciót.

    A `known_external_fields` lista a `services.story_lint.KNOWN_OCM_FIELDS`-ből
    származik (single source of truth — drift detection regresszió-teszt).
    """

    model_config = ConfigDict(extra="forbid")

    known_external_fields: list[str] = Field(
        ...,
        description="Engedélyezett OrderContext mezők. Új mezőhöz a `services.order_context.OrderContext` BaseModel-t kell bővíteni + a `KNOWN_OCM_FIELDS` halmazt.",
    )
    proposed_external_fields: list[ProposedNewExternalField] = Field(
        default_factory=list,
        description=(
            "Job-scope, domain-specifikus extended pool — a Phase 1 blueprint "
            "`proposed_new_external_fields` listájából rétegezve a globális pool "
            "fölé. Ezek a mezők NINCSENEK a runtime `OrderContext`-ben, ezért a "
            "feltételek konverzációból / manuális extrakcióból kell hogy "
            "kielégüljenek a backend bővítéséig. A lint nem `warn()`-ol, "
            "csak `note()`-ot ad ezekre."
        ),
    )
    field_rule_when_modes: list[str] = Field(
        default_factory=lambda: list(ALLOWED_FIELD_RULE_WHEN_VALUES),
        description="A `when` mező megengedett értékei. Alternatíva: `when_value` (egzakt match) vagy `when_any_value` (lista membership).",
    )
    field_rule_value_match_keys: list[str] = Field(
        default_factory=lambda: ["when_value", "when_any_value"],
        description="Egzakt vagy lista-membership érték-match. `when` ezekkel kombinálható, de mindig kell legyen valamelyik trigger.",
    )
    field_rule_modifier_keys: list[str] = Field(
        default_factory=lambda: list(ALLOWED_FIELD_RULE_MODIFIERS),
        description=(
            "Opcionális modifier-ek. `requires_field_not_null`/`requires_field_lt_today` "
            "értéke a `KNOWN_OCM_FIELDS`-ből egy mező; `session_guard_not` egy kondíció ID, "
            "ami a session satisfied-listában megvédi a derive-elést."
        ),
    )
    required_computed_condition_keys: list[str] = Field(
        ...,
        description=(
            "A runtime ezekre a kulcsokra esik vissza a kulcsnévre, ha a "
            "`computed_condition_ids` mapping nem tartalmazza. A blueprint "
            "ezeket a kulcsokat KIOSZTHATJA saját kondíció ID-knak."
        ),
    )
    precedence_rules_form: str = Field(
        default=(
            "Lista, elemei {if_present: cond_id, suppress: cond_id} dict-ek. "
            "Ha az `if_present` kondíció a satisfied listában van, a `suppress` "
            "kondíció eltávolítódik. Tipikus eset: user által explicit állított "
            "tény elnyomja az automatikus derive-et."
        ),
    )


# --------------------------------------------------------------------------- #
# Section: Meta                                                               #
# --------------------------------------------------------------------------- #


class MetaConstraints(BaseModel):
    """`story.meta` szekció szabályai.

    Forrás: `services.story_lint.validate_meta` és a `RUNTIME_INT_KEYS` /
    `RUNTIME_STR_KEYS` konstansok.
    """

    model_config = ConfigDict(extra="forbid")

    required_fields: list[str] = Field(
        default_factory=lambda: ["id", "title", "startPageId", "defaultFallbackMessage"],
    )
    runtime_int_keys: list[str] = Field(..., description="`meta.runtime` int-típusú kulcsok.")
    runtime_str_keys: list[str] = Field(..., description="`meta.runtime` string-típusú kulcsok.")
    mock_today_format: str = Field(
        default="ISO 8601 dátum (YYYY-MM-DD). Bármi más → ERROR.",
    )
    reference_id_pattern_form: str = Field(
        default=(
            "Opcionális regex string. A `\\b{pattern}\\b` formában fordítódik le, "
            "így a pattern NEM tartalmazhat alternatív kötőjeleket vagy lookbehindokat."
        ),
    )
    condition_labels_form: str = Field(
        default=(
            "dict[str, str] — kondíció ID → emberi-olvasható label. UI-on és "
            "audit log-ban használt; nincs futás-szintű hatás."
        ),
    )


# --------------------------------------------------------------------------- #
# Root: ConstraintCatalog                                                     #
# --------------------------------------------------------------------------- #


class ConstraintCatalog(BaseModel):
    """A pipeline teljes constraint-snapshot-ja.

    Egy build_constraint_catalog() hívás után minden Phase ugyanazt a
    példányt látja (a Phase 2 prompt rendereli, a Phase 3 lint validálja
    az értékek konzisztenciáját).
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="1.0.0", description="Constraint catalog schema version.")
    routing: RoutingConstraints
    condition: ConditionConstraints
    step: StepConstraints
    page: PageConstraints
    order_context: OrderContextConstraints
    meta: MetaConstraints


# --------------------------------------------------------------------------- #
# Factory                                                                     #
# --------------------------------------------------------------------------- #


def build_constraint_catalog(
    *,
    proposed_external_fields: Iterable[ProposedNewExternalField] = (),
) -> ConstraintCatalog:
    """A katalógus a kódbeli konstansokból építkezik (single source of truth).

    Bármely kulcs hozzáadása a runtime / lint oldalon AUTOMATIKUSAN
    átkerül a katalógusba — nincs duplikáció. A regresszió-tesztek
    biztosítják, hogy a hozzáadás után sem törik a katalógus build-je.

    A `proposed_external_fields` egy opcionális, job-scope, domain-specifikus
    pool — tipikusan a `DomainBlueprint.proposed_new_external_fields` lista.
    A globális `KNOWN_OCM_FIELDS` ALAP, a domain-specifikus csak HOZZÁAD,
    soha nem felülír. A katalógus rendere (`render_catalog_for_prompt`)
    külön szekcióban listázza, és a Phase 3a lint a rétegelt poolt
    használja a `meta.order_context_mapping.field_rules` ellenőrzéséhez.
    A javaslat-listából deduplikálódnak azok a mezők, amelyek már a
    globális poolban vannak (sosem fordulhatna elő, de a Phase 1 modell
    elvileg javasolhat egy létezőt is — a katalógus normalizálva tartja).
    """
    proposed = list(proposed_external_fields)
    deduped: list[ProposedNewExternalField] = []
    seen_names: set[str] = set()
    for p in proposed:
        if p.field_name in KNOWN_OCM_FIELDS:
            continue
        if p.field_name in seen_names:
            continue
        seen_names.add(p.field_name)
        deduped.append(p)

    return ConstraintCatalog(
        routing=RoutingConstraints(),
        condition=ConditionConstraints(),
        step=StepConstraints(),
        page=PageConstraints(),
        order_context=OrderContextConstraints(
            known_external_fields=sorted(KNOWN_OCM_FIELDS),
            proposed_external_fields=deduped,
            required_computed_condition_keys=sorted(REQUIRED_COMPUTED_KEYS),
        ),
        meta=MetaConstraints(
            runtime_int_keys=sorted(RUNTIME_INT_KEYS),
            runtime_str_keys=sorted(RUNTIME_STR_KEYS),
        ),
    )


# --------------------------------------------------------------------------- #
# Prompt rendering                                                            #
# --------------------------------------------------------------------------- #


_INDENT = "  "


def _bullet_list(items: list[str], indent: str = _INDENT) -> str:
    return "\n".join(f"{indent}- {item}" for item in items)


def render_catalog_for_prompt(catalog: ConstraintCatalog) -> str:
    """Markdown render a Phase 2 generation prompt rendszer-üzenetébe.

    A rendszer-prompt elejére biggyesztendő — a modell minden node
    generálásakor látja ugyanezt a constraint-listát. A formátumot úgy
    tartottuk tömörre, hogy ne fogyassza fel a teljes context window-t.
    """
    routing = catalog.routing
    cond = catalog.condition
    step = catalog.step
    page = catalog.page
    oc = catalog.order_context
    meta = catalog.meta

    sections: list[str] = []

    sections.append(f"# Story-node generation constraints (catalog v{catalog.schema_version})\n")
    sections.append(
        "These rules are STRICT. The runtime and structural linter reject any "
        "deviation. If you cannot satisfy a rule, prefer a simpler node design.\n"
    )

    sections.append("## Routing")
    sections.append(f"- Logic: **{routing.logic_kind}** inside the `if` list. AND-only.")
    sections.append(f"- Negation (`!cond`) supported: **{routing.negation_supported}**.")
    sections.append(f"- Evaluation passes: **{routing.evaluation_passes}** (if-rules first, then default).")
    sections.append(f"- Default convention: {routing.default_convention}")
    sections.append("- Allowed rule forms (anything else → lint ERROR):")
    sections.append(_bullet_list(routing.allowed_rule_forms, indent=_INDENT * 2))
    sections.append(f"- `goto` targets: {routing.valid_goto_targets}")
    sections.append(
        f"- `inject_conditions` on rule supported: **{routing.inject_conditions_supported}** "
        "— matched rule injects these into the satisfied set for the next node."
    )
    sections.append("")

    sections.append("## Conditions")
    sections.append(f"- ID format: {cond.id_format}")
    sections.append(f"- ID length: {cond.id_min_length}–{cond.id_max_length} characters.")
    sections.append(f"- Required fields: {cond.required_fields}")
    sections.append(f"- Optional fields: {cond.optional_fields}")
    sections.append(f"- `validation_pattern_ref`: {cond.validation_pattern_ref_rule}")
    sections.append("- A condition ID may be declared / injected at:")
    sections.append(_bullet_list(cond.declaration_scopes, indent=_INDENT * 2))
    sections.append("")

    sections.append("## Steps")
    sections.append(f"- Allowed `step.type`: {step.allowed_step_types}")
    sections.append(f"- Required: {step.required_fields}")
    sections.append(f"- Optional string fields: {step.optional_string_fields}")
    sections.append(f"- Boolean flags (only `true`/`false`): {step.boolean_flag_fields}")
    sections.append(
        f"- Closing-step required bundle: when `is_closing: true`, ALL of "
        f"these MUST be set on the same step: "
        f"`is_terminal: true`, `permit_goto_auto_ack: true`, "
        f"`silent_on_matched_goto: true`, and a non-empty `fallback_reason` "
        f"string. The runtime relies on this bundle to close the session "
        f"safely. Lint rejects any closing step missing one of these."
    )
    sections.append(f"- `branches`: {step.branches_form}")
    sections.append(f"- `internal_conditions`: {step.internal_conditions_form}")
    sections.append(f"- `image_conditions`: {step.image_conditions_form}")
    sections.append(f"- `id` uniqueness: {step.step_id_uniqueness}")
    sections.append("")

    sections.append("## Pages")
    sections.append(f"- Allowed `page.type`: {page.allowed_page_types}")
    sections.append(f"- AI page required: {page.ai_required_fields}")
    sections.append(f"- AI page recommended (warning if missing): {page.ai_recommended_fields}")
    sections.append(f"- End page required: {page.end_required_fields}")
    sections.append(f"- `knowledge` subfields: {page.knowledge_subfields}")
    sections.append(f"- ID uniqueness: {page.page_id_uniqueness}")
    sections.append("")

    sections.append("## External data (OrderContext)")
    sections.append(
        f"- Allowed external fields, GLOBAL POOL ({len(oc.known_external_fields)}): "
        f"{oc.known_external_fields}"
    )
    sections.append(
        "  These are wired into the runtime `OrderContext`. Reference any of "
        "these freely in `meta.order_context_mapping.field_rules`."
    )
    if oc.proposed_external_fields:
        sections.append(
            f"- Domain-specific extensions for THIS job, "
            f"BACKEND IMPLEMENTATION PENDING ({len(oc.proposed_external_fields)}):"
        )
        for p in oc.proposed_external_fields:
            sections.append(
                f"{_INDENT * 2}- `{p.field_name}` ({p.suggested_type}): {p.description}"
            )
        sections.append(
            "  These fields are NOT yet in the runtime `OrderContext`. The "
            "runtime cannot derive them automatically; any condition that "
            "references them must be set via conversation / manual extraction "
            "(e.g. an `internal_conditions` ask step) until the backend is "
            "extended. You MAY reference them in `field_rules` — the lint "
            "marks such usage as `info` (`domain-specific, backend "
            "implementation pending`), not as a warning or error."
        )
    sections.append(f"- `field_rules.when` modes: {oc.field_rule_when_modes}")
    sections.append(f"- Value-match keys: {oc.field_rule_value_match_keys}")
    sections.append(f"- Modifier keys: {oc.field_rule_modifier_keys}")
    sections.append(
        f"- Required computed condition keys: {oc.required_computed_condition_keys}"
    )
    sections.append(f"- Precedence rules: {oc.precedence_rules_form}")
    sections.append("")

    sections.append("## Meta")
    sections.append(f"- Required: {meta.required_fields}")
    sections.append(f"- `runtime` int keys: {meta.runtime_int_keys}")
    sections.append(f"- `runtime` string keys: {meta.runtime_str_keys}")
    sections.append(f"- `mock_today`: {meta.mock_today_format}")
    sections.append(f"- `reference_id_pattern`: {meta.reference_id_pattern_form}")
    sections.append(f"- `condition_labels`: {meta.condition_labels_form}")

    return "\n".join(sections)


__all__ = [
    # Section models
    "RoutingConstraints",
    "ConditionConstraints",
    "StepConstraints",
    "PageConstraints",
    "OrderContextConstraints",
    "MetaConstraints",
    "ConstraintCatalog",
    # Constants
    "ALLOWED_STEP_TYPES",
    "KNOWN_STEP_BOOL_FLAGS",
    "ALLOWED_PAGE_TYPES",
    "ALLOWED_FIELD_RULE_WHEN_VALUES",
    "ALLOWED_FIELD_RULE_MODIFIERS",
    # API
    "build_constraint_catalog",
    "render_catalog_for_prompt",
]

"""Pytest cases for `services.onboarding.constraints`.

Lefedett területek:

1. **Drift detection** — a katalógus értékei a `services.story_lint`
   modul-szintű konstansaiból táplálkoznak. Ha valaki egy mezőt hozzáad
   a `KNOWN_OCM_FIELDS` halmazhoz vagy a `RUNTIME_INT_KEYS`-hez de
   elfelejti frissíteni a katalógus prompt-renderét, ez a teszt elbukik.
2. **Idempotencia** — `build_constraint_catalog()` ismételt hívása
   ugyanazt az értéket adja (regression a side-effect injection ellen).
3. **Round-trip** — `model_dump()` → `model_validate()` veszteségmentes.
4. **`extra="forbid"`** — minden szekció rejection-t ad ismeretlen mezőre.
5. **Render formátum** — `render_catalog_for_prompt()`:
   - tartalmazza mind a 6 szekció fejlécét,
   - tartalmazza a `KNOWN_OCM_FIELDS` minden mezőjét,
   - tartalmazza a 4 step-típust és a 8 boolean flag-et,
   - markdown-szerűen formázott (## fejlécek).
6. **Routing szabályok integritása** — a katalógus rule_form példák
   párba állnak a `validate_routing` által elfogadott formákkal.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from services.story_lint import (
    KNOWN_OCM_FIELDS,
    REQUIRED_COMPUTED_KEYS,
    RUNTIME_INT_KEYS,
    RUNTIME_STR_KEYS,
)
from services.onboarding.constraints import (
    ALLOWED_FIELD_RULE_MODIFIERS,
    ALLOWED_FIELD_RULE_WHEN_VALUES,
    ALLOWED_PAGE_TYPES,
    ALLOWED_STEP_TYPES,
    ConditionConstraints,
    ConstraintCatalog,
    KNOWN_STEP_BOOL_FLAGS,
    MetaConstraints,
    OrderContextConstraints,
    PageConstraints,
    RoutingConstraints,
    StepConstraints,
    build_constraint_catalog,
    render_catalog_for_prompt,
)
from services.onboarding.contracts import ProposedNewExternalField


# --------------------------------------------------------------------------- #
# 1. Drift detection                                                          #
# --------------------------------------------------------------------------- #


def test_external_fields_match_known_ocm_fields() -> None:
    cat = build_constraint_catalog()
    assert set(cat.order_context.known_external_fields) == set(KNOWN_OCM_FIELDS)


def test_required_computed_condition_keys_match() -> None:
    cat = build_constraint_catalog()
    assert set(cat.order_context.required_computed_condition_keys) == set(
        REQUIRED_COMPUTED_KEYS
    )


def test_runtime_int_keys_match() -> None:
    cat = build_constraint_catalog()
    assert set(cat.meta.runtime_int_keys) == set(RUNTIME_INT_KEYS)


def test_runtime_str_keys_match() -> None:
    cat = build_constraint_catalog()
    assert set(cat.meta.runtime_str_keys) == set(RUNTIME_STR_KEYS)


def test_step_constants_match_module_constants() -> None:
    cat = build_constraint_catalog()
    assert tuple(cat.step.allowed_step_types) == ALLOWED_STEP_TYPES
    assert tuple(cat.step.boolean_flag_fields) == KNOWN_STEP_BOOL_FLAGS


def test_page_constants_match_module_constants() -> None:
    cat = build_constraint_catalog()
    assert tuple(cat.page.allowed_page_types) == ALLOWED_PAGE_TYPES


def test_field_rule_constants_match_module_constants() -> None:
    cat = build_constraint_catalog()
    assert tuple(cat.order_context.field_rule_when_modes) == ALLOWED_FIELD_RULE_WHEN_VALUES
    assert tuple(cat.order_context.field_rule_modifier_keys) == ALLOWED_FIELD_RULE_MODIFIERS


# --------------------------------------------------------------------------- #
# 2. Idempotencia                                                             #
# --------------------------------------------------------------------------- #


def test_build_catalog_is_idempotent() -> None:
    a = build_constraint_catalog()
    b = build_constraint_catalog()
    assert a == b
    assert a.model_dump() == b.model_dump()


# --------------------------------------------------------------------------- #
# 3. Round-trip                                                               #
# --------------------------------------------------------------------------- #


def test_catalog_round_trip() -> None:
    cat = build_constraint_catalog()
    restored = ConstraintCatalog.model_validate(cat.model_dump())
    assert restored == cat


# --------------------------------------------------------------------------- #
# 4. extra="forbid"                                                           #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "model_cls",
    [
        RoutingConstraints,
        ConditionConstraints,
        StepConstraints,
        PageConstraints,
        OrderContextConstraints,
        MetaConstraints,
        ConstraintCatalog,
    ],
)
def test_extra_forbid_rejects_unknown_field(model_cls):
    base_cat = build_constraint_catalog()
    if model_cls is ConstraintCatalog:
        payload = base_cat.model_dump()
    elif model_cls is OrderContextConstraints:
        payload = base_cat.order_context.model_dump()
    elif model_cls is MetaConstraints:
        payload = base_cat.meta.model_dump()
    else:
        section_name = {
            RoutingConstraints: "routing",
            ConditionConstraints: "condition",
            StepConstraints: "step",
            PageConstraints: "page",
        }[model_cls]
        payload = getattr(base_cat, section_name).model_dump()

    payload["hallucinated_field"] = "wat"
    with pytest.raises(ValidationError):
        model_cls.model_validate(payload)


# --------------------------------------------------------------------------- #
# 5. Render formátum                                                          #
# --------------------------------------------------------------------------- #


def test_render_includes_all_section_headers() -> None:
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    for header in (
        "## Routing",
        "## Conditions",
        "## Steps",
        "## Pages",
        "## External data (OrderContext)",
        "## Meta",
    ):
        assert header in rendered, f"Missing section: {header}"


def test_render_includes_every_known_external_field() -> None:
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    for field in KNOWN_OCM_FIELDS:
        assert field in rendered, f"OCM field missing from render: {field}"


def test_render_includes_every_step_type_and_flag() -> None:
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    for st in ALLOWED_STEP_TYPES:
        assert f"'{st}'" in rendered or f"\"{st}\"" in rendered, st
    for flag in KNOWN_STEP_BOOL_FLAGS:
        assert flag in rendered, flag


def test_render_includes_required_computed_condition_keys() -> None:
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    for key in REQUIRED_COMPUTED_KEYS:
        assert key in rendered, f"Computed condition key missing: {key}"


def test_render_starts_with_versioned_header() -> None:
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    assert rendered.startswith(
        f"# Story-node generation constraints (catalog v{cat.schema_version})"
    )


# --------------------------------------------------------------------------- #
# 6. Routing szabályok integritása                                            #
# --------------------------------------------------------------------------- #


def test_routing_logic_is_and_only_and_no_negation() -> None:
    """Regresszió: ha a runtime egyszer mégis támogatna OR-t vagy negációt,
    a katalógusnak frissülnie KELL — különben a Phase 2 prompt félrevezeti
    az AI-t. Ez a teszt addig nem mehet zöldre, amíg a katalógus és a
    runtime szinkronban van."""
    cat = build_constraint_catalog()
    assert cat.routing.logic_kind == "AND_only"
    assert cat.routing.negation_supported is False
    assert cat.routing.evaluation_passes == 2


def test_routing_allowed_forms_include_default_and_if_form() -> None:
    cat = build_constraint_catalog()
    forms_str = " ".join(cat.routing.allowed_rule_forms)
    assert '"if"' in forms_str
    assert '"goto"' in forms_str
    assert '"default"' in forms_str
    assert '"inject_conditions"' in forms_str


# --------------------------------------------------------------------------- #
# 7. Domain-specific extended pool (proposed_external_fields)                 #
# --------------------------------------------------------------------------- #
#
# A Phase 1 `DomainBlueprint.proposed_new_external_fields` listája egy
# job-scope, domain-specifikus pool, ami rétegelve a globális
# `KNOWN_OCM_FIELDS` fölé. A `build_constraint_catalog(proposed_external_fields=...)`
# beengedi, és a render markdown-jában külön szekcióban listázza
# "BACKEND IMPLEMENTATION PENDING" markerrel.


def _sample_proposed() -> list[ProposedNewExternalField]:
    return [
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
    ]


def test_default_catalog_has_no_proposed_fields() -> None:
    cat = build_constraint_catalog()
    assert cat.order_context.proposed_external_fields == []


def test_catalog_with_proposed_fields_round_trips() -> None:
    cat = build_constraint_catalog(proposed_external_fields=_sample_proposed())
    restored = ConstraintCatalog.model_validate(cat.model_dump())
    assert restored == cat
    assert {p.field_name for p in cat.order_context.proposed_external_fields} == {
        "device_model",
        "issue_start_date",
    }


def test_proposed_fields_with_global_pool_collision_are_dropped() -> None:
    # Ha a Phase 1 modell véletlenül a globális poolban szereplő mezőt is
    # propozálná (pl. `purchase_date`), a katalógus a duplikációt eldobja.
    proposals = list(_sample_proposed()) + [
        ProposedNewExternalField(
            field_name="purchase_date",  # globális poolban van
            description="Already in the runtime pool.",
            rationale="Should be deduplicated by the catalog builder.",
            suggested_type="date",
        ),
    ]
    cat = build_constraint_catalog(proposed_external_fields=proposals)
    names = {p.field_name for p in cat.order_context.proposed_external_fields}
    assert "purchase_date" not in names
    assert names == {"device_model", "issue_start_date"}


def test_proposed_fields_dedupe_within_input_list() -> None:
    proposals = list(_sample_proposed()) + [
        ProposedNewExternalField(
            field_name="device_model",  # ismétlés
            description="Duplicate proposal — different rationale.",
            rationale="Should be deduplicated; first occurrence wins.",
            suggested_type="str",
        ),
    ]
    cat = build_constraint_catalog(proposed_external_fields=proposals)
    occurrences = [
        p for p in cat.order_context.proposed_external_fields
        if p.field_name == "device_model"
    ]
    assert len(occurrences) == 1


def test_render_includes_proposed_fields_section() -> None:
    cat = build_constraint_catalog(proposed_external_fields=_sample_proposed())
    rendered = render_catalog_for_prompt(cat)
    # A szekció címke + minden mező nevének és típusának benne kell lennie.
    assert "Domain-specific extensions" in rendered
    assert "BACKEND IMPLEMENTATION PENDING" in rendered
    assert "device_model" in rendered and "(str)" in rendered
    assert "issue_start_date" in rendered and "(date)" in rendered
    # A markert a Phase 2 prompt felismerheti, hogy hogyan kezelje:
    assert "domain-specific" in rendered.lower()


def test_render_omits_proposed_section_when_empty() -> None:
    # Default (no proposed fields): a "Domain-specific" szekció ne
    # jelenjen meg, hogy ne zavarja a prompt-ot.
    cat = build_constraint_catalog()
    rendered = render_catalog_for_prompt(cat)
    assert "Domain-specific extensions" not in rendered
    assert "BACKEND IMPLEMENTATION PENDING" not in rendered


def test_render_global_pool_prefix_changed_to_global_pool_label() -> None:
    # A globális pool listázás label-je explicit "GLOBAL POOL" — segít a
    # modellnek megkülönböztetni a 2 réteget.
    cat = build_constraint_catalog(proposed_external_fields=_sample_proposed())
    rendered = render_catalog_for_prompt(cat)
    assert "GLOBAL POOL" in rendered


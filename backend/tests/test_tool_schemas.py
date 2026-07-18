"""Pytest cases for `services.onboarding.tool_schemas`.

Lefedett területek:

1. **Tool shape (3 db builder)** — minden builder visszatér egy
   `{name, description, input_schema}` szótárral, ahol az `input_schema`
   `additionalProperties: False` legfelső szinten.
2. **Recursive `additionalProperties` check** — minden beágyazott
   `type: "object"` schemán is `additionalProperties: False` van. Ez
   blokkolja a hallucinált kulcsokat az AI tool-call boundary-n.
3. **Drift detection** — a katalógus enum-listái megegyeznek a tool
   schema enum-jaival (`field_name`, `vendor_policy`, `step.type`,
   `priority`, `severity`, `kind`, `verdict`, ...).
4. **jsonschema validate sample valid payload** — egy reprezentatív
   minta-payload átmegy a `jsonschema.validate()` ellenőrzésen.
5. **jsonschema reject invalid payload** — extra mező, rossz enum, hiányzó
   required mező rejection.
6. **Pydantic round-trip a Phase 1 payloadon** — egy `extract_blueprint`
   tool-payload validál a `DomainBlueprint` Pydantic modellel is.
"""
from __future__ import annotations

from typing import Any

import jsonschema
import pytest

from services.onboarding.constraints import build_constraint_catalog
from services.onboarding.contracts import (
    DomainBlueprint,
    SemanticAuditFinding,
    SemanticAuditResult,
    SemanticIssueKind,
)
from services.onboarding.tool_schemas import (
    build_extract_blueprint_tool,
    build_generate_node_tool,
    build_report_semantic_issues_tool,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


@pytest.fixture(scope="module")
def catalog():
    return build_constraint_catalog()


@pytest.fixture(scope="module")
def extract_tool(catalog):
    return build_extract_blueprint_tool(catalog)


@pytest.fixture(scope="module")
def generate_tool(catalog):
    return build_generate_node_tool(catalog)


@pytest.fixture(scope="module")
def report_tool(catalog):
    return build_report_semantic_issues_tool(catalog)


# --------------------------------------------------------------------------- #
# 1. Tool shape                                                               #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "fixture_name, expected_name",
    [
        ("extract_tool", "extract_blueprint"),
        ("generate_tool", "generate_node"),
        ("report_tool", "report_semantic_issues"),
    ],
)
def test_tool_top_level_shape(request, fixture_name, expected_name):
    tool = request.getfixturevalue(fixture_name)
    assert set(tool.keys()) == {"name", "description", "input_schema"}
    assert tool["name"] == expected_name
    assert isinstance(tool["description"], str) and len(tool["description"]) > 30
    assert tool["input_schema"]["type"] == "object"
    assert tool["input_schema"].get("additionalProperties") is False


# --------------------------------------------------------------------------- #
# 2. Recursive additionalProperties check                                     #
# --------------------------------------------------------------------------- #


def _walk_object_schemas(schema: Any, path: str = "$"):
    """Yield (path, schema) for every node where schema['type'] == 'object'."""
    if isinstance(schema, dict):
        if schema.get("type") == "object":
            yield path, schema
        for k, v in schema.items():
            yield from _walk_object_schemas(v, f"{path}.{k}")
    elif isinstance(schema, list):
        for i, item in enumerate(schema):
            yield from _walk_object_schemas(item, f"{path}[{i}]")


@pytest.mark.parametrize(
    "fixture_name",
    ["extract_tool", "generate_tool", "report_tool"],
)
def test_every_nested_object_schema_forbids_additional_properties(
    request, fixture_name
):
    tool = request.getfixturevalue(fixture_name)
    violations: list[str] = []
    for path, sub in _walk_object_schemas(tool["input_schema"]):
        if sub.get("additionalProperties") is not False:
            violations.append(path)
    assert violations == [], (
        f"Schemák nem zárják le additionalProperties-t: {violations}"
    )


# --------------------------------------------------------------------------- #
# 3. Drift detection                                                          #
# --------------------------------------------------------------------------- #


def test_extract_field_name_enum_matches_catalog(extract_tool, catalog):
    field_name_schema = (
        extract_tool["input_schema"]["properties"]["external_data_deps"]
        ["items"]["properties"]["field_name"]
    )
    assert set(field_name_schema["enum"]) == set(
        catalog.order_context.known_external_fields
    )


def test_extract_vendor_policy_enum(extract_tool):
    schema = extract_tool["input_schema"]["properties"]["vendor_policy"]
    assert schema["enum"] == ["generic_blended", "specific", "mock"]


def test_generate_step_type_enum_matches_catalog(generate_tool, catalog):
    step_type_schema = (
        generate_tool["input_schema"]["properties"]["steps"]
        ["items"]["properties"]["type"]
    )
    assert step_type_schema["enum"] == list(catalog.step.allowed_step_types)


def test_generate_step_includes_all_boolean_flags(generate_tool, catalog):
    step_props = (
        generate_tool["input_schema"]["properties"]["steps"]
        ["items"]["properties"]
    )
    for flag in catalog.step.boolean_flag_fields:
        assert flag in step_props, f"Missing boolean flag in step schema: {flag}"
        assert step_props[flag] == {"type": "boolean"}


def test_generate_page_type_enum_is_ai_only(generate_tool):
    # A Phase 2 csak AI-page-eket generál; az end-page-eket a blueprint
    # `end_pages` listájából a pipeline scaffoldolja deterministically.
    schema = generate_tool["input_schema"]["properties"]["type"]
    assert schema["enum"] == ["ai"]


def test_report_kind_enum_matches_pydantic_literal(report_tool):
    kind_schema = (
        report_tool["input_schema"]["properties"]["findings"]
        ["items"]["properties"]["kind"]
    )
    # A Pydantic Literal forrás megegyezik a tool enum-mal.
    pydantic_args = SemanticIssueKind.__args__  # type: ignore[attr-defined]
    assert set(kind_schema["enum"]) == set(pydantic_args)


def test_report_verdict_enum(report_tool):
    schema = report_tool["input_schema"]["properties"]["verdict"]
    assert set(schema["enum"]) == {
        "clean",
        "warnings_only",
        "needs_human_review",
        "hard_fail",
    }


def test_report_severity_enum(report_tool):
    schema = (
        report_tool["input_schema"]["properties"]["findings"]
        ["items"]["properties"]["severity"]
    )
    assert schema["enum"] == ["info", "warning", "error"]


# --------------------------------------------------------------------------- #
# 4. jsonschema validate sample valid payloads                                #
# --------------------------------------------------------------------------- #


def _valid_blueprint_payload(catalog) -> dict[str, Any]:
    return {
        "locale": "hu",
        "domain_name": "Test domain",
        "vendor_policy": "generic_blended",
        "vendor_name": None,
        "summary": (
            "Ez egy teszt-domain a Phase 1 tool schema validálásához. "
            "Minimum 80 karakter — ezért tölteni kell egy rövid leírással "
            "a release-ready validációhoz."
        ),
        "nodes": [
            {
                "proposed_id": "intake-node",
                "domain_intent": "Az ügyfél kezdeti megkeresését kezeli.",
                "scope_keywords": ["intake"],
                "triggering_examples": [
                    "Szia, segítségre van szükségem",
                    "Új ügyem van",
                ],
                "required_conditions": ["has_order_id"],
                "optional_conditions": [],
                "closing_step_required": False,
                "suggested_end_pages": [],
                "references_research_section": [],
            }
        ],
        "conditions": [
            {
                "id": "has_order_id",
                "description_seed": "Az ügyfél megadta a rendelési azonosítót.",
                "needs_validation_pattern": True,
                "cross_node_handoff_targets": [],
                "derived_from_external_data": False,
                "derived_external_field": None,
            }
        ],
        "routing_sketches": [],
        "external_data_deps": [
            {
                "field_name": catalog.order_context.known_external_fields[0],
                "derived_condition_id": "has_some_field",
                "rule_kind": "not_null",
                "when_value": None,
                "when_any_value": None,
                "needs_modifier": None,
                "modifier_field": None,
            }
        ],
        "proposed_new_external_fields": [],
        "end_pages": [],
        "notes": [],
    }


def _valid_generate_node_payload() -> dict[str, Any]:
    return {
        "id": "intake-node",
        "type": "ai",
        "fallback_message": "Bocs, nem értettem.",
        "knowledge": {
            "description": "Az intake node az új ügyek belépési pontja.",
            "scope": "Új ügy felvétele, kezdeti azonosítás.",
            "examples": ["Szia, új ügyem van", "Bejelentenék egy hibát"],
        },
        "conditions": [
            {
                "id": "user_provided_topic",
                "description": "Az ügyfél megadta a téma típusát.",
                "required": True,
            }
        ],
        "routing": [
            {"if": ["user_provided_topic"], "goto": "topic-router"},
            {"default": "ask"},
        ],
        "steps": [
            {
                "id": "ask_topic",
                "type": "prompt",
                "goal": "Kérdezd meg a témát.",
            }
        ],
    }


def _valid_report_payload() -> dict[str, Any]:
    return {
        "findings": [
            {
                "kind": "routing_logic",
                "severity": "warning",
                "node_id": "intake-node",
                "description": "A routing nem kezeli a 'tracking ismeretlen' esetet.",
                "suggested_fix": "Adj hozzá egy default → 'ask' szabályt.",
                "references_research_section": [],
            }
        ],
        "verdict": "warnings_only",
        "summary_for_human": "Egy kisebb routing-rés kezelendő.",
    }


def test_extract_valid_payload_passes_jsonschema(extract_tool, catalog):
    payload = _valid_blueprint_payload(catalog)
    jsonschema.validate(payload, extract_tool["input_schema"])


def test_generate_valid_payload_passes_jsonschema(generate_tool):
    payload = _valid_generate_node_payload()
    jsonschema.validate(payload, generate_tool["input_schema"])


def test_report_valid_payload_passes_jsonschema(report_tool):
    payload = _valid_report_payload()
    jsonschema.validate(payload, report_tool["input_schema"])


# --------------------------------------------------------------------------- #
# 5. jsonschema reject invalid payloads                                       #
# --------------------------------------------------------------------------- #


def test_extract_rejects_unknown_field_name_enum(extract_tool, catalog):
    payload = _valid_blueprint_payload(catalog)
    payload["external_data_deps"][0]["field_name"] = "made_up_field_xyz"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, extract_tool["input_schema"])


def test_extract_rejects_extra_top_level_key(extract_tool, catalog):
    payload = _valid_blueprint_payload(catalog)
    payload["hallucinated_extra"] = "wat"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, extract_tool["input_schema"])


def test_generate_rejects_invalid_routing_form(generate_tool):
    payload = _valid_generate_node_payload()
    # Sem `{if, goto}`, sem `{default}` — `oneOf` rejection.
    payload["routing"] = [{"unknown_key": "wat", "goto": "foo"}]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_unknown_step_type(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["type"] = "made_up_type"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_missing_knowledge(generate_tool):
    payload = _valid_generate_node_payload()
    del payload["knowledge"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_report_rejects_unknown_kind(report_tool):
    payload = _valid_report_payload()
    payload["findings"][0]["kind"] = "made_up_kind"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, report_tool["input_schema"])


def test_report_rejects_unknown_verdict(report_tool):
    payload = _valid_report_payload()
    payload["verdict"] = "definitely_not_a_verdict"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, report_tool["input_schema"])


# --------------------------------------------------------------------------- #
# 6. Pydantic round-trip                                                      #
# --------------------------------------------------------------------------- #


def test_extract_payload_validates_against_pydantic(extract_tool, catalog):
    payload = _valid_blueprint_payload(catalog)
    jsonschema.validate(payload, extract_tool["input_schema"])
    blueprint = DomainBlueprint.model_validate(payload)
    assert blueprint.domain_name == "Test domain"
    assert len(blueprint.nodes) == 1
    assert blueprint.nodes[0].proposed_id == "intake-node"


def test_report_payload_validates_against_pydantic(report_tool):
    payload = _valid_report_payload()
    jsonschema.validate(payload, report_tool["input_schema"])
    audit = SemanticAuditResult(
        findings=[SemanticAuditFinding(**f) for f in payload["findings"]],
        verdict=payload["verdict"],
        audit_model="claude-opus-4-5",
        audit_started_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        audit_finished_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        summary_for_human=payload.get("summary_for_human"),
    )
    assert audit.findings[0].kind == "routing_logic"
    assert audit.verdict == "warnings_only"


# --------------------------------------------------------------------------- #
# 7. Phase 3 step extensions: reply_rules + internal_conditions új flag-ek    #
# --------------------------------------------------------------------------- #
#
# A Phase 3c (reply_rules generator) és Phase 3b/B (internal_conditions
# dict-feltöltés) új mezőket vezet be a step + condition schemába:
#
# - step.reply_rules: 1-6 string, 8-240 char/elem (LLM system-prompt blokk)
# - internal_conditions[i].auto_satisfy_after_reply: bool (runtime-flag)
# - internal_conditions[i].do_not_reask_hint: 1-300 char string
#
# A schema ezeket explicit-en engedélyezi és tipikus hibákra rejection-t ad.


def test_generate_accepts_step_reply_rules(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["reply_rules"] = [
        "Csak a téma típusát kérd — semmi mást.",
        "Ne magyarázd el a következő lépéseket.",
    ]
    jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_reply_rules_non_list(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["reply_rules"] = "single string not a list"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_reply_rules_too_short_item(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["reply_rules"] = ["short"]  # 5 char < 8
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_reply_rules_too_long_item(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["reply_rules"] = ["x" * 241]  # 241 char > 240
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_reply_rules_too_many_items(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["reply_rules"] = [
        "Item one — minimum eight chars.",
        "Item two — minimum eight chars.",
        "Item three — minimum eight chars.",
        "Item four — minimum eight chars.",
        "Item five — minimum eight chars.",
        "Item six — minimum eight chars.",
        "Item seven — minimum eight chars.",  # 7 > maxItems 6
    ]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_accepts_internal_condition_auto_satisfy_and_hint(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "A felhasználó megadta a témát.",
            "do_not_reask_if_satisfied": True,
            "auto_satisfy_after_reply": False,
            "do_not_reask_hint": "Ha az ügyfél már említette a témát, ne kérdezd újra.",
        }
    ]
    jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_internal_condition_non_bool_auto_satisfy(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "A felhasználó megadta a témát.",
            "auto_satisfy_after_reply": "yes",
        }
    ]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_internal_condition_empty_hint(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "A felhasználó megadta a témát.",
            "do_not_reask_hint": "",
        }
    ]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_rejects_internal_condition_hint_too_long(generate_tool):
    payload = _valid_generate_node_payload()
    payload["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "A felhasználó megadta a témát.",
            "do_not_reask_hint": "x" * 301,  # 301 > 300
        }
    ]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, generate_tool["input_schema"])


def test_generate_accepts_page_condition_auto_satisfy_and_hint(generate_tool):
    payload = _valid_generate_node_payload()
    payload["conditions"][0]["auto_satisfy_after_reply"] = True
    payload["conditions"][0]["do_not_reask_hint"] = (
        "Ha az ügyfél már elmondta — ne ismételd vissza."
    )
    jsonschema.validate(payload, generate_tool["input_schema"])


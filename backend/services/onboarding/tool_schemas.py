"""Anthropic tool input_schemas for the onboarding pipeline.

Három builder, mindegyik az immutable `ConstraintCatalog`-gal paraméterezett:

- `build_extract_blueprint_tool(catalog)` — Phase 1.
  Bemenete: kutatási anyag (rendszer-prompt + user-szöveg).
  Output schema: `DomainBlueprint`.

- `build_generate_node_tool(catalog)` — Phase 2.
  Bemenete: `GenerationContext` (a blueprint + accepted nodes pool).
  Output schema: egy AI-page dict (story-page séma, lint-kompatibilis).

- `build_report_semantic_issues_tool(catalog)` — Phase 3b.
  Bemenete: a teljes összerakott story (Phase 2 + Phase 3a lint kész).
  Output schema: `SemanticAuditResult`.

Tervezési alapelvek:

1. A Pydantic kontraktok (`services.onboarding.contracts`) második védvonal;
   a JSON Schema az AI-határon az elsődleges védelem.
2. Minden beágyazott objektum `additionalProperties: False` — nincs
   hallucinált kulcs.
3. Az enum-listák a constraint katalógusból jönnek (single source of truth).
   A regresszió-tesztek drift detection-t adnak.
4. A schemas tisztán adat — nincs side-effect, nincs I/O.
5. A builderek Anthropic-formátumú dict-et adnak vissza:
   `{"name": str, "description": str, "input_schema": dict}`.
"""

from __future__ import annotations

from typing import Any

from services.onboarding.constraints import ConstraintCatalog


# --------------------------------------------------------------------------- #
# Helper: shared subschemas                                                   #
# --------------------------------------------------------------------------- #


_NON_EMPTY_STRING: dict[str, Any] = {"type": "string", "minLength": 1}

_PAGE_ID_PATTERN = "^[a-z][a-z0-9-]+$"
_CONDITION_ID_PATTERN = "^[a-z][a-z0-9_]+$"
_STEP_ID_PATTERN = "^[a-z][a-z0-9_-]+$"


def _condition_id_string() -> dict[str, Any]:
    return {
        "type": "string",
        "pattern": _CONDITION_ID_PATTERN,
        "minLength": 2,
        "maxLength": 64,
    }


def _page_id_string() -> dict[str, Any]:
    return {
        "type": "string",
        "pattern": _PAGE_ID_PATTERN,
        "minLength": 2,
        "maxLength": 64,
    }


def _step_id_string() -> dict[str, Any]:
    return {
        "type": "string",
        "pattern": _STEP_ID_PATTERN,
        "minLength": 2,
        "maxLength": 64,
    }


# --------------------------------------------------------------------------- #
# Phase 1 — extract_blueprint                                                 #
# --------------------------------------------------------------------------- #


def build_extract_blueprint_tool(catalog: ConstraintCatalog) -> dict[str, Any]:
    """Phase 1 tool: kutatási anyagból DomainBlueprint kinyerése.

    A schema szigorúbb, mint a Pydantic `DomainBlueprint` (additionalProperties:
    False, minLength korlátok, regex pattern-ek). A `field_name` enum a
    `catalog.order_context.known_external_fields`-ből származik (single source
    of truth).
    """
    known_fields = list(catalog.order_context.known_external_fields)

    return {
        "name": "extract_blueprint",
        "description": (
            "Extract a structured DomainBlueprint from the research material. "
            "The blueprint must contain node candidates, condition candidates, "
            "external data dependencies (only from the allowed field pool), "
            "routing sketches, and end-page specifications. Do NOT generate full "
            "node definitions — only structural candidates that the next phase "
            "will expand."
        ),
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "locale",
                "domain_name",
                "vendor_policy",
                "summary",
                "nodes",
                "conditions",
                "routing_sketches",
                "external_data_deps",
                "proposed_new_external_fields",
                "end_pages",
                "notes",
            ],
            "properties": {
                "locale": {"type": "string", "minLength": 2, "maxLength": 5},
                "domain_name": {"type": "string", "minLength": 3},
                "vendor_policy": {
                    "type": "string",
                    "enum": ["generic_blended", "specific", "mock"],
                },
                "vendor_name": {"type": ["string", "null"]},
                "summary": {"type": "string", "minLength": 80},
                "nodes": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "proposed_id",
                            "domain_intent",
                            "scope_keywords",
                            "triggering_examples",
                            "required_conditions",
                            "optional_conditions",
                            "closing_step_required",
                            "suggested_end_pages",
                            "references_research_section",
                        ],
                        "properties": {
                            "proposed_id": _page_id_string(),
                            "domain_intent": {"type": "string", "minLength": 20},
                            "scope_keywords": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "triggering_examples": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 10,
                                "items": {"type": "string", "minLength": 4},
                            },
                            "required_conditions": {
                                "type": "array",
                                "items": _condition_id_string(),
                            },
                            "optional_conditions": {
                                "type": "array",
                                "items": _condition_id_string(),
                            },
                            "closing_step_required": {"type": "boolean"},
                            "suggested_end_pages": {
                                "type": "array",
                                "items": _page_id_string(),
                            },
                            "references_research_section": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
                "conditions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "id",
                            "description_seed",
                            "needs_validation_pattern",
                            "cross_node_handoff_targets",
                            "derived_from_external_data",
                        ],
                        "properties": {
                            "id": _condition_id_string(),
                            "description_seed": {"type": "string", "minLength": 10},
                            "needs_validation_pattern": {"type": "boolean"},
                            "cross_node_handoff_targets": {
                                "type": "array",
                                "items": _page_id_string(),
                            },
                            "derived_from_external_data": {"type": "boolean"},
                            "derived_external_field": {"type": ["string", "null"]},
                        },
                    },
                },
                "routing_sketches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["from_node", "branches", "fallback_target"],
                        "properties": {
                            "from_node": _page_id_string(),
                            "branches": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["if", "goto"],
                                    "properties": {
                                        "if": {
                                            "type": "array",
                                            "items": _condition_id_string(),
                                        },
                                        "goto": {"type": "string", "minLength": 2},
                                    },
                                },
                            },
                            "fallback_target": {"type": "string", "minLength": 2},
                        },
                    },
                },
                "external_data_deps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["field_name", "derived_condition_id", "rule_kind"],
                        "properties": {
                            "field_name": {
                                "type": "string",
                                "enum": known_fields,
                            },
                            "derived_condition_id": _condition_id_string(),
                            "rule_kind": {
                                "type": "string",
                                "enum": [
                                    "truthy",
                                    "not_null",
                                    "when_value",
                                    "when_any_value",
                                ],
                            },
                            "when_value": {},
                            "when_any_value": {
                                "type": ["array", "null"],
                                "items": {},
                            },
                            "needs_modifier": {
                                "type": ["string", "null"],
                                "enum": [
                                    None,
                                    "requires_field_not_null",
                                    "requires_field_lt_today",
                                ],
                            },
                            "modifier_field": {"type": ["string", "null"]},
                        },
                    },
                },
                "proposed_new_external_fields": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "field_name",
                            "description",
                            "rationale",
                            "suggested_type",
                        ],
                        "properties": {
                            "field_name": {"type": "string", "minLength": 2},
                            "description": {"type": "string", "minLength": 10},
                            "rationale": {"type": "string", "minLength": 10},
                            "suggested_type": {
                                "type": "string",
                                "enum": [
                                    "str",
                                    "int",
                                    "float",
                                    "bool",
                                    "date",
                                    "list[str]",
                                ],
                            },
                        },
                    },
                },
                "end_pages": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "id",
                            "purpose",
                            "ticket_category",
                            "priority",
                            "routing_target",
                            "sla_hours",
                            "evidence_conditions",
                            "customer_actions_required",
                        ],
                        "properties": {
                            "id": _page_id_string(),
                            "purpose": {"type": "string", "minLength": 10},
                            "ticket_category": {
                                "type": "string",
                                "pattern": "^[a-z][a-z0-9_]+$",
                            },
                            "priority": {
                                "type": "string",
                                "enum": ["normal", "high", "urgent"],
                            },
                            "routing_target": {"type": "string", "minLength": 2},
                            "sla_hours": {"type": "integer", "minimum": 1, "maximum": 720},
                            "evidence_conditions": {
                                "type": "array",
                                "items": _condition_id_string(),
                            },
                            "customer_actions_required": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
                "notes": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
    }


# --------------------------------------------------------------------------- #
# Phase 2 — generate_node                                                     #
# --------------------------------------------------------------------------- #


def _routing_rule_oneof_schema() -> dict[str, Any]:
    """Egy routing-szabály oneOf séma: vagy `{if, goto}`, vagy `{default}`.

    Mindkettő mellett opcionális `inject_conditions: list[str]`. A
    `services.story_runtime.resolve_ai_node_routing` kétmenetes
    feldolgozása ezt a két formát ismeri; bármi más → lint ERROR.
    """
    return {
        "oneOf": [
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["if", "goto"],
                "properties": {
                    "if": {
                        "type": "array",
                        "minItems": 1,
                        "items": _condition_id_string(),
                    },
                    "goto": {"type": "string", "minLength": 2},
                    "inject_conditions": {
                        "type": "array",
                        "items": _condition_id_string(),
                    },
                },
            },
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["default"],
                "properties": {
                    "default": {"type": "string", "minLength": 2},
                    "inject_conditions": {
                        "type": "array",
                        "items": _condition_id_string(),
                    },
                },
            },
        ]
    }


def _step_schema(catalog: ConstraintCatalog) -> dict[str, Any]:
    """Egy step objektum sémája (ai-page steps[] elem).

    A `step.type` enum a `catalog.step.allowed_step_types`-ból. A boolean
    flag-ek a `catalog.step.boolean_flag_fields`-ből — mind opcionális.
    """
    bool_flag_props: dict[str, Any] = {
        flag: {"type": "boolean"}
        for flag in catalog.step.boolean_flag_fields
    }

    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["id", "type"],
        "properties": {
            "id": _step_id_string(),
            "type": {
                "type": "string",
                "enum": list(catalog.step.allowed_step_types),
            },
            "goal": {"type": "string"},
            "ai_action": {"type": "string"},
            "done_when": {"type": "string"},
            "internal_conditions": {
                "type": "array",
                "items": {
                    "oneOf": [
                        _condition_id_string(),
                        {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["id", "description"],
                            "properties": {
                                "id": _condition_id_string(),
                                "description": {"type": "string", "minLength": 1},
                                "required": {"type": "boolean"},
                                "validation_pattern_ref": {"type": "string"},
                                "do_not_reask_if_satisfied": {"type": "boolean"},
                            },
                        },
                    ]
                },
            },
            "image_conditions": {
                "type": "array",
                "items": _condition_id_string(),
            },
            "inject_conditions": {
                "type": "array",
                "items": _condition_id_string(),
            },
            "default_inject_conditions": {
                "type": "array",
                "items": _condition_id_string(),
            },
            "branches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["if"],
                    "properties": {
                        "if": {
                            "type": "array",
                            "minItems": 1,
                            "items": _condition_id_string(),
                        },
                        "next_step": {"type": "string", "minLength": 2},
                        "goto": {"type": "string", "minLength": 2},
                        "inject_conditions": {
                            "type": "array",
                            "items": _condition_id_string(),
                        },
                    },
                },
            },
            "default_next": {"type": "string", "minLength": 2},
            **bool_flag_props,
        },
    }


def build_generate_node_tool(catalog: ConstraintCatalog) -> dict[str, Any]:
    """Phase 2 tool: egy AI-page teljes dict-jének generálása.

    A schema az `ai_complaint_story_v3.json` page-séma szigorú felső-
    becslése. A `lint_single_node` második védvonal — pl. az
    `if`-listában szereplő kondíciók létezését nem a JSON Schema, hanem
    a lint validálja (mert a globális kondíció pool kontextus-függő).
    """
    return {
        "name": "generate_node",
        "description": (
            "Generate a complete AI-node (story page) dict matching the "
            "story schema. Use the GenerationContext (research + accepted "
            "node summaries + condition pool) to produce ONE coherent node. "
            "Do not reference unknown conditions; the structural lint will "
            "reject undeclared identifiers. The output is consumed verbatim "
            "as a `pages[<id>]` entry."
        ),
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "id",
                "type",
                "fallback_message",
                "knowledge",
                "conditions",
                "routing",
            ],
            "properties": {
                "id": _page_id_string(),
                "type": {"type": "string", "enum": ["ai"]},
                "fallback_message": {"type": "string", "minLength": 5},
                "knowledge": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["description", "scope", "examples"],
                    "properties": {
                        "description": {"type": "string", "minLength": 10},
                        "scope": {"type": "string", "minLength": 10},
                        "examples": {
                            "type": "array",
                            "minItems": 2,
                            "items": {"type": "string", "minLength": 4},
                        },
                    },
                },
                "conditions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["id", "description"],
                        "properties": {
                            "id": _condition_id_string(),
                            "description": {"type": "string", "minLength": 5},
                            "required": {"type": "boolean"},
                            "validation_pattern_ref": {"type": "string"},
                            "do_not_reask_if_satisfied": {"type": "boolean"},
                        },
                    },
                },
                "routing": {
                    "type": "array",
                    "minItems": 1,
                    "items": _routing_rule_oneof_schema(),
                },
                "steps": {
                    "type": "array",
                    "items": _step_schema(catalog),
                },
                "condition_implications": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["when_all", "then"],
                        "properties": {
                            "when_all": {
                                "type": "array",
                                "minItems": 1,
                                "items": _condition_id_string(),
                            },
                            "then": _condition_id_string(),
                        },
                    },
                },
                "session_facts_whitelist": {
                    "type": "array",
                    "items": _condition_id_string(),
                },
            },
        },
    }


# --------------------------------------------------------------------------- #
# Phase 3b — report_semantic_issues                                           #
# --------------------------------------------------------------------------- #


# A SemanticAuditFinding.kind Literal mirror-ja. A Pydantic kontrakt
# (services.onboarding.contracts.SemanticIssueKind) az igazságforrás —
# ha bővül, ezt a tuple-t is bővíteni kell. A regresszió-teszt egyezést
# ellenőriz.
_SEMANTIC_ISSUE_KINDS: tuple[str, ...] = (
    "routing_logic",
    "condition_naming",
    "node_overlap",
    "missing_path",
    "vendor_policy_violation",
    "tone_or_style",
    "scope_creep",
    "data_dependency",
    "other",
)

_VALIDATION_VERDICTS: tuple[str, ...] = (
    "clean",
    "warnings_only",
    "needs_human_review",
    "hard_fail",
)


def build_report_semantic_issues_tool(catalog: ConstraintCatalog) -> dict[str, Any]:
    """Phase 3b tool: a teljes story szemantikus auditja.

    A modell végigmegy az összerakott story-n (Phase 2 + Phase 3a lint
    kész), és logikai / vendor-policy / tone / scope finding-eket tesz le.
    A verdict eldöntése a modellé; a hívó dönt a follow-up akcióról
    (auto-fix retry, manual review, accept).
    """
    # A `catalog` jelenleg nincs használva itt, de a signature konzisztens
    # marad a többi builderrel — későbbi prompt-rendereléshez (a katalógus
    # alapján strukturált instrukciók) érdemes kéznél tartani.
    _ = catalog

    return {
        "name": "report_semantic_issues",
        "description": (
            "Audit the assembled story for semantic issues that the "
            "structural lint cannot detect: routing logic gaps, condition "
            "naming inconsistencies, node overlap, missing paths through "
            "the case universe, vendor policy violations, tone/style drift, "
            "scope creep, and external data dependency mistakes. Return a "
            "list of findings with a verdict and a short human-readable "
            "summary."
        ),
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["findings", "verdict"],
            "properties": {
                "findings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["kind", "severity", "description"],
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": list(_SEMANTIC_ISSUE_KINDS),
                            },
                            "severity": {
                                "type": "string",
                                "enum": ["info", "warning", "error"],
                            },
                            "node_id": {"type": ["string", "null"]},
                            "description": {"type": "string", "minLength": 10},
                            "suggested_fix": {"type": ["string", "null"]},
                            "references_research_section": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
                "verdict": {
                    "type": "string",
                    "enum": list(_VALIDATION_VERDICTS),
                },
                "summary_for_human": {"type": ["string", "null"]},
            },
        },
    }


__all__ = [
    "build_extract_blueprint_tool",
    "build_generate_node_tool",
    "build_report_semantic_issues_tool",
]


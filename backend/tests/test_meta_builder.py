"""Tests for `services.onboarding.meta_builder`.

Three independent functions + a combined `apply_meta_builder` entry. Each
function is deterministic, idempotent, and side-effect free except where
noted (`apply_meta_builder` mutates the story in place).
"""
from __future__ import annotations

import copy
from typing import Any

from services.onboarding.meta_builder import (
    apply_meta_builder,
    build_condition_labels,
    build_order_context_mapping,
    build_reply_style,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _ai_page(
    page_id: str,
    *,
    conditions: list[dict[str, Any]] | None = None,
    routing: list[dict[str, Any]] | None = None,
    steps: list[dict[str, Any]] | None = None,
    implications: list[dict[str, Any]] | None = None,
    whitelist: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": page_id,
        "type": "ai",
        "fallback_message": "Sorry, didn't catch that.",
        "knowledge": {
            "description": f"Page {page_id}",
            "scope": f"Scope of {page_id}",
            "examples": ["Example 1", "Example 2"],
        },
        "conditions": conditions or [],
        "routing": routing or [{"default": "ask"}],
        "steps": steps or [],
        "condition_implications": implications or [],
        "session_facts_whitelist": list(whitelist) if whitelist else [],
    }


def _story_with(*, pages: dict[str, Any], locale: str = "en") -> dict[str, Any]:
    return {
        "schemaVersion": "1.0",
        "storyId": "test",
        "locale": locale,
        "meta": {
            "id": "test",
            "title": "Test",
            "startPageId": next(iter(pages.keys())),
            "defaultFallbackMessage": "fallback",
            "runtime": {"model": "claude", "max_tokens": 1024},
        },
        "pages": pages,
    }


# --------------------------------------------------------------------------- #
# 1. build_order_context_mapping                                              #
# --------------------------------------------------------------------------- #


def test_ocm_derives_has_field_pattern_from_routing():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_purchase_date", "description": "purchase date is known"},
        ],
        routing=[
            {"if": ["has_purchase_date"], "goto": "next"},
            {"default": "ask"},
        ],
    )
    story = _story_with(pages={"intake": page})

    ocm = build_order_context_mapping(story)
    assert ocm == {
        "field_rules": [
            {"field": "purchase_date", "condition": "has_purchase_date",
             "when": "not_null"},
        ],
    }


def test_ocm_derives_field_known_pattern():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "payment_method_known", "description": "payment method is known"},
        ],
        routing=[
            {"if": ["payment_method_known"], "goto": "next"},
            {"default": "ask"},
        ],
    )
    story = _story_with(pages={"intake": page})

    ocm = build_order_context_mapping(story)
    assert ocm["field_rules"] == [
        {"field": "payment_method", "condition": "payment_method_known",
         "when": "not_null"},
    ]


def test_ocm_skips_conditions_with_unknown_field_name():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_unicorn_dust", "description": "magical input"},
        ],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})
    ocm = build_order_context_mapping(story)
    assert ocm["field_rules"] == []


def test_ocm_includes_extra_known_fields():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_device_model", "description": "device model is known"},
        ],
        routing=[{"if": ["has_device_model"], "goto": "next"},
                 {"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    ocm = build_order_context_mapping(
        story, extra_known_fields=["device_model"]
    )
    assert ocm["field_rules"] == [
        {"field": "device_model", "condition": "has_device_model",
         "when": "not_null"},
    ]


def test_ocm_dedupes_when_same_field_condition_pair_referenced_multiple_times():
    p1 = _ai_page(
        "intake",
        conditions=[{"id": "has_order_id", "description": "order id present"}],
        routing=[{"if": ["has_order_id"], "goto": "flow"}, {"default": "ask"}],
    )
    p2 = _ai_page(
        "flow",
        conditions=[{"id": "has_order_id", "description": "order id present"}],
        routing=[{"if": ["has_order_id"], "goto": "end"}, {"default": "ask"}],
    )
    story = _story_with(pages={"intake": p1, "flow": p2})

    ocm = build_order_context_mapping(story)
    assert len([r for r in ocm["field_rules"]
                if r["field"] == "order_id"]) == 1


def test_ocm_preserves_base_field_rules_and_dedupes():
    page = _ai_page(
        "intake",
        conditions=[{"id": "has_order_id", "description": "order id present"}],
        routing=[{"if": ["has_order_id"], "goto": "next"},
                 {"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    base = [
        {"field": "tracking_status", "condition": "package_lost",
         "when_value": "lost"},
    ]
    ocm = build_order_context_mapping(story, base_field_rules=base)
    fields = [r["field"] for r in ocm["field_rules"]]
    assert "tracking_status" in fields
    assert fields.count("order_id") == 1


def test_ocm_idempotent_against_already_present_rule():
    """Calling twice with the same auto-derived rule in `base` collapses to
    a single entry. Avoid duplicate rules in subsequent runs."""
    page = _ai_page(
        "intake",
        conditions=[{"id": "has_purchase_date", "description": "pd"}],
        routing=[{"if": ["has_purchase_date"], "goto": "next"},
                 {"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    first = build_order_context_mapping(story)
    second = build_order_context_mapping(
        story, base_field_rules=first["field_rules"]
    )
    assert first == second


def test_ocm_finds_condition_in_implications_then():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_purchase_date", "description": "pd"},
            {"id": "has_delivery_date", "description": "dd"},
        ],
        routing=[{"default": "ask"}],
        implications=[
            {"when_all": ["has_purchase_date"], "then": "has_delivery_date"},
        ],
    )
    story = _story_with(pages={"intake": page})
    ocm = build_order_context_mapping(story)
    fields = sorted(r["field"] for r in ocm["field_rules"])
    assert fields == ["delivery_date", "purchase_date"]


def test_ocm_strips_negation_prefix_in_routing():
    page = _ai_page(
        "intake",
        conditions=[{"id": "has_order_id", "description": "x"}],
        routing=[
            {"if": ["!has_order_id"], "goto": "ask-id"},
            {"default": "ask"},
        ],
    )
    story = _story_with(pages={"intake": page})
    ocm = build_order_context_mapping(story)
    assert ocm["field_rules"] == [
        {"field": "order_id", "condition": "has_order_id", "when": "not_null"},
    ]


def test_ocm_deterministic_ordering():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_tracking_number", "description": "x"},
            {"id": "has_order_id", "description": "y"},
        ],
        routing=[
            {"if": ["has_tracking_number", "has_order_id"], "goto": "flow"},
            {"default": "ask"},
        ],
    )
    story = _story_with(pages={"intake": page})
    fields_one = [r["field"] for r in build_order_context_mapping(story)["field_rules"]]
    fields_two = [r["field"] for r in build_order_context_mapping(story)["field_rules"]]
    assert fields_one == fields_two
    assert fields_one == sorted(fields_one)


# --------------------------------------------------------------------------- #
# 2. build_condition_labels                                                   #
# --------------------------------------------------------------------------- #


def test_labels_extract_from_top_level_conditions():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "topic_known", "description": "Topic is identified."},
            {"id": "has_order_id", "description": "Order ID is provided."},
        ],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    labels = build_condition_labels(story)
    assert labels["topic_known"] == "Topic is identified"
    assert labels["has_order_id"] == "Order ID is provided"


def test_labels_extract_from_step_internal_conditions():
    page = _ai_page(
        "intake",
        conditions=[],
        routing=[{"default": "ask"}],
        steps=[
            {
                "id": "classify",
                "type": "prompt",
                "internal_conditions": [
                    {"id": "is_doa", "description": "Item is dead on arrival."},
                ],
            }
        ],
    )
    story = _story_with(pages={"intake": page})

    labels = build_condition_labels(story)
    assert labels == {"is_doa": "Item is dead on arrival"}


def test_labels_truncate_long_descriptions_at_first_sentence():
    long_desc = (
        "Very long descriptive sentence about the condition state. "
        "Another sentence with extra details that should be dropped."
    )
    page = _ai_page(
        "intake",
        conditions=[{"id": "x", "description": long_desc}],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    labels = build_condition_labels(story)
    assert labels["x"] == (
        "Very long descriptive sentence about the condition state"
    )


def test_labels_overrides_win_over_descriptions():
    page = _ai_page(
        "intake",
        conditions=[{"id": "topic_known", "description": "default desc"}],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})

    labels = build_condition_labels(
        story,
        overrides={"topic_known": "topic identified by classifier"},
    )
    assert labels["topic_known"] == "topic identified by classifier"


def test_labels_skip_conditions_with_empty_or_missing_description():
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "with_desc", "description": "Has description."},
            {"id": "no_desc"},
            {"id": "empty_desc", "description": "  "},
        ],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})
    labels = build_condition_labels(story)
    assert labels == {"with_desc": "Has description"}


def test_labels_first_seen_wins_for_duplicate_ids():
    p1 = _ai_page(
        "intake",
        conditions=[{"id": "shared", "description": "From intake."}],
        routing=[{"default": "ask"}],
    )
    p2 = _ai_page(
        "next",
        conditions=[{"id": "shared", "description": "From next page."}],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": p1, "next": p2})

    labels = build_condition_labels(story)
    # First seen page wins (intake comes first in dict iteration order).
    assert labels["shared"] == "From intake"


def test_labels_idempotent():
    page = _ai_page(
        "intake",
        conditions=[{"id": "topic_known", "description": "Topic known."}],
        routing=[{"default": "ask"}],
    )
    story = _story_with(pages={"intake": page})
    a = build_condition_labels(story)
    b = build_condition_labels(story)
    assert a == b


# --------------------------------------------------------------------------- #
# 3. build_reply_style                                                        #
# --------------------------------------------------------------------------- #


def test_reply_style_hu_template_loaded():
    rs = build_reply_style(locale="hu")
    assert "global_rules" in rs
    assert isinstance(rs["global_rules"], list) and len(rs["global_rules"]) >= 3
    assert "Maximum 3 mondat" in rs["global_rules"][0]
    assert "ack_and_paragraph_instruction" in rs
    assert "Most teljesült" in rs["ack_and_paragraph_instruction"]


def test_reply_style_en_template_loaded():
    rs = build_reply_style(locale="en")
    assert "Maximum 3 sentences" in rs["global_rules"][0]
    assert "Newly satisfied" in rs["ack_and_paragraph_instruction"]


def test_reply_style_unknown_locale_falls_back_to_en():
    rs = build_reply_style(locale="zz")
    assert "Maximum 3 sentences" in rs["global_rules"][0]


def test_reply_style_extra_global_rules_appended():
    rs = build_reply_style(
        locale="hu",
        extra_global_rules=["Soha ne nevezz meg konkrét márkát."],
    )
    assert "Soha ne nevezz meg konkrét márkát." in rs["global_rules"]
    assert rs["global_rules"][0] == "Maximum 3 mondat per válasz."


def test_reply_style_returns_independent_copies():
    a = build_reply_style(locale="hu")
    b = build_reply_style(locale="hu")
    a["global_rules"].append("mutated")
    assert "mutated" not in b["global_rules"]


# --------------------------------------------------------------------------- #
# 4. apply_meta_builder (combined entry)                                      #
# --------------------------------------------------------------------------- #


def _populated_story() -> dict[str, Any]:
    page = _ai_page(
        "intake",
        conditions=[
            {"id": "has_order_id", "description": "Order ID is provided."},
            {"id": "has_purchase_date", "description": "Purchase date known."},
            {"id": "topic_known", "description": "Topic identified."},
        ],
        routing=[
            {"if": ["has_order_id", "topic_known"], "goto": "flow"},
            {"default": "ask"},
        ],
    )
    flow = _ai_page(
        "flow",
        conditions=[
            {"id": "doa_confirmed", "description": "DOA verified."},
        ],
        routing=[
            {"if": ["has_purchase_date", "doa_confirmed"], "goto": "end-doa"},
            {"default": "ask"},
        ],
    )
    end = {
        "id": "end-doa",
        "type": "end",
        "content": "Thanks, your case is queued.",
    }
    return _story_with(
        pages={"intake": page, "flow": flow, "end-doa": end}, locale="hu"
    )


def test_apply_meta_builder_populates_all_three_sections():
    story = _populated_story()
    report = apply_meta_builder(story)

    meta = story["meta"]
    assert "order_context_mapping" in meta
    assert "condition_labels" in meta
    assert "reply_style" in meta

    field_rules = meta["order_context_mapping"]["field_rules"]
    fields = [r["field"] for r in field_rules]
    assert "order_id" in fields
    assert "purchase_date" in fields

    labels = meta["condition_labels"]
    assert labels["topic_known"] == "Topic identified"
    assert labels["doa_confirmed"] == "DOA verified"

    rs = meta["reply_style"]
    assert "Maximum 3 mondat" in rs["global_rules"][0]
    assert report["reply_style"]["locale_used"] == "hu"


def test_apply_meta_builder_idempotent():
    story = _populated_story()
    apply_meta_builder(story)
    snapshot = copy.deepcopy(story)
    apply_meta_builder(story)
    assert story == snapshot


def test_apply_meta_builder_preserves_existing_field_rules_when_not_overwriting():
    story = _populated_story()
    story["meta"]["order_context_mapping"] = {
        "field_rules": [
            {"field": "tracking_status", "condition": "package_lost",
             "when_value": "lost"},
        ],
    }
    apply_meta_builder(story)
    rules = story["meta"]["order_context_mapping"]["field_rules"]
    fields = [r["field"] for r in rules]
    assert "tracking_status" in fields  # preserved
    assert "order_id" in fields  # auto-added


def test_apply_meta_builder_preserves_existing_labels_when_not_overwriting():
    story = _populated_story()
    story["meta"]["condition_labels"] = {
        "topic_known": "previously curated label",
    }
    apply_meta_builder(story)
    labels = story["meta"]["condition_labels"]
    assert labels["topic_known"] == "previously curated label"
    assert labels["doa_confirmed"] == "DOA verified"


def test_apply_meta_builder_preserves_existing_reply_style_when_not_overwriting():
    story = _populated_story()
    story["meta"]["reply_style"] = {"global_rules": ["custom"]}
    apply_meta_builder(story)
    assert story["meta"]["reply_style"] == {"global_rules": ["custom"]}


def test_apply_meta_builder_overwrite_replaces_everything():
    story = _populated_story()
    story["meta"]["condition_labels"] = {"topic_known": "old"}
    story["meta"]["reply_style"] = {"global_rules": ["old"]}

    apply_meta_builder(story, overwrite_existing=True)
    assert story["meta"]["condition_labels"]["topic_known"] == "Topic identified"
    assert "Maximum 3 mondat" in story["meta"]["reply_style"]["global_rules"][0]


def test_apply_meta_builder_locale_falls_back_to_story_locale():
    story = _populated_story()  # locale = "hu"
    apply_meta_builder(story)
    assert "Maximum 3 mondat" in story["meta"]["reply_style"]["global_rules"][0]


def test_apply_meta_builder_explicit_locale_overrides_story():
    story = _populated_story()  # locale = "hu"
    apply_meta_builder(story, locale="en")
    assert "Maximum 3 sentences" in story["meta"]["reply_style"]["global_rules"][0]


def test_apply_meta_builder_supports_extra_known_fields():
    story = _populated_story()
    page = story["pages"]["intake"]
    page["conditions"].append(
        {"id": "has_device_model", "description": "Device model known."}
    )
    page["routing"][0]["if"].append("has_device_model")

    apply_meta_builder(story, extra_known_fields=["device_model"])
    fields = [r["field"]
              for r in story["meta"]["order_context_mapping"]["field_rules"]]
    assert "device_model" in fields

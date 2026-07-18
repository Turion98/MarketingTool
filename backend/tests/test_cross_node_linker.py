"""Tests for `support_engine.services.onboarding.cross_node_linker`.

The two passes have orthogonal concerns:

1. ``complete_session_facts_whitelist`` propagates conditions that cross
   node boundaries.
2. ``wire_cross_node_inject_conditions`` wires the actual handoff payload
   on every cross-node routing rule.

Both are deterministic and idempotent — running them twice is a no-op.
"""
from __future__ import annotations

import copy
from typing import Any

from support_engine.services.onboarding.cross_node_linker import (
    complete_session_facts_whitelist,
    link_cross_nodes,
    wire_cross_node_inject_conditions,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _ai_page(
    page_id: str,
    *,
    conditions: list[str],
    routing: list[dict[str, Any]] | None = None,
    steps: list[dict[str, Any]] | None = None,
    implications: list[dict[str, Any]] | None = None,
    whitelist: list[str] | None = None,
) -> dict:
    return {
        "id": page_id,
        "type": "ai",
        "fallback_message": "Sorry, didn't catch that.",
        "knowledge": {
            "description": f"Page {page_id}",
            "scope": f"Scope of {page_id}",
            "examples": ["Example 1", "Example 2"],
        },
        "conditions": [
            {"id": c, "description": f"Condition {c}", "required": False}
            for c in conditions
        ],
        "routing": routing or [{"default": "ask"}],
        "steps": steps or [],
        "condition_implications": implications or [],
        "session_facts_whitelist": list(whitelist) if whitelist else [],
    }


def _story_two_nodes() -> dict:
    """Minimal cross-node story:
        intake declares `topic_known`; doa-flow routes on it.
    """
    return {
        "schemaVersion": "1.0",
        "storyId": "test",
        "locale": "en",
        "meta": {
            "id": "test",
            "title": "Test",
            "startPageId": "intake",
            "defaultFallbackMessage": "fallback",
            "runtime": {"model": "claude", "max_tokens": 1024},
        },
        "pages": {
            "intake": _ai_page(
                "intake",
                conditions=["topic_known", "is_doa"],
                routing=[
                    {"if": ["is_doa"], "goto": "doa-flow"},
                    {"default": "ask"},
                ],
                whitelist=[],  # intentionally empty — linker should fill
            ),
            "doa-flow": _ai_page(
                "doa-flow",
                conditions=["doa_confirmed"],
                routing=[
                    {"if": ["topic_known", "doa_confirmed"], "goto": "end-doa"},
                    {"default": "ask"},
                ],
                whitelist=["topic_known", "doa_confirmed"],
            ),
            "end-doa": {
                "id": "end-doa",
                "type": "end",
                "content": "Thank you, your DOA case is queued.",
            },
        },
    }


# --------------------------------------------------------------------------- #
# 1. Whitelist completion                                                     #
# --------------------------------------------------------------------------- #


def test_whitelist_completion_adds_cross_referenced_conditions():
    story = _story_two_nodes()
    report = complete_session_facts_whitelist(story)

    assert report["total_additions"] == 1
    intake = story["pages"]["intake"]
    # `is_doa` is referenced ONLY by intake itself → NOT cross-referenced
    # → not added. `topic_known` is referenced by doa-flow → added.
    assert "topic_known" in intake["session_facts_whitelist"]
    assert "is_doa" not in intake["session_facts_whitelist"]


def test_whitelist_completion_is_idempotent():
    story = _story_two_nodes()
    complete_session_facts_whitelist(story)
    snapshot = copy.deepcopy(story)
    second_report = complete_session_facts_whitelist(story)

    assert second_report["total_additions"] == 0
    assert story == snapshot


def test_whitelist_completion_preserves_existing_order():
    story = _story_two_nodes()
    story["pages"]["intake"]["session_facts_whitelist"] = ["pre_existing_a", "pre_existing_b"]
    complete_session_facts_whitelist(story)
    wl = story["pages"]["intake"]["session_facts_whitelist"]
    assert wl[:2] == ["pre_existing_a", "pre_existing_b"]
    assert "topic_known" in wl[2:]


def test_whitelist_completion_picks_up_implications_as_propagable():
    story = _story_two_nodes()
    # Move `topic_known` from declared conditions to a derived implication
    # — the linker should still propagate it.
    intake = story["pages"]["intake"]
    intake["conditions"] = [
        c for c in intake["conditions"] if c["id"] != "topic_known"
    ]
    intake["condition_implications"] = [
        {"when_all": ["is_doa"], "then": "topic_known"}
    ]
    complete_session_facts_whitelist(story)
    assert "topic_known" in intake["session_facts_whitelist"]


def test_whitelist_completion_creates_key_when_missing():
    story = _story_two_nodes()
    del story["pages"]["intake"]["session_facts_whitelist"]
    complete_session_facts_whitelist(story)
    assert "session_facts_whitelist" in story["pages"]["intake"]
    assert "topic_known" in story["pages"]["intake"]["session_facts_whitelist"]


# --------------------------------------------------------------------------- #
# 2. Inject conditions wiring                                                 #
# --------------------------------------------------------------------------- #


def test_inject_conditions_wired_for_cross_node_handoff():
    story = _story_two_nodes()
    # Pre-condition: complete whitelist first (real pipeline order).
    complete_session_facts_whitelist(story)

    report = wire_cross_node_inject_conditions(story)
    assert report["total_additions"] >= 1

    intake_routing = story["pages"]["intake"]["routing"]
    cross_rule = intake_routing[0]  # `if: [is_doa] → doa-flow`
    assert "inject_conditions" in cross_rule
    # `topic_known` is in source's declared set AND target's whitelist → injected.
    assert "topic_known" in cross_rule["inject_conditions"]
    # `is_doa` is in the rule's `if` AND not in target's whitelist → NOT injected.
    assert "is_doa" not in cross_rule["inject_conditions"]


def test_inject_conditions_skips_ask_and_end_pages():
    story = _story_two_nodes()
    report = wire_cross_node_inject_conditions(story)
    intake_default = story["pages"]["intake"]["routing"][1]
    assert "inject_conditions" not in intake_default

    doa_routing = story["pages"]["doa-flow"]["routing"]
    end_rule = doa_routing[0]  # goto: end-doa (an end page)
    assert "inject_conditions" not in end_rule


def test_inject_conditions_merges_existing_when_not_overwriting():
    story = _story_two_nodes()
    complete_session_facts_whitelist(story)
    intake_routing = story["pages"]["intake"]["routing"]
    intake_routing[0]["inject_conditions"] = ["pre_existing_cond"]

    wire_cross_node_inject_conditions(story)

    inject = intake_routing[0]["inject_conditions"]
    assert "pre_existing_cond" in inject
    assert "topic_known" in inject


def test_inject_conditions_overwrites_when_requested():
    story = _story_two_nodes()
    complete_session_facts_whitelist(story)
    intake_routing = story["pages"]["intake"]["routing"]
    intake_routing[0]["inject_conditions"] = ["should_be_replaced"]

    wire_cross_node_inject_conditions(story, overwrite_existing=True)

    inject = intake_routing[0]["inject_conditions"]
    assert "should_be_replaced" not in inject
    assert "topic_known" in inject


def test_inject_conditions_idempotent():
    story = _story_two_nodes()
    complete_session_facts_whitelist(story)
    wire_cross_node_inject_conditions(story)
    snapshot = copy.deepcopy(story)
    second = wire_cross_node_inject_conditions(story)
    assert second["total_additions"] == 0
    assert story == snapshot


def test_inject_conditions_uses_step_internal_conditions():
    story = _story_two_nodes()
    intake = story["pages"]["intake"]
    intake["steps"] = [
        {
            "id": "classify",
            "type": "prompt",
            "goal": "Classify the issue.",
            "internal_conditions": ["mid_classification_signal"],
        }
    ]
    # Add to target whitelist so it counts as a valid handoff payload.
    story["pages"]["doa-flow"]["session_facts_whitelist"].append(
        "mid_classification_signal"
    )

    complete_session_facts_whitelist(story)
    wire_cross_node_inject_conditions(story)

    cross_rule = story["pages"]["intake"]["routing"][0]
    assert "mid_classification_signal" in cross_rule["inject_conditions"]


# --------------------------------------------------------------------------- #
# 3. link_cross_nodes (combined entry)                                        #
# --------------------------------------------------------------------------- #


def test_link_cross_nodes_runs_both_passes_in_order():
    story = _story_two_nodes()
    report = link_cross_nodes(story)
    assert "whitelist" in report
    assert "inject_conditions" in report
    intake = story["pages"]["intake"]
    assert "topic_known" in intake["session_facts_whitelist"]
    assert "topic_known" in intake["routing"][0]["inject_conditions"]


def test_link_cross_nodes_no_op_on_isolated_node():
    story = {
        "schemaVersion": "1.0",
        "storyId": "test",
        "locale": "en",
        "meta": {
            "id": "test",
            "title": "Test",
            "startPageId": "solo",
            "defaultFallbackMessage": "fallback",
            "runtime": {"model": "claude", "max_tokens": 1024},
        },
        "pages": {
            "solo": _ai_page(
                "solo",
                conditions=["alpha"],
                routing=[{"default": "ask"}],
                whitelist=[],
            ),
        },
    }
    report = link_cross_nodes(story)
    assert report["whitelist"]["total_additions"] == 0
    assert report["inject_conditions"]["total_additions"] == 0

"""validation_pattern_ref: LLM-extract teljesített kondíciók regex-validálása.

A `has_order_id` kondíció (és bármely más kondíció amelyen `validation_pattern_ref`
mező szerepel) csak akkor maradhat `satisfied`-ben, ha a hivatkozott
`meta.<ref>` regex matchel a user promptra.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from services import ai_node_runtime as air
from services.order_context import (
    collect_validation_patterns,
    filter_satisfied_by_pattern_validation,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


def _load_story() -> dict:
    return json.loads(STORY_PATH.read_text(encoding="utf-8"))


def _tool_block(name: str, data: dict):
    return SimpleNamespace(type="tool_use", name=name, input=data)


# ---------------------------------------------------------------------------
# Unit tests — pure helpers
# ---------------------------------------------------------------------------


def test_collect_validation_patterns_picks_up_ref() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [
        {"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"},
        {"id": "tracking_checked"},
    ]
    out = collect_validation_patterns(defs, story)
    assert out == {"has_order_id": "ORD-[A-Z]{2,6}-\\d{2,6}"}


def test_collect_validation_patterns_skips_unknown_ref() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [{"id": "has_order_id", "validation_pattern_ref": "missing_ref"}]
    assert collect_validation_patterns(defs, story) == {}


def test_collect_validation_patterns_handles_no_story() -> None:
    defs = [{"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"}]
    assert collect_validation_patterns(defs, None) == {}
    assert collect_validation_patterns(defs, {}) == {}


def test_filter_satisfied_valid_pattern_keeps_condition() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [{"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"}]
    result, rejected = filter_satisfied_by_pattern_validation(
        {"satisfied": ["has_order_id"], "missing": []},
        defs,
        story,
        "Rendelési szám: ORD-DEL-001.",
    )
    assert result["satisfied"] == ["has_order_id"]
    assert result["missing"] == []
    assert rejected == []


def test_filter_satisfied_invalid_pattern_rejects_and_adds_to_missing() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [{"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"}]
    result, rejected = filter_satisfied_by_pattern_validation(
        {"satisfied": ["has_order_id", "tracking_checked"], "missing": []},
        defs,
        story,
        "Rendelési szám: #ORD-5503.",
    )
    assert "has_order_id" not in result["satisfied"]
    assert "tracking_checked" in result["satisfied"]
    assert "has_order_id" in result["missing"]
    assert rejected == ["has_order_id"]


def test_filter_satisfied_without_validation_pattern_ref_unchanged() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [
        {"id": "tracking_checked"},
        {"id": "marked_delivered_not_received"},
    ]
    payload = {
        "satisfied": ["tracking_checked", "marked_delivered_not_received"],
        "missing": ["surroundings_checked"],
    }
    result, rejected = filter_satisfied_by_pattern_validation(
        payload, defs, story, "akármi"
    )
    assert result == payload
    assert rejected == []


def test_filter_satisfied_empty_prompt_rejects_gated_condition() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [{"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"}]
    result, rejected = filter_satisfied_by_pattern_validation(
        {"satisfied": ["has_order_id"], "missing": []},
        defs,
        story,
        "",
    )
    assert result["satisfied"] == []
    assert result["missing"] == ["has_order_id"]
    assert rejected == ["has_order_id"]


def test_filter_satisfied_does_not_duplicate_missing_entry() -> None:
    story = {"meta": {"reference_id_pattern": "ORD-[A-Z]{2,6}-\\d{2,6}"}}
    defs = [{"id": "has_order_id", "validation_pattern_ref": "reference_id_pattern"}]
    result, _ = filter_satisfied_by_pattern_validation(
        {"satisfied": ["has_order_id"], "missing": ["has_order_id", "tracking_checked"]},
        defs,
        story,
        "nincs benne",
    )
    assert result["missing"].count("has_order_id") == 1
    assert "tracking_checked" in result["missing"]


# ---------------------------------------------------------------------------
# Integration tests via process_step (mocked LLM) — story-driven shape
# ---------------------------------------------------------------------------


def _delivery_step_1() -> tuple[dict, dict, dict]:
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = node["steps"][0]
    return story, node, step_1


def test_process_step_valid_order_id_keeps_has_order_id() -> None:
    story, node, step_1 = _delivery_step_1()
    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "has_order_id",
                        "tracking_checked",
                        "marked_delivered_not_received",
                    ],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[_tool_block("generate_reply", {"assistantMessage": "Köszi!"})]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "A tracking szerint kézbesítve, de nem kaptam meg. Rendelési szám: ORD-DEL-001.",
            node,
            step_1,
            [],
            story=story,
        )

    assert "has_order_id" in out["satisfied"]
    assert "tracking_checked" in out["satisfied"]
    assert "marked_delivered_not_received" in out["satisfied"]


def test_process_step_invalid_order_id_drops_has_order_id() -> None:
    story, node, step_1 = _delivery_step_1()
    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "has_order_id",
                        "tracking_checked",
                    ],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Pontos rendelési számot kérek (ORD-XX-NNN)."},
            )
        ]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "Rendelési szám: #ORD-5503. A tracking szerint kézbesítve.",
            node,
            step_1,
            [],
            story=story,
        )

    assert "has_order_id" not in out["satisfied"]
    assert "tracking_checked" in out["satisfied"]
    assert "has_order_id" in out["missing"]


def test_process_step_no_story_skips_validation() -> None:
    """Story=None esetén a validáció inaktív (nincs meta), így a kondíciók átmennek."""
    story, node, step_1 = _delivery_step_1()
    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["has_order_id", "tracking_checked"],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[_tool_block("generate_reply", {"assistantMessage": "ok"})]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "akármi",
            node,
            step_1,
            [],
            story=None,
        )

    assert "has_order_id" in out["satisfied"]
    assert "tracking_checked" in out["satisfied"]


# ---------------------------------------------------------------------------
# Integration test via extract_conditions (complaint-intake pure routing)
# ---------------------------------------------------------------------------


def test_extract_conditions_invalid_order_id_drops_has_order_id() -> None:
    story = _load_story()
    intake = story["pages"]["complaint-intake"]
    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "complaint_type_known",
                        "complaint_shipping",
                        "has_order_id",
                        "package_lost",
                    ],
                    "missing": [],
                },
            )
        ]
    )

    with patch.object(
        air.client.messages, "create", side_effect=[extract_resp]
    ):
        out = air.extract_conditions(
            user_prompt="A csomagom elveszett. Rendelési szám: #ORD-5503.",
            active_node=intake,
            already_satisfied=[],
            generate_reply=False,
            story=story,
        )

    assert "has_order_id" not in out["satisfied"]
    assert "complaint_type_known" in out["satisfied"]
    assert "complaint_shipping" in out["satisfied"]
    assert "package_lost" in out["satisfied"]
    assert "has_order_id" in out["missing"]


def test_filter_finds_validation_pattern_ref_across_node_steps() -> None:
    """has_order_id csak a delivery-issue/step_1.internal_conditions-ben
    van definiálva, de a session whitelist miatt egy másik step (pl. step_4)
    extract is jelölheti satisfied-ként. A validator helper bejárja a node
    minden step-jét és megtalálja a step_1 validation_pattern_ref-jét."""
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")

    filtered = air._filter_extract_by_validation_pattern(
        {
            "satisfied": ["has_order_id", "remedy_communicated"],
            "missing": [],
        },
        active_node=node,
        current_step=step_4,
        story=story,
        user_prompt="Rendelési szám: #ORD-5503.",
    )
    assert "has_order_id" not in filtered["satisfied"], (
        "step_4 extract: has_order_id-t a step_1 validation_pattern_ref-je "
        "alapján el kellett volna utasítani (invalid format: #ORD-5503)."
    )
    assert "remedy_communicated" in filtered["satisfied"]
    assert "has_order_id" in filtered["missing"]


def test_filter_keeps_valid_order_id_across_node_steps() -> None:
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")

    filtered = air._filter_extract_by_validation_pattern(
        {"satisfied": ["has_order_id"], "missing": []},
        active_node=node,
        current_step=step_4,
        story=story,
        user_prompt="Rendelési szám: ORD-DEL-001.",
    )
    assert filtered["satisfied"] == ["has_order_id"]
    assert filtered["missing"] == []


# ---------------------------------------------------------------------------
# Reply-prompt fortification — meggátoljuk hogy az LLM acknowledge-olja
# a regex-validáción megbukott felhasználói inputot.
# ---------------------------------------------------------------------------


def test_filter_stashes_rejected_ids_on_result() -> None:
    """A wrapper a kliens felé nem leakeli, de a reply-prompt számára eléri."""
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")

    filtered = air._filter_extract_by_validation_pattern(
        {"satisfied": ["has_order_id", "tracking_checked"], "missing": []},
        active_node=node,
        current_step=step_1,
        story=story,
        user_prompt="Rendelésszám: #ORD-3390.",
    )
    assert filtered.get("_validation_rejected") == ["has_order_id"]
    assert "has_order_id" not in filtered["satisfied"]
    assert "has_order_id" in filtered["missing"]


def test_filter_no_rejection_does_not_add_underscore_key() -> None:
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")

    filtered = air._filter_extract_by_validation_pattern(
        {"satisfied": ["has_order_id"], "missing": []},
        active_node=node,
        current_step=step_1,
        story=story,
        user_prompt="Rendelésszám: ORD-DEL-001.",
    )
    assert "_validation_rejected" not in filtered


def test_validation_rejection_block_includes_id_pattern_and_prohibitions() -> None:
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")

    block = air._build_validation_rejection_block(
        ["has_order_id"],
        active_node=node,
        current_step=step_1,
        story=story,
    )
    assert "has_order_id" in block
    assert "ORD-[A-Z]{2,6}-\\d{2,6}" in block
    assert "regex-validáció bukott" in block
    for forbidden in ("megkaptam", "rögzítettem", "köszönöm"):
        assert forbidden in block


def test_validation_rejection_block_empty_when_no_rejection() -> None:
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")

    assert (
        air._build_validation_rejection_block(
            None,
            active_node=node,
            current_step=step_1,
            story=story,
        )
        == ""
    )
    assert (
        air._build_validation_rejection_block(
            [],
            active_node=node,
            current_step=step_1,
            story=story,
        )
        == ""
    )


def test_process_step_invalid_order_id_injects_rejection_block_into_reply_system_prompt() -> None:
    """A reply-LLM hívás system prompt-ja tartalmazza a rejection blokkot,
    így az LLM nem hallucinálhatja hogy „megkaptam a rendelési számot”."""
    story, node, step_1 = _delivery_step_1()

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["has_order_id", "tracking_checked"],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Helyes formátum: ORD-XX-NNN."},
            )
        ]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ) as mock_create:
        air.process_step(
            "Rendelésszám: #ORD-3390. A csomag 6 napja késik.",
            node,
            step_1,
            [],
            story=story,
        )

    reply_call = mock_create.call_args_list[1]
    system = reply_call.kwargs.get("system") or reply_call.args[0]
    assert "FORMÁTUM-VALIDÁCIÓ" in system
    assert "has_order_id" in system
    assert "megkaptam" in system
    assert "ORD-[A-Z]{2,6}-\\d{2,6}" in system


def test_process_step_valid_order_id_no_rejection_block_in_reply_system_prompt() -> None:
    story, node, step_1 = _delivery_step_1()

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["has_order_id", "tracking_checked"],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[_tool_block("generate_reply", {"assistantMessage": "ok"})]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ) as mock_create:
        air.process_step(
            "Rendelésszám: ORD-DEL-001.",
            node,
            step_1,
            [],
            story=story,
        )

    reply_call = mock_create.call_args_list[1]
    system = reply_call.kwargs.get("system") or reply_call.args[0]
    assert "FORMÁTUM-VALIDÁCIÓ" not in system


def test_internal_rejected_key_does_not_leak_to_api_response() -> None:
    """A `_validation_rejected` egy belső kulcs — a routes által visszaadott
    payload-ban nem szabad megjelennie."""
    from fastapi.testclient import TestClient

    from main import app

    client = TestClient(app)
    story = _load_story()
    node = story["pages"]["delivery-issue"]

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["has_order_id", "tracking_checked"],
                    "missing": [],
                },
            )
        ]
    )
    reply_resp = SimpleNamespace(
        content=[_tool_block("generate_reply", {"assistantMessage": "ok"})]
    )

    with (
        patch("routers.ai_node_routes.get_top_k_nodes", return_value=[node]),
        patch(
            "routers.ai_node_routes.match_active_node",
            return_value={"activeNodeId": "delivery-issue", "askClarification": False},
        ),
        patch.object(
            air.client.messages,
            "create",
            side_effect=[extract_resp, reply_resp],
        ),
    ):
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "Rendelésszám: #ORD-3390.",
                "satisfiedConditions": [],
                "currentStepId": None,
            },
        )

    assert r.status_code == 200, r.text
    data = r.json()
    assert "_validation_rejected" not in data
    for v in data.values():
        if isinstance(v, list):
            assert "_validation_rejected" not in v


def test_extract_conditions_valid_order_id_keeps_has_order_id() -> None:
    story = _load_story()
    intake = story["pages"]["complaint-intake"]
    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "complaint_type_known",
                        "complaint_shipping",
                        "has_order_id",
                    ],
                    "missing": [],
                },
            )
        ]
    )

    with patch.object(
        air.client.messages, "create", side_effect=[extract_resp]
    ):
        out = air.extract_conditions(
            user_prompt="A csomagom elveszett. Rendelési szám: ORD-DEL-001.",
            active_node=intake,
            already_satisfied=[],
            generate_reply=False,
            story=story,
        )

    assert "has_order_id" in out["satisfied"]
    assert "complaint_shipping" in out["satisfied"]

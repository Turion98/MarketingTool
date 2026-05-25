"""
AI step motor + ai_complaint_story_v3 szerkezet.

Futtatás (backend könyvtárból):
  pip install pytest
  python -m pytest tests/test_ai_steps_and_story.py -v

A conftest.py beállítja a dummy ANTHROPIC_API_KEY-t és a sys.path-ot.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


def _load_story() -> dict:
    assert STORY_PATH.is_file(), f"Hiányzik: {STORY_PATH}"
    return json.loads(STORY_PATH.read_text(encoding="utf-8"))


def test_resolve_step_routing_no_steps():
    from services.story_runtime import resolve_step_routing

    out = resolve_step_routing({"id": "x"}, "anything", [])
    assert out == {"nextStepId": None, "nodeRoutingReady": True}


def test_resolve_step_routing_last_step_triggers_node_routing():
    from services.story_runtime import resolve_step_routing

    node = {"steps": [{"id": "a"}, {"id": "b"}]}
    out = resolve_step_routing(node, "b", [])
    assert out["nextStepId"] is None and out["nodeRoutingReady"] is True


def test_resolve_step_routing_middle_step_goes_next():
    from services.story_runtime import resolve_step_routing

    node = {
        "steps": [
            {"id": "step_1"},
            {"id": "step_2"},
            {"id": "step_4"},
        ]
    }
    out = resolve_step_routing(node, "step_1", [])
    assert out == {"nextStepId": "step_2", "nodeRoutingReady": False}


def test_resolve_step_routing_from_real_story_delivery_issue():
    from services.story_runtime import resolve_step_routing

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    out = resolve_step_routing(node, "step_1", [])
    assert out["nextStepId"] == "step_2"
    assert out["nodeRoutingReady"] is False

    last_id = node["steps"][-1]["id"]
    out_last = resolve_step_routing(node, last_id, [])
    assert out_last["nodeRoutingReady"] is True


def _tool_block(name: str, data: dict):
    return SimpleNamespace(type="tool_use", name=name, input=data)


def _llm_tool_calls(mock_create, tool_name: str):
    return [
        c
        for c in mock_create.call_args_list
        if (c.kwargs.get("tool_choice") or {}).get("name") == tool_name
    ]


def _mock_llm_create_side_effect(
    *,
    extract_satisfied_per_call: list[list[str] | dict] | None = None,
    reply_text: str = "OK",
):
    """client.messages.create mock: extract_conditions hívások, majd generate_reply."""

    per_call = list(extract_satisfied_per_call or [])

    def _side_effect(**kwargs):
        tool_choice = kwargs.get("tool_choice") or {}
        if tool_choice.get("name") == "extract_conditions":
            payload: list[str] | dict = (
                per_call.pop(0) if per_call else {"satisfied": [], "missing": []}
            )
            if isinstance(payload, list):
                data = {"satisfied": payload, "missing": []}
            else:
                data = payload
            return SimpleNamespace(
                content=[_tool_block("extract_conditions", data)]
            )
        return SimpleNamespace(
            content=[
                _tool_block("generate_reply", {"assistantMessage": reply_text})
            ]
        )

    return _side_effect


def test_extract_conditions_empty_conditions_skips_extract_uses_fallback_tone_mocked():
    from services import ai_node_runtime as air

    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Sajnos időjárással nem tudok segíteni."},
            ),
        ]
    )
    node = {
        "id": "off-topic",
        "fallback_message": "Sajnos ez off-topic. Van panaszod?",
        "knowledge": {"description": "Irreleváns kérdések"},
        "conditions": [],
    }
    with patch.object(
        air.client.messages,
        "create",
        side_effect=[reply_resp],
    ) as mock_create:
        out = air.extract_conditions("Mi az időjárás?", node, [])

    assert mock_create.call_count == 1
    system_arg = mock_create.call_args.kwargs.get("system") or mock_create.call_args[1].get("system")
    assert "off-topic" in system_arg
    assert "Van panaszod" in system_arg or "off-topic" in system_arg
    assert out["assistantMessage"] == "Sajnos időjárással nem tudok segíteni."
    assert out["missing"] == []


def test_off_topic_node_routing_and_conditions():
    story = _load_story()
    page = story["pages"]["off-topic"]
    assert page.get("type") == "ai"
    conds = page.get("conditions") or []
    assert any(c.get("id") == "user_acknowledged" for c in conds)
    routing = page.get("routing") or []
    assert any(
        r.get("goto") == "complaint-intake"
        for r in routing
        if isinstance(r, dict)
    )


def test_extract_conditions_filters_missing_already_satisfied_mocked():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": ["c_new"], "missing": ["c_old", "c_new"]},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Rendben."}),
        ]
    )
    node = {
        "id": "n1",
        "knowledge": {"description": "d"},
        "conditions": [
            {"id": "c_old", "description": "régi"},
            {"id": "c_new", "description": "új"},
        ],
    }
    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.extract_conditions("prompt", node, already_satisfied=["c_old"])

    assert "c_old" not in out["missing"]
    assert "c_new" not in out["missing"]
    assert out["missing"] == []
    assert "c_old" in out["satisfied"] and "c_new" in out["satisfied"]


def test_process_step_no_internal_conditions_immediate_done():
    from services import ai_node_runtime as air

    node = {"id": "n1", "knowledge": {"description": "d"}}
    step = {
        "id": "s0",
        "goal": "g",
        "ai_action": "Üdv, kezdjük.",
        "internal_conditions": [],
        "default_next": "step_b",
    }
    out = air.process_step("hello", node, step, [])
    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_b"
    assert out["assistantMessage"] == "Üdv, kezdjük."
    assert out["newlySatisfied"] == []


def test_process_step_delivered_not_received_skips_tracking_and_targets_step_3a_mocked():
    from services import ai_node_runtime as air

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
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Ellenőrizted a szomszédoknál vagy a portásnál?"},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = node["steps"][0]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ) as mock_create:
        out = air.process_step(
            (
                "A tracking szerint kézbesítve van, de nem kaptam meg. "
                "Rendelési szám: ORD-DEL-002."
            ),
            node,
            step_1,
            [],
        )
        reply_system = mock_create.call_args_list[1].kwargs.get("system") or ""

    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_3a"
    assert "tracking_checked" in out["satisfied"]
    assert "TILOS" in reply_system
    assert "tracking_checked" in reply_system
    assert "step_3a" in reply_system
    assert "szomszéd" in reply_system.lower() or "Delivered-not-received" in reply_system
    assert "visszatérítési határidőt" in reply_system


def test_packaging_extracted_step_1_skips_step_2_same_turn():
    """packaging_damaged from extract → inference before transition skip → step_3b."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "has_order_id",
                        "tracking_checked",
                        "packaging_damaged",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Kérem a sérülésről fotókat."},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = node["steps"][0]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            (
                "A dobozom teljesen össze volt nyomva, a telefon sarkán repedés van. "
                "ORD-DEL-003."
            ),
            node,
            step_1,
            [],
            story_pages=story["pages"],
        )

    assert out["stepDone"] is True
    assert "packaging_damaged" in out["satisfied"]
    assert "delivery_situation_identified" in out["satisfied"]
    assert out.get("nextStepId") == "step_3b"


def test_format_reply_rules_block():
    from services.ai_node_runtime import _format_reply_rules_block

    assert _format_reply_rules_block(None) == ""
    assert _format_reply_rules_block({}) == ""
    assert _format_reply_rules_block({"reply_rules": []}) == ""
    assert _format_reply_rules_block({"reply_rules": ["  ", ""]}) == ""

    block = _format_reply_rules_block(
        {"reply_rules": ["Maximum 1 mondat", "Ne kérj új adatot"]}
    )
    assert "Válasz-szabályok" in block
    assert "- Maximum 1 mondat" in block
    assert "- Ne kérj új adatot" in block


def test_append_global_reply_rules():
    from services.ai_node_runtime import (
        GLOBAL_REPLY_RULES,
        _append_global_reply_rules,
    )

    out = _append_global_reply_rules("Első rész.")
    assert out.startswith("Első rész.")
    assert "Maximum 3 mondat per válasz" in out
    assert GLOBAL_REPLY_RULES.strip() in out


def test_get_global_reply_rules_from_story_meta():
    from services.ai_node_runtime import GLOBAL_REPLY_RULES, _get_global_reply_rules

    story = _load_story()
    rules = _get_global_reply_rules(story)
    assert "Maximum 3 mondat per válasz" in rules
    assert rules.strip() == GLOBAL_REPLY_RULES.strip()

    custom = {"meta": {"reply_style": {"global_rules": ["Csak egy mondat"]}}}
    custom_rules = _get_global_reply_rules(custom)
    assert "Csak egy mondat" in custom_rules
    assert "Maximum 3 mondat per válasz" not in custom_rules


def test_get_global_reply_rules_fallback_without_meta():
    from services.ai_node_runtime import GLOBAL_REPLY_RULES, _get_global_reply_rules

    assert _get_global_reply_rules({}).strip() == GLOBAL_REPLY_RULES.strip()
    assert _get_global_reply_rules(None).strip() == GLOBAL_REPLY_RULES.strip()


def test_get_ack_and_paragraph_instruction_from_story_meta():
    from services.ai_node_runtime import (
        _REPLY_ACK_AND_PARAGRAPH_INSTRUCTION,
        _get_ack_and_paragraph_instruction,
    )

    story = _load_story()
    hint = story["meta"]["reply_style"]["ack_and_paragraph_instruction"]
    assert _get_ack_and_paragraph_instruction(story) == hint
    assert _get_ack_and_paragraph_instruction({}) == _REPLY_ACK_AND_PARAGRAPH_INSTRUCTION


def test_get_model_from_story_meta():
    from services.ai_node_runtime import _DEFAULT_MODEL, _get_model

    story = _load_story()
    assert _get_model(story) == story["meta"]["runtime"]["model"]
    assert _get_model({"meta": {"runtime": {"model": "claude-custom"}}}) == "claude-custom"
    assert _get_model({}) == _DEFAULT_MODEL
    assert _get_model(None) == _DEFAULT_MODEL


def test_get_max_tokens_from_story_meta():
    from services.ai_node_runtime import _DEFAULT_MAX_TOKENS, _get_max_tokens

    story = _load_story()
    assert _get_max_tokens(story) == story["meta"]["runtime"]["max_tokens"]
    assert _get_max_tokens({"meta": {"runtime": {"max_tokens": 512}}}) == 512
    assert _get_max_tokens({}) == _DEFAULT_MAX_TOKENS
    assert _get_max_tokens(None) == _DEFAULT_MAX_TOKENS
    assert _get_max_tokens({"meta": {"runtime": {"max_tokens": 0}}}) == _DEFAULT_MAX_TOKENS


def test_process_step_includes_global_reply_rules_in_prompt():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": [], "missing": ["has_order_id"]},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Szia."}),
        ]
    )

    node = {"id": "n", "knowledge": {"description": "d"}}
    step = {
        "id": "step_1",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [{"id": "has_order_id", "description": "r"}],
        "default_next": None,
    }

    story = _load_story()

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ) as mock_create:
        air.process_step("hello", node, step, [], story=story)
        reply_system = mock_create.call_args_list[1].kwargs.get("system") or ""

    assert "Maximum 3 mondat per válasz" in reply_system
    assert "Ne összegezz ha nem az utolsó step" in reply_system


def test_process_step_includes_reply_rules_in_generate_reply_prompt():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": ["has_order_id"], "missing": ["tracking_checked"]},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Kérem a rendelési számot."}),
        ]
    )

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = node["steps"][0]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ) as mock_create:
        air.process_step("Nem érkezett meg a csomag", node, step_1, [])
        reply_system = mock_create.call_args_list[1].kwargs.get("system") or ""

    assert "Válasz-szabályok" in reply_system
    assert "szállítási helyzet típusát" in reply_system
    assert "Ne magyarázd el a folyamat következő lépéseit" in reply_system


def test_step_start_reply_prompts_include_reply_rules():
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3b = next(s for s in node["steps"] if s["id"] == "step_3b")

    system_prompt, _, _ = air._step_start_reply_prompts(
        "A doboz össze volt nyomva",
        node,
        step_3b,
    )

    assert "Válasz-szabályok" in system_prompt
    assert "fuvarozói folyamatot" in system_prompt


def test_delivery_issue_step_actions_aligned_with_reply_rules():
    """Köztes stepek: ai_action ne kérjen olyan tájékoztatást, amit a reply_rules tilt."""
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    by_id = {s["id"]: s for s in node["steps"]}

    assert "nyomozás" not in by_id["step_3a"]["ai_action"].lower()
    assert "visszatérítés" not in by_id["step_3a"]["ai_action"].lower()

    assert "kárbejelentés indul" not in by_id["step_3b"]["ai_action"].lower()
    assert "összefoglalja" not in by_id["step_3b"]["ai_action"].lower()

    assert "összefoglalja" not in by_id["step_3c"]["ai_action"].lower()
    assert "vizsgálat indul" not in by_id["step_3c"]["ai_action"].lower()

    assert "összefoglalja" not in by_id["step_3d"]["ai_action"].lower()
    assert "x napon" not in by_id["step_3d"]["ai_action"].lower()

    assert "összefoglalja" not in by_id["step_escalate"]["ai_action"].lower()


def test_product_defect_step_3_story_shape():
    story = _load_story()
    step_3 = next(
        s for s in story["pages"]["product-defect"]["steps"] if s["id"] == "step_3"
    )
    assert step_3["done_when"] == "troubleshooting_done teljesül"
    assert isinstance(step_3.get("reply_rules"), list)
    assert len(step_3["reply_rules"]) >= 2
    by_id = {c["id"]: c for c in step_3["internal_conditions"]}
    assert by_id["defect_persists"].get("required") is False
    assert "már megvolt" in by_id["defect_persists"]["description"]


def test_step_completion_product_defect_step_3_done_when():
    from services.ai_node_runtime import _step_completion_satisfied

    story = _load_story()
    step_3 = next(
        s for s in story["pages"]["product-defect"]["steps"] if s["id"] == "step_3"
    )
    assert not _step_completion_satisfied(
        "product-defect", "step_3", step_3, set()
    )
    assert _step_completion_satisfied(
        "product-defect",
        "step_3",
        step_3,
        {"troubleshooting_done"},
    )


def test_condition_triggered_by_text_accent_normalization():
    from services.ai_node_runtime import _condition_triggered_by_text

    cond = {
        "id": "exclusion_check_done",
        "text_triggers": ["semilyen külső", "nem volt folyadék"],
    }
    assert _condition_triggered_by_text(
        cond, "mar akkor ilyen volt, semilyen kulso behatas nem erte"
    )
    assert not _condition_triggered_by_text(cond, "igen, leesett a telefon")
    assert _condition_triggered_by_text(cond, "nem volt folyadék a telefonon")


def test_apply_text_triggers_exclusion_on_product_defect_step_1():
    from services.ai_node_runtime import (
        _apply_text_triggers,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    wl = _session_facts_whitelist(node)
    satisfied: list[str] = ["defect_timing_known"]
    added = _apply_text_triggers(
        node,
        step_1,
        satisfied,
        "semilyen kulso behatas nem volt!!!",
        whitelist=wl,
    )
    assert added == ["exclusion_check_done"]
    assert "exclusion_check_done" in satisfied


def test_apply_text_triggers_accent_normalization():
    from services.ai_node_runtime import _apply_text_triggers

    node = {"conditions": []}
    step = {
        "internal_conditions": [
            {
                "id": "exclusion_check_done",
                "text_triggers": ["semilyen külső"],
            }
        ]
    }
    satisfied: list[str] = []
    added = _apply_text_triggers(
        node,
        step,
        satisfied,
        "semilyen kulso behatas",
        whitelist={"exclusion_check_done"},
    )
    assert added == ["exclusion_check_done"]
    assert "exclusion_check_done" in satisfied


def test_apply_text_triggers_skips_without_triggers():
    from services.ai_node_runtime import _apply_text_triggers

    node = {"conditions": []}
    step = {
        "internal_conditions": [
            {"id": "has_order_id", "description": "rendelési szám"}
        ]
    }
    satisfied: list[str] = []
    added = _apply_text_triggers(
        node,
        step,
        satisfied,
        "semilyen kulso behatas",
        whitelist={"has_order_id", "exclusion_check_done"},
    )
    assert added == []
    assert satisfied == []


def test_build_step_extract_hint_blocks_uses_json_extract_hint():
    from services.ai_node_runtime import _build_step_extract_hint_blocks

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    hint = step_1.get("extract_hint", "")
    assert hint
    blocks = _build_step_extract_hint_blocks(
        active_node=node,
        step=step_1,
        work_satisfied=[],
        session_has_image=False,
    )
    assert hint in blocks
    assert "Product-defect step_1" not in blocks
    assert "node_id" not in blocks.lower()


def test_troubleshooting_done_trigger_default_fallback_from_json():
    """troubleshooting_done text trigger → defect_persists fallback a JSON mezőkből."""
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    ts_cond = next(
        c for c in step_3["internal_conditions"] if c["id"] == "troubleshooting_done"
    )
    assert ts_cond.get("trigger_default_fallback") == "defect_persists"
    assert "defect_persists" in (ts_cond.get("trigger_default_if_no_outcome") or [])

    wl = _session_facts_whitelist(node)
    satisfied: list[str] = []
    added = _apply_deterministic_session_facts(
        node,
        step_3,
        satisfied,
        "mar probaltam frissiteni",
        whitelist=wl,
    )
    assert "troubleshooting_done" in added
    assert "defect_persists" in added
    assert "defect_persists" in satisfied


def test_filter_extract_to_known_conditions_drops_hallucinated_ids():
    from services.ai_node_runtime import _filter_extract_to_known_conditions

    raw = {
        "satisfied": [
            "evidence_provided",
            "image_provided",
            "case_summary_confirmed",
            "invented_condition",
        ],
        "missing": ["case_summary_confirmed", "bogus_missing"],
    }
    out = _filter_extract_to_known_conditions(
        raw,
        allowed={"evidence_provided", "case_summary_confirmed"},
        work_satisfied=["has_order_id"],
    )
    assert set(out["satisfied"]) == {
        "evidence_provided",
        "case_summary_confirmed",
    }
    assert out["missing"] == ["case_summary_confirmed"]


def test_process_step_product_defect_step_1_timing_and_exclusion_denial_mocked():
    """Turn #2 jellegű üzenet: érkezéskor hiba + nincs külső behatás → exclusion_check_done."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "defect_timing_known",
                        "defect_on_arrival",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Köszönöm, rögzítettük."},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    already = ["has_order_id", "defect_described"]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "már akkor ilyen volt amikor megkaptam, semilyen külső behatás nem érte",
            node,
            step_1,
            already,
        )

    assert "exclusion_check_done" in out["satisfied"]
    assert "exclusion_check_done" in out["newlySatisfied"]
    assert out["stepDone"] is True


def test_process_step_product_defect_step_4_strips_hallucinated_image_flags():
    """LLM téves image/evidence flag step_4 image_conditions alapján kiszűrése kép nélkül."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "evidence_provided",
                        "image_provided",
                        "llm_invented_flag",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Köszönöm, rögzítettük."},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
        "troubleshooting_done",
        "defect_persists",
    ]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "a készülék nem indul",
            node,
            step_4,
            already,
        )

    assert "llm_invented_flag" not in out["satisfied"]
    assert "image_provided" not in out["satisfied"]
    assert "evidence_provided" not in out["satisfied"]


def test_process_step_product_defect_step_3_implicit_persists_advances_mocked():
    """„már megvolt” + frissítés nem elérhető → step_3 skip, step_4 egy válasz."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
        "software_issue_possible",
    ]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[
                [],
                {"satisfied": ["evidence_provided"], "missing": []},
            ],
            reply_text="Köszönöm.",
        ),
    ) as mock_create:
        out = air.process_step(
            "már megvolt. nem elérhető szoftver frissítés",
            node,
            step_3,
            already,
        )

    assert len(_llm_tool_calls(mock_create, "extract_conditions")) >= 2
    assert len(_llm_tool_calls(mock_create, "generate_reply")) == 1
    assert out["stepDone"] is False
    assert out.get("nextStepId") is None
    assert "defect_persists" in out["satisfied"]
    assert "troubleshooting_done" in out["satisfied"]


def test_process_step_product_defect_step_3_resolved_branch_mocked():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "troubleshooting_done",
                        "defect_resolved_by_troubleshooting",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Örülök, hogy megoldódott!"},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
    ]

    with (
        patch.object(
            air.client.messages,
            "create",
            side_effect=[extract_resp, reply_resp],
        ),
        patch.object(air, "generate_step_start_reply", return_value="Örülök!"),
    ):
        out = air.process_step(
            "újraindítottam és most már jól működik",
            node,
            step_3,
            already,
        )

    assert out["stepDone"] is True
    assert out.get("nextPageId") == "agent-handoff"
    assert "defect_resolved_by_troubleshooting" in out["satisfied"]


def test_auto_satisfy_closing_step_requires_step_done_before_goto_ack():
    from services.ai_node_runtime import _auto_satisfy_on_matched_goto_branch

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_5 = next(s for s in node["steps"] if s["id"] == "step_5")
    preset: set[str] = {
        "has_order_id",
        "defect_described",
        "evidence_provided",
        "exclusion_check_done",
        "defect_confirmed_by_evidence",
    }
    added = _auto_satisfy_on_matched_goto_branch(step_5, preset, node)
    assert added == []
    assert "case_summary_confirmed" not in preset


def test_auto_satisfy_closing_step_adds_ack_when_step_already_done():
    from services.ai_node_runtime import _auto_satisfy_on_matched_goto_branch

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_5 = next(s for s in node["steps"] if s["id"] == "step_5")
    preset: set[str] = {
        "has_order_id",
        "defect_described",
        "evidence_provided",
        "exclusion_check_done",
        "defect_confirmed_by_evidence",
        "case_summary_confirmed",
    }
    added = _auto_satisfy_on_matched_goto_branch(step_5, preset, node)
    assert added == []


def test_story_stepped_nodes_have_session_facts_whitelist():
    story = _load_story()
    for node_id in (
        "delivery-issue",
        "product-defect",
        "battery-issue",
        "activation-lock",
        "product-return",
        "payment-refund",
        "wrong-item",
        "cosmetic-dispute",
    ):
        node = story["pages"][node_id]
        wl = node.get("session_facts_whitelist")
        assert isinstance(wl, list), node_id
        assert len(wl) > 0, node_id
        assert "troubleshooting_done" in wl or node_id != "product-defect"


def test_deterministic_session_facts_troubleshooting_on_product_defect():
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    wl = _session_facts_whitelist(node)
    satisfied: list[str] = []
    added = _apply_deterministic_session_facts(
        node,
        step_3,
        satisfied,
        "mar probaltam frissiteni es ujra inditani is, meg mindig hibas",
        whitelist=wl,
    )
    assert "troubleshooting_done" in added
    assert "defect_persists" in added
    assert "troubleshooting_done" in satisfied
    assert "defect_persists" in satisfied


def test_deterministic_session_facts_delivery_packaging_implies_situation():
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    wl = _session_facts_whitelist(node)
    satisfied = ["has_order_id", "tracking_checked", "packaging_damaged"]
    added = _apply_deterministic_session_facts(
        node,
        {},
        satisfied,
        "",
        whitelist=wl,
    )
    assert "delivery_situation_identified" in added
    assert "delivery_situation_identified" in satisfied


def test_deterministic_packaging_implies_tracking_checked():
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    wl = _session_facts_whitelist(node)
    satisfied = ["has_order_id", "packaging_damaged"]
    added = _apply_deterministic_session_facts(
        node,
        {},
        satisfied,
        "",
        whitelist=wl,
    )
    assert "tracking_checked" in added
    assert "delivery_situation_identified" in added
    assert "tracking_checked" in satisfied


def test_step_1_skip_chain_through_step_3d_to_investigate_delivery():
    """step_1 done_when teljesül → entry-skip step_3d-re → step_3d szintén kész →
    chain_on_complete=true miatt láncolódik step_4-re → delay_duration_known ág
    → goto investigate-delivery. Egy fordulón belül lezárul a flow.
    """
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    already = [
        "has_order_id",
        "tracking_checked",
        "delay_duration_known",
    ]

    end_content = story["pages"]["investigate-delivery"]["content"].strip()
    closing_ack = "A késést rögzítettük."

    with (
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
        patch.object(air.client.messages, "create") as mock_create,
    ):
        out = air.process_step(
            "dhl",
            node,
            step_1,
            already,
            story_pages=story["pages"],
            story=story,
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out["stepDone"] is True
    assert out["nextPageId"] == "investigate-delivery"
    assert out.get("nextStepId") is None
    assert "delay_duration_known" in out["satisfied"]
    assert "remedy_communicated" in out["satisfied"]
    assert out.get("endPageContent") == end_content
    assert out["assistantMessage"] == closing_ack


def test_step_followup_uses_effective_step_when_clarification():
    from routers.ai_node_routes import _step_followup_payload, AiNodeProcessRequest

    body = AiNodeProcessRequest(
        src="ai_complaint_story_v3",
        pageId="delivery-issue",
        prompt="dhl",
        satisfiedConditions=["has_order_id", "tracking_checked", "delay_duration_known"],
        currentStepId="step_1",
    )
    payload = _step_followup_payload(
        active_node_id="delivery-issue",
        body=body,
        step_result={
            "satisfied": body.satisfiedConditions,
            "newlySatisfied": ["delivery_situation_identified"],
            "missing": [],
            "stepDone": False,
            "nextStepId": None,
            "nextPageId": None,
            "assistantMessage": "Késés visszaigazolva.",
            "effectiveStepId": "step_3d",
            "skippedFromStepId": "step_1",
        },
        src=body.src,
    )
    assert payload["status"] == "clarification"
    assert payload["currentStepId"] == "step_3d"
    assert payload["nextStepId"] is None


def test_step_3d_preknown_delay_chains_to_investigate_delivery():
    """step_3d.chain_on_complete=true (advance_requires_new_satisfaction törölve):
    pre-known delay_duration_known esetén step_3d done_when azonnal teljesül,
    és láncolódik step_4-re → investigate-delivery — egy fordulóban.
    """
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3d = next(s for s in node["steps"] if s["id"] == "step_3d")
    already = [
        "has_order_id",
        "tracking_checked",
        "delay_duration_known",
        "delivery_situation_identified",
    ]

    end_content = story["pages"]["investigate-delivery"]["content"].strip()
    closing_ack = "A késést rögzítettük."

    with (
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
        patch.object(air.client.messages, "create") as mock_create,
    ):
        out = air.process_step(
            "dhl",
            node,
            step_3d,
            already,
            story_pages=story["pages"],
            story=story,
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out["stepDone"] is True
    assert out["nextPageId"] == "investigate-delivery"
    assert out.get("nextStepId") is None
    assert "delay_duration_known" in out["satisfied"]
    assert "remedy_communicated" in out["satisfied"]
    assert out.get("endPageContent") == end_content
    assert out["assistantMessage"] == closing_ack


def test_step_3d_completes_when_delay_extracted():
    from services.ai_node_runtime import _step_completion_satisfied
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3d = next(s for s in node["steps"] if s["id"] == "step_3d")
    delay_cond = next(
        c
        for c in step_3d["internal_conditions"]
        if c.get("id") == "delay_duration_known"
    )
    assert delay_cond.get("required") is not False

    assert _step_completion_satisfied(
        "delivery-issue",
        "step_3d",
        step_3d,
        {"delay_duration_known"},
    )

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["delay_duration_known"],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "A csomag 5 napja késik, úton van."},
            ),
        ]
    )
    already = ["has_order_id", "tracking_checked", "delivery_situation_identified"]

    with (
        patch.object(
            air.client.messages,
            "create",
            side_effect=[extract_resp, reply_resp],
        ),
        patch.object(air, "_try_chain_complete_after_step", return_value=None),
        patch.object(
            air,
            "_resolve_step_entry_with_skip",
            side_effect=lambda **kwargs: air._EntrySkipResolution(
                effective_step=kwargs["start_step"],
                work_satisfied=list(kwargs["work_satisfied"]),
                skipped_goals=[],
                auto_added=[],
                skipped_steps=[],
                terminal_result=None,
            ),
        ),
    ):
        out = air.process_step(
            "Már egy hete várom, még mindig úton van a csomag.",
            node,
            step_3d,
            already,
        )

    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_4"
    assert "delay_duration_known" in out["satisfied"]
    assert "delay_duration_known" in out.get("newlySatisfied", [])


def test_step_4_delay_routes_to_investigate_delivery():
    """delay_duration_known ág a story-ban most investigate-delivery-re megy."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "tracking_checked",
        "delay_duration_known",
        "delivery_situation_identified",
        "remedy_communicated",
    ]

    end_content = story["pages"]["investigate-delivery"]["content"].strip()
    closing_ack = "Köszönöm, rögzítettük a késést."

    with (
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
        patch.object(air.client.messages, "create") as mock_create,
    ):
        out = air.process_step(
            "rendben",
            node,
            step_4,
            already,
            story_pages=story["pages"],
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out["stepDone"] is True
    assert out["nextPageId"] == "investigate-delivery"
    assert out.get("nextStepId") is None
    assert "remedy_communicated" in out["satisfied"]
    assert out.get("endPageContent") == end_content
    assert out["assistantMessage"] == closing_ack


def test_deterministic_session_facts_battery_intake_implies_symptom():
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["battery-issue"]
    wl = _session_facts_whitelist(node)
    satisfied = ["has_order_id", "complaint_battery"]
    added = _apply_deterministic_session_facts(
        node,
        {},
        satisfied,
        "",
        whitelist=wl,
    )
    assert "battery_symptom_known" in added
    assert "battery_symptom_known" in satisfied


def test_battery_implication_problem_persists_implies_charger_tested():
    from services.ai_node_runtime import (
        _apply_deterministic_session_facts,
        _session_facts_whitelist,
    )

    story = _load_story()
    node = story["pages"]["battery-issue"]
    wl = _session_facts_whitelist(node)
    satisfied = [
        "has_order_id",
        "complaint_battery",
        "battery_symptom_known",
        "problem_persists_with_correct_charger",
    ]
    added = _apply_deterministic_session_facts(
        node,
        {},
        satisfied,
        "",
        whitelist=wl,
    )
    assert "charger_tested" in added
    assert "charger_tested" in satisfied


def test_build_skipped_steps_context_block_includes_skipped_step_conditions():
    from services.ai_node_runtime import (
        _build_skipped_steps_context_block,
        _compose_conditions_block_for_extract,
    )

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    step_2 = next(s for s in node["steps"] if s["id"] == "step_2")
    work = ["has_order_id", "battery_symptom_known", "problem_persists_with_correct_charger"]

    ctx = _build_skipped_steps_context_block([step_1], work)
    assert "Átugrott lépések kontextusa" in ctx
    assert "[step_1]" in ctx
    assert "problem_persists_with_correct_charger" in ctx
    assert "már teljesült (session)" in ctx

    combined = _compose_conditions_block_for_extract(step_2, work, [step_1])
    assert "charger_tested" in combined
    assert "problem_persists_with_correct_charger" in combined
    assert "Átugrott lépések kontextusa" in combined


def test_resolve_step_entry_skip_collects_skipped_steps():
    from services.ai_node_runtime import _resolve_step_entry_with_skip

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    work = ["has_order_id", "battery_symptom_known"]

    res = _resolve_step_entry_with_skip(
        start_step=step_1,
        work_satisfied=work,
        active_node=node,
        original_satisfied=set(work),
        image_provided=False,
        user_prompt="",
        story_pages=story.get("pages"),
        story=story,
        order_context=None,
        prompt_newly_satisfied=[],
        session_id="",
        turn_count=1,
        stream_assistant=False,
    )

    assert res.effective_step.get("id") == "step_2"
    assert len(res.skipped_steps) == 1
    assert res.skipped_steps[0].get("id") == "step_1"


def test_process_step_battery_step_1_skip_runs_extract_without_reply():
    """step_1 entry-skip: extract a step_1 kondícióin, reply csak step_2-n."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    prompt = (
        "Szia, rendelési szám ORD-BAT-001. Az akkumulátor nagyon gyorsan lemerül érkezés óta, "
        "az akkumulátor 90%. Nem eredeti töltőt használok, már kipróbáltam gyári töltővel "
        "és kábellel is, de továbbra is ugyanez a probléma."
    )
    already = ["has_order_id", "complaint_battery", "battery_symptom_known"]
    step2_reply = "Köszönöm, rögzítettem a töltőtesztet — folytassuk."

    skip_extract_seen = False

    def _mock_create(**kwargs):
        nonlocal skip_extract_seen
        tool_choice = kwargs.get("tool_choice") or {}
        system = kwargs.get("system") or ""
        if tool_choice.get("name") == "extract_conditions":
            if air._SKIP_EXTRACT_ONLY_PREFIX in system:
                skip_extract_seen = True
                return SimpleNamespace(
                    content=[
                        _tool_block(
                            "extract_conditions",
                            {
                                "satisfied": [
                                    "non_certified_charger",
                                    "charger_tested",
                                    "problem_persists_with_correct_charger",
                                    "issue_since_arrival",
                                ],
                                "missing": [],
                            },
                        )
                    ]
                )
            return SimpleNamespace(
                content=[
                    _tool_block(
                        "extract_conditions",
                        {"satisfied": [], "missing": ["charger_type_known"]},
                    )
                ]
            )
        return SimpleNamespace(
            content=[_tool_block("generate_reply", {"assistantMessage": step2_reply})]
        )

    with (
        patch.object(air.client.messages, "create", side_effect=_mock_create),
        patch.object(air, "generate_step_start_reply", return_value=step2_reply),
    ):
        out = air.process_step(prompt, node, step_1, already)

    assert skip_extract_seen
    assert "problem_persists_with_correct_charger" in out["satisfied"]
    assert "charger_tested" in out["satisfied"]
    assert out["assistantMessage"] == step2_reply
    assert out.get("nextStepId") != "step_1"


def test_battery_step3_image_backfill_before_implication():
    """image_provided előbb; implication utána evidence_provided — redundáns, nem ütközik."""
    from services.ai_node_runtime import (
        _apply_condition_implications,
        _apply_deterministic_image_conditions,
    )

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    satisfied: list[str] = []
    img_added = _apply_deterministic_image_conditions(
        node,
        step_3,
        satisfied,
        image_provided=True,
    )
    assert "image_provided" in img_added
    assert "evidence_provided" in satisfied

    impl_added = _apply_condition_implications(
        {"condition_implications": [{"when_all": ["image_provided"], "then": "evidence_provided"}]},
        satisfied,
    )
    assert impl_added == []
    assert "evidence_provided" in satisfied


def test_process_step_product_defect_step_3_skips_when_troubleshooting_in_session():
    """Session tényekből step_3 kihagyva → skip extract + step_4 extract+reply."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "defect_on_arrival",
        "exclusion_check_done",
        "troubleshooting_done",
        "defect_persists",
    ]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[], []],
            reply_text="Köszönöm, küldj fotót.",
        ),
    ) as mock_create:
        out = air.process_step(
            "rendben",
            node,
            step_3,
            already,
            image_provided=False,
        )

    assert len(_llm_tool_calls(mock_create, "extract_conditions")) >= 2
    assert len(_llm_tool_calls(mock_create, "generate_reply")) == 1
    assert out["stepDone"] is False
    assert out.get("nextStepId") is None


def test_check_step_already_done_parses_done_when_or_groups():
    from services.ai_node_runtime import (
        _check_step_already_done,
        _parse_done_when_condition_groups,
    )

    groups = _parse_done_when_condition_groups(
        "troubleshooting_done teljesül és "
        "(defect_persists VAGY defect_resolved_by_troubleshooting teljesül)"
    )
    assert groups == [
        ["troubleshooting_done"],
        ["defect_persists", "defect_resolved_by_troubleshooting"],
    ]

    step = {
        "id": "step_3",
        "internal_conditions": [],
        "done_when": (
            "troubleshooting_done teljesül és "
            "(defect_persists VAGY defect_resolved_by_troubleshooting teljesül)"
        ),
    }
    assert _check_step_already_done(
        "product-defect",
        "step_3",
        step,
        {"troubleshooting_done", "defect_persists"},
    )
    assert not _check_step_already_done(
        "product-defect",
        "step_3",
        step,
        {"troubleshooting_done"},
    )


def test_build_satisfied_do_not_reask_instruction_includes_tracking_checked_hint():
    from services.ai_node_runtime import _build_satisfied_do_not_reask_instruction

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    instruction = _build_satisfied_do_not_reask_instruction(node)
    assert "Ha tracking_checked teljesült:" in instruction
    assert "TILOS tracking számot vagy futárszolgálat nevét bekérni" in instruction
    assert "Általános szabály" in instruction


def test_build_satisfied_do_not_reask_instruction_empty_without_flagged():
    from services.ai_node_runtime import _build_satisfied_do_not_reask_instruction

    node = {"id": "minimal", "steps": [{"id": "s1", "internal_conditions": []}]}
    assert _build_satisfied_do_not_reask_instruction(node) == ""


def test_build_satisfied_do_not_reask_instruction_general_only_without_hint():
    from services.ai_node_runtime import _build_satisfied_do_not_reask_instruction

    node = {
        "id": "test",
        "steps": [
            {
                "id": "step_1",
                "internal_conditions": [
                    {
                        "id": "has_order_id",
                        "description": "Rendelési szám megadva",
                        "do_not_reask_if_satisfied": True,
                    }
                ],
            }
        ],
    }
    instruction = _build_satisfied_do_not_reask_instruction(node)
    assert "Ha has_order_id teljesült:" not in instruction
    assert "has_order_id" in instruction
    assert instruction.startswith("Általános szabály")


def test_infer_skip_backfill_adds_then_when_rule_matches():
    from services.ai_node_runtime import _infer_skip_backfill_conditions

    story = _load_story()
    step_exclusion = next(
        s for s in story["pages"]["product-defect"]["steps"] if s["id"] == "step_exclusion"
    )
    assert step_exclusion.get("skip_backfill")
    satisfied = {"exclusion_risk", "physical_impact"}
    added = _infer_skip_backfill_conditions(step_exclusion, satisfied)
    assert added == ["exclusion_details_collected"]
    assert "exclusion_details_collected" not in satisfied


def test_infer_skip_backfill_skips_when_requires_missing():
    from services.ai_node_runtime import _infer_skip_backfill_conditions

    story = _load_story()
    step_exclusion = next(
        s for s in story["pages"]["product-defect"]["steps"] if s["id"] == "step_exclusion"
    )
    satisfied = {"physical_impact", "liquid_damage"}
    added = _infer_skip_backfill_conditions(step_exclusion, satisfied)
    assert added == []


def test_infer_skip_backfill_skips_when_then_already_satisfied():
    from services.ai_node_runtime import _infer_skip_backfill_conditions

    story = _load_story()
    step_exclusion = next(
        s for s in story["pages"]["product-defect"]["steps"] if s["id"] == "step_exclusion"
    )
    satisfied = {
        "exclusion_risk",
        "physical_impact",
        "exclusion_details_collected",
    }
    added = _infer_skip_backfill_conditions(step_exclusion, satisfied)
    assert added == []


def test_process_step_product_defect_step_2_entry_skips_to_step_4_single_reply():
    """Session tények: step_2/3 kihagyva — skip extract, majd step_4 extract+reply."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_2 = next(s for s in node["steps"] if s["id"] == "step_2")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "physical_impact",
        "exclusion_risk",
        "exclusion_check_done",
        "troubleshooting_done",
        "defect_persists",
    ]
    combined_reply = (
        "Látom hogy fizikai behatás történt és már megpróbáltad a hibaelhárítást — "
        "kérek egy fotót a készülékről."
    )

    def _mock_create(**kwargs):
        tool_choice = kwargs.get("tool_choice") or {}
        if tool_choice.get("name") == "extract_conditions":
            return SimpleNamespace(
                content=[
                    _tool_block(
                        "extract_conditions",
                        {"satisfied": ["exclusion_details_collected"], "missing": []},
                    )
                ]
            )
        return SimpleNamespace(
            content=[
                _tool_block("generate_reply", {"assistantMessage": combined_reply})
            ]
        )

    with (
        patch.object(air.client.messages, "create", side_effect=_mock_create) as mock_create,
        patch.object(air, "generate_step_start_reply") as mock_start,
    ):
        out = air.process_step(
            "ORD-DEF-042, leesett és nem indul, mar probaltam ujrainditani",
            node,
            step_2,
            already,
            image_provided=False,
        )

    extract_calls = [
        c
        for c in mock_create.call_args_list
        if (c.kwargs.get("tool_choice") or {}).get("name") == "extract_conditions"
    ]
    assert len(extract_calls) >= 2
    assert all(
        air._SKIP_EXTRACT_ONLY_PREFIX in (c.kwargs.get("system") or "")
        for c in extract_calls[:-1]
    )
    mock_start.assert_not_called()
    assert out["stepDone"] is False
    assert out.get("nextStepId") is None
    assert out["assistantMessage"] == combined_reply
    assert "exclusion_details_collected" in out["satisfied"]


def test_process_step_product_defect_step_2_transition_skips_to_step_4_mocked():
    """physical_impact + exclusion_risk session → implications skip step_2–3 → step_4."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_2 = next(s for s in node["steps"] if s["id"] == "step_2")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "physical_impact",
        "exclusion_risk",
        "troubleshooting_done",
        "defect_persists",
    ]
    reply_text = (
        "Rögzítettem hogy fizikai behatás történt — "
        "kérek egy fotót a készülékről."
    )

    def _mock_create(**kwargs):
        tool_choice = kwargs.get("tool_choice") or {}
        if tool_choice.get("name") == "extract_conditions":
            return SimpleNamespace(
                content=[
                    _tool_block(
                        "extract_conditions",
                        {
                            "satisfied": [
                                "exclusion_check_done",
                                "exclusion_details_collected",
                            ],
                            "missing": [],
                        },
                    )
                ]
            )
        return SimpleNamespace(
            content=[
                _tool_block("generate_reply", {"assistantMessage": reply_text})
            ]
        )

    with (
        patch.object(air.client.messages, "create", side_effect=_mock_create) as mock_create,
        patch.object(air, "generate_step_start_reply") as mock_start,
    ):
        out = air.process_step(
            "nem volt mas behatas",
            node,
            step_2,
            already,
        )

    extract_calls = [
        c
        for c in mock_create.call_args_list
        if (c.kwargs.get("tool_choice") or {}).get("name") == "extract_conditions"
    ]
    assert len(extract_calls) >= 2
    mock_start.assert_not_called()
    assert out["stepDone"] is False
    assert out.get("nextStepId") is None
    assert "exclusion_check_done" in out["satisfied"]
    assert "exclusion_details_collected" in out["satisfied"]


def test_process_step_product_defect_step_3_latches_troubleshooting_via_text_triggers():
    """step_3 text_triggers + session_facts determinisztikusan (nem step_1-en)."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": [], "missing": []},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {"assistantMessage": "Köszönöm, rögzítettük."},
            ),
        ]
    )
    step_4_extract = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": [], "missing": ["evidence_provided"]},
            ),
        ]
    )

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
    ]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp, step_4_extract, reply_resp],
    ):
        out = air.process_step(
            "mar probaltam frissiteni es ujra inditani, meg mindig hibas",
            node,
            step_3,
            already,
        )

    assert "troubleshooting_done" in out["satisfied"]
    assert "defect_persists" in out["satisfied"]
    assert "troubleshooting_done" in out["newlySatisfied"]


def test_deterministic_image_backfill_from_session_on_step_4():
    from services.ai_node_runtime import _apply_deterministic_image_conditions

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    satisfied = [
        "has_order_id",
        "image_provided",
    ]
    added = _apply_deterministic_image_conditions(
        node,
        step_4,
        satisfied,
        image_provided=False,
    )
    assert "evidence_provided" in satisfied
    assert "evidence_provided" in added


def test_product_defect_image_latched_on_step_3_not_evidence_yet():
    """Kép step_3-on: csak image_provided latch, evidence csak step_4-en."""
    from services.ai_node_runtime import _apply_deterministic_image_conditions

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    satisfied = ["has_order_id"]
    added = _apply_deterministic_image_conditions(
        node,
        step_3,
        satisfied,
        image_provided=True,
    )
    assert added == ["image_provided"]
    assert "image_provided" in satisfied
    assert "evidence_provided" not in satisfied


def test_product_defect_step_4_backfills_evidence_from_session_image():
    """Korábbi körben küldött kép → step_4-en evidence_provided automatikusan."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
        "troubleshooting_done",
        "defect_persists",
        "image_provided",
    ]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text="Köszönöm, rögzítettük a bizonyítékot.",
        ),
    ):
        out = air.process_step(
            "persze, jó",
            node,
            step_4,
            already,
            image_provided=False,
            story_pages=story["pages"],
            story=story,
        )

    assert "evidence_provided" in out["satisfied"]
    assert "evidence_provided" in out["newlySatisfied"]
    assert "image_provided" in out["satisfied"]


def test_process_step_product_defect_step_4_chains_to_agent_handoff_end():
    """step_4 (kép) után step_5 agent-handoff: egy kör nyugtázás, remedy nélkül."""
    from services import ai_node_runtime as air

    story = _load_story()
    pages = story["pages"]
    node = pages["product-defect"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
    ]
    expected_end = pages["agent-handoff"]["content"].strip()
    closing_ack = "Köszönöm, megkaptuk a hibáról küldött fotót."

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[], ["case_summary_confirmed"]],
            reply_text=closing_ack,
        ),
    ):
        out = air.process_step(
            "(Kép csatolva.)",
            node,
            step_4,
            already,
            story_pages=pages,
            image_provided=True,
            story=story,
        )

    assert out["stepDone"] is True
    assert out.get("nextPageId") == "agent-handoff"
    assert out.get("endPageContent") == expected_end
    assert "case_summary_confirmed" in out["satisfied"]
    assert "evidence_provided" in out["satisfied"]
    assert "remedy_preference_known" not in out["satisfied"]


def test_process_step_product_defect_step_4_chains_to_step_5_remedy_question():
    """defect_confirmed ág: step_4 után step_5 remedy kérdés — product-return csak utána."""
    from services import ai_node_runtime as air

    story = _load_story()
    pages = story["pages"]
    node = pages["product-defect"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "defect_described",
        "defect_timing_known",
        "exclusion_check_done",
        "defect_confirmed_by_evidence",
    ]
    remedy_ask = (
        "Rögzítettük a hibát. Cserét, visszatérítést vagy javítást szeretnél?"
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=remedy_ask,
        ),
    ):
        out = air.process_step(
            "(Kép csatolva.)",
            node,
            step_4,
            already,
            story_pages=pages,
            image_provided=True,
            story=story,
        )

    assert out.get("nextPageId") is None
    assert out["stepDone"] is False
    assert out.get("effectiveStepId") == "step_5" or out.get("nextStepId") == "step_5"
    assert "remedy_preference_known" not in out["satisfied"]
    msg = (out.get("assistantMessage") or "").lower()
    assert "csere" in msg or "visszatérít" in msg or "javít" in msg


def test_product_defect_step_5_remedy_then_product_return():
    """step_5 product-return ág: remedy kérdés, majd handoff."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["product-defect"]
    step_5 = next(s for s in node["steps"] if s["id"] == "step_5")
    already = [
        "has_order_id",
        "defect_described",
        "evidence_provided",
        "defect_confirmed_by_evidence",
    ]
    ask_reply = "A hiba rögzítve. Cserét, visszatérítést vagy javítást szeretnél?"

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=ask_reply,
        ),
    ):
        turn1 = air.process_step("ok", node, step_5, already, story=story)

    assert turn1["stepDone"] is False
    assert "remedy_preference_known" not in turn1["satisfied"]

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["remedy_preference_known"]],
            reply_text="Rögzítettem.",
        ),
    ):
        turn2 = air.process_step(
            "javítást kérek",
            node,
            step_5,
            turn1["satisfied"],
            story=story,
            story_pages=story["pages"],
        )

    assert turn2["stepDone"] is True
    assert "remedy_preference_known" in turn2["satisfied"]
    assert "case_summary_confirmed" in turn2["satisfied"]
    assert turn2.get("nextPageId") == "product-return"
    assert "return_source_defect" in turn2["satisfied"]


def test_child_chain_reaches_terminal_cosmetic_step_5():
    from services.ai_node_runtime import _child_chain_reaches_terminal

    story = _load_story()
    node = story["pages"]["cosmetic-dispute"]
    satisfied = [
        "has_order_id",
        "sold_grade_known",
        "cosmetic_issue_described",
        "photos_provided",
        "photos_quality_sufficient",
        "within_return_window",
        "remedy_preference_known",
        "return_handoff_confirmed",
    ]
    assert _child_chain_reaches_terminal("step_5", satisfied, node) is True


def test_cosmetic_step_4_routes_to_step_5_when_within_window():
    from services.ai_node_runtime import _resolve_step_transition

    story = _load_story()
    node = story["pages"]["cosmetic-dispute"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    satisfied = {
        "has_order_id",
        "case_summary_confirmed",
        "within_return_window",
    }
    transition = _resolve_step_transition(
        step_4.get("branches") or [],
        step_4.get("default_next"),
        satisfied,
        node,
    )
    assert transition.next_step_id == "step_5"


def test_cosmetic_step_5_remedy_then_product_return():
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["cosmetic-dispute"]
    step_5 = next(s for s in node["steps"] if s["id"] == "step_5")
    already = [
        "has_order_id",
        "sold_grade_known",
        "cosmetic_issue_described",
        "photos_provided",
        "within_return_window",
    ]
    ask_reply = (
        "Rögzítettük a kozmetikai eltérést. Cserét vagy visszatérítést szeretnél?"
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=ask_reply,
        ),
    ):
        turn1 = air.process_step("rendben", node, step_5, already, story=story)

    assert turn1["stepDone"] is False

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["remedy_preference_known"]],
            reply_text="Köszönöm.",
        ),
    ):
        turn2 = air.process_step(
            "visszatérítést",
            node,
            step_5,
            turn1["satisfied"],
            story=story,
            story_pages=story["pages"],
        )

    assert turn2["stepDone"] is True
    assert "return_handoff_confirmed" in turn2["satisfied"]
    assert turn2.get("nextPageId") == "product-return"
    assert "return_source_cosmetic" in turn2["satisfied"]


def test_cosmetic_step_functional_redirect_remedy_then_product_return():
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["cosmetic-dispute"]
    step = next(s for s in node["steps"] if s["id"] == "step_functional_redirect")
    already = [
        "has_order_id",
        "cosmetic_issue_described",
        "functional_impact",
        "functional_impact_checked",
    ]
    ask_reply = (
        "Ez garanciális defekt. Cserét, visszatérítést vagy javítást szeretnél?"
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=ask_reply,
        ),
    ):
        turn1 = air.process_step("értem", node, step, already, story=story)

    assert turn1["stepDone"] is False

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["remedy_preference_known"]],
            reply_text="Rendben.",
        ),
    ):
        turn2 = air.process_step(
            "csere",
            node,
            step,
            turn1["satisfied"],
            story=story,
            story_pages=story["pages"],
        )

    assert turn2["stepDone"] is True
    assert "redirect_acknowledged" in turn2["satisfied"]
    assert turn2.get("nextPageId") == "product-return"
    assert "return_source_defect" in turn2["satisfied"]


def test_process_step_payment_refund_step_4_chains_to_process_refund_end():
    from services import ai_node_runtime as air

    story = _load_story()
    pages = story["pages"]
    node = pages["payment-refund"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "refund_type_known",
        "return_was_completed",
        "payment_method_known",
        "refund_timeline_communicated",
    ]
    expected_end = pages["process-refund"]["content"].strip()
    closing_ack = "Rögzítettük a visszatérítési kérelmet."

    with (
        patch.object(air.client.messages, "create") as mock_create,
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
    ):
        out = air.process_step(
            "rendben",
            node,
            step_4,
            already,
            story_pages=pages,
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out.get("nextPageId") == "process-refund"
    assert out.get("endPageContent") == expected_end
    assert "refund_outcome_communicated" in out["satisfied"]


def test_process_step_battery_issue_step_3_chains_to_step_4_remedy_question():
    """step_3 (kép) után step_4 remedy kérdéssel — product-return csak remedy után."""
    from services import ai_node_runtime as air

    story = _load_story()
    pages = story["pages"]
    node = pages["battery-issue"]
    step_3 = next(s for s in node["steps"] if s["id"] == "step_3")
    already = [
        "has_order_id",
        "battery_symptom_known",
        "charger_tested",
        "charger_type_known",
    ]
    remedy_ask = (
        "Rögzítettük a hibát, visszaküldési folyamat indul. "
        "Cserét vagy visszatérítést szeretnél?"
    )

    with (
        patch.object(
            air.client.messages,
            "create",
            side_effect=_mock_llm_create_side_effect(
                extract_satisfied_per_call=[[]],
                reply_text=remedy_ask,
            ),
        ),
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=remedy_ask,
        ),
    ):
        out = air.process_step(
            "(Kép csatolva.)",
            node,
            step_3,
            already,
            story_pages=pages,
            image_provided=True,
            story=story,
        )

    assert out.get("nextPageId") is None
    assert out["stepDone"] is False
    assert out.get("effectiveStepId") == "step_4" or out.get("nextStepId") == "step_4"
    assert "evidence_provided" in out["satisfied"]
    assert "remedy_preference_known" not in out["satisfied"]
    assert "case_summary_confirmed" not in out["satisfied"]
    msg = (out.get("assistantMessage") or "").lower()
    assert "csere" in msg or "visszatérít" in msg


def test_battery_issue_step_4_physical_damage_routes_agent_handoff():
    from services.ai_node_runtime import _resolve_step_transition

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    satisfied = {
        "case_summary_confirmed",
        "physical_damage_visible",
        "extended_warranty_active",
    }
    transition = _resolve_step_transition(
        step_4.get("branches", []),
        step_4.get("default_next"),
        satisfied,
        node,
    )
    assert transition.next_page_id == "agent-handoff"


def test_battery_issue_routing_warranty_goes_product_return():
    from services.story_runtime import resolve_ai_node_routing

    story = _load_story()
    routing = story["pages"]["battery-issue"]["routing"]
    next_page, injected = resolve_ai_node_routing(
        routing,
        ["has_order_id", "battery_symptom_known"],
    )
    assert next_page == "product-return"
    assert "return_source_defect" in injected


def test_battery_step_1_branch_routes_to_step_4_when_below_sold_threshold():
    from services.ai_node_runtime import _resolve_step_transition

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    satisfied = {
        "has_order_id",
        "battery_symptom_known",
        "below_sold_threshold",
    }
    transition = _resolve_step_transition(
        step_1.get("branches") or [],
        step_1.get("default_next"),
        satisfied,
        node,
    )
    assert transition.next_step_id == "step_4"


def test_battery_step_1_issue_since_arrival_still_requires_evidence_for_step_4():
    from services.ai_node_runtime import _resolve_step_transition

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    without_evidence = _resolve_step_transition(
        step_1.get("branches") or [],
        step_1.get("default_next"),
        {
            "has_order_id",
            "battery_symptom_known",
            "issue_since_arrival",
        },
        node,
    )
    with_evidence = _resolve_step_transition(
        step_1.get("branches") or [],
        step_1.get("default_next"),
        {
            "has_order_id",
            "battery_symptom_known",
            "issue_since_arrival",
            "evidence_provided",
        },
        node,
    )
    assert without_evidence.next_step_id == "step_2"
    assert with_evidence.next_step_id == "step_4"


def test_battery_step_1_skips_charger_path_when_below_sold_threshold():
    """below_sold_threshold az első üzenetben → step_4, nem step_2 töltő kérdés."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_1 = next(s for s in node["steps"] if s["id"] == "step_1")
    prompt = (
        "ORD-BAT-001. Az akkumulátor 71%, battery health alatt van. "
        "Csatolok képernyőképet."
    )
    # battery_symptom_known szándékosan hiányzik — step_1 ne legyen entry-skip,
    # hanem extract + branch → step_4 (below_sold_threshold, evidence nem kötelező).
    already = ["has_order_id", "complaint_battery", "sold_threshold_known"]

    with (
        patch.object(
            air.client.messages,
            "create",
            side_effect=_mock_llm_create_side_effect(
                extract_satisfied_per_call=[
                    ["battery_symptom_known", "below_sold_threshold", "battery_health_known"],
                ],
                reply_text=(
                    "Rögzítettük a battery health értéket, visszaküldési folyamat indul. "
                    "Cserét vagy visszatérítést szeretnél?"
                ),
            ),
        ),
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=(
                "Rögzítettük, visszaküldési folyamat indul. "
                "Cserét vagy visszatérítést szeretnél?"
            ),
        ),
    ):
        out = air.process_step(
            prompt,
            node,
            step_1,
            already,
            image_provided=True,
            story=story,
            story_pages=story["pages"],
        )

    assert "below_sold_threshold" in out["satisfied"]
    assert "evidence_provided" in out["satisfied"]
    assert out.get("nextStepId") != "step_2"
    assert out.get("effectiveStepId") == "step_4" or out.get("nextStepId") == "step_4"
    assert out.get("nextPageId") is None
    assert out["stepDone"] is False
    assert "remedy_preference_known" not in out["satisfied"]


def test_battery_step_2_skips_to_step_4_when_below_sold_threshold_in_session():
    """Session-ben below_sold_threshold → step_2 routing step_4, nem step_3."""
    from services.ai_node_runtime import _resolve_step_transition

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_2 = next(s for s in node["steps"] if s["id"] == "step_2")
    satisfied = {
        "has_order_id",
        "battery_symptom_known",
        "charger_tested",
        "charger_type_known",
        "below_sold_threshold",
    }
    transition = _resolve_step_transition(
        step_2.get("branches") or [],
        step_2.get("default_next"),
        satisfied,
        node,
    )
    assert transition.next_step_id == "step_4"


def test_battery_issue_step_4_remedy_then_handoff_to_product_return():
    """step_4: első kör remedy kérdés; második kör remedy → case_summary → product-return."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["battery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "battery_symptom_known",
        "below_sold_threshold",
        "evidence_provided",
        "defect_confirmed_by_evidence",
    ]
    ask_reply = (
        "Rögzítettük az akkumulátor hibát, visszaküldési folyamat indul. "
        "Cserét vagy visszatérítést szeretnél?"
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=ask_reply,
        ),
    ):
        turn1 = air.process_step(
            "rendben",
            node,
            step_4,
            already,
            story=story,
        )

    assert turn1["stepDone"] is False
    assert "remedy_preference_known" not in turn1["satisfied"]
    msg = (turn1.get("assistantMessage") or "").lower()
    assert "csere" in msg or "visszatérít" in msg

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["remedy_preference_known"]],
            reply_text="Rögzítettem, folytatjuk a visszaküldéssel.",
        ),
    ):
        turn2 = air.process_step(
            "visszatérítést szeretnék",
            node,
            step_4,
            turn1["satisfied"],
            story=story,
            story_pages=story["pages"],
        )

    assert turn2["stepDone"] is True
    assert "remedy_preference_known" in turn2["satisfied"]
    assert "case_summary_confirmed" in turn2["satisfied"]
    assert turn2.get("nextPageId") == "product-return"
    assert "return_source_defect" in turn2["satisfied"]


def test_activation_lock_step_4a_remedy_then_handoff_to_product_return():
    """step_4a: első kör remedy kérdés; második kör remedy → lock_handoff → product-return."""
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["activation-lock"]
    step_4a = next(s for s in node["steps"] if s["id"] == "step_4a")
    already = [
        "has_order_id",
        "lock_type_known",
        "screenshot_provided",
        "seller_side_confirmed",
        "responsibility_assessed",
    ]
    ask_reply = (
        "Sajnálom, az eladó nem távolította el a korábbi iCloud fiókot. "
        "Cserét vagy visszatérítést szeretnél?"
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[[]],
            reply_text=ask_reply,
        ),
    ):
        turn1 = air.process_step(
            "rendben",
            node,
            step_4a,
            already,
            story=story,
        )

    assert turn1["stepDone"] is False
    assert "remedy_preference_known" not in turn1["satisfied"]
    assert "csere" in turn1["assistantMessage"].lower() or "visszatérít" in turn1["assistantMessage"].lower()

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["remedy_preference_known"]],
            reply_text="Rögzítettem, folytatjuk a visszaküldéssel.",
        ),
    ):
        turn2 = air.process_step(
            "visszatérítést szeretnék",
            node,
            step_4a,
            turn1["satisfied"],
            story=story,
            story_pages=story["pages"],
        )

    assert turn2["stepDone"] is True
    assert "remedy_preference_known" in turn2["satisfied"]
    assert "lock_handoff_confirmed" in turn2["satisfied"]
    assert turn2.get("nextPageId") == "product-return"
    assert "return_source_defect" in turn2["satisfied"]


CLOSING_STEP_AI_ACTION_BASE = (
    "Rövid nyugtázó mondat (max 1 mondat). "
    "Routing az end node-ra a teljesült kondíciók alapján."
)

STANDARD_CLOSING_REPLY_RULES = [
    "Maximum 1 mondat — csak nyugtázás.",
    "Ne kérj be hiányzó adatot — az előző lépésekben már összegyűjtöttük.",
    "Ne magyarázd a következő lépéseket — az end node adja.",
    "Ne utalj összefoglalóra, vizsgálatra, vagy remedy-re.",
    "Ne ismételd az end node szövegét.",
]

FORBIDDEN_IN_CLOSING_AI_ACTION = (
    "összefoglaló",
    "összefoglalja",
    "tájékoztatjuk",
    "tájékoztatja",
    "következő lépés",
    "vizsgálat indul",
    "vizsgálatra",
    "csere",
    "visszatérítés",
    "e-mailben értesítünk",
    "e-mailben kap",
    "megkérdezi",
    "remedy preferencia",
)

CLOSING_STEPS = [
    ("delivery-issue", "step_4"),
    ("product-return", "step_5"),
    ("payment-refund", "step_4"),
    ("cosmetic-dispute", "step_4"),
    ("cosmetic-dispute", "step_5_outside_window"),
]


@pytest.mark.parametrize("node_id,step_id", CLOSING_STEPS)
def test_closing_steps_use_standard_ai_action(node_id: str, step_id: str):
    """Closing step-ek ai_action mezője a standard base prefix-szel kezdődik.

    Story-szintű kiegészítések (pl. ' — ne ígérj konkrét megoldást, az end node
    szövege adja.') megengedettek a base után — a forbidden-phrases teszt
    biztosítja, hogy a kiegészítések ne tartalmazzanak tiltott elemeket.
    """
    story = _load_story()
    step = {s["id"]: s for s in story["pages"][node_id]["steps"]}[step_id]
    ai_action = step["ai_action"]
    assert ai_action.startswith(CLOSING_STEP_AI_ACTION_BASE), (
        f"{node_id}/{step_id}: ai_action nem a standard prefix-szel kezdődik.\n"
        f"  Kapott: {ai_action!r}\n"
        f"  Várt prefix: {CLOSING_STEP_AI_ACTION_BASE!r}"
    )


@pytest.mark.parametrize("node_id,step_id", CLOSING_STEPS)
def test_closing_steps_ai_action_has_no_forbidden_phrases(node_id: str, step_id: str):
    story = _load_story()
    step = {s["id"]: s for s in story["pages"][node_id]["steps"]}[step_id]
    action = step["ai_action"].lower()
    for phrase in FORBIDDEN_IN_CLOSING_AI_ACTION:
        assert phrase not in action, f"{node_id}/{step_id}: '{phrase}' in ai_action"


@pytest.mark.parametrize("node_id,step_id", CLOSING_STEPS)
def test_closing_steps_have_standard_reply_rules(node_id: str, step_id: str):
    story = _load_story()
    step = {s["id"]: s for s in story["pages"][node_id]["steps"]}[step_id]
    rules = step.get("reply_rules") or []
    for expected in STANDARD_CLOSING_REPLY_RULES:
        assert expected in rules, f"{node_id}/{step_id}: missing rule {expected!r}"


def test_delivery_issue_steps_have_reply_rules():
    story = _load_story()
    node = story["pages"]["delivery-issue"]
    expected_ids = {
        "step_1",
        "step_2",
        "step_3a",
        "step_3b",
        "step_3c",
        "step_3d",
        "step_escalate",
        "step_4",
    }
    step_ids = {s["id"] for s in node["steps"]}
    assert expected_ids <= step_ids
    for step in node["steps"]:
        if step["id"] in expected_ids:
            rules = step.get("reply_rules")
            assert isinstance(rules, list) and len(rules) >= 2, step["id"]


def test_resolve_step_transition_goto_to_end_page():
    from services.ai_node_runtime import StepTransition, _resolve_step_transition

    node = {
        "id": "delivery-issue",
        "steps": [{"id": "step_1"}, {"id": "step_4"}],
    }
    branches = [
        {
            "if": [
                "marked_delivered_not_received",
                "surroundings_checked",
                "tracking_screenshot_provided",
            ],
            "goto": "delivery-investigation",
        },
    ]
    satisfied = {
        "marked_delivered_not_received",
        "surroundings_checked",
        "tracking_screenshot_provided",
    }
    t = _resolve_step_transition(branches, "agent-handoff", satisfied, node)
    assert t == StepTransition(next_page_id="delivery-investigation")

    t_default = _resolve_step_transition([], "agent-handoff", set(), node)
    assert t_default == StepTransition(next_page_id="agent-handoff")


def test_apply_late_image_backfill_adds_then_when_when_all_match():
    from services.ai_node_runtime import _apply_late_image_backfill

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    satisfied = ["surroundings_checked", "marked_delivered_not_received", "image_provided"]
    sat_set = set(satisfied)
    added = _apply_late_image_backfill(node, satisfied, sat_set)
    assert added == ["tracking_screenshot_provided"]
    assert "tracking_screenshot_provided" in satisfied


def test_apply_late_image_backfill_skips_when_when_all_missing():
    from services.ai_node_runtime import _apply_late_image_backfill

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    satisfied = ["surroundings_checked", "image_provided"]
    sat_set = set(satisfied)
    added = _apply_late_image_backfill(node, satisfied, sat_set)
    assert added == []


def test_apply_late_image_backfill_skips_when_then_already_satisfied():
    from services.ai_node_runtime import _apply_late_image_backfill

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    satisfied = [
        "surroundings_checked",
        "marked_delivered_not_received",
        "tracking_screenshot_provided",
        "image_provided",
    ]
    sat_set = set(satisfied)
    added = _apply_late_image_backfill(node, satisfied, sat_set)
    assert added == []


def test_apply_deterministic_image_step_3a():
    from services.ai_node_runtime import _apply_deterministic_image_conditions

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3a = next(s for s in node["steps"] if s["id"] == "step_3a")
    satisfied: list[str] = ["surroundings_checked", "marked_delivered_not_received"]
    added = _apply_deterministic_image_conditions(
        node,
        step_3a,
        satisfied,
        image_provided=True,
    )
    assert "tracking_screenshot_provided" in satisfied
    assert "tracking_screenshot_provided" in added


def test_delivery_issue_step_3a_image_conditions_from_json():
    """image_conditions a story JSON-ból jön, nem hardcoded runtime dict-ből."""
    from services.ai_node_runtime import _apply_deterministic_image_conditions

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3a = next(s for s in node["steps"] if s["id"] == "step_3a")
    assert step_3a.get("image_conditions") == ["tracking_screenshot_provided"]
    assert step_3a.get("late_image_backfill")

    satisfied: list[str] = []
    added = _apply_deterministic_image_conditions(
        node,
        step_3a,
        satisfied,
        image_provided=True,
    )
    assert "tracking_screenshot_provided" in satisfied
    assert "tracking_screenshot_provided" in added

    step_without_mapping = {
        **step_3a,
        "image_conditions": [],
        "late_image_backfill": [],
    }
    satisfied_empty: list[str] = []
    _apply_deterministic_image_conditions(
        node,
        step_without_mapping,
        satisfied_empty,
        image_provided=True,
    )
    assert "tracking_screenshot_provided" not in satisfied_empty
    assert "image_provided" in satisfied_empty


def test_filter_extract_removes_false_tracking_screenshot_without_image():
    from services.ai_node_runtime import _filter_extract_image_conditions

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_3a = next(s for s in node["steps"] if s["id"] == "step_3a")
    raw = {
        "satisfied": ["surroundings_checked", "tracking_screenshot_provided"],
        "missing": [],
    }
    out = _filter_extract_image_conditions(
        raw,
        step_3a,
        image_provided=False,
        user_prompt="már ellenőriztem mindenhol",
        active_node=node,
    )
    assert "tracking_screenshot_provided" not in out["satisfied"]
    assert "surroundings_checked" in out["satisfied"]


def test_process_step_3a_image_only_chains_to_end_without_llm():
    from services import ai_node_runtime as air
    from unittest.mock import patch

    story = _load_story()
    pages = story["pages"]
    node = pages["delivery-issue"]
    step_3a = next(s for s in node["steps"] if s["id"] == "step_3a")
    already = [
        "has_order_id",
        "tracking_checked",
        "marked_delivered_not_received",
        "surroundings_checked",
    ]
    expected_end = pages["delivery-investigation"]["content"].strip()
    closing_ack = "Köszönöm a képet, rögzítettük."

    with (
        patch.object(air.client.messages, "create") as mock_create,
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ) as mock_step_start,
    ):
        out = air.process_step(
            "(Kép csatolva.)",
            node,
            step_3a,
            already,
            story_pages=pages,
            image_provided=True,
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    mock_step_start.assert_called_once()
    assert "tracking_screenshot_provided" in out["satisfied"]
    assert out["stepDone"] is True
    assert out.get("nextPageId") == "delivery-investigation"
    assert out.get("nextStepId") is None
    assert out["assistantMessage"] == closing_ack
    assert out.get("endPageContent") == expected_end
    assert "remedy_communicated" in out["satisfied"]
    assert "tracking_screenshot_provided" in out["newlySatisfied"]


def test_process_step_3a_text_chains_to_end_when_goto_ready_mocked():
    """step_3a extract után step_4 automatikus goto — nincs külön user forduló."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["surroundings_checked"],
                    "missing": [],
                },
            ),
        ]
    )

    story = _load_story()
    pages = story["pages"]
    node = pages["delivery-issue"]
    step_3a = next(s for s in node["steps"] if s["id"] == "step_3a")
    already = [
        "has_order_id",
        "tracking_checked",
        "marked_delivered_not_received",
        "tracking_screenshot_provided",
    ]
    expected_end = pages["delivery-investigation"]["content"].strip()
    closing_ack = "Köszönöm, megkaptuk a tracking képernyőképet is."

    with (
        patch.object(
            air.client.messages,
            "create",
            side_effect=_mock_llm_create_side_effect(
                extract_satisfied_per_call=[["surroundings_checked"], []],
            ),
        ),
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
    ):
        out = air.process_step(
            "mndehol megnéztem. sehol sincsen",
            node,
            step_3a,
            already,
            story_pages=pages,
        )

    assert out["stepDone"] is True
    assert out["nextPageId"] == "delivery-investigation"
    assert out.get("nextStepId") is None
    assert out["assistantMessage"] == closing_ack
    assert out.get("endPageContent") == expected_end
    assert "surroundings_checked" in out["newlySatisfied"]
    assert "remedy_communicated" in out["satisfied"]


def test_process_step_4_fast_path_returns_end_page_content_without_llm():
    """Goto gyorsút: ne szivárogjon ki a belső ai_action, hanem end node content."""
    from services import ai_node_runtime as air
    from unittest.mock import patch

    story = _load_story()
    pages = story["pages"]
    node = pages["delivery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "tracking_checked",
        "marked_delivered_not_received",
        "surroundings_checked",
        "tracking_screenshot_provided",
    ]
    expected = pages["delivery-investigation"]["content"].strip()
    closing_ack = "Köszönöm, megkaptuk a csatolt képet."

    with (
        patch.object(air.client.messages, "create") as mock_create,
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
    ):
        out = air.process_step(
            "itt a kép",
            node,
            step_4,
            already,
            story_pages=pages,
            image_provided=True,
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out["stepDone"] is True
    assert out["nextPageId"] == "delivery-investigation"
    assert out["assistantMessage"] == closing_ack
    assert out.get("endPageContent") == expected
    assert "Nem tesz fel" not in out["assistantMessage"]
    assert expected not in out["assistantMessage"]
    assert "remedy_communicated" in out["satisfied"]


def test_process_step_4_routes_to_delivery_investigation_mocked():
    from services import ai_node_runtime as air

    story = _load_story()
    node = story["pages"]["delivery-issue"]
    step_4 = next(s for s in node["steps"] if s["id"] == "step_4")
    already = [
        "has_order_id",
        "tracking_checked",
        "marked_delivered_not_received",
        "surroundings_checked",
        "tracking_screenshot_provided",
    ]

    end_content = story["pages"]["delivery-investigation"]["content"].strip()
    closing_ack = "Köszönöm, mindent megkaptunk."

    with (
        patch.object(
            air,
            "generate_step_start_reply",
            return_value=closing_ack,
        ),
        patch.object(air.client.messages, "create") as mock_create,
    ):
        out = air.process_step(
            "kész?",
            node,
            step_4,
            already,
            story_pages=story["pages"],
        )

    assert not _llm_tool_calls(mock_create, "generate_reply")
    assert out["stepDone"] is True
    assert out["nextPageId"] == "delivery-investigation"
    assert out.get("nextStepId") is None
    assert "remedy_communicated" in out["satisfied"]
    assert out.get("endPageContent") == end_content
    assert out["assistantMessage"] == closing_ack


def test_step_followup_payload_uses_next_page_id_from_step():
    from routers.ai_node_routes import _step_followup_payload, AiNodeProcessRequest

    body = AiNodeProcessRequest(
        src="ai_complaint_story_v3",
        pageId="delivery-issue",
        prompt="kész",
        satisfiedConditions=[],
        currentStepId="step_4",
    )
    payload = _step_followup_payload(
        active_node_id="delivery-issue",
        body=body,
        step_result={
            "satisfied": ["has_order_id"],
            "newlySatisfied": ["remedy_communicated"],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": "delivery-investigation",
            "assistantMessage": "Köszönöm, megkaptuk a képet.",
            "endPageContent": "Szállítási ügyedet rögzítettük.",
        },
        src="ai_complaint_story_v3",
    )
    assert payload["status"] == "ok"
    assert payload["nextPageId"] == "delivery-investigation"
    assert payload["currentStepId"] is None
    assert payload["assistantMessage"] == "Köszönöm, megkaptuk a képet."
    assert payload.get("endPageContent") == "Szállítási ügyedet rögzítettük."


def test_sse_goto_end_done_payload_does_not_duplicate_end_in_assistant_message():
    """SSE done: assistantMessage = csak nyugtázás, endPageContent = végoldal (nem összefűzve)."""
    import json

    from routers.ai_node_routes import _sse_step_stream, AiNodeProcessRequest
    from services.ai_node_runtime import AssistantStreamBundle

    ack = "Köszönöm, megkaptuk a képet."
    end = "Szállítási ügyedet rögzítettük. Futárszolgálatnál nyomozást indítunk."
    body = AiNodeProcessRequest(
        src="ai_complaint_story_v3",
        pageId="delivery-issue",
        prompt="kész",
        satisfiedConditions=[],
        currentStepId="step_4",
    )
    bundle = AssistantStreamBundle(
        {
            "satisfied": [],
            "newlySatisfied": [],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": "delivery-investigation",
            "assistantMessage": ack,
            "endPageContent": end,
        },
        iter([ack, "\n\n", end]),
    )
    events: list[tuple[str, dict]] = []
    for chunk in _sse_step_stream(
        active_node_id="delivery-issue",
        body=body,
        bundle=bundle,
        src="ai_complaint_story_v3",
    ):
        event_name = "message"
        data_str = ""
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                data_str += line[5:].strip()
        if data_str:
            events.append((event_name, json.loads(data_str)))

    done = next(p for ev, p in events if ev == "done")
    assert done["assistantMessage"] == ack
    assert done.get("endPageContent") == end
    assert end not in done["assistantMessage"]


def test_process_step_partial_conditions_mocked_api():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": ["has_order_id"], "missing": ["tracking_checked"]},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Kérem a trackinget."}),
        ]
    )

    node = {"id": "delivery-issue", "knowledge": {"description": "szállítás"}}
    step = {
        "id": "step_1",
        "goal": "adatok",
        "ai_action": "fallback",
        "internal_conditions": [
            {"id": "has_order_id", "description": "rendelés"},
            {"id": "tracking_checked", "description": "tracking"},
        ],
        "branches": [],
        "default_next": "step_2",
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step("Rendelésem: 12345", node, step, [])

    assert out["stepDone"] is False
    assert out["nextStepId"] is None
    assert "has_order_id" in out["satisfied"]
    assert out["assistantMessage"] == "Kérem a trackinget."


def test_process_step_all_done_default_next_mocked():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {"satisfied": ["has_order_id", "tracking_checked"], "missing": []},
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Rendben, tovább."}),
        ]
    )

    node = {"id": "delivery-issue", "knowledge": {"description": "x"}}
    step = {
        "id": "step_1",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "has_order_id", "description": "r"},
            {"id": "tracking_checked", "description": "t"},
        ],
        "branches": [],
        "default_next": "step_2",
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step("Minden megvan", node, step, [])

    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_2"


def test_process_step_filters_missing_already_satisfied_mocked():
    """Modell tévesen missing-be tesz sessionben már teljesült ID-t — ne kerüljön a válaszba."""
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": ["tracking_checked"],
                    "missing": ["has_order_id", "tracking_checked"],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Folytatjuk."}),
        ]
    )

    node = {"id": "delivery-issue", "knowledge": {"description": "x"}}
    step = {
        "id": "step_2",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "has_order_id", "description": "r"},
            {"id": "tracking_checked", "description": "t"},
        ],
        "branches": [],
        "default_next": "step_3",
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            "Következő üzenet",
            node,
            step,
            already_satisfied=["has_order_id"],
        )

    assert "has_order_id" not in out["missing"]
    assert "tracking_checked" not in out["missing"]
    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_3"


def test_process_step_all_required_preset_skips_llm_mocked():
    """Minden kötelező már a sessionben — nincs Anthropic hívás, üres missing."""
    from services import ai_node_runtime as air

    node = {"id": "delivery-issue", "knowledge": {"description": "x"}}
    step = {
        "id": "step_2",
        "goal": "g",
        "ai_action": "Tovább a következő lépésre.",
        "internal_conditions": [
            {"id": "has_order_id", "description": "r"},
            {"id": "tracking_checked", "description": "t"},
        ],
        "branches": [{"if": ["urgency_high"], "next_step": "step_escalate"}],
        "default_next": "step_3",
    }

    with patch.object(air.client.messages, "create") as m_create:
        out = air.process_step(
            "Bármi",
            node,
            step,
            already_satisfied=["has_order_id", "tracking_checked", "urgency_high"],
        )

        assert not _llm_tool_calls(m_create, "generate_reply")
    assert out["missing"] == []
    assert out["newlySatisfied"] == []
    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_escalate"
    assert out["assistantMessage"] == "Tovább a következő lépésre."


def test_process_step_branch_wins_over_default_mocked():
    from services import ai_node_runtime as air

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "has_order_id",
                        "tracking_checked",
                        "urgency_high",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block("generate_reply", {"assistantMessage": "Eszkalálunk."}),
        ]
    )

    node = {"id": "delivery-issue", "knowledge": {}}
    step = {
        "id": "step_1",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "has_order_id", "description": "r"},
            {"id": "tracking_checked", "description": "t"},
        ],
        "branches": [{"if": ["urgency_high"], "next_step": "step_escalate"}],
        "default_next": "step_2",
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step("Sürgős", node, step, [])

    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_escalate"


def test_resolve_ai_clarification_fallback_message_intake_node():
    from services.story_runtime import resolve_ai_clarification_fallback_message

    story = _load_story()
    msg = resolve_ai_clarification_fallback_message(story, "complaint-intake")
    assert "rendelési számod" in msg


def test_resolve_ai_clarification_fallback_message_meta_when_page_unknown():
    from services.story_runtime import resolve_ai_clarification_fallback_message

    story = _load_story()
    msg = resolve_ai_clarification_fallback_message(story, "no-such-page-id")
    meta = story.get("meta") or {}
    assert isinstance(meta, dict)
    assert msg == (meta.get("defaultFallbackMessage") or "").strip()


def test_story_json_loads():
    data = _load_story()
    assert data.get("storyId")
    assert isinstance(data.get("pages"), dict)


@pytest.mark.parametrize(
    "page_id",
    ["delivery-issue", "product-defect", "complaint-intake"],
)
def test_ai_pages_have_expected_shape(page_id: str):
    story = _load_story()
    page = story["pages"][page_id]
    assert page.get("type") == "ai"
    assert "knowledge" in page
    assert page["knowledge"].get("description")
    if page.get("steps"):
        for st in page["steps"]:
            assert st.get("id")
            assert st.get("goal")
            assert st.get("ai_action")
            for ic in st.get("internal_conditions") or []:
                assert ic.get("id") and ic.get("description")


def test_silent_on_matched_goto_helper_flag_off():
    from services.ai_node_runtime import (
        StepTransition,
        _should_silently_route_on_goto,
    )

    step = {"id": "s", "silent_on_matched_goto": False}
    transition = StepTransition(next_page_id="other-node")
    assert _should_silently_route_on_goto(step, transition) is False


def test_silent_on_matched_goto_helper_flag_on_with_next_page():
    from services.ai_node_runtime import (
        StepTransition,
        _should_silently_route_on_goto,
    )

    step = {"id": "s", "silent_on_matched_goto": True}
    transition = StepTransition(next_page_id="other-node")
    assert _should_silently_route_on_goto(step, transition) is True


def test_silent_on_matched_goto_helper_flag_on_but_internal_next_step():
    """silent_on_matched_goto csak goto (cross-node) esetén aktív; internal step-re nem."""
    from services.ai_node_runtime import (
        StepTransition,
        _should_silently_route_on_goto,
    )

    step = {"id": "s", "silent_on_matched_goto": True}
    transition = StepTransition(next_step_id="step_2")
    assert _should_silently_route_on_goto(step, transition) is False


def test_silent_on_matched_goto_skips_llm_reply_and_returns_empty_message():
    """silent flag aktív + matched goto branch → nincs generate_reply hívás,
    assistantMessage üres, routing helyesen történik."""
    from services import ai_node_runtime as air

    node = {
        "id": "n_silent",
        "knowledge": {"description": "test node"},
        "steps": [{"id": "step_silent"}],
    }
    step = {
        "id": "step_silent",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "ready", "description": "ready"},
        ],
        "branches": [
            {
                "if": ["ready"],
                "goto": "downstream-node",
            },
        ],
        "default_next": "fallback-node",
        "silent_on_matched_goto": True,
        "is_closing": True,
        "is_terminal": True,
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["ready"]],
            reply_text="EZ NEM JELENHET MEG",
        ),
    ) as mock_create:
        out = air.process_step("ok", node, step, [])
        reply_calls = [
            c
            for c in mock_create.call_args_list
            if (c.kwargs.get("tool_choice") or {}).get("name") == "generate_reply"
        ]

    assert reply_calls == [], (
        "silent_on_matched_goto aktív esetén nem szabad generate_reply LLM "
        "hívást indítani"
    )
    assert out["stepDone"] is True
    assert out["nextPageId"] == "downstream-node"
    assert out["assistantMessage"] == ""
    assert "ready" in out["satisfied"]


def test_silent_on_matched_goto_flag_off_still_calls_llm_reply():
    """Visszafelé kompatibilitás: ha a flag hiányzik vagy False, az LLM-et hívni kell
    a normál `_sync_generate_reply` (create API) ágon — nem closing step."""
    from services import ai_node_runtime as air

    node = {
        "id": "n_loud",
        "knowledge": {"description": "test node"},
        "steps": [{"id": "step_loud"}],
    }
    step = {
        "id": "step_loud",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "ready", "description": "ready"},
        ],
        "branches": [
            {
                "if": ["ready"],
                "goto": "downstream-node",
            },
        ],
        "default_next": "fallback-node",
    }

    expected_reply = "Rendben, továbbítom."
    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["ready"]],
            reply_text=expected_reply,
        ),
    ) as mock_create:
        out = air.process_step("ok", node, step, [])
        reply_calls = [
            c
            for c in mock_create.call_args_list
            if (c.kwargs.get("tool_choice") or {}).get("name") == "generate_reply"
        ]

    assert len(reply_calls) == 1
    assert out["stepDone"] is True
    assert out["nextPageId"] == "downstream-node"
    assert out["assistantMessage"] == expected_reply


def test_silent_on_matched_goto_in_build_goto_end_result_skips_generate_step_start_reply():
    """A chain/skip path is honorálja a flag-et: `_build_goto_end_result` nem hív
    `generate_step_start_reply`-t silent step esetén, és az assistantMessage üres."""
    from services import ai_node_runtime as air

    node = {
        "id": "n_chain",
        "knowledge": {"description": "test node"},
        "steps": [{"id": "step_closing"}],
    }
    closing_step_silent = {
        "id": "step_closing",
        "goal": "g",
        "ai_action": "a",
        "silent_on_matched_goto": True,
        "is_closing": True,
        "is_terminal": True,
    }

    with patch.object(
        air, "generate_step_start_reply", return_value="EZ NEM JELENHET MEG"
    ) as mock_reply:
        out = air._build_goto_end_result(
            closing_step=closing_step_silent,
            active_node=node,
            next_page_id="downstream-node",
            story_pages=None,
            story=None,
            user_prompt="ok",
            order_context=None,
            image_provided=False,
            newly_satisfied=[],
            session_id="s",
            turn_count=1,
            satisfied=["ready"],
            newly=[],
            stream_assistant=False,
        )

    assert mock_reply.call_count == 0
    assert out["assistantMessage"] == ""
    assert out["nextPageId"] == "downstream-node"
    assert out["stepDone"] is True


def test_build_goto_end_result_without_silent_still_calls_generate_step_start_reply():
    """Visszafelé kompatibilitás: flag nélkül `_build_goto_end_result` továbbra is hív."""
    from services import ai_node_runtime as air

    node = {
        "id": "n_chain_loud",
        "knowledge": {"description": "test node"},
        "steps": [{"id": "step_closing_loud"}],
    }
    closing_step_loud = {
        "id": "step_closing_loud",
        "goal": "g",
        "ai_action": "a",
        "is_closing": True,
        "is_terminal": True,
    }

    with patch.object(
        air, "generate_step_start_reply", return_value="Rendben, továbbítom."
    ) as mock_reply:
        out = air._build_goto_end_result(
            closing_step=closing_step_loud,
            active_node=node,
            next_page_id="downstream-node",
            story_pages=None,
            story=None,
            user_prompt="ok",
            order_context=None,
            image_provided=False,
            newly_satisfied=[],
            session_id="s",
            turn_count=1,
            satisfied=["ready"],
            newly=[],
            stream_assistant=False,
        )

    assert mock_reply.call_count == 1
    assert out["assistantMessage"] == "Rendben, továbbítom."
    assert out["nextPageId"] == "downstream-node"


def test_silent_on_matched_goto_inactive_when_no_goto_branch_matches():
    """Flag aktív, de egyik goto sem matchel → default_next belső step → LLM-et hívni kell."""
    from services import ai_node_runtime as air

    node = {
        "id": "n_partial",
        "knowledge": {"description": "test node"},
        "steps": [
            {"id": "step_silent_partial"},
            {"id": "step_b"},
        ],
    }
    step = {
        "id": "step_silent_partial",
        "goal": "g",
        "ai_action": "a",
        "internal_conditions": [
            {"id": "ready", "description": "ready"},
        ],
        "branches": [
            {
                "if": ["never_satisfied"],
                "goto": "downstream-node",
            },
        ],
        "default_next": "step_b",
        "silent_on_matched_goto": True,
    }

    with patch.object(
        air.client.messages,
        "create",
        side_effect=_mock_llm_create_side_effect(
            extract_satisfied_per_call=[["ready"]],
            reply_text="Folytatom.",
        ),
    ) as mock_create:
        out = air.process_step("ok", node, step, [])
        reply_calls = [
            c
            for c in mock_create.call_args_list
            if (c.kwargs.get("tool_choice") or {}).get("name") == "generate_reply"
        ]

    assert out["stepDone"] is True
    assert out.get("nextStepId") == "step_b"
    assert out.get("nextPageId") is None
    assert len(reply_calls) == 1
    assert out["assistantMessage"] == "Folytatom."

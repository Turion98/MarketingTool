"""Pytest cases for `services.onboarding.reply_rules_generator`.

Lefedett területek:

1. **Tool schema** — JSON Schema valid payload pass, invalid (out-of-bounds,
   extra props, hiányzó required) reject.
2. **Vendor-voice gate** — a felhasználói policy-döntés (B-opció): csak
   `vendor_policy=="specific"` + non-empty `vendor_name` esetén true.
3. **Closing-adjacent detection** — branches.next_step + default_next a
   closing step felé → adjacent set.
4. **Prompt builderek** — locale propagation, vendor + anti-spoiler
   clause beillesztés, closing-adjacent marker, closing step kihagyása
   a user-message step-listából.
5. **`apply_reply_rules_to_node`** — populates non-closing steps,
   preserves curated reply_rules (default), overwrite mode, normalizes
   strings, skips closing steps.
6. **`generate_reply_rules_for_story`** — orchestration node-onkénti
   call-lal, mock-clienttel, hibatűrés (exception → skip), summary
   shape.
"""
from __future__ import annotations

from typing import Any

import jsonschema
import pytest

from services.onboarding.reply_rules_generator import (
    apply_reply_rules_to_node,
    build_generate_reply_rules_tool,
    build_phase3c_system_prompt,
    build_phase3c_user_message,
    find_closing_adjacent_step_ids,
    generate_reply_rules_for_story,
    is_vendor_voice_enabled,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _ai_page(
    *,
    page_id: str = "intake",
    steps: list[dict] | None = None,
    knowledge: dict | None = None,
) -> dict:
    return {
        "id": page_id,
        "type": "ai",
        "fallback_message": "fallback",
        "knowledge": knowledge or {
            "description": "Intake node az új ügyek belépési pontja.",
            "scope": "Új ügy felvétele.",
            "examples": ["x", "y"],
        },
        "conditions": [
            {"id": "user_provided_topic", "description": "Téma megadva."},
        ],
        "steps": steps or [],
        "routing": [{"default": "ask"}],
    }


def _basic_page_with_three_steps() -> dict:
    return _ai_page(steps=[
        {
            "id": "step_collect",
            "type": "prompt",
            "goal": "Gyűjtsd be a témát.",
            "ai_action": "Kérdezd meg az ügyfelet.",
            "internal_conditions": [
                {"id": "user_provided_topic", "description": "Téma."}
            ],
            "default_next": "step_acknowledge",
        },
        {
            "id": "step_acknowledge",
            "type": "info",
            "goal": "Erősítsd meg az ügyfél bejelentését.",
            "default_next": "step_close",
        },
        {
            "id": "step_close",
            "type": "info",
            "is_closing": True,
            "is_terminal": True,
            "permit_goto_auto_ack": True,
            "silent_on_matched_goto": True,
            "fallback_reason": "A flow lezárult — manuális handoff szükséges.",
        },
    ])


# --------------------------------------------------------------------------- #
# 1. Tool schema                                                              #
# --------------------------------------------------------------------------- #


def test_tool_schema_accepts_valid_payload() -> None:
    tool = build_generate_reply_rules_tool()
    payload: dict[str, Any] = {
        "node_id": "intake-node",
        "step_rules": [
            {
                "step_id": "step_1",
                "reply_rules": [
                    "Csak a témát kérd — semmi mást.",
                    "Maximum 2 mondat.",
                    "Ne magyarázd el a következő lépéseket.",
                ],
            }
        ],
    }
    jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_too_few_rules() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {"step_id": "step_1", "reply_rules": ["only one rule"]}  # < min 2
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_too_many_rules() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {
                "step_id": "step_1",
                "reply_rules": [f"Rule {i} long enough" for i in range(6)],
            }
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_short_rule_string() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {"step_id": "step_1", "reply_rules": ["short", "ok rule len"]}
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_long_rule_string() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {
                "step_id": "step_1",
                "reply_rules": [
                    "x" * 241,  # > 240
                    "ok rule len",
                ],
            }
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_extra_top_level_property() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {"step_id": "s", "reply_rules": ["a long rule", "b long rule"]}
        ],
        "hallucinated_extra": "wat",
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_extra_step_property() -> None:
    tool = build_generate_reply_rules_tool()
    payload = {
        "node_id": "intake",
        "step_rules": [
            {
                "step_id": "s",
                "reply_rules": ["a long rule", "b long rule"],
                "wrong_extra": "wat",
            }
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


def test_tool_schema_rejects_missing_required() -> None:
    tool = build_generate_reply_rules_tool()
    payload: dict[str, Any] = {"step_rules": []}  # missing node_id
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])

    payload = {
        "node_id": "intake",
        "step_rules": [{"step_id": "s"}],  # missing reply_rules
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, tool["input_schema"])


# --------------------------------------------------------------------------- #
# 2. Vendor-voice gate                                                        #
# --------------------------------------------------------------------------- #


def test_vendor_voice_specific_with_name_enabled() -> None:
    assert is_vendor_voice_enabled("specific", "AcmeCorp") is True


def test_vendor_voice_generic_blended_disabled() -> None:
    assert is_vendor_voice_enabled("generic_blended", "AcmeCorp") is False
    assert is_vendor_voice_enabled("generic_blended", None) is False


def test_vendor_voice_mock_disabled() -> None:
    # Mock policy: fictional vendor — neutralt akarunk.
    assert is_vendor_voice_enabled("mock", "FakeCo") is False


def test_vendor_voice_specific_without_name_disabled() -> None:
    assert is_vendor_voice_enabled("specific", None) is False
    assert is_vendor_voice_enabled("specific", "") is False
    assert is_vendor_voice_enabled("specific", "   ") is False


def test_vendor_voice_unknown_policy_disabled() -> None:
    assert is_vendor_voice_enabled(None, "AcmeCorp") is False
    assert is_vendor_voice_enabled("unknown", "AcmeCorp") is False


# --------------------------------------------------------------------------- #
# 3. Closing-adjacent detection                                               #
# --------------------------------------------------------------------------- #


def test_closing_adjacent_via_default_next() -> None:
    page = _basic_page_with_three_steps()
    adjacent = find_closing_adjacent_step_ids(page)
    # step_acknowledge.default_next == 'step_close' → adjacent
    # step_collect.default_next == 'step_acknowledge' → NOT adjacent
    assert adjacent == {"step_acknowledge"}


def test_closing_adjacent_via_branches_next_step() -> None:
    page = _ai_page(steps=[
        {
            "id": "step_a",
            "type": "decision",
            "branches": [
                {"if": ["cond1"], "next_step": "step_close"},
                {"if": ["cond2"], "next_step": "step_b"},
            ],
            "default_next": "step_b",
        },
        {
            "id": "step_b",
            "type": "info",
            "default_next": "step_close",
        },
        {
            "id": "step_close",
            "type": "info",
            "is_closing": True,
            "is_terminal": True,
            "permit_goto_auto_ack": True,
            "silent_on_matched_goto": True,
            "fallback_reason": "End.",
        },
    ])
    adjacent = find_closing_adjacent_step_ids(page)
    # step_a routes to step_close via branches.next_step → adjacent
    # step_b routes to step_close via default_next → adjacent
    assert adjacent == {"step_a", "step_b"}


def test_closing_adjacent_no_closing_step_returns_empty() -> None:
    page = _ai_page(steps=[
        {"id": "step_x", "type": "prompt", "default_next": "step_y"},
        {"id": "step_y", "type": "info"},
    ])
    assert find_closing_adjacent_step_ids(page) == set()


def test_closing_adjacent_handles_invalid_input() -> None:
    assert find_closing_adjacent_step_ids({}) == set()
    assert find_closing_adjacent_step_ids({"steps": "not_a_list"}) == set()
    assert find_closing_adjacent_step_ids(None) == set()  # type: ignore[arg-type]


def test_closing_adjacent_excludes_closing_step_itself() -> None:
    """Egy closing step nem-closing step-re routol, de ő maga
    closing — nem kerül az adjacent halmazba."""
    page = _ai_page(steps=[
        {"id": "step_pre_close", "type": "info", "default_next": "step_close"},
        {
            "id": "step_close",
            "type": "info",
            "is_closing": True,
            "is_terminal": True,
            "permit_goto_auto_ack": True,
            "silent_on_matched_goto": True,
            "fallback_reason": "End.",
            "default_next": "step_pre_close",  # weird routing, but possible
        },
    ])
    adjacent = find_closing_adjacent_step_ids(page)
    assert adjacent == {"step_pre_close"}
    assert "step_close" not in adjacent


# --------------------------------------------------------------------------- #
# 4. Prompt builders                                                          #
# --------------------------------------------------------------------------- #


def test_system_prompt_locale_hu() -> None:
    sys_prompt = build_phase3c_system_prompt(
        locale="hu", vendor_policy="generic_blended", vendor_name=None
    )
    assert "TARGET LOCALE: hu" in sys_prompt
    assert "Hungarian" in sys_prompt
    # A Hu worked example egy konkrét eleme.
    assert "Csak a rendelési számot" in sys_prompt
    # Anti-spoiler MIXED policy emlitve.
    assert "ANTI-SPOILER POLICY: MIXED" in sys_prompt
    assert "CLOSING-ADJACENT" in sys_prompt
    # Vendor neutral mert generic_blended.
    assert "VENDOR VOICE: NEUTRAL" in sys_prompt


def test_system_prompt_locale_en_default_fallback() -> None:
    sys_prompt = build_phase3c_system_prompt(
        locale="en", vendor_policy="generic_blended", vendor_name=None
    )
    assert "TARGET LOCALE: en" in sys_prompt
    assert "English" in sys_prompt
    assert "Ask only for the order ID" in sys_prompt


def test_system_prompt_unknown_locale_falls_back_to_en() -> None:
    sys_prompt = build_phase3c_system_prompt(
        locale="de", vendor_policy="generic_blended", vendor_name=None
    )
    assert "TARGET LOCALE: en" in sys_prompt
    assert "English" in sys_prompt


def test_system_prompt_vendor_specific_includes_name() -> None:
    sys_prompt = build_phase3c_system_prompt(
        locale="en", vendor_policy="specific", vendor_name="AcmeCorp"
    )
    assert "VENDOR VOICE: vendor-specific" in sys_prompt
    assert "AcmeCorp" in sys_prompt
    # NEUTRAL clause-t ne tartalmazza ekkor.
    assert "VENDOR VOICE: NEUTRAL" not in sys_prompt


def test_system_prompt_mock_policy_uses_neutral() -> None:
    # Policy gate: a mock vendor neutralt kap (B-opció).
    sys_prompt = build_phase3c_system_prompt(
        locale="en", vendor_policy="mock", vendor_name="FakeCo"
    )
    assert "VENDOR VOICE: NEUTRAL" in sys_prompt
    assert "FakeCo" not in sys_prompt


def test_user_message_excludes_closing_steps() -> None:
    page = _basic_page_with_three_steps()
    msg = build_phase3c_user_message(page=page, locale="hu")
    # Non-closing step-ek megjelennek.
    assert "step_id: step_collect" in msg
    assert "step_id: step_acknowledge" in msg
    # Closing step KIMARAD.
    assert "step_id: step_close" not in msg


def test_user_message_marks_closing_adjacent_steps() -> None:
    page = _basic_page_with_three_steps()
    msg = build_phase3c_user_message(page=page, locale="hu")
    # step_acknowledge → closing-adjacent (default_next: step_close)
    # step_collect    → non-adjacent
    assert "step_id: step_acknowledge  [CLOSING-ADJACENT" in msg
    assert "step_id: step_collect  [NON-ADJACENT" in msg


def test_user_message_includes_step_metadata() -> None:
    page = _basic_page_with_three_steps()
    msg = build_phase3c_user_message(page=page, locale="hu")
    assert "type:       prompt" in msg
    assert "goal:       Gyűjtsd be a témát." in msg
    assert "ai_action:  Kérdezd meg az ügyfelet." in msg
    # Internal conditions ID-ket listázza, a description-t nem.
    assert "user_provided_topic" in msg


def test_user_message_handles_empty_non_closing_steps() -> None:
    page = _ai_page(steps=[
        {
            "id": "only_close",
            "type": "info",
            "is_closing": True,
            "is_terminal": True,
            "permit_goto_auto_ack": True,
            "silent_on_matched_goto": True,
            "fallback_reason": "End.",
        }
    ])
    msg = build_phase3c_user_message(page=page, locale="hu")
    assert "(No non-closing steps found" in msg


def test_user_message_string_form_internal_conditions() -> None:
    page = _ai_page(steps=[
        {
            "id": "step_a",
            "type": "prompt",
            "internal_conditions": ["cond_a", "cond_b"],
        },
    ])
    msg = build_phase3c_user_message(page=page, locale="en")
    assert "internal:   cond_a, cond_b" in msg


# --------------------------------------------------------------------------- #
# 5. apply_reply_rules_to_node                                                #
# --------------------------------------------------------------------------- #


def test_apply_populates_non_closing_step() -> None:
    page = _basic_page_with_three_steps()
    rules = {
        "step_collect": [
            "Csak a témát kérd — semmi mást.",
            "Maximum 2 mondat.",
            "Ne magyarázd el a következő lépéseket.",
        ],
    }
    n = apply_reply_rules_to_node(page, rules)
    assert n == 1
    assert page["steps"][0]["reply_rules"] == rules["step_collect"]


def test_apply_skips_closing_step_even_if_in_mapping() -> None:
    page = _basic_page_with_three_steps()
    rules = {
        "step_close": ["Should not be applied", "to closing step"],
    }
    n = apply_reply_rules_to_node(page, rules)
    assert n == 0
    assert "reply_rules" not in page["steps"][2]


def test_apply_preserves_existing_reply_rules_by_default() -> None:
    page = _basic_page_with_three_steps()
    page["steps"][0]["reply_rules"] = ["Curated rule one"]
    rules = {"step_collect": ["New rule one", "New rule two"]}
    n = apply_reply_rules_to_node(page, rules)
    assert n == 0
    assert page["steps"][0]["reply_rules"] == ["Curated rule one"]


def test_apply_overwrites_when_flag_set() -> None:
    page = _basic_page_with_three_steps()
    page["steps"][0]["reply_rules"] = ["Old rule"]
    rules = {"step_collect": ["New rule one", "New rule two"]}
    n = apply_reply_rules_to_node(page, rules, overwrite_existing=True)
    assert n == 1
    assert page["steps"][0]["reply_rules"] == [
        "New rule one",
        "New rule two",
    ]


def test_apply_normalizes_strings_strips_whitespace() -> None:
    page = _basic_page_with_three_steps()
    rules = {
        "step_collect": [
            "  Whitespaced rule  ",
            "Normal rule",
            "",
            "   ",
            "Final rule",
        ],
    }
    n = apply_reply_rules_to_node(page, rules)
    assert n == 1
    assert page["steps"][0]["reply_rules"] == [
        "Whitespaced rule",
        "Normal rule",
        "Final rule",
    ]


def test_apply_skips_step_not_in_mapping() -> None:
    page = _basic_page_with_three_steps()
    rules = {"unknown_step": ["a rule one", "a rule two"]}
    n = apply_reply_rules_to_node(page, rules)
    assert n == 0
    for s in page["steps"]:
        assert "reply_rules" not in s


def test_apply_handles_invalid_inputs_gracefully() -> None:
    assert apply_reply_rules_to_node({}, {}) == 0
    assert apply_reply_rules_to_node({"steps": "wat"}, {"x": ["a"]}) == 0
    assert apply_reply_rules_to_node(None, {}) == 0  # type: ignore[arg-type]


# --------------------------------------------------------------------------- #
# 6. generate_reply_rules_for_story                                           #
# --------------------------------------------------------------------------- #


class _FakeReplyRulesClient:
    """Test-double a Phase 3c orchestration tesztjéhez."""

    def __init__(self, *, return_map: dict[str, dict[str, list[str]]] | None = None,
                 fail_for: set[str] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self._return_map = return_map or {}
        self._fail_for = fail_for or set()

    def generate_reply_rules(
        self,
        *,
        page: dict[str, Any],
        locale: str,
        vendor_policy: Any,
        vendor_name: Any,
    ) -> dict[str, list[str]]:
        page_id = page["id"]
        self.calls.append({
            "page_id": page_id,
            "locale": locale,
            "vendor_policy": vendor_policy,
            "vendor_name": vendor_name,
        })
        if page_id in self._fail_for:
            raise RuntimeError(f"Simulated failure for {page_id}")
        return self._return_map.get(page_id, {})


def _two_page_story() -> dict:
    return {
        "schemaVersion": "1.0",
        "storyId": "test",
        "locale": "hu",
        "meta": {"id": "test", "title": "Test"},
        "pages": {
            "intake": _basic_page_with_three_steps(),
            "followup": _ai_page(
                page_id="followup",
                steps=[
                    {
                        "id": "step_a",
                        "type": "prompt",
                        "internal_conditions": ["user_provided_topic"],
                    },
                    {
                        "id": "step_b_close",
                        "type": "info",
                        "is_closing": True,
                        "is_terminal": True,
                        "permit_goto_auto_ack": True,
                        "silent_on_matched_goto": True,
                        "fallback_reason": "End.",
                    },
                ],
            ),
            "end-default": {"id": "end-default", "type": "end", "content": "End"},
        },
    }


def test_generate_for_story_calls_each_ai_page_once() -> None:
    story = _two_page_story()
    client = _FakeReplyRulesClient(return_map={
        "intake": {
            "step_collect": ["rule 1 long enough", "rule 2 long enough"],
            "step_acknowledge": ["rule 3 long enough", "rule 4 long enough"],
        },
        "followup": {
            "step_a": ["rule a long enough", "rule b long enough"],
        },
    })
    summary = generate_reply_rules_for_story(
        story,
        client=client,
        locale="hu",
        vendor_policy="generic_blended",
        vendor_name=None,
    )
    # Két AI page → két call (end page kihagyott).
    assert len(client.calls) == 2
    called_ids = {c["page_id"] for c in client.calls}
    assert called_ids == {"intake", "followup"}
    assert summary["nodes_processed"] == 2
    assert summary["nodes_succeeded"] == 2
    assert summary["nodes_failed"] == 0
    # 2 + 1 = 3 step kapott reply_rules-t.
    assert summary["total_steps_rules_applied"] == 3
    assert summary["per_node_applied"] == {"intake": 2, "followup": 1}


def test_generate_for_story_skips_failed_node_continues_others() -> None:
    story = _two_page_story()
    client = _FakeReplyRulesClient(
        return_map={
            "followup": {
                "step_a": ["rule a long enough", "rule b long enough"],
            },
        },
        fail_for={"intake"},
    )
    errors_seen: list[tuple[str, Exception]] = []
    summary = generate_reply_rules_for_story(
        story,
        client=client,
        locale="hu",
        vendor_policy="generic_blended",
        vendor_name=None,
        on_node_error=lambda pid, exc: errors_seen.append((pid, exc)),
    )
    assert summary["nodes_processed"] == 2
    assert summary["nodes_succeeded"] == 1
    assert summary["nodes_failed"] == 1
    assert summary["failed_node_ids"] == ["intake"]
    assert summary["succeeded_node_ids"] == ["followup"]
    # Csak a followup step_a kapta meg.
    assert summary["per_node_applied"] == {"followup": 1}
    assert summary["total_steps_rules_applied"] == 1
    # on_node_error callback meg lett híva.
    assert len(errors_seen) == 1
    assert errors_seen[0][0] == "intake"
    assert isinstance(errors_seen[0][1], RuntimeError)


def test_generate_for_story_invalid_client_return_treated_as_failure() -> None:
    story = _two_page_story()

    class _BadReturnClient:
        def __init__(self) -> None:
            self.called: list[str] = []

        def generate_reply_rules(self, **kwargs: Any) -> Any:
            self.called.append(kwargs["page"]["id"])
            return "not a dict"  # type: ignore[return-value]

    client = _BadReturnClient()
    summary = generate_reply_rules_for_story(
        story,
        client=client,  # type: ignore[arg-type]
        locale="hu",
        vendor_policy="generic_blended",
        vendor_name=None,
    )
    # Mindkét page hibás returnt ad → 2 failure.
    assert summary["nodes_processed"] == 2
    assert summary["nodes_failed"] == 2
    assert summary["nodes_succeeded"] == 0


def test_generate_for_story_handles_empty_story() -> None:
    summary = generate_reply_rules_for_story(
        {},
        client=_FakeReplyRulesClient(),
        locale="hu",
        vendor_policy=None,
        vendor_name=None,
    )
    assert summary["nodes_processed"] == 0
    assert summary["total_steps_rules_applied"] == 0


def test_generate_for_story_passes_vendor_to_client() -> None:
    story = _two_page_story()
    client = _FakeReplyRulesClient()
    generate_reply_rules_for_story(
        story,
        client=client,
        locale="en",
        vendor_policy="specific",
        vendor_name="AcmeCorp",
    )
    for call in client.calls:
        assert call["locale"] == "en"
        assert call["vendor_policy"] == "specific"
        assert call["vendor_name"] == "AcmeCorp"

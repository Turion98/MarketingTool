"""Pytest cases for `shared.story_lint`.

Lefedett területek:

1. **Full-story regression** — `ai_complaint_story_v3.json` lint-je nem ad
   ERROR-t (a már jól működő story regressziós védelme).
2. **Single-node happy path** — egy minimális, jól formált AI-node a
   blueprint-pool kondícióival és ismert page-id-kkal hibátlan.
3. **Fallback warning** — hiányzó vagy üres `fallback_message` warning-ot
   ad, de nem error-t (Phase 2 retry policy-nek tudnia kell, hogy ez
   csak figyelmeztetés).
4. **Undeclared condition error** — routing.if-ben hivatkozott, de sehol
   nem deklarált / nem derive-elt kondíció ERROR-t kell adjon (Phase 2
   retry policy ezt látja és hard-failure-ként kezeli).
5. **Invalid routing form** — `{if:[...], default:...}` keverék vagy
   ismeretlen forma ERROR.
6. **Unknown page target tolerance** — `lint_single_node` `known_page_ids=None`
   esetén a goto célokat NEM validálja (hiszen a Phase 2 közepén még nem
   ismert minden node).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from shared.story_lint import (
    Report,
    lint_full_story,
    lint_single_node,
)


_AI_STORY_PATH = (
    Path(__file__).resolve().parents[1] / "stories" / "ai_complaint_story_v3.json"
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _ai_meta() -> dict:
    """Minimális meta a single-node tesztekhez — `ai_complaint_story_v3.json`
    runtime + computed_condition_ids részletei nélkül, csak a single-node
    szemantikához szükséges kulcsokkal."""
    return {
        "id": "test-domain",
        "title": "Test domain",
        "startPageId": "intake",
        "defaultFallbackMessage": "fallback",
        "runtime": {"model": "claude-sonnet-4-5", "max_tokens": 1024},
    }


def _good_node(
    *,
    page_id: str = "intake",
    extra_conditions: list[dict] | None = None,
    routing: list[dict] | None = None,
    fallback_message: str = "Bocs, nem értettem.",
) -> dict:
    """Strukturálisan minimálisan helyes AI-node sablon."""
    page: dict = {
        "id": page_id,
        "type": "ai",
        "fallback_message": fallback_message,
        "knowledge": {
            "description": "Test node",
            "scope": "Test scope",
            "examples": ["Példa 1", "Példa 2"],
        },
        "conditions": [
            {
                "id": "user_provided_topic",
                "description": "Felhasználó megadta a témát",
                "required": True,
            },
        ],
        "steps": [
            {
                "id": "ask_topic",
                "type": "prompt",
                "goal": "Kérdezd meg a témát.",
                "internal_conditions": [],
            }
        ],
        "routing": routing
        or [
            {"if": ["user_provided_topic"], "goto": "next_node"},
            {"default": "ask"},
        ],
    }
    if extra_conditions:
        page["conditions"].extend(extra_conditions)
    return page


# --------------------------------------------------------------------------- #
# 1. Full-story regression                                                    #
# --------------------------------------------------------------------------- #


def test_full_story_no_errors() -> None:
    if not _AI_STORY_PATH.exists():
        pytest.skip(f"Story fájl nem található: {_AI_STORY_PATH}")
    story = json.loads(_AI_STORY_PATH.read_text(encoding="utf-8"))
    # A v3 production story több closing step-en hiányos bundle-lel rendelkezik
    # (history-i drift). Strict mode csak a Phase 2 outputjára vonatkozik —
    # a legacy story-ra `strict_closing_bundle=False`-t adunk át, hogy a már
    # korábban is létező (és működő) closing step-eket ne lássuk error-nak.
    rep = lint_full_story(story, strict_closing_bundle=False)
    assert isinstance(rep, Report)
    assert rep.errors == [], (
        "ai_complaint_story_v3.json lint regresszió:\n" + "\n".join(rep.errors)
    )


# --------------------------------------------------------------------------- #
# 2. Single-node happy path                                                   #
# --------------------------------------------------------------------------- #


def test_single_node_happy_path() -> None:
    page = _good_node()
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert rep.errors == [], rep.summary()


# --------------------------------------------------------------------------- #
# 3. Fallback warning                                                         #
# --------------------------------------------------------------------------- #


def test_missing_fallback_yields_warning_not_error() -> None:
    page = _good_node(fallback_message="")
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert rep.errors == [], rep.summary()
    assert any("fallback_message" in w for w in rep.warnings), rep.summary()


# --------------------------------------------------------------------------- #
# 4. Undeclared condition in routing.if                                       #
# --------------------------------------------------------------------------- #


def test_undeclared_condition_in_routing_yields_error() -> None:
    # A routing.if 'made_up_condition'-re hivatkozik, de sem a node, sem a
    # blueprint pool nem deklarálja → hard error.
    page = _good_node(
        routing=[
            {"if": ["made_up_condition"], "goto": "next_node"},
            {"default": "ask"},
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "made_up_condition" in e for e in rep.errors
    ), rep.summary()


# --------------------------------------------------------------------------- #
# 5. Invalid routing form                                                     #
# --------------------------------------------------------------------------- #


def test_invalid_routing_form_yields_error() -> None:
    # Sem `{if:.., goto:..}`, sem `{default:..}` — ismeretlen forma.
    page = _good_node(
        routing=[
            {"unknown_key": "wat", "goto": "next_node"},
            {"default": "ask"},
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "ismeretlen routing forma" in e for e in rep.errors
    ), rep.summary()


# --------------------------------------------------------------------------- #
# 6. Unknown page target tolerance (`known_page_ids=None`)                    #
# --------------------------------------------------------------------------- #


def test_unknown_page_target_tolerated_when_known_pages_none() -> None:
    # Phase 2 közepén: a node 'page_that_doesnt_exist_yet'-re routol — a
    # goto cél létezésének validálását ki KELL hagyni, hogy a node-ot
    # önmagában is el tudjuk fogadni.
    page = _good_node(
        routing=[
            {"if": ["user_provided_topic"], "goto": "page_that_doesnt_exist_yet"},
            {"default": "ask"},
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids=None,
    )
    assert rep.errors == [], rep.summary()


def test_unknown_page_target_errors_when_known_pages_set() -> None:
    # Ugyanaz mint fent, de explicit known_page_ids halmazzal — ekkor
    # error-t várunk, mert a goto cél nem szerepel.
    page = _good_node(
        routing=[
            {"if": ["user_provided_topic"], "goto": "page_that_doesnt_exist_yet"},
            {"default": "ask"},
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake"},
    )
    assert any(
        "page_that_doesnt_exist_yet" in e for e in rep.errors
    ), rep.summary()


# --------------------------------------------------------------------------- #
# 7. Extended OCM field pool (domain-specific extensions)                     #
# --------------------------------------------------------------------------- #
#
# A `lint_full_story` opcionális `extra_known_external_fields` paraméterét
# fedik le. Az igazságok:
#
# * Ha egy `field_rules[i].field` ÉS a két modifier (`requires_field_not_null`,
#   `requires_field_lt_today`) értéke a globális `KNOWN_OCM_FIELDS`-ben van →
#   se note, se warn, se err — clean.
# * Ha NEM a globális pool-ban van DE az `extra_known_external_fields`
#   pool-ban van → `note()` (info), nem `warn()`. Az üzenet tartalmazza a
#   "domain-specific" markert.
# * Ha sem a globális, sem az extra pool-ban nincs → `warn()` (a meglévő
#   viselkedés). NINCS `err()` ezekre a mezőkre.


def _story_with_field_rules(field_rules: list[dict]) -> dict:
    """Minimális, lint-elhető story `meta.order_context_mapping.field_rules`-szel."""
    return {
        "schemaVersion": "1.0",
        "storyId": "test-story",
        "locale": "en",
        "meta": {
            "id": "test-story",
            "title": "Test Story",
            "startPageId": "intake",
            "defaultFallbackMessage": "fallback",
            "runtime": {"model": "claude", "max_tokens": 1024},
            "order_context_mapping": {
                "field_rules": field_rules,
            },
        },
        "pages": {
            "intake": {
                "id": "intake",
                "type": "ai",
                "fallback_message": "fallback",
                "knowledge": {
                    "description": "Intake node",
                    "scope": "Intake scope",
                    "examples": ["Példa 1", "Példa 2"],
                },
                "conditions": [
                    {
                        "id": "topic_known",
                        "description": "Topic known",
                        "required": False,
                    },
                ],
                "routing": [
                    {"default": "intake"},
                ],
            },
        },
    }


def test_extra_pool_promotes_unknown_field_to_info_not_warn() -> None:
    # `device_model` nincs a globális KNOWN_OCM_FIELDS-ben, de benne van
    # az extra_known_external_fields pool-ban → note(), nem warn().
    story = _story_with_field_rules(
        [{"field": "device_model", "condition": "device_model_known", "when": "not_null"}]
    )
    rep = lint_full_story(
        story, extra_known_external_fields={"device_model"}
    )
    # Egyik field_rules.field warning sem szólhat a device_model-ről.
    assert not any(
        "device_model" in w and "ismeretlen OrderContext" in w
        for w in rep.warnings
    ), rep.summary()
    # Helyette egy info-üzenet "domain-specific" markerrel.
    assert any(
        "device_model" in n and "domain-specific" in n
        for n in rep.info
    ), rep.summary()


def test_unknown_field_still_warns_when_not_in_extra_pool() -> None:
    # `device_model` sem a globális pool-ban, sem az extra-ban → warn() marad.
    story = _story_with_field_rules(
        [{"field": "device_model", "condition": "device_model_known", "when": "not_null"}]
    )
    rep = lint_full_story(story, extra_known_external_fields={"some_other_field"})
    assert any(
        "device_model" in w and "ismeretlen OrderContext" in w
        for w in rep.warnings
    ), rep.summary()
    # A "domain-specific" jelölés ehhez NEM kerülhet be.
    assert not any(
        "device_model" in n and "domain-specific" in n for n in rep.info
    ), rep.summary()


def test_global_pool_field_silent_with_extra_pool_present() -> None:
    # `purchase_date` benne van a globális pool-ban — ha az extra pool-t is
    # adjuk meg, akkor sem warn-t, sem note-ot nem várunk a mezőre.
    story = _story_with_field_rules(
        [{"field": "purchase_date", "condition": "purchase_date_known", "when": "not_null"}]
    )
    rep = lint_full_story(
        story, extra_known_external_fields={"device_model", "issue_start_date"}
    )
    assert not any("purchase_date" in w for w in rep.warnings), rep.summary()
    assert not any(
        "purchase_date" in n and "domain-specific" in n for n in rep.info
    ), rep.summary()


def test_extra_pool_applies_to_modifier_fields() -> None:
    # A `requires_field_not_null` és `requires_field_lt_today` modifier-ek
    # szintén nézik a rétegelt poolt.
    story = _story_with_field_rules(
        [
            {
                "field": "purchase_date",
                "condition": "warranty_active_check",
                "when": "not_null",
                "requires_field_not_null": "device_model",
                "requires_field_lt_today": "issue_start_date",
            }
        ]
    )
    rep = lint_full_story(
        story,
        extra_known_external_fields={"device_model", "issue_start_date"},
    )
    # Mindkét modifier-mező info-jelölést kap, nem warning-ot.
    notes_text = " | ".join(rep.info)
    warns_text = " | ".join(rep.warnings)
    assert "device_model" in notes_text and "domain-specific" in notes_text
    assert "issue_start_date" in notes_text and "domain-specific" in notes_text
    assert "device_model" not in warns_text
    assert "issue_start_date" not in warns_text


def test_extra_pool_default_none_preserves_legacy_behavior() -> None:
    # Default (extra_known_external_fields=None) → minden ismeretlen mező
    # warn(). Backwards-compatible regresszió.
    story = _story_with_field_rules(
        [{"field": "device_model", "condition": "device_model_known", "when": "not_null"}]
    )
    rep = lint_full_story(story)  # nincs extra paraméter
    assert any(
        "device_model" in w and "ismeretlen OrderContext" in w
        for w in rep.warnings
    ), rep.summary()


# --------------------------------------------------------------------------- #
# Closing-step bundle (strict / legacy mode)                                  #
# --------------------------------------------------------------------------- #
#
# A runtime-nak egy `is_closing: true` step esetén a következő bundle kell
# együtt legyen jelen: `is_terminal: true`, `permit_goto_auto_ack: true`,
# `silent_on_matched_goto: true`, és nem-üres `fallback_reason` string.
# Strict mode (default) a Phase 2 outputjára vonatkozik (rejection → retry);
# legacy mode (`strict_closing_bundle=False`) a régi, kézzel curated
# story-kra (warning, mert átmenetileg toleráljuk a drift-et).


def _node_with_closing_step(*, complete_bundle: bool) -> dict:
    """Return an AI-page that ends in a closing step, with or without the
    full closing bundle attached."""
    closing_step: dict = {
        "id": "wrap_up",
        "type": "info",
        "goal": "A folyamat lezárása.",
        "is_closing": True,
    }
    if complete_bundle:
        closing_step.update({
            "is_terminal": True,
            "permit_goto_auto_ack": True,
            "silent_on_matched_goto": True,
            "fallback_reason": "Minden ág elhasalt; manuális handoff-ra megy.",
        })
    return {
        "id": "wrap-node",
        "type": "ai",
        "fallback_message": "Bocs, nem értettem.",
        "knowledge": {
            "description": "Wrap-up node",
            "scope": "Closing scope",
            "examples": ["Példa 1", "Példa 2"],
        },
        "conditions": [
            {"id": "ready_to_close", "description": "Lezáráshoz kész."},
        ],
        "steps": [closing_step],
        "routing": [
            {"if": ["ready_to_close"], "goto": "next_node"},
            {"default": "ask"},
        ],
    }


def test_closing_bundle_strict_rejects_missing_flags() -> None:
    page = _node_with_closing_step(complete_bundle=False)
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool={"ready_to_close"},
        known_page_ids={"wrap-node", "next_node"},
    )
    err_text = "\n".join(rep.errors)
    assert "is_terminal" in err_text and "closing-bundle" in err_text, err_text
    assert "permit_goto_auto_ack" in err_text, err_text
    assert "silent_on_matched_goto" in err_text, err_text
    assert "fallback_reason" in err_text, err_text


def test_closing_bundle_legacy_mode_emits_warnings_only() -> None:
    page = _node_with_closing_step(complete_bundle=False)
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool={"ready_to_close"},
        known_page_ids={"wrap-node", "next_node"},
        strict_closing_bundle=False,
    )
    # No errors — they're demoted to warnings.
    closing_errors = [e for e in rep.errors if "closing-bundle" in e]
    assert closing_errors == [], rep.summary()
    closing_warnings = [w for w in rep.warnings if "closing-bundle" in w]
    assert len(closing_warnings) == 4, rep.summary()


def test_closing_bundle_complete_passes_strict_mode() -> None:
    page = _node_with_closing_step(complete_bundle=True)
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool={"ready_to_close"},
        known_page_ids={"wrap-node", "next_node"},
    )
    closing_errors = [e for e in rep.errors if "closing-bundle" in e]
    assert closing_errors == [], rep.summary()


def test_closing_bundle_only_triggers_when_is_closing_true() -> None:
    page = _node_with_closing_step(complete_bundle=False)
    # Demote to non-closing — bundle requirements should NOT apply.
    page["steps"][0]["is_closing"] = False
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool={"ready_to_close"},
        known_page_ids={"wrap-node", "next_node"},
    )
    closing_errors = [e for e in rep.errors if "closing-bundle" in e]
    assert closing_errors == [], rep.summary()


# --------------------------------------------------------------------------- #
# Phase 3 step extensions: reply_rules + internal_conditions új flag-ek       #
# --------------------------------------------------------------------------- #
#
# step.reply_rules: lista, 1-6 elem, minden elem 8-240 char string.
# internal_conditions[i]:
#   - auto_satisfy_after_reply: bool (runtime ténylegesen használja)
#   - do_not_reask_hint: 1-300 char string (LLM extract context)


def test_step_reply_rules_valid_passes() -> None:
    page = _good_node()
    page["steps"][0]["reply_rules"] = [
        "Csak a téma típusát kérd — semmi mást.",
        "Maximum 1-2 mondat — rövid, célratörő.",
        "Ne magyarázd el a következő lépéseket.",
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert rep.errors == [], rep.summary()


def test_step_reply_rules_non_list_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["reply_rules"] = "ez egy string nem lista"
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "reply_rules" in e and "nem lista" in e for e in rep.errors
    ), rep.summary()


def test_step_reply_rules_empty_list_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["reply_rules"] = []
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "reply_rules" in e and "üres" in e for e in rep.errors
    ), rep.summary()


def test_step_reply_rules_too_short_item_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["reply_rules"] = ["rövid"]  # 5 char < 8
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "reply_rules" in e and "túl rövid" in e for e in rep.errors
    ), rep.summary()


def test_step_reply_rules_too_long_item_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["reply_rules"] = ["x" * 241]  # > 240
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "reply_rules" in e and "túl hosszú" in e for e in rep.errors
    ), rep.summary()


def test_step_reply_rules_too_many_items_yields_error() -> None:
    # Lint-szintű limit a story-validáláson 10 (a v3 production story-ban
    # van 9-rule step → toleráns); a schema-szintű generation cap (Phase 2/3c)
    # ennél szigorúbb.
    page = _good_node()
    page["steps"][0]["reply_rules"] = [
        f"Rule number {i}-thirteen-chars-min" for i in range(11)
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "reply_rules" in e and "túl sok elem" in e for e in rep.errors
    ), rep.summary()


def test_internal_condition_auto_satisfy_after_reply_bool_passes() -> None:
    page = _good_node()
    page["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "Téma megadva.",
            "auto_satisfy_after_reply": True,
            "do_not_reask_hint": "Ha az ügyfél már említette — ne kérdezd újra.",
        }
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert rep.errors == [], rep.summary()


def test_internal_condition_auto_satisfy_non_bool_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "Téma megadva.",
            "auto_satisfy_after_reply": "yes",  # nem bool
        }
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "auto_satisfy_after_reply" in e and "nem bool" in e for e in rep.errors
    ), rep.summary()


def test_internal_condition_empty_hint_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "Téma megadva.",
            "do_not_reask_hint": "",  # üres
        }
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "do_not_reask_hint" in e and "nem üres string" in e for e in rep.errors
    ), rep.summary()


def test_internal_condition_hint_too_long_yields_error() -> None:
    page = _good_node()
    page["steps"][0]["internal_conditions"] = [
        {
            "id": "user_provided_topic",
            "description": "Téma megadva.",
            "do_not_reask_hint": "x" * 301,  # > 300
        }
    ]
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "do_not_reask_hint" in e and "túl hosszú" in e for e in rep.errors
    ), rep.summary()


def test_page_condition_auto_satisfy_and_hint_pass() -> None:
    page = _good_node(
        extra_conditions=[
            {
                "id": "tracking_seen",
                "description": "Tracking screenshot megerkezett.",
                "auto_satisfy_after_reply": True,
                "do_not_reask_hint": "Ha kép érkezett — fogadd el némán.",
            }
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert rep.errors == [], rep.summary()


def test_page_condition_non_bool_auto_satisfy_yields_error() -> None:
    page = _good_node(
        extra_conditions=[
            {
                "id": "tracking_seen",
                "description": "Tracking screenshot megerkezett.",
                "auto_satisfy_after_reply": 1,  # int, nem bool
            }
        ]
    )
    rep = lint_single_node(
        page,
        meta=_ai_meta(),
        global_condition_pool=set(),
        known_page_ids={"intake", "next_node"},
    )
    assert any(
        "auto_satisfy_after_reply" in e and "nem bool" in e for e in rep.errors
    ), rep.summary()

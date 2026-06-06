"""Pytest cases for `services.story_lint`.

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

from services.story_lint import (
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
    rep = lint_full_story(story)
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

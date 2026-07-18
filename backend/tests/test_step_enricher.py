"""Pytest cases for `services.onboarding.step_enricher`.

Lefedett területek:

1. `_extract_condition_ids` — string + dict + kevert + üres + duplikált.
2. `_format_done_when` — Hu/En output, üres ID-lista.
3. `backfill_done_when` — non-closing populálás, closing skip,
   curated preserve, üres internal_conditions skip, idempotency.
4. `expand_internal_conditions` — string→dict konverzió, description
   lookup, hiányzó description graceful handling, dict preserve,
   idempotency.
5. `apply_step_enricher` — kombinált pass + visszaadott statisztikák.

Minden teszt a runtime-parser-rel kompatibilis output-ot ellenőriz —
a Hu separator (` és `) és az En separator (` and `) is támogatott a
runtime-ban (`_parse_done_when_condition_groups`).
"""
from __future__ import annotations

import copy

import pytest

from services.onboarding.step_enricher import (
    _DONE_WHEN_TEMPLATES,
    _extract_condition_ids,
    _format_done_when,
    apply_step_enricher,
    backfill_done_when,
    expand_internal_conditions,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _ai_page(
    *,
    page_id: str = "intake",
    conditions: list[dict] | None = None,
    steps: list[dict] | None = None,
) -> dict:
    return {
        "id": page_id,
        "type": "ai",
        "fallback_message": "fallback",
        "knowledge": {
            "description": "Test node",
            "scope": "Test scope",
            "examples": ["x", "y"],
        },
        "conditions": conditions
        or [
            {
                "id": "user_provided_topic",
                "description": "User megadta a témát.",
                "required": True,
            },
            {
                "id": "tracking_seen",
                "description": "Tracking ellenőrizve.",
                "required": False,
            },
        ],
        "steps": steps or [],
        "routing": [{"default": "ask"}],
    }


def _story_with_pages(*pages: dict) -> dict:
    return {
        "schemaVersion": "1.0",
        "storyId": "test",
        "locale": "hu",
        "meta": {
            "id": "test",
            "title": "Test",
            "startPageId": pages[0]["id"] if pages else "intake",
            "defaultFallbackMessage": "fallback",
            "runtime": {"model": "claude", "max_tokens": 1024},
        },
        "pages": {p["id"]: p for p in pages},
    }


# --------------------------------------------------------------------------- #
# 1. _extract_condition_ids                                                   #
# --------------------------------------------------------------------------- #


def test_extract_ids_string_form() -> None:
    assert _extract_condition_ids(["a", "b", "c"]) == ["a", "b", "c"]


def test_extract_ids_dict_form() -> None:
    internal = [
        {"id": "a", "description": "A"},
        {"id": "b", "description": "B"},
    ]
    assert _extract_condition_ids(internal) == ["a", "b"]


def test_extract_ids_mixed_form() -> None:
    internal = [
        "a",
        {"id": "b", "description": "B"},
        "c",
    ]
    assert _extract_condition_ids(internal) == ["a", "b", "c"]


def test_extract_ids_dedups_preserving_order() -> None:
    internal = [
        "a",
        {"id": "a", "description": "A"},
        "b",
        "a",
    ]
    assert _extract_condition_ids(internal) == ["a", "b"]


def test_extract_ids_skips_empty_or_invalid() -> None:
    internal = [
        "",
        "  ",
        {},
        {"id": ""},
        {"id": None},
        "valid",
    ]
    assert _extract_condition_ids(internal) == ["valid"]


def test_extract_ids_handles_non_list() -> None:
    assert _extract_condition_ids(None) == []
    assert _extract_condition_ids("not_a_list") == []
    assert _extract_condition_ids(123) == []


# --------------------------------------------------------------------------- #
# 2. _format_done_when                                                        #
# --------------------------------------------------------------------------- #


def test_format_done_when_hu_single() -> None:
    assert _format_done_when(["a"], "hu") == "a teljesül"


def test_format_done_when_hu_multi() -> None:
    assert _format_done_when(["a", "b", "c"], "hu") == "a és b és c teljesül"


def test_format_done_when_en_single() -> None:
    # En egy-cond: szebb grammatika, "is satisfied" a "are satisfied" helyett.
    # A parser mindkettőt kezeli (`_DONE_WHEN_SUFFIXES_TO_STRIP`).
    assert _format_done_when(["a"], "en") == "a is satisfied"


def test_format_done_when_en_multi() -> None:
    assert _format_done_when(["a", "b"], "en") == "a and b are satisfied"


def test_format_done_when_empty_returns_empty() -> None:
    assert _format_done_when([], "hu") == ""
    assert _format_done_when([], "en") == ""


def test_format_done_when_unknown_locale_falls_back_to_en() -> None:
    # En fallback szintén az "is satisfied" formát adja egy-cond esetre.
    assert _format_done_when(["a"], "de") == "a is satisfied"
    assert _format_done_when(["a"], "") == "a is satisfied"


def test_format_done_when_locale_normalization() -> None:
    # `hu-HU`, `hu_HU` — base nyelvi ág kell legyen vizsgált.
    assert _format_done_when(["a", "b"], "hu-HU") == "a és b teljesül"
    assert _format_done_when(["a", "b"], "en_US") == "a and b are satisfied"


def test_format_done_when_template_constants_complete() -> None:
    # Sanity check: a template dict-ek minden locale-ra `join` és `suffix`
    # kulccsal rendelkeznek (regression guard a refactor ellen).
    for locale_key, tmpl in _DONE_WHEN_TEMPLATES.items():
        assert "join" in tmpl, locale_key
        assert "suffix" in tmpl, locale_key


def test_format_done_when_singular_template_optional() -> None:
    # `suffix_singular` opcionális: Hu nem definiálja, En igen.
    # Hu egy-cond: ugyanaz a "teljesül" suffix kerül kiírásra.
    assert _format_done_when(["a"], "hu") == "a teljesül"
    # En egy-cond: a "is satisfied" preferált.
    assert _format_done_when(["a"], "en") == "a is satisfied"
    # En két+-cond: a "are satisfied" plurális forma használt.
    assert _format_done_when(["a", "b"], "en") == "a and b are satisfied"


# --------------------------------------------------------------------------- #
# 3. backfill_done_when                                                       #
# --------------------------------------------------------------------------- #


def test_backfill_populates_non_closing_with_internals() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "type": "prompt", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    n = backfill_done_when(story, locale="hu")
    assert n == 1
    assert page["steps"][0]["done_when"] == "user_provided_topic teljesül"


def test_backfill_uses_locale() -> None:
    page = _ai_page(steps=[
        {
            "id": "s1",
            "type": "prompt",
            "internal_conditions": ["user_provided_topic", "tracking_seen"],
        },
    ])
    story = _story_with_pages(page)
    backfill_done_when(story, locale="en")
    assert page["steps"][0]["done_when"] == (
        "user_provided_topic and tracking_seen are satisfied"
    )


def test_backfill_skips_closing_step() -> None:
    page = _ai_page(steps=[
        {
            "id": "close",
            "type": "info",
            "is_closing": True,
            "internal_conditions": ["user_provided_topic"],
        },
    ])
    story = _story_with_pages(page)
    n = backfill_done_when(story, locale="hu")
    assert n == 0
    assert "done_when" not in page["steps"][0]


def test_backfill_preserves_existing_done_when() -> None:
    page = _ai_page(steps=[
        {
            "id": "s1",
            "type": "prompt",
            "internal_conditions": ["a", "b"],
            "done_when": "curated_value teljesül",
        },
    ])
    story = _story_with_pages(page)
    n = backfill_done_when(story, locale="hu")
    assert n == 0
    assert page["steps"][0]["done_when"] == "curated_value teljesül"


def test_backfill_skips_empty_internal_conditions() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "type": "auto", "internal_conditions": []},
        {"id": "s2", "type": "decision"},  # no internal_conditions key
    ])
    story = _story_with_pages(page)
    n = backfill_done_when(story, locale="hu")
    assert n == 0
    assert "done_when" not in page["steps"][0]
    assert "done_when" not in page["steps"][1]


def test_backfill_handles_dict_form_internal_conditions() -> None:
    page = _ai_page(steps=[
        {
            "id": "s1",
            "type": "prompt",
            "internal_conditions": [
                {"id": "user_provided_topic", "description": "X"},
                {"id": "tracking_seen", "description": "Y"},
            ],
        },
    ])
    story = _story_with_pages(page)
    backfill_done_when(story, locale="hu")
    assert (
        page["steps"][0]["done_when"]
        == "user_provided_topic és tracking_seen teljesül"
    )


def test_backfill_skips_non_ai_pages() -> None:
    story = {
        "pages": {
            "end": {
                "id": "end",
                "type": "end",
                "steps": [
                    {"id": "s1", "internal_conditions": ["x"]}
                ],
            },
        },
    }
    n = backfill_done_when(story, locale="hu")
    assert n == 0


def test_backfill_idempotent() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "type": "prompt", "internal_conditions": ["a"]},
    ])
    story = _story_with_pages(page)
    n1 = backfill_done_when(story, locale="hu")
    n2 = backfill_done_when(story, locale="hu")
    assert n1 == 1
    assert n2 == 0  # Already populated, no second-pass change.
    assert page["steps"][0]["done_when"] == "a teljesül"


def test_backfill_handles_invalid_story_shapes_gracefully() -> None:
    assert backfill_done_when(None, locale="hu") == 0  # type: ignore[arg-type]
    assert backfill_done_when({}, locale="hu") == 0
    assert backfill_done_when({"pages": "wat"}, locale="hu") == 0
    assert backfill_done_when({"pages": {"x": "wat"}}, locale="hu") == 0


def test_backfill_preserves_id_order() -> None:
    page = _ai_page(steps=[
        {
            "id": "s1",
            "type": "prompt",
            "internal_conditions": ["c", "a", "b"],
        },
    ])
    story = _story_with_pages(page)
    backfill_done_when(story, locale="hu")
    assert page["steps"][0]["done_when"] == "c és a és b teljesül"


# --------------------------------------------------------------------------- #
# 4. expand_internal_conditions                                               #
# --------------------------------------------------------------------------- #


def test_expand_string_to_dict_with_description() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story)
    assert n == 1
    assert page["steps"][0]["internal_conditions"] == [
        {
            "id": "user_provided_topic",
            "description": "User megadta a témát.",
            "do_not_reask_if_satisfied": True,
        }
    ]


def test_expand_keeps_string_when_no_description_available() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["unknown_cond"]},
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story)
    assert n == 0
    assert page["steps"][0]["internal_conditions"] == ["unknown_cond"]


def test_expand_preserves_existing_dicts() -> None:
    pre_existing = {
        "id": "user_provided_topic",
        "description": "Custom override.",
        "validation_pattern_ref": "topic_pattern",
        "do_not_reask_if_satisfied": False,
    }
    page = _ai_page(steps=[
        {
            "id": "s1",
            "internal_conditions": [pre_existing, "tracking_seen"],
        },
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story)
    assert n == 1
    new_internal = page["steps"][0]["internal_conditions"]
    assert len(new_internal) == 2
    assert new_internal[0] is pre_existing
    assert new_internal[0]["description"] == "Custom override."
    assert new_internal[0]["do_not_reask_if_satisfied"] is False
    assert new_internal[1] == {
        "id": "tracking_seen",
        "description": "Tracking ellenőrizve.",
        "do_not_reask_if_satisfied": True,
    }


def test_expand_default_do_not_reask_off() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story, default_do_not_reask=False)
    assert n == 1
    assert page["steps"][0]["internal_conditions"][0] == {
        "id": "user_provided_topic",
        "description": "User megadta a témát.",
    }
    assert "do_not_reask_if_satisfied" not in (
        page["steps"][0]["internal_conditions"][0]
    )


def test_expand_idempotent() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    n1 = expand_internal_conditions(story)
    n2 = expand_internal_conditions(story)
    assert n1 == 1
    assert n2 == 0
    # Second pass nem változtat semmin (már mind dict).
    assert isinstance(page["steps"][0]["internal_conditions"][0], dict)


def test_expand_skips_non_ai_pages() -> None:
    story = {
        "pages": {
            "non_ai": {
                "id": "non_ai",
                "type": "end",
                "conditions": [{"id": "x", "description": "X"}],
                "steps": [{"id": "s1", "internal_conditions": ["x"]}],
            },
        },
    }
    n = expand_internal_conditions(story)
    assert n == 0
    # Non-AI page-eken NEM nyúl semmihez.
    assert story["pages"]["non_ai"]["steps"][0]["internal_conditions"] == ["x"]


def test_expand_handles_step_without_internal_conditions() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "type": "auto"},  # no internal_conditions
        {"id": "s2", "type": "prompt", "internal_conditions": []},
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story)
    assert n == 0


def test_expand_skips_empty_string_entries() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["", "  ", "user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    n = expand_internal_conditions(story)
    assert n == 1
    new_internal = page["steps"][0]["internal_conditions"]
    # Az üres bejegyzések megmaradnak (lint majd kezeli őket — itt nem
    # csinálunk hibajavítást, csak konverziót).
    assert len(new_internal) == 3
    assert new_internal[0] == ""
    assert new_internal[1] == "  "
    assert isinstance(new_internal[2], dict)


def test_expand_handles_invalid_story_shapes_gracefully() -> None:
    assert expand_internal_conditions(None) == 0  # type: ignore[arg-type]
    assert expand_internal_conditions({}) == 0
    assert expand_internal_conditions({"pages": "x"}) == 0


# --------------------------------------------------------------------------- #
# 5. apply_step_enricher                                                      #
# --------------------------------------------------------------------------- #


def test_apply_runs_both_passes_and_returns_stats() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
        {"id": "s2", "internal_conditions": ["tracking_seen", "user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    stats = apply_step_enricher(story, locale="hu")
    assert stats["conditions_expanded"] == 3
    assert stats["done_when_filled"] == 2
    # Mindkettő step done_when string-et kapott.
    assert page["steps"][0]["done_when"] == "user_provided_topic teljesül"
    assert (
        page["steps"][1]["done_when"]
        == "tracking_seen és user_provided_topic teljesül"
    )
    # Mindkettő step internal_conditions dict-formára konvertálódott.
    for step in page["steps"]:
        for ic in step["internal_conditions"]:
            assert isinstance(ic, dict)
            assert "description" in ic
            assert ic.get("do_not_reask_if_satisfied") is True


def test_apply_idempotent() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    stats1 = apply_step_enricher(story, locale="hu")
    snapshot = copy.deepcopy(story)
    stats2 = apply_step_enricher(story, locale="hu")
    assert stats1["conditions_expanded"] == 1
    assert stats1["done_when_filled"] == 1
    assert stats2["conditions_expanded"] == 0
    assert stats2["done_when_filled"] == 0
    assert story == snapshot  # identity-equal after second pass


def test_apply_with_disabled_passes() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    # Csak done_when, dict-expand kikapcsolva.
    stats = apply_step_enricher(
        story,
        locale="hu",
        do_expand_internal_conditions=False,
    )
    assert stats["conditions_expanded"] == 0
    assert stats["done_when_filled"] == 1
    assert page["steps"][0]["internal_conditions"] == ["user_provided_topic"]
    assert page["steps"][0]["done_when"] == "user_provided_topic teljesül"


def test_apply_with_done_when_disabled() -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["user_provided_topic"]},
    ])
    story = _story_with_pages(page)
    stats = apply_step_enricher(
        story,
        locale="hu",
        do_backfill_done_when=False,
    )
    assert stats["conditions_expanded"] == 1
    assert stats["done_when_filled"] == 0
    assert isinstance(page["steps"][0]["internal_conditions"][0], dict)
    assert "done_when" not in page["steps"][0]


@pytest.mark.parametrize("locale,expected", [
    ("hu", "a és b teljesül"),
    ("en", "a and b are satisfied"),
])
def test_apply_locale_propagation(locale: str, expected: str) -> None:
    page = _ai_page(steps=[
        {"id": "s1", "internal_conditions": ["a", "b"]},
    ])
    story = _story_with_pages(page)
    apply_step_enricher(story, locale=locale)
    assert page["steps"][0]["done_when"] == expected

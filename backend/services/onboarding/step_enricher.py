"""Phase 3b — deterministic step enrichment for assembled stories.

Két determinisztikus pass az `assemble_story` után, mindkettő idempotens:

1. `backfill_done_when(story, *, locale)` — non-closing AI step-ek
   `done_when` mezőjének feltöltése `internal_conditions` alapján.
   A string formátum a runtime parsere
   (`_parse_done_when_condition_groups`) által natívan elfogadott:
   * Hu: ``"<a> és <b> teljesül"``
   * En: ``"<a> and <b> are satisfied"``

2. `expand_internal_conditions(story)` — string-form internal_conditions
   ID-ket dict-formára konvertál ``{id, description,
   do_not_reask_if_satisfied: true}`` alakra. A leírás a page-szintű
   ``conditions[]``-ből származik. Ahol nincs leírás, a string-form
   megmarad (degraded — runtime működik nélküle, csak az LLM-extract
   kontextus szegényebb).

Mindkét pass **additív**: meglévő curated értékeket nem ír felül.

A `apply_step_enricher(story, *, locale)` egy lépésben futtat
mindkettőt, és visszaad egy összegző dict-et a populated step-ekkel.
"""
from __future__ import annotations

from typing import Any


_DONE_WHEN_TEMPLATES: dict[str, dict[str, str]] = {
    # `suffix_singular` opcionális: ha megadott, egy-cond eset szebb
    # grammatikát kap (Hu-ban a "teljesül" mindkét esetre jó, En-ben
    # a "is" / "are" megkülönböztetés segíti az LLM-prompt olvashatóságot).
    "hu": {"join": " és ", "suffix": " teljesül"},
    "en": {
        "join": " and ",
        "suffix": " are satisfied",
        "suffix_singular": " is satisfied",
    },
}
_DEFAULT_LOCALE = "en"


def _normalize_locale(locale: str | None) -> str:
    if not isinstance(locale, str) or not locale.strip():
        return _DEFAULT_LOCALE
    base = locale.strip().lower().split("-")[0].split("_")[0]
    return base if base in _DONE_WHEN_TEMPLATES else _DEFAULT_LOCALE


def _extract_condition_ids(internal: Any) -> list[str]:
    """internal_conditions listából ID-ket nyer ki, mindkét formára.

    Sorrendet megőrzi, deduplikál. Üres / hibás bejegyzéseket átugor.
    """
    out: list[str] = []
    seen: set[str] = set()
    if not isinstance(internal, list):
        return out
    for entry in internal:
        cid: str | None = None
        if isinstance(entry, str):
            stripped = entry.strip()
            if stripped:
                cid = stripped
        elif isinstance(entry, dict):
            v = entry.get("id")
            if isinstance(v, str) and v.strip():
                cid = v.strip()
        if cid and cid not in seen:
            out.append(cid)
            seen.add(cid)
    return out


def _format_done_when(ids: list[str], locale: str) -> str:
    """ID-listából runtime-parseable done_when string.

    Üres lista → üres string. A locale a `_DONE_WHEN_TEMPLATES` kulcsa
    kell legyen (`hu` vagy `en`); egyéb értékre `_DEFAULT_LOCALE` esik
    vissza. Egy-cond esetben az opcionális `suffix_singular` használt,
    ha a template tartalmazza (En: "is satisfied"); egyébként a `suffix`.
    """
    if not ids:
        return ""
    norm = _normalize_locale(locale)
    tmpl = _DONE_WHEN_TEMPLATES[norm]
    suffix = (
        tmpl["suffix_singular"]
        if len(ids) == 1 and tmpl.get("suffix_singular")
        else tmpl["suffix"]
    )
    return tmpl["join"].join(ids) + suffix


def backfill_done_when(story: dict, *, locale: str = _DEFAULT_LOCALE) -> int:
    """`step.done_when` feltöltése AI-page-ek non-closing step-jein.

    Kihagyja azokat a step-eket, amelyek:
    - már nem-üres `done_when` string-gel rendelkeznek (curated preserve)
    - closing step-ek (closing flow bundle-en keresztül zár)
    - üres `internal_conditions` listával (auto-advance one-shot)

    Visszatér: hány step kapott újonnan `done_when` értéket.
    """
    if not isinstance(story, dict):
        return 0
    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return 0
    populated = 0
    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue
        steps = page.get("steps") or []
        if not isinstance(steps, list):
            continue
        for step in steps:
            if not isinstance(step, dict):
                continue
            if step.get("is_closing") is True:
                continue
            existing = step.get("done_when")
            if isinstance(existing, str) and existing.strip():
                continue
            ids = _extract_condition_ids(step.get("internal_conditions"))
            if not ids:
                continue
            step["done_when"] = _format_done_when(ids, locale)
            populated += 1
    return populated


def _build_condition_description_lookup(page: dict) -> dict[str, str]:
    """`{cond_id: description}` mapping a page-szintű conditions[]-ből."""
    out: dict[str, str] = {}
    conditions = page.get("conditions") or []
    if not isinstance(conditions, list):
        return out
    for c in conditions:
        if not isinstance(c, dict):
            continue
        cid = c.get("id")
        desc = c.get("description")
        if (
            isinstance(cid, str) and cid.strip()
            and isinstance(desc, str) and desc.strip()
        ):
            out[cid.strip()] = desc.strip()
    return out


def expand_internal_conditions(
    story: dict,
    *,
    default_do_not_reask: bool = True,
) -> int:
    """String-form internal_conditions ID-k dict-formára konvertálása.

    Minden AI page-en:
    - description-lookup a page.conditions[]-ből
    - string ID → `{id, description, do_not_reask_if_satisfied: True}` dict
    - dict bejegyzéseket érintetlenül hagy (additív, nem ír felül)
    - description nélkül a string-form MEGMARAD (degraded, de érvényes
      a lint és a runtime számára egyaránt)

    Visszatér: hány internal_conditions ID-t alakítottunk dict-té.
    """
    if not isinstance(story, dict):
        return 0
    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return 0
    converted = 0
    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue
        desc_lookup = _build_condition_description_lookup(page)
        steps = page.get("steps") or []
        if not isinstance(steps, list):
            continue
        for step in steps:
            if not isinstance(step, dict):
                continue
            internal = step.get("internal_conditions")
            if not isinstance(internal, list) or not internal:
                continue
            new_internal: list[Any] = []
            changed = False
            for entry in internal:
                if isinstance(entry, dict):
                    new_internal.append(entry)
                    continue
                if not isinstance(entry, str) or not entry.strip():
                    new_internal.append(entry)
                    continue
                cid = entry.strip()
                desc = desc_lookup.get(cid)
                if not desc:
                    new_internal.append(cid)
                    continue
                new_dict: dict[str, Any] = {"id": cid, "description": desc}
                if default_do_not_reask:
                    new_dict["do_not_reask_if_satisfied"] = True
                new_internal.append(new_dict)
                changed = True
                converted += 1
            if changed:
                step["internal_conditions"] = new_internal
    return converted


# --------------------------------------------------------------------------- #
# Phase 3f: auto_satisfy_after_reply + do_not_reask_if_satisfied heuristic    #
# --------------------------------------------------------------------------- #


# Per-locale signal phrases. The Phase 2 prompt instructs the AI to embed
# one of these phrases in the `description` of any condition that should
# be auto-satisfied after the AI's outgoing message. We detect the
# phrases in a tolerant, lower-cased substring match — both fragments
# must be present (AND-logic) for a single signal entry to fire.
#
# A signal entry is `(fragment_a, fragment_b)`. Either fragment alone is
# too weak (e.g. "automatically satisfied" can occur in customer-facing
# text without intending the runtime semantics); the second fragment
# disambiguates the engineering intent.
_AUTO_SATISFY_SIGNALS: dict[str, tuple[tuple[str, str], ...]] = {
    "hu": (
        ("ne várj", "automatikusan teljesül"),
        ("ne várj ügyfél", "miután az ai"),
        ("automatikusan teljesül", "miután az ai elküldte"),
        ("ne várj válasz", "automatikusan"),
    ),
    "en": (
        ("do not wait", "automatically satisfied"),
        ("do not wait for", "ai message is sent"),
        ("automatically satisfied", "after the ai"),
        ("no customer reply needed", "automatically"),
    ),
}

# Phrases that justify `do_not_reask_if_satisfied: true` — the AI should
# NOT re-prompt for a fact already in the satisfied set. These overlap
# semantically with the auto-satisfy signals but are distinct: a
# condition can be `do_not_reask` without being `auto_satisfy` (e.g. a
# user-provided fact that we cached and shouldn't re-ask for).
_DO_NOT_REASK_SIGNALS: dict[str, tuple[tuple[str, str], ...]] = {
    "hu": (
        ("ha az ügyfél már említette", ""),
        ("ne kérdezd újra", ""),
        ("ne kérd újra", ""),
        ("már elmondta", "ne ismételd"),
    ),
    "en": (
        ("if the customer has already", ""),
        ("do not re-ask", ""),
        ("do not ask again", ""),
        ("already mentioned", "do not repeat"),
    ),
}


def _normalise_text(s: str) -> str:
    """Lower + collapse whitespace + strip; safe for substring scans."""
    if not isinstance(s, str):
        return ""
    return " ".join(s.lower().split())


def _matches_signal(
    description: str,
    signals: tuple[tuple[str, str], ...],
) -> bool:
    """True iff at least one signal entry's BOTH fragments are present.

    A signal entry with an empty second fragment is satisfied by the
    first fragment alone. Lowercase, whitespace-collapsed comparison.
    """
    text = _normalise_text(description)
    if not text:
        return False
    for a, b in signals:
        if not a:
            continue
        if a.lower() not in text:
            continue
        if not b:
            return True
        if b.lower() in text:
            return True
    return False


def apply_auto_satisfy_heuristic(
    story: dict,
    *,
    locale: str = _DEFAULT_LOCALE,
) -> dict[str, int]:
    """Detector pass: flip ``auto_satisfy_after_reply: true`` and
    ``do_not_reask_if_satisfied: true`` on every step.internal_conditions
    dict whose `description` matches the locale-specific signal phrases.

    Additive: existing flags are NEVER overwritten — even if the
    description matches, an explicit `False` stays `False`. This lets a
    curated story override the heuristic.

    Returns::

        {"auto_satisfy_flagged": N, "do_not_reask_flagged": M,
         "scanned_conditions": K}

    Where K is the total number of dict-form internal_conditions
    inspected (string-form entries are skipped — `expand_internal_conditions`
    should run first to convert them).
    """
    if not isinstance(story, dict):
        return {
            "auto_satisfy_flagged": 0,
            "do_not_reask_flagged": 0,
            "scanned_conditions": 0,
        }
    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return {
            "auto_satisfy_flagged": 0,
            "do_not_reask_flagged": 0,
            "scanned_conditions": 0,
        }

    norm_locale = _normalize_locale(locale)
    auto_signals = _AUTO_SATISFY_SIGNALS.get(norm_locale, ())
    nask_signals = _DO_NOT_REASK_SIGNALS.get(norm_locale, ())

    scanned = 0
    auto_flagged = 0
    nask_flagged = 0

    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue
        steps = page.get("steps") or []
        if not isinstance(steps, list):
            continue
        for step in steps:
            if not isinstance(step, dict):
                continue
            if step.get("is_closing") is True:
                continue
            internal = step.get("internal_conditions")
            if not isinstance(internal, list) or not internal:
                continue
            for entry in internal:
                if not isinstance(entry, dict):
                    continue
                desc = entry.get("description")
                if not isinstance(desc, str) or not desc.strip():
                    continue
                scanned += 1
                if (
                    "auto_satisfy_after_reply" not in entry
                    and _matches_signal(desc, auto_signals)
                ):
                    entry["auto_satisfy_after_reply"] = True
                    auto_flagged += 1
                if (
                    "do_not_reask_if_satisfied" not in entry
                    and _matches_signal(desc, nask_signals)
                ):
                    entry["do_not_reask_if_satisfied"] = True
                    nask_flagged += 1

    return {
        "auto_satisfy_flagged": auto_flagged,
        "do_not_reask_flagged": nask_flagged,
        "scanned_conditions": scanned,
    }


def _step_internal_conditions_dict_iter(step: dict) -> list[dict]:
    """Helper: yield only the dict-form internal_conditions for a step."""
    out: list[dict] = []
    for ic in step.get("internal_conditions") or []:
        if isinstance(ic, dict):
            out.append(ic)
    return out


def apply_chain_skip_heuristic(story: dict) -> dict[str, int]:
    """Set ``skippable: false`` and ``chain_on_complete: true`` on
    AUTO-step-style nodes — those whose ALL dict-form
    ``internal_conditions[]`` are flagged ``auto_satisfy_after_reply: true``.

    Reasoning: when every cond on the step is auto-satisfy, the step's
    "work" is the AI message itself. Such steps must
      - run even if the conditions look "done" pre-step
        (``skippable: false``), AND
      - chain onwards within the same turn (``chain_on_complete: true``)
        because the AI reply already moved the flow forward.

    The heuristic is **strictly additive**:
      - Never overwrites an explicit ``skippable`` or
        ``chain_on_complete`` value (so manual overrides win).
      - Skips closing steps (their bundle takes precedence).
      - Skips steps with NO dict-form internal_conditions (still as
        strings or empty — those wouldn't pass our trigger anyway).

    Returns::

        {"skippable_set_false": N, "chain_on_complete_set_true": M,
         "auto_steps_detected": K}
    """
    out = {
        "skippable_set_false": 0,
        "chain_on_complete_set_true": 0,
        "auto_steps_detected": 0,
    }
    if not isinstance(story, dict):
        return out
    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return out

    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue
        for step in page.get("steps") or []:
            if not isinstance(step, dict):
                continue
            if step.get("is_closing") is True:
                continue
            ics = _step_internal_conditions_dict_iter(step)
            if not ics:
                continue
            all_auto = all(
                ic.get("auto_satisfy_after_reply") is True for ic in ics
            )
            if not all_auto:
                continue
            out["auto_steps_detected"] += 1
            if "skippable" not in step:
                step["skippable"] = False
                out["skippable_set_false"] += 1
            if "chain_on_complete" not in step:
                step["chain_on_complete"] = True
                out["chain_on_complete_set_true"] += 1
    return out


def apply_step_enricher(
    story: dict,
    *,
    locale: str = _DEFAULT_LOCALE,
    do_backfill_done_when: bool = True,
    do_expand_internal_conditions: bool = True,
    do_auto_satisfy_heuristic: bool = True,
    do_chain_skip_heuristic: bool = True,
    do_post_expand_validation_pattern_ref: bool = True,
    default_do_not_reask: bool = True,
) -> dict[str, int]:
    """All Phase 3b/3f deterministic passes in order.

    Sequence:
      1. ``expand_internal_conditions`` — string IDs → dicts (so the
         heuristic and done_when builder see uniform data).
      2. ``apply_auto_satisfy_heuristic`` — flip per-condition runtime
         flags based on description signal phrases.
      3. ``backfill_done_when`` — fill the step.done_when string from
         the (now canonical) internal_conditions dict list.

    All passes are **additive**: existing curated values are preserved.

    Returns::

        {"done_when_filled": N, "conditions_expanded": M,
         "auto_satisfy_flagged": A, "do_not_reask_flagged": D,
         "scanned_conditions": K}
    """
    expanded = 0
    if do_expand_internal_conditions:
        expanded = expand_internal_conditions(
            story, default_do_not_reask=default_do_not_reask
        )
    auto_stats: dict[str, int] = {
        "auto_satisfy_flagged": 0,
        "do_not_reask_flagged": 0,
        "scanned_conditions": 0,
    }
    if do_auto_satisfy_heuristic:
        auto_stats = apply_auto_satisfy_heuristic(story, locale=locale)
    chain_stats: dict[str, int] = {
        "skippable_set_false": 0,
        "chain_on_complete_set_true": 0,
        "auto_steps_detected": 0,
    }
    if do_chain_skip_heuristic:
        chain_stats = apply_chain_skip_heuristic(story)
    # Re-run validation_pattern_ref attach AFTER expand_internal_conditions
    # so that step-level cond IDs that were string-form at the meta_builder
    # phase get the ref now that they're dict-form. The meta_builder's own
    # call already covered page-level conditions[].
    vpr_post_stats = {"step_conds_touched": 0}
    if do_post_expand_validation_pattern_ref:
        # Local import to avoid a circular dependency at module load time.
        from services.onboarding.meta_builder import apply_validation_pattern_refs
        vpr_full = apply_validation_pattern_refs(story)
        vpr_post_stats = {
            "step_conds_touched": vpr_full["step_conds_touched"],
        }
    filled = 0
    if do_backfill_done_when:
        filled = backfill_done_when(story, locale=locale)
    return {
        "done_when_filled": filled,
        "conditions_expanded": expanded,
        **auto_stats,
        **chain_stats,
        "validation_pattern_ref_post_attached": vpr_post_stats["step_conds_touched"],
    }

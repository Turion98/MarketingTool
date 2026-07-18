"""Phase 3a — deterministic story-meta builder.

Constructs the three meta sections that the AI generation step intentionally
does NOT produce (because they're either global story-level concerns or
deterministic mappings derivable from the blueprint + assembled nodes):

1. ``order_context_mapping`` — `field_rules[]` that wire OrderContext fields
   to derived conditions (e.g. `purchase_date` → `has_purchase_date`).
   Every condition referenced in node routing/branches that matches a
   known-field pattern gets an explicit derive rule, so the runtime can
   actually satisfy it from the OrderContext.

2. ``condition_labels`` — short, human-readable label per condition id,
   sourced from the condition's `description` field across all AI nodes.

3. ``reply_style`` — locale-driven global conversation style template
   (tone rules + `ack_and_paragraph_instruction`).

All three are pure-Python, deterministic, idempotent, and zero AI-cost.
The orchestrator's `assemble_story` runs this AFTER the cross-node linker
and BEFORE the final `lint_full_story` pass — so the lint sees the
fully-populated meta block.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping, Optional

from shared.story_lint import KNOWN_OCM_FIELDS, REQUIRED_COMPUTED_KEYS


# --------------------------------------------------------------------------- #
# 1. order_context_mapping                                                    #
# --------------------------------------------------------------------------- #


# Recognized derive patterns. The AI commonly uses both forms across the
# generated nodes:
#   - `has_<field>` for "field is provided / non-null"
#   - `<field>_known` for the same intent
# We keep both because mixing them in real generations is the norm; the
# resulting field_rule is identical (when=not_null).
_DERIVE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^has_(?P<field>[a-z][a-z0-9_]*)$"), "not_null"),
    (re.compile(r"^(?P<field>[a-z][a-z0-9_]*)_known$"), "not_null"),
)


def _all_referenced_conditions(story: dict) -> set[str]:
    """Every condition id touched anywhere a routing decision could see it.

    Includes:
      - top-level `conditions[].id` (for completeness)
      - routing.if[] tokens (strip leading `!` for negation)
      - step.branches[].if[] tokens
      - condition_implications.when_all[] + .then
      - session_facts_whitelist[]
      - routing[*].inject_conditions[]
      - step.internal_conditions[].id (for declared but maybe internal cond)
    """
    refs: set[str] = set()

    pages = story.get("pages") or {}
    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue

        for c in page.get("conditions", []) or []:
            if isinstance(c, dict):
                cid = c.get("id")
                if isinstance(cid, str) and cid:
                    refs.add(cid)

        for r in page.get("routing", []) or []:
            if not isinstance(r, dict):
                continue
            for tok in r.get("if", []) or []:
                if isinstance(tok, str):
                    refs.add(tok.lstrip("!").strip())
            for tok in r.get("inject_conditions", []) or []:
                if isinstance(tok, str):
                    refs.add(tok.strip())

        for s in page.get("steps", []) or []:
            if not isinstance(s, dict):
                continue
            for b in s.get("branches", []) or []:
                if isinstance(b, dict):
                    for tok in b.get("if", []) or []:
                        if isinstance(tok, str):
                            refs.add(tok.lstrip("!").strip())
                    for tok in b.get("inject_conditions", []) or []:
                        if isinstance(tok, str):
                            refs.add(tok.strip())
            for ic in s.get("internal_conditions", []) or []:
                if isinstance(ic, str):
                    refs.add(ic.strip())
                elif isinstance(ic, dict):
                    cid = ic.get("id")
                    if isinstance(cid, str) and cid:
                        refs.add(cid)

        for ci in page.get("condition_implications", []) or []:
            if isinstance(ci, dict):
                for tok in ci.get("when_all", []) or []:
                    if isinstance(tok, str):
                        refs.add(tok.lstrip("!").strip())
                t = ci.get("then")
                if isinstance(t, str):
                    refs.add(t)

        for tok in page.get("session_facts_whitelist", []) or []:
            if isinstance(tok, str):
                refs.add(tok)

    refs.discard("")
    return refs


def build_order_context_mapping(
    story: dict,
    *,
    extra_known_fields: Iterable[str] | None = None,
    base_field_rules: Iterable[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a `meta.order_context_mapping` dict from the assembled story.

    Args:
        story: assembled story dict (post Phase 2 + Phase 2.5 linker).
        extra_known_fields: domain-specific OCM extensions (typically the
            blueprint's `proposed_new_external_fields[].field_name` list).
            These are recognized as legitimate fields alongside the global
            `KNOWN_OCM_FIELDS`.
        base_field_rules: optional seed list of pre-existing field_rules.
            Anything in this list is preserved verbatim and de-duplicated
            against the auto-derived ones (matched on `(field, condition)`
            tuple). Useful when a domain has hand-crafted rules.

    Returns:
        A dict shaped like::

            {
              "field_rules": [
                {"field": "purchase_date", "condition": "has_purchase_date",
                 "when": "not_null"},
                ...
              ]
            }

        Empty `field_rules` list when no derive-able conditions are found.
        Always returns a dict (never None), so the caller can safely assign
        it onto `meta`.

    The function is deterministic: same input → same output ordering
    (sorted by `field` then `condition`).
    """
    known_global = set(KNOWN_OCM_FIELDS)
    known_extra = set(extra_known_fields or ())
    known_all = known_global | known_extra

    referenced = _all_referenced_conditions(story)

    seen: set[tuple[str, str]] = set()
    rules: list[dict[str, Any]] = []

    if base_field_rules:
        for r in base_field_rules:
            if not isinstance(r, Mapping):
                continue
            f, c = r.get("field"), r.get("condition")
            if isinstance(f, str) and isinstance(c, str):
                seen.add((f, c))
                rules.append(dict(r))

    derived: list[dict[str, Any]] = []
    for cid in referenced:
        for pattern, when_form in _DERIVE_PATTERNS:
            m = pattern.match(cid)
            if not m:
                continue
            field = m.group("field")
            if field not in known_all:
                continue
            key = (field, cid)
            if key in seen:
                break
            seen.add(key)
            derived.append({
                "field": field,
                "condition": cid,
                "when": when_form,
            })
            break

    derived.sort(key=lambda r: (r["field"], r["condition"]))
    rules.extend(derived)

    return {"field_rules": rules}


# --------------------------------------------------------------------------- #
# 1b. precedence_rules + session_guard_not (curated catalog)                  #
# --------------------------------------------------------------------------- #


# Curated precedence catalog. Each entry: ``(if_present, suppress)`` meaning
# "if `if_present` is in the satisfied set, the runtime drops `suppress` from
# the satisfied set" (see `services/order_context.py::apply_precedence`).
#
# Patterns are domain-agnostic enough for the refurb-electronics / general
# retail complaint flows we currently target. Two of them are taken straight
# from `ai_complaint_story_v3.json`; the rest are deterministic
# generalizations of recurring v3-style logic where the precedence is
# UNAMBIGUOUS (one condition logically dominates the other).
#
# We DO NOT include precedence pairs that are debatable (e.g. whether
# `change_of_mind` should override a verified DOA claim). The AI prompt is
# free to add nuanced ones; this catalog only seeds the safe defaults.
#
# A rule is applied IFF BOTH `if_present` AND `suppress` ids are referenced
# anywhere in the story (routing, branches, conditions, implications,
# inject_conditions, internal_conditions, session_facts_whitelist). This
# keeps the OCM lean — no dead rules.
_PRECEDENCE_CATALOG: tuple[tuple[str, str], ...] = (
    # Carrier-evidence beats "lost in transit" claim — v3-proven pair.
    ("marked_delivered_not_received", "package_lost"),
    # DOA claim short-circuits exclusion / wear analysis — v3-proven.
    ("defect_on_arrival", "exclusion_risk"),
    ("defect_on_arrival", "normal_wear"),
    # Verified DOA dominates the same suppression set.
    ("doa_confirmed", "exclusion_risk"),
    ("doa_confirmed", "normal_wear"),
    # Wholesale wrong-item dominates other product-quality narratives.
    ("wrong_item_received", "defective_item"),
    ("wrong_item_received", "wrong_size"),
    # Mutually-exclusive observations on the same parcel.
    ("seal_was_broken", "box_intact"),
)


def build_precedence_rules(
    story: dict,
    *,
    catalog: Iterable[tuple[str, str]] = _PRECEDENCE_CATALOG,
) -> list[dict[str, str]]:
    """Build a deterministic list of precedence_rules for `meta.order_context_mapping`.

    For each ``(if_present, suppress)`` pair in the catalog we emit a rule
    iff BOTH ids are actually referenced somewhere in the story. The rule
    shape matches what the runtime expects::

        {"if_present": "...", "suppress": "..."}

    The function is pure and deterministic; ordering follows the catalog
    declaration order so reviews of generated stories stay diff-stable.

    Args:
        story: assembled story dict (post Phase 2 + Phase 2.5 linker).
        catalog: optional override of the seed catalog (e.g. for tests or
            domain-specific extensions).

    Returns:
        A list of rule dicts (possibly empty).
    """
    referenced = _all_referenced_conditions(story)
    rules: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for if_present, suppress in catalog:
        if if_present not in referenced or suppress not in referenced:
            continue
        key = (if_present, suppress)
        if key in seen:
            continue
        seen.add(key)
        rules.append({"if_present": if_present, "suppress": suppress})
    return rules


def _inject_session_guard_not(
    field_rules: list[dict[str, Any]],
    precedence_rules: Iterable[Mapping[str, str]],
) -> int:
    """Auto-attach `session_guard_not` to field_rules whose `condition`
    appears as a `suppress` target in `precedence_rules`.

    Reasoning: if a precedence_rule says "if_present X suppresses Y", then
    the OCM derive step that sets Y from a field should also be guarded —
    we don't want the field-derive to silently re-introduce Y after the
    runtime has explicitly suppressed it.

    Mutates `field_rules` in place. Existing `session_guard_not` values
    are NEVER overwritten — that's the curated AI/human override and we
    respect it. Returns the number of rules touched.
    """
    if not field_rules:
        return 0
    suppress_to_guard: dict[str, str] = {}
    for r in precedence_rules:
        if not isinstance(r, Mapping):
            continue
        ip = r.get("if_present")
        sup = r.get("suppress")
        if isinstance(ip, str) and isinstance(sup, str) and ip and sup:
            # First wins: if multiple if_present suppress the same target,
            # we keep the first one (catalog ordering is intentional).
            suppress_to_guard.setdefault(sup, ip)

    touched = 0
    for rule in field_rules:
        if not isinstance(rule, dict):
            continue
        cond = rule.get("condition")
        if not isinstance(cond, str):
            continue
        guard = suppress_to_guard.get(cond)
        if guard is None:
            continue
        if "session_guard_not" in rule:
            continue
        rule["session_guard_not"] = guard
        touched += 1
    return touched


# --------------------------------------------------------------------------- #
# 1b2. validation_pattern_ref + meta.reference_id_pattern                     #
# --------------------------------------------------------------------------- #


# Default `meta.reference_id_pattern` if the story doesn't ship one. The
# loose form ``[A-Z]{2,6}-\d{2,6}`` matches any uppercased prefix of 2-6
# letters, a hyphen, then 2-6 digits — covering ``ORD-12345``,
# ``RT-000123``, ``ACME-9999`` and similar. We deliberately do NOT require
# an ``ORD-`` prefix (the v3 story does, but that's domain-specific).
# Override via the `apply_meta_builder(reference_id_pattern_override=...)`
# parameter if the domain has a stricter format.
_DEFAULT_REFERENCE_ID_PATTERN = r"[A-Z]{2,6}-\d{2,6}"


# Curated mapping of condition-id stem → meta-key the runtime should
# regex-validate against. The matching is EXACT on the condition id; we
# don't apply prefix/suffix expansion to keep behaviour predictable.
#
# Add an entry only when the condition is meant to capture a structured
# user-provided reference (order id, prior-case id, etc.) — NEVER for
# free-text conditions. The runtime gates the satisfied state with the
# regex, so a bad mapping would silently reject legitimate user input.
_VALIDATION_PATTERN_REF_MAP: dict[str, str] = {
    "has_order_id": "reference_id_pattern",
    "order_id_provided": "reference_id_pattern",
    "has_prior_case_id": "reference_id_pattern",
    "prior_case_id_provided": "reference_id_pattern",
}


def _ensure_reference_id_pattern(
    meta: dict,
    *,
    pattern_default: str,
    overwrite_existing: bool,
) -> tuple[bool, str]:
    """Set ``meta.reference_id_pattern`` if missing (or in overwrite mode).

    Returns ``(added, pattern_used)``.
    """
    existing = meta.get("reference_id_pattern")
    if isinstance(existing, str) and existing.strip() and not overwrite_existing:
        return False, existing
    meta["reference_id_pattern"] = pattern_default
    return True, pattern_default


def apply_validation_pattern_refs(
    story: dict,
    *,
    map_overrides: Mapping[str, str] | None = None,
) -> dict[str, int]:
    """Auto-attach ``validation_pattern_ref`` to known reference conditions.

    For every AI-page top-level ``conditions[]`` and every
    step ``internal_conditions[]`` (dict-form only): if the condition's
    ``id`` matches an entry in the curated map AND the meta key it
    points to actually exists AND there is no existing
    ``validation_pattern_ref`` → set the ref.

    The curated map can be extended/overridden via ``map_overrides``.
    Returns ``{"page_conds_touched": int, "step_conds_touched": int}``.
    """
    out = {"page_conds_touched": 0, "step_conds_touched": 0}
    if not isinstance(story, dict):
        return out
    meta = story.get("meta") or {}
    if not isinstance(meta, dict):
        return out

    effective_map: dict[str, str] = dict(_VALIDATION_PATTERN_REF_MAP)
    if map_overrides:
        for k, v in map_overrides.items():
            if isinstance(k, str) and isinstance(v, str) and k.strip() and v.strip():
                effective_map[k.strip()] = v.strip()

    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return out

    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue

        for c in page.get("conditions", []) or []:
            if not isinstance(c, dict):
                continue
            cid = c.get("id")
            if not isinstance(cid, str):
                continue
            ref = effective_map.get(cid)
            if not ref:
                continue
            if not isinstance(meta.get(ref), str) or not meta[ref]:
                continue
            if c.get("validation_pattern_ref"):
                continue
            c["validation_pattern_ref"] = ref
            out["page_conds_touched"] += 1

        for s in page.get("steps", []) or []:
            if not isinstance(s, dict):
                continue
            for ic in s.get("internal_conditions", []) or []:
                if not isinstance(ic, dict):
                    continue
                cid = ic.get("id")
                if not isinstance(cid, str):
                    continue
                ref = effective_map.get(cid)
                if not ref:
                    continue
                if not isinstance(meta.get(ref), str) or not meta[ref]:
                    continue
                if ic.get("validation_pattern_ref"):
                    continue
                ic["validation_pattern_ref"] = ref
                out["step_conds_touched"] += 1

    return out


# --------------------------------------------------------------------------- #
# 1c. computed_condition_ids (REQUIRED keys + alias resolution)               #
# --------------------------------------------------------------------------- #


# Per-key alias table. The runtime addresses condition IDs through
# `meta.order_context_mapping.computed_condition_ids[key]`. The lint
# requires every key in `REQUIRED_COMPUTED_KEYS` to be populated; if it
# is missing, the runtime falls back to the bare key name.
#
# We try, in order:
#   1. exact match — the AI generated the same key as a condition id;
#   2. alias — recurring stylistic variants observed across generations;
#   3. give up — let the lint warning fire, the runtime will fallback.
#
# Aliases are LOWERCASED, snake_case substrings; the resolver checks
# them against the set of referenced condition IDs in the story.
_COMPUTED_KEY_ALIASES: dict[str, tuple[str, ...]] = {
    "within_return_window": (
        "within_window",
        "in_return_window",
        "purchase_within_window",
        "return_window_active",
        "is_within_return_window",
    ),
    "outside_return_window": (
        "outside_window",
        "outside_return_period",
        "out_of_return_window",
        "return_window_expired",
        "is_outside_return_window",
    ),
    "delay_duration_known": (
        "delay_known",
        "shipment_delay_known",
        "delivery_delay_known",
        "transit_delay_known",
    ),
    "below_sold_threshold": (
        "battery_below_threshold",
        "below_threshold",
        "battery_below_sold_threshold",
        "below_sold_battery_threshold",
    ),
    "accessory_was_in_order": (
        "accessory_in_order",
        "accessory_was_ordered",
        "accessory_listed_in_order",
    ),
    "accessory_not_in_order": (
        "accessory_not_ordered",
        "missing_accessory_not_in_order",
        "accessory_not_listed",
    ),
    "return_was_completed": (
        "return_completed",
        "return_received",
        "return_delivered",
    ),
    "return_not_received": (
        "return_missing",
        "return_lost",
        "return_not_received_yet",
        "return_not_delivered",
    ),
}


def build_computed_condition_ids(
    story: dict,
    *,
    required_keys: Iterable[str] = REQUIRED_COMPUTED_KEYS,
    aliases: Mapping[str, Iterable[str]] = _COMPUTED_KEY_ALIASES,
) -> dict[str, str]:
    """Auto-resolve `meta.order_context_mapping.computed_condition_ids`.

    For each required key we pick a condition id from the story:
      1. exact match (key itself is a referenced condition id), or
      2. first alias that is a referenced condition id.

    Keys with no match are SKIPPED (not falsely populated): the lint will
    warn, and the runtime falls back to the bare key name. This is a
    conscious choice — silently mapping a key to an arbitrary id would be
    worse than the default fallback.

    Returns a fresh dict (possibly empty), in deterministic order.
    """
    referenced = _all_referenced_conditions(story)
    out: dict[str, str] = {}
    for key in required_keys:
        if key in referenced:
            out[key] = key
            continue
        candidates = aliases.get(key) or ()
        for alias in candidates:
            if alias in referenced:
                out[key] = alias
                break
    return dict(sorted(out.items()))


# --------------------------------------------------------------------------- #
# 1d. session_state_keys (blueprint-aware, name-suffix heuristic)             #
# --------------------------------------------------------------------------- #


# Suffix list for "session-collected" fields — the user reports the
# value via the agent rather than it coming from a backend record. We
# strip the suffix to produce a short alias key the runtime can use as a
# session_state_keys lookup name. Patterns are matched case-insensitively
# against trailing characters; the longest match wins.
_SESSION_COLLECTED_SUFFIXES: tuple[str, ...] = (
    "_reported_by_user",
    "_user_reported",
    "_user_provided",
    "_user_input",
    "_user_supplied",
)


def _strip_session_suffix(field_name: str) -> Optional[str]:
    """Return the alias key (suffix-stripped) or None if no suffix matches."""
    if not isinstance(field_name, str):
        return None
    name = field_name.strip()
    if not name:
        return None
    matched: Optional[str] = None
    for suffix in _SESSION_COLLECTED_SUFFIXES:
        if name.lower().endswith(suffix) and (
            matched is None or len(suffix) > len(matched)
        ):
            matched = suffix
    if matched is None:
        return None
    alias = name[: -len(matched)].rstrip("_")
    return alias or None


def build_session_state_keys(
    session_collected_fields: Iterable[str],
    *,
    explicit_overrides: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Build a `meta.order_context_mapping.session_state_keys` mapping.

    Args:
        session_collected_fields: blueprint-derived field names that the
            agent gathers from the user during the session
            (e.g. ``"battery_health_user_reported"``). Fields without a
            recognised session-collected suffix are skipped — the caller
            controls what enters the iterable.
        explicit_overrides: optional ``{alias: field_name}`` map merged
            on top of the auto-derived mapping (curated wins).

    Returns:
        Sorted dict ``{short_alias: full_field_name}``.
    """
    out: dict[str, str] = {}
    for fname in session_collected_fields or []:
        alias = _strip_session_suffix(fname)
        if alias and alias not in out:
            out[alias] = fname.strip()
    if explicit_overrides:
        for k, v in explicit_overrides.items():
            if isinstance(k, str) and isinstance(v, str) and k.strip() and v.strip():
                out[k.strip()] = v.strip()
    return dict(sorted(out.items()))


# --------------------------------------------------------------------------- #
# 2. condition_labels                                                         #
# --------------------------------------------------------------------------- #


_LABEL_MAX_LEN = 120


def _short_label(description: str) -> str:
    """Trim a long description into a label-sized form.

    Strategy: take the first sentence (split on `.!?`), strip whitespace,
    drop a trailing period, and truncate at `_LABEL_MAX_LEN` if still too
    long (with an ellipsis).
    """
    if not isinstance(description, str):
        return ""
    s = description.strip()
    if not s:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", s, maxsplit=1)
    label = parts[0].strip()
    if label.endswith("."):
        label = label[:-1]
    if len(label) > _LABEL_MAX_LEN:
        label = label[: _LABEL_MAX_LEN - 1].rstrip() + "…"
    return label


def build_condition_labels(
    story: dict,
    *,
    overrides: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Build a `meta.condition_labels` dict from declared condition descriptions.

    Walks every AI-page's top-level `conditions[]` and step
    `internal_conditions[]` (dict form). For each `(id, description)` with
    a non-empty description, produces a short human label.

    Args:
        story: assembled story dict.
        overrides: optional explicit `{condition_id: label}` map that wins
            over the auto-derived labels (handy when one wants curated
            phrasing for high-visibility conditions).

    Returns:
        Dict `{condition_id: label}`, always a dict (possibly empty).
        Iteration order is deterministic (sorted by id).
    """
    raw: dict[str, str] = {}

    pages = story.get("pages") or {}
    for page in pages.values():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue

        for c in page.get("conditions", []) or []:
            if not isinstance(c, dict):
                continue
            cid = c.get("id")
            desc = c.get("description")
            if isinstance(cid, str) and cid and isinstance(desc, str) and desc:
                if cid not in raw:
                    raw[cid] = _short_label(desc)

        for s in page.get("steps", []) or []:
            if not isinstance(s, dict):
                continue
            for ic in s.get("internal_conditions", []) or []:
                if not isinstance(ic, dict):
                    continue
                cid = ic.get("id")
                desc = ic.get("description")
                if isinstance(cid, str) and cid and isinstance(desc, str) and desc:
                    if cid not in raw:
                        raw[cid] = _short_label(desc)

    if overrides:
        for k, v in overrides.items():
            if isinstance(k, str) and isinstance(v, str) and v.strip():
                raw[k] = v.strip()

    return {k: raw[k] for k in sorted(raw) if raw[k]}


# --------------------------------------------------------------------------- #
# 2b. question_detection_hint (locale-templated)                              #
# --------------------------------------------------------------------------- #


# Locale-keyed templates. The runtime extract-prompt embeds these to help
# the LLM decide whether a user message is a QUESTION (so the extractor
# should NOT pull facts from it) or an ANSWER. The shape mirrors
# `ai_complaint_story_v3.json`:
#   - `true_if`: phrasings that strongly indicate the message IS a question
#   - `false_if`: counter-phrasings that override `true_if`
#   - `uncertain`: default decision when neither side fires (string "true"
#     or "false"; v3 uses "false" — be generous to extraction).
_QUESTION_DETECTION_TEMPLATES: dict[str, dict[str, Any]] = {
    "hu": {
        "true_if": [
            "A felhasználó megkérdezi miért kell egy adat "
            "(pl. 'miért kell a rendelési szám?')",
            "A felhasználó rákérdez mi fog történni ezután "
            "(pl. 'mi lesz a következő lépés?')",
            "A felhasználó megkérdezi mennyi ideig tart valami "
            "(pl. 'mikor kapom vissza a pénzem?')",
            "A felhasználó nem ért egy fogalmat és magyarázatot kér "
            "(pl. 'mi az a tracking szám?')",
            "A felhasználó rákérdez a folyamat egy részletére "
            "(pl. 'hogyan küldjük vissza?')",
            "A felhasználó megkérdezi mit jelent egy státusz vagy mező "
            "(pl. 'mit jelent hogy delivered?')",
        ],
        "false_if": [
            "Retorikai kérdés vagy udvariassági visszakérdezés "
            "(pl. 'jól értem?', 'rendben?', 'oké?')",
            "A kérdés és az adat ugyanabban az üzenetben érkezik és "
            "a kérdés egyértelműen az adathoz kapcsolódik",
            "Az ügyfél megerősítést kér egy általa már leírt tényről "
            "(pl. 'tehát ez így van?')",
        ],
        "uncertain": "false",
    },
    "en": {
        "true_if": [
            "User asks WHY a data point is needed "
            "(e.g. 'why do you need my order number?')",
            "User asks WHAT will happen next "
            "(e.g. 'what is the next step?')",
            "User asks HOW LONG something takes "
            "(e.g. 'when will I get my refund?')",
            "User does not understand a concept and asks for an "
            "explanation (e.g. 'what is a tracking number?')",
            "User asks about a detail of the process "
            "(e.g. 'how do we ship it back?')",
            "User asks what a status or field means "
            "(e.g. 'what does delivered mean?')",
        ],
        "false_if": [
            "Rhetorical question or polite check-in "
            "(e.g. 'right?', 'okay?', 'is that fine?')",
            "The question and the data arrive in the same message and "
            "the question clearly refers to that data",
            "The customer asks for confirmation of a fact they "
            "themselves already stated (e.g. 'so that is correct?')",
        ],
        "uncertain": "false",
    },
}


def build_question_detection_hint(
    *,
    locale: str,
    extra_true_if: Iterable[str] | None = None,
    extra_false_if: Iterable[str] | None = None,
    uncertain_override: str | None = None,
) -> dict[str, Any]:
    """Build a `meta.question_detection_hint` dict from a locale template.

    Args:
        locale: BCP-47 locale tag (e.g. ``"hu"``, ``"en"``). Unrecognized
            locales fall back to ``"en"``.
        extra_true_if: optional iterable of additional `true_if` examples
            (e.g. domain-specific phrasings for refurb electronics).
        extra_false_if: optional iterable of additional `false_if`
            counter-examples.
        uncertain_override: optional override for the `uncertain` field
            (must be ``"true"`` or ``"false"``); ignored otherwise.

    Returns:
        Fresh dict (deep-copied template + extras), safe to mutate by the
        caller.
    """
    key = locale if locale in _QUESTION_DETECTION_TEMPLATES else "en"
    template = _QUESTION_DETECTION_TEMPLATES[key]

    true_if = list(template["true_if"])
    if extra_true_if:
        for item in extra_true_if:
            if isinstance(item, str) and item.strip():
                true_if.append(item.strip())

    false_if = list(template["false_if"])
    if extra_false_if:
        for item in extra_false_if:
            if isinstance(item, str) and item.strip():
                false_if.append(item.strip())

    uncertain = template["uncertain"]
    if uncertain_override in {"true", "false"}:
        uncertain = uncertain_override

    return {
        "true_if": true_if,
        "false_if": false_if,
        "uncertain": uncertain,
    }


# --------------------------------------------------------------------------- #
# 3. reply_style                                                              #
# --------------------------------------------------------------------------- #


# Locale-keyed templates. v1 covers the two locales we actively use; the
# default fallback is English. The shape mirrors `ai_complaint_story_v3`:
#   - `global_rules`: short imperative bullets that constrain the agent's
#     reply length, repetition, and topic discipline.
#   - `ack_and_paragraph_instruction`: a single paragraph that tells the
#     agent how to acknowledge `### Most teljesült kondíciók…` blocks
#     (or the locale equivalent) and how to paragraph-break replies.
_REPLY_STYLE_TEMPLATES: dict[str, dict[str, Any]] = {
    "hu": {
        "global_rules": [
            "Maximum 3 mondat per válasz.",
            "Ne ismételd vissza amit az ügyfél mondott.",
            "Ne említs olyan adatot ami nem releváns az aktuális lépéshez.",
            "Ne összegezz ha nem az utolsó step.",
            "Lezárt eset után ne indíts új magyarázatot.",
        ],
        "ack_and_paragraph_instruction": (
            "Ha a felhasználó üzenete előtt szerepel a „### Most teljesült "
            "kondíciók…” blokk, a válaszban ezeket röviden, természetesen "
            "nyugtázd (egy rövid mondatban). Egymástól független "
            "gondolatokat (például nyugta majd következő kérdés) külön "
            "bekezdésben adj meg: az assistantMessage szövegben használj "
            "dupla sortörést (egy üres sort) a bekezdések között."
        ),
    },
    "en": {
        "global_rules": [
            "Maximum 3 sentences per reply.",
            "Do not repeat back what the customer said.",
            "Do not mention data that is not relevant to the current step.",
            "Do not summarize unless this is the final step.",
            "After a case is closed, do not start a new explanation.",
        ],
        "ack_and_paragraph_instruction": (
            "If the user message is preceded by a '### Newly satisfied "
            "conditions…' block, briefly and naturally acknowledge them in "
            "one short sentence. Place independent thoughts (e.g. an "
            "acknowledgement followed by the next question) in separate "
            "paragraphs by inserting a blank line between them in the "
            "assistantMessage text."
        ),
    },
}


def build_reply_style(
    *,
    locale: str,
    extra_global_rules: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Build a `meta.reply_style` dict from a locale template.

    Args:
        locale: BCP-47 locale tag (e.g. ``"hu"``, ``"en"``). Unrecognized
            locales fall back to ``"en"``.
        extra_global_rules: optional iterable of additional rules to
            append to `global_rules` (e.g. domain-specific guardrails).

    Returns:
        Dict with `global_rules` (list[str]) and `ack_and_paragraph_instruction`
        (str). The returned dict is always a fresh deep copy — safe to
        mutate by the caller.
    """
    key = locale if locale in _REPLY_STYLE_TEMPLATES else "en"
    template = _REPLY_STYLE_TEMPLATES[key]

    rules = list(template["global_rules"])
    if extra_global_rules:
        for r in extra_global_rules:
            if isinstance(r, str) and r.strip():
                rules.append(r.strip())

    return {
        "global_rules": rules,
        "ack_and_paragraph_instruction": template["ack_and_paragraph_instruction"],
    }


# --------------------------------------------------------------------------- #
# Combined entry — apply all three on a story IN PLACE                        #
# --------------------------------------------------------------------------- #


def apply_meta_builder(
    story: dict,
    *,
    locale: str | None = None,
    extra_known_fields: Iterable[str] | None = None,
    base_field_rules: Iterable[Mapping[str, Any]] | None = None,
    condition_label_overrides: Mapping[str, str] | None = None,
    extra_reply_style_rules: Iterable[str] | None = None,
    extra_question_true_if: Iterable[str] | None = None,
    extra_question_false_if: Iterable[str] | None = None,
    session_collected_fields: Iterable[str] | None = None,
    session_state_key_overrides: Mapping[str, str] | None = None,
    reference_id_pattern_override: str | None = None,
    validation_pattern_ref_overrides: Mapping[str, str] | None = None,
    overwrite_existing: bool = False,
) -> dict[str, Any]:
    """Populate `meta.order_context_mapping`, `meta.condition_labels`,
    `meta.reply_style` on the story IN PLACE.

    Existing values are preserved (additive) UNLESS ``overwrite_existing=True``,
    in which case the auto-built values replace whatever was there. The
    `field_rules` always merges (existing rules survive when not in
    overwrite mode); labels and reply_style replace when overwrite is on.

    Args:
        story: assembled story dict (post Phase 2 + Phase 2.5 linker).
        locale: locale for `reply_style`. If ``None``, taken from
            `story["locale"]` or `meta["locale"]`; ultimately falls back
            to ``"en"``.
        extra_known_fields: domain-specific OCM field extensions
            (typically `DomainBlueprint.proposed_new_external_fields`).
        base_field_rules: pre-existing field_rules to keep (e.g. from a
            curated baseline).
        condition_label_overrides: explicit `{cid: label}` overrides.
        extra_reply_style_rules: additional global rules for `reply_style`.

    Returns:
        Report dict::

            {
              "order_context_mapping": {"field_rules_added": int},
              "condition_labels":      {"labels_added": int},
              "reply_style":           {"locale_used": str},
            }
    """
    meta = story.setdefault("meta", {})
    if not isinstance(meta, dict):
        raise TypeError("story['meta'] must be a dict.")

    # --- order_context_mapping
    seed_rules: list[Mapping[str, Any]] = list(base_field_rules or [])
    existing_ocm = meta.get("order_context_mapping")
    if isinstance(existing_ocm, dict) and not overwrite_existing:
        ex_rules = existing_ocm.get("field_rules") or []
        if isinstance(ex_rules, list):
            seed_rules.extend(r for r in ex_rules if isinstance(r, Mapping))

    built_ocm = build_order_context_mapping(
        story,
        extra_known_fields=extra_known_fields,
        base_field_rules=seed_rules,
    )

    if isinstance(existing_ocm, dict) and not overwrite_existing:
        existing_ocm["field_rules"] = built_ocm["field_rules"]
        ocm_added = max(0, len(built_ocm["field_rules"]) - len(seed_rules))
        target_ocm = existing_ocm
    else:
        meta["order_context_mapping"] = built_ocm
        ocm_added = len(built_ocm["field_rules"])
        target_ocm = built_ocm

    # --- precedence_rules (curated catalog → meta.order_context_mapping)
    # Always rebuild from the catalog: the rules are pure derivations of
    # the story's referenced conditions. In additive mode we MERGE with any
    # pre-existing rules (dedupe on (if_present, suppress)).
    auto_prec = build_precedence_rules(story)
    existing_prec = target_ocm.get("precedence_rules")
    merged_prec: list[dict[str, str]] = []
    seen_prec: set[tuple[str, str]] = set()
    if isinstance(existing_prec, list) and not overwrite_existing:
        for r in existing_prec:
            if isinstance(r, Mapping):
                ip = r.get("if_present")
                sp = r.get("suppress")
                if isinstance(ip, str) and isinstance(sp, str) and ip and sp:
                    key = (ip, sp)
                    if key in seen_prec:
                        continue
                    seen_prec.add(key)
                    merged_prec.append({"if_present": ip, "suppress": sp})
    prec_added = 0
    for r in auto_prec:
        key = (r["if_present"], r["suppress"])
        if key in seen_prec:
            continue
        seen_prec.add(key)
        merged_prec.append(r)
        prec_added += 1
    if merged_prec:
        target_ocm["precedence_rules"] = merged_prec
    elif "precedence_rules" in target_ocm and overwrite_existing:
        # Overwrite mode + nothing built → drop stale list.
        target_ocm.pop("precedence_rules", None)

    # --- session_guard_not auto-injection on field_rules
    # Mirror the precedence logic into the OCM derive layer so a suppressed
    # condition cannot be re-derived from raw OrderContext fields after the
    # runtime drops it.
    guard_touched = _inject_session_guard_not(
        target_ocm.get("field_rules") or [], merged_prec
    )

    # --- computed_condition_ids (auto-resolve REQUIRED keys via aliases)
    # The runtime addresses certain conditions through this mapping; the
    # lint warns when keys are missing. We only ADD keys that resolve to
    # an actually-referenced condition id — never silently fabricate.
    auto_cci = build_computed_condition_ids(story)
    existing_cci = target_ocm.get("computed_condition_ids")
    cci_added = 0
    if isinstance(existing_cci, dict) and not overwrite_existing:
        for k, v in auto_cci.items():
            if k not in existing_cci:
                existing_cci[k] = v
                cci_added += 1
    elif auto_cci:
        target_ocm["computed_condition_ids"] = auto_cci
        cci_added = len(auto_cci)
    elif "computed_condition_ids" in target_ocm and overwrite_existing:
        target_ocm.pop("computed_condition_ids", None)

    # --- session_state_keys (blueprint-aware, suffix-derived)
    auto_ssk = build_session_state_keys(
        session_collected_fields or (),
        explicit_overrides=session_state_key_overrides,
    )
    existing_ssk = target_ocm.get("session_state_keys")
    ssk_added = 0
    if isinstance(existing_ssk, dict) and not overwrite_existing:
        for k, v in auto_ssk.items():
            if k not in existing_ssk:
                existing_ssk[k] = v
                ssk_added += 1
    elif auto_ssk:
        target_ocm["session_state_keys"] = auto_ssk
        ssk_added = len(auto_ssk)
    elif "session_state_keys" in target_ocm and overwrite_existing:
        target_ocm.pop("session_state_keys", None)

    # --- condition_labels
    existing_labels = meta.get("condition_labels")
    built_labels = build_condition_labels(
        story, overrides=condition_label_overrides
    )

    if (
        isinstance(existing_labels, dict)
        and existing_labels
        and not overwrite_existing
    ):
        added = 0
        for k, v in built_labels.items():
            if k not in existing_labels:
                existing_labels[k] = v
                added += 1
        labels_added = added
    else:
        meta["condition_labels"] = built_labels
        labels_added = len(built_labels)

    # --- reply_style
    if locale is None:
        locale = story.get("locale") or meta.get("locale") or "en"

    if "reply_style" in meta and not overwrite_existing:
        locale_used = locale
    else:
        meta["reply_style"] = build_reply_style(
            locale=locale, extra_global_rules=extra_reply_style_rules
        )
        locale_used = locale if locale in _REPLY_STYLE_TEMPLATES else "en"

    # --- question_detection_hint (additive; preserves curated hints)
    if "question_detection_hint" in meta and not overwrite_existing:
        qdh_locale_used = locale_used
        qdh_added = False
    else:
        meta["question_detection_hint"] = build_question_detection_hint(
            locale=locale,
            extra_true_if=extra_question_true_if,
            extra_false_if=extra_question_false_if,
        )
        qdh_locale_used = (
            locale if locale in _QUESTION_DETECTION_TEMPLATES else "en"
        )
        qdh_added = True

    # --- reference_id_pattern (default if missing) + auto-attach
    pattern_default = (
        reference_id_pattern_override
        if isinstance(reference_id_pattern_override, str)
        and reference_id_pattern_override.strip()
        else _DEFAULT_REFERENCE_ID_PATTERN
    )
    ref_pattern_added, ref_pattern_used = _ensure_reference_id_pattern(
        meta,
        pattern_default=pattern_default,
        overwrite_existing=overwrite_existing,
    )
    vpr_stats = apply_validation_pattern_refs(
        story, map_overrides=validation_pattern_ref_overrides
    )

    return {
        "order_context_mapping": {
            "field_rules_added": ocm_added,
            "precedence_rules_added": prec_added,
            "session_guard_not_injected": guard_touched,
            "computed_condition_ids_added": cci_added,
            "session_state_keys_added": ssk_added,
        },
        "condition_labels": {"labels_added": labels_added},
        "reply_style": {"locale_used": locale_used},
        "question_detection_hint": {
            "locale_used": qdh_locale_used,
            "added": qdh_added,
        },
        "validation_pattern_ref": {
            "reference_id_pattern_added": ref_pattern_added,
            "reference_id_pattern": ref_pattern_used,
            "page_conds_touched": vpr_stats["page_conds_touched"],
            "step_conds_touched": vpr_stats["step_conds_touched"],
        },
    }


__all__ = [
    "build_order_context_mapping",
    "build_precedence_rules",
    "build_computed_condition_ids",
    "build_session_state_keys",
    "build_condition_labels",
    "build_reply_style",
    "build_question_detection_hint",
    "apply_validation_pattern_refs",
    "apply_meta_builder",
]

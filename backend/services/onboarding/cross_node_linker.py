"""Phase 2.5 — deterministic cross-node link pass.

The Phase 2 generation produces structurally clean per-node dicts, but the
inter-node "linking" (which conditions propagate, which conditions get
injected on a routing handoff) is hard for the AI to do RIGHT at the time
of generating each node, because the source node has no visibility into
the receiving node's `session_facts_whitelist`.

This module fills that gap with a pure-Python pass over the assembled
story. Two operations, both idempotent and deterministic:

1. ``complete_session_facts_whitelist(story)``:
   For every AI-page, ensure that any condition declared on the page that
   is also referenced by another node's `routing.if[]` (or step branches)
   is present in this page's `session_facts_whitelist`. The intent: a
   condition that crosses node boundaries MUST be propagated.

2. ``wire_cross_node_inject_conditions(story)``:
   For every cross-node routing rule (`{if: [...], goto: <ai-page>}`)
   that does NOT already declare an `inject_conditions` list, compute one
   as the intersection of (a) what the source node provably knows when
   that branch fires, and (b) what the target node's
   `session_facts_whitelist` accepts.

Both functions return a small report dict with statistics (how many
items added, where) so the caller can log it. Neither modifies the
story when nothing needs changing.

The orchestrator runs this AFTER all Phase 2 generations have finished
and BEFORE Phase 3a structural lint, so the linker's output IS what the
final lint sees.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _is_ai_page(page: Any) -> bool:
    return isinstance(page, dict) and page.get("type") == "ai"


def _declared_condition_ids(page: dict) -> set[str]:
    """The IDs declared in `page.conditions[]` (top-level) — these are what
    the page IS allowed to propagate. Step-internal conditions are NOT
    counted because they may be ephemeral runtime state."""
    out: set[str] = set()
    for c in page.get("conditions", []) or []:
        if isinstance(c, dict):
            cid = c.get("id")
            if isinstance(cid, str) and cid.strip():
                out.add(cid)
    return out


def _condition_implication_ids(page: dict) -> set[str]:
    """`page.condition_implications[*].then` — derived conditions are
    propagable like declared ones."""
    out: set[str] = set()
    for ci in page.get("condition_implications", []) or []:
        if isinstance(ci, dict):
            then = ci.get("then")
            if isinstance(then, str) and then.strip():
                out.add(then)
    return out


def _step_internal_ids(page: dict) -> set[str]:
    """All condition IDs that step-internal_conditions declare (string or
    `{id, ...}` dict form). The runtime can satisfy these during the
    node's own execution, so they're "knowable" by the time a routing
    rule fires."""
    out: set[str] = set()
    for s in page.get("steps", []) or []:
        if not isinstance(s, dict):
            continue
        for ic in s.get("internal_conditions", []) or []:
            if isinstance(ic, str):
                if ic.strip():
                    out.add(ic)
            elif isinstance(ic, dict):
                cid = ic.get("id")
                if isinstance(cid, str) and cid.strip():
                    out.add(cid)
    return out


def _whitelist_set(page: dict) -> set[str]:
    return {
        c for c in (page.get("session_facts_whitelist") or [])
        if isinstance(c, str) and c.strip()
    }


def _routing_if_lists(page: dict) -> Iterable[list[str]]:
    """Yield every `if: [...]` list across page.routing[] and step branches.
    Returns the lists themselves so callers can iterate without copying."""
    for r in page.get("routing", []) or []:
        if isinstance(r, dict) and isinstance(r.get("if"), list):
            yield [c for c in r["if"] if isinstance(c, str)]
    for s in page.get("steps", []) or []:
        if not isinstance(s, dict):
            continue
        for branch in s.get("branches", []) or []:
            if isinstance(branch, dict) and isinstance(branch.get("if"), list):
                yield [c for c in branch["if"] if isinstance(c, str)]


def _ai_pages(story: dict) -> dict[str, dict]:
    """Filter the story's pages dict to AI nodes only."""
    pages = story.get("pages") or {}
    return {pid: p for pid, p in pages.items() if _is_ai_page(p)}


# --------------------------------------------------------------------------- #
# Operation 1 — complete_session_facts_whitelist                              #
# --------------------------------------------------------------------------- #


def complete_session_facts_whitelist(
    story: dict,
) -> dict[str, Any]:
    """Ensure every cross-node-referenced condition propagates from the
    page that owns it.

    For each AI-page X:
      Let DECLARED_X = top-level conditions[] + condition_implications[].then.
      Let CROSS_REFS = the union of `routing.if[]` and `branches.if[]`
                      across all OTHER AI-pages.
      For every cid in DECLARED_X ∩ CROSS_REFS:
          if cid not in X.session_facts_whitelist:
              add it (creating the whitelist key if missing).

    Idempotent: running twice does nothing on the second pass.

    Returns:
        dict with `added_per_node`: dict[node_id -> list[condition_id]]
        and `total_additions`: int.
    """
    pages = _ai_pages(story)
    if not pages:
        return {"added_per_node": {}, "total_additions": 0}

    cross_refs_global: set[str] = set()
    for page in pages.values():
        for if_list in _routing_if_lists(page):
            cross_refs_global.update(if_list)

    additions: dict[str, list[str]] = {}
    total = 0
    for pid, page in pages.items():
        propagable = _declared_condition_ids(page) | _condition_implication_ids(page)
        currently_whitelisted = _whitelist_set(page)

        # Subtract this page's own routing references — it's only "cross"-node
        # if it leaves THIS node. Anything THIS node references in its own
        # routing is intra-node and doesn't need session propagation.
        own_refs: set[str] = set()
        for if_list in _routing_if_lists(page):
            own_refs.update(if_list)
        cross_refs_for_page = cross_refs_global - own_refs

        to_add = sorted(
            (propagable & cross_refs_for_page) - currently_whitelisted
        )
        if not to_add:
            continue

        existing = page.get("session_facts_whitelist")
        if not isinstance(existing, list):
            existing = []
            page["session_facts_whitelist"] = existing
        # Preserve original order, append new IDs deterministically (sorted).
        existing.extend(to_add)
        additions[pid] = to_add
        total += len(to_add)

    return {"added_per_node": additions, "total_additions": total}


# --------------------------------------------------------------------------- #
# Operation 2 — wire_cross_node_inject_conditions                             #
# --------------------------------------------------------------------------- #


def _provably_known_at_routing_time(page: dict) -> set[str]:
    """A reasonable approximation of what the runtime can have in its
    satisfied-conditions set when the routing pass executes:

    - Every condition declared on the page (so the routing.if uses them)
    - Every condition derived via condition_implications.then
    - Every step internal_condition (the steps run BEFORE the routing pass)

    This is the "outbound payload" superset for an injection."""
    return (
        _declared_condition_ids(page)
        | _condition_implication_ids(page)
        | _step_internal_ids(page)
    )


def wire_cross_node_inject_conditions(
    story: dict,
    *,
    overwrite_existing: bool = False,
) -> dict[str, Any]:
    """Compute `inject_conditions` for every cross-node routing rule that
    targets another AI-page.

    Algorithm per routing rule `{if: [...], goto: target_id}`:
      Let SOURCE_KNOWN  = conditions that the source node provably knows
                          at routing time (declared + implications + step
                          internals), unioned with the rule's own `if` list
                          (those MUST be true for the rule to fire).
      Let TARGET_WHITELIST = the target page's session_facts_whitelist.
      Let inject = sorted(SOURCE_KNOWN ∩ TARGET_WHITELIST).
      If `inject_conditions` is already present and we're not overwriting,
      MERGE: keep the original order and append the missing IDs.

    Skip rules that target `ask`, an end-page, or a non-existent id.
    Idempotent unless ``overwrite_existing=True``.

    Returns:
        dict with `injected_per_rule`: list of (page_id, rule_idx,
        target_id, [added_ids]) and `total_additions`: int.
    """
    pages = _ai_pages(story)
    target_whitelists: dict[str, set[str]] = {
        pid: _whitelist_set(page) for pid, page in pages.items()
    }

    injected: list[tuple[str, int, str, list[str]]] = []
    total = 0

    for source_id, source_page in pages.items():
        source_known = _provably_known_at_routing_time(source_page)
        routing = source_page.get("routing")
        if not isinstance(routing, list):
            continue
        for idx, rule in enumerate(routing):
            if not isinstance(rule, dict):
                continue
            goto = rule.get("goto") or rule.get("default")
            if (
                not isinstance(goto, str)
                or goto == "ask"
                or goto not in pages  # not a cross-node AI target
            ):
                continue
            target_whitelist = target_whitelists.get(goto, set())
            if not target_whitelist:
                continue

            if_list = rule.get("if")
            if isinstance(if_list, list):
                rule_facts = {c for c in if_list if isinstance(c, str)}
            else:
                rule_facts = set()

            candidate = (source_known | rule_facts) & target_whitelist
            existing_inject = rule.get("inject_conditions")

            if isinstance(existing_inject, list) and not overwrite_existing:
                existing_set = {
                    c for c in existing_inject if isinstance(c, str)
                }
                to_add = sorted(candidate - existing_set)
                if not to_add:
                    continue
                existing_inject.extend(to_add)
                injected.append((source_id, idx, goto, to_add))
                total += len(to_add)
            else:
                final = sorted(candidate)
                if not final:
                    continue
                rule["inject_conditions"] = final
                injected.append((source_id, idx, goto, final))
                total += len(final)

    return {"injected_per_rule": injected, "total_additions": total}


# --------------------------------------------------------------------------- #
# Public entry — run both passes                                              #
# --------------------------------------------------------------------------- #


def link_cross_nodes(story: dict) -> dict[str, Any]:
    """Run both linker operations on the story IN PLACE.

    Order matters: ``complete_session_facts_whitelist`` runs FIRST so that
    the second pass (``wire_cross_node_inject_conditions``) sees the
    fully-populated whitelists when intersecting them with the source
    node's known set.

    Returns a combined report dict for logging / observability.
    """
    whitelist_report = complete_session_facts_whitelist(story)
    inject_report = wire_cross_node_inject_conditions(story)
    return {
        "whitelist": whitelist_report,
        "inject_conditions": inject_report,
    }


__all__ = [
    "complete_session_facts_whitelist",
    "wire_cross_node_inject_conditions",
    "link_cross_nodes",
]

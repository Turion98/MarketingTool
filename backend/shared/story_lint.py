"""Story JSON lint — pure logic, importable from CLI and pipeline.

Refaktorálva a `backend/stories/_validate_story.py`-ből: ugyanaz a validáció,
csak `print()` és `sys.exit()` nélkül. A CLI viselkedést a thin wrapper
`stories/_validate_story.py` őrzi meg.

Public API:
- `Report` — errors / warnings / info gyűjtő
- `lint_full_story(story) -> Report` — teljes story validáció (CLI + Phase 3)
- `lint_single_node(page, *, meta, global_condition_pool, known_page_ids)
    -> Report` — egy generált AI-node lint-elése Phase 2 retry loopban

Konstansok:
- `KNOWN_OCM_FIELDS`, `RUNTIME_INT_KEYS`, `RUNTIME_STR_KEYS`,
  `REQUIRED_COMPUTED_KEYS`
"""
from __future__ import annotations

import re
from collections import defaultdict, deque
from typing import Iterable


# --------------------------------------------------------------------------- #
# Report                                                                      #
# --------------------------------------------------------------------------- #


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.info: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def note(self, msg: str) -> None:
        self.info.append(msg)

    def summary(self) -> str:
        out: list[str] = []
        if self.errors:
            out.append(f"\n=== HIBÁK ({len(self.errors)}) ===")
            for e in self.errors:
                out.append(f"  [ERR] {e}")
        if self.warnings:
            out.append(f"\n=== FIGYELMEZTETÉSEK ({len(self.warnings)}) ===")
            for w in self.warnings:
                out.append(f"  [WRN] {w}")
        if self.info:
            out.append(f"\n=== INFÓK ({len(self.info)}) ===")
            for i in self.info:
                out.append(f"  [INF] {i}")
        if not self.errors and not self.warnings:
            out.append("\nNincsenek hibák vagy figyelmeztetések. OK.")
        return "\n".join(out)


# --------------------------------------------------------------------------- #
# Constants                                                                   #
# --------------------------------------------------------------------------- #


RUNTIME_INT_KEYS = {
    "max_tokens",
    "return_window_days",
    "max_entry_skip_depth",
    "max_routing_chain_depth",
    "max_chain_hops",
    "embedding_top_k",
}
RUNTIME_STR_KEYS = {"model", "mock_today"}

REQUIRED_COMPUTED_KEYS = {
    "within_return_window",
    "outside_return_window",
    "delay_duration_known",
    "below_sold_threshold",
    "accessory_was_in_order",
    "accessory_not_in_order",
    "return_was_completed",
    "return_not_received",
}

KNOWN_OCM_FIELDS = {
    "order_id", "purchase_date", "extended_warranty_active",
    "sold_grade", "sold_battery_threshold", "accessories_in_order",
    "return_status", "payment_method",
    "delivery_date", "courier", "tracking_number",
    "tracking_status", "estimated_delivery_date",
    # Historikus return/refund kontextus (OrderContext újabb mezői).
    "return_initiated_date", "return_received_date", "original_complaint_type",
    "refund_initiated_date", "refund_eta_date", "prior_case_id",
    "refund_amount", "refund_currency",
}


# --------------------------------------------------------------------------- #
# Single-node tolerance helper                                                #
# --------------------------------------------------------------------------- #


class _AllPagesAllowed:
    """Set-szerű sentinel: minden tagsági teszt True-t ad.

    A `lint_single_node` mode-ban használatos, amikor `known_page_ids=None` —
    a Phase 2 közepén még nem ismert minden node, így a goto célok létezésé-
    nek validálását ki kell hagyni. Az iteráció üres listát ad (a hívó kódok
    nem iterálnak, csak `in`-t használnak).
    """

    __slots__ = ()

    def __contains__(self, _item: object) -> bool:
        return True

    def __iter__(self):
        return iter(())

    def __len__(self) -> int:
        return 0

    def __bool__(self) -> bool:
        return True


# --------------------------------------------------------------------------- #
# meta validation                                                             #
# --------------------------------------------------------------------------- #


def validate_meta(story: dict, rep: Report) -> dict:
    if "meta" not in story or not isinstance(story["meta"], dict):
        rep.err("Hiányzó vagy érvénytelen 'meta' szekció.")
        return {}
    meta = story["meta"]

    for key in ("id", "title", "startPageId", "defaultFallbackMessage"):
        if not isinstance(meta.get(key), str) or not meta[key].strip():
            rep.err(f"meta.{key} kötelező string.")

    runtime = meta.get("runtime")
    if not isinstance(runtime, dict):
        rep.err("meta.runtime hiányzik vagy nem dict.")
    else:
        for k in RUNTIME_STR_KEYS:
            if k in runtime and not isinstance(runtime[k], str):
                rep.err(f"meta.runtime.{k} string kellene legyen.")
        for k in RUNTIME_INT_KEYS:
            if k in runtime and not isinstance(runtime[k], int):
                rep.err(f"meta.runtime.{k} int kellene legyen.")
        mock_today = runtime.get("mock_today")
        if isinstance(mock_today, str):
            try:
                from datetime import date
                date.fromisoformat(mock_today)
            except ValueError:
                rep.err(f"meta.runtime.mock_today nem érvényes ISO dátum: {mock_today!r}")

    ref_pat = meta.get("reference_id_pattern")
    if isinstance(ref_pat, str) and ref_pat:
        try:
            re.compile(rf"\b{ref_pat}\b")
        except re.error as e:
            rep.err(f"meta.reference_id_pattern érvénytelen regex: {e}")

    labels = meta.get("condition_labels")
    if labels is not None and not isinstance(labels, dict):
        rep.err("meta.condition_labels nem dict.")
    if isinstance(labels, dict):
        for k, v in labels.items():
            if not isinstance(k, str) or not isinstance(v, str):
                rep.err(f"meta.condition_labels: nem-string érték ({k!r} -> {v!r}).")

    return meta


# --------------------------------------------------------------------------- #
# order_context_mapping                                                       #
# --------------------------------------------------------------------------- #


def validate_order_context_mapping(
    meta: dict,
    rep: Report,
    *,
    extra_known_fields: Iterable[str] | None = None,
) -> tuple[set[str], set[str]]:
    """Visszatér: (computed_condition_ids halmaz, derive-elt kondíció IDs halmaz).

    derive-elt kondíció IDs = field_rules.condition értékek
    + computed_condition_ids.values()

    A `extra_known_fields` egy job-scope, domain-specifikus extended pool
    (tipikusan a `DomainBlueprint.proposed_new_external_fields` field_name
    listája). Ha egy `field_rules[i].field` (vagy `requires_field_*`
    modifier) ebbe a poolba esik — DE nem a globális `KNOWN_OCM_FIELDS`-be
    —, akkor a riport `note()` (info) szintű jelzést kap "domain-specific,
    backend implementation pending" üzenettel; nem `warn()` és nem `err()`.
    Ha a mező egyik pool-ban sincs → marad a `warn()` (mint korábban).
    """
    extra_pool: frozenset[str] = frozenset(extra_known_fields or ())

    ocm = meta.get("order_context_mapping")
    derived_ids: set[str] = set()
    computed_ids: set[str] = set()
    if ocm is None:
        rep.warn("meta.order_context_mapping hiányzik (rendben, ha nincs OrderContext-alapú derive).")
        return computed_ids, derived_ids
    if not isinstance(ocm, dict):
        rep.err("meta.order_context_mapping nem dict.")
        return computed_ids, derived_ids

    pr = ocm.get("precedence_rules")
    if pr is not None:
        if not isinstance(pr, list):
            rep.err("order_context_mapping.precedence_rules nem lista.")
        else:
            for i, r in enumerate(pr):
                if not isinstance(r, dict):
                    rep.err(f"precedence_rules[{i}] nem dict.")
                    continue
                if not isinstance(r.get("if_present"), str) or not r["if_present"].strip():
                    rep.err(f"precedence_rules[{i}].if_present hiányzik vagy nem string.")
                if not isinstance(r.get("suppress"), str) or not r["suppress"].strip():
                    rep.err(f"precedence_rules[{i}].suppress hiányzik vagy nem string.")

    fr = ocm.get("field_rules")
    if fr is not None:
        if not isinstance(fr, list):
            rep.err("order_context_mapping.field_rules nem lista.")
        else:
            for i, rule in enumerate(fr):
                if not isinstance(rule, dict):
                    rep.err(f"field_rules[{i}] nem dict.")
                    continue
                f = rule.get("field")
                c = rule.get("condition")
                if not isinstance(f, str) or not f:
                    rep.err(f"field_rules[{i}].field hiányzik.")
                elif f not in KNOWN_OCM_FIELDS:
                    if f in extra_pool:
                        rep.note(
                            f"field_rules[{i}].field {f!r}: domain-specific extension "
                            "(backend implementation pending)."
                        )
                    else:
                        rep.warn(
                            f"field_rules[{i}].field ismeretlen OrderContext mező: {f!r} "
                            f"(ismertek: {sorted(KNOWN_OCM_FIELDS)})"
                        )
                if not isinstance(c, str) or not c:
                    rep.err(f"field_rules[{i}].condition hiányzik.")
                else:
                    derived_ids.add(c)
                has_when_value = "when_value" in rule
                has_when_any = "when_any_value" in rule
                has_when = "when" in rule
                triggers = sum([has_when_value, has_when_any, has_when])
                if triggers == 0:
                    rep.err(
                        f"field_rules[{i}] ({f}->{c}): hiányzik a feltétel (when/when_value/when_any_value)."
                    )
                if has_when_any:
                    if not isinstance(rule.get("when_any_value"), list):
                        rep.err(f"field_rules[{i}].when_any_value listát vár.")
                if has_when:
                    w = rule.get("when")
                    if w not in {"truthy", "not_null"}:
                        rep.err(
                            f"field_rules[{i}].when érvénytelen érték: {w!r} "
                            "(megengedett: 'truthy', 'not_null')"
                        )
                for opt in ("requires_field_not_null", "requires_field_lt_today", "session_guard_not"):
                    if opt in rule and not isinstance(rule[opt], str):
                        rep.err(f"field_rules[{i}].{opt} string kellene legyen.")
                rf = rule.get("requires_field_not_null")
                if isinstance(rf, str) and rf not in KNOWN_OCM_FIELDS:
                    if rf in extra_pool:
                        rep.note(
                            f"field_rules[{i}].requires_field_not_null {rf!r}: "
                            "domain-specific extension (backend implementation pending)."
                        )
                    else:
                        rep.warn(
                            f"field_rules[{i}].requires_field_not_null ismeretlen mező: {rf!r}"
                        )
                lf = rule.get("requires_field_lt_today")
                if isinstance(lf, str) and lf not in KNOWN_OCM_FIELDS:
                    if lf in extra_pool:
                        rep.note(
                            f"field_rules[{i}].requires_field_lt_today {lf!r}: "
                            "domain-specific extension (backend implementation pending)."
                        )
                    else:
                        rep.warn(
                            f"field_rules[{i}].requires_field_lt_today ismeretlen mező: {lf!r}"
                        )

    cci = ocm.get("computed_condition_ids")
    if cci is not None:
        if not isinstance(cci, dict):
            rep.err("computed_condition_ids nem dict.")
        else:
            missing = REQUIRED_COMPUTED_KEYS - set(cci.keys())
            if missing:
                rep.warn(
                    "computed_condition_ids hiányzó kulcsok "
                    f"({sorted(missing)}) — a runtime ezeknél a kulcsnévre esik vissza."
                )
            for k, v in cci.items():
                if not isinstance(v, str) or not v:
                    rep.err(f"computed_condition_ids[{k}] nem-üres string kell.")
                else:
                    computed_ids.add(v)
                    derived_ids.add(v)

    ssk = ocm.get("session_state_keys")
    if ssk is not None and not isinstance(ssk, dict):
        rep.err("session_state_keys nem dict.")

    return computed_ids, derived_ids


# --------------------------------------------------------------------------- #
# pages / conditions / routing / steps                                        #
# --------------------------------------------------------------------------- #


def collect_page_conditions(page: dict) -> set[str]:
    out: set[str] = set()
    conds = page.get("conditions")
    if isinstance(conds, list):
        for c in conds:
            if isinstance(c, dict) and isinstance(c.get("id"), str):
                out.add(c["id"])
    return out


def collect_all_declared_conditions(pages: dict) -> set[str]:
    """Page.conditions[] + step.internal_conditions[] (dict elemek) + condition_implications.then
    + step.inject_conditions / branch.inject_conditions / routing.inject_conditions értékek.

    Ez minden olyan kondíció ID, amit a story bárhol deklarál vagy injektál.
    """
    out: set[str] = set()
    for page in pages.values():
        if not isinstance(page, dict):
            continue
        out |= collect_page_conditions(page)
        out |= _collect_node_handoff_conditions(page)
    return out


def _collect_node_handoff_conditions(page: dict) -> set[str]:
    """Egy node-hoz tartozó cross-cutting kondíció ID-k:
    condition_implications.then, session_facts_whitelist, routing.inject_conditions,
    step.internal_conditions[].id, step.inject_conditions, branch.inject_conditions.

    A `lint_single_node` is használja, hogy az újonnan generált node által
    bevezetett kondíciókat hozzáadja az aktív pool-hoz a routing/steps
    validálás előtt.
    """
    out: set[str] = set()
    impl = page.get("condition_implications")
    if isinstance(impl, list):
        for rule in impl:
            if isinstance(rule, dict):
                then = rule.get("then")
                if isinstance(then, str) and then.strip():
                    out.add(then.strip())
    wl = page.get("session_facts_whitelist")
    if isinstance(wl, list):
        for cid in wl:
            if isinstance(cid, str) and cid:
                out.add(cid)
    for rule in page.get("routing") or []:
        if isinstance(rule, dict):
            inj = rule.get("inject_conditions")
            if isinstance(inj, list):
                for cid in inj:
                    if isinstance(cid, str) and cid:
                        out.add(cid)
    for step in page.get("steps") or []:
        if not isinstance(step, dict):
            continue
        for c in step.get("internal_conditions") or []:
            if isinstance(c, dict) and isinstance(c.get("id"), str) and c["id"]:
                out.add(c["id"])
            elif isinstance(c, str) and c:
                out.add(c)
        for inj_key in ("inject_conditions", "default_inject_conditions"):
            v = step.get(inj_key)
            if isinstance(v, list):
                for cid in v:
                    if isinstance(cid, str) and cid:
                        out.add(cid)
        for branch in step.get("branches") or []:
            if isinstance(branch, dict):
                inj = branch.get("inject_conditions")
                if isinstance(inj, list):
                    for cid in inj:
                        if isinstance(cid, str) and cid:
                            out.add(cid)
    return out


def validate_condition_implications(
    page_id: str,
    page: dict,
    valid_cond_ids: Iterable[str],
    rep: Report,
    routing_refs: dict[str, set[str]],
) -> None:
    impl = page.get("condition_implications")
    if impl is None:
        return
    if not isinstance(impl, list):
        rep.err(f"[{page_id}].condition_implications nem lista.")
        return
    for i, rule in enumerate(impl):
        if not isinstance(rule, dict):
            rep.err(f"[{page_id}].condition_implications[{i}] nem dict.")
            continue
        wa = rule.get("when_all")
        then = rule.get("then")
        if not isinstance(wa, list) or not all(isinstance(x, str) and x for x in wa):
            rep.err(f"[{page_id}].condition_implications[{i}].when_all nem string lista.")
        else:
            for cond in wa:
                if cond not in valid_cond_ids:
                    rep.warn(
                        f"[{page_id}].condition_implications[{i}].when_all={cond!r}: "
                        "ismeretlen kondíció."
                    )
                routing_refs[cond].add(f"{page_id}.implications[{i}].when_all")
        if not isinstance(then, str) or not then.strip():
            rep.err(f"[{page_id}].condition_implications[{i}].then nem string.")
        else:
            routing_refs[then].add(f"{page_id}.implications[{i}].then")


def validate_session_facts_whitelist(
    page_id: str,
    page: dict,
    valid_cond_ids: Iterable[str],
    rep: Report,
    routing_refs: dict[str, set[str]],
) -> None:
    wl = page.get("session_facts_whitelist")
    if wl is None:
        return
    if not isinstance(wl, list):
        rep.err(f"[{page_id}].session_facts_whitelist nem lista.")
        return
    for i, cid in enumerate(wl):
        if not isinstance(cid, str) or not cid:
            rep.err(f"[{page_id}].session_facts_whitelist[{i}] nem-üres string kell.")
            continue
        if cid not in valid_cond_ids:
            rep.warn(
                f"[{page_id}].session_facts_whitelist={cid!r}: ismeretlen kondíció."
            )
        routing_refs[cid].add(f"{page_id}.session_facts_whitelist")


def validate_conditions(
    page_id: str,
    page: dict,
    meta: dict,
    rep: Report,
) -> set[str]:
    conds = page.get("conditions")
    declared: set[str] = set()
    if conds is None:
        return declared
    if not isinstance(conds, list):
        rep.err(f"[{page_id}] conditions nem lista.")
        return declared
    seen: set[str] = set()
    for i, c in enumerate(conds):
        if not isinstance(c, dict):
            rep.err(f"[{page_id}].conditions[{i}] nem dict.")
            continue
        cid = c.get("id")
        if not isinstance(cid, str) or not cid.strip():
            rep.err(f"[{page_id}].conditions[{i}].id hiányzik vagy nem string.")
            continue
        if cid in seen:
            rep.err(f"[{page_id}].conditions[{i}].id duplikált: {cid!r}")
        seen.add(cid)
        declared.add(cid)
        if not isinstance(c.get("description"), str) or not c["description"].strip():
            rep.err(f"[{page_id}].conditions['{cid}'].description hiányzik.")
        if "required" in c and not isinstance(c["required"], bool):
            rep.err(f"[{page_id}].conditions['{cid}'].required nem bool.")
        ref = c.get("validation_pattern_ref")
        if ref is not None:
            if not isinstance(ref, str) or not ref.strip():
                rep.err(f"[{page_id}].conditions['{cid}'].validation_pattern_ref nem string.")
            else:
                val = meta.get(ref)
                if not isinstance(val, str) or not val:
                    rep.err(
                        f"[{page_id}].conditions['{cid}'].validation_pattern_ref={ref!r} "
                        "nem hivatkozik létező meta string kulcsra."
                    )
        # text_triggers (page-level conditions[]): array of short phrases.
        # Lint-side cap (12) > AI-tool cap (8): we tolerate hand-crafted
        # legacy stories that may include slightly larger trigger lists.
        triggers = c.get("text_triggers")
        if triggers is not None:
            if not isinstance(triggers, list):
                rep.err(
                    f"[{page_id}].conditions['{cid}'].text_triggers nem lista."
                )
            elif not triggers:
                rep.err(
                    f"[{page_id}].conditions['{cid}'].text_triggers üres lista."
                )
            elif len(triggers) > 12:
                rep.err(
                    f"[{page_id}].conditions['{cid}'].text_triggers túl sok elem "
                    f"({len(triggers)}, max 12)."
                )
            else:
                for i, trig in enumerate(triggers):
                    if not isinstance(trig, str) or not trig.strip():
                        rep.err(
                            f"[{page_id}].conditions['{cid}'].text_triggers[{i}] "
                            "nem nem-üres string."
                        )
                    elif not (2 <= len(trig) <= 60):
                        rep.err(
                            f"[{page_id}].conditions['{cid}'].text_triggers[{i}] "
                            f"hossza érvénytelen ({len(trig)}, elvárt 2-60)."
                        )
        if "do_not_reask_if_satisfied" in c and not isinstance(
            c["do_not_reask_if_satisfied"], bool
        ):
            rep.err(
                f"[{page_id}].conditions['{cid}'].do_not_reask_if_satisfied nem bool."
            )
        if "auto_satisfy_after_reply" in c and not isinstance(
            c["auto_satisfy_after_reply"], bool
        ):
            rep.err(
                f"[{page_id}].conditions['{cid}'].auto_satisfy_after_reply nem bool."
            )
        if "do_not_reask_hint" in c:
            hint = c["do_not_reask_hint"]
            if not isinstance(hint, str) or not hint.strip():
                rep.err(
                    f"[{page_id}].conditions['{cid}'].do_not_reask_hint nem üres string kell."
                )
            elif len(hint) > 300:
                rep.err(
                    f"[{page_id}].conditions['{cid}'].do_not_reask_hint túl hosszú "
                    f"(>{300} char)."
                )
    return declared


def validate_routing(
    page_id: str,
    page: dict,
    valid_cond_ids: Iterable[str],
    valid_page_ids: Iterable[str],
    rep: Report,
    routing_refs: dict[str, set[str]],
) -> set[str]:
    """Visszatér: routing-ban hivatkozott goto célok (page-id-k).

    `routing_refs[cond_id]` halmazba bekerül minden hivatkozási hely.
    """
    routing = page.get("routing")
    targets: set[str] = set()
    if routing is None:
        rep.err(f"[{page_id}] routing hiányzik (ai node-nál kötelező).")
        return targets
    if not isinstance(routing, list):
        rep.err(f"[{page_id}] routing nem lista.")
        return targets
    if len(routing) == 0:
        rep.err(f"[{page_id}] routing üres.")
        return targets

    # A runtime kétkörös: első menet az `if` szabályokra, második a default-ra.
    # Default nem feltétlenül kell legyen utolsó, de konvenció szerint az.
    default_indices = [i for i, r in enumerate(routing) if isinstance(r, dict) and "default" in r and "if" not in r]
    if len(default_indices) == 0:
        rep.warn(
            f"[{page_id}] routing nem tartalmaz default szabályt — "
            "ha egyetlen if sem teljesül, a router None-t ad vissza (UI elakadhat)."
        )
    elif len(default_indices) > 1:
        rep.warn(
            f"[{page_id}] routing: több default szabály ({len(default_indices)}). "
            "A runtime csak az elsőt alkalmazza, a többi halott."
        )
    else:
        di = default_indices[0]
        if di != len(routing) - 1:
            rep.note(
                f"[{page_id}] routing: default szabály nem az utolsó (index {di}/{len(routing)-1}). "
                "A runtime ezt is jól kezeli, de a konvenció a default lista végére."
            )

    for i, rule in enumerate(routing):
        if not isinstance(rule, dict):
            rep.err(f"[{page_id}].routing[{i}] nem dict.")
            continue
        # default form
        if "default" in rule and "if" not in rule:
            val = rule["default"]
            if not isinstance(val, str) or not val.strip():
                rep.err(f"[{page_id}].routing[{i}].default nem string.")
                continue
            if val == "ask":
                continue
            if val not in valid_page_ids:
                rep.err(
                    f"[{page_id}].routing[{i}].default={val!r}: nincs ilyen page-id."
                )
            else:
                targets.add(val)
            continue
        # if form
        if "if" not in rule or "goto" not in rule:
            rep.err(
                f"[{page_id}].routing[{i}]: ismeretlen routing forma. "
                "Csak {if:[..], goto:..} vagy {default:..} támogatott."
            )
            continue
        ifs = rule["if"]
        goto = rule["goto"]
        if not isinstance(ifs, list) or not all(isinstance(x, str) and x for x in ifs):
            rep.err(f"[{page_id}].routing[{i}].if nem string lista.")
        else:
            for cond in ifs:
                if cond.startswith("!"):
                    rep.err(
                        f"[{page_id}].routing[{i}].if='{cond}': a runtime nem támogat negációt "
                        "(`!cond`). A `resolve_ai_node_routing` csak AND-logikát ismer."
                    )
                    continue
                if cond not in valid_cond_ids:
                    rep.err(
                        f"[{page_id}].routing[{i}].if='{cond}': nem deklarált kondíció ezen "
                        "a node-on és nem is derive-elt computed condition."
                    )
                routing_refs[cond].add(f"{page_id}.routing[{i}]")
        if not isinstance(goto, str) or not goto.strip():
            rep.err(f"[{page_id}].routing[{i}].goto nem string.")
        else:
            if goto != "ask" and goto not in valid_page_ids:
                rep.err(
                    f"[{page_id}].routing[{i}].goto={goto!r}: nincs ilyen page-id."
                )
            elif goto != "ask":
                targets.add(goto)
        inject = rule.get("inject_conditions")
        if inject is not None:
            if not isinstance(inject, list) or not all(isinstance(x, str) for x in inject):
                rep.err(f"[{page_id}].routing[{i}].inject_conditions nem string lista.")
            else:
                for cid in inject:
                    if cid not in valid_cond_ids:
                        rep.warn(
                            f"[{page_id}].routing[{i}].inject_conditions={cid!r}: "
                            "ismeretlen kondíció (sem node-szintű, sem derive-elt)."
                        )
                    routing_refs[cid].add(f"{page_id}.routing[{i}].inject")
    return targets


def validate_steps(
    page_id: str,
    page: dict,
    valid_cond_ids: Iterable[str],
    valid_page_ids: Iterable[str],
    rep: Report,
    routing_refs: dict[str, set[str]],
    *,
    strict_closing_bundle: bool = True,
) -> set[str]:
    steps = page.get("steps")
    if steps is None:
        return set()
    if not isinstance(steps, list) or not steps:
        rep.err(f"[{page_id}].steps nem nem-üres lista.")
        return set()
    step_ids: set[str] = set()
    targets: set[str] = set()
    for i, s in enumerate(steps):
        if not isinstance(s, dict):
            rep.err(f"[{page_id}].steps[{i}] nem dict.")
            continue
        sid = s.get("id")
        if not isinstance(sid, str) or not sid.strip():
            rep.err(f"[{page_id}].steps[{i}].id hiányzik.")
            continue
        if sid in step_ids:
            rep.err(f"[{page_id}].steps duplikált id: {sid!r}")
        step_ids.add(sid)
        for k in ("goal", "ai_action", "done_when", "fallback_reason", "extract_hint"):
            if k in s and not isinstance(s[k], str):
                rep.err(f"[{page_id}].steps['{sid}'].{k} nem string.")
        # extract_hint extra validáció: hossz + closing-step warning
        eh = s.get("extract_hint")
        if isinstance(eh, str):
            if eh.strip() == "":
                rep.err(
                    f"[{page_id}].steps['{sid}'].extract_hint üres string "
                    "(használj None-t, ha nincs hint)."
                )
            elif len(eh) > 800:
                rep.err(
                    f"[{page_id}].steps['{sid}'].extract_hint túl hosszú "
                    f"({len(eh)} char, max 800)."
                )
            elif s.get("is_closing") is True:
                rep.warn(
                    f"[{page_id}].steps['{sid}'].extract_hint closing step-en — "
                    "a runtime closing step-en nem futtatja az extract toolt, "
                    "így a hint hatástalan."
                )
        for k in ("is_closing", "is_terminal", "skippable", "silent_on_matched_goto",
                  "suppress_goto_auto_ack", "permit_goto_auto_ack",
                  "advance_requires_new_satisfaction", "chain_on_complete"):
            if k in s and not isinstance(s[k], bool):
                rep.err(f"[{page_id}].steps['{sid}'].{k} nem bool.")
        # Closing-step ground truth: ha `is_closing: true`, a runtime az alábbi
        # bundle minden tagját elvárja a session helyes lezárásához. A schema
        # if/then blokkja az AI-határon próbál kérni; a lint a backstop arra
        # az esetre, ha bármilyen úton (manuális szerkesztés, régi story)
        # closing step a bundle nélkül érkezne. Strict mode (default) → err;
        # legacy mode (`strict_closing_bundle=False`) → warn (ahogy a v3
        # production story-t kezeljük átmenetileg).
        if s.get("is_closing") is True:
            emit = rep.err if strict_closing_bundle else rep.warn
            if s.get("is_terminal") is not True:
                emit(
                    f"[{page_id}].steps['{sid}']: is_closing=true, de "
                    "is_terminal nem true (closing-bundle követelmény)."
                )
            if s.get("permit_goto_auto_ack") is not True:
                emit(
                    f"[{page_id}].steps['{sid}']: is_closing=true, de "
                    "permit_goto_auto_ack nem true (closing-bundle követelmény)."
                )
            if s.get("silent_on_matched_goto") is not True:
                emit(
                    f"[{page_id}].steps['{sid}']: is_closing=true, de "
                    "silent_on_matched_goto nem true (closing-bundle követelmény)."
                )
            fb = s.get("fallback_reason")
            if not isinstance(fb, str) or not fb.strip():
                emit(
                    f"[{page_id}].steps['{sid}']: is_closing=true, de "
                    "fallback_reason hiányzik vagy üres "
                    "(closing-bundle követelmény)."
                )
        internal = s.get("internal_conditions")
        if internal is not None:
            if not isinstance(internal, list):
                rep.err(f"[{page_id}].steps['{sid}'].internal_conditions nem lista.")
            else:
                seen_step_conds: set[str] = set()
                for ic in internal:
                    cid: str | None = None
                    if isinstance(ic, str):
                        cid = ic
                    elif isinstance(ic, dict):
                        cid = ic.get("id") if isinstance(ic.get("id"), str) else None
                        if not isinstance(cid, str) or not cid.strip():
                            rep.err(
                                f"[{page_id}].steps['{sid}'].internal_conditions: dict elem id mező hiányzik."
                            )
                            continue
                        desc = ic.get("description")
                        if desc is not None and (not isinstance(desc, str) or not desc.strip()):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].description nem üres string kell."
                            )
                        if "required" in ic and not isinstance(ic["required"], bool):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].required nem bool."
                            )
                        if "do_not_reask_if_satisfied" in ic and not isinstance(
                            ic["do_not_reask_if_satisfied"], bool
                        ):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].do_not_reask_if_satisfied nem bool."
                            )
                        if "auto_satisfy_after_reply" in ic and not isinstance(
                            ic["auto_satisfy_after_reply"], bool
                        ):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].auto_satisfy_after_reply nem bool."
                            )
                        if "do_not_reask_hint" in ic:
                            hint = ic["do_not_reask_hint"]
                            if not isinstance(hint, str) or not hint.strip():
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].do_not_reask_hint nem üres string kell."
                                )
                            elif len(hint) > 300:
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].do_not_reask_hint túl hosszú (>300 char)."
                                )
                        vref = ic.get("validation_pattern_ref")
                        if vref is not None:
                            if not isinstance(vref, str) or not vref.strip():
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].validation_pattern_ref nem string."
                                )
                            else:
                                routing_refs[cid].add(
                                    f"{page_id}.step.{sid}.internal['{cid}'].vref={vref}"
                                )
                        triggers = ic.get("text_triggers")
                        if triggers is not None:
                            if not isinstance(triggers, list):
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].text_triggers nem lista."
                                )
                            elif not triggers:
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].text_triggers üres lista."
                                )
                            elif len(triggers) > 12:
                                rep.err(
                                    f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].text_triggers "
                                    f"túl sok elem ({len(triggers)}, max 12)."
                                )
                            else:
                                for ti, trig in enumerate(triggers):
                                    if not isinstance(trig, str) or not trig.strip():
                                        rep.err(
                                            f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].text_triggers[{ti}] "
                                            "nem nem-üres string."
                                        )
                                    elif not (2 <= len(trig) <= 60):
                                        rep.err(
                                            f"[{page_id}].steps['{sid}'].internal_conditions['{cid}'].text_triggers[{ti}] "
                                            f"hossza érvénytelen ({len(trig)}, elvárt 2-60)."
                                        )
                    else:
                        rep.err(
                            f"[{page_id}].steps['{sid}'].internal_conditions: ismeretlen elem típus {type(ic).__name__}"
                        )
                        continue
                    if cid in seen_step_conds:
                        rep.err(
                            f"[{page_id}].steps['{sid}'].internal_conditions: duplikált id {cid!r}"
                        )
                    seen_step_conds.add(cid)
                    if cid not in valid_cond_ids:
                        rep.warn(
                            f"[{page_id}].steps['{sid}'].internal_conditions={cid!r}: "
                            "nem deklarált sehol (sem node, sem derive, sem implication)."
                        )
                    routing_refs[cid].add(f"{page_id}.step.{sid}.internal")
        reply_rules = s.get("reply_rules")
        if reply_rules is not None:
            if not isinstance(reply_rules, list):
                rep.err(f"[{page_id}].steps['{sid}'].reply_rules nem lista.")
            elif not reply_rules:
                rep.err(f"[{page_id}].steps['{sid}'].reply_rules üres lista.")
            elif len(reply_rules) > 10:
                rep.err(
                    f"[{page_id}].steps['{sid}'].reply_rules: túl sok elem "
                    f"({len(reply_rules)}, max 10). A runtime LLM-prompt nem bír többet."
                )
            else:
                for ri, rr in enumerate(reply_rules):
                    if not isinstance(rr, str) or not rr.strip():
                        rep.err(
                            f"[{page_id}].steps['{sid}'].reply_rules[{ri}]: "
                            "nem üres string kell."
                        )
                    elif len(rr) < 8:
                        rep.err(
                            f"[{page_id}].steps['{sid}'].reply_rules[{ri}]: "
                            f"túl rövid ({len(rr)} char, min 8). "
                            "A reply_rules tartalmi utasítás, nem kulcsszó."
                        )
                    elif len(rr) > 240:
                        rep.err(
                            f"[{page_id}].steps['{sid}'].reply_rules[{ri}]: "
                            f"túl hosszú ({len(rr)} char, max 240)."
                        )
        for img_key in ("image_conditions",):
            v = s.get(img_key)
            if v is not None and not isinstance(v, list):
                rep.err(f"[{page_id}].steps['{sid}'].{img_key} nem lista.")
            elif isinstance(v, list):
                for ic in v:
                    if not isinstance(ic, str):
                        rep.err(f"[{page_id}].steps['{sid}'].{img_key}: nem-string elem.")
                    elif ic not in valid_cond_ids:
                        rep.warn(
                            f"[{page_id}].steps['{sid}'].{img_key}={ic!r}: ismeretlen kondíció."
                        )
                    if isinstance(ic, str):
                        routing_refs[ic].add(f"{page_id}.step.{sid}.{img_key}")
        for inj_key in ("inject_conditions", "default_inject_conditions"):
            v = s.get(inj_key)
            if v is None:
                continue
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                rep.err(f"[{page_id}].steps['{sid}'].{inj_key} nem string lista.")
                continue
            for cid in v:
                routing_refs[cid].add(f"{page_id}.step.{sid}.{inj_key}")
        branches = s.get("branches")
        if branches is not None:
            if not isinstance(branches, list):
                rep.err(f"[{page_id}].steps['{sid}'].branches nem lista.")
            else:
                for bi, b in enumerate(branches):
                    if not isinstance(b, dict):
                        rep.err(f"[{page_id}].steps['{sid}'].branches[{bi}] nem dict.")
                        continue
                    ifs = b.get("if")
                    if ifs is not None:
                        if not isinstance(ifs, list) or not all(isinstance(x, str) for x in ifs):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].branches[{bi}].if nem string lista."
                            )
                        else:
                            for cond in ifs:
                                if cond not in valid_cond_ids:
                                    rep.warn(
                                        f"[{page_id}].steps['{sid}'].branches[{bi}].if='{cond}': "
                                        "ismeretlen kondíció."
                                    )
                                routing_refs[cond].add(
                                    f"{page_id}.step.{sid}.branch[{bi}]"
                                )
                    nxt = b.get("next_step")
                    goto = b.get("goto")
                    if nxt is None and goto is None:
                        rep.err(
                            f"[{page_id}].steps['{sid}'].branches[{bi}]: "
                            "sem next_step, sem goto. (Lehet 'ask' is.)"
                        )
                    inj = b.get("inject_conditions")
                    if inj is not None:
                        if not isinstance(inj, list) or not all(isinstance(x, str) for x in inj):
                            rep.err(
                                f"[{page_id}].steps['{sid}'].branches[{bi}].inject_conditions nem string lista."
                            )
                        else:
                            for cid in inj:
                                routing_refs[cid].add(
                                    f"{page_id}.step.{sid}.branch[{bi}].inject"
                                )
        dnext = s.get("default_next")
        if dnext is not None and not isinstance(dnext, str):
            rep.err(f"[{page_id}].steps['{sid}'].default_next nem string.")
    # Második menet: minden step-id ismert már — branches.next_step / goto és default_next
    # célok validálása.
    for s in steps:
        if not isinstance(s, dict):
            continue
        sid = s.get("id", "?")
        for bi, b in enumerate(s.get("branches") or []):
            if not isinstance(b, dict):
                continue
            nxt = b.get("next_step")
            goto = b.get("goto")
            if isinstance(nxt, str) and nxt.strip():
                if nxt != "ask" and nxt not in step_ids and nxt not in valid_page_ids:
                    rep.err(
                        f"[{page_id}].steps['{sid}'].branches[{bi}].next_step={nxt!r}: "
                        "se nem step-id ezen a node-on, se page-id."
                    )
                elif nxt in valid_page_ids:
                    targets.add(nxt)
            if isinstance(goto, str) and goto.strip():
                if goto != "ask" and goto not in step_ids and goto not in valid_page_ids:
                    rep.err(
                        f"[{page_id}].steps['{sid}'].branches[{bi}].goto={goto!r}: "
                        "se step-id, se page-id."
                    )
                elif goto in valid_page_ids:
                    targets.add(goto)
        dnext = s.get("default_next")
        if isinstance(dnext, str) and dnext.strip():
            if dnext != "ask" and dnext not in step_ids and dnext not in valid_page_ids:
                rep.err(
                    f"[{page_id}].steps['{sid}'].default_next={dnext!r}: "
                    "se step-id, se page-id."
                )
            elif dnext in valid_page_ids:
                targets.add(dnext)
    return targets


def validate_page(
    page_id: str,
    page: dict,
    meta: dict,
    valid_page_ids: Iterable[str],
    derived_cond_ids: set[str],
    rep: Report,
    page_targets: dict[str, set[str]],
    routing_refs: dict[str, set[str]],
    declared_conds_global: set[str],
    *,
    strict_closing_bundle: bool = True,
) -> None:
    if not isinstance(page, dict):
        rep.err(f"pages['{page_id}'] nem dict.")
        return
    if page.get("id") != page_id:
        rep.err(f"pages['{page_id}'].id mismatch: {page.get('id')!r}")
    ptype = page.get("type")
    if ptype not in {"ai", "end"}:
        rep.err(f"[{page_id}].type érvénytelen: {ptype!r} (várt: 'ai' vagy 'end').")

    if ptype == "end":
        content = page.get("content")
        if not isinstance(content, str) or not content.strip():
            rep.err(f"[{page_id}] end node: 'content' hiányzik vagy üres.")
        return

    if not isinstance(page.get("fallback_message"), str) or not page["fallback_message"].strip():
        rep.warn(f"[{page_id}] ai node: fallback_message hiányzik vagy üres.")

    knowledge = page.get("knowledge")
    if not isinstance(knowledge, dict):
        rep.err(f"[{page_id}] knowledge szekció hiányzik vagy nem dict.")
    else:
        for k in ("description", "scope"):
            if not isinstance(knowledge.get(k), str) or not knowledge[k].strip():
                rep.warn(f"[{page_id}].knowledge.{k} hiányzik vagy üres.")
        ex = knowledge.get("examples")
        if not isinstance(ex, list) or not ex:
            rep.warn(f"[{page_id}].knowledge.examples üres vagy nem lista.")
        elif not all(isinstance(x, str) and x.strip() for x in ex):
            rep.err(f"[{page_id}].knowledge.examples nem string lista.")

    declared = validate_conditions(page_id, page, meta, rep)
    declared_conds_global.update(declared)
    valid_cond_ids = declared | derived_cond_ids

    targets = validate_routing(page_id, page, valid_cond_ids, valid_page_ids, rep, routing_refs)
    step_targets = validate_steps(
        page_id, page, valid_cond_ids, valid_page_ids, rep, routing_refs,
        strict_closing_bundle=strict_closing_bundle,
    )
    validate_condition_implications(page_id, page, valid_cond_ids, rep, routing_refs)
    validate_session_facts_whitelist(page_id, page, valid_cond_ids, rep, routing_refs)
    page_targets[page_id] = targets | step_targets


def validate_graph(
    meta: dict,
    pages: dict,
    page_targets: dict[str, set[str]],
    rep: Report,
) -> None:
    start = meta.get("startPageId")
    if not isinstance(start, str) or start not in pages:
        rep.err(f"meta.startPageId='{start}' nincs a pages alatt.")
        return

    visited: set[str] = set()
    queue = deque([start])
    while queue:
        cur = queue.popleft()
        if cur in visited:
            continue
        visited.add(cur)
        for nxt in page_targets.get(cur, set()):
            if nxt not in visited:
                queue.append(nxt)

    unreachable = set(pages.keys()) - visited
    for orphan in sorted(unreachable):
        rep.warn(f"Page nem elérhető startPageId-ból: {orphan}")

    for pid, page in pages.items():
        if page.get("type") == "end":
            continue
        if not page_targets.get(pid):
            rep.warn(f"[{pid}] ai node-ból nincs egyetlen kimenő él sem.")


def validate_condition_usage(
    meta: dict,
    declared_conds: set[str],
    derived_conds: set[str],
    routing_refs: dict[str, set[str]],
    rep: Report,
) -> None:
    all_known = declared_conds | derived_conds

    referenced = set(routing_refs.keys())

    undeclared = referenced - all_known
    for cid in sorted(undeclared):
        first_ref = sorted(routing_refs[cid])[:3]
        rep.err(
            f"Hivatkozott, de nem deklarált kondíció: {cid!r} "
            f"(hivatkozási helyek: {first_ref})"
        )

    labels = meta.get("condition_labels") or {}
    if isinstance(labels, dict):
        labeled = set(labels.keys())
        unused_labels = labeled - referenced - declared_conds
        for cid in sorted(unused_labels):
            rep.note(f"condition_labels['{cid}'] sehol nem hivatkozott (lehet halott).")

    unused_declared = declared_conds - referenced
    for cid in sorted(unused_declared):
        rep.note(f"deklarált kondíció sehol nem hivatkozott: {cid!r}")


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #


def lint_full_story(
    story: dict,
    *,
    extra_known_external_fields: Iterable[str] | None = None,
    strict_closing_bundle: bool = True,
) -> Report:
    """Teljes story lint — ugyanazokat az ellenőrzéseket futtatja, mint a CLI.

    Visszatér: `Report` (errors / warnings / info gyűjtve). A hívó dönt arról,
    hogy nyomtat-e, exit code-ot számol-e stb.

    A top-level `schemaVersion`, `storyId`, `locale` validálását is itt
    végezzük (a CLI eddig külön nyomtatott infót, de a Report ezt nem érintette).

    A `extra_known_external_fields` opcionális, job-scope, domain-specifikus
    extended pool — tipikusan a `DomainBlueprint.proposed_new_external_fields`
    field_name listája. Az `meta.order_context_mapping.field_rules` ellenőrzése
    ezt a poolt rétegezi a globális `KNOWN_OCM_FIELDS` fölé: ha egy field a
    domain-specifikus pool-ban van, a riport `note()` (info) szintű jelzést
    kap "domain-specific, backend implementation pending" üzenettel — nem
    `warn()` és nem `err()`.
    """
    rep = Report()

    if not isinstance(story, dict):
        rep.err("Story payload nem dict.")
        return rep

    for k in ("schemaVersion", "storyId", "locale"):
        if not isinstance(story.get(k), str) or not story[k].strip():
            rep.err(f"Top-level mező hiányzik vagy nem string: {k}")

    pages = story.get("pages")
    if not isinstance(pages, dict) or not pages:
        rep.err("Top-level 'pages' hiányzik vagy nem nem-üres dict.")
        return rep

    meta = validate_meta(story, rep)
    _computed_ids, derived_cond_ids = validate_order_context_mapping(
        meta, rep, extra_known_fields=extra_known_external_fields
    )

    valid_page_ids = set(pages.keys())
    page_targets: dict[str, set[str]] = {}
    routing_refs: dict[str, set[str]] = defaultdict(set)

    # Globális kondíció pool — mindent beleveszünk, amit a story bárhol
    # deklarál vagy injektál. A runtime-ban a satisfied_conditions session
    # tömb terjed node-ok között, így egyik node deklarálhatja, másik routing-ja
    # használhatja.
    all_declared = collect_all_declared_conditions(pages)
    declared_conds_global: set[str] = set(all_declared)
    valid_global_cond_ids = all_declared | derived_cond_ids

    for pid, page in pages.items():
        validate_page(
            pid, page, meta, valid_page_ids, valid_global_cond_ids,
            rep, page_targets, routing_refs, declared_conds_global,
            strict_closing_bundle=strict_closing_bundle,
        )

    validate_graph(meta, pages, page_targets, rep)
    validate_condition_usage(
        meta, declared_conds_global, derived_cond_ids, routing_refs, rep
    )

    return rep


def lint_single_node(
    page: dict,
    *,
    meta: dict,
    global_condition_pool: Iterable[str],
    known_page_ids: Iterable[str] | None = None,
    strict_closing_bundle: bool = True,
) -> Report:
    """Egy frissen generált AI-node strukturális lint-je (Phase 2 retry loop).

    Args:
        page: a generált page dict (`type=ai|end`, `id`, `conditions`, `routing`,
            `steps`, ...).
        meta: a futó story `meta` szekciója (validation_pattern_ref-hez kell).
        global_condition_pool: a Phase 1 blueprint-ből származó kondíció ID-k +
            korábban már elfogadott node-ok kondíciói + computed condition IDs.
            A node saját condition deklarációi automatikusan hozzáadódnak.
        known_page_ids: a már létrehozott / elfogadott page-id-k halmaza.
            `None` esetén minden goto cél elfogadott (tolerant mód, mert a Phase
            2 közepén még nem ismert minden node).

    Visszatér: `Report`. A hívó retry policy alapján dönt:
        - `rep.errors` üres → node elfogadható
        - 1-2 nem-ismeretlen-page-id típusú hiba → fix prompt + retry (max N×)
        - sok hiba / ismétlődő failure → eldobás vagy human review

    Megjegyzés: a `validate_graph` és `validate_condition_usage` funkciókat
    NEM hívjuk meg single-node módban — azok cross-node connectivity-t
    elemeznek, ami csak a teljes story összerakásakor van értelme.
    """
    rep = Report()

    if not isinstance(page, dict):
        rep.err("Generált page payload nem dict.")
        return rep

    page_id = page.get("id")
    if not isinstance(page_id, str) or not page_id.strip():
        rep.err("Generált page-nek nincs id-ja vagy nem string.")
        return rep

    valid_page_ids: Iterable[str]
    if known_page_ids is None:
        valid_page_ids = _AllPagesAllowed()
    else:
        valid_page_ids = set(known_page_ids)
        if page_id not in valid_page_ids:
            valid_page_ids = valid_page_ids | {page_id}

    derived = set(global_condition_pool)
    derived |= _collect_node_handoff_conditions(page)

    page_targets: dict[str, set[str]] = {}
    routing_refs: dict[str, set[str]] = defaultdict(set)
    declared_conds_global: set[str] = set()

    validate_page(
        page_id,
        page,
        meta if isinstance(meta, dict) else {},
        valid_page_ids,
        derived,
        rep,
        page_targets,
        routing_refs,
        declared_conds_global,
        strict_closing_bundle=strict_closing_bundle,
    )

    return rep
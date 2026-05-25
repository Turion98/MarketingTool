from __future__ import annotations

import re
from datetime import date as date_type
from typing import Optional

_DEFAULT_ORDER_ID_RE = re.compile(r"\bORD-[A-Z]{2,6}-\d{2,6}\b", re.IGNORECASE)


def extract_order_id(text: str, pattern: str | None = None) -> str | None:
    """Rendelési szám a user szövegből.

    pattern: story meta.reference_id_pattern regex string (\\b boundary nélkül).
    Hibás regex esetén a beépített fallback (`ORD-XXX-NNN`) érvényesül.
    """
    if not text or not text.strip():
        return None
    regex: re.Pattern[str]
    if pattern:
        try:
            regex = re.compile(rf"\b{pattern}\b", re.IGNORECASE)
        except re.error:
            regex = _DEFAULT_ORDER_ID_RE
    else:
        regex = _DEFAULT_ORDER_ID_RE
    m = regex.search(text.strip())
    return m.group(0).upper() if m else None


# Backward-compat alias — test_delivery_mapping.py és egyéb korábbi import miatt.
extract_questell_order_id = extract_order_id


def collect_validation_patterns(
    condition_defs: list | None,
    story: dict | None,
) -> dict[str, str]:
    """Kondíció ID → regex pattern map a `validation_pattern_ref` alapján.

    A `validation_pattern_ref` érték a story `meta.<ref>` kulcsra mutat
    (jellemzően `reference_id_pattern`). Hiányzó / nem-string ref esetén
    a kondíció kimarad a map-ből (= nem validálandó).
    """
    if not isinstance(condition_defs, list):
        return {}
    meta = story.get("meta") if isinstance(story, dict) else None
    if not isinstance(meta, dict):
        return {}
    out: dict[str, str] = {}
    for cd in condition_defs:
        if not isinstance(cd, dict):
            continue
        cid = cd.get("id")
        ref = cd.get("validation_pattern_ref")
        if not isinstance(cid, str) or not cid:
            continue
        if not isinstance(ref, str) or not ref:
            continue
        pattern = meta.get(ref)
        if isinstance(pattern, str) and pattern:
            out[cid] = pattern
    return out


def filter_satisfied_by_pattern_validation(
    condition_result: dict,
    condition_defs: list | None,
    story: dict | None,
    user_prompt: str | None,
) -> tuple[dict, list[str]]:
    """LLM által teljesítettnek jelölt, de regex-validációra bukó kondíciók kiszűrése.

    A `validation_pattern_ref` mezővel ellátott kondíciók akkor maradnak
    `satisfied`-ben, ha az `extract_order_id(user_prompt, pattern)` nem `None`.
    Ha buknak: kikerülnek a `satisfied`-ből, és bekerülnek a `missing`-be
    (hogy a downstream újra rákérdezhessen).

    A `validation_pattern_ref` nélküli kondíciók változatlanul átmennek.

    Visszatér: (módosított condition_result, rejected_ids)
    """
    if not isinstance(condition_result, dict):
        return condition_result, []
    pattern_map = collect_validation_patterns(condition_defs, story)
    if not pattern_map:
        return condition_result, []
    text = user_prompt if isinstance(user_prompt, str) else ""
    satisfied_raw = condition_result.get("satisfied") or []
    missing_raw = condition_result.get("missing") or []
    kept: list[str] = []
    rejected: list[str] = []
    for cid in satisfied_raw:
        if not isinstance(cid, str) or not cid:
            continue
        pattern = pattern_map.get(cid)
        if pattern is None:
            kept.append(cid)
            continue
        if extract_order_id(text, pattern=pattern) is not None:
            kept.append(cid)
        else:
            rejected.append(cid)
    if not rejected:
        return {**condition_result, "satisfied": kept}, []
    missing_out = [m for m in missing_raw if isinstance(m, str) and m]
    for cid in rejected:
        if cid not in missing_out:
            missing_out.append(cid)
    return (
        {**condition_result, "satisfied": kept, "missing": missing_out},
        rejected,
    )

from pydantic import BaseModel, Field

from services.story_runtime import get_story_runtime_date, get_story_runtime_int


class OrderContext(BaseModel):
    """Rendeléshez kapcsolt tények (provider + derive réteg)."""

    order_id: str = Field(..., min_length=1)

    purchase_date: Optional[date_type] = None
    extended_warranty_active: Optional[bool] = None

    sold_grade: Optional[str] = None
    sold_battery_threshold: Optional[float] = None
    accessories_in_order: Optional[list[str]] = None
    return_status: Optional[str] = None
    payment_method: Optional[str] = None

    delivery_date: Optional[date_type] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None

    tracking_status: Optional[str] = Field(
        None,
        description='"delivered" | "lost" | "in_transit" | "delayed" | "returned"',
    )
    estimated_delivery_date: Optional[date_type] = Field(
        None,
        description="Futár által ígért kézbesítési dátum — delay számításhoz",
    )


def get_order_context_mapping(story: dict | None) -> dict | None:
    if not isinstance(story, dict):
        return None
    meta = story.get("meta")
    if not isinstance(meta, dict):
        return None
    mapping = meta.get("order_context_mapping")
    return mapping if isinstance(mapping, dict) else None


def _default_order_context_mapping() -> dict:
    """Üres fallback — a story meta.order_context_mapping tartalmazza a tényleges szabályokat."""
    return {}


def _session_satisfied_ids(conversation_state: dict) -> set[str]:
    """Session / kliens satisfiedConditions — user szövegből extract-elt kondíciók."""
    raw = conversation_state.get("satisfied_conditions")
    if not isinstance(raw, list):
        return set()
    return {x for x in raw if isinstance(x, str) and x}


def _computed_condition_id(mapping: dict, key: str) -> str:
    cids = mapping.get("computed_condition_ids")
    if not isinstance(cids, dict):
        return key
    val = cids.get(key)
    return val if isinstance(val, str) and val else key


def _session_state_key(mapping: dict, key: str, default: str) -> str:
    sk = mapping.get("session_state_keys")
    if not isinstance(sk, dict):
        return default
    val = sk.get(key)
    return val if isinstance(val, str) and val else default


def _apply_field_rules(
    ctx: OrderContext,
    session_ids: set[str],
    rules: list[dict],
    *,
    today: date_type,
) -> list[str]:
    satisfied: list[str] = []
    ctx_dict = ctx.model_dump()
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        field = rule.get("field")
        cond = rule.get("condition")
        if not isinstance(field, str) or not field:
            continue
        if not isinstance(cond, str) or not cond:
            continue
        value = ctx_dict.get(field)
        guard = rule.get("session_guard_not")
        if isinstance(guard, str) and guard and guard in session_ids:
            continue
        when_any = rule.get("when_any_value")
        if when_any is not None:
            if not isinstance(when_any, list) or value not in when_any:
                continue
            req_field = rule.get("requires_field_not_null")
            if isinstance(req_field, str) and req_field:
                if ctx_dict.get(req_field) is None:
                    continue
            lt_field = rule.get("requires_field_lt_today")
            if isinstance(lt_field, str) and lt_field:
                lt_val = ctx_dict.get(lt_field)
                if lt_val is None or lt_val >= today:
                    continue
            satisfied.append(cond)
            continue
        when = rule.get("when")
        if "when_value" in rule:
            if value != rule.get("when_value"):
                continue
        elif when == "truthy":
            if not value:
                continue
        elif when == "not_null":
            if value is None:
                continue
        else:
            continue
        satisfied.append(cond)
    return satisfied


def resolve_satisfied_precedence(
    conditions: list[str],
    mapping: dict | None = None,
) -> list[str]:
    """
    User/session kondíció elsőbbsége: precedence_rules alapján suppress.
    """
    rules = (mapping or {}).get("precedence_rules") or []
    if not rules:
        return list(conditions)

    result = list(conditions)
    cond_set = set(result)
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if_present = rule.get("if_present")
        if if_present in cond_set:
            suppress = rule.get("suppress")
            if isinstance(suppress, str) and suppress:
                result = [c for c in result if c != suppress]
                cond_set.discard(suppress)
    return result


def merge_session_and_derived_satisfied(
    session: list[str],
    derived: list[str],
    mapping: dict | None = None,
) -> list[str]:
    merged = list(
        dict.fromkeys([*session, *[d for d in derived if d not in session]])
    )
    return resolve_satisfied_precedence(merged, mapping=mapping)


def derive_conditions(
    ctx: OrderContext,
    conversation_state: dict,
    today: Optional[date_type] = None,
    story: dict | None = None,
    mapping: dict | None = None,
) -> list[str]:
    """
    OrderContext alapján automatikusan teljesített kondíció ID-k listája.
    Ezeket a process_ai_node összevonja a satisfiedConditions-szel
    mielőtt az LLM extract_conditions fut.

    conversation_state.satisfied_conditions: session satisfied ID-k;
    user szövegből extract-elt kondíció elsőbbséget élvez (pl. ne derive-elj
    package_lost-ot, ha marked_delivered_not_received már szerepel).

    today: explicit override; egyébként meta.runtime.mock_today, majd date.today()
    story: mock_today és return_window_days forrása (meta.runtime)
    mapping: story meta.order_context_mapping (None → story vagy beépített default)
    """
    if today is None:
        today = get_story_runtime_date(story, "mock_today") or date_type.today()

    return_window_days = get_story_runtime_int(story, "return_window_days")
    if return_window_days <= 0:
        return_window_days = 30

    if mapping is None:
        mapping = get_order_context_mapping(story)
    cfg = mapping if mapping is not None else _default_order_context_mapping()
    session_ids = _session_satisfied_ids(conversation_state)

    field_rules = cfg.get("field_rules")
    if not isinstance(field_rules, list):
        field_rules = []

    satisfied = _apply_field_rules(ctx, session_ids, field_rules, today=today)

    if ctx.purchase_date is not None:
        days_since_purchase = (today - ctx.purchase_date).days
        if days_since_purchase <= return_window_days:
            satisfied.append(_computed_condition_id(cfg, "within_return_window"))
        else:
            satisfied.append(_computed_condition_id(cfg, "outside_return_window"))

    battery_key = _session_state_key(
        cfg, "battery_health_reported", "battery_health_user_reported"
    )
    battery_health_reported = conversation_state.get(battery_key)
    if (
        ctx.sold_battery_threshold is not None
        and battery_health_reported is not None
    ):
        try:
            if float(battery_health_reported) < ctx.sold_battery_threshold:
                satisfied.append(_computed_condition_id(cfg, "below_sold_threshold"))
        except (ValueError, TypeError):
            pass

    if ctx.accessories_in_order is not None:
        missing_key = _session_state_key(
            cfg, "missing_accessory_name", "missing_accessory_name"
        )
        missing = conversation_state.get(missing_key)
        if missing:
            normalized_list = [a.lower().strip() for a in ctx.accessories_in_order]
            normalized_missing = str(missing).lower().strip()
            if normalized_missing in normalized_list:
                satisfied.append(_computed_condition_id(cfg, "accessory_was_in_order"))
            else:
                satisfied.append(_computed_condition_id(cfg, "accessory_not_in_order"))

    if ctx.return_status == "accepted":
        satisfied.append(_computed_condition_id(cfg, "return_was_completed"))
    elif ctx.return_status in (None, "pending") and ctx.order_id:
        satisfied.append(_computed_condition_id(cfg, "return_not_received"))

    return list(dict.fromkeys(satisfied))

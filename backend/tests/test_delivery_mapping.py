import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

from services.order_context import (
    OrderContext,
    _apply_field_rules,
    derive_conditions,
    extract_questell_order_id,
    get_order_context_mapping,
    resolve_satisfied_precedence,
)
from services.order_context_providers import MOCK_ORDERS
from services.story_runtime import get_story_runtime_date

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


def _load_story() -> dict:
    return json.loads(STORY_PATH.read_text(encoding="utf-8"))


# A story most kötelezően biztosítja az order_context_mapping-et — a runtime nem
# tartalmaz hardcoded fallback szabályokat. A legtöbb tesztben ugyanezt a story
# mapping-et használjuk implicit kontextusként.
_STORY = _load_story()
_STORY_MAPPING = get_order_context_mapping(_STORY)

def test_extract_questell_order_id_from_prompt():
    assert extract_questell_order_id("rendelési szám: ORD-CUST-001") == "ORD-CUST-001"
    assert extract_questell_order_id("dhl") is None


def test_tracking_checked_when_tracking_number_present():
    ctx = OrderContext(order_id="X", tracking_number="DPD123")
    assert "tracking_checked" in derive_conditions(ctx, {}, mapping=_STORY_MAPPING)


def test_tracking_checked_false_when_no_tracking_number():
    ctx = OrderContext(order_id="X", tracking_number=None)
    assert "tracking_checked" not in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_package_lost_when_status_lost():
    ctx = OrderContext(order_id="X", tracking_number="X", tracking_status="lost")
    result = derive_conditions(ctx, {}, mapping=_STORY_MAPPING)
    assert "package_lost" in result
    assert "tracking_checked" in result


def test_derive_loss_confirmed_when_tracking_lost():
    ctx = OrderContext(order_id="X", tracking_number="X", tracking_status="lost")
    result = derive_conditions(ctx, {}, mapping=_STORY_MAPPING)
    assert "loss_confirmed" in result


def test_package_lost_not_derived_when_marked_delivered_not_received_in_session():
    ctx = OrderContext(order_id="X", tracking_number="X", tracking_status="lost")
    result = derive_conditions(
        ctx,
        {"satisfied_conditions": ["marked_delivered_not_received"]},
        mapping=_STORY_MAPPING,
    )
    assert "package_lost" not in result
    assert "tracking_checked" in result


def test_resolve_precedence_drops_package_lost_when_delivered_not_received():
    merged = resolve_satisfied_precedence(
        ["has_order_id", "marked_delivered_not_received", "package_lost"],
        mapping=_STORY_MAPPING,
    )
    assert "marked_delivered_not_received" in merged
    assert "package_lost" not in merged


MOCK_TODAY = date(2026, 5, 15)
# A CSV-ben (backend/data/mock_orders.csv) az 5 rendelés purchase_date-je a
# mock_today=2026-05-15-höz kalibrált; 30 napos return window mellett az első
# három a határidőn belül, az utolsó kettő azon kívül.
WITHIN_RETURN_WINDOW_ORDER_IDS = [
    "ORD-CUST-001",
    "ORD-CUST-002",
    "ORD-CUST-003",
]
OUTSIDE_RETURN_WINDOW_ORDER_IDS = [
    "ORD-CUST-004",
    "ORD-CUST-005",
]


def test_mock_today_splits_return_window_on_mock_orders():
    story = _load_story()
    assert get_story_runtime_date(story, "mock_today") == MOCK_TODAY
    mapping = get_order_context_mapping(story)
    for oid in WITHIN_RETURN_WINDOW_ORDER_IDS:
        result = derive_conditions(MOCK_ORDERS[oid], {}, story=story, mapping=mapping)
        assert "within_return_window" in result, oid
        assert "outside_return_window" not in result
    for oid in OUTSIDE_RETURN_WINDOW_ORDER_IDS:
        result = derive_conditions(MOCK_ORDERS[oid], {}, story=story, mapping=mapping)
        assert "outside_return_window" in result, oid
        assert "within_return_window" not in result


def test_return_window_days_override_changes_classification():
    story = _load_story()
    ctx = MOCK_ORDERS["ORD-CUST-001"]
    assert "within_return_window" in derive_conditions(ctx, {}, story=story)
    narrow_runtime = {
        **story["meta"]["runtime"],
        "return_window_days": 14,
    }
    narrow_story = {
        **story,
        "meta": {**story["meta"], "runtime": narrow_runtime},
    }
    result = derive_conditions(ctx, {}, story=narrow_story)
    assert "outside_return_window" in result
    assert "within_return_window" not in result


def test_mock_today_fallback_uses_date_today_when_missing():
    story = _load_story()
    runtime = {
        k: v for k, v in story["meta"]["runtime"].items() if k != "mock_today"
    }
    story_no_mock = {
        **story,
        "meta": {**story["meta"], "runtime": runtime},
    }
    ctx = MOCK_ORDERS["ORD-CUST-001"]
    with patch("services.order_context.date_type") as mock_date_module:
        mock_date_module.today.return_value = MOCK_TODAY
        result = derive_conditions(ctx, {}, story=story_no_mock)
    assert "within_return_window" in result


def test_apply_field_rules_when_any_value_delay():
    ctx = OrderContext(
        order_id="X",
        tracking_number="X",
        tracking_status="in_transit",
        estimated_delivery_date=date(2026, 4, 30),
    )
    rules = [
        {
            "field": "tracking_status",
            "condition": "delay_duration_known",
            "when_any_value": ["in_transit", "delayed"],
            "requires_field_not_null": "estimated_delivery_date",
            "requires_field_lt_today": "estimated_delivery_date",
        }
    ]
    assert "delay_duration_known" in _apply_field_rules(
        ctx, set(), rules, today=date(2026, 5, 12)
    )
    assert "delay_duration_known" not in _apply_field_rules(
        ctx, set(), rules, today=date(2026, 4, 25)
    )


def test_apply_field_rules_not_null_with_requires_field_lt_today():
    """Engine: requires_field_lt_today működik `when: not_null` ágon (story refund_overdue)."""
    ctx_overdue = OrderContext(
        order_id="X",
        refund_eta_date=date(2026, 5, 10),
    )
    ctx_future = OrderContext(
        order_id="X",
        refund_eta_date=date(2026, 5, 20),
    )
    ctx_missing = OrderContext(order_id="X")
    rules = [
        {
            "field": "refund_eta_date",
            "condition": "refund_overdue",
            "when": "not_null",
            "requires_field_lt_today": "refund_eta_date",
        }
    ]
    assert "refund_overdue" in _apply_field_rules(
        ctx_overdue, set(), rules, today=date(2026, 5, 15)
    )
    assert "refund_overdue" not in _apply_field_rules(
        ctx_future, set(), rules, today=date(2026, 5, 15)
    )
    assert "refund_overdue" not in _apply_field_rules(
        ctx_missing, set(), rules, today=date(2026, 5, 15)
    )


def test_apply_field_rules_not_null_with_requires_field_not_null():
    """Engine: requires_field_not_null működik `when: not_null` ágon (story refund_amount_known).

    B megoldás: a refund_amount_known csak akkor satisfied, ha mind az amount, mind
    a currency ki van töltve — kombinált 'és' feltétel egyetlen rule-ban.
    """
    rules = [
        {
            "field": "refund_amount",
            "condition": "refund_amount_known",
            "when": "not_null",
            "requires_field_not_null": "refund_currency",
        }
    ]
    today = date(2026, 5, 15)

    ctx_both = OrderContext(order_id="X", refund_amount=249.0, refund_currency="EUR")
    ctx_amount_only = OrderContext(order_id="X", refund_amount=249.0)
    ctx_currency_only = OrderContext(order_id="X", refund_currency="EUR")
    ctx_neither = OrderContext(order_id="X")

    assert "refund_amount_known" in _apply_field_rules(
        ctx_both, set(), rules, today=today
    )
    assert "refund_amount_known" not in _apply_field_rules(
        ctx_amount_only, set(), rules, today=today
    )
    assert "refund_amount_known" not in _apply_field_rules(
        ctx_currency_only, set(), rules, today=today
    )
    assert "refund_amount_known" not in _apply_field_rules(
        ctx_neither, set(), rules, today=today
    )


def test_apply_field_rules_modifiers_work_on_truthy_branch():
    """Engine: modifierek a `when: truthy` ágon is működnek (jövőálló bővítés)."""
    rules = [
        {
            "field": "tracking_number",
            "condition": "tracking_lt_today",
            "when": "truthy",
            "requires_field_lt_today": "estimated_delivery_date",
        }
    ]
    ctx_overdue = OrderContext(
        order_id="X",
        tracking_number="ABC",
        estimated_delivery_date=date(2026, 4, 30),
    )
    ctx_future = OrderContext(
        order_id="X",
        tracking_number="ABC",
        estimated_delivery_date=date(2026, 5, 20),
    )
    assert "tracking_lt_today" in _apply_field_rules(
        ctx_overdue, set(), rules, today=date(2026, 5, 15)
    )
    assert "tracking_lt_today" not in _apply_field_rules(
        ctx_future, set(), rules, today=date(2026, 5, 15)
    )


def test_apply_field_rules_truthy_when_value_and_session_guard():
    ctx = OrderContext(
        order_id="X",
        tracking_number="DPD123",
        tracking_status="lost",
        extended_warranty_active=True,
        sold_battery_threshold=0.86,
        accessories_in_order=["cable"],
    )
    rules = [
        {"field": "tracking_number", "condition": "tracking_checked", "when": "truthy"},
        {
            "field": "tracking_status",
            "condition": "package_lost",
            "when_value": "lost",
            "session_guard_not": "marked_delivered_not_received",
        },
        {"field": "tracking_status", "condition": "loss_confirmed", "when_value": "lost"},
        {
            "field": "extended_warranty_active",
            "condition": "extended_warranty_active",
            "when_value": True,
        },
        {
            "field": "sold_battery_threshold",
            "condition": "sold_threshold_known",
            "when": "not_null",
        },
        {
            "field": "accessories_in_order",
            "condition": "order_accessory_list_checked",
            "when": "not_null",
        },
    ]
    without_guard = set(
        _apply_field_rules(ctx, set(), rules, today=date(2026, 5, 15))
    )
    assert without_guard == {
        "tracking_checked",
        "package_lost",
        "loss_confirmed",
        "extended_warranty_active",
        "sold_threshold_known",
        "order_accessory_list_checked",
    }

    with_guard = set(
        _apply_field_rules(
            ctx,
            {"marked_delivered_not_received"},
            rules,
            today=date(2026, 5, 15),
        )
    )
    assert "package_lost" not in with_guard
    assert "loss_confirmed" in with_guard


def test_precedence_rules_from_mapping():
    mapping = {
        "precedence_rules": [
            {"if_present": "foo_present", "suppress": "foo_suppressed"}
        ]
    }
    merged = resolve_satisfied_precedence(
        ["foo_present", "foo_suppressed", "other"],
        mapping=mapping,
    )
    assert "foo_present" in merged
    assert "foo_suppressed" not in merged
    assert "other" in merged


def test_precedence_rules_noop_without_mapping():
    """Mapping nélkül a precedence runtime nem törli a kondíciókat — minden szabály a story meta-ban van."""
    merged = resolve_satisfied_precedence(
        ["marked_delivered_not_received", "package_lost"],
        mapping=None,
    )
    assert "marked_delivered_not_received" in merged
    assert "package_lost" in merged


def test_computed_condition_ids_override():
    mapping = {
        "field_rules": [],
        "computed_condition_ids": {
            "within_return_window": "custom_within_window",
            "outside_return_window": "custom_outside_window",
            "return_not_received": "custom_return_missing",
        },
    }
    ctx = OrderContext(order_id="ORD-TST-001", purchase_date=date(2026, 4, 20))
    result = derive_conditions(ctx, {}, today=date(2026, 5, 12), mapping=mapping)
    assert "custom_within_window" in result
    assert "within_return_window" not in result

    ctx_out = OrderContext(order_id="ORD-TST-001", purchase_date=date(2026, 3, 1))
    result_out = derive_conditions(
        ctx_out, {}, today=date(2026, 5, 12), mapping=mapping
    )
    assert "custom_outside_window" in result_out

    minimal = OrderContext(order_id="X")
    assert "custom_return_missing" in derive_conditions(minimal, {}, mapping=mapping)


def test_derive_conditions_uses_story_mapping():
    story = _load_story()
    mapping = get_order_context_mapping(story)
    assert mapping is not None
    ctx = OrderContext(order_id="X", tracking_number="DPD123")
    assert "tracking_checked" in derive_conditions(
        ctx, {}, story=story, mapping=mapping
    )


def test_ord_cust_001_mock_is_delivered_not_lost():
    from services.order_context_providers import MOCK_ORDERS

    ctx = MOCK_ORDERS["ORD-CUST-001"]
    assert ctx.tracking_status == "delivered"
    result = derive_conditions(ctx, {}, mapping=_STORY_MAPPING)
    assert "package_lost" not in result
    assert "tracking_checked" in result


def test_delay_duration_known_when_overdue():
    ctx = OrderContext(
        order_id="X",
        tracking_number="X",
        tracking_status="in_transit",
        estimated_delivery_date=date(2026, 4, 30),
    )
    result = derive_conditions(
        ctx, {}, today=date(2026, 5, 12), mapping=_STORY_MAPPING
    )
    assert "delay_duration_known" in result


def test_delay_not_triggered_when_not_yet_due():
    ctx = OrderContext(
        order_id="X",
        tracking_number="X",
        tracking_status="in_transit",
        estimated_delivery_date=date(2026, 5, 20),
    )
    result = derive_conditions(
        ctx, {}, today=date(2026, 5, 12), mapping=_STORY_MAPPING
    )
    assert "delay_duration_known" not in result


def test_minimal_context_derives_return_not_received():
    ctx = OrderContext(order_id="X")
    assert "return_not_received" in derive_conditions(ctx, {}, mapping=_STORY_MAPPING)

    ctx_empty_id = OrderContext.model_construct(order_id="", return_status=None)
    assert "return_not_received" not in derive_conditions(
        ctx_empty_id, {}, mapping=_STORY_MAPPING
    )


# --- RETURN WINDOW ---


def test_within_return_window():
    ctx = OrderContext(order_id="ORD-TST-001", purchase_date=date(2026, 4, 20))
    result = derive_conditions(
        ctx, {}, today=date(2026, 5, 12), mapping=_STORY_MAPPING
    )
    assert "within_return_window" in result
    assert "outside_return_window" not in result


def test_outside_return_window():
    ctx = OrderContext(order_id="ORD-TST-001", purchase_date=date(2026, 3, 1))
    result = derive_conditions(
        ctx, {}, today=date(2026, 5, 12), mapping=_STORY_MAPPING
    )
    assert "outside_return_window" in result
    assert "within_return_window" not in result


def test_extended_warranty_active():
    ctx = OrderContext(order_id="ORD-TST-001", extended_warranty_active=True)
    assert "extended_warranty_active" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_extended_warranty_inactive_not_in_result():
    ctx = OrderContext(order_id="ORD-TST-001", extended_warranty_active=False)
    assert "extended_warranty_active" not in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


# --- BATTERY ---


def test_sold_threshold_known():
    ctx = OrderContext(order_id="ORD-TST-001", sold_battery_threshold=0.86)
    assert "sold_threshold_known" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_below_sold_threshold():
    ctx = OrderContext(order_id="ORD-TST-001", sold_battery_threshold=0.86)
    result = derive_conditions(
        ctx, {"battery_health_user_reported": "0.75"}, mapping=_STORY_MAPPING
    )
    assert "below_sold_threshold" in result


def test_above_sold_threshold():
    ctx = OrderContext(order_id="ORD-TST-001", sold_battery_threshold=0.86)
    result = derive_conditions(
        ctx, {"battery_health_user_reported": "0.90"}, mapping=_STORY_MAPPING
    )
    assert "below_sold_threshold" not in result


def test_below_threshold_missing_reported_value():
    ctx = OrderContext(order_id="ORD-TST-001", sold_battery_threshold=0.86)
    assert "below_sold_threshold" not in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


# --- ACCESSORY ---


def test_order_accessory_list_checked():
    ctx = OrderContext(order_id="ORD-TST-001", accessories_in_order=["charger"])
    assert "order_accessory_list_checked" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_accessory_was_in_order():
    ctx = OrderContext(order_id="ORD-TST-001", accessories_in_order=["charger", "cable"])
    result = derive_conditions(
        ctx, {"missing_accessory_name": "charger"}, mapping=_STORY_MAPPING
    )
    assert "accessory_was_in_order" in result
    assert "accessory_not_in_order" not in result


def test_accessory_not_in_order():
    ctx = OrderContext(order_id="ORD-TST-001", accessories_in_order=["cable"])
    result = derive_conditions(
        ctx, {"missing_accessory_name": "charger"}, mapping=_STORY_MAPPING
    )
    assert "accessory_not_in_order" in result
    assert "accessory_was_in_order" not in result


def test_accessory_case_insensitive():
    ctx = OrderContext(order_id="ORD-TST-001", accessories_in_order=["Charger"])
    result = derive_conditions(
        ctx, {"missing_accessory_name": "CHARGER"}, mapping=_STORY_MAPPING
    )
    assert "accessory_was_in_order" in result


def test_return_was_completed():
    ctx = OrderContext(order_id="ORD-TST-001", return_status="accepted")
    assert "return_was_completed" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )
    assert "return_not_received" not in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_return_not_received_when_pending():
    ctx = OrderContext(order_id="ORD-TST-001", return_status="pending")
    assert "return_not_received" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )
    assert "return_was_completed" not in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


def test_return_not_received_when_none():
    ctx = OrderContext(order_id="ORD-TST-001", return_status=None)
    assert "return_not_received" in derive_conditions(
        ctx, {}, mapping=_STORY_MAPPING
    )


# --- HISTORIKUS REFUND KONDÍCIÓK (ORD-CUST-005 jellegű kontextus) ---


def test_historical_refund_conditions_derived_from_full_context():
    """ORD-CUST-005 mintájú teljes historikus kontextus → minden refund-kondíció derive-ol."""
    ctx = MOCK_ORDERS["ORD-CUST-005"]
    story = _load_story()
    mapping = get_order_context_mapping(story)
    result = derive_conditions(ctx, {}, story=story, mapping=mapping)

    assert "payment_method_known" in result
    assert "return_initiated" in result
    assert "return_received" in result
    assert "refund_initiated" in result
    assert "refund_eta_known" in result
    assert "prior_case_exists" in result
    assert "refund_amount_known" in result


def test_refund_overdue_not_satisfied_when_eta_in_future():
    """ORD-CUST-005 refund_eta_date=2026-05-24, mock_today=2026-05-15 → még nincs lejárva."""
    story = _load_story()
    mapping = get_order_context_mapping(story)
    ctx = MOCK_ORDERS["ORD-CUST-005"]
    result = derive_conditions(ctx, {}, story=story, mapping=mapping)
    assert "refund_overdue" not in result


def test_refund_overdue_satisfied_when_eta_past():
    """Másolt OrderContext lejárt ETA-val → refund_overdue derive-ol."""
    story = _load_story()
    mapping = get_order_context_mapping(story)
    base = MOCK_ORDERS["ORD-CUST-005"]
    overdue_ctx = base.model_copy(update={"refund_eta_date": date(2026, 5, 1)})
    result = derive_conditions(overdue_ctx, {}, story=story, mapping=mapping)
    assert "refund_overdue" in result
    assert "refund_eta_known" in result


def test_refund_amount_known_requires_both_amount_and_currency():
    """ORD-CUST-001 (sem amount sem currency) → refund_amount_known nincs."""
    story = _load_story()
    mapping = get_order_context_mapping(story)
    ctx = MOCK_ORDERS["ORD-CUST-001"]
    result = derive_conditions(ctx, {}, story=story, mapping=mapping)
    assert "refund_amount_known" not in result


def test_minimal_orders_have_no_historical_refund_conditions():
    """ORD-CUST-001..004 → nincs historikus refund kontextus, ezek a kondíciók NINCS satisfied."""
    story = _load_story()
    mapping = get_order_context_mapping(story)
    for oid in ("ORD-CUST-001", "ORD-CUST-002", "ORD-CUST-003", "ORD-CUST-004"):
        ctx = MOCK_ORDERS[oid]
        result = derive_conditions(ctx, {}, story=story, mapping=mapping)
        for cid in (
            "return_initiated",
            "return_received",
            "refund_initiated",
            "refund_eta_known",
            "refund_overdue",
            "prior_case_exists",
            "refund_amount_known",
        ):
            assert cid not in result, f"{oid} should not derive {cid}"

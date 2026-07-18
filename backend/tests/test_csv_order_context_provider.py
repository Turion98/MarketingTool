"""CsvOrderContextProvider — külső adathordozós backing store unit tesztek.

A `MOCK_ORDERS` korábban hard-coded Python dict volt; mostantól a single source
of truth a `backend/data/mock_orders.csv`. Ezek a tesztek a parser, a coercion
és a singleton wiring helyes működését garantálják.
"""

from __future__ import annotations

import asyncio
from datetime import date
from pathlib import Path
from textwrap import dedent

import pytest

from services.order_context import OrderContext
from services.order_context_providers import (
    DEFAULT_MOCK_ORDERS_CSV,
    MOCK_ORDERS,
    CsvOrderContextProvider,
    MockOrderContextProvider,
    get_default_order_context_provider,
    reset_default_order_context_provider,
)


EXPECTED_ORDER_IDS = {
    "ORD-CUST-001",
    "ORD-CUST-002",
    "ORD-CUST-003",
    "ORD-CUST-004",
    "ORD-CUST-005",
}


def test_default_csv_path_exists() -> None:
    assert DEFAULT_MOCK_ORDERS_CSV.exists(), DEFAULT_MOCK_ORDERS_CSV
    assert DEFAULT_MOCK_ORDERS_CSV.is_file()


def test_default_provider_loads_five_orders() -> None:
    reset_default_order_context_provider()
    provider = get_default_order_context_provider()
    assert isinstance(provider, CsvOrderContextProvider)
    assert provider.csv_path == DEFAULT_MOCK_ORDERS_CSV
    assert set(provider.orders.keys()) == EXPECTED_ORDER_IDS


def test_mock_orders_proxy_lookup_works() -> None:
    """`MOCK_ORDERS["ORD-CUST-001"]` backward-compat hozzáférés a CSV-ből."""
    reset_default_order_context_provider()
    ctx = MOCK_ORDERS["ORD-CUST-001"]
    assert isinstance(ctx, OrderContext)
    assert ctx.order_id == "ORD-CUST-001"
    assert "ORD-CUST-001" in MOCK_ORDERS
    assert "ORD-XYZ-999" not in MOCK_ORDERS
    assert MOCK_ORDERS.get("missing") is None


def test_ord_cust_001_full_adatlap() -> None:
    """ORD-CUST-001 — leszállított ideális szcenárió, minden mező kitöltve."""
    ctx = MOCK_ORDERS["ORD-CUST-001"]
    assert ctx.purchase_date == date(2026, 4, 20)
    assert ctx.extended_warranty_active is True
    assert ctx.sold_grade == "Excellent"
    assert ctx.sold_battery_threshold == pytest.approx(0.90)
    assert ctx.accessories_in_order == ["charger", "cable", "case", "earphones"]
    assert ctx.return_status is None
    assert ctx.payment_method == "bankkártya"
    assert ctx.delivery_date == date(2026, 4, 23)
    assert ctx.courier == "DPD"
    assert ctx.tracking_number == "DPD123456789"
    assert ctx.tracking_status == "delivered"
    assert ctx.estimated_delivery_date == date(2026, 4, 23)
    # Historikus mezők nem kitöltve ennél a rendelésnél.
    assert ctx.return_initiated_date is None
    assert ctx.return_received_date is None
    assert ctx.original_complaint_type is None
    assert ctx.refund_initiated_date is None
    assert ctx.refund_eta_date is None
    assert ctx.prior_case_id is None


def test_ord_cust_002_in_transit_overdue_eta() -> None:
    """ORD-CUST-002 — késő csomag (in_transit + lejárt ETA), nincs garancia."""
    ctx = MOCK_ORDERS["ORD-CUST-002"]
    assert ctx.tracking_status == "in_transit"
    assert ctx.delivery_date is None
    assert ctx.extended_warranty_active is False
    assert ctx.estimated_delivery_date == date(2026, 5, 10)
    assert ctx.purchase_date == date(2026, 4, 28)


def test_ord_cust_005_historikus_refund_kontextus() -> None:
    """ORD-CUST-005 — folyamatban lévő refund, mind a 6 historikus mező kitöltve."""
    ctx = MOCK_ORDERS["ORD-CUST-005"]
    assert ctx.return_status == "accepted"
    assert ctx.return_initiated_date == date(2026, 4, 30)
    assert ctx.return_received_date == date(2026, 5, 8)
    assert ctx.original_complaint_type == "cosmetic"
    assert ctx.refund_initiated_date == date(2026, 5, 10)
    assert ctx.refund_eta_date == date(2026, 5, 24)
    assert ctx.prior_case_id == "CASE-2026-0428"


def test_provider_returns_none_for_unknown_order() -> None:
    reset_default_order_context_provider()
    provider = get_default_order_context_provider()
    result = asyncio.run(provider.get_order_context("ORD-XYZ-999"))
    assert result is None


def test_mock_order_context_provider_delegates_to_csv() -> None:
    """Backward-compat: a `MockOrderContextProvider()` ugyanazt adja vissza."""
    provider = MockOrderContextProvider()
    result = asyncio.run(provider.get_order_context("ORD-CUST-001"))
    assert isinstance(result, OrderContext)
    assert result.order_id == "ORD-CUST-001"


def test_csv_parser_skips_comments_and_blank_lines(tmp_path: Path) -> None:
    """A `#` kezdetű és üres sorokat a parser kihagyja."""
    csv_text = dedent(
        """
        # ez egy megjegyzés
        # még egy

        order_id,purchase_date,extended_warranty_active,sold_grade,sold_battery_threshold,accessories_in_order,return_status,payment_method,delivery_date,courier,tracking_number,tracking_status,estimated_delivery_date,return_initiated_date,return_received_date,original_complaint_type,refund_initiated_date,refund_eta_date,prior_case_id
        # üzleti komment a sorok között
        ORD-TST-A,2026-04-01,true,Good,0.85,charger|cable,,bankkártya,2026-04-05,DPD,X1,delivered,2026-04-05,,,,,,
        """
    ).strip()
    path = tmp_path / "tiny.csv"
    path.write_text(csv_text, encoding="utf-8")

    provider = CsvOrderContextProvider(path)
    assert set(provider.orders.keys()) == {"ORD-TST-A"}
    ctx = provider.orders["ORD-TST-A"]
    assert ctx.purchase_date == date(2026, 4, 1)
    assert ctx.extended_warranty_active is True
    assert ctx.accessories_in_order == ["charger", "cable"]


def test_csv_parser_pipe_list_handles_extra_whitespace(tmp_path: Path) -> None:
    csv_text = dedent(
        """
        order_id,purchase_date,extended_warranty_active,sold_grade,sold_battery_threshold,accessories_in_order,return_status,payment_method,delivery_date,courier,tracking_number,tracking_status,estimated_delivery_date,return_initiated_date,return_received_date,original_complaint_type,refund_initiated_date,refund_eta_date,prior_case_id
        ORD-TST-B,,,,, charger | cable | case ,,,,,,,,,,,,,
        """
    ).strip()
    path = tmp_path / "ws.csv"
    path.write_text(csv_text, encoding="utf-8")

    provider = CsvOrderContextProvider(path)
    ctx = provider.orders["ORD-TST-B"]
    assert ctx.accessories_in_order == ["charger", "cable", "case"]


def test_csv_parser_rejects_invalid_bool(tmp_path: Path) -> None:
    csv_text = dedent(
        """
        order_id,purchase_date,extended_warranty_active,sold_grade,sold_battery_threshold,accessories_in_order,return_status,payment_method,delivery_date,courier,tracking_number,tracking_status,estimated_delivery_date,return_initiated_date,return_received_date,original_complaint_type,refund_initiated_date,refund_eta_date,prior_case_id
        ORD-TST-C,,YES,,,,,,,,,,,,,,,,
        """
    ).strip()
    path = tmp_path / "bad.csv"
    path.write_text(csv_text, encoding="utf-8")

    provider = CsvOrderContextProvider(path)
    with pytest.raises(ValueError, match="boolean"):
        _ = provider.orders


def test_reload_picks_up_changes(tmp_path: Path) -> None:
    initial_csv = dedent(
        """
        order_id,purchase_date,extended_warranty_active,sold_grade,sold_battery_threshold,accessories_in_order,return_status,payment_method,delivery_date,courier,tracking_number,tracking_status,estimated_delivery_date,return_initiated_date,return_received_date,original_complaint_type,refund_initiated_date,refund_eta_date,prior_case_id
        ORD-TST-D,,,,,cable,,,,,,,,,,,,,
        """
    ).strip()
    path = tmp_path / "reload.csv"
    path.write_text(initial_csv, encoding="utf-8")

    provider = CsvOrderContextProvider(path)
    assert "ORD-TST-D" in provider.orders
    assert "ORD-TST-E" not in provider.orders

    updated_csv = dedent(
        """
        order_id,purchase_date,extended_warranty_active,sold_grade,sold_battery_threshold,accessories_in_order,return_status,payment_method,delivery_date,courier,tracking_number,tracking_status,estimated_delivery_date,return_initiated_date,return_received_date,original_complaint_type,refund_initiated_date,refund_eta_date,prior_case_id
        ORD-TST-D,,,,,cable,,,,,,,,,,,,,
        ORD-TST-E,,true,,,charger,,,,,,,,,,,,,
        """
    ).strip()
    path.write_text(updated_csv, encoding="utf-8")
    provider.reload()
    assert "ORD-TST-E" in provider.orders
    assert provider.orders["ORD-TST-E"].extended_warranty_active is True

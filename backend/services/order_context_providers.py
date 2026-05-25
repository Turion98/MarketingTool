from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

from services.order_context import OrderContext


MOCK_ORDERS: dict[str, OrderContext] = {
    "ORD-DEL-001": OrderContext(
        order_id="ORD-DEL-001",
        purchase_date=date(2026, 4, 20),
        tracking_number="DPD123456789",
        courier="DPD",
        tracking_status="delivered",
        delivery_date=date(2026, 4, 23),
        estimated_delivery_date=date(2026, 4, 23),
    ),
    "ORD-DEL-002": OrderContext(
        order_id="ORD-DEL-002",
        purchase_date=date(2026, 4, 28),
        tracking_number="GLS987654321",
        courier="GLS",
        tracking_status="delivered",
        delivery_date=date(2026, 5, 2),
        estimated_delivery_date=date(2026, 5, 2),
    ),
    "ORD-DEL-003": OrderContext(
        order_id="ORD-DEL-003",
        purchase_date=date(2026, 4, 25),
        tracking_number="DHL555444333",
        courier="DHL",
        tracking_status="in_transit",
        estimated_delivery_date=date(2026, 4, 30),
    ),
    "ORD-DEL-004": OrderContext(
        order_id="ORD-DEL-004",
        purchase_date=date(2026, 5, 1),
        tracking_number="PostaNL111222",
        courier="PostaNL",
        tracking_status="delivered",
        delivery_date=date(2026, 5, 8),
        estimated_delivery_date=date(2026, 5, 6),
        extended_warranty_active=False,
    ),
    "ORD-RET-001": OrderContext(
        order_id="ORD-RET-001",
        purchase_date=date(2026, 4, 25),
        extended_warranty_active=False,
        sold_grade="Excellent",
    ),
    "ORD-RET-002": OrderContext(
        order_id="ORD-RET-002",
        purchase_date=date(2026, 3, 1),
        extended_warranty_active=True,
        sold_grade="Very Good",
    ),
    "ORD-BAT-001": OrderContext(
        order_id="ORD-BAT-001",
        purchase_date=date(2026, 4, 1),
        extended_warranty_active=False,
        sold_battery_threshold=0.86,
    ),
    "ORD-BAT-002": OrderContext(
        order_id="ORD-BAT-002",
        purchase_date=date(2026, 4, 1),
        extended_warranty_active=True,
        sold_battery_threshold=0.95,
    ),
    "ORD-ACC-001": OrderContext(
        order_id="ORD-ACC-001",
        purchase_date=date(2026, 5, 1),
        accessories_in_order=["charger", "cable", "case"],
    ),
    "ORD-ACC-002": OrderContext(
        order_id="ORD-ACC-002",
        purchase_date=date(2026, 5, 1),
        accessories_in_order=["cable"],
    ),
    "ORD-PAY-001": OrderContext(
        order_id="ORD-PAY-001",
        purchase_date=date(2026, 4, 10),
        return_status="accepted",
        payment_method="bankkártya",
    ),
    "ORD-PAY-002": OrderContext(
        order_id="ORD-PAY-002",
        purchase_date=date(2026, 4, 10),
        return_status="pending",
        payment_method="PayPal",
    ),
}


class OrderContextProvider(ABC):
    @abstractmethod
    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        ...


class MockOrderContextProvider(OrderContextProvider):
    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        return MOCK_ORDERS.get(order_id)

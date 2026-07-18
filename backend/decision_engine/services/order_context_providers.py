"""OrderContext provider réteg — külső adathordozós (CSV) backing store.

A `MOCK_ORDERS` korábban hard-coded Python dict volt; mostantól a single source
of truth a `backend/data/mock_orders.csv` fájl. A `CsvOrderContextProvider`
betölti, parsolja és memóriában cache-eli az 5 rendelési adatlapot.

Backward-compat: a `MockOrderContextProvider` és a `MOCK_ORDERS` névcím
továbbra is létezik, de a CSV provider köré szervezve (delegáció).
"""

from __future__ import annotations

import csv
from abc import ABC, abstractmethod
from datetime import date as date_type
from pathlib import Path
from typing import Iterable, Optional

from decision_engine.services.order_context import OrderContext


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MOCK_ORDERS_CSV = BACKEND_ROOT / "data" / "mock_orders.csv"

# Pipe-szeparált lista oszlopok — a CSV-ben "charger|cable|case" formátum.
_LIST_FIELDS: frozenset[str] = frozenset({"accessories_in_order"})

# ISO 8601 dátum oszlopok — `YYYY-MM-DD` (üres = None).
_DATE_FIELDS: frozenset[str] = frozenset(
    {
        "purchase_date",
        "delivery_date",
        "estimated_delivery_date",
        "return_initiated_date",
        "return_received_date",
        "refund_initiated_date",
        "refund_eta_date",
    }
)

# Lowercase "true" / "false" → bool; üres string = None.
_BOOL_FIELDS: frozenset[str] = frozenset({"extended_warranty_active"})

# Float oszlopok — üres = None.
_FLOAT_FIELDS: frozenset[str] = frozenset({"sold_battery_threshold"})


class OrderContextProvider(ABC):
    @abstractmethod
    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        ...


def _coerce_cell(field: str, raw: str) -> object:
    """CSV cella érték → OrderContext-kompatibilis Python érték.

    Üres string → `None`. Lista mezők pipe-szeparált tagok listája.
    """
    value = raw.strip() if raw is not None else ""
    if value == "":
        return None
    if field in _LIST_FIELDS:
        return [item.strip() for item in value.split("|") if item.strip()]
    if field in _DATE_FIELDS:
        return date_type.fromisoformat(value)
    if field in _BOOL_FIELDS:
        lowered = value.lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        raise ValueError(
            f"Invalid boolean value {raw!r} for field {field!r} "
            "(expected lowercase 'true' or 'false')"
        )
    if field in _FLOAT_FIELDS:
        return float(value)
    return value


def _iter_data_rows(lines: Iterable[str]) -> Iterable[str]:
    """Megjegyzés (`#`) és üres sorok kiszűrése — minden mást átenged a csv-nek."""
    for line in lines:
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            continue
        yield line


def _parse_csv_to_orders(csv_path: Path) -> dict[str, OrderContext]:
    text = csv_path.read_text(encoding="utf-8")
    raw_lines = text.splitlines()
    reader = csv.DictReader(_iter_data_rows(raw_lines))
    if reader.fieldnames is None:
        raise ValueError(f"mock_orders CSV missing header row: {csv_path}")
    out: dict[str, OrderContext] = {}
    for row in reader:
        coerced: dict[str, object] = {}
        for field, raw in row.items():
            if field is None:
                continue
            coerced[field] = _coerce_cell(field, raw if raw is not None else "")
        order_id = coerced.get("order_id")
        if not isinstance(order_id, str) or not order_id:
            raise ValueError(
                f"mock_orders CSV row missing order_id: {row!r} in {csv_path}"
            )
        out[order_id] = OrderContext(**coerced)  # type: ignore[arg-type]
    return out


class CsvOrderContextProvider(OrderContextProvider):
    """CSV alapú order context provider (külső adathordozó single source of truth).

    A fájl egyszer betöltődik az első hozzáférésnél (lazy init); a `reload()`
    metódus kézzel újratölti a cache-t (dev élmény: ha kézzel szerkeszted a CSV-t,
    nem kell a szervert újraindítani — csak hívd a reload-ot).
    """

    def __init__(self, csv_path: Path = DEFAULT_MOCK_ORDERS_CSV) -> None:
        self._csv_path: Path = Path(csv_path)
        self._cache: Optional[dict[str, OrderContext]] = None

    @property
    def csv_path(self) -> Path:
        return self._csv_path

    @property
    def orders(self) -> dict[str, OrderContext]:
        if self._cache is None:
            self._cache = _parse_csv_to_orders(self._csv_path)
        return self._cache

    def reload(self) -> None:
        self._cache = _parse_csv_to_orders(self._csv_path)

    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        return self.orders.get(order_id)


_DEFAULT_PROVIDER: Optional[CsvOrderContextProvider] = None


def get_default_order_context_provider() -> CsvOrderContextProvider:
    """Module-szintű singleton — a router és a tesztek innen kérik a provider-t.

    Lazy init: csak az első hívásnál olvassa be a CSV-t.
    """
    global _DEFAULT_PROVIDER
    if _DEFAULT_PROVIDER is None:
        _DEFAULT_PROVIDER = CsvOrderContextProvider(DEFAULT_MOCK_ORDERS_CSV)
    return _DEFAULT_PROVIDER


def reset_default_order_context_provider() -> None:
    """Tesztekhez: singleton ürítése (új CSV path vagy fixture után)."""
    global _DEFAULT_PROVIDER
    _DEFAULT_PROVIDER = None


class MockOrderContextProvider(OrderContextProvider):
    """Backward-compat shim — a default CSV provider mögé delegálja.

    A korábbi router és tesztek `MockOrderContextProvider()` példányosítást
    használnak; ezek mostantól is működnek, csak a CSV az adatforrás.
    """

    def __init__(self, csv_path: Path = DEFAULT_MOCK_ORDERS_CSV) -> None:
        self._delegate = CsvOrderContextProvider(csv_path)

    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        return await self._delegate.get_order_context(order_id)


class _LazyMockOrdersProxy:
    """`MOCK_ORDERS` backward-compat: dict-szerű API a default CSV provider felett.

    A korábbi `from decision_engine.services.order_context_providers import MOCK_ORDERS` és
    `MOCK_ORDERS["ORD-..."]` hozzáférések továbbra is működnek; a CSV csak
    az első indexelésnél töltődik be.
    """

    def _orders(self) -> dict[str, OrderContext]:
        return get_default_order_context_provider().orders

    def __getitem__(self, key: str) -> OrderContext:
        return self._orders()[key]

    def __contains__(self, key: object) -> bool:
        return key in self._orders()

    def __iter__(self):
        return iter(self._orders())

    def __len__(self) -> int:
        return len(self._orders())

    def keys(self):
        return self._orders().keys()

    def values(self):
        return self._orders().values()

    def items(self):
        return self._orders().items()

    def get(
        self, key: str, default: Optional[OrderContext] = None
    ) -> Optional[OrderContext]:
        return self._orders().get(key, default)

    def __repr__(self) -> str:
        try:
            keys = list(self._orders().keys())
        except FileNotFoundError:
            return "<MOCK_ORDERS (CSV not yet loaded)>"
        return f"<MOCK_ORDERS keys={keys}>"


MOCK_ORDERS: _LazyMockOrdersProxy = _LazyMockOrdersProxy()

"""resolve_end_page_content placeholder substitution tesztek.

A story JSON end node-ja `context_fields` listával jelzi, hogy a `content` mezőben
található `{field}` placeholderek behelyettesítendők az OrderContext aktuális értékeivel.
A backend engine-szintű feature — bármely jövőbeli end node használhatja.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from services.order_context import OrderContext
from services.story_runtime import resolve_end_page_content

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


def _load_story_pages() -> dict:
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    return story["pages"]


def test_resolve_end_page_returns_static_content_without_context_fields():
    pages = {
        "static-end": {
            "id": "static-end",
            "type": "end",
            "content": "Fix szöveg, nincs placeholder.",
        }
    }
    assert (
        resolve_end_page_content(pages, "static-end")
        == "Fix szöveg, nincs placeholder."
    )


def test_resolve_end_page_ignores_placeholders_without_context_fields():
    """Ha az end node-on nincs `context_fields` lista, a `{field}` minták érintetlenek maradnak."""
    pages = {
        "no-list": {
            "id": "no-list",
            "type": "end",
            "content": "Visszatérítés: {refund_amount}",
        }
    }
    ctx = OrderContext(order_id="X", refund_amount=100.0)
    result = resolve_end_page_content(pages, "no-list", order_context=ctx)
    assert result == "Visszatérítés: {refund_amount}"


def test_resolve_end_page_substitutes_listed_fields_only():
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "ETA: {refund_eta_date}, összeg: {refund_amount}, nem listázott: {prior_case_id}",
            "context_fields": ["refund_eta_date", "refund_amount"],
        }
    }
    ctx = OrderContext(
        order_id="X",
        refund_eta_date=date(2026, 5, 24),
        refund_amount=249.0,
        prior_case_id="CASE-2026-0428",
    )
    result = resolve_end_page_content(pages, "tpl", order_context=ctx)
    assert "2026-05-24" in result
    assert "249" in result
    assert "{prior_case_id}" in result, "Nem listázott placeholder maradjon érintetlen"
    assert "CASE-2026-0428" not in result


def test_resolve_end_page_missing_value_renders_ismeretlen():
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "ETA: {refund_eta_date}",
            "context_fields": ["refund_eta_date"],
        }
    }
    ctx = OrderContext(order_id="X")
    result = resolve_end_page_content(pages, "tpl", order_context=ctx)
    assert "ismeretlen" in result


def test_resolve_end_page_no_context_returns_template_literally():
    """OrderContext = None → a placeholderek érintetlenek maradnak (a step már nem küldte el az adatot)."""
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "Összeg: {refund_amount} {refund_currency}",
            "context_fields": ["refund_amount", "refund_currency"],
        }
    }
    result = resolve_end_page_content(pages, "tpl", order_context=None)
    assert result == "Összeg: {refund_amount} {refund_currency}"


def test_resolve_end_page_formats_float_without_trailing_zeros():
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "Fizetés: {refund_amount}",
            "context_fields": ["refund_amount"],
        }
    }
    whole = OrderContext(order_id="X", refund_amount=200.0)
    assert "200" in resolve_end_page_content(pages, "tpl", order_context=whole)

    decimal = OrderContext(order_id="X", refund_amount=249.5)
    assert "249.5" in resolve_end_page_content(pages, "tpl", order_context=decimal)


def test_resolve_end_page_formats_list_with_commas():
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "Tartozékok: {accessories_in_order}",
            "context_fields": ["accessories_in_order"],
        }
    }
    ctx = OrderContext(
        order_id="X", accessories_in_order=["charger", "cable", "case"]
    )
    result = resolve_end_page_content(pages, "tpl", order_context=ctx)
    assert "charger, cable, case" in result


def test_resolve_end_page_formats_bool_human_readable():
    pages = {
        "tpl": {
            "id": "tpl",
            "type": "end",
            "content": "Extended warranty: {extended_warranty_active}",
            "context_fields": ["extended_warranty_active"],
        }
    }
    active = OrderContext(order_id="X", extended_warranty_active=True)
    assert "igen" in resolve_end_page_content(pages, "tpl", order_context=active)

    inactive = OrderContext(order_id="X", extended_warranty_active=False)
    assert "nem" in resolve_end_page_content(pages, "tpl", order_context=inactive)


# --- A STORY 4 ÚJ END PAGE-JE — szerződéses smoke tesztek ---


def test_process_refund_in_progress_renders_full_payload():
    pages = _load_story_pages()
    ctx = OrderContext(
        order_id="X",
        payment_method="bankkártya",
        refund_amount=249.0,
        refund_currency="EUR",
        refund_eta_date=date(2026, 5, 24),
    )
    result = resolve_end_page_content(
        pages, "process-refund-in-progress", order_context=ctx
    )
    assert "249" in result
    assert "EUR" in result
    assert "bankkártya" in result
    assert "2026-05-24" in result
    assert "{" not in result, "Minden placeholder behelyettesítődött"


def test_process_refund_overdue_renders_full_payload():
    pages = _load_story_pages()
    ctx = OrderContext(
        order_id="X",
        refund_amount=249.0,
        refund_currency="EUR",
        refund_eta_date=date(2026, 5, 1),
    )
    result = resolve_end_page_content(
        pages, "process-refund-overdue-escalation", order_context=ctx
    )
    assert "2026-05-01" in result
    assert "249" in result
    assert "EUR" in result
    assert "{" not in result


def test_process_refund_prior_case_renders_full_payload():
    pages = _load_story_pages()
    ctx = OrderContext(
        order_id="X",
        prior_case_id="CASE-2026-0428",
        refund_amount=249.0,
        refund_currency="EUR",
        refund_initiated_date=date(2026, 5, 10),
        refund_eta_date=date(2026, 5, 24),
    )
    result = resolve_end_page_content(
        pages, "process-refund-prior-case", order_context=ctx
    )
    assert "CASE-2026-0428" in result
    assert "249" in result
    assert "2026-05-10" in result
    assert "2026-05-24" in result
    assert "{" not in result


def test_process_refund_return_pending_renders_full_payload():
    pages = _load_story_pages()
    ctx = OrderContext(
        order_id="X",
        return_initiated_date=date(2026, 4, 30),
        refund_amount=249.0,
        refund_currency="EUR",
        payment_method="bankkártya",
    )
    result = resolve_end_page_content(
        pages, "process-refund-return-pending", order_context=ctx
    )
    assert "2026-04-30" in result
    assert "249" in result
    assert "bankkártya" in result
    assert "{" not in result

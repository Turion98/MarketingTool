"""
TicketBuilder — story JSON `end` node `ticket` blokkjából, OrderContext-ből és
`satisfiedConditions` listából Pydantic `Ticket` objektumot épít.

A builder tartalom-független: nem tud üzleti kategóriákról, csak a template-et
és a kontextust kombinálja a `ticket_contracts.py` séma szerint.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from services.order_context import OrderContext
from services.story_runtime import _substitute_context_placeholders
from services.ticket_contracts import (
    EvidenceItem,
    Ticket,
    TicketTemplate,
)


TicketCache = dict[tuple[str, str], Ticket]


def _coerce_template(raw: object) -> Optional[TicketTemplate]:
    if not isinstance(raw, dict):
        return None
    return TicketTemplate.model_validate(raw)


def _resolve_summary(
    template: TicketTemplate,
    order_context: OrderContext | None,
) -> Optional[str]:
    """A `summary_template` placeholder-feloldása ugyanazzal a logikával
    mint a `resolve_end_page_content` — `data_fields` a whitelist."""
    raw = template.summary_template
    if not isinstance(raw, str) or not raw:
        return None
    if not template.data_fields or order_context is None:
        return raw
    return _substitute_context_placeholders(raw, template.data_fields, order_context)


def _build_evidence(
    evidence_conditions: Iterable[str],
    satisfied_conditions: Iterable[str] | None,
    condition_labels: dict[str, str] | None,
) -> list[EvidenceItem]:
    """Csak az `evidence_conditions ∩ satisfied_conditions` jelenik meg,
    humanizálva a `meta.condition_labels` alapján (fallback: condition ID)."""
    satisfied_set = {c for c in (satisfied_conditions or []) if isinstance(c, str) and c}
    labels = condition_labels if isinstance(condition_labels, dict) else {}

    out: list[EvidenceItem] = []
    seen: set[str] = set()
    for cid in evidence_conditions:
        if not isinstance(cid, str) or not cid:
            continue
        if cid in seen:
            continue
        if cid not in satisfied_set:
            continue
        seen.add(cid)
        raw_label = labels.get(cid)
        label = raw_label if isinstance(raw_label, str) and raw_label.strip() else cid
        out.append(EvidenceItem(id=cid, label=label))
    return out


def _order_snapshot(order_context: OrderContext | None) -> dict[str, Any]:
    if order_context is None:
        return {}
    dump_fn = getattr(order_context, "model_dump", None)
    if not callable(dump_fn):
        return {}
    try:
        dumped = dump_fn(mode="json") or {}
    except TypeError:
        try:
            dumped = dump_fn() or {}
        except Exception:
            return {}
    except Exception:
        return {}
    return dumped if isinstance(dumped, dict) else {}


def _story_id(story: dict) -> str:
    raw_top = story.get("storyId") if isinstance(story, dict) else None
    if isinstance(raw_top, str) and raw_top.strip():
        return raw_top.strip()
    meta = story.get("meta") if isinstance(story, dict) else None
    if isinstance(meta, dict):
        raw_meta_id = meta.get("id")
        if isinstance(raw_meta_id, str) and raw_meta_id.strip():
            return raw_meta_id.strip()
    return "unknown-story"


def _condition_labels(story: dict) -> dict[str, str]:
    meta = story.get("meta") if isinstance(story, dict) else None
    if not isinstance(meta, dict):
        return {}
    raw = meta.get("condition_labels")
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, str)}


def build_ticket(
    *,
    story: dict,
    end_page_id: str,
    session_id: str,
    customer_message: str,
    order_context: OrderContext | None = None,
    satisfied_conditions: list[str] | None = None,
    run_id: str | None = None,
    now: datetime | None = None,
    existing_tickets: TicketCache | None = None,
) -> Optional[Ticket]:
    """End node `ticket` blokkjából + OrderContext-ből + satisfied conditions-ből
    `Ticket` objektum.

    `None`-t ad vissza ha:
    - a story / pages / end node hiányzik, vagy
    - az end node-nak nincs `ticket` blokkja.

    Idempotencia: ha `existing_tickets[(session_id, end_page_id)]` létezik,
    azt adja vissza új építés helyett.
    """
    if not isinstance(story, dict) or not isinstance(end_page_id, str) or not end_page_id.strip():
        return None
    pages = story.get("pages")
    if not isinstance(pages, dict):
        return None

    page = pages.get(end_page_id.strip())
    if not isinstance(page, dict) or page.get("type") != "end":
        return None

    template = _coerce_template(page.get("ticket"))
    if template is None:
        return None

    cache_key = (session_id, end_page_id.strip())
    if existing_tickets is not None and cache_key in existing_tickets:
        return existing_tickets[cache_key]

    created_at = now or datetime.now(timezone.utc)
    ticket_id = Ticket.generate_id(created_at)

    summary = _resolve_summary(template, order_context)
    evidence = _build_evidence(
        template.evidence_conditions,
        satisfied_conditions,
        _condition_labels(story),
    )
    sla_due_at: Optional[datetime] = None
    if isinstance(template.sla_hours, int) and template.sla_hours > 0:
        sla_due_at = created_at + timedelta(hours=template.sla_hours)

    order_id = order_context.order_id if order_context is not None else None

    ticket = Ticket(
        ticket_id=ticket_id,
        created_at=created_at,
        story_id=_story_id(story),
        session_id=session_id,
        run_id=run_id,
        order_id=order_id,
        end_page_id=end_page_id.strip(),
        category=template.category,
        priority=template.priority,
        routing_target=template.routing_target,
        tags=list(template.tags),
        customer_message=customer_message,
        summary=summary,
        order_snapshot=_order_snapshot(order_context),
        evidence=evidence,
        customer_actions_required=list(template.customer_actions_required),
        attachments=[],
        sla_due_at=sla_due_at,
        external_refs={},
    )

    if existing_tickets is not None:
        existing_tickets[cache_key] = ticket

    return ticket

"""
Ticket integration — a builder + sink bekötése a futó kérés-feldolgozásba.

Tartalmaz egy process-szintű in-memory session cache-t, hogy a builder
idempotencia (`(session_id, end_page_id)` kulcs) több turn-ön keresztül is
érvényesüljön. A cache kérés-független (a backend egyébként stateless),
de a folyamatban lévő beszélgetés tartama alatt egy ticket csak egyszer
épül és csak egyszer kerül a sink-re.

Future swap: Redis / DB session store — az API változatlan marad.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from services.order_context import OrderContext
from services.ticket_builder import build_ticket
from services.ticket_contracts import Ticket, TicketSink, TicketSubmissionResult
from services.ticket_sinks import JsonlFileTicketSink

logger = logging.getLogger(__name__)


# session_id → { (session_id, end_page_id) → Ticket }
_SESSION_TICKETS: dict[str, dict[tuple[str, str], Ticket]] = {}

_DEFAULT_SINK: TicketSink = JsonlFileTicketSink()


def get_session_ticket_cache(session_id: str) -> dict[tuple[str, str], Ticket]:
    """Idempotencia cache az adott session-höz (process-szintű in-memory)."""
    sid = session_id if isinstance(session_id, str) else ""
    if sid not in _SESSION_TICKETS:
        _SESSION_TICKETS[sid] = {}
    return _SESSION_TICKETS[sid]


def reset_session_ticket_cache(session_id: Optional[str] = None) -> None:
    """Tesztekhez / explicit reset-hez. `None` → minden session törlése."""
    if session_id is None:
        _SESSION_TICKETS.clear()
        return
    _SESSION_TICKETS.pop(session_id, None)


def set_default_sink(sink: TicketSink) -> None:
    """Tesztekhez: a default sink lecserélhető (pl. tmp_path-ba író példányra)."""
    global _DEFAULT_SINK
    _DEFAULT_SINK = sink


def get_default_sink() -> TicketSink:
    return _DEFAULT_SINK


def emit_ticket_for_end_page(
    *,
    story: dict,
    end_page_id: str,
    session_id: str,
    customer_message: str,
    order_context: OrderContext | None = None,
    satisfied_conditions: list[str] | None = None,
    run_id: Optional[str] = None,
    sink: Optional[TicketSink] = None,
    now: Optional[datetime] = None,
) -> Optional[Ticket]:
    """End node lezáráskor: ticket megépítése + sink-re küldése + cache-elés.

    `None`-t ad vissza, ha az end node-on nincs `ticket` blokk.

    Idempotencia: ha a `(session_id, end_page_id)` kulcs már létezik a session
    cache-ben, a meglévő ticket-et adja vissza, és NEM submitál újra.
    """
    cache = get_session_ticket_cache(session_id)
    cache_key = (session_id, end_page_id)
    was_cached = cache_key in cache

    ticket = build_ticket(
        story=story,
        end_page_id=end_page_id,
        session_id=session_id,
        customer_message=customer_message,
        order_context=order_context,
        satisfied_conditions=satisfied_conditions,
        run_id=run_id,
        now=now,
        existing_tickets=cache,
    )
    if ticket is None:
        return None

    if was_cached:
        return ticket

    active_sink = sink if sink is not None else _DEFAULT_SINK
    try:
        result: TicketSubmissionResult = active_sink.submit(ticket)
        if not result.success:
            logger.warning(
                "Ticket submit nem volt sikeres: ticket=%s sink=%s err=%s",
                ticket.ticket_id,
                result.sink_type,
                result.error,
            )
    except Exception as exc:  # robosztusság: a route-flow ne dőljön el sink hibán
        logger.exception("Ticket submit kivétel: %s", exc)

    return ticket

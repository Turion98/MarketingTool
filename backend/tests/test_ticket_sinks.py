"""JsonlFileTicketSink tesztek — szinkron."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from services.ticket_contracts import Ticket, TicketTemplate
from services.ticket_sinks import JsonlFileTicketSink, LoggingTicketSink


def _make_ticket(**kwargs) -> Ticket:
    defaults = dict(
        ticket_id="TCK-2026-01-01-ABCDEF",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        story_id="test-story",
        session_id="sess-001",
        end_page_id="delivery-damage-claim",
        category="delivery_damage",
        priority="normal",
        routing_target="courier_claims_team",
        customer_message="Sérült csomag rögzítve.",
    )
    defaults.update(kwargs)
    return Ticket(**defaults)


def test_write_creates_jsonl(tmp_path):
    sink = JsonlFileTicketSink(base_dir=tmp_path)
    ticket = _make_ticket()
    result = sink.submit(ticket)
    assert result.success
    assert result.sink_type == "jsonl_file"
    files = list(tmp_path.glob("**/*.jsonl"))
    assert len(files) == 1
    data = json.loads(files[0].read_text(encoding="utf-8").strip())
    assert data["ticket_id"] == ticket.ticket_id
    assert data["story_id"] == ticket.story_id
    assert data["end_page_id"] == ticket.end_page_id


def test_idempotent_write(tmp_path):
    sink = JsonlFileTicketSink(base_dir=tmp_path)
    ticket = _make_ticket()
    sink.submit(ticket)
    sink.submit(ticket)
    files = list(tmp_path.glob("**/*.jsonl"))
    lines = [l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 1


def test_different_sessions_both_written(tmp_path):
    sink = JsonlFileTicketSink(base_dir=tmp_path)
    t1 = _make_ticket(session_id="sess-001")
    t2 = _make_ticket(session_id="sess-002", ticket_id="TCK-2026-01-01-BBBBBB")
    sink.submit(t1)
    sink.submit(t2)
    files = list(tmp_path.glob("**/*.jsonl"))
    lines = [l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 2


def test_different_end_pages_both_written(tmp_path):
    sink = JsonlFileTicketSink(base_dir=tmp_path)
    t1 = _make_ticket(end_page_id="delivery-damage-claim")
    t2 = _make_ticket(
        end_page_id="process-refund",
        ticket_id="TCK-2026-01-01-CCCCCC",
    )
    sink.submit(t1)
    sink.submit(t2)
    files = list(tmp_path.glob("**/*.jsonl"))
    lines = [l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 2


def test_per_story_directory_layout(tmp_path):
    sink = JsonlFileTicketSink(base_dir=tmp_path)
    t1 = _make_ticket(story_id="story-a")
    t2 = _make_ticket(story_id="story-b", ticket_id="TCK-2026-01-01-DDDDDD")
    sink.submit(t1)
    sink.submit(t2)
    assert (tmp_path / "story-a").is_dir()
    assert (tmp_path / "story-b").is_dir()
    story_a_files = list((tmp_path / "story-a").glob("*.jsonl"))
    story_b_files = list((tmp_path / "story-b").glob("*.jsonl"))
    assert len(story_a_files) == 1
    assert len(story_b_files) == 1


def test_logging_sink_returns_success():
    sink = LoggingTicketSink()
    ticket = _make_ticket()
    result = sink.submit(ticket)
    assert result.success
    assert result.sink_type == "logging"


def test_ticket_new_factory_aligns_id_and_created_at():
    """Ticket.new(): a ticket_id dátuma == created_at dátuma."""
    t = Ticket.new(
        story_id="s",
        session_id="sess",
        end_page_id="e",
        category="c",
        priority="normal",
        routing_target="r",
        customer_message="m",
    )
    assert t.ticket_id.startswith(f"TCK-{t.created_at.strftime('%Y-%m-%d')}-")
    assert t.created_at.tzinfo is not None


def test_ticket_template_forbids_extra_keys():
    """TicketTemplate elveti az ismeretlen mezőt (pl. story JSON elgépelést)."""
    with pytest.raises(Exception):
        TicketTemplate(
            category="x",
            priority="normal",
            routing_target="y",
            priorty="oops",  # type: ignore[call-arg]
        )


def test_ticket_template_accepts_minimal_valid():
    tmpl = TicketTemplate(
        category="return_standard",
        routing_target="returns_warehouse",
    )
    assert tmpl.priority == "normal"
    assert tmpl.data_fields == []
    assert tmpl.evidence_conditions == []

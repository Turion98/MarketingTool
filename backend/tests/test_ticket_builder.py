"""TicketBuilder tesztek — story `end` node ticket blokkjából Ticket objektum építése.

A builder a story JSON ticket blokkját, az OrderContext-et és a satisfiedConditions
listát kombinálja össze egy Ticket-té, idempotens (session_id, end_page_id) kulccsal.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from services.order_context import OrderContext
from services.ticket_builder import build_ticket
from services.ticket_contracts import Ticket

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


def _load_story() -> dict:
    return json.loads(STORY_PATH.read_text(encoding="utf-8"))


def _basic_story(**overrides) -> dict:
    """Minimal story tesztelhető pages + meta szerkezettel."""
    story = {
        "storyId": "test-story",
        "meta": {
            "condition_labels": {
                "has_order_id": "rendelési szám megadva",
                "image_provided": "kép csatolva",
                "damage_photos_provided": "sérülési fotók megérkeztek",
            },
        },
        "pages": {
            "end-with-ticket": {
                "id": "end-with-ticket",
                "type": "end",
                "content": "Köszönjük, rögzítettük.",
                "ticket": {
                    "category": "delivery_damage",
                    "priority": "high",
                    "routing_target": "courier_claims_team",
                    "sla_hours": 24,
                    "summary_template": "Sérült csomag — rendelés: {order_id}, futár: {courier}.",
                    "data_fields": ["order_id", "courier"],
                    "evidence_conditions": [
                        "has_order_id",
                        "image_provided",
                        "damage_photos_provided",
                    ],
                    "customer_actions_required": ["await_courier_pickup"],
                    "tags": ["delivery", "damage"],
                },
            },
            "end-without-ticket": {
                "id": "end-without-ticket",
                "type": "end",
                "content": "Csak content.",
            },
            "not-an-end": {
                "id": "not-an-end",
                "type": "ai",
                "fallback_message": "x",
            },
        },
    }
    for key, value in overrides.items():
        story[key] = value
    return story


def _ctx() -> OrderContext:
    return OrderContext(
        order_id="ORD-CUST-001",
        purchase_date=date(2026, 1, 15),
        courier="GLS",
        payment_method="bankkártya",
    )


def test_returns_none_when_no_ticket_block():
    story = _basic_story()
    result = build_ticket(
        story=story,
        end_page_id="end-without-ticket",
        session_id="sess-001",
        customer_message="m",
    )
    assert result is None


def test_returns_none_when_end_page_missing():
    story = _basic_story()
    result = build_ticket(
        story=story,
        end_page_id="does-not-exist",
        session_id="sess-001",
        customer_message="m",
    )
    assert result is None


def test_returns_none_when_page_is_not_end_type():
    story = _basic_story()
    result = build_ticket(
        story=story,
        end_page_id="not-an-end",
        session_id="sess-001",
        customer_message="m",
    )
    assert result is None


def test_returns_none_for_invalid_inputs():
    assert build_ticket(
        story={},
        end_page_id="any",
        session_id="s",
        customer_message="m",
    ) is None
    assert build_ticket(
        story=_basic_story(),
        end_page_id="",
        session_id="s",
        customer_message="m",
    ) is None


def test_builds_basic_ticket_from_template():
    story = _basic_story()
    ctx = _ctx()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="sess-001",
        customer_message="Megérkezett, de sérült.",
        order_context=ctx,
        satisfied_conditions=["has_order_id", "image_provided"],
        run_id="run-1",
    )
    assert ticket is not None
    assert ticket.story_id == "test-story"
    assert ticket.session_id == "sess-001"
    assert ticket.end_page_id == "end-with-ticket"
    assert ticket.run_id == "run-1"
    assert ticket.order_id == "ORD-CUST-001"
    assert ticket.category == "delivery_damage"
    assert ticket.priority == "high"
    assert ticket.routing_target == "courier_claims_team"
    assert ticket.customer_message == "Megérkezett, de sérült."
    assert ticket.tags == ["delivery", "damage"]
    assert ticket.customer_actions_required == ["await_courier_pickup"]
    assert ticket.attachments == []
    assert ticket.external_refs == {}


def test_summary_template_substitutes_order_fields():
    story = _basic_story()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=_ctx(),
    )
    assert ticket is not None
    assert ticket.summary is not None
    assert "ORD-CUST-001" in ticket.summary
    assert "GLS" in ticket.summary
    assert "{order_id}" not in ticket.summary
    assert "{courier}" not in ticket.summary


def test_summary_template_unknown_field_renders_ismeretlen():
    """OrderContext-ből hiányzó mező 'ismeretlen' lesz a story_runtime mintára."""
    story = _basic_story()
    ctx = OrderContext(order_id="ORD-CUST-002")  # courier hiányzik
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=ctx,
    )
    assert ticket is not None
    assert ticket.summary is not None
    assert "ORD-CUST-002" in ticket.summary
    assert "ismeretlen" in ticket.summary


def test_summary_template_no_data_fields_returns_raw():
    """`data_fields` nélkül a `summary_template` érintetlen marad."""
    story = _basic_story()
    story["pages"]["end-with-ticket"]["ticket"]["data_fields"] = []
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=_ctx(),
    )
    assert ticket is not None
    assert ticket.summary == "Sérült csomag — rendelés: {order_id}, futár: {courier}."


def test_summary_none_when_template_missing():
    story = _basic_story()
    story["pages"]["end-with-ticket"]["ticket"].pop("summary_template", None)
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=_ctx(),
    )
    assert ticket is not None
    assert ticket.summary is None


def test_evidence_includes_only_satisfied_subset():
    story = _basic_story()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=_ctx(),
        satisfied_conditions=["has_order_id", "image_provided", "irrelevant"],
    )
    assert ticket is not None
    evidence_ids = [e.id for e in ticket.evidence]
    assert "has_order_id" in evidence_ids
    assert "image_provided" in evidence_ids
    # damage_photos_provided szerepel evidence_conditions-ben, de nincs a satisfied-ben
    assert "damage_photos_provided" not in evidence_ids
    # irrelevant a satisfied-ben van, de nincs evidence_conditions-ben
    assert "irrelevant" not in evidence_ids


def test_evidence_uses_condition_labels_when_available():
    story = _basic_story()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        satisfied_conditions=["has_order_id"],
    )
    assert ticket is not None
    assert len(ticket.evidence) == 1
    assert ticket.evidence[0].id == "has_order_id"
    assert ticket.evidence[0].label == "rendelési szám megadva"


def test_evidence_falls_back_to_id_when_no_label():
    story = _basic_story()
    # töröljük a labelt az image_provided-hez
    story["meta"]["condition_labels"].pop("image_provided")
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        satisfied_conditions=["image_provided"],
    )
    assert ticket is not None
    assert ticket.evidence[0].id == "image_provided"
    assert ticket.evidence[0].label == "image_provided"  # fallback az ID-re


def test_evidence_empty_when_no_satisfied_conditions():
    story = _basic_story()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        satisfied_conditions=None,
    )
    assert ticket is not None
    assert ticket.evidence == []


def test_idempotency_returns_existing_ticket():
    story = _basic_story()
    cache: dict = {}
    t1 = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="sess-001",
        customer_message="első üzenet",
        order_context=_ctx(),
        existing_tickets=cache,
    )
    t2 = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="sess-001",
        customer_message="második üzenet — más",
        order_context=_ctx(),
        existing_tickets=cache,
    )
    assert t1 is not None
    assert t2 is not None
    assert t1 is t2
    assert t2.customer_message == "első üzenet"
    assert len(cache) == 1


def test_different_session_creates_new_ticket():
    story = _basic_story()
    cache: dict = {}
    t1 = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="sess-001",
        customer_message="m",
        existing_tickets=cache,
    )
    t2 = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="sess-002",
        customer_message="m",
        existing_tickets=cache,
    )
    assert t1 is not None and t2 is not None
    assert t1 is not t2
    assert len(cache) == 2


def test_sla_due_at_computed_when_sla_hours_set():
    story = _basic_story()
    fixed_now = datetime(2026, 5, 29, 8, 0, 0, tzinfo=timezone.utc)
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        now=fixed_now,
    )
    assert ticket is not None
    assert ticket.sla_due_at is not None
    assert ticket.sla_due_at == datetime(2026, 5, 30, 8, 0, 0, tzinfo=timezone.utc)


def test_sla_due_at_none_when_no_sla_hours():
    story = _basic_story()
    story["pages"]["end-with-ticket"]["ticket"].pop("sla_hours", None)
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
    )
    assert ticket is not None
    assert ticket.sla_due_at is None


def test_ticket_id_and_created_at_aligned():
    story = _basic_story()
    fixed_now = datetime(2026, 5, 29, 12, 34, 56, tzinfo=timezone.utc)
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        now=fixed_now,
    )
    assert ticket is not None
    assert ticket.created_at == fixed_now
    assert ticket.ticket_id.startswith("TCK-2026-05-29-")


def test_order_snapshot_contains_order_context_dump():
    story = _basic_story()
    ctx = _ctx()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
        order_context=ctx,
    )
    assert ticket is not None
    assert ticket.order_snapshot["order_id"] == "ORD-CUST-001"
    assert ticket.order_snapshot["courier"] == "GLS"
    assert ticket.order_snapshot["payment_method"] == "bankkártya"


def test_order_snapshot_empty_when_no_order_context():
    story = _basic_story()
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
    )
    assert ticket is not None
    assert ticket.order_snapshot == {}
    assert ticket.order_id is None


def test_story_id_falls_back_to_meta_id():
    story = _basic_story()
    story.pop("storyId")
    story["meta"]["id"] = "ai-complaint-v3"
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
    )
    assert ticket is not None
    assert ticket.story_id == "ai-complaint-v3"


def test_story_id_fallback_unknown():
    story = _basic_story()
    story.pop("storyId")
    story["meta"].pop("id", None)
    ticket = build_ticket(
        story=story,
        end_page_id="end-with-ticket",
        session_id="s",
        customer_message="m",
    )
    assert ticket is not None
    assert ticket.story_id == "unknown-story"


def test_extra_key_in_ticket_block_raises():
    """A TicketTemplate `extra=forbid` — elgépelt kulcs ne menjen át csendben."""
    story = _basic_story()
    story["pages"]["end-with-ticket"]["ticket"]["priorty"] = "oops"
    with pytest.raises(Exception):
        build_ticket(
            story=story,
            end_page_id="end-with-ticket",
            session_id="s",
            customer_message="m",
        )


# ---------------------------------------------------------------------------
# Élő story JSON-on (smoke) — F0/F1 integrációs egészségellenőrzés
# ---------------------------------------------------------------------------

def test_builds_ticket_from_live_story_delivery_damage_claim():
    story = _load_story()
    ctx = OrderContext(
        order_id="ORD-CUST-001",
        courier="DPD",
        payment_method="bankkártya",
    )
    ticket = build_ticket(
        story=story,
        end_page_id="delivery-damage-claim",
        session_id="sess-live-001",
        customer_message="A csomag sérülten érkezett.",
        order_context=ctx,
        satisfied_conditions=["has_order_id", "damage_photos_provided", "image_provided"],
    )
    assert ticket is not None
    assert isinstance(ticket, Ticket)
    assert ticket.story_id == "ai-complaint-v3"
    assert ticket.order_id == "ORD-CUST-001"
    assert ticket.category  # bármi van a template-ben, kategória legyen string
    assert ticket.routing_target


def test_live_story_process_refund_has_ticket():
    story = _load_story()
    ctx = OrderContext(order_id="ORD-CUST-007", payment_method="átutalás")
    ticket = build_ticket(
        story=story,
        end_page_id="process-refund",
        session_id="sess-live-002",
        customer_message="Visszatérítést kérek.",
        order_context=ctx,
        satisfied_conditions=["has_order_id", "payment_method_known"],
    )
    assert ticket is not None
    assert ticket.end_page_id == "process-refund"
    assert ticket.summary is not None
    assert "ORD-CUST-007" in ticket.summary
    assert "átutalás" in ticket.summary

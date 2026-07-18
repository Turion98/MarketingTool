"""Integrációs teszt: /api/ai-node/process végpont + TicketBuilder + JsonlFileTicketSink.

End node lezáráskor a válaszban megjelenik a `ticket` mező és a JSONL fájl is
megíródik. Idempotencia és no-ticket esetek is fedettek.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from decision_engine.services.ticket_integration import (
    get_default_sink,
    reset_session_ticket_cache,
    set_default_sink,
)
from decision_engine.services.ticket_sinks import JsonlFileTicketSink

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


@pytest.fixture(scope="module")
def client() -> TestClient:
    from main import app

    return TestClient(app)


@pytest.fixture
def tmp_sink(tmp_path):
    """A default sink-et lecseréljük tmp_path-be író példányra, session cache reset."""
    prev = get_default_sink()
    set_default_sink(JsonlFileTicketSink(base_dir=tmp_path))
    reset_session_ticket_cache()
    yield tmp_path
    set_default_sink(prev)
    reset_session_ticket_cache()


def _delivery_node() -> dict:
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    return story["pages"]["delivery-issue"]


def _patches_for_delivery_step(fake_process_step):
    node = _delivery_node()
    return (
        patch("decision_engine.routers.ai_node_routes.get_top_k_nodes", return_value=[node]),
        patch(
            "decision_engine.routers.ai_node_routes.match_active_node",
            return_value={
                "activeNodeId": "delivery-issue",
                "askClarification": False,
            },
        ),
        patch(
            "decision_engine.routers.ai_node_routes.process_step",
            side_effect=fake_process_step,
        ),
    )


def test_end_page_response_includes_ticket_and_writes_jsonl(
    client: TestClient,
    tmp_sink: Path,
) -> None:
    """End node lezárás → response.ticket + JSONL sor megjelenik."""
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    end_page_id = "delivery-damage-claim"
    template = story["pages"][end_page_id]["ticket"]

    def fake_process_step(**kwargs: object) -> dict:
        return {
            "satisfied": [
                "has_order_id",
                "damage_photos_provided",
                "image_provided",
            ],
            "newlySatisfied": ["damage_photos_provided"],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": end_page_id,
            "assistantMessage": "Köszönjük, rögzítettük.",
        }

    customer_msg = "A csomag sérülten érkezett."
    p1, p2, p3 = _patches_for_delivery_step(fake_process_step)
    with p1, p2, p3:
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": customer_msg,
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-int-001",
            },
        )

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"
    assert data["nextPageId"] == end_page_id
    assert "ticket" in data
    ticket = data["ticket"]
    assert ticket is not None
    assert ticket["end_page_id"] == end_page_id
    assert ticket["session_id"] == "sess-int-001"
    assert ticket["category"] == template["category"]
    assert ticket["routing_target"] == template["routing_target"]
    assert ticket["priority"] == template["priority"]
    assert ticket["customer_message"] == customer_msg
    assert ticket["ticket_id"].startswith("TCK-")

    files = list(tmp_sink.glob("**/*.jsonl"))
    assert len(files) == 1, f"Pontosan 1 JSONL fájl kellene, kapott: {files}"
    lines = [
        l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()
    ]
    assert len(lines) == 1
    persisted = json.loads(lines[0])
    assert persisted["ticket_id"] == ticket["ticket_id"]
    assert persisted["end_page_id"] == end_page_id
    assert persisted["session_id"] == "sess-int-001"


def test_idempotent_same_session_same_end_page(
    client: TestClient,
    tmp_sink: Path,
) -> None:
    """Két kérés ugyanazzal a (sessionId, end_page_id) párral → 1 ticket, 1 JSONL sor."""
    end_page_id = "delivery-damage-claim"

    def fake_process_step(**kwargs: object) -> dict:
        return {
            "satisfied": ["has_order_id"],
            "newlySatisfied": [],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": end_page_id,
            "assistantMessage": "OK",
        }

    p1, p2, p3 = _patches_for_delivery_step(fake_process_step)
    with p1, p2, p3:
        r1 = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "Sérült.",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-int-002",
            },
        )
        r2 = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "Még egyszer.",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-int-002",
            },
        )

    t1 = r1.json()["ticket"]
    t2 = r2.json()["ticket"]
    assert t1 is not None and t2 is not None
    assert t1["ticket_id"] == t2["ticket_id"]
    # az első kérésben rögzített customer_message marad — a builder cache miatt
    assert t2["customer_message"] == "Sérült."

    files = list(tmp_sink.glob("**/*.jsonl"))
    assert len(files) == 1
    lines = [
        l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()
    ]
    assert len(lines) == 1


def test_different_sessions_produce_different_tickets(
    client: TestClient,
    tmp_sink: Path,
) -> None:
    """Két különböző session → két különböző ticket, két JSONL sor (ugyanaz az end node)."""
    end_page_id = "delivery-damage-claim"

    def fake_process_step(**kwargs: object) -> dict:
        return {
            "satisfied": ["has_order_id"],
            "newlySatisfied": [],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": end_page_id,
            "assistantMessage": "OK",
        }

    p1, p2, p3 = _patches_for_delivery_step(fake_process_step)
    with p1, p2, p3:
        r1 = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "p1",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-A",
            },
        )
        r2 = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "p2",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-B",
            },
        )

    t1 = r1.json()["ticket"]
    t2 = r2.json()["ticket"]
    assert t1["ticket_id"] != t2["ticket_id"]
    assert t1["session_id"] == "sess-A"
    assert t2["session_id"] == "sess-B"

    files = list(tmp_sink.glob("**/*.jsonl"))
    assert len(files) == 1
    lines = [
        l for l in files[0].read_text(encoding="utf-8").splitlines() if l.strip()
    ]
    assert len(lines) == 2


def test_unknown_or_no_ticket_end_page_returns_null(
    client: TestClient,
    tmp_sink: Path,
) -> None:
    """Ha az end_page_id ismeretlen / nincs ticket blokk → response.ticket: None.

    Megjegyzés: a jelenlegi élő story minden type=end node-ja rendelkezik ticket
    blokkal, ezért egy nem létező nextPageId-vel teszteljük ugyanazt a builder-ágat
    (build_ticket → None ha a page hiányzik, type != end, vagy nincs ticket blokk).
    """
    target = "fake-end-without-ticket"

    def fake_process_step(**kwargs: object) -> dict:
        return {
            "satisfied": [],
            "newlySatisfied": [],
            "missing": [],
            "stepDone": True,
            "nextStepId": None,
            "nextPageId": target,
            "assistantMessage": "OK",
        }

    p1, p2, p3 = _patches_for_delivery_step(fake_process_step)
    with p1, p2, p3:
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "x",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-no-ticket",
            },
        )

    data = r.json()
    assert data["nextPageId"] == target
    assert data["ticket"] is None
    files = list(tmp_sink.glob("**/*.jsonl"))
    assert files == []


def test_clarification_response_has_ticket_null(
    client: TestClient,
    tmp_sink: Path,
) -> None:
    """Step-továbbgyűjtés (clarification) — nincs end page, nincs ticket, nincs sink-írás."""

    def fake_process_step(**kwargs: object) -> dict:
        return {
            "satisfied": ["packaging_damaged"],
            "newlySatisfied": ["packaging_damaged"],
            "missing": ["has_order_id"],
            "stepDone": False,
            "nextStepId": None,
            "assistantMessage": "Kérem a rendelési számot.",
        }

    p1, p2, p3 = _patches_for_delivery_step(fake_process_step)
    with p1, p2, p3:
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "sérült csomag",
                "satisfiedConditions": [],
                "currentStepId": None,
                "sessionId": "sess-clar",
            },
        )

    data = r.json()
    assert data["status"] == "clarification"
    assert data["ticket"] is None
    assert list(tmp_sink.glob("**/*.jsonl")) == []

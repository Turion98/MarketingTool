"""POST /api/ai-node/process első belépés stepped node-ra (process_step, mockolt)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORY_PATH = BACKEND_ROOT / "stories" / "ai_complaint_story_v3.json"


@pytest.fixture(scope="module")
def client() -> TestClient:
    from main import app

    return TestClient(app)


def test_first_step_entry_uses_process_step_not_step_start_reply(client: TestClient) -> None:
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    node = story["pages"]["delivery-issue"]
    first_step = node["steps"][0]

    def fake_process_step(**kwargs: object) -> dict:
        assert kwargs.get("current_step") == first_step
        return {
            "satisfied": ["packaging_damaged"],
            "newlySatisfied": ["packaging_damaged"],
            "missing": ["has_order_id"],
            "stepDone": False,
            "nextStepId": None,
            "assistantMessage": "Kérem a rendelési számot.",
        }

    with (
        patch("routers.ai_node_routes.get_top_k_nodes", return_value=[node]),
        patch(
            "routers.ai_node_routes.match_active_node",
            return_value={"activeNodeId": "delivery-issue", "askClarification": False},
        ),
        patch("routers.ai_node_routes.process_step", side_effect=fake_process_step),
    ):
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": "a csomagom megsérült",
                "satisfiedConditions": [],
                "currentStepId": None,
            },
        )

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "clarification"
    assert data["assistantMessage"] == "Kérem a rendelési számot."
    assert data["satisfiedConditions"] == ["packaging_damaged"]
    assert data["newlySatisfied"] == ["packaging_damaged"]
    assert "has_order_id" in data.get("missing", [])
    assert data.get("currentStepId") == "step_1"


def _tool_block(name: str, data: dict):
    from types import SimpleNamespace

    return SimpleNamespace(type="tool_use", name=name, input=data)


def test_first_step_delivered_not_received_advances_to_step_3a_mocked() -> None:
    from services import ai_node_runtime as air
    from types import SimpleNamespace

    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    node = story["pages"]["delivery-issue"]
    step_1 = node["steps"][0]

    extract_resp = SimpleNamespace(
        content=[
            _tool_block(
                "extract_conditions",
                {
                    "satisfied": [
                        "has_order_id",
                        "tracking_checked",
                        "marked_delivered_not_received",
                    ],
                    "missing": [],
                },
            ),
        ]
    )
    reply_resp = SimpleNamespace(
        content=[
            _tool_block(
                "generate_reply",
                {
                    "assistantMessage": (
                        "Ellenőrizted már a szomszédoknál vagy a portásnál?"
                    ),
                },
            ),
        ]
    )

    with patch.object(
        air.client.messages,
        "create",
        side_effect=[extract_resp, reply_resp],
    ):
        out = air.process_step(
            (
                "A tracking szerint kézbesítve van, de nem kaptam meg a csomagot. "
                "Rendelési szám: ORD-DEL-002."
            ),
            node,
            step_1,
            [],
        )

    assert out["stepDone"] is True
    assert out["nextStepId"] == "step_3a"
    assert "has_order_id" in out["satisfied"]
    assert "tracking_checked" in out["satisfied"]
    assert "marked_delivered_not_received" in out["satisfied"]
    assert "tracking" not in out["assistantMessage"].lower() or "szomszéd" in out["assistantMessage"].lower()
    assert "szomszéd" in out["assistantMessage"].lower() or "portás" in out["assistantMessage"].lower()


def test_complaint_intake_routes_to_battery_single_turn_handoff(
    client: TestClient,
) -> None:
    """Routing node: no intake reply; original prompt runs on target step_1."""
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    intake = story["pages"]["complaint-intake"]
    battery = story["pages"]["battery-issue"]
    first_step = battery["steps"][0]
    full_prompt = (
        "Nagyon lassan tölt, még gyors töltővel is 4 óra kell teli töltéshez. "
        "Rendelési szám: ORD-BAT-003."
    )
    intake_handoff_msg = "Átirányítalak az akkumulátor csapathoz."

    def fake_extract_conditions(
        user_prompt: str,
        active_node: dict,
        already_satisfied: list,
        **kwargs: object,
    ) -> dict:
        generate_reply = kwargs.get("generate_reply", True)
        pre = kwargs.get("pre_extracted")
        if pre is not None and generate_reply:
            return {
                "satisfied": pre.get("satisfied", []),
                "missing": pre.get("missing", []),
                "newlySatisfied": pre.get("newlySatisfied", []),
                "assistantMessage": "Pontosítsd kérlek.",
            }
        if active_node.get("id") == "complaint-intake" and not generate_reply:
            assert user_prompt == full_prompt
            return {
                "satisfied": [
                    "complaint_type_known",
                    "complaint_battery",
                    "has_order_id",
                ],
                "newlySatisfied": [
                    "complaint_type_known",
                    "complaint_battery",
                    "has_order_id",
                ],
                "missing": [],
                "assistantMessage": "",
            }
        return {
            "satisfied": list(already_satisfied),
            "newlySatisfied": [],
            "missing": [],
            "assistantMessage": intake_handoff_msg,
        }

    def fake_process_step(**kwargs: object) -> dict:
        assert kwargs.get("user_prompt") == full_prompt
        assert kwargs.get("active_node") == battery
        assert kwargs.get("current_step") == first_step
        already = kwargs.get("already_satisfied") or []
        assert "complaint_battery" in already
        assert "has_order_id" in already
        return {
            "satisfied": [
                *already,
                "battery_symptom_known",
            ],
            "newlySatisfied": ["battery_symptom_known"],
            "missing": [],
            "stepDone": False,
            "nextStepId": None,
            "assistantMessage": "Látom, lassú a töltés. Milyen töltőt használsz?",
        }

    with (
        patch("routers.ai_node_routes.get_top_k_nodes", return_value=[intake]),
        patch(
            "routers.ai_node_routes.match_active_node",
            return_value={"activeNodeId": "complaint-intake", "askClarification": False},
        ),
        patch(
            "routers.ai_node_routes.extract_conditions",
            side_effect=fake_extract_conditions,
        ),
        patch("routers.ai_node_routes.process_step", side_effect=fake_process_step),
    ):
        r = client.post(
            "/api/ai-node/process",
            json={
                "src": "ai_complaint_story_v3",
                "pageId": "complaint-intake",
                "prompt": full_prompt,
                "satisfiedConditions": [],
                "currentStepId": None,
            },
        )

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["activeNodeId"] == "battery-issue"
    assert data["assistantMessage"] == "Látom, lassú a töltés. Milyen töltőt használsz?"
    assert intake_handoff_msg not in data["assistantMessage"]
    assert data.get("currentStepId") == "step_1"
    assert "complaint_battery" in data["satisfiedConditions"]
    assert "has_order_id" in data["satisfiedConditions"]

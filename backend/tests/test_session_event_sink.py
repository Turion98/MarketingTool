"""SessionEventSink + cross-node UFC helpers tesztek."""
from __future__ import annotations

import json

import pytest

from services.session_event_sink import (
    SessionEventSink,
    read_last_event,
    read_visited_nodes,
)


def _make_event(
    *,
    session_id: str = "sess-A",
    turn: int = 1,
    to_node: str | None = "complaint-intake",
    from_node: str | None = None,
    user_has_question: bool = False,
    summary: str | None = None,
    satisfied_after: list[str] | None = None,
) -> dict:
    return {
        "sessionId": session_id,
        "turn": turn,
        "fromNodeId": from_node,
        "toNodeId": to_node,
        "fromStepId": None,
        "toStepId": "step_1",
        "satisfied_before": [],
        "satisfied_after": satisfied_after or [],
        "newlySatisfied": [],
        "userHasOpenQuestion": user_has_question,
        "userQuestionSummary": summary,
        "branchTaken": (
            f"{from_node}->{to_node}" if from_node and to_node and from_node != to_node else None
        ),
        "endPageId": None,
    }


def test_submit_creates_jsonl(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    assert sink.submit(_make_event(session_id="sess-1", turn=1)) is True
    files = list(tmp_path.glob("*.jsonl"))
    assert len(files) == 1
    data = json.loads(files[0].read_text(encoding="utf-8").strip())
    assert data["sessionId"] == "sess-1"
    assert data["turn"] == 1
    assert data["toNodeId"] == "complaint-intake"
    assert "timestamp" in data


def test_idempotent_on_session_and_turn(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    assert sink.submit(_make_event(session_id="sess-1", turn=1)) is True
    assert sink.submit(_make_event(session_id="sess-1", turn=1)) is False
    file = next(tmp_path.glob("*.jsonl"))
    lines = [l for l in file.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 1


def test_rejects_missing_session_id(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    bad = _make_event()
    bad["sessionId"] = ""
    assert sink.submit(bad) is False
    assert not list(tmp_path.glob("*.jsonl"))


def test_rejects_invalid_turn(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    bad = _make_event(turn=0)
    assert sink.submit(bad) is False


def test_read_visited_nodes_dedups_and_orders(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    sink.submit(_make_event(session_id="sess-X", turn=1, to_node="complaint-intake"))
    sink.submit(_make_event(session_id="sess-X", turn=2, to_node="delivery-issue"))
    sink.submit(_make_event(session_id="sess-X", turn=3, to_node="complaint-intake"))
    sink.submit(_make_event(session_id="sess-X", turn=4, to_node="product-defect"))
    visited = read_visited_nodes("sess-X", base_dir=tmp_path)
    assert visited == ["delivery-issue", "complaint-intake", "product-defect"]


def test_read_visited_nodes_max_items_limits(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    for i, node in enumerate(["a", "b", "c", "d", "e"], start=1):
        sink.submit(_make_event(session_id="sess-Y", turn=i, to_node=node))
    visited = read_visited_nodes("sess-Y", base_dir=tmp_path, max_items=3)
    assert visited == ["c", "d", "e"]


def test_read_visited_nodes_empty_for_unknown_session(tmp_path):
    assert read_visited_nodes("nonexistent", base_dir=tmp_path) == []


def test_read_last_event(tmp_path):
    sink = SessionEventSink(base_dir=tmp_path)
    sink.submit(_make_event(session_id="sess-L", turn=1, to_node="a"))
    sink.submit(_make_event(session_id="sess-L", turn=2, to_node="b"))
    last = read_last_event("sess-L", base_dir=tmp_path)
    assert isinstance(last, dict)
    assert last["turn"] == 2
    assert last["toNodeId"] == "b"


def test_format_user_facing_context_block_empty_when_no_question():
    from services.ai_node_runtime import _format_user_facing_context_block

    node = {
        "id": "n1",
        "knowledge": {
            "user_facing_context": {
                "context": "valami",
                "topics": [{"keys": ["k"], "guidance": "g"}],
            }
        },
    }
    out = _format_user_facing_context_block(
        active_node=node,
        story_pages={"n1": node},
        session_id="sess-Z",
        user_has_open_question=False,
    )
    assert out == ""


def test_format_user_facing_context_block_current_only_when_no_history():
    from services.ai_node_runtime import _format_user_facing_context_block

    node = {
        "id": "n1",
        "knowledge": {
            "user_facing_context": {
                "context": "Belépési pont",
                "topics": [
                    {"keys": ["miért kell rendelési szám"], "guidance": "Az azonosításhoz."}
                ],
                "fallback": "Egy ügyintéző tud segíteni.",
            }
        },
    }
    out = _format_user_facing_context_block(
        active_node=node,
        story_pages={"n1": node},
        session_id="sess-empty",
        user_has_open_question=True,
    )
    assert "Témaspecifikus háttér" in out
    assert "Aktuális csomópont kontextusa (n1)" in out
    assert "miért kell rendelési szám" in out
    assert "Az azonosításhoz." in out
    assert "Belépési pont" in out
    assert "Fallback: Egy ügyintéző" in out
    assert "Korábbi témakör" not in out


def test_format_user_facing_context_block_uses_conftest_path():
    """A conftest fixture már a SESSION_EVENTS_DIR-t állítja — ennek elérhetőnek kell lennie a runtime-ban."""
    from services.ai_node_runtime import _format_user_facing_context_block
    from services.session_event_sink import get_default_session_event_sink

    sink = get_default_session_event_sink()
    sink.submit(_make_event(session_id="sess-C", turn=1, to_node="delivery"))
    sink.submit(_make_event(session_id="sess-C", turn=2, to_node="current"))

    pages = {
        "delivery": {
            "id": "delivery",
            "knowledge": {
                "user_facing_context": {
                    "context": "Kiszállítási kontextus.",
                    "topics": [{"keys": ["szállítási idő"], "guidance": "2-3 nap."}],
                }
            },
        },
        "current": {
            "id": "current",
            "knowledge": {
                "user_facing_context": {
                    "context": "Aktuális kontextus.",
                    "topics": [{"keys": ["aktív kérdés"], "guidance": "OK."}],
                }
            },
        },
    }
    out = _format_user_facing_context_block(
        active_node=pages["current"],
        story_pages=pages,
        session_id="sess-C",
        user_has_open_question=True,
    )
    assert "Aktuális csomópont kontextusa (current)" in out
    assert "Korábbi témakör kontextusa (delivery)" in out
    assert "2-3 nap." in out


def test_default_sink_uses_env_var(monkeypatch, tmp_path):
    """A get_default_session_event_sink() az aktuális SESSION_EVENTS_DIR-t használja
    miután a fixture resetelte a singletont."""
    from services import session_event_sink as ses

    custom = tmp_path / "custom_session_events"
    custom.mkdir()
    monkeypatch.setattr(ses, "SESSION_EVENTS_DIR", str(custom), raising=True)
    ses.reset_default_session_event_sink()
    sink = ses.get_default_session_event_sink()
    sink.submit(_make_event(session_id="sess-default", turn=1, to_node="a"))
    files = list(custom.glob("*.jsonl"))
    assert len(files) == 1

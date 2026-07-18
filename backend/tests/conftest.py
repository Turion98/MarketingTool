"""Pytest: import előtt env + backend a sys.path-on (services.*)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

os.environ.setdefault(
    "ANTHROPIC_API_KEY",
    "sk-ant-api03-test00000000000000000000000000000000000000000000",
)


@pytest.fixture(autouse=True)
def _isolated_session_event_sink(tmp_path, monkeypatch):
    """Minden tesztben tmp directory-ba írja a session event sink a JSONL-eket.

    Ezzel elkerüljük a teszt-szivárgást valódi `data/session_events/`-be és a
    tesztek közti kölcsönös szennyeződést.
    """
    session_dir = tmp_path / "session_events"
    session_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SESSION_EVENTS_DIR", str(session_dir))
    from services import session_event_sink as ses_mod

    monkeypatch.setattr(ses_mod, "SESSION_EVENTS_DIR", str(session_dir), raising=True)
    ses_mod.reset_default_session_event_sink()
    yield
    ses_mod.reset_default_session_event_sink()

"""
Ticket sink implementációk — szinkron (analytics.py mintájára).
Jelenleg: JsonlFileTicketSink — lokális audit, mindig fut.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from decision_engine.services.runtime_config import BASE_DIR

from .ticket_contracts import Ticket, TicketSink, TicketSubmissionResult

logger = logging.getLogger(__name__)

TICKETS_DIR = os.path.abspath(
    os.getenv("TICKETS_DIR", os.path.join(BASE_DIR, "data", "tickets"))
)


class JsonlFileTicketSink(TicketSink):
    """
    Ticket-et ír JSONL fájlba:
      <TICKETS_DIR>/<story_id>/<YYYY-MM-DD>.jsonl

    Idempotens: ha (session_id, end_page_id) már szerepel az aznapi fájlban,
    nem ír duplikátot.
    """

    def __init__(self, base_dir: Path | str | None = None) -> None:
        self.base_dir = Path(base_dir) if base_dir is not None else Path(TICKETS_DIR)

    def _get_path(self, story_id: str) -> Path:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        directory = self.base_dir / story_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"{today}.jsonl"

    def submit(self, ticket: Ticket) -> TicketSubmissionResult:
        path = self._get_path(ticket.story_id)
        try:
            self._write(path, ticket)
            return TicketSubmissionResult(
                success=True,
                sink_type="jsonl_file",
                external_ref=str(path),
            )
        except Exception as exc:
            logger.error("JsonlFileTicketSink hiba: %s", exc)
            return TicketSubmissionResult(
                success=False,
                sink_type="jsonl_file",
                error=str(exc),
            )

    def _write(self, path: Path, ticket: Ticket) -> None:
        key_session = ticket.session_id
        key_end = ticket.end_page_id

        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        existing = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if (
                        existing.get("session_id") == key_session
                        and existing.get("end_page_id") == key_end
                    ):
                        logger.debug(
                            "Ticket már létezik, kihagyás: session=%s end=%s",
                            key_session,
                            key_end,
                        )
                        return

        with path.open("a", encoding="utf-8") as f:
            f.write(ticket.model_dump_json(exclude_none=False) + "\n")


class LoggingTicketSink(TicketSink):
    """Debug célra — csak logol, nem ír fájlba."""

    def submit(self, ticket: Ticket) -> TicketSubmissionResult:
        logger.info(
            "TICKET [%s] category=%s priority=%s order=%s session=%s",
            ticket.ticket_id,
            ticket.category,
            ticket.priority,
            ticket.order_id,
            ticket.session_id,
        )
        return TicketSubmissionResult(success=True, sink_type="logging")

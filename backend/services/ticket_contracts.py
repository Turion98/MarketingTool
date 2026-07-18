"""
Ticket rendszer kontraktjai — tartalom-független engine réteg.
A story JSON ticket blokkjainak Pydantic sémái és a sink interface.
"""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


JSONValue = Any

VALID_PRIORITIES = Literal["low", "normal", "high", "urgent"]


# ---------------------------------------------------------------------------
# Story JSON ticket blokk sémája (TicketTemplate)
# ---------------------------------------------------------------------------

class TicketTemplate(BaseModel):
    """
    A story JSON `end` node `ticket` blokkjának sémája.
    Az engine ezt olvassa — nem tud az üzleti kategóriákról.

    `extra="forbid"`: a story JSON-ban elgépelt kulcs (pl. `priorty`) loading-kor hibát ad,
    nem csendben kerül elnyelésre.
    """

    model_config = ConfigDict(extra="forbid")

    category: str
    priority: VALID_PRIORITIES = "normal"
    routing_target: str
    sla_hours: Optional[int] = None
    summary_template: Optional[str] = None
    data_fields: list[str] = Field(default_factory=list)
    evidence_conditions: list[str] = Field(default_factory=list)
    customer_actions_required: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    external_system: Optional[str] = None


# ---------------------------------------------------------------------------
# Generált ticket (Ticket)
# ---------------------------------------------------------------------------

class EvidenceItem(BaseModel):
    id: str
    label: str


class AttachmentRef(BaseModel):
    type: str
    provided: bool
    media_key: Optional[str] = None  # F6-ban töltődik ki


class Ticket(BaseModel):
    ticket_id: str
    created_at: datetime
    story_id: str
    session_id: str
    run_id: Optional[str] = None
    order_id: Optional[str] = None
    end_page_id: str

    category: str
    priority: str
    routing_target: str
    tags: list[str] = Field(default_factory=list)

    customer_message: str
    summary: Optional[str] = None
    order_snapshot: dict[str, JSONValue] = Field(default_factory=dict)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    customer_actions_required: list[str] = Field(default_factory=list)
    attachments: list[AttachmentRef] = Field(default_factory=list)

    sla_due_at: Optional[datetime] = None
    external_refs: dict[str, str] = Field(default_factory=dict)

    @staticmethod
    def generate_id(now: Optional[datetime] = None) -> str:
        ts = now or datetime.now(timezone.utc)
        return f"TCK-{ts.strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:6].upper()}"

    @classmethod
    def new(cls, **kwargs: Any) -> "Ticket":
        """Factory: a `ticket_id` és `created_at` ugyanazon UTC pillanat alapján."""
        now = kwargs.pop("created_at", None) or datetime.now(timezone.utc)
        ticket_id = kwargs.pop("ticket_id", None) or cls.generate_id(now)
        return cls(ticket_id=ticket_id, created_at=now, **kwargs)


# ---------------------------------------------------------------------------
# Sink interface (sync)
# ---------------------------------------------------------------------------

class TicketSubmissionResult(BaseModel):
    success: bool
    sink_type: str
    external_ref: Optional[str] = None
    error: Optional[str] = None


class TicketSink(ABC):
    @abstractmethod
    def submit(self, ticket: Ticket) -> TicketSubmissionResult: ...

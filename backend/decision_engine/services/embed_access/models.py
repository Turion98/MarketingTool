from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

GrantStatus = Literal["active", "revoked"]


class EmbedAccessGrant(BaseModel):
    """
    Server-side source of truth for whether an embed may load.
    Future payment integration: activate grants when subscription is paid;
    set status=revoked (or delete) when subscription lapses — no token change needed.
    """

    id: str
    story_id: str = Field(
        ..., description="Campaign / story slug; must match /embed/{story_id}"
    )
    status: GrantStatus = "active"
    allowed_parent_origins: list[str] | None = Field(
        default=None,
        description="If non-empty, Referer origin must match one entry (scheme+host).",
    )
    expires_at: str | None = Field(
        default=None,
        description="ISO8601 UTC; grant inactive after this moment regardless of JWT exp.",
    )
    created_at: str
    updated_at: str
    note: str | None = None

    def is_expired_wall_clock(self) -> bool:
        if not self.expires_at:
            return False
        try:
            raw = self.expires_at.replace("Z", "+00:00")
            end = datetime.fromisoformat(raw)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            return datetime.now(timezone.utc) > end
        except ValueError:
            return True

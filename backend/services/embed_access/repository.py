from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Protocol

from .models import EmbedAccessGrant, GrantStatus


class EmbedGrantRepository(Protocol):
    """Pluggable store. Swap implementation for Postgres/SQLite without changing verify logic."""

    def get_by_id(self, grant_id: str) -> EmbedAccessGrant | None: ...

    def list_by_story_id(self, story_id: str) -> list[EmbedAccessGrant]: ...


def _default_grants_path() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    return base / "data" / "embed_access_grants.json"


class FileEmbedGrantRepository:
    """
    JSON file backing store — re-read on each lookup so revocation edits take effect immediately.
    Future: replace with DB repository; payment webhooks update rows there.
    """

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or Path(
            os.getenv("EMBED_ACCESS_GRANTS_PATH", str(_default_grants_path()))
        )

    def _load_raw(self) -> list[dict[str, Any]]:
        if not self._path.is_file():
            return []
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        grants = data.get("grants")
        if not isinstance(grants, list):
            return []
        return [g for g in grants if isinstance(g, dict)]

    def get_by_id(self, grant_id: str) -> EmbedAccessGrant | None:
        for row in self._load_raw():
            if str(row.get("id", "")) != grant_id:
                continue
            try:
                return self._row_to_grant(row)
            except Exception:
                return None
        return None

    def list_by_story_id(self, story_id: str) -> list[EmbedAccessGrant]:
        out: list[EmbedAccessGrant] = []
        for row in self._load_raw():
            if str(row.get("story_id", "")) != story_id:
                continue
            try:
                out.append(self._row_to_grant(row))
            except Exception:
                continue
        return out

    @staticmethod
    def _row_to_grant(row: dict[str, Any]) -> EmbedAccessGrant:
        origins = row.get("allowed_parent_origins")
        if origins is not None and not isinstance(origins, list):
            origins = None
        raw_status = str(row.get("status", "active")).strip().lower()
        status: GrantStatus = "revoked" if raw_status == "revoked" else "active"
        return EmbedAccessGrant(
            id=str(row["id"]),
            story_id=str(row["story_id"]),
            status=status,
            allowed_parent_origins=[str(x) for x in origins] if origins else None,
            expires_at=row.get("expires_at"),
            created_at=str(row.get("created_at", "")),
            updated_at=str(row.get("updated_at", "")),
            note=row.get("note"),
        )


_repo_singleton: FileEmbedGrantRepository | None = None


def get_embed_grant_repository() -> EmbedGrantRepository:
    global _repo_singleton
    if _repo_singleton is None:
        _repo_singleton = FileEmbedGrantRepository()
    return _repo_singleton


def reset_embed_grant_repository_for_tests() -> None:
    global _repo_singleton
    _repo_singleton = None

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Protocol
from datetime import datetime, timezone
from uuid import uuid4

from .models import EmbedAccessGrant, GrantStatus


class EmbedGrantRepository(Protocol):
    """Pluggable store. Swap implementation for Postgres/SQLite without changing verify logic."""

    def get_by_id(self, grant_id: str) -> EmbedAccessGrant | None: ...

    def list_by_story_id(self, story_id: str) -> list[EmbedAccessGrant]: ...

    def upsert_active_grant_for_story(
        self,
        *,
        story_id: str,
        allowed_parent_origins: list[str] | None = None,
        expires_at: str | None = None,
        note: str | None = None,
    ) -> EmbedAccessGrant: ...

    def revoke_grant(self, grant_id: str, *, note: str | None = None) -> EmbedAccessGrant | None: ...


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

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def _write_raw(self, rows: list[dict[str, Any]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"grants": rows}
        data = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        with tempfile.NamedTemporaryFile(
            "w",
            delete=False,
            dir=str(self._path.parent),
            encoding="utf-8",
        ) as tmp:
            tmp.write(data)
            tmp_name = tmp.name
        Path(tmp_name).replace(self._path)

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

    def upsert_active_grant_for_story(
        self,
        *,
        story_id: str,
        allowed_parent_origins: list[str] | None = None,
        expires_at: str | None = None,
        note: str | None = None,
    ) -> EmbedAccessGrant:
        sid = story_id.strip()
        if not sid:
            raise ValueError("story_id is required")
        rows = self._load_raw()
        now = self._now_iso()
        chosen_idx: int | None = None
        for idx, row in enumerate(rows):
            if str(row.get("story_id", "")).strip() == sid:
                chosen_idx = idx
                if str(row.get("status", "")).strip().lower() == "active":
                    break
        if chosen_idx is None:
            grant_id = f"auto-{sid}-{uuid4().hex[:10]}"
            row: dict[str, Any] = {
                "id": grant_id,
                "story_id": sid,
                "status": "active",
                "allowed_parent_origins": allowed_parent_origins,
                "expires_at": expires_at,
                "created_at": now,
                "updated_at": now,
                "note": note or "Auto-created by dashboard-generate",
            }
            rows.append(row)
            self._write_raw(rows)
            return self._row_to_grant(row)

        row = rows[chosen_idx]
        row["story_id"] = sid
        row["status"] = "active"
        row["updated_at"] = now
        if not row.get("created_at"):
            row["created_at"] = now
        if allowed_parent_origins is not None:
            row["allowed_parent_origins"] = allowed_parent_origins
        if expires_at is not None:
            row["expires_at"] = expires_at
        if note is not None:
            row["note"] = note
        rows[chosen_idx] = row
        self._write_raw(rows)
        return self._row_to_grant(row)

    def revoke_grant(self, grant_id: str, *, note: str | None = None) -> EmbedAccessGrant | None:
        gid = grant_id.strip()
        if not gid:
            return None
        rows = self._load_raw()
        for idx, row in enumerate(rows):
            if str(row.get("id", "")).strip() != gid:
                continue
            row["status"] = "revoked"
            row["updated_at"] = self._now_iso()
            if note is not None:
                row["note"] = note
            rows[idx] = row
            self._write_raw(rows)
            try:
                return self._row_to_grant(row)
            except Exception:
                return None
        return None

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

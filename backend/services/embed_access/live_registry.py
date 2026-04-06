from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _default_registry_path() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    return base / "data" / "dashboard_live_embeds.json"


def _path() -> Path:
    return Path(
        os.getenv("DASHBOARD_LIVE_EMBEDS_PATH", str(_default_registry_path()))
    )


def load_registry_entries() -> list[dict[str, Any]]:
    p = _path()
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    stories = data.get("stories")
    if not isinstance(stories, list):
        return []
    return [s for s in stories if isinstance(s, dict)]


def register_live_embed(
    *,
    story_id: str,
    title: str | None,
    live_page_url: str | None,
) -> None:
    """
    Upsert storyId szerint — dashboard áttekintés „élő beágyazás” lista.
    Future: billing webhook ugyanebbe az adatforrásba írhat.
    """
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    entries = load_registry_entries()
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    new_row: dict[str, Any] = {
        "storyId": story_id.strip(),
        "registeredAt": now,
    }
    if title and title.strip():
        new_row["title"] = title.strip()
    if live_page_url and str(live_page_url).strip():
        new_row["livePageUrl"] = str(live_page_url).strip()

    by_id: dict[str, dict[str, Any]] = {}
    for row in entries:
        sid = str(row.get("storyId", "")).strip()
        if sid:
            by_id[sid] = row
    sid = story_id.strip()
    by_id[sid] = {**by_id.get(sid, {}), **new_row}

    out = {"stories": list(by_id.values())}
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

"""Story JSON validátor CLI wrapper — `ai_complaint_story_v3.json`-hez igazítva.

Lefuttatás:
    python backend/stories/_validate_story.py

A validációs logika a `backend/services/story_lint` modulba költözött, hogy
a Phase 2/3 onboarding pipeline is használhassa. Ez a fájl csupán a CLI-
betöltést, a számláló-printeket és az exit code-ot tartja meg.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shared.story_lint import Report, lint_full_story

STORY_PATH = Path(__file__).with_name("ai_complaint_story_v3.json")


def _load_story(rep: Report) -> dict | None:
    if not STORY_PATH.exists():
        rep.err(f"Story fájl nem található: {STORY_PATH}")
        return None
    try:
        return json.loads(STORY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        rep.err(f"JSON parse hiba: {e}")
        return None


def main() -> int:
    load_rep = Report()
    story = _load_story(load_rep)
    if story is None:
        print(load_rep.summary())
        return 1

    print(f"Story betöltve: {STORY_PATH.name}")
    print(f"  schemaVersion = {story.get('schemaVersion')!r}")
    print(f"  storyId       = {story.get('storyId')!r}")
    print(f"  locale        = {story.get('locale')!r}")

    pages = story.get("pages")
    pages_valid = isinstance(pages, dict) and bool(pages)
    if pages_valid:
        print(f"  pages         = {len(pages)} db")

    rep = lint_full_story(story)

    if pages_valid:
        ai_pages = [p for p in pages.values() if isinstance(p, dict) and p.get("type") == "ai"]
        end_pages = [p for p in pages.values() if isinstance(p, dict) and p.get("type") == "end"]
        print(f"  ai nodes      = {len(ai_pages)}")
        print(f"  end nodes     = {len(end_pages)}")

        total_conditions = sum(
            len(p.get("conditions") or []) for p in pages.values() if isinstance(p, dict)
        )
        total_steps = sum(
            len(p.get("steps") or []) for p in pages.values() if isinstance(p, dict)
        )
        print(f"  conditions    = {total_conditions} db (összesen, node-onként)")
        print(f"  steps         = {total_steps} db (összesen, node-onként)")

    print(rep.summary())
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())

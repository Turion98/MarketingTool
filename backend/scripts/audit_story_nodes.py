#!/usr/bin/env python3
"""
Audit: list all type: "ai" pages in ai_complaint_story_v3.json with key metadata flags.
Usage: from backend/: python scripts/audit_story_nodes.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    backend_dir = Path(__file__).resolve().parent.parent
    story_path = backend_dir / "stories" / "ai_complaint_story_v3.json"
    if not story_path.is_file():
        print(f"ERROR: story not found: {story_path}", file=sys.stderr)
        return 1

    with open(story_path, "r", encoding="utf-8") as f:
        story = json.load(f)

    pages = story.get("pages")
    if not isinstance(pages, dict):
        print("ERROR: story has no pages object", file=sys.stderr)
        return 1

    ai_nodes: list[tuple[str, dict]] = []
    for page_id, page in pages.items():
        if isinstance(page, dict) and page.get("type") == "ai":
            ai_nodes.append((str(page_id), page))

    ai_nodes.sort(key=lambda x: x[0])

    missing_fallback: list[str] = []

    print(f"Story: {story_path}")
    print(f"AI nodes found: {len(ai_nodes)}")
    print("-" * 72)

    for page_id, node in ai_nodes:
        nid = node.get("id", page_id)
        has_fb = bool(
            isinstance(node.get("fallback_message"), str)
            and node["fallback_message"].strip()
        )
        knowledge = node.get("knowledge")
        if not isinstance(knowledge, dict):
            knowledge = {}

        has_desc = bool(
            isinstance(knowledge.get("description"), str)
            and knowledge["description"].strip()
        )
        examples = knowledge.get("examples")
        if isinstance(examples, list):
            ex_count = len(examples)
            has_ex = ex_count > 0
        else:
            ex_count = 0
            has_ex = False

        cond = node.get("conditions")
        if isinstance(cond, list):
            cond_count = len(cond)
            has_cond = cond_count > 0
        else:
            cond_count = 0
            has_cond = False

        routing = node.get("routing")
        has_routing = isinstance(routing, list) and len(routing) > 0

        if not has_fb:
            missing_fallback.append(str(nid))

        print(f"Node id: {nid}")
        print(f"  Has fallback_message - {'yes' if has_fb else 'no'}")
        print(f"  Has knowledge.description - {'yes' if has_desc else 'no'}")
        print(
            f"  Has knowledge.examples - {'yes' if has_ex else 'no'} "
            f"({ex_count} items)"
        )
        print(
            f"  Has conditions defined - {'yes' if has_cond else 'no'} "
            f"({cond_count} items)"
        )
        print(f"  Has routing defined - {'yes' if has_routing else 'no'}")
        print("-" * 72)

    print()
    print("SUMMARY")
    print(
        f"Nodes missing fallback_message: {len(missing_fallback)} "
        f"(of {len(ai_nodes)} AI nodes)"
    )
    if missing_fallback:
        print("Missing fallback_message - node ids:")
        for i in missing_fallback:
            print(f"  - {i}")
    else:
        print("(none - all AI nodes have fallback_message)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

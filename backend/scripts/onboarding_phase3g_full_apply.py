"""Phase 3g full-blueprint live apply.

Walks every AI page in an existing assembled story, calls the live
``AnthropicOnboardingClient.generate_text_triggers`` per page, applies
the returned ``text_triggers`` to the local copy, and lints the
augmented story end-to-end. The augmented story is saved to a sibling
``_phase3g.json`` file (the original is preserved).

Usage::

    python scripts/onboarding_phase3g_full_apply.py \
        --story data/onboarding/story_<ts>_phase3c.json \
        --blueprint data/onboarding/blueprint_<ts>.json
        [--output data/onboarding/story_<ts>_phase3g.json]
        [--locale-override hu|en]
        [--overwrite-existing]   # overwrite curated text_triggers

Required env: ``ANTHROPIC_API_KEY``.

Cost: ~10-14 AI calls × ~$0.005-0.01 ≈ $0.05–0.10, ~3-5 minutes.
"""
from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from services.onboarding.anthropic_client import AnthropicOnboardingClient  # noqa: E402
from services.onboarding.text_triggers_generator import (  # noqa: E402
    generate_text_triggers_for_story,
)
from services.story_lint import lint_full_story  # noqa: E402


def _load_blueprint(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "blueprint" in raw:
        return raw["blueprint"]
    return raw


def _print_section(title: str) -> None:
    print()
    print("-" * 78)
    print(title)
    print("-" * 78)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Full-blueprint live apply of Phase 3g text_triggers generator."
        )
    )
    parser.add_argument("--story", required=True, type=Path)
    parser.add_argument("--blueprint", required=True, type=Path)
    parser.add_argument(
        "--output", default=None, type=Path,
        help="Output story path. Default: <story>_phase3g.json",
    )
    parser.add_argument(
        "--locale-override", default=None, type=str,
        help="Override the locale (default: blueprint.locale)",
    )
    parser.add_argument(
        "--overwrite-existing", action="store_true",
        help="Overwrite any existing text_triggers on conditions (default: preserve).",
    )
    args = parser.parse_args()

    if not args.story.is_file():
        print(f"ERROR: story not found: {args.story}", file=sys.stderr)
        return 2
    if not args.blueprint.is_file():
        print(f"ERROR: blueprint not found: {args.blueprint}", file=sys.stderr)
        return 2

    print(f"Loading story:     {args.story}")
    print(f"Loading blueprint: {args.blueprint}")
    story = json.loads(args.story.read_text(encoding="utf-8"))
    bp = _load_blueprint(args.blueprint)

    locale = (
        args.locale_override
        or bp.get("locale")
        or story.get("locale")
        or "en"
    )
    proposed_fields = [
        f.get("field_name") for f in bp.get("proposed_new_external_fields", [])
        if isinstance(f, dict) and isinstance(f.get("field_name"), str)
    ]
    print(f"  domain: {bp.get('domain_name', '?')}")
    print(f"  locale: {locale}")

    pages = story.get("pages") or {}
    ai_pages = [pid for pid, p in pages.items()
                if isinstance(p, dict) and p.get("type") == "ai"]
    print(f"  AI pages to process: {len(ai_pages)} → {ai_pages}")

    augmented = deepcopy(story)
    client = AnthropicOnboardingClient()

    _print_section("Phase 3g — generating text_triggers per node")

    error_log: list[tuple[str, str]] = []

    def _on_error(node_id: str, exc: Exception) -> None:
        error_log.append((node_id, f"{type(exc).__name__}: {exc}"))
        print(f"  [FAIL] {node_id}: {type(exc).__name__}: {exc}")

    summary = generate_text_triggers_for_story(
        augmented,
        client=client,
        locale=locale,
        overwrite_existing=args.overwrite_existing,
        on_node_error=_on_error,
    )

    print()
    print(f"  Nodes processed:                   {summary['nodes_processed']}")
    print(f"  Nodes succeeded:                   {summary['nodes_succeeded']}")
    print(f"  Nodes failed:                      {summary['nodes_failed']}")
    print(
        "  page conditions updated:           "
        f"{summary['total_page_conditions_updated']}"
    )
    print(
        "  step internal_conditions updated:  "
        f"{summary['total_step_internal_conditions_updated']}"
    )
    print()
    print("  Per-node breakdown:")
    for nid in summary["succeeded_node_ids"]:
        st = summary["per_node_stats"].get(nid, {})
        print(
            f"    {nid}: page={st.get('page_conditions_updated', 0)}  "
            f"step={st.get('step_internal_conditions_updated', 0)}  "
            f"skip_extract={st.get('skipped_extract_style', 0)}  "
            f"skip_preserved={st.get('skipped_existing_preserved', 0)}"
        )
    if summary["failed_node_ids"]:
        print()
        print("  FAILED NODES:")
        for nid in summary["failed_node_ids"]:
            err_pair = next((e for e in error_log if e[0] == nid), (nid, "?"))
            print(f"    {nid}: {err_pair[1]}")

    _print_section("Sample text_triggers across the story")
    samples_shown = 0
    for pid in summary["succeeded_node_ids"]:
        if samples_shown >= 4:
            break
        page = augmented["pages"].get(pid) or {}
        # Page-level
        for c in page.get("conditions") or []:
            if not isinstance(c, dict):
                continue
            triggers = c.get("text_triggers")
            if not isinstance(triggers, list) or not triggers:
                continue
            print(f"  {pid}.conditions[{c.get('id')}] ({len(triggers)} triggers):")
            for t in triggers:
                print(f"    - {t}")
            samples_shown += 1
            print()
            if samples_shown >= 4:
                break
        if samples_shown >= 4:
            break
        # Step-level
        for s in page.get("steps") or []:
            if not isinstance(s, dict):
                continue
            for ic in s.get("internal_conditions") or []:
                if not isinstance(ic, dict):
                    continue
                triggers = ic.get("text_triggers")
                if not isinstance(triggers, list) or not triggers:
                    continue
                print(
                    f"  {pid}.{s.get('id')}.internal[{ic.get('id')}] "
                    f"({len(triggers)} triggers):"
                )
                for t in triggers:
                    print(f"    - {t}")
                samples_shown += 1
                print()
                if samples_shown >= 4:
                    break
            if samples_shown >= 4:
                break

    rep = lint_full_story(
        augmented, extra_known_external_fields=proposed_fields or None
    )
    _print_section("AFTER lint (full story)")
    print(f"  errors:   {len(rep.errors)}")
    print(f"  warnings: {len(rep.warnings)}")
    print(f"  info:     {len(rep.info)}")
    for e in rep.errors[:10]:
        print(f"    [ERR] {e}")
    for w in rep.warnings[:10]:
        print(f"    [WARN] {w}")
    for i in rep.info[:8]:
        print(f"    [INFO] {i}")
    if len(rep.info) > 8:
        print(f"    [INFO] ... +{len(rep.info) - 8} more")

    out_path: Path = args.output or args.story.with_name(
        args.story.stem + "_phase3g.json"
    )
    out_path.write_text(
        json.dumps(augmented, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _print_section("Output")
    print(f"  augmented story saved: {out_path}")

    return 0 if not rep.errors else 1


if __name__ == "__main__":
    sys.exit(main())

"""Phase 3g single-node live smoke test.

Picks ONE AI page from an existing assembled story, calls the
``AnthropicOnboardingClient.generate_text_triggers`` once, then prints
the returned ``{condition_id: triggers[]}`` mapping and applies it to
the page locally so we can lint-validate the result. NO write-back to
disk — this is purely a "does the live API + prompt + tool chain work
end-to-end on a single node" check before kicking off a full-blueprint
Phase 3g run.

Usage::

    python scripts/onboarding_phase3g_single_node_smoke.py \
        --story data/onboarding/story_<ts>.json \
        --blueprint data/onboarding/blueprint_<ts>.json \
        [--node-id complaint-intake]

Required env: ``ANTHROPIC_API_KEY``.

Cost: ~3-6k input + ~1-2k output tokens ≈ $0.005, single API call,
~15-30 sec.
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
    apply_text_triggers_to_node,
    select_text_trigger_candidates,
)
from services.story_lint import lint_single_node  # noqa: E402


def _load_blueprint(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "blueprint" in raw:
        return raw["blueprint"]
    return raw


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Single-node live smoke for Phase 3g text_triggers generator."
        )
    )
    parser.add_argument("--story", required=True, type=Path)
    parser.add_argument("--blueprint", required=True, type=Path)
    parser.add_argument(
        "--node-id", default=None, type=str,
        help="Node ID to smoke. Defaults to the first AI page.",
    )
    args = parser.parse_args()

    story = json.loads(args.story.read_text(encoding="utf-8"))
    bp = _load_blueprint(args.blueprint)

    pages = story.get("pages") or {}
    ai_pages = [
        (pid, p) for pid, p in pages.items()
        if isinstance(p, dict) and p.get("type") == "ai"
    ]
    if not ai_pages:
        print("ERROR: no AI pages in story.", file=sys.stderr)
        return 2

    if args.node_id:
        target = next(
            (p for pid, p in ai_pages if pid == args.node_id), None
        )
        if target is None:
            print(
                f"ERROR: node_id={args.node_id!r} not found among AI pages: "
                f"{[pid for pid, _ in ai_pages]}",
                file=sys.stderr,
            )
            return 2
    else:
        _, target = ai_pages[0]

    locale = bp.get("locale") or story.get("locale") or "en"

    print("-" * 78)
    print("PHASE 3G SINGLE-NODE SMOKE")
    print("-" * 78)
    print(f"  story:         {args.story}")
    print(f"  blueprint:     {args.blueprint}")
    print(f"  target node:   {target['id']}")
    print(f"  locale:        {locale}")

    candidates = select_text_trigger_candidates(target)
    print(f"  eligible cond candidates: {len(candidates)}")
    for c in candidates:
        cdesc_short = (c.get("description") or "").strip()
        cdesc_short = cdesc_short[:80] + ("…" if len(cdesc_short) > 80 else "")
        print(f"    - {c['id']}  :: {cdesc_short or '(no desc)'}")
    print()

    print("Calling AnthropicOnboardingClient.generate_text_triggers ...")
    client = AnthropicOnboardingClient()
    try:
        result = client.generate_text_triggers(
            page=target,
            locale=locale,
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"ERROR: API call failed: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 3
    last = client.last_phase3g_result
    if last is not None:
        print(
            f"  tokens: input={last.input_tokens}, output={last.output_tokens}"
        )

    print()
    print("-" * 78)
    print("Generated condition_triggers")
    print("-" * 78)
    if not result:
        print("  (empty — model produced no triggers)")
    for cid, triggers in result.items():
        print(f"  {cid}  ({len(triggers)} triggers)")
        for t in triggers:
            print(f"    - {t}")
        print()

    augmented_page = deepcopy(target)
    stats = apply_text_triggers_to_node(augmented_page, result)
    print(
        f"Applied: page_conds={stats['page_conditions_updated']}, "
        f"step_internal={stats['step_internal_conditions_updated']}, "
        f"skipped_extract_style={stats['skipped_extract_style']}, "
        f"skipped_existing_preserved={stats['skipped_existing_preserved']}"
    )
    print("Now linting the augmented node ...")

    rep = lint_single_node(
        augmented_page,
        meta=story.get("meta") or {},
        global_condition_pool=set(),
        known_page_ids=set(pages.keys()),
    )
    print(f"  lint errors:   {len(rep.errors)}")
    print(f"  lint warnings: {len(rep.warnings)}")
    for e in rep.errors[:10]:
        print(f"    [ERR] {e}")
    for w in rep.warnings[:10]:
        print(f"    [WARN] {w}")

    return 0 if not rep.errors else 1


if __name__ == "__main__":
    sys.exit(main())

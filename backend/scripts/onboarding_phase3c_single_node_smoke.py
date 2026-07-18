"""Phase 3c single-node live smoke test.

Picks ONE AI page from an existing assembled story, calls the
``AnthropicOnboardingClient.generate_reply_rules`` once, then prints the
returned ``{step_id: reply_rules[]}`` mapping and applies it to the page
locally so we can lint-validate the result. NO write-back to disk —
this is purely a "does the live API + prompt + tool chain work end-to-end
on a single node" check before kicking off a full-blueprint Phase 3c run.

Usage::

    python scripts/onboarding_phase3c_single_node_smoke.py \
        --story data/onboarding/story_<ts>.json \
        --blueprint data/onboarding/blueprint_<ts>.json \
        [--node-id complaint-intake]

Required env: ``ANTHROPIC_API_KEY``.

Cost: ~5k input + ~2k output tokens ≈ $0.002, single API call, ~20-40 sec.
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
from services.onboarding.reply_rules_generator import (  # noqa: E402
    apply_reply_rules_to_node,
    find_closing_adjacent_step_ids,
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
            "Single-node live smoke for Phase 3c reply_rules generator."
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
    vendor_policy = bp.get("vendor_policy")
    vendor_name = bp.get("vendor_name")

    print("-" * 78)
    print("PHASE 3C SINGLE-NODE SMOKE")
    print("-" * 78)
    print(f"  story:         {args.story}")
    print(f"  blueprint:     {args.blueprint}")
    print(f"  target node:   {target['id']}")
    print(f"  locale:        {locale}")
    print(f"  vendor_policy: {vendor_policy}  vendor_name: {vendor_name!r}")

    closing_adjacent = find_closing_adjacent_step_ids(target)
    closing_step_ids = [
        s.get("id") for s in (target.get("steps") or [])
        if isinstance(s, dict) and s.get("is_closing") is True
    ]
    non_closing_step_ids = [
        s.get("id") for s in (target.get("steps") or [])
        if isinstance(s, dict) and s.get("is_closing") is not True
    ]
    print(f"  closing steps: {closing_step_ids}")
    print(f"  closing-adjacent: {sorted(closing_adjacent)}")
    print(f"  non-closing steps to be generated: {non_closing_step_ids}")
    print()

    print("Calling AnthropicOnboardingClient.generate_reply_rules ...")
    client = AnthropicOnboardingClient()
    try:
        result = client.generate_reply_rules(
            page=target,
            locale=locale,
            vendor_policy=vendor_policy,
            vendor_name=vendor_name,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: API call failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3
    last = client.last_phase3c_result
    if last is not None:
        print(
            f"  tokens: input={last.input_tokens}, output={last.output_tokens}"
        )

    print()
    print("-" * 78)
    print("Generated step_rules")
    print("-" * 78)
    if not result:
        print("  (empty — model produced no rules)")
    for sid, rules in result.items():
        marker = (
            "[CLOSING-ADJACENT]" if sid in closing_adjacent
            else "[NON-ADJACENT]"
        )
        print(f"  {sid}  {marker}  ({len(rules)} rules)")
        for r in rules:
            clipped = r if len(r) <= 110 else r[:109] + "…"
            print(f"    - {clipped}")
        print()

    # Apply locally and lint to verify the result is structurally clean.
    augmented_page = deepcopy(target)
    applied = apply_reply_rules_to_node(augmented_page, result)
    print(f"Applied to {applied} steps. Now linting the augmented node ...")

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

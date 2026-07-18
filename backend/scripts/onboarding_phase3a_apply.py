"""Apply deterministic Phase 2.5 + 3a + 3b passes to an EXISTING story.

This is the "no live API call" twin of running the full pipeline: it picks
up an already-generated story (e.g. from a previous Phase 2 run), applies
the Phase 2.5 cross-node linker (idempotent re-run is a no-op when the
story was already linked), then the Phase 3a meta-builder, then the
Phase 3b step-enricher (done_when backfill + internal_conditions
dict-expansion), then lints the augmented story. The augmented story is
saved to a sibling file so the original is preserved.

Usage::

    python scripts/onboarding_phase3a_apply.py \
        --story data/onboarding/story_<ts>.json \
        --blueprint data/onboarding/blueprint_<ts>.json
        [--output data/onboarding/story_<ts>_phase3a.json]
        [--locale-override hu|en]
        [--no-link]         # skip the cross_node_linker pass
        [--no-step-enrich]  # skip the step_enricher pass

Outputs (printed):

* Linker report (per-page whitelist additions, per-rule inject_conditions
  additions). Expected to be 0/0 if the source story was already linked.
* Meta-builder report (field_rules added, labels added, reply_style locale).
* Step-enricher report (done_when backfilled, internal_conditions
  dict-expanded).
* Final ``lint_full_story`` summary (errors / warnings / info), with
  full warning text inline.

Exit code: 0 if lint clean (zero errors), non-zero on lint failure or
unrecoverable error during processing.
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

from services.onboarding.cross_node_linker import link_cross_nodes  # noqa: E402
from services.onboarding.meta_builder import apply_meta_builder  # noqa: E402
from services.onboarding.step_enricher import apply_step_enricher  # noqa: E402
from services.story_lint import lint_full_story  # noqa: E402


def _load_blueprint(path: Path) -> dict[str, Any]:
    """Read a blueprint json and return the blueprint section directly.

    Phase 1 saves the blueprint under a top-level ``"blueprint"`` key
    next to ``"_meta"``; older runs may save the blueprint dict at the
    top level directly.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "blueprint" in raw and isinstance(
        raw["blueprint"], dict
    ):
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
            "Apply Phase 2.5 cross-node linker + Phase 3a meta-builder "
            "to an existing assembled story (no API calls)."
        )
    )
    parser.add_argument("--story", required=True, type=Path)
    parser.add_argument("--blueprint", required=True, type=Path)
    parser.add_argument(
        "--output", default=None, type=Path,
        help=(
            "Override the default output path "
            "(default: <story>_phase3a.json next to the input)."
        ),
    )
    parser.add_argument(
        "--locale-override", default=None, type=str,
        help="Override the locale used by reply_style (default: blueprint.locale).",
    )
    parser.add_argument(
        "--no-link", action="store_true",
        help="Skip the cross_node_linker pass (use when already linked).",
    )
    parser.add_argument(
        "--no-step-enrich", action="store_true",
        help="Skip the step_enricher pass (Phase 3b).",
    )
    args = parser.parse_args()

    story_path: Path = args.story
    bp_path: Path = args.blueprint

    if not story_path.is_file():
        print(f"ERROR: story not found: {story_path}", file=sys.stderr)
        return 2
    if not bp_path.is_file():
        print(f"ERROR: blueprint not found: {bp_path}", file=sys.stderr)
        return 2

    print(f"Loading story:     {story_path}")
    print(f"Loading blueprint: {bp_path}")

    story = json.loads(story_path.read_text(encoding="utf-8"))
    bp = _load_blueprint(bp_path)

    proposed_fields = [
        f.get("field_name") for f in bp.get("proposed_new_external_fields", [])
        if isinstance(f, dict) and isinstance(f.get("field_name"), str)
    ]
    locale = args.locale_override or bp.get("locale") or story.get("locale") or "en"
    print(f"  domain: {bp.get('domain_name', '?')}")
    print(f"  locale: {locale}  vendor_policy: {bp.get('vendor_policy', '?')}")
    print(f"  domain extra fields ({len(proposed_fields)}): {proposed_fields}")

    # --- BEFORE lint
    rep_before = lint_full_story(
        story, extra_known_external_fields=proposed_fields or None
    )
    _print_section("BEFORE")
    print(
        f"  lint: errors={len(rep_before.errors)}, "
        f"warnings={len(rep_before.warnings)}, info={len(rep_before.info)}"
    )
    for w in rep_before.warnings:
        print(f"    [WARN] {w}")
    if rep_before.errors:
        for e in rep_before.errors[:6]:
            print(f"    [ERR ] {e}")

    augmented = deepcopy(story)

    # --- Phase 2.5 linker (idempotent)
    if not args.no_link:
        link_report = link_cross_nodes(augmented)
        wl = link_report["whitelist"]
        ic = link_report["inject_conditions"]
        _print_section("Phase 2.5 cross_node_linker")
        print(
            f"  whitelist additions:        {wl['total_additions']} "
            f"(in {len(wl['added_per_node'])} nodes)"
        )
        print(
            f"  inject_conditions wired:    {ic['total_additions']} rules"
        )
        if wl["total_additions"]:
            for pid, added in wl["added_per_node"].items():
                print(f"    + {pid}: {added}")
        if ic["total_additions"]:
            for src, idx, target, added in ic["injected_per_rule"][:8]:
                print(f"    + {src} routing[{idx}] -> {target}: {added}")

    # --- Phase 3a meta-builder (incl. Phase 3f layers: question_detection_hint,
    #     precedence_rules, computed_condition_ids, session_state_keys)
    meta_report = apply_meta_builder(
        augmented,
        locale=locale,
        extra_known_fields=proposed_fields or None,
        session_collected_fields=proposed_fields or None,
    )
    _print_section("Phase 3a meta-builder")
    ocm_stats = meta_report["order_context_mapping"]
    print(
        f"  field_rules added:               {ocm_stats['field_rules_added']}"
    )
    print(
        f"  precedence_rules added:          "
        f"{ocm_stats.get('precedence_rules_added', 0)}"
    )
    print(
        f"  session_guard_not injected:      "
        f"{ocm_stats.get('session_guard_not_injected', 0)}"
    )
    print(
        f"  computed_condition_ids added:    "
        f"{ocm_stats.get('computed_condition_ids_added', 0)}"
    )
    print(
        f"  session_state_keys added:        "
        f"{ocm_stats.get('session_state_keys_added', 0)}"
    )
    print(
        f"  labels added:                    "
        f"{meta_report['condition_labels']['labels_added']}"
    )
    print(
        f"  reply_style locale used:         "
        f"{meta_report['reply_style']['locale_used']}"
    )
    qdh_stats = meta_report.get("question_detection_hint") or {}
    print(
        f"  question_detection_hint locale:  "
        f"{qdh_stats.get('locale_used', '?')} (added={qdh_stats.get('added', False)})"
    )
    vpr_stats = meta_report.get("validation_pattern_ref") or {}
    print(
        f"  reference_id_pattern:            "
        f"{vpr_stats.get('reference_id_pattern', '?')!r} "
        f"(added={vpr_stats.get('reference_id_pattern_added', False)})"
    )
    print(
        f"  validation_pattern_ref attached: "
        f"{vpr_stats.get('page_conds_touched', 0)} page-cond + "
        f"{vpr_stats.get('step_conds_touched', 0)} step-cond"
    )

    ocm = augmented["meta"].get("order_context_mapping") or {}
    field_rules = ocm.get("field_rules") or []
    print(f"  resulting order_context_mapping.field_rules ({len(field_rules)}):")
    for r in field_rules:
        print(f"    {r}")
    prec = ocm.get("precedence_rules") or []
    if prec:
        print(f"  resulting precedence_rules ({len(prec)}):")
        for r in prec:
            print(f"    {r}")
    cci = ocm.get("computed_condition_ids") or {}
    if cci:
        print(f"  resulting computed_condition_ids ({len(cci)}):")
        for k, v in sorted(cci.items()):
            tag = "(alias)" if k != v else ""
            print(f"    {k}: {v} {tag}")
    ssk = ocm.get("session_state_keys") or {}
    if ssk:
        print(f"  resulting session_state_keys ({len(ssk)}):")
        for k, v in sorted(ssk.items()):
            print(f"    {k}: {v}")

    labels = augmented["meta"].get("condition_labels") or {}
    print(f"  resulting condition_labels: {len(labels)} entries (showing first 5):")
    for k in list(labels.keys())[:5]:
        v = labels[k]
        clipped = v if len(v) <= 80 else v[:79] + "…"
        print(f"    {k}: {clipped!r}")

    rs = augmented["meta"].get("reply_style") or {}
    rules = rs.get("global_rules") or []
    print(f"  resulting reply_style.global_rules ({len(rules)}):")
    for r in rules:
        print(f"    - {r}")

    # --- Phase 3b step-enricher + 3f auto_satisfy heuristic (deterministic)
    if not args.no_step_enrich:
        step_report = apply_step_enricher(augmented, locale=locale)
        _print_section("Phase 3b step-enricher (+ 3f auto_satisfy heuristic)")
        print(
            f"  done_when backfilled:        "
            f"{step_report['done_when_filled']} steps"
        )
        print(
            f"  internal_conditions expanded:"
            f"{step_report['conditions_expanded']:>4} entries"
        )
        print(
            f"  auto_satisfy_after_reply flagged: "
            f"{step_report.get('auto_satisfy_flagged', 0)} conditions "
            f"(of {step_report.get('scanned_conditions', 0)} scanned)"
        )
        print(
            f"  do_not_reask_if_satisfied flagged:"
            f"{step_report.get('do_not_reask_flagged', 0):>4} conditions"
        )
        print(
            f"  auto-step heuristic detected:    "
            f"{step_report.get('auto_steps_detected', 0)} steps "
            f"(skippable=false set on {step_report.get('skippable_set_false', 0)}, "
            f"chain_on_complete=true set on {step_report.get('chain_on_complete_set_true', 0)})"
        )
        print(
            f"  validation_pattern_ref post-attach (step-cond): "
            f"{step_report.get('validation_pattern_ref_post_attached', 0)}"
        )
        # Heuristic hit-rate context: how many info-step conditions remain
        # without auto_satisfy_after_reply? If high, the Phase 2 prompt's
        # AUTO-SATISFY GUIDANCE may not have been followed and a Phase 3d
        # AI-pass might be warranted.
        info_total = 0
        info_unflagged = 0
        for _pid, page in augmented.get("pages", {}).items():
            if not isinstance(page, dict) or page.get("type") != "ai":
                continue
            for s in page.get("steps", []) or []:
                if not isinstance(s, dict) or s.get("type") != "info":
                    continue
                if s.get("is_closing") is True:
                    continue
                for ic in s.get("internal_conditions", []) or []:
                    if not isinstance(ic, dict):
                        continue
                    info_total += 1
                    if ic.get("auto_satisfy_after_reply") is not True:
                        info_unflagged += 1
        if info_total:
            hit_rate = (info_total - info_unflagged) / info_total * 100
            print(
                f"  info-step auto_satisfy coverage: "
                f"{info_total - info_unflagged}/{info_total} = "
                f"{hit_rate:.0f}% (Phase 2 prompt-follow hint)"
            )
        # Spot-check a few populated done_when values across the story.
        sample_count = 0
        print("  sample done_when values:")
        for page_id, page in augmented.get("pages", {}).items():
            if not isinstance(page, dict) or page.get("type") != "ai":
                continue
            for s in page.get("steps", []) or []:
                dw = s.get("done_when") if isinstance(s, dict) else None
                if not dw:
                    continue
                if sample_count >= 6:
                    break
                clipped = dw if len(dw) <= 80 else dw[:79] + "…"
                print(f"    {page_id}.{s.get('id')}: {clipped!r}")
                sample_count += 1
            if sample_count >= 6:
                break

    # --- AFTER lint (strict mode default)
    rep_after = lint_full_story(
        augmented, extra_known_external_fields=proposed_fields or None
    )
    _print_section("AFTER (lint of augmented story, strict mode)")
    print(
        f"  errors:   {len(rep_after.errors)}"
    )
    print(f"  warnings: {len(rep_after.warnings)}")
    print(f"  info:     {len(rep_after.info)}")
    for w in rep_after.warnings:
        print(f"    [WARN] {w}")
    for n in rep_after.info[:8]:
        print(f"    [INFO] {n}")
    if len(rep_after.info) > 8:
        print(f"    [INFO] ... +{len(rep_after.info) - 8} more")
    if rep_after.errors:
        for e in rep_after.errors[:8]:
            print(f"    [ERR ] {e}")

    # --- Output write
    if args.output:
        out_path: Path = args.output
    else:
        out_path = story_path.with_name(story_path.stem + "_phase3a.json")
    out_path.write_text(
        json.dumps(augmented, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _print_section("Output")
    print(f"  augmented story saved: {out_path}")

    return 0 if not rep_after.errors else 1


if __name__ == "__main__":
    sys.exit(main())

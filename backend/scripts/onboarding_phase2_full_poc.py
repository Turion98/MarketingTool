#!/usr/bin/env python3
"""Phase 2 PoC — generate ALL ai-nodes from a Phase 1 blueprint.

This is the "full Phase 2" companion to ``onboarding_phase2_node_poc.py``.
It walks every ``DomainBlueprint.nodes`` candidate in order, generates each
node with the live ``AnthropicOnboardingClient``, lints it with
``lint_single_node``, and accumulates the ``accepted_nodes_summary`` plus
``accumulated_condition_pool`` for the next iteration.

The run is **idempotent at the node level**: a node that fails on the first
attempt is retried up to ``--max-attempts-per-node`` times, with the lint
errors fed back into the prompt as ``last_attempt_errors``. If a node still
fails after all retries, the script keeps going (so that a single flaky
node does not block the rest of the run); the final summary lists which
nodes were rejected.

Outputs live in ``--output-dir`` (default: alongside the blueprint):

* ``node_<id>_<timestamp>.json`` — one per accepted node (page_dict + lint
  report + token meta) — same shape as the single-node PoC.
* ``story_<timestamp>.json`` — the assembled story produced by
  ``support_engine.services.onboarding.orchestrator.assemble_story``.
* ``run_summary_<timestamp>.json`` — a single roll-up file with per-node
  attempt counts, lint verdicts, and total token usage.

Usage (from ``backend/``):

    python scripts/onboarding_phase2_full_poc.py \\
        --blueprint data/onboarding/blueprint_<ts>.json

Dry-run (no API calls; just print the order + per-node prompt sizes):

    python scripts/onboarding_phase2_full_poc.py \\
        --blueprint data/onboarding/blueprint_<ts>.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from support_engine.services.onboarding.anthropic_client import (  # noqa: E402
    AnthropicOnboardingClient,
    build_phase2_system_prompt,
    build_phase2_user_message,
)
from support_engine.services.onboarding.constraints import build_constraint_catalog  # noqa: E402
from support_engine.services.onboarding.contracts import (  # noqa: E402
    DomainBlueprint,
    GenerationContext,
    NodeCandidate,
    NodeGenerationOutcome,
)
from support_engine.services.onboarding.orchestrator import (  # noqa: E402
    _collect_declared_conditions,
    _collect_handoff_conditions,
    _DEFAULT_RUNTIME,
    _scaffold_end_page,
    _slug,
)
from shared.story_lint import lint_full_story, lint_single_node  # noqa: E402


def _load_blueprint(path: Path) -> DomainBlueprint:
    payload = json.loads(path.read_text(encoding="utf-8"))
    bp_dict = payload.get("blueprint", payload)
    return DomainBlueprint.model_validate(bp_dict)


def _build_known_pages(
    *,
    blueprint: DomainBlueprint,
    candidate: NodeCandidate,
    accepted_outcomes: list[NodeGenerationOutcome],
) -> set[str]:
    """Replicates the orchestrator's `_run_node_with_retries` known-pages
    logic, including the router heuristic for nodes with empty
    `suggested_end_pages`."""
    known: set[str] = {candidate.proposed_id}
    for o in accepted_outcomes:
        if o.final_status == "accepted":
            known.add(o.node_id)
    for ep in blueprint.end_pages:
        known.add(ep.id)
    if not candidate.suggested_end_pages:
        for n in blueprint.nodes:
            known.add(n.proposed_id)
    return known


def _build_accumulated_pool(
    accepted_outcomes: list[NodeGenerationOutcome],
) -> set[str]:
    pool: set[str] = set()
    for o in accepted_outcomes:
        if o.final_status == "accepted":
            pool.update(o.declared_condition_ids)
            pool.update(o.exposed_handoff_condition_ids)
    return pool


def _generate_one_node(
    *,
    client: AnthropicOnboardingClient,
    blueprint: DomainBlueprint,
    candidate: NodeCandidate,
    accepted_outcomes: list[NodeGenerationOutcome],
    max_attempts: int,
) -> tuple[NodeGenerationOutcome, list[dict[str, Any]]]:
    """Run the retry loop for one node.

    Returns the outcome and the per-attempt token usage records.
    """
    accumulated_pool = _build_accumulated_pool(accepted_outcomes)
    known_pages = _build_known_pages(
        blueprint=blueprint,
        candidate=candidate,
        accepted_outcomes=accepted_outcomes,
    )
    meta_under_construction: dict[str, Any] = {
        "runtime": dict(_DEFAULT_RUNTIME),
    }

    last_errors: list[str] = []
    attempts_meta: list[dict[str, Any]] = []
    accepted_page_dict: dict[str, Any] | None = None
    declared_ids: list[str] = []
    handoff_ids: list[str] = []

    for attempt_idx in range(max_attempts):
        ctx = GenerationContext(
            blueprint=blueprint,
            target_node_candidate=candidate,
            accepted_nodes_summary=[
                o.accepted_summary()
                for o in accepted_outcomes
                if o.final_status == "accepted"
            ],
            accumulated_condition_pool=sorted(accumulated_pool),
            meta_under_construction=meta_under_construction,
            known_page_ids_so_far=sorted(known_pages),
            retry_attempt_index=attempt_idx,
            last_attempt_errors=list(last_errors),
        )
        page_dict = client.generate_node(context=ctx)
        result_meta = client.last_phase2_result
        assert result_meta is not None

        report = lint_single_node(
            page_dict,
            meta=meta_under_construction,
            global_condition_pool=accumulated_pool,
            known_page_ids=known_pages,
        )
        accepted = not report.errors
        attempts_meta.append({
            "attempt_index": attempt_idx,
            "accepted": accepted,
            "lint_errors": list(report.errors),
            "lint_warnings": list(report.warnings),
            "lint_info": list(report.info),
            "input_tokens": result_meta.input_tokens,
            "output_tokens": result_meta.output_tokens,
            "stop_reason": result_meta.stop_reason,
        })

        if accepted:
            accepted_page_dict = page_dict
            declared_ids = sorted(_collect_declared_conditions(page_dict))
            handoff_ids = sorted(_collect_handoff_conditions(page_dict))
            break

        last_errors = list(report.errors)

    if accepted_page_dict is not None:
        outcome = NodeGenerationOutcome(
            node_id=candidate.proposed_id,
            attempts=[],  # we keep the meta in attempts_meta locally
            final_status="accepted",
            final_node_dict=accepted_page_dict,
            declared_condition_ids=declared_ids,
            exposed_handoff_condition_ids=handoff_ids,
        )
    else:
        outcome = NodeGenerationOutcome(
            node_id=candidate.proposed_id,
            attempts=[],
            final_status="rejected_human_review",
            final_node_dict=None,
            declared_condition_ids=[],
            exposed_handoff_condition_ids=[],
        )
    return outcome, attempts_meta


def _save_node_file(
    *,
    out_dir: Path,
    timestamp: str,
    candidate: NodeCandidate,
    outcome: NodeGenerationOutcome,
    attempts_meta: list[dict[str, Any]],
    blueprint_path: Path,
    model: str,
) -> Path:
    last = attempts_meta[-1] if attempts_meta else {}
    payload = {
        "_meta": {
            "phase": "phase_2_node_generation",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "model": model,
            "blueprint_source": str(blueprint_path),
            "node_id": candidate.proposed_id,
            "final_status": outcome.final_status,
            "attempt_count": len(attempts_meta),
            "input_tokens_total": sum(a["input_tokens"] for a in attempts_meta),
            "output_tokens_total": sum(a["output_tokens"] for a in attempts_meta),
            "stop_reason_last": last.get("stop_reason"),
        },
        "lint_report": {
            "errors": last.get("lint_errors", []),
            "warnings": last.get("lint_warnings", []),
            "info": last.get("lint_info", []),
        },
        "attempts": attempts_meta,
        "page_dict": outcome.final_node_dict,
    }
    out_path = out_dir / f"node_{candidate.proposed_id}_{timestamp}.json"
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path


def _assemble_story(
    *,
    blueprint: DomainBlueprint,
    accepted_outcomes: list[NodeGenerationOutcome],
    domain_name: str,
    apply_cross_node_linker: bool = True,
    apply_meta: bool = True,
    apply_step_enrichment: bool = True,
) -> dict[str, Any]:
    """Local copy of `orchestrator.assemble_story`, decoupled from
    OnboardingJob (which would require a storage-backed job in this PoC).

    The `apply_cross_node_linker` flag (default True) runs Phase 2.5
    deterministic cross-node linker over the assembled story:
    `complete_session_facts_whitelist` + `wire_cross_node_inject_conditions`.

    The `apply_meta` flag (default True) runs Phase 3a deterministic
    meta-builder: `order_context_mapping`, `condition_labels`, `reply_style`,
    `precedence_rules`, `question_detection_hint`, `computed_condition_ids`,
    `session_state_keys`, `reference_id_pattern`, `validation_pattern_ref`
    (page-level). Runs AFTER the linker so the inject_conditions it added
    are visible to the OCM derive pass.

    The `apply_step_enrichment` flag (default True) runs Phase 3b
    deterministic step-enricher: `done_when` backfill, internal_conditions
    expansion, `auto_satisfy_after_reply` heuristic, `chain_on_complete`
    + `skippable: false` heuristic, post-expand `validation_pattern_ref`.
    Runs AFTER meta-builder.
    """
    pages: dict[str, Any] = {}
    for outcome in accepted_outcomes:
        if outcome.final_status == "accepted" and outcome.final_node_dict:
            pages[outcome.node_id] = outcome.final_node_dict
    for ep in blueprint.end_pages:
        if ep.id in pages:
            continue
        pages[ep.id] = _scaffold_end_page(ep.id, ep.purpose)

    first_accepted = next(
        (o for o in accepted_outcomes if o.final_status == "accepted"),
        None,
    )
    start_page_id = first_accepted.node_id if first_accepted else "start"
    story_id = _slug(domain_name)

    story: dict[str, Any] = {
        "schemaVersion": "1.0",
        "storyId": story_id,
        "locale": blueprint.locale,
        "meta": {
            "id": story_id,
            "title": domain_name,
            "startPageId": start_page_id,
            "defaultFallbackMessage": (
                "Sajnálom, ezt nem értettem. Próbáld másképp megfogalmazni."
            ),
            "runtime": dict(_DEFAULT_RUNTIME),
        },
        "pages": pages,
    }

    if apply_cross_node_linker:
        from support_engine.services.onboarding.cross_node_linker import link_cross_nodes
        report = link_cross_nodes(story)
        wl = report["whitelist"]
        ic = report["inject_conditions"]
        print(
            f"  Phase 2.5 linker: whitelist +{wl['total_additions']}"
            f" (in {len(wl['added_per_node'])} nodes); "
            f"inject_conditions +{ic['total_additions']}"
            f" rules wired."
        )

    if apply_meta:
        from support_engine.services.onboarding.meta_builder import apply_meta_builder
        proposed = [
            f.field_name
            for f in (blueprint.proposed_new_external_fields or [])
            if getattr(f, "field_name", None)
        ]
        meta_report = apply_meta_builder(
            story,
            locale=blueprint.locale,
            extra_known_fields=proposed or None,
            session_collected_fields=proposed or None,
        )
        print(
            f"  Phase 3a meta-builder: "
            f"field_rules +{meta_report['order_context_mapping']['field_rules_added']}, "
            f"labels +{meta_report['condition_labels']['labels_added']}, "
            f"reply_style locale={meta_report['reply_style']['locale_used']}."
        )
        ocm = meta_report.get("order_context_mapping", {})
        prec = ocm.get("precedence_rules_added", 0)
        ccid = ocm.get("computed_condition_ids_added", 0)
        ssk = ocm.get("session_state_keys_added", 0)
        vpr = meta_report.get("validation_pattern_ref", {})
        vref_p = vpr.get("page_conds_touched", 0)
        rip_added = vpr.get("reference_id_pattern_added", False)
        qdh = meta_report.get("question_detection_hint", {})
        qdh_added = qdh.get("added", False)
        print(
            f"  Phase 3a layers: precedence +{prec}, "
            f"computed_cond_ids +{ccid}, session_state_keys +{ssk}, "
            f"validation_ref(page) +{vref_p}, "
            f"question_hint_added={qdh_added}, "
            f"ref_id_pattern_added={rip_added}."
        )

    if apply_step_enrichment:
        from support_engine.services.onboarding.step_enricher import apply_step_enricher
        enr_report = apply_step_enricher(story, locale=blueprint.locale)
        dw = enr_report.get("done_when_filled", 0)
        ic_exp = enr_report.get("conditions_expanded", 0)
        autos = enr_report.get("auto_satisfy_flagged", 0)
        nrf = enr_report.get("do_not_reask_flagged", 0)
        chain = enr_report.get("chain_on_complete_set_true", 0)
        skip_f = enr_report.get("skippable_set_false", 0)
        vref_s = enr_report.get("validation_pattern_ref_post_attached", 0)
        print(
            f"  Phase 3b step-enricher: done_when +{dw}, "
            f"int_cond_expanded +{ic_exp}, auto_satisfy +{autos}, "
            f"do_not_reask +{nrf}, chain_on_complete +{chain}, "
            f"skippable=false +{skip_f}, validation_ref(step) +{vref_s}."
        )

    return story


def _print_node_progress(
    *,
    idx: int,
    total: int,
    candidate: NodeCandidate,
    outcome: NodeGenerationOutcome,
    attempts_meta: list[dict[str, Any]],
) -> None:
    last = attempts_meta[-1] if attempts_meta else {}
    in_tok = sum(a["input_tokens"] for a in attempts_meta)
    out_tok = sum(a["output_tokens"] for a in attempts_meta)
    if outcome.final_status == "accepted":
        verdict = "ACCEPTED"
    else:
        verdict = f"REJECTED ({outcome.final_status})"
    err_count = len(last.get("lint_errors", []))
    warn_count = len(last.get("lint_warnings", []))
    info_count = len(last.get("lint_info", []))
    print(
        f"  [{idx + 1}/{total}] {candidate.proposed_id:<28} "
        f"{verdict:<28} attempts={len(attempts_meta)} "
        f"tok(in/out)={in_tok}/{out_tok} "
        f"lint(e/w/i)={err_count}/{warn_count}/{info_count}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Phase 2 full-blueprint generation PoC."
    )
    parser.add_argument("--blueprint", required=True, type=Path)
    parser.add_argument(
        "--model", default="claude-sonnet-4-5-20250929", type=str
    )
    parser.add_argument("--max-tokens", default=8000, type=int)
    parser.add_argument("--temperature", default=0.2, type=float)
    parser.add_argument(
        "--max-attempts-per-node", default=2, type=int,
        help="Retry budget per node (lint failures feed into the next attempt).",
    )
    parser.add_argument(
        "--output-dir", default=None, type=Path,
        help="Override the default output directory (data/onboarding/).",
    )
    parser.add_argument(
        "--limit", default=None, type=int,
        help="Only process the first N nodes (smoke / partial runs).",
    )
    parser.add_argument(
        "--skip-final-lint", action="store_true",
        help="Skip the assembled-story `lint_full_story` pass at the end.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    bp_path: Path = args.blueprint
    print(f"Loading blueprint: {bp_path}")
    blueprint = _load_blueprint(bp_path)
    print(f"  domain: {blueprint.domain_name}")
    print(f"  locale: {blueprint.locale}, vendor_policy: {blueprint.vendor_policy}")
    print(
        f"  nodes: {len(blueprint.nodes)}, end_pages: {len(blueprint.end_pages)}, "
        f"conditions: {len(blueprint.conditions)}, "
        f"proposed: {len(blueprint.proposed_new_external_fields)}"
    )

    nodes_to_run = blueprint.nodes
    if args.limit is not None:
        nodes_to_run = nodes_to_run[: args.limit]
        print(f"  [LIMIT] only running first {args.limit} of {len(blueprint.nodes)} nodes")

    if args.dry_run:
        catalog = build_constraint_catalog(
            proposed_external_fields=blueprint.proposed_new_external_fields
        )
        system_prompt = build_phase2_system_prompt(
            catalog,
            target_locale=blueprint.locale,
            vendor_policy=blueprint.vendor_policy,
            vendor_name=blueprint.vendor_name,
        )
        print()
        print(f"System prompt size: {len(system_prompt)} chars")
        print()
        print("Per-node user message sizes:")
        for idx, candidate in enumerate(nodes_to_run):
            ctx = GenerationContext(
                blueprint=blueprint,
                target_node_candidate=candidate,
                accepted_nodes_summary=[],
                accumulated_condition_pool=[],
                meta_under_construction={"runtime": dict(_DEFAULT_RUNTIME)},
                known_page_ids_so_far=sorted(
                    _build_known_pages(
                        blueprint=blueprint,
                        candidate=candidate,
                        accepted_outcomes=[],
                    )
                ),
                retry_attempt_index=0,
                last_attempt_errors=[],
            )
            user_message = build_phase2_user_message(ctx)
            router_marker = (
                " [ROUTER]" if not candidate.suggested_end_pages else ""
            )
            print(
                f"  [{idx + 1}/{len(nodes_to_run)}] "
                f"{candidate.proposed_id:<28} {len(user_message):>5} chars"
                f"{router_marker}"
            )
        print()
        print("Dry-run complete. No API calls made.")
        return 0

    # The PoC script reads `backend/.env`; the production client only consults
    # `os.environ`.
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except ImportError:
        pass

    print()
    print(
        f"Initializing AnthropicOnboardingClient ({args.model}, "
        f"max_tokens={args.max_tokens}, temperature={args.temperature})"
    )
    client = AnthropicOnboardingClient(
        model=args.model,
        phase2_max_tokens=args.max_tokens,
        temperature=args.temperature,
    )

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    out_dir = args.output_dir or (bp_path.parent)
    out_dir.mkdir(parents=True, exist_ok=True)

    accepted_outcomes: list[NodeGenerationOutcome] = []
    per_node_attempts: dict[str, list[dict[str, Any]]] = {}
    total_in_tokens = 0
    total_out_tokens = 0
    run_started = datetime.now(timezone.utc)

    print()
    print(
        f"Running Phase 2 over {len(nodes_to_run)} node(s) with "
        f"max_attempts_per_node={args.max_attempts_per_node}..."
    )

    for idx, candidate in enumerate(nodes_to_run):
        try:
            outcome, attempts_meta = _generate_one_node(
                client=client,
                blueprint=blueprint,
                candidate=candidate,
                accepted_outcomes=accepted_outcomes,
                max_attempts=args.max_attempts_per_node,
            )
        except Exception as exc:  # noqa: BLE001
            print(
                f"  [{idx + 1}/{len(nodes_to_run)}] {candidate.proposed_id:<28} "
                f"API ERROR: {type(exc).__name__}: {exc}"
            )
            outcome = NodeGenerationOutcome(
                node_id=candidate.proposed_id,
                attempts=[],
                final_status="api_error",
                final_node_dict=None,
                declared_condition_ids=[],
                exposed_handoff_condition_ids=[],
            )
            attempts_meta = [{
                "attempt_index": 0,
                "accepted": False,
                "lint_errors": [],
                "lint_warnings": [],
                "lint_info": [],
                "input_tokens": 0,
                "output_tokens": 0,
                "stop_reason": None,
                "api_error": f"{type(exc).__name__}: {exc}",
            }]

        accepted_outcomes.append(outcome)
        per_node_attempts[candidate.proposed_id] = attempts_meta
        total_in_tokens += sum(a["input_tokens"] for a in attempts_meta)
        total_out_tokens += sum(a["output_tokens"] for a in attempts_meta)

        _print_node_progress(
            idx=idx,
            total=len(nodes_to_run),
            candidate=candidate,
            outcome=outcome,
            attempts_meta=attempts_meta,
        )

        _save_node_file(
            out_dir=out_dir,
            timestamp=timestamp,
            candidate=candidate,
            outcome=outcome,
            attempts_meta=attempts_meta,
            blueprint_path=bp_path,
            model=args.model,
        )

    run_finished = datetime.now(timezone.utc)
    accepted_ids = [
        o.node_id for o in accepted_outcomes if o.final_status == "accepted"
    ]
    rejected_ids = [
        o.node_id for o in accepted_outcomes if o.final_status != "accepted"
    ]

    # Assembled story + lint_full_story
    story = _assemble_story(
        blueprint=blueprint,
        accepted_outcomes=accepted_outcomes,
        domain_name=blueprint.domain_name,
    )
    story_path = out_dir / f"story_{timestamp}.json"
    story_path.write_text(
        json.dumps(story, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    final_lint_summary: dict[str, Any] | None = None
    if not args.skip_final_lint and accepted_ids:
        proposed_field_names = {
            p.field_name for p in blueprint.proposed_new_external_fields
        }
        final_report = lint_full_story(
            story, extra_known_external_fields=proposed_field_names
        )
        final_lint_summary = {
            "errors": list(final_report.errors),
            "warnings": list(final_report.warnings),
            "info": list(final_report.info),
        }

    summary = {
        "_meta": {
            "phase": "phase_2_full_run",
            "started_at_utc": run_started.isoformat(),
            "finished_at_utc": run_finished.isoformat(),
            "elapsed_seconds": (run_finished - run_started).total_seconds(),
            "model": args.model,
            "max_tokens_per_attempt": args.max_tokens,
            "max_attempts_per_node": args.max_attempts_per_node,
            "blueprint_source": str(bp_path),
        },
        "totals": {
            "nodes_total": len(nodes_to_run),
            "nodes_accepted": len(accepted_ids),
            "nodes_rejected": len(rejected_ids),
            "input_tokens": total_in_tokens,
            "output_tokens": total_out_tokens,
        },
        "accepted": accepted_ids,
        "rejected": rejected_ids,
        "per_node": per_node_attempts,
        "final_lint": final_lint_summary,
    }
    summary_path = out_dir / f"run_summary_{timestamp}.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("PHASE 2 FULL RUN — SUMMARY")
    print("=" * 78)
    print(
        f"Nodes:        accepted={len(accepted_ids)}, "
        f"rejected={len(rejected_ids)}, total={len(nodes_to_run)}"
    )
    print(
        f"Tokens:       in={total_in_tokens}, out={total_out_tokens}, "
        f"sum={total_in_tokens + total_out_tokens}"
    )
    elapsed = (run_finished - run_started).total_seconds()
    print(f"Elapsed:      {elapsed:.1f} seconds")
    if rejected_ids:
        print(f"Rejected:     {rejected_ids}")
    if final_lint_summary is not None:
        print(
            f"Final lint:   errors={len(final_lint_summary['errors'])}, "
            f"warnings={len(final_lint_summary['warnings'])}, "
            f"info={len(final_lint_summary['info'])}"
        )
        for e in final_lint_summary["errors"][:10]:
            print(f"  [ERR] {e}")
        for w in final_lint_summary["warnings"][:5]:
            print(f"  [WRN] {w}")
        for i in final_lint_summary["info"][:5]:
            print(f"  [INF] {i}")
    print()
    print(f"Story saved:    {story_path}")
    print(f"Summary saved:  {summary_path}")
    print("=" * 78)

    return 0 if not rejected_ids else 1


if __name__ == "__main__":
    sys.exit(main())

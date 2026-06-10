#!/usr/bin/env python3
"""Phase 2 PoC — generate ONE AI-node from a Phase 1 blueprint.

This script targets a single node from a saved blueprint, runs the live
``AnthropicOnboardingClient.generate_node`` call, and runs the structural
``lint_single_node`` over the result. The output is saved alongside the
blueprint as ``node_<id>_<timestamp>.json`` together with the lint report
and call metadata (token usage, stop_reason, model).

Usage (from ``backend/``):

    python scripts/onboarding_phase2_node_poc.py \\
        --blueprint data/onboarding/blueprint_<ts>.json \\
        --node-id complaint-intake

Dry-run (no API call; prints catalog + system prompt + user message):

    python scripts/onboarding_phase2_node_poc.py \\
        --blueprint data/onboarding/blueprint_<ts>.json \\
        --node-id complaint-intake --dry-run

Retry-feedback testing (simulate the second attempt by injecting fake
prior errors):

    python scripts/onboarding_phase2_node_poc.py \\
        --blueprint ... --node-id ... \\
        --retry-attempt-index 1 \\
        --last-errors "page.routing[0].goto: ismeretlen target 'wrong'"
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

from services.onboarding.anthropic_client import (  # noqa: E402
    AnthropicOnboardingClient,
    build_phase2_system_prompt,
    build_phase2_user_message,
)
from services.onboarding.constraints import build_constraint_catalog  # noqa: E402
from services.onboarding.contracts import (  # noqa: E402
    DomainBlueprint,
    GenerationContext,
    NodeCandidate,
)
from services.onboarding.tool_schemas import build_generate_node_tool  # noqa: E402
from services.story_lint import lint_single_node  # noqa: E402


def _load_blueprint(path: Path) -> DomainBlueprint:
    if not path.is_file():
        raise FileNotFoundError(f"Blueprint not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    bp_dict = payload.get("blueprint", payload)
    return DomainBlueprint.model_validate(bp_dict)


def _find_candidate(bp: DomainBlueprint, node_id: str) -> NodeCandidate:
    for n in bp.nodes:
        if n.proposed_id == node_id:
            return n
    available = ", ".join(n.proposed_id for n in bp.nodes)
    raise ValueError(
        f"Node id {node_id!r} not in blueprint. Available: {available}"
    )


def _build_context(
    bp: DomainBlueprint,
    candidate: NodeCandidate,
    *,
    retry_attempt_index: int,
    last_attempt_errors: list[str],
) -> GenerationContext:
    """Build a GenerationContext for a single-node PoC run.

    Single-node mode: no accepted nodes yet, no accumulated condition
    pool beyond what the blueprint declares. The known page set is the
    target node id plus all blueprint end-pages — same scaffolding the
    orchestrator does in production for the very first node.
    """
    known_pages = sorted(
        {candidate.proposed_id, *(ep.id for ep in bp.end_pages)}
    )
    return GenerationContext(
        blueprint=bp,
        target_node_candidate=candidate,
        accepted_nodes_summary=[],
        accumulated_condition_pool=[],
        meta_under_construction={
            "runtime": {"model": "claude-sonnet-4-5", "max_tokens": 1024},
        },
        known_page_ids_so_far=known_pages,
        retry_attempt_index=retry_attempt_index,
        last_attempt_errors=last_attempt_errors,
    )


def _save_node(
    *,
    out_dir: Path,
    node_id: str,
    page_dict: dict[str, Any],
    lint_errors: list[str],
    lint_warnings: list[str],
    lint_info: list[str],
    model: str,
    input_tokens: int,
    output_tokens: int,
    stop_reason: str | None,
    blueprint_path: Path,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    out_path = out_dir / f"node_{node_id}_{timestamp}.json"
    payload = {
        "_meta": {
            "phase": "phase_2_node_generation",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "stop_reason": stop_reason,
            "blueprint_source": str(blueprint_path),
            "node_id": node_id,
            "lint_accepted": len(lint_errors) == 0,
        },
        "lint_report": {
            "errors": lint_errors,
            "warnings": lint_warnings,
            "info": lint_info,
        },
        "page_dict": page_dict,
    }
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path


def _print_summary(
    *,
    node_id: str,
    page_dict: dict[str, Any],
    lint_errors: list[str],
    lint_warnings: list[str],
    lint_info: list[str],
    input_tokens: int,
    output_tokens: int,
    stop_reason: str | None,
) -> None:
    print()
    print("=" * 78)
    print(f"PHASE 2 NODE GENERATION — SUMMARY  ({node_id})")
    print("=" * 78)
    print(f"Tokens:        in={input_tokens}  out={output_tokens}")
    if stop_reason and stop_reason != "tool_use":
        marker = " <-- TRUNCATED" if stop_reason == "max_tokens" else ""
        print(f"Stop reason:   {stop_reason}{marker}")
    print()
    print(f"id:            {page_dict.get('id')}")
    print(f"type:          {page_dict.get('type')}")
    fb = page_dict.get("fallback_message") or ""
    fb_preview = fb if len(fb) <= 80 else fb[:77] + "..."
    print(f"fallback:      {fb_preview!r}")
    knowledge = page_dict.get("knowledge") or {}
    print(f"knowledge.description: {(knowledge.get('description') or '')[:120]}")
    print(f"knowledge.scope:       {(knowledge.get('scope') or '')[:120]}")
    examples = knowledge.get("examples") or []
    print(f"knowledge.examples:    {len(examples)} item(s)")

    conditions = page_dict.get("conditions") or []
    print()
    print(f"--- CONDITIONS ({len(conditions)}) ---")
    for c in conditions:
        if isinstance(c, dict):
            req = c.get("required", False)
            print(f"  - {c.get('id')}  required={req}")

    routing = page_dict.get("routing") or []
    print()
    print(f"--- ROUTING ({len(routing)} rules) ---")
    for r in routing:
        if not isinstance(r, dict):
            continue
        if "if" in r and "goto" in r:
            inj = r.get("inject_conditions") or []
            inj_str = f"  inject={inj}" if inj else ""
            print(f"  - if {r['if']} -> goto {r['goto']!r}{inj_str}")
        elif "default" in r:
            print(f"  - default -> {r['default']!r}")
        else:
            print(f"  - (unknown form) {r}")

    steps = page_dict.get("steps") or []
    if steps:
        print()
        print(f"--- STEPS ({len(steps)}) ---")
        for s in steps:
            if isinstance(s, dict):
                closing = " [closing]" if s.get("is_closing") else ""
                print(f"  - {s.get('id')} ({s.get('type')}){closing}")
                goal = s.get("goal")
                if goal:
                    print(f"      goal: {goal[:100]}")

    print()
    print("--- LINT VERDICT ---")
    if not lint_errors:
        print(f"  ACCEPTED  (warnings={len(lint_warnings)}, info={len(lint_info)})")
    else:
        print(f"  REJECTED  errors={len(lint_errors)}, "
              f"warnings={len(lint_warnings)}, info={len(lint_info)}")
    for e in lint_errors:
        print(f"  [ERR] {e}")
    for w in lint_warnings[:5]:
        print(f"  [WRN] {w}")
    if len(lint_warnings) > 5:
        print(f"  ... and {len(lint_warnings) - 5} more warnings")
    for i in lint_info[:3]:
        print(f"  [INF] {i}")
    if len(lint_info) > 3:
        print(f"  ... and {len(lint_info) - 3} more info items")
    print("=" * 78)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Phase 2 single-node generation PoC."
    )
    parser.add_argument("--blueprint", required=True, type=Path)
    parser.add_argument("--node-id", required=True, type=str)
    parser.add_argument(
        "--model", default="claude-sonnet-4-5-20250929", type=str
    )
    parser.add_argument("--max-tokens", default=8000, type=int)
    parser.add_argument("--temperature", default=0.2, type=float)
    parser.add_argument(
        "--retry-attempt-index", default=0, type=int,
        help="Simulate retry mode (>0). Used together with --last-errors.",
    )
    parser.add_argument(
        "--last-errors", action="append", default=[],
        help="Inject one prior lint error into the prompt (repeatable).",
    )
    parser.add_argument(
        "--output-dir", default=None, type=Path,
        help="Override the default output directory (data/onboarding/).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    bp_path: Path = args.blueprint
    print(f"Loading blueprint: {bp_path}")
    bp = _load_blueprint(bp_path)
    print(f"  domain: {bp.domain_name}")
    print(f"  locale: {bp.locale}, vendor_policy: {bp.vendor_policy}")
    print(f"  nodes: {len(bp.nodes)}, end_pages: {len(bp.end_pages)}, "
          f"conditions: {len(bp.conditions)}, "
          f"proposed: {len(bp.proposed_new_external_fields)}")

    candidate = _find_candidate(bp, args.node_id)
    print(f"\nTarget node: {candidate.proposed_id}")
    print(f"  intent: {candidate.domain_intent}")
    print(f"  required: {candidate.required_conditions}")
    print(f"  optional: {candidate.optional_conditions}")
    print(f"  end pages: {candidate.suggested_end_pages}")

    ctx = _build_context(
        bp, candidate,
        retry_attempt_index=args.retry_attempt_index,
        last_attempt_errors=list(args.last_errors),
    )

    if args.dry_run:
        catalog = build_constraint_catalog(
            proposed_external_fields=bp.proposed_new_external_fields
        )
        system_prompt = build_phase2_system_prompt(
            catalog,
            target_locale=bp.locale,
            vendor_policy=bp.vendor_policy,
            vendor_name=bp.vendor_name,
        )
        user_message = build_phase2_user_message(ctx)
        tool = build_generate_node_tool(catalog)
        print()
        print("=" * 78)
        print("SYSTEM PROMPT")
        print("=" * 78)
        print(system_prompt)
        print()
        print("=" * 78)
        print("USER MESSAGE")
        print("=" * 78)
        print(user_message)
        print()
        print(f"Tool: {tool['name']} with strict input_schema "
              f"(required keys: {tool['input_schema']['required']})")
        print("Dry-run complete. No API call made, no output file written.")
        return 0

    print()
    print(f"Calling Anthropic ({args.model}, max_tokens={args.max_tokens}, "
          f"temperature={args.temperature})...")

    # The PoC script reads `backend/.env`; the production client only consults
    # `os.environ` (it expects to live inside a FastAPI app where the env is
    # already loaded).
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except ImportError:
        pass

    client = AnthropicOnboardingClient(
        model=args.model,
        phase2_max_tokens=args.max_tokens,
        temperature=args.temperature,
    )
    page_dict = client.generate_node(context=ctx)
    result = client.last_phase2_result
    assert result is not None  # populated by generate_node

    # Lint with the same scaffolding the orchestrator uses for the first
    # node in a run (no accepted-nodes pool yet).
    known_pages = set(ctx.known_page_ids_so_far)
    report = lint_single_node(
        page_dict,
        meta=ctx.meta_under_construction,
        global_condition_pool=set(ctx.accumulated_condition_pool),
        known_page_ids=known_pages,
    )

    out_dir = args.output_dir or (bp_path.parent)
    out_path = _save_node(
        out_dir=out_dir,
        node_id=candidate.proposed_id,
        page_dict=page_dict,
        lint_errors=list(report.errors),
        lint_warnings=list(report.warnings),
        lint_info=list(report.info),
        model=args.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        stop_reason=result.stop_reason,
        blueprint_path=bp_path,
    )
    print(f"Node saved: {out_path}")

    _print_summary(
        node_id=candidate.proposed_id,
        page_dict=page_dict,
        lint_errors=list(report.errors),
        lint_warnings=list(report.warnings),
        lint_info=list(report.info),
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        stop_reason=result.stop_reason,
    )

    return 0 if not report.errors else 1


if __name__ == "__main__":
    sys.exit(main())

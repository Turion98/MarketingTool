#!/usr/bin/env python3
"""Phase 1 PoC — domain blueprint extraction from a research document.

A pipeline univerzális: bármilyen kutatási anyaggal dolgozik. Ez a script
egyetlen Phase 1 hívást futtat, és a kimenetet validálja Pydantic-kal.

Pipeline szempontjából ez nem hivatalos belépési pont — ez egy CLI tool a
Phase 1 prompt és tool-schema kézi tunolásához. Ha a kimenet stabilan
sane lesz, a Phase 1 logika a `services/onboarding/blueprint.py`-be
kerül át.

Használat (backend/ alól):

    python scripts/onboarding_phase1_poc.py \\
        --docx "C:/Users/csorg/Downloads/Refurbished Electronics Complaint Intake Architecture.docx" \\
        --domain-name "Refurbished electronics complaint intake" \\
        --target-locale en \\
        --vendor-policy generic_blended

Dry run (szöveges előkészítés + prompt nyomtatása, Anthropic-hívás nélkül):

    python scripts/onboarding_phase1_poc.py --docx PATH ... --dry-run

Kimenet:
    backend/data/onboarding/blueprint_<timestamp>.json
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast


_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from support_engine.services.onboarding.constraints import build_constraint_catalog  # noqa: E402
from support_engine.services.onboarding.contracts import (  # noqa: E402
    DomainBlueprint,
    VendorPolicyKind,
)
from support_engine.services.onboarding.tool_schemas import build_extract_blueprint_tool  # noqa: E402
from shared.story_lint import KNOWN_OCM_FIELDS  # noqa: E402


# OrderContext mező pool — a `services/story_lint.KNOWN_OCM_FIELDS`-ből
# származik (egyetlen igazságforrás). Ha ott bővül, itt is automatikusan
# elérhető lesz; a Pydantic / Anthropic schema enum-listához stabil
# rendezés kell, ezért sorted() lista.
KNOWN_EXTERNAL_FIELDS: list[str] = sorted(KNOWN_OCM_FIELDS)


# ============================================================================
# 1. docx loader — stdlib only (zipfile + XML strip), new dependency nélkül
# ============================================================================


def load_docx_text(path: Path) -> str:
    """Word .docx → plain text. Nem őrzi a stílust, csak a paragrafusokat."""
    if not path.is_file():
        raise FileNotFoundError(f"Docx nem található: {path}")
    with zipfile.ZipFile(path) as zf:
        try:
            xml = zf.read("word/document.xml").decode("utf-8")
        except KeyError as e:
            raise ValueError(
                f"Nem tűnik valid Word docx-nak (word/document.xml hiányzik): {path}"
            ) from e
    text = re.sub(r"<w:p [^>]*>", "\n\n", xml)
    text = re.sub(r"<w:p/>", "\n", text)
    text = re.sub(r"</w:p>", "", text)
    text = re.sub(r"<w:tab/>", "\t", text)
    text = re.sub(r"<w:br/>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text


def preprocess_research_text(text: str) -> str:
    """Doksi-export sajátosságok kitisztítása.

    1. `urlRefurbedhttps://www.refurbed.com` → `Refurbed` (Word hyperlink export)
    2. HTML entitások (`&quot;`, `&gt;`, ...)
    3. Felesleges whitespace
    """
    text = html.unescape(text)
    # Word a hyperlink mezők köré Private Use Area markereket tesz
    # (\ue200=begin, \ue201=end, \ue202=separator). Eltávolítjuk őket,
    # hogy a regex-ek a tényleges szövegre tudjanak illeszkedni.
    text = re.sub(r"[\ue000-\uf8ff]", "", text)
    text = re.sub(r"url([A-Z][\w ]*?)https?://\S+", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\burl([A-Za-z][a-zA-Z]+)", r"\1", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ============================================================================
# 2. Anthropic tool schema — extract_blueprint
# ============================================================================
# A schema szigorúbb mint amit a Pydantic előír (additionalProperties: false,
# minimumok). A Pydantic második védvonal — itt a primer védelem.

# A canonical schema-builder a `support_engine.services.onboarding.tool_schemas` modulban él;
# itt a constraint katalógusból (single source of truth) szóló példányt
# cache-eljük process-szinten. A katalógus mezőit (KNOWN_OCM_FIELDS,
# `vendor_policy` enum, stb.) a builder a `shared.story_lint`-ből és a
# `support_engine.services.onboarding.constraints`-ból húzza össze.
EXTRACT_BLUEPRINT_TOOL: dict[str, Any] = build_extract_blueprint_tool(
    build_constraint_catalog()
)


# ============================================================================
# 3. System prompt + user message
# ============================================================================


def build_system_prompt(
    *,
    target_locale: str,
    domain_name: str,
    vendor_policy: VendorPolicyKind,
    vendor_name: str | None,
) -> str:
    vendor_clause: str
    if vendor_policy == "generic_blended":
        vendor_clause = (
            "VENDOR POLICY: generic_blended. The research mentions multiple "
            "benchmark vendors with different rules (e.g. different return "
            "windows, different battery thresholds). DO NOT pick a single "
            "vendor. Instead, abstract the COMMON pattern. Where numbers "
            "differ, choose a sensible middle-ground value and note it in "
            "`notes` so a human can override later. Do NOT name any specific "
            "vendor in the generated `domain_intent` or `summary`."
        )
    elif vendor_policy == "specific" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: specific. Anchor all rules, thresholds, and "
            f"windows to {vendor_name!r}. If the research lacks a specific "
            f"value for {vendor_name!r}, use the closest analogue and note "
            f"it in `notes`."
        )
    elif vendor_policy == "mock" and vendor_name:
        vendor_clause = (
            f"VENDOR POLICY: mock. The story is for a fictional vendor "
            f"named {vendor_name!r}. Use neutral middle-ground values from "
            f"the benchmark set as defaults. Treat this as a clean-slate "
            f"design, not as modelling any real vendor."
        )
    else:
        vendor_clause = (
            "VENDOR POLICY: generic_blended (fallback). Abstract the common "
            "pattern across vendors mentioned in the research."
        )

    field_pool_str = ", ".join(KNOWN_EXTERNAL_FIELDS)

    return (
        "You are a domain deconstructor for a customer-service workflow "
        "generation pipeline. Your job is Phase 1: read research material "
        "and extract a structured DomainBlueprint. The next phases (node "
        "generation, validation) will use your blueprint as input — so the "
        "STRUCTURE matters more than the prose.\n\n"
        f"TARGET DOMAIN: {domain_name}\n"
        f"TARGET LOCALE: {target_locale}\n\n"
        "SCOPE / NODE COUNT:\n"
        "- The number of ai-nodes and end-pages is YOURS to decide. Let the "
        "research material's actual complexity drive the count, NOT a quota. "
        "If the domain has 4 distinct case families, generate ~4 specific "
        "nodes; if it has 15, generate ~15. Do NOT artificially compress "
        "(merging unrelated families into one node) or pad (splitting a "
        "single coherent flow into multiple shallow nodes).\n"
        "- An ai-node should map to a coherent CASE FAMILY or domain "
        "category that has its own evidence requirements, exclusion checks, "
        "and routing decisions. A logical STEP within a flow is NOT a node.\n"
        "- An end-page should exist for each materially distinct OUTCOME "
        "with different ticket category, SLA, or routing target. Do not "
        "merge meaningfully different outcomes into one end-page just to "
        "reduce count.\n\n"
        f"{vendor_clause}\n\n"
        "STRUCTURE-VS-CONTENT SPLIT (critical):\n"
        "- You produce STRUCTURAL CANDIDATES — node ids, condition ids, "
        "routing branches, end-page slots. The next phase fills in the "
        "actual ai_action, reply_rules, and full descriptions.\n"
        "- DO NOT write step definitions. DO NOT write reply rules. "
        "DO NOT write knowledge.description for nodes (only domain_intent).\n"
        "- DO write 1–2 sentence description_seed for each condition.\n\n"
        "STAGE-VS-NODE distinction (lakmuszpapír):\n"
        "- The research may describe LOGICAL STAGES (e.g. 'identify the "
        "order → classify family → collect evidence → handoff'). These are "
        "NOT separate nodes — they map to the STEP sequence INSIDE each "
        "node. Each ai-node typically follows: identify entity → extract "
        "facts → run exclusion checks → decide route. Map complaint "
        "FAMILIES (or domain categories) to nodes, not stages.\n\n"
        "ENTRY/DISPATCHER NODE:\n"
        "- Always include one entry node (suggested id: 'complaint-intake' "
        "or analogous) whose role is to detect the complaint family from "
        "the user's first message and route to the correct specific node.\n"
        "- Always include one off-topic node (suggested id: 'off-topic') "
        "for messages that fall outside the domain scope.\n\n"
        "EXTERNAL DATA DEPS — STRICT FIELD POOL:\n"
        "You may ONLY reference these fields in `external_data_deps`:\n"
        f"  {field_pool_str}\n"
        "If a derivation needs a field NOT in this pool, put it in "
        "`proposed_new_external_fields` with a clear rationale. Do NOT put "
        "non-pool fields in `external_data_deps`.\n\n"
        "RULE_KIND semantics:\n"
        "- 'truthy': field is non-empty/non-zero (e.g. tracking_number set)\n"
        "- 'not_null': field exists (any value, including 0/false)\n"
        "- 'when_value': field equals a specific value (must set when_value)\n"
        "- 'when_any_value': field is one of a set (must set when_any_value)\n\n"
        "CROSS-NODE HANDOFF:\n"
        "If a condition is detected in node A but consumed by node B's "
        "routing, list B in the condition's `cross_node_handoff_targets`. "
        "This signals to the next phase that B needs `inject_conditions` "
        "from A.\n\n"
        "NOTES FIELD:\n"
        "Use `notes` for: ambiguities in the research, choices you made "
        "between conflicting sources, missing evidence-collection steps, "
        "values you guessed (e.g. SLA hours), or anything a human reviewer "
        "should double-check. Be explicit. Empty notes is suspicious for a "
        "non-trivial domain.\n\n"
        "Call the `extract_blueprint` tool exactly once with your result."
    )


def build_user_message(
    *,
    research_text: str,
    research_source_label: str,
) -> str:
    return (
        f"RESEARCH SOURCE: {research_source_label}\n"
        f"RESEARCH LENGTH: {len(research_text)} characters\n\n"
        "=== RESEARCH MATERIAL BEGIN ===\n"
        f"{research_text}\n"
        "=== RESEARCH MATERIAL END ===\n\n"
        "Extract the DomainBlueprint via the extract_blueprint tool."
    )


# ============================================================================
# 4. Anthropic call
# ============================================================================


@dataclass
class BlueprintRunResult:
    blueprint: DomainBlueprint
    raw_tool_input: dict[str, Any]
    model: str
    input_tokens: int
    output_tokens: int
    stop_reason: str | None


def call_anthropic(
    *,
    system_prompt: str,
    user_message: str,
    model: str,
    max_tokens: int,
    temperature: float,
) -> BlueprintRunResult:
    import anthropic
    from dotenv import load_dotenv
    import os

    load_dotenv()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY hiányzik. Add hozzá a backend/.env-hez."
        )

    client = anthropic.Anthropic(api_key=api_key)

    # Streaming used unconditionally:
    #  - Anthropic SDK requires streaming for any request whose max_tokens
    #    estimate could exceed 10 minutes (>= ~32K out tokens for Sonnet 4.5).
    #  - For shorter requests streaming is also safe, so we keep one path.
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        tools=[EXTRACT_BLUEPRINT_TOOL],
        tool_choice={"type": "tool", "name": "extract_blueprint"},
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = stream.get_final_message()

    stop_reason = getattr(response, "stop_reason", None)

    tool_input: dict[str, Any] = {}
    for block in getattr(response, "content", None) or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == "extract_blueprint"
        ):
            tool_input = cast(dict, block.input)
            break

    if not tool_input:
        raise RuntimeError(
            "A modell nem hívta meg az extract_blueprint toolt. "
            f"Stop reason: {stop_reason}"
        )

    blueprint = DomainBlueprint.model_validate(tool_input)

    usage = getattr(response, "usage", None)
    return BlueprintRunResult(
        blueprint=blueprint,
        raw_tool_input=tool_input,
        model=model,
        input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
        output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
        stop_reason=stop_reason,
    )


# ============================================================================
# 5. Output: file + human-readable summary
# ============================================================================


def save_blueprint(
    *,
    result: BlueprintRunResult,
    output_dir: Path,
    research_source: str,
    research_chars_after_preprocess: int,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    out_path = output_dir / f"blueprint_{timestamp}.json"

    payload = {
        "_meta": {
            "phase": "phase_1_blueprint",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "model": result.model,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "stop_reason": result.stop_reason,
            "research_source": research_source,
            "research_chars_after_preprocess": research_chars_after_preprocess,
        },
        "blueprint": result.raw_tool_input,
    }
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path


def print_summary(result: BlueprintRunResult) -> None:
    bp = result.blueprint
    print()
    print("=" * 78)
    print("PHASE 1 BLUEPRINT — SUMMARY")
    print("=" * 78)
    print(f"Domain:         {bp.domain_name}")
    print(f"Locale:         {bp.locale}")
    print(f"Vendor policy:  {bp.vendor_policy}", end="")
    if bp.vendor_name:
        print(f" ({bp.vendor_name})")
    else:
        print()
    print(f"Tokens:         in={result.input_tokens}  out={result.output_tokens}")
    if result.stop_reason and result.stop_reason != "tool_use":
        marker = " <-- TRUNCATED" if result.stop_reason == "max_tokens" else ""
        print(f"Stop reason:    {result.stop_reason}{marker}")
    print()
    print(f"Summary: {bp.summary}")
    print()
    print(f"--- NODES ({len(bp.nodes)}) ---")
    for n in bp.nodes:
        rc = len(n.required_conditions)
        oc = len(n.optional_conditions)
        eps = ",".join(n.suggested_end_pages) or "-"
        print(f"  • {n.proposed_id:30s}  req={rc} opt={oc}  ends=[{eps}]")
        print(f"      intent: {n.domain_intent}")
    print()
    print(f"--- CONDITIONS ({len(bp.conditions)}) ---")
    derived_count = sum(1 for c in bp.conditions if c.derived_from_external_data)
    user_count = len(bp.conditions) - derived_count
    print(f"  user-extracted: {user_count}   external-derived: {derived_count}")
    for c in bp.conditions:
        marker = "[ext]" if c.derived_from_external_data else "     "
        ho = (
            f"  →handoff: {','.join(c.cross_node_handoff_targets)}"
            if c.cross_node_handoff_targets
            else ""
        )
        print(f"  {marker} {c.id:35s} {c.description_seed[:60]}{ho}")
    print()
    print(f"--- EXTERNAL DATA DEPS ({len(bp.external_data_deps)}) ---")
    for d in bp.external_data_deps:
        extra = ""
        if d.rule_kind == "when_value":
            extra = f" == {d.when_value!r}"
        elif d.rule_kind == "when_any_value":
            extra = f" in {d.when_any_value!r}"
        mod = f"  ({d.needs_modifier}:{d.modifier_field})" if d.needs_modifier else ""
        print(
            f"  • {d.field_name:28s} {d.rule_kind:18s}{extra} → "
            f"{d.derived_condition_id}{mod}"
        )
    if bp.proposed_new_external_fields:
        print()
        print(
            f"--- PROPOSED NEW EXTERNAL FIELDS "
            f"({len(bp.proposed_new_external_fields)}) ---"
        )
        for p in bp.proposed_new_external_fields:
            print(f"  ! {p.field_name}: {p.suggested_type}")
            print(f"      {p.description}")
            print(f"      WHY: {p.rationale}")
    print()
    print(f"--- ROUTING SKETCHES ({len(bp.routing_sketches)}) ---")
    for r in bp.routing_sketches:
        print(f"  from {r.from_node}: {len(r.branches)} branches → "
              f"fallback={r.fallback_target}")
    print()
    print(f"--- END PAGES ({len(bp.end_pages)}) ---")
    for e in bp.end_pages:
        ec = len(e.evidence_conditions)
        print(
            f"  ► {e.id:30s} {e.priority:6s} sla={e.sla_hours}h  "
            f"target={e.routing_target}  evidence={ec}"
        )
        print(f"      {e.purpose}")
    if bp.notes:
        print()
        print(f"--- NOTES ({len(bp.notes)}) ---")
        for note in bp.notes:
            print(f"  - {note}")
    print()
    print("=" * 78)


# ============================================================================
# 6. CLI
# ============================================================================


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Phase 1 PoC: extract a DomainBlueprint from research material.",
    )
    p.add_argument("--docx", required=True, help="Path to a .docx research document")
    p.add_argument(
        "--domain-name",
        required=True,
        help="Short domain name (e.g. 'Refurbished electronics complaint intake')",
    )
    p.add_argument(
        "--target-locale",
        default="en",
        help="ISO 639-1 (default: en)",
    )
    p.add_argument(
        "--vendor-policy",
        choices=["generic_blended", "specific", "mock"],
        default="generic_blended",
    )
    p.add_argument(
        "--vendor-name",
        default=None,
        help="Required if --vendor-policy is specific or mock",
    )
    p.add_argument(
        "--model",
        default="claude-sonnet-4-5-20250929",
        help="Anthropic model id",
    )
    p.add_argument("--max-tokens", type=int, default=8000)
    p.add_argument("--temperature", type=float, default=0.2)
    p.add_argument(
        "--output-dir",
        default=str(_BACKEND_DIR / "data" / "onboarding"),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the prompt and preprocessed research, no API call",
    )
    p.add_argument(
        "--show-research-preview",
        action="store_true",
        help="Print first 2000 chars of preprocessed research before the call",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.vendor_policy in ("specific", "mock") and not args.vendor_name:
        print(
            f"ERROR: --vendor-name required when --vendor-policy={args.vendor_policy}",
            file=sys.stderr,
        )
        return 2

    docx_path = Path(args.docx).expanduser().resolve()
    print(f"Loading docx: {docx_path}")
    raw_text = load_docx_text(docx_path)
    print(f"  raw extracted: {len(raw_text)} chars")
    research_text = preprocess_research_text(raw_text)
    print(f"  after preprocess: {len(research_text)} chars")

    if args.show_research_preview or args.dry_run:
        print()
        print("--- PREPROCESSED RESEARCH PREVIEW (first 2000 chars) ---")
        print(research_text[:2000])
        print("--- (truncated) ---")
        print()

    system_prompt = build_system_prompt(
        target_locale=args.target_locale,
        domain_name=args.domain_name,
        vendor_policy=args.vendor_policy,
        vendor_name=args.vendor_name,
    )
    user_message = build_user_message(
        research_text=research_text,
        research_source_label=str(docx_path.name),
    )

    if args.dry_run:
        print()
        print("=" * 78)
        print("SYSTEM PROMPT")
        print("=" * 78)
        print(system_prompt)
        print()
        print("=" * 78)
        print("USER MESSAGE (first 1500 chars)")
        print("=" * 78)
        print(user_message[:1500])
        print("... (truncated)")
        print()
        print(
            "Tool: extract_blueprint with strict input_schema "
            f"(allowed external fields: {len(KNOWN_EXTERNAL_FIELDS)})"
        )
        print(
            "Dry-run complete. No API call made, no output file written."
        )
        return 0

    print()
    print(
        f"Calling Anthropic ({args.model}, max_tokens={args.max_tokens}, "
        f"temperature={args.temperature})..."
    )
    try:
        result = call_anthropic(
            system_prompt=system_prompt,
            user_message=user_message,
            model=args.model,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    out_path = save_blueprint(
        result=result,
        output_dir=Path(args.output_dir).expanduser().resolve(),
        research_source=str(docx_path),
        research_chars_after_preprocess=len(research_text),
    )
    print(f"Blueprint saved: {out_path}")

    print_summary(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())

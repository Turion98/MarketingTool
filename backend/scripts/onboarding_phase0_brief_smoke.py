#!/usr/bin/env python3
"""Phase 0 smoke test — `SupportChatbotBrief` → `research_text` → (optional Phase 1).

A Phase 0 expander pure-Python determinisztikus része önállóan futtatható
**Anthropic API kulcs NÉLKÜL** — ezzel gyorsan validálható:

* a brief modellek (`SupportChatbotBrief` és nested kártyák) tényleg
  beparsolhatók egy minta JSON-ból,
* a `render_brief_to_research_text` markdown formátuma reálisan néz ki
  (a 9 szekció jelen van, a Card 2 konkrét értékei beépültek),
* a `BriefExpansionResult` mezői konzisztensek a brief-fel.

Opcionálisan a `--run-phase1` flag-gel a Phase 1 (`extract_blueprint`)
is meghívható — ez az igazi end-to-end smoke teszt (~$0.01-0.03 / call).

Használat (backend/ alól):

    # Minta brieffel, csak determinisztikus Phase 0:
    python scripts/onboarding_phase0_brief_smoke.py --print-md

    # Saját brief JSON-nal, Phase 1-gyel együtt:
    python scripts/onboarding_phase0_brief_smoke.py \\
        --brief data/onboarding/my_brief.json \\
        --run-phase1

A `--brief` JSON-nak `SupportChatbotBrief.model_validate()` kompatibilisnek
kell lennie. A `--out-dir` (default `data/onboarding/`) alá ír:
* `phase0_<vendor-slug>_<timestamp>_research.md`
* `phase0_<vendor-slug>_<timestamp>_expansion.json`
* `phase0_<vendor-slug>_<timestamp>_blueprint.json` (csak --run-phase1 esetén)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from support_engine.services.onboarding.brief_contracts import (  # noqa: E402
    Card1CompanyBasics,
    Card2Operations,
    Card2aReturns,
    Card2bRemedy,
    Card2cShipping,
    Card3Backend,
    Card3aHelpdesk,
    Card3bSla,
    Card3cUrgency,
    Card4Output,
    Card5aOffTopic,
    Card5bSupportAvailability,
    Card5Boundaries,
    Card6Sources,
    SupportChatbotBrief,
)
from support_engine.services.onboarding.brief_expander import (  # noqa: E402
    expand_brief_to_research,
    render_brief_to_research_text,
)


# --------------------------------------------------------------------------- #
# Built-in sample brief                                                       #
# --------------------------------------------------------------------------- #


def _sample_brief() -> SupportChatbotBrief:
    """Reális Acme Refurb HU sample brief — Card 1-6 mind kitöltve.

    Ez a `ai_complaint_story_v3` benchmarkhoz hasonló szintű részletességű
    bemenet — egy support-chatbot építéséhez minden szükséges info benne van.
    """
    return SupportChatbotBrief(
        card1=Card1CompanyBasics(
            vendor_name="Acme Refurb",
            business_model="own_inventory",
            target_market="b2c",
            locale="hu",
            website_url="https://acme.example/hu",
        ),
        card2=Card2Operations(
            returns=Card2aReturns(
                return_window_days=30,
                return_window_starts_from="delivery",
                condition_requirements=[
                    "original_packaging",
                    "accessories_included",
                ],
                return_shipping_paid_by="company",
            ),
            remedy=Card2bRemedy(
                has_own_repair_capacity=False,
                primary_remedy_order=["replacement", "refund", "partial_refund"],
                instant_replacement="if_in_stock",
                refund_timeline="5_7_business_days",
                has_extended_warranty=True,
                extended_warranty_coverage=(
                    "Az alap garancia 12 hónap; az extended +12 hónap "
                    "akkumulátor-csere garanciát ad gyári hibára."
                ),
            ),
            shipping=Card2cShipping(
                carriers=["DPD", "GLS"],
                lost_package_handled_by="company",
                damage_report_window_value=48,
                damage_report_window_unit="hours",
            ),
        ),
        card3=Card3Backend(
            helpdesk=Card3aHelpdesk(has_helpdesk=False),
            sla=Card3bSla(normal_response="48h", urgent_response="4h"),
            urgency=Card3cUrgency(
                triggers=["battery_safety", "dead_on_arrival", "lost_package_urgent"]
            ),
        ),
        card4=Card4Output(
            scope_out_message=(
                "Ezt sajnos nem tudom intézni, de a kollégánk hamarosan "
                "felveszi veled a kapcsolatot."
            )
        ),
        card5=Card5Boundaries(
            off_topic=Card5aOffTopic(
                question_limit=2,
                excluded_topics="áralku, B2B nagyker, általános terméktanácsadás",
            ),
            support_availability=Card5bSupportAvailability(
                has_support_team=True,
                availability_slots=["weekdays_9_17"],
            ),
        ),
        card6=Card6Sources(),
    )


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _slug(text: str) -> str:
    out: list[str] = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    slug = "".join(out).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "brief"


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")


def _load_brief(path: Path) -> SupportChatbotBrief:
    if not path.is_file():
        raise FileNotFoundError(f"Brief JSON nem található: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return SupportChatbotBrief.model_validate(payload)


def _print_phase0_summary(brief: SupportChatbotBrief, research_text: str) -> None:
    print()
    print("=" * 72)
    print("PHASE 0 SUMMARY")
    print("=" * 72)
    print(f"  brief_id:                {brief.brief_id}")
    print(f"  vendor_name:             {brief.card1.vendor_name}")
    print(f"  locale:                  {brief.card1.locale}")
    print(f"  business_model:          {brief.card1.business_model}")
    print(f"  target_market:           {brief.card1.target_market}")
    print(f"  research_text length:    {len(research_text):,} chars")
    print(f"  research_text lines:     {len(research_text.splitlines()):,}")
    # 9 szekció jelenléte sanity check.
    headers = [
        "## Domain context",
        "## Case families",
        "## Cross-cutting policies",
        "## Always-collect facts",
        "## Helpdesk integration",
        "## SLA targets",
        "## Out-of-scope",
        "## Tone and style",
        "## Attached source excerpts",
    ]
    missing = [h for h in headers if h not in research_text]
    if missing:
        print(f"  [!] MISSING SECTIONS:    {missing}")
    else:
        print(f"  [ok] all 9 sections present")
    print()


def _print_blueprint_summary(blueprint) -> None:  # type: ignore[no-untyped-def]
    print()
    print("=" * 72)
    print("PHASE 1 (extract_blueprint) RESULT")
    print("=" * 72)
    print(f"  domain_name:             {blueprint.domain_name}")
    print(f"  locale:                  {blueprint.locale}")
    print(f"  vendor_policy:           {blueprint.vendor_policy}")
    if blueprint.vendor_name:
        print(f"  vendor_name:             {blueprint.vendor_name}")
    print(f"  summary length:          {len(blueprint.summary)} chars")
    print(f"  nodes:                   {len(blueprint.nodes)}")
    for n in blueprint.nodes:
        intent = n.domain_intent if len(n.domain_intent) < 70 else (
            n.domain_intent[:67] + "..."
        )
        print(f"    - {n.proposed_id}: {intent}")
    print(f"  conditions:              {len(blueprint.conditions)}")
    print(f"  end_pages:               {len(blueprint.end_pages)}")
    for ep in blueprint.end_pages:
        print(
            f"    - {ep.id} (priority={ep.priority}, sla={ep.sla_hours}h, "
            f"target={ep.routing_target})"
        )
    print(f"  routing_sketches:        {len(blueprint.routing_sketches)}")
    print(f"  external_data_deps:      {len(blueprint.external_data_deps)}")
    print(
        f"  proposed_new_fields:     "
        f"{len(blueprint.proposed_new_external_fields)}"
    )
    if blueprint.notes:
        print(f"  notes ({len(blueprint.notes)}):")
        for note in blueprint.notes[:5]:
            short = note if len(note) < 110 else (note[:107] + "...")
            print(f"    - {short}")
        if len(blueprint.notes) > 5:
            print(f"    (... and {len(blueprint.notes) - 5} more)")
    print()


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--brief",
        type=Path,
        default=None,
        help="Brief JSON path. Default: built-in Acme Refurb HU sample.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=_BACKEND_DIR / "data" / "onboarding",
        help="Output dir for generated artifacts. Default: backend/data/onboarding",
    )
    parser.add_argument(
        "--run-phase1",
        action="store_true",
        help=(
            "After Phase 0, call AnthropicOnboardingClient.extract_blueprint "
            "with the generated research_text. Requires ANTHROPIC_API_KEY."
        ),
    )
    parser.add_argument(
        "--print-md",
        action="store_true",
        help="Print the full research_text to stdout (after the summary block).",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Skip writing artifacts to --out-dir (smoke-only invocation).",
    )
    args = parser.parse_args()

    # 1. Brief betöltés.
    if args.brief:
        print(f"[1/4] Loading brief from {args.brief} ...")
        brief = _load_brief(args.brief)
    else:
        print("[1/4] Using built-in Acme Refurb HU sample brief ...")
        brief = _sample_brief()

    # 2. Phase 0 — determinisztikus markdown render.
    print("[2/4] Running Phase 0 (deterministic render_brief_to_research_text) ...")
    research_text = render_brief_to_research_text(brief)
    expansion = expand_brief_to_research(brief)
    _print_phase0_summary(brief, research_text)

    if args.print_md:
        print()
        print("=" * 72)
        print("RESEARCH TEXT (full)")
        print("=" * 72)
        print(research_text)
        print("=" * 72)
        print()

    # 3. Mentés.
    stamp = _utc_stamp()
    vendor_slug = _slug(brief.card1.vendor_name)
    if not args.no_save:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        md_path = args.out_dir / f"phase0_{vendor_slug}_{stamp}_research.md"
        exp_path = args.out_dir / f"phase0_{vendor_slug}_{stamp}_expansion.json"
        md_path.write_text(research_text, encoding="utf-8")
        exp_path.write_text(
            expansion.model_dump_json(indent=2), encoding="utf-8"
        )
        print(f"[3/4] Wrote: {md_path.relative_to(_BACKEND_DIR)}")
        print(f"      Wrote: {exp_path.relative_to(_BACKEND_DIR)}")
    else:
        print("[3/4] --no-save: artifacts not written.")

    # 4. Opcionális Phase 1.
    if args.run_phase1:
        if not os.getenv("ANTHROPIC_API_KEY"):
            print(
                "[4/4] --run-phase1 set but ANTHROPIC_API_KEY missing — "
                "skipping. Set the env var and rerun."
            )
            return 0
        print("[4/4] Calling Phase 1 (AnthropicOnboardingClient.extract_blueprint) ...")
        try:
            from support_engine.services.onboarding.anthropic_client import (
                AnthropicOnboardingClient,
            )

            client = AnthropicOnboardingClient()
            blueprint = client.extract_blueprint(
                research_text=expansion.research_text,
                locale=expansion.locale,
                domain_name=expansion.domain_name,
                vendor_policy=expansion.vendor_policy,
                vendor_name=expansion.vendor_name,
                research_source_label=f"brief:{brief.brief_id}",
            )
        except Exception as e:  # pragma: no cover — smoke szkript
            print(f"      [FAIL] Phase 1 hibázott: {type(e).__name__}: {e}")
            return 2

        _print_blueprint_summary(blueprint)

        if not args.no_save:
            bp_path = (
                args.out_dir / f"phase0_{vendor_slug}_{stamp}_blueprint.json"
            )
            bp_path.write_text(
                blueprint.model_dump_json(indent=2), encoding="utf-8"
            )
            print(f"      Wrote: {bp_path.relative_to(_BACKEND_DIR)}")
    else:
        print("[4/4] --run-phase1 not set, skipping Phase 1 (deterministic-only).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

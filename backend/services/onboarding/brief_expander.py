"""Phase 0 — `SupportChatbotBrief` → `BriefExpansionResult` bridge.

A Phase 0 a user-input brief-et alakítja a meglévő Phase 1
(`extract_blueprint`) számára közvetlenül használható `research_text` markdown-ra
és metadata-háromasra (`domain_name`, `locale`, `vendor_policy='specific'`,
`vendor_name`).

Tervezési alapelvek:

1. **Determinisztikus alapút.** A `render_brief_to_research_text(brief)` pure
   Python — semmi AI hívás. Egy strukturált markdown-t épít a 6 kártya
   tartalmából. Ez az MVP path: brief → render → Phase 1 → ... → kész story,
   csak 1 AI call (a Phase 1) a teljes pipeline-ban (vs. korábbi sok-AI
   tervek).

2. **AI-pass opcionális** (`BriefExpanderClient`). Egy enricher Protocol-t
   adunk, amit később (V2) be lehet kötni: vesz egy nyers determinisztikus
   research_text-et + a briefet, és emberi-narratívabb, részletesebb verziót
   ad vissza. MVP-ben `enricher=None` az alapérték → tisztán determinisztikus.

3. **Vendor policy mindig 'specific'.** Support-chatbot kontextusban a
   `vendor_name` adott (Card 1), így a Phase 1 számára a `'specific'` ág
   használandó (lásd `anthropic_client.build_phase1_system_prompt` vendor
   clause logikáját). A `BriefExpansionResult.vendor_policy` Literal-szintűen
   `'specific'`-re szűkített.

4. **Markdown szerkezet TUKROZÓDIK a `ai_complaint_v3` benchmarkhoz használt
   research-mintára** (## Domain context / ## Case families / ## Cross-cutting
   policies / ## Always-collect facts / ## Vendor data integration / ## SLA
   and urgency / ## Out-of-scope / ## Tone & style / ## Attached source
   excerpts). A Phase 1 modell ezt a tagolást ismeri.

5. **A Card 4 end_node_texts NEM kerül a research_text-be.** Azokat a Card 4
   külön AI hívás generálja (lásd `end_node_text_generator.py` — task 3) és
   közvetlenül a final story end-page `content` mezőibe kerülnek, nem a
   research-be.
"""

from __future__ import annotations

from typing import Iterable, Optional, Protocol

from services.onboarding.brief_contracts import (
    Attachment,
    BriefExpansionResult,
    Card2aReturns,
    Card2bRemedy,
    Card2cShipping,
    Card3aHelpdesk,
    Card3bSla,
    Card3cUrgency,
    Card5aOffTopic,
    Card5bSupportAvailability,
    HelpdeskCredentials,
    SOURCE_DOC_LABELS_HU,
    SOURCE_DOC_PRIORITIES,
    SourceDocumentSlot,
    SupportChatbotBrief,
    default_off_topic_redirect_for,
)
from services.story_lint import KNOWN_OCM_FIELDS


# --------------------------------------------------------------------------- #
# Enricher client protocol                                                    #
# --------------------------------------------------------------------------- #


class BriefExpanderClient(Protocol):
    """Opcionális AI-pass a determinisztikus markdown finomítására.

    Implementáció (V2): `AnthropicOnboardingClient.enrich_brief_research(...)`.
    A MockBriefExpanderClient (tesztben) egyszerűen visszaadja a bemenetet,
    így a `expand_brief_to_research()` pipeline determinisztikusan tesztelhető
    enricher-rel és anélkül is.
    """

    def enrich_brief_research(
        self,
        *,
        deterministic_markdown: str,
        brief: SupportChatbotBrief,
    ) -> str:
        """Visszaad egy finomított research_text-et.

        A kontraktus: a kimenet legalább annyi információt tartalmaz mint a
        bemenet, és kompatibilis a Phase 1 prompt-jával (markdown szekciók
        szerkezete megmarad).
        """
        ...


# --------------------------------------------------------------------------- #
# Helper renderers                                                            #
# --------------------------------------------------------------------------- #


def _slugify(text: str) -> str:
    """Egyszerű ASCII-slugifikáció a `domain_name`-hez.

    A `services.onboarding.orchestrator._slug` későbbi rétegben fut a final
    `storyId`-hoz; itt csak a `domain_name` ember-olvasható részére kell.
    """
    out: list[str] = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    slug = "".join(out).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "support-chatbot"


def derive_domain_name(brief: SupportChatbotBrief) -> str:
    """A Phase 1 `domain_name` paraméter levezetése a brief-ből.

    Konvenció: ``"<Vendor name> — Customer support intake"``. A brief
    `business_model` és `target_market` mezői NEM kerülnek a domain_name-be,
    mert azok a research_text-ben részletezve vannak — a domain_name rövid
    címke, nem leírás.
    """
    return f"{brief.card1.vendor_name.strip()} — Customer support intake"


def _bullet_lines(items: Iterable[str], *, indent: str = "  ") -> list[str]:
    return [f"{indent}- {it}" for it in items if str(it).strip()]


def _yes_no(b: bool) -> str:
    return "Yes" if b else "No"


def _payer_label(payer: str) -> str:
    return {
        "company": "company pays",
        "customer": "customer pays",
        "case_by_case": "case-by-case decision",
    }.get(payer, payer)


def _remedy_label(kind: str) -> str:
    return {
        "refund": "Refund",
        "replacement": "Replacement",
        "repair": "Repair (in-house)",
        "partial_refund": "Partial refund",
    }.get(kind, kind)


def _refund_timeline_label(rt: str, other: Optional[str]) -> str:
    mapping = {
        "3_business_days": "within 3 business days",
        "5_7_business_days": "within 5-7 business days",
        "14_business_days": "within 14 business days",
    }
    if rt == "other":
        return other or "custom timeline"
    return mapping.get(rt, rt)


def _sla_label(sla: str) -> str:
    return {
        "24h": "within 24 hours",
        "48h": "within 48 hours",
        "72h": "within 72 hours",
        "1_week": "within 1 week",
        "1h": "within 1 hour",
        "4h": "within 4 hours",
    }.get(sla, sla)


def _availability_label(slot: str) -> str:
    return {
        "weekdays_9_17": "weekdays 9:00-17:00",
        "weekdays_9_20": "weekdays 9:00-20:00",
        "weekends_too": "including weekends",
        "24_7": "24/7",
    }.get(slot, slot)


def _condition_requirement_label(req: str) -> str:
    return {
        "original_packaging": "original packaging required",
        "accessories_included": "all accessories must be included",
        "factory_reset": "factory reset required",
        "any_condition": "accepted in any condition",
    }.get(req, req)


def _urgency_trigger_label(t: str) -> str:
    return {
        "battery_safety": (
            "Battery safety incident (swelling, smoke, burnt smell) — "
            "always urgent, non-negotiable"
        ),
        "dead_on_arrival": "Device completely non-functional on arrival",
        "lost_package_urgent": "Lost package requiring immediate action",
        "expired_refund_deadline": "Refund deadline already passed",
        "other": "Other (see notes)",
    }.get(t, t)


# --------------------------------------------------------------------------- #
# Per-section markdown renderers                                              #
# --------------------------------------------------------------------------- #


def _render_domain_context(brief: SupportChatbotBrief) -> str:
    c1 = brief.card1
    biz_model = {
        "own_inventory": "own inventory only",
        "marketplace": "marketplace (third-party sellers)",
        "both": "own inventory + marketplace sellers",
    }[c1.business_model]
    target = {"b2c": "B2C", "b2b": "B2B", "both": "B2C and B2B"}[c1.target_market]
    locale_h = "Hungarian" if c1.locale == "hu" else "English"
    lines: list[str] = [
        "## Domain context",
        "",
        f"- **Vendor name**: {c1.vendor_name}",
        f"- **Business model**: {biz_model}",
        f"- **Target market**: {target}",
        f"- **Customer-facing locale**: {locale_h} ({c1.locale})",
    ]
    if c1.website_url:
        lines.append(f"- **Website**: {c1.website_url}")
    if c1.business_model in ("marketplace", "both"):
        lines.append(
            "- **Marketplace caveat**: a separate seller-escalation node MUST "
            "exist for cases where third-party sellers are responsible (e.g. "
            "wrong item shipped by seller, seller-side warranty)."
        )
    if c1.target_market in ("b2b", "both"):
        lines.append(
            "- **B2B caveat**: SLAs and warranty handling typically follow "
            "different contractual terms vs. B2C; tone may be more formal."
        )
    return "\n".join(lines)


def _render_cross_cutting_policies(brief: SupportChatbotBrief) -> str:
    c2 = brief.card2
    lines: list[str] = ["## Cross-cutting policies", ""]

    # 2A returns
    lines.append("### Return window and acceptance conditions")
    lines.append(
        f"- Return deadline: **{c2.returns.return_window_days} days** "
        f"from {c2.returns.return_window_starts_from} date."
    )
    if c2.returns.has_category_specific_windows:
        lines.append(
            "- Category-specific overrides apply (the bot MUST clarify "
            "which product category is involved before stating the deadline):"
        )
        for cw in c2.returns.category_specific_windows:
            lines.append(
                f"  - **{cw.category_label}**: {cw.return_window_days} days."
            )
    if c2.returns.condition_requirements:
        lines.append("- Acceptance conditions:")
        lines.extend(
            _bullet_lines(
                (
                    _condition_requirement_label(r)
                    for r in c2.returns.condition_requirements
                ),
                indent="  ",
            )
        )
    lines.append(
        "- Return shipping cost: "
        f"**{_payer_label(c2.returns.return_shipping_paid_by)}**."
    )
    lines.append("")

    # 2B remedy
    lines.append("### Remedy hierarchy (when defect confirmed)")
    lines.append(
        f"- In-house repair capacity: **{_yes_no(c2.remedy.has_own_repair_capacity)}**."
    )
    lines.append(
        "- Primary remedy preference order (descending priority): "
        + " → ".join(_remedy_label(r) for r in c2.remedy.primary_remedy_order)
        + "."
    )
    if not c2.remedy.has_own_repair_capacity and "repair" in c2.remedy.primary_remedy_order:
        lines.append(
            "  - NOTE: repair appears in the order but no in-house capacity "
            "is declared. The bot MUST NOT promise repair as the primary "
            "outcome; route to replacement/refund instead."
        )
    instant_label = {
        "always": "always available",
        "if_in_stock": "only if stock is available",
        "no": "not offered",
    }[c2.remedy.instant_replacement]
    lines.append(f"- Instant replacement: **{instant_label}**.")
    lines.append(
        "- Refund processing time: "
        f"**{_refund_timeline_label(c2.remedy.refund_timeline, c2.remedy.refund_timeline_other)}**."
    )
    if c2.remedy.has_extended_warranty and c2.remedy.extended_warranty_coverage:
        lines.append(
            "- Extended warranty available — covers in addition to base: "
            f"_{c2.remedy.extended_warranty_coverage.strip()}_"
        )
    lines.append("")

    # 2C shipping
    lines.append("### Shipping and lost/damaged packages")
    carriers_pretty = ", ".join(c for c in c2.shipping.carriers if c != "other")
    if "other" in c2.shipping.carriers and c2.shipping.carrier_other_label:
        if carriers_pretty:
            carriers_pretty += f", {c2.shipping.carrier_other_label}"
        else:
            carriers_pretty = c2.shipping.carrier_other_label
    lines.append(f"- Carriers used: **{carriers_pretty}**.")
    lines.append(
        "- Lost-package claims: "
        f"**{_payer_label(c2.shipping.lost_package_handled_by)}** initiates "
        "the claim."
    )
    lines.append(
        "- Damaged/incomplete package reporting deadline: "
        f"**{c2.shipping.damage_report_window_value} "
        f"{c2.shipping.damage_report_window_unit}**."
    )

    return "\n".join(lines)


def _render_case_families(brief: SupportChatbotBrief) -> str:
    """A 6 fix end-node-slot + dispatcher + off-topic mint case-family csontváz.

    A Phase 1 ezekből generálja az ai-node-okat. A trigger-példák, required
    facts és outcome-ok a Card 2 + Card 3 alapján vannak előtöltve, hogy a
    Phase 1 ne találgasson.
    """
    c2 = brief.card2
    c3 = brief.card3
    lines: list[str] = ["## Case families (proposed AI-node candidates)", ""]

    # Dispatcher / entry
    lines.append("### Entry / dispatcher node")
    lines.append(
        "- Detects the case family from the user's first message and routes "
        "to the correct specific node."
    )
    lines.append(
        f"- Should always collect order identification (see "
        "_Always-collect facts_ section) before routing to a remedy-class node."
    )
    lines.append("")

    # 6 fix case families
    families: list[tuple[str, str, list[str], list[str]]] = [
        (
            "Return acceptance",
            "User wants to return an item within the return window.",
            [
                "User says they want to send back / return a product",
                "Question about return process or eligibility",
                "User checks if return window is still open",
            ],
            [
                f"Confirm the return is within {c2.returns.return_window_days} "
                f"days of {c2.returns.return_window_starts_from} date",
                f"Verify acceptance conditions are met "
                f"({', '.join(_condition_requirement_label(r) for r in c2.returns.condition_requirements) or 'no specific conditions'})",
                f"Communicate shipping cost responsibility ({_payer_label(c2.returns.return_shipping_paid_by)})",
            ],
        ),
        (
            "Refund processing",
            "Defect or eligible return confirmed; user wants money back.",
            [
                "User asks 'when will I get my money back'",
                "Refund status inquiry on an already-initiated case",
                "User accepted refund as remedy choice",
            ],
            [
                "Confirm order_id and refund eligibility",
                f"Communicate refund timeline ({_refund_timeline_label(c2.remedy.refund_timeline, c2.remedy.refund_timeline_other)})",
                "Provide refund_amount / refund_currency if available from order context",
            ],
        ),
        (
            "Replacement",
            "User accepts replacement as the remedy (or company offers it).",
            [
                "User asks 'can I get a new one instead'",
                "User accepts replacement offer",
                "Question about stock availability for replacement",
            ],
            [
                f"Check instant replacement availability ({c2.remedy.instant_replacement})",
                "Confirm shipping address for replacement delivery",
                "Set expectation about replacement device condition (refurbished grade)",
            ],
        ),
        (
            "Warranty investigation",
            "User reports a defect that needs inspection before remedy is decided.",
            [
                "User describes a malfunction beyond DOA window",
                "Battery degradation complaint within warranty period",
                "Display / charging port / accessory failure complaint",
            ],
            [
                "Collect symptom description and onset date",
                "Verify extended_warranty_active if user mentions extended coverage",
                "Communicate that case will be reviewed and remedy decided per "
                + " → ".join(_remedy_label(r) for r in c2.remedy.primary_remedy_order),
            ],
        ),
        (
            "Lost package",
            "Package never arrived or tracking shows it as lost.",
            [
                "User says 'my package never arrived'",
                "Tracking number shows status as lost / returned",
                f"Question about courier ({', '.join(c for c in c2.shipping.carriers if c != 'other') or 'shipping'}) delivery problems",
            ],
            [
                f"Identify carrier from order context and tracking_number",
                f"Clarify lost-claim ownership ({_payer_label(c2.shipping.lost_package_handled_by)})",
                f"Verify the report is within {c2.shipping.damage_report_window_value} "
                f"{c2.shipping.damage_report_window_unit} of expected delivery",
            ],
        ),
        (
            "Expired return deadline",
            "User wants to return / get refund but the window has passed.",
            [
                "User mentions trying to return a long-ago purchase",
                "Refund request when purchase_date + return_window has elapsed",
            ],
            [
                "Confirm purchase_date and that return_window is indeed exceeded",
                "Communicate the policy clearly without judgement",
                "Offer escalation to support team if there is exceptional circumstance",
            ],
        ),
    ]
    for title, scope, examples, facts in families:
        lines.append(f"### {title}")
        lines.append(f"_{scope}_")
        lines.append("")
        lines.append("**Trigger phrases (illustrative):**")
        lines.extend(_bullet_lines(examples))
        lines.append("")
        lines.append("**Required facts to collect:**")
        lines.extend(_bullet_lines(facts))
        lines.append("")

    # Off-topic
    lines.append("### Off-topic node")
    lines.append(
        "- Handles questions outside the supported scope. After "
        f"**{brief.card5.off_topic.question_limit}** off-topic exchanges, "
        "the bot redirects with the configured redirect message and closes "
        "the off-topic loop."
    )
    return "\n".join(lines)


def _render_always_collect_facts(brief: SupportChatbotBrief) -> str:
    lines: list[str] = ["## Always-collect facts (order identification)", ""]
    lines.append(
        "For any remedy-class case, the bot needs to bind the conversation "
        "to a specific order. Pull from the OrderContext field pool wherever "
        "possible; ask the user only for fields not present in context."
    )
    lines.append("")
    lines.append("**Standard OrderContext field pool (`KNOWN_OCM_FIELDS`):**")
    lines.append("")
    lines.append("```")
    pool_sorted = sorted(KNOWN_OCM_FIELDS)
    # Render 4 mező / sor a kompaktság miatt.
    for i in range(0, len(pool_sorted), 4):
        lines.append(", ".join(pool_sorted[i : i + 4]))
    lines.append("```")
    lines.append("")
    lines.append(
        "**Minimum identification target**: `order_id`. Without `order_id`, "
        "the bot MUST NOT promise remedies — it should escalate or politely "
        "ask the user to retrieve the order number from their confirmation email."
    )
    return "\n".join(lines)


def _render_helpdesk_integration(brief: SupportChatbotBrief) -> str:
    h: Card3aHelpdesk = brief.card3.helpdesk
    lines: list[str] = ["## Helpdesk integration", ""]
    if not h.has_helpdesk:
        lines.append(
            "- The vendor does NOT have a helpdesk system declared. Use "
            "descriptive routing target names (e.g. `warranty_team`, "
            "`logistics_team`); the operator can map these to real queues later."
        )
        return "\n".join(lines)

    creds = h.credentials
    if creds is None:
        lines.append(
            "- A helpdesk system is declared but credentials were not "
            "supplied at brief time. Use descriptive routing target names "
            "as a fallback."
        )
        return "\n".join(lines)

    provider = creds.provider
    lines.append(f"- Helpdesk provider: **{provider}**.")
    lines.append(f"- Connection state: **{h.connection_state}**.")
    if h.connection_state == "failed" and h.last_test_error:
        lines.append(f"- Last test error: _{h.last_test_error.strip()}_")
    if h.discovered_meta:
        # Csak a kulcsokat soroljuk fel, az értékeket nem (azok típus-fügően
        # nagy listák/dict-ek lehetnek; a Phase 1 nem használja közvetlenül).
        lines.append(
            "- Discovered metadata keys: "
            + ", ".join(sorted(str(k) for k in h.discovered_meta.keys()))
        )
    lines.append(
        "- Routing target names in the generated story should match real "
        "helpdesk queues/groups when possible (verified at pipeline runtime)."
    )
    return "\n".join(lines)


def _render_sla_and_urgency(brief: SupportChatbotBrief) -> str:
    sla: Card3bSla = brief.card3.sla
    urg: Card3cUrgency = brief.card3.urgency

    lines: list[str] = ["## SLA targets and urgency criteria", ""]
    lines.append("### SLA")
    lines.append(f"- Normal cases: response **{_sla_label(sla.normal_response)}**.")
    lines.append(f"- Urgent cases: response **{_sla_label(sla.urgent_response)}**.")
    lines.append("")
    lines.append("### Urgency triggers (automatic urgent classification)")
    for t in urg.triggers:
        lines.append(f"- {_urgency_trigger_label(t)}")
    if "other" in urg.triggers and urg.other_triggers_description:
        lines.append("")
        lines.append(
            f"**Custom urgency notes**: {urg.other_triggers_description.strip()}"
        )
    lines.append("")
    lines.append(
        "**Fixed escalation rules (non-configurable, always apply):**"
    )
    lines.append(
        "- Safety escalation: on battery_safety trigger, the bot closes "
        "immediately, gives safety guidance (do not charge, store safely), "
        "and emits an `urgent` ticket. No further questioning."
    )
    lines.append(
        "- Agent handoff: cases requiring human judgement (damage assessment, "
        "unknown lock, extended warranty exceptions) → 2-sentence closure, "
        "ticket emitted, bot only gives status updates afterwards."
    )
    lines.append(
        "- Priority escalation: urgent shipping or expired refund deadline → "
        f"ticket with **{_sla_label(sla.urgent_response)}** SLA, bot closes."
    )
    return "\n".join(lines)


def _render_out_of_scope(brief: SupportChatbotBrief) -> str:
    c5a: Card5aOffTopic = brief.card5.off_topic
    redirect = c5a.redirect_message.strip() or default_off_topic_redirect_for(
        brief.card1.locale
    )
    lines: list[str] = ["## Out-of-scope behavior", ""]
    lines.append(
        f"- Off-topic question limit: **{c5a.question_limit}** before forced "
        "redirect."
    )
    lines.append("- Redirect message:")
    lines.append("")
    lines.append("  > " + redirect.replace("\n", "\n  > "))
    if c5a.excluded_topics:
        lines.append("")
        lines.append("**Explicit excluded topics (do NOT engage):**")
        for topic in c5a.excluded_topics.split(","):
            topic = topic.strip()
            if topic:
                lines.append(f"- {topic}")
    if brief.card4.scope_out_message.strip():
        lines.append("")
        lines.append("**System-level fallback when the bot cannot help:**")
        lines.append("")
        lines.append(
            "  > " + brief.card4.scope_out_message.strip().replace("\n", "\n  > ")
        )
    return "\n".join(lines)


def _render_tone_and_style(brief: SupportChatbotBrief) -> str:
    c1 = brief.card1
    c5b: Card5bSupportAvailability = brief.card5.support_availability
    lines: list[str] = ["## Tone and style", ""]
    if c1.target_market == "b2c":
        lines.append("- Audience: consumer customers (B2C); friendly but clear.")
    elif c1.target_market == "b2b":
        lines.append("- Audience: business customers (B2B); concise and formal.")
    else:
        lines.append(
            "- Audience: mixed B2C/B2B; default to neutral-formal tone, lean "
            "friendlier for consumer signals."
        )
    locale_hint = (
        "Hungarian (use formal 'Ön' by default unless brand voice differs)"
        if c1.locale == "hu"
        else "English"
    )
    lines.append(f"- Locale and address: {locale_hint}.")
    if c5b.has_support_team and c5b.availability_slots:
        avail = ", ".join(_availability_label(s) for s in c5b.availability_slots)
        lines.append(
            f"- Support team availability ({avail}) — communicate this in "
            "escalation messages so the customer knows when to expect "
            "a human response."
        )
    return "\n".join(lines)


def _render_attached_excerpts(brief: SupportChatbotBrief) -> str:
    """Card 6 attachment preview-k idézettel a research_text-be.

    Csak a `raw_text_preview` jut be (max ~2000 char/attachment a kontrakt
    szerint). A teljes raw_text a sources táblában él, és csak akkor olvasott
    be, ha külön semantic-search query érkezik rá (V2 feature).
    """
    c6 = brief.card6
    lines: list[str] = ["## Attached source excerpts", ""]
    any_attached = False
    for kind in (
        "gtc",
        "warranty_terms",
        "faq",
        "product_grades",
        "past_tickets",
        "return_process",
    ):
        slot: SourceDocumentSlot = c6.slots[kind]  # type: ignore[index]
        if not slot.attachments:
            continue
        any_attached = True
        priority = SOURCE_DOC_PRIORITIES[kind]  # type: ignore[index]
        label = SOURCE_DOC_LABELS_HU[kind]  # type: ignore[index]
        lines.append(f"### {label} ({priority})")
        for att in slot.attachments:
            preview = (att.raw_text_preview or "").strip()
            if not preview:
                lines.append(
                    f"- _{att.name}_ — attached but not yet text-extracted."
                )
                continue
            lines.append(f"**Source: {att.name}**")
            lines.append("")
            lines.append("```")
            lines.append(preview)
            lines.append("```")
            lines.append("")
    if not any_attached:
        lines.append(
            "_(No source documents have been attached. The pipeline will "
            "rely on the brief structure above; consider attaching the GTC "
            "and warranty terms for higher-fidelity output.)_"
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Top-level deterministic renderer                                            #
# --------------------------------------------------------------------------- #


def render_brief_to_research_text(brief: SupportChatbotBrief) -> str:
    """Determinisztikus markdown render — Phase 1 közvetlen inputja.

    A 9 standard szekciót kétsoros bekezdés-elválasztással fűzi össze. A
    Phase 1 `extract_blueprint` ezt a `research_text` paraméterként kapja
    meg; a markdown szekciók megfelelnek a benchmarkként használt DOCX-ek
    struktúrájának.
    """
    title = (
        f"# Domain: {brief.card1.vendor_name.strip()} — Customer support intake\n"
    )
    sections = [
        title,
        _render_domain_context(brief),
        _render_case_families(brief),
        _render_cross_cutting_policies(brief),
        _render_always_collect_facts(brief),
        _render_helpdesk_integration(brief),
        _render_sla_and_urgency(brief),
        _render_out_of_scope(brief),
        _render_tone_and_style(brief),
        _render_attached_excerpts(brief),
    ]
    return "\n\n".join(s.rstrip() for s in sections) + "\n"


# --------------------------------------------------------------------------- #
# Public orchestrator                                                         #
# --------------------------------------------------------------------------- #


def expand_brief_to_research(
    brief: SupportChatbotBrief,
    *,
    enricher: Optional[BriefExpanderClient] = None,
) -> BriefExpansionResult:
    """Phase 0 belépő.

    1. Determinisztikus markdown render-elés.
    2. Ha `enricher` adott: AI-pass finomítás.
    3. `BriefExpansionResult` becsomagolva visszaadva.

    Idempotens, side-effect-mentes (az enricher hív API-t, ha van).
    """
    deterministic = render_brief_to_research_text(brief)
    if enricher is not None:
        research_text = enricher.enrich_brief_research(
            deterministic_markdown=deterministic,
            brief=brief,
        ).strip()
        if len(research_text) < 200:
            # Az enricher nem dobhat el információt; ha kevesebb mint a
            # min_length, visszaesünk a determinisztikus változatra.
            research_text = deterministic
    else:
        research_text = deterministic

    return BriefExpansionResult(
        research_text=research_text,
        domain_name=derive_domain_name(brief),
        locale=brief.card1.locale,
        vendor_name=brief.card1.vendor_name.strip(),
        source_brief_id=brief.brief_id,
        metadata={
            "enricher_used": enricher is not None,
            "deterministic_length": len(deterministic),
        },
    )


__all__ = [
    "BriefExpanderClient",
    "derive_domain_name",
    "render_brief_to_research_text",
    "expand_brief_to_research",
]

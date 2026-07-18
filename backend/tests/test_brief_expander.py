"""Pytest cases for `services.onboarding.brief_expander`.

A Phase 0 expander deterministic — semmi API hívás nincs a tesztekben. Az
opcionális `BriefExpanderClient` Protocol-t egy MockBriefExpanderClient
implementálja, ami szöveget toldoz a végére hogy bizonyítható legyen az
enricher tényleges meghívása.

Lefedett területek:

1. **`derive_domain_name`** — a konvenció szerint
   `"<Vendor> — Customer support intake"`.

2. **Helper renderer-ek** — minden szekció markdown-ja tartalmazza a
   releváns brief-mezők értékeit (string-keresés a kimenetben).

3. **`render_brief_to_research_text`** happy path
   - A 9 standard szekciófej (## Domain context / ## Case families / ...)
     mind jelen van.
   - A `KNOWN_OCM_FIELDS` pool listázott.
   - A 6 fix end-node-slot kontextus benne van (case families szekcióban).
   - A vendor name, business model, locale beépültek.

4. **Brief variánsok**
   - `marketplace` business_model → seller-escalation caveat megjelenik.
   - `b2b` target_market → B2B audience hint megjelenik.
   - `has_own_repair_capacity=False` + `repair` a remedy-ben → figyelmeztető
     megjegyzés a research_text-ben.
   - Üres `redirect_message` → locale-szerinti default szöveg jelenik meg.
   - Card 6-ban attachment raw_text_preview → idézett blokk a research-ben.

5. **`expand_brief_to_research`**
   - Enricher nélkül: a `research_text` pontosan a determinisztikus output.
   - Enricher-rel: a `research_text` a mock által módosított.
   - Enricher hibás (üres) outputja → visszaesés determinisztikusra.
   - `BriefExpansionResult` mezői (locale, vendor_policy='specific',
     domain_name, vendor_name, source_brief_id) a brief-ből vannak kötve.
"""
from __future__ import annotations

import pytest

from services.onboarding.brief_contracts import (
    AiPrefilledText,
    Attachment,
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
    DEFAULT_OFF_TOPIC_REDIRECT_HU,
    SupportChatbotBrief,
    WebhookCredentials,
)
from services.onboarding.brief_expander import (
    BriefExpanderClient,
    derive_domain_name,
    expand_brief_to_research,
    render_brief_to_research_text,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _make_brief(
    *,
    business_model: str = "own_inventory",
    target_market: str = "b2c",
    locale: str = "hu",
    has_own_repair_capacity: bool = True,
    primary_remedy_order: list[str] | None = None,
    excluded_topics: str | None = None,
    redirect_message: str = "",
    attach_gtc_preview: str | None = None,
) -> SupportChatbotBrief:
    c1 = Card1CompanyBasics(
        vendor_name="Acme Refurb",
        business_model=business_model,  # type: ignore[arg-type]
        target_market=target_market,  # type: ignore[arg-type]
        locale=locale,  # type: ignore[arg-type]
        website_url="https://acme.example",
    )
    c2 = Card2Operations(
        returns=Card2aReturns(
            return_window_days=30,
            return_window_starts_from="delivery",
            condition_requirements=["original_packaging", "accessories_included"],
            return_shipping_paid_by="company",
        ),
        remedy=Card2bRemedy(
            has_own_repair_capacity=has_own_repair_capacity,
            primary_remedy_order=primary_remedy_order  # type: ignore[arg-type]
            or ["replacement", "refund"],
            instant_replacement="if_in_stock",
            refund_timeline="5_7_business_days",
        ),
        shipping=Card2cShipping(
            carriers=["DPD", "GLS"],
            lost_package_handled_by="company",
            damage_report_window_value=48,
            damage_report_window_unit="hours",
        ),
    )
    c3 = Card3Backend(
        helpdesk=Card3aHelpdesk(
            has_helpdesk=True,
            credentials=WebhookCredentials(webhook_url="https://acme/hook"),
            connection_state="connected",
            discovered_meta={"queues": ["warranty", "logistics"]},
        ),
        sla=Card3bSla(),
        urgency=Card3cUrgency(),
    )
    c4 = Card4Output()
    c5 = Card5Boundaries(
        off_topic=Card5aOffTopic(
            redirect_message=redirect_message,
            excluded_topics=excluded_topics,
        ),
        support_availability=Card5bSupportAvailability(
            has_support_team=True,
            availability_slots=["weekdays_9_17"],
        ),
    )
    c6 = Card6Sources()
    if attach_gtc_preview is not None:
        c6.slots["gtc"].attachments.append(
            Attachment(
                kind="url",
                name="https://acme/gtc",
                raw_text_preview=attach_gtc_preview,
            )
        )
    return SupportChatbotBrief(
        card1=c1, card2=c2, card3=c3, card4=c4, card5=c5, card6=c6
    )


class _AppendingMockEnricher:
    """Mock `BriefExpanderClient` — szöveget toldoz a végére."""

    def __init__(self, marker: str = "\n\n<!-- enriched -->") -> None:
        self.marker = marker
        self.calls: list[str] = []

    def enrich_brief_research(
        self,
        *,
        deterministic_markdown: str,
        brief: SupportChatbotBrief,
    ) -> str:
        self.calls.append(brief.brief_id)
        return deterministic_markdown + self.marker


class _EmptyOutputMockEnricher:
    """Mock enricher amely üres szöveget ad vissza — fallback-tesztre."""

    def enrich_brief_research(
        self,
        *,
        deterministic_markdown: str,
        brief: SupportChatbotBrief,
    ) -> str:
        return ""


# Sanity: a Protocol-implementáció duck-typed, de jelezzük is.
def _is_protocol_compatible(obj: object) -> bool:
    """Strukturális ellenőrzés, hogy a mock megfelel a Protocol-nak.

    NEM runtime check (Pydantic Protocol-t nem ellenőriz), csak egy
    smoke a tesztben hogy a struktúra stimmel.
    """
    return callable(getattr(obj, "enrich_brief_research", None))


def test_mock_enricher_matches_protocol() -> None:
    enricher: BriefExpanderClient = _AppendingMockEnricher()  # type: ignore[assignment]
    assert _is_protocol_compatible(enricher)


# --------------------------------------------------------------------------- #
# 1. derive_domain_name                                                       #
# --------------------------------------------------------------------------- #


def test_derive_domain_name_convention() -> None:
    brief = _make_brief()
    assert derive_domain_name(brief) == "Acme Refurb — Customer support intake"


def test_derive_domain_name_strips_whitespace() -> None:
    brief = _make_brief()
    brief.card1.vendor_name = "  Acme Refurb  "
    assert derive_domain_name(brief) == "Acme Refurb — Customer support intake"


# --------------------------------------------------------------------------- #
# 3. render_brief_to_research_text — happy path szekciók                      #
# --------------------------------------------------------------------------- #


def test_render_includes_all_nine_section_headers() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    for header in (
        "## Domain context",
        "## Case families",
        "## Cross-cutting policies",
        "## Always-collect facts",
        "## Helpdesk integration",
        "## SLA targets",
        "## Out-of-scope",
        "## Tone and style",
        "## Attached source excerpts",
    ):
        assert header in md, f"missing section header: {header!r}"


def test_render_includes_vendor_name_in_title() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "# Domain: Acme Refurb — Customer support intake" in md


def test_render_lists_known_ocm_fields_pool() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    # A pool legalább a 'order_id' és 'tracking_number' kulcsokat listázza.
    assert "order_id" in md
    assert "tracking_number" in md
    assert "KNOWN_OCM_FIELDS" in md


def test_render_includes_six_case_family_titles() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    for title in (
        "### Return acceptance",
        "### Refund processing",
        "### Replacement",
        "### Warranty investigation",
        "### Lost package",
        "### Expired return deadline",
        "### Off-topic node",
        "### Entry / dispatcher node",
    ):
        assert title in md, f"missing case family: {title!r}"


def test_render_includes_return_window_value() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "30 days" in md
    assert "delivery date" in md  # return_window_starts_from


def test_render_includes_carrier_list() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "DPD, GLS" in md


def test_render_includes_sla_labels() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "within 48 hours" in md  # default normal SLA
    assert "within 24 hours" in md  # default urgent SLA


def test_render_includes_battery_safety_fixed_rule() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "Battery safety" in md
    assert "always urgent" in md


# --------------------------------------------------------------------------- #
# 4. Brief variánsok                                                          #
# --------------------------------------------------------------------------- #


def test_render_marketplace_business_adds_seller_caveat() -> None:
    brief = _make_brief(business_model="marketplace")
    md = render_brief_to_research_text(brief)
    assert "seller-escalation" in md.lower()


def test_render_own_inventory_omits_seller_caveat() -> None:
    brief = _make_brief(business_model="own_inventory")
    md = render_brief_to_research_text(brief)
    assert "seller-escalation" not in md.lower()


def test_render_b2b_adds_audience_hint() -> None:
    brief = _make_brief(target_market="b2b")
    md = render_brief_to_research_text(brief)
    assert "B2B" in md
    assert "formal" in md.lower()


def test_render_repair_without_capacity_emits_warning() -> None:
    brief = _make_brief(
        has_own_repair_capacity=False,
        primary_remedy_order=["repair", "refund"],
    )
    md = render_brief_to_research_text(brief)
    assert "no in-house capacity" in md.lower()
    assert "MUST NOT promise repair" in md


def test_render_empty_redirect_uses_locale_default_hu() -> None:
    brief = _make_brief(locale="hu", redirect_message="")
    md = render_brief_to_research_text(brief)
    # A default HU redirect szöveg első mondata megjelenik a quote-blokkban.
    assert DEFAULT_OFF_TOPIC_REDIRECT_HU.split(".")[0] in md


def test_render_explicit_redirect_overrides_default() -> None:
    brief = _make_brief(redirect_message="Custom redirect text.")
    md = render_brief_to_research_text(brief)
    assert "Custom redirect text." in md
    assert "Visszaküldési, garanciális" not in md


def test_render_excluded_topics_split_into_bullets() -> None:
    brief = _make_brief(excluded_topics="áralku, B2B nagyker, terméktanácsadás")
    md = render_brief_to_research_text(brief)
    assert "- áralku" in md
    assert "- B2B nagyker" in md
    assert "- terméktanácsadás" in md


def test_render_attachment_preview_appears_as_code_block() -> None:
    preview = "Returns within 30 days. No used items accepted."
    brief = _make_brief(attach_gtc_preview=preview)
    md = render_brief_to_research_text(brief)
    assert "Source: https://acme/gtc" in md
    assert preview in md


def test_render_no_attachments_emits_placeholder() -> None:
    brief = _make_brief()
    md = render_brief_to_research_text(brief)
    assert "No source documents have been attached" in md


def test_render_helpdesk_disconnected_uses_descriptive_targets() -> None:
    brief = _make_brief()
    brief.card3.helpdesk = Card3aHelpdesk(has_helpdesk=False)
    md = render_brief_to_research_text(brief)
    assert "does NOT have a helpdesk" in md
    assert "warranty_team" in md  # descriptive fallback example


# --------------------------------------------------------------------------- #
# 5. expand_brief_to_research                                                 #
# --------------------------------------------------------------------------- #


def test_expand_without_enricher_returns_deterministic() -> None:
    brief = _make_brief()
    result = expand_brief_to_research(brief)
    deterministic = render_brief_to_research_text(brief)
    assert result.research_text == deterministic
    assert result.domain_name == "Acme Refurb — Customer support intake"
    assert result.locale == "hu"
    assert result.vendor_policy == "specific"
    assert result.vendor_name == "Acme Refurb"
    assert result.source_brief_id == brief.brief_id
    assert result.metadata["enricher_used"] is False
    assert result.metadata["deterministic_length"] == len(deterministic)


def test_expand_with_enricher_uses_enriched_text() -> None:
    brief = _make_brief()
    enricher = _AppendingMockEnricher(marker="\n\n<!-- ENRICHED-BY-MOCK -->")
    result = expand_brief_to_research(brief, enricher=enricher)
    assert "<!-- ENRICHED-BY-MOCK -->" in result.research_text
    assert result.metadata["enricher_used"] is True
    assert enricher.calls == [brief.brief_id]


def test_expand_with_failing_enricher_falls_back_to_deterministic() -> None:
    brief = _make_brief()
    enricher = _EmptyOutputMockEnricher()
    result = expand_brief_to_research(brief, enricher=enricher)
    # Üres enricher → fallback a determinisztikusra (min_length=200 kerülés).
    deterministic = render_brief_to_research_text(brief)
    assert result.research_text == deterministic


def test_expand_result_meets_min_length() -> None:
    """Sanity: a minimális brief is generál min. 200 char research_text-et."""
    brief = _make_brief()
    result = expand_brief_to_research(brief)
    assert len(result.research_text) >= 200

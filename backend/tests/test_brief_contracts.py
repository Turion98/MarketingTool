"""Pytest cases for `services.onboarding.brief_contracts`.

Lefedett területek (`questell_onboarding_flow.md` 6-kártya struktúra szerint):

1. **Shared building blocks**
   - `Attachment` happy path + opcionális mezők
   - `AiPrefilledText` default state machine pozíció (`empty`)
   - `SourceDocumentSlot` kind = dict-kulcs konzisztencia

2. **`extra="forbid"` rejection** — egy mintamodell, regresszió-védelem.

3. **Card 1** — happy path + round-trip.

4. **Card 2 validátorok**
   - 2A: `has_category_specific_windows` flag-konzisztencia mindkét irányba
   - 2B: `refund_timeline='other'` ↔ `refund_timeline_other` kölcsönös kötelezőség
   - 2B: `has_extended_warranty=True` → coverage kötelező
   - 2B: `primary_remedy_order` no duplicate
   - 2C: `carriers` 'other' ↔ `carrier_other_label` konzisztencia

5. **Card 3 — Discriminated union + validátorok**
   - Mind a 4 helpdesk provider credentials round-trip
   - Ismeretlen `provider` discriminator visszautasítása
   - `has_helpdesk=False` + credentials → ValueError
   - 3B SLA default értékek (48h / 24h)
   - 3C `battery_safety` mindig benne van (akkor is ha a user kihagyta)
   - 3C duplikátum-szűrés
   - 3C `other` ↔ `other_triggers_description` konzisztencia

6. **Card 4 — End-node state machine**
   - Default factory mind a 6 slotot létrehozza `empty` állapotban
   - Ha egy kulcs hiányzik a payloadból → ValueError
   - `AiPrefilledText.status` átmenetek (csak típushelyesség, FSM állapotgép
     a backend logikájában van, nem a kontraktban)

7. **Card 5 validátorok**
   - 5B: `has_support_team=True` → legalább 1 availability_slot kötelező
   - 5B: `has_support_team=False` + slot → ValueError

8. **Card 6**
   - Default factory mind a 6 source-doc-slotot létrehozza üres listával
   - `missing_required_attachments()` helper az üres `gtc` + `warranty_terms`
     slotokat jelzi

9. **Top-level**
   - `SupportChatbotBrief` minimal init (mind a 6 kötelező kártya)
   - Round-trip lossless
   - `BriefExpansionResult` happy path + min_length 200 enforcement

10. **`default_off_topic_redirect_for`** — locale alapján a két konstans közül
   választ.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from services.onboarding.brief_contracts import (
    AiPrefilledText,
    Attachment,
    BriefExpansionResult,
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
    CategorySpecificReturnWindow,
    DEFAULT_OFF_TOPIC_REDIRECT_EN,
    DEFAULT_OFF_TOPIC_REDIRECT_HU,
    FreshdeskCredentials,
    HubSpotCredentials,
    SOURCE_DOC_PRIORITIES,
    SourceDocumentSlot,
    SupportChatbotBrief,
    WebhookCredentials,
    ZendeskCredentials,
    default_off_topic_redirect_for,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _card1() -> Card1CompanyBasics:
    return Card1CompanyBasics(
        vendor_name="Acme Refurb",
        business_model="own_inventory",
        target_market="b2c",
        locale="hu",
        website_url="https://acme.example",
    )


def _card2_returns() -> Card2aReturns:
    return Card2aReturns(
        return_window_days=30,
        return_window_starts_from="delivery",
        condition_requirements=["original_packaging", "accessories_included"],
        return_shipping_paid_by="company",
    )


def _card2_remedy() -> Card2bRemedy:
    return Card2bRemedy(
        has_own_repair_capacity=True,
        primary_remedy_order=["replacement", "refund", "repair"],
        instant_replacement="if_in_stock",
        refund_timeline="5_7_business_days",
    )


def _card2_shipping() -> Card2cShipping:
    return Card2cShipping(
        carriers=["DPD", "GLS"],
        lost_package_handled_by="company",
        damage_report_window_value=48,
        damage_report_window_unit="hours",
    )


def _card2() -> Card2Operations:
    return Card2Operations(
        returns=_card2_returns(),
        remedy=_card2_remedy(),
        shipping=_card2_shipping(),
    )


def _card3() -> Card3Backend:
    return Card3Backend(
        helpdesk=Card3aHelpdesk(has_helpdesk=False),
    )


def _card5() -> Card5Boundaries:
    return Card5Boundaries(
        support_availability=Card5bSupportAvailability(
            has_support_team=True,
            availability_slots=["weekdays_9_17"],
        ),
    )


def _minimal_brief() -> SupportChatbotBrief:
    return SupportChatbotBrief(
        card1=_card1(),
        card2=_card2(),
        card3=_card3(),
        card5=_card5(),
    )


# --------------------------------------------------------------------------- #
# 1. Shared building blocks                                                   #
# --------------------------------------------------------------------------- #


def test_attachment_minimum_fields_round_trip() -> None:
    att = Attachment(kind="file", name="policy.pdf", byte_size=4096)
    dumped = att.model_dump()
    again = Attachment.model_validate(dumped)
    assert again == att
    assert again.raw_text_preview is None
    assert again.uploaded_at is not None


def test_attachment_url_kind_without_byte_size() -> None:
    att = Attachment(kind="url", name="https://example.com/gtc")
    assert att.byte_size is None
    assert att.mime_type is None


def test_ai_prefilled_text_default_is_empty_state() -> None:
    txt = AiPrefilledText()
    assert txt.status == "empty"
    assert txt.content == ""
    assert txt.last_ai_generated_at is None
    assert txt.last_user_edited_at is None
    assert txt.last_user_approved_at is None


def test_source_document_slot_round_trip() -> None:
    slot = SourceDocumentSlot(
        kind="gtc",
        attachments=[Attachment(kind="url", name="https://example.com/gtc")],
    )
    again = SourceDocumentSlot.model_validate(slot.model_dump())
    assert again == slot
    assert len(again.attachments) == 1


# --------------------------------------------------------------------------- #
# 2. extra="forbid" rejection                                                 #
# --------------------------------------------------------------------------- #


def test_extra_forbid_rejected_on_card1() -> None:
    with pytest.raises(ValidationError) as exc:
        Card1CompanyBasics(
            vendor_name="Acme",
            business_model="own_inventory",
            target_market="b2c",
            locale="hu",
            unknown_field="should_be_rejected",  # type: ignore[call-arg]
        )
    assert "unknown_field" in str(exc.value).lower() or "extra" in str(exc.value).lower()


# --------------------------------------------------------------------------- #
# 3. Card 1                                                                   #
# --------------------------------------------------------------------------- #


def test_card1_happy_path_round_trip() -> None:
    c1 = _card1()
    again = Card1CompanyBasics.model_validate(c1.model_dump())
    assert again == c1


# --------------------------------------------------------------------------- #
# 4. Card 2 validátorok                                                       #
# --------------------------------------------------------------------------- #


def test_card2a_category_specific_window_flag_requires_list() -> None:
    with pytest.raises(ValidationError) as exc:
        Card2aReturns(
            return_window_days=30,
            return_window_starts_from="delivery",
            has_category_specific_windows=True,
            category_specific_windows=[],
            return_shipping_paid_by="company",
        )
    assert "category_specific_windows" in str(exc.value)


def test_card2a_category_list_without_flag_rejected() -> None:
    with pytest.raises(ValidationError):
        Card2aReturns(
            return_window_days=30,
            return_window_starts_from="delivery",
            has_category_specific_windows=False,
            category_specific_windows=[
                CategorySpecificReturnWindow(
                    category_label="Akku-s eszközök", return_window_days=14
                )
            ],
            return_shipping_paid_by="company",
        )


def test_card2b_refund_timeline_other_requires_text() -> None:
    with pytest.raises(ValidationError):
        Card2bRemedy(
            has_own_repair_capacity=False,
            primary_remedy_order=["refund"],
            instant_replacement="no",
            refund_timeline="other",
        )


def test_card2b_refund_timeline_text_without_other_rejected() -> None:
    with pytest.raises(ValidationError):
        Card2bRemedy(
            has_own_repair_capacity=False,
            primary_remedy_order=["refund"],
            instant_replacement="no",
            refund_timeline="5_7_business_days",
            refund_timeline_other="21 munkanap",
        )


def test_card2b_extended_warranty_requires_coverage() -> None:
    with pytest.raises(ValidationError):
        Card2bRemedy(
            has_own_repair_capacity=False,
            primary_remedy_order=["refund"],
            instant_replacement="no",
            refund_timeline="3_business_days",
            has_extended_warranty=True,
        )


def test_card2b_no_duplicate_remedies() -> None:
    with pytest.raises(ValidationError):
        Card2bRemedy(
            has_own_repair_capacity=False,
            primary_remedy_order=["refund", "refund", "replacement"],
            instant_replacement="no",
            refund_timeline="3_business_days",
        )


def test_card2c_other_carrier_requires_label() -> None:
    with pytest.raises(ValidationError):
        Card2cShipping(
            carriers=["DPD", "other"],
            lost_package_handled_by="company",
            damage_report_window_value=48,
            damage_report_window_unit="hours",
        )


def test_card2c_other_label_without_other_rejected() -> None:
    with pytest.raises(ValidationError):
        Card2cShipping(
            carriers=["DPD"],
            carrier_other_label="Magyar Posta",
            lost_package_handled_by="company",
            damage_report_window_value=48,
            damage_report_window_unit="hours",
        )


# --------------------------------------------------------------------------- #
# 5. Card 3 — Discriminated union + validátorok                               #
# --------------------------------------------------------------------------- #


def test_helpdesk_zendesk_round_trip() -> None:
    creds = ZendeskCredentials(
        subdomain="acme", admin_email="admin@acme.example", api_token="tok"
    )
    card = Card3aHelpdesk(
        has_helpdesk=True, credentials=creds, connection_state="connected"
    )
    again = Card3aHelpdesk.model_validate(card.model_dump())
    assert again.credentials is not None
    assert again.credentials.provider == "zendesk"  # type: ignore[union-attr]
    assert again.credentials.subdomain == "acme"  # type: ignore[union-attr]


def test_helpdesk_freshdesk_round_trip() -> None:
    creds = FreshdeskCredentials(subdomain="acme", api_key="k")
    card = Card3aHelpdesk(has_helpdesk=True, credentials=creds)
    again = Card3aHelpdesk.model_validate(card.model_dump())
    assert again.credentials is not None
    assert again.credentials.provider == "freshdesk"  # type: ignore[union-attr]


def test_helpdesk_hubspot_round_trip() -> None:
    creds = HubSpotCredentials(oauth_access_token="tok", portal_id="42")
    card = Card3aHelpdesk(has_helpdesk=True, credentials=creds)
    again = Card3aHelpdesk.model_validate(card.model_dump())
    assert again.credentials is not None
    assert again.credentials.provider == "hubspot"  # type: ignore[union-attr]


def test_helpdesk_webhook_round_trip() -> None:
    creds = WebhookCredentials(webhook_url="https://example.com/hook")
    card = Card3aHelpdesk(has_helpdesk=True, credentials=creds)
    again = Card3aHelpdesk.model_validate(card.model_dump())
    assert again.credentials is not None
    assert again.credentials.provider == "other"  # type: ignore[union-attr]


def test_helpdesk_unknown_provider_rejected() -> None:
    with pytest.raises(ValidationError):
        Card3aHelpdesk.model_validate(
            {
                "has_helpdesk": True,
                "credentials": {
                    "provider": "salesforce",
                    "api_key": "x",
                },
            }
        )


def test_helpdesk_credentials_without_has_helpdesk_rejected() -> None:
    with pytest.raises(ValidationError):
        Card3aHelpdesk(
            has_helpdesk=False,
            credentials=WebhookCredentials(webhook_url="https://x/hook"),
        )


def test_card3b_sla_default_values() -> None:
    sla = Card3bSla()
    assert sla.normal_response == "48h"
    assert sla.urgent_response == "24h"


def test_card3c_battery_safety_auto_inserted() -> None:
    """Akkor is benne kell hogy legyen ha a user explicit kihagyta."""
    c = Card3cUrgency(triggers=["lost_package_urgent"])
    assert "battery_safety" in c.triggers
    # Sorrend: battery_safety előrekerült.
    assert c.triggers[0] == "battery_safety"


def test_card3c_default_factory_includes_battery_safety() -> None:
    c = Card3cUrgency()
    assert c.triggers == ["battery_safety"]


def test_card3c_deduplicates_battery_safety() -> None:
    c = Card3cUrgency(triggers=["battery_safety", "dead_on_arrival", "battery_safety"])
    assert c.triggers.count("battery_safety") == 1
    assert "dead_on_arrival" in c.triggers


def test_card3c_other_requires_description() -> None:
    with pytest.raises(ValidationError):
        Card3cUrgency(triggers=["other"])


def test_card3c_description_without_other_rejected() -> None:
    with pytest.raises(ValidationError):
        Card3cUrgency(
            triggers=["dead_on_arrival"],
            other_triggers_description="should not be here",
        )


# --------------------------------------------------------------------------- #
# 6. Card 4 — End-node state machine                                          #
# --------------------------------------------------------------------------- #


def test_card4_default_factory_creates_all_six_empty_slots() -> None:
    c4 = Card4Output()
    expected = {
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    }
    assert set(c4.end_node_texts.keys()) == expected
    for slot in c4.end_node_texts.values():
        assert slot.status == "empty"
        assert slot.content == ""


def test_card4_missing_end_node_key_rejected() -> None:
    payload = {
        "end_node_texts": {
            "return_accepted": AiPrefilledText().model_dump(),
            # 5 másik kulcs hiányzik
        },
        "scope_out_message": "",
    }
    with pytest.raises(ValidationError):
        Card4Output.model_validate(payload)


def test_ai_prefilled_text_status_transitions_are_valid_literals() -> None:
    for status in (
        "empty",
        "ai_generating",
        "ai_prefilled",
        "user_approved",
        "user_edited",
    ):
        AiPrefilledText(status=status, content="x")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        AiPrefilledText(status="bogus")  # type: ignore[arg-type]


# --------------------------------------------------------------------------- #
# 7. Card 5 validátorok                                                       #
# --------------------------------------------------------------------------- #


def test_card5b_has_support_team_requires_availability() -> None:
    with pytest.raises(ValidationError):
        Card5bSupportAvailability(has_support_team=True, availability_slots=[])


def test_card5b_availability_without_team_rejected() -> None:
    with pytest.raises(ValidationError):
        Card5bSupportAvailability(
            has_support_team=False, availability_slots=["weekdays_9_17"]
        )


def test_card5a_off_topic_default_question_limit_is_two() -> None:
    c5a = Card5aOffTopic()
    assert c5a.question_limit == 2
    assert c5a.redirect_message == ""


# --------------------------------------------------------------------------- #
# 8. Card 6                                                                   #
# --------------------------------------------------------------------------- #


def test_card6_default_factory_creates_all_six_slots() -> None:
    c6 = Card6Sources()
    expected = {
        "gtc",
        "warranty_terms",
        "faq",
        "product_grades",
        "past_tickets",
        "return_process",
    }
    assert set(c6.slots.keys()) == expected
    for kind, slot in c6.slots.items():
        assert slot.kind == kind
        assert slot.attachments == []


def test_card6_missing_required_attachments_helper() -> None:
    c6 = Card6Sources()
    missing = c6.missing_required_attachments()
    assert set(missing) == {"gtc", "warranty_terms"}
    # Töltsük fel a gtc-t.
    c6.slots["gtc"].attachments.append(
        Attachment(kind="url", name="https://acme/gtc")
    )
    missing_after = c6.missing_required_attachments()
    assert missing_after == ["warranty_terms"]


def test_card6_kind_mismatch_with_dict_key_rejected() -> None:
    """A slot.kind és a dict-kulcs konzisztens kell legyen."""
    bad_slots = {
        "gtc": SourceDocumentSlot(kind="warranty_terms"),  # mismatch!
        "warranty_terms": SourceDocumentSlot(kind="warranty_terms"),
        "faq": SourceDocumentSlot(kind="faq"),
        "product_grades": SourceDocumentSlot(kind="product_grades"),
        "past_tickets": SourceDocumentSlot(kind="past_tickets"),
        "return_process": SourceDocumentSlot(kind="return_process"),
    }
    with pytest.raises(ValidationError):
        Card6Sources(slots=bad_slots)  # type: ignore[arg-type]


def test_source_doc_priorities_lookup() -> None:
    """Sanity check a constants tábla a doksival egyezik."""
    assert SOURCE_DOC_PRIORITIES["gtc"] == "required"
    assert SOURCE_DOC_PRIORITIES["warranty_terms"] == "required"
    assert SOURCE_DOC_PRIORITIES["faq"] == "strongly_recommended"
    assert SOURCE_DOC_PRIORITIES["product_grades"] == "recommended"
    assert SOURCE_DOC_PRIORITIES["past_tickets"] == "optional"
    assert SOURCE_DOC_PRIORITIES["return_process"] == "optional"


# --------------------------------------------------------------------------- #
# 9. Top-level brief                                                          #
# --------------------------------------------------------------------------- #


def test_support_chatbot_brief_minimal_init() -> None:
    brief = _minimal_brief()
    assert brief.draft_status == "draft"
    assert brief.brief_id  # auto UUID
    assert brief.card1.vendor_name == "Acme Refurb"
    # Card 4 + 6 auto-feltöltöttek default_factory-vel.
    assert len(brief.card4.end_node_texts) == 6
    assert len(brief.card6.slots) == 6


def test_support_chatbot_brief_round_trip_lossless() -> None:
    brief = _minimal_brief()
    dumped = brief.model_dump(mode="json")
    again = SupportChatbotBrief.model_validate(dumped)
    assert again.model_dump(mode="json") == dumped


def test_brief_expansion_result_happy_path() -> None:
    long_text = "x" * 250  # min_length=200
    res = BriefExpansionResult(
        research_text=long_text,
        domain_name="Acme complaint intake",
        locale="hu",
        vendor_name="Acme Refurb",
        source_brief_id="brief-123",
    )
    assert res.vendor_policy == "specific"
    again = BriefExpansionResult.model_validate(res.model_dump(mode="json"))
    assert again == res


def test_brief_expansion_result_min_length_enforced() -> None:
    short_text = "too short"  # < 200
    with pytest.raises(ValidationError):
        BriefExpansionResult(
            research_text=short_text,
            domain_name="x",
            locale="hu",
            vendor_name="y",
            source_brief_id="brief-123",
        )


# --------------------------------------------------------------------------- #
# 10. Helper                                                                  #
# --------------------------------------------------------------------------- #


def test_default_off_topic_redirect_locale_branch() -> None:
    assert default_off_topic_redirect_for("hu") == DEFAULT_OFF_TOPIC_REDIRECT_HU
    assert default_off_topic_redirect_for("en") == DEFAULT_OFF_TOPIC_REDIRECT_EN

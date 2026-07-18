"""Pytest cases for `support_engine.services.onboarding.end_node_text_generator`.

A modul a Card 4A (`AiPrefilledText` state machine) AI-generálását kapszulázza.
A tesztek minden réteget lefednek:

1. **Tool schema**
   - 6 EndNodeKind kulcs mind `required`
   - `additionalProperties: false`
   - min/max length határok érvényesek

2. **Prompt builderek**
   - System prompt locale-szerinti style-utasítást tartalmaz (HU: formal "Ön",
     EN: second person "you")
   - User message tartalmazza a Card 1 + Card 2 lényeges policy-értékeit
   - Card 4 `scope_out_message` ha kitöltött → "STYLE REFERENCE" blokk

3. **`generate_end_node_texts`** (happy + edge case-ek)
   - Mock client visszadja mind a 6 kulcsot → dict happy path
   - Hiányzó kulcs → RuntimeError
   - Üres string érték → RuntimeError
   - Whitespace-only érték → RuntimeError
   - Extra (hallucinált) kulcs → RuntimeError
   - Non-dict visszatérés → RuntimeError

4. **`apply_generated_end_node_texts`** state machine
   - `empty` slot → `ai_prefilled` (content + status + timestamp)
   - `ai_prefilled` slot → felülírva
   - `user_approved` slot → felülírva
   - `user_edited` slot → MEGTARTVA (default overwrite_user_edits=False)
   - `user_edited` slot + `overwrite_user_edits=True` → felülírva
   - `applied` return dict csak a tényleges változásokat tartalmazza
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from support_engine.services.onboarding.brief_contracts import (
    AiPrefilledText,
    Card1CompanyBasics,
    Card2Operations,
    Card2aReturns,
    Card2bRemedy,
    Card2cShipping,
    Card3Backend,
    Card3aHelpdesk,
    Card4Output,
    Card5aOffTopic,
    Card5bSupportAvailability,
    Card5Boundaries,
    EndNodeKind,
    SupportChatbotBrief,
)
from support_engine.services.onboarding.end_node_text_generator import (
    EndNodeTextClient,
    apply_generated_end_node_texts,
    build_end_node_system_prompt,
    build_end_node_user_message,
    build_generate_end_node_texts_tool,
    generate_end_node_texts,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _make_brief(
    *,
    locale: str = "hu",
    scope_out_message: str = "",
) -> SupportChatbotBrief:
    return SupportChatbotBrief(
        card1=Card1CompanyBasics(
            vendor_name="Acme Refurb",
            business_model="own_inventory",
            target_market="b2c",
            locale=locale,  # type: ignore[arg-type]
        ),
        card2=Card2Operations(
            returns=Card2aReturns(
                return_window_days=30,
                return_window_starts_from="delivery",
                condition_requirements=["original_packaging"],
                return_shipping_paid_by="company",
            ),
            remedy=Card2bRemedy(
                has_own_repair_capacity=False,
                primary_remedy_order=["replacement", "refund"],
                instant_replacement="if_in_stock",
                refund_timeline="5_7_business_days",
            ),
            shipping=Card2cShipping(
                carriers=["DPD"],
                lost_package_handled_by="company",
                damage_report_window_value=48,
                damage_report_window_unit="hours",
            ),
        ),
        card3=Card3Backend(helpdesk=Card3aHelpdesk(has_helpdesk=False)),
        card4=Card4Output(scope_out_message=scope_out_message),
        card5=Card5Boundaries(
            off_topic=Card5aOffTopic(),
            support_availability=Card5bSupportAvailability(
                has_support_team=True,
                availability_slots=["weekdays_9_17"],
            ),
        ),
    )


def _full_generated_payload() -> dict[str, str]:
    """Minden 6 kulcsot tartalmazó mock-payload, mind valid hosszú szöveggel."""
    return {
        "return_accepted": (
            "Visszaküldésed elfogadva. A csomagot 30 napon belül küldd "
            "vissza eredeti csomagolásban; futárcímkét e-mailben küldünk."
        ),
        "refund_initiated": (
            "Visszatérítésed elindult. 5-7 munkanap alatt megérkezik az "
            "eredeti fizetési módra."
        ),
        "replacement_initiated": (
            "Csere elindítva. Készleten lévő darab esetén néhány napon "
            "belül kiszállítjuk."
        ),
        "warranty_investigation": (
            "Garanciás panaszodat rögzítettük és megkezdjük a vizsgálatát. "
            "A vizsgálat eredménye után közöljük a megoldást."
        ),
        "lost_package": (
            "Elveszett csomagod ügyét felvettük. A DPD-nél mi indítjuk a "
            "kárigényt; további teendőd nincs."
        ),
        "expired_return_deadline": (
            "Sajnos a 30 napos visszaküldési határidő már lejárt, így ez "
            "az ügy a meglévő szabályaink szerint nem teljesíthető."
        ),
    }


class _DictMockClient:
    """Mock `EndNodeTextClient` — előre megadott dict-tel tér vissza."""

    def __init__(self, payload: dict[str, str]) -> None:
        self.payload = payload
        self.calls: list[tuple[str, str]] = []

    def generate_end_node_texts(
        self,
        *,
        system_prompt: str,
        user_message: str,
    ) -> dict[str, str]:
        self.calls.append((system_prompt, user_message))
        return dict(self.payload)


class _NonDictMockClient:
    def generate_end_node_texts(
        self, *, system_prompt: str, user_message: str
    ):  # type: ignore[no-untyped-def]
        return "not a dict at all"


# --------------------------------------------------------------------------- #
# 1. Tool schema                                                              #
# --------------------------------------------------------------------------- #


def test_tool_schema_has_six_required_keys() -> None:
    tool = build_generate_end_node_texts_tool()
    required = set(tool["input_schema"]["required"])
    expected = {
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    }
    assert required == expected
    assert tool["name"] == "generate_end_node_texts"


def test_tool_schema_forbids_additional_properties() -> None:
    tool = build_generate_end_node_texts_tool()
    assert tool["input_schema"]["additionalProperties"] is False


def test_tool_schema_enforces_min_max_length() -> None:
    tool = build_generate_end_node_texts_tool(min_chars=50, max_chars=400)
    props = tool["input_schema"]["properties"]
    for key in (
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    ):
        assert props[key]["minLength"] == 50
        assert props[key]["maxLength"] == 400
        assert props[key]["type"] == "string"


# --------------------------------------------------------------------------- #
# 2. Prompt builderek                                                         #
# --------------------------------------------------------------------------- #


def test_system_prompt_locale_hu_uses_formal_address() -> None:
    brief = _make_brief(locale="hu")
    sp = build_end_node_system_prompt(brief)
    assert "Hungarian (hu)" in sp
    assert "formal address (Ön)" in sp


def test_system_prompt_locale_en_uses_second_person() -> None:
    brief = _make_brief(locale="en")
    sp = build_end_node_system_prompt(brief)
    assert "English (en)" in sp
    assert "second person (you)" in sp


def test_system_prompt_lists_all_six_required_keys() -> None:
    brief = _make_brief()
    sp = build_end_node_system_prompt(brief)
    for key in (
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    ):
        assert key in sp


def test_system_prompt_forbids_escalation_references() -> None:
    brief = _make_brief()
    sp = build_end_node_system_prompt(brief)
    assert "escalation flow" in sp.lower()
    assert "fixed mechanism" in sp.lower()


def test_user_message_contains_card2_concrete_values() -> None:
    brief = _make_brief()
    um = build_end_node_user_message(brief)
    assert "VENDOR: Acme Refurb" in um
    assert "30 days from delivery" in um
    assert "5-7 business days" in um
    assert "DPD" in um
    assert "48 hours" in um


def test_user_message_includes_scope_out_as_style_reference_when_set() -> None:
    brief = _make_brief(scope_out_message="Ezt sajnos nem tudom intézni.")
    um = build_end_node_user_message(brief)
    assert "STYLE REFERENCE" in um
    assert "Ezt sajnos nem tudom intézni." in um


def test_user_message_omits_style_reference_when_scope_out_empty() -> None:
    brief = _make_brief(scope_out_message="")
    um = build_end_node_user_message(brief)
    assert "STYLE REFERENCE" not in um


# --------------------------------------------------------------------------- #
# 3. generate_end_node_texts                                                  #
# --------------------------------------------------------------------------- #


def test_generate_happy_path_returns_six_keys() -> None:
    brief = _make_brief()
    client = _DictMockClient(_full_generated_payload())
    result = generate_end_node_texts(brief=brief, client=client)
    assert set(result.keys()) == {
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    }
    for v in result.values():
        assert v.strip()
    # A client meg lett hívva pontosan egyszer.
    assert len(client.calls) == 1


def test_generate_strips_whitespace_from_values() -> None:
    payload = _full_generated_payload()
    payload["refund_initiated"] = "  trimmed text here.  "
    brief = _make_brief()
    result = generate_end_node_texts(
        brief=brief, client=_DictMockClient(payload)
    )
    assert result["refund_initiated"] == "trimmed text here."


def test_generate_missing_key_raises() -> None:
    payload = _full_generated_payload()
    del payload["lost_package"]
    brief = _make_brief()
    with pytest.raises(RuntimeError) as exc:
        generate_end_node_texts(brief=brief, client=_DictMockClient(payload))
    assert "lost_package" in str(exc.value)


def test_generate_empty_value_raises() -> None:
    payload = _full_generated_payload()
    payload["return_accepted"] = ""
    brief = _make_brief()
    with pytest.raises(RuntimeError) as exc:
        generate_end_node_texts(brief=brief, client=_DictMockClient(payload))
    assert "return_accepted" in str(exc.value)


def test_generate_whitespace_only_value_raises() -> None:
    payload = _full_generated_payload()
    payload["replacement_initiated"] = "   \n  \t "
    brief = _make_brief()
    with pytest.raises(RuntimeError):
        generate_end_node_texts(brief=brief, client=_DictMockClient(payload))


def test_generate_extra_key_raises() -> None:
    payload = _full_generated_payload()
    payload["hallucinated_extra"] = "should not be here"
    brief = _make_brief()
    with pytest.raises(RuntimeError) as exc:
        generate_end_node_texts(brief=brief, client=_DictMockClient(payload))
    assert "hallucinated_extra" in str(exc.value)


def test_generate_non_dict_response_raises() -> None:
    brief = _make_brief()
    with pytest.raises(RuntimeError):
        generate_end_node_texts(brief=brief, client=_NonDictMockClient())  # type: ignore[arg-type]


# --------------------------------------------------------------------------- #
# 4. apply_generated_end_node_texts state machine                             #
# --------------------------------------------------------------------------- #


def _fresh_card4_with_states(
    states: dict[EndNodeKind, str],
    contents: dict[EndNodeKind, str] | None = None,
) -> Card4Output:
    """Card4Output a megadott (status, content) párokkal."""
    card4 = Card4Output()
    for kind, status in states.items():
        card4.end_node_texts[kind] = AiPrefilledText(
            status=status,  # type: ignore[arg-type]
            content=(contents or {}).get(kind, f"existing {kind}"),
        )
    return card4


def test_apply_overwrites_empty_slot() -> None:
    card4 = _fresh_card4_with_states({"return_accepted": "empty"})
    now = datetime.now(timezone.utc)
    applied = apply_generated_end_node_texts(
        card4=card4,
        generated={"return_accepted": "new ai text for return"},
        generated_at=now,
    )
    slot = card4.end_node_texts["return_accepted"]
    assert slot.content == "new ai text for return"
    assert slot.status == "ai_prefilled"
    assert slot.last_ai_generated_at == now
    assert applied == {"return_accepted": "new ai text for return"}


def test_apply_overwrites_ai_prefilled_slot() -> None:
    card4 = _fresh_card4_with_states(
        {"refund_initiated": "ai_prefilled"},
        {"refund_initiated": "old prefilled"},
    )
    now = datetime.now(timezone.utc)
    apply_generated_end_node_texts(
        card4=card4,
        generated={"refund_initiated": "regenerated"},
        generated_at=now,
    )
    assert card4.end_node_texts["refund_initiated"].content == "regenerated"
    assert card4.end_node_texts["refund_initiated"].status == "ai_prefilled"


def test_apply_overwrites_user_approved_slot() -> None:
    """`user_approved` = a user csak rákattintott a változatlan generáltra."""
    card4 = _fresh_card4_with_states(
        {"warranty_investigation": "user_approved"},
        {"warranty_investigation": "old approved"},
    )
    now = datetime.now(timezone.utc)
    apply_generated_end_node_texts(
        card4=card4,
        generated={"warranty_investigation": "fresh warranty text"},
        generated_at=now,
    )
    slot = card4.end_node_texts["warranty_investigation"]
    assert slot.content == "fresh warranty text"
    assert slot.status == "ai_prefilled"


def test_apply_preserves_user_edited_by_default() -> None:
    card4 = _fresh_card4_with_states(
        {"lost_package": "user_edited"},
        {"lost_package": "user wrote this carefully"},
    )
    now = datetime.now(timezone.utc)
    applied = apply_generated_end_node_texts(
        card4=card4,
        generated={"lost_package": "ai trying to overwrite"},
        generated_at=now,
    )
    slot = card4.end_node_texts["lost_package"]
    assert slot.content == "user wrote this carefully"
    assert slot.status == "user_edited"
    # Az applied-ben NINCS benne ez a kulcs.
    assert "lost_package" not in applied


def test_apply_overwrites_user_edited_when_explicitly_requested() -> None:
    card4 = _fresh_card4_with_states(
        {"lost_package": "user_edited"},
        {"lost_package": "user wrote this"},
    )
    now = datetime.now(timezone.utc)
    applied = apply_generated_end_node_texts(
        card4=card4,
        generated={"lost_package": "AI-overwritten with consent"},
        generated_at=now,
        overwrite_user_edits=True,
    )
    slot = card4.end_node_texts["lost_package"]
    assert slot.content == "AI-overwritten with consent"
    assert slot.status == "ai_prefilled"
    assert applied == {"lost_package": "AI-overwritten with consent"}


def test_apply_mixed_states_only_returns_changed_keys() -> None:
    card4 = _fresh_card4_with_states(
        {
            "return_accepted": "empty",
            "refund_initiated": "user_edited",  # skip
            "warranty_investigation": "ai_prefilled",
        },
        {
            "refund_initiated": "user version",
            "warranty_investigation": "old prefilled",
        },
    )
    now = datetime.now(timezone.utc)
    generated = {
        "return_accepted": "new return text",
        "refund_initiated": "ai would overwrite",
        "warranty_investigation": "new warranty text",
    }
    applied = apply_generated_end_node_texts(
        card4=card4, generated=generated, generated_at=now  # type: ignore[arg-type]
    )
    # 2 felülírva (empty + ai_prefilled), 1 skip (user_edited).
    assert set(applied.keys()) == {"return_accepted", "warranty_investigation"}
    assert card4.end_node_texts["refund_initiated"].content == "user version"
    assert card4.end_node_texts["refund_initiated"].status == "user_edited"

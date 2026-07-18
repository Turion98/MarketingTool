"""Card 4A — end-node-szöveg generátor (külön AI hívás a fő pipeline-tól).

Ez NEM a Phase 1-3 része: egy önálló, kis AI hívás, ami a 6 fix end-node-szöveget
generálja a Card 1 + Card 2 (+ opcionális Card 4 scope_out_message) alapján.

A frontend-flow szerint a hívás MIKOR fut:

1. **Trigger**: a user a Card 2-t **első alkalommal** menti (tehát továbblép
   Card 3-ra). A backend a háttérben elindítja a generálást.
2. **Eredmény**: a 6 string a Card 4 `end_node_texts` dict-jébe kerül, az
   `AiPrefilledText.status` mező `"ai_generating"` → `"ai_prefilled"`
   átmenettel.
3. **Re-trigger**: ha a user Card 2-t **újra menti**, a backend NEM hív
   automatikusan újra; a frontend egy center-toast warning-gel jelzi a usernek
   hogy a Card 4 érintett lesz, és a Card 4-en a `[↻ Újragenerálás]` gomb
   highlighted állapotba kerül. A user dönti el kattint-e.
4. **User-edited védelem**: a `apply_generated_end_node_texts(card4, gen)`
   helper soha NEM írja felül a `status="user_edited"` slotokat —
   azokat a user explicit "felülírom" megerősítése után frissíti egy
   separate route-handler (out-of-scope ehhez a modulhoz).

Tartalmi tervezési alapelvek (a prompt):

* **Locale-tudatos**: HU vs EN külön style-utasítás, megszólítás (HU: Ön).
* **2-4 mondat / szöveg**: tömör, konkrét, customer-facing.
* **Konkrét policy-értékeket beleszövi**: visszaküldési határidő, refund
  timeline, ki fizeti a szállítást stb. NEM általánosít.
* **Brand-tartózkodás**: vendor_name nélkül is működnie kell (a runtime
  szövegnek nem kell vendor-szignó).
* **Eszkalációra NEM utal**: az eszkaláció utáni viselkedés fix panel
  (Card 5C), és külön kezelt — az end-node szöveg nem mondja hogy "egy
  kollégánk visszahív" stb.

A tool kontraktja: egyetlen `generate_end_node_texts` tool, ami egy
`{<end_node_kind>: str}` dict-et ad vissza. Mind a 6 kulcs kötelező, minden
érték 30-800 karakter (tool-input schema kényszerítve).
"""

from __future__ import annotations

from typing import Any, Protocol

from support_engine.services.onboarding.brief_contracts import (
    AiPrefilledText,
    Card4Output,
    EndNodeKind,
    SupportChatbotBrief,
)


# --------------------------------------------------------------------------- #
# Client protocol                                                             #
# --------------------------------------------------------------------------- #


class EndNodeTextClient(Protocol):
    """A Card 4A generálás AI-kontraktja.

    Production-implementáció: `AnthropicOnboardingClient.generate_end_node_texts`
    (V2-ben kerül beépítésre). Teszt-implementáció: a `MockEndNodeTextClient`
    a unit tesztekben — determinisztikus mock-szövegeket ad vissza.
    """

    def generate_end_node_texts(
        self,
        *,
        system_prompt: str,
        user_message: str,
    ) -> dict[str, str]:
        """Egy tool-call, visszaad egy `{<EndNodeKind>: str}` dict-et.

        A tool input-schema-ja kényszeríti, hogy mind a 6 EndNodeKind kulcs
        jelen legyen, és minden érték 30-800 karakter között. A hívó
        (`generate_end_node_texts` modul-szintű függvény) ezt utánvalidálja
        Python-szintű enforce-szal.
        """
        ...


# --------------------------------------------------------------------------- #
# Tool schema                                                                 #
# --------------------------------------------------------------------------- #


_END_NODE_KIND_PROPERTIES: dict[EndNodeKind, str] = {
    "return_accepted": (
        "Return acceptance message — the bot confirms the customer's return "
        "request meets policy and tells them the next concrete step."
    ),
    "refund_initiated": (
        "Refund initiated message — confirms refund is being processed, "
        "states the expected timeline and the amount source."
    ),
    "replacement_initiated": (
        "Replacement initiated message — confirms a replacement device is "
        "being arranged and what the customer can expect."
    ),
    "warranty_investigation": (
        "Warranty investigation message — acknowledges receipt of the "
        "complaint and explains the investigation process at a high level."
    ),
    "lost_package": (
        "Lost package message — acknowledges the issue and states who will "
        "initiate the carrier claim and what the customer needs to do."
    ),
    "expired_return_deadline": (
        "Expired-return message — politely informs the customer that the "
        "return window has passed; explains the policy without judgement."
    ),
}


def build_generate_end_node_texts_tool(
    *,
    min_chars: int = 30,
    max_chars: int = 800,
) -> dict[str, Any]:
    """Anthropic tool schema a Card 4A generáláshoz.

    Mind a 6 EndNodeKind kötelező; mindegyik értéke kötött hosszúságú
    plain-text. `additionalProperties: false` a hallucinált kulcsok ellen.
    """
    properties: dict[str, Any] = {}
    for kind, desc in _END_NODE_KIND_PROPERTIES.items():
        properties[kind] = {
            "type": "string",
            "description": desc,
            "minLength": min_chars,
            "maxLength": max_chars,
        }
    return {
        "name": "generate_end_node_texts",
        "description": (
            "Generate the 6 customer-facing end-node messages for a "
            "support chatbot, based on the vendor's return policy, remedy "
            "hierarchy, and shipping rules. Call exactly once with all 6 "
            "keys."
        ),
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": list(_END_NODE_KIND_PROPERTIES.keys()),
            "additionalProperties": False,
        },
    }


# --------------------------------------------------------------------------- #
# Prompt builders                                                             #
# --------------------------------------------------------------------------- #


def _format_card2_context(brief: SupportChatbotBrief) -> list[str]:
    """Kompakt Card 2 markdown az end-node prompt-hoz.

    Csak a végszövegek megírásához szükséges konkrét értékeket adja át —
    NEM a teljes Phase 1 research_text. Így a context window kicsi marad.
    """
    c2 = brief.card2
    lines: list[str] = []

    # 2A
    lines.append(
        f"- Return window: {c2.returns.return_window_days} days from "
        f"{c2.returns.return_window_starts_from} date."
    )
    if c2.returns.has_category_specific_windows:
        lines.append(
            "  - Category-specific overrides exist (do not pick a number "
            "without context; phrase generically)."
        )
    if c2.returns.condition_requirements:
        cond_pretty = ", ".join(
            {
                "original_packaging": "original packaging required",
                "accessories_included": "accessories included",
                "factory_reset": "factory reset required",
                "any_condition": "any condition accepted",
            }.get(r, r)
            for r in c2.returns.condition_requirements
        )
        lines.append(f"- Acceptance conditions: {cond_pretty}.")
    lines.append(
        "- Return shipping cost: "
        + {
            "company": "company pays",
            "customer": "customer pays",
            "case_by_case": "case-by-case",
        }[c2.returns.return_shipping_paid_by]
        + "."
    )

    # 2B
    lines.append(
        f"- In-house repair capacity: "
        f"{'yes' if c2.remedy.has_own_repair_capacity else 'no'}."
    )
    remedy_pretty = " → ".join(
        {
            "refund": "Refund",
            "replacement": "Replacement",
            "repair": "Repair",
            "partial_refund": "Partial refund",
        }.get(r, r)
        for r in c2.remedy.primary_remedy_order
    )
    lines.append(f"- Remedy preference order: {remedy_pretty}.")
    lines.append(
        "- Instant replacement: "
        + {
            "always": "always available",
            "if_in_stock": "if stock available",
            "no": "not offered",
        }[c2.remedy.instant_replacement]
        + "."
    )
    refund_label = {
        "3_business_days": "within 3 business days",
        "5_7_business_days": "within 5-7 business days",
        "14_business_days": "within 14 business days",
    }.get(c2.remedy.refund_timeline, c2.remedy.refund_timeline_other or "custom")
    lines.append(f"- Refund processing: {refund_label}.")

    # 2C
    carriers_pretty = ", ".join(c for c in c2.shipping.carriers if c != "other")
    if "other" in c2.shipping.carriers and c2.shipping.carrier_other_label:
        if carriers_pretty:
            carriers_pretty += f", {c2.shipping.carrier_other_label}"
        else:
            carriers_pretty = c2.shipping.carrier_other_label
    lines.append(f"- Carriers: {carriers_pretty}.")
    lines.append(
        "- Lost-package claim initiated by: "
        + {
            "company": "the company",
            "customer": "the customer",
            "case_by_case": "case-by-case decision",
        }[c2.shipping.lost_package_handled_by]
        + "."
    )
    lines.append(
        f"- Damaged/incomplete package reporting deadline: "
        f"{c2.shipping.damage_report_window_value} "
        f"{c2.shipping.damage_report_window_unit}."
    )
    return lines


def build_end_node_system_prompt(brief: SupportChatbotBrief) -> str:
    """System prompt a Card 4A generáláshoz."""
    locale = brief.card1.locale
    if locale == "hu":
        locale_clause = (
            "TARGET LOCALE: Hungarian (hu). Use formal address (Ön) unless "
            "the customer brand voice is informal. Use Hungarian conventions "
            "for dates and numbers."
        )
    else:
        locale_clause = (
            "TARGET LOCALE: English (en). Use clear, polite customer-service "
            "register; second person (you)."
        )

    return (
        "You generate customer-facing end-node messages for a support "
        "chatbot. Each message is shown to the customer when their case "
        "reaches a specific outcome (return accepted, refund initiated, "
        "etc.). The messages MUST sound concrete and tied to the vendor's "
        "actual policies — generic boilerplate is rejected.\n\n"
        f"{locale_clause}\n\n"
        "STYLE GUARDRAILS:\n"
        "- 2-4 sentences per message, concise and actionable.\n"
        "- State the concrete policy value where relevant (deadline days, "
        "refund timeline, carrier name, packaging rules).\n"
        "- Do NOT include URLs, phone numbers, agent names, or future "
        "promises beyond what the brief states.\n"
        "- Do NOT reference the escalation flow ('a colleague will call you', "
        "'we will reach out shortly') — escalation behavior is handled by a "
        "separate fixed mechanism, not by these end-node texts.\n"
        "- Do NOT include the vendor name verbatim unless it improves "
        "clarity; the runtime layer can prepend a greeting.\n"
        "- For the `expired_return_deadline` message: be empathetic but "
        "firm — do NOT promise exceptions.\n"
        "- For `warranty_investigation`: avoid promising a specific outcome; "
        "describe the investigation process.\n\n"
        "Call the `generate_end_node_texts` tool exactly once with all 6 "
        "keys: return_accepted, refund_initiated, replacement_initiated, "
        "warranty_investigation, lost_package, expired_return_deadline."
    )


def build_end_node_user_message(brief: SupportChatbotBrief) -> str:
    """User message — kompakt brief-context az AI hívás-bemenete."""
    parts: list[str] = []
    parts.append(f"VENDOR: {brief.card1.vendor_name}")
    parts.append(
        "BUSINESS MODEL: "
        + {
            "own_inventory": "own inventory",
            "marketplace": "marketplace",
            "both": "own inventory + marketplace",
        }[brief.card1.business_model]
    )
    parts.append(
        "TARGET MARKET: "
        + {"b2c": "B2C", "b2b": "B2B", "both": "B2C and B2B"}[
            brief.card1.target_market
        ]
    )
    parts.append("")
    parts.append("POLICY DETAILS:")
    parts.extend(_format_card2_context(brief))
    parts.append("")
    scope_out = brief.card4.scope_out_message.strip()
    if scope_out:
        parts.append(
            "STYLE REFERENCE — the brand's tone (use as voice anchor for the "
            "generated end-node texts):"
        )
        parts.append("")
        parts.append("> " + scope_out.replace("\n", "\n> "))
        parts.append("")
    parts.append(
        "Generate the 6 end-node messages now via the `generate_end_node_texts` "
        "tool. Each must respect the locale, style guardrails, and reference "
        "the concrete policy values above where relevant."
    )
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# Public generator                                                            #
# --------------------------------------------------------------------------- #


_REQUIRED_KIND_KEYS: tuple[EndNodeKind, ...] = (
    "return_accepted",
    "refund_initiated",
    "replacement_initiated",
    "warranty_investigation",
    "lost_package",
    "expired_return_deadline",
)


def generate_end_node_texts(
    *,
    brief: SupportChatbotBrief,
    client: EndNodeTextClient,
) -> dict[EndNodeKind, str]:
    """Generálja a 6 Card 4A end-node-szöveget egyetlen AI hívással.

    A hívás kontraktolt (`EndNodeTextClient.generate_end_node_texts` Protocol).
    A visszatérési dict mind a 6 EndNodeKind kulcsot tartalmazza, minden
    érték `str`. Hiányzó vagy üres kulcs `RuntimeError`-t dob — a hívó
    (route handler) ezt napon-handed-on-empty-result státuszba fordíthatja.
    """
    system_prompt = build_end_node_system_prompt(brief)
    user_message = build_end_node_user_message(brief)
    raw = client.generate_end_node_texts(
        system_prompt=system_prompt, user_message=user_message
    )
    if not isinstance(raw, dict):
        raise RuntimeError(
            f"EndNodeTextClient returned {type(raw).__name__}, expected dict."
        )

    result: dict[EndNodeKind, str] = {}
    missing: list[str] = []
    for key in _REQUIRED_KIND_KEYS:
        val = raw.get(key)
        if not isinstance(val, str) or not val.strip():
            missing.append(key)
            continue
        result[key] = val.strip()
    if missing:
        raise RuntimeError(
            f"EndNodeTextClient missing/empty keys: {sorted(missing)}"
        )
    extra = set(raw.keys()) - set(_REQUIRED_KIND_KEYS)
    if extra:
        raise RuntimeError(
            f"EndNodeTextClient returned unexpected keys: {sorted(extra)}"
        )
    return result


# --------------------------------------------------------------------------- #
# Card4Output update helper                                                   #
# --------------------------------------------------------------------------- #


def apply_generated_end_node_texts(
    *,
    card4: Card4Output,
    generated: dict[EndNodeKind, str],
    generated_at,  # type: ignore[no-untyped-def]
    overwrite_user_edits: bool = False,
) -> dict[EndNodeKind, str]:
    """A generált szövegeket alkalmazza a Card4Output-on, state-tudatosan.

    Viselkedés slot-onként:

    - `empty` / `ai_generating` / `ai_prefilled` → felülírja, status
      `ai_prefilled`-re vált, `last_ai_generated_at` frissül.
    - `user_approved` → felülírja (a user csak megerősítette a régi
      generáltat, nincs saját szövege), `last_ai_generated_at` frissül.
    - `user_edited` → alapértelmezésben **megtartja a user szövegét**
      (the `last_user_edited_at` survival rule). Csak `overwrite_user_edits=True`
      esetén írja felül — ezt a frontend egy explicit megerősítő modal után
      állítja True-ra.

    Visszaad egy `{kind: applied_content}` map-et arról, hogy MIT VÁLTOZOTT.
    A `user_edited` skip-pelt slotok NINCSENEK benne, hogy a hívó tudja
    visszaadni a frontend-nek: "ezek megtartva".
    """
    applied: dict[EndNodeKind, str] = {}
    for kind, new_text in generated.items():
        slot = card4.end_node_texts.get(kind)
        if slot is None:
            # Defenzív: a Pydantic kontraktban mind a 6 kulcs jelen, de
            # üres-init dict-tel hívás esetén védve vagyunk.
            slot = AiPrefilledText()
            card4.end_node_texts[kind] = slot

        if slot.status == "user_edited" and not overwrite_user_edits:
            continue

        slot.content = new_text
        slot.status = "ai_prefilled"
        slot.last_ai_generated_at = generated_at
        applied[kind] = new_text
    return applied


__all__ = [
    "EndNodeTextClient",
    "build_generate_end_node_texts_tool",
    "build_end_node_system_prompt",
    "build_end_node_user_message",
    "generate_end_node_texts",
    "apply_generated_end_node_texts",
]

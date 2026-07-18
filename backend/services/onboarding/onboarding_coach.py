"""Onboarding coach — kérdés-válasz a brief kitöltés közben.

A coach NEM tölti ki automatikusan a mezőket: magyaráz, highlight targetet
ad, és opcionális javaslatot (copy / user elfogadás a frontenden).

V1: Anthropic tool-call egyetlen `coach_reply` tool-lal. API kulcs hiányában
a route determinisztikus fallback-et ad (teszt / offline).
"""

from __future__ import annotations

from typing import Any, Literal, Optional, Protocol

from pydantic import BaseModel, Field

CardId = Literal["card1", "card2", "card3", "card4", "card5", "card6"]


class CoachSuggestion(BaseModel):
    target: str = Field(..., description="coach-target id, pl. card1.vendor_name")
    label: str
    display_value: str = Field(..., description="Másolható javasolt szöveg/érték.")
    apply_value: Optional[str | int | float | bool] = Field(
        default=None,
        description="Ha a frontend tudja alkalmazni, ez megy a brief-be.",
    )


class CoachChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class CoachRequest(BaseModel):
    active_card: CardId
    user_question: str = Field(..., min_length=1, max_length=2000)
    messages: list[CoachChatMessage] = Field(default_factory=list)
    brief_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        description="Frontend brief JSON (adapter-normalizált vagy nyers).",
    )
    locale: Literal["hu", "en"] = "hu"


class CoachResponse(BaseModel):
    reply: str
    highlights: list[str] = Field(default_factory=list)
    suggestions: list[CoachSuggestion] = Field(default_factory=list)


# Whitelist — szinkronban a frontend coachTargets.ts-sel
_COACH_TARGET_IDS: frozenset[str] = frozenset(
    {
        "card1.vendor_name",
        "card1.website_url",
        "card1.business_models",
        "card1.locale",
        "card2.returns.return_window_days",
        "card2.returns.return_shipping_paid_by",
        "card2.remedy.primary_remedy_order",
        "card2.shipping.carriers",
        "card3.helpdesk",
        "card3.sla",
        "card4.end_node_texts",
        "card4.scope_out_message",
        "card5.off_topic",
        "card5.support_availability",
        "card6.sources",
    }
)


def build_coach_tool() -> dict[str, Any]:
    return {
        "name": "coach_reply",
        "description": (
            "Reply to the onboarding user. Explain which form field to use, "
            "optionally highlight targets, optionally suggest a value the user "
            "can copy or accept — never auto-apply without user consent."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "Hungarian or English coach answer, 2-6 sentences.",
                    "minLength": 10,
                    "maxLength": 2000,
                },
                "highlights": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "0-3 coach-target ids from the whitelist.",
                },
                "suggestions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "target": {"type": "string"},
                            "label": {"type": "string"},
                            "display_value": {"type": "string"},
                            "apply_value": {},
                        },
                        "required": ["target", "label", "display_value"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["reply"],
            "additionalProperties": False,
        },
    }


def build_coach_system_prompt(*, locale: str) -> str:
    lang = "Hungarian" if locale == "hu" else "English"
    return (
        f"You are an onboarding coach for a support-chatbot setup wizard. "
        f"Respond in {lang}. You help the user understand form fields on the "
        f"active card. RULES:\n"
        "- Explain clearly which field(s) matter; use `highlights` with valid target ids.\n"
        "- Do NOT fill the entire form — only optional `suggestions` the user may copy or accept.\n"
        "- Never mention internal APIs or test-chat.\n"
        "- Keep answers practical, 2-6 sentences unless the user asks for detail.\n"
        "Call `coach_reply` exactly once."
    )


def build_coach_user_message(req: CoachRequest, *, targets_block: str) -> str:
    parts = [
        f"ACTIVE CARD: {req.active_card}",
        f"USER QUESTION: {req.user_question.strip()}",
        "",
        "COACH TARGETS ON THIS CARD (highlight ids must be from this list):",
        targets_block,
        "",
        "BRIEF SNAPSHOT (partial JSON for context):",
        _brief_excerpt(req.brief_snapshot, req.active_card),
    ]
    if req.messages:
        parts.append("")
        parts.append("RECENT CHAT (oldest first):")
        for m in req.messages[-6:]:
            parts.append(f"[{m.role}] {m.content[:400]}")
    return "\n".join(parts)


def _brief_excerpt(brief: dict[str, Any], card: str) -> str:
    if not brief:
        return "(empty)"
    card_key = card  # card1 .. card6
    chunk = brief.get(card_key)
    if chunk is None:
        return "(card not in snapshot)"
    import json

    try:
        return json.dumps(chunk, ensure_ascii=False)[:1500]
    except TypeError:
        return str(chunk)[:1500]


def sanitize_coach_payload(raw: dict[str, Any]) -> CoachResponse:
    reply = raw.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        raise ValueError("coach_reply missing reply")

    highlights_in = raw.get("highlights") or []
    highlights: list[str] = []
    if isinstance(highlights_in, list):
        for h in highlights_in:
            if isinstance(h, str) and h in _COACH_TARGET_IDS:
                highlights.append(h)

    suggestions: list[CoachSuggestion] = []
    sug_in = raw.get("suggestions") or []
    if isinstance(sug_in, list):
        for s in sug_in:
            if not isinstance(s, dict):
                continue
            t = s.get("target")
            if not isinstance(t, str) or t not in _COACH_TARGET_IDS:
                continue
            label = s.get("label")
            disp = s.get("display_value")
            if not isinstance(label, str) or not isinstance(disp, str):
                continue
            suggestions.append(
                CoachSuggestion(
                    target=t,
                    label=label,
                    display_value=disp,
                    apply_value=s.get("apply_value"),
                )
            )

    return CoachResponse(
        reply=reply.strip(),
        highlights=highlights[:3],
        suggestions=suggestions[:3],
    )


class CoachClient(Protocol):
    def coach_reply(
        self, *, system_prompt: str, user_message: str
    ) -> dict[str, Any]: ...


def deterministic_coach_fallback(req: CoachRequest) -> CoachResponse:
    """API kulcs / hálózat nélküli válasz — első target highlight."""
    q = req.user_question.lower()
    card = req.active_card
    if "vissza" in q or "return" in q:
        return CoachResponse(
            reply=(
                "A visszaküldési határidőt a „Visszaküldési határidő (nap)” mezőben "
                "adod meg. Magyar B2C-nél gyakori a 14 nap — de a ti policy-detok "
                "az irányadó."
            ),
            highlights=["card2.returns.return_window_days"],
            suggestions=[
                CoachSuggestion(
                    target="card2.returns.return_window_days",
                    label="Visszaküldési határidő",
                    display_value="14",
                    apply_value=14,
                )
            ],
        )
    if card == "card1":
        return CoachResponse(
            reply=(
                "Kezdd a cégnévvel — ez jelenik meg a chatbot megszólításában. "
                "Utána válaszd ki az üzleti modellt és a nyelvet."
            ),
            highlights=["card1.vendor_name"],
        )
    default_highlight = {
        "card1": "card1.vendor_name",
        "card2": "card2.returns.return_window_days",
        "card3": "card3.helpdesk",
        "card4": "card4.end_node_texts",
        "card5": "card5.off_topic",
        "card6": "card6.sources",
    }.get(card, "card1.vendor_name")
    return CoachResponse(
        reply=(
            "Nézd meg a kiemelt mezőt a formon. Ha konkrét értékre vagy kíváncsi, "
            "írd meg milyen üzleti helyzetben vagytok — javaslatot adok másolhatóan."
        ),
        highlights=[default_highlight],
    )


def run_coach(req: CoachRequest, client: Optional[CoachClient]) -> CoachResponse:
    targets_block = coach_targets_for_card(req.active_card)
    if client is None:
        return deterministic_coach_fallback(req)
    system = build_coach_system_prompt(locale=req.locale)
    user = build_coach_user_message(req, targets_block=targets_block)
    try:
        raw = client.coach_reply(system_prompt=system, user_message=user)
        return sanitize_coach_payload(raw)
    except Exception:
        return deterministic_coach_fallback(req)


def coach_targets_for_card(card: CardId) -> str:
    """Target lista prompt-hoz — duplikált címkék a frontendtel."""
    _LABELS: dict[str, str] = {
        "card1.vendor_name": "Cégnév",
        "card1.website_url": "Honlap URL",
        "card1.business_models": "Üzleti modellek",
        "card1.locale": "Nyelv",
        "card2.returns.return_window_days": "Visszaküldési határidő",
        "card2.returns.return_shipping_paid_by": "Visszaküldés költsége",
        "card2.remedy.primary_remedy_order": "Remedy-sorrend",
        "card2.shipping.carriers": "Futárok",
        "card3.helpdesk": "Helpdesk",
        "card3.sla": "SLA",
        "card4.end_node_texts": "Végállomás szövegek",
        "card4.scope_out_message": "Scope-out üzenet",
        "card5.off_topic": "Off-topic",
        "card5.support_availability": "Support elérhetőség",
        "card6.sources": "Források",
    }
    prefix = f"{card}."
    ids = [t for t in _COACH_TARGET_IDS if t.startswith(prefix)]
    lines = [f"- {i}: {_LABELS.get(i, i)}" for i in ids]
    return "\n".join(lines) if lines else "(none)"


__all__ = [
    "CoachRequest",
    "CoachResponse",
    "CoachSuggestion",
    "CoachChatMessage",
    "build_coach_tool",
    "run_coach",
    "deterministic_coach_fallback",
    "sanitize_coach_payload",
]

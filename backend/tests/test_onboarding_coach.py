"""Unit tesztek az onboarding coach modulhoz."""

from services.onboarding.onboarding_coach import (
    CoachRequest,
    deterministic_coach_fallback,
    run_coach,
    sanitize_coach_payload,
)


class _StubCoach:
    def coach_reply(self, *, system_prompt: str, user_message: str) -> dict:
        return {
            "reply": "A cégnév mezőben add meg a márkanevet.",
            "highlights": ["card1.vendor_name"],
            "suggestions": [
                {
                    "target": "card1.vendor_name",
                    "label": "Cégnév",
                    "display_value": "Példa Kft.",
                    "apply_value": "Példa Kft.",
                }
            ],
        }


def test_sanitize_coach_payload_filters_invalid_targets() -> None:
    out = sanitize_coach_payload(
        {
            "reply": "Hello coach",
            "highlights": ["card1.vendor_name", "bogus.target"],
            "suggestions": [
                {
                    "target": "card1.vendor_name",
                    "label": "Cégnév",
                    "display_value": "X",
                },
                {
                    "target": "invalid",
                    "label": "Bad",
                    "display_value": "Y",
                },
            ],
        }
    )
    assert out.reply == "Hello coach"
    assert out.highlights == ["card1.vendor_name"]
    assert len(out.suggestions) == 1
    assert out.suggestions[0].target == "card1.vendor_name"


def test_run_coach_with_stub_client() -> None:
    req = CoachRequest(
        active_card="card1",
        user_question="Hol adom meg a cégnevet?",
    )
    out = run_coach(req, _StubCoach())
    assert "cégnév" in out.reply.lower() or "márka" in out.reply.lower()
    assert out.highlights == ["card1.vendor_name"]


def test_deterministic_fallback_return_question() -> None:
    req = CoachRequest(
        active_card="card2",
        user_question="Mennyi a visszaküldési idő?",
    )
    out = deterministic_coach_fallback(req)
    assert out.highlights == ["card2.returns.return_window_days"]
    assert out.suggestions

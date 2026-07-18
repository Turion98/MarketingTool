"""Phase 3c — AI-pass for step-level `reply_rules` generation.

Cél: minden AI-page non-closing step-jéhez 3-5 db, locale-helyes,
content-shaping `reply_rules` direktíva. Ezeket a runtime LLM
(`_format_reply_rules_block`) beilleszti a step system promptjába és
sztriktebb fegyelmet ad a chatbotnak (scope discipline, anti-redundancy,
length, anti-spoiler, tone).

A modul ÖT független rétegre bomlik:

1. **Tool schema builder** (`build_generate_reply_rules_tool`) — a
   tool-use API-borderon szigorú. A schema csak `step_id` + `reply_rules`
   per non-closing step-et fogad el; `additionalProperties: False`.
2. **Pure prompt builderek** (`build_phase3c_system_prompt`,
   `build_phase3c_user_message`) — determinisztikusak, I/O-mentesek,
   unit-tesztelhetők.
3. **Closing-adjacent detection** (`find_closing_adjacent_step_ids`) —
   meghatározza melyik step-ek "closing-adjacent" (mixed anti-spoiler
   policy: ezeken HARD, többieken SOFT a anti-spoiler).
4. **Vendor-policy gate** (`is_vendor_voice_enabled`) — a felhasználói
   policy-döntés (B-opció): csak `vendor_policy == "specific"` +
   `vendor_name` set esetén kerül vendor-név a reply_rules-ba.
5. **Application** (`apply_reply_rules_to_node`) — a tool-output
   `step_rules` listáját ráteszi a page steps-jeire (additív, meglévő
   curated reply_rules-t preserve).

A magasabb-szintű `generate_reply_rules_for_story` orchestration az
``OnboardingClient`` (vagy duck-typing kompatibilis objektum)
``generate_reply_rules`` metódusát hívja node-onként, hibatűréssel
(node-onkénti retry max 1, sikertelen node skip).
"""
from __future__ import annotations

from typing import Any, Optional, Protocol


# --------------------------------------------------------------------------- #
# Tool schema                                                                 #
# --------------------------------------------------------------------------- #


def build_generate_reply_rules_tool() -> dict[str, Any]:
    """Anthropic tool schema az AI-borderon.

    A schema szigorú felső-becslése a runtime + lint elfogadott
    formátumnak: ``step_rules: [{step_id, reply_rules: [str, ...]}]``,
    minden reply_rules elem 2-5 db, 8-240 char string.
    """
    return {
        "name": "generate_reply_rules",
        "description": (
            "Generate step-level reply_rules for the given AI node. "
            "For each NON-CLOSING step in the node, produce 2-5 short "
            "imperative directives in the target locale that constrain "
            "the runtime LLM's reply at that step. Skip closing steps "
            "entirely (do not include them in step_rules). The directives "
            "are content-shaping (scope, anti-redundancy, length, "
            "anti-spoiler, tone) — not structural rules."
        ),
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["node_id", "step_rules"],
            "properties": {
                "node_id": {"type": "string", "minLength": 1},
                "step_rules": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["step_id", "reply_rules"],
                        "properties": {
                            "step_id": {"type": "string", "minLength": 1},
                            "reply_rules": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 5,
                                "items": {
                                    "type": "string",
                                    "minLength": 8,
                                    "maxLength": 240,
                                },
                            },
                        },
                    },
                },
            },
        },
    }


# --------------------------------------------------------------------------- #
# Vendor-voice gate                                                           #
# --------------------------------------------------------------------------- #


def is_vendor_voice_enabled(
    vendor_policy: Optional[str],
    vendor_name: Optional[str],
) -> bool:
    """Felhasználói policy-döntés (B-opció): vendor-név csak akkor
    kerül a reply_rules-ba, ha a blueprint policy `specific` ÉS van
    konkrét vendor_name. `generic_blended` és `mock` esetén NEUTRAL
    rule-ok generálódnak.
    """
    return vendor_policy == "specific" and bool(vendor_name and vendor_name.strip())


# --------------------------------------------------------------------------- #
# Closing-adjacent step detection                                             #
# --------------------------------------------------------------------------- #


def _step_id(step: Any) -> Optional[str]:
    if not isinstance(step, dict):
        return None
    sid = step.get("id")
    return sid if isinstance(sid, str) and sid.strip() else None


def _step_is_closing(step: Any) -> bool:
    return isinstance(step, dict) and step.get("is_closing") is True


def find_closing_adjacent_step_ids(page: dict) -> set[str]:
    """Adott AI-page-en visszaadja a "closing-adjacent" step-ek ID-jét.

    Egy step closing-adjacent, ha a page bármely closing step-jéhez
    routol, akár közvetlenül (`branches[*].next_step`), akár default-on
    keresztül (`default_next`). Ezeken a step-eken a Phase 3c HARD
    anti-spoiler rule-okat generál.

    Üres halmaz, ha a page-en nincs closing step (pl. tisztán
    routing-jellegű node).
    """
    if not isinstance(page, dict):
        return set()
    steps = page.get("steps") or []
    if not isinstance(steps, list):
        return set()
    closing_ids: set[str] = {
        sid for s in steps
        if (sid := _step_id(s)) and _step_is_closing(s)
    }
    if not closing_ids:
        return set()

    adjacent: set[str] = set()
    for s in steps:
        sid = _step_id(s)
        if sid is None or _step_is_closing(s):
            continue
        next_targets: set[str] = set()
        for b in s.get("branches") or []:
            if isinstance(b, dict):
                ns = b.get("next_step")
                if isinstance(ns, str) and ns:
                    next_targets.add(ns)
        dflt = s.get("default_next")
        if isinstance(dflt, str) and dflt:
            next_targets.add(dflt)
        if next_targets & closing_ids:
            adjacent.add(sid)
    return adjacent


# --------------------------------------------------------------------------- #
# Prompt builders                                                             #
# --------------------------------------------------------------------------- #


_WORKED_EXAMPLES_HU = """\
[step_collect_order_id_and_situation] Order ID + situation type collection (prompt step):
  - "Csak a rendelési számot és a szállítási helyzet típusát kérd — semmi mást"
  - "Ha az ügyfél már leírta a helyzetet, ne ismételd vissza — csak erősítsd meg egy mondatban"
  - "Ne magyarázd el a folyamat következő lépéseit"
  - "Maximum 2 mondat"

[step_handle_delivered_not_received] Delivered-not-received handling (prompt step):
  - "Csak két dolgot kérj: szomszéd/portás ellenőrzés + tracking képernyőkép"
  - "Ne említsd a visszatérítési határidőt"
  - "Ne sorold fel a már teljesült kondíciókat"
  - "Ha az ügyfél nem tud képernyőképet küldeni, a szóbeli megerősítés is elfogadható"

[step_closing_acknowledgment] Closing-adjacent acknowledgment (info step):
  - "Maximum 1 mondat — csak nyugtázás"
  - "Ne kérj be hiányzó adatot — az előző lépésekben már összegyűjtöttük"
  - "Ne magyarázd el a következő lépéseket — a closing adja meg"
"""

_WORKED_EXAMPLES_EN = """\
[step_collect_order_id_and_situation] Order ID + situation type collection (prompt step):
  - "Ask only for the order ID and the type of delivery situation — nothing else"
  - "If the customer already described the situation, do not echo it back — just acknowledge it in one sentence"
  - "Do not explain upcoming steps in the process"
  - "Maximum 2 sentences"

[step_handle_delivered_not_received] Delivered-not-received handling (prompt step):
  - "Ask only two things: neighbor/concierge check + tracking screenshot"
  - "Do not mention the refund deadline"
  - "Do not enumerate already-satisfied conditions"
  - "If the customer cannot send a screenshot, verbal confirmation is acceptable"

[step_closing_acknowledgment] Closing-adjacent acknowledgment (info step):
  - "Maximum 1 sentence — pure acknowledgment"
  - "Do not request any missing data — it was collected in earlier steps"
  - "Do not describe upcoming steps — the closing handles that"
"""


def _normalize_locale(locale: Optional[str]) -> str:
    if not isinstance(locale, str) or not locale.strip():
        return "en"
    base = locale.strip().lower().split("-")[0].split("_")[0]
    return base if base in ("hu", "en") else "en"


def build_phase3c_system_prompt(
    *,
    locale: str,
    vendor_policy: Optional[str],
    vendor_name: Optional[str],
) -> str:
    """A Phase 3c system prompt — node-onkénti reply_rules-generálás.

    A prompt 4 része:
    1. Szerepkör + `reply_rules` szemantika
    2. Kanonikus minta-típusok (5 kategória)
    3. Worked examples (locale-specifikus)
    4. Kritikus szabályok + vendor + anti-spoiler policy
    """
    norm_locale = _normalize_locale(locale)
    is_hu = norm_locale == "hu"
    locale_native_name = "Hungarian" if is_hu else "English"
    locale_code_for_prompt = "hu" if is_hu else "en"

    examples = _WORKED_EXAMPLES_HU if is_hu else _WORKED_EXAMPLES_EN

    # Vendor clause — a user-döntés szerint (B-opció).
    if is_vendor_voice_enabled(vendor_policy, vendor_name):
        assert vendor_name is not None  # for type-checker
        vendor_clause = (
            f"VENDOR VOICE: vendor-specific. Refer to the company by name "
            f"({vendor_name!r}) only where natural and brand-aligned. Do "
            f"NOT inject the name into every rule — overuse breaks the "
            f"directive style. Most rules should be voice-neutral."
        )
    else:
        vendor_clause = (
            "VENDOR VOICE: NEUTRAL. Do NOT mention any company or brand "
            "name in any reply_rule. Keep all directives vendor-agnostic. "
            "If the node knowledge mentions a vendor, IGNORE that for the "
            "purposes of reply_rule generation."
        )

    # Anti-spoiler — mixed policy (C-opció).
    anti_spoiler_clause = (
        "ANTI-SPOILER POLICY: MIXED. The user-message marks each step as "
        "either CLOSING-ADJACENT (the last 1-2 steps before a closing "
        "step) or NON-ADJACENT (earlier). For CLOSING-ADJACENT steps, "
        "include a HARD anti-spoiler rule (categorical: 'Do not describe "
        "what happens next' / 'Ne magyarázd el a következő lépéseket'). "
        "For NON-ADJACENT steps, use a SOFT anti-spoiler rule (conditional: "
        "'Only describe future steps if the customer explicitly asks' / "
        "'Csak akkor magyarázd el a következő lépést, ha az ügyfél "
        "konkrétan kérdezi'). NEVER use both hard and soft anti-spoiler "
        "in the same step."
    )

    return (
        "You are a senior conversation designer producing step-level "
        "`reply_rules` for one AI node of a customer-service flow.\n\n"
        f"TARGET LOCALE: {locale_code_for_prompt} ({locale_native_name}).\n"
        "Every generated rule MUST be written in the target locale "
        "verbatim. No mixed-language rules.\n\n"
        "WHAT REPLY_RULES ARE\n"
        "----------------------\n"
        "A reply_rule is a short imperative directive that the runtime "
        "LLM reads as part of the system prompt for THIS step. The LLM "
        "treats reply_rules as STRICTER constraints than the step's "
        "`goal` or `ai_action` — they are about discipline (what NOT to "
        "say, how to keep the reply tight) rather than the step's "
        "primary intent. Rules are content-shaping, not structural.\n\n"
        "CANONICAL CATEGORIES\n"
        "----------------------\n"
        "1. SCOPE DISCIPLINE — narrow what the LLM may ask:\n"
        "   'Ask only for X and Y — nothing else.'\n"
        "2. ANTI-REDUNDANCY — block re-asking / echoing:\n"
        "   'If the customer already described Z, do not echo it back.'\n"
        "3. LENGTH CAP — sentence cap, often 1-3:\n"
        "   'Maximum 2 sentences.'\n"
        "4. ANTI-SPOILER — block premature future-step disclosure (see "
        "the MIXED policy below).\n"
        "5. TONE MODIFIER — register / mood:\n"
        "   'Empathetic apology.' / 'Short, calming voice.'\n\n"
        "WORKED EXAMPLES\n"
        "----------------------\n"
        f"{examples}"
        "CRITICAL RULES\n"
        "----------------------\n"
        "- Use the target locale verbatim.\n"
        "- Each rule: 8-240 chars, 2-5 rules per step.\n"
        "- DO NOT generate reply_rules for steps marked `is_closing: true` "
        "(skip them entirely; they are not in the user-message step list).\n"
        "- DO NOT mention internal mechanics: condition IDs, branch logic, "
        "satisfied flags, schemas. The runtime LLM does not see them; the "
        "rules should be human-readable directives.\n"
        "- DO NOT include meta-instructions like 'Set the X condition' or "
        "'Trigger the Y branch'.\n"
        "- DO NOT promise outcomes ('We will refund you in 30 days').\n"
        "- " + vendor_clause + "\n"
        "- " + anti_spoiler_clause + "\n\n"
        "OUTPUT\n"
        "----------------------\n"
        "Call the `generate_reply_rules` tool exactly once with "
        "`step_rules` for EVERY non-closing step in the node "
        "(in any order). Do not generate any free-form text response."
    )


def _summarize_internal_conditions(internal: Any) -> str:
    """Step-szintű internal_conditions-ből rövid összefoglaló a user
    promptba. Mindkét formát kezeli (string + dict)."""
    if not isinstance(internal, list) or not internal:
        return "(none)"
    parts: list[str] = []
    for entry in internal:
        if isinstance(entry, str) and entry.strip():
            parts.append(entry.strip())
        elif isinstance(entry, dict):
            cid = entry.get("id")
            if isinstance(cid, str) and cid.strip():
                parts.append(cid.strip())
    return ", ".join(parts) if parts else "(none)"


def build_phase3c_user_message(
    *,
    page: dict,
    locale: str,
) -> str:
    """A node-szintű user message: knowledge + step-lánc + adjacency
    flags. A closing step-eket KIHAGYJA a step-listából (az AI ne
    generáljon rájuk reply_rules-t).
    """
    if not isinstance(page, dict):
        return ""
    norm_locale = _normalize_locale(locale)
    node_id = page.get("id", "<unknown>")
    knowledge = page.get("knowledge") or {}
    desc = knowledge.get("description") if isinstance(knowledge, dict) else None
    scope = knowledge.get("scope") if isinstance(knowledge, dict) else None

    adjacent_ids = find_closing_adjacent_step_ids(page)

    lines: list[str] = []
    lines.append(f"NODE: {node_id}")
    lines.append(f"LOCALE: {norm_locale}")
    lines.append("")
    lines.append("KNOWLEDGE:")
    lines.append(f"  description: {desc or '(none)'}")
    lines.append(f"  scope:       {scope or '(none)'}")
    lines.append("")
    lines.append("STEPS (closing steps EXCLUDED — do not generate rules for them):")
    lines.append("")

    steps = page.get("steps") or []
    rendered = 0
    for s in steps if isinstance(steps, list) else []:
        if not isinstance(s, dict):
            continue
        if _step_is_closing(s):
            continue
        sid = _step_id(s) or "<no-id>"
        marker = (
            "[CLOSING-ADJACENT — use HARD anti-spoiler]"
            if sid in adjacent_ids
            else "[NON-ADJACENT — use SOFT anti-spoiler]"
        )
        lines.append(f"step_id: {sid}  {marker}")
        s_type = s.get("type") or "?"
        lines.append(f"  type:       {s_type}")
        goal = s.get("goal")
        if isinstance(goal, str) and goal.strip():
            lines.append(f"  goal:       {goal.strip()}")
        ai_action = s.get("ai_action")
        if isinstance(ai_action, str) and ai_action.strip():
            lines.append(f"  ai_action:  {ai_action.strip()}")
        ic_summary = _summarize_internal_conditions(s.get("internal_conditions"))
        lines.append(f"  internal:   {ic_summary}")
        dw = s.get("done_when")
        if isinstance(dw, str) and dw.strip():
            lines.append(f"  done_when:  {dw.strip()}")
        lines.append("")
        rendered += 1

    if rendered == 0:
        lines.append("(No non-closing steps found — generate empty step_rules array.)")

    lines.append("INSTRUCTIONS:")
    lines.append(
        "- Generate `step_rules` for EACH step listed above (none for "
        "closing steps — they were excluded)."
    )
    lines.append(
        "- 2-5 reply_rules per step, each 8-240 chars, in the target locale."
    )
    lines.append(
        "- Closing-adjacent steps: HARD anti-spoiler rule. Non-adjacent "
        "steps: SOFT anti-spoiler rule."
    )
    lines.append(
        "- Call `generate_reply_rules` exactly once with `node_id` and "
        "`step_rules`."
    )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Application                                                                 #
# --------------------------------------------------------------------------- #


def apply_reply_rules_to_node(
    page: dict,
    step_rules: dict[str, list[str]],
    *,
    overwrite_existing: bool = False,
) -> int:
    """Ráteszi a `step_rules` mappinget a page non-closing step-jeire.

    Args:
        page: Egy AI-page dict.
        step_rules: ``{step_id: [rule, rule, ...]}`` — typically a Phase 3c
            tool-output.
        overwrite_existing: Default ``False``. Ha False, meglévő
            reply_rules-t megőriz (additive preserve). Ha True,
            felülír.

    Returns:
        Hány step kapott újonnan ``reply_rules`` mezőt (vagy lett
        felülírva, ha overwrite_existing=True).
    """
    if not isinstance(page, dict):
        return 0
    steps = page.get("steps") or []
    if not isinstance(steps, list):
        return 0
    applied = 0
    for s in steps:
        if not isinstance(s, dict):
            continue
        sid = _step_id(s)
        if sid is None:
            continue
        if _step_is_closing(s):
            continue
        rules = step_rules.get(sid)
        if not isinstance(rules, list) or not rules:
            continue
        if not overwrite_existing and isinstance(
            s.get("reply_rules"), list
        ) and s["reply_rules"]:
            continue
        normalized = [r.strip() for r in rules if isinstance(r, str) and r.strip()]
        if not normalized:
            continue
        s["reply_rules"] = normalized
        applied += 1
    return applied


# --------------------------------------------------------------------------- #
# Story-level orchestration                                                   #
# --------------------------------------------------------------------------- #


class ReplyRulesClient(Protocol):
    """Duck-typing kontraktus a Phase 3c AI-call-hoz.

    Bármely objektum, ami implementálja a ``generate_reply_rules``
    metódust (production: ``AnthropicOnboardingClient``; teszt:
    ``MockReplyRulesClient``), kompatibilis.
    """

    def generate_reply_rules(
        self,
        *,
        page: dict[str, Any],
        locale: str,
        vendor_policy: Optional[str],
        vendor_name: Optional[str],
    ) -> dict[str, list[str]]: ...


def generate_reply_rules_for_story(
    story: dict,
    *,
    client: ReplyRulesClient,
    locale: str,
    vendor_policy: Optional[str] = None,
    vendor_name: Optional[str] = None,
    overwrite_existing: bool = False,
    on_node_error: Optional[Any] = None,
) -> dict[str, Any]:
    """Story-szintű orchestration: minden AI-page-re egy AI-hívás.

    Hibatűrés: ha egy node generálása exception-t dob (API-hiba,
    timeout, schema-rejection a clientben), a hibás node-ot SKIP-eljük
    és a többit folytatjuk. A summary tartalmazza a sikeres és
    sikertelen node-ok ID-it.

    Args:
        story: Az assembled story dict.
        client: ``ReplyRulesClient`` Protocol-kompatibilis objektum.
        locale: A reply_rules nyelve. Story locale-jával egyezzen.
        vendor_policy: ``"specific"`` | ``"generic_blended"`` | ``"mock"`` |
            None. A vendor-voice gate ezt használja.
        vendor_name: Konkrét vendor név (csak `vendor_policy=="specific"`
            esetén injektálódik a prompt-ba).
        overwrite_existing: Lásd `apply_reply_rules_to_node`.
        on_node_error: Optional callback ``(node_id, exc) -> None``.

    Returns:
        Összegző dict::

            {
                "nodes_processed": int,
                "nodes_succeeded": int,
                "nodes_failed": int,
                "total_steps_rules_applied": int,
                "succeeded_node_ids": list[str],
                "failed_node_ids": list[str],
                "per_node_applied": dict[str, int],
            }
    """
    summary: dict[str, Any] = {
        "nodes_processed": 0,
        "nodes_succeeded": 0,
        "nodes_failed": 0,
        "total_steps_rules_applied": 0,
        "succeeded_node_ids": [],
        "failed_node_ids": [],
        "per_node_applied": {},
    }
    if not isinstance(story, dict):
        return summary
    pages = story.get("pages") or {}
    if not isinstance(pages, dict):
        return summary

    for page_id, page in pages.items():
        if not isinstance(page, dict) or page.get("type") != "ai":
            continue
        summary["nodes_processed"] += 1
        try:
            result = client.generate_reply_rules(
                page=page,
                locale=locale,
                vendor_policy=vendor_policy,
                vendor_name=vendor_name,
            )
        except Exception as exc:  # noqa: BLE001 — we want catch-all here
            summary["nodes_failed"] += 1
            summary["failed_node_ids"].append(page_id)
            if callable(on_node_error):
                on_node_error(page_id, exc)
            continue

        if not isinstance(result, dict):
            summary["nodes_failed"] += 1
            summary["failed_node_ids"].append(page_id)
            continue

        applied = apply_reply_rules_to_node(
            page, result, overwrite_existing=overwrite_existing
        )
        summary["nodes_succeeded"] += 1
        summary["succeeded_node_ids"].append(page_id)
        summary["per_node_applied"][page_id] = applied
        summary["total_steps_rules_applied"] += applied

    return summary

"""Phase 3g — AI-pass for condition-level `text_triggers` generation.

Cél: minden AI-page eligible condition-jéhez (step-szintű
`internal_conditions[]` és page-szintű `conditions[]`) 3-8 rövid,
locale-helyes "natural language" kulcskifejezést — amelyek a runtime
``_condition_triggered_by_text`` heurisztikájában automatikusan
beállítják az adott condition-t, ha az ügyfél ÜZENETÉBEN előfordul.

Példa (HU, ``troubleshooting_done`` cond a `product-defect` node-ban):
    triggers = [
        "újraindítottam", "újra indítottam", "frissítettem",
        "kipróbál", "elvégeztem", "megvolt"
    ]

A pattern egy SUBSTRING-MATCH a runtime-ban; a triggers ezért rövid
SZÓTÖVEK / IGETÖVEK / RÖVID KIFEJEZÉSEK, NEM teljes mondatok.

A modul ÖT független rétegre bomlik (azonos struktúrával mint a
`reply_rules_generator`):

1. **Tool schema builder** (`build_generate_text_triggers_tool`) — a
   tool-use API-borderon szigorú; ``condition_triggers`` lista, minden
   elem ``{condition_id, triggers: [str, ...]}``; trigger 3-60 char,
   3-8 db / cond.
2. **Pure prompt builderek** (`build_phase3g_system_prompt`,
   `build_phase3g_user_message`) — determinisztikusak, I/O-mentesek.
3. **Eligibility filter** (`select_text_trigger_candidates`) —
   pre-filter: kizárja a TISZTÁN extract-style cond ID-kat (pl.
   `has_order_id`, `*_uploaded`, `*_attached`, `*_received`); a többit
   az AI-nak adja át, és az AI dönt arról hogy melyikre érdemes.
4. **Application** (`apply_text_triggers_to_node`) — a tool-output
   alapján a page step.internal_conditions[] és page.conditions[]
   condition-jeire ráteszi a triggers-t (additív, meglévő curated
   triggers-t preserve).
5. **Story-level orchestration** (`generate_text_triggers_for_story`)
   — minden AI-page-re egy hívás, hibatűrő (node-onkénti SKIP).

A modul AI-pass; deterministic detekciós logika nincs, mert a
pattern-felismerés (mit mondhat az ügyfél természetes nyelven) nem
lefedhető szabály-alapon.
"""
from __future__ import annotations

import re
from typing import Any, Optional, Protocol


# --------------------------------------------------------------------------- #
# Tool schema                                                                 #
# --------------------------------------------------------------------------- #


def build_generate_text_triggers_tool() -> dict[str, Any]:
    """Anthropic tool schema az AI-borderon.

    A schema szigorú felső-becslése a runtime + lint formátumnak:
    ``condition_triggers: [{condition_id, triggers: [str, ...]}]``,
    minden ``triggers`` 3-8 elem, minden trigger 3-60 char.
    Az AI csak azokat a cond-okat veszi fel, amelyekre érdemben tud
    triggert adni — a többit kihagyja (üres lista is megengedett a
    teljes ``condition_triggers`` szinten, ha a node-on egyetlen
    cond sem alkalmas).
    """
    return {
        "name": "generate_text_triggers",
        "description": (
            "Generate condition-level `text_triggers` for the given AI "
            "node. For each ELIGIBLE content-pattern condition (step "
            "internal_conditions and page conditions combined), produce "
            "3-8 short locale-native key phrases (3-60 chars each) that "
            "represent natural-language SUBSTRING patterns the customer "
            "would say to satisfy that condition. Skip conditions where "
            "text-trigger matching does not apply (e.g. ID extraction, "
            "file uploads). Triggers are runtime substring matches, NOT "
            "full sentences — keep them short and stem-like."
        ),
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["node_id", "condition_triggers"],
            "properties": {
                "node_id": {"type": "string", "minLength": 1},
                "condition_triggers": {
                    "type": "array",
                    "minItems": 0,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["condition_id", "triggers"],
                        "properties": {
                            "condition_id": {"type": "string", "minLength": 1},
                            "triggers": {
                                "type": "array",
                                "minItems": 3,
                                "maxItems": 8,
                                "items": {
                                    "type": "string",
                                    "minLength": 3,
                                    "maxLength": 60,
                                },
                            },
                        },
                    },
                },
            },
        },
    }


# --------------------------------------------------------------------------- #
# Eligibility filter                                                          #
# --------------------------------------------------------------------------- #


# Cond ID-suffixek/prefixek, amelyek tisztán extract-style-ok
# (azonosító, fájl-feltöltés, konkrét adat-kérés). Ezekre a text_trigger
# nem alkalmazható.
_EXTRACT_STYLE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p) for p in (
        r"^has_",
        r"^image_",
        r"_uploaded$",
        r"_attached$",
        r"_screenshot_received$",
        r"_screenshot_provided$",
        r"_photo_received$",
        r"_photo_provided$",
        r"_id_provided$",
        r"_id_known$",
        r"_uploaded_received$",
    )
)


def _is_extract_style(cond_id: str) -> bool:
    return any(p.search(cond_id) for p in _EXTRACT_STYLE_PATTERNS)


def select_text_trigger_candidates(page: dict) -> list[dict[str, str]]:
    """Visszaadja a page eligible cond-jainak listáját (id + description).

    A lista deduplikált: ha egy cond mind page-szinten, mind step-szinten
    szerepel, csak egyszer kerül be (page-szintű leírást részesíti előnyben).
    Az `extract-style` cond-okat (`has_*`, `*_uploaded`, stb.) kizárja.

    Returns:
        ``[{"id": cond_id, "description": "..."}, ...]`` — sorrend stabil
        (page conds előbb, majd step internal_conditions felfedezési
        sorrendben).
    """
    if not isinstance(page, dict):
        return []
    seen: set[str] = set()
    out: list[dict[str, str]] = []

    # Page-level conditions
    for c in page.get("conditions") or []:
        if not isinstance(c, dict):
            continue
        cid = c.get("id")
        if not isinstance(cid, str) or not cid.strip():
            continue
        if cid in seen or _is_extract_style(cid):
            continue
        desc = c.get("description") if isinstance(c.get("description"), str) else ""
        out.append({"id": cid, "description": desc or ""})
        seen.add(cid)

    # Step-level internal_conditions (dedup against page-level + within-step)
    for st in page.get("steps") or []:
        if not isinstance(st, dict):
            continue
        for ic in st.get("internal_conditions") or []:
            if isinstance(ic, str):
                cid = ic.strip()
                desc = ""
            elif isinstance(ic, dict):
                cid = ic.get("id") if isinstance(ic.get("id"), str) else None
                if not isinstance(cid, str):
                    continue
                cid = cid.strip()
                desc = ic.get("description") if isinstance(ic.get("description"), str) else ""
            else:
                continue
            if not cid or cid in seen or _is_extract_style(cid):
                continue
            out.append({"id": cid, "description": desc or ""})
            seen.add(cid)
    return out


# --------------------------------------------------------------------------- #
# Prompt builders                                                             #
# --------------------------------------------------------------------------- #


_WORKED_EXAMPLES_HU = """\
[troubleshooting_done] "Az ügyfél elvégezte a hibaelhárítást, vagy már korábban megpróbálta":
  - "újraindítottam"
  - "újra indítottam"
  - "frissítettem"
  - "megpróbáltam"
  - "kipróbáltam"
  - "elvégeztem"
  - "megvolt"

[defect_persists] "A hiba az újraindítás/frissítés után is fennáll":
  - "nem segít"
  - "nem hozott eredm"
  - "még mindig"
  - "továbbra is"
  - "nem működ"
  - "nem javult"

[remedy_preference_known] "Az ügyfél megmondta hogy cserét, javítást vagy visszatérítést szeretne":
  - "cserét"
  - "cserét kérek"
  - "csere"
  - "visszatérítést"
  - "visszafizetés"
  - "javítást"
  - "javítást kérek"
  - "megjavít"

[case_summary_confirmed] "Az ügyfél megerősítette az ügyösszefoglalót":
  - "igen"
  - "rendben"
  - "megerősítem"
  - "így van"
  - "úgy van"
  - "minden stimmel"
  - "ok"

[exclusion_check_done] "Az ügyfél jelezte hogy nem volt külső behatás (esés, folyadék, javítás)":
  - "semmilyen külső"
  - "nincs külső"
  - "nem volt külső"
  - "nem érte"
  - "nem esett le"
  - "nem volt folyadék"
  - "nem javíttattam"
"""

_WORKED_EXAMPLES_EN = """\
[troubleshooting_done] "Customer performed troubleshooting or already tried it":
  - "restarted"
  - "rebooted"
  - "updated"
  - "tried it"
  - "already tried"
  - "i did that"

[defect_persists] "The defect persists after troubleshooting":
  - "still"
  - "didn't help"
  - "didn't work"
  - "no change"
  - "same problem"
  - "not fixed"

[remedy_preference_known] "Customer stated they want replacement, repair, or refund":
  - "replacement"
  - "replace it"
  - "refund"
  - "money back"
  - "repair"
  - "fix it"

[case_summary_confirmed] "Customer confirmed the case summary":
  - "yes"
  - "correct"
  - "that's right"
  - "confirm"
  - "okay"
  - "ok"
  - "agreed"

[exclusion_check_done] "Customer confirmed no external impact (drop, liquid, prior repair)":
  - "no impact"
  - "didn't drop"
  - "no liquid"
  - "no damage"
  - "nothing happened"
  - "never repaired"
"""


def _normalize_locale(locale: Optional[str]) -> str:
    if not isinstance(locale, str) or not locale.strip():
        return "en"
    base = locale.strip().lower().split("-")[0].split("_")[0]
    return base if base in ("hu", "en") else "en"


def build_phase3g_system_prompt(*, locale: str) -> str:
    """A Phase 3g system prompt — node-onkénti text_triggers-generálás.

    A prompt 4 része:
    1. Szerepkör + `text_triggers` szemantika (substring-match!)
    2. Skip-szabályok (extract-style cond IDs)
    3. Worked examples (locale-specifikus)
    4. Kritikus formálási szabályok
    """
    norm_locale = _normalize_locale(locale)
    is_hu = norm_locale == "hu"
    locale_native_name = "Hungarian" if is_hu else "English"
    locale_code_for_prompt = "hu" if is_hu else "en"

    examples = _WORKED_EXAMPLES_HU if is_hu else _WORKED_EXAMPLES_EN

    return (
        "You are a senior conversation designer producing condition-level "
        "`text_triggers` for one AI node of a customer-service flow.\n\n"
        f"TARGET LOCALE: {locale_code_for_prompt} ({locale_native_name}).\n"
        "Every generated trigger phrase MUST be written in the target "
        "locale. No mixed-language triggers.\n\n"
        "WHAT TEXT_TRIGGERS ARE\n"
        "----------------------\n"
        "A `text_trigger` is a SHORT, locale-native KEY PHRASE (typically "
        "3-30 chars) that the runtime treats as a SUBSTRING MATCH against "
        "the customer's incoming message (case-insensitive, "
        "diacritic-tolerant). If ANY trigger appears as a substring of "
        "the customer's text, the corresponding condition is auto-set to "
        "TRUE without further LLM evaluation.\n\n"
        "Triggers are NOT full sentences — they are SHORT STEMS, INFLECTED "
        "VERB FORMS, KEY NOUNS, or 2-4 word phrases. Multiple variants of "
        "the same root are RECOMMENDED (e.g. 'újraindítottam' AND "
        "'újra indítottam' for HU; 'restart' AND 'rebooted' for EN).\n\n"
        "ELIGIBILITY (CRITICAL — DO NOT GUESS)\n"
        "----------------------\n"
        "Generate triggers ONLY for conditions where a customer would "
        "satisfy them by NATURAL LANGUAGE description.\n"
        "Examples of GOOD targets:\n"
        "  - 'remedy_preference_known' — customer says 'replacement'\n"
        "  - 'troubleshooting_done' — customer says 'i restarted it'\n"
        "  - 'case_summary_confirmed' — customer says 'yes, correct'\n"
        "  - 'defect_persists' — customer says 'still not working'\n"
        "  - 'exclusion_check_done' — customer says 'no, never dropped'\n"
        "Examples of BAD targets (SKIP — do NOT include in output):\n"
        "  - 'has_order_id' — extracted from regex/structured input\n"
        "  - 'image_uploaded' — file presence flag\n"
        "  - 'consent_text_provided' — extracted text/payload\n"
        "  - 'has_purchase_date' — date extraction\n"
        "  - 'tracking_screenshot_received' — file/upload event\n"
        "If you receive a condition whose description is purely about "
        "ID/file/structured-data extraction, OMIT it from your output. "
        "Returning an empty `condition_triggers` list is acceptable if "
        "the entire node is extraction-only.\n\n"
        "WORKED EXAMPLES\n"
        "----------------------\n"
        f"{examples}"
        "FORMATTING RULES\n"
        "----------------------\n"
        "- Use the target locale verbatim. Hungarian: keep accents "
        "(ékezet), the runtime normalizes both sides.\n"
        "- Each trigger: 3-60 chars, 3-8 triggers per condition.\n"
        "- Triggers should be SHORT — prefer stems and 2-4 word phrases "
        "over full sentences. Avoid punctuation (no question marks, "
        "exclamation marks).\n"
        "- LOWERCASE only — the runtime matches case-insensitively, "
        "and uppercase triggers add no value.\n"
        "- Provide MULTIPLE INFLECTED FORMS of the same root for HU "
        "(e.g. 'cserét', 'cserét kérek', 'csere'; 'újraindítottam', "
        "'újra indítottam').\n"
        "- DO NOT include greetings ('hello', 'szia'), generic affirmatives "
        "without context (just 'ja' or 'jo' alone), or words so common "
        "they would false-trigger ('van', 'is', 'a').\n"
        "- For 'confirmed/agreed' style conditions, INCLUDE short "
        "affirmatives ('igen', 'ok', 'oké', 'rendben' — HU; 'yes', 'ok', "
        "'okay', 'correct' — EN).\n\n"
        "OUTPUT\n"
        "----------------------\n"
        "Call the `generate_text_triggers` tool exactly once with "
        "`node_id` and `condition_triggers` covering EVERY eligible "
        "condition (skip extraction-only conds entirely). Do not "
        "generate any free-form text response."
    )


def build_phase3g_user_message(
    *,
    page: dict,
    locale: str,
) -> str:
    """A node-szintű user message: knowledge + eligible cond lista.

    A pre-filter (`select_text_trigger_candidates`) által visszaadott
    cond-lista kerül be — extract-style cond-okat NEM mutatunk.
    """
    if not isinstance(page, dict):
        return ""
    norm_locale = _normalize_locale(locale)
    node_id = page.get("id", "<unknown>")
    knowledge = page.get("knowledge") or {}
    desc = knowledge.get("description") if isinstance(knowledge, dict) else None
    scope = knowledge.get("scope") if isinstance(knowledge, dict) else None

    candidates = select_text_trigger_candidates(page)

    lines: list[str] = []
    lines.append(f"NODE: {node_id}")
    lines.append(f"LOCALE: {norm_locale}")
    lines.append("")
    lines.append("KNOWLEDGE:")
    lines.append(f"  description: {desc or '(none)'}")
    lines.append(f"  scope:       {scope or '(none)'}")
    lines.append("")
    lines.append(
        "ELIGIBLE CONDITIONS (extract-style cond IDs already filtered out):"
    )
    lines.append("")

    if not candidates:
        lines.append(
            "(No eligible content-pattern conditions in this node. "
            "Return an empty `condition_triggers` array.)"
        )
    else:
        for cand in candidates:
            cid = cand["id"]
            cdesc = cand.get("description") or "(no description)"
            lines.append(f"condition_id: {cid}")
            short = cdesc[:240].strip()
            lines.append(f"  description: {short}")
            lines.append("")

    lines.append("INSTRUCTIONS:")
    lines.append(
        "- Generate `triggers` (3-8 short phrases) for EACH eligible "
        "condition above where text-trigger matching is meaningful."
    )
    lines.append(
        "- SKIP a condition entirely (omit from output) if its description "
        "shows it is satisfied only by structured input (IDs, files, "
        "extracted dates, etc.)."
    )
    lines.append(
        f"- All triggers in {norm_locale}, lowercase, no punctuation."
    )
    lines.append(
        "- Call `generate_text_triggers` exactly once with `node_id` and "
        "`condition_triggers`."
    )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Application                                                                 #
# --------------------------------------------------------------------------- #


def _is_extract_style_safe(cond_id: Any) -> bool:
    return isinstance(cond_id, str) and _is_extract_style(cond_id)


def apply_text_triggers_to_node(
    page: dict,
    condition_triggers: dict[str, list[str]],
    *,
    overwrite_existing: bool = False,
) -> dict[str, int]:
    """Ráteszi a `condition_triggers` mappinget a page cond-jaira.

    A page minden helyén alkalmazza, ahol a cond dict-formában jelenik
    meg:
      - ``page.conditions[]``
      - ``page.steps[].internal_conditions[]`` (csak dict-elemekre;
        string elemeket nem alakít át)

    Args:
        page: Egy AI-page dict.
        condition_triggers: ``{cond_id: [phrase, ...]}``.
        overwrite_existing: Default ``False``. Ha False, meglévő
            text_triggers-t megőriz (additive preserve). Ha True,
            felülír.

    Returns:
        ``{
            "page_conditions_updated": int,
            "step_internal_conditions_updated": int,
            "skipped_extract_style": int,
            "skipped_existing_preserved": int,
        }``
    """
    stats = {
        "page_conditions_updated": 0,
        "step_internal_conditions_updated": 0,
        "skipped_extract_style": 0,
        "skipped_existing_preserved": 0,
    }
    if not isinstance(page, dict) or not isinstance(condition_triggers, dict):
        return stats

    def _normalize_triggers(raw: Any) -> Optional[list[str]]:
        if not isinstance(raw, list):
            return None
        out: list[str] = []
        for t in raw:
            if isinstance(t, str) and t.strip():
                out.append(t.strip())
        return out or None

    def _apply_to_cond_dict(cond: dict, location_key: str) -> None:
        cid = cond.get("id")
        if not isinstance(cid, str) or not cid.strip():
            return
        if _is_extract_style_safe(cid):
            stats["skipped_extract_style"] += 1
            return
        triggers_for = condition_triggers.get(cid)
        normalized = _normalize_triggers(triggers_for)
        if normalized is None:
            return
        existing = cond.get("text_triggers")
        if (
            not overwrite_existing
            and isinstance(existing, list)
            and existing
        ):
            stats["skipped_existing_preserved"] += 1
            return
        cond["text_triggers"] = normalized
        stats[location_key] += 1

    for c in page.get("conditions") or []:
        if isinstance(c, dict):
            _apply_to_cond_dict(c, "page_conditions_updated")

    for st in page.get("steps") or []:
        if not isinstance(st, dict):
            continue
        for ic in st.get("internal_conditions") or []:
            if isinstance(ic, dict):
                _apply_to_cond_dict(ic, "step_internal_conditions_updated")
    return stats


# --------------------------------------------------------------------------- #
# Story-level orchestration                                                   #
# --------------------------------------------------------------------------- #


class TextTriggersClient(Protocol):
    """Duck-typing kontraktus a Phase 3g AI-call-hoz."""

    def generate_text_triggers(
        self,
        *,
        page: dict[str, Any],
        locale: str,
    ) -> dict[str, list[str]]: ...


def generate_text_triggers_for_story(
    story: dict,
    *,
    client: TextTriggersClient,
    locale: str,
    overwrite_existing: bool = False,
    on_node_error: Optional[Any] = None,
) -> dict[str, Any]:
    """Story-szintű orchestration: minden AI-page-re egy AI-hívás.

    Hibatűrés: ha egy node generálása exception-t dob (API-hiba,
    timeout, schema-rejection), a hibás node-ot SKIP-eljük és a
    többit folytatjuk.

    Args:
        story: Az assembled story dict.
        client: ``TextTriggersClient`` Protocol-kompatibilis objektum.
        locale: A triggers nyelve. Story locale-jával egyezzen.
        overwrite_existing: Lásd `apply_text_triggers_to_node`.
        on_node_error: Optional callback ``(node_id, exc) -> None``.

    Returns:
        Összegző dict::

            {
                "nodes_processed": int,
                "nodes_succeeded": int,
                "nodes_failed": int,
                "total_page_conditions_updated": int,
                "total_step_internal_conditions_updated": int,
                "succeeded_node_ids": list[str],
                "failed_node_ids": list[str],
                "per_node_stats": dict[str, dict[str, int]],
            }
    """
    summary: dict[str, Any] = {
        "nodes_processed": 0,
        "nodes_succeeded": 0,
        "nodes_failed": 0,
        "total_page_conditions_updated": 0,
        "total_step_internal_conditions_updated": 0,
        "succeeded_node_ids": [],
        "failed_node_ids": [],
        "per_node_stats": {},
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
            result = client.generate_text_triggers(
                page=page,
                locale=locale,
            )
        except Exception as exc:  # noqa: BLE001
            summary["nodes_failed"] += 1
            summary["failed_node_ids"].append(page_id)
            if callable(on_node_error):
                on_node_error(page_id, exc)
            continue

        if not isinstance(result, dict):
            summary["nodes_failed"] += 1
            summary["failed_node_ids"].append(page_id)
            continue

        node_stats = apply_text_triggers_to_node(
            page, result, overwrite_existing=overwrite_existing
        )
        summary["nodes_succeeded"] += 1
        summary["succeeded_node_ids"].append(page_id)
        summary["per_node_stats"][page_id] = node_stats
        summary["total_page_conditions_updated"] += node_stats[
            "page_conditions_updated"
        ]
        summary["total_step_internal_conditions_updated"] += node_stats[
            "step_internal_conditions_updated"
        ]

    return summary

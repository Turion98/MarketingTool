from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from typing import Iterator, Optional, Union, cast

import anthropic
from dotenv import load_dotenv

from services.contracts import StoryPage
from services.order_context import (
    OrderContext,
    collect_validation_patterns,
    filter_satisfied_by_pattern_validation,
    get_order_context_mapping,
    resolve_satisfied_precedence,
)
from services.story_runtime import (
    get_ai_node_payload,
    get_story_meta_string,
    get_story_runtime_int,
    resolve_end_page_content,
)


load_dotenv()

_api_key = os.getenv("ANTHROPIC_API_KEY")
if not _api_key:
    raise RuntimeError(
        "ANTHROPIC_API_KEY hiányzik a környezeti változókból. "
        "Add hozzá a backend/.env fájlhoz."
    )

client = anthropic.Anthropic(api_key=_api_key)

# Fallback — ha a story meta.runtime nem tartalmaz értéket
_DEFAULT_MODEL = "claude-sonnet-4-6"
_DEFAULT_MAX_TOKENS = 1000


def _get_model(story: dict | None) -> str:
    val = (story or {}).get("meta", {}).get("runtime", {}).get("model")
    return val if isinstance(val, str) and val else _DEFAULT_MODEL


def _get_max_tokens(story: dict | None) -> int:
    val = (story or {}).get("meta", {}).get("runtime", {}).get("max_tokens")
    return val if isinstance(val, int) and val > 0 else _DEFAULT_MAX_TOKENS


NODE_MATCH_TOOL = {
    "name": "select_active_node",
    "description": (
        "Válaszd ki melyik node releváns a felhasználó promptjához, "
        "vagy jelezd ha pontosítás szükséges."
    ),
    "input_schema": {
        "type": "object",
        "required": ["activeNodeId", "askClarification"],
        "additionalProperties": False,
        "properties": {
            "activeNodeId": {
                "type": ["string", "null"],
                "description": (
                    "A kiválasztott node id-ja. "
                    "Null ha pontosítás szükséges."
                ),
            },
            "askClarification": {
                "type": "boolean",
                "description": (
                    "True ha a prompt alapján nem dönthető el "
                    "egyértelműen melyik node aktív."
                ),
            },
            "clarificationQuestion": {
                "type": ["string", "null"],
                "description": (
                    "Ha askClarification true: kötelező kitölteni magyar, barátságos, természetes hangnemben. "
                    "(1) Nevezd meg röviden, mi volt bizonytalan vagy többértelmű a felhasználó üzenetében. "
                    "(2) Sorolj fel 2–3 konkrét irányt vagy választási lehetőséget, amelyek a megadott jelölt node-ok "
                    "(NODE ID / leírás / hatókör) alapján értelmesek. "
                    "Tilos generikus szöveg (pl. csak „kérlek pontosítsd” típusú üzenet); mindig legyen konkrét tartalom."
                ),
            },
        },
    },
}

CONDITION_EXTRACT_TOOL = {
    "name": "extract_conditions",
    "description": (
        "Azonosítsd mely kondíciók teljesülnek "
        "a felhasználó promptja alapján."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "satisfied",
            "missing",
            "userHasOpenQuestion",
            "userQuestionSummary",
        ],
        "additionalProperties": False,
        "properties": {
            "satisfied": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Teljesült kondíciók ID listája.",
            },
            "missing": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Még nem teljesült kondíciók ID listája "
                    "amelyek relevánsak lehetnek."
                ),
            },
            "userHasOpenQuestion": {
                "type": "boolean",
                "description": (
                    "True ha a felhasználó kérdést tett fel. "
                    "A részletes szabályokat a system prompt question-detection "
                    "blokkja tartalmazza."
                ),
            },
            "userQuestionSummary": {
                "type": ["string", "null"],
                "description": (
                    "Ha userHasOpenQuestion true: egy rövid mondat összefoglalója "
                    "a kérdésről. Ha false: null."
                ),
            },
        },
    },
}

REPLY_TOOL = {
    "name": "generate_reply",
    "description": (
        "Generálj egy természetes, rövid chatbot választ "
        "a felhasználónak a kondíciók és routing eredménye alapján. "
        "Ha pontosítás kell, a válasz legyen egy kérdés. "
        "Ha van következő lépés, a válasz vezesse oda a felhasználót. "
        "Ha kondíciók teljesültek, nyugtázd és lépj tovább."
    ),
    "input_schema": {
        "type": "object",
        "required": ["assistantMessage"],
        "additionalProperties": False,
        "properties": {
            "assistantMessage": {
                "type": "string",
                "description": (
                    "A chatbot válasza a felhasználónak. "
                    "Rövid, természetes, 1-3 mondat. "
                    "Több külön gondolat esetén üres sorral (dupla sortörés) tagold a bekezdéseket."
                ),
            },
        },
    },
}

# Kényszerített tool választás: két fázisban (extract → reply) mindig lefut a kívánt tool.
_TOOL_CHOICE_EXTRACT = {"type": "tool", "name": "extract_conditions"}
_TOOL_CHOICE_REPLY = {"type": "tool", "name": "generate_reply"}


def _tool_input_from_response(response: object, tool_name: str) -> dict:
    content = getattr(response, "content", None) or []
    for block in content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            return cast(dict, block.input)
    return {}


def _iter_forced_generate_reply(
    *,
    system: str,
    user_message: str,
    temperature: float,
    tool_choice: dict,
    story: dict | None = None,
) -> Iterator[str]:
    """Stream `assistantMessage` karakter-delta a kényszerített generate_reply tool input JSON-ból."""
    accumulated = ""
    with client.messages.stream(
        model=_get_model(story),
        max_tokens=_get_max_tokens(story),
        temperature=temperature,
        system=_append_global_reply_rules(system, story=story),
        tools=[REPLY_TOOL],
        tool_choice=tool_choice,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for event in stream:
            if getattr(event, "type", None) == "input_json":
                snap = getattr(event, "snapshot", None)
                if isinstance(snap, dict):
                    am = snap.get("assistantMessage")
                    if isinstance(am, str) and len(am) > len(accumulated):
                        yield am[len(accumulated) :]
                        accumulated = am
        final = _tool_input_from_response(stream.get_final_message(), "generate_reply")
        am = final.get("assistantMessage")
        if isinstance(am, str) and len(am) > len(accumulated):
            yield am[len(accumulated) :]


def _sync_forced_generate_reply(
    *,
    system: str,
    user_message: str,
    temperature: float,
    tool_choice: dict,
    story: dict | None = None,
) -> str:
    return "".join(
        _iter_forced_generate_reply(
            system=system,
            user_message=user_message,
            temperature=temperature,
            tool_choice=tool_choice,
            story=story,
        )
    ).strip()


@dataclass
class AssistantStreamBundle:
    """Meta mezők kész (assistantMessage üres); a szöveg delta iteratorból épül."""

    meta: dict
    text_deltas: Iterator[str]


ProcessStepStreamResult = Union[dict, AssistantStreamBundle]


def _apply_step_tracking_meta(
    result: ProcessStepStreamResult,
    *,
    entry_step_id: str,
    effective_step_id: str,
) -> ProcessStepStreamResult:
    """Belépési vs tényleges step (skip lánc után) — API currentStepId követéshez."""
    eff = effective_step_id.strip() if effective_step_id else entry_step_id
    entry = entry_step_id.strip() if entry_step_id else eff
    if isinstance(result, dict):
        result["effectiveStepId"] = eff
        if entry and entry != eff:
            result["skippedFromStepId"] = entry
        _ensure_question_flags_dict(result)
    elif isinstance(result, AssistantStreamBundle):
        result.meta["effectiveStepId"] = eff
        if entry and entry != eff:
            result.meta["skippedFromStepId"] = entry
        _ensure_question_flags_dict(result.meta)
    return result


def _ensure_question_flags_dict(target: dict) -> None:
    """Biztosítja a question detection flag-ek jelenlétét a result/meta dict-ben.

    Az early-return ágak (skip, preset-satisfied) nem futtatnak LLM-extractet,
    ezért default False/None kerül beillesztésre. A fő ágban az értékek már
    kitöltöttek — itt felülírás nem történik.
    """
    target.setdefault("userHasOpenQuestion", False)
    target.setdefault("userQuestionSummary", None)


def _build_node_candidates_block(candidate_nodes: list[StoryPage]) -> str:
    lines = []
    for node in candidate_nodes:
        node_id = node.get("id", "")
        knowledge = node.get("knowledge") or {}
        description = (
            knowledge.get("description", "")
            if isinstance(knowledge, dict)
            else ""
        )
        scope = (
            knowledge.get("scope", "")
            if isinstance(knowledge, dict)
            else ""
        )
        lines.append(f"NODE ID: {node_id}")
        lines.append(f"Leírás: {description}")
        if scope:
            lines.append(f"Hatókör: {scope}")
        lines.append("")
    return "\n".join(lines).strip()


def _build_conditions_block(
    conditions: list[dict],
    already_satisfied: list[str],
) -> str:
    lines = []
    for c in conditions:
        cid = c.get("id", "")
        desc = c.get("description", "")
        status = "már teljesült" if cid in already_satisfied else "még nem ismert"
        lines.append(f"- {cid}: {desc} [{status}]")
    return "\n".join(lines)


def _build_skipped_steps_context_block(
    skipped_steps: list[dict],
    work_satisfied: list[str],
) -> str:
    """
    Átugrott (entry-skip) lépések internal_conditions leírásai extract kontextushoz.
    Nem kötelező kondíciók a jelenlegi lépéshez — csak korábbi, már teljesült lépés tényei.
    """
    if not skipped_steps:
        return ""

    sat_set = {x for x in work_satisfied if isinstance(x, str) and x}
    sections: list[str] = [
        "Átugrott lépések kontextusa (már teljesült done_when miatt — "
        "extracthez használd fel, ha az üzenet egyértelmű; "
        "ne kezeld kötelező hiányzóként a jelenlegi lépésben):"
    ]
    for step in skipped_steps:
        if not isinstance(step, dict):
            continue
        step_id = step.get("id", "") if isinstance(step.get("id"), str) else ""
        goal = step.get("goal", "") if isinstance(step.get("goal"), str) else ""
        header = f"[{step_id}]" if step_id else "[átugrott lépés]"
        if goal.strip():
            header += f" {goal.strip()}"
        sections.append(header)
        internal = step.get("internal_conditions") or []
        if not isinstance(internal, list) or not internal:
            sections.append("  (nincs internal_conditions)")
            continue
        for c in internal:
            if not isinstance(c, dict):
                continue
            cid = c.get("id", "")
            if not isinstance(cid, str) or not cid:
                continue
            desc = c.get("description", "") if isinstance(c.get("description"), str) else ""
            if cid in sat_set:
                status = "már teljesült (session)"
            else:
                status = "kontextus — állítsd be ha az üzenet egyértelmű"
            sections.append(f"  - {cid}: {desc} [{status}]")
    return "\n".join(sections)


def _compose_conditions_block_for_extract(
    current_step: dict,
    work_satisfied: list[str],
    skipped_steps: list[dict],
) -> str:
    conditions = current_step.get("internal_conditions") or []
    block = _build_conditions_block(conditions, work_satisfied)
    skipped_ctx = _build_skipped_steps_context_block(skipped_steps, work_satisfied)
    if not skipped_ctx:
        return block
    if block.strip():
        return f"{block}\n\n{skipped_ctx}"
    return skipped_ctx


_SKIP_EXTRACT_ONLY_PREFIX = (
    "FONTOS: Ez a belső lépés belépéskor átugrásra került (done_when már teljesült). "
    "Csak extract — NE generálj ügyfélnek választ. "
    "Azonosítsd a kondíciókat a felhasználó üzenetéből és állítsd satisfied-ként a session state-hez. "
)


_EXTRACT_IMAGE_CONDITION_HINT = (
    "Képhez kötött kondíciót csak akkor jelölj teljesültnek, "
    "ha a felhasználó valóban küldött képet, vagy explicit jelezte hogy nem tud képet küldeni."
)


def _build_step_extract_hint_blocks(
    *,
    active_node: dict,
    step: dict,
    work_satisfied: list[str],
    session_has_image: bool,
) -> str:
    session_wl = _session_facts_whitelist(active_node)

    image_extract_hint = ""
    if session_has_image:
        image_extract_hint = (
            "A felhasználó már korábban vagy most képet csatolt — "
            "a stephez tartozó fotó/bizonyíték kondíció(k) a rendszerben már teljesültek "
            "(image_provided / evidence_provided); ne kérdezz újra feltöltésre, ne tedd missing-be. "
        )

    step_extract_hint = step.get("extract_hint") or ""
    if step_extract_hint and not step_extract_hint.endswith(" "):
        step_extract_hint += " "

    session_facts_hint = ""
    if session_wl:
        already = [c for c in work_satisfied if c in session_wl]
        already_part = (
            f" Már teljesült session tények: {', '.join(already)}."
            if already
            else ""
        )
        session_facts_hint = (
            "Session tények (node szint — bármely lépésben felismerhetők, "
            "későbbi lépések ne kérdezzenek újra): "
            f"{', '.join(sorted(session_wl))}. "
            "Ha az üzenet vagy a korábbi beszélgetés alapján egy session tény már "
            "egyértelmű, állítsd be satisfied-ként még ha nem ez a lépés a hivatalos "
            f"helye.{already_part} "
        )

    return f"{image_extract_hint}{step_extract_hint}{session_facts_hint}"


def _run_step_extract_only(
    *,
    user_prompt: str,
    active_node: dict,
    step: dict,
    work_satisfied: list[str],
    prior_skipped_steps: list[dict],
    order_context: Optional[OrderContext],
    image_provided: bool,
    session_has_image: bool,
    node_description: str,
    prompt_newly_satisfied: list[str],
    skip_extract_only: bool,
    story: dict | None = None,
) -> tuple[list[str], list[str]]:
    """
    Egy step internal_conditions extract (API), reply nélkül.
    Vissza: (frissített work_satisfied, ebben a hívásban újonnan hozzáadott ID-k).
    """
    internal = step.get("internal_conditions") or []
    if not isinstance(internal, list) or not internal:
        return list(work_satisfied), []

    node_id = active_node.get("id", "") if isinstance(active_node.get("id"), str) else ""
    step_id = step.get("id", "") if isinstance(step.get("id"), str) else ""
    goal = step.get("goal", "") if isinstance(step.get("goal"), str) else ""
    ai_action = step.get("ai_action", "") if isinstance(step.get("ai_action"), str) else ""
    done_when = step.get("done_when", "") if isinstance(step.get("done_when"), str) else ""
    branches = step.get("branches") or []
    allowed_extract_ids = _allowed_extract_condition_ids(active_node, step)
    step_only_ids = _step_internal_condition_ids(step) | _branch_condition_ids(step)

    conditions_block = _compose_conditions_block_for_extract(
        step,
        work_satisfied,
        prior_skipped_steps,
    )
    hint_blocks = _build_step_extract_hint_blocks(
        active_node=active_node,
        step=step,
        work_satisfied=work_satisfied,
        session_has_image=session_has_image,
    )
    allowed_ids_hint = ""
    if allowed_extract_ids:
        allowed_ids_hint = (
            "Extract whitelist (step + session): "
            f"{', '.join(sorted(allowed_extract_ids))}. "
            f"A lépés hivatalos kondíciói: {', '.join(sorted(step_only_ids))}. "
            "Ne adj meg más ID-t. "
        )

    skip_prefix = _SKIP_EXTRACT_ONLY_PREFIX if skip_extract_only else ""
    system_extract = (
        f"{skip_prefix}"
        f"Te egy AI asszisztens vagy egy döntési rendszerben. "
        f"Az aktív node: {node_id}. "
        f"Node leírása: {node_description}. "
        f"Jelenlegi lépés célja: {goal}. "
        f"Elvégzendő feladat ha kondíciók nem teljesülnek: {ai_action}. "
        f"A lépés akkor tekinthető befejezettnek ha: {done_when}. "
        f"{hint_blocks}"
        f"{allowed_ids_hint}"
        "Csak az extract_conditions toolt hívd meg: "
        "azonosítsd mely belső kondíciók teljesülnek a felhasználó üzenete alapján. "
        f"{_EXTRACT_IMAGE_CONDITION_HINT}"
    )

    user_message = _compose_llm_user_message(
        f"Kondíciók:\n{conditions_block}\n\n"
        f"Felhasználó üzenete: {user_prompt}",
        active_node,
        order_context,
        image_provided=session_has_image,
        newly_satisfied=prompt_newly_satisfied,
        story=story,
    )

    extract_response = client.messages.create(
        model=_get_model(story),
        max_tokens=_get_max_tokens(story),
        system=system_extract,
        tools=[CONDITION_EXTRACT_TOOL],
        tool_choice=_TOOL_CHOICE_EXTRACT,
        messages=[{"role": "user", "content": user_message}],
    )

    condition_result = _tool_input_from_response(extract_response, "extract_conditions")
    condition_result = _filter_extract_image_conditions(
        condition_result,
        step,
        image_provided=image_provided,
        user_prompt=user_prompt,
        active_node=active_node,
        session_has_image=session_has_image,
    )
    condition_result = _filter_extract_to_known_conditions(
        condition_result,
        allowed=allowed_extract_ids,
        work_satisfied=work_satisfied,
    )
    condition_result = _filter_extract_by_validation_pattern(
        condition_result,
        active_node=active_node,
        current_step=step,
        story=story,
        user_prompt=user_prompt,
    )

    start_set = set(work_satisfied)
    newly: list[str] = []
    for cid in condition_result.get("satisfied", []):
        if isinstance(cid, str) and cid and cid not in start_set:
            work_satisfied.append(cid)
            start_set.add(cid)
            newly.append(cid)

    preset = set(work_satisfied)
    auto_added = _auto_satisfy_on_matched_goto_branch(
        step,
        preset,
        active_node,
        after_entry_skip=skip_extract_only,
    )
    for cid in auto_added:
        if cid not in start_set:
            work_satisfied.append(cid)
            start_set.add(cid)
            newly.append(cid)

    preset.update(auto_added)
    inject_added = _apply_matched_branch_inject_conditions(branches, preset, step)
    for cid in inject_added:
        if cid not in start_set:
            work_satisfied.append(cid)
            start_set.add(cid)
            newly.append(cid)

    for cid in _auto_satisfy_after_reply_ids(step):
        if cid not in start_set:
            work_satisfied.append(cid)
            start_set.add(cid)
            newly.append(cid)

    return work_satisfied, newly


def _extract_all_skipped_steps_conditions(
    skipped_steps: list[dict],
    work_satisfied: list[str],
    *,
    user_prompt: str,
    active_node: dict,
    order_context: Optional[OrderContext],
    image_provided: bool,
    session_has_image: bool,
    node_description: str,
    prompt_newly_satisfied: list[str],
    story: dict | None = None,
) -> tuple[list[str], list[str]]:
    """Entry-skip lánc: minden átugrott step internal_conditions extract, reply nélkül."""
    work = list(work_satisfied)
    all_newly: list[str] = []
    for i, skipped_step in enumerate(skipped_steps):
        if not isinstance(skipped_step, dict):
            continue
        work, added = _run_step_extract_only(
            user_prompt=user_prompt,
            active_node=active_node,
            step=skipped_step,
            work_satisfied=work,
            prior_skipped_steps=skipped_steps[:i],
            order_context=order_context,
            image_provided=image_provided,
            session_has_image=session_has_image,
            node_description=node_description,
            prompt_newly_satisfied=prompt_newly_satisfied,
            skip_extract_only=True,
            story=story,
        )
        impl_added = _apply_condition_implications(active_node, work)
        for cid in (*added, *impl_added):
            if cid not in all_newly:
                all_newly.append(cid)
    return work, all_newly


def _reroute_effective_step_after_skipped_extract(
    skipped_steps: list[dict],
    work_satisfied: list[str],
    active_node: dict,
    effective_step: dict,
    *,
    image_provided: bool,
) -> tuple[dict, list[str]]:
    """
    Átugrott lépések skip-extract után: branch újraértékelés friss sessionnel
    (pl. step_1 below_sold_threshold + evidence_provided → step_4, nem default step_2).
    """
    work = list(work_satisfied)
    effective = effective_step
    for skipped in skipped_steps:
        if not isinstance(skipped, dict):
            continue
        work, work_set, _ = _prepare_step_work_for_routing(
            skipped, work, active_node, image_provided=image_provided
        )
        for cid in _apply_condition_implications(active_node, work):
            if cid not in work:
                work.append(cid)
                work_set.add(cid)
        _apply_matched_branch_inject_conditions(
            skipped.get("branches") or [], work_set, skipped
        )
        transition = _resolve_step_transition(
            skipped.get("branches") or [],
            skipped.get("default_next"),
            work_set,
            active_node,
        )
        if transition.next_step_id:
            next_step = _find_step_in_node(active_node, transition.next_step_id)
            if next_step:
                effective = next_step
        elif isinstance(skipped.get("default_next"), str) and skipped.get("default_next"):
            next_step = _find_step_in_node(active_node, skipped["default_next"])
            if next_step:
                effective = next_step
    return effective, work


def _satisfied_union(
    already_satisfied: list[str],
    tool_satisfied: object,
) -> set[str]:
    """Session + modell által jelzett teljesült condition ID-k egyesítve."""
    s = {x for x in already_satisfied if isinstance(x, str) and x}
    if isinstance(tool_satisfied, list):
        for cid in tool_satisfied:
            if isinstance(cid, str) and cid:
                s.add(cid)
    return s


def _missing_minus_satisfied(
    missing: object,
    satisfied_ids: set[str],
) -> list[str]:
    """A modell missing listájából kiszűri a már teljesült ID-kat (session / tool satisfied)."""
    if not isinstance(missing, list):
        return []
    return [m for m in missing if isinstance(m, str) and m and m not in satisfied_ids]


def _find_step_in_node(active_node: dict, step_id: str) -> dict | None:
    raw_steps = active_node.get("steps")
    steps_list = raw_steps if isinstance(raw_steps, list) else []
    return next(
        (s for s in steps_list if isinstance(s, dict) and s.get("id") == step_id),
        None,
    )


def _session_has_image(*, image_provided: bool, satisfied: list[str]) -> bool:
    return image_provided or "image_provided" in satisfied


def _apply_late_image_backfill(
    active_node: dict,
    satisfied: list[str],
    sat_set: set[str],
) -> list[str]:
    """
    Node összes step-jén végigmegy, ha van late_image_backfill szabály:
    when_all teljesült → then kondíció hozzáadása.
    Csak ha kép már a session-ben van (hívó fél felelőssége ellenőrizni).
    """
    added: list[str] = []
    for step in active_node.get("steps") or []:
        if not isinstance(step, dict):
            continue
        for rule in step.get("late_image_backfill") or []:
            if not isinstance(rule, dict):
                continue
            then = rule.get("then")
            if not isinstance(then, str) or not then or then in sat_set:
                continue
            when_all = rule.get("when_all") or []
            if all(c in sat_set for c in when_all):
                satisfied.append(then)
                sat_set.add(then)
                added.append(then)
    return added


def _apply_deterministic_image_conditions(
    active_node: dict,
    step: dict,
    satisfied: list[str],
    *,
    image_provided: bool,
) -> list[str]:
    """
    Kép latch + step-specifikus backfill.

    - Új feltöltés: image_provided bekerül a sessionbe (bármely step).
    - Ha image_provided már a sessionben van: a jelenlegi (node, step) mapping
      lefut (pl. korábbi körben küldött kép → product-defect step_4-en
      evidence_provided).
    """
    added: list[str] = []
    sat_set = set(satisfied)

    if image_provided and "image_provided" not in sat_set:
        satisfied.append("image_provided")
        sat_set.add("image_provided")
        added.append("image_provided")

    if not _session_has_image(image_provided=image_provided, satisfied=satisfied):
        return added

    for cid in step.get("image_conditions") or []:
        if cid not in sat_set:
            satisfied.append(cid)
            sat_set.add(cid)
            added.append(cid)

    added.extend(_apply_late_image_backfill(active_node, satisfied, sat_set))

    return added


def _filter_extract_image_conditions(
    condition_result: dict,
    step: dict,
    *,
    image_provided: bool,
    user_prompt: str,
    active_node: dict,
    session_has_image: bool = False,
) -> dict:
    """LLM téves image flag eltávolítása, ha nincs feltöltés és nincs „nem tudok képet”."""
    satisfied = [
        c
        for c in (condition_result.get("satisfied") or [])
        if isinstance(c, str) and c
    ]
    if (
        image_provided
        or session_has_image
        or _user_declined_image(user_prompt, active_node)
    ):
        return {**condition_result, "satisfied": satisfied}

    image_cond_ids = set(step.get("image_conditions") or [])
    filtered = [c for c in satisfied if c not in image_cond_ids]
    return {**condition_result, "satisfied": filtered}


def _step_internal_condition_ids(step: dict) -> set[str]:
    ids: set[str] = set()
    for c in step.get("internal_conditions") or []:
        if isinstance(c, dict) and isinstance(c.get("id"), str) and c["id"]:
            ids.add(c["id"])
    return ids


def _branch_condition_ids(step: dict) -> set[str]:
    ids: set[str] = set()
    for branch in step.get("branches") or []:
        if not isinstance(branch, dict):
            continue
        for cond in branch.get("if") or []:
            if isinstance(cond, str) and cond:
                ids.add(cond)
    return ids


def _session_facts_whitelist(active_node: dict) -> set[str]:
    raw = active_node.get("session_facts_whitelist")
    if not isinstance(raw, list):
        return set()
    return {x for x in raw if isinstance(x, str) and x}


def _session_fact_descriptions(active_node: dict) -> dict[str, str]:
    """ID → leírás a whitelist elemekhez (step internal + node conditions)."""
    wanted = _session_facts_whitelist(active_node)
    if not wanted:
        return {}

    found: dict[str, str] = {}
    for c in active_node.get("conditions") or []:
        if isinstance(c, dict) and c.get("id") in wanted:
            found[c["id"]] = c.get("description", "")
    for step in active_node.get("steps") or []:
        if not isinstance(step, dict):
            continue
        for c in step.get("internal_conditions") or []:
            if isinstance(c, dict) and c.get("id") in wanted:
                found.setdefault(c["id"], c.get("description", ""))
    return found


def _allowed_extract_condition_ids(
    active_node: dict,
    current_step: dict,
) -> set[str]:
    """Step internal_conditions + branch if + node session_facts_whitelist."""
    return (
        _step_internal_condition_ids(current_step)
        | _branch_condition_ids(current_step)
        | _session_facts_whitelist(active_node)
    )


def _filter_extract_to_known_conditions(
    condition_result: dict,
    *,
    allowed: set[str],
    work_satisfied: list[str],
) -> dict:
    """LLM által kitalált, nem definiált kondíciók eldobása."""
    preset = set(work_satisfied) | allowed
    satisfied = [
        c
        for c in (condition_result.get("satisfied") or [])
        if isinstance(c, str) and c and c in preset
    ]
    missing = [
        c
        for c in (condition_result.get("missing") or [])
        if isinstance(c, str) and c and c in allowed
    ]
    return {**condition_result, "satisfied": satisfied, "missing": missing}


def _collect_validation_condition_defs(
    active_node: dict | None,
    current_step: dict | None = None,
) -> list:
    """Kondíció-definíció lista a validation_pattern_ref kereséshez.

    Egy node-on belül egy condition ID akár több helyen is definiálva lehet:
    node `conditions`, ill. bármely step `internal_conditions`. A LLM extract
    a `session_facts_whitelist` miatt eljuthat olyan ID-ig, ami csak egy másik
    step-ben van definiálva — ezért a teljes node-ot bejárjuk.

    Sorrend: current_step.internal_conditions → node.conditions → többi step.
    Az első találat (a `collect_validation_patterns`-ben) nyeri el a pattern-t.
    """
    defs: list = []
    seen: set[int] = set()

    def _push(items: object) -> None:
        if not isinstance(items, list):
            return
        for c in items:
            if not isinstance(c, dict):
                continue
            key = id(c)
            if key in seen:
                continue
            seen.add(key)
            defs.append(c)

    if isinstance(current_step, dict):
        _push(current_step.get("internal_conditions"))
    if isinstance(active_node, dict):
        _push(active_node.get("conditions"))
        for step in active_node.get("steps") or []:
            if isinstance(step, dict):
                _push(step.get("internal_conditions"))
    return defs


def _filter_extract_by_validation_pattern(
    condition_result: dict,
    *,
    active_node: dict | None,
    current_step: dict | None = None,
    story: dict | None,
    user_prompt: str | None,
) -> dict:
    """Story `meta.<ref>` regex-validáció az LLM által teljesítettnek jelölt
    kondíciókra, amelyeken `validation_pattern_ref` szerepel.

    Bukott kondíciók a `satisfied`-ből eltűnnek és a `missing`-be kerülnek.
    Az elutasított ID-kat egy belső `_validation_rejected` kulcson továbbadjuk,
    hogy a reply-prompt felhasználhassa (ne loggolja vagy adja vissza a kliensnek).
    """
    defs = _collect_validation_condition_defs(active_node, current_step)
    filtered, rejected = filter_satisfied_by_pattern_validation(
        condition_result,
        defs,
        story,
        user_prompt,
    )
    if rejected:
        filtered = {**filtered, "_validation_rejected": list(rejected)}
    return filtered


def _build_validation_rejection_block(
    rejected_ids: list[str] | None,
    *,
    active_node: dict | None,
    current_step: dict | None = None,
    story: dict | None = None,
) -> str:
    """Reply-prompt block ami megakadályozza hogy az LLM acknowledge-olja az
    érvénytelen (regex-validáción megbukott) felhasználói inputot.

    Tartalom: kondíció ID, leírás (ha van), és a referencia-pattern szövege.
    Kifejezett tilalom: "ne fogadd el", "ne mondj köszönetet/megkaptam"-ot.
    """
    if not rejected_ids:
        return ""

    defs = _collect_validation_condition_defs(active_node, current_step)
    desc_map: dict[str, str] = {}
    for cd in defs:
        if not isinstance(cd, dict):
            continue
        cid = cd.get("id")
        if not isinstance(cid, str) or not cid or cid in desc_map:
            continue
        d = cd.get("description")
        if isinstance(d, str) and d:
            desc_map[cid] = d

    pattern_map = collect_validation_patterns(defs, story)

    lines: list[str] = []
    for cid in rejected_ids:
        parts = [f"- {cid}"]
        d = desc_map.get(cid)
        if d:
            parts.append(f"leírás: {d}")
        p = pattern_map.get(cid)
        if p:
            parts.append(f"elvárt regex: {p}")
        lines.append(" — ".join(parts))

    return (
        "FORMÁTUM-VALIDÁCIÓ: Az alábbi kondíciókhoz tartozó adatot a felhasználó "
        "megpróbálta megadni a szövegben, DE a formátum NEM felel meg a követelménynek "
        "(regex-validáció bukott):\n"
        + "\n".join(lines)
        + "\nNagyon fontos: NE acknowledge-old (NE mondd hogy „megkaptam”, „rögzítettem”, "
        "„köszönöm”, „így minden megvan”, stb.). Udvariasan jelezd hogy a formátum nem "
        "megfelelő, és kérd be az adatot a kondíció leírásában szereplő (vagy a regex által "
        "leírt) helyes formátumban. "
    )


def _normalize_hu_match(text: str) -> str:
    t = text.lower().replace("\n", " ")
    for src, dst in (
        ("ő", "o"),
        ("ű", "u"),
        ("ó", "o"),
        ("é", "e"),
        ("á", "a"),
        ("í", "i"),
        ("ö", "o"),
        ("ü", "u"),
    ):
        t = t.replace(src, dst)
    return t


def _user_declined_image(user_prompt: str, active_node: dict) -> bool:
    triggers = active_node.get("image_decline_triggers") or []
    t = _normalize_hu_match(user_prompt)
    return any(_normalize_hu_match(p) in t for p in triggers)


def _condition_triggered_by_text(condition: dict, user_prompt: str) -> bool:
    """Visszaadja True-t, ha a kondíció text_triggers listájának bármely eleme
    szerepel a normalizált user_prompt-ban."""
    triggers = condition.get("text_triggers")
    if not triggers:
        return False
    t = _normalize_hu_match(user_prompt)
    return any(_normalize_hu_match(phrase) in t for phrase in triggers)


def _apply_text_triggers(
    node: dict,
    step: dict,
    satisfied: list[str],
    user_prompt: str,
    *,
    whitelist: set[str],
) -> list[str]:
    """
    Generikus text_triggers feldolgozás.
    Végigmegy a step internal_conditions + node conditions elemein.
    Ha egy kondíciónak van text_triggers listája, és a user prompt illeszkedik
    (ékezet-normalizálva), és az ID a whitelist-ben van → satisfy.
    """
    sat_set = set(satisfied)
    added: list[str] = []

    all_conditions: list[dict] = []
    for c in node.get("conditions") or []:
        if isinstance(c, dict):
            all_conditions.append(c)
    for c in step.get("internal_conditions") or []:
        if isinstance(c, dict):
            all_conditions.append(c)

    seen: set[str] = set()
    for cond in all_conditions:
        cid = cond.get("id")
        if not isinstance(cid, str) or not cid:
            continue
        if cid in seen or cid in sat_set:
            continue
        if cid not in whitelist:
            continue
        seen.add(cid)
        if not _condition_triggered_by_text(cond, user_prompt):
            continue
        satisfied.append(cid)
        sat_set.add(cid)
        added.append(cid)

    return added


def _apply_condition_implications(node: dict, satisfied: list[str]) -> list[str]:
    """Story condition_implications: when_all teljesül → then automatikusan satisfied."""
    raw = node.get("condition_implications")
    if not isinstance(raw, list):
        return []

    sat_set = set(satisfied)
    added: list[str] = []
    for rule in raw:
        if not isinstance(rule, dict):
            continue
        when_all = rule.get("when_all")
        then = rule.get("then")
        if not isinstance(when_all, list) or not isinstance(then, str) or not then.strip():
            continue
        if not all(isinstance(c, str) and c in sat_set for c in when_all):
            continue
        then_id = then.strip()
        if then_id not in sat_set:
            satisfied.append(then_id)
            sat_set.add(then_id)
            added.append(then_id)
    return added


def _apply_deterministic_session_facts(
    node: dict,
    step: dict,
    satisfied: list[str],
    user_prompt: str,
    *,
    whitelist: set[str],
) -> list[str]:
    """Node session_facts_whitelist + condition_implications + text_triggers."""
    implications = node.get("condition_implications")
    has_implications = isinstance(implications, list) and len(implications) > 0
    if not whitelist and not has_implications:
        return []

    added: list[str] = []
    added.extend(_apply_condition_implications(node, satisfied))
    sat_set = set(satisfied)

    def _add(cid: str) -> None:
        if cid in whitelist and cid not in sat_set:
            satisfied.append(cid)
            sat_set.add(cid)
            added.append(cid)

    text_added = _apply_text_triggers(
        node, step, satisfied, user_prompt, whitelist=whitelist
    )
    added.extend(text_added)
    sat_set = set(satisfied)

    for cond in step.get("internal_conditions") or []:
        if not isinstance(cond, dict):
            continue
        cid = cond.get("id")
        if cid not in text_added:
            continue
        fallback = cond.get("trigger_default_fallback")
        outcome_ids = cond.get("trigger_default_if_no_outcome")
        if not isinstance(fallback, str) or not fallback:
            continue
        if not isinstance(outcome_ids, list):
            continue
        if not any(isinstance(oid, str) and oid in sat_set for oid in outcome_ids):
            _add(fallback)

    return added


def _build_end_page_prompt_block(next_page_id: str) -> str:
    return (
        f"A jelenlegi lépés lezárult; következő végoldal: {next_page_id}. "
        "Legfeljebb egy rövid mondat: az ügy rögzítve. "
        "Ne ismételd az előző lépések tartalmát, ne adj határidőt vagy remedy-részleteket — "
        "a végoldal fix szövegét a rendszer külön megjeleníti. "
    )


def _looks_like_internal_ai_action(text: str) -> bool:
    """Belső LLM instrukció — ne jelenjen meg ügyfélnek."""
    t = text.lower()
    return (
        "jelezze" in t
        or "ne tesz fel több kérdést" in t
        or "branch routing" in t
        or "ne idézd szó szerint" in t
    )


def _assistant_message_for_goto_end(
    story_pages: dict | None,
    next_page_id: str,
    *,
    user_prompt: str,
    active_node: dict,
    order_context: Optional[OrderContext],
    image_provided: bool,
    newly_satisfied: list[str] | None,
    story: dict | None = None,
) -> str:
    """Goto végoldal: fix end content, vagy rövid generate_reply (soha nyers ai_action)."""
    end_content = resolve_end_page_content(
        story_pages, next_page_id, order_context=order_context
    )
    if end_content:
        return end_content

    tone = _fallback_tone_instruction(_node_fallback_message(active_node))
    system_reply = (
        f"{tone}"
        f"{_build_end_page_prompt_block(next_page_id)}"
        "Generálj egy rövid, természetes magyar lezáró mondatot (max 2 mondat). "
        f"{_get_ack_and_paragraph_instruction(story)} "
        "Mindig a generate_reply toolt hívd meg."
    )
    user_message = _compose_llm_user_message(
        f"Felhasználó üzenete: {user_prompt}",
        active_node,
        order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        story=story,
    )
    reply = _sync_generate_reply(
        _append_global_reply_rules(system_reply, story=story),
        user_message,
        story=story,
    )
    if reply.strip():
        return reply.strip()
    fb = _node_fallback_message(active_node)
    return fb or get_story_meta_string(story, "end_ack_fallback")


def _format_reply_rules_block(step: dict | None) -> str:
    """Story step reply_rules → LLM system prompt blokk (üres ha nincs)."""
    if not isinstance(step, dict):
        return ""
    raw = step.get("reply_rules")
    if not isinstance(raw, list):
        return ""
    rules = [r.strip() for r in raw if isinstance(r, str) and r.strip()]
    if not rules:
        return ""
    bullets = "\n".join(f"- {rule}" for rule in rules)
    return (
        "Válasz-szabályok (kötelező — a generate_reply assistantMessage betartandó):\n"
        f"{bullets}\n"
    )


def _format_tone_hint_block(active_node: dict | None) -> str:
    """Node-szintű tone_hint → LLM system prompt blokk (üres ha nincs vagy hiányos)."""
    if not isinstance(active_node, dict):
        return ""
    tone_hint = active_node.get("tone_hint")
    if not isinstance(tone_hint, dict):
        return ""
    style = tone_hint.get("style")
    note = tone_hint.get("note")
    if not isinstance(style, str) or not style.strip():
        return ""
    if not isinstance(note, str) or not note.strip():
        return ""
    return (
        "## Kommunikációs stílus\n"
        f"Stílus: {style.strip()}\n"
        f"Instrukció: {note.strip()}\n"
    )


def _format_question_detection_block(story: dict | None) -> str:
    """meta.question_detection_hint → system_extract prompt blokk (üres ha nincs)."""
    if not isinstance(story, dict):
        return ""
    meta = story.get("meta")
    if not isinstance(meta, dict):
        return ""
    hint = meta.get("question_detection_hint")
    if not isinstance(hint, dict):
        return ""
    true_if = hint.get("true_if") or []
    false_if = hint.get("false_if") or []
    uncertain = hint.get("uncertain", "false")
    lines = ["## Kérdés-detekció (userHasOpenQuestion)"]
    if isinstance(true_if, list) and true_if:
        lines.append("True ha:")
        lines.extend(f"- {item}" for item in true_if if isinstance(item, str) and item)
    if isinstance(false_if, list) and false_if:
        lines.append("False ha:")
        lines.extend(f"- {item}" for item in false_if if isinstance(item, str) and item)
    if isinstance(uncertain, str) and uncertain:
        lines.append(f"Ha bizonytalan: {uncertain}")
    lines.append(
        "Ha userHasOpenQuestion=true, userQuestionSummary egy rövid mondat "
        "összefoglaló legyen a kérdésről; ha false, akkor null."
    )
    return "\n".join(lines) + "\n"


_QUESTION_INDICATOR_KEYWORDS: tuple[str, ...] = (
    "miért", "hogyan", "mikor", "meddig", "mennyi", "mit", "mire",
    "hol", "ki ", "kinek", "melyik", "milyen", "mi az", "mi a ",
    "nem értem", "magyarázd", "magyarázz", "szeretném tudni",
    "kíváncsi vagyok", "mit jelent", "lehet-e", "kell-e",
    "muszáj-e", "kérdezem", "kérdésem van", "lenne egy kérdés",
)


def _message_might_contain_question(user_prompt: str) -> bool:
    """Pre-filter: True ha az üzenet potenciálisan kérdést tartalmaz.

    SZIGORÚAN biztonságos negatív szűrő — csak akkor ad False-t, ha sem
    kérdőjel, sem ismert magyar kérdés-indikátor szó/kifejezés nincs az
    üzenetben. A pre-filter szerepe a téves LLM-pozitívok kiszűrése; soha
    nem szabad False-t adnia olyan üzenetre amiben tényleg van kérdés.
    """
    if not isinstance(user_prompt, str) or not user_prompt.strip():
        return False
    lower = user_prompt.lower()
    if "?" in lower:
        return True
    return any(kw in lower for kw in _QUESTION_INDICATOR_KEYWORDS)


def _format_question_block(
    user_has_open_question: bool,
    user_question_summary: str,
) -> str:
    """Reaktív kérdéskezelés → reply prompt blokk (üres ha nincs nyitott kérdés)."""
    if not user_has_open_question:
        return ""
    summary_line = ""
    if isinstance(user_question_summary, str) and user_question_summary.strip():
        summary_line = (
            f"A felhasználó kérdése: {user_question_summary.strip()}\n"
        )
    return (
        "### Reaktív kérdéskezelés\n"
        "A felhasználó kérdést tett fel. Először válaszolj röviden (1-2 mondat) "
        "a kérdésre. Az üzenet VÉGÉN — egy mondatban — udvariasan ismételd meg "
        "az aktuális adatkérést. Ne fordítsd meg a sorrendet. Ne adj 2 mondatnál "
        "hosszabb választ a kérdésre.\n"
        f"{summary_line}"
    )


def _extract_user_facing_context(node: dict | None) -> dict | None:
    """Visszaadja a node `knowledge.user_facing_context` dict-jét, vagy None-t."""
    if not isinstance(node, dict):
        return None
    knowledge = node.get("knowledge")
    if not isinstance(knowledge, dict):
        return None
    ufc = knowledge.get("user_facing_context")
    if isinstance(ufc, dict):
        return ufc
    return None


def _format_single_user_facing_context(
    node: dict,
    *,
    is_current: bool,
) -> str:
    """Egyetlen node UFC formázása kompakt prompt-szegmenssé.

    Csak akkor ad vissza nem üres stringet, ha a node-nak van user_facing_context
    blokkja. A formátum:
        - Aktuális node: "Aktuális csomópont (id) — context, topics, fallback"
        - Korábbi node: "Korábban érintett: id — context, topics, fallback"
    """
    ufc = _extract_user_facing_context(node)
    if not ufc:
        return ""
    node_id = node.get("id", "") if isinstance(node.get("id"), str) else ""
    header = (
        f"#### Aktuális csomópont kontextusa ({node_id})"
        if is_current
        else f"#### Korábbi témakör kontextusa ({node_id})"
    )
    lines: list[str] = [header]

    context_val = ufc.get("context")
    if isinstance(context_val, str) and context_val.strip():
        lines.append(f"Kontextus: {context_val.strip()}")

    topics_raw = ufc.get("topics")
    if isinstance(topics_raw, list):
        topic_lines: list[str] = []
        for topic in topics_raw:
            if not isinstance(topic, dict):
                continue
            keys = topic.get("keys")
            guidance = topic.get("guidance")
            if not isinstance(guidance, str) or not guidance.strip():
                continue
            if isinstance(keys, list):
                keys_clean = [k for k in keys if isinstance(k, str) and k.strip()]
            else:
                keys_clean = []
            if keys_clean:
                key_str = " / ".join(keys_clean)
                topic_lines.append(f"- {key_str} → {guidance.strip()}")
            else:
                topic_lines.append(f"- {guidance.strip()}")
        if topic_lines:
            lines.append("Témák:")
            lines.extend(topic_lines)

    fallback_val = ufc.get("fallback")
    if isinstance(fallback_val, str) and fallback_val.strip():
        lines.append(f"Fallback: {fallback_val.strip()}")

    return "\n".join(lines)


def _format_user_facing_context_block(
    *,
    active_node: dict | None,
    story_pages: dict | None,
    session_id: str | None,
    user_has_open_question: bool,
    max_previous: int = 3,
) -> str:
    """Cross-node UFC blokk a reply prompthoz — csak nyitott kérdésnél nem üres.

    Logika:
      1. Aktuális node UFC-je (ha van) → primary blokk.
      2. Korábbi látogatott node-ok UFC-i (session event log alapján,
         legfeljebb `max_previous` darab) → secondary blokk.
         Az aktuális node-ot kihagyjuk a korábbiak közül.
      3. Ha sem aktuális, sem korábbi UFC nincs → üres string.
    """
    if not user_has_open_question:
        return ""

    sections: list[str] = []
    active_id = (
        active_node.get("id")
        if isinstance(active_node, dict) and isinstance(active_node.get("id"), str)
        else None
    )

    current_block = (
        _format_single_user_facing_context(active_node, is_current=True)
        if isinstance(active_node, dict)
        else ""
    )
    if current_block:
        sections.append(current_block)

    if (
        max_previous > 0
        and isinstance(session_id, str)
        and session_id.strip()
        and isinstance(story_pages, dict)
        and story_pages
    ):
        try:
            from services.session_event_sink import read_visited_nodes

            visited = read_visited_nodes(
                session_id.strip(), max_items=max(max_previous * 4, max_previous)
            )
        except Exception:
            visited = []

        previous_blocks: list[str] = []
        for node_id in reversed(visited):
            if not isinstance(node_id, str) or not node_id.strip():
                continue
            nid = node_id.strip()
            if active_id and nid == active_id:
                continue
            page = story_pages.get(nid) if isinstance(story_pages, dict) else None
            if not isinstance(page, dict):
                continue
            block = _format_single_user_facing_context(page, is_current=False)
            if not block:
                continue
            previous_blocks.append(block)
            if len(previous_blocks) >= max_previous:
                break
        sections.extend(previous_blocks)

    if not sections:
        return ""

    return (
        "### Témaspecifikus háttér (válasz a felhasználói kérdéshez)\n"
        + "\n\n".join(sections)
        + "\n"
    )


def _collect_do_not_reask_condition_ids(active_node: dict) -> list[str]:
    """Node conditions + step internal_conditions do_not_reask_if_satisfied flag."""
    out: list[str] = []
    seen: set[str] = set()

    def _scan(conds: object) -> None:
        if not isinstance(conds, list):
            return
        for c in conds:
            if not isinstance(c, dict) or not c.get("do_not_reask_if_satisfied"):
                continue
            cid = c.get("id")
            if isinstance(cid, str) and cid and cid not in seen:
                seen.add(cid)
                out.append(cid)

    _scan(active_node.get("conditions"))
    for step in active_node.get("steps") or []:
        if isinstance(step, dict):
            _scan(step.get("internal_conditions"))
    return out


def _build_satisfied_do_not_reask_instruction(active_node: dict) -> str:
    """
    do_not_reask_if_satisfied: true kondíciókból generikus instrukció.
    Ha a kondíciónak van do_not_reask_hint mezője, azt használja.
    Általános fallback minden flaggelt kondícióra.
    """
    flagged = _collect_do_not_reask_condition_ids(active_node)
    if not flagged:
        return ""

    flagged_conditions: dict[str, dict] = {}

    def _scan_for_hints(conds: object) -> None:
        if not isinstance(conds, list):
            return
        for c in conds:
            if not isinstance(c, dict):
                continue
            cid = c.get("id")
            if isinstance(cid, str) and cid and c.get("do_not_reask_if_satisfied"):
                flagged_conditions.setdefault(cid, c)

    _scan_for_hints(active_node.get("conditions"))
    for step in active_node.get("steps") or []:
        if isinstance(step, dict):
            _scan_for_hints(step.get("internal_conditions"))

    parts: list[str] = []

    for cid in flagged:
        cond = flagged_conditions.get(cid, {})
        hint = cond.get("do_not_reask_hint")
        if hint:
            parts.append(f"Ha {cid} teljesült: {hint} ")

    listed = ", ".join(sorted(flagged))
    parts.append(
        "Általános szabály: bármely kondíció ami már a teljesült listában van, "
        "annak megfelelő adatot TILOS újra bekérni a felhasználótól "
        f"({listed}). "
    )

    return "".join(parts)


@dataclass(frozen=True)
class StepTransition:
    """Következő belső step vagy külső (end) oldal a step lezárása után."""

    next_step_id: str | None = None
    next_page_id: str | None = None
    branch_message: str | None = None


def _step_ids_in_node(active_node: dict) -> set[str]:
    raw_steps = active_node.get("steps")
    if not isinstance(raw_steps, list):
        return set()
    return {
        sid
        for s in raw_steps
        if isinstance(s, dict) and isinstance(sid := s.get("id"), str) and sid
    }


def _resolve_step_transition(
    branches: object,
    default_next: object,
    satisfied_set: set[str],
    active_node: dict,
) -> StepTransition:
    """Step branch: `next_step` (belső) vagy `goto` (end/AI oldal); default_next ugyanígy.

    Ha a matched branch-en `message` mező van, a `StepTransition.branch_message`
    visszaadja — silent_on_matched_goto step lezárásakor ez használható
    egyetlen rövid bubble-ként az end node fix szövege előtt.
    """
    target: str | None = None
    branch_message: str | None = None
    if isinstance(branches, list):
        for branch in branches:
            if not isinstance(branch, dict):
                continue
            branch_conditions = branch.get("if") or []
            if not all(cid in satisfied_set for cid in branch_conditions):
                continue
            next_step = branch.get("next_step")
            goto = branch.get("goto")
            if isinstance(next_step, str) and next_step.strip():
                target = next_step.strip()
            elif isinstance(goto, str) and goto.strip():
                target = goto.strip()
            msg = branch.get("message")
            if isinstance(msg, str) and msg.strip():
                branch_message = msg.strip()
            break
    if not target and isinstance(default_next, str) and default_next.strip():
        target = default_next.strip()
    if not target:
        return StepTransition()
    step_ids = _step_ids_in_node(active_node)
    # Nincs steps lista → default_next/next_step (unit tesztek, egyszerű node-ok)
    if not step_ids or target in step_ids:
        return StepTransition(next_step_id=target, branch_message=branch_message)
    return StepTransition(next_page_id=target, branch_message=branch_message)


def _is_closing_step(step: dict) -> bool:
    """Lezáró step: rövid nyugtázás + routing (story step flag)."""
    return bool(step.get("is_closing", False))


def _apply_step_level_inject_conditions(
    step: dict,
    satisfied_set: set[str],
) -> list[str]:
    """Step szintű inject_conditions (nem csak branch-en)."""
    inject = step.get("inject_conditions")
    if not isinstance(inject, list):
        return []
    added: list[str] = []
    for cid in inject:
        if isinstance(cid, str) and cid.strip() and cid.strip() not in satisfied_set:
            satisfied_set.add(cid.strip())
            added.append(cid.strip())
    return added


def _apply_inject_list(inject: object, satisfied_set: set[str]) -> list[str]:
    added: list[str] = []
    if not isinstance(inject, list):
        return added
    for cid in inject:
        if isinstance(cid, str) and cid.strip() and cid.strip() not in satisfied_set:
            satisfied_set.add(cid.strip())
            added.append(cid.strip())
    return added


def _apply_matched_branch_inject_conditions(
    branches: object,
    satisfied_set: set[str],
    step: dict | None = None,
) -> list[str]:
    """Első illeszkedő step branch inject_conditions → satisfied (pl. return_source_defect)."""
    if not isinstance(branches, list):
        return []
    added: list[str] = []
    matched = False
    for branch in branches:
        if not isinstance(branch, dict):
            continue
        conds = branch.get("if") or []
        if conds and not all(c in satisfied_set for c in conds):
            continue
        matched = True
        added.extend(_apply_inject_list(branch.get("inject_conditions"), satisfied_set))
        break
    if not matched and isinstance(step, dict):
        added.extend(
            _apply_inject_list(step.get("default_inject_conditions"), satisfied_set)
        )
    return added


def _child_chain_reaches_terminal(
    start_step_id: str,
    work_satisfied: list[str],
    active_node: dict,
    *,
    story: dict | None = None,
    max_hops: int | None = None,
) -> bool:
    """Következő belső step(ek) preset-tel elérnek-e külső oldalt (rekurzió nélkül a szülőre)."""
    hop_limit = (
        max_hops
        if max_hops is not None
        else get_story_runtime_int(story, "max_chain_hops")
    )
    current_id: str | None = start_step_id
    work = list(work_satisfied)
    visited: set[str] = set()

    for _ in range(hop_limit):
        if not current_id or current_id in visited:
            return False
        visited.add(current_id)

        step = _find_step_in_node(active_node, current_id)
        if not step:
            return False

        can_complete, transition, work, _ = _evaluate_preset_step_completion(
            step, work, active_node
        )
        if not can_complete:
            return False
        if transition.next_page_id:
            return True
        if transition.next_step_id:
            current_id = transition.next_step_id
            continue
        return False
    return False


def _matched_goto_branch_prerequisites(
    current_step: dict,
    satisfied_set: set[str],
    active_node: dict | None,
) -> bool:
    """
    Auto-ack engedély elsősorban EXPLICIT matched `branches[*]` alapján:
    ha van olyan `goto` vagy `next_step` branch, amelynek minden `if`
    feltétele teljesül, True. Ilyenkor `next_step` esetén a closing step
    child-chain ellenőrzése fut a célon.

    Ha a step `branches` listája hiányzik vagy üres (tipikusan „pure
    closing" step: csak nyugtázó üzenet + `default_next` cross-node
    célra), a `default_next` cross-node célt elfogadjuk explicit
    routing szándékként — ez tartja életben a battery-issue/step_safety,
    payment-refund/step_4 stb. silent auto-ack mintát.

    Ha a step deklarált `branches` listával rendelkezik, de egyik sem
    matchel: alapértelmezésben False (ez akadályozza meg a túl korai
    auto-ack-et olyan closing step-ekben, mint a product-defect step_5,
    ahol több explicit ág van, de egyik sem teljesül). Kivétel: ha a
    step `permit_goto_auto_ack: true` flaggel rendelkezik és a
    `default_next` cross-node célra mutat, az explicit „opt-in" jel arra,
    hogy a default fallback is silent routing path — pl. payment-refund/
    step_4, ahol több specifikus end node mellett egy „általános"
    process-refund a fallback. A `suppress_goto_auto_ack: true` flag
    a `_permit_closing_auto_ack`-ben mindenképp felülírja.
    """
    step_branches = current_step.get("branches") or []
    if not isinstance(step_branches, list):
        step_branches = []

    has_declared_branches = any(
        isinstance(b, dict)
        and (
            (isinstance(b.get("goto"), str) and b["goto"].strip())
            or (isinstance(b.get("next_step"), str) and b["next_step"].strip())
        )
        for b in step_branches
    )

    matched_branch: dict | None = None
    for branch in step_branches:
        if not isinstance(branch, dict):
            continue
        goto = branch.get("goto")
        next_step = branch.get("next_step")
        has_goto = isinstance(goto, str) and goto.strip()
        has_next_step = isinstance(next_step, str) and next_step.strip()
        if not (has_goto or has_next_step):
            continue
        conds = branch.get("if") or []
        if not conds:
            continue
        if all(c in satisfied_set for c in conds):
            matched_branch = branch
            break

    if matched_branch is not None:
        if isinstance(matched_branch.get("goto"), str) and matched_branch["goto"].strip():
            return True
        if active_node is None or not _is_closing_step(current_step):
            return False
        next_step_id = matched_branch.get("next_step")
        if not isinstance(next_step_id, str) or not next_step_id.strip():
            return False
        return _child_chain_reaches_terminal(
            next_step_id.strip(),
            list(satisfied_set),
            active_node,
            story=None,
        )

    if active_node is None:
        return False

    default_next = current_step.get("default_next")
    if not isinstance(default_next, str) or not default_next.strip():
        return False

    step_ids = _step_ids_in_node(active_node)
    target = default_next.strip()
    is_cross_node = bool(step_ids) and target not in step_ids

    if has_declared_branches:
        if not current_step.get("permit_goto_auto_ack", False):
            return False
        return is_cross_node

    if is_cross_node:
        return True

    if not _is_closing_step(current_step):
        return False

    return _child_chain_reaches_terminal(
        target,
        list(satisfied_set),
        active_node,
        story=None,
    )


def _is_terminal_closing_step(step: dict) -> bool:
    return bool(step.get("is_terminal", False))


def _permit_closing_auto_ack(
    current_step: dict,
    satisfied_set: set[str],
    active_node: dict | None,
    *,
    after_entry_skip: bool = False,
    force_closing_permit: bool = False,
) -> bool:
    """
    Goto-lezáró ack (remedy_communicated, case_summary_confirmed) csak akkor,
    ha a step ténylegesen lezárható, vagy skip/lánc kontextusban vagyunk.

    `suppress_goto_auto_ack: true` mindig elsőbbséget élvez: ha a step
    explicit kéri a suppress-t, sem a `force_closing_permit`, sem az
    `after_entry_skip`, sem a `permit_goto_auto_ack: true` nem engedheti
    át az auto-ack-et.
    """
    if current_step.get("suppress_goto_auto_ack", False):
        return False
    if force_closing_permit:
        return True
    if after_entry_skip and _is_closing_step(current_step):
        return True
    if active_node is None or not _is_closing_step(current_step):
        return False
    node_id = (
        active_node.get("id", "")
        if isinstance(active_node.get("id"), str)
        else ""
    )
    step_id = (
        current_step.get("id", "")
        if isinstance(current_step.get("id"), str)
        else ""
    )
    if _step_completion_satisfied(node_id, step_id, current_step, satisfied_set):
        return False
    if not _matched_goto_branch_prerequisites(
        current_step, satisfied_set, active_node
    ):
        return False
    if current_step.get("permit_goto_auto_ack", False):
        return True
    return _is_terminal_closing_step(current_step)


def _should_silently_route_on_goto(
    current_step: dict,
    transition: "StepTransition",
) -> bool:
    """
    Csendes routing: a step `silent_on_matched_goto: true` flag-gel rendelkezik,
    ÉS a routing transition cross-node goto célpontra mutat (next_page_id van).

    Ha True: a hívó kihagyhatja az LLM reply generálást és üres `assistantMessage`-szel
    routolhat a célra. A `_resolve_step_transition` már kiválasztotta az első olyan
    branch-et, amely minden `if` feltétele teljesül — ha ez `goto`-ra mutat (vagy
    a default_next cross-node cél), `transition.next_page_id` van beállítva.
    """
    if not current_step.get("silent_on_matched_goto", False):
        return False
    return bool(transition.next_page_id)


def _auto_satisfy_on_matched_goto_branch(
    current_step: dict,
    satisfied_set: set[str],
    active_node: dict | None = None,
    *,
    after_entry_skip: bool = False,
    force_closing_permit: bool = False,
) -> list[str]:
    """
    Lezáró lépés: ha egy goto ág feltételei már teljesültek,
    a step kötelező kondícióit automatikusan teljesítettnek jelöli
    (pl. remedy_communicated a step_4-en, case_summary_confirmed step_5-ön).
    """
    conditions = current_step.get("internal_conditions") or []
    required_ids = [
        c.get("id")
        for c in conditions
        if isinstance(c, dict)
        and (cid := c.get("id"))
        and c.get("required") is not False
    ]
    if not required_ids:
        return []

    if not _matched_goto_branch_prerequisites(
        current_step, satisfied_set, active_node
    ):
        return []

    if active_node is not None and not _permit_closing_auto_ack(
        current_step,
        satisfied_set,
        active_node,
        after_entry_skip=after_entry_skip,
        force_closing_permit=force_closing_permit,
    ):
        return []

    added: list[str] = []
    for cid in required_ids:
        if cid not in satisfied_set:
            satisfied_set.add(cid)
            added.append(cid)
    return added


def _auto_satisfy_after_reply_ids(step: dict) -> list[str]:
    """Step internal_conditions közül azok ID-ja, amelyeken
    `auto_satisfy_after_reply: true` szerepel.

    Az engine ezt a listát hozzáadja a satisfied halmazokhoz az extract
    fázis után, de a step_done kiszámítása előtt. Generikus mechanizmus:
    sem node-, sem step-, sem condition-specifikus logikát nem tartalmaz.
    """
    out: list[str] = []
    for c in step.get("internal_conditions") or []:
        if isinstance(c, dict) and c.get("auto_satisfy_after_reply") is True:
            cid = c.get("id")
            if isinstance(cid, str) and cid:
                out.append(cid)
    return out


def _should_advance_after_step_completion(
    node_id: str,
    step_id: str,
    current_step: dict,
    *,
    step_done: bool,
    original_satisfied: set[str],
    new_satisfied: list[str],
) -> bool:
    """
    Következő belső lépés / lánc csak akkor, ha a step ténylegesen lezárt ezen a fordulón.
    Ha minden kötelező kondíció már a sessionben volt és az extract nem adott újat,
    köztes step (pl. step_3d) még fut — ne ugorjunk tovább ugyanabban a válaszban.
    """
    if not step_done:
        return False
    if _is_closing_step(current_step):
        return True
    required_ids = [
        cid
        for c in (current_step.get("internal_conditions") or [])
        if isinstance(c, dict) and (cid := c.get("id")) and c.get("required") is not False
    ]
    if not required_ids:
        return True
    if (
        current_step.get("advance_requires_new_satisfaction", False)
        and all(r in original_satisfied for r in required_ids)
        and not any(r in new_satisfied for r in required_ids)
    ):
        return False
    return True


def _should_chain_to_next_step(
    current_step: dict,
    transition: StepTransition,
) -> bool:
    """Egyes köztes lépések után a következő step külön user fordulót kap."""
    _ = transition
    return bool(current_step.get("chain_on_complete", True))


def _step_completion_satisfied(
    node_id: str,
    step_id: str,
    current_step: dict,
    satisfied_set: set[str],
) -> bool:
    """
    A step kötelező kondíciói teljesültek-e.
    Egyes step-eknél OR logika (pl. product-defect step_3).
    """
    required_ids = [
        cid
        for c in (current_step.get("internal_conditions") or [])
        if isinstance(c, dict) and (cid := c.get("id")) and c.get("required") is not False
    ]
    if not required_ids:
        return False
    return all(cid in satisfied_set for cid in required_ids)


@dataclass
class _EntrySkipResolution:
    effective_step: dict
    work_satisfied: list[str]
    skipped_goals: list[str]
    auto_added: list[str]
    skipped_steps: list[dict] = field(default_factory=list)
    terminal_result: ProcessStepStreamResult | None = None


_DONE_WHEN_SUFFIXES_TO_STRIP: tuple[str, ...] = (
    "teljesül",
    "are satisfied",
    "is satisfied",
)


def _parse_done_when_condition_groups(done_when: str) -> list[list[str]]:
    """done_when → AND-csoportok; egy csoporton belül OR alternatívák.

    Mindkét locale done_when format-ot támogatja:
    * Hu: ``"<a> és <b> teljesül"`` (vagy `"<a> vagy <b>"`)
    * En: ``"<a> and <b> are satisfied"`` (vagy `"<a> or <b>"`)
    """
    if not done_when.strip():
        return []
    text = done_when.strip().lower()
    text = (
        text
        .replace("vagy", "|")
        .replace(" or ", " | ")
        .replace("(", " ")
        .replace(")", " ")
    )
    parts = re.split(r"\s+és\s+|\s+and\s+", text)
    groups: list[list[str]] = []
    for part in parts:
        for suffix in _DONE_WHEN_SUFFIXES_TO_STRIP:
            part = part.replace(suffix, "")
        part = part.strip()
        if not part:
            continue
        if "|" in part:
            alts = [a.strip() for a in part.split("|") if a.strip()]
        else:
            alts = [part] if part else []
        if alts:
            groups.append(alts)
    return groups


def _check_step_already_done(
    node_id: str,
    step_id: str,
    step: dict,
    satisfied: set[str],
) -> bool:
    """True ha a step done_when összes feltétele már teljesült (skip)."""
    if not step.get("skippable", True):
        return False

    done_when = step.get("done_when", "")
    groups = _parse_done_when_condition_groups(
        done_when if isinstance(done_when, str) else ""
    )
    if not groups:
        return _step_completion_satisfied(node_id, step_id, step, satisfied)
    for group in groups:
        if not any(alt in satisfied for alt in group):
            return False
    return True


def _infer_skip_backfill_conditions(
    step: dict,
    satisfied: set[str],
) -> list[str]:
    """Sessionből már ismert tények → step done_when kondíciók (skip lánc).
    A szabályok a step JSON skip_backfill mezőjéből olvasódnak."""
    added: list[str] = []
    for rule in step.get("skip_backfill") or []:
        if not isinstance(rule, dict):
            continue
        then = rule.get("then")
        if not isinstance(then, str) or not then:
            continue
        if then in satisfied:
            continue
        requires = rule.get("requires") or []
        if not all(r in satisfied for r in requires):
            continue
        if_any = rule.get("if_any") or []
        if not if_any or not any(c in satisfied for c in if_any):
            continue
        added.append(then)
    return added


def _prepare_step_work_for_routing(
    step: dict,
    work: list[str],
    active_node: dict,
    *,
    image_provided: bool = False,
) -> tuple[list[str], set[str], list[str]]:
    node_id = active_node.get("id", "") if isinstance(active_node.get("id"), str) else ""
    step_id = step.get("id", "") if isinstance(step.get("id"), str) else ""
    work_list = list(work)
    image_backfill = _apply_deterministic_image_conditions(
        active_node, step, work_list, image_provided=image_provided
    )
    preset = {x for x in work_list if isinstance(x, str) and x}
    _apply_step_level_inject_conditions(step, preset)
    branches = step.get("branches") or []
    _apply_matched_branch_inject_conditions(branches, preset, step)
    all_auto = list(dict.fromkeys(image_backfill))
    return list(preset), preset, all_auto


def _format_skipped_steps_ack_block(skipped_goals: list[str]) -> str:
    if not skipped_goals:
        return ""
    goals_joined = "; ".join(skipped_goals)
    return (
        "A következő belső lépések tényei már ismertek voltak korábbi üzenetekből "
        f"(már teljesültek, ne kérdezz rá újra): {goals_joined}. "
        "A válaszod ELŐSZÖR egyetlen rövid mondattal foglald össze természetesen, "
        "mit már megértettél ezekből (ne lista, ne hosszú recap, maximum egy mondat). "
        "UTÁNA azonnal folytasd a jelenlegi lépés feladatával — egyetlen összefüggő "
        "válaszban. "
    )


def _resolve_step_entry_with_skip(
    *,
    start_step: dict,
    work_satisfied: list[str],
    active_node: dict,
    original_satisfied: set[str],
    image_provided: bool,
    user_prompt: str,
    story_pages: dict | None,
    story: dict | None = None,
    order_context: Optional[OrderContext],
    prompt_newly_satisfied: list[str],
    session_id: str,
    turn_count: int,
    stream_assistant: bool,
    on_transition: bool = False,
) -> _EntrySkipResolution:
    """
    Belépéskor: done_when már teljesült step(ek) kihagyása, célok gyűjtése,
    első nem-skip stepre ugrás (max mélység).
    """
    node_id = active_node.get("id", "") if isinstance(active_node.get("id"), str) else ""
    current = start_step
    work = list(work_satisfied)
    skipped_goals: list[str] = []
    skipped_steps: list[dict] = []
    all_auto: list[str] = []
    depth = 0
    max_skip_depth = get_story_runtime_int(story, "max_entry_skip_depth")

    while depth < max_skip_depth:
        step_id = current.get("id", "") if isinstance(current.get("id"), str) else ""
        work, work_set, step_auto = _prepare_step_work_for_routing(
            current, work, active_node, image_provided=image_provided
        )
        for cid in _infer_skip_backfill_conditions(current, work_set):
            if cid not in work:
                work.append(cid)
                work_set.add(cid)
        all_auto.extend(step_auto)

        if not _check_step_already_done(node_id, step_id, current, work_set):
            break

        if on_transition:
            print(
                f"[STEP SKIP] step {step_id} skipped on transition — "
                "done_when already satisfied by session"
            )
        else:
            print(
                f"[STEP SKIP] step {step_id} skipped — "
                "done_when already satisfied by session"
            )
        skipped_steps.append(current)
        goal = current.get("goal", "")
        if isinstance(goal, str) and goal.strip():
            skipped_goals.append(goal.strip())

        branches = current.get("branches") or []
        default_next = current.get("default_next")
        transition = _resolve_step_transition(
            branches, default_next, work_set, active_node
        )

        if transition.next_page_id:
            newly = _newly_since_original(
                original_satisfied,
                all_auto,
                [
                    c
                    for c in work
                    if c not in original_satisfied
                ],
            )
            terminal = _build_goto_end_result(
                closing_step=current,
                active_node=active_node,
                next_page_id=transition.next_page_id,
                story_pages=story_pages,
                story=story,
                user_prompt=user_prompt,
                order_context=order_context,
                image_provided=image_provided,
                newly_satisfied=list(
                    dict.fromkeys([*prompt_newly_satisfied, *newly])
                ),
                session_id=session_id,
                turn_count=turn_count,
                satisfied=work,
                newly=newly,
                stream_assistant=stream_assistant,
                branch_message=transition.branch_message,
            )
            return _EntrySkipResolution(
                effective_step=current,
                work_satisfied=work,
                skipped_goals=skipped_goals,
                auto_added=list(dict.fromkeys(all_auto)),
                skipped_steps=skipped_steps,
                terminal_result=terminal,
            )

        if not transition.next_step_id:
            break

        next_step = _find_step_in_node(active_node, transition.next_step_id)
        if not next_step:
            break
        current = next_step
        depth += 1
    else:
        print("[STEP SKIP] maximum skip depth reached")

    return _EntrySkipResolution(
        effective_step=current,
        work_satisfied=work,
        skipped_goals=skipped_goals,
        auto_added=list(dict.fromkeys(all_auto)),
        skipped_steps=skipped_steps,
        terminal_result=None,
    )


def _evaluate_preset_step_completion(
    step: dict,
    work_satisfied: list[str],
    active_node: dict,
) -> tuple[bool, StepTransition, list[str], list[str]]:
    """
    Lehetséges-e a stepet LLM nélkül lezárni (minden kötelező kondíció + routing).
    Vissza: (can_complete, transition, final_satisfied, auto_added).
    """
    conditions = step.get("internal_conditions") or []
    branches = step.get("branches") or []
    default_next = step.get("default_next")

    if not conditions:
        transition = _resolve_step_transition(
            branches, default_next, set(work_satisfied), active_node
        )
        return True, transition, list(work_satisfied), []

    node_id = active_node.get("id", "") if isinstance(active_node.get("id"), str) else ""
    step_id = step.get("id", "") if isinstance(step.get("id"), str) else ""
    work = list(work_satisfied)
    image_backfill = _apply_deterministic_image_conditions(
        active_node, step, work, image_provided=False
    )
    preset = {x for x in work if isinstance(x, str) and x}
    _apply_step_level_inject_conditions(step, preset)
    auto_added = _auto_satisfy_on_matched_goto_branch(
        step,
        preset,
        active_node,
        force_closing_permit=_is_closing_step(step),
    )
    _apply_matched_branch_inject_conditions(branches, preset, step)
    all_auto = list(dict.fromkeys([*image_backfill, *auto_added]))
    if not _step_completion_satisfied(node_id, step_id, step, preset):
        return False, StepTransition(), work, all_auto

    transition = _resolve_step_transition(
        branches, default_next, preset, active_node
    )
    return True, transition, list(preset), all_auto


def _build_goto_end_result(
    *,
    closing_step: dict,
    active_node: dict,
    next_page_id: str,
    story_pages: dict | None,
    story: dict | None = None,
    user_prompt: str,
    order_context: Optional[OrderContext],
    image_provided: bool,
    newly_satisfied: list[str] | None,
    session_id: str,
    turn_count: int,
    satisfied: list[str],
    newly: list[str],
    stream_assistant: bool = False,
    branch_message: str | None = None,
) -> ProcessStepStreamResult:
    """
    Lezáró step nyugtázása (assistantMessage) + végoldal fix szövege (endPageContent).

    silent_on_matched_goto step esetén:
    - ha a matched branch-en van `message`, azt küldjük el rövid bubble-ként;
    - különben üres assistantMessage (csak az end node fix szövege jelenik meg).
    """
    end_content = (
        resolve_end_page_content(
            story_pages, next_page_id, order_context=order_context
        )
        or ""
    ).strip()
    if closing_step.get("silent_on_matched_goto", False):
        if isinstance(branch_message, str) and branch_message.strip():
            closing_ack = branch_message.strip()
        else:
            closing_ack = ""
    else:
        closing_ack = generate_step_start_reply(
            user_prompt,
            active_node,
            closing_step,
            order_context=order_context,
            image_provided=image_provided,
            newly_satisfied=newly_satisfied,
            session_id=session_id,
            turn_count=turn_count,
        ).strip()
        if not closing_ack:
            closing_ack = "Köszönjük, rögzítettük."

    meta: dict = {
        "satisfied": satisfied,
        "newlySatisfied": newly,
        "missing": [],
        "stepDone": True,
        "nextStepId": None,
        "nextPageId": next_page_id,
        "assistantMessage": closing_ack,
        "endPageContent": end_content or None,
    }
    if stream_assistant:
        # End szöveg csak endPageContent-ben — ne streameljük, különben duplikálódik a UI-ban.
        return AssistantStreamBundle(meta, iter([closing_ack]))
    return meta


def _newly_since_original(
    original_satisfied: set[str],
    *condition_lists: list[str],
) -> list[str]:
    out: list[str] = []
    for lst in condition_lists:
        for c in lst:
            if c and c not in original_satisfied and c not in out:
                out.append(c)
    return out


def _chain_until_terminal(
    *,
    start_step_id: str,
    work_satisfied: list[str],
    original_satisfied: set[str],
    active_node: dict,
    user_prompt: str,
    story_pages: dict | None,
    story: dict | None = None,
    order_context: Optional[OrderContext],
    image_provided: bool,
    prompt_newly_satisfied: list[str],
    session_id: str,
    turn_count: int,
    parent_newly: list[str],
    stream_assistant: bool,
) -> ProcessStepStreamResult | None:
    """
    Belső step-lánc végigvitele egy API hívásban (pl. step_4 → step_5 → end).
  """
    current_id: str | None = start_step_id
    work = list(work_satisfied)
    accumulated_auto: list[str] = list(parent_newly)
    visited: set[str] = set()
    closing_step: dict | None = None

    while current_id:
        if current_id in visited:
            return None
        visited.add(current_id)

        step = _find_step_in_node(active_node, current_id)
        if not step:
            return None

        node_id = (
            active_node.get("id", "")
            if isinstance(active_node.get("id"), str)
            else ""
        )
        step_id = step.get("id", "") if isinstance(step.get("id"), str) else ""
        work, work_set, pre_auto = _prepare_step_work_for_routing(
            step, work, active_node, image_provided=image_provided
        )
        for cid in _infer_skip_backfill_conditions(step, work_set):
            if cid not in work:
                work.append(cid)
                work_set.add(cid)
        accumulated_auto.extend(pre_auto)

        if _check_step_already_done(node_id, step_id, step, work_set):
            print(
                f"[STEP SKIP] step {step_id} skipped — "
                "done_when already satisfied by session"
            )
            transition = _resolve_step_transition(
                step.get("branches") or [],
                step.get("default_next"),
                work_set,
                active_node,
            )
            closing_step = step
            if transition.next_page_id:
                newly = _newly_since_original(
                    original_satisfied,
                    accumulated_auto,
                )
                return _build_goto_end_result(
                    closing_step=step,
                    active_node=active_node,
                    next_page_id=transition.next_page_id,
                    story_pages=story_pages,
                    story=story,
                    user_prompt=user_prompt,
                    order_context=order_context,
                    image_provided=image_provided,
                    newly_satisfied=list(
                        dict.fromkeys(
                            [*prompt_newly_satisfied, *accumulated_auto]
                        )
                    ),
                    session_id=session_id,
                    turn_count=turn_count,
                    satisfied=work,
                    newly=newly,
                    stream_assistant=stream_assistant,
                    branch_message=transition.branch_message,
                )
            if transition.next_step_id:
                current_id = transition.next_step_id
                continue
            return None

        can_complete, transition, work, auto_added = _evaluate_preset_step_completion(
            step,
            work,
            active_node,
        )
        accumulated_auto.extend(auto_added)
        if not can_complete:
            return None

        closing_step = step

        if transition.next_page_id:
            newly = _newly_since_original(
                original_satisfied,
                accumulated_auto,
            )
            return _build_goto_end_result(
                closing_step=step,
                active_node=active_node,
                next_page_id=transition.next_page_id,
                story_pages=story_pages,
                story=story,
                user_prompt=user_prompt,
                order_context=order_context,
                image_provided=image_provided,
                newly_satisfied=list(
                    dict.fromkeys(
                        [*prompt_newly_satisfied, *accumulated_auto]
                    )
                ),
                session_id=session_id,
                turn_count=turn_count,
                satisfied=work,
                newly=newly,
                stream_assistant=stream_assistant,
                branch_message=transition.branch_message,
            )

        if transition.next_step_id:
            current_id = transition.next_step_id
            continue

        return None

    return None


def _try_chain_complete_after_step(
    *,
    transition: StepTransition,
    work_satisfied: list[str],
    original_satisfied: set[str],
    active_node: dict,
    user_prompt: str,
    story_pages: dict | None,
    story: dict | None = None,
    order_context: Optional[OrderContext],
    image_provided: bool,
    prompt_newly_satisfied: list[str],
    session_id: str,
    turn_count: int,
    parent_newly: list[str],
    stream_assistant: bool,
) -> ProcessStepStreamResult | None:
    """
    Ha a következő belső step(ek) már presettel lezárható(k),
    egy API hívásban végigviszi — nem kell külön user üzenet.
    """
    if not transition.next_step_id:
        return None
    return _chain_until_terminal(
        start_step_id=transition.next_step_id,
        work_satisfied=work_satisfied,
        original_satisfied=original_satisfied,
        active_node=active_node,
        user_prompt=user_prompt,
        story_pages=story_pages,
        story=story,
        order_context=order_context,
        image_provided=image_provided,
        prompt_newly_satisfied=prompt_newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        parent_newly=parent_newly,
        stream_assistant=stream_assistant,
    )


_DEFAULT_ORDER_CONTEXT_FOOTER = "Ezeket a tényeket ne kérdezd meg újra a felhasználótól."


def build_order_context_block(
    ctx: Optional[OrderContext],
    image_provided: bool = False,
    order_context_footer: str | None = None,
) -> str:
    """
    Rövid, strukturált szöveg amit az LLM system vagy user üzenetébe
    injektálunk. Az LLM ebből tudja hogy tracking_status mit mutat
    anélkül hogy a usertől kellene megkérdezni.
    """
    image_line = "- Csatolt kép: az ügyfél képet küldött ehhez az üzenethez."
    footer = order_context_footer or _DEFAULT_ORDER_CONTEXT_FOOTER

    if ctx is None:
        if not image_provided:
            return ""
        return "\n".join(
            [
                "### Rendelési adatok (rendszer által ismert tények)",
                "",
                image_line,
            ]
        )

    lines = ["### Rendelési adatok (rendszer által ismert tények)"]

    if ctx.tracking_number:
        lines.append(f"- Tracking szám: {ctx.tracking_number}")
    if ctx.courier:
        lines.append(f"- Futárszolgálat: {ctx.courier}")
    if ctx.tracking_status:
        lines.append(f"- Tracking státusz: {ctx.tracking_status}")
    if ctx.delivery_date:
        lines.append(f"- Kézbesítés dátuma: {ctx.delivery_date}")
    if ctx.estimated_delivery_date:
        lines.append(f"- Várható kézbesítés: {ctx.estimated_delivery_date}")

    if ctx.sold_grade:
        lines.append(f"- Vásárolt grade: {ctx.sold_grade}")
    if ctx.sold_battery_threshold is not None:
        lines.append(f"- Ígért battery health küszöb: {ctx.sold_battery_threshold:.0%}")
    if ctx.extended_warranty_active is not None:
        lines.append(
            f"- Extended warranty: {'aktív' if ctx.extended_warranty_active else 'nincs'}"
        )
    if ctx.accessories_in_order is not None:
        lines.append(f"- Rendelésben ígért tartozékok: {', '.join(ctx.accessories_in_order)}")
    if ctx.purchase_date:
        lines.append(f"- Vásárlás dátuma: {ctx.purchase_date}")
    if ctx.payment_method:
        lines.append(f"- Fizetési mód: {ctx.payment_method}")

    if ctx.return_initiated_date:
        lines.append(f"- Visszaküldés kezdeményezve: {ctx.return_initiated_date}")
    if ctx.return_received_date:
        lines.append(f"- Visszaküldés beérkezett a raktárba: {ctx.return_received_date}")
    if ctx.original_complaint_type:
        lines.append(f"- Eredeti panasz típusa: {ctx.original_complaint_type}")
    if ctx.refund_initiated_date:
        lines.append(f"- Visszatérítés elindítva: {ctx.refund_initiated_date}")
    if ctx.refund_eta_date:
        lines.append(f"- Visszatérítés várható dátuma: {ctx.refund_eta_date}")
    if ctx.refund_amount is not None and ctx.refund_currency:
        amount_text = f"{ctx.refund_amount:.2f}".rstrip("0").rstrip(".")
        lines.append(f"- Visszatérítendő összeg: {amount_text} {ctx.refund_currency}")
    if ctx.prior_case_id:
        lines.append(f"- Korábbi ügyazonosító: {ctx.prior_case_id}")

    if image_provided:
        lines.append(image_line)

    lines.append(footer)

    return "\n".join(lines)


_DEFAULT_NEWLY_SATISFIED_LABELS: dict[str, str] = {
    "surroundings_checked": "az ügyfél ellenőrizte a szomszédoknál",
    "tracking_screenshot_provided": "tracking képernyőkép megérkezett",
    "damage_photos_provided": "sérülési fotók megérkeztek",
    "image_provided": "kép csatolva",
    "defect_described": "hiba leírása megérkezett",
    "exclusion_check_done": "kizárási okok tisztázva",
    "evidence_provided": "bizonyíték megérkezett",
    "charger_tested": "töltő tesztelve",
    "battery_health_known": "battery health érték megadva",
    "remedy_preference_known": "preferált megoldás megadva",
    "product_condition_assessed": "termék állapota felmérve",
    "reset_confirmed": "gyári visszaállítás megerősítve",
    "screenshot_provided": "képernyőkép megérkezett",
    "ordered_spec_known": "rendelt specifikáció tisztázva",
    "received_spec_known": "kapott specifikáció tisztázva",
    "missing_accessory_identified": "hiányzó tartozék azonosítva",
    "photos_provided": "fotók megérkeztek",
    "courier_contacted": "futárszolgálat megkeresve",
    "loss_confirmed": "csomag elveszett megerősítve",
}


def build_newly_satisfied_block(
    newly_satisfied: list[str],
    condition_labels: dict | None = None,
) -> str:
    if not newly_satisfied:
        return ""

    labels = {**_DEFAULT_NEWLY_SATISFIED_LABELS, **(condition_labels or {})}

    items = []
    for cid in newly_satisfied:
        label = labels.get(cid, cid.replace("_", " "))
        items.append(f"- {label}")

    block = "### Most teljesült kondíciók (igazold vissza ezeket):\n"
    block += "\n".join(items)
    return block


def _compose_llm_user_message(
    core_user_message: str,
    active_node: dict,
    order_context: Optional[OrderContext],
    image_provided: bool,
    newly_satisfied: list[str] | None,
    story: dict | None = None,
) -> str:
    """Újonnan teljesült kondíció blokk elején, majd order context a végén."""
    condition_labels = None
    if isinstance(story, dict):
        meta = story.get("meta")
        if isinstance(meta, dict):
            raw = meta.get("condition_labels")
            if isinstance(raw, dict):
                condition_labels = raw
    ns_block = build_newly_satisfied_block(
        newly_satisfied or [], condition_labels=condition_labels
    )
    if ns_block:
        body = f"{ns_block}\n\n{core_user_message}"
    else:
        body = core_user_message
    return _append_order_context_to_user_message(
        body,
        active_node,
        order_context,
        image_provided=image_provided,
        story=story,
    )


# Fallback — ha a story meta.reply_style nem tartalmaz értéket
_REPLY_ACK_AND_PARAGRAPH_INSTRUCTION = (
    "Ha a felhasználó üzenete előtt szerepel a „### Most teljesült kondíciók…” blokk, "
    "a válaszban ezeket röviden, természetesen nyugtázd (egy rövid mondatban). "
    "Egymástól független gondolatokat (például nyugta majd következő kérdés) külön bekezdésben adj meg: "
    "az assistantMessage szövegben használj dupla sortörést (egy üres sort) a bekezdések között."
)

GLOBAL_REPLY_RULES = """
Stílus szabályok — minden válaszra kötelező:
- Maximum 3 mondat per válasz
- Ne ismételd vissza amit az ügyfél mondott
- Ne említs olyan adatot ami nem releváns az aktuális lépéshez
- Ne összegezz ha nem az utolsó step
- Lezárt eset után ne indíts új magyarázatot
"""


def _get_global_reply_rules(story: dict | None) -> str:
    """meta.reply_style.global_rules → formázott string. Fallback: GLOBAL_REPLY_RULES."""
    rules = (
        (story or {})
        .get("meta", {})
        .get("reply_style", {})
        .get("global_rules")
    )
    if not rules or not isinstance(rules, list):
        return GLOBAL_REPLY_RULES
    items = "\n".join(f"- {r}" for r in rules if isinstance(r, str) and r)
    return f"\nStílus szabályok — minden válaszra kötelező:\n{items}\n"


def _get_ack_and_paragraph_instruction(story: dict | None) -> str:
    """meta.reply_style.ack_and_paragraph_instruction. Fallback: konstans."""
    hint = (
        (story or {})
        .get("meta", {})
        .get("reply_style", {})
        .get("ack_and_paragraph_instruction")
    )
    if isinstance(hint, str) and hint:
        return hint
    return _REPLY_ACK_AND_PARAGRAPH_INSTRUCTION


def _append_global_reply_rules(system: str, story: dict | None = None) -> str:
    """Globális stílusszabályok a generate_reply system prompt végére."""
    rules = _get_global_reply_rules(story).strip()
    if not rules:
        return system.rstrip()
    return f"{system.rstrip()}\n{rules}"

_ASSISTANT_OPENING_VARIANTS = (
    "Te egy AI asszisztens vagy egy ügyfélszolgálati döntési rendszerben.",
    "Ügyfélszolgálati döntési rendszerben dolgozó AI asszisztensként lépsz fel a felhasználóval.",
    "AI asszisztensként segítesz egy ügyfélszolgálati döntéstámogató rendszerben.",
    "Egy ügyfélszolgálati ügyintézésre szabott döntési rendszerben vagy AI asszisztens.",
)

_REPLY_TEMPERATURE = 0.8


def _assistant_opening_line(session_id: str, node_id: str, turn_count: int) -> str:
    """Ugyanaz a szerep, más megfogalmazás — stabil választás session + node + kör alapján."""
    key = f"{session_id}\x1f{node_id}\x1f{turn_count}".encode("utf-8")
    idx = int.from_bytes(
        hashlib.sha256(key).digest()[:8],
        "big",
    ) % len(_ASSISTANT_OPENING_VARIANTS)
    return _ASSISTANT_OPENING_VARIANTS[idx]


def _append_order_context_to_user_message(
    user_message: str,
    active_node: dict,
    order_context: Optional[OrderContext],
    image_provided: bool = False,
    story: dict | None = None,
) -> str:
    _ = active_node
    footer: str | None = None
    if isinstance(story, dict):
        meta = story.get("meta")
        if isinstance(meta, dict):
            raw = meta.get("order_context_footer")
            if isinstance(raw, str) and raw.strip():
                footer = raw
    block = build_order_context_block(
        order_context,
        image_provided=image_provided,
        order_context_footer=footer,
    )
    if not block.strip():
        return user_message
    return f"{user_message}\n\n{block}"


def _node_fallback_message(active_node: dict) -> str:
    raw = active_node.get("fallback_message")
    return raw.strip() if isinstance(raw, str) else ""


def _fallback_tone_instruction(fallback_message: str) -> str:
    if not fallback_message:
        return ""
    return (
        "A válaszod hangnemét és tartalmát ez határozza meg (ne idézd vissza szó szerint, "
        "fogalmazd át természetes chat üzenetként): "
        f"{fallback_message} "
    )


def _resolve_assistant_message(
    reply_text: str,
    active_node: dict,
    *,
    ai_action: str = "",
    story: dict | None = None,
) -> str:
    """LLM válasz; üres esetén node fallback_message, majd ai_action (ha nem belső instrukció)."""
    default_fallback = get_story_meta_string(story, "default_fallback")
    if reply_text.strip():
        return reply_text.strip()
    fb = _node_fallback_message(active_node)
    if fb:
        return fb
    if isinstance(ai_action, str) and ai_action.strip():
        if _looks_like_internal_ai_action(ai_action):
            return fb or default_fallback
        return ai_action.strip()
    return ""


def _sync_generate_reply(
    system: str,
    user_message: str,
    story: dict | None = None,
) -> str:
    reply_response = client.messages.create(
        model=_get_model(story),
        max_tokens=_get_max_tokens(story),
        temperature=_REPLY_TEMPERATURE,
        system=_append_global_reply_rules(system, story=story),
        tools=[REPLY_TOOL],
        tool_choice=_TOOL_CHOICE_REPLY,
        messages=[{"role": "user", "content": user_message}],
    )
    reply_result = _tool_input_from_response(reply_response, "generate_reply")
    am = reply_result.get("assistantMessage")
    return am if isinstance(am, str) else ""


def _step_start_reply_prompts(
    user_prompt: str,
    active_node: dict,
    first_step: dict,
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    skipped_steps_goals: list[str] | None = None,
    story: dict | None = None,
) -> tuple[str, str, str]:
    """(system_prompt, user_message, ai_action fallback)."""
    node_id = active_node.get("id", "")
    knowledge = active_node.get("knowledge") or {}
    node_description = (
        knowledge.get("description", "")
        if isinstance(knowledge, dict)
        else ""
    )
    goal = first_step.get("goal", "")
    ai_action = first_step.get("ai_action", "")
    if not isinstance(ai_action, str):
        ai_action = ""
    reply_rules_block = _format_reply_rules_block(first_step)

    opening = _assistant_opening_line(session_id, node_id, turn_count)
    skip_block = _format_skipped_steps_ack_block(skipped_steps_goals or [])
    tone_hint_block = _format_tone_hint_block(active_node)

    system_prompt = (
        f"{opening} "
        f"Az aktív node: {node_id}. "
        f"A node szerepe és háttere (kötelező kontextus): {node_description}. "
        f"{skip_block}"
        f"{tone_hint_block}"
        f"Jelenleg az első lépésen vagy. A lépés célja: {goal}. "
        "Utasítás számodra (ezt végezd el a beszélgetésben, ne idézd vissza szó szerint): "
        f"{ai_action} "
        f"{reply_rules_block}"
        "Generálj egy rövid, természetes, barátságos chat választ a felhasználó üzenetére. "
        f"{_get_ack_and_paragraph_instruction(story)} "
        "Mindig a generate_reply toolt hívd meg a válasszal."
    )

    base_user = f"Felhasználó üzenete: {user_prompt}"
    user_message = _compose_llm_user_message(
        base_user,
        active_node,
        order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        story=story,
    )
    return system_prompt, user_message, ai_action


def generate_step_start_reply(
    user_prompt: str,
    active_node: dict,
    first_step: dict,
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    already_satisfied: list[str] | None = None,
    skipped_steps_goals: list[str] | None = None,
    skip_chain_resolved: bool = False,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> str:
    """
    Step első válasz: természetes üzenet a node knowledge + első lépés utasítása alapján.
    REPLY_TOOL + client.messages.stream (teljes szöveg összegyűjtve).
    """
    effective_step = first_step
    goals = list(skipped_steps_goals or [])
    if already_satisfied is not None and not skip_chain_resolved:
        skip_res = _resolve_step_entry_with_skip(
            start_step=first_step,
            work_satisfied=list(already_satisfied),
            active_node=active_node,
            original_satisfied=set(already_satisfied),
            image_provided=image_provided,
            user_prompt=user_prompt,
            story_pages=story_pages,
            story=story,
            order_context=order_context,
            prompt_newly_satisfied=list(newly_satisfied or []),
            session_id=session_id,
            turn_count=turn_count,
            stream_assistant=False,
        )
        effective_step = skip_res.effective_step
        goals = skip_res.skipped_goals

    system_prompt, user_message, ai_action = _step_start_reply_prompts(
        user_prompt,
        active_node,
        effective_step,
        order_context=order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        skipped_steps_goals=goals,
        story=story,
    )
    text = _sync_forced_generate_reply(
        system=system_prompt,
        user_message=user_message,
        temperature=_REPLY_TEMPERATURE,
        tool_choice={"type": "any"},
        story=story,
    )
    resolved = _resolve_assistant_message(
        text, active_node, ai_action=ai_action, story=story
    )
    if resolved:
        return resolved
    return ai_action if ai_action else ""


def iter_generate_step_start_reply_text(
    user_prompt: str,
    active_node: dict,
    first_step: dict,
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    already_satisfied: list[str] | None = None,
    skipped_steps_goals: list[str] | None = None,
    skip_chain_resolved: bool = False,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> Iterator[str]:
    """Ugyanaz a hívás mint generate_step_start_reply, de karakter-delta iterator."""
    effective_step = first_step
    goals = list(skipped_steps_goals or [])
    if already_satisfied is not None and not skip_chain_resolved:
        skip_res = _resolve_step_entry_with_skip(
            start_step=first_step,
            work_satisfied=list(already_satisfied),
            active_node=active_node,
            original_satisfied=set(already_satisfied),
            image_provided=image_provided,
            user_prompt=user_prompt,
            story_pages=story_pages,
            story=story,
            order_context=order_context,
            prompt_newly_satisfied=list(newly_satisfied or []),
            session_id=session_id,
            turn_count=turn_count,
            stream_assistant=True,
        )
        effective_step = skip_res.effective_step
        goals = skip_res.skipped_goals

    system_prompt, user_message, _ = _step_start_reply_prompts(
        user_prompt,
        active_node,
        effective_step,
        order_context=order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        skipped_steps_goals=goals,
        story=story,
    )
    yield from _iter_forced_generate_reply(
        system=system_prompt,
        user_message=user_message,
        temperature=_REPLY_TEMPERATURE,
        tool_choice={"type": "any"},
        story=story,
    )


def match_active_node(
    user_prompt: str,
    candidate_nodes: list[StoryPage],
    story: dict | None = None,
) -> dict:
    """
    1. API hívás: meghatározza melyik node aktív,
    vagy pontosítást kér.

    Visszatér:
    {
        "activeNodeId": str | None,
        "askClarification": bool,
        "clarificationQuestion": str | None,
    }
    """
    candidates_block = _build_node_candidates_block(candidate_nodes)

    system_prompt = (
        "Te egy döntési rendszer node-illesztő komponense vagy. "
        "A felhasználó üzenetét kell a legmegfelelőbb node-hoz rendelned. "
        "Csak a megadott node-ok közül választhatsz. "
        "Ha a prompt alapján nem dönthető el egyértelműen melyik node "
        "releváns, állítsd be az askClarification mezőt true-ra, és töltsd ki a clarificationQuestion mezőt. "
        "Ha askClarification true: a clarificationQuestion tilos legyen általános „kérlek pontosíts” jellegű üzenet. "
        "Kötelező tartalom: (1) egy rövid mondatban nevezd meg, mi volt bizonytalan vagy többértelmű a felhasználó üzenetében; "
        "(2) sorolj fel 2–3 konkrét lehetőséget vagy irányt, amelyek közül választhat — ezeket a fenti, elérhető jelölt node-ok "
        "(NODE ID, leírás, hatókör) alapján fogalmazd meg, természetesen és barátságosan, magyarul. "
        "Mindig a select_active_node toolt hívd meg a válasszal."
    )

    user_message = (
        f"Elérhető node-ok:\n\n{candidates_block}\n\n"
        f"Felhasználó üzenete: {user_prompt}"
    )

    response = client.messages.create(
        model=_get_model(story),
        max_tokens=_get_max_tokens(story),
        system=system_prompt,
        tools=[NODE_MATCH_TOOL],
        tool_choice={"type": "any"},
        messages=[{"role": "user", "content": user_message}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "select_active_node":
            return cast(dict, block.input)

    return {
        "activeNodeId": None,
        "askClarification": True,
        "clarificationQuestion": "Pontosítás szükséges.",
    }


def is_pure_routing_node(node: dict) -> bool:
    """Node with conditions+routing but no steps (routing-only)."""
    if not isinstance(node, dict):
        return False
    raw_steps = node.get("steps")
    if isinstance(raw_steps, list) and len(raw_steps) > 0:
        return False
    conditions = node.get("conditions")
    routing = node.get("routing")
    return (
        isinstance(conditions, list)
        and len(conditions) > 0
        and isinstance(routing, list)
        and len(routing) > 0
    )


def resolve_routing_chain_to_step_entry(
    *,
    pages: dict,
    src: str,
    start_page_id: str,
    satisfied_conditions: list[str],
    user_prompt: str,
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    session_id: str = "",
    turn_count: int = 1,
    story: dict | None = None,
) -> tuple[str, dict, dict, list[str]] | None:
    """
    Walk pure-routing nodes from start_page_id until a stepped node is found.
    Returns (target_page_id, target_node, first_step, satisfied_conditions) or None.
    """
    if not isinstance(start_page_id, str) or not start_page_id.strip():
        return None
    if not isinstance(pages, dict):
        return None

    work_satisfied = list(satisfied_conditions)
    current_id = start_page_id.strip()
    visited: set[str] = set()

    max_routing_depth = get_story_runtime_int(story, "max_routing_chain_depth")
    for _ in range(max_routing_depth):
        if current_id in visited:
            return None
        visited.add(current_id)

        node = pages.get(current_id)
        if not isinstance(node, dict):
            return None

        raw_steps = node.get("steps")
        steps = raw_steps if isinstance(raw_steps, list) else []
        if steps:
            first_step = steps[0]
            if isinstance(first_step, dict):
                return current_id, node, first_step, work_satisfied
            return None

        if not is_pure_routing_node(node):
            return None

        condition_result = extract_conditions(
            user_prompt=user_prompt,
            active_node=node,
            already_satisfied=work_satisfied,
            order_context=order_context,
            image_provided=image_provided,
            session_id=session_id,
            turn_count=turn_count,
            generate_reply=False,
        )
        mapping = get_order_context_mapping(story)
        work_satisfied = resolve_satisfied_precedence(
            list(condition_result.get("satisfied") or work_satisfied),
            mapping=mapping,
        )

        routing_result = get_ai_node_payload(
            page_id=current_id,
            src=src,
            satisfied_conditions=work_satisfied,
        )
        if routing_result.get("ask"):
            return None
        next_id = routing_result.get("nextPageId")
        if not isinstance(next_id, str) or not next_id.strip():
            return None
        current_id = next_id.strip()

    return None


def extract_conditions(
    user_prompt: str,
    active_node: dict,
    already_satisfied: list[str],
    next_page_id: str | None = None,
    ask_clarification: bool = False,
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    session_id: str = "",
    turn_count: int = 1,
    *,
    generate_reply: bool = True,
    pre_extracted: dict | None = None,
    story: dict | None = None,
) -> dict:
    """
    Két API hívás sorban (ha van conditions lista):
    1. extract_conditions — kondíció felismerés
    2. generate_reply — chatbot válasz a felismert kondíciók alapján

    Üres conditions esetén csak generate_reply (node knowledge + fallback_message).

    generate_reply=False: csak kondíció-felismerés (routing handoff előtt).
    pre_extracted: már felismert kondíciók — csak reply fázis (ask / pontosítás).
    """
    conditions = active_node.get("conditions")
    if not isinstance(conditions, list):
        conditions = []

    node_id = active_node.get("id", "")
    knowledge = active_node.get("knowledge") or {}
    node_description = (
        knowledge.get("description", "")
        if isinstance(knowledge, dict)
        else ""
    )
    fallback_message = _node_fallback_message(active_node)
    tone_instruction = _fallback_tone_instruction(fallback_message)

    routing_context = ""
    if ask_clarification:
        routing_context = "A kondíciók alapján pontosítás szükséges."
    elif next_page_id:
        routing_context = f"Ha elegendő kondíció teljesül, a következő lépés: {next_page_id}."

    opening = _assistant_opening_line(session_id, node_id, turn_count)

    mapping = get_order_context_mapping(story)
    if pre_extracted is not None:
        all_satisfied = resolve_satisfied_precedence(
            list(pre_extracted.get("satisfied") or already_satisfied),
            mapping=mapping,
        )
        missing_list = list(pre_extracted.get("missing") or [])
        new_satisfied = list(pre_extracted.get("newlySatisfied") or [])
    else:
        all_satisfied = None
        missing_list = None
        new_satisfied = None

    if not conditions:
        if not generate_reply:
            return {
                "satisfied": list(already_satisfied),
                "missing": [],
                "newlySatisfied": [],
                "assistantMessage": "",
            }
        user_message = _compose_llm_user_message(
            f"Felhasználó üzenete: {user_prompt}",
            active_node,
            order_context,
            image_provided=image_provided,
            newly_satisfied=None,
            story=story,
        )
        system_reply = (
            f"{opening} "
            f"Az aktív node: {node_id}. "
            f"Node leírása: {node_description}. "
            f"{tone_instruction}"
            f"Routing kontextus: {routing_context} "
            "Nincs kondíció-felismerési lépés ezen a node-on; generálj természetes, "
            "rövid chat választ a felhasználónak a node szerepe és a fenti hangnem alapján. "
            f"{_get_ack_and_paragraph_instruction(story)} "
            "Mindig a generate_reply toolt hívd meg."
        )
        reply_text = _sync_generate_reply(system_reply, user_message, story=story)
        return {
            "satisfied": list(already_satisfied),
            "missing": [],
            "newlySatisfied": [],
            "assistantMessage": _resolve_assistant_message(reply_text, active_node),
        }

    conditions_block = _build_conditions_block(conditions, already_satisfied)

    system_extract = (
        f"Te egy AI asszisztens vagy egy döntési rendszerben. "
        f"Az aktív node: {node_id}. "
        f"Node leírása: {node_description}. "
        f"Routing kontextus: {routing_context} "
        "Csak az extract_conditions toolt hívd meg: "
        "azonosítsd mely kondíciók teljesülnek a felhasználó üzenete alapján."
    )

    user_message = _append_order_context_to_user_message(
        f"Kondíciók:\n{conditions_block}\n\n"
        f"Felhasználó üzenete: {user_prompt}",
        active_node,
        order_context,
        image_provided=image_provided,
        story=story,
    )

    if pre_extracted is None:
        extract_response = client.messages.create(
            model=_get_model(story),
            max_tokens=_get_max_tokens(story),
            system=system_extract,
            tools=[CONDITION_EXTRACT_TOOL],
            tool_choice=_TOOL_CHOICE_EXTRACT,
            messages=[{"role": "user", "content": user_message}],
        )

        condition_result = _tool_input_from_response(
            extract_response, "extract_conditions"
        )
        condition_result = _filter_extract_by_validation_pattern(
            condition_result,
            active_node=active_node,
            current_step=None,
            story=story,
            user_prompt=user_prompt,
        )

        new_satisfied = [
            cid for cid in condition_result.get("satisfied", [])
            if cid not in already_satisfied
        ]
        all_satisfied = list(already_satisfied) + new_satisfied
        satisfied_ids = _satisfied_union(
            already_satisfied, condition_result.get("satisfied")
        )
        missing_list = _missing_minus_satisfied(
            condition_result.get("missing"), satisfied_ids
        )

    if not generate_reply:
        return {
            "satisfied": all_satisfied,
            "missing": missing_list,
            "newlySatisfied": new_satisfied,
            "assistantMessage": "",
        }

    satisfied_joined = ", ".join(all_satisfied) if all_satisfied else "(nincs)"
    missing_joined = ", ".join(missing_list) if missing_list else "(nincs)"
    validation_rejection_block = _build_validation_rejection_block(
        condition_result.get("_validation_rejected") if isinstance(condition_result, dict) else None,
        active_node=active_node,
        current_step=None,
        story=story,
    )

    system_reply = (
        f"{opening} "
        f"Az aktív node: {node_id}. "
        f"Node leírása: {node_description}. "
        f"{tone_instruction}"
        f"Routing kontextus: {routing_context} "
        "A kondíció-felismerés már megtörtént; a válaszodnak ehhez kell igazodnia:\n"
        f"- Teljesült kondíciók (összesen): {satisfied_joined}\n"
        f"- Első kör szerinti missing lista: {missing_joined}\n"
        f"{validation_rejection_block}"
        "Generálj természetes, rövid chat választ a felhasználónak. "
        f"{_get_ack_and_paragraph_instruction(story)} "
        "Mindig a generate_reply toolt hívd meg."
    )

    reply_text = _sync_generate_reply(system_reply, user_message, story=story)

    return {
        "satisfied": all_satisfied,
        "missing": missing_list,
        "newlySatisfied": new_satisfied,
        "assistantMessage": _resolve_assistant_message(reply_text, active_node),
    }


def _process_step_impl(
    user_prompt: str,
    active_node: dict,
    current_step: dict,
    already_satisfied: list[str],
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    *,
    story_pages: dict | None = None,
    story: dict | None = None,
    stream_assistant: bool,
    step_tracking: dict[str, str] | None = None,
) -> ProcessStepStreamResult:
    default_fallback = get_story_meta_string(story, "default_fallback")
    conditions = current_step.get("internal_conditions") or []
    goal = current_step.get("goal", "")
    ai_action = current_step.get("ai_action", "")
    reply_rules_block = _format_reply_rules_block(current_step)
    done_when = current_step.get("done_when", "")
    branches = current_step.get("branches") or []
    default_next = current_step.get("default_next")

    node_id = active_node.get("id", "") if isinstance(active_node.get("id"), str) else ""
    step_id = current_step.get("id", "") if isinstance(current_step.get("id"), str) else ""
    knowledge = active_node.get("knowledge") or {}
    node_description = (
        knowledge.get("description", "")
        if isinstance(knowledge, dict)
        else ""
    )

    original_satisfied = set(
        x for x in already_satisfied if isinstance(x, str) and x
    )
    work_satisfied = list(already_satisfied)
    image_det_added = _apply_deterministic_image_conditions(
        active_node,
        current_step,
        work_satisfied,
        image_provided=image_provided,
    )
    session_whitelist = _session_facts_whitelist(active_node)
    session_det_added = _apply_deterministic_session_facts(
        active_node,
        current_step,
        work_satisfied,
        user_prompt,
        whitelist=session_whitelist,
    )
    det_added = list(dict.fromkeys([*image_det_added, *session_det_added]))
    session_has_image = _session_has_image(
        image_provided=image_provided, satisfied=work_satisfied
    )
    prompt_newly_satisfied = list(
        dict.fromkeys([*(newly_satisfied or []), *det_added])
    )

    skip_res = _resolve_step_entry_with_skip(
        start_step=current_step,
        work_satisfied=work_satisfied,
        active_node=active_node,
        original_satisfied=original_satisfied,
        image_provided=image_provided,
        user_prompt=user_prompt,
        story_pages=story_pages,
        story=story,
        order_context=order_context,
        prompt_newly_satisfied=prompt_newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        stream_assistant=stream_assistant,
    )
    if skip_res.terminal_result is not None:
        return skip_res.terminal_result

    work_satisfied = skip_res.work_satisfied
    skipped_steps_goals = skip_res.skipped_goals
    for cid in skip_res.auto_added:
        if cid not in det_added:
            det_added.append(cid)
    prompt_newly_satisfied = list(
        dict.fromkeys([*prompt_newly_satisfied, *skip_res.auto_added])
    )

    if skip_res.skipped_steps:
        work_satisfied, skip_extract_newly = _extract_all_skipped_steps_conditions(
            skip_res.skipped_steps,
            work_satisfied,
            user_prompt=user_prompt,
            active_node=active_node,
            order_context=order_context,
            image_provided=image_provided,
            session_has_image=session_has_image,
            node_description=node_description,
            prompt_newly_satisfied=prompt_newly_satisfied,
            story=story,
        )
        for cid in skip_extract_newly:
            if cid not in det_added:
                det_added.append(cid)
        prompt_newly_satisfied = list(
            dict.fromkeys([*prompt_newly_satisfied, *skip_extract_newly])
        )
        rerouted_step, work_satisfied = _reroute_effective_step_after_skipped_extract(
            skip_res.skipped_steps,
            work_satisfied,
            active_node,
            skip_res.effective_step,
            image_provided=image_provided,
        )
        skip_res = _EntrySkipResolution(
            effective_step=rerouted_step,
            work_satisfied=work_satisfied,
            skipped_goals=skip_res.skipped_goals,
            auto_added=skip_res.auto_added,
            skipped_steps=skip_res.skipped_steps,
            terminal_result=skip_res.terminal_result,
        )

    current_step = skip_res.effective_step
    step_id = (
        current_step.get("id", "")
        if isinstance(current_step.get("id"), str)
        else ""
    )
    if step_tracking is not None:
        step_tracking["effective"] = step_id
    conditions = current_step.get("internal_conditions") or []
    goal = current_step.get("goal", "")
    ai_action = current_step.get("ai_action", "")
    reply_rules_block = _format_reply_rules_block(current_step)
    done_when = current_step.get("done_when", "")
    branches = current_step.get("branches") or []
    default_next = current_step.get("default_next")
    allowed_extract_ids = _allowed_extract_condition_ids(active_node, current_step)

    if not conditions:
        transition = _resolve_step_transition(
            branches, default_next, set(work_satisfied), active_node
        )
        if transition.next_page_id:
            return _build_goto_end_result(
                closing_step=current_step,
                active_node=active_node,
                next_page_id=transition.next_page_id,
                story_pages=story_pages,
                story=story,
                user_prompt=user_prompt,
                order_context=order_context,
                image_provided=image_provided,
                newly_satisfied=prompt_newly_satisfied,
                session_id=session_id,
                turn_count=turn_count,
                satisfied=list(work_satisfied),
                newly=[
                    c for c in det_added if c not in original_satisfied
                ],
                stream_assistant=stream_assistant,
                branch_message=transition.branch_message,
            )
        ai_msg = (
            ai_action
            if isinstance(ai_action, str) and not _looks_like_internal_ai_action(ai_action)
            else default_fallback
        )
        return {
            "satisfied": list(work_satisfied),
            "newlySatisfied": [
                c for c in det_added if c not in original_satisfied
            ],
            "missing": [],
            "stepDone": True,
            "nextStepId": transition.next_step_id,
            "nextPageId": transition.next_page_id,
            "assistantMessage": ai_msg,
        }

    preset = {x for x in work_satisfied if isinstance(x, str) and x}
    auto_added = _auto_satisfy_on_matched_goto_branch(
        current_step,
        preset,
        active_node,
        after_entry_skip=bool(skipped_steps_goals),
    )
    _apply_matched_branch_inject_conditions(branches, preset, current_step)

    if _step_completion_satisfied(node_id, step_id, current_step, preset) and (
        _should_advance_after_step_completion(
            node_id,
            step_id,
            current_step,
            step_done=True,
            original_satisfied=original_satisfied,
            new_satisfied=[],
        )
    ):
        transition = _resolve_step_transition(
            branches, default_next, preset, active_node
        )
        preset_satisfied = list(preset)
        preset_newly = list(
            dict.fromkeys(
                [
                    c
                    for c in (*det_added, *auto_added)
                    if c not in original_satisfied
                ]
            )
        )
        meta_base = {
            "satisfied": preset_satisfied,
            "newlySatisfied": preset_newly,
            "missing": [],
            "stepDone": True,
            "nextStepId": transition.next_step_id,
            "nextPageId": transition.next_page_id,
        }
        if transition.next_step_id:
            chained = _try_chain_complete_after_step(
                transition=transition,
                work_satisfied=preset_satisfied,
                original_satisfied=original_satisfied,
                active_node=active_node,
                user_prompt=user_prompt,
                story_pages=story_pages,
                story=story,
                order_context=order_context,
                image_provided=image_provided,
                prompt_newly_satisfied=prompt_newly_satisfied,
                session_id=session_id,
                turn_count=turn_count,
                parent_newly=preset_newly,
                stream_assistant=stream_assistant,
            )
            if chained is not None:
                return chained

            next_step = _find_step_in_node(active_node, transition.next_step_id)
            if next_step:
                skip_next = _resolve_step_entry_with_skip(
                    start_step=next_step,
                    work_satisfied=preset_satisfied,
                    active_node=active_node,
                    original_satisfied=original_satisfied,
                    image_provided=image_provided,
                    user_prompt=user_prompt,
                    story_pages=story_pages,
                    story=story,
                    order_context=order_context,
                    prompt_newly_satisfied=prompt_newly_satisfied,
                    session_id=session_id,
                    turn_count=turn_count,
                    stream_assistant=stream_assistant,
                )
                if skip_next.terminal_result is not None:
                    term = skip_next.terminal_result
                    if isinstance(term, dict):
                        return {**meta_base, **term}
                    return term

                next_step = skip_next.effective_step
                next_satisfied = skip_next.work_satisfied
                next_skip_goals = skip_next.skipped_goals
                if skip_next.skipped_steps:
                    next_satisfied, skip_new = _extract_all_skipped_steps_conditions(
                        skip_next.skipped_steps,
                        next_satisfied,
                        user_prompt=user_prompt,
                        active_node=active_node,
                        order_context=order_context,
                        image_provided=image_provided,
                        session_has_image=session_has_image,
                        node_description=node_description,
                        prompt_newly_satisfied=prompt_newly_satisfied,
                        story=story,
                    )
                    preset_newly = list(
                        dict.fromkeys(
                            [
                                *preset_newly,
                                *[
                                    c
                                    for c in skip_new
                                    if c not in original_satisfied
                                ],
                            ]
                        )
                    )
                    prompt_newly_satisfied = list(
                        dict.fromkeys([*prompt_newly_satisfied, *skip_new])
                    )
                meta_after_skip = {
                    **meta_base,
                    "satisfied": next_satisfied,
                    "newlySatisfied": preset_newly,
                }

                if stream_assistant:
                    return AssistantStreamBundle(
                        {**meta_after_skip, "assistantMessage": ""},
                        iter_generate_step_start_reply_text(
                            user_prompt,
                            active_node,
                            next_step,
                            order_context=order_context,
                            image_provided=image_provided,
                            newly_satisfied=prompt_newly_satisfied,
                            session_id=session_id,
                            turn_count=turn_count,
                            already_satisfied=next_satisfied,
                            skipped_steps_goals=next_skip_goals,
                            skip_chain_resolved=True,
                            story_pages=story_pages,
                            story=story,
                        ),
                    )
                ai_msg = generate_step_start_reply(
                    user_prompt,
                    active_node,
                    next_step,
                    order_context=order_context,
                    image_provided=image_provided,
                    newly_satisfied=prompt_newly_satisfied,
                    session_id=session_id,
                    turn_count=turn_count,
                    already_satisfied=next_satisfied,
                    skipped_steps_goals=next_skip_goals,
                    skip_chain_resolved=True,
                    story_pages=story_pages,
                    story=story,
                )
                return {**meta_after_skip, "assistantMessage": ai_msg}
        if transition.next_page_id:
            return _build_goto_end_result(
                closing_step=current_step,
                active_node=active_node,
                next_page_id=transition.next_page_id,
                story_pages=story_pages,
                story=story,
                user_prompt=user_prompt,
                order_context=order_context,
                image_provided=image_provided,
                newly_satisfied=prompt_newly_satisfied,
                session_id=session_id,
                turn_count=turn_count,
                satisfied=preset_satisfied,
                newly=preset_newly,
                stream_assistant=stream_assistant,
                branch_message=transition.branch_message,
            )
        if isinstance(ai_action, str) and not _looks_like_internal_ai_action(ai_action):
            ai_msg = ai_action
        else:
            ai_msg = default_fallback
        return {**meta_base, "assistantMessage": ai_msg}

    conditions_block = _compose_conditions_block_for_extract(
        current_step,
        work_satisfied,
        skip_res.skipped_steps,
    )
    extract_hint_blocks = _build_step_extract_hint_blocks(
        active_node=active_node,
        step=current_step,
        work_satisfied=work_satisfied,
        session_has_image=session_has_image,
    )

    step_only_ids = _step_internal_condition_ids(current_step) | _branch_condition_ids(
        current_step
    )
    allowed_ids_hint = ""
    if allowed_extract_ids:
        allowed_ids_hint = (
            "Extract whitelist (step + session): "
            f"{', '.join(sorted(allowed_extract_ids))}. "
            f"A lépés hivatalos kondíciói: {', '.join(sorted(step_only_ids))}. "
            "Ne adj meg más ID-t. "
        )

    question_detection_block = _format_question_detection_block(story)

    system_extract = (
        f"Te egy AI asszisztens vagy egy döntési rendszerben. "
        f"Az aktív node: {node_id}. "
        f"Node leírása: {node_description}. "
        f"Jelenlegi lépés célja: {goal}. "
        f"Elvégzendő feladat ha kondíciók nem teljesülnek: {ai_action}. "
        f"A lépés akkor tekinthető befejezettnek ha: {done_when}. "
        f"{extract_hint_blocks}"
        f"{allowed_ids_hint}"
        "Csak az extract_conditions toolt hívd meg: "
        "azonosítsd mely belső kondíciók teljesülnek a felhasználó üzenete alapján. "
        f"{_EXTRACT_IMAGE_CONDITION_HINT}"
        f"{question_detection_block}"
    )

    user_message = _compose_llm_user_message(
        f"Kondíciók:\n{conditions_block}\n\n"
        f"Felhasználó üzenete: {user_prompt}",
        active_node,
        order_context,
        image_provided=session_has_image,
        newly_satisfied=prompt_newly_satisfied,
        story=story,
    )

    print(f"[STEP DEBUG - system_prompt]:\n{system_extract}\n")
    print(f"[STEP DEBUG - user_message]:\n{user_message}\n")

    extract_response = client.messages.create(
        model=_get_model(story),
        max_tokens=_get_max_tokens(story),
        system=system_extract,
        tools=[CONDITION_EXTRACT_TOOL],
        tool_choice=_TOOL_CHOICE_EXTRACT,
        messages=[{"role": "user", "content": user_message}],
    )

    condition_result = _tool_input_from_response(extract_response, "extract_conditions")

    user_has_open_question = bool(condition_result.get("userHasOpenQuestion", False))
    raw_summary = condition_result.get("userQuestionSummary")
    user_question_summary = raw_summary.strip() if isinstance(raw_summary, str) else ""
    if user_has_open_question and not _message_might_contain_question(user_prompt):
        user_has_open_question = False
        user_question_summary = ""

    condition_result = _filter_extract_image_conditions(
        condition_result,
        current_step,
        image_provided=image_provided,
        user_prompt=user_prompt,
        active_node=active_node,
        session_has_image=session_has_image,
    )
    condition_result = _filter_extract_to_known_conditions(
        condition_result,
        allowed=allowed_extract_ids,
        work_satisfied=work_satisfied,
    )
    condition_result = _filter_extract_by_validation_pattern(
        condition_result,
        active_node=active_node,
        current_step=current_step,
        story=story,
        user_prompt=user_prompt,
    )

    new_satisfied = [
        cid for cid in condition_result.get("satisfied", [])
        if cid not in work_satisfied
    ]
    for cid in det_added:
        if cid not in original_satisfied and cid not in new_satisfied:
            new_satisfied.append(cid)
    all_satisfied = list(work_satisfied) + new_satisfied
    for cid in _apply_condition_implications(active_node, all_satisfied):
        if cid not in all_satisfied:
            all_satisfied.append(cid)
            if cid not in original_satisfied and cid not in new_satisfied:
                new_satisfied.append(cid)
    satisfied_ids = _satisfied_union(work_satisfied, condition_result.get("satisfied"))
    missing_list = _missing_minus_satisfied(
        condition_result.get("missing"), satisfied_ids
    )

    satisfied_set = set(all_satisfied)
    auto_added = _auto_satisfy_on_matched_goto_branch(
        current_step,
        satisfied_set,
        active_node,
        after_entry_skip=bool(skipped_steps_goals),
    )
    for cid in auto_added:
        if cid not in all_satisfied:
            all_satisfied.append(cid)
            new_satisfied.append(cid)
            satisfied_set.add(cid)
    inject_added = _apply_matched_branch_inject_conditions(
        branches, satisfied_set, current_step
    )
    for cid in inject_added:
        if cid not in all_satisfied:
            all_satisfied.append(cid)
            new_satisfied.append(cid)
    if not user_has_open_question:
        for cid in _auto_satisfy_after_reply_ids(current_step):
            if cid not in all_satisfied:
                all_satisfied.append(cid)
                new_satisfied.append(cid)
                satisfied_set.add(cid)
    step_done = _step_completion_satisfied(
        node_id, step_id, current_step, satisfied_set
    )
    advance_after_done = _should_advance_after_step_completion(
        node_id,
        step_id,
        current_step,
        step_done=step_done,
        original_satisfied=original_satisfied,
        new_satisfied=new_satisfied,
    )

    # Reaktív kérdéskezelés: ha az ügyfél kérdést tett fel ÉS a step amúgy
    # lezárna + routolna, a routing felfüggesztve. A kondíció-állapot
    # (satisfied, missing, newlySatisfied) változatlan; csak az átlépés
    # késleltetett, hogy az AI először válaszoljon a kérdésre.
    if user_has_open_question and advance_after_done and step_done:
        advance_after_done = False

    transition = StepTransition()
    if advance_after_done:
        transition = _resolve_step_transition(
            branches, default_next, satisfied_set, active_node
        )

    if (
        advance_after_done
        and transition.next_step_id
        and _should_chain_to_next_step(current_step, transition)
    ):
        chained = _try_chain_complete_after_step(
            transition=transition,
            work_satisfied=all_satisfied,
            original_satisfied=original_satisfied,
            active_node=active_node,
            user_prompt=user_prompt,
            story_pages=story_pages,
            story=story,
            order_context=order_context,
            image_provided=image_provided,
            prompt_newly_satisfied=prompt_newly_satisfied,
            session_id=session_id,
            turn_count=turn_count,
            parent_newly=new_satisfied,
            stream_assistant=stream_assistant,
        )
        if chained is not None:
            return chained

    effective_next_step_id: str | None = (
        transition.next_step_id if advance_after_done else None
    )
    next_step_block = ""
    end_page_block = ""
    if (
        advance_after_done
        and transition.next_step_id
        and _should_chain_to_next_step(current_step, transition)
    ):
        next_step = _find_step_in_node(active_node, transition.next_step_id)
        if next_step:
            _apply_deterministic_session_facts(
                active_node,
                next_step,
                all_satisfied,
                user_prompt,
                whitelist=session_whitelist,
            )
            skip_next = _resolve_step_entry_with_skip(
                start_step=next_step,
                work_satisfied=list(all_satisfied),
                active_node=active_node,
                original_satisfied=original_satisfied,
                image_provided=image_provided,
                user_prompt=user_prompt,
                story_pages=story_pages,
                story=story,
                order_context=order_context,
                prompt_newly_satisfied=prompt_newly_satisfied,
                session_id=session_id,
                turn_count=turn_count,
                stream_assistant=stream_assistant,
                on_transition=True,
            )
            if skip_next.terminal_result is not None:
                for cid in skip_next.auto_added:
                    if cid not in all_satisfied:
                        all_satisfied.append(cid)
                        if cid not in original_satisfied and cid not in new_satisfied:
                            new_satisfied.append(cid)
                term = skip_next.terminal_result
                if isinstance(term, dict):
                    return {
                        **term,
                        "satisfied": skip_next.work_satisfied,
                        "newlySatisfied": list(
                            dict.fromkeys(
                                [
                                    *new_satisfied,
                                    *[
                                        c
                                        for c in skip_next.auto_added
                                        if c not in original_satisfied
                                    ],
                                ]
                            )
                        ),
                        "missing": missing_list,
                        "stepDone": True,
                    }
                return term

            for cid in skip_next.auto_added:
                if cid not in all_satisfied:
                    all_satisfied.append(cid)
                    satisfied_set.add(cid)
                    if cid not in original_satisfied and cid not in new_satisfied:
                        new_satisfied.append(cid)

            next_step = skip_next.effective_step
            all_satisfied = list(skip_next.work_satisfied)
            if skip_next.skipped_steps:
                all_satisfied, skip_chain_newly = _extract_all_skipped_steps_conditions(
                    skip_next.skipped_steps,
                    all_satisfied,
                    user_prompt=user_prompt,
                    active_node=active_node,
                    order_context=order_context,
                    image_provided=image_provided,
                    session_has_image=session_has_image,
                    node_description=node_description,
                    prompt_newly_satisfied=prompt_newly_satisfied,
                    story=story,
                )
                for cid in skip_chain_newly:
                    if cid not in new_satisfied:
                        new_satisfied.append(cid)
            satisfied_set = set(all_satisfied)
            effective_next_step_id = (
                next_step.get("id", "")
                if isinstance(next_step.get("id"), str)
                else transition.next_step_id
            )

            ns_goal = next_step.get("goal", "")
            ns_action = next_step.get("ai_action", "")
            ns_reply_rules = _format_reply_rules_block(next_step)
            transition_skip_ack = _format_skipped_steps_ack_block(
                skip_next.skipped_goals
            )
            next_step_block = (
                f"{transition_skip_ack}"
                f"A jelenlegi lépés lezárult. A válaszod a következő belső lépést "
                f"kövesse ({effective_next_step_id}). Cél: {ns_goal}. "
                f"Feladat (ne idézd szó szerint): {ns_action} "
                f"{ns_reply_rules}"
            )
    if advance_after_done and transition.next_page_id:
        end_page_block = _build_end_page_prompt_block(transition.next_page_id)

    satisfied_joined = ", ".join(all_satisfied) if all_satisfied else "(nincs)"
    missing_joined = ", ".join(missing_list) if missing_list else "(nincs)"
    step_done_hu = "igen" if step_done else "nem"
    if advance_after_done and transition.next_page_id:
        next_step_disp = f"(végoldal: {transition.next_page_id})"
    elif advance_after_done and effective_next_step_id:
        next_step_disp = effective_next_step_id
    else:
        next_step_disp = "(nincs — még ez a lépés)"
    done_when_line = (
        f"A lépés akkor tekinthető befejezettnek ha: {done_when}. "
        if done_when
        else ""
    )

    opening = _assistant_opening_line(session_id, node_id, turn_count)
    repetition_hint = (
        "Kerüld az előző körben már használt megfogalmazást. Ugyanazt a kérdést másképp tedd fel. "
        if turn_count > 1
        else ""
    )
    tone_instruction = _fallback_tone_instruction(_node_fallback_message(active_node))
    tone_hint_block = _format_tone_hint_block(active_node)
    skip_ack_block = _format_skipped_steps_ack_block(skipped_steps_goals)
    question_block = _format_question_block(
        user_has_open_question, user_question_summary
    )
    user_facing_context_block = _format_user_facing_context_block(
        active_node=active_node,
        story_pages=story_pages,
        session_id=session_id,
        user_has_open_question=user_has_open_question,
    )
    validation_rejection_block = _build_validation_rejection_block(
        condition_result.get("_validation_rejected"),
        active_node=active_node,
        current_step=current_step,
        story=story,
    )

    ai_action_line = ""
    if not step_done:
        ai_action_line = f"Ha a lépés nincs lezárva, alapértelmezett feladat: {ai_action}. "

    system_reply = (
        f"{opening} "
        f"Az aktív node: {node_id}. "
        f"Node leírása: {node_description}. "
        f"{tone_instruction}"
        f"{skip_ack_block}"
        f"{tone_hint_block}"
        f"Jelenlegi lépés célja: {goal}. "
        f"{done_when_line}"
        f"{ai_action_line}"
        f"{reply_rules_block}"
        f"{question_block}"
        f"{user_facing_context_block}"
        f"{repetition_hint}"
        f"{_build_satisfied_do_not_reask_instruction(active_node)}"
        "A kondíció-felismerés és a lépés-routing már megtörtént (determinisztikus eredmény):\n"
        f"- Teljesült kondíciók (összesen): {satisfied_joined}\n"
        f"- Első kör szerinti missing: {missing_joined}\n"
        f"- Minden kötelező kondíció teljesült (lépés lezárva): {step_done_hu}\n"
        f"- Következő belső lépés / végoldal: {next_step_disp}\n"
        f"{next_step_block}"
        f"{end_page_block}"
        f"{validation_rejection_block}"
        "Generálj természetes választ a felhasználónak, a fenti tényeknek megfelelően. "
        "Ha a lépés nincs kész, kérd be a hiányzót természetesen. "
        f"{_get_ack_and_paragraph_instruction(story)} "
        "Mindig a generate_reply toolt hívd meg."
    )

    if (
        advance_after_done
        and _should_silently_route_on_goto(current_step, transition)
    ):
        end_page_content_silent: str | None = None
        end_content_silent = resolve_end_page_content(
            story_pages,
            transition.next_page_id,
            order_context=order_context,
        )
        if end_content_silent and end_content_silent.strip():
            end_page_content_silent = end_content_silent.strip()
        silent_meta: dict = {
            "satisfied": all_satisfied,
            "newlySatisfied": new_satisfied,
            "missing": missing_list,
            "stepDone": True,
            "nextStepId": effective_next_step_id,
            "nextPageId": transition.next_page_id,
            "assistantMessage": "",
        }
        if end_page_content_silent:
            silent_meta["endPageContent"] = end_page_content_silent
        if stream_assistant:
            return AssistantStreamBundle(silent_meta, iter([""]))
        return silent_meta

    question_summary_for_meta = user_question_summary or None

    if stream_assistant:
        meta = {
            "satisfied": all_satisfied,
            "newlySatisfied": new_satisfied,
            "missing": missing_list,
            "stepDone": advance_after_done,
            "nextStepId": effective_next_step_id if advance_after_done else None,
            "nextPageId": transition.next_page_id if advance_after_done else None,
            "assistantMessage": "",
            "userHasOpenQuestion": user_has_open_question,
            "userQuestionSummary": question_summary_for_meta,
        }
        return AssistantStreamBundle(
            meta,
            _iter_forced_generate_reply(
                system=system_reply,
                user_message=user_message,
                temperature=_REPLY_TEMPERATURE,
                tool_choice=_TOOL_CHOICE_REPLY,
                story=story,
            ),
        )

    reply_text = _sync_generate_reply(system_reply, user_message, story=story)
    assistant_msg = _resolve_assistant_message(
        reply_text,
        active_node,
        ai_action=ai_action if isinstance(ai_action, str) else "",
        story=story,
    )
    end_page_content: str | None = None
    if advance_after_done and transition.next_page_id:
        end_content = resolve_end_page_content(
            story_pages,
            transition.next_page_id,
            order_context=order_context,
        )
        if end_content:
            end_page_content = end_content.strip()

    result: dict = {
        "satisfied": all_satisfied,
        "newlySatisfied": new_satisfied,
        "missing": missing_list,
        "stepDone": advance_after_done,
        "nextStepId": effective_next_step_id if advance_after_done else None,
        "nextPageId": transition.next_page_id if advance_after_done else None,
        "assistantMessage": assistant_msg,
        "userHasOpenQuestion": user_has_open_question,
        "userQuestionSummary": question_summary_for_meta,
    }
    if end_page_content:
        result["endPageContent"] = end_page_content
    return result


def process_step(
    user_prompt: str,
    active_node: dict,
    current_step: dict,
    already_satisfied: list[str],
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> dict:
    """
    Step feldolgozás — két API hívás sorban (extract_conditions, majd generate_reply),
    node matching nélkül.

    A node már ismert, csak a step internal_conditions-jeit
    kell felismerni és dönteni hogy továbblép-e vagy visszakérdez.

    Visszatér:
    {
        "satisfied": list[str],
        "newlySatisfied": list[str],
        "stepDone": bool,
        "nextStepId": str | None,
        "nextPageId": str | None,
        "assistantMessage": str,
    }
    """
    entry_step_id = (
        current_step.get("id", "")
        if isinstance(current_step.get("id"), str)
        else ""
    )
    tracking = {"entry": entry_step_id, "effective": entry_step_id}
    out = _process_step_impl(
        user_prompt,
        active_node,
        current_step,
        already_satisfied,
        order_context=order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        story_pages=story_pages,
        story=story,
        stream_assistant=False,
        step_tracking=tracking,
    )
    if isinstance(out, AssistantStreamBundle):
        raise RuntimeError("process_step expected dict")
    return _apply_step_tracking_meta(
        out,
        entry_step_id=tracking["entry"],
        effective_step_id=tracking["effective"],
    )


def process_step_streaming(
    user_prompt: str,
    active_node: dict,
    current_step: dict,
    already_satisfied: list[str],
    order_context: Optional[OrderContext] = None,
    image_provided: bool = False,
    newly_satisfied: list[str] | None = None,
    session_id: str = "",
    turn_count: int = 1,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> ProcessStepStreamResult:
    """Ugyanaz mint process_step, de a végső generate_reply szöveg streamelhető (AssistantStreamBundle)."""
    entry_step_id = (
        current_step.get("id", "")
        if isinstance(current_step.get("id"), str)
        else ""
    )
    tracking = {"entry": entry_step_id, "effective": entry_step_id}
    out = _process_step_impl(
        user_prompt,
        active_node,
        current_step,
        already_satisfied,
        order_context=order_context,
        image_provided=image_provided,
        newly_satisfied=newly_satisfied,
        session_id=session_id,
        turn_count=turn_count,
        story_pages=story_pages,
        story=story,
        stream_assistant=True,
        step_tracking=tracking,
    )
    return _apply_step_tracking_meta(
        out,
        entry_step_id=tracking["entry"],
        effective_step_id=tracking["effective"],
    )

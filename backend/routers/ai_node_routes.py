from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.ai_node_runtime import (
    AssistantStreamBundle,
    _resolve_assistant_message,
    extract_conditions,
    is_pure_routing_node,
    match_active_node,
    process_step,
    process_step_streaming,
    resolve_routing_chain_to_step_entry,
)
from services.embedding_store import get_top_k_nodes, build_embeddings
from services.order_context import (
    OrderContext,
    derive_conditions,
    extract_order_id,
    get_order_context_mapping,
    merge_session_and_derived_satisfied,
    resolve_satisfied_precedence,
)
from services.order_context_providers import MockOrderContextProvider
from services.story_runtime import (
    get_ai_node_payload,
    get_story_meta_string,
    get_story_runtime_int,
    load_story,
    normalize_src_to_path,
    resolve_ai_clarification_fallback_message,
    resolve_end_page_content,
)

router = APIRouter(tags=["ai-node"])
logger = logging.getLogger(__name__)


class AiNodeProcessRequest(BaseModel):
    model_config = {"strict": False}

    src: str
    pageId: str
    prompt: str
    satisfiedConditions: list[str] = []
    currentStepId: str | None = None
    order_id: Optional[str] = None
    image_provided: Optional[bool] = None
    sessionId: Optional[str] = None
    turnCount: Optional[int] = None
    stream: bool = False


class AiNodeBuildEmbeddingsRequest(BaseModel):
    src: str


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _step_followup_payload(
    *,
    active_node_id: str,
    body: AiNodeProcessRequest,
    step_result: dict,
    src: str,
    entry_step_id: str | None = None,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> dict:
    """Egységes válasz-objektum a `process_step` eredményéből (lépéskövetés)."""
    mapping = get_order_context_mapping(story)
    all_satisfied = resolve_satisfied_precedence(
        list(step_result.get("satisfied") or []),
        mapping=mapping,
    )
    step_done = bool(step_result.get("stepDone", False))
    next_step_id = step_result.get("nextStepId")
    next_page_id = step_result.get("nextPageId")
    effective_step_id = step_result.get("effectiveStepId")
    effective_step_id = (
        effective_step_id.strip()
        if isinstance(effective_step_id, str) and effective_step_id.strip()
        else None
    )

    if step_done and next_step_id:
        current_step_id = next_step_id
    elif effective_step_id:
        current_step_id = effective_step_id
    else:
        current_step_id = body.currentStepId
    if not current_step_id and entry_step_id:
        current_step_id = entry_step_id

    base_fields = {
        "activeNodeId": active_node_id,
        "satisfiedConditions": all_satisfied,
        "newlySatisfied": step_result.get("newlySatisfied", []),
        "missing": step_result.get("missing", []),
        "assistantMessage": step_result.get("assistantMessage", ""),
        "clarificationQuestion": None,
    }

    if step_done and isinstance(next_page_id, str) and next_page_id.strip():
        page_id = next_page_id.strip()
        pages_for_end = story_pages
        if pages_for_end is None:
            try:
                story = load_story(normalize_src_to_path(src))
                raw_pages = story.get("pages") if isinstance(story, dict) else None
                pages_for_end = raw_pages if isinstance(raw_pages, dict) else None
            except Exception:
                pages_for_end = None
        end_from_step = step_result.get("endPageContent")
        ack_from_step = step_result.get("assistantMessage", "")
        end_content = (
            end_from_step.strip()
            if isinstance(end_from_step, str) and end_from_step.strip()
            else (resolve_end_page_content(pages_for_end, page_id) or "").strip()
        )
        out = {
            **base_fields,
            "status": "ok",
            "currentStepId": None,
            "nextStepId": None,
            "nextPageId": page_id,
        }
        if end_content:
            out["endPageContent"] = end_content
        if isinstance(ack_from_step, str) and ack_from_step.strip():
            out["assistantMessage"] = ack_from_step.strip()
        elif end_content:
            out["assistantMessage"] = end_content
            if not out.get("endPageContent"):
                out["endPageContent"] = end_content
        return out

    if step_done and not next_step_id:
        routing_result = get_ai_node_payload(
            page_id=active_node_id,
            src=src,
            satisfied_conditions=all_satisfied,
        )
        return {
            **base_fields,
            "status": "ok",
            "currentStepId": None,
            "nextStepId": None,
            "nextPageId": routing_result.get("nextPageId"),
        }

    return {
        **base_fields,
        "status": "ok" if step_done else "clarification",
        "currentStepId": current_step_id,
        "nextStepId": next_step_id if step_done else None,
        "nextPageId": None,
    }


def _sse_step_stream(
    *,
    active_node_id: str,
    body: AiNodeProcessRequest,
    bundle: AssistantStreamBundle,
    src: str,
    entry_step_id: str | None = None,
    story_pages: dict | None = None,
    story: dict | None = None,
) -> Iterator[str]:
    """Meta (üres assistantMessage) → delta tokenek → done teljes payload."""
    acc: list[str] = []
    meta = dict(bundle.meta)
    meta["assistantMessage"] = ""
    base = _step_followup_payload(
        active_node_id=active_node_id,
        body=body,
        step_result=meta,
        src=src,
        entry_step_id=entry_step_id,
        story_pages=story_pages,
        story=story,
    )
    yield _sse("meta", base)
    for piece in bundle.text_deltas:
        acc.append(piece)
        yield _sse("delta", {"text": piece})
    full = "".join(acc)
    end_page = bundle.meta.get("endPageContent")
    if isinstance(end_page, str) and end_page.strip():
        closing = bundle.meta.get("assistantMessage")
        ack = (
            closing.strip()
            if isinstance(closing, str) and closing.strip()
            else full.strip()
        )
        final_step = {**bundle.meta, "assistantMessage": ack}
    else:
        final_step = {**bundle.meta, "assistantMessage": full}
    done_payload = _step_followup_payload(
        active_node_id=active_node_id,
        body=body,
        step_result=final_step,
        src=src,
        entry_step_id=entry_step_id,
        story_pages=story_pages,
        story=story,
    )
    yield _sse("done", done_payload)


def _routing_handoff_to_step(
    *,
    pages: dict,
    story: dict,
    src: str,
    body: AiNodeProcessRequest,
    start_page_id: str,
    chain_satisfied: list[str],
    order_context: OrderContext | None,
    image_in_request: bool,
    session_id: str,
    turn_count: int,
) -> dict | StreamingResponse | None:
    """Pure routing → stepped node: same user prompt on target step_1, no routing reply."""
    chain = resolve_routing_chain_to_step_entry(
        pages=pages,
        src=src,
        start_page_id=start_page_id,
        satisfied_conditions=chain_satisfied,
        user_prompt=body.prompt,
        order_context=order_context,
        image_provided=image_in_request,
        session_id=session_id,
        turn_count=turn_count,
        story=story,
    )
    if not chain:
        return None

    target_id, target_node, first_step, handoff_satisfied = chain
    entry_step_id = (
        first_step.get("id") if isinstance(first_step.get("id"), str) else None
    )
    handoff_newly = [
        c for c in handoff_satisfied if c not in (body.satisfiedConditions or [])
    ]
    story_pages = pages if isinstance(pages, dict) else None

    if body.stream:
        step_raw = process_step_streaming(
            user_prompt=body.prompt,
            active_node=target_node,
            current_step=first_step,
            already_satisfied=handoff_satisfied,
            order_context=order_context,
            image_provided=image_in_request,
            newly_satisfied=handoff_newly,
            session_id=session_id,
            turn_count=turn_count,
            story_pages=story_pages,
            story=story,
        )
        if isinstance(step_raw, AssistantStreamBundle):
            return StreamingResponse(
                _sse_step_stream(
                    active_node_id=target_id,
                    body=body,
                    bundle=step_raw,
                    src=src,
                    entry_step_id=entry_step_id,
                    story_pages=story_pages,
                    story=story,
                ),
                media_type="text/event-stream",
            )
        return _step_followup_payload(
            active_node_id=target_id,
            body=body,
            step_result=step_raw,
            src=src,
            entry_step_id=entry_step_id,
            story_pages=story_pages,
            story=story,
        )

    step_result = process_step(
        user_prompt=body.prompt,
        active_node=target_node,
        current_step=first_step,
        already_satisfied=handoff_satisfied,
        order_context=order_context,
        image_provided=image_in_request,
        newly_satisfied=handoff_newly,
        session_id=session_id,
        turn_count=turn_count,
        story_pages=story_pages,
        story=story,
    )
    return _step_followup_payload(
        active_node_id=target_id,
        body=body,
        step_result=step_result,
        src=src,
        entry_step_id=entry_step_id,
        story_pages=story_pages,
        story=story,
    )


@router.post("/ai-node/process", response_model=None)
async def process_ai_node(body: AiNodeProcessRequest):
    """
    Teljes AI node pipeline egyetlen hívásban:
    1. Embedding előszűrés → top-K node jelölt
    2. AI node matching → melyik node aktív
    3. AI kondíció felismerés → mely kondíciók teljesülnek
    4. Determinisztikus routing → következő node
    """
    story_path = normalize_src_to_path(body.src)
    story = load_story(story_path)
    pages = story.get("pages") or {}
    default_clarification = get_story_meta_string(story, "default_clarification")
    embedding_top_k = get_story_runtime_int(story, "embedding_top_k")

    order_context: OrderContext | None = None
    resolved_order_id = (
        body.order_id.strip()
        if isinstance(body.order_id, str) and body.order_id.strip()
        else None
    )
    if not resolved_order_id and isinstance(body.prompt, str):
        reference_id_pattern = (story.get("meta") or {}).get("reference_id_pattern")
        resolved_order_id = extract_order_id(
            body.prompt,
            pattern=reference_id_pattern if isinstance(reference_id_pattern, str) else None,
        )
    if resolved_order_id:
        provider = MockOrderContextProvider()
        order_context = await provider.get_order_context(resolved_order_id)
        if order_context:
            logger.debug(
                "process_ai_node: OrderContext loaded for order_id=%r",
                resolved_order_id,
            )
        else:
            logger.debug(
                "process_ai_node: no OrderContext for order_id=%r (provider miss)",
                resolved_order_id,
            )

    mapping = get_order_context_mapping(story)
    base_sat = list(body.satisfiedConditions or [])
    derived = (
        derive_conditions(
            order_context,
            {"satisfied_conditions": base_sat},
            story=story,
            mapping=mapping,
        )
        if order_context
        else []
    )
    enriched_satisfied = merge_session_and_derived_satisfied(
        base_sat, derived, mapping=mapping
    )
    if body.image_provided is True:
        enriched_satisfied = list(dict.fromkeys([*enriched_satisfied, "image_provided"]))

    image_in_request = body.image_provided is True

    newly_satisfied_for_prompt = [
        c for c in enriched_satisfied if c not in (body.satisfiedConditions or [])
    ]

    sid = body.sessionId
    session_id = sid.strip() if isinstance(sid, str) else ""
    turn_count_raw = body.turnCount
    if turn_count_raw is None:
        turn_count = 1
    else:
        try:
            turn_count = int(turn_count_raw)
        except (TypeError, ValueError):
            turn_count = 1
        if turn_count < 1:
            turn_count = 1

    # Folyamatban lévő beszélgetés: maradjunk az aktuális AI node-on.
    active_node_id = None
    active_node = None
    if isinstance(pages, dict):
        existing_node = pages.get(body.pageId)
        if isinstance(existing_node, dict) and existing_node.get("type") == "ai":
            raw_try = existing_node.get("steps")
            steps_try = raw_try if isinstance(raw_try, list) else []
            if enriched_satisfied:
                active_node_id = body.pageId
                active_node = existing_node
            elif steps_try and body.currentStepId:
                active_node_id = body.pageId
                active_node = existing_node

    if active_node is None:
        # 1. Embedding előszűrés
        candidate_nodes = get_top_k_nodes(
            prompt=body.prompt,
            story=story,
            k=embedding_top_k,
        )

        if not candidate_nodes:
            raise HTTPException(
                status_code=404,
                detail="Nem található AI node a story-ban."
            )

        # 2. AI node matching
        match_result = match_active_node(
            user_prompt=body.prompt,
            candidate_nodes=candidate_nodes,
            story=story,
        )

        if match_result.get("askClarification"):
            raw_am = match_result.get("assistantMessage")
            ai_assistant = raw_am.strip() if isinstance(raw_am, str) else ""
            clarification_question = match_result.get("clarificationQuestion")
            if not isinstance(clarification_question, str) or not clarification_question.strip():
                clarification_question = default_clarification

            out: dict = {
                "status": "clarification",
                "clarificationQuestion": clarification_question,
                "activeNodeId": None,
                "currentStepId": None,
                "nextStepId": None,
                "satisfiedConditions": enriched_satisfied,
                "nextPageId": None,
            }
            if not ai_assistant:
                out["assistantMessage"] = resolve_ai_clarification_fallback_message(
                    story, body.pageId
                )
                out["responseType"] = "fallback"
            else:
                out["assistantMessage"] = ai_assistant
            if body.stream:

                def _clar_gen() -> Iterator[str]:
                    yield _sse("done", out)

                return StreamingResponse(_clar_gen(), media_type="text/event-stream")
            return out

        active_node_id = match_result.get("activeNodeId")
        if not active_node_id:
            clarification_question = match_result.get("clarificationQuestion")
            if not isinstance(clarification_question, str) or not clarification_question.strip():
                clarification_question = default_clarification

            out = {
                "status": "clarification",
                "clarificationQuestion": clarification_question,
                "activeNodeId": None,
                "currentStepId": None,
                "nextStepId": None,
                "satisfiedConditions": enriched_satisfied,
                "nextPageId": None,
                "assistantMessage": resolve_ai_clarification_fallback_message(
                    story, body.pageId
                ),
                "responseType": "fallback",
            }
            if body.stream:

                def _clar_fallback_gen() -> Iterator[str]:
                    yield _sse("done", out)

                return StreamingResponse(_clar_fallback_gen(), media_type="text/event-stream")
            return out

        # Aktív node betöltése
        active_node = pages.get(active_node_id)
        if not active_node:
            raise HTTPException(
                status_code=404,
                detail=f"Node nem található: {active_node_id}"
            )

    raw_steps = active_node.get("steps")
    steps = raw_steps if isinstance(raw_steps, list) else []

    if steps and body.currentStepId:
        current_step = next(
            (s for s in steps if s.get("id") == body.currentStepId),
            None,
        )

        if current_step:
            if body.stream:
                step_raw = process_step_streaming(
                    user_prompt=body.prompt,
                    active_node=active_node,
                    current_step=current_step,
                    already_satisfied=enriched_satisfied,
                    order_context=order_context,
                    image_provided=image_in_request,
                    newly_satisfied=newly_satisfied_for_prompt,
                    session_id=session_id,
                    turn_count=turn_count,
                    story_pages=pages if isinstance(pages, dict) else None,
                    story=story,
                )
                if isinstance(step_raw, AssistantStreamBundle):
                    return StreamingResponse(
                        _sse_step_stream(
                            active_node_id=active_node_id,
                            body=body,
                            bundle=step_raw,
                            src=body.src,
                            story_pages=pages if isinstance(pages, dict) else None,
                            story=story,
                        ),
                        media_type="text/event-stream",
                    )
                step_payload = _step_followup_payload(
                    active_node_id=active_node_id,
                    body=body,
                    step_result=step_raw,
                    src=body.src,
                    story_pages=pages if isinstance(pages, dict) else None,
                    story=story,
                )

                def _step_done_only() -> Iterator[str]:
                    yield _sse("done", step_payload)

                return StreamingResponse(_step_done_only(), media_type="text/event-stream")

            step_result = process_step(
                user_prompt=body.prompt,
                active_node=active_node,
                current_step=current_step,
                already_satisfied=enriched_satisfied,
                order_context=order_context,
                image_provided=image_in_request,
                newly_satisfied=newly_satisfied_for_prompt,
                session_id=session_id,
                turn_count=turn_count,
                story_pages=pages if isinstance(pages, dict) else None,
                story=story,
            )

            return _step_followup_payload(
                active_node_id=active_node_id,
                body=body,
                step_result=step_result,
                src=body.src,
                story_pages=pages if isinstance(pages, dict) else None,
                story=story,
            )

    if steps and not body.currentStepId:
        first_step = steps[0]
        entry_step_id = first_step.get("id") if isinstance(first_step.get("id"), str) else None

        if body.stream:
            step_raw = process_step_streaming(
                user_prompt=body.prompt,
                active_node=active_node,
                current_step=first_step,
                already_satisfied=enriched_satisfied,
                order_context=order_context,
                image_provided=image_in_request,
                newly_satisfied=newly_satisfied_for_prompt,
                session_id=session_id,
                turn_count=turn_count,
                story_pages=pages if isinstance(pages, dict) else None,
                story=story,
            )
            if isinstance(step_raw, AssistantStreamBundle):
                return StreamingResponse(
                    _sse_step_stream(
                        active_node_id=active_node_id,
                        body=body,
                        bundle=step_raw,
                        src=body.src,
                        entry_step_id=entry_step_id,
                        story_pages=pages if isinstance(pages, dict) else None,
                        story=story,
                    ),
                    media_type="text/event-stream",
                )
            return _step_followup_payload(
                active_node_id=active_node_id,
                body=body,
                step_result=step_raw,
                src=body.src,
                entry_step_id=entry_step_id,
                story_pages=pages if isinstance(pages, dict) else None,
                story=story,
            )

        step_result = process_step(
            user_prompt=body.prompt,
            active_node=active_node,
            current_step=first_step,
            already_satisfied=enriched_satisfied,
            order_context=order_context,
            image_provided=image_in_request,
            newly_satisfied=newly_satisfied_for_prompt,
            session_id=session_id,
            turn_count=turn_count,
            story_pages=pages if isinstance(pages, dict) else None,
            story=story,
        )
        return _step_followup_payload(
            active_node_id=active_node_id,
            body=body,
            step_result=step_result,
            src=body.src,
            entry_step_id=entry_step_id,
            story_pages=pages if isinstance(pages, dict) else None,
            story=story,
        )

    # 3. Kondíció felismerés (+ válasz, ha nem routing-only handoff)
    pure_routing = is_pure_routing_node(active_node)
    condition_result = extract_conditions(
        user_prompt=body.prompt,
        active_node=active_node,
        already_satisfied=enriched_satisfied,
        order_context=order_context,
        image_provided=image_in_request,
        session_id=session_id,
        turn_count=turn_count,
        generate_reply=not pure_routing,
    )

    all_satisfied = resolve_satisfied_precedence(
        list(condition_result.get("satisfied") or []),
        mapping=mapping,
    )
    newly_satisfied = list(condition_result.get("newlySatisfied", []) or [])

    # 4. Determinisztikus routing (friss kondíciók alapján)
    routing_result = get_ai_node_payload(
        page_id=active_node_id,
        src=body.src,
        satisfied_conditions=all_satisfied,
    )

    next_page_id = routing_result.get("nextPageId")
    ask = routing_result.get("ask", False)
    for cid in routing_result.get("injectConditions") or []:
        if isinstance(cid, str) and cid.strip() and cid not in all_satisfied:
            all_satisfied.append(cid.strip())
            newly_satisfied.append(cid.strip())

    if pure_routing and not ask and isinstance(next_page_id, str) and next_page_id.strip():
        handoff = _routing_handoff_to_step(
            pages=pages if isinstance(pages, dict) else {},
            story=story,
            src=body.src,
            body=body,
            start_page_id=next_page_id.strip(),
            chain_satisfied=all_satisfied,
            order_context=order_context,
            image_in_request=image_in_request,
            session_id=session_id,
            turn_count=turn_count,
        )
        if handoff is not None:
            return handoff

    if pure_routing and ask:
        condition_result = extract_conditions(
            user_prompt=body.prompt,
            active_node=active_node,
            already_satisfied=enriched_satisfied,
            order_context=order_context,
            image_provided=image_in_request,
            session_id=session_id,
            turn_count=turn_count,
            generate_reply=True,
            ask_clarification=True,
            pre_extracted={
                "satisfied": all_satisfied,
                "missing": condition_result.get("missing", []),
                "newlySatisfied": newly_satisfied,
            },
        )

    raw_assistant = condition_result.get("assistantMessage")
    assistant_text = (
        raw_assistant
        if isinstance(raw_assistant, str)
        else ""
    )
    final_out = {
        "status": "clarification" if ask else "ok",
        "activeNodeId": active_node_id,
        "currentStepId": None,
        "nextStepId": None,
        "satisfiedConditions": all_satisfied,
        "newlySatisfied": newly_satisfied,
        "missing": condition_result.get("missing", []),
        "assistantMessage": _resolve_assistant_message(
            assistant_text,
            active_node if isinstance(active_node, dict) else {},
        ),
        "nextPageId": None if ask else next_page_id,
        "clarificationQuestion": (
            "Kérlek pontosítsd a választ."
            if ask else None
        ),
    }
    if body.stream:

        def _tail_gen() -> Iterator[str]:
            yield _sse("done", final_out)

        return StreamingResponse(_tail_gen(), media_type="text/event-stream")
    return final_out


@router.post("/ai-node/build-embeddings")
async def build_node_embeddings(body: AiNodeBuildEmbeddingsRequest) -> dict:
    """
    Story mentéskor hívandó endpoint.
    Legenerálja és elmenti az AI node-ok embedding-jeit.
    """
    story_path = normalize_src_to_path(body.src)
    story = load_story(story_path)

    build_embeddings(story)

    return {"status": "ok", "message": "Embedding-ek sikeresen legenerálva."}

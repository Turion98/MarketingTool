from __future__ import annotations

import json
import os
import re
import shutil
import traceback
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import cast

from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse

from shared.cache import clear_caches as clear_all_caches
from shared.cache import get_page_cached, load_story_cached, was_last_page_hit
from shared.contracts import (
    FragmentGlobalEntry,
    ImagePromptMerge,
    ImagePromptObject,
    ImagePromptParts,
    JSONValue,
    SfxItem,
    StoryDocument,
    StoryLogic,
    StoryPage,
    TextBlock,
)
from decision_engine.services.runtime_config import (
    DEFAULT_IMAGE_STYLE,
    DEFAULT_NEGATIVE_BLOCK,
    DEFAULT_PROMPT_LIMIT,
    DEFAULT_STORY,
    STORIES_DIR,
)

SFX_OVERRIDES_FILE = "sfxOverrides.json"
SFX_OVERRIDES: dict[str, list[SfxItem]] = {}
if os.path.exists(SFX_OVERRIDES_FILE):
    try:
        with open(SFX_OVERRIDES_FILE, "r", encoding="utf-8") as f:
            SFX_OVERRIDES = json.load(f)
    except Exception:
        traceback.print_exc()


def normalize_src_to_path(src: str | None) -> str:
    if not src:
        fname = DEFAULT_STORY
    else:
        s = str(src).strip().replace("\\", "/")
        if s.startswith("http://") or s.startswith("https://"):
            raise HTTPException(status_code=400, detail="Távoli src nem engedélyezett")
        if s.startswith("/"):
            s = s[1:]
        if s.startswith("stories/"):
            s = s[len("stories/") :]
        if not s.endswith(".json"):
            s += ".json"
        fname = s

    path = os.path.abspath(os.path.join(STORIES_DIR, fname))
    if not path.startswith(STORIES_DIR):
        raise HTTPException(status_code=400, detail="Érvénytelen src elérési út")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Story fájl nem található: {fname}")
    return path


def load_story(path: str) -> StoryDocument:
    return cast(StoryDocument, load_story_cached(path))


def normalize_sfx_list(items: object) -> list[SfxItem]:
    if not isinstance(items, list):
        return []
    out: list[SfxItem] = []
    for s in items:
        if not isinstance(s, dict):
            continue
        file = s.get("file")
        time = s.get("time")
        if not file or time is None:
            continue
        if not (isinstance(file, str) and len(file) > 0):
            continue
        if not (file.startswith("sfx/") or file.startswith("/assets/sfx/")):
            file = f"sfx/{file}" if not file.startswith("/") else file.lstrip("/")
            if not file.startswith("sfx/"):
                file = f"sfx/{file}"
        try:
            time_ms = int(round(float(time)))
        except Exception:
            continue
        out.append({"file": file, "time": time_ms})
    return out


def apply_sfx_overrides(page: StoryPage) -> StoryPage:
    page_out = deepcopy(page)
    pid = page_out.get("id")
    page_sfx = page_out.get("sfx")
    if isinstance(page_sfx, list) and len(page_sfx) > 0:
        page_out["sfx"] = normalize_sfx_list(page_sfx)
    else:
        ov = SFX_OVERRIDES.get(pid)
        page_out["sfx"] = normalize_sfx_list(ov) if ov else []
    return page_out


def ensure_str_list(val: object) -> list[str]:
    if val is None:
        return []
    if isinstance(val, str):
        return [val] if val.strip() else []
    if isinstance(val, list):
        out: list[str] = []
        for v in val:
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
        return out
    return []


def normalize_page_logic_fields(page: StoryPage) -> StoryPage:
    out = deepcopy(page)
    out["needsFragment"] = ensure_str_list(out.get("needsFragment"))
    out["needsFragmentAny"] = ensure_str_list(out.get("needsFragmentAny"))
    out["showIfHasFragment"] = ensure_str_list(out.get("showIfHasFragment"))
    out["hideIfHasFragment"] = ensure_str_list(out.get("hideIfHasFragment"))

    logic = out.get("logic")
    if isinstance(logic, dict):
        logic_typed = cast(StoryLogic, logic)
        conds = logic_typed.get("ifHasFragment")
        if isinstance(conds, dict):
            conds = [conds]
        if isinstance(conds, list):
            norm_list = []
            for c in conds:
                if not isinstance(c, dict):
                    continue
                frag = c.get("fragment")
                go_to = c.get("goTo")
                if isinstance(frag, str) and isinstance(go_to, str):
                    norm_list.append({"fragment": frag.strip(), "goTo": go_to.strip()})
            logic_typed["ifHasFragment"] = norm_list

    choices = out.get("choices")
    if isinstance(choices, list):
        for ch in choices:
            if not isinstance(ch, dict):
                continue
            ch["showIfHasFragment"] = ensure_str_list(ch.get("showIfHasFragment"))
            ch["hideIfHasFragment"] = ensure_str_list(ch.get("hideIfHasFragment"))

    return out


def normalize_prompt_incoming(p: object) -> str:
    if p is None:
        return ""
    if isinstance(p, str):
        return p.strip()
    if isinstance(p, dict):
        cp = p.get("combinedPrompt")
        if cp:
            base = str(cp).strip()
        else:
            parts = []
            for key in ("global", "chapter", "page"):
                v = p.get(key)
                if v:
                    parts.append(str(v).strip())
            base = ", ".join(parts)
        neg = p.get("negativePrompt")
        if neg:
            base = f"{base}, Negative: {str(neg).strip()}"
        return base.strip()
    return str(p).strip()


def collect_fragment_ids_from_text(text: TextBlock | object) -> set[str]:
    ids: set[str] = set()
    if isinstance(text, list):
        for it in text:
            if isinstance(it, dict):
                if it.get("ifUnlocked"):
                    ids.add(str(it["ifUnlocked"]))
                for key in ("default", "text"):
                    t = it.get(key)
                    if isinstance(t, str):
                        ids.update(re.findall(r"\{fragment:([\w\-]+)\}", t))
    elif isinstance(text, str):
        ids.update(re.findall(r"\{fragment:([\w\-]+)\}", text))
    return ids


def collect_fragment_ids(page: StoryPage) -> set[str]:
    ids: set[str] = set()
    refs = page.get("fragments") or page.get("fragmentRefs")
    if isinstance(refs, list):
        for r in refs:
            if isinstance(r, dict) and r.get("id"):
                ids.add(str(r["id"]))
    ids |= collect_fragment_ids_from_text(page.get("text"))
    return ids


def inject_fragments_global_for(story: StoryDocument, page: StoryPage) -> StoryPage:
    out = deepcopy(page)
    fr_all = story.get("fragments", {})
    if isinstance(fr_all, dict) and fr_all:
        need = collect_fragment_ids(page)
        if need:
            out["fragmentsGlobal"] = cast(
                dict[str, FragmentGlobalEntry],
                {fid: fr_all[fid] for fid in need if fid in fr_all},
            )
    return out


def assemble_image_prompt_from_fragments(
    story: StoryDocument, page: StoryPage
) -> tuple[ImagePromptObject, str]:
    def push(dst_list: list[str], val: object):
        if not val:
            return
        if isinstance(val, str):
            v = val.strip()
            if not v:
                return
            if v.lower() not in {x.lower() for x in dst_list}:
                dst_list.append(v)
        elif isinstance(val, list):
            for it in val:
                push(dst_list, it)

    global_parts: list[str] = []
    chapter_parts: list[str] = []
    page_parts: list[str] = []
    negative_parts: list[str] = []

    base_p = page.get("imagePrompt")
    if isinstance(base_p, str):
        push(page_parts, base_p)
    elif isinstance(base_p, dict):
        push(global_parts, base_p.get("global"))
        push(chapter_parts, base_p.get("chapter"))
        push(page_parts, base_p.get("page") or base_p.get("combinedPrompt"))
        push(negative_parts, base_p.get("negativePrompt"))

    fr_global = page.get("fragmentsGlobal") or {}
    include_ids = collect_fragment_ids(page)

    merge_ctl = cast(ImagePromptMerge, page.get("imagePromptMerge") or {})
    only_include = set(merge_ctl.get("include") or [])
    exclude = set(merge_ctl.get("exclude") or [])

    if only_include:
        include_ids = {fid for fid in include_ids if fid in only_include}
    if exclude:
        include_ids = {fid for fid in include_ids if fid not in exclude}

    for fid in include_ids:
        fr = fr_global.get(fid)
        if not isinstance(fr, dict):
            continue
        typed_fragment = cast(FragmentGlobalEntry, fr)
        ipp = typed_fragment.get("imagePromptParts")
        if not ipp:
            continue
        if isinstance(ipp, str):
            push(page_parts, ipp)
        elif isinstance(ipp, dict):
            typed_parts = cast(ImagePromptParts, ipp)
            push(global_parts, typed_parts.get("global"))
            push(chapter_parts, typed_parts.get("chapter"))
            push(page_parts, typed_parts.get("page") or typed_parts.get("combinedPrompt"))
            push(negative_parts, typed_parts.get("negative") or typed_parts.get("negativePrompt"))

    push(global_parts, DEFAULT_IMAGE_STYLE)
    push(negative_parts, DEFAULT_NEGATIVE_BLOCK)

    obj: ImagePromptObject = {
        "global": ", ".join(global_parts) if global_parts else None,
        "chapter": ", ".join(chapter_parts) if chapter_parts else None,
        "page": ", ".join(page_parts) if page_parts else None,
        "negativePrompt": ", ".join(negative_parts) if negative_parts else None,
    }
    obj = cast(ImagePromptObject, {k: v for k, v in obj.items() if v})

    flat = normalize_prompt_incoming(obj)

    if len(flat) > DEFAULT_PROMPT_LIMIT:
        overflow = len(flat) - DEFAULT_PROMPT_LIMIT

        def _shrink(txt: str, cut: int) -> str:
            return txt[: max(0, len(txt) - cut)].rstrip(", ;")

        if obj.get("page") and overflow > 0:
            old = obj["page"]
            obj["page"] = _shrink(old, min(len(old) // 3, overflow))
            flat = normalize_prompt_incoming(obj)

        if len(flat) > DEFAULT_PROMPT_LIMIT and obj.get("global"):
            need = len(flat) - DEFAULT_PROMPT_LIMIT
            old = obj["global"]
            obj["global"] = _shrink(old, min(len(old) // 3, need))
            flat = normalize_prompt_incoming(obj)

    return obj, flat


def find_page_recursive(node: JSONValue, page_id: str) -> StoryPage | None:
    if isinstance(node, dict):
        if node.get("id") == page_id:
            if any(k in node for k in ("type", "text", "choices", "imagePrompt", "audio", "transition")):
                return cast(StoryPage, node)

        pages = node.get("pages")
        if isinstance(pages, list):
            for it in pages:
                found = find_page_recursive(it, page_id)
                if found:
                    return found

        for v in node.values():
            if isinstance(v, (dict, list)):
                found = find_page_recursive(v, page_id)
                if found:
                    return found

    elif isinstance(node, list):
        for it in node:
            found = find_page_recursive(it, page_id)
            if found:
                return found

    return None


def build_page_response_for(page: StoryPage, story: StoryDocument) -> StoryPage:
    p = deepcopy(page or {})
    try:
        p = apply_sfx_overrides(p)
    except Exception:
        p = deepcopy(page or {})

    try:
        p = normalize_page_logic_fields(p)
    except Exception:
        pass

    try:
        p = inject_fragments_global_for(story or {}, p)
    except Exception:
        pass

    try:
        obj, flat = assemble_image_prompt_from_fragments(story or {}, p)
        if obj:
            p["imagePrompt"] = obj
        if flat:
            p["effectiveImagePromptString"] = flat
    except Exception:
        pass

    return p


def get_story_payload(src: str | None) -> StoryDocument:
    story_path = normalize_src_to_path(src)
    return load_story(story_path)


def get_landing_payload(src: str | None) -> StoryPage:
    if src:
        story_path = normalize_src_to_path(src)
        data = load_story(story_path)
        if isinstance(data, dict) and "landing" in data:
            return cast(StoryPage, data["landing"])

    default_path = normalize_src_to_path(DEFAULT_STORY)
    default = load_story(default_path)
    if isinstance(default, dict) and "landing" in default:
        return cast(StoryPage, default["landing"])

    raise HTTPException(status_code=404, detail="Landing not found in default story")


def get_fragments_payload(src: str | None) -> dict[str, JSONValue]:
    story_path = normalize_src_to_path(src)
    story = load_story(story_path)
    fr = story.get("fragments", {})
    if not isinstance(fr, dict):
        return {}
    return cast(dict[str, JSONValue], fr)


def get_public_landing_payload(src: str | None) -> StoryPage:
    story_path = normalize_src_to_path(src)
    story = load_story(story_path)
    if "landing" not in story:
        raise HTTPException(status_code=404, detail="Landing not found")
    return inject_fragments_global_for(story, cast(StoryPage, story["landing"]))


def get_page_payload(page_id: str, src: str | None):
    story_path = normalize_src_to_path(src)
    story = load_story(story_path)

    if "pages" in story and isinstance(story["pages"], dict) and page_id in story["pages"]:
        def _builder():
            return build_page_response_for(story["pages"][page_id], story)

        data = get_page_cached(story_path, page_id, _builder)
        hit = was_last_page_hit()
        resp = JSONResponse(content=data)
        if hit is not None:
            resp.headers["X-Backend-Cache"] = "HIT" if hit else "MISS"
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp

    page = find_page_recursive(story, page_id)
    if page:
        def _builder():
            return build_page_response_for(page, story)

        data = get_page_cached(story_path, page_id, _builder)
        hit = was_last_page_hit()
        resp = JSONResponse(content=data)
        if hit is not None:
            resp.headers["X-Backend-Cache"] = "HIT" if hit else "MISS"
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp

    raise HTTPException(status_code=404, detail=f"Page {page_id} not found")


def get_generated_image_response(story_slug: str, image_name: str) -> FileResponse:
    base = Path("generated") / "images" / story_slug / image_name
    if not base.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    resp = FileResponse(str(base), media_type="image/png")
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp


_STORY_RUNTIME_DEFAULTS: dict[str, int] = {
    "max_entry_skip_depth": 10,
    "max_routing_chain_depth": 5,
    "max_chain_hops": 8,
    "embedding_top_k": 3,
    "return_window_days": 30,
}

_STORY_META_STRING_DEFAULTS: dict[str, str] = {
    "default_clarification": "Kérlek pontosítsd a kérdésedet.",
    "default_fallback": "Köszönjük, folytatjuk.",
    "end_ack_fallback": "Köszönjük, rögzítettük az ügyedet.",
}


def get_story_meta(story: dict | None) -> dict:
    if not isinstance(story, dict):
        return {}
    meta = story.get("meta")
    return meta if isinstance(meta, dict) else {}


def get_story_runtime_date(story: dict | None, key: str) -> date | None:
    """meta.runtime string dátum → date objektum. None ha hiányzik vagy invalid."""
    meta = get_story_meta(story)
    runtime = meta.get("runtime")
    if not isinstance(runtime, dict):
        return None
    val = runtime.get(key)
    if not isinstance(val, str) or not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        return None


def get_story_runtime_int(story: dict | None, key: str) -> int:
    """Story meta.runtime[key] vagy beépített default."""
    default = _STORY_RUNTIME_DEFAULTS.get(key, 0)
    meta = get_story_meta(story)
    runtime = meta.get("runtime")
    if not isinstance(runtime, dict):
        return default
    raw = runtime.get(key)
    if isinstance(raw, bool):
        return int(raw)
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    if isinstance(raw, str):
        try:
            return int(raw.strip())
        except ValueError:
            return default
    return default


def get_story_meta_string(story: dict | None, key: str) -> str:
    """Story meta[key] vagy beépített default."""
    default = _STORY_META_STRING_DEFAULTS.get(key, "")
    meta = get_story_meta(story)
    raw = meta.get(key)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return default


_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def _format_context_value(value: object) -> str:
    """OrderContext mező → ügyfélbarát string reprezentáció.

    - date → ISO formátum (YYYY-MM-DD)
    - list[str] → vesszővel összefűzve
    - float → max 2 tizedes, felesleges trailing 0 nélkül
    - bool → "igen" / "nem"
    - None → "ismeretlen"
    - egyéb → str()
    """
    if value is None:
        return "ismeretlen"
    if isinstance(value, bool):
        return "igen" if value else "nem"
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v is not None)
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text if text else "0"
    return str(value)


def _substitute_context_placeholders(
    template: str,
    context_fields: list[str] | None,
    order_context: object | None,
) -> str:
    """Story end node `content` `{field}` placeholderek behelyettesítése OrderContext-ből.

    A behelyettesítés csak akkor fut, ha az end node-on van `context_fields` lista —
    így a meglévő statikus contentek érintetlenek maradnak. Ismeretlen mező vagy hiányzó
    context esetén "ismeretlen" jelenik meg (nincs KeyError).
    """
    if not isinstance(template, str) or not template:
        return template
    if not isinstance(context_fields, list) or not context_fields:
        return template

    allowed = {f for f in context_fields if isinstance(f, str) and f}
    if not allowed:
        return template

    ctx_dict: dict = {}
    if order_context is not None:
        dump = getattr(order_context, "model_dump", None)
        if callable(dump):
            try:
                ctx_dict = dump() or {}
            except Exception:
                ctx_dict = {}

    def _replace(match: re.Match) -> str:
        name = match.group(1)
        if name not in allowed:
            return match.group(0)
        return _format_context_value(ctx_dict.get(name))

    return _PLACEHOLDER_RE.sub(_replace, template)


def resolve_end_page_content(
    pages: dict | None,
    page_id: str,
    order_context: object | None = None,
) -> str:
    """End node fix `content` szövege, ha létezik.

    Ha az end node-on van `context_fields` lista, a `content` `{field}`
    placeholderei behelyettesítődnek az `order_context` aktuális értékeivel —
    így az ügyfél konkrét adatokat lát a végoldalon (dátum, összeg, ügyazonosító),
    de a story JSON továbbra is deklaratív.
    """
    if not isinstance(pages, dict) or not isinstance(page_id, str) or not page_id.strip():
        return ""
    page = pages.get(page_id.strip())
    if not isinstance(page, dict) or page.get("type") != "end":
        return ""
    raw = page.get("content")
    if not isinstance(raw, str) or not raw.strip():
        return ""

    context_fields = page.get("context_fields")
    if isinstance(context_fields, list) and context_fields and order_context is not None:
        raw = _substitute_context_placeholders(raw, context_fields, order_context)
    return raw.strip()


def resolve_ai_clarification_fallback_message(story: StoryDocument, page_id: str) -> str:
    """
    Node matching bizonytalanság (askClarification) esetén statikus üzenet a story JSON-ból.
    Sorrend: az adott pageId AI node fallback_message → meta.defaultFallbackMessage → rövid default.
    """
    pages = story.get("pages") if isinstance(story, dict) else None
    meta = story.get("meta") if isinstance(story, dict) else None

    story_default = ""
    if isinstance(meta, dict):
        raw = meta.get("defaultFallbackMessage")
        if isinstance(raw, str) and raw.strip():
            story_default = raw.strip()

    if isinstance(pages, dict):
        node = pages.get(page_id)
        if isinstance(node, dict) and node.get("type") == "ai":
            fm = node.get("fallback_message")
            if isinstance(fm, str) and fm.strip():
                return fm.strip()

    return story_default or get_story_meta_string(story, "default_clarification")


def resolve_ai_node_routing(
    routing: list[dict],
    satisfied_conditions: list[str],
) -> tuple[str | None, list[str]]:
    """
    Determinisztikus kondíció router AI node-okhoz.

    routing: az AI node 'routing' tömbje a JSON-ból
    satisfied_conditions: az AI által felismert teljesült kondíció ID-k

    Visszatér:
    - (nextPageId, inject_conditions): nextPageId string ha van egyértelmű irány,
      "ask" ha pontosítást kell kérni, None ha nincs routing szabály
    """
    if not isinstance(routing, list):
        return None, []

    satisfied = set(satisfied_conditions or [])

    for rule in routing:
        if not isinstance(rule, dict):
            continue

        # Default szabály — mindig utoljára fut
        if "default" in rule and "if" not in rule:
            continue

        required = rule.get("if")
        goto = rule.get("goto")

        if not isinstance(required, list) or not isinstance(goto, str):
            continue

        if all(cond in satisfied for cond in required):
            inject = rule.get("inject_conditions")
            injected = [
                cid.strip()
                for cid in inject
                if isinstance(cid, str) and cid.strip()
            ] if isinstance(inject, list) else []
            return goto.strip(), injected

    # Ha if-alapú szabály nem illeszkedett, keressük a default-ot
    for rule in routing:
        if not isinstance(rule, dict):
            continue
        if "default" in rule and "if" not in rule:
            default_val = rule.get("default")
            if default_val == "ask":
                return "ask", []
            if isinstance(default_val, str) and default_val != "ask":
                return default_val.strip(), []

    return None, []


def get_ai_node_payload(
    page_id: str,
    src: str | None,
    satisfied_conditions: list[str]
) -> dict:
    """
    AI node routing endpoint belépési pontja.
    Visszaadja a következő pageId-t vagy 'ask' értéket.
    """
    story_path = normalize_src_to_path(src)
    story = load_story(story_path)

    page = None
    if "pages" in story and isinstance(story["pages"], dict):
        page = story["pages"].get(page_id)
    if page is None:
        page = find_page_recursive(story, page_id)
    if page is None:
        raise HTTPException(
            status_code=404,
            detail=f"AI node {page_id} not found"
        )

    if page.get("type") != "ai":
        raise HTTPException(
            status_code=400,
            detail=f"Page {page_id} is not an ai node"
        )

    routing = page.get("routing")
    if not isinstance(routing, list):
        raise HTTPException(
            status_code=400,
            detail=f"AI node {page_id} has no routing defined"
        )

    next_page, inject_conditions = resolve_ai_node_routing(
        routing, satisfied_conditions
    )

    return {
        "currentPageId": page_id,
        "nextPageId": next_page,
        "injectConditions": inject_conditions,
        "satisfiedConditions": satisfied_conditions,
        "ask": next_page == "ask",
    }


def resolve_step_routing(
    node: dict,
    current_step_id: str,
    satisfied_conditions: list[str],
) -> dict:
    """
    Step alapú routing — meghatározza a következő
    stepet vagy hogy a node routing-ra kell-e lépni.

    Visszatér:
    {
        "nextStepId": str | None,
        "nodeRoutingReady": bool,
    }
    """
    _ = satisfied_conditions
    steps = node.get("steps") or []
    if not steps:
        return {"nextStepId": None, "nodeRoutingReady": True}

    step_ids = [s.get("id") for s in steps if s.get("id")]
    last_step_id = step_ids[-1] if step_ids else None

    if current_step_id == last_step_id:
        return {"nextStepId": None, "nodeRoutingReady": True}

    current_index = next(
        (i for i, s in enumerate(steps) if s.get("id") == current_step_id),
        None,
    )
    if current_index is None:
        return {"nextStepId": None, "nodeRoutingReady": True}

    next_index = current_index + 1
    if next_index < len(steps):
        return {
            "nextStepId": steps[next_index].get("id"),
            "nodeRoutingReady": False,
        }

    return {"nextStepId": None, "nodeRoutingReady": True}


def clear_cache_payload() -> dict[str, str | bool]:
    try:
        for subdir in ["generated/images", "generated/audio"]:
            if os.path.isdir(subdir):
                shutil.rmtree(subdir)
                os.makedirs(subdir, exist_ok=True)
        clear_all_caches()
        return {"ok": True, "message": "Cache cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

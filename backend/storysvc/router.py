# =============================================================
# Unified router.py — strict schema validation + canonicalizer
# Keeps legacy helpers (size-limit read, cache clear hook, setup())
# Endpoints:
#   - POST /upload-story        (strict by default, supports warnOnly)
#   - POST /stories/import      (alias; same pipeline)
# Requires: CoreSchema.json (Draft-07) at:
#   backend/schemas/CoreSchema.json
# or set env CORE_SCHEMA_PATH.
# =============================================================

from __future__ import annotations

import os
import json
from typing import Any, Dict, List, Optional, Callable

from fastapi import APIRouter, HTTPException, UploadFile, File, Body, Query
from jsonschema import Draft7Validator, FormatChecker
from cache import clear_caches as _clear_story_cache
router = APIRouter()

# ---------- Config ----------
STORIES_DIR = os.getenv(
    "STORIES_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../stories"))
)

# Core schema útvonal (backend/schemas/CoreSchema.json)
CORE_SCHEMA_PATH = os.getenv(
    "CORE_SCHEMA_PATH",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../schemas", "CoreSchema.json"))
)

# ENV default bugfix: int() cannot parse "5_000_000" on some environments
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", "5000000"))  # ~5MB default

# Ellenőrzés – logoljunk, ha valami hiányzik
if not os.path.exists(CORE_SCHEMA_PATH):
    print(f"[router] ⚠️ Core schema not found: {CORE_SCHEMA_PATH}")
if not os.path.exists(STORIES_DIR):
    print(f"[router] ⚠️ Stories directory not found: {STORIES_DIR}")

# Optional hooks that might exist elsewhere in your codebase.
# If not available, they degrade gracefully.
_clear_story_cache: Optional[Callable[[], None]] = None
_collect_meta: Optional[Callable[[str], Dict[str, Any]]] = None

try:
    # If your project defines these somewhere, import them here:
    # from .cache import clear_story_cache as _clear_story_cache
    # from .utils import collect_meta as _collect_meta
    pass
except Exception:
    pass

# ---------- Schema load ----------
try:
    with open(CORE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        CORE_SCHEMA = json.load(f)
    SCHEMA_VALIDATOR = Draft7Validator(CORE_SCHEMA, format_checker=FormatChecker())
except Exception as e:
    CORE_SCHEMA = None
    SCHEMA_VALIDATOR = None
    print(f"[router] ⚠️ CoreSchema init error: {e}")

# ---------- Utilities ----------
async def _read_json_with_limit(file: Optional[UploadFile], body: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if file is not None:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"Payload too large (> {MAX_UPLOAD_BYTES} bytes)")
        try:
            return json.loads(content.decode("utf-8"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    if body is not None:
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Body must be a JSON object")
        return body
    raise HTTPException(status_code=400, detail="No file or body provided")

def _slug(txt: Optional[str]) -> str:
    import re
    if not txt:
        return "story"
    return re.sub(r"[^a-z0-9]+", "-", str(txt).lower()).strip("-")

def _fname_for_id(story_id: str) -> str:
    return f"{story_id}.json"

def _ensure_stories_dir() -> None:
    os.makedirs(STORIES_DIR, exist_ok=True)

# ---------- Canonicalizer ----------
def _canonicalize_story(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return data

    # (A) If "chapters" missing but "pages" is an object, convert to 1-chapter array
    if "chapters" not in data and isinstance(data.get("pages"), dict):
        pages_obj = data["pages"]
        pages_arr = []
        for pid, page in pages_obj.items():
            if isinstance(page, dict) and "id" not in page:
                page["id"] = pid
            pages_arr.append(page)
        data["chapters"] = [{
            "id": data.get("storyId", "ch1"),
            "title": data.get("title", ""),
            "pages": pages_arr
        }]
        del data["pages"]

    # (B) Normalize per-page fields
    def fix_page(p: Dict[str, Any]):
        if "nextPageId" in p and "next" not in p:
            p["next"] = p.pop("nextPageId")
        if isinstance(p.get("choices"), list):
            for ch in p["choices"]:
                if isinstance(ch, dict) and "nextPageId" in ch and "next" not in ch:
                    ch["next"] = ch.pop("nextPageId")

    chapters = data.get("chapters")
    if isinstance(chapters, list):
        for ch in chapters:
            pages = ch.get("pages")
            # Some legacy content might still use dict under chapters.pages
            if isinstance(pages, dict):
                arr = []
                for pid, page in pages.items():
                    if isinstance(page, dict) and "id" not in page:
                        page["id"] = pid
                    arr.append(page)
                ch["pages"] = arr
                pages = arr
            if isinstance(pages, list):
                for p in pages:
                    if isinstance(p, dict):
                        fix_page(p)

    return data

# ---------- Validator ----------
def _validate_against_core_schema(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if SCHEMA_VALIDATOR is None:
        return [{"path": "", "message": "Core schema not initialized"}]
    errors: List[Dict[str, Any]] = []
    for err in SCHEMA_VALIDATOR.iter_errors(data):
        path = "/".join([str(p) for p in err.path]) or ""
        errors.append({
            "path": path,
            "message": err.message,
            "keyword": err.validator,
            "schemaPath": "/".join([str(p) for p in err.schema_path])
        })
    return errors

# ---------- Optional semantic checks (graph, reachability, meta) ----------
def _semantic_checks(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    problems: List[Dict[str, Any]] = []

    # --- META szemantika ---
    meta = data.get("meta") or {}
    ctas = meta.get("ctaPresets") or {}
    end_default = meta.get("endDefaultCta")
    start_page = meta.get("startPageId")

    # endDefaultCta: ha string, legyen a ctaPresets kulcsai között
    if isinstance(end_default, str):
        if not isinstance(ctas, dict) or end_default not in ctas:
            problems.append({
                "path": "meta.endDefaultCta",
                "message": f"endDefaultCta='{end_default}' is not a key in meta.ctaPresets",
                "keyword": "exists"
            })

    # CTA-k: ha kind=link, urlTemplate kezdődjön http/https-sel
    if isinstance(ctas, dict):
        for key, c in ctas.items():
            if isinstance(c, dict) and c.get("kind") == "link":
                url = c.get("urlTemplate")
                if not (isinstance(url, str) and url.startswith(("http://", "https://"))):
                    problems.append({
                        "path": f"meta.ctaPresets.{key}.urlTemplate",
                        "message": "urlTemplate must start with http:// or https://",
                        "keyword": "format"
                    })

    # --- Page ID-k összegyűjtése ---
    page_ids = set()
    chapters = data.get("chapters", [])
    if isinstance(chapters, list):
        for ch in chapters:
            pages = ch.get("pages", [])
            if isinstance(pages, list):
                for p in pages:
                    if isinstance(p, dict) and "id" in p:
                        page_ids.add(p["id"])

    # startPageId: ha meg van adva, létezzen a pages között
    if isinstance(start_page, str) and start_page not in page_ids:
        problems.append({
            "path": "meta.startPageId",
            "message": f"startPageId '{start_page}' does not exist in chapters[].pages[].id",
            "keyword": "exists"
        })

    # --- next/choices target ellenőrzések ---
    targets: List[tuple] = []
    if isinstance(chapters, list):
        for ch in chapters:
            pages = ch.get("pages", [])
            if not isinstance(pages, list):
                continue
            for p in pages:
                if not isinstance(p, dict):
                    continue
                nxt = p.get("next")
                if isinstance(nxt, str):
                    targets.append((p.get("id"), nxt, "page.next"))
                for choice in p.get("choices", []) or []:
                    if isinstance(choice, dict) and isinstance(choice.get("next"), str):
                        targets.append((p.get("id"), choice["next"], "choice.next"))

    for src, dst, kind in targets:
        if dst not in page_ids:
            problems.append({
                "path": f"{src or ''} -> {dst}",
                "message": f"Target page id '{dst}' does not exist",
                "keyword": "exists"
            })

    return problems

# ---------- Core pipeline ----------
def _process_and_save_story(
    data: Dict[str, Any],
    overwrite: bool,
    mode: str = "strict"
) -> Dict[str, Any]:
    # 1) Canonicalize legacy formats
    data = _canonicalize_story(data)

    # 2) Schema validation
    schema_errors = _validate_against_core_schema(data)

    # 3) Semantic checks (optional, extend as needed)
    sem_errors = _semantic_checks(data)

    errors = schema_errors + sem_errors
    if mode == "strict" and errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    # 4) Save
    _ensure_stories_dir()
    story_id = data.get("storyId") or _slug(data.get("title"))
    if not story_id:
        raise HTTPException(status_code=400, detail="Missing storyId/title")
    dst_name = _fname_for_id(story_id)
    dst_path = os.path.join(STORIES_DIR, dst_name)

    existed_before = os.path.exists(dst_path)  # overwritten flag fix

    if (not overwrite) and existed_before:
        raise HTTPException(status_code=409, detail=f"Story already exists: {story_id}")

    try:
        with open(dst_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save story: {e}")

    # 5) Cache clear (if hook provided)
    try:
        if callable(_clear_story_cache):
            _clear_story_cache()
    except Exception:
        pass

    # 6) Meta collect (if hook provided)
    meta_info: Dict[str, Any] = {}
    try:
        if callable(_collect_meta):
            meta_info = _collect_meta(dst_path) or {}
    except Exception:
        pass

    return {
        "ok": True,
        "id": story_id,
        "jsonSrc": f"/stories/{dst_name}",
        "savedTo": dst_path,
        "overwritten": bool(overwrite and existed_before),
        "meta": meta_info,
        "errors": errors if mode == "warnOnly" else []
    }

# ---------- Endpoints ----------
@router.post("/upload-story", status_code=201)
async def upload_story(
    overwrite: bool = Query(default=False, description="Overwrite existing story with same id"),
    mode: str = Query(default="strict", pattern="^(strict|warnOnly)$"),
    file: UploadFile = File(default=None),
    body: Optional[Dict[str, Any]] = Body(default=None),
):
    data = await _read_json_with_limit(file, body)
    return _process_and_save_story(data, overwrite=overwrite, mode=mode)

@router.post("/stories/import", status_code=201)
async def import_story(
    overwrite: bool = Query(default=False),
    mode: str = Query(default="strict", pattern="^(strict|warnOnly)$"),
    file: UploadFile = File(default=None),
    body: Optional[Dict[str, Any]] = Body(default=None),
):
    data = await _read_json_with_limit(file, body)
    return _process_and_save_story(data, overwrite=overwrite, mode=mode)

@router.get("/stories")
def list_stories():
    """
    Lists all story JSON files under STORIES_DIR.
    Returns meta info if available.
    """
    if not os.path.isdir(STORIES_DIR):
        raise HTTPException(status_code=500, detail=f"Stories directory not found: {STORIES_DIR}")

    out: list[dict[str, any]] = []
    for fn in os.listdir(STORIES_DIR):
        if not fn.lower().endswith(".json"):
            continue
        full = os.path.join(STORIES_DIR, fn)
        try:
            with open(full, "r", encoding="utf-8") as f:
                data = json.load(f)
            meta = data.get("meta", {})
            out.append({
                "id": meta.get("id") or os.path.splitext(fn)[0],
                "title": meta.get("title") or os.path.splitext(fn)[0],
                "description": meta.get("description") or "",
                "coverImage": meta.get("coverImage") or "",
                "jsonSrc": f"/stories/{fn}",
                "startPageId": meta.get("startPageId") or "ch1_pg1",
                "createdAt": meta.get("createdAt") or "",
            })
        except Exception as e:
            out.append({
                "id": os.path.splitext(fn)[0],
                "title": fn,
                "error": str(e),
                "jsonSrc": f"/stories/{fn}",
            })

    # rendezés név szerint
    out.sort(key=lambda x: x["title"].lower())
    return out

# ---------- Optional: setup() for app include ----------
def setup(app, prefix: str = ""):
    app.include_router(router, prefix=prefix or "")
    return router

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
import logging
from typing import Callable, cast

from fastapi import APIRouter, HTTPException, UploadFile, File, Body, Query
from jsonschema import Draft7Validator, FormatChecker
from services.contracts import JSONObject, JSONValue, StoryDocument, StoryListItem, StorySaveResult, StoryValidationIssue

router = APIRouter()

logger = logging.getLogger("uvicorn.error")



# ---------- Config (schema path + limits) ----------
CORE_SCHEMA_PATH = os.getenv(
    "CORE_SCHEMA_PATH",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../schemas", "CoreSchema.json")),
)

# ENV default bugfix: int() cannot parse "5_000_000" on some environments
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", "5000000"))  # ~5MB default

# ---------- Runtime getters (avoid import-time racing with env) ----------
def _get_stories_dir() -> str:
    return os.path.abspath(
        os.getenv(
            "STORIES_DIR",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../stories")),
        )
    )

# ---------- Optional hooks (degrade gracefully if missing) ----------
try:
    # If available, use your project's cache clearer
    from cache import clear_caches as _clear_story_cache
except Exception:
    _clear_story_cache = None

# You may wire a meta collector elsewhere in your project
_collect_meta: Callable[[str], JSONObject] | None = None

# ---------- Schema load ----------
try:
    with open(CORE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        CORE_SCHEMA = json.load(f)
    SCHEMA_VALIDATOR = Draft7Validator(CORE_SCHEMA, format_checker=FormatChecker())
    print(f"[storysvc] CoreSchema loaded from {CORE_SCHEMA_PATH}")
except Exception as e:
    CORE_SCHEMA = None
    SCHEMA_VALIDATOR = None
    print(f"[storysvc] ⚠️ CoreSchema init error: {e}")

# ---------- Utilities ----------
async def _read_json_with_limit(
    file: UploadFile | None,
    body: dict[str, object] | None,
) -> StoryDocument:
    """
    Reads JSON either from multipart file or JSON body, with size limit,
    és közben **print**-el debugol.
    """
    if file is not None:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            print(
                "[storysvc] Upload rejected: payload too large "
                f"({len(content)} bytes, limit={MAX_UPLOAD_BYTES})"
            )
            raise HTTPException(status_code=413, detail=f"Payload too large (> {MAX_UPLOAD_BYTES} bytes)")
        try:
            data = json.loads(content.decode("utf-8"))
        except Exception as e:
            print(f"[storysvc] Invalid JSON in uploaded file {getattr(file, 'filename', None)!r}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

        if isinstance(data, dict):
            meta = data.get("meta") or {}
            print(
                "[storysvc] Upload via file:",
                "filename=", repr(getattr(file, "filename", None)),
                "schemaVersion=", repr(data.get("schemaVersion")),
                "storyId=", repr(data.get("storyId")),
                "meta.title=", repr(meta.get("title")),
            )
        else:
            print("[storysvc] Upload via file but JSON root is not an object:", type(data).__name__)
        return cast(StoryDocument, data)

    if body is not None:
        if not isinstance(body, dict):
            print("[storysvc] Body upload is not a JSON object:", type(body).__name__)
            raise HTTPException(status_code=400, detail="Body must be a JSON object")

        meta = body.get("meta") or {}
        print(
            "[storysvc] Upload via body:",
            "schemaVersion=", repr(body.get("schemaVersion")),
            "storyId=", repr(body.get("storyId")),
            "meta.title=", repr(meta.get("title")),
        )
        return body

    print("[storysvc] No file or body provided to upload-story/import-story")
    raise HTTPException(status_code=400, detail="No file or body provided")


def _slug(txt: str | None) -> str:
    import re

    if not txt:
        return "story"
    return re.sub(r"[^a-z0-9]+", "-", str(txt).lower()).strip("-")


def _fname_for_id(story_id: str) -> str:
    return f"{story_id}.json"


def _ensure_stories_dir() -> None:
    os.makedirs(_get_stories_dir(), exist_ok=True)


# ---------- Canonicalizer ----------
def _canonicalize_story(data: StoryDocument) -> StoryDocument:
    """
    Canonical form is CoreSchema-compatible:
      - root.pages must exist
      - pages is an array of page objects with id
      - page.next (not nextPageId)
      - choice.next (not nextPageId)
    We DO NOT convert to / rely on root.chapters in strict pipeline.
    (We still accept chapters in semantic checks as fallback for older saved files.)
    """
    if not isinstance(data, dict):
        return data

    # (A) If pages is an object {id: page}, convert to array and inject id if missing
    pages = data.get("pages")
    if isinstance(pages, dict):
        pages_arr: list[StoryDocument] = []
        for pid, page in pages.items():
            if isinstance(page, dict):
                if "id" not in page:
                    page["id"] = pid
                pages_arr.append(cast(StoryDocument, page))
        data["pages"] = pages_arr
        pages = pages_arr

    # (B) Normalize per-page fields
    def fix_page(p: StoryDocument) -> None:
        if "nextPageId" in p and "next" not in p:
            p["next"] = p.pop("nextPageId")
        if isinstance(p.get("choices"), list):
            for ch in p["choices"]:
                if isinstance(ch, dict) and "nextPageId" in ch and "next" not in ch:
                    ch["next"] = ch.pop("nextPageId")

    if isinstance(pages, list):
        for p in pages:
            if isinstance(p, dict):
                fix_page(p)

    # (C) Legacy: if someone sends chapters.pages as dict/list, we normalize inside chapters too
    # BUT we never delete root.pages or convert root.pages -> chapters.
    chapters = data.get("chapters")
    if isinstance(chapters, list):
        for ch in chapters:
            if not isinstance(ch, dict):
                continue
            ch_pages = ch.get("pages")
            if isinstance(ch_pages, dict):
                arr: list[StoryDocument] = []
                for pid, page in ch_pages.items():
                    if isinstance(page, dict) and "id" not in page:
                        page["id"] = pid
                    if isinstance(page, dict):
                        typed_page = cast(StoryDocument, page)
                        fix_page(typed_page)
                        arr.append(typed_page)
                ch["pages"] = arr
                ch_pages = arr
            if isinstance(ch_pages, list):
                for p in ch_pages:
                    if isinstance(p, dict):
                        fix_page(cast(StoryDocument, p))

    return data

@router.post("/stories/validate")
async def validate_story(
    mode: str = Query(default="strict", regex="^(strict|warnOnly)$"),
    file: UploadFile | None = File(default=None),
    body: dict[str, object] | None = Body(default=None),
):
    data = await _read_json_with_limit(file, body)
    return _process_story_validate_only(data, mode=mode)


# ---------- Validator ----------
def _validate_against_core_schema(data: StoryDocument) -> list[StoryValidationIssue]:
    if SCHEMA_VALIDATOR is None:
        return [{"path": "", "message": "Core schema not initialized"}]

    errors: list[StoryValidationIssue] = []
    for err in SCHEMA_VALIDATOR.iter_errors(data):
        path = "/".join([str(p) for p in err.path]) or ""
        errors.append(
            {
                "path": path,
                "message": err.message,
                "keyword": err.validator,
                "schemaPath": "/".join([str(p) for p in err.schema_path]),
            }
        )
    return errors


# ---------- Optional semantic checks (graph, reachability, meta) ----------
def _semantic_checks(data: StoryDocument) -> list[StoryValidationIssue]:
    problems: list[StoryValidationIssue] = []

    # --- META semantics ---
    meta = data.get("meta") or {}
    ctas = meta.get("ctaPresets") or {}
    end_default = meta.get("endDefaultCta")
    start_page = meta.get("startPageId")

    # endDefaultCta: if string, must exist in ctaPresets
    if isinstance(end_default, str):
        if not isinstance(ctas, dict) or end_default not in ctas:
            problems.append(
                {
                    "path": "meta.endDefaultCta",
                    "message": f"endDefaultCta='{end_default}' is not a key in meta.ctaPresets",
                    "keyword": "exists",
                }
            )

    # CTA kind=link must have http/https urlTemplate
    if isinstance(ctas, dict):
        for key, c in ctas.items():
            if isinstance(c, dict) and c.get("kind") == "link":
                url = c.get("urlTemplate")
                if not (isinstance(url, str) and url.startswith(("http://", "https://"))):
                    problems.append(
                        {
                            "path": f"meta.ctaPresets.{key}.urlTemplate",
                            "message": "urlTemplate must start with http:// or https://",
                            "keyword": "format",
                        }
                    )

    # --- Collect page IDs ---
    page_ids: set[str] = set()

    pages = data.get("pages")
    if isinstance(pages, list):
        for p in pages:
            if isinstance(p, dict) and isinstance(p.get("id"), str):
                page_ids.add(p["id"])

    # Fallback for very old saved files that still only have chapters/pages
    if not page_ids:
        chapters = data.get("chapters")
        if isinstance(chapters, list):
            for ch in chapters:
                if not isinstance(ch, dict):
                    continue
                ch_pages = ch.get("pages", [])
                if isinstance(ch_pages, list):
                    for p in ch_pages:
                        if isinstance(p, dict) and isinstance(p.get("id"), str):
                            page_ids.add(p["id"])

    # startPageId must exist
    if isinstance(start_page, str) and start_page not in page_ids:
        problems.append(
            {
                "path": "meta.startPageId",
                "message": f"startPageId '{start_page}' does not exist in pages[].id",
                "keyword": "exists",
            }
        )

    # --- next/choices target checks ---
    targets: list[tuple[str | None, str, str]] = []

    if isinstance(pages, list):
        for p in pages:
            if not isinstance(p, dict):
                continue
            src = p.get("id") if isinstance(p.get("id"), str) else None
            nxt = p.get("next")
            if isinstance(nxt, str):
                targets.append((src, nxt, "page.next"))
            for choice in (p.get("choices") or []):
                if isinstance(choice, dict) and isinstance(choice.get("next"), str):
                    targets.append((src, choice["next"], "choice.next"))

    # Fallback targets from chapters (legacy) if pages missing
    if not targets:
        chapters = data.get("chapters")
        if isinstance(chapters, list):
            for ch in chapters:
                if not isinstance(ch, dict):
                    continue
                ch_pages = ch.get("pages", [])
                if not isinstance(ch_pages, list):
                    continue
                for p in ch_pages:
                    if not isinstance(p, dict):
                        continue
                    src = p.get("id") if isinstance(p.get("id"), str) else None
                    nxt = p.get("next")
                    if isinstance(nxt, str):
                        targets.append((src, nxt, "page.next"))
                    for choice in (p.get("choices") or []):
                        if isinstance(choice, dict) and isinstance(choice.get("next"), str):
                            targets.append((src, choice["next"], "choice.next"))

    for src, dst, kind in targets:
        if dst not in page_ids:
            problems.append(
                {
                    "path": f"{(src or '')} -> {dst}",
                    "message": f"Target page id '{dst}' does not exist",
                    "keyword": "exists",
                }
            )

    return problems

def _process_story_validate_only(
    data: StoryDocument,
    mode: str = "strict",
) -> dict[str, JSONValue]:
    """
    Validálás ugyanazzal a pipeline-nal, mint az import,
    de mentés NÉLKÜL.
    - strict: hibánál 400 + detail.errors
    - warnOnly: mindig 200, és errors mezőben visszaadjuk a hibákat
    """

    # 0) derive story_id (ugyanaz, mint save-nél, csak nem mentjük)
    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}

    meta_id = meta.get("id")

    story_id = (
        data.get("storyId")
        or (meta_id if isinstance(meta_id, str) and meta_id.strip() else None)
        or _slug((meta.get("title") if isinstance(meta.get("title"), str) else None) or data.get("title"))
    )

    if not isinstance(story_id, str) or not story_id.strip() or story_id == "story":
        raise HTTPException(
            status_code=400,
            detail="Missing/invalid storyId (provide storyId or meta.id or title)",
        )

    story_id = story_id.strip()

    # ensure root storyId + meta.id + meta.title (schema miatt)
    data["storyId"] = story_id

    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}

    if not isinstance(meta.get("id"), str) or not meta.get("id").strip():
        meta["id"] = story_id

    if not isinstance(meta.get("title"), str) or not meta.get("title").strip():
        fallback_title = data.get("title")
        if not isinstance(fallback_title, str) or not fallback_title.strip():
            fallback_title = story_id
        meta["title"] = fallback_title.strip()

    data["meta"] = meta

    print("[storysvc] Validating (no-save):", "storyId=", repr(story_id), "mode=", mode)

    # 1) Canonicalize legacy formats
    data = _canonicalize_story(data)

    # 2) Schema validation
    schema_errors = _validate_against_core_schema(data)

    # 3) Semantic checks
    sem_errors = _semantic_checks(data)

    errors = schema_errors + sem_errors

    print(
        "[storysvc] Validate-only result:",
        "storyId=", repr(story_id),
        "schema_errors=", len(schema_errors),
        "sem_errors=", len(sem_errors),
        "mode=", mode,
    )

    # strict: ugyanúgy elhasal, mint import
    if errors and mode == "strict":
        raise HTTPException(status_code=400, detail={"errors": errors})

    # warnOnly: nem 400, csak visszaadja
    return {
        "ok": len(errors) == 0,
        "id": story_id,
        "schemaVersion": data.get("schemaVersion"),
        "errors": errors,
    }

# ---------- Core pipeline ----------
def _process_and_save_story(
    data: StoryDocument,
    overwrite: bool,
    mode: str = "strict",
) -> StorySaveResult:
    # 0) derive story_id (prefer explicit ids; fallback to meta.id then title slug)
    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}

    meta_id = meta.get("id")

    story_id = (
        data.get("storyId")
        or (meta_id if isinstance(meta_id, str) and meta_id.strip() else None)
        or _slug((meta.get("title") if isinstance(meta.get("title"), str) else None) or data.get("title"))
    )

    if not isinstance(story_id, str) or not story_id.strip() or story_id == "story":
        print("[storysvc] Missing/invalid storyId (need storyId or meta.id or title/meta.title)")
        raise HTTPException(
            status_code=400,
            detail="Missing/invalid storyId (provide storyId or meta.id or title)",
        )

    story_id = story_id.strip()

    # ensure root storyId is set for CoreSchema validation + consistent file naming
    data["storyId"] = story_id

    # ensure meta exists + meta.id
    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}

    if not isinstance(meta.get("id"), str) or not meta.get("id").strip():
        meta["id"] = story_id

    # 0.5) ensure meta.title exists (CoreSchema requires it)
    if not isinstance(meta.get("title"), str) or not meta.get("title").strip():
        fallback_title = data.get("title")
        if not isinstance(fallback_title, str) or not fallback_title.strip():
            fallback_title = story_id  # last resort
        meta["title"] = fallback_title.strip()

    data["meta"] = meta

    print(
        "[storysvc] Processing story:",
        "storyId=", repr(story_id),
        "schemaVersion=", repr(data.get("schemaVersion")),
        "mode=", mode,
    )

    # 1) Canonicalize legacy formats
    data = _canonicalize_story(data)

    # 2) Schema validation
    schema_errors = _validate_against_core_schema(data)

    # 3) Semantic checks (optional, extend as needed)
    sem_errors = _semantic_checks(data)

    errors = schema_errors + sem_errors

    print(
        "[storysvc] Validation result:",
        "storyId=", repr(story_id),
        "schema_errors=", len(schema_errors),
        "sem_errors=", len(sem_errors),
        "mode=", mode,
    )

    if errors and mode == "strict":
        print("[storysvc] Rejecting story in strict mode due to", len(errors), "validation errors")
        for err in errors[:10]:
            print(
                "[storysvc]  - path=",
                err.get("path"),
                "keyword=",
                err.get("keyword"),
                "message=",
                err.get("message"),
            )
        raise HTTPException(status_code=400, detail={"errors": errors})

    # 4) Save
    _ensure_stories_dir()
    dst_name = _fname_for_id(story_id)
    stories_dir = _get_stories_dir()
    dst_path = os.path.join(stories_dir, dst_name)

    existed_before = os.path.exists(dst_path)  # overwritten flag fix

    if (not overwrite) and existed_before:
        print(
            "[storysvc] Story already exists and overwrite=False:",
            "storyId=", repr(story_id),
            "path=", dst_path,
        )
        raise HTTPException(status_code=409, detail=f"Story already exists: {story_id}")

    try:
        with open(dst_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[storysvc] Failed to save story", repr(story_id), "to", dst_path, "error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to save story: {e}")

    print(
        "[storysvc] Saved story:",
        "storyId=", repr(story_id),
        "path=", dst_path,
        "overwritten=", bool(overwrite and existed_before),
    )

    # 5) Cache clear (if hook provided)
    try:
        if callable(_clear_story_cache):
            _clear_story_cache()
            print("[storysvc] Story caches cleared after save")
    except Exception as e:
        print("[storysvc] Error while clearing story caches for", repr(story_id), ":", e)

    # 6) Meta collect (if hook provided)
    meta_info: JSONObject = {}
    try:
        if callable(_collect_meta):
            meta_info = _collect_meta(dst_path) or {}
            print("[storysvc] Collected meta for", repr(story_id), ":", meta_info)
    except Exception as e:
        print("[storysvc] Error while collecting meta for", repr(story_id), ":", e)

    return {
        "ok": True,
        "id": story_id,
        "jsonSrc": f"/stories/{dst_name}",
        "savedTo": dst_path,
        "overwritten": bool(overwrite and existed_before),
        "meta": meta_info,
        "errors": errors if mode == "warnOnly" else [],
    }


# ---------- Endpoints ----------
@router.post("/upload-story", status_code=201)
async def upload_story(
    overwrite: bool = Query(default=False, description="Overwrite existing story with same id"),
    mode: str = Query(default="strict", regex="^(strict|warnOnly)$"),
    file: UploadFile | None = File(default=None),
    body: dict[str, object] | None = Body(default=None),
):
    data = await _read_json_with_limit(file, body)
    return _process_and_save_story(data, overwrite=overwrite, mode=mode)


@router.post("/stories/import", status_code=201)
async def import_story(
    overwrite: bool = Query(default=False),
    mode: str = Query(default="strict", regex="^(strict|warnOnly)$"),
    file: UploadFile | None = File(default=None),
    body: dict[str, object] | None = Body(default=None),
):
    data = await _read_json_with_limit(file, body)
    return _process_and_save_story(data, overwrite=overwrite, mode=mode)


@router.get("/stories")
def list_stories():
    """
    Lists all story JSON files under STORIES_DIR.
    Returns meta info if available.
    """
    stories_dir = _get_stories_dir()
    if not os.path.isdir(stories_dir):
        raise HTTPException(status_code=500, detail=f"Stories directory not found: {stories_dir}")

    out: list[StoryListItem] = []
    for fn in os.listdir(stories_dir):
        if not fn.lower().endswith(".json"):
            continue
        full = os.path.join(stories_dir, fn)
        try:
            with open(full, "r", encoding="utf-8") as f:
                data = json.load(f)
            meta = data.get("meta", {}) or {}
            out.append(
                {
                    "id": data.get("storyId") or meta.get("id") or os.path.splitext(fn)[0],
                    "title": meta.get("title") or data.get("title") or os.path.splitext(fn)[0],
                    "description": meta.get("description") or "",
                    "coverImage": meta.get("coverImage") or "",
                    "jsonSrc": f"/stories/{fn}",
                    "startPageId": meta.get("startPageId") or "ch1_pg1",
                    "createdAt": meta.get("createdAt") or "",
                }
            )
        except Exception as e:
            out.append(
                {
                    "id": os.path.splitext(fn)[0],
                    "title": fn,
                    "error": str(e),
                    "jsonSrc": f"/stories/{fn}",
                }
            )

    # rendezés név szerint
    out.sort(key=lambda x: (x.get("title") or "").lower())
    return out


# ---------- Optional: setup() for app include ----------
def setup(app, prefix: str = ""):
    app.include_router(router, prefix=prefix or "")
    return router

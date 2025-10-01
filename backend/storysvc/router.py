# backend/stories/router.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Body, Query
from typing import Callable, Optional, Any, Dict, List
import os, json, re
from datetime import datetime

# --- Opcionális régi validátor kompat (ha már használod máshol is) ---
try:
    from validators.story_validator import validate_story_dict  # legacy
except Exception:
    validate_story_dict = None  # nem kötelező, az új import endpoint nem ezt használja

# --- ÚJ: schema + business rules + migrátor ---
try:
    from validation.schema_validator import validate_schema, version_whitelist_ok
    from validation.business_rules import cross_field_checks
    from migration.strip_legacy_ux import strip_legacy_ux
except Exception:
    # Ha a validation/migration modulok még nincsenek bemásolva:
    validate_schema = None
    version_whitelist_ok = None
    cross_field_checks = None
    strip_legacy_ux = None

router = APIRouter()

_STORIES_DIR: Optional[str] = None
_clear_story_cache: Optional[Callable[[], None]] = None

# --- Konfigurálható limitek/flag-ek (.env) ---
_MAX_BYTES = int(os.getenv("STORY_MAX_BYTES", "2097152"))  # 2 MiB
VALIDATE_MODE_DEFAULT = os.getenv("VALIDATE_MODE", "strict")  # strict|warnOnly
ENABLE_STRIP_LEGACY_UX = os.getenv("ENABLE_STRIP_LEGACY_UX", "true").lower() == "true"

def setup(stories_dir: str, clear_cache: Callable[[], None]) -> None:
    """
    Main-ból hívod: beállítja a stories könyvtárat és a cache-ürítést.
    """
    global _STORIES_DIR, _clear_story_cache
    _STORIES_DIR = os.path.abspath(stories_dir)
    _clear_story_cache = clear_cache
    os.makedirs(_STORIES_DIR, exist_ok=True)

def _slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9_\-]+", "-", s)
    return re.sub(r"-{2,}", "-", s).strip("-") or "story"

def _fname_for_id(story_id: str) -> str:
    return f"{story_id}.json"

def _collect_meta(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
    meta = data.get("meta") if isinstance(data, dict) else {}
    basename = os.path.basename(path)
    story_id = (meta or {}).get("id") or os.path.splitext(basename)[0]
    stat = os.stat(path)
    created_iso = (meta or {}).get("createdAt") or datetime.fromtimestamp(stat.st_mtime).isoformat()
    return {
        "id": story_id,
        "title": (meta or {}).get("title") or story_id,
        "description": (meta or {}).get("description") or "",
        "coverImage": (meta or {}).get("coverImage") or "",
        "createdAt": created_iso,
        "jsonSrc": f"/stories/{_fname_for_id(story_id)}",
    }

@router.get("/stories")
def list_stories() -> List[Dict[str, Any]]:
    if not _STORIES_DIR:
        raise HTTPException(status_code=500, detail="Stories dir not configured")
    out: List[Dict[str, Any]] = []
    for name in sorted(os.listdir(_STORIES_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(_STORIES_DIR, name)
        if not os.path.isfile(path):
            continue
        out.append(_collect_meta(path))
    return out

# --- Közös JSON beolvasó, méretlimittel ---
async def _read_json_with_limit(file: Optional[UploadFile], body: Optional[Dict[str, Any]]):
    if file is not None:
        raw = await file.read()
        if len(raw) > _MAX_BYTES:
            raise HTTPException(status_code=413, detail={"errors":[{"path":"","message":f"JSON túl nagy: {len(raw)} B (limit: {_MAX_BYTES} B)","keyword":"size"}]})
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail={"errors":[{"path":"","message":"Invalid JSON file","keyword":"parse"}]})
    elif body is not None:
        # becsült méret (serialize) – biztonság kedvéért
        try:
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail={"errors":[{"path":"","message":"Body must be JSON object","keyword":"type"}]})
        if len(raw) > _MAX_BYTES:
            raise HTTPException(status_code=413, detail={"errors":[{"path":"","message":f"JSON túl nagy: {len(raw)} B (limit: {_MAX_BYTES} B)","keyword":"size"}]})
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail={"errors":[{"path":"","message":"Body must be JSON object","keyword":"type"}]})
        return body
    else:
        raise HTTPException(status_code=400, detail={"errors":[{"path":"","message":"No file or JSON body provided","keyword":"input"}]})

# --- Csak validáció (legacy endpoint a jelenlegi frontendhez) ---
@router.post("/validate-story")
async def validate_story_endpoint(
    file: UploadFile = File(default=None),
    body: Optional[Dict[str, Any]] = Body(default=None),
):
    if validate_story_dict is None:
        raise HTTPException(status_code=500, detail="Validator module not available on server")
    data = await _read_json_with_limit(file, body)
    ok, errors, warnings = validate_story_dict(data)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})
    return {"ok": True, "warnings": warnings}

# --- Feltöltés (legacy flow: validáció + mentés) ---
@router.post("/upload-story", status_code=201)
async def upload_story(
    overwrite: bool = Query(default=False, description="Létező azonosító felülírása"),
    file: UploadFile = File(default=None),
    body: Optional[Dict[str, Any]] = Body(default=None),
):
    if not _STORIES_DIR:
        raise HTTPException(status_code=500, detail="Stories dir not configured")
    if validate_story_dict is None:
        raise HTTPException(status_code=500, detail="Validator module not available on server")

    data = await _read_json_with_limit(file, body)

    # CoreSchema + szemantika (legacy modul)
    ok, errors, warnings = validate_story_dict(data)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

    meta = data.get("meta") or {}
    story_id = (meta.get("id") if isinstance(meta, dict) else None) or _slug(meta.get("title") if isinstance(meta, dict) else None) or data.get("storyId") or "story"

    dst_name = _fname_for_id(story_id)
    dst_path = os.path.join(_STORIES_DIR, dst_name)

    if (not overwrite) and os.path.exists(dst_path):
        raise HTTPException(status_code=409, detail=f"Story already exists: {story_id}")

    try:
        with open(dst_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")

    try:
        if _clear_story_cache:
            _clear_story_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "id": story_id,
        "jsonSrc": f"/stories/{dst_name}",
        "meta": _collect_meta(dst_path),
        "overwritten": overwrite and os.path.exists(dst_path),
        "warnings": warnings,
    }

# === ÚJ FLOW: /api/stories/import ===
# Migrátor (strip legacy UX) → JSON Schema (jsonschema) → verzió whitelist → business rules
@router.post("/stories/import", status_code=201)
async def import_story(
    overwrite: bool = Query(default=False, description="Létező azonosító felülírása"),
    mode: str = Query(default=VALIDATE_MODE_DEFAULT, pattern="^(strict|warnOnly)$"),
    file: UploadFile = File(default=None),
    body: Optional[Dict[str, Any]] = Body(default=None),
):
    if not _STORIES_DIR:
        raise HTTPException(status_code=500, detail="Stories dir not configured")
    if not (validate_schema and version_whitelist_ok and cross_field_checks):
        raise HTTPException(status_code=500, detail="Validation modules not available on server")

    # 1) Beolvasás + méretlimit
    data = await _read_json_with_limit(file, body)

    # 2) Opcionális migráció (legacy UX kulcsok eltávolítása)
    if ENABLE_STRIP_LEGACY_UX:
        if not strip_legacy_ux:
            raise HTTPException(status_code=500, detail="Migration module not available on server")
        data = strip_legacy_ux(data)

    # 3) Strict JSON Schema ellenőrzés
    ok, schema_errs = validate_schema(data)

    # 4) Sémaverzió whitelist
    vok, vmsg = version_whitelist_ok(data)
    if not vok:
        schema_errs = schema_errs + [{"path": "schemaVersion", "message": vmsg, "keyword": "version", "schemaPath": "Core/VersionWhitelist"}]

    # 5) Cross-field / referenciák csak akkor, ha a sémán átment
    sem_errs: List[Dict[str, Any]] = []
    if not schema_errs:
        sem_errs = cross_field_checks(data)

    # 6) Hibák/Warnok aggregálása
    errors = (schema_errs or []) + (sem_errs or [])
    warnings: List[str] = []

    # 7) warnOnly vs strict
    if (mode or "strict") == "strict" and errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

    # 8) Mentés
    meta = data.get("meta") or {}
    story_id = (meta.get("id") if isinstance(meta, dict) else None) or _slug(meta.get("title") if isinstance(meta, dict) else None) or data.get("storyId") or "story"
    dst_name = _fname_for_id(story_id)
    dst_path = os.path.join(_STORIES_DIR, dst_name)

    if (not overwrite) and os.path.exists(dst_path):
        raise HTTPException(status_code=409, detail=f"Story already exists: {story_id}")

    try:
        with open(dst_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")

    try:
        if _clear_story_cache:
            _clear_story_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "id": story_id,
        "jsonSrc": f"/stories/{dst_name}",
        "meta": _collect_meta(dst_path),
        "overwritten": overwrite and os.path.exists(dst_path),
        "warnings": warnings,
        # warnOnly módban visszaadjuk a hibákat is info jelleggel
        "errors": errors if (mode or "strict") == "warnOnly" else [],
    }

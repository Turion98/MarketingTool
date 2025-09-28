import os, json, time, hashlib
from typing import Optional, Dict, Any
from datetime import datetime

# --- Konfig betöltés ---
def get_config():
    if os.path.exists("userConfig.json"):
        with open("userConfig.json", "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

_config = get_config()

ENABLE_IMAGE_CACHE   = bool(_config.get("ENABLE_IMAGE_CACHE", True))
ENABLE_IMAGE_PRELOAD = bool(_config.get("ENABLE_IMAGE_PRELOAD", True))

# Opcionális globális felülírások
_IMAGE_PARAMS = _config.get("IMAGE_PARAMS", {})   # pl.: {"draft": {...}, "refine": {...}}
_DEFAULT_FMT  = (_config.get("IMAGE_DEFAULT_FMT", "png") or "png").lower()

# --- LOG könyvtár ---
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "image_gen.jsonl")


# --- Helper: slug ---
def _slugify(value: Optional[str]) -> str:
    s = (value or "").strip().lower()
    if not s:
        return "default"
    # fájlnév/útvonal részek lepucolása
    s = s.replace("\\", "/")
    s = os.path.basename(s)                # "Erodv2_analytics.json"
    if s.endswith(".json"):
        s = s[:-5]
    # csak [a-z0-9_-]
    out = []
    for ch in s:
        if ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch in ("-", "_"):
            out.append(ch)
        else:
            out.append("-")
    # duplák összehúzása
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    slug = slug.strip("-") or "default"
    return slug


# --- Helper: egyedi fájlnév generálás (story-szeparált) ---
def _build_filename(
    page_id: str,
    prompt_key: str,
    seed: Optional[int],
    fmt: str,
    story_slug: Optional[str] = None,
) -> str:
    """
    Egyedi fájlnév generálása cache-hez, biztonságos formában.
    A képek 'generated/images/<story_slug>/' alá kerülnek.
    """
    safe_story = _slugify(story_slug)
    base_dir = os.path.join("generated", "images", safe_story)
    os.makedirs(base_dir, exist_ok=True)

    pk_hash = hashlib.sha1(prompt_key.encode("utf-8")).hexdigest()[:12]
    seed_str = f"_{seed}" if seed is not None else ""
    # a page_id is marad a névben, hogy emberibb legyen
    filename = f"{page_id}_{pk_hash}{seed_str}.{fmt}"
    return os.path.join(base_dir, filename)


# --- Helper: promptKey generálás ---
def _compute_prompt_key(
    prompt: Optional[str],
    params: Dict[str, Any],
    style_profile: Dict[str, Any],
    existing_key: Optional[str] = None
) -> str:
    """
    Egyedi prompt_key generálás a prompt + paraméterek + style_profile alapján.
    Ha van existing_key, azt használjuk.
    """
    if existing_key:
        return existing_key
    data_str = json.dumps({
        "prompt": prompt,
        "params": params,
        "style": style_profile
    }, sort_keys=True)
    return hashlib.sha1(data_str.encode("utf-8")).hexdigest()


# --- Helper: metaadat írás mellékfájlba ---
def _write_sidecar_meta(image_path: str, meta: Dict[str, Any]) -> None:
    meta_path = image_path + ".json"
    try:
        with open(meta_path, "w", encoding="utf-8") as mf:
            json.dump(meta, mf, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] Metaadat írás sikertelen: {e}")


# --- Helper: log írás JSONL-be ---
def _log(event: Dict[str, Any]) -> None:
    event["ts"] = datetime.utcnow().isoformat() + "Z"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as lf:
            lf.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[WARN] Log írás sikertelen: {e}")


# --- Helper: mock kép létrehozása minimális PNG-vel ---
def _ensure_min_png(path: str) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            # 1x1 px átlátszó PNG
            f.write(
                b"\x89PNG\r\n\x1a\n"
                b"\x00\x00\x00\rIHDR"
                b"\x00\x00\x00\x01\x00\x00\x00\x01"
                b"\x08\x06\x00\x00\x00"
                b"\x1f\x15\xc4\x89"
                b"\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
                b"\x0d\n-\xb4"
                b"\x00\x00\x00\x00IEND\xaeB`\x82"
            )
    except Exception as e:
        print(f"[WARN] Mock PNG létrehozás sikertelen: {e}")


# --- Fő kép generáló függvény ---
def generate_image_asset(
    *,
    prompt: Optional[str],
    page_id: str,
    seed: Optional[int] = None,
    prompt_key: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
    style_profile: Optional[Dict[str, Any]] = None,
    cache: bool = True,
    fmt: str = "png",
    reuse_existing: bool = True,
    api_key: Optional[str] = None,
    mode: str = "draft",  # "draft" | "refine"
    story_slug: Optional[str] = None,      # ⬅️ ÚJ: közvetlen slug
    story_src: Optional[str] = None,       # ⬅️ ÚJ: ha slug nincs, ebből képezünk
) -> Dict[str, Any]:
    """
    Fő belépési pont a main.py (vagy más) számára, draft/refine támogatással.
    A képek 'generated/images/<story_slug>/' alá kerülnek. Ha nincs megadva
    story_slug, a story_src alapján képezünk, különben 'default'.
    """
    started = time.perf_counter()
    params = params or {}
    style_profile = style_profile or {}

    # fmt default a konfigból is jöhet
    fmt = (fmt or _DEFAULT_FMT or "png").lower()
    if fmt not in ("png", "jpg", "jpeg", "webp"):
        fmt = "png"

    # Mode alapján default paraméterek + konfig felülírás
    default_params = {
        "draft": {"width": 512, "height": 768, "steps": 12, "cfg": 3.5},
        "refine": {"width": 768, "height": 1152, "steps": 28, "cfg": 6.5},
    }
    if "draft" in _IMAGE_PARAMS and isinstance(_IMAGE_PARAMS["draft"], dict):
        default_params["draft"].update(_IMAGE_PARAMS["draft"])
    if "refine" in _IMAGE_PARAMS and isinstance(_IMAGE_PARAMS["refine"], dict):
        default_params["refine"].update(_IMAGE_PARAMS["refine"])

    for k, v in default_params.get(mode, {}).items():
        params.setdefault(k, v)

    # PromptKey előállítás
    pk = _compute_prompt_key(prompt, {**params, "mode": mode}, style_profile, prompt_key)

    # Story slug kinyerés
    effective_slug = story_slug or _slugify(story_src)

    # Fájlnév (story-szeparált)
    out_file = _build_filename(page_id, pk, seed, fmt, story_slug=effective_slug)
    out_rel = os.path.relpath(out_file).replace("\\", "/")
    out_url = f"/{out_rel}" if not out_rel.startswith("/") else out_rel

    # Cache ellenőrzés
    if ENABLE_IMAGE_CACHE and cache and os.path.exists(out_file):
        duration_ms = int((time.perf_counter() - started) * 1000)
        meta = {
            "pageId": page_id,
            "promptKey": pk,
            "seed": seed,
            "mode": mode,
            "cacheHit": True,
            "durationMs": duration_ms,
            "flags": {
                "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
                "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
            },
            "source": "cache",
            "storySlug": effective_slug,
        }
        _write_sidecar_meta(out_file, {
            **meta,
            "prompt": prompt,
            "params": params,
            "styleProfile": style_profile,
        })
        _log({"event": "image.cache_hit", **meta, "path": out_url})
        return {
            "path": out_url,
            "seed": seed,
            "cacheHit": True,
            "promptKey": pk,
            "mode": mode,
            "storySlug": effective_slug,
        }

    # Ha nincs cache találat → generálás (mock)
    _ensure_min_png(out_file)

    duration_ms = int((time.perf_counter() - started) * 1000)
    meta_write = {
        "pageId": page_id,
        "promptKey": pk,
        "seed": seed,
        "mode": mode,
        "cacheHit": False,
        "durationMs": duration_ms,
        "flags": {
            "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
            "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
        },
        "source": "generated",
        "path": out_url,
        "prompt": prompt,
        "params": params,
        "styleProfile": style_profile,
        "storySlug": effective_slug,
    }
    _write_sidecar_meta(out_file, meta_write)
    _log({"event": "image.generated", **meta_write})

    return {
        "path": out_url,
        "seed": seed,
        "cacheHit": False,
        "promptKey": pk,
        "mode": mode,
        "storySlug": effective_slug,
    }

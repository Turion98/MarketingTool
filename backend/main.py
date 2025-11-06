
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import json
import os
import shutil
import traceback
from datetime import datetime, timedelta
from dotenv import load_dotenv
from copy import deepcopy
from fastapi.responses import HTMLResponse, Response, JSONResponse, StreamingResponse
import re
from pathlib import Path

# Optional modules
from email_utils import send_mail_with_pdf
from report_scheduler import load_settings, save_settings, start_scheduler, set_generate_cb
from models.report_settings import ReportSettings
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Body

# ✅ Unified cache imports
from cache import load_story_cached, get_page_cached, was_last_page_hit, clear_caches as clear_all_caches

# Routers
from feedback_routes import router as feedback_router
from storysvc.router import router as stories_router   
from router.white_label import router as white_label_router  # <-- EZ KELL

from auth_admin import get_admin
from routers.admin import router as admin_router

from fastapi import File
from fastapi.responses import FileResponse

from dotenv import load_dotenv
load_dotenv()

# --- ezek a többi import után jöhetnek ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Alap biztonsági headerek (CSP-t a Next.js adja a webappra)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "geolocation=()")
        # HSTS csak ha HTTPS mögött futsz (Cloudflare alatt később edge-en is bekapcsoljuk)
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains; preload"
        )
        return response


print("=== Backend indul ===")

# --- .env betöltése ---
load_dotenv()
print("ENV betöltve.")

# --- Feature flagek ---
ENABLE_IMAGE_CACHE = os.getenv("ENABLE_IMAGE_CACHE", "true").lower() == "true"
ENABLE_IMAGE_PRELOAD = os.getenv("ENABLE_IMAGE_PRELOAD", "true").lower() == "true"
print(f"ENABLE_IMAGE_CACHE={ENABLE_IMAGE_CACHE}, ENABLE_IMAGE_PRELOAD={ENABLE_IMAGE_PRELOAD}")

# --- Opcionális modulok betöltése ---
try:
    from generate_image import generate_image_asset
    HAS_IMAGE_BACKEND = True
    print("generate_image_asset sikeresen betöltve.")
except Exception:
    generate_image_asset = None
    HAS_IMAGE_BACKEND = False
    print("generate_image_asset betöltési hiba:")
    traceback.print_exc()

try:
    from generate_voice import generate_voice_asset
    HAS_VOICE_BACKEND = True
    print("generate_voice_asset sikeresen betöltve.")
except Exception:
    generate_voice_asset = None
    HAS_VOICE_BACKEND = False
    print("generate_voice_asset betöltési hiba:")
    traceback.print_exc()

# --- Mappák biztosítása ---
os.makedirs("generated/images", exist_ok=True)
os.makedirs("generated/audio", exist_ok=True)

# (Opcionális) feedback mentési könyvtár előkészítése, ha be van állítva
FEEDBACK_DIR = os.getenv("FEEDBACK_DIR")
if FEEDBACK_DIR:
    os.makedirs(FEEDBACK_DIR, exist_ok=True)

# --- Story könyvtár és default beállítások ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
STORIES_DIR = os.path.abspath(os.getenv("STORIES_DIR", os.path.join(BASE_DIR, "stories")))
DEFAULT_STORY = os.getenv("DEFAULT_STORY", "global.json")  # kompatibilitás az eddigivel

os.makedirs(STORIES_DIR, exist_ok=True)
os.environ.setdefault("STORIES_DIR", STORIES_DIR)

def _normalize_src_to_path(src: str | None) -> str:
    """
    A frontend által küldött src (pl. '/stories/Erodv2_analytics.json')
    biztonságosan feloldva a backend STORIES_DIR alá.
    """
    if not src:
        fname = DEFAULT_STORY
    else:
        s = str(src).strip().replace("\\", "/")
        if s.startswith("http://") or s.startswith("https://"):
            raise HTTPException(status_code=400, detail="Távoli src nem engedélyezett")
        if s.startswith("/"):
            s = s[1:]
        if s.startswith("stories/"):
            s = s[len("stories/"):]
        if not s.endswith(".json"):
            s += ".json"
        fname = s

    path = os.path.abspath(os.path.join(STORIES_DIR, fname))
    # path traversal védelem
    if not path.startswith(STORIES_DIR):
        raise HTTPException(status_code=400, detail="Érvénytelen src elérési út")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Story fájl nem található: {fname}")
    return path

# ✅ Use TTL cache-backed loader (no lru_cache)
def _load_story(path: str) -> Dict[str, Any]:
    return load_story_cached(path)

# --- SFX overrides betöltése ---
SFX_OVERRIDES_FILE = "sfxOverrides.json"
SFX_OVERRIDES: Dict[str, List[Dict[str, Any]]] = {}
if os.path.exists(SFX_OVERRIDES_FILE):
    try:
        with open(SFX_OVERRIDES_FILE, "r", encoding="utf-8") as f:
            SFX_OVERRIDES = json.load(f)
        print(f"sfxOverrides.json betöltve ({len(SFX_OVERRIDES)} oldal).")
    except Exception:
        print("sfxOverrides.json betöltési hiba:")
        traceback.print_exc()
else:
    print("sfxOverrides.json nem található – SFX override nélkül futunk.")

def _normalize_sfx_list(items: Any) -> List[Dict[str, Any]]:
    """Fájlprefix normalizálás + time ms egységesítés (int)."""
    if not isinstance(items, list):
        return []
    out: List[Dict[str, Any]] = []
    for s in items:
        if not isinstance(s, dict):
            continue
        file = s.get("file")
        time = s.get("time")
        if not file or time is None:
            continue
        if not (isinstance(file, str) and len(file) > 0):
            continue
        # prefix 'sfx/' ha hiányzik
        if not (file.startswith("sfx/") or file.startswith("/assets/sfx/")):
            file = f"sfx/{file}" if not file.startswith("/") else file.lstrip("/")
            if not file.startswith("sfx/"):
                file = f"sfx/{file}"
        # time -> int ms
        try:
            time_ms = int(round(float(time)))
        except Exception:
            continue
        out.append({"file": file, "time": time_ms})
    return out

def _apply_sfx_overrides(page: Dict[str, Any]) -> Dict[str, Any]:
    """Visszaad egy ÚJ dict-et SFX override-olva/normalizálva."""
    page_out = deepcopy(page)
    pid = page_out.get("id")
    page_sfx = page_out.get("sfx")
    if isinstance(page_sfx, list) and len(page_sfx) > 0:
        page_out["sfx"] = _normalize_sfx_list(page_sfx)
    else:
        ov = SFX_OVERRIDES.get(pid)
        page_out["sfx"] = _normalize_sfx_list(ov) if ov else []
    return page_out

# --- Egyszerű logoló JSONL-be ---
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "gen_events.jsonl")

def log_jsonl(event: Dict[str, Any]) -> None:
    event["ts"] = datetime.utcnow().isoformat() + "Z"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as lf:
            lf.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception as e:
        print("Logolási hiba:", e)

def _normalize_prompt_incoming(p: Any) -> str:
    """
    A frontend küldhet objektumot is:
    {
      "global": "...",
      "chapter": "...",
      "page": "...",
      "combinedPrompt": "...",
      "negativePrompt": "..."
    }
    Itt egyetlen stringgé lapítjuk, hogy a generate_image_asset mindig stringet kapjon.
    """
    if p is None:
        return ""
    if isinstance(p, str):
        return p.strip()
    if isinstance(p, dict):
        # 1. ha van combinedPrompt → ezt használjuk
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
    # bármi más
    return str(p).strip()

# =========================
#   FRAGMENTS KEZELÉS
# =========================

def _collect_fragment_ids_from_text(text: Any) -> set[str]:
    ids: set[str] = set()
    if isinstance(text, list):
        for it in text:
            if isinstance(it, dict):
                # ifUnlocked kulcs
                if it.get("ifUnlocked"):
                    ids.add(str(it["ifUnlocked"]))
                # default / text mezőkben inline {fragment:ID} tokenek
                for key in ("default", "text"):
                    t = it.get(key)
                    if isinstance(t, str):
                        ids.update(re.findall(r"\{fragment:([\w\-]+)\}", t))
    elif isinstance(text, str):
        ids.update(re.findall(r"\{fragment:([\w\-]+)\}", text))
    return ids

def _collect_fragment_ids(page: Dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    # fragmentRefs tömb
    refs = page.get("fragmentRefs")
    if isinstance(refs, list):
        for r in refs:
            if isinstance(r, dict) and r.get("id"):
                ids.add(str(r["id"]))
    # text-ben inline tokenek és ifUnlocked-ek
    ids |= _collect_fragment_ids_from_text(page.get("text"))
    return ids

def _inject_fragments_global_for(story: Dict[str, Any], page: Dict[str, Any]) -> Dict[str, Any]:
    """Csak a szükséges fragmenseket injektálja a válaszba fragmentsGlobal alatt."""
    out = deepcopy(page)
    fr_all = story.get("fragments", {})
    if isinstance(fr_all, dict) and fr_all:
        need = _collect_fragment_ids(page)
        if need:
            out["fragmentsGlobal"] = {fid: fr_all[fid] for fid in need if fid in fr_all}
    return out

# =========================
#   ANALYTICS TÁR (JSONL)
# =========================

ANALYTICS_DIR = os.path.abspath(os.getenv("ANALYTICS_DIR", os.path.join(BASE_DIR, "analytics")))
os.makedirs(ANALYTICS_DIR, exist_ok=True)

def _story_analytics_dir(story_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", story_id).strip("_") or "unknown"
    d = os.path.join(ANALYTICS_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d

class AnalyticsEventModel(BaseModel):
    id: str
    t: str
    ts: int
    storyId: str
    sessionId: str
    pageId: Optional[str] = None
    refPageId: Optional[str] = None
    props: Optional[Dict[str, Any]] = None

class AnalyticsBatch(BaseModel):
    storyId: str
    userId: Optional[str] = None
    device: Optional[Dict[str, Any]] = None  # opcionális kliens meta
    events: List[AnalyticsEventModel]

# --- App és CORS ---
app = FastAPI()

class NoCacheStoriesMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path or ""
        if path.startswith("/stories/") or path.startswith("/page/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheStoriesMiddleware)
app.add_middleware(NoCacheStoriesMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.get("/api/story")
def get_story(src: str = Query(default="story.json")):
    base = os.path.join("data", os.path.basename(src))
    if not os.path.exists(base):
        return {"error": f"Story file {src} not found"}
    with open(base, "r", encoding="utf-8") as f:
        return json.load(f)

# --- CORS: engedjük a WL root alatt a wildcardot is ---
WL_ROOT = os.getenv("WL_ROOT_DOMAIN", "wl.localhost").replace(".", r"\.")  # pl. "wl.yoursaas.com" -> "wl\.yoursaas\.com"
DEV_HOST = os.getenv("DEV_HOST", "azenc.local").replace(".", r"\.")

app.add_middleware(
    CORSMiddleware,
   allow_origin_regex=rf"^https?://([a-z0-9\-]+\.)?({WL_ROOT}|{DEV_HOST}|localhost|127\.0\.0\.1)(:\d+)?$",

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


# Biztosítsunk OPTIONS választ bármely végpontra
@app.options("/{rest_of_path:path}")
def any_options(rest_of_path: str):
    return Response(status_code=204)

# --- Routerek bekötése ---
app.include_router(feedback_router, prefix="/api")
app.include_router(stories_router, prefix="/api")
app.include_router(white_label_router) 
app.include_router(admin_router) 
# --- Statikus mappák ---
if os.path.isdir("assets"):
    app.mount("/assets", StaticFiles(directory="assets"), name="assets")
if os.path.isdir("generated"):
    app.mount("/generated", StaticFiles(directory="generated"), name="generated")
if os.path.isdir("generated/audio"):
    app.mount("/generated/audio", StaticFiles(directory="generated/audio"), name="generated-audio")
if os.path.isdir(STORIES_DIR):
    app.mount("/stories", StaticFiles(directory=STORIES_DIR), name="stories")

# --- Health ---
@app.get("/health")
def health():
    sfx_dir = os.path.join("assets", "sfx")
    return {
        "ok": True,
        "imageBackend": HAS_IMAGE_BACKEND,
        "voiceBackend": HAS_VOICE_BACKEND,
        "flags": {
            "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
            "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD
        },
        "storiesDir": STORIES_DIR,
        "defaultStory": DEFAULT_STORY,
        "mockVoiceAvailable": os.path.exists("assets/mock_voice.mp3"),
        "generatedAudioDirExists": os.path.isdir("generated/audio"),
        "sfxCount": len(os.listdir(sfx_dir)) if os.path.isdir(sfx_dir) else 0
    }

from fastapi import Request

@app.post("/api/generate-image")
async def api_generate_image(req: Request):
    if not HAS_IMAGE_BACKEND:
        raise HTTPException(status_code=500, detail="Image backend not loaded")

    body = await req.json()
    page_id = body.get("pageId") or body.get("page_id") or "page"

    # 🔽 ITT LAPOSÍTJUK MÁR A BELÉPÉSKOR
    raw_prompt = body.get("prompt") or None
    prompt = _normalize_prompt_incoming(raw_prompt)

    params = body.get("params") or {}
    style = body.get("styleProfile") or {}
    mode = body.get("mode") or "draft"
    api_key = body.get("apiKey") or None
    story_slug = body.get("storySlug") or body.get("storyId") or None
    reuse = body.get("reuseExisting", True)
    fmt = body.get("format", "png")

    try:
        res = generate_image_asset(
            prompt=prompt,               # ← már a laposított megy be
            page_id=page_id,
            params=params,
            style_profile=style,
            cache=True,
            fmt=fmt,
            reuse_existing=reuse,
            api_key=api_key,
            mode=mode,
            story_slug=story_slug,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"ok": True, "url": res.get("url"), "path": res.get("path")}

from pathlib import Path


@app.get("/api/image/{story_slug}/{image_name}")
def get_generated_image(story_slug: str, image_name: str):
    """
    Frontend proxy kompatibilitás: /api/image/<story>/<file.png>
    → kiszolgáljuk a /generated/images/<story>/<file.png>-t
    """
    base = Path("generated") / "images" / story_slug / image_name
    if not base.exists():
      # lehet, hogy a JSON sidecar kellene
      raise HTTPException(status_code=404, detail="Image not found")

      # 🔽 IDE jön a CORS header hozzáadása
    resp = FileResponse(str(base), media_type="image/png")
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp

    # content type-et adhatunk fixen is
    return FileResponse(str(base), media_type="image/png")

# --- Landing endpoint (API) ---
@app.get("/api/landing")
def get_landing(src: str | None = None):
    if src:
        story_path = _normalize_src_to_path(src)
        data = _load_story(story_path)
        if isinstance(data, dict) and "landing" in data:
            return data["landing"]

    default_path = _normalize_src_to_path(DEFAULT_STORY)
    default = _load_story(default_path)
    if isinstance(default, dict) and "landing" in default:
        return default["landing"]

    raise HTTPException(status_code=404, detail="Landing not found in default story")

# --- Publikus endpoint a teljes bankhoz (frontend init/fallback) ---
@app.get("/fragments")
def get_fragments(src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)
    fr = story.get("fragments", {})
    if not isinstance(fr, dict):
        return {}
    return fr

# --- Landing endpoint (publikus) ---
@app.get("/landing")
def get_landing_public(src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)
    if "landing" not in story:
        raise HTTPException(status_code=404, detail="Landing not found")
    # Landinget nem override-oljuk SFX-szel, de injektáljuk a szükséges fragmenteket
    return _inject_fragments_global_for(story, story["landing"])

# --- Rekurzív kereső a story-ban ---
def _find_page_recursive(node: Any, page_id: str) -> Dict[str, Any] | None:
    if isinstance(node, dict):
        # Ha ez maga egy oldal
        if node.get("id") == page_id:
            if any(k in node for k in ("type", "text", "choices", "imagePrompt", "audio", "transition")):
                return node

        # Először 'pages' tömb, ha van
        pages = node.get("pages")
        if isinstance(pages, list):
            for it in pages:
                found = _find_page_recursive(it, page_id)
                if found:
                    return found

        # Egyéb kulcsok bejárása
        for v in node.values():
            if isinstance(v, (dict, list)):
                found = _find_page_recursive(v, page_id)
                if found:
                    return found

    elif isinstance(node, list):
        for it in node:
            found = _find_page_recursive(it, page_id)
            if found:
                return found

    return None

@app.post("/api/testVoice")
def test_voice(): return {"ok": True}

@app.post("/api/testImage")
def test_image(): return {"ok": True}

# --- Page endpoint (✅ cached final response) ---
@app.get("/page/{page_id}")
def get_page(page_id: str, src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)

    def _build_page_response_for(page_obj: Dict[str, Any]) -> Dict[str, Any]:
        # 1) SFX normalize / override, 2) fragmentsGlobal injektálás
        p = _apply_sfx_overrides(page_obj)
        return _inject_fragments_global_for(story, p)

    # 1) Globális "pages" dict kezelés (ha van ilyen)
    if "pages" in story and isinstance(story["pages"], dict) and page_id in story["pages"]:
        def _builder():
            return _build_page_response_for(story["pages"][page_id])
        data = get_page_cached(story_path, page_id, _builder)
        hit = was_last_page_hit()
        resp = JSONResponse(content=data)
        if hit is not None:
            resp.headers["X-Backend-Cache"] = "HIT" if hit else "MISS"
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp

    # 2) Teljes story rekurzív bejárása (beágyazott fejezetekhez is)
    page = _find_page_recursive(story, page_id)
    if page:
        def _builder():
            return _build_page_response_for(page)
        data = get_page_cached(story_path, page_id, _builder)
        hit = was_last_page_hit()
        resp = JSONResponse(content=data)
        if hit is not None:
            resp.headers["X-Backend-Cache"] = "HIT" if hit else "MISS"
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp

    # 3) Nincs találat
    raise HTTPException(status_code=404, detail=f"Page {page_id} not found")

# --- Cache clear külön endpoint (az elérhetetlen kódrészből átemelve) ---
@app.post("/api/cache/clear")
def clear_cache():
    try:
        for subdir in ["generated/images", "generated/audio"]:
            if os.path.isdir(subdir):
                shutil.rmtree(subdir)
                os.makedirs(subdir, exist_ok=True)
        clear_all_caches()
        return {"ok": True, "message": "Cache cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
#   ANALYTICS ENDPOINTOK
# =========================

@app.post("/api/analytics/batch")
def post_analytics_batch(batch: AnalyticsBatch):
    try:
        story_dir = _story_analytics_dir(batch.storyId)
        ts_ms = batch.events[0].ts if batch.events else int(datetime.utcnow().timestamp() * 1000)
        day = datetime.utcfromtimestamp(ts_ms / 1000.0).strftime("%Y-%m-%d")
        out_path = os.path.join(story_dir, f"{day}.jsonl")

        with open(out_path, "a", encoding="utf-8") as f:
            header = {
                "_type": "batch_header",
                "ts": datetime.utcnow().isoformat() + "Z",
                "storyId": batch.storyId,
                "userId": batch.userId,
                "device": batch.device or {},
                "count": len(batch.events),
            }
            f.write(json.dumps(header, ensure_ascii=False) + "\n")
            for e in batch.events:
                f.write(json.dumps(e.dict(), ensure_ascii=False) + "\n")

        return {"ok": True, "written": len(batch.events), "file": f"{batch.storyId}/{day}.jsonl"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/days")
def list_analytics_days(storyId: str):
    d = _story_analytics_dir(storyId)
    files = sorted([f for f in os.listdir(d) if f.endswith(".jsonl")])
    days = [f[:-6] for f in files]  # levágjuk a ".jsonl"-t
    return {"storyId": storyId, "days": days}

@app.get("/api/analytics/day")
def get_analytics_day(storyId: str, day: str):
    d = _story_analytics_dir(storyId)
    path = os.path.join(d, f"{day}.jsonl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")
    with open(path, "r", encoding="utf-8") as f:
        return {"storyId": storyId, "day": day, "lines": f.read().splitlines()}

@app.get("/api/analytics/rollup")
def rollup_day(storyId: str, day: str):
    d = _story_analytics_dir(storyId)
    path = os.path.join(d, f"{day}.jsonl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")

    sessions = set()
    users = set()
    pages = set()
    counters = {
        "pageViews": 0,
        "choices": 0,
        "puzzles": {"tries": 0, "solved": 0},
        "runes": 0,
        "mediaStarts": 0,
        "mediaStops": 0,
        "completions": 0,
    }
    pageViews: Dict[str, int] = {}

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("_type") == "batch_header":
                uid = obj.get("userId")
                if uid:
                    users.add(str(uid))
                continue

            t = obj.get("t")
            sessionId = obj.get("sessionId")
            pageId = obj.get("pageId")
            props = obj.get("props") or {}

            if sessionId:
                sessions.add(sessionId)
            if pageId:
                pages.add(pageId)

            if t == "page_enter":
                counters["pageViews"] += 1
                if pageId:
                    pageViews[pageId] = pageViews.get(pageId, 0) + 1
            elif t == "choice_select":
                counters["choices"] += 1
            elif t == "puzzle_try":
                counters["puzzles"]["tries"] += 1
            elif t == "puzzle_result":
                if props.get("isCorrect"):
                    counters["puzzles"]["solved"] += 1
            elif t == "rune_unlock":
                counters["runes"] += 1
            elif t == "media_start":
                counters["mediaStarts"] += 1
            elif t == "media_stop":
                counters["mediaStops"] += 1
            elif t in ("game_complete", "game:complete"):
                counters["completions"] += 1

            uid = props.get("userId")
            if uid:
                users.add(str(uid))

    topPages = sorted(pageViews.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return {
        "storyId": storyId,
        "day": day,
        "sessions": len(sessions),
        "users": len(users),
        "pages": len(pages),
        "totals": counters,
        "topPages": [{"pageId": k, "views": v} for k, v in topPages],
    }

def _daterange(start_date: datetime, end_date: datetime):
    cur = start_date
    while cur <= end_date:
        yield cur
        cur = cur + timedelta(days=1)

def _safe_parse_jsonl_line(line: str) -> Optional[Dict[str, Any]]:
    line = (line or "").strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except Exception:
        return None

@app.get("/api/analytics/rollup-range")
def rollup_range(
    storyId: str,
    _from: str = Query(..., alias="from"),
    _to: str = Query(..., alias="to"),
    terminal: Optional[str] = Query(default=None, description="Vesszővel elválasztott terminal pageId lista"),
):
    d = _story_analytics_dir(storyId)
    try:
        start = datetime.strptime(_from, "%Y-%m-%d")
        end   = datetime.strptime(_to, "%Y-%m-%d")
        if end < start:
            raise HTTPException(status_code=400, detail="'to' korábbi mint 'from'")
    except ValueError:
        raise HTTPException(status_code=400, detail="Dátum formátum: YYYY-MM-DD")

    terminal_pages: set[str] = set()
    if terminal:
        terminal_pages = {p.strip() for p in terminal.split(",") if p.strip()}

    users_all: set[str] = set()
    sessions_all: set[str] = set()
    dau: Dict[str, Dict[str, set]] = {}
    totals = {
        "pageViews": 0,
        "choices": 0,
        "puzzles": {"tries": 0, "solved": 0},
        "runes": 0,
        "mediaStarts": 0,
        "mediaStops": 0,
    }

    per_session_events: Dict[str, List[Dict[str, Any]]] = {}
    page_views: Dict[str, int] = {}
    page_sessions: Dict[str, set] = {}
    choice_counts: Dict[str, Dict[str, int]] = {}

    for day_dt in _daterange(start, end):
        day = day_dt.strftime("%Y-%m-%d")
        path = os.path.join(d, f"{day}.jsonl")
        if not os.path.exists(path):
            continue

        dau.setdefault(day, {"users": set(), "sessions": set()})

        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                obj = _safe_parse_jsonl_line(raw)
                if not obj:
                    continue

                if obj.get("_type") == "batch_header":
                    uid = obj.get("userId")
                    if uid:
                        users_all.add(str(uid))
                        dau[day]["users"].add(str(uid))
                    continue

                t = obj.get("t")
                ts = obj.get("ts")
                sid = obj.get("sessionId")
                pid = obj.get("pageId")
                props = obj.get("props") or {}

                if sid:
                    sessions_all.add(sid)
                    dau[day]["sessions"].add(sid)

                if t == "page_enter":
                    totals["pageViews"] += 1
                    if pid:
                        page_views[pid] = page_views.get(pid, 0) + 1
                        page_sessions.setdefault(pid, set()).add(sid or f"__nosession_{ts}")
                elif t == "choice_select":
                    totals["choices"] += 1
                    cid = str(props.get("choiceId") or props.get("id") or "")
                    if pid and cid:
                        choice_counts.setdefault(pid, {})
                        choice_counts[pid][cid] = choice_counts[pid].get(cid, 0) + 1
                elif t == "puzzle_try":
                    totals["puzzles"]["tries"] += 1
                elif t == "puzzle_result":
                    if props.get("isCorrect"):
                        totals["puzzles"]["solved"] += 1
                elif t == "rune_unlock":
                    totals["runes"] += 1
                elif t == "media_start":
                    totals["mediaStarts"] += 1
                elif t == "media_stop":
                    totals["mediaStops"] += 1

                uid2 = props.get("userId")
                if uid2:
                    users_all.add(str(uid2))
                    dau[day]["users"].add(str(uid2))

                if sid:
                    per_session_events.setdefault(sid, []).append({
                        "t": t, "ts": ts, "pageId": pid, "props": props, "day": day
                    })

    completed_sessions = 0
    total_session_duration = 0
    exits_after_page: Dict[str, int] = {}

    for sid, evs in per_session_events.items():
        if not evs:
            continue
        evs.sort(key=lambda e: (e.get("ts") or 0, e.get("t") or ""))

        first_ts = evs[0].get("ts") or 0
        last_ts  = evs[-1].get("ts") or first_ts
        if isinstance(first_ts, str):
            try: first_ts = int(first_ts)
            except: first_ts = 0
        if isinstance(last_ts, str):
            try: last_ts = int(last_ts)
            except: last_ts = first_ts

        total_session_duration += max(0, last_ts - first_ts)

        has_complete_event = any(e.get("t") in ("game_complete", "game:complete") for e in evs)

        saw_terminal = False
        if terminal_pages:
            for e in evs:
                if (e.get("t") == "page_enter") and (e.get("pageId") in terminal_pages):
                    saw_terminal = True
                    break

        if has_complete_event or saw_terminal:
            completed_sessions += 1

        last_page_enter = None
        for e in reversed(evs):
            if e.get("t") == "page_enter" and e.get("pageId"):
                last_page_enter = e.get("pageId")
                break
        if last_page_enter:
            exits_after_page[last_page_enter] = exits_after_page.get(last_page_enter, 0) + 1

    session_count = len(sessions_all)
    user_count = len(users_all)

    avg_session_ms = int(round(total_session_duration / session_count)) if session_count else 0
    completion_rate = (completed_sessions / session_count) if session_count else 0.0
    puzzle_success_rate = (
        (totals["puzzles"]["solved"] / totals["puzzles"]["tries"])
        if totals["puzzles"]["tries"] > 0 else 0.0
    )

    dau_series = []
    for day in sorted(dau.keys()):
        dau_series.append({
            "day": day,
            "users": len(dau[day]["users"]),
            "sessions": len(dau[day]["sessions"]),
        })

    pages_out = []
    for pid, views in sorted(page_views.items(), key=lambda kv: kv[1], reverse=True):
        uniq = len(page_sessions.get(pid, set()))
        exits = exits_after_page.get(pid, 0)
        exitRate = (exits / uniq) if uniq else 0.0
        pages_out.append({
            "pageId": pid,
            "views": views,
            "uniqueSessions": uniq,
            "exitsAfterPage": exits,
            "exitRate": round(exitRate, 4),
        })

    choices_out = []
    for pid, counters in choice_counts.items():
        choices_out.append({
            "pageId": pid,
            "choices": [{"choiceId": cid, "count": n} for cid, n in sorted(counters.items(), key=lambda kv: kv[1], reverse=True)]
        })

    return {
        "storyId": storyId,
        "from": _from,
        "to": _to,
        "sessions": session_count,
        "users": user_count,
        "totals": totals,
        "kpis": {
            "completionRate": round(completion_rate, 4),
            "avgSessionDurationMs": avg_session_ms,
            "puzzleSuccessRate": round(puzzle_success_rate, 4),
        },
        "dau": dau_series,
        "pages": pages_out,
        "choices": choices_out,
        "notes": {
            "completion": "Ha nincs game_complete event, a 'terminal' query param listát használjuk.",
            "exitAfterPage": "Az adott időszakban sessionönként az utolsó page_enter oldalt számoljuk exitként.",
        }
    }


# =========================
#   TOKEN + EXPORT (HTML/JSON/PDF)
# =========================
import base64, hmac, hashlib, time
from urllib.parse import quote

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def _unb64url(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def sign_token(payload: dict, ttl_seconds: int = 7*24*3600) -> str:
    data = {
        **payload,
        "iat": int(time.time()),
        "exp": int(time.time()) + int(ttl_seconds),
    }
    body = _b64url(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(SECRET_KEY.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return body + "." + _b64url(sig)

def verify_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
        expect = _b64url(hmac.new(SECRET_KEY.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest())
        if not hmac.compare_digest(expect, sig):
            raise HTTPException(status_code=401, detail="Invalid token signature")
        payload = json.loads(_unb64url(body).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise HTTPException(status_code=401, detail="Token expired")
        return payload
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/api/analytics/export_token")
def get_export_token(
    storyId: str,
    days: int = 7,
    secret: str = Query(..., description="DEV clear secret for token issuance"),
):
    if secret != os.getenv("DEV_CLEAR_SECRET", "KAB1T05Z3r!25"):
        raise HTTPException(status_code=401, detail="Invalid secret")
    ttl = max(1, min(int(days), 90)) * 24 * 3600
    token = sign_token({"storyId": storyId}, ttl_seconds=ttl)
    return {"ok": True, "token": token, "validDays": days}

def _resolve_range(range_: str | None, _from: str | None, _to: str | None):
    today = datetime.utcnow().date()
    if range_ in ("last7d", "7d"):
        start = today - timedelta(days=6)
        end = today
    elif range_ in ("last30d", "30d"):
        start = today - timedelta(days=29)
        end = today
    elif _from and _to:
        start = datetime.strptime(_from, "%Y-%m-%d").date()
        end = datetime.strptime(_to, "%Y-%m-%d").date()
    else:
        start = today - timedelta(days=6)
        end = today
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")

def _format_pct(x: float) -> str:
    try:
        return f"{x*100:.1f}%"
    except:
        return "0.0%"

def _ms_to_hms(ms: int) -> str:
    s = int(ms // 1000)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    out = []
    if h: out.append(f"{h}h")
    out.append(f"{m}m")
    if sec: out.append(f"{sec}s")
    return " ".join(out)

def _build_html_report(roll: dict, logo_url: str | None = None) -> str:
    dau_labels = [d["day"] for d in roll.get("dau", [])]
    dau_users = [d["users"] for d in roll.get("dau", [])]
    dau_sessions = [d["sessions"] for d in roll.get("dau", [])]
    pages = roll.get("pages", [])
    top_dropout = sorted(pages, key=lambda x: x.get("exitRate", 0), reverse=True)[:5]

    k = roll.get("kpis", {})
    totals = roll.get("totals", {})
    logo_html = f'<img src="{logo_url}" alt="logo" style="height:42px;margin-right:12px;border-radius:6px;" />' if logo_url else ""

    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Report – {roll.get('storyId')}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body{{background:#0f0f11;color:#eee;font:14px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial}}
  .wrap{{max-width:980px;margin:24px auto;padding:16px}}
  .header{{display:flex;align-items:center;gap:12px;margin-bottom:16px}}
  h1{{font-size:20px;margin:0}}
  .kpi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}}
  .kpi{{background:#17171a;border:1px solid #2a2a2f;padding:12px;border-radius:12px}}
  .kpi .lbl{{opacity:.8;font-size:12px}}
  .kpi .val{{font-size:20px;font-weight:700;margin-top:4px}}
  .sect{{margin:18px 0}}
  .card{{background:#17171a;border:1px solid #2a2a2f;padding:12px;border-radius:12px;margin:12px 0}}
  table{{width:100%;border-collapse:collapse}}
  th,td{{border-bottom:1px solid #2a2a2f;padding:6px 8px;text-align:left}}
  .muted{{opacity:.8}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">{logo_html}<div><h1>Campaign Report – {roll.get('storyId')}</h1>
  <div class="muted">{roll.get('from')} → {roll.get('to')}</div></div></div>

  <div class="kpi-grid">
    <div class="kpi"><div class="lbl">Users (period)</div><div class="val">{roll.get('users',0)}</div></div>
    <div class="kpi"><div class="lbl">Sessions (period)</div><div class="val">{roll.get('sessions',0)}</div></div>
    <div class="kpi"><div class="lbl">Completion rate</div><div class="val">{_format_pct(k.get('completionRate',0))}</div></div>
    <div class="kpi"><div class="lbl">Avg session</div><div class="val">{_ms_to_hms(k.get('avgSessionDurationMs',0))}</div></div>
    <div class="kpi"><div class="lbl">Puzzle success</div><div class="val">{_format_pct(k.get('puzzleSuccessRate',0))}</div></div>
  </div>

  <div class="sect card">
    <h3 style="margin:0 0 8px">DAU trend</h3>
    <canvas id="dau"></canvas>
  </div>

  <div class="sect">
    <div class="card">
      <h3 style="margin:0 0 8px">Top dropout pages</h3>
      <table>
        <thead><tr><th>Page</th><th>Unique sessions</th><th>Exits</th><th>Exit rate</th></tr></thead>
        <tbody>
          {''.join(f"<tr><td>{quote(p.get('pageId',''))}</td><td>{p.get('uniqueSessions',0)}</td><td>{p.get('exitsAfterPage',0)}</td><td>{_format_pct(p.get('exitRate',0))}</td></tr>" for p in top_dropout)}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">Totals</h3>
      <table>
        <tbody>
          <tr><td>Page views</td><td>{totals.get('pageViews',0)}</td></tr>
          <tr><td>Choices</td><td>{totals.get('choices',0)}</td></tr>
          <tr><td>Puzzle tries</td><td>{(totals.get('puzzles') or {}).get('tries', 0)}</td></tr>
          <tr><td>Puzzle solved</td><td>{(totals.get('puzzles') or {}).get('solved', 0)}</td></tr>
          <tr><td>Runes</td><td>{totals.get('runes',0)}</td></tr>
          <tr><td>Media starts</td><td>{totals.get('mediaStarts',0)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
const lbls = {json.dumps([d for d in []])};
const ctx = document.getElementById('dau').getContext('2d');
</script>
</body>
</html>"""
    return html

# --- Playwright alapú PDF export ---
HAS_PDF = True
def html_to_pdf_bytes(html_str: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_str, wait_until="networkidle")
        pdf = page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "12mm", "right": "12mm", "bottom": "12mm", "left": "12mm"}
        )
        browser.close()
        return pdf

# --- Közös helper: riport -> PDF (scheduler és endpoint is ezt hívja) ---
def export_report_html_pdf(
    storyId: str,
    rangeSpec: str = "last7d",
    _from: str | None = None,
    _to: str | None = None,
    terminal: str | None = None
) -> tuple[bytes, str, str]:
    f, t = _resolve_range(rangeSpec, _from, _to)
    roll = rollup_range(storyId, f, t, terminal)
    html = _build_html_report(
        roll,
        logo_url="/assets/logo.png" if os.path.exists(os.path.join("assets","logo.png")) else None
    )
    pdf_bytes = html_to_pdf_bytes(html)
    return pdf_bytes, f, t

@app.get("/api/analytics/export")
def export_report(
    token: str,
    storyId: Optional[str] = None,
    range: Optional[str] = Query(default="last7d", description="last7d|last30d|custom"),
    _from: Optional[str] = None,
    _to: Optional[str] = None,
    fmt: str = Query(default="html", description="html|json|pdf"),
    terminal: Optional[str] = None,
):
    payload = verify_token(token)
    sid_from_token = payload.get("storyId")
    sid = storyId or sid_from_token
    if not sid or sid != sid_from_token:
        raise HTTPException(status_code=400, detail="storyId mismatch or missing")

    f, t = _resolve_range(range, _from, _to)
    roll = rollup_range(sid, f, t, terminal)

    if fmt == "json":
        return roll

    if fmt == "pdf":
        html = _build_html_report(
            roll,
            logo_url="/assets/logo.png" if os.path.exists(os.path.join("assets","logo.png")) else None
        )
        pdf_bytes = html_to_pdf_bytes(html)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{sid}_{f}_{t}.pdf"'}
        )

    html = _build_html_report(
        roll,
        logo_url="/assets/logo.png" if os.path.exists(os.path.join("assets","logo.png")) else None
    )
    return HTMLResponse(html)

# =========================
#   REPORT SETTINGS + SEND
# =========================

@app.get("/api/report-settings")
def get_report_settings(storyId: str):
    data = load_settings()
    cfg = data.get(storyId)
    if not cfg:
        raise HTTPException(status_code=404, detail="No settings")
    return cfg

@app.put("/api/report-settings")
def put_report_settings(storyId: str, body: ReportSettings):
    if storyId != body.storyId:
        raise HTTPException(status_code=400, detail="storyId mismatch")
    data = load_settings()
    data[storyId] = body.model_dump()
    save_settings(data)
    return {"ok": True}

@app.delete("/api/report-settings")
def delete_report_settings(storyId: str):
    data = load_settings()
    if storyId in data:
        del data[storyId]
        save_settings(data)
    return {"ok": True}

@app.post("/api/report-send")
def report_send(storyId: str):
    data = load_settings()
    cfg = data.get(storyId)
    if not cfg or not cfg.get("recipients"):
        raise HTTPException(status_code=400, detail="No recipients configured")

    pdf_bytes, f, t = export_report_html_pdf(
        storyId,
        cfg.get("rangeSpec","last7d"),
        None, None,
        ",".join(cfg.get("terminal", []) or [])
    )
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M")
    fname = f"report_{storyId}_{ts}.pdf"

    subject = f"[Qzera] Report – {storyId} – {cfg.get('rangeSpec','last7d')} ({f} → {t})"
    body = f"Automatikus riport a(z) {storyId} kampányról.\nIdőszak: {f} → {t}"
    send_mail_with_pdf(subject, body, cfg["recipients"], pdf_bytes, fname)
    return {"ok": True, "sentTo": cfg["recipients"], "period": [f, t]}

@app.post("/api/report-settings/test")
def report_send_test(body: ReportSettings = Body(...)):
    if not body.recipients:
        raise HTTPException(status_code=400, detail="No recipients configured")

    pdf_bytes, f, t = export_report_html_pdf(
        body.storyId,
        body.rangeSpec or "last7d",
        None, None,
        ",".join(body.terminal or [])
    )
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M")
    fname = f"report_{body.storyId}_{ts}.pdf"

    subject = f"[Qzera] Report – {body.storyId} – {body.rangeSpec or 'last7d'} ({f} → {t}) [TEST]"
    msg = f"Teszt riport a(z) {body.storyId} kampányról.\nIdőszak: {f} → {t}"
    send_mail_with_pdf(subject, msg, body.recipients, pdf_bytes, fname)
    return {"ok": True, "test": True, "sentTo": body.recipients, "period": [f, t]}

# --- Scheduler indulás szerver startnál ---
@app.on_event("startup")
def _on_startup():
    try:
        set_generate_cb(export_report_html_pdf)
    except Exception:
        pass
    start_scheduler(app)

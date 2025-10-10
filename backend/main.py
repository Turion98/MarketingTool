from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import json
import os
import shutil
import traceback
from datetime import datetime
from dotenv import load_dotenv
from copy import deepcopy
from fastapi.responses import HTMLResponse, Response
import re
from functools import lru_cache
from email_utils import send_mail_with_pdf
from report_scheduler import load_settings, save_settings, start_scheduler, set_generate_cb
from models.report_settings import ReportSettings
from pathlib import Path
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware



# ⬇️ Feedback API router import
from feedback_routes import router as feedback_router

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

@lru_cache(maxsize=12)
def _load_story(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}

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
    """
    Csak a szükséges fragmenseket injektálja a válaszba fragmentsGlobal alatt,
    a MEGFELELŐ story 'fragments' bankjából.
    """
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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response


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

@app.get("/api/story")
def get_story(src: str = Query(default="story.json")):
    base = os.path.join("data", os.path.basename(src))
    if not os.path.exists(base):
        return {"error": f"Story file {src} not found"}
    with open(base, "r", encoding="utf-8") as f:
        return json.load(f)

# Engedjük a http(s)://localhost:PORT és http(s)://127.0.0.1:PORT összes kombinációját.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],   # biztonság kedvéért
    max_age=600,
)

# Biztosítsunk OPTIONS választ bármely végpontra (CORSMiddleware elvileg elég,
# de ezzel 100%, hogy 200/204 jön vissza CORS headerekkel).
@app.options("/{rest_of_path:path}")
def any_options(rest_of_path: str):
    return Response(status_code=204)


# --- Feedback router bekötése ---
app.include_router(feedback_router, prefix="/api")

# === Stories router bekötése (lista + feltöltés) ===
from storysvc import router as stories_router
app.include_router(stories_router.router, prefix="/api")



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

@app.get("/api/landing")
def get_landing(src: str | None = None):
    # 1) ha van src -> próbáld betölteni, de ha nincs landing, fallbackolj
    if src:
        data = _load_story(src)  # a te meglévő betöltőd
        if isinstance(data, dict) and "landing" in data:
            return data["landing"]
    # 2) alapértelmezett: DEFAULT_STORY (global.json)
    default = _load_story(DEFAULT_STORY)
    if isinstance(default, dict) and "landing" in default:
        return default["landing"]
    # 3) végső védőháló
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

# --- Landing endpoint ---
@app.get("/landing")
def get_landing(src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)
    if "landing" not in story:
        raise HTTPException(status_code=404, detail="Landing not found")
    # Landinget nem override-oljuk SFX-szel, de injektáljuk a szükséges fragmenteket
    return _inject_fragments_global_for(story, story["landing"])

# --- Rekurzív kereső a story-ban ---
def _find_page_recursive(node: Any, page_id: str) -> Dict[str, Any] | None:
    """Bejárja a dict/list struktúrát és visszaadja az első 'page' szerű
    objektumot, amelynek id-je == page_id."""
    if isinstance(node, dict):
        # Ha ez maga egy oldal
        if node.get("id") == page_id:
            # Oldalnak tekintjük, ha van tipikus oldalkulcsa
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

# --- Page endpoint ---
@app.get("/page/{page_id}")
def get_page(page_id: str, src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)

    # 1) Globális "pages" dict kezelés (ha van ilyen)
    if "pages" in story and isinstance(story["pages"], dict):
        if page_id in story["pages"]:
            page = _apply_sfx_overrides(story["pages"][page_id])
            return _inject_fragments_global_for(story, page)

    # 2) Teljes story rekurzív bejárása (beágyazott fejezetekhez is)
    page = _find_page_recursive(story, page_id)
    if page:
        page = _apply_sfx_overrides(page)
        return _inject_fragments_global_for(story, page)

    raise HTTPException(status_code=404, detail=f"Page {page_id} not found")

# --- (Opcionális) Gyors létezés-ellenőrzés ---
@app.get("/exists/{page_id}")
def exists(page_id: str, src: str | None = Query(default=None)):
    story_path = _normalize_src_to_path(src)
    story = _load_story(story_path)
    if "pages" in story and isinstance(story["pages"], dict) and page_id in story["pages"]:
        return {"ok": True}
    return {"ok": _find_page_recursive(story, page_id) is not None}

# --- Cache törlés ---
@app.post("/clear-cache")
def clear_cache(secret: str = Query(...)):
    expected_secret = os.getenv("DEV_CLEAR_SECRET", "KAB1T05Z3r!25")
    if secret != expected_secret:
        print(f"[ERROR] Invalid secret: {secret}")
        raise HTTPException(status_code=401, detail="Invalid secret")

    try:
        for subdir in ["generated/images", "generated/audio"]:
            if os.path.isdir(subdir):
                shutil.rmtree(subdir)
                os.makedirs(subdir, exist_ok=True)
        # story cache ürítés (lru_cache)
        _load_story.cache_clear()
        return {"ok": True, "message": "Cache cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
#   ANALYTICS ENDPOINTOK
# =========================

@app.post("/api/analytics/batch")
def post_analytics_batch(batch: AnalyticsBatch):
    """
    Frontend által gyűjtött események fogadása.
    Napi JSONL fájlba írjuk: analytics/<storyId>/YYYY-MM-DD.jsonl
    """
    try:
        story_dir = _story_analytics_dir(batch.storyId)
        # Nap kulcsa az első eventből (ha nincs, UTC today)
        ts_ms = batch.events[0].ts if batch.events else int(datetime.utcnow().timestamp() * 1000)
        day = datetime.utcfromtimestamp(ts_ms / 1000.0).strftime("%Y-%m-%d")
        out_path = os.path.join(story_dir, f"{day}.jsonl")

        with open(out_path, "a", encoding="utf-8") as f:
            # header rekord (opcionális)
            header = {
                "_type": "batch_header",
                "ts": datetime.utcnow().isoformat() + "Z",
                "storyId": batch.storyId,
                "userId": batch.userId,
                "device": batch.device or {},
                "count": len(batch.events),
            }
            f.write(json.dumps(header, ensure_ascii=False) + "\n")
            # események
            for e in batch.events:
                f.write(json.dumps(e.dict(), ensure_ascii=False) + "\n")

        return {"ok": True, "written": len(batch.events), "file": f"{batch.storyId}/{day}.jsonl"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/days")
def list_analytics_days(storyId: str):
    """
    Elérhető napok listája egy story-hoz (YYYY-MM-DD).
    """
    d = _story_analytics_dir(storyId)
    files = sorted([f for f in os.listdir(d) if f.endswith(".jsonl")])
    days = [f[:-6] for f in files]  # levágjuk a ".jsonl"-t
    return {"storyId": storyId, "days": days}

@app.get("/api/analytics/day")
def get_analytics_day(storyId: str, day: str):
    """
    Nyers napi JSONL tartalom visszaadása (soronként).
    """
    d = _story_analytics_dir(storyId)
    path = os.path.join(d, f"{day}.jsonl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")
    with open(path, "r", encoding="utf-8") as f:
        return {"storyId": storyId, "day": day, "lines": f.read().splitlines()}

@app.get("/api/analytics/rollup")
def rollup_day(storyId: str, day: str):
    """
    Gyors napi aggregálás: session-, user-, page-számok, számlálók, top oldalak.
    """
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
from datetime import timedelta

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
    """
    Több nap aggregálása marketing KPI-okra.
    - storyId: kampány azonosító (mappa az analytics/<storyId>/ alatt)
    - from, to: YYYY-MM-DD (inkluzív)
    - terminal: opcionális, comma-separated oldalak a befejezéshez (ha nincs game_complete event)
    """
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

    # ——— Gyűjtők
    users_all: set[str] = set()
    sessions_all: set[str] = set()
    dau: Dict[str, Dict[str, set]] = {}   # day → { users:set, sessions:set }
    totals = {
        "pageViews": 0,
        "choices": 0,
        "puzzles": {"tries": 0, "solved": 0},
        "runes": 0,
        "mediaStarts": 0,
        "mediaStops": 0,
    }

    # per-session timeline az időtartamhoz és completionhez
    per_session_events: Dict[str, List[Dict[str, Any]]] = {}
    # oldal metrikák (funnel)
    page_views: Dict[str, int] = {}
    page_sessions: Dict[str, set] = {}
    # choice megoszlás
    choice_counts: Dict[str, Dict[str, int]] = {}  # pageId -> choiceId -> count

    # ——— fájlok bejárása
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

                # Totals
                if t == "page_enter":
                    totals["pageViews"] += 1
                    if pid:
                        page_views[pid] = page_views.get(pid, 0) + 1
                        page_sessions.setdefault(pid, set()).add(sid or f"__nosession_{ts}")
                elif t == "choice_select":
                    totals["choices"] += 1
                    # choice megoszlás
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

                # per-session idővonal
                if sid:
                    per_session_events.setdefault(sid, []).append({
                        "t": t, "ts": ts, "pageId": pid, "props": props, "day": day
                    })

    # ——— Session szintű számítások: időtartam, completion, exitAfterPage
    completed_sessions = 0
    total_session_duration = 0
    exits_after_page: Dict[str, int] = {}  # pageId -> exit count

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

                # Completion logika:
        # 1) preferált: van explicit game_complete vagy game:complete event
        has_complete_event = any(e.get("t") in ("game_complete", "game:complete") for e in evs)

        # 2) ha nincs, és kaptunk terminal listát: ellenőrizzük, hogy látogatott-e ilyen oldalt
        saw_terminal = False
        if terminal_pages:
            for e in evs:
                if (e.get("t") == "page_enter") and (e.get("pageId") in terminal_pages):
                    saw_terminal = True
                    break

        if has_complete_event or saw_terminal:
            completed_sessions += 1

        # Exit-after-page: az utolsó page_enter oldala (ha volt)
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

    # ——— DAU idősor
    dau_series = []
    for day in sorted(dau.keys()):
        dau_series.append({
            "day": day,
            "users": len(dau[day]["users"]),
            "sessions": len(dau[day]["sessions"]),
        })

    # ——— Oldal metrikák összeállítása
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

    # ——— Choice megoszlások
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
    """
    Időkorlátos export token kiadása (fejlesztői védett végpont).
    Csak aki ismeri a DEV_CLEAR_SECRET-et, az kérhet tokent.
    """
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
        # default: last7d
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
    # beágyazott Chart.js (CDN) + egyszerű sötét téma
    dau_labels = [d["day"] for d in roll.get("dau", [])]
    dau_users = [d["users"] for d in roll.get("dau", [])]
    dau_sessions = [d["sessions"] for d in roll.get("dau", [])]
    pages = roll.get("pages", [])
    top_dropout = sorted(pages, key=lambda x: x.get("exitRate", 0), reverse=True)[:5]

    k = roll.get("kpis", {})
    totals = roll.get("totals", {})
    logo_html = f'<img src="{logo_url}" alt="logo" style="height:42px;margin-right:12px;border-radius:6px;" />' if logo_url else ""

    # HTML skeleton
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
const lbls = {json.dumps(dau_labels)};
const users = {json.dumps(dau_users)};
const sessions = {json.dumps(dau_sessions)};
const ctx = document.getElementById('dau').getContext('2d');
new Chart(ctx, {{
  type: 'line',
  data: {{
    labels: lbls,
    datasets: [
      {{ label: 'Users', data: users, tension: .2 }},
      {{ label: 'Sessions', data: sessions, tension: .2 }}
    ]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: true }} }},
    scales: {{
      x: {{ ticks: {{ color: '#ccc' }} }},
      y: {{ ticks: {{ color: '#ccc' }}, beginAtZero: true }}
    }}
  }}
}});
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
    """
    PDF bájtok + a használt (from,to) dátumok.
    """
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
    """
    Tokenes riport export. A token tartalmazza a storyId-t, és időkorlátos.
    Példa:
    1) Token kérése (fejlesztő): /api/analytics/export_token?storyId=Erodv2_analytics&days=7&secret=DEV_CLEAR_SECRET
    2) Export: /api/analytics/export?token=...&range=last7d&format=html
    """
    payload = verify_token(token)
    sid_from_token = payload.get("storyId")
    sid = storyId or sid_from_token
    if not sid or sid != sid_from_token:
        raise HTTPException(status_code=400, detail="storyId mismatch or missing")

    f, t = _resolve_range(range, _from, _to)
    roll = rollup_range(sid, f, t, terminal)  # reuse existing aggregator

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

    # default: html
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
    """
    Ad-hoc teszt küldés: a body-ban érkező Settings alapján,
    mentés nélkül generál és küld e-mailt.
    """
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
    # Playwright böngésző legyen telepítve: `playwright install chromium`
    try:
        set_generate_cb(export_report_html_pdf)
    except Exception:
        pass
    start_scheduler(app)


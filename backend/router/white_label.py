from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os, re
from urllib.parse import quote_plus

# ✅ TTL-based suggestion cache + HIT/MISS lekérdezés
from cache import get_wl_suggest_cached, was_last_wl_hit

router = APIRouter(prefix="/api/white-label", tags=["white-label"])

def slugify(name: str) -> str:
    s = re.sub(r"^https?://", "", name.strip().lower())
    s = s.split("/")[0]
    s = re.sub(r"[^a-z0-9\-\.]", "-", s)
    s = s.replace(".", "-")
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "brand"

WL_ROOT = os.getenv("WL_ROOT_DOMAIN", "wl.localhost")
APP_BASE = os.getenv("APP_PUBLIC_BASE", "http://localhost:3000")  # csak fallback
WL_SCHEME = os.getenv("WL_SCHEME", "https")  # dev-ben: "http"

class WLRequest(BaseModel):
    clientDomain: str
    campaignId: str
    mode: str = "managed"  # "managed" | "cname"
    # ⬇️ opcionális paraméterek a skinezéshez és a rúna-állapothoz
    skin: Optional[str] = None
    runes: Optional[str] = None         # pl. "ring,arc,dot"
    runemode: Optional[str] = None      # "single" | "triple"

class WLResponse(BaseModel):
    status: str
    brandId: str
    wlDomain: str
    playUrl: str
    embedUrl: str
    verification: dict | None = None

def _qs_from_req(req: WLRequest) -> str:
    parts = []
    if req.skin:
        parts.append(f"skin={quote_plus(req.skin)}")
    if req.runes:
        parts.append(f"runes={quote_plus(req.runes)}")
    if req.runemode:
        parts.append(f"runemode={quote_plus(req.runemode)}")
    return ("&" + "&".join(parts)) if parts else ""

@router.post("/suggest", response_model=WLResponse)
def suggest_white_label(req: WLRequest):
    """
    White-label javaslat (TTL-cache-elve).
    Cache-kulcs: clientDomain|campaignId|mode
    A skin/runes paramétereket NEM tesszük a cache kulcsába, hanem a válaszban
    mindig frissen fűzzük hozzá a Play/Embed URL-hez.
    """
    brand = slugify(req.clientDomain)
    if req.mode not in ("managed", "cname"):
        raise HTTPException(400, "Invalid mode")

    def _build_base():
        if req.mode == "managed":
            wl_domain = f"{brand}.{WL_ROOT}"
            verification = None
        else:
            # ajánlott kliens-aldomain minta
            wl_domain = (
                f"story.{brand}.com"
                if "." not in req.clientDomain
                else f"story.{req.clientDomain}"
            )
            verification = {
                "type": "CNAME",
                "host": wl_domain,
                "value": f"{brand}.{WL_ROOT}",
                "note": "Állíts be CNAME-et a kliens DNS-ben.",
            }

        # ⬅️ A dedikált WL host alá építjük a paraméter nélküli alap linkeket
        base = f"{WL_SCHEME}://{wl_domain}"
        play_base = f"{base}/story?c={req.campaignId}"         # NINCS &b=brand
        embed_base = f"{base}/story?c={req.campaignId}&mode=embed"

        return {
            "status": "ok",
            "brandId": brand,
            "wlDomain": wl_domain,
            "playUrl": play_base,
            "embedUrl": embed_base,
            "verification": verification,
        }

    # ⬇️ Cache-ből alap adatok
    data = get_wl_suggest_cached(req.clientDomain, req.campaignId, req.mode, _build_base)

    # ⬇️ Friss query-string a skin/runes/runemode szerint (nem cache-elt)
    qs = _qs_from_req(req)
    play_url = data["playUrl"] + (qs if qs else "")
    embed_url = data["embedUrl"] + (qs if qs else "")

    model = WLResponse(
        status=data["status"],
        brandId=data["brandId"],
        wlDomain=data["wlDomain"],
        playUrl=play_url,
        embedUrl=embed_url,
        verification=data.get("verification"),
    )

    # 🔎 Cache státusz + fejlécek
    hit = was_last_wl_hit()
    resp = JSONResponse(content=model.model_dump())
    if hit is not None:
        resp.headers["X-Backend-Cache"] = "HIT" if hit else "MISS"
    resp.headers["Cache-Control"] = "public, max-age=300"

    return resp

# (OPCIONÁLIS) GET kompatibilitás a régebbi frontendhez:
@router.get("/suggest", response_model=WLResponse)
def suggest_white_label_get(
    clientDomain: str = Query(...),
    campaignId: str = Query(...),
    mode: str = Query("managed"),
    skin: Optional[str] = Query(None),
    runes: Optional[str] = Query(None),
    runemode: Optional[str] = Query(None),
):
    body = WLRequest(
        clientDomain=clientDomain,
        campaignId=campaignId,
        mode=mode,
        skin=skin,
        runes=runes,
        runemode=runemode,
    )
    return suggest_white_label(body)

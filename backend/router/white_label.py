from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os, re

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

# WL gyökér domain és séma
WL_ROOT = os.getenv("WL_ROOT_DOMAIN", "wl.localhost")     # pl. "wl.yoursaas.com"
WL_SCHEME = os.getenv("WL_SCHEME", "https")               # dev-ben lehet "http"

class WLRequest(BaseModel):
    clientDomain: str
    campaignId: str
    mode: str = "managed"          # "managed" | "cname"
    # ⬇️ opcionális paraméterek csak továbbadásra a front felé (itt NEM használjuk)
    skin: Optional[str] = None
    runes: Optional[str] = None
    runemode: Optional[str] = None # "single" | "triple"

class WLResponse(BaseModel):
    status: str
    brandId: str
    wlDomain: str
    # Minimalista: csak az alap path-okat adjuk (a front épít query-t!)
    playUrl: str
    embedUrl: str
    verification: dict | None = None

@router.post("/suggest", response_model=WLResponse)
def suggest_white_label(req: WLRequest):
    """
    White-label javaslat (TTL-cache-elve).
    Cache-kulcs: clientDomain|campaignId|mode
    Minimalista visszatérés: csak a dedikált WL domain + alap /story és /embed útvonalak.
    A front fogja összeállítani a teljes, önhordó linkeket (src/start/title/skin/runes...).
    """
    if req.mode not in ("managed", "cname"):
        raise HTTPException(400, "Invalid mode")

    brand = slugify(req.clientDomain)

    def _build_base():
        if req.mode == "managed":
            wl_domain = f"{brand}.{WL_ROOT}"
            verification = None
        else:
            # Kliens CNAME ajánlás: story.<clientDomain> → <brand>.<WL_ROOT>
            wl_domain = (
                f"story.{brand}.com"
                if "." not in req.clientDomain
                else f"story.{req.clientDomain}"
            )
            verification = {
                "type": "CNAME",
                "host": wl_domain,
                "value": f"{brand}.{WL_ROOT}",
                "note": "Állíts be CNAME-et a kliens DNS-ben a dedikált hostra.",
            }

        base = f"{WL_SCHEME}://{wl_domain}"
        # ❗ Itt NINCS campaignId és query string – a front tölti fel mindezt.
        return {
            "status": "ok",
            "brandId": brand,
            "wlDomain": wl_domain,
            "playUrl": f"{base}/story",
            "embedUrl": f"{base}/embed",
            "verification": verification,
        }

    # ⬇️ Cache-ből alap adatok
    data = get_wl_suggest_cached(req.clientDomain, req.campaignId, req.mode, _build_base)

    model = WLResponse(
        status=data["status"],
        brandId=data["brandId"],
        wlDomain=data["wlDomain"],
        playUrl=data["playUrl"],     # nincs query – a front építi rá a paramokat
        embedUrl=data["embedUrl"],   # nincs query – a front építi rá a paramokat
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

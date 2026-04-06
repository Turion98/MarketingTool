"""
Embed access API: verify (for Next middleware) and issue-token (admin, dev / ops).

Future: payment webhooks create/update grants; no change needed to verify_embed_access().
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from urllib.parse import quote, urlencode

from auth_admin import get_admin
from services.embed_access.jwt_tokens import mint_embed_access_token
from services.embed_access.live_registry import load_registry_entries, register_live_embed
from services.embed_access.repository import get_embed_grant_repository
from services.embed_access.verify import EmbedAccessDenied, verify_embed_access

router = APIRouter(prefix="/embed-access", tags=["embed-access"])


class VerifyEmbedBody(BaseModel):
    token: str
    path_campaign_id: str = Field(..., description="Slug from /embed/{slug}")
    parent_referrer: str | None = Field(
        default=None,
        description="Browser Referer when loading the embed document (parent page URL).",
    )


class VerifyEmbedResponse(BaseModel):
    ok: bool
    code: str | None = None
    reason: str | None = None
    grant_id: str | None = None
    story_id: str | None = None


@router.post("/verify", response_model=VerifyEmbedResponse)
def verify_embed(body: VerifyEmbedBody) -> VerifyEmbedResponse:
    """
    Called by Next.js middleware (server-side). Not intended for browser CORS use.
    """
    repo = get_embed_grant_repository()
    result = verify_embed_access(
        token=body.token.strip(),
        path_campaign_id=body.path_campaign_id.strip(),
        parent_referrer=body.parent_referrer,
        repo=repo,
    )
    if isinstance(result, EmbedAccessDenied):
        return VerifyEmbedResponse(
            ok=False, code=result.code, reason=result.reason
        )
    return VerifyEmbedResponse(
        ok=True,
        grant_id=result.grant_id,
        story_id=result.story_id,
    )


class IssueTokenBody(BaseModel):
    grant_id: str
    ttl_seconds: int = Field(default=3600, ge=60, le=86400 * 30)


class IssueTokenResponse(BaseModel):
    token: str
    grant_id: str
    story_id: str
    ttl_seconds: int


@router.post("/issue-token", response_model=IssueTokenResponse)
def issue_token(
    body: IssueTokenBody,
    _: dict = Depends(get_admin),
) -> IssueTokenResponse:
    """
    Mint JWT for a grant row. Requires x-admin-key.
    Future: replace with customer-scoped dashboard API after billing exists.
    """
    repo = get_embed_grant_repository()
    grant = repo.get_by_id(body.grant_id.strip())
    if not grant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grant not found",
        )
    if grant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Grant is not active",
        )
    token = mint_embed_access_token(
        grant_id=grant.id,
        story_id=grant.story_id,
        ttl_seconds=body.ttl_seconds,
    )
    return IssueTokenResponse(
        token=token,
        grant_id=grant.id,
        story_id=grant.story_id,
        ttl_seconds=body.ttl_seconds,
    )


def _build_embed_full_url(
    player_origin: str,
    story_id: str,
    *,
    json_src: str,
    start: str,
    title: str,
    skin: str,
    runes: str,
    runemode: str,
    token: str,
    ghost: bool,
) -> str:
    """Egyező forma a frontend buildEmbedUrl-lel (query kulcsok)."""
    o = player_origin.rstrip("/")
    ep = f"{o}/embed/{quote(story_id, safe='')}"
    params: dict[str, str] = {
        "src": json_src,
        "start": start,
        "title": title,
        "skin": skin,
        "runes": runes,
        "runemode": runemode,
        "token": token,
    }
    if ghost:
        params["ghost"] = "1"
    return f"{ep}?{urlencode(params)}"


class DashboardGenerateBody(BaseModel):
    story_id: str
    json_src: str
    start: str
    title: str
    player_origin: str = Field(..., description="Pl. https://localhost:3000 — teljes embed URL alap")
    ttl_seconds: int = Field(default=3600, ge=60, le=86400 * 30)
    live_page_url: str | None = Field(default=None, description="Ügyfél oldal URL — dashboard lista")
    skin: str = "contract_default"
    runes: str = "ring"
    runemode: str = "single"


class DashboardGenerateResponse(BaseModel):
    token: str
    grant_id: str
    story_id: str
    ttl_seconds: int
    standard_url: str
    ghost_url: str


@router.post(
    "/dashboard-generate",
    response_model=DashboardGenerateResponse,
)
def dashboard_generate(
    body: DashboardGenerateBody,
    _: dict = Depends(get_admin),
) -> DashboardGenerateResponse:
    """
    Dashboard: grant + JWT + élő lista bejegyzés + kész embed URL-ek.
    Requires x-admin-key. Next.js továbbítja a szerver env kulcsot.
    """
    repo = get_embed_grant_repository()
    sid = body.story_id.strip()
    candidates = [
        g
        for g in repo.list_by_story_id(sid)
        if g.status == "active" and not g.is_expired_wall_clock()
    ]
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active grant for this story_id — add one to embed_access_grants.json",
        )
    grant = candidates[0]
    token = mint_embed_access_token(
        grant_id=grant.id,
        story_id=grant.story_id,
        ttl_seconds=body.ttl_seconds,
    )
    po = body.player_origin.strip()
    kw = dict(
        json_src=body.json_src.strip(),
        start=body.start.strip(),
        title=body.title.strip(),
        skin=body.skin.strip(),
        runes=body.runes.strip(),
        runemode=body.runemode.strip(),
        token=token,
    )
    standard_url = _build_embed_full_url(po, sid, ghost=False, **kw)
    ghost_url = _build_embed_full_url(po, sid, ghost=True, **kw)
    register_live_embed(
        story_id=sid,
        title=body.title.strip() or None,
        live_page_url=body.live_page_url,
    )
    return DashboardGenerateResponse(
        token=token,
        grant_id=grant.id,
        story_id=sid,
        ttl_seconds=body.ttl_seconds,
        standard_url=standard_url,
        ghost_url=ghost_url,
    )


@router.get("/live-embed-registry")
def live_embed_registry() -> dict:
    """
    Dashboard áttekintés: generált / bejegyzett élő beágyazások (JSON fájl).
    """
    return {"stories": load_registry_entries()}

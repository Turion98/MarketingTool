from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from .jwt_tokens import verify_embed_access_token_signature_and_exp
from .repository import EmbedGrantRepository


@dataclass
class EmbedAccessDenied:
    reason: str
    code: str


@dataclass
class EmbedAccessOk:
    grant_id: str
    story_id: str


def _normalize_origin(url: str | None) -> str | None:
    if not url or not str(url).strip():
        return None
    try:
        p = urlparse(str(url).strip())
        if p.scheme and p.netloc:
            return f"{p.scheme.lower()}://{p.netloc.lower()}"
    except Exception:
        pass
    return None


def _referrer_origin(referrer: str | None) -> str | None:
    return _normalize_origin(referrer)


def _origin_allowed(grant_origins: list[str] | None, parent_origin: str | None) -> bool:
    if not grant_origins:
        return True
    if not parent_origin:
        return False
    allowed_norm = set()
    for o in grant_origins:
        n = _normalize_origin(o)
        if n:
            allowed_norm.add(n.rstrip("/").lower())
    po = (parent_origin or "").rstrip("/").lower()
    return po in allowed_norm


def verify_embed_access(
    *,
    token: str,
    path_campaign_id: str,
    parent_referrer: str | None,
    repo: EmbedGrantRepository,
) -> EmbedAccessOk | EmbedAccessDenied:
    """
    Full gate for embed loads when signed access is required.
    Order: crypto → grant row → story match → wall-clock grant expiry → parent origin.

    Future payment hook: grant.status / expires_at updated by billing webhooks;
    this function stays unchanged.
    """
    try:
        claims = verify_embed_access_token_signature_and_exp(token)
    except ExpiredSignatureError:
        return EmbedAccessDenied("Token expired", "token_expired")
    except (InvalidTokenError, ValueError) as e:
        return EmbedAccessDenied(f"Invalid token: {e!s}", "invalid_token")
    except RuntimeError as e:
        return EmbedAccessDenied(str(e), "misconfigured")

    grant_id = claims.get("grant_id")
    story_claim = claims.get("story_id")
    if not grant_id or not story_claim:
        return EmbedAccessDenied("Token missing grant_id or story_id", "invalid_claims")

    grant = repo.get_by_id(str(grant_id))
    if not grant:
        return EmbedAccessDenied("Grant not found", "grant_not_found")

    if grant.status == "revoked":
        return EmbedAccessDenied("Grant revoked", "grant_revoked")

    if grant.story_id != str(story_claim):
        return EmbedAccessDenied("Grant story mismatch", "grant_story_mismatch")

    if grant.story_id != str(path_campaign_id):
        return EmbedAccessDenied("URL does not match grant story", "path_mismatch")

    if grant.is_expired_wall_clock():
        return EmbedAccessDenied("Grant past expires_at", "grant_expired")

    parent_origin = _referrer_origin(parent_referrer)
    if not _origin_allowed(grant.allowed_parent_origins, parent_origin):
        return EmbedAccessDenied("Parent origin not allowed", "origin_denied")

    return EmbedAccessOk(grant_id=str(grant_id), story_id=grant.story_id)

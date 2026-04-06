from __future__ import annotations

import os
import time
from typing import Any

import jwt

_ALGO = "HS256"


def _signing_secret() -> str | None:
    s = os.getenv("EMBED_ACCESS_SIGNING_SECRET", "").strip()
    return s or None


def require_signing_secret() -> str:
    s = _signing_secret()
    if not s:
        raise RuntimeError(
            "EMBED_ACCESS_SIGNING_SECRET is not set; cannot sign or verify embed tokens"
        )
    return s


def mint_embed_access_token(
    *,
    grant_id: str,
    story_id: str,
    ttl_seconds: int = 3600,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Issue JWT. Runtime access still requires grant active in repository."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "grant_id": grant_id,
        "story_id": story_id,
        "iat": now,
        "exp": now + max(60, min(ttl_seconds, 86400 * 30)),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, require_signing_secret(), algorithm=_ALGO)


def decode_embed_access_token_unsafe(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except Exception:
        return None


def verify_embed_access_token_signature_and_exp(token: str) -> dict[str, Any]:
    secret = _signing_secret()
    if not secret:
        raise RuntimeError("EMBED_ACCESS_SIGNING_SECRET missing")
    return jwt.decode(token, secret, algorithms=[_ALGO])

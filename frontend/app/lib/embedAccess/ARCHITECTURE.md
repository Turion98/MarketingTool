# Signed embed access (Questell)

## Summary

- **Grant** (`EmbedAccessGrant`) is the server-side source of truth in `backend/data/embed_access_grants.json` (swappable repository later).
- Short-lived **JWT** in query `?token=...` binds to `grant_id` + `story_id`; every load still checks **current** grant `status`, `expires_at`, and optional `allowed_parent_origins` vs `Referer`.
- **Revocation**: set `status: "revoked"` (or remove grant) — old URLs stop working immediately (JWT alone is not enough).
- **Billing (future)**: webhooks or jobs update grant rows (`active` / `revoked` / `expires_at`); payment code does not belong in verify logic.

## Flags and env

| Variable | Role |
|----------|------|
| `REQUIRE_SIGNED_EMBED` | Next middleware: if `true`/`1`, `/embed/*` requires valid `token` + backend verify. **Default off** if unset. |
| `EMBED_ACCESS_SIGNING_SECRET` | Backend: HS256 secret; required to **issue** and **verify** tokens. |
| `EMBED_ACCESS_GRANTS_PATH` | Optional path to grants JSON (default `backend/data/embed_access_grants.json`). |
| `NEXT_PUBLIC_API_BASE` | Böngésző API hívások; middleware verify alapból erre megy, ha nincs override. |
| `EMBED_ACCESS_VERIFY_API_BASE` | **Ajánlott lokális teszthez:** pl. `http://127.0.0.1:8000` — a signed embed ellenőrzés *mindig* ide megy, még ha `NEXT_PUBLIC_API_BASE` éles. |

## API (FastAPI)

- `POST /api/embed-access/verify` — body: `token`, `path_campaign_id`, `parent_referrer?`. Used by Next middleware.
- `POST /api/embed-access/issue-token` — header `x-admin-key`; body: `grant_id`, `ttl_seconds`. Returns JWT for local testing.
- `POST /api/embed-access/dashboard-generate` — admin dashboard flow: auto-creates/reuses `active` grant per `story_id`, issues token, returns standard/ghost URLs.

## embed.js

Optional attribute `data-access-token` → sets `token` on the iframe URL.

## Touched files (reference)

- `backend/services/embed_access/*`
- `backend/routers/embed_access.py`
- `backend/main.py`
- `backend/data/embed_access_grants.json`, `embed_access_grants.seed.json`
- `backend/requirements.txt` (PyJWT)
- `frontend/lib/embedAccessMiddleware.ts`
- `frontend/middleware.ts`
- `frontend/app/lib/embedAccess/appendEmbedAccessToken.ts`
- `frontend/public/embed.js`
- `.env.example`

## How to test locally

1. Copy `backend/data/embed_access_grants.seed.json` grants into `embed_access_grants.json` (or edit manually).
2. Set `EMBED_ACCESS_SIGNING_SECRET` (same in backend `.env`).
3. Restart FastAPI. Mint token:
   `curl -s -X POST http://127.0.0.1:8000/api/embed-access/issue-token -H "Content-Type: application/json" -H "x-admin-key: YOUR_ADMIN_KEY" -d "{\"grant_id\":\"dev-grant-local-001\",\"ttl_seconds\":3600}"`
4. Set `REQUIRE_SIGNED_EMBED=true` in **frontend** env; restart Next.
5. Open `/embed/{story_id}?src=...&start=...&token=PASTE` (and other params as usual).

Cases:

- **Valid**: matching story, active grant, token not expired, origin rules pass.
- **Expired JWT**: short `ttl_seconds` or wait; expect 403.
- **Revoked**: set `status: "revoked"` in JSON; expect 403 without reissuing token.
- **Wrong story**: open `/embed/other_slug?token=same`; expect `path_mismatch` → 403.
- **Origin**: set `allowed_parent_origins` to e.g. `["http://localhost:3000"]` and load embed from another Referer; expect 403.

## Current policy

- Dashboard generate uses long-lived token default (`365d`).
- Grant is the primary access switch: if grant turns `revoked`, existing tokenized URLs stop immediately.
- Auto-grant default is open origin (`allowed_parent_origins = null`) unless later tightened per customer.

# Questell

**Live product:** [www.thequestell.com](https://www.thequestell.com)

---

## Product overview

Turn traffic into decisions, not just clicks.  
From landing pages to decision-driven journeys.

Questell helps marketing and creative teams turn static pages into **branching, interactive journeys** — without rebuilding a custom web app for every campaign.

Instead of a single linear page, users move through **choices, outcomes, and guided flows** (e.g. product finders, campaign experiences, onboarding paths), each leading to clear next steps.

Experiences are **embeddable, trackable, and iteration-ready** — designed to live inside existing websites and campaigns, not as isolated one-offs.

### Primary focus

**Agencies** and **in-house brand / marketing teams** shipping **campaign activations** and ongoing experiences where **what people choose** matters as much as reach — without treating every deliverable as a greenfield dev project.

### Also a strong fit

These patterns depend on how you **model the flow** in Questell (depth of catalog logic, steps, CTAs); see **[www.thequestell.com](https://www.thequestell.com)** for live examples.

- **E-commerce & catalogs** — guided “help me choose” paths when choice overload drives drop-off  
- **Product- or bundle-heavy offers** — narrowing options, configurations, or stepped paths before conversion  
- **Paid traffic & landing programmes** — when success means **decisions or qualification**, not only click volume  

### What it optimizes for

- **Speed** — launch structured interactive flows without rebuilding logic and UI each time  
- **Insight** — track not just clicks, but **decision paths, completions, and drop-offs**  
- **Distribution** — experiences that integrate into existing sites and channels  

### How Questell is different

- Built for **decision flows**, not static pages  
- Combines **content, logic, and analytics** in a single system  
- Designed to **embed into existing products and campaigns**, not replace them  

---

## Technical summary

**Questell** is a **decision engine**: branching, JSON-driven experiences (campaigns, quizzes, guided narratives, interactive flows). A single runtime loads **page-by-page** content from structured definitions, evaluates **choices and logic**, and connects **analytics** and **embeddable** player routes.

The codebase evolved from an earlier **Quest Forge** story prototype; the direction is **marketing-grade flows** (personalisation paths, CTAs, reporting), not only linear fiction.

---

## What it does

- **Branching decisions** — choices, conditional **logic** pages (fragments / flags), and typed pages (narrative, transitions, puzzles, campaign CTAs).
- **Content as data** — stories validated against a shared **JSON schema** (`CoreSchema.json`), served by the backend and cached on the client.
- **Editor & auth** — sign-in flow toward `/editor` for authoring workflows (see app routes).
- **Distribution** — **embed** routes, **white-label** helpers on the API, and a **present** / marketing surface.
- **Analytics & reports** — event batching, rollups, and reporting UI wired to the FastAPI backend.
- **Media (optional)** — image generation via backend integration (e.g. Replicate); configure keys in backend `.env` (see `backend/.env.example`).

---

## Architecture

| Layer | Stack | Location |
|--------|--------|----------|
| Web app | Next.js (App Router), React, TypeScript, SCSS modules | `frontend/` |
| API & assets | FastAPI, story service, analytics, media, admin | `backend/` |
| Schema | JSON Schema (Draft-07), shared between client and server | `frontend/schemas/`, `backend/schemas/` |

Detailed technical map: [`docs/USE_CASE_JSON_CONTENT_ENGINE.md`](docs/USE_CASE_JSON_CONTENT_ENGINE.md).

---

## Repository layout (high level)

```
frontend/app/          → App Router pages (landing, play, editor, login, embed, present, …)
frontend/app/components/StoryPage/   → Main flow renderer (page types, choices, logic)
frontend/app/lib/      → Game state, fetch/cache, schema validation, analytics client
backend/storysvc/      → Story listing, import, validation
backend/routers/       → Analytics, media, reports, runtime, admin
backend/stories/       → Example / deployed JSON stories (STORIES_DIR)
```

---

## Quick start

### Prerequisites

- **Node.js** (LTS) for the frontend  
- **Python 3.11+** (recommended) for the backend  
- Optional: **Replicate** (or other configured providers) for server-side image generation

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL your dev script binds to (default port **3000**; check `frontend/package.json` if a custom `-H` host is set).

Entry points:

- `/` — home (editor vs present)
- `/landing` — demo / play launcher
- `/present` — marketing-style present page

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit secrets and paths
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Stories are read from `STORIES_DIR` (default: `backend/stories/`).

### 3. Environment

- Root [`/.env.example`](.env.example) — frontend-oriented vars (e.g. `NEXT_PUBLIC_API_BASE` for production API URL).
- [`backend/.env.example`](backend/.env.example) — backend secrets and optional directories.

Locally, the frontend often talks to `http://127.0.0.1:8000`; in production, set `NEXT_PUBLIC_API_BASE` to your deployed API origin and align **CORS** (`CORS_EXTRA_ORIGINS` on the backend).

---

## Deployment notes

- **Frontend**: any Next.js-friendly host (e.g. Vercel). Set public env vars for API base and monitoring (e.g. Sentry DSN) as needed. For session login (`NEXT_PUBLIC_AUTH_PROVIDER=session`), set **`NEXT_PUBLIC_DEV_ADMIN_EMAILS`** (and optional **`NEXT_PUBLIC_DEV_PAID_EMAILS`**) on the host: these are inlined at **build** time, so trigger a rebuild after changing them.
- **Embedding** (`/embed/...` in a third-party `<iframe>`): framing policy is applied in **`middleware.ts`** (not `headers()` in `next.config.js`, to avoid catch-all conflicts). Use **`EMBED_FRAME_ANCESTORS`** or **`NEXT_PUBLIC_EMBED_FRAME_ANCESTORS`** (see root [`.env.example`](.env.example)): default is `*` (any parent origin); restrict with a space- or comma-separated origin list if needed. Redeploy after changing env.
- **Backend**: a process host or container running Uvicorn (or equivalent) with persistent storage for `STORIES_DIR`, generated assets, and analytics data if used.
- **CORS**: update allowed origins in `backend/main.py` or via `CORS_EXTRA_ORIGINS` for previews and custom domains.

---

## Documentation

- [`docs/USE_CASE_JSON_CONTENT_ENGINE.md`](docs/USE_CASE_JSON_CONTENT_ENGINE.md) — runtime, cache, validation, fetch flow  
- [`docs/ANALYTICS_ARCHITECTURE_MAP.md`](docs/ANALYTICS_ARCHITECTURE_MAP.md) — analytics pipeline overview  
- [`docs/CONTRACTS_AND_OWNERSHIP_AUDIT.md`](docs/CONTRACTS_AND_OWNERSHIP_AUDIT.md) — routes, storage keys, contracts (internal reference)

---

## License *(what to do next)*

This is **not legal advice**. Pick a path that matches how you will **distribute the code** and **sell the product**.

| Situation | Typical approach |
|-----------|------------------|
| **Closed product** (private repo or you do not want others copying the source) | Add a root **`LICENSE`** file that states **all rights reserved** and names the **copyright holder** (person or company) and **year**. Keep the repo private if the code must stay confidential. |
| **Open source** (you want third parties to use, modify, or contribute under clear terms) | Choose a standard licence (**MIT**, **Apache-2.0**, **AGPL-3.0**, etc.) based on whether you require **copyleft** (e.g. AGPL if network use must share changes). Copy the official **full licence text** into **`LICENSE`**, and set the **`license`** field in `package.json` / PyPI metadata if you publish packages. |
| **Commercial product + some open components** | Split **repos or folders** with **different licences**, or use a **commercial licence** for the app and OSS for libraries — this needs a **lawyer-drafted** agreement if customers pay for access. |

**Minimum for any public GitHub repo:** do not leave the licence ambiguous — either **explicit proprietary** text in `LICENSE` or a **standard OSS** file. For **contributions**, add **`CONTRIBUTING.md`** and (if OSS) **`CODE_OF_CONDUCT.md`** when you are ready to accept external PRs.

---

*Questell — decision engine for branching interactive experiences.*

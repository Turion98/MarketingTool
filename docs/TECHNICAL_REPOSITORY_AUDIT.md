# Technical Repository Audit — MarketingTool

**Scope:** Repository structure, routing, UI composition, state, data layer, cross-cutting concerns, styling, build & runtime. Analysis only — no product or analytics design.

---

## Repository tree (top 2–3 levels)

```
MarketingTool/
├── .github/           # CI / workflows
├── .vscode/           # Editor config
├── backend/           # FastAPI app, story service, analytics, assets
│   ├── analytics/     # Analytics persistence/aggregation
│   ├── assets/        # Static assets
│   ├── data/          # Data files
│   ├── feedback/      # Feedback handling
│   ├── generated/    # Generated images/audio
│   ├── migration/    # Story migration scripts
│   ├── models/        # Pydantic/DB models (e.g. report_settings)
│   ├── router/        # White-label router
│   ├── routers/      # Admin router
│   ├── schemas/       # JSON Schema (CoreSchema.json)
│   ├── storysvc/      # Story import/validate/list (router.py)
│   ├── stories/      # Story JSON files (STORIES_DIR)
│   ├── templates/     # Email/templates
│   ├── validation/    # Schema/business validation
│   ├── validators/    # Story validators
│   ├── main.py        # FastAPI app, routes, mounts
│   ├── cache.py       # Story/page cache
│   ├── auth_admin.py  # Admin auth
│   └── ...
├── docs/              # Documentation
├── frontend/          # Next.js 15 app
│   ├── app/           # App Router (pages, layout, components, lib)
│   ├── assets/        # Static assets
│   ├── public/        # Public static (skins, icons, etc.)
│   ├── schemas/       # CoreSchema.json (FE validation)
│   └── styles/        # Global SCSS, typography, skins
└── MarketingTool/     # (nested folder; likely legacy/duplicate)
```

---

## 1) Repository Overview

| Folder | Role | Description |
|--------|------|-------------|
| **frontend** | Domain + shared | Next.js 15 app: story player, landing, present, adventures, embed, admin/upload, analytics UI. |
| **backend** | Domain + infrastructure | FastAPI: story CRUD, page/meta API, image/voice generation, analytics, feedback, admin, reports. |
| **backend/storysvc** | Domain | Story import/validate/list; CoreSchema validation; STORIES_DIR. |
| **backend/analytics** | Domain | Analytics persistence and aggregation. |
| **backend/routers**, **router** | Infrastructure | Admin, white-label. |
| **frontend/app/lib** | Shared | GameStateContext, analytics, auth, API clients, cache, story fetch, validation, security. |
| **frontend/app/components** | Shared + domain | Reusable UI (StoryPage, LandingPage, layout, labs, overlays) and domain-specific (AnalyticsReport, UploadStoryForm). |
| **frontend/app/core** | Shared | CTA resolver, types (e.g. `cta/`). |
| **docs** | Shared | Documentation (this audit). |

**Domains:** Story/flow engine, campaigns/adventures, present/landing, embed, analytics/reports, admin/upload.  
**Shared:** `GameStateContext`, `StyleProfileContext`, auth, API base, token/skin loading, validation (AJV + server).  
**Infrastructure:** Next.js config, FastAPI main, cache, env (NEXT_PUBLIC_*, STORIES_DIR, etc.).

---

## 2) Runtime Entry Points

- **Framework:** Next.js 15 (App Router), React 19. Start: `next dev` (port 3000, turbopack) or `next build` + `next start`.
- **Backend:** FastAPI in `backend/main.py`; typically `uvicorn main:app` (e.g. port 8000).
- **Root layout:** `frontend/app/layout.tsx`
  - Imports: `global.css`, `@/styles/_typography.scss`, skin CSS (`legacy-default`, `legacy-contract-overlay`).
  - Font: `Cormorant_Garamond` (Next font), `--font-cormorant`.
  - **Global providers (order):** `AuthProvider` → `GameStateProvider` → `StyleProfileProvider` → `PaperEffect` → `children`.
- **Providers:**
  - **Auth:** `frontend/app/lib/auth/useAuth.tsx` + `client.ts` — mock auth by default; pluggable via `NEXT_PUBLIC_AUTH_PROVIDER`.
  - **Game state:** `frontend/app/lib/GameStateContext.tsx` — story/page state, fragments, flags, globals, persistence, analytics init.
  - **Style:** `frontend/app/lib/StyleProfileContext.tsx` — resolution/style/quality/lighting (in-memory, no persistence in audit).
  - **PaperEffect:** `frontend/app/components/filters/PaperEffect.tsx` — SVG filter + paper texture.

No middleware file found under `frontend`; routing is pure App Router.

---

## 3) Routing Map

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Renders `PresentLandingPage` (marketing/present landing). |
| `/landing` | `app/landing/page.tsx` | Renders `RootPageClient` (landing vs story switcher by `pid` / `storySrc` / `currentPageId`). |
| `/present` | `app/present/page.tsx` | Client wrapper around `PresentLandingPage` (mailto, “View demos” → `/`). |
| `/story` | `app/story/page.tsx` | Renders `StoryPageClient` (story player; reads `skin`, `src`, `title`, `start`, `c`, `runes`, `runemode` from query; persists to localStorage and optionally resolves story from backend `/stories` by `c`). |
| `/embed/[campaign]` | `app/embed/[campaign]/page.tsx` | Embed entry: reads query (`skin`, `src`, `title`, `start`, `c`, `runes`, `runemode`), persists to localStorage, renders `StoryPage`. |
| `/play/[pageId]` | `app/play/[pageId]/page.tsx` | Server component; passes `pageId`, `skin`, `src` to `StoryClient`; `StoryClient` loads skin and renders `StoryPage` (no `pageId` prop passed into StoryPage — inference: story still driven by GameState/currentPageId). |
| `/adventures` | `app/adventures/page.tsx` | Campaign list: fetches stories from multiple candidates (API_BASE, same-origin `/api/stories`, `/stories/registry.json`), skin/runes from localStorage, renders grid of `CampaignCard`; report/schedule modals. |

**Dynamic segments:** `[campaign]`, `[pageId]`.  
**Redirects:** None found in code (present “View demos” is `window.location.href = "/"`).  
**Middleware:** None in repo.

**Landing vs story decision (RootPageClient):**  
`shouldShowStory = !!pid || (hasValidStory && !!currentPageId && currentPageId !== "landing")`  
where `hasValidStory` = query `src` or `__quest_globals__.storySrc` or `localStorage.storySrc`. So: story is shown when there is a `pid` or (valid story source and non-landing `currentPageId`).

---

## 4) Component & Section Hierarchy

### Root (`/`) → Present landing

- **Page:** `app/page.tsx` → `PresentLandingPage`
- **PresentLandingPage** (`app/present/PresentLandingPage.tsx`):  
  Sections: hero, problems, campaign types, platform cutout, examples, collab diagram, contact CTA.  
  Components: `ContactModal`, `CollabDiagram`, `DynamicMeshBackground`, `ExamplesSection`, `PlatformCutout`.  
  Language: local state `lang` (hu/en) with `localStorage` key `questell_present_lang_v1`.

### `/landing` → Root client (landing vs story)

- **Page:** `app/landing/page.tsx` → `RootPageClient`
- **RootPageClient** (`app/RootPageClient.tsx`):  
  Chooses between:
  - **LandingPage** (`app/components/LandingPage/LandingPage.tsx`) — campaign picker, admin panel, upload, API keys, “Start” writes `storySrc`, `storyTitle`, `currentPageId` to localStorage and navigates into story.
  - **StoryPage** (`app/components/StoryPage/StoryPage.tsx`) — full story UI.

### Story player (StoryPage)

- **StoryPage** (`app/components/StoryPage/StoryPage.tsx`):  
  - **Layout:** `DecorBackground`, then conditional content by page type.
  - **Common:** `AdminQuickPanel`, `AnalyticsSync`, optional `AnalyticsReport`, `HeaderBar`, `ActionBar`, `Canvas`, `NarrativePanel`, `InteractionDock`, `ProgressStrip`, `ProfileCardFrame`, `CampaignCta`, etc.
  - **Page-type branches:** transition/video → `TransitionVideo`; “tower_reveal_video” legacy; content/choice pages → narrative, `ChoiceButtons`, `GeneratedImage`, `AudioPlayer`, overlays (`RewardOverlay`, `FragmentReplayOverlay`, `BrickBottomOverlay`, `RuneDockOverlay`, etc.), labs (`PuzzleRunes`, `RiddleQuiz`), `RestartButton`, `FeedbackOverlay`, `SmokeField`, `NineSlicePanel`, `MediaFrame`, `RuneDockDisplay`.
  - **Data:** `useGameState()` (currentPageId, pageData, globals, fragments, etc.); page data from backend via `fetchPageJsonCached` (called from GameStateContext when resolving current page).

### Adventures

- **Page:** `app/adventures/page.tsx`  
  - **Sections:** ParallaxBackground, header bar, grid of `CampaignCard`, optional `ReportDrawer`, `ReportScheduleForm`.
  - **CampaignCard** (`app/adventures/components/CampaignCard.tsx`): cover, title, blurb, skin selector, rune selector, actions (play, report, schedule). Play writes `storySrc`, `currentPageId`, `storyTitle`, rune pack to localStorage and navigates (e.g. to story route).

**Key file paths:**

- Entry/layout: `app/layout.tsx`, `app/page.tsx`, `app/present/PresentLandingPage.tsx`
- Switcher: `app/RootPageClient.tsx`, `app/landing/page.tsx`
- Story: `app/story/StoryPageClient.tsx`, `app/components/StoryPage/StoryPage.tsx`
- Story state & fetch: `app/lib/GameStateContext.tsx`, `app/lib/story/fetchPageJson.ts`
- Adventures: `app/adventures/page.tsx`, `app/adventures/components/CampaignCard.tsx`
- Embed: `app/embed/[campaign]/page.tsx`

---

## 5) Data Flow Map

### Flow 1: Story list → Play story

- **Source of list:**  
  - Adventures: `fetchStoriesWithMultiFallback()` → tries `NEXT_PUBLIC_API_BASE/api/stories`, same-origin `/api/stories`, `/stories/registry.json`, then dev fallback.  
  - Next route `app/api/stories/route.ts` GET: proxies to backend `${API_BASE}/stories` (or other candidates), normalizes to `{ id, title, jsonSrc, startPageId }`.
- **Backend list:** `backend/storysvc/router.py` → `GET /api/stories` → reads STORIES_DIR, returns list with `id`, `title`, `jsonSrc`, `startPageId`, etc.
- **Selection:** User picks campaign; `CampaignCard` or LandingPage sets `localStorage`: `storySrc`, `storyTitle`, `currentPageId` (startPageId), optionally `runePackByCampaignId`.
- **Story load:**  
  - Story route or embed: same localStorage keys set from query or from `GET /api/stories` by `c` (campaign id).  
  - `GameStateProvider` hydrates from localStorage (`currentPageId`, `storySrc`, `storyTitle`, fragments, flags, globals, etc.).  
  - When `storySrc` is set, context fetches story meta (JSON root), sets globals (meta, ctaPresets, storyTitle, storyId), initializes analytics, rune pack.
- **Page data:**  
  - GameStateContext resolves `currentPageId` and story source, builds page URL (e.g. backend `/page/{pageId}?src=...` or direct story JSON).  
  - `fetchPageJsonCached` (or equivalent) in context loads page JSON; backend `main.py` `GET /page/{page_id}` loads story, normalizes page, returns assembled page.  
  - Result is stored in context as `currentPageData` and consumed by StoryPage.

**Source of truth:**  
- **Story list:** Backend STORIES_DIR + Next proxy.  
- **Current story/session:** `GameStateContext` + localStorage (storySrc, currentPageId, fragments, flags, globals, rune pack, etc.).  
- **Page payload:** Backend `/page/{page_id}` (and story meta); frontend caches via `fetchPageJsonCached` / `frontendCache`.

### Flow 2: Story JSON upload / validate

- **Upload:** `UploadStoryForm` → `uploadStory()` in `app/lib/api/stories.ts` → POST to backend `/api/stories/import` (or `/api/upload-story`).  
- **Validate:** `validateStoryServer()` → POST `/api/stories/validate`.  
- **Backend:** `backend/storysvc/router.py`: canonicalize, CoreSchema + semantic checks, save to STORIES_DIR (upload only).
- **Client validation:** `app/lib/schema/validator.ts` (AJV + `frontend/schemas/CoreSchema.json`), `UploadStoryForm` uses `validateStory` + optional `validateStoryServer`.

### Flow 3: Report / analytics (read path)

- **Report drawer/schedule:** `ReportDrawer`, `ReportScheduleForm` call backend `GET/PUT/DELETE /api/report-settings`, `POST /api/report-send`, `POST /api/report-settings/test`.  
- **Analytics report UI:** `AnalyticsReport` fetches from backend (e.g. analytics endpoints); URL built with `NEXT_PUBLIC_API_BASE` and storyId.  
- **Backend:** `main.py` exposes `/api/analytics/*`, `/api/report-settings`, etc.

### Flow 4: Image / voice generation

- **Image:** StoryPage / components use `useImageCache` or similar; backend `POST /api/generate-image`; optional `GET /api/image/{story_slug}/{image_name}`.  
- **Voice:** StoryPage uses voice API; backend `POST /api/testVoice`; frontend `lib/useVoice.ts`, `apiClient.ts` (e.g. `generate_voice`).  
- **Config:** API keys in GameStateContext / localStorage (`voiceApiKey`, `imageApiKey`).

---

## 6) State & Side Effects

| Where | What | Persistence | Notes |
|-------|------|-------------|--------|
| **GameStateContext** | currentPageId, currentPageData, storySrc/storyTitle (in globals), unlockedFragments, fragments, globalBank, flags, globals, runePack, imagesByFlag, isMuted, visitedPages, progressValue, progressDisplay, rewardImageReady, storyId/sessionId/runId | localStorage (see LS_KEYS) + sessionStorage (runId), in-memory (pageData, visitedPages, progress) | Single source of truth for story play. Hydration on mount; syncs to localStorage on updates. |
| **GameStateContext LS_KEYS** | voiceApiKey, imageApiKey, currentPageId, isMuted, unlockedFragments, fragmentsStore, fragmentsGlobal, flagsStore, globalsStore, runeImagesByFlag, storySrc, storyTitle, skinByCampaignId, runePackByCampaignId | localStorage | Used in `GameStateContext.tsx`. |
| **sessionStorage** | runId (per story/scope), adminKey, sessionSeeds | sessionStorage | Analytics runId; admin auth; session seeds. |
| **Adventures page** | items (StoryMeta[]), skins, skinMap, runeMap, reportFor, scheduleFor | skinMap/runeMap synced to localStorage (skinByCampaignId, runePackByCampaignId) | Local state + persistence for skin/rune per campaign. |
| **Present landing** | lang (hu | en) | localStorage `questell_present_lang_v1` | No global i18n; component-level. |
| **StyleProfileContext** | styleProfile (resolution, style, quality, lighting, postEffects) | None | In-memory only. |
| **Auth** | user, token (mock) | In-memory (client.ts `memory`) | No persistence in mock. |

**Risks / notes:**

- **Prop drilling:** StoryPage is large and uses `useGameState()`; many children depend on context. Deeper trees (e.g. overlays, labs) get callbacks from StoryPage (e.g. `handleChoice`, `goToNextPage`). Not full prop drilling but a single large context.
- **Duplicated state:** `currentPageId` lives in context and is mirrored in localStorage; story “source” can be set from multiple places (embed query, story route query, campaign card, landing “Start”). Same keys written from different entry points — ensure order and single writer semantics.
- **Run/session IDs:** sessionStorage + localStorage; runId in sessionStorage; sessionId in localStorage (analytics). Clear on restart/reset in several places (e.g. RestartButton, resetGame).

---

## 7) Integration Map

| Kind | Detail |
|------|--------|
| **Backend base** | `NEXT_PUBLIC_API_BASE` (default `http://127.0.0.1:8000`). Used in StoryPageClient, embed, LandingPage, adventures, ReportScheduleForm, AdminQuickPanel, analytics, api/stories route, etc. |
| **Backend endpoints (main.py)** | `/health`, `/api/story` (meta by src), `/api/landing`, `/landing`, `/fragments`, `/page/{page_id}` (page payload), `/api/generate-image`, `/api/image/...`, `/api/testVoice`, `/api/testImage`, `/api/cache/clear`, `/api/analytics/*`, `/api/report-settings`, `/api/report-send`, `/api/report-settings/test`. |
| **Backend routers** | `feedback_router`, `stories_router` (import/validate/list), `white_label_router`, `admin_router` under `/api`. Mounts: `/assets`, `/generated`, `/stories` (StaticFiles). |
| **Next.js API route** | `app/api/stories/route.ts` GET → proxies to backend; `app/api/image/[...path]/route.ts` → proxy to backend. |
| **Next rewrites** | Dev: `/api/*` → `http://127.0.0.1:8000/api/*`. Prod: `/api/analytics/*` → `https://api.thequestell.com/api/analytics/*`. |
| **Third-party** | React 19, Next 15, Framer Motion, html-to-image/html2canvas, SASS, Zod, AJV (schemas), Sentry (@sentry/nextjs). |
| **Config** | `next.config.js` (CSP, security headers, rewrites). Env: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_AUTH_PROVIDER`, `STORIES_DIR`, `DEFAULT_STORY`, etc. Backend: `.env` + `load_dotenv`. |

---

## 8) Technical Debt & Risks (technical only)

| Priority | Item | Location / detail |
|----------|------|-------------------|
| **High** | **StoryPage size** | `StoryPage.tsx` is very large (~3.4k+ lines). Multiple page-type branches, inline helpers, and effects. Hard to test and refactor; easy to introduce regressions. |
| **High** | **GameStateContext size** | Single context holds many concerns (page, fragments, flags, globals, runes, analytics init, persistence). Hydration and effect order are subtle; runId/sessionId and “new run” semantics spread across context and analytics. |
| **High** | **Start page / story source** | `currentPageId` and story source can be set from URL (embed, story, play), from localStorage (Landing, CampaignCard), or from backend when resolving by `c`. Multiple writers and no single “bootstrap” path — risk of inconsistent initial state. |
| **Medium** | **Duplicated story list fetching** | Adventures uses its own `fetchStoriesWithMultiFallback` and candidate list; Next `api/stories` also tries multiple paths. Backend list is single (`GET /api/stories`); frontend has two patterns. |
| **Medium** | **Play route vs GameState** | `app/play/[pageId]/page.tsx` passes `pageId` to `StoryClient`, but `StoryClient` only uses it implicitly (no prop to StoryPage). Story start still depends on localStorage/context; route `pageId` may be redundant or misleading. |
| **Medium** | **localStorage keys scattered** | Keys like `currentPageId`, `storySrc`, `storyTitle` are written in embed, StoryPageClient, LandingPage, CampaignCard, RestartButton, FeedbackOverlay, GameStateContext. No single module owning “story session” persistence contract. |
| **Medium** | **No shared i18n** | Present uses local `lang` + `localStorage`; StoryPage uses `globals.lang` in places. No app-wide i18n (e.g. next-intl); copy is component/route specific. |
| **Low** | **next.config rewrites** | In dev, only rewrites are for `/api`; prod only for `/api/analytics/*`. Other backend calls from browser go to `NEXT_PUBLIC_API_BASE` (CORS must be correct). |
| **Low** | **ESLint ignored at build** | `next.config.js`: `eslint: { ignoreDuringBuilds: true }` — lint errors do not fail build. |
| **Low** | **Mixed CSS entry points** | Layout imports `global.css`, `_typography.scss`, and skin CSS. Components use SCSS modules. No single design tokens file referenced everywhere. |

---

**End of technical audit.** No code was modified; all conclusions are from static inspection and inferred behavior.

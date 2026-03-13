# Technical Audit: Contracts & Ownership

**Scope:** Domain ownership, route → source-of-truth, state inventory, data layer, technical risks. No analytics design, no product use cases, no code changes.

---

## 1) Domain ownership map

| Domain | Entry files | Primary responsibilities | Public interfaces / contracts | Reads | Writes |
|--------|-------------|--------------------------|-------------------------------|-------|--------|
| **Story Engine** | `frontend/app/components/StoryPage/StoryPage.tsx`, `frontend/app/lib/GameStateContext.tsx` | Render current page by type (content, choice, transition, video, puzzle, riddle, runes); resolve next (next, switch/cases, logic.ifHasFragment); fragments, rewards, CTAs; preload next pages/audio. | **Context:** `useGameState()` — currentPageId, currentPageData, goToNextPage, setCurrentPageId, globals, unlockedFragments, fragments, flags, setGlobal, setFlag, handleAnswer, storyId, sessionId, runId, isLoading, isMuted, etc. **Exports:** `resolveNextFromPage(page, globals)`, `normalizeImagePrompt()`. **Storage:** LS_KEYS (see State inventory). | **Reads:** localStorage (LS_KEYS.*, storyMetaCache, campaign, runKey); sessionStorage (runId key); query params (src, start, title, rs) in StoryPage useEffect. **Context:** all GameState fields. | **Writes:** localStorage: currentPageId, storySrc, storyTitle, startPageId, runKey, runeImagesByFlag; sessionStorage: runId. **Context:** setCurrentPageId, goToNextPage, setGlobal, setFlag, setUnlockedFragments, addFragment, setRuneImage, resetGame, etc. |
| **Present** | `frontend/app/page.tsx`, `frontend/app/present/page.tsx`, `frontend/app/present/PresentLandingPage.tsx` | Marketing landing: hero, problems, campaign types, platform cutout, examples, collab diagram, contact CTA; lang toggle (hu/en). | **Props:** PresentLandingPage receives logoSrc, logoAlt, onRequestQuoteClick, onViewDemosClick. **Storage key:** `questell_present_lang_v1`. | **Reads:** localStorage `questell_present_lang_v1`. | **Writes:** localStorage `questell_present_lang_v1`. |
| **Landing Switch** | `frontend/app/landing/page.tsx`, `frontend/app/RootPageClient.tsx` | Decide whether to show LandingPage or StoryPage: hasValidStory (query src \|\| __quest_globals__.storySrc \|\| localStorage.storySrc) and (currentPageId && currentPageId !== "landing"); deep-link pid sets currentPageId. | **Context:** useGameState() — setCurrentPageId, currentPageId. **Query:** `pid`. | **Reads:** useSearchParams (pid), localStorage.storySrc, (globalThis as any).__quest_globals__.storySrc, currentPageId from context. | **Writes:** setCurrentPageId(pid) when pid in URL. |
| **Embed** | `frontend/app/embed/[campaign]/page.tsx` | Read query (skin, src, title, start, c, runes, runemode); persist to localStorage; load skin; render StoryPage. No campaignId→story resolve in this file (only query → LS). | **Query params:** skin, src, title, start, c, runes, runemode. **Storage:** storySrc, storyTitle, currentPageId, runePackByCampaignId (per c). | **Reads:** useSearchParams. | **Writes:** localStorage: storySrc, storyTitle, currentPageId; runePackByCampaignId[c] (if c, runes, runemode). |
| **Adventures** | `frontend/app/adventures/page.tsx`, `frontend/app/adventures/components/CampaignCard.tsx` | Fetch story list (multi-fallback); skin + rune selectors per campaign; persist skin/rune per campaignId; open report/schedule modals; navigate to story (write LS + router). | **State:** items (StoryMeta[]), skins, skinMap, runeMap, reportFor, scheduleFor. **Storage:** skinByCampaignId, runePackByCampaignId. **API:** GET list from candidates (API_BASE/api/stories, origin/api/stories, /stories/registry.json, dev fallback). | **Reads:** localStorage skinByCampaignId, runePackByCampaignId; fetch /skins/registry.json; fetch story list URLs. | **Writes:** localStorage skinByCampaignId, runePackByCampaignId. CampaignCard on play: storySrc, currentPageId, storyTitle, runePackByCampaignId. |
| **Admin/Upload** | `frontend/app/components/LandingPage/LandingPage.tsx`, `frontend/app/components/UploadStoryPanel.tsx`, `frontend/app/components/UploadStoryForm/UploadStoryForm.tsx`, `frontend/app/components/AdminQuickPanel/AdminQuickPanel.tsx` | Landing: admin login (x-admin-key), API key inputs, “Start” sets storySrc/storyTitle/currentPageId. Upload: validate (client AJV + server), import story (multipart). Admin panel: ping, restart, clear LS/session. | **API:** POST /api/stories/import, POST /api/stories/validate (lib/api/stories.ts). **Admin:** GET /api/admin/ping (x-admin-key), POST /api/admin/restart. **Storage:** adminMode (LS), adminKey (sessionStorage); voiceApiKey, imageApiKey (LS). | **Reads:** localStorage adminMode, voiceApiKey, imageApiKey; sessionStorage adminKey; fetch admin ping, health, report-settings. | **Writes:** localStorage adminMode, voiceApiKey, imageApiKey, storySrc, storyTitle, currentPageId (on Start); sessionStorage adminKey; clear LS/session on logout. |
| **Backend** | `backend/main.py`, `backend/storysvc/router.py`, `backend/routers/admin.py`, `backend/feedback_routes.py`, `backend/router/white_label.py` | Serve story JSON (GET /api/story, GET /page/{page_id}), list stories (GET /api/stories via storysvc), import/validate (POST /api/stories/import, /validate), generate image/voice, analytics batch, report-settings, admin ping/restart, feedback, white-label. | **Endpoints:** see Data layer. **Contracts:** page response shape (id, text, next, choices, logic, fragments, audio, imagePrompt, …); story meta (meta.startPageId, meta.ctaPresets, …). | **Reads:** STORIES_DIR, env, request body/query. | **Writes:** STORIES_DIR (import), generated/, analytics dirs, report settings. |

---

## 2) Route → Source-of-truth map

| Route | What decides what renders | Where pageId / storySrc comes from | Storage keys used | API calls (file + endpoint) |
|-------|----------------------------|-------------------------------------|-------------------|-----------------------------|
| `/` | Page.tsx → PresentLandingPage. | N/A (present only). | PresentLandingPage: questell_present_lang_v1. | None for render. |
| `/landing` | RootPageClient: if `shouldShowStory` → StoryPage, else LandingPage. `shouldShowStory = !!pid \|\| (hasValidStory && !!currentPageId && currentPageId !== "landing")`. | **pageId:** GameState currentPageId (hydrated from LS currentPageId or set by pid). **storySrc:** localStorage.storySrc or __quest_globals__.storySrc or query src (hasValidStory). | currentPageId, storySrc (read). pid sets currentPageId (write). | None at route level. |
| `/present` | present/page.tsx → PresentLandingPage (client wrapper with mailto/demos handlers). | N/A. | questell_present_lang_v1. | None. |
| `/story` | StoryPageClient → StoryPage. StoryPageClient: syncs query (skin, src, title, start, c, runes, runemode) to localStorage; if `c` and no src, fetches GET /stories and finds item by id, then writes LS. | **pageId:** localStorage currentPageId (from query start or from resolved story startPageId). **storySrc:** query src or from GET /stories item.jsonSrc. | storySrc, storyTitle, currentPageId, runePackByCampaignId. | StoryPageClient.tsx: GET `${API_BASE}/stories` (when c and !src). |
| `/embed/[campaign]` | embed/[campaign]/page.tsx: reads query, writes LS, renders StoryPage. [campaign] segment not used in logic; query drives all. | **pageId:** query start → localStorage currentPageId. **storySrc:** query src → localStorage storySrc. | storySrc, storyTitle, currentPageId, runePackByCampaignId (if c, runes, runemode). | None (no list fetch in embed). |
| `/play/[pageId]` | play/[pageId]/page.tsx (server) → StoryClient(pageId, skin, src). StoryClient loads skin, renders StoryPage. StoryPage does not receive pageId prop; GameState currentPageId drives. | **pageId:** Route param pageId passed to StoryClient but not to StoryPage; effective pageId = GameState currentPageId (from LS hydration). **storySrc:** searchParam src (default "global.json") not written to LS by this route. | StoryClient only loads skin. currentPageId/storySrc from LS (unchanged by this route). | None in StoryClient for story. |
| `/adventures` | adventures/page.tsx: fetchStoriesWithMultiFallback(), then grid of CampaignCard. Modals: ReportDrawer, ReportScheduleForm. | **pageId:** Only when user clicks play on a card → CampaignCard writes startPageId to currentPageId and storySrc/storyTitle to LS. **storySrc:** From list item .jsonSrc. | skinByCampaignId, runePackByCampaignId (read/write). On play: storySrc, currentPageId, storyTitle, runePackByCampaignId. | adventures/page.tsx: fetch(story list URLs), fetch("/skins/registry.json"). ReportScheduleForm: GET/PUT/DELETE /api/report-settings, POST /api/report-send, POST /api/report-settings/test. |

---

## 3) State inventory

| Container | File path | Fields | Who writes | Who reads | Side effects / triggers |
|-----------|-----------|--------|------------|-----------|--------------------------|
| **GameStateContext** | `frontend/app/lib/GameStateContext.tsx` | hydrated, voiceApiKey, imageApiKey, isLoading, unlockedFragments, fragments, globalFragments, globals, globalError, isMuted, currentPageId, currentPageData, audioRestartToken, flagsState, imagesByFlag, storyId, sessionId, runId, visitedPages, progressValue, progressDisplay, rewardImageReady | **Writers:** Same file (setters + effects). StoryPage: setGlobal(storySrc, storyTitle, startPageId, runKey); setCurrentPageId via goToNextPage. RootPageClient: setCurrentPageId(pid). LandingPage: setCurrentPageId(firstPageId), setVoiceApiKey, setImageApiKey, setGlobal(isAdmin). RestartButton/RestartGameButton: setCurrentPageId(startPageId). FeedbackOverlay: setCurrentPageId("landing"). TransitionVideo: goToNextPage/setCurrentPageId. CampaignCard, embed, StoryPageClient: write LS only (context hydrates from LS). | **Readers:** StoryPage, ActionBar, LoadingOverlay, ErrorOverlay, ChoiceButtons, TransitionVideo, RestartButton, RestartGameButton, GeneratedImage, MediaFrame, RiddleQuiz, ReplayButton, SkipButton, ReplayGallery, ProfileCardFrame, RuneDockOverlay, AdminQuickPanel, TypingText, FeedbackOverlay, LandingPage, RootPageClient, AudioPlayer, useUiClickSound. | **Effects:** (1) Hydration: setHydrated(true). (2) Hydrate from LS/session (page, storySrc, storyTitle, fragments, flags, globals, runeImgs, muted, voice, image, runePackMap). (3) currentPageId change → fetch GET /page/{currentPageId}?src=… → setCurrentPageData; logic/needsFragment redirects. (4) setStorySrc → meta fetch, progress reset, analytics init, runePack restore. (5) globalBank merge from currentPageData.fragmentsGlobal + persist. (6) unlockEnterFragments auto. (7) visitedPages add. (8) progressValue/Display update. (9) setCurrentPageId sync to LS. (10) runePack from query or LS. |
| **AuthContext** | `frontend/app/lib/auth/useAuth.tsx` | ready, user, login, logout, getToken | useAuth.tsx (login/logout set user). client.ts mock (memory.user, memory.token). | layout.tsx (AuthProvider only). No other reader found in app. | useEffect: setUser(api.user()), setReady(true). |
| **StyleProfileContext** | `frontend/app/lib/StyleProfileContext.tsx` | styleProfile, setStyleProfile | StyleProfileProvider (useState). | No consumer found in app (only layout provides). | None. |
| **ActionBarContext** | `frontend/app/components/layout/ActionBar/ActionBarContext.tsx` | open, setOpen, toggle | ActionBarProvider (useState). | useActionBar — no other usage found; ActionBar does not wrap with ActionBarProvider in StoryPage (only ActionBar component used with props). | None. |
| **Adventures page state** | `frontend/app/adventures/page.tsx` | items, loading, err, reportFor, scheduleFor, skins, skinMap, runeMap | Same file: setItems, setLoading, setErr, setReportFor, setScheduleFor, setSkins, setSkinMap, setRuneMap; persistSkin/persistRunes write LS. CampaignCard: onPlay writes LS (not state). | Same file. CampaignCard reads skinMap, runeMap, skins. | useEffect: fetchStoriesWithMultiFallback → setItems; fetch /skins/registry.json → setSkins; hydrate skinMap/runeMap from LS. |
| **StoryPage local state** | `frontend/app/components/StoryPage/StoryPage.tsx` | skipAvailable, showReward, showReplay, skipRequested, replayKey, expanded, showChoices, animateNext, isFadingOut, dockJustAppeared, devOpen, typingDone, hideNarration, localPageId, choicePageId, pageUnlockedForInteraction, measure, lockHeightsForTransition, narrationT0, … | StoryPage only (many useEffects and handlers). | StoryPage only. | Many: sync from pageData.id, params (src, start, title, rs) → setGlobal + LS + goToNextPage; preload next pages (fetchPageJsonCached, voice fetch); reset on page change; etc. |
| **LandingPage state** | `frontend/app/components/LandingPage/LandingPage.tsx` | loading, apiReady, validating, adminVisible, adminUser, adminPass, adminMsg, adminOk | Same file. | Same file. | useEffect: admin visibility from query/localStorage; admin ping validate; validateKeys (health). |
| **RootPageClient state** | `frontend/app/RootPageClient.tsx` | hydrated | Same file: setHydrated(true). | Same file (gate for pid effect and shouldShowStory). | useEffect: setHydrated(true); pid → setCurrentPageId(pid). |
| **Analytics (in-memory + LS)** | `frontend/app/lib/analytics.ts` | mem (StorageShape), memUserId, terminalPagesByStory, completedSessions | analytics.ts (load/save, storyBucket, setStoryMeta, getOrCreateSessionId, startNewRunSession, startNewRunId, event push, flush). GameStateContext: initAnalyticsForStory, setStoryMeta, getOrCreateSessionId, startNewRunSession, startNewRunId. | analytics.ts; StoryPage/ChoiceButtons/ActionBar/etc. call trackPageEnter, trackChoice, trackUiClick, etc. | saveSoon (debounced LS write); session/runId in LS/sessionStorage (q_an:storyId:scope keys). |

**localStorage keys (consolidated):**

- **GameStateContext LS_KEYS:** voiceApiKey, imageApiKey, currentPageId, isMuted, unlockedFragments, fragmentsStore, fragmentsGlobal, flagsStore, globalsStore, runeImagesByFlag, storySrc, storyTitle, skinByCampaignId, runePackByCampaignId.
- **Other LS:** storyMetaCache, campaign, startPageId, runKey (StoryPage/context); adminMode (LandingPage, AdminQuickPanel); questell_present_lang_v1 (Present); qz_analytics_v1, qz_user_id (analytics); q_an:{storyId}:{scope}:sessionId_v2, sessionTs_v2, runId_v1 (analytics session/run); imageCache, storyCache (clearAllCache); mt:v1:* (frontendCache); voiceBackendUrl, voiceApiKey (useVoice); various image_* (useImageCache, preloadImage).

**sessionStorage keys:** adminKey (admin); sessionSeeds (sessionSeeds.ts); runId key per story/scope (analytics).

---

## 4) Data layer inventory

### API client modules and fetch wrappers

| Path | Purpose |
|------|--------|
| `frontend/app/lib/api/stories.ts` | uploadStory(file, overwrite, mode), validateStoryServer(file, mode) — POST /api/stories/import, POST /api/stories/validate; raw fetch, no safeFetch. |
| `frontend/app/lib/safeFetch.ts` | safeFetch<T>(url, opts), safeFetchJson, safePostJson, safeGet — wrapper with JSON/error handling. |
| `frontend/app/lib/apiClient.ts` | generate_image, generate_voice — fetch to API_BASE_URL (legacy naming). |
| `frontend/app/lib/reportExport.ts` | GET /api/analytics/export_token, GET /api/analytics/export (PDF). |
| `frontend/app/lib/wl.ts` | fetch API_BASE/api/white-label/suggest. |
| `frontend/app/lib/clearAllCache.ts` | POST apiBase/api/cache/clear; clears LS imageCache, storyCache. |
| `frontend/app/lib/GameStateContext.tsx` | fetch(metaUrl) for story meta; fetch(url) for GET /page/{currentPageId}?src=… (page payload). |
| `frontend/app/lib/analytics.ts` | fetch(url) for batch send (POST /api/analytics/batch or similar). |

### Caching helpers

| Path | Purpose |
|------|--------|
| `frontend/app/lib/cache/frontendCache.ts` | getCache<T>(bucket, id), setCache(bucket, id, val, ttlMs), hasFresh, clearExpired, clearAll; buckets: skin, campaign, page, wl; memory + localStorage (prefix mt:v1:). |
| `frontend/app/lib/story/fetchPageJson.ts` | fetchPageJsonCached<T>(url, opts) — getCache/setCache bucket "page", key storyId:pageId:src or URL; prefetchPages(entries). Used by StoryPage for preload; GameStateContext uses raw fetch for main page (no fetchPageJsonCached). |
| `frontend/app/lib/cache/useCachedFetch.ts` | useCachedFetch<T>(url, opts) — getCache/setCache, fetch with cache. |
| `frontend/app/lib/tokenLoader.ts` | loadTokens(url) — getCache/setCache bucket "skin", fetch skins JSON. |
| `frontend/app/lib/preloadImage.ts` | getCache/setCache for image URL cache; fetch generate or static. |
| `frontend/app/lib/useImageCache.ts` | localStorage image_* keys for generated image URLs; fetch API_BASE/api/generate-image. |
| `frontend/app/lib/security/cachePolicy.ts` | getCacheEntry, setCacheEntry, hasCacheEntry, clearCache, getCacheStats (security/cache layer). |

### Backend routers / endpoints

| Path | Endpoints |
|------|-----------|
| `backend/main.py` | GET /api/story?src=; GET /health; POST /api/generate-image; GET /api/image/{story_slug}/{image_name}; GET /api/landing; GET /fragments; GET /landing; POST /api/testVoice; POST /api/testImage; GET /page/{page_id}?src=; POST /api/cache/clear; POST /api/analytics/batch; GET /api/analytics/days, day, rollup, rollup-range, export_token, export; GET/PUT/DELETE /api/report-settings; POST /api/report-send; POST /api/report-settings/test. |
| `backend/storysvc/router.py` | POST /api/stories/validate; POST /api/upload-story, POST /api/stories/import; GET /api/stories (list STORIES_DIR). |
| `backend/routers/admin.py` | GET /api/admin/ping; POST /api/admin/restart. (Mounted with prefix /api.) |
| `backend/feedback_routes.py` | Under /api (feedback submit). |
| `backend/router/white_label.py` | White-label routes (no prefix in main). |
| **Static** | main.py mounts: /assets, /generated, /generated/audio, /stories (STORIES_DIR). |

---

## 5) Tech risks (technical only)

| Priority | Risk | Files involved |
|----------|------|-----------------|
| **HIGH** | **Multiple writers for currentPageId / storySrc** — Embed, StoryPageClient, LandingPage, CampaignCard, RestartButton, RestartGameButton, FeedbackOverlay, StoryPage (params effect) all write localStorage currentPageId and/or storySrc. No single “session bootstrap” contract; order and intent can conflict (e.g. embed vs story route vs play route). | `frontend/app/embed/[campaign]/page.tsx`, `frontend/app/story/StoryPageClient.tsx`, `frontend/app/components/LandingPage/LandingPage.tsx`, `frontend/app/adventures/components/CampaignCard.tsx`, `frontend/app/components/RestartButton/RestartButton.tsx`, `frontend/app/components/RestartGameButton/RestartGameButton.tsx`, `frontend/app/components/FeedbackOverlay/FeedbackOverlay.tsx`, `frontend/app/components/StoryPage/StoryPage.tsx`, `frontend/app/lib/GameStateContext.tsx` |
| **HIGH** | **Page load uses raw fetch in GameStateContext; preload uses fetchPageJsonCached in StoryPage** — Main page data: GET /page/{id}?src= in GameStateContext (no fetchPageJsonCached). Preload/prefetch in StoryPage: fetchPageJsonCached. Inconsistent caching and key shape (context does not use storyId:pageId:src key). | `frontend/app/lib/GameStateContext.tsx` (fetch page), `frontend/app/components/StoryPage/StoryPage.tsx` (fetchPageJsonCached), `frontend/app/lib/story/fetchPageJson.ts` |
| **HIGH** | **StoryPage single ~3.4k-line file** — All page-type branches, effects, and handlers in one file; hard to test, refactor, or assign ownership. | `frontend/app/components/StoryPage/StoryPage.tsx` |
| **HIGH** | **GameStateContext owns both “session” and “story progress”** — Hydration, page fetch, analytics init, fragment/flag persistence, rune pack, and runId/sessionId all in one provider; effect order and dependencies are subtle; resetGame and “new run” semantics spread across context and analytics. | `frontend/app/lib/GameStateContext.tsx`, `frontend/app/lib/analytics.ts` |
| **MED** | **/play/[pageId] route does not set currentPageId** — Server passes pageId to StoryClient; StoryClient does not pass it to StoryPage; StoryPage does not read route param. Effective page = LS currentPageId. Route param can be misleading or unused. | `frontend/app/play/[pageId]/page.tsx`, `frontend/app/play/[pageId]/StoryClient.tsx`, `frontend/app/components/StoryPage/StoryPage.tsx` |
| **MED** | **ActionBarContext provided nowhere** — ActionBarProvider only defined in ActionBarContext.tsx; no parent in tree wraps with ActionBarProvider. useActionBar() would throw if ever used. Dead contract. | `frontend/app/components/layout/ActionBar/ActionBarContext.tsx` |
| **MED** | **StyleProfileContext never read** — Only layout provides; no useStyleProfile() in app. Unused contract. | `frontend/app/lib/StyleProfileContext.tsx`, `frontend/app/layout.tsx` |
| **MED** | **Duplicate backend get_page block** — main.py defines GET /page/{page_id} with two nearly identical blocks (dict lookup + recursive find + cache); second block unreachable. | `backend/main.py` (lines ~800–861) |
| **MED** | **Story list fetched in two ways** — Adventures: buildStoryCandidates() + tryFetch; Next route GET /api/stories tries multiple paths. Backend single GET /api/stories (storysvc). Different fallback chains and normalization. | `frontend/app/adventures/page.tsx`, `frontend/app/api/stories/route.ts`, `backend/storysvc/router.py` |
| **LOW** | **Auth context provided but unused** — AuthProvider in layout; no useAuth() in feature code. Mock only. | `frontend/app/layout.tsx`, `frontend/app/lib/auth/useAuth.tsx` |
| **LOW** | **Scattered localStorage key literals** — Some use LS_KEYS (GameStateContext), others hardcode "currentPageId", "storySrc", "adminMode", etc. Refactors can miss keys. | Multiple (see State inventory). |
| **LOW** | **RestartButton admin URL** — RestartButton fetches `${apiBase}/admin/restart`; backend mounts admin router with prefix /api, so effective route is /api/admin/restart. Frontend may 404 unless apiBase includes /api or backend adds a non-prefixed route. | `frontend/app/components/RestartButton/RestartButton.tsx`, `backend/main.py`, `backend/routers/admin.py` |

---

## Critical flows (summary)

### Start story

- **LandingPage “Start”:** Sets storySrc, storyTitle, currentPageId (firstPageId) in LS; setCurrentPageId(firstPageId). User then navigated (or same page re-renders; RootPageClient shows StoryPage when hasValidStory && currentPageId !== "landing").
- **CampaignCard “Play”:** Sets storySrc, currentPageId (startPageId), storyTitle, runePackByCampaignId in LS; typically router.push to story or landing. GameStateContext hydrates from LS on next load.
- **Story route with ?src=&start=:** StoryPageClient writes src, title, start to LS; if ?c= and !src, GET /stories → find by id → write item.jsonSrc, title, startPageId to LS. GameStateProvider hydrates; StoryPage useEffect (params) sets setGlobal(storySrc, …), localStorage, and goToNextPage(start).
- **Embed with ?src=&start=:** Embed page writes src, title, start to LS. No list fetch. StoryPage renders; context hydrates from LS; StoryPage params effect can override with query again.

**Contract gap:** No single “start story” API; LS keys written from many places; startPageId vs currentPageId both used.

### Load page

- **Trigger:** currentPageId in GameStateContext changes (user or effect).
- **Effect (GameStateContext):** hydrated && currentPageId && storySrc → build url = `${base}/page/${currentPageId}?src=${storySrc}`; fetch(url); on 200: logic/needsFragment/needsFragmentAny handling (possibly setCurrentPageId(redirect) and return); else normalize page → setCurrentPageData(normalized); optional meta refresh fetch(storyJson).
- **Backend:** GET /page/{page_id}?src= → _normalize_src_to_path(src), _load_story(), find page in story (dict or recursive), _build_page_response_for(), get_page_cached().
- **StoryPage:** Renders from currentPageData (and currentPageId); branches by page type (transition, video, content/choice, puzzle, riddle, runes, …).

**Contract:** Page payload shape is backend contract; context expects id, next, choices, logic, fragments, audio, imagePrompt, etc.

### Change page

- **User choice:** ChoiceButtons or similar calls handleChoice(next, …) or goToNextPage(next). handleChoice (StoryPage): trackChoice/trackUiClick; reward.setGlobal; unlocks; resolve next (choice.next or page.next or onAnswer.nextSwitch); localStorage.setItem("currentPageId", next); goToNextPage(next).
- **goToNextPage (context):** setCurrentPageId(nextPageId) → setCurrentPageIdState + localStorage.setItem(LS_KEYS.page, next).
- **Effect (context):** currentPageId changed → same “Load page” effect runs → fetch new page → setCurrentPageData.
- **Other triggers:** logic.ifHasFragment/elseGoTo in page payload; needsFragment(Any) block → setCurrentPageId("landing"); TransitionVideo on end → goToNextPage(nextPageId); RestartButton → resetGame + setCurrentPageId(startPageId) + LS.

**Contract:** next can be string or { switch, cases, default }; resolveNextFromPage(page, globals) used for switch. Choice can have next; page can have next or onAnswer.nextSwitch.

---

**End of audit.** No code was modified.

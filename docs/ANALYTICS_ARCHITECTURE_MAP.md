# Analytics Architecture Map

**Forensic map: Frontend → Backend → Storage → Reporting.** No refactors; exact paths and symbols.

---

## A) File map table

| Path | Role | Key symbols |
|------|------|-------------|
| `frontend/app/lib/analytics.ts` | **FE emitter** | `pushEvent`, `baseEvent`, `trackPageEnter`, `trackPageExit`, `trackChoice`, `trackUiClick`, `trackGameComplete`, `trackCtaShown`, `trackCtaClick`, `trackPuzzleTry`, `trackPuzzleResult`, `trackRuneUnlock`, `trackMediaStart`, `trackMediaStop`; `getOrCreateUserId`, `getOrCreateSessionId`, `startNewRunSession`, `startNewRunId`, `getRunIdFromSessionStorage`; `setTerminalPages`, `inferTerminalPagesFromStory`; `prepareBatch`, `uploadBatch`; `rollupDaily` (client); `window.__an` (dump, events, prepare, upload, clear, reload, flush). |
| `frontend/app/lib/analyticsSchema.ts` | **FE types** | `AnalyticsEventType`, `AnalyticsEvent`, `GenericProps`, `StorageShape`, `DailyRollup`, `Counters`. |
| `frontend/app/components/StoryPage/StoryPage.tsx` | **FE triggers** | `trackPageEnter`, `trackPageExit` (useEffect on pageData.id; visibilitychange); `trackChoice`, `trackUiClick` (handleChoice); `setTerminalPages` + `inferTerminalPagesFromStory` (useEffect when globals.loadedStory/storyJson); `endTrackedRef` guard (no double complete from separate effect). |
| `frontend/app/components/ChoiceButtons/ChoiceButtons.tsx` | **FE triggers** | `trackChoice`, `trackUiClick` (on choice click). |
| `frontend/app/components/layout/ActionBar/ActionBar.tsx` | **FE triggers** | `trackUiClick` (toggle, skip, replay, mute, restart, etc. — control string). |
| `frontend/app/components/RestartButton/RestartButton.tsx` | **FE triggers** | `startNewRunSession`, `startNewRunId` (before reset); `trackUiClick(..., "restart_click", ...)`; after reset calls `startNewRunSession` again. |
| `frontend/app/components/CampaignCta/CampaignCta.tsx` | **FE triggers** | `trackCtaShown`, `trackCtaClick`. |
| `frontend/app/components/labs/SkipButton/SkipButton.tsx` | **FE triggers** | `trackUiClick` (skip). |
| `frontend/app/components/labs/ReplayButton/ReplayButton.tsx` | **FE triggers** | `trackUiClick` (replay_click). |
| `frontend/app/components/labs/PuzzleRunes/PuzzleRunes.tsx` | **FE triggers** | `trackPuzzleResult`. |
| `frontend/app/components/AudioPlayer.tsx` | **FE triggers** | `trackMediaStart`, `trackMediaStop`. |
| `frontend/app/core/cta/ctaDispatcher.ts` | **FE triggers** | `trackUiClick` (CTA). |
| `frontend/app/lib/GameStateContext.tsx` | **FE identity** | Calls `initAnalyticsForStory`, `setStoryMeta`, `getOrCreateSessionId`, `startNewRunSession`, `getOrCreateRunId` (local), `startNewRunId` (from analytics); sets `sessionId`, `runId` state; `runStorageKey` = `q_an:${storyId}:${scope}:runId_v1` (same as analytics). When `runKey` in globals/URL: `startNewRunSession`; else `getOrCreateSessionId`. RunId read from sessionStorage; on “arrived to start page” calls `startNewRunId` and `setRunId`. |
| `frontend/app/components/AnalyticsSync/AnalyticsSync.tsx` | **FE upload** | `uploadBatch(storyId, ENDPOINT)` on interval (30s), visibilitychange, pagehide, beforeunload. |
| `backend/main.py` | **BE ingest + storage + rollup** | `post_analytics_batch` (POST `/api/analytics/batch`); `_story_analytics_dir(story_id)` → `ANALYTICS_DIR/{sanitized_story_id}/`; write `{day}.jsonl` (append); `list_analytics_days`, `get_analytics_day`; `rollup_day` (GET `/api/analytics/rollup`); `rollup_range` (GET `/api/analytics/rollup-range`). `AnalyticsEventModel`, `AnalyticsBatch`. |
| `backend/main.py` (config) | **BE storage path** | `ANALYTICS_DIR` = env `ANALYTICS_DIR` or `{BASE_DIR}/data/analytics`. |

---

## B) Event contract table

| event_name | Required fields | Optional fields | Sent from (file / function) |
|------------|-----------------|-----------------|-----------------------------|
| **page_enter** | storyId, sessionId, pageId, t, ts, id | refPageId, props (runId, userId, domain, rawPageId, pageType, endAlias) | StoryPage useEffect (when pageData.id/currentPageId changes): `trackPageEnter(derivedStoryId, derivedSessionId, pageId, lastPageRef.current, { runId, rawPageId, pageType, endAlias })`. Completion: if terminal → `trackGameComplete` (guarded by `completedSessions`). |
| **page_exit** | storyId, sessionId, pageId, t, ts, id | props.dwellMs | StoryPage: cleanup of same useEffect; and visibilitychange handler. |
| **choice_select** | storyId, sessionId, pageId, t, ts, id | props (choiceId, label, latencyMs, runId, nextPageId, userId, domain) | StoryPage `handleChoice` → `trackChoice`; ChoiceButtons on choice click. |
| **ui_click** | storyId, sessionId, pageId, t, ts, id | props (control, runId, label, latencyMs, userId, domain, …) | ActionBar (control e.g. action_skip, actionbar_toggle), RestartButton (restart_click), SkipButton, ReplayButton, ChoiceButtons (choice:*), ctaDispatcher. |
| **game:complete** | storyId, sessionId, t, ts, id; pageId set to `__END__` | props (reason, endAlias, userId, domain) | analytics.ts `trackGameComplete`. Called only from inside `trackPageEnter` when `isTerminal` and `!completedSessions.has(key)`. |
| **cta_shown** | storyId, sessionId, pageId, t, ts, id | props (userId, domain) | CampaignCta.tsx when CTA is shown. |
| **cta_click** | storyId, sessionId, pageId, t, ts, id | props (userId, domain) | CampaignCta.tsx on CTA click. |
| **puzzle_try** | storyId, sessionId, pageId, t, ts, id | props (puzzleId, attempt) | Defined in analytics.ts; no grep hit in app (likely RiddleQuiz or other lab). |
| **puzzle_result** | storyId, sessionId, pageId, t, ts, id | props (puzzleId, isCorrect, attempt, durationMs) | PuzzleRunes.tsx `trackPuzzleResult`. |
| **rune_unlock** | storyId, sessionId, pageId, t, ts, id | props (runeId) | StoryPage (unlockRunes on page enter; rune unlock from puzzle). |
| **media_start** / **media_stop** | storyId, sessionId, pageId, t, ts, id | props (mediaId, kind: voice\|sfx\|bgm\|video) | AudioPlayer.tsx. |

**Base event shape (all):** `id`, `t`, `ts`, `storyId`, `sessionId`, `pageId?`, `refPageId?`, `props?`. `baseEvent()` adds `userId`, `domain`, and `runId` (from props or `getRunIdFromSessionStorage(storyId)`) into `props`.

---

## C) Identity model: sessionId vs runId — lifecycle + storage keys

### sessionId

- **Meaning:** One “visit” to a story (browser session–scoped; can span tabs if same storage).
- **Generated:** `startNewRunSession(storyId, scopeKey)` → `sess_` + uid(); or `getOrCreateSessionId(storyId, scopeKey)` which returns existing or calls `startNewRunSession`.
- **Storage:** **localStorage**  
  - Key: `q_an:${storyId}:${scopeKey}:sessionId_v2`  
  - Timestamp key: `q_an:${storyId}:${scopeKey}:sessionTs_v2` (refreshed on use; TTL 30 min).
- **When it changes:**  
  - **New session:** (1) `GameStateContext` when story loads and `globals.runKey` is set (e.g. restart query) → `startNewRunSession`. (2) `RestartButton` handleRestart: calls `startNewRunSession(storyId, scopeKey)` before reset and again after reset. (3) `getOrCreateSessionId` when TTL exceeded (age > SESSION_TTL_MS) → `startNewRunSession`.  
- **Scope key:** `accountId` \|\| `tenantId` \|\| `embedKey` \|\| `window.location.host` \|\| `"default"`.

### runId

- **Meaning:** One “play-through” (run) within a session; restarts get a new runId.
- **Generated:** `startNewRunId(storyId, scopeKey)` → `run_` + uid(); or read from sessionStorage (no “getOrCreate” in analytics.ts for run—only create on new session or explicit restart).
- **Storage:** **sessionStorage**  
  - Key: `q_an:${storyId}:${scopeKey}:runId_v1`  
  - Same key used in `frontend/app/lib/GameStateContext.tsx` (`runStorageKey`).
- **When it changes:**  
  - (1) **New session:** `startNewRunSession` calls `startNewRunId` → new runId.  
  - (2) **RestartButton:** calls `startNewRunId(storyId, scopeKey)` (and `startNewRunSession`) so restart gets new run + new session.  
  - (3) **GameStateContext “arrived to start” effect:** when `currentPageId === startPageId` and `prev !== startId` (user navigated back to start), calls `startNewRunId` and `setRunId(newRun)` (session unchanged).  
- **Context state:** GameStateContext holds `sessionId` and `runId` in React state; runId is read from sessionStorage on init (effect that calls getOrCreateSessionId / startNewRunSession) and after that updated when startNewRunId is called (RestartButton or “arrived to start” effect).

### Other identity

- **userId:** `getOrCreateUserId()` → `u_` + uid(); stored in **localStorage** key `qz_user_id`; added to every event’s `props` by `baseEvent`.

---

## D) When events are fired — and dedupe/guards

### Page enter / exit

- **Fired:** In StoryPage, a single `useEffect` depending on `derivedStoryId`, `derivedSessionId`, `currentPageId`, `pageData?.id`, etc. On run: exits previous page (trackPageExit with dwellMs), then trackPageEnter for current pageId (with refPageId = lastPageRef). Cleanup of the effect runs trackPageExit again for the same page. Also: `visibilitychange` → trackPageExit when document becomes hidden.
- **Completion:** Inside `trackPageEnter`, if page is terminal (terminalPagesByStory has pageId, or pageType === "end"), and `!completedSessions.has(\`${storyId}::${sessionId}\`)`, then `completedSessions.add(key)` and `trackGameComplete(...)`. So **one game:complete per session** for terminal.
- **Dedupe (FE):** `pushEvent` in analytics.ts: if the last event in the bucket has same `t`, `pageId`, `refPageId`, and same `props` (JSON stringify) and within `MERGE_WINDOW_MS` (300 ms) of `e.ts`, the new event is dropped.

### Choice / UI

- **Choice:** StoryPage `handleChoice` and ChoiceButtons: trackChoice + optionally trackUiClick with latency. No dedupe beyond pushEvent merge window.
- **Restart:** RestartButton: trackUiClick(restart_click); then startNewRunSession + startNewRunId; then reset + setCurrentPageId; then startNewRunSession again; then navigate with `?rs=`.

### Top 3 riskiest double-send scenarios

1. **page_exit twice for the same page**  
   **Where:** StoryPage: the same useEffect has a cleanup that calls trackPageExit(lastPageRef, dwell). If the effect re-runs (e.g. dependency change) before unmount, both the previous cleanup and the new “enter” run can fire; then the new run does exit(previous) + enter(current). If dependencies flip rapidly (e.g. derivedStoryId/derivedSessionId/currentPageId), you can get two exits for the same page (once in cleanup, once as “ref” when entering next page).  
   **Files:** `frontend/app/components/StoryPage/StoryPage.tsx` (useEffect with trackPageExit in body and in cleanup).

2. **game:complete theoretically twice**  
   **Where:** Completion is guarded by `completedSessions` in memory. If the user hits two different terminal pages in the same session (e.g. branching ends), the first terminal triggers game:complete; the second would also be “terminal” and would call trackGameComplete again because the guard is per `storyId::sessionId` and we only add the key once—but we do add it before calling trackGameComplete, so the second terminal page_enter would see completedSessions.has(key) and not call trackGameComplete. So actually single. Risk: if trackPageEnter is called twice in quick succession for the same terminal page (e.g. strict mode double-mount or effect running twice), the first call adds to completedSessions and fires game:complete; the second might still pass the guard if the second call is synchronous before completedSessions is updated—unlikely. Bigger risk: **endTrackedRef** in StoryPage is a separate guard that only sets endTrackedRef.current = true for “end” pages and does NOT call trackGameComplete (comment says “trackPageEnter már pageType:end-et kap”). So completion is intentionally only from trackPageEnter’s terminal branch.  
   **Files:** `frontend/app/lib/analytics.ts` (completedSessions), `frontend/app/components/StoryPage/StoryPage.tsx` (endTrackedRef).

3. **restart_click + new run/session, then another page_enter with old sessionId**  
   **Where:** RestartButton calls startNewRunSession (and startNewRunId), then resetGame/setCurrentPageId, then startNewRunSession again, then router.push with rs=. If the component tree doesn’t remount immediately, the next StoryPage effect might still have the old derivedSessionId/derivedRunId for one frame and send a page_enter with the old session/run before context updates. So one last page_enter could be attributed to the old run/session right before navigation.  
   **Files:** `frontend/app/components/RestartButton/RestartButton.tsx`, `frontend/app/lib/GameStateContext.tsx`, `frontend/app/components/StoryPage/StoryPage.tsx`.

---

## E) Backend ingest + storage

### Endpoint

- **POST /api/analytics/batch**  
  - **File:** `backend/main.py`, `post_analytics_batch(batch: AnalyticsBatch, request: Request)`.  
  - **Input:** `AnalyticsBatch`: storyId, userId?, device?, events (list of AnalyticsEventModel), domain?.  
  - **Event model:** id?, t, ts?, storyId?, sessionId, runId?, pageId?, refPageId?, props?.

### Normalization (server)

- storyId on event: fallback to batch.storyId.  
- ts: fallback to server now (ms).  
- id: fallback `{sessionId}:{t}:{ts}`.  
- runId: from event.runId, event.rid, or props.runId/rid; promoted to top-level and back into props.  
- props.domain: fallback to batch.domain or Host header.

### Write path and format

- **Directory:** `_story_analytics_dir(batch.storyId)` → `ANALYTICS_DIR / sanitized_story_id`.  
  - `ANALYTICS_DIR` = env `ANALYTICS_DIR` or `os.path.join(BASE_DIR, "data", "analytics")`.  
- **Files:** One file per calendar day (UTC): `{day}.jsonl` (e.g. `2025-03-04.jsonl`).  
- **Format:** JSONL. Each batch write: one **header line** per day chunk:  
  `{"_type": "batch_header", "ts": "<iso>Z", "storyId": "...", "userId": "...", "device": {...}, "domain": "...", "count": N}`  
  then one line per event (same as normalized event object, no _type).  
- **Append:** All writes are append (`open(..., "a")`). No server-side dedupe by event id; duplicate events can be written if client sends them twice.

---

## F) Reporting / rollups

### Endpoints

- **GET /api/analytics/days** — `list_analytics_days(storyId)` → list of day strings (from filenames `*.jsonl`).  
- **GET /api/analytics/day** — `get_analytics_day(storyId, day)` → raw lines of that day’s JSONL.  
- **GET /api/analytics/rollup** — `rollup_day(storyId, day)` → single-day rollup (sessions, users, pages, totals, topPages, domains).  
- **GET /api/analytics/rollup-range** — `rollup_range(storyId, from, to, terminal?)` → range rollup with run-level completion, restart, drop-off, outcomes, paths.

### Grouping keys

- **Session:** `sessionId` (distinct sessions, session duration, “exits after page” = last page_enter per session).  
- **Run:** `runId` (from event or props). Runs are grouped in `per_run_events`; run–session and run–user mapping via first occurrence.  
- **Day:** Event `ts` → UTC date `YYYY-MM-DD` for daily files and DAU.

### Completion logic (rollup-range)

- **Source of truth for completion:** Event type **`game:complete`** (or legacy `game_complete`).  
  - A run is **completed** if it has at least one event with `t in ("game_complete", "game:complete")`.  
  - Backend rollup-range: `completed = any(e["t"] in ("game_complete", "game:complete") for e in evs)`; then `completed_runs += 1`.  
- **Session completion:** A session is counted as “completed” if it has `has_complete_event` (game:complete) **or** `saw_terminal` (page_enter with pageId in terminal_pages query param).  
- **Terminal pages:** From query param `terminal` (comma-separated). Or inferred per run from `_is_end_page_id`: props.isEnd, or pageId starting with `END_`/`END__` or equals `__END__`, or in terminal_pages set.

### Restart detection (rollup-range)

- **Restart run:** (1) Run has a `ui_click` event with props.control containing `"restart"` (**has_restart_event**). (2) Or the same sessionId has more than one run (**session_has_multi_runs**).  
- Counts: `restart_total_runs`, `restart_runs_with`, `restart_completed_with`, `restart_completed_without`.

### Drop-off (rollup-range)

- **drop_offs:** Run-level. Structure keyed by run; used for “last page before drop” style analytics (run that never reached game:complete / terminal).  
- **exits_after_page:** Session-level; key = last page_enter pageId in that session, value = count of sessions that “exited” from that page.

### Edge cases

- **Missing runId:** Events without runId are still counted in session and daily totals but do not appear in per_run_events; completion/restart/drop-off are run-based so those runs are invisible for run-level metrics.  
- **Duplicate events:** No server dedupe; if client sends same event twice (e.g. retry), both lines are written and both counted in rollups.  
- **Backend accepts both `game_complete` and `game:complete`** in rollup and rollup-range.

---

## G) uploadBatch (frontend/app/lib/analytics.ts)

### Max events per batch (per HTTP request)

- **Chunk size:** Each POST sends at most **50 events** per request (`const CHUNK = 50`).
- **prepareBatch** returns all *new* events (`ts > lastUploadTs`); there is no cap on how many.
- **uploadBatch** splits that payload into chunks of 50 and sends **one POST per chunk** to the same URL. If there are 120 new events, it sends 3 requests (50 + 50 + 20). Success is only when **all** chunked requests for that URL succeed; then `lastUploadTs` is updated.
- **Effective:** max events per single POST = **50**; the “batch” from the caller’s perspective can be arbitrarily large and is sent as multiple 50-event requests.

### Retry behavior when POST /api/analytics/batch fails

- **No retries for the same URL.** If a request fails (`!res.ok` or `fetch` throws), the code catches, sets `lastError`, and **continues to the next URL** in the list. It does not retry the same endpoint.
- **Endpoint order:** `[endpoint, envBatch, prodApi, ...(dev ? [devFastApi])].filter(Boolean)` — explicit `endpoint` → `NEXT_PUBLIC_API_BASE` batch URL → `NEXT_PUBLIC_ANALYTICS_FALLBACK` → in dev only `http://127.0.0.1:8000/api/analytics/batch`.
- **On failure:** All chunks are re-sent to the next URL (no per-endpoint partial success).
- **When all endpoints fail:** Returns `{ ok: false, tried: endpoints, queued: payload.events.length, error }`. **`lastUploadTs` is not updated**, so the same events remain “new” next time.
- **Effective retry:** The next time `uploadBatch(storyId)` runs (AnalyticsSync interval, visibility, pagehide), `prepareBatch` again returns events with `ts > lastUploadTs`, so the same unsent events are sent again. No explicit retry counter or backoff.

### Offline handling

- **No explicit offline detection** (no `navigator.onLine`, no separate offline queue).
- **When network fails:** All endpoint attempts can fail (e.g. 44s timeout or network error). `uploadBatch` returns `ok: false`; `lastUploadTs` is not updated. Events remain in the in-memory + localStorage queue (`storyBucket(storyId).events`, persisted via `saveSoon()` → `localStorage.setItem(LS_KEY, JSON.stringify(mem))`, `LS_KEY = "qz_analytics_v1"`).
- **Recovery:** When back online, the next `uploadBatch` (e.g. next 30s tick or visibility) will resend all events with `ts > lastUploadTs`.
- **Summary:** Offline = all endpoints fail; events stay in the single queue (memory + localStorage) and are resent on the next upload attempt.

### Queue size limit

- **Limit:** **5,000 events per story** (`MAX_EVENTS_PER_STORY = 5000`).
- **Where:** In `pushEvent`, after `arr.push(e)`, if `arr.length > MAX_EVENTS_PER_STORY` then `arr.splice(0, arr.length - MAX_EVENTS_PER_STORY)` — oldest events are dropped so the queue keeps only the newest 5,000.
- **Scope:** Per story (`storyBucket(storyId).events`).
- **Interaction with upload:** If the queue stays full (e.g. backend always fails), new events keep being added and the oldest are dropped; **oldest events can be lost before they are ever uploaded**. After a successful upload, `lastUploadTs` is set so those events are no longer in “newEvents”; the queue can shrink until it fills again.
- **Timeout:** 44s per endpoint attempt (`setTimeout(() => ac.abort(), 44000)`).

---

## H) rollup_range (backend/main.py) — complexity, memory, worst case, optimizations

### Algorithm complexity (relative to event count)

**Notation:** E = total events in the date range, S = distinct sessions, R = distinct runs, D = number of days in `[from, to]`.

| Phase | What it does | Time complexity |
|-------|----------------|------------------|
| **1. Read day files** | For each day in range, open `{day}.jsonl`, for each line parse JSON and append to `per_session_events[sid]` and `per_run_events[rid]`; update sets/totals. | **O(E)** for parsing and updates; I/O O(E) lines. |
| **2. Session loop** | For each session, sort its event list then scan for duration, completion, last page_enter. | Worst case **O(E log E)** (e.g. each event its own session); typical **O(E log(E/S))**. |
| **3. session_run_counts** | One pass over `run_session`. | **O(R)**. |
| **4. Run loop** | For each run, sort its event list then multiple passes (seq, completion, CTA, step_transitions, paths, drop_offs). | Worst case **O(E log E)** (one run has all events); typical **O(E log(E/R))**. |
| **5. Output building** | Iterate over page_views, choice_counts, end_pages, outcomes, paths, steps, domains; sort and trim. | **O(S + R + P + …)** — dominated by number of keys. |

**Overall time:** **O(E log E)** in event count (from the two sort phases). **Memory:** **O(E)** — dominated by `per_session_events` and `per_run_events` (each event stored in two lists as a small dict), so ~2E event-sized objects.

### Worst case when story has millions of events

- **Memory:** Millions of events ⇒ hundreds of MB to ~1 GB for the two timeline dicts. Risk of **OOM** on a single worker.
- **CPU:** O(E log E) for E = 10^6–10^7 ⇒ tens to hundreds of millions of comparisons; endpoint can become **slow** or **time out** (e.g. 30–60 s gateway).
- **I/O:** Reading millions of lines from JSONL files adds substantial disk time.
- **No caps:** No limit on date range or E; a large `from`–`to` can load and process all events in that range.

### Potential optimization strategies

- **Pre-aggregate by day:** Run something like `rollup_day` on ingest or a nightly job; store per-day rollups. **rollup-range** then **merges** daily rollups for the range instead of re-reading all raw events. Trade-off: run/session-level detail (paths, step_transitions, drop_offs) would need to be computed only for a recent window or dropped for long ranges.
- **Limit scope:** Cap date range (e.g. max 90 or 365 days) or cap events (e.g. stop after E_max events, return `truncated: true`). Reduces E and memory.
- **Streaming / single-pass where possible:** Totals and DAU can be computed in one pass without building `per_session_events` / `per_run_events`. Split: one pass for totals/DAU; optional second pass (or bounded window) for run/session-level metrics only.
- **Database or search index:** Ingest into a DB with indexes on (storyId, day, sessionId, runId, ts); use window/analytic functions for session/run grouping and ordering. Enables pagination and scalable rollup-range.
- **Lighter in-process:** Sort session/run lists only for sessions/runs that contribute to returned outputs; store each event once then distribute to session/run groups to reduce copies.
- **Async / background job:** For large ranges, return 202 + job id, compute rollup-range in a worker, expose a poll or webhook for the result; avoids long-running request and timeouts.

---

## I) Minimal 5-file list (for portfolio use case)

1. **frontend/app/lib/analytics.ts** — Emitter, identity, pushEvent/baseEvent, all track* functions, prepareBatch/uploadBatch, setTerminalPages/inferTerminalPagesFromStory, completedSessions guard, window.__an.  
2. **frontend/app/lib/analyticsSchema.ts** — Event types, AnalyticsEvent, StorageShape.  
3. **frontend/app/components/StoryPage/StoryPage.tsx** — trackPageEnter/trackPageExit effect, handleChoice (trackChoice/trackUiClick), setTerminalPages/inferTerminalPagesFromStory effect, endTrackedRef.  
4. **frontend/app/components/AnalyticsSync/AnalyticsSync.tsx** — uploadBatch schedule and visibility/pagehide.  
5. **backend/main.py** — From `ANALYTICS_DIR` / `_story_analytics_dir` through `post_analytics_batch` (normalize, by_day, write JSONL), and the rollup_range run/session completion and restart logic (per_run_events, has_complete_event, has_restart_event, session_has_multi_runs).

---

## J) Full event lifecycle (step-by-step pipeline)

### Diagram (Mermaid)

```mermaid
flowchart TB
  subgraph FE["Frontend"]
    A1[User action / page change]
    A2[track* called: trackPageEnter, trackChoice, trackUiClick, ...]
    A3[baseEvent: add id, ts, userId, domain, runId]
    A4[pushEvent: dedupe 300ms window, append to storyBucket.events]
    A5[LRU trim: if > 5000 events, drop oldest]
    A6[saveSoon: debounce 400ms → localStorage qz_analytics_v1]
    A1 --> A2 --> A3 --> A4 --> A5 --> A6
  end

  subgraph BATCH["Batching & upload triggers"]
    B1[AnalyticsSync: interval 30s / visibility / pagehide / beforeunload]
    B2[uploadBatch storyId]
    B3[prepareBatch: events where ts > lastUploadTs]
    B4[Split into chunks of 50]
    B5[POST each chunk to endpoint list until success]
    B6[On success: set lastUploadTs = max ts → saveSoon]
    B1 --> B2 --> B3 --> B4 --> B5 --> B6
  end

  subgraph BE["Backend ingestion"]
    C1[POST /api/analytics/batch]
    C2[For each event: normalize storyId, ts, id, runId, props.domain]
    C3[Group events by day = UTC from ts]
    C4[For each day: append to ANALYTICS_DIR/{story_id}/{day}.jsonl]
    C5[Write: 1 header line + N event lines per day]
    C1 --> C2 --> C3 --> C4 --> C5
  end

  subgraph STORAGE["Storage"]
    D1[(JSONL files: {day}.jsonl per story)]
  end

  subgraph REPORT["Reporting"]
    E1[GET rollup_range: from, to, terminal?]
    E2[Read all {day}.jsonl in range → per_session_events, per_run_events]
    E3[Session loop: sort, duration, completion, exits_after_page]
    E4[Run loop: sort, completion, paths, drop_offs, outcomes]
    E5[Return totals, DAU, topPages, paths, steps, domains, ...]
    F1[GET rollup_day: storyId, day]
    F2[Read single {day}.jsonl, single pass]
    F3[Count by t: page_enter, choice_select, game:complete, ...]
    F4[Return sessions, users, totals, topPages, domains]
    E1 --> E2 --> E3 --> E4 --> E5
    F1 --> F2 --> F3 --> F4
  end

  FE --> BATCH
  BATCH --> BE
  BE --> STORAGE
  STORAGE --> REPORT
```

### Step-by-step pipeline

**1. Frontend — Event creation**

1. **Trigger:** User action (page change, choice click, UI click, CTA, media start/stop, puzzle result, rune unlock) or page lifecycle (visibility hidden).
2. **Call:** Component invokes a `track*` function (e.g. `trackPageEnter`, `trackChoice`, `trackUiClick`) with storyId, sessionId, pageId, and optional payload (refPageId, control, choiceId, label, latencyMs, etc.).
3. **Build event:** `baseEvent(storyId, sessionId, t, pageId, refPageId?, props?)` adds:
   - `id`: `e_` + random
   - `ts`: `Date.now()`
   - `props.userId` from `getOrCreateUserId()`
   - `props.domain` from `window.location.hostname`
   - `props.runId` from caller or `getRunIdFromSessionStorage(storyId)`
4. **Terminal completion:** For `trackPageEnter`, if page is terminal and `!completedSessions.has(storyId::sessionId)`, add key and call `trackGameComplete` → one more event (`game:complete`, pageId `__END__`).

**2. Frontend — Queueing**

5. **Push:** `pushEvent(e)` appends to `storyBucket(storyId).events` (in-memory `load()` → `mem.stories[storyId].events`).
6. **Dedupe:** If the last event in the array has same `t`, `pageId`, `refPageId`, same `props` (JSON stringify), and `e.ts - last.ts <= MERGE_WINDOW_MS` (300 ms), skip append.
7. **Cap:** If `arr.length > MAX_EVENTS_PER_STORY` (5000), `arr.splice(0, arr.length - 5000)` — drop oldest.
8. **Persist:** `saveSoon()` schedules a 400 ms debounced write: `localStorage.setItem("qz_analytics_v1", JSON.stringify(mem))`.

**3. Frontend — Batching**

9. **Prepare:** `prepareBatch(storyId)` reads `storyBucket(storyId)`, takes events with `ts > lastUploadTs` (from `b.meta.lastUploadTs`), maps to `{ id, t, ts, storyId, sessionId, pageId, refPageId, props }`, returns `{ storyId, userId, device, domain, events }`.
10. **Chunk:** No cap on how many events; upload sends them in chunks of **50** per HTTP request.

**4. Frontend — Upload triggers**

11. **Schedule:** `AnalyticsSync` (mounted with storyId) runs `uploadBatch(storyId, ENDPOINT)`:
    - **Interval:** every `intervalMs` (default 30 s).
    - **Visibility:** on `document.visibilitychange` → when visible, call `uploadBatch`.
    - **Page unload:** on `pagehide` and `beforeunload`, call `uploadBatch` (best-effort, keepalive).
12. **Send:** For each endpoint in list (endpoint, envBatch, prodApi, devFastApi), POST chunks of 50 until all succeed or all endpoints fail. Timeout 44 s per endpoint.
13. **Success:** Set `b.meta.lastUploadTs = max(ts)` of uploaded events; `saveSoon()`. Next prepareBatch will only include events after that ts.

**5. Backend — Ingestion**

14. **Receive:** `POST /api/analytics/batch` → body `AnalyticsBatch` (storyId, userId?, device?, events[], domain?).
15. **Normalize each event:** storyId ← event.storyId or batch.storyId; ts ← event.ts or server now (ms); id ← event.id or `{sessionId}:{t}:{ts}`; runId from event or props, then promote to top-level and ensure in props; props.domain ← batch_domain or Host header.
16. **Group by day:** For each normalized event, `day = UTC(ts).strftime("%Y-%m-%d")`; group into `by_day[day]`.

**6. Backend — Storage**

17. **Directory:** `_story_analytics_dir(storyId)` → `ANALYTICS_DIR / sanitized_story_id` (e.g. `data/analytics/my_story/`).
18. **Write:** For each day with events, open `{day}.jsonl` in append mode; write one line `json.dumps(batch_header)` (with _type, ts, storyId, userId, device, domain, count), then one line per event `json.dumps(obj)`.
19. **No dedupe:** Duplicate events (e.g. client retry) are appended as-is.

**7. Reporting — rollup_day**

20. **Request:** `GET /api/analytics/rollup?storyId=...&day=YYYY-MM-DD`.
21. **Read:** Open `ANALYTICS_DIR/{story_id}/{day}.jsonl`, read all lines.
22. **Single pass:** For each line: parse JSON; skip batch_header (optionally collect userId for DAU); for events, update sets (sessions, users, pages), counters (pageViews, choices, puzzles, runes, media, completions, ctaShown, ctaClicks), and pageViews map.
23. **Response:** Return storyId, day, sessions count, users count, pages count, totals, topPages, domains.

**8. Reporting — rollup_range**

24. **Request:** `GET /api/analytics/rollup-range?storyId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&terminal=...`.
25. **Read:** For each day in [from, to], open `{day}.jsonl`; for each line append to `per_session_events[sid]` and `per_run_events[rid]` (and update sets, totals, DAU, page_views, choice_counts, domains).
26. **Session loop:** For each session, sort events by ts; compute duration, has_complete_event, saw_terminal, last page_enter; update completed_sessions, exits_after_page.
27. **Run loop:** For each run, sort events by ts; build page_enter seq, end_flags, completion, restart (ui_click restart or session has multiple runs); update end_pages, outcomes, paths, step_transitions, drop_offs, path_conv, restart stats.
28. **Response:** Return totals, DAU series, session/run/user counts, completion_rate, top pages (with exitRate), choices, end_pages, outcomes, paths (top 20), steps (top 30), domains, drop_offs (top 20), path_conversion, restart stats.

---

*No code was modified; all references are to the current repo.*



Event Analytics Pipeline
Overview

Interactive applications generate large volumes of behavioral events such as page navigation, user decisions, UI interactions, and media activity.

In many systems these events are sent directly to third-party analytics tools, limiting flexibility and preventing deeper behavioral analysis.

To address this limitation, I designed and implemented a custom event analytics pipeline that captures user interactions on the frontend, batches and uploads them to the backend, stores them in an append-only event log, and exposes reporting endpoints for analysis.

The system is designed as a lightweight full-stack telemetry pipeline optimized for interactive experiences.

Problem

Traditional analytics systems are not designed for complex interactive applications.

Common limitations include:

events sent individually, increasing network overhead

lack of control over event structure

difficulty tracking multi-step user journeys

inability to reconstruct complex interaction flows

dependency on external analytics platforms

In interactive systems such as decision journeys or narrative flows, it is important to capture fine-grained behavioral data while maintaining performance and reliability.

A custom analytics pipeline allows full control over event structure, storage, and reporting.

Solution

The solution was to design a client-to-server event analytics pipeline consisting of four stages:

Frontend Event Tracking
        ↓
Client Event Queue
        ↓
Batch Upload API
        ↓
Append-Only Event Storage

The system captures events in the browser, temporarily stores them in a local queue, periodically uploads them to the backend, and stores them in structured event logs.

This architecture provides full control over event data while minimizing network overhead.

Architecture

The analytics pipeline spans both frontend and backend layers.

Frontend

React / Next.js application

custom analytics module (analytics.ts)

event queue stored in memory and localStorage

periodic batch uploads

Backend

FastAPI backend

ingestion endpoint for analytics batches

append-only JSONL event storage

reporting endpoints for rollups

Storage

Events are stored as JSONL log files grouped by story and day.

analytics/
   storyId/
      2025-03-04.jsonl

Each line in the file represents a single event, enabling efficient append operations and later analysis.

Event Tracking Layer

Frontend components trigger analytics events when user interactions occur.

Examples include:

trackPageEnter
trackChoice
trackUiClick
trackGameComplete
trackCtaClick
trackPuzzleResult
trackMediaStart

Each event is normalized through a shared helper:

baseEvent()

This function enriches events with metadata such as:

timestamp

user identifier

session identifier

run identifier

domain

Events are then added to the local queue.

Client Event Queue

Events are stored in a local queue before being uploaded.

Queue characteristics:

stored in memory and localStorage

maximum size of 5000 events per story

oldest events removed when the limit is reached

automatic persistence using debounced writes

Example flow:

track*
  ↓
baseEvent
  ↓
pushEvent
  ↓
local queue

This approach prevents network overhead from sending individual events.

Batch Upload System

Events are uploaded in batches to the backend.

Upload triggers include:

periodic interval (30 seconds)

browser visibility change

page unload events

The upload system splits events into chunks.

chunk size = 50 events

Each chunk is sent to the analytics API:

POST /api/analytics/batch

If a request fails, the events remain in the queue and are retried during the next upload attempt.

Backend Event Ingestion

The backend receives batches of events and normalizes them before storage.

Key steps include:

validate event structure

assign missing timestamps or identifiers

group events by day

append events to the appropriate log file

Example storage format:

{day}.jsonl

Each batch produces a header entry followed by the event records.

This append-only structure ensures fast writes and simplifies data recovery.

Result

The event analytics pipeline provides a scalable system for capturing behavioral data in interactive applications.

Key benefits include:

Efficient event capture

Events are collected locally and uploaded in batches, minimizing network overhead.

Flexible event structure

The system supports a wide range of event types including navigation, decisions, puzzles, media interactions, and UI actions.

Reliable storage

Append-only event logs provide a simple and robust storage mechanism.

Extensible reporting

The stored event data can be processed by backend reporting endpoints to generate analytics insights.

Key Technical Takeaways

This system demonstrates several important engineering patterns:

custom event tracking systems

client-side telemetry queues

batched analytics uploads

append-only event storage

decoupled analytics pipelines

These patterns enable scalable telemetry systems for complex interactive applications.

Decision Path Analytics Engine
Overview

Understanding user behavior in interactive applications requires more than simple page analytics.

In decision-based experiences, it is important to analyze:

how users navigate through flows

which choices they make

where they drop out

how often they restart

To support this analysis, I implemented a decision path analytics engine that reconstructs user journeys from raw event data and computes behavioral metrics.

The engine processes event logs and derives structured analytics such as completion rates, decision paths, and drop-off points.

Problem

Traditional analytics tools focus on page views and sessions.

However, decision-driven experiences require deeper behavioral analysis.

Challenges include:

reconstructing user paths from event streams

distinguishing multiple runs within a session

detecting restarts and incomplete flows

identifying drop-off points

computing conversion metrics across branching paths

Without a specialized analytics engine, these insights are difficult to obtain.

Solution

The solution was to implement a backend analytics engine that reconstructs user behavior from event logs.

The process works as follows:

Event logs
     ↓
Session grouping
     ↓
Run grouping
     ↓
Path reconstruction
     ↓
Behavior metrics

The system processes events within a specified time range and aggregates them into meaningful behavioral insights.

Identity Model

The analytics engine relies on a multi-level identity system.

Three identifiers are used:

userId
sessionId
runId

Their meanings:

Identifier	Description
userId	unique browser user
sessionId	single visit to a story
runId	individual playthrough

This hierarchy allows the system to distinguish between visits and repeated playthroughs.

Run Reconstruction

Runs are reconstructed by grouping events with the same runId.

For each run the engine builds a chronological event sequence:

page_enter
choice_select
ui_click
game:complete

Sorting events by timestamp allows the system to reconstruct the user’s navigation path.

Path Analysis

Once runs are reconstructed, the engine can derive navigation paths.

Example path:

page_A
 → page_B
 → page_C
 → END

The system counts how often each path occurs and identifies the most common decision sequences.

Completion Metrics

Completion is detected using the event:

game:complete

A run is considered completed if this event appears in its event sequence.

The engine calculates:

completed runs

completion rate

average run length

Restart Detection

The system identifies restart behavior using two mechanisms:

ui_click (restart control)
or
multiple runs within a session

This allows the analytics engine to distinguish between users who abandon flows and those who restart them.

Drop-Off Analysis

Drop-off points are detected by identifying runs that end without completion.

The last visited page in such runs is considered a drop-off location.

Example:

page_A
 → page_B
 → page_C
   (drop-off)

Aggregating these results highlights the points where users most frequently exit the experience.

Result

The decision path analytics engine transforms raw event logs into meaningful behavioral insights.

Key capabilities include:

Decision path reconstruction

The system rebuilds user navigation paths from event sequences.

Run-level analytics

Metrics are calculated at the run level, allowing accurate analysis of playthrough behavior.

Restart tracking

The engine identifies when users restart experiences and how often they complete them afterward.

Drop-off detection

The system highlights the points where users abandon the flow.

Key Technical Takeaways

This system demonstrates several advanced analytics patterns:

event-based behavioral analytics

run-level user journey reconstruction

decision path analysis

restart and completion tracking

large-scale log aggregation

These techniques enable deeper insights into user behavior in interactive applications.



Embeddable Campaign System
Overview

Interactive campaigns are often deployed across multiple environments such as landing pages, partner websites, or marketing platforms.

Embedding these experiences typically requires custom integration for each host environment, creating maintenance overhead and limiting reuse.

To address this challenge, I designed an embeddable campaign system that allows interactive experiences to be loaded and executed within external websites while maintaining centralized logic, analytics tracking, and content control.

The system allows campaigns to run independently of the host website while still integrating with its environment.

Problem

Marketing teams frequently need to deploy interactive content across multiple platforms.

However, traditional implementations face several limitations:

interactive experiences tightly coupled to the host website

inconsistent analytics tracking across domains

difficulty reusing the same campaign across environments

complex integration requirements for partners

risk of code duplication

These issues make it difficult to scale campaigns across multiple distribution channels.

A more robust solution requires decoupling campaign execution from the host environment.

Solution

The solution was to build an embeddable runtime architecture that allows campaigns to be loaded dynamically from a central application.

The system exposes a campaign entry point that can be embedded in external pages.

Host website
     ↓
Embed container
     ↓
Campaign runtime
     ↓
Story engine
     ↓
Analytics pipeline

The embedded runtime loads the campaign configuration and executes it within an isolated container while maintaining communication with backend services.

Architecture

The embeddable campaign system consists of several layers.

Campaign Runtime

A self-contained runtime responsible for:

loading campaign configuration

initializing the story engine

managing user interactions

sending analytics events

Embed Container

The campaign runs inside an embedded container such as:

iframe

embedded script loader

dedicated embed route

This isolates the campaign from the host page.

Backend Services

The backend provides:

campaign configuration

story content

analytics ingestion

reporting endpoints

Runtime Flow

When a campaign is embedded on an external site, the runtime initializes the experience dynamically.

User opens host page
      ↓
Embed container loads campaign runtime
      ↓
Runtime fetches campaign configuration
      ↓
Story engine initializes
      ↓
User interacts with campaign
      ↓
Analytics events sent to backend

This allows campaigns to run consistently across different host environments.

Environment Isolation

One key requirement for embedded experiences is ensuring that the campaign does not interfere with the host page.

Isolation is achieved through:

encapsulated runtime components

dedicated CSS scope

internal state management

separate analytics pipeline

The campaign operates independently while still communicating with backend services.

Cross-Domain Analytics

Because campaigns can run on external domains, the analytics system must maintain consistent identity tracking.

The embedded runtime ensures that analytics events include:

storyId
sessionId
runId
domain

This allows the backend analytics engine to group events correctly even when the campaign runs on multiple websites.

Configuration-Based Campaigns

Campaign behavior is controlled through configuration rather than code changes.

Each campaign specifies:

story identifier

starting page

configuration flags

analytics context

host environment metadata

This allows campaigns to be deployed and updated without modifying the frontend runtime.

Result

The embeddable campaign system enables interactive campaigns to run across multiple environments without duplicating application logic.

Key benefits include:

Reusable campaigns

The same campaign runtime can execute multiple interactive experiences.

Multi-domain deployment

Campaigns can be embedded on partner sites while still reporting analytics to the central platform.

Consistent analytics tracking

Events from embedded campaigns are processed by the same analytics pipeline as native experiences.

Reduced integration complexity

External sites only need to load the embed container, while the campaign logic remains centralized.

Key Technical Takeaways

This system demonstrates several important platform architecture patterns:

embeddable runtime systems

cross-domain interactive experiences

centralized campaign execution

configuration-driven deployments

analytics integration across environments

Together these components allow interactive campaigns to be distributed across multiple websites while maintaining a unified runtime and analytics infrastructure.
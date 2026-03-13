# Use Case: JSON Content Engine

**Portfolio-ready technical use case.** The app runs a JSON-driven story/flow runtime: pages are loaded as JSON, validated against a shared schema, cached, and rendered by a single renderer that branches on page type.

---

## A) File map table

| File path | Role | Key exported functions / components | Notes |
|-----------|------|-------------------------------------|--------|
| `frontend/app/components/StoryPage/StoryPage.tsx` | **Renderer** | `StoryPage` (default), `isTransitionVideoPage`, `isRiddle`, `isRunes` | Entry point that routes by `pageData.type` and `pageData.id`; maps JSON → React (TransitionVideo, NarrativePanel, ChoiceButtons, RiddleQuiz, PuzzleRunes, CampaignCta, etc.). |
| `frontend/app/lib/GameStateContext.tsx` | **Renderer + Fetch** | `GameStateProvider`, `useGameState`, `resolveNextFromPage`, `normalizeImagePrompt` | Holds `currentPageId`, `currentPageData`; **main page load** via `fetch(\`${base}/page/${currentPageId}?src=…\`)`; applies logic/needsFragment; normalizes and sets `currentPageData`. |
| `frontend/app/lib/story/fetchPageJson.ts` | **Fetch + Cache** | `fetchPageJsonCached`, `prefetchPages` | Write-through cache for page JSON; key `storyId:pageId:src` or URL; uses `getCache`/`setCache` bucket `"page"`; 18 min TTL; used for **preload** and voice/prefetch in StoryPage. |
| `frontend/app/lib/cache/frontendCache.ts` | **Fetch + Cache** | `getCache`, `setCache`, `hasFresh`, `clearExpired`, `clearAll` | In-memory + localStorage cache; buckets `skin`, `campaign`, `page`, `wl`; key prefix `mt:v1:`; TTL per record; SSR-safe. |
| `frontend/app/lib/schema/validator.ts` | **Validation** | `validateStory`, `formatErrors`, `formatWarnings` | Client-side validation: AJV + `CoreSchema.json`; optional `stripLegacyUx`; returns `{ ok, errors?, warnings? }`. |
| `frontend/app/lib/api/stories.ts` | **Validation** | `uploadStory`, `validateStoryServer` | Server validate: POST `/api/stories/validate` (file or body). Upload: POST `/api/stories/import`. |
| `frontend/schemas/CoreSchema.json` | **Validation (schema)** | — | JSON Schema Draft-07; required `schemaVersion`, `storyId`, `meta`, `pages`; `meta`: id, title; `pages`: array of Page defs (id, text, next, choices, type, logic, …). |
| `backend/schemas/CoreSchema.json` | **Validation (schema)** | — | Same schema as frontend; used by backend validator. |
| `backend/storysvc/router.py` | **Validation** | `validate_story`, `_process_story_validate_only`, `_canonicalize_story`, `_validate_against_core_schema`, `_semantic_checks` | POST `/api/stories/validate`; canonicalize (pages dict→array, nextPageId→next); Draft-07 + semantic (startPageId, next targets, CTA). |
| `backend/main.py` | **Fetch (backend)** | `get_page`, `_load_story`, `_build_page_response_for` | GET `/page/{page_id}?src=…`; loads story from STORIES_DIR; finds page (dict or recursive); builds normalized page response; `get_page_cached` for backend TTL. |
| `frontend/app/lib/GameStateContext.tsx` (types) | **Types** | `PageData`, `NextSwitch`, `FragmentData`, `ImagePromptObj` | Runtime page shape: id, type, text, next, choices, logic, fragments, audio, imagePrompt, etc. |
| `frontend/app/components/StoryPage/StoryPage.tsx` (types) | **Types** | `TransitionVideoData`, `PuzzleRiddle`, `PuzzleRunesPage` | Page-type guards and shapes for transition, puzzle/riddle, puzzle/runes. |
| `frontend/app/components/UploadStoryForm/UploadStoryForm.tsx` | **Validation (UI)** | `UploadStoryForm` | Calls `validateStory()` then `validateStoryServer()` on file select and before upload; displays errors/warnings; uploads via `uploadStory()`. |
| `backend/stories/demo_story.json` | **Example JSON** | — | Minimal valid story: schemaVersion, storyId, meta, pages (id, text, choices, next). |

---

## B) Key snippets

### 1) Renderer switch / routing logic

**File:** `frontend/app/components/StoryPage/StoryPage.tsx`

```tsx
// Type guards (lines ~346–394)
function isTransitionVideoPage(p: any): p is TransitionVideoData {
  return !!p && p.type === "transition" && p.transition?.kind === "video";
}
const isRiddle = (p: any): p is PuzzleRiddle =>
  p?.type === "puzzle" && p?.kind === "riddle";
const isRunes = (p: any): p is PuzzleRunesPage =>
  p?.type === "puzzle" && p?.kind === "runes";

// Logic-type pages: auto-evaluate rules and navigate (lines ~681–728)
useEffect(() => {
  if (!pageData || pageData.type !== "logic") return;
  const rules = Array.isArray(pageData.logic) ? pageData.logic : [];
  if (!rules.length) return;
  const chosen = (() => {
    for (const rule of rules) {
      const conds = Array.isArray(rule?.if) ? rule.if : null;
      if (!conds || !rule?.goto) continue;
      const ok = conds.every((raw: string) => {
        const t = String(raw || "").trim();
        if (t.startsWith("frag:")) return unlockedPlus.has(t.slice(5));
        if (t.startsWith("flag:")) return unlockedPlus.has(t.slice(5));
        return unlockedPlus.has(t);
      });
      if (ok) return String(rule.goto);
    }
    const fallback = rules.find((r: any) => typeof r?.default === "string");
    return fallback ? String(fallback.default) : null;
  })();
  if (chosen && chosen !== pageData.id) {
    try { localStorage.setItem("currentPageId", chosen); } catch {}
    goToNextPage(chosen);
  }
}, [pageData, unlockedPlus, goToNextPage]);

// Branch by page type (lines ~2798–2915)
if (isTransitionVideoPage(pageData)) {
  const t = pageData.transition;
  return (
    <div className={style.storyPage}>
      {/* ... */}
      <TransitionVideo pageId={pageData.id} src={t.src} nextPageId={t.nextPageId} {...} />
    </div>
  );
}
if (pageData.id === "tower_reveal_video") {
  return (/* legacy TransitionVideo with fixed assets */);
}
// Normal page: Canvas + NarrativePanel + dock (choice/riddle/runes/end CTA)
return (
  <div ref={pageRootRef} className={style.storyPage}>
    <Canvas ...>
      <NarrativePanel lines={blocks} ... />
      <dock>
        {isRiddlePage && <RiddleQuiz page={pageData} question={...} onResult={handleRiddleAnswer} />}
        {!isRiddlePage && isRunesPage && <PuzzleRunes options={...} onResult={...} />}
        {!isRiddlePage && !isRunesPage && <ChoiceButtons choices={...} onChoose={handleChoice} />}
      </dock>
    </Canvas>
  </div>
);
```

---

### 2) fetchPageJsonCached (and cache layer)

**File:** `frontend/app/lib/story/fetchPageJson.ts`

```ts
import { getCache, setCache } from "@/app/lib/cache/frontendCache";

export type FetchPageOpts = {
  storyId?: string;
  pageId?: string;
  src?: string;
  ttlMs?: number;
  revalidateSeconds?: number;
  signal?: AbortSignal | null;
  fetchInit?: RequestInit & { next?: any };
};

export async function fetchPageJsonCached<T = any>(
  url: string,
  {
    storyId,
    pageId,
    src,
    ttlMs = 18 * 60_000,
    revalidateSeconds = 60,
    signal,
    fetchInit,
  }: FetchPageOpts = {}
): Promise<T> {
  const cleanUrl = url.replace(/\s+/g, "");
  const srcKey = src ?? new URL(cleanUrl, "http://dummy.base").searchParams.get("src") ?? undefined;
  const id =
    storyId && pageId
      ? `${storyId}:${pageId}:${srcKey ?? ""}`
      : cleanUrl;

  const cached = getCache<T>("page", id);
  if (cached != null) return cached;

  const init: RequestInit & { next?: any } = { ...(fetchInit as any), signal };
  if (typeof window === "undefined") {
    const nextInit = { ...(init.next || {}) };
    if (typeof nextInit.revalidate === "undefined") nextInit.revalidate = revalidateSeconds;
    init.next = nextInit;
  }

  const res = await fetch(cleanUrl, init as any);
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${cleanUrl}`);
  const json = (await res.json()) as T;
  setCache<T>("page", id, json, ttlMs);
  return json;
}

export async function prefetchPages(entries: Array<{ url: string; storyId?: string; pageId?: string; src?: string }>, ...) {
  await Promise.allSettled(
    entries.map(({ url, storyId, pageId, src }) =>
      fetchPageJsonCached(url, { storyId, pageId, src, ttlMs, revalidateSeconds, fetchInit: {} }).catch(() => {})
    )
  );
}
```

**File:** `frontend/app/lib/cache/frontendCache.ts` (excerpt)

```ts
export type Bucket = "skin" | "campaign" | "page" | "wl" | (string & {});
type CacheRecord<T> = { exp: number; val: T };
const MEM = new Map<string, CacheRecord<unknown>>();
const LS_PREFIX = "mt:";
const keyOf = (bucket: Bucket, id: string) => `${LS_PREFIX}v1:${bucket}:${id}`;

export function getCache<T = unknown>(bucket: Bucket, id: string): T | null {
  const k = keyOf(bucket, id);
  const mem = MEM.get(k) as CacheRecord<T> | undefined;
  if (mem && mem.exp > Date.now()) return mem.val;
  const obj = safeParse<CacheRecord<T>>(localStorage.getItem(k));
  if (obj && obj.exp > Date.now()) {
    MEM.set(k, obj as CacheRecord<unknown>);
    return obj.val;
  }
  return null;
}

export function setCache<T = unknown>(bucket: Bucket, id: string, val: T, ttlMs: number): void {
  const rec: CacheRecord<T> = { exp: Date.now() + Math.max(1, ttlMs), val };
  const k = keyOf(bucket, id);
  MEM.set(k, rec as CacheRecord<unknown>);
  try { localStorage.setItem(k, JSON.stringify(rec)); } catch {}
}
```

---

### 3) Schema / validation definitions

**File:** `frontend/app/lib/schema/validator.ts`

```ts
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import CoreSchema from "../../../schemas/CoreSchema.json";
import { collectWarnings, type WarningItem } from "./deprecated";
import { stripLegacyUx, DEFAULT_STRIP_OPTS } from "./stripLegacyUx";

export type ValidateMode = "warnOnly" | "strict";
export type ValidationErrorItem = { path: string; msg: string; keyword?: string };
export type ValidationResult =
  | { ok: true; warnings: WarningItem[] }
  | { ok: false; errors: ValidationErrorItem[]; warnings: WarningItem[] };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
ajvErrors(ajv);
const validateCore = ajv.compile(CoreSchema as any);

export function validateStory(
  data: unknown,
  mode: ValidateMode = "warnOnly",
  stripLegacy: boolean = false
): ValidationResult {
  const cleaned = stripLegacy ? stripLegacyUx(data, DEFAULT_STRIP_OPTS) : data;
  const ok = validateCore(cleaned);
  const warnings = collectWarnings(cleaned);
  if (!ok) {
    const errs = (validateCore.errors || []).map((e) => ({
      path: (e.instancePath ?? e.dataPath ?? "").replace(/^\//, "").replace(/\//g, ".") || "(root)",
      msg: e.message || "Invalid",
      keyword: e.keyword,
    }));
    return { ok: false, errors: errs, warnings };
  }
  return { ok: true, warnings };
}

export function formatErrors(errors: ValidationErrorItem[]): string[] {
  return errors.map((e) => `${e.path}: ${e.msg}`);
}
```

**File:** `frontend/schemas/CoreSchema.json` (root structure)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Qzera Story Core Schema",
  "type": "object",
  "required": ["schemaVersion", "storyId", "meta", "pages"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "storyId": { "type": "string", "minLength": 1 },
    "meta": {
      "type": "object",
      "required": ["id", "title"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "title": { "type": "string", "minLength": 1 },
        "startPageId": { "type": "string" },
        "ctaPresets": { "type": "object" },
        "endDefaultCta": { "type": "string" }
      }
    },
    "pages": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/Page" }
    }
  }
}
```

**Backend:** `backend/storysvc/router.py` — POST `/api/stories/validate` calls `_process_story_validate_only`: canonicalize (`_canonicalize_story`: pages dict→array, nextPageId→next), then `_validate_against_core_schema` (Draft-07) and `_semantic_checks` (startPageId exists, next targets exist, CTA link URLs). Returns `{ ok, id, errors? }` or 400 in strict mode.

---

### 4) Story JSON example

**File:** `backend/stories/demo_story.json`

```json
{
  "schemaVersion": "1.2.0",
  "storyId": "demo_story",
  "locale": "en",
  "meta": {
    "id": "demo_story",
    "title": "Demo Story",
    "author": "Qzera",
    "description": "Minimal valid JSON to test the frontend validator success path.",
    "coverImage": "/covers/demo.png"
  },
  "pages": [
    {
      "id": "ch1_pg1",
      "text": [
        "You wake up among the ruins.",
        "A distant tower hums in the fog."
      ],
      "choices": [
        {
          "label": "Look around",
          "next": "ch1_pg2"
        }
      ],
      "sfxPlaylist": [
        { "atMs": 0, "src": "/audio/ambient.mp3" }
      ],
      "imagePrompt": "foggy ruins, mysterious tower in distance, cinematic"
    },
    {
      "id": "ch1_pg2",
      "text": "You step toward the sound, feeling the ground vibrate."
    }
  ]
}
```

*(Optional: add `meta.startPageId: "ch1_pg1"` for explicit start; engine can default to first page.)*

---

## C) Architecture summary (10 bullets)

- **Single renderer entry:** One component (`StoryPage`) receives the current page as JSON (`currentPageData`) and branches by `pageData.type` and `pageData.id` (e.g. `transition` + video, `puzzle` + riddle/runes, `logic`, or default content/choice) to render the right UI (TransitionVideo, NarrativePanel, ChoiceButtons, RiddleQuiz, PuzzleRunes, CampaignCta).
- **Page JSON from backend:** The main load path is GET `/page/{page_id}?src={storySrc}`. Backend loads the story file from disk, finds the page (flat dict or recursive in chapters), normalizes and enriches it (`_build_page_response_for`), and returns one page object. Optional backend caching via `get_page_cached`.
- **Client page cache:** Preload and prefetch use `fetchPageJsonCached`, which keys by `storyId:pageId:src` (or URL), uses a shared `getCache`/`setCache` layer (bucket `"page"`), and has an 18-minute TTL in memory + localStorage for fast repeat navigation and preload.
- **Single schema, client + server:** One JSON Schema (CoreSchema.json) is used in the frontend (AJV in `validator.ts`) and in the backend (Draft-07 in storysvc). Required root: `schemaVersion`, `storyId`, `meta`, `pages`; pages are an array of objects with `id`, optional `type`, `text`, `next`, `choices`, `logic`, etc.
- **Upload/validate pipeline:** Authors upload a story JSON file; the UI validates with `validateStory()` (client) and `validateStoryServer()` (POST `/api/stories/validate`). On success, upload goes to POST `/api/stories/import`; backend canonicalizes (e.g. nextPageId→next, pages dict→array), validates again, then writes to STORIES_DIR.
- **Navigation and branching in JSON:** Next step can be a string or a switch (`{ switch, cases, default }`) resolved from globals. Logic pages (`type: "logic"`) run rule arrays (`if` frag/flag conditions, `goto`) and redirect without user choice. Fragment/flag conditions also drive redirects and visibility (e.g. `logic.ifHasFragment`, `needsFragment`).
- **Typed page shapes in the renderer:** The renderer uses explicit type guards and inline types for transition, puzzle/riddle, and puzzle/runes so that only valid shapes reach each branch; content/choice pages use a generic `PageData`-style shape from context.
- **No SWR/React Query:** Fetch is raw `fetch` in GameStateContext for the current page and `fetchPageJsonCached` for preload; no SWR or React Query. Cache is a custom in-memory + localStorage store with TTL and versioned keys.
- **Single source of current page:** `GameStateContext` owns `currentPageId` and `currentPageData`. When `currentPageId` or `storySrc` changes, an effect builds the page URL, calls the backend, applies logic/needsFragment, then sets `currentPageData`. StoryPage only reads from context.
- **Extensible page types:** New node types (e.g. new puzzle or custom blocks) require a new branch in StoryPage and optional schema extensions; the engine does not use a separate plugin registry—branching is explicit in the renderer.

---

## D) Result

- **Reusability:** One renderer and one schema drive all story flows (marketing, adventures, embed). New stories are new JSON; new page types are new branches and optional schema defs.
- **Modularity:** Clear split: backend (load story, resolve page, validate, canonicalize), client (validate, cache, resolve next, render). Validation and cache are in dedicated modules; renderer stays the single place that maps JSON → components.
- **Performance:** Page JSON is cached (18 min TTL, memory + localStorage) and preloaded for next/voice assets. Backend can cache assembled pages. One request per page transition when cache misses.
- **Safety:** Strict validation at upload (client + server) and semantic checks (graph, startPageId, CTA URLs) reduce invalid or broken stories in production. Typed page shapes and guards in the renderer limit runtime shape errors.

---

*No code was modified; all references are to the current repo.*


JSON-Driven Interactive Content Engine
Overview

Modern interactive experiences – such as quizzes, decision journeys, or narrative flows – are often implemented as hardcoded UI logic.
This approach makes the system difficult to scale, reuse, and validate.

To solve this problem, I built a JSON-driven runtime engine that renders interactive story flows from structured content definitions.

Instead of embedding logic directly into UI code, the experience is defined as structured JSON documents, validated against a shared schema and rendered dynamically by a runtime engine.

This architecture allows entire experiences to be created, modified, and deployed without changing the frontend codebase.

Problem

Interactive content systems typically suffer from several architectural limitations.

Most implementations embed decision logic directly inside UI components.

This creates multiple problems:

content and application logic become tightly coupled

branching flows are difficult to maintain

validation of content structure is inconsistent

performance issues arise when loading large story graphs

creating new campaigns requires engineering involvement

In practice, this makes it difficult to reuse the same system for different experiences.

A more scalable solution requires separating content structure, runtime logic, and UI rendering.

Solution

The solution was to design a schema-driven content engine where interactive experiences are defined entirely as structured JSON documents.

These documents describe:

pages

branching logic

choices

conditional fragments

special page types such as puzzles or transitions

The runtime engine loads the JSON definition, validates it against a shared schema, and dynamically renders the correct UI components based on the page type.

The system architecture follows a clear pipeline:

Story JSON
     ↓
Schema Validation
     ↓
Backend Story Service
     ↓
Page API
     ↓
Frontend Cache Layer
     ↓
Story Renderer
     ↓
React UI Components

This design allows the same runtime engine to power multiple different interactive experiences.

Architecture

The system is implemented as a full-stack application.

Frontend

Next.js

React

TypeScript

The frontend contains the runtime renderer, page navigation logic, and caching layer.

Backend

Python

FastAPI

The backend is responsible for loading stories from storage, validating them, and returning page data through a dedicated API.

Data Layer

The content layer is entirely JSON-based.

Story definitions follow a shared JSON Schema which ensures that all content structures are valid before deployment.

The schema is used both client-side and server-side for validation.

Runtime Flow

When a user enters an experience, the engine loads and renders the story dynamically.

The navigation process works as follows:

User opens story
      ↓
Frontend requests page JSON
GET /page/{pageId}
      ↓
Backend loads story file
      ↓
Page JSON returned
      ↓
Renderer selects UI by page type
      ↓
User makes a decision
      ↓
Next page is resolved

Instead of downloading the full story graph, the system loads one page at a time.

This keeps payload sizes small and allows effective caching.

Schema-Driven Validation

To ensure that all stories follow the same structure, the system uses a shared JSON Schema.

Validation occurs in two stages:

Client-side validation

When authors upload a story file, the frontend validates it using AJV before sending it to the server.

Server-side validation

The backend performs an additional validation step using the same schema.

This guarantees that invalid stories cannot enter the system.

The schema defines the root structure of a story:

schemaVersion

storyId

meta

pages

Each page may contain properties such as:

text

choices

next

logic

type

This ensures consistent structure across all story definitions.

Page-Level API

Instead of returning the entire story graph, the backend exposes a page-level API.

Example endpoint:

GET /page/{pageId}?src=storyId

The backend performs the following steps:

load the story file

locate the requested page

normalize the page structure

return a single page object

Benefits of this approach:

reduced payload size

faster navigation

simpler caching

easier debugging

Custom Caching Layer

The frontend implements a lightweight caching system designed specifically for page navigation.

The cache operates in two layers:

Memory cache

Used for immediate navigation between pages.

LocalStorage cache

Used to persist recently visited pages across sessions.

Each cache entry uses a composite key:

storyId:pageId:src

Entries have a configurable TTL (time-to-live) and expire automatically.

This significantly reduces repeated API requests during navigation.

Single Renderer Architecture

The system uses a single renderer component that maps JSON page definitions to React components.

The renderer inspects the page type and selects the appropriate UI module.

Examples include:

transition → TransitionVideo
puzzle → Puzzle components
logic → automatic branching
default → narrative + choice buttons

This architecture keeps rendering logic centralized and makes it easy to add new page types.

New interaction types can be implemented by adding a new renderer branch and extending the schema.

Result

The JSON-driven architecture enables a flexible system for building interactive experiences.

Key benefits include:

Content reusability

New stories can be created entirely through JSON definitions without modifying the application code.

Modular architecture

The system separates responsibilities across validation, backend services, caching, and rendering.

Performance improvements

Page-level loading combined with caching significantly reduces network overhead.

Safety and reliability

Strict schema validation ensures that invalid stories cannot be deployed.

Key Technical Takeaways

This project demonstrates several architectural patterns commonly used in modern interactive platforms:

schema-driven content systems

runtime UI generation

shared validation layers

page-level API design

custom caching strategies

modular renderer architecture

Together these components form a reusable engine capable of powering multiple interactive experiences such as marketing journeys, narrative games, and educational flows.

Amit még nagyon javaslok ehhez az oldalhoz

3 extra elem brutálisan feldobja:

1️⃣ Architecture diagram
2️⃣ Renderer flow diagram
3️⃣ JSON example snippet

Ez vizuálisan sokkal erősebbé teszi a portfóliót.







Decision Flow Runtime Engine
Overview

Interactive experiences such as quizzes, onboarding flows, or narrative journeys require a runtime system capable of managing user decisions and navigating complex branching structures.

Traditional implementations often hardcode navigation logic inside UI components, making the system difficult to maintain and extend.

To address this challenge, I built a decision flow runtime engine that dynamically resolves navigation paths based on user input and story state.

The engine treats the experience as a directed decision graph, where each node represents a page and each edge represents a possible user choice or conditional rule.

The runtime engine evaluates the current state and determines the next node in the graph.

Problem

Interactive flows often contain complex branching logic.

Typical issues include:

navigation logic scattered across UI components

difficulty managing multi-step decision paths

conditional branching based on user actions

inability to reuse flows across different experiences

lack of a consistent runtime model

As flows grow larger, the navigation logic becomes increasingly difficult to maintain.

A scalable solution requires separating decision logic from UI rendering and implementing a dedicated runtime system responsible for resolving navigation paths.

Solution

The solution was to design a runtime decision engine that evaluates the current page state and resolves the next page based on structured decision rules.

Each page in the system represents a node in a directed graph.

Transitions between nodes are defined through:

direct next references

choice-based branching

conditional logic rules

Example structure:

Page
  ├─ text
  ├─ choices
  │    ├─ next → pageId
  │    └─ next → pageId
  └─ logic
       ├─ condition → goto page
       └─ default → page

The runtime engine interprets these rules and determines the next navigation step.

Architecture

The decision runtime sits between the content definition and the UI renderer.

Story JSON
      ↓
Decision Runtime
      ↓
Next Page Resolution
      ↓
Renderer
      ↓
UI Components

The decision runtime is responsible for:

evaluating choice selections

resolving conditional navigation rules

maintaining story state

determining the next page

Runtime State Management

The runtime engine maintains a central state representing the user's progress.

Key state elements include:

current page id

unlocked fragments

flags

previous decisions

The state is managed through a shared context that provides the current page and navigation functions to the renderer.

Example state structure:

{
  currentPageId,
  unlockedFragments,
  flags,
  history
}

This allows the engine to evaluate conditional logic and maintain persistent user progress across the flow.

Navigation Resolution

The engine resolves navigation through several mechanisms.

Direct transitions

The simplest navigation pattern uses a direct reference.

next: "page_02"
Choice-based navigation

User choices define branching paths.

choices: [
  { label: "Explore the tower", next: "tower_page" },
  { label: "Return to camp", next: "camp_page" }
]
Conditional logic

Logic pages allow the engine to evaluate rules based on state conditions.

Example:

logic: [
  { if: ["frag:key_found"], goto: "secret_door" },
  { default: "locked_door" }
]

These rules are evaluated automatically by the runtime engine.

Automatic Logic Pages

Some nodes represent logic-only pages.

These pages contain rules but no user interaction.

The runtime engine evaluates conditions and redirects automatically.

Example flow:

logic page
      ↓
check fragments
      ↓
goto next page

This allows complex branching without adding UI complexity.

Fragment and Flag System

The engine supports persistent state markers.

Two main systems are used:

Fragments

Fragments represent content states unlocked during the experience.

Example:

frag:key_found

Fragments are stored in runtime state and used in conditional logic.

Flags

Flags represent general state markers.

Example:

flag:visited_cave

Flags can be used to track user decisions and influence future navigation.

Renderer Integration

The decision runtime integrates directly with the page renderer.

When a user selects a choice:

the engine records the decision

the next page id is resolved

the renderer loads the new page

Example flow:

Choice selected
      ↓
resolve next page
      ↓
update currentPageId
      ↓
renderer loads new page

This ensures that navigation logic remains centralized in the runtime layer.

Graph-Based Navigation Model

The entire story flow can be interpreted as a directed graph.

Nodes represent pages.

Edges represent transitions.

Page A
  ↓
Page B
  ↓
Page C

or

Page A
  ↓
Page B ──→ Page D
  ↓
Page C

This model allows complex flows while keeping navigation logic structured and predictable.

Result

The decision runtime engine provides a scalable system for managing interactive experiences.

Key benefits include:

Structured navigation

All branching logic is handled by the runtime engine rather than scattered across UI components.

Flexible content flows

Stories can contain complex decision trees without increasing UI complexity.

State-aware navigation

Conditional rules allow navigation based on user history and unlocked fragments.

Extensibility

New page types and interaction patterns can be added without changing the core navigation system.

Key Technical Takeaways

This project demonstrates several important runtime architecture patterns:

graph-based navigation systems

centralized decision engines

state-driven conditional logic

separation of content structure and runtime logic

scalable branching systems for interactive applications

These patterns enable the creation of reusable engines capable of powering quizzes, narrative experiences, training simulations, and marketing journeys.

Javaslat a use case oldal vizuális részére

Ehhez a use case-hez 3 vizuális elem brutál jól működik:

1️⃣ Decision tree diagram
Start
 ├─ Choice A → Path 1
 └─ Choice B → Path 2
2️⃣ Runtime decision pipeline
Choice
 ↓
Runtime
 ↓
State update
 ↓
Next page
3️⃣ Story graph visualization

Ez nagyon látványos a portfólióban.

Fontos

Ez a use case már seniorabb, mint az első.

Mert itt látszik:

state engine

decision graph

conditional runtime

Ez már game engine / decision engine kategória.
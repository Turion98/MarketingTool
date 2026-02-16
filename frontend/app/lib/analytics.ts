// lib/analytics.ts
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type StorageShape,
  type GenericProps,
  type DeviceMeta,
} from "./analyticsSchema";

const LS_KEY = "qz_analytics_v1";
const USER_KEY = "qz_user_id";
const MAX_EVENTS_PER_STORY = 5000;
const BATCH_DEBOUNCE_MS = 400;
const MERGE_WINDOW_MS = 300;
const TERMINAL_PAGE_ID = "__END__";
const END_ALIAS_KEY = "endAlias";

// --- Terminal pages registry (per story) ---
const terminalPagesByStory = new Map<string, Set<string>>();

// prevent double complete per session
const completedSessions = new Set<string>();

export function setTerminalPages(storyId: string, terminalPageIds: string[]) {
  terminalPagesByStory.set(storyId, new Set((terminalPageIds || []).filter(Boolean)));
}


let mem: StorageShape | null = null;
let saveTimer: number | null = null;
let memUserId: string | null = null;

type StoriesMap = StorageShape["stories"];
type StoryBucket = StoriesMap[keyof StoriesMap];

type DailyCounters = {
  pageViews: number;
  choices: number;
  puzzles: { tries: number; solved: number };
  runes: number;
  mediaStarts: number;
  mediaStops: number;
  completions: number;
  ctaShown: number;   
  ctaClicks: number;
};

function now() {
  return Date.now();
}
function uid() {
  return Math.random().toString(36).slice(2) + now().toString(36);
}

// ---------- USER ID (játékos) ----------
export function getOrCreateUserId(): string {
  if (memUserId) return memUserId;
  try {
    const fromLS = localStorage.getItem(USER_KEY);
    if (fromLS) {
      memUserId = fromLS;
      return memUserId;
    }
  } catch {}
  memUserId = "u_" + uid();
  try {
    localStorage.setItem(USER_KEY, memUserId);
  } catch {}
  return memUserId;
}

// ---------- STORAGE ----------
function load(): StorageShape {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StorageShape;
      if (parsed?.schema === ANALYTICS_SCHEMA_VERSION) {
        mem = parsed;
        return mem!;
      }
    }
  } catch {}
  mem = { schema: ANALYTICS_SCHEMA_VERSION, stories: {} as StorageShape["stories"] };
  return mem!;
}

function saveSoon() {
  if (saveTimer != null) return;
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(mem));
    } catch {}
    saveTimer = null;
  }, BATCH_DEBOUNCE_MS) as unknown as number;
}

function storyBucket(storyId: string): StoryBucket {
  const s = load();
  if (!s.stories[storyId]) s.stories[storyId] = { sessions: {}, events: [], meta: {} };
  return s.stories[storyId]!;
}

// ---------- INIT / META ----------
export function initAnalyticsForStory(storyId: string) {
  storyBucket(storyId);
  saveSoon();
}

export function setStoryMeta(
  storyId: string,
  meta: Partial<DeviceMeta & { title?: string; src?: string; campaign?: string; userId?: string }>
) {
  const b = storyBucket(storyId);
  b.meta = { ...(b.meta || {}), ...meta };
  // környezeti meta
  try {
    b.meta = {
      ...b.meta,
      ua: navigator.userAgent,
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      lang: navigator.language,
    };
  } catch {}
  saveSoon();
}

export function getOrCreateSessionId(storyId: string) {
  const key = `qz_session_${storyId}`;
  let v: string | null = null;
  try {
    v = localStorage.getItem(key);
  } catch {}
  if (!v) {
    v = "sess_" + uid();
    try {
      localStorage.setItem(key, v);
    } catch {}
  }
  const b = storyBucket(storyId);
  b.sessions[v] = true;
  saveSoon();
  return v;
}

// ---------- Helpers a props olvasásához (any nélkül) ----------
function getProp<T extends string | number | boolean>(
  obj: GenericProps | undefined,
  key: string,
  type: "string" | "number" | "boolean"
): T | undefined {
  const v = obj ? (obj as Record<string, unknown>)[key] : undefined;
  if (type === "string" && typeof v === "string") return v as T;
  if (type === "number" && typeof v === "number") return v as T;
  if (type === "boolean" && typeof v === "boolean") return v as T;
  return undefined;
}

// ---------- PUSH ----------
function pushEvent(e: AnalyticsEvent) {
  const b = storyBucket(e.storyId);
  const arr = b.events;

  // Merge / dedup rövid ablakban
  const last = arr[arr.length - 1];
  const sameProps =
    JSON.stringify((last?.props as unknown) ?? null) === JSON.stringify((e.props as unknown) ?? null);
  if (
    last &&
    e.ts - last.ts <= MERGE_WINDOW_MS &&
    last.t === e.t &&
    last.pageId === e.pageId &&
    sameProps &&
    last.refPageId === e.refPageId
  ) {
    return; // dedup
  }

  arr.push(e);

  // LRU trim
  if (arr.length > MAX_EVENTS_PER_STORY) {
    arr.splice(0, arr.length - MAX_EVENTS_PER_STORY);
  }

  saveSoon();
}

function baseEvent(
  storyId: string,
  sessionId: string,
  t: AnalyticsEventType,
  pageId?: string,
  refPageId?: string,
  props?: GenericProps
): AnalyticsEvent {
  const userId = getOrCreateUserId();
  const withUser: GenericProps | undefined =
    props || userId ? { ...(props || {}), userId } : undefined;

  return {
    id: "e_" + uid(),
    t,
    ts: now(),
    storyId,
    sessionId,
    pageId,
    refPageId,
    props: withUser && Object.keys(withUser).length ? withUser : undefined,
  };
}

export function trackPageEnter(
  storyId: string,
  sessionId: string,
  pageId: string,
  refPageId?: string,
  extra?: GenericProps
) {
  // 1️⃣ page_enter event
  pushEvent(
    baseEvent(storyId, sessionId, "page_enter", pageId, refPageId, extra)
  );

  // 2️⃣ terminal pages lookup
  const terminals = terminalPagesByStory.get(storyId);

  // 3️⃣ valódi node id (ha StoryPage átadja)
  const rawPageId =
    extra && typeof (extra as any).rawPageId === "string"
      ? (extra as any).rawPageId
      : undefined;

  const pageType =
    extra && typeof (extra as any).pageType === "string"
      ? (extra as any).pageType
      : undefined;

  // 4️⃣ univerzális terminal felismerés
  const isTerminal =
    (rawPageId && terminals?.has(rawPageId)) ||
    terminals?.has(pageId) ||
    pageType === "end";

  // 5️⃣ completion trigger (duplázás védelemmel)
  if (isTerminal) {
    const key = `${storyId}::${sessionId}`;

    if (!completedSessions.has(key)) {
      completedSessions.add(key);

      // mindig a valódi end node id menjen be
      const endAlias =
  (extra as any)?.endAlias || (extra as any)?.rawPageId || pageId;

trackGameComplete(storyId, sessionId, endAlias, { reason: "terminal_page" });

    }
  }
}




export function trackGameComplete(
  storyId: string,
  sessionId: string,
  endAlias?: string,
  extra?: GenericProps
) {
  const props: GenericProps = { reason: "terminal_page", ...(extra || {}) };
  if (endAlias) (props as Record<string, unknown>)[END_ALIAS_KEY] = endAlias;

  pushEvent(baseEvent(storyId, sessionId, "game:complete", TERMINAL_PAGE_ID, undefined, props));
}

export function trackCtaShown(
  storyId: string,
  sessionId: string,
  pageId: string,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "cta_shown", pageId, undefined, {
      ...(extra || {}),
    })
  );
}

export function trackCtaClick(
  storyId: string,
  sessionId: string,
  pageId: string,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "cta_click", pageId, undefined, {
      ...(extra || {}),
    })
  );
}

export function trackPageExit(
  storyId: string,
  sessionId: string,
  pageId: string,
  dwellMs?: number
) {
  pushEvent(
    baseEvent(storyId, sessionId, "page_exit", pageId, undefined, {
      dwellMs: Math.max(0, Number(dwellMs || 0)),
    })
  );
}

// BŐVÍTETT SZIGNATÚRA a StoryPage hívásodhoz:
// label?: string, latencyMs?: number, extra?: GenericProps
export function trackChoice(
  storyId: string,
  sessionId: string,
  pageId: string,
  choiceId: string,
  label?: string,
  latencyMs?: number,
  extra?: GenericProps
) {
  const props: GenericProps = { choiceId, ...(label ? { label } : {}) };
  if (typeof latencyMs === "number" && latencyMs >= 0) (props as Record<string, unknown>).latencyMs = latencyMs;
  if (extra && Object.keys(extra).length) Object.assign(props, extra);
  pushEvent(baseEvent(storyId, sessionId, "choice_select", pageId, undefined, props));
}

export function trackPuzzleTry(
  storyId: string,
  sessionId: string,
  pageId: string,
  puzzleId: string,
  attempt: number,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "puzzle_try", pageId, undefined, {
      puzzleId,
      attempt,
      ...(extra || {}),
    })
  );
}

export function trackPuzzleResult(
  storyId: string,
  sessionId: string,
  pageId: string,
  puzzleId: string,
  isCorrect: boolean,
  attempt: number,
  durationMs: number,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "puzzle_result", pageId, undefined, {
      puzzleId,
      isCorrect,
      attempt,
      durationMs,
      ...(extra || {}),
    })
  );
}

export function trackRuneUnlock(
  storyId: string,
  sessionId: string,
  pageId: string,
  runeId: string,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "rune_unlock", pageId, undefined, {
      runeId,
      ...(extra || {}),
    })
  );
}

export function trackUiClick(
  storyId: string,
  sessionId: string,
  pageId: string,
  control: string,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "ui_click", pageId, undefined, {
      control,
      ...(extra || {}),
    })
  );
}

export function trackMediaStart(
  storyId: string,
  sessionId: string,
  pageId: string,
  mediaId: string,
  kind: "voice" | "sfx" | "bgm" | "video"
) {
  pushEvent(
    baseEvent(storyId, sessionId, "media_start", pageId, undefined, { mediaId, kind })
  );
}

export function trackMediaStop(
  storyId: string,
  sessionId: string,
  pageId: string,
  mediaId: string,
  kind: "voice" | "sfx" | "bgm" | "video"
) {
  pushEvent(
    baseEvent(storyId, sessionId, "media_stop", pageId, undefined, { mediaId, kind })
  );
}

// ---------- EXPORT / CLEAR ----------
export function exportStoryJSON(storyId: string): Blob {
  const b = storyBucket(storyId);
  const data = { schema: ANALYTICS_SCHEMA_VERSION, storyId, ...b };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

// CSV: storyId és userId oszlopokkal
export function exportStoryCSV(storyId: string): Blob {
  const b = storyBucket(storyId);
  const rows = [
    ["storyId", "id", "ts", "type", "pageId", "refPageId", "sessionId", "userId", "props"],
  ];
  for (const e of b.events) {
    const userId = getProp<string>(e.props, "userId", "string") ?? "";
    rows.push([
      storyId,
      e.id,
      String(e.ts),
      e.t,
      e.pageId || "",
      e.refPageId || "",
      e.sessionId,
      userId,
      e.props ? JSON.stringify(e.props) : "",
    ]);
  }
  const csv = rows
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return new Blob([csv], { type: "text/csv" });
}

// ÖSSZES STORY CSV
export function exportAllCSV(): Blob {
  const s = load();
  const rows = [
    ["storyId", "id", "ts", "type", "pageId", "refPageId", "sessionId", "userId", "props"],
  ];
  for (const storyId of Object.keys(s.stories)) {
    const b = s.stories[storyId]!;
    for (const e of b.events) {
      const userId = getProp<string>(e.props, "userId", "string") ?? "";
      rows.push([
        storyId,
        e.id,
        String(e.ts),
        e.t,
        e.pageId || "",
        e.refPageId || "",
        e.sessionId,
        userId,
        e.props ? JSON.stringify(e.props) : "",
      ]);
    }
  }
  const csv = rows
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return new Blob([csv], { type: "text/csv" });
}

export function clearStoryAnalytics(storyId: string) {
  const s = load();
  delete s.stories[storyId];
  saveSoon();
}

// ---------- LISTA / LEKÉRDEZÉSEK UI-HOZ ----------
export function listStories(): Array<{ storyId: string; title?: string; src?: string }> {
  const s = load();
  return Object.entries(s.stories).map(([storyId, bucket]) => ({
    storyId,
    title: (bucket.meta as Record<string, unknown>)?.["title"] as string | undefined,
    src: (bucket.meta as Record<string, unknown>)?.["src"] as string | undefined,
  }));
}

export function getUsersForStory(storyId: string): string[] {
  const b = storyBucket(storyId);
  const set = new Set<string>();
  for (const e of b.events) {
    const u = getProp<string>(e.props, "userId", "string");
    if (u) set.add(u);
  }
  return Array.from(set);
}

export function getEventsByUser(storyId: string, userId: string): AnalyticsEvent[] {
  const b = storyBucket(storyId);
  return b.events.filter((e) => getProp<string>(e.props, "userId", "string") === userId);
}

export function getEventsBySession(storyId: string, sessionId: string): AnalyticsEvent[] {
  const b = storyBucket(storyId);
  return b.events.filter((e) => e.sessionId === sessionId);
}

// ---------- NAPI ROLLUP ----------
export function rollupDaily(storyId: string) {
  const b = storyBucket(storyId);
  const byDay = new Map<
    string,
    {
      sessions: Set<string>;
      users: Set<string>;
      pages: Set<string>;
      counters: DailyCounters & { endings: Record<string, number> };
      pageViews: Map<string, number>;
    }
  >();

  const ensure = (day: string) => {
    if (!byDay.has(day))
      byDay.set(day, {
        sessions: new Set<string>(),
        users: new Set<string>(),
        pages: new Set<string>(),
        counters: {
          pageViews: 0,
          choices: 0,
          puzzles: { tries: 0, solved: 0 },
          runes: 0,
          mediaStarts: 0,
          mediaStops: 0,
          completions: 0,
          ctaShown: 0,
          ctaClicks: 0,
          endings: {}, 
        },
        pageViews: new Map<string, number>(),
      });
    return byDay.get(day)!;
  };

  for (const e of b.events) {
    const day = new Date(e.ts).toISOString().slice(0, 10);
    const d = ensure(day);
    d.sessions.add(e.sessionId);
    if (e.pageId) d.pages.add(e.pageId);

    const userId = getProp<string>(e.props, "userId", "string");
    if (userId) d.users.add(userId);

    switch (e.t) {
      case "page_enter":
        d.counters.pageViews++;
        if (e.pageId) d.pageViews.set(e.pageId, (d.pageViews.get(e.pageId) || 0) + 1);
        break;

      case "choice_select":
        d.counters.choices++;
        break;

      case "puzzle_try":
        d.counters.puzzles.tries++;
        break;

      case "puzzle_result": {
        const isCorrect = getProp<boolean>(e.props, "isCorrect", "boolean") ?? false;
        if (isCorrect) d.counters.puzzles.solved++;
        break;
      }

      case "rune_unlock":
        d.counters.runes++;
        break;

      case "media_start":
        d.counters.mediaStarts++;
        break;

      case "media_stop":
        d.counters.mediaStops++;
        break;

      case "game:complete": {
        d.counters.completions++;

        // ✅ ha van endAlias, akkor azt tekintjük outcome-nak
        const alias = getProp<string>(e.props, END_ALIAS_KEY, "string");
        if (alias) {
          d.counters.endings[alias] = (d.counters.endings[alias] || 0) + 1;
        }
        break;
      }

      case "cta_shown":
        d.counters.ctaShown++;
        break;

      case "cta_click":
        d.counters.ctaClicks++;
        break;
    }
  }

  return Array.from(byDay.entries()).map(([day, v]) => ({
    storyId,
    day,
    sessions: v.sessions.size,
    users: v.users.size,
    pages: v.pages.size,
    totals: v.counters,
    topPages: Array.from(v.pageViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pageId, views]) => ({ pageId, views })),
  }));
}


// --- AUTO UPLOAD HELPEREK ---
export function prepareBatch(storyId: string) {
  const b = storyBucket(storyId);

  // utolsó feltöltés időbélyege
  const lastTs = Number(
    (b.meta as Record<string, unknown>)?.["lastUploadTs"] ?? 0
  );

  const newEvents = b.events.filter((e) => Number(e.ts) > lastTs);

  const userId =
    ((b.meta as Record<string, unknown>)?.["userId"] as string | undefined) ??
    (typeof window !== "undefined" ? getOrCreateUserId() : undefined);

  const device = {
    ua: (b.meta as Record<string, unknown>)?.["ua"] as string | undefined,
    w: (b.meta as Record<string, unknown>)?.["w"] as number | undefined,
    h: (b.meta as Record<string, unknown>)?.["h"] as number | undefined,
    dpr: (b.meta as Record<string, unknown>)?.["dpr"] as number | undefined,
    lang: (b.meta as Record<string, unknown>)?.["lang"] as string | undefined,
  };

  // 🔥 BACKEND-KOMPATIBILIS TRANSZFORMÁCIÓ
  const transformedEvents = newEvents.map((e) => ({
    t: Number(e.ts),              // timestamp (number)
    sessionId: e.sessionId,       // kötelező
    ev: JSON.stringify(e),        // teljes event stringként
  }));

  return {
    storyId,
    userId,
    device,
    events: transformedEvents,
  };
}

export async function uploadBatch(storyId: string, endpoint?: string) {
  const payload = prepareBatch(storyId);
  if (!payload.events.length) return { ok: true, written: 0 };

  // --- Endpoint feloldás (prioritási sorrendben) ---
  const apiBase =
  (typeof process !== "undefined" &&
    (process as unknown as { env?: Record<string, unknown> }).env?.[
      "NEXT_PUBLIC_API_BASE"
    ]) as string | undefined;

const cleanBase = apiBase?.trim().replace(/\/$/, "");
const envBatch = cleanBase
  ? `${cleanBase}/api/analytics/batch`
  : undefined;

const prodApi =
  (process as any)?.env?.NEXT_PUBLIC_ANALYTICS_FALLBACK as string | undefined;
const devFastApi = "http://127.0.0.1:8000/api/analytics/batch";

const endpoints = [
  endpoint,
  envBatch,          // NEXT_PUBLIC_API_BASE alapján
  prodApi,           // biztos fallback prodra
  ...(process.env.NODE_ENV === "development" ? [devFastApi] : []),
].filter(Boolean) as string[];


  let lastError: unknown = null;

  for (const url of endpoints) {
    try {
      // rövid timeout, hogy ne lógjon be
      const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer =
        ac && typeof window !== "undefined"
          ? (window.setTimeout(() => ac.abort(), 4000) as unknown as number)
          : null;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: ac?.signal,
      });

      if (timer != null && typeof window !== "undefined") window.clearTimeout(timer);

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      // siker → lastUploadTs frissítése
      const maxTs = Math.max(...payload.events.map((e) => Number(e.t)));

      const s = load();
      const b = storyBucket(storyId);
      (b.meta as Record<string, unknown>) = { ...(b.meta || {}), lastUploadTs: maxTs };
      saveSoon();

      if (process.env.NODE_ENV !== "production") {
        console.log("[analytics] uploaded", {
          storyId,
          url,
          count: payload.events.length,
          lastUploadTs: maxTs,
        });
      }

      // ha a szerver nem ad JSON-t, akkor is legyen ok válasz
      try {
        const json = (await res.json()) as unknown;
        return json;
      } catch {
        return { ok: true, written: payload.events.length };
      }
    } catch (err) {
      lastError = err;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[analytics] upload failed, trying next endpoint", { url, err });
      }
      continue;
    }
  }

  // minden kísérlet megbukott → ne dobjunk hibát, adjunk vissza státuszt
  return {
    ok: false as const,
    tried: endpoints,
    queued: payload.events.length,
    error: String(lastError || "upload failed"),
  };
}

export function inferTerminalPagesFromStory(story: any): string[] {
  const pagesArr = Array.isArray(story?.pages)
    ? story.pages
    : story?.pages && typeof story.pages === "object"
      ? Object.values(story.pages)
      : [];

  const out: string[] = [];

  for (const p of pagesArr as any[]) {
    const id = String(p?.id || "");
    if (!id) continue;

    const type = String(p?.type || "");
    const hasLogic = Array.isArray(p?.logic) && p.logic.length > 0;

    // logikai/redirect page ne legyen terminal
    if (type === "logic" || hasLogic) continue;

    // univerzális: explicit end type, vagy END_* minták
    if (type === "end" || /^END__/.test(id) || /^END_/.test(id)) out.push(id);
  }

  return out;
}



// --- Dev helpers on window ---------------------------------------
declare global {
  interface Window {
    __an?: {
      dump: () => unknown;
      events: (storyId: string) => unknown[];
      prepare: (storyId: string) => ReturnType<typeof prepareBatch>;
      upload: (storyId: string, endpoint?: string) => Promise<unknown>;
      clear: (storyId: string) => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__an = {
    dump: () => {
      try {
        return JSON.parse(localStorage.getItem(LS_KEY) || "null");
      } catch {
        return null;
      }
    },
    events: (storyId: string) => {
      try {
        const s = JSON.parse(localStorage.getItem(LS_KEY) || '{"stories":{}}') as StorageShape;
        return (s.stories?.[storyId]?.events as unknown[]) || [];
      } catch {
        return [];
      }
    },
    prepare: (storyId: string) => prepareBatch(storyId),
    upload: (storyId: string, endpoint?: string) => uploadBatch(storyId, endpoint),
    clear: (storyId: string) => {
      try {
        const s = JSON.parse(localStorage.getItem(LS_KEY) || '{"stories":{}}') as StorageShape;
        if (s.stories && s.stories[storyId]) delete s.stories[storyId];
        localStorage.setItem(LS_KEY, JSON.stringify(s));
      } catch {}
    },
  };
  console.log("[analytics] __an helper ready");
}

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

let mem: StorageShape | null = null;
let saveTimer: number | null = null;
let memUserId: string | null = null;

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
  mem = { schema: ANALYTICS_SCHEMA_VERSION, stories: {} };
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

function storyBucket(storyId: string) {
  const s = load();
  if (!s.stories[storyId]) s.stories[storyId] = { sessions: {}, events: [], meta: {} };
  return s.stories[storyId];
}

// ---------- INIT / META ----------
export function initAnalyticsForStory(storyId: string) {
  storyBucket(storyId);
  saveSoon();
}

// meta: csak ismert mezők, hogy ne dobjon TS-t “ismeretlen property”-re
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
  let v = null as string | null;
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

// ---------- PUSH ----------
function pushEvent(e: AnalyticsEvent) {
  const b = storyBucket(e.storyId);
  const arr = b.events;

  // Merge / dedup rövid ablakban
  const last = arr[arr.length - 1];
  if (
    last &&
    (e.ts - last.ts) <= MERGE_WINDOW_MS &&
    last.t === e.t &&
    last.pageId === e.pageId &&
    JSON.stringify(last.props || null) === JSON.stringify(e.props || null) &&
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

// ---------- PUBLIC TRACK API ----------
export function trackPageEnter(
  storyId: string,
  sessionId: string,
  pageId: string,
  refPageId?: string
) {
  pushEvent(baseEvent(storyId, sessionId, "page_enter", pageId, refPageId));
}

export function trackGameComplete(
  storyId: string,
  sessionId: string,
  pageId?: string,
  extra?: GenericProps
) {
  pushEvent(
    baseEvent(storyId, sessionId, "game:complete", pageId, undefined, {
      reason: "terminal_page",
      ...(extra || {}),
    }) as any
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
  if (typeof latencyMs === "number" && latencyMs >= 0) props.latencyMs = latencyMs;
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
    const userId =
      (e as any)?.props?.userId != null ? String((e as any).props.userId) : "";
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
    const b = s.stories[storyId];
    for (const e of b.events) {
      const userId =
        (e as any)?.props?.userId != null ? String((e as any).props.userId) : "";
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
    title: (bucket.meta as any)?.title,
    src: (bucket.meta as any)?.src,
  }));
}

export function getUsersForStory(storyId: string): string[] {
  const b = storyBucket(storyId);
  const set = new Set<string>();
  for (const e of b.events) {
    const u = (e as any)?.props?.userId;
    if (u) set.add(String(u));
  }
  return Array.from(set);
}

export function getEventsByUser(storyId: string, userId: string): AnalyticsEvent[] {
  const b = storyBucket(storyId);
  return b.events.filter((e) => (e as any)?.props?.userId === userId);
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
      counters: any;
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

    const userId = (e as any)?.props?.userId;
    if (userId) d.users.add(String(userId));

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
      case "puzzle_result":
        if ((e as any)?.props?.isCorrect) d.counters.puzzles.solved++;
        break;
      case "rune_unlock":
        d.counters.runes++;
        break;
      case "media_start":
        d.counters.mediaStarts++;
        break;
      case "media_stop":
        d.counters.mediaStops++;
        break;
        case "game:complete":
  d.counters.completions++;      // ⬅️ ÚJ
  break
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
// KÉRJÜK: hagyd meg a meglévő exportokat, ezt tedd a fájl VÉGÉRE!

export function prepareBatch(storyId: string) {
  const b = (function () {
    // belső access a story buckethez
    // TS miatt nem exportáltuk külön; a file tetején van storyBucket
    // @ts-ignore
    return storyBucket(storyId);
  })();

  // utolsó feltöltés időbélyege
  const lastTs = Number(((b.meta as any) || {}).lastUploadTs || 0);
  const events = b.events.filter((e: any) => Number(e.ts) > lastTs);

  const userId =
    (b.meta as any)?.userId ||
    (typeof window !== "undefined" ? getOrCreateUserId() : undefined);

  const device = {
    ua: (b.meta as any)?.ua,
    w: (b.meta as any)?.w,
    h: (b.meta as any)?.h,
    dpr: (b.meta as any)?.dpr,
    lang: (b.meta as any)?.lang,
  };

  return { storyId, userId, device, events };
}
export async function uploadBatch(storyId: string, endpoint?: string) {
  const payload = prepareBatch(storyId);
  if (!payload.events.length) return { ok: true, written: 0 };

  // --- Endpoint feloldás (prioritási sorrendben) ---
  const envFromWindow =
    (typeof window !== "undefined" && (window as any).NEXT_PUBLIC_ANALYTICS_ENDPOINT) || undefined;
  const envFromProcess =
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_ANALYTICS_ENDPOINT) ||
    undefined;

  const defaultNextApi = "/api/analytics/batch";
  const devFastApi = "http://127.0.0.1:8000/api/analytics/batch";

  const endpoints = [endpoint, envFromWindow, envFromProcess, defaultNextApi, devFastApi]
    .filter(Boolean) as string[];

  let lastError: any = null;

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
      const maxTs = Math.max(...payload.events.map((e: any) => Number(e.ts)));

      // @ts-ignore – belső helper ugyanebben a fájlban
      const b = storyBucket(storyId);
      (b.meta as any) = { ...(b.meta || {}), lastUploadTs: maxTs };
      // @ts-ignore – belső saveSoon
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
        const json = await res.json();
        return json;
      } catch {
        return { ok: true, written: payload.events.length };
      }
    } catch (err) {
      lastError = err;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[analytics] upload failed, trying next endpoint", { url, err });
      }
      // próbálkozunk a következő endpointtal
      continue;
    }
  }

  // minden kísérlet megbukott → ne dobjunk hibát, adjunk vissza státuszt
  return {
    ok: false,
    tried: endpoints,
    queued: payload.events.length,
    error: String(lastError || "upload failed"),
  };
}
// --- Dev helpers on window ---------------------------------------
declare global {
  interface Window {
    __an?: {
      dump: () => any;
      events: (storyId: string) => any[];
      prepare: (storyId: string) => any;
      upload: (storyId: string, endpoint?: string) => Promise<any>;
      clear: (storyId: string) => void;
    };
  }
}

if (typeof window !== "undefined") {
  (window as any).__an = {
    dump: () => {
      try { return JSON.parse(localStorage.getItem("qz_analytics_v1") || "null"); }
      catch { return null; }
    },
    events: (storyId: string) => {
      try {
        const s = JSON.parse(localStorage.getItem("qz_analytics_v1") || '{"stories":{}}');
        return (s.stories?.[storyId]?.events) || [];
      } catch { return []; }
    },
    prepare: (storyId: string) => prepareBatch(storyId),
    upload: (storyId: string, endpoint?: string) => uploadBatch(storyId, endpoint),
    clear: (storyId: string) => {
      try {
        const s = JSON.parse(localStorage.getItem("qz_analytics_v1") || '{"stories":{}}');
        if (s.stories && s.stories[storyId]) delete s.stories[storyId];
        localStorage.setItem("qz_analytics_v1", JSON.stringify(s));
      } catch {}
    },
  };
  console.log("[analytics] __an helper ready");
}

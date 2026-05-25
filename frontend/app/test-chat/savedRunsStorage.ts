export const TEST_CHAT_SAVES_LS_KEY = "questell_test_chat_saves_v1";

const MAX_RUNS = 40;

export type SavedLogSnapshotEntry = {
  id: string;
  ts: number;
  prompt: string;
  assistantMessage: string;
  /** Kérésben küldött pageId (test-chat). Régi mentésekben hiányozhat. */
  sentPageId?: string | null;
  serverActiveNodeId?: string | null;
  responseType?: string | null;
  activeNodeId: string | null;
  nextPageId: string | null;
  status: string | null;
  latencyMs: number | null;
  satisfiedConditions: string[];
  newlySatisfied: string[];
  missing: string[];
  /** API clarificationQuestion, ha volt (régi mentésekben hiányozhat). */
  clarificationQuestion?: string | null;
  /** Kérésben küldött currentStepId. */
  sentStepId?: string | null;
  /** Válasz currentStepId. */
  responseStepId?: string | null;
  /** Válasz nextStepId. */
  responseNextStepId?: string | null;
  imageProvided?: boolean;
  orderId?: string | null;
};

export type SavedTestRun = {
  id: string;
  savedAt: number;
  runId: string;
  sessionId: string;
  storyId: string;
  entryCount: number;
  entries: SavedLogSnapshotEntry[];
};

function safeParse(raw: string | null): SavedTestRun[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(isSavedTestRun);
  } catch {
    return [];
  }
}

function isSavedTestRun(x: unknown): x is SavedTestRun {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.savedAt === "number" &&
    typeof o.runId === "string" &&
    typeof o.sessionId === "string" &&
    typeof o.storyId === "string" &&
    typeof o.entryCount === "number" &&
    Array.isArray(o.entries)
  );
}

export function loadSavedRuns(): SavedTestRun[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(TEST_CHAT_SAVES_LS_KEY));
}

export function appendSavedRun(payload: {
  runId: string;
  sessionId: string;
  storyId: string;
  entries: SavedLogSnapshotEntry[];
}): SavedTestRun | null {
  if (typeof window === "undefined" || !payload.entries.length) return null;
  const prev = loadSavedRuns();
  const run: SavedTestRun = {
    id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    savedAt: Date.now(),
    runId: payload.runId,
    sessionId: payload.sessionId,
    storyId: payload.storyId,
    entryCount: payload.entries.length,
    entries: payload.entries.map((e) => ({ ...e })),
  };
  const next = [run, ...prev].slice(0, MAX_RUNS);
  window.localStorage.setItem(TEST_CHAT_SAVES_LS_KEY, JSON.stringify(next));
  return run;
}

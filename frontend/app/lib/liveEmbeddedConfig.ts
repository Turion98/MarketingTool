/**
 * Mely sztorik vannak jelenleg beágyazva élő ügyféloldalakon — dashboard áttekintéshez.
 *
 * Források (összevonva, storyId szerint deduplikálva):
 * - NEXT_PUBLIC_LIVE_EMBEDDED_STORY_IDS
 * - `public/config/live-embedded-stories.json`
 * - GET /api/embed-access/live-embed-registry (Next BFF → backend) — dashboard „generálás” után
 */
export type LiveEmbeddedEntry = {
  storyId: string;
  /** Publikus oldal, ahol az iframe / embed.js fut */
  livePageUrl?: string;
  /** Ha nincs a katalógusban cím, ez jelenik meg főcímként */
  title?: string;
};

type LiveEmbeddedFile = {
  stories?: unknown[];
};

function parseEnvStoryIds(): LiveEmbeddedEntry[] {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_LIVE_EMBEDDED_STORY_IDS?.trim()
      : "";
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((storyId) => ({ storyId }));
}

function normalizeFileEntry(raw: unknown): LiveEmbeddedEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const storyId =
    typeof o.storyId === "string"
      ? o.storyId.trim()
      : typeof o.campaignId === "string"
        ? o.campaignId.trim()
        : "";
  if (!storyId) return null;
  const livePageUrl =
    typeof o.livePageUrl === "string" && o.livePageUrl.trim()
      ? o.livePageUrl.trim()
      : undefined;
  const title =
    typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
  return { storyId, livePageUrl, title };
}

function normalizeRegistryApiRow(raw: unknown): LiveEmbeddedEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const storyId =
    typeof o.storyId === "string"
      ? o.storyId.trim()
      : typeof o.story_id === "string"
        ? o.story_id.trim()
        : "";
  if (!storyId) return null;
  const livePageUrl =
    typeof o.livePageUrl === "string" && o.livePageUrl.trim()
      ? o.livePageUrl.trim()
      : typeof o.live_page_url === "string" && o.live_page_url.trim()
        ? o.live_page_url.trim()
        : undefined;
  const title =
    typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
  return { storyId, livePageUrl, title };
}

async function fetchLiveFromDashboardRegistry(): Promise<LiveEmbeddedEntry[]> {
  try {
    const r = await fetch("/api/embed-access/live-embed-registry", {
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { stories?: unknown };
    if (!Array.isArray(j.stories)) return [];
    const out: LiveEmbeddedEntry[] = [];
    for (const item of j.stories) {
      const n = normalizeRegistryApiRow(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchLiveEmbeddedFromFile(): Promise<LiveEmbeddedEntry[]> {
  try {
    const r = await fetch("/config/live-embedded-stories.json", {
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = (await r.json()) as LiveEmbeddedFile;
    if (!Array.isArray(j.stories)) return [];
    const out: LiveEmbeddedEntry[] = [];
    for (const item of j.stories) {
      const n = normalizeFileEntry(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

/** Összevont, nyers konfig (még nincs katalógus cím). */
export async function fetchLiveEmbeddedConfig(): Promise<LiveEmbeddedEntry[]> {
  const [fromFile, fromEnv, fromRegistry] = await Promise.all([
    fetchLiveEmbeddedFromFile(),
    Promise.resolve(parseEnvStoryIds()),
    fetchLiveFromDashboardRegistry(),
  ]);

  const byId = new Map<string, LiveEmbeddedEntry>();
  for (const e of fromEnv) {
    byId.set(e.storyId, { storyId: e.storyId });
  }
  for (const e of fromFile) {
    const prev = byId.get(e.storyId);
    byId.set(e.storyId, {
      storyId: e.storyId,
      livePageUrl: e.livePageUrl ?? prev?.livePageUrl,
      title: e.title ?? prev?.title,
    });
  }
  for (const e of fromRegistry) {
    const prev = byId.get(e.storyId);
    byId.set(e.storyId, {
      storyId: e.storyId,
      livePageUrl: e.livePageUrl ?? prev?.livePageUrl,
      title: e.title ?? prev?.title,
    });
  }
  return Array.from(byId.values());
}

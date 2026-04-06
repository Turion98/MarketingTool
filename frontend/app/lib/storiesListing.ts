/**
 * Közös sztori-lista betöltés (API + proxy + statikus registry fallback).
 * Csak kliens oldali kontextusban hívandó (window.origin).
 */

export type StoryListItem = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  jsonSrc: string;
  startPageId?: string;
};

function envBase(): string {
  const v = process.env.NEXT_PUBLIC_API_BASE || "";
  return v ? v.replace(/\/+$/, "") : "";
}

function curOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "";
}

export function buildStoryCandidates(): string[] {
  const env = envBase();
  const origin = curOrigin();
  const dev = "http://127.0.0.1:8000";

  const urls: string[] = [];
  if (env) urls.push(`${env}/api/stories`);
  if (origin) urls.push(`${origin}/api/stories`);
  urls.push(`/stories/registry.json`);
  urls.push(`${dev}/api/stories`);
  return Array.from(new Set(urls));
}

export function normalizeStories(payload: unknown): StoryListItem[] | null {
  if (Array.isArray(payload)) return payload as StoryListItem[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { stories?: unknown }).stories)
  ) {
    return (payload as { stories: StoryListItem[] }).stories;
  }
  return null;
}

export function deriveStoryId(a: Partial<StoryListItem> & Record<string, unknown>): string {
  if (a?.id) return String(a.id);
  const src = a?.jsonSrc;
  if (typeof src === "string") {
    const base = (src.split("/").pop() || "").replace(/\.[^.]+$/, "");
    if (base) return base;
  }
  return "unknown";
}

async function tryFetch(url: string): Promise<StoryListItem[] | null> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const norm = normalizeStories(j);
  if (!norm) return null;

  return norm.map((s: Record<string, unknown>) => {
    const id = (s?.id as string) || deriveStoryId(s as Partial<StoryListItem>);
    const jsonSrc =
      (s?.jsonSrc as string) ||
      (typeof id === "string" && id && id !== "unknown"
        ? `/stories/${id}.json`
        : "");
    return { ...(s as object), id, jsonSrc } as StoryListItem;
  });
}

export async function fetchStoriesWithMultiFallback(
  namespace = "Stories"
): Promise<StoryListItem[]> {
  const urls = buildStoryCandidates();
  let lastErr: unknown = null;
  for (const u of urls) {
    try {
      const res = await tryFetch(u);
      if (res && res.length) {
        if (u.includes("127.0.0.1")) console.info(`[${namespace}] DEV fallback @`, u);
        if (u.endsWith("/stories/registry.json")) console.info(`[${namespace}] Static registry @`, u);
        return res;
      }
      console.warn(`[${namespace}] no data @`, u);
    } catch (e) {
      lastErr = e;
      console.warn(`[${namespace}] fetch error @`, u, e);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("No story source succeeded");
}

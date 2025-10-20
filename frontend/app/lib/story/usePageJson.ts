import { useCachedFetch } from "@/app/lib/cache/useCachedFetch";

type UsePageJsonOpts = {
  storyId?: string;
  pageId?: string;
  ttlMs?: number;     // default: 18 perc
  enabled?: boolean;  // default: true
  fetchInit?: RequestInit;
};

export function usePageJson<T = any>(url: string | null, opts: UsePageJsonOpts = {}) {
  const { storyId, pageId, ttlMs = 18 * 60_000, enabled = true, fetchInit } = opts;
  const id = url
    ? (storyId && pageId ? `${storyId}:${pageId}` : url.replace(/\s+/g, ""))
    : undefined;

  return useCachedFetch<T>(url || null, {
    bucket: "page",
    id,
    ttlMs,
    fetchInit,
    enabled: enabled && !!url,
  });
}

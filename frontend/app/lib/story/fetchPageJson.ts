// FE write-through cache story page JSON-hoz (15–20m TTL)
// - memória + localStorage
// - abort kompatibilis
// - determinisztikus cache-kulcs: <storyId>:<pageId>:<src> (ha van), különben az URL

import { getCache, setCache } from "@/app/lib/cache/frontendCache";

export type FetchPageOpts = {
  storyId?: string;
  pageId?: string;
  /** Ha nem adod meg, az URL queryből olvassuk ki a 'src' paramot */
  src?: string;
  /** FE TTL – default: 18 perc */
  ttlMs?: number;
  /** Szerver oldalon az ISR beállítása (másodperc) – default: 60 */
  revalidateSeconds?: number;
  signal?: AbortSignal | null;
  /** Extra init (headers, stb.). Ne adj meg ide cache: "no-store"-t, mert kiveszi a Next cache-ből. */
  fetchInit?: RequestInit & { next?: any };
};

function getSrcFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url, "http://dummy.base"); // abszolútálás, ha relatív
    const s = u.searchParams.get("src");
    return s || undefined;
  } catch {
    return undefined;
  }
}

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
  const srcKey = src ?? getSrcFromUrl(cleanUrl);

  // ===== Kulcs: storyId:pageId:src, különben a teljes URL
  const id =
    storyId && pageId
      ? `${storyId}:${pageId}:${srcKey ?? ""}`
      : cleanUrl;

  // 1) FE cache hit?
  const cached = getCache<T>("page", id);
  if (cached != null) return cached;

  // 2) Hálózat + write-through
  const isServer = typeof window === "undefined";

  // Lazább típus a Next saját `next` mezője miatt
  const init: RequestInit & { next?: any } = {
    ...(fetchInit as any),
    signal,
  };

  if (isServer) {
    // ✅ Engedjük az ISR-t szerver oldalon
    const nextInit = { ...(init.next || {}) };
    // csak akkor írjuk, ha nincs explicit revalidate beállítva kívülről
    if (typeof nextInit.revalidate === "undefined") {
      nextInit.revalidate = revalidateSeconds;
    }
    init.next = nextInit;

    // Ne használjunk "no-store"-t, mert kiiktatja a Next cache-t
    if ((init as any).cache === "no-store") delete (init as any).cache;
  } else {
    // Kliensen sincs szükség no-store-ra, mert saját FE cache van fölötte
    if ((init as any).cache === "no-store") delete (init as any).cache;
  }

  const res = await fetch(cleanUrl, init as any);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} @ ${cleanUrl} ${t ? `– ${t}` : ""}`);
  }

  const json = (await res.json()) as T;
  setCache<T>("page", id, json, ttlMs);
  return json;
}

// Opcionális: több oldal előmelegítése (fire-and-forget, hiba lenyelés)
export async function prefetchPages(
  entries: Array<{ url: string; storyId?: string; pageId?: string; src?: string }>,
  ttlMs: number = 18 * 60_000,
  revalidateSeconds: number = 60
) {
  await Promise.allSettled(
    entries.map(async ({ url, storyId, pageId, src }) => {
      try {
        await fetchPageJsonCached(url, {
          storyId,
          pageId,
          src,
          ttlMs,
          revalidateSeconds,
          // fontos: NE adj no-store-t; a Next/ISR itt is érvényesüljön szerveren
          fetchInit: {},
        });
      } catch {}
    })
  );
}

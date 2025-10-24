// frontend/app/lib/security/cacheKey.ts
//
// Egységes cache kulcsgenerátor story / skin / runes kombinációhoz.
// Stabil, determinisztikus sorrenddel, hogy ne legyen ütközés.
//
// Használat:
//   import { makeCacheKey } from "@/app/lib/security/cacheKey";
//   const key = makeCacheKey({ storyId, pageId, skin, runes });

export type CacheKeyParams = {
  storyId: string;
  pageId?: string;
  skin?: string;
  runes?: string;
};

export function makeCacheKey(params: CacheKeyParams): string {
  const { storyId, pageId = "start", skin = "default", runes = "" } = params;
  // normalize → storyId|pageId|skin|runes
  return `${storyId}|${pageId}|${skin}|${runes}`;
}

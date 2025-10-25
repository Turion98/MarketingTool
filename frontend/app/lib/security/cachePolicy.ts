// frontend/app/lib/security/cachePolicy.ts
//
// Egyszerű, szerver és domain nélkül működő memória cache TTL + LRU kezeléssel.
// Nem használ diszket, nem ír hálózatra.
// Használat: csak a frontend sandboxban, pl. story oldalak, tokenek, skin-ek.
//
// Használat:
//   import { getCacheEntry, setCacheEntry, hasCacheEntry, clearCache } from "@/app/lib/security/cachePolicy";
//   setCacheEntry("page:start", { title: "Intro" });
//   const page = getCacheEntry("page:start");
//   console.log(page?.data);

type CacheEntry<T = unknown> = {
  data: T;
  timestamp: number;
};

// ⬅️ itt változtattunk: any -> unknown
type CacheBucket = Map<string, CacheEntry<unknown>>;

// ---- Beállítások ----
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 perc
const MAX_ENTRIES = 1000; // LRU felső korlát

// Belső állapot (egy singleton memória-bucket)
const bucket: CacheBucket = new Map();

// ---- Util ----

// LRU "legkevésbé használt" elem kidobása
function evictIfNeeded(): void {
  if (bucket.size <= MAX_ENTRIES) return;
  // a Map iteráció insertion order szerint halad, így az első a legrégebbi
  const firstKey = bucket.keys().next().value;
  if (firstKey) bucket.delete(firstKey);
}

// TTL ellenőrzés
function isExpired(entry: CacheEntry, ttlMs: number): boolean {
  const age = Date.now() - entry.timestamp;
  return age > ttlMs;
}

// ---- API ----

// új érték beállítása (vagy frissítése)
export function setCacheEntry<T>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  bucket.set(key, { data, timestamp: Date.now() });
  evictIfNeeded();
  // debug log (nem kötelező)
  if (process.env.NODE_ENV === "development") {
    console.log(`[CACHE] set ${key} (ttl=${ttlMs}ms)`);
  }
}

// lekérés, ha él még
export function getCacheEntry<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS
): CacheEntry<T> | null {
  const entry = bucket.get(key);
  if (!entry) return null;

  if (isExpired(entry, ttlMs)) {
    bucket.delete(key);
    return null;
  }

  // LRU frissítés → elem újrainsert a Map végére
  bucket.delete(key);
  bucket.set(key, entry);
  return entry as CacheEntry<T>;
}

// gyors ellenőrzés, hogy él-e az adott kulcs
export function hasCacheEntry(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  const entry = bucket.get(key);
  if (!entry) return false;
  if (isExpired(entry, ttlMs)) {
    bucket.delete(key);
    return false;
  }
  return true;
}

// teljes ürítés
export function clearCache(): void {
  bucket.clear();
  if (process.env.NODE_ENV === "development") {
    console.log("[CACHE] cleared");
  }
}

// diagnosztika
export function getCacheStats() {
  return {
    entries: bucket.size,
    maxEntries: MAX_ENTRIES,
  };
}

// Lightweight FE cache: memory + localStorage + TTL + verziózás (SSR-safe)
type Bucket = "skin" | "campaign" | "page" | "wl" | string;

const VERSION = "v1";
const MEM = new Map<string, { exp: number; val: any }>();
const LS_PREFIX = "mt:"; // elkülönítés a saját LS kulcsaidtól

const now = () => Date.now();
const keyOf = (bucket: Bucket, id: string) => `${LS_PREFIX}${VERSION}:${bucket}:${id}`;

// ---- SSR guardok ----
const hasWindow = typeof window !== "undefined";
const hasLS = hasWindow && typeof window.localStorage !== "undefined";

function lsGet(key: string): string | null {
  if (!hasLS) return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  if (!hasLS) return;
  try { window.localStorage.setItem(key, val); } catch {}
}
function lsRemove(key: string): void {
  if (!hasLS) return;
  try { window.localStorage.removeItem(key); } catch {}
}
function lsKey(i: number): string | null {
  if (!hasLS) return null;
  try { return window.localStorage.key(i); } catch { return null; }
}
function lsLen(): number {
  if (!hasLS) return 0;
  try { return window.localStorage.length; } catch { return 0; }
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function getCache<T = any>(bucket: Bucket, id: string): T | null {
  const k = keyOf(bucket, id);

  // memory first
  const mem = MEM.get(k);
  if (mem && mem.exp > now()) return mem.val as T;
  if (mem) MEM.delete(k);

  // localStorage fallback
  const obj = safeParse<{ exp: number; val: T }>(lsGet(k));
  if (obj && obj.exp > now()) {
    MEM.set(k, obj); // re-hydrate memory
    return obj.val;
  }
  if (obj) lsRemove(k);
  return null;
}

export function setCache<T = any>(bucket: Bucket, id: string, val: T, ttlMs: number) {
  const rec = { exp: now() + Math.max(1, ttlMs), val };
  const k = keyOf(bucket, id);
  MEM.set(k, rec);
  // best-effort persist (ne hasaljon SSR-en / quota-n)
  try { lsSet(k, JSON.stringify(rec)); } catch {}
}

export function hasFresh(bucket: Bucket, id: string) {
  const k = keyOf(bucket, id);
  const mem = MEM.get(k);
  if (mem && mem.exp > now()) return true;

  const obj = safeParse<{ exp: number }>(lsGet(k));
  return !!(obj && obj.exp > now());
}

export function clearExpired() {
  const t = now();
  // memory
  for (const [k, v] of MEM.entries()) if (!v || v.exp <= t) MEM.delete(k);
  // localStorage
  if (!hasLS) return;
  const rm: string[] = [];
  for (let i = 0; i < lsLen(); i++) {
    const k = lsKey(i) || "";
    if (!k.startsWith(`${LS_PREFIX}${VERSION}:`)) continue;
    const v = safeParse<{ exp: number }>(lsGet(k));
    if (!v || v.exp <= t) rm.push(k);
  }
  rm.forEach(lsRemove);
}

export function clearAll(namespace: Bucket | null = null) {
  // memory
  for (const k of Array.from(MEM.keys())) {
    if (!namespace || k.includes(`:${namespace}:`)) MEM.delete(k);
  }
  // localStorage
  if (!hasLS) return;
  const rm: string[] = [];
  for (let i = 0; i < lsLen(); i++) {
    const k = lsKey(i) || "";
    if (!k.startsWith(`${LS_PREFIX}${VERSION}:`)) continue;
    if (!namespace || k.includes(`:${namespace}:`)) rm.push(k);
  }
  rm.forEach(lsRemove);
}

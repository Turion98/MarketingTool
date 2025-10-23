// Lightweight FE cache: memory + localStorage + TTL + verziózás (SSR-safe)
export type Bucket = "skin" | "campaign" | "page" | "wl" | (string & {});

const VERSION = "v1";
type CacheRecord<T> = { exp: number; val: T };

const MEM = new Map<string, CacheRecord<unknown>>();
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

export function getCache<T = unknown>(bucket: Bucket, id: string): T | null {
  const k = keyOf(bucket, id);

  // memory first
  const mem = MEM.get(k) as CacheRecord<T> | undefined;
  if (mem && mem.exp > now()) return mem.val;
  if (mem) MEM.delete(k);

  // localStorage fallback
  const obj = safeParse<CacheRecord<T>>(lsGet(k));
  if (obj && obj.exp > now()) {
    MEM.set(k, obj as CacheRecord<unknown>); // re-hydrate memory
    return obj.val;
  }
  if (obj) lsRemove(k);
  return null;
}

export function setCache<T = unknown>(bucket: Bucket, id: string, val: T, ttlMs: number): void {
  const rec: CacheRecord<T> = { exp: now() + Math.max(1, ttlMs), val };
  const k = keyOf(bucket, id);
  MEM.set(k, rec as CacheRecord<unknown>);
  // best-effort persist (ne hasaljon SSR-en / quota-n)
  try { lsSet(k, JSON.stringify(rec)); } catch {}
}

export function hasFresh(bucket: Bucket, id: string): boolean {
  const k = keyOf(bucket, id);
  const mem = MEM.get(k);
  if (mem && (mem as CacheRecord<unknown>).exp > now()) return true;

  const obj = safeParse<Pick<CacheRecord<unknown>, "exp">>(lsGet(k));
  return !!(obj && obj.exp > now());
}

export function clearExpired(): void {
  const t = now();
  // memory
  for (const [k, v] of MEM.entries()) if (!v || v.exp <= t) MEM.delete(k);
  // localStorage
  if (!hasLS) return;
  const rm: string[] = [];
  for (let i = 0; i < lsLen(); i++) {
    const k = lsKey(i) || "";
    if (!k.startsWith(`${LS_PREFIX}${VERSION}:`)) continue;
    const v = safeParse<Pick<CacheRecord<unknown>, "exp">>(lsGet(k));
    if (!v || v.exp <= t) rm.push(k);
  }
  rm.forEach(lsRemove);
}

export function clearAll(namespace: Bucket | null = null): void {
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

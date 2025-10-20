// Cache-elt token loader: JSON -> :root CSS var-ok (SSR-safe)
import { setCache, getCache } from "./cache/frontendCache";

type TokensJson = { id?: string; title?: string; tokens: Record<string, string> };

const hasWindow = typeof window !== "undefined";

function applyTokensInline(map: Record<string, string>) {
  if (!hasWindow) return; // SSR: nincs document
  const root = document.documentElement;
  Object.entries(map || {}).forEach(([k, v]) => {
    try {
      root.style.setProperty(k.trim(), String(v));
    } catch {}
  });
}

export async function loadTokens(url: string, opts?: { ttlMs?: number }) {
  const ttl = opts?.ttlMs ?? 24 * 60 * 60_000; // 24h
  const bucket = "skin";
  // cache-busting query nélkül kulcsolunk
  const id = url.replace(/\?.*$/, "");

  // 1) FE cache hit?
  const cached = getCache<TokensJson>(bucket, id);
  if (cached?.tokens) {
    applyTokensInline(cached.tokens);
    return cached;
  }

  // 2) Hálózat – ne használjunk "no-store"-t, hogy a Next statikus fájl cache se sérüljön
  //    (kliensen a saját FE cache-ünk dolgozik)
  const res = await fetch(url); // default: force-cache / browser cache policy
  if (!res.ok) throw new Error(`Token load failed: ${res.status}`);

  const json = (await res.json()) as TokensJson;

  // 3) Write-through FE cache + inline alkalmazás csak kliensen
  setCache(bucket, id, json, ttl);
  if (json?.tokens) applyTokensInline(json.tokens);

  return json;
}

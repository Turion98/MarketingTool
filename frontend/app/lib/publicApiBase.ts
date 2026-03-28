/**
 * Dev: Next.js rewrite célja — böngészőből same-origin fetch, nincs CORS.
 * Meg kell egyeznie a `next.config.js` `/_questell-api-proxy/:path*` source-jával.
 */
export const QUESTELL_DEV_API_PROXY_PATH = "/_questell-api-proxy";

/**
 * Központi FastAPI bázis URL (böngésző + SSR).
 * Production-ban kötelező a Vercel / hosting env-ben: NEXT_PUBLIC_API_BASE=https://api.example.com
 * Ha hiányzik, dev fallback: localhost:8000 — így nem esik szét relatív /page/... hívásra a frontend originon (404).
 */
export function getPublicApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "http://127.0.0.1:8000";
}

/**
 * Böngészős fetch() alapbázis: dev-ben, ha az API más origin, a Next proxy (same-origin).
 * Szerveren mindig a tényleges API URL (nincs CORS).
 */
export function getClientFetchApiBase(): string {
  const remote = getPublicApiBase();
  if (typeof window === "undefined") return remote;
  if (process.env.NODE_ENV === "production") return remote;
  try {
    if (new URL(remote).origin === window.location.origin) return remote;
  } catch {
    return remote;
  }
  return QUESTELL_DEV_API_PROXY_PATH;
}

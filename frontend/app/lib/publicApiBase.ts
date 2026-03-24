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

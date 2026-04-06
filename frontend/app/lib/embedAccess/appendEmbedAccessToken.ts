/**
 * Append signed embed access token to an existing embed URL (adds or replaces `token` query).
 */

export function appendEmbedAccessToken(embedUrl: string, token: string): string {
  const t = token.trim();
  if (!t) return embedUrl;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(embedUrl, base);
    u.searchParams.set("token", t);
    const path = u.pathname + u.search + u.hash;
    if (embedUrl.startsWith("http://") || embedUrl.startsWith("https://")) {
      return u.toString();
    }
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    const sep = embedUrl.includes("?") ? "&" : "?";
    return `${embedUrl}${sep}token=${encodeURIComponent(t)}`;
  }
}

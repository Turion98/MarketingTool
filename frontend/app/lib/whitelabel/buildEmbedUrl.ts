export type BuildEmbedOpts = {
  base?: string;          // pl. '', '/embed' vagy teljes https://... ha külön domain
  campaignId: string;     // story/campaign slug
  host?: string;          // ügyfél domain (DE: ha base teljes URL, ezt NEM használjuk)
  skin?: string;          // skin id (pl. neon_fiesta)
  start?: string;         // start page id
  src?: string;           // story json absolute/relative
  title?: string;         // override title
  analytics?: boolean;    // '?analytics=1'
  runes?: string;         // pl. "ring,arc,dot"
  runemode?: "single" | "triple";
};

/**
 * Build an Embed URL.
 * If base is a full URL (e.g. "https://brand.wl.domain/embed"), we DO NOT add `host` as a query param.
 * If base is relative ("/embed"), we fallback to current origin and we MAY add `host` as query (legacy).
 */
export function buildEmbedUrl({
  base = "/embed",
  campaignId,
  host,
  skin,
  start,
  src,
  title,
  analytics,
  runes,
  runemode,
}: BuildEmbedOpts) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const isAbsolute = /^https?:\/\//i.test(base);
  const u = new URL(isAbsolute ? base : origin + base);
  // ensure path '/embed/<campaignId>'
  u.pathname = `${u.pathname.replace(/\/+$/, "")}/${encodeURIComponent(campaignId)}`;

  const q = u.searchParams;
  // only attach host when we are NOT on WL base url
  if (!isAbsolute && host) q.set("host", host);
  if (skin)  q.set("skin", skin);
  if (start) q.set("start", start);
  if (src)   q.set("src", src);
  if (title) q.set("title", title);
  if (analytics) q.set("analytics", "1");
  if (runes) q.set("runes", runes);
  if (runemode) q.set("runemode", runemode);

  return `${u.pathname}?${q.toString()}`;
}

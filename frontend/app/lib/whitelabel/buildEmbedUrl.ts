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
 * Ha a `base` teljes URL (pl. "https://brand.wl.domain/embed"), NEM tesszük hozzá a `host` query-t.
 * Ha a `base` relatív ("/embed"), az aktuális originre esik vissza, és HOZZÁTEHETJÜK a `host`-ot (legacy).
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
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";

  const isAbsolute = /^https?:\/\//i.test(base);
  const u = new URL(isAbsolute ? base : origin + base);

  // ensure path '/embed/<campaignId>'
  u.pathname = `${u.pathname.replace(/\/+$/, "")}/${encodeURIComponent(campaignId)}`;

  const q = u.searchParams;

  // only attach host when we are NOT on WL base url
  if (!isAbsolute && host) q.set("host", host);
  if (skin) q.set("skin", skin);
  if (start) q.set("start", start);
  if (src) q.set("src", src);
  if (title) q.set("title", title);
  if (analytics) q.set("analytics", "1");
  if (runes) q.set("runes", runes);
  if (runemode) q.set("runemode", runemode);

  // TELJES URL-t adjunk vissza (ne csak pathname+query-t)
  return u.toString();
}

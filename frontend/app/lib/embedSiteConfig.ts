/**
 * =============================================================================
 * BEÁGYAZÁS — egy helyen minden (konfig, URL-építők, snippetek, régi API aliasok)
 * =============================================================================
 *
 * Emberi útmutató (URL vs iframe, ghost, embed.js): ../../docs/embed.md
 *
 * - Külső oldal: public/embed.js + data-* attribútumok VAGY nyers iframe src.
 * - Belső demó: HomeEntry.tsx → buildHomeGhostEmbedUrl() → iframe src.
 * - Player origin: NEXT_PUBLIC_EMBED_PLAYER_ORIGIN (lásd docs).
 */

export type EmbedRunemode = "single" | "triple";

/** Skin lista (registry.json) — HomeEntry panel. */
export type SkinEntry = { id: string; title: string };

/** Player origin: env → böngésző (CSR) → éles fallback (SSR). */
export function resolveEmbedPlayerOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_EMBED_PLAYER_ORIGIN?.trim().replace(
    /\/+$/,
    ""
  );
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://www.thequestell.com";
}

/** Bal oldali ghost demó (Questell node graph HU) — minden query param egy helyen. */
export const HOME_GHOST_EMBED = {
  campaignId: "questell_node_graph_demo_hu",
  storySrc: "/stories/questell_node_graph_demo_hu.json",
  start: "1.1",
  title: "Questell – interaktív döntési élmény",
  skin: "contract_creative_dusk",
  runes: "ring",
  runemode: "single" as EmbedRunemode,
  ghost: true,
  /** Minimum iframe magasság (postMessage padló). */
  gmin: 440,
  /** >0: URL-ben gmax + belső görgetés; 0 = kihagyva. */
  gmax: 0,
} as const;

/** Jobb oldali telefon előnézet (Mrk6 marketing-sim). */
export const MARKETING_SIM_EMBED = {
  campaignId: "marketing-sim",
  storySrc: "/stories/Mrk6_D_text_updated_en.json",
  start: "start",
  title: "Mrk6",
} as const;

export type HomeGhostEmbedOverrides = {
  skin?: string;
  gmin?: number;
  gmax?: number;
};

/** Teljes embed URL a kezdőlap ghost demóhoz (iframe src / közvetlen link). */
export function buildHomeGhostEmbedUrl(
  overrides?: HomeGhostEmbedOverrides
): string {
  const origin = resolveEmbedPlayerOrigin();
  const c = HOME_GHOST_EMBED;
  const skin = overrides?.skin ?? c.skin;
  const gmin = overrides?.gmin ?? c.gmin;
  const gmax = overrides?.gmax ?? c.gmax;

  const params = new URLSearchParams({
    skin,
    start: c.start,
    src: c.storySrc,
    title: c.title,
    runes: c.runes,
    runemode: c.runemode,
    ghost: "1",
    gmin: String(gmin),
  });
  if (gmax > 0) params.set("gmax", String(gmax));

  return `${origin}/embed/${encodeURIComponent(c.campaignId)}?${params.toString()}`;
}

/** Marketing panel iframe URL (nem ghost). */
export function buildMarketingSimEmbedUrl(skinId: string): string {
  const origin = resolveEmbedPlayerOrigin();
  if (!origin) return "";
  const m = MARKETING_SIM_EMBED;
  const params = new URLSearchParams({
    src: m.storySrc,
    start: m.start,
    title: m.title,
    skin: skinId,
    c: m.campaignId,
  });
  return `${origin}/embed/${encodeURIComponent(m.campaignId)}?${params.toString()}`;
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Másolható embed.js script (data-* = HOME_GHOST_EMBED).
 * A script src originje megegyezik a playerrel.
 */
export function formatHomeGhostEmbedJsSnippet(origin?: string): string {
  const o = (origin ?? resolveEmbedPlayerOrigin()).replace(/\/+$/, "");
  const c = HOME_GHOST_EMBED;
  const lines = [
    `<script src="${escAttr(o + "/embed.js")}"`,
    `  data-campaign="${escAttr(c.campaignId)}"`,
    `  data-src="${escAttr(c.storySrc)}"`,
    `  data-start="${escAttr(c.start)}"`,
    `  data-title="${escAttr(c.title)}"`,
    `  data-skin="${escAttr(c.skin)}"`,
    `  data-runes="${escAttr(c.runes)}"`,
    `  data-runemode="${escAttr(c.runemode)}"`,
    `  data-mode="ghost"`,
    `  data-gmin="${escAttr(String(c.gmin))}"`,
  ];
  if (c.gmax > 0) {
    lines.push(`  data-gmax="${escAttr(String(c.gmax))}"`);
  }
  lines.push(`></script>`);
  return lines.join("\n");
}

/** Nyers iframe HTML ugyanahhoz az URL-hez, mint a bal oldali demó. */
export function formatHomeGhostIframeSnippet(url: string): string {
  const c = HOME_GHOST_EMBED;
  return [
    `<iframe`,
    `  src="${escAttr(url)}"`,
    `  title="${escAttr(c.title)}"`,
    `  style="display:block;width:100%;border:0;min-height:${c.gmin}px;height:120px;background:transparent;"`,
    `  allow="fullscreen"`,
    `  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"`,
    `></iframe>`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Régi export nevek (korábbi marketingEmbedPreview.ts) — ugyanabból a modulból */
/* -------------------------------------------------------------------------- */

export const EMBED_CAMPAIGN_ID = MARKETING_SIM_EMBED.campaignId;
export const EMBED_STORY_SRC = MARKETING_SIM_EMBED.storySrc;
export const EMBED_START = MARKETING_SIM_EMBED.start;
export const EMBED_TITLE = MARKETING_SIM_EMBED.title;

export const QUESTELL_NODE_GRAPH_CAMPAIGN_ID = HOME_GHOST_EMBED.campaignId;

export function buildMarketingEmbedUrl(skinId: string): string {
  return buildMarketingSimEmbedUrl(skinId);
}

export function buildQuestellNodeGraphGhostEmbedUrl(options?: {
  skin?: string;
  gmin?: number;
  gmax?: number;
}): string {
  return buildHomeGhostEmbedUrl(options);
}

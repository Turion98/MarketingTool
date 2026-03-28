/** Mrk6 EN embed (present „marketing-sim” paraméterek) — kezdőlap / előnézet panel. */

export const EMBED_CAMPAIGN_ID = "marketing-sim";
export const EMBED_STORY_SRC = "/stories/Mrk6_D_text_updated_en.json";
export const EMBED_START = "start";
export const EMBED_TITLE = "Mrk6";

export type SkinEntry = { id: string; title: string };

export function buildMarketingEmbedUrl(skinId: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_EMBED_PLAYER_ORIGIN?.trim().replace(
    /\/+$/,
    ""
  );
  const origin =
    fromEnv ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin) return "";
  const params = new URLSearchParams({
    src: EMBED_STORY_SRC,
    start: EMBED_START,
    title: EMBED_TITLE,
    skin: skinId,
    c: EMBED_CAMPAIGN_ID,
  });
  return `${origin}/embed/${encodeURIComponent(EMBED_CAMPAIGN_ID)}?${params.toString()}`;
}

const RUNE_LS_KEY = "runePackByCampaignId";

const DEFAULT_SKIN = "contract_default";

export type StoryPreviewPayload = {
  storyId: string;
  jsonSrc: string;
  startPageId: string;
  title: string;
};

/**
 * Ugyanaz a localStorage + /story query minta, mint a CampaignCard „Start”.
 * Alapértelmezett skin/rune: contract_default + single ring.
 */
export function buildStoryPreviewHref(p: StoryPreviewPayload): string {
  try {
    localStorage.setItem("storySrc", p.jsonSrc);
    localStorage.setItem("currentPageId", p.startPageId);
    localStorage.setItem("storyTitle", p.title);
    const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
    all[p.storyId] = { mode: "single", icons: ["ring"] };
    localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }

  const skinPart = `&skin=${encodeURIComponent(DEFAULT_SKIN)}`;
  const runesPart = `&runes=${encodeURIComponent("ring")}&runemode=single`;

  return (
    `/story?src=${encodeURIComponent(p.jsonSrc)}` +
    `&start=${encodeURIComponent(p.startPageId)}` +
    `&title=${encodeURIComponent(p.title)}` +
    skinPart +
    runesPart
  );
}

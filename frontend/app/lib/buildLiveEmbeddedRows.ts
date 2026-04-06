import type { LiveEmbeddedEntry } from "@/app/lib/liveEmbeddedConfig";
import { deriveStoryId, type StoryListItem } from "@/app/lib/storiesListing";

export type LiveEmbeddedDisplayRow = {
  storyId: string;
  displayTitle: string;
  livePageUrl?: string;
};

/** Katalógus cím + élő konfig → megjelenítési sorok (dashboard / kezdőlap). */
export function buildLiveEmbeddedRows(
  catalog: StoryListItem[],
  live: LiveEmbeddedEntry[]
): LiveEmbeddedDisplayRow[] {
  const byId = new Map(catalog.map((s) => [deriveStoryId(s), s]));
  const rows = live.map((e) => {
    const c = byId.get(e.storyId);
    const fromCatalog = c?.title?.trim();
    const displayTitle = fromCatalog || e.title?.trim() || e.storyId;
    return {
      storyId: e.storyId,
      displayTitle,
      livePageUrl: e.livePageUrl,
    };
  });
  rows.sort((a, b) =>
    a.displayTitle.localeCompare(b.displayTitle, "hu", { sensitivity: "base" })
  );
  return rows;
}

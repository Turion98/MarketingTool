"use client";

export const LS_KEYS = Object.freeze({
  voice: "voiceApiKey",
  image: "imageApiKey",
  page: "currentPageId",
  muted: "isMuted",
  unlocked: "unlockedFragments",
  fragments: "fragmentsStore",
  globalBank: "fragmentsGlobal",
  flags: "flagsStore",
  globals: "globalsStore",
  runeImgs: "runeImagesByFlag",
  storySrc: "storySrc",
  storyTitle: "storyTitle",
  skinMap: "skinByCampaignId",
  runePackMap: "runePackByCampaignId",
});

export function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

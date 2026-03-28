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

/** Beágyazott provider (pl. szerkesztő preview): külön localStorage kulcsok. */
export function withStoragePrefix(prefix: string | undefined): typeof LS_KEYS {
  if (!prefix) return LS_KEYS;
  const out = { ...LS_KEYS } as Record<keyof typeof LS_KEYS, string>;
  (Object.keys(LS_KEYS) as Array<keyof typeof LS_KEYS>).forEach((k) => {
    out[k] = prefix + LS_KEYS[k];
  });
  return out as typeof LS_KEYS;
}

export function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function writeStorageJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

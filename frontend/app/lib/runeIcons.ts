// lib/runeIcons.ts
export const RUNE_ICON: Record<string, string> = {
  // Flag-ID-k
  rune_ch1: "/assets/runes/ch1.png",
  rune_ch2: "/assets/runes/ch2.png",
  rune_ch3: "/assets/runes/ch3.png",
  rune_bonus: "/assets/runes/bonus.png",

  // Alias kulcsok (story JSON-ban előforduló rövidek)
  cross:  "/assets/runes/ch1.png",
  branch: "/assets/runes/ch2.png",
  shield: "/assets/runes/ch3.png",

  // Extra “biztonsági” aliasok a ch3-hoz
  ch3:  "/assets/runes/ch3.png",
  ach3: "/assets/runes/ch3.png",
} as const;

export const isRuneId = (id: string) => id.startsWith("rune_");

/**
 * Bemenet lehet: absz/rel URL, flagId, alias.
 * Mindig próbálja egységesíteni → ch1.png / ch2.png / ch3.png
 */
export function resolveRuneSrc(raw?: string, fallbackFlagId?: string) {
  if (!raw) return fallbackFlagId ? RUNE_ICON[fallbackFlagId] : undefined;

  // normalize: ha valaki "rune_ch3.png"-t adott meg, cseréljük le "ch3.png"-re
  if (raw.includes("rune_ch")) {
    raw = raw.replace("rune_ch", "ch");
  }

  // ha ismert alias/flag
  if (RUNE_ICON[raw]) return RUNE_ICON[raw];

  // abszolút/relatív asset útvonalak
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  if (raw.startsWith("assets/")) return "/" + raw;

  // utolsó fallback: flag
  return fallbackFlagId ? RUNE_ICON[fallbackFlagId] : undefined;
}

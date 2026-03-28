"use client";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** Vessző / pontosvessző / szóköz szerint felbontott id-k (opció jutalom mező). */
export function parseUnlockIdsField(field: string): string[] {
  return field
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Összes olyan fragment id, amit valamely oldal opcióiban `reward.unlockFragments`-ként
 * definiáltak (mentett történet).
 */
export function collectUnlockFragmentIdsFromStory(
  story: Record<string, unknown>
): string[] {
  const set = new Set<string>();
  const visitChoice = (ch: unknown) => {
    const c = asRecord(ch);
    const r = asRecord(c?.reward);
    const uf = Array.isArray(r?.unlockFragments) ? r.unlockFragments : [];
    for (const x of uf) {
      if (typeof x === "string" && x.trim()) set.add(x.trim());
    }
  };
  const visitPage = (p: unknown) => {
    const o = asRecord(p);
    const choices = Array.isArray(o?.choices) ? o.choices : [];
    choices.forEach(visitChoice);
  };
  const pages = story.pages;
  if (Array.isArray(pages)) pages.forEach(visitPage);
  else if (pages && typeof pages === "object")
    Object.values(pages).forEach(visitPage);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Jegyzék: mentett story + az aktuális opció űrlap jutalom mezői (még nem mentett id-k). */
export function buildFragmentPicklist(
  story: Record<string, unknown>,
  choiceUnlockFields: string[]
): string[] {
  const set = new Set(collectUnlockFragmentIdsFromStory(story));
  for (const field of choiceUnlockFields) {
    for (const id of parseUnlockIdsField(field)) {
      set.add(id);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

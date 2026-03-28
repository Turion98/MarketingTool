"use client";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

const FRAGMENT_TOKEN = /\{fragment:[\w-]+\}/;

export function pageHasResolvableFragments(page: Record<string, unknown>): boolean {
  const text = page.text;
  if (typeof text === "string") return FRAGMENT_TOKEN.test(text);
  if (!Array.isArray(text)) return false;
  for (const item of text) {
    const o = asRecord(item);
    if (!o) continue;
    if (typeof o.ifUnlocked === "string") return true;
    if (typeof o.text === "string" && FRAGMENT_TOKEN.test(o.text)) return true;
  }
  return false;
}

export function choiceHasSavedFragments(choice: unknown): boolean {
  const c = asRecord(choice);
  const r = asRecord(c?.reward);
  const u = r?.unlockFragments;
  return Array.isArray(u) && u.some((x) => typeof x === "string" && x);
}

/** Opció csak feltétellel jelenik meg (zárolás / when / unlocked). */
export function choiceHasConditionalDisplay(choice: unknown): boolean {
  const c = asRecord(choice);
  if (!c) return false;
  const r = asRecord(c.reward);
  const locks = r?.locks;
  if (Array.isArray(locks) && locks.some((x) => x != null && String(x).trim()))
    return true;
  if (typeof locks === "string" && locks.trim()) return true;
  const when = asRecord(c.when);
  if (when && (when.unlocked != null || when.fragments != null)) return true;
  if (c.ifUnlocked != null) return true;
  if (c.unlocked != null) return true;
  return false;
}

function stringIds(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/**
 * Láthatóság fragmenthez kötve (`showIfHasFragment` / `hideIfHasFragment` — storyPageChoices).
 */
export function choiceHasFragmentVisibilityRule(choice: unknown): boolean {
  const c = asRecord(choice);
  if (!c) return false;
  return (
    stringIds(c.showIfHasFragment).length > 0 ||
    stringIds(c.hideIfHasFragment).length > 0
  );
}

/** Tooltip a kék ponthoz: megjelenik vs eltűnik. */
export function choiceFragmentVisibilityTitle(choice: unknown): string {
  const c = asRecord(choice);
  if (!c) return "";
  const show = stringIds(c.showIfHasFragment);
  const hide = stringIds(c.hideIfHasFragment);
  if (show.length) {
    const id = show.join(", ");
    return show.length > 1
      ? `Megjelenik, ha megvan valamelyik fragment: ${id}`
      : `Megjelenik, ha megvan a fragment: ${id}`;
  }
  if (hide.length) {
    const id = hide.join(", ");
    return hide.length > 1
      ? `Eltűnik, ha megvan valamelyik fragment: ${id}`
      : `Eltűnik, ha megvan a fragment: ${id}`;
  }
  return "";
}

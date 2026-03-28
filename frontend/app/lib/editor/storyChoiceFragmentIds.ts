"use client";

import { canonicalMilestoneFragmentId } from "../milestoneFragmentId";

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
      if (typeof x === "string" && x.trim()) {
        set.add(canonicalMilestoneFragmentId(x.trim()));
      }
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

function visitAllPages(
  story: Record<string, unknown>,
  visitor: (page: Record<string, unknown>) => void
): void {
  const pages = story.pages;
  const run = (p: unknown) => {
    const o = asRecord(p);
    if (o) visitor(o);
  };
  if (Array.isArray(pages)) pages.forEach(run);
  else if (pages && typeof pages === "object") Object.values(pages).forEach(run);
}

/** Milestone: `saveMilestone` + `{id}_DONE`, plusz bankbeli milestone-szerű kulcsok (`*_done` → kanonikus `_DONE`). */
export function collectMilestoneDoneIdsFromStory(
  story: Record<string, unknown>
): string[] {
  const set = new Set<string>();
  visitAllPages(story, (o) => {
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (id && o.saveMilestone === true) set.add(`${id}_DONE`);
  });
  const bank = asRecord(story.fragments);
  if (bank) {
    for (const k of Object.keys(bank)) {
      const c = canonicalMilestoneFragmentId(k);
      if (c.endsWith("_DONE")) set.add(c);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export type FragmentPicklistSections = {
  milestones: string[];
  others: string[];
};

export function buildFragmentPicklistSections(
  story: Record<string, unknown>,
  choiceUnlockFields: string[]
): FragmentPicklistSections {
  const milestones = collectMilestoneDoneIdsFromStory(story);
  const milestoneSet = new Set(milestones);

  const set = new Set(collectUnlockFragmentIdsFromStory(story));
  for (const field of choiceUnlockFields) {
    for (const id of parseUnlockIdsField(field)) {
      set.add(canonicalMilestoneFragmentId(id));
    }
  }
  const bank = asRecord(story.fragments);
  if (bank) {
    for (const k of Object.keys(bank)) {
      if (k.trim()) set.add(canonicalMilestoneFragmentId(k));
    }
  }
  for (const m of milestones) set.add(m);

  const others: string[] = [];
  for (const id of set) {
    if (!milestoneSet.has(id)) others.push(id);
  }
  others.sort((a, b) => a.localeCompare(b));

  return { milestones, others };
}

/** Jegyzék: mentett story + az aktuális opció űrlap jutalom mezői (még nem mentett id-k). */
export function buildFragmentPicklist(
  story: Record<string, unknown>,
  choiceUnlockFields: string[]
): string[] {
  const { milestones, others } = buildFragmentPicklistSections(
    story,
    choiceUnlockFields
  );
  return [...milestones, ...others];
}

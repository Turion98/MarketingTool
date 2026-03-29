"use client";

import { canonicalMilestoneFragmentId } from "../milestoneFragmentId";
import { findPageInStoryDocument } from "./findPageInStory";

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
    if (id && o.saveMilestone === true) {
      set.add(canonicalMilestoneFragmentId(`${id}_DONE`));
    }
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

/**
 * Szerkesztő: milestone aktív, ha `saveMilestone` be van állítva VAGY a fragment bankban
 * létezik a kanonikus `{pageId}_DONE` kulcs (JSON és UI szinkronban marad).
 */
function pageUnlocksSelfDoneViaChoiceReward(
  page: Record<string, unknown> | null,
  pageId: string
): boolean {
  if (!page) return false;
  const selfDone = canonicalMilestoneFragmentId(`${pageId}_DONE`);
  const choices = Array.isArray(page.choices) ? page.choices : [];
  for (const ch of choices) {
    const c = asRecord(ch);
    const r = asRecord(c?.reward);
    const uf = Array.isArray(r?.unlockFragments) ? r.unlockFragments : [];
    for (const x of uf) {
      if (typeof x === "string" && canonicalMilestoneFragmentId(x.trim()) === selfDone) {
        return true;
      }
    }
  }
  return false;
}

export function editorPageMilestoneActive(
  story: Record<string, unknown>,
  pageId: string | null | undefined
): boolean {
  const pid = typeof pageId === "string" ? pageId.trim() : "";
  if (!pid) return false;
  const page = findPageInStoryDocument(story, pid) as Record<
    string,
    unknown
  > | null;
  if (page?.saveMilestone === true) {
    return true;
  }
  if (pageUnlocksSelfDoneViaChoiceReward(page, pid)) {
    return false;
  }
  const key = `${pid}_DONE`;
  const canon = canonicalMilestoneFragmentId(key);
  const bank = asRecord(story.fragments);
  if (!bank) return false;
  return bank[canon] !== undefined || bank[key] !== undefined;
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

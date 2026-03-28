"use client";

import { canonicalMilestoneFragmentId } from "./milestoneFragmentId";
import type { FragmentBank, FragmentData, PageData } from "./gameStateTypes";

export function mergeFragmentBanks(
  current: FragmentBank,
  incoming?: FragmentBank
): FragmentBank {
  if (!incoming || !Object.keys(incoming).length) return current;
  return { ...current, ...incoming };
}

export function collectRehydrationFragments(params: {
  unlockedFragments: string[];
  fragments: Record<string, FragmentData>;
  globalFragments: FragmentBank;
}): Array<{ id: string; data: FragmentData }> {
  const { unlockedFragments, fragments, globalFragments } = params;
  return unlockedFragments.flatMap((id) => {
    if (fragments[id] || !globalFragments[id]) return [];
    return [
      {
        id,
        data: {
          text: globalFragments[id].text,
          replayImageId: globalFragments[id].replayImageId,
        },
      },
    ];
  });
}

export function getUnlockEnterFragmentIds(page?: PageData | null): string[] {
  const fromEnter = Array.isArray(page?.unlockEnterFragments)
    ? page.unlockEnterFragments
        .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .map((x) => canonicalMilestoneFragmentId(x.trim()))
    : [];
  const pid = typeof page?.id === "string" ? page.id.trim() : "";
  const done =
    page?.saveMilestone === true && pid ? [`${pid}_DONE`] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...fromEnter, ...done]) {
    const t = canonicalMilestoneFragmentId(raw.trim());
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

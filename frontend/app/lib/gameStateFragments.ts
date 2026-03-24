"use client";

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
  return Array.isArray(page?.unlockEnterFragments)
    ? page.unlockEnterFragments.filter(Boolean)
    : [];
}

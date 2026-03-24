"use client";

import type { FragmentData } from "../../lib/gameStateTypes";

type FragmentSource = {
  text?: string;
  replayImageId?: string;
};

type FragmentMap = Record<string, FragmentSource | undefined>;

type ChoiceAction = {
  id?: unknown;
  type?: unknown;
  unlockFragment?: unknown;
};

type ChoiceReward = {
  setGlobal?: unknown;
  unlocks?: unknown;
  locks?: unknown;
  unlockFragments?: unknown;
  saveFragment?: unknown;
  saveFragments?: unknown;
  runeImageUrl?: unknown;
};

type ChoiceObject = {
  id?: unknown;
  text?: unknown;
  label?: unknown;
  reward?: unknown;
  runeImageUrl?: unknown;
  fragmentId?: unknown;
  actions?: unknown;
};

type ChoiceMutationPageData = {
  fragmentsGlobal?: FragmentMap;
  fragments?: FragmentMap;
};

type ChoiceMutationParams = {
  reward?: ChoiceReward;
  choiceObj?: ChoiceObject;
  pageData?: ChoiceMutationPageData | null;
  unlockedFragments: string[];
  flags?: Set<string>;
  globalFragments: FragmentMap;
  fragments: FragmentMap;
};

export type ChoiceMutationPlan = {
  globalUpdates: Array<{ key: string; value: string }>;
  savedFragments: Array<{ id: string; data: FragmentData }>;
  mergedUnlockedFragments: string[];
  unlockedFragmentWrites: Array<{ id: string; data: FragmentData }>;
  flagsToSet: string[];
  newRunes: string[];
  hasCustomImage: boolean;
};

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(/[,\s]+/g))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isFlagId(id: string): boolean {
  return /^block_|^flag_|^rune_/.test(id);
}

function isRuneChoiceId(id: string): boolean {
  return /^rune_/.test(id);
}

function asActionList(actions: unknown): ChoiceAction[] {
  return Array.isArray(actions) ? (actions as ChoiceAction[]) : [];
}

function resolveFragmentSource(
  id: string,
  params: ChoiceMutationParams
): FragmentSource | null {
  return (
    params.globalFragments?.[id] ??
    params.pageData?.fragmentsGlobal?.[id] ??
    params.pageData?.fragments?.[id] ??
    params.fragments?.[id] ??
    null
  );
}

function toFragmentWrite(
  id: string,
  params: ChoiceMutationParams
): { id: string; data: FragmentData } | null {
  const source = resolveFragmentSource(id, params);
  if (!source || (!source.text && !source.replayImageId)) return null;

  return {
    id,
    data: {
      text: source.text,
      replayImageId: source.replayImageId,
    },
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildChoiceMutationPlan(
  params: ChoiceMutationParams
): ChoiceMutationPlan {
  const reward = params.reward;
  const choiceObj = params.choiceObj;

  const globalUpdates =
    reward?.setGlobal && typeof reward.setGlobal === "object"
      ? Object.entries(reward.setGlobal as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) })
        )
      : [];

  const unlocks = Array.isArray(reward?.unlocks)
    ? reward.unlocks.filter(Boolean).map(String)
    : typeof reward?.unlocks === "string"
      ? [reward.unlocks]
      : [];

  const rewardLocks = normalizeIdList(reward?.locks);

  const rewardExtra = Array.isArray(reward?.unlockFragments)
    ? reward.unlockFragments.filter(Boolean).map(String)
    : [];

  const toSave = [
    typeof reward?.saveFragment === "string" ? reward.saveFragment : null,
    ...(Array.isArray(reward?.saveFragments)
      ? reward.saveFragments.map(String)
      : []),
  ].filter((value): value is string => Boolean(value));

  const savedFragments = toSave
    .map((id) => toFragmentWrite(id, params))
    .filter((entry): entry is { id: string; data: FragmentData } => Boolean(entry));

  const actionExtra: string[] = [];
  const actionFlags: string[] = [...rewardLocks];
  asActionList(choiceObj?.actions).forEach((action) => {
    if (typeof action.unlockFragment === "string") {
      actionExtra.push(action.unlockFragment);
    }
    if (action.type === "unlockFragment" && typeof action.id === "string") {
      actionExtra.push(action.id);
    }
    if (
      (action.type === "setFlag" || action.type === "unlockRune") &&
      typeof action.id === "string"
    ) {
      actionFlags.push(action.id);
    }
  });

  const choiceExtra =
    typeof choiceObj?.fragmentId === "string" ? [choiceObj.fragmentId] : [];

  const toUnlockFragments = uniqueStrings([
    ...unlocks,
    ...rewardExtra,
    ...actionExtra,
    ...choiceExtra,
  ]).filter((id) => !isFlagId(id));

  const mergedUnlockedFragments =
    toUnlockFragments.length > 0
      ? uniqueStrings([...params.unlockedFragments, ...toUnlockFragments])
      : [];

  const unlockedFragmentWrites = toUnlockFragments
    .map((id) => toFragmentWrite(id, params))
    .filter((entry): entry is { id: string; data: FragmentData } => Boolean(entry));

  const flagsToSet = uniqueStrings(actionFlags);
  const previousRunes = new Set(
    Array.from(params.flags ?? new Set<string>()).filter(isRuneChoiceId)
  );
  const newRunes = flagsToSet.filter(
    (id) => isRuneChoiceId(id) && !previousRunes.has(id)
  );

  return {
    globalUpdates,
    savedFragments,
    mergedUnlockedFragments,
    unlockedFragmentWrites,
    flagsToSet,
    newRunes,
    hasCustomImage: Boolean(reward?.runeImageUrl || choiceObj?.runeImageUrl),
  };
}

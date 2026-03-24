"use client";

import type { FragmentBank, FragmentData, GameStateGlobals, PageData } from "./gameStateTypes";

export function nextFragmentsState(
  prev: Record<string, FragmentData>,
  id: string,
  data: FragmentData
): Record<string, FragmentData> {
  return {
    ...prev,
    [id]: {
      ...(prev[id] ?? {}),
      ...data,
      createdAt: prev[id]?.createdAt ?? Date.now(),
    },
  };
}

export function nextUnlockedFragmentsState(prev: string[], ids: string[]): string[] {
  return Array.from(new Set([...(prev ?? []), ...ids.filter(Boolean)]));
}

export function nextGlobalFragmentBankForUnlock(
  prev: FragmentBank,
  ids: string[]
): FragmentBank {
  const next: FragmentBank = { ...prev };
  ids.forEach((id) => {
    if (!id) return;
    if (!next[id]) {
      next[id] = { createdAt: Date.now() };
    }
  });
  return next;
}

export function nextFlagsState(prev: Set<string>, id: string, mode: "set" | "clear"): Set<string> {
  const next = new Set(prev);
  if (mode === "set") next.add(id);
  else next.delete(id);
  return next;
}

export function nextRuneImagesState(
  prev: Record<string, string>,
  params: { flagId: string; url?: string; mode: "set" | "clear" }
): Record<string, string> {
  if (params.mode === "set") {
    if (!params.flagId || !params.url) return prev;
    return { ...prev, [params.flagId]: params.url };
  }

  if (!params.flagId || !prev[params.flagId]) return prev;
  const next = { ...prev };
  delete next[params.flagId];
  return next;
}

export function resolveAnswerNextPage(
  page: PageData,
  res: { correct: boolean; choiceIdx: number; elapsedMs: number },
  globals: GameStateGlobals,
  newScore: number
): string | null {
  const nextSwitch = page.onAnswer?.nextSwitch;
  if (nextSwitch && typeof nextSwitch === "object") {
    const key = nextSwitch.switch;
    const probe =
      key === "score"
        ? String(newScore)
        : key === "correct"
          ? String(res.correct)
          : String(globals[key] ?? "");

    return (
      nextSwitch.cases?.[probe] ??
      nextSwitch.cases?.__default ??
      nextSwitch.default ??
      (typeof page.next === "string" ? page.next : null)
    );
  }

  return typeof page.next === "string" ? page.next : null;
}

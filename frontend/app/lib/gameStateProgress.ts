"use client";

import {
  DEFAULT_RUNE_SINGLE,
  PROGRESS_TAIL_BUFFER,
  normalizeRuneChoice,
  resolveNextFromPage,
} from "./gameStateHelpers";
import type {
  GameStateGlobals,
  PageData,
  ProgressDisplay,
  RuneChoice,
} from "./gameStateTypes";

type ProgressMilestone = ProgressDisplay["milestones"][number];

export function createEmptyProgressDisplay(): ProgressDisplay {
  return { value: 0, milestones: [] };
}

export function normalizeProgressMilestones(raw: unknown): ProgressMilestone[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map<ProgressMilestone | null>((entry) => {
      if (typeof entry === "number") {
        return { x: Math.max(0, Math.min(1, entry)) };
      }

      if (!entry || typeof entry !== "object") return null;

      const x = "x" in entry ? entry.x : undefined;
      if (typeof x !== "number") return null;

      const label = "label" in entry && typeof entry.label === "string" ? entry.label : undefined;
      return { x: Math.max(0, Math.min(1, x)), label };
    })
    .filter((entry): entry is ProgressMilestone => entry !== null);
}

export function calculateProgressState(params: {
  visitedPages: Set<string>;
  currentPageData?: PageData | null;
  globals: GameStateGlobals;
}): { value: number; display: ProgressDisplay } {
  const { visitedPages, currentPageData, globals } = params;
  const steps = visitedPages.size;
  const hasChoices =
    Array.isArray(currentPageData?.choices) && (currentPageData?.choices?.length ?? 0) > 0;
  const nextId = resolveNextFromPage(currentPageData, globals as Record<string, string>);
  const isTerminal = !!currentPageData && !hasChoices && !nextId;

  let value = 0;
  if (isTerminal) {
    value = 1;
  } else if (steps > 1) {
    const effectiveSteps = steps - 1;
    const denom = effectiveSteps + PROGRESS_TAIL_BUFFER;
    value = Math.min(1, effectiveSteps / denom);
  }

  return {
    value,
    display: {
      value,
      milestones: [],
      label: undefined,
    },
  };
}

export function resolveInitialRuneChoice(params: {
  storyId?: string;
  queryChoice?: RuneChoice | null;
  savedChoices?: Record<string, RuneChoice>;
}): RuneChoice {
  const { storyId, queryChoice, savedChoices } = params;
  if (queryChoice) return normalizeRuneChoice(queryChoice);

  const saved = storyId ? savedChoices?.[storyId] : undefined;
  if (saved) return normalizeRuneChoice(saved);

  return normalizeRuneChoice({ mode: "single", icons: DEFAULT_RUNE_SINGLE });
}

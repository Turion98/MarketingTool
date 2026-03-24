"use client";

export const NEXT_DOCK_CHOICE_ID = "__NEXT__";

export type DockChoiceItem = {
  id: string;
  label: string;
  disabled: boolean;
};

export type StoryPageChoiceRecord = {
  id?: unknown;
  text?: unknown;
  label?: unknown;
  disabled?: unknown;
  next?: unknown;
  reward?: unknown;
  showIfHasFragment?: unknown;
  hideIfHasFragment?: unknown;
  [key: string]: unknown;
};

type BuildDockChoicesParams = {
  canInteractHere: boolean;
  pageId?: string;
  choices?: unknown;
  resolvedNext?: string | null;
  unlockedFragments: string[];
};

type ResolveDockSelectionParams = {
  choiceId: string;
  pageId?: string;
  choices?: unknown;
  resolvedNext?: string | null;
};

export type ResolvedDockSelection = {
  next: string;
  reward: unknown;
  choice: StoryPageChoiceRecord;
};

function asChoiceArray(choices: unknown): StoryPageChoiceRecord[] {
  return Array.isArray(choices) ? (choices as StoryPageChoiceRecord[]) : [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function buildDockChoices({
  canInteractHere,
  pageId,
  choices,
  resolvedNext,
  unlockedFragments,
}: BuildDockChoicesParams): DockChoiceItem[] {
  if (!canInteractHere) return [];

  const allChoices = asChoiceArray(choices);
  if (allChoices.length > 0) {
    const unlockedSet = new Set(unlockedFragments);

    const visibleChoices = allChoices
      .map((choice, index) => {
        const choiceId = String(choice.id ?? index);
        const showList = toStringArray(choice.showIfHasFragment);
        const hideList = toStringArray(choice.hideIfHasFragment);

        let visible = true;
        if (showList.length > 0) {
          visible = showList.some((fragmentId) => unlockedSet.has(fragmentId));
        }
        if (visible && hideList.length > 0) {
          visible = !hideList.some((fragmentId) => unlockedSet.has(fragmentId));
        }

        return { choice, id: choiceId, visible };
      })
      .filter((entry) => entry.visible);

    if (visibleChoices.length > 0) {
      return visibleChoices.map((entry) => ({
        id: entry.id,
        label: String(
          entry.choice.text ??
            entry.choice.label ??
            entry.choice.id ??
            `choice_${entry.id}`
        ),
        disabled: Boolean(entry.choice.disabled),
      }));
    }

    if (resolvedNext && resolvedNext !== pageId) {
      return [
        {
          id: NEXT_DOCK_CHOICE_ID,
          label: "Next",
          disabled: false,
        },
      ];
    }

    return [];
  }

  if (resolvedNext && resolvedNext !== pageId) {
    return [
      {
        id: NEXT_DOCK_CHOICE_ID,
        label: "Next",
        disabled: false,
      },
    ];
  }

  return [];
}

export function resolveDockSelection({
  choiceId,
  pageId,
  choices,
  resolvedNext,
}: ResolveDockSelectionParams): ResolvedDockSelection | null {
  const allChoices = asChoiceArray(choices);
  const realChoice =
    allChoices.find(
      (choice, index) => String(choice.id ?? index) === String(choiceId)
    ) ?? null;

  if (realChoice) {
    return {
      next: String(realChoice.next ?? ""),
      reward: realChoice.reward,
      choice: realChoice,
    };
  }

  if (
    choiceId === NEXT_DOCK_CHOICE_ID &&
    resolvedNext &&
    resolvedNext !== pageId
  ) {
    return {
      next: String(resolvedNext),
      reward: undefined,
      choice: {
        id: NEXT_DOCK_CHOICE_ID,
        text: "Next",
        next: String(resolvedNext),
      },
    };
  }

  return null;
}

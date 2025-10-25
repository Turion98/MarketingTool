// /components/ChoiceButtons/ChoiceButtons.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import style from "./ChoiceButtons.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { trackChoice, trackUiClick } from "../../lib/analytics";

export type Choice = {
  id?: string;
  text: string;
  next: string;
  reward?: any;
  lockedIf?: string[] | string;
  disabled?: boolean;
  fragmentId?: string;
  actions?: Array<
    | { type: string; id?: string }
    | { unlockFragment?: string }
  >;
};

type Props = {
  choices: Choice[];
  unlockedFragments: string[];
  show: boolean;
  onChoiceSelected: (next: string, reward?: any, choiceObj?: Choice) => void;
};

// segédfüggvény osztályösszefűzésre
function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

const ChoiceButtons: React.FC<Props> = ({
  choices,
  unlockedFragments,
  onChoiceSelected,
  show,
}) => {
  // 🔄 phase: riddle parity
  // - "hidden"   → még nem jelent meg
  // - "visible"  → látható, interaktív
  // - "exiting"  → kifade-elés pillanatában
  const [phase, setPhase] = useState<"hidden" | "visible" | "exiting">(
    show ? "visible" : "hidden"
  );

  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  // amikor show változik, állítsuk a phase-t
  useEffect(() => {
    if (show) {
      setPhase("visible");
    } else {
      // ha le akarjuk venni, előbb tegyük "exiting"-re
      // (ha a parent azonnal unmountolja, ez úgysem fog látszani,
      //  de ha bent hagyja egy pillanatra, akkor szép lesz)
      setPhase((prev) => (prev === "visible" ? "exiting" : "hidden"));
    }
  }, [show]);

  const safeUnlocked = useMemo(
    () => (Array.isArray(unlockedFragments) ? unlockedFragments : []),
    [unlockedFragments]
  );

  const safeChoices = useMemo<Choice[]>(
    () => (Array.isArray(choices) ? choices : []),
    [choices]
  );

  const pickFragmentIdFromActions = (choice: Choice): string | undefined => {
    if (!Array.isArray(choice.actions)) return undefined;

    // Séma #2 előnyben: { unlockFragment: "id" }
    const direct = choice.actions.find(
      (a: any) => typeof (a as any)?.unlockFragment === "string"
    ) as { unlockFragment?: string } | undefined;
    if (direct?.unlockFragment) return direct.unlockFragment;

    // Séma #1: { type: "unlockFragment", id: "id" }
    const typed = choice.actions.find(
      (a: any) =>
        (a as any)?.type === "unlockFragment" &&
        typeof (a as any)?.id === "string"
    ) as { type: string; id?: string } | undefined;

    return typed?.id;
  };

  const handleClick = (choice: Choice) => {
    const fragFromActions = pickFragmentIdFromActions(choice);
    const ensuredChoice: Choice = {
      ...choice,
      fragmentId: choice.fragmentId ?? fragFromActions,
    };

    onChoiceSelected(ensuredChoice.next, ensuredChoice.reward, ensuredChoice);

    // Analitika – best-effort
    try {
      if (storyId && sessionId && currentPageId) {
        const label =
          typeof ensuredChoice.text === "string"
            ? ensuredChoice.text
            : String(ensuredChoice.id ?? "");
        trackChoice(
          String(storyId),
          String(sessionId),
          String(currentPageId),
          String(ensuredChoice.id ?? ""),
          label
        );
      }
    } catch {
      /* no-op */
    }
  };

  return (
    <nav
      className={cx(
        style.choiceButtons,
        phase === "visible" && style.visible,
        phase === "exiting" && style.exiting
      )}
      aria-label="Choices"
      data-role="choices"
    >
      {safeChoices.map((choice, index) => {
        // lockedIf normalizálása tömbbé
        const lockedIfArr: string[] = Array.isArray(choice.lockedIf)
          ? choice.lockedIf.filter(Boolean)
          : typeof choice.lockedIf === "string"
          ? [choice.lockedIf]
          : [];

        // Zár logika
        const isLocked = lockedIfArr.some((lock) =>
          safeUnlocked.includes(lock)
        );
        const disabled = !!choice.disabled || isLocked;

        const key = (choice.id ?? `idx-${index}`).toString();

        return (
          <button
            key={key}
            type="button"
            className={cx(style.choiceButton, isLocked && style.locked)}
            onClick={() => !disabled && handleClick(choice)}
            onMouseDown={() => {
              if (disabled && storyId && sessionId && currentPageId) {
                try {
                  trackUiClick(
                    String(storyId),
                    String(sessionId),
                    String(currentPageId),
                    "choice_locked",
                    {
                      choiceId: key,
                      reason: isLocked ? "lockedIf" : "disabled",
                    }
                  );
                } catch {
                  /* no-op */
                }
              }
            }}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            aria-label={isLocked ? `${choice.text} – zárolva` : choice.text}
            title={isLocked ? "Ez az út jelenleg zárolva" : ""}
            data-choice-id={key}
            data-locked={isLocked ? "true" : "false"}
          >
            {choice.text} {isLocked && "🔒"}
          </button>
        );
      })}
    </nav>
  );
};

export default ChoiceButtons;

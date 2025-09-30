// /components/ChoiceButtons/ChoiceButtons.tsx
"use client";

import React, { useEffect, useState } from "react";
import style from "./ChoiceButtons.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { trackChoice, trackUiClick } from "../../lib/analytics";

export type Choice = {
  id?: string;
  text: string;
  next: string;
  reward?: any;

  /** Lehet string VAGY string[] – normalizáljuk tömbbé render előtt */
  lockedIf?: string[] | string;

  disabled?: boolean;

  /** Átadjuk a StoryPage-nek (fallback: actions alapján töltjük ki) */
  fragmentId?: string;

  /**
   * Két támogatott séma:
   * 1) { type: "unlockFragment", id: string }
   * 2) { unlockFragment: string }
   */
  actions?: Array<
    | { type: string; id?: string }
    | { unlockFragment?: string }
  >;
};

type Props = {
  choices: Choice[];
  unlockedFragments: string[];
  show: boolean;
  // next, reward, teljes choiceObj
  onChoiceSelected: (next: string, reward?: any, choiceObj?: Choice) => void;
};

const ChoiceButtons: React.FC<Props> = ({
  choices,
  unlockedFragments,
  onChoiceSelected,
  show,
}) => {
  const [animate, setAnimate] = useState(false);

  // Kontextus az analitikához
  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  useEffect(() => {
    setAnimate(!!show);
  }, [show]);

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
    // Normalizált fragmentId: explicit → actions-ből származtatott
    const fragFromActions = pickFragmentIdFromActions(choice);
    const ensuredChoice: Choice = {
      ...choice,
      fragmentId: choice.fragmentId ?? fragFromActions,
    };

    // EREDETI LOGIKA
    onChoiceSelected(ensuredChoice.next, ensuredChoice.reward, ensuredChoice);

    // ANALITIKA – fail-safe
    try {
      if (storyId && sessionId && currentPageId) {
        const label =
          typeof ensuredChoice.text === "string" ? ensuredChoice.text : String(ensuredChoice.id ?? "");
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

  const safeUnlocked = Array.isArray(unlockedFragments) ? unlockedFragments : [];

  return (
    <div className={`${style.choiceButtons} ${animate ? style.visible : ""}`}>
      {(choices ?? []).map((choice, index) => {
        // lockedIf normalizálása tömbbé
        const lockedIfArr: string[] = Array.isArray(choice.lockedIf)
          ? choice.lockedIf.filter(Boolean)
          : typeof choice.lockedIf === "string"
          ? [choice.lockedIf]
          : [];

        // Zár logika: ha bármelyik feltétel szerepel az unlockedFragments-ben, zárolt
        const isLocked = lockedIfArr.some((lock) => safeUnlocked.includes(lock));

        const disabled = !!choice.disabled || isLocked;

        return (
          <button
            key={choice.id ?? index}
            className={`${style.choiceButton} ${isLocked ? style.locked : ""}`}
            onClick={() => !disabled && handleClick(choice)}
            // opcionális: ha zároltra kattint, logoljuk ui_click-ként
            onMouseDown={() => {
              if (disabled && storyId && sessionId && currentPageId) {
                try {
                  trackUiClick(
                    String(storyId),
                    String(sessionId),
                    String(currentPageId),
                    "choice_locked",
                    { choiceId: String(choice.id ?? index), reason: isLocked ? "lockedIf" : "disabled" }
                  );
                } catch {}
              }
            }}
            disabled={disabled}
            aria-disabled={disabled}
            title={isLocked ? "Ez az út jelenleg zárolva" : ""}
          >
            {choice.text} {isLocked && "🔒"}
          </button>
        );
      })}
    </div>
  );
};

export default ChoiceButtons;

"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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

  /** ⬅️ ÚJ: StoryPage adja be, hogy mikor kezdődjön az EXIT anim */
  requestExit?: boolean;

  /** ⬅️ ÚJ: StoryPage kapjon visszajelzést, ha az EXIT anim LEFUTOTT */
  onExitDone?: () => void;

  /** mennyi idő az exit anim ms-ben (StoryPage-nek is kell tudni timingot kalkulálni) */
  exitMs?: number;
};

/* helper */
function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

/* utility: várjuk meg az anim/transition végét (mint RiddleQuiz.waitForExitAnimation) */
function waitForExitAnimation(el: HTMLElement | null, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!el) {
      setTimeout(resolve, timeoutMs + 50);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("animationend", onAnimEnd, true);
      el.removeEventListener("transitionend", onTransEnd, true);
      resolve();
    };
    const onAnimEnd = () => finish();
    const onTransEnd = () => finish();
    el.addEventListener("animationend", onAnimEnd, true);
    el.addEventListener("transitionend", onTransEnd, true);
    window.setTimeout(finish, timeoutMs + 80);
  });
}

const ChoiceButtons: React.FC<Props> = ({
  choices,
  unlockedFragments,
  onChoiceSelected,
  show,
  requestExit = false,
  onExitDone,
  exitMs = 220, // syncben a SCSS --ch-dur-exit-tel
}) => {
  // phase: riddle-parity
  // hidden  -> láthatatlan (még nem mount animation)
  // visible -> aktív, interaktív
  // exiting -> kifade-el (pointer-events:none)
  const [phase, setPhase] = useState<"hidden" | "visible" | "exiting">(
    show ? "visible" : "hidden"
  );

  const rootRef = useRef<HTMLElement | null>(null);

  // Analytics context
  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  // figyeljük a show flag-et (belépés)
  useEffect(() => {
    if (show) {
      setPhase("visible");
    } else {
      // ha valamiért false-ra váltaná a parent, de mi még nem kérünk exitet,
      // akkor se ugorjunk rögtön hidden-be, megőrizzük amit eddig tudunk
    }
  }, [show]);

  // figyeljük a requestExit-et (kilépés)
  useEffect(() => {
    if (!requestExit) return;
    // ha még nem exiting, állítsuk át és várjuk meg az anim végét
    if (phase !== "exiting") {
      setPhase("exiting");

      // várjuk meg az anim végét, majd jelezzünk vissza
      waitForExitAnimation(rootRef.current, exitMs).then(() => {
        onExitDone?.();
      });
    }
  }, [requestExit, phase, exitMs, onExitDone]);

  const safeUnlocked = useMemo(
    () => (Array.isArray(unlockedFragments) ? unlockedFragments : []),
    [unlockedFragments]
  );

  const safeChoices = useMemo<Choice[]>(
    () => (Array.isArray(choices) ? choices : []),
    [choices]
  );

  const pickFragmentIdFromActions = useCallback((choice: Choice): string | undefined => {
    if (!Array.isArray(choice.actions)) return undefined;

    const direct = choice.actions.find(
      (a: any) => typeof (a as any)?.unlockFragment === "string"
    ) as { unlockFragment?: string } | undefined;
    if (direct?.unlockFragment) return direct.unlockFragment;

    const typed = choice.actions.find(
      (a: any) =>
        (a as any)?.type === "unlockFragment" &&
        typeof (a as any)?.id === "string"
    ) as { type: string; id?: string } | undefined;

    return typed?.id;
  }, []);

  const handleClick = (choice: Choice) => {
    const fragFromActions = pickFragmentIdFromActions(choice);
    const ensuredChoice: Choice = {
      ...choice,
      fragmentId: choice.fragmentId ?? fragFromActions,
    };

    onChoiceSelected(ensuredChoice.next, ensuredChoice.reward, ensuredChoice);

    // analytics best-effort
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
      ref={rootRef}
      className={cx(
        style.choiceButtons,
        phase === "visible" && style.visible,
        phase === "exiting" && style.exiting
      )}
      aria-label="Choices"
      data-role="choices"
    >
      {safeChoices.map((choice, index) => {
        const lockedIfArr: string[] = Array.isArray(choice.lockedIf)
          ? choice.lockedIf.filter(Boolean)
          : typeof choice.lockedIf === "string"
          ? [choice.lockedIf]
          : [];

        const isLocked = lockedIfArr.some((lock) => safeUnlocked.includes(lock));
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

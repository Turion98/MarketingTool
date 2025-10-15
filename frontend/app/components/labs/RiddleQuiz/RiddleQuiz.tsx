"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import styles from "./RiddleQuiz.module.scss";
import { useGameState } from "../../../lib/GameStateContext"; // ← ha más az útvonalad, igazítsd

export type RiddleQuizResult = {
  correct: boolean;
  choiceIdx: number;
  elapsedMs: number;
};

export type RiddleQuizProps = {
  /** (Opcionális) az aktuális PageData, hogy a motor tudjon léptetni onAnswer alapján */
  page?: any;

  /** Opcionális — ha nem adod meg, a kérdés a Narration/Text blokkban lehet */
  question?: string;
  /** Kötelező — felkínált válaszlehetőségek */
  options: string[];
  /** Kötelező — a helyes opció indexe */
  correctIndex: number;

  /** Vizuális visszajelzés jó válasznál (háttér nélküli felirat) */
  correctLabel?: string;                 // alap: "Helyes!"
  /** Hol jelenjen meg a felirat: a lista felett vagy a gomb jobb oldalán */
  showCorrectLabel?: "above" | "inline"; // alap: "above"

  /** Komponens szintű tiltás (pl. betöltéskor) */
  disabled?: boolean;

  /** Külső className hozzáfűzése (wrapper) */
  className?: string;

  /** Jelzés a motor/analitika felé */
  onResult?: (res: RiddleQuizResult) => void;

  /** Opcionális SFX jelzés */
  onPlaySfx?: (id: string) => void;
};

// ===== Tokenizálható időzítések =====
const COMMIT_DELAY_MS = 300;
const FEEDBACK_HOLD_MS = 700;
const EXIT_FADE_MS = 420;

// Segédfüggvény: megvárjuk az exit anim végét (animationend/transitionend vagy timeout)
function waitForExitAnimation(el: HTMLElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
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

export default function RiddleQuiz({
  page,
  question,
  options,
  correctIndex,
  correctLabel = "Helyes!",
  showCorrectLabel = "above",
  disabled = false,
  className,
  onResult,
  onPlaySfx,
}: RiddleQuizProps) {
  const { handleAnswer } = useGameState(); // ← motor-léptetés
  const rootRef = useRef<HTMLDivElement | null>(null);
  const t0Ref = useRef<number>(performance.now?.() ?? Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "locked" | "correct" | "incorrect" | "exiting">("idle");

  // reset, ha az options vagy a helyes index változik
  useEffect(() => {
    setPicked(null);
    setPhase("idle");
    t0Ref.current = (performance.now?.() ?? Date.now());
  }, [options, correctIndex]);

  const canInteract = !disabled && phase === "idle";

  const handlePick = useCallback((idx: number) => {
    if (!canInteract) return;

    // 1) azonnali választás + "locked" fázis
    setPicked(idx);
    setPhase("locked");

    // 2) rövid commit-ablak
    window.setTimeout(() => {
      const now = performance.now?.() ?? Date.now();
      const elapsedMs = Math.max(0, now - t0Ref.current);
      const isCorrect = idx === correctIndex;

      setPhase(isCorrect ? "correct" : "incorrect");

      // SFX-ek
      if (isCorrect) onPlaySfx?.("quiz_correct");
      else onPlaySfx?.("quiz_incorrect");

      // 3) feedback tartás → exiting → jelzés(ek)
      window.setTimeout(async () => {
        setPhase("exiting");
        const el = rootRef.current;
        if (el) {
          await waitForExitAnimation(el, EXIT_FADE_MS);
        } else {
          await new Promise((r) => setTimeout(r, EXIT_FADE_MS));
        }

        const result = { correct: isCorrect, choiceIdx: idx, elapsedMs };

        // ⬇️ 1) Külső callback (megmarad)
        try {
          onResult?.(result);
        } finally {
          // ⬇️ 2) Motor: onAnswer.nextSwitch feloldás + navigáció
          if (handleAnswer && page) {
            handleAnswer(page, result);
          }
        }
      }, FEEDBACK_HOLD_MS);
    }, COMMIT_DELAY_MS);
  }, [canInteract, correctIndex, onResult, onPlaySfx, handleAnswer, page]);

  // ARIA
  const listRole = useMemo<"listbox" | "group">(
    () => (options.length <= 4 ? "listbox" : "group"),
    [options.length]
  );

  return (
    <div
      ref={rootRef}
      className={clsx(styles.quizRoot, className)}
      data-quiz-phase={phase}
      data-picked={picked ?? -1}
      style={{ ["--rq-dur-exit" as any]: `${EXIT_FADE_MS}ms` }}
    >
      {showCorrectLabel === "above" && phase === "correct" && (
        <div className={styles.feedbackOK} aria-live="polite">
          {correctLabel}
        </div>
      )}

      {question && <div className={styles.question}>{question}</div>}

      <ul className={styles.options} role={listRole} aria-disabled={!canInteract}>
        {options.map((opt, idx) => {
          const isPicked = picked === idx;
          const isCorrect = phase !== "idle" && idx === correctIndex;
          const isIncorrect = phase !== "idle" && isPicked && !isCorrect;

          return (
            <li key={idx} className={styles.item}>
              <button
                type="button"
                className={clsx(
                  styles.btn,
                  isPicked && styles.picked,
                  isCorrect && styles.correct,
                  isIncorrect && styles.incorrect
                )}
                onClick={() => handlePick(idx)}
                data-disabled={!canInteract}
                aria-pressed={isPicked}
                data-idx={idx}
                data-state={
                  isCorrect ? "picked-correct"
                  : isIncorrect ? "picked-incorrect"
                  : isPicked ? "picked"
                  : "idle"
                }
              >
                <span className={styles.label}>{opt}</span>

                {showCorrectLabel === "inline" && isCorrect && (
                  <span className={styles.feedbackOKInline} aria-hidden>
                    {correctLabel}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

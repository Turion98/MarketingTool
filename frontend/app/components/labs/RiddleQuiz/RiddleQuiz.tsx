"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import styles from "./RiddleQuiz.module.scss";

export type RiddleQuizResult = {
  correct: boolean;
  choiceIdx: number;
  elapsedMs: number;
};

export type RiddleQuizProps = {
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

  /** Jelzés a motor felé (analitika, navigáció) */
  onResult?: (res: RiddleQuizResult) => void;

  /** Opcionális SFX jelzés */
  onPlaySfx?: (id: string) => void;
};

// ===== Tokenizálható időzítések =====
const COMMIT_DELAY_MS = 300;   // „locked” fázis ideje, mielőtt eldől a helyes/hibás
const FEEDBACK_HOLD_MS = 300;  // rövid tartás, hogy lásd a correct/incorrect állapotot
const EXIT_FADE_MS = 420;      // a globális kifade időtartama (CSS-sel is felülírható)

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
    const onAnimEnd = (e: Event) => {
      // Ha több anim lenne, bármelyik befejezése elég a kifadéhoz
      finish();
    };
    const onTransEnd = (e: Event) => {
      // Ha csak opacity transition fut, ez is jó
      finish();
    };
    el.addEventListener("animationend", onAnimEnd, true);
    el.addEventListener("transitionend", onTransEnd, true);
    window.setTimeout(finish, timeoutMs + 80); // kis ráhagyás
  });
}

export default function RiddleQuiz({
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

    // 1) azonnali választás + "locked" (commit) fázis
    setPicked(idx);
    setPhase("locked");

    // 2) rövid commit-ablak, hogy a lenyomás/hover anim finoman „megérkezzen”
    window.setTimeout(() => {
      const now = performance.now?.() ?? Date.now();
      const elapsedMs = Math.max(0, now - t0Ref.current);
      const isCorrect = idx === correctIndex;

      setPhase(isCorrect ? "correct" : "incorrect");

      // SFX-ek a tényleges eredményhez időzítve
      if (isCorrect) onPlaySfx?.("quiz_correct");
      else onPlaySfx?.("quiz_incorrect");

      // 3) rövid tartás, majd globális "exiting" kifade
      window.setTimeout(async () => {
        setPhase("exiting");
        const el = rootRef.current;
        if (el) {
          // Várjuk a kifade végét (CSS anim/transition), aztán onResult
          await waitForExitAnimation(el, EXIT_FADE_MS);
        } else {
          // ha nincs ref (nem várható), fallback timeout
          await new Promise((r) => setTimeout(r, EXIT_FADE_MS));
        }
        onResult?.({ correct: isCorrect, choiceIdx: idx, elapsedMs });
      }, FEEDBACK_HOLD_MS);
    }, COMMIT_DELAY_MS);
  }, [canInteract, correctIndex, onResult, onPlaySfx]);

  // ARIA és a11y apróságok
  const listRole = useMemo<"listbox" | "group">(
    () => (options.length <= 4 ? "listbox" : "group"),
    [options.length]
  );

  return (
    <div
      ref={rootRef}
      className={clsx(styles.quizRoot, className)}
      data-quiz-phase={phase}         // "idle" | "locked" | "correct" | "incorrect" | "exiting"
      data-picked={picked ?? -1}
      style={
        // opcionális: a JS-ből is átadhatod az exit időt CSS-nek (felülírható a SCSS-ben tokennel)
        { ["--rq-dur-exit" as any]: `${EXIT_FADE_MS}ms` }
      }
    >
      {/* felirat jó válasz esetén – háttér nélkül, csak tipó */}
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
                disabled={!canInteract}
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

                {/* inline jó-válasz felirat, ha ezt kéred */}
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

"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import clsx from "clsx";
import styles from "./PuzzleRunes.module.scss";
import { trackPuzzleTry, trackPuzzleResult } from "../../../lib/analytics";
import { useUiClickSound } from "../../../lib/useUiClickSound";

type PuzzleRunesMode = "ordered" | "set";
type PuzzleRunesFeedback = "keep" | "reset";

type PuzzleRunesProps = {
  options: string[];
  /** Klasszikus módhoz: helyes megoldások listája. Open módban elhagyható. */
  answer?: string[];
  maxAttempts?: number;

  /** Hány runát lehet / kell kiválasztani. Ha nincs, answer.length vagy fallback. */
  maxPick?: number;
  /** Open módban (nincs answer): legalább ennyi kell beküldéshez. Graded módban figyelmen kívül hagyva. */
  minPick?: number;

  /** onResult: eredmény + ténylegesen kiválasztott opciók */
  onResult: (ok: boolean, picked: string[]) => void;

  // ⬇️ kötelező az analytics miatt:
  storyId: string;
  sessionId: string;
  pageId: string;
  puzzleId: string;

  // ⬇️ skin/layout
  className?: string;
  buttonClassName?: string;

  // ⬇️ működési módok
  mode?: PuzzleRunesMode; // "ordered" | "set" (default: "ordered")
  feedback?: PuzzleRunesFeedback; // "keep" | "reset" (csak set-módban értelmezett; default: "reset")
};

// ===== Riddle-hez igazított időzítések (tokenizálva CSS-ben is) =====
const COMMIT_DELAY_MS = 300; // „locked/commit” ablak (ugyanaz, mint Riddle)
const FEEDBACK_HOLD_MS = 300; // rövid tartás a correct/incorrect állapothoz
const EXIT_FADE_MS = 420; // kifade idő — TS → CSS-nek átadjuk --pr-dur-exit-ként

// Riddle mintájú exit-várakoztató (anim/transition end vagy timeout)
function waitForExitAnimation(
  el: HTMLElement,
  timeoutMs: number
): Promise<void> {
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

function HeartIcon({
  filled = false,
  title,
}: {
  filled?: boolean;
  title?: string;
}) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      className={filled ? styles.heartFilled : styles.heartOutline}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 21s-6.716-4.297-9.428-7.01C.858 12.275.5 10.59 1.2 9.108 2.33 6.73 5.47 6.062 7.4 7.904L12 12.25l4.6-4.346c1.93-1.842 5.07-1.174 6.2 1.204.7 1.482.342 3.167-1.372 4.882C18.716 16.703 12 21 12 21z" />
    </svg>
  );
}

export default function PuzzleRunes({
  options,
  answer,
  maxAttempts = 3,
  maxPick: maxPickProp,
  minPick: minPickProp,
  onResult,
  storyId,
  sessionId,
  pageId,
  puzzleId,
  className,
  buttonClassName,
  mode = "ordered",
  feedback = "reset",
}: PuzzleRunesProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 🔊 UI kattintáshang (InteractionDock-kal egységes)
  const playClick = useUiClickSound();
  // 🔊 pozitív (helyes) hang
  const playSuccess = useUiClickSound("/sounds/puzzle-success.wav");
  // 🔊 negatív (hibás) hang
  const playError = useUiClickSound("/sounds/puzzle-error.wav");

  const [picked, setPicked] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);

  const [lockedCorrect, setLockedCorrect] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<Set<string>>(new Set());

  const t0Ref = useRef<number>(performance.now?.() ?? Date.now());
  const flashTidRef = useRef<number | null>(null);
  const firstPickDoneRef = useRef(false);

  // ÚJ: Riddle-féle fázisgép
  // "idle" → "locked" (commit) → "correct"/"incorrect" (rövid tartás) → "exiting" (kifade)
  const [phase, setPhase] = useState<
    "idle" | "locked" | "correct" | "incorrect" | "exiting"
  >("idle");

  const effectiveAnswer = Array.isArray(answer) ? answer : [];
  const hasAnswer = effectiveAnswer.length > 0;

  const maxPick =
    typeof maxPickProp === "number" && maxPickProp > 0
      ? maxPickProp
      : hasAnswer
      ? effectiveAnswer.length
      : 2; // open puzzle fallback: pl. 2 választás

  const minPickOpen = Math.max(
    1,
    !hasAnswer &&
      typeof minPickProp === "number" &&
      minPickProp > 0
      ? Math.min(minPickProp, maxPick)
      : hasAnswer
        ? maxPick
        : 1
  );

  const answerSet = useMemo(() => new Set(effectiveAnswer), [effectiveAnswer]);

  const pickedTotal = picked.length + lockedCorrect.size;
  const canSubmit = hasAnswer
    ? mode === "ordered"
      ? picked.length === maxPick
      : pickedTotal === maxPick
    : mode === "ordered"
      ? picked.length >= minPickOpen && picked.length <= maxPick
      : pickedTotal >= minPickOpen && pickedTotal <= maxPick;

  const softResetWrongFlashSoon = () => {
    if (flashTidRef.current != null) {
      window.clearTimeout(flashTidRef.current);
      flashTidRef.current = null;
    }
    flashTidRef.current = window.setTimeout(() => {
      setWrongFlash(new Set());
      flashTidRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (flashTidRef.current != null) {
        window.clearTimeout(flashTidRef.current);
        flashTidRef.current = null;
      }
    };
  }, []);

  // Interakciók
  const pick = (id: string) => {
    if (lockedCorrect.has(id)) return;
    if (picked.includes(id)) return;
    if (picked.length + lockedCorrect.size >= maxPick) return;

    playClick(); // 🔊 minden rúnaválasztásnál

    if (!firstPickDoneRef.current) {
      firstPickDoneRef.current = true;
      t0Ref.current = performance.now?.() ?? Date.now();
    }
    setPicked((p) => [...p, id]);
  };

  const undo = (id: string) => {
    if (lockedCorrect.has(id)) return;

    playClick(); // 🔊 visszavonás hangja

    setPicked((p) => p.filter((x) => x !== id));
  };

  const hardReset = () => {
    playClick(); // 🔊 reset gomb hangja

    setPicked([]);
    setLockedCorrect(new Set());
    setWrongFlash(new Set());
    firstPickDoneRef.current = false;
    t0Ref.current = performance.now?.() ?? Date.now();
    setPhase("idle"); // vissza nyugalmi állapotba
  };

  // Submit — a Riddle flow-ját követjük, de: SET+KEEP hibánál NINCS exiting
  const submit = useCallback(() => {
    if (!canSubmit || phase !== "idle") return;

    playClick(); // 🔊 submit gomb hangja

    // 1) LOCKED ablak (finom hover/active beérkezés)
    setPhase("locked");

    window.setTimeout(() => {
      const now = performance.now?.() ?? Date.now();
      const durationMs = Math.max(0, now - (t0Ref.current || now));

      const pickedSnapshot = [...picked];
      let ok = false;

      if (hasAnswer) {
        // Klasszikus puzzle mód: van answer
        if (mode === "ordered") {
          ok =
            pickedSnapshot.length === maxPick &&
            pickedSnapshot.every((x, i) => x === effectiveAnswer[i]);
        } else {
          const all = [...lockedCorrect, ...pickedSnapshot];
          const uniqueAll = Array.from(new Set(all));
          const correctCount = uniqueAll.filter((x) =>
            answerSet.has(x)
          ).length;
          ok = correctCount === maxPick;

          if (!ok) {
            const wrong = pickedSnapshot.filter((x) => !answerSet.has(x));
            if (wrong.length) {
              setWrongFlash(new Set(wrong));
              softResetWrongFlashSoon();
            }
          }
        }
      } else {
        // OPEN MODE: nincs answer → minden érvényes választás "ok"
        ok = true;
      }

      // 2) Jelöljük a végeredmény fázist vizuálisan
      setPhase(ok ? "correct" : "incorrect");

      // 🔊 eredményi hangok
      if (ok) {
        playSuccess();
      } else {
        playError();
      }

      // 3) Analitika – try + result (hogy a report tries/solved és success rate helyes legyen)
      const attemptNum = attempts + 1;
      const extra = {
        kind: "runes" as const,
        size: options.length,
        mode,
        pickedCount: pickedSnapshot.length,
        keptCorrect: lockedCorrect.size,
        hasAnswer,
        maxPick,
        pickedLabels: [...pickedSnapshot],
      };
      try {
        trackPuzzleTry(storyId, sessionId, pageId, puzzleId, attemptNum, extra);
        trackPuzzleResult(
          storyId,
          sessionId,
          pageId,
          puzzleId,
          ok,
          attemptNum,
          durationMs,
          extra
        );
      } catch {}

      // 4) Rövid tartás, majd:
      //    - OK: exit + onResult(true)
      //    - FAIL, de kifogyott a próba: exit + onResult(false)
      //    - FAIL és SET+KEEP: NINCS exit; vissza idle-be, zárjuk a helyeseket
      //    - FAIL és más ág (ordered vagy set+reset): marad az eddigi viselkedés (exit)
      window.setTimeout(async () => {
        const willExhaust = !ok && attempts + 1 >= maxAttempts;
        const isSetKeep = mode === "set" && feedback === "keep";

        if (ok || willExhaust || !isSetKeep) {
          // ===== EXIT ÁG (helyes; vagy kifogyott; vagy nem keep) =====
          const el = rootRef.current;
          if (el) {
            el.style.setProperty("--pr-dur-exit", `${EXIT_FADE_MS}ms`);
            setPhase("exiting");
            void el.offsetWidth; // reflow
            await waitForExitAnimation(el, EXIT_FADE_MS);
          } else {
            await new Promise((r) => setTimeout(r, EXIT_FADE_MS));
          }

          if (ok) {
            onResult(true, pickedSnapshot);
            return;
          }

          // Hibás, de nem fogyott ki: reseteljük a környezetet és engedjük a következő próbát.
          setAttempts((prev) => {
            const next = prev + 1;

            if (mode === "set") {
              if (feedback === "keep") {
                // (elvileg ide most nem futunk be, mert isSetKeep == false eset)
                const newlyCorrect = pickedSnapshot.filter((x) =>
                  answerSet.has(x)
                );
                if (newlyCorrect.length) {
                  setLockedCorrect(
                    (prevSet) => new Set([...prevSet, ...newlyCorrect])
                  );
                }
                setPicked([]);
              } else {
                hardReset();
              }
            } else {
              setPicked([]);
              firstPickDoneRef.current = false;
              setPhase("idle");
            }

            if (next >= maxAttempts) {
              onResult(false, pickedSnapshot);
            }
            return next;
          });
        } else {
          // ===== SET + KEEP HIBÁS ÁG: NINCS EXIT =====
          setAttempts((prev) => {
            const next = prev + 1;

            // ami helyes volt a választásban, azt rögzítjük
            const newlyCorrect = pickedSnapshot.filter((x) =>
              answerSet.has(x)
            );
            if (newlyCorrect.length) {
              setLockedCorrect(
                (prevSet) => new Set([...prevSet, ...newlyCorrect])
              );
            }

            // ürítjük a még nem rögzített választásokat
            setPicked([]);

            // vissza interaktív állapotba – az opciók NEM tűnnek el
            setPhase("idle");

            if (next >= maxAttempts) {
              // Ha itt fogyna ki (ritka edge), adjuk vissza a bukást.
              onResult(false, pickedSnapshot);
            }
            return next;
          });
        }
      }, FEEDBACK_HOLD_MS);
    }, COMMIT_DELAY_MS);
  }, [
    canSubmit,
    phase,
    mode,
    feedback,
    picked,
    effectiveAnswer,
    answerSet,
    maxPick,
    attempts,
    storyId,
    sessionId,
    pageId,
    puzzleId,
    options.length,
    maxAttempts,
    onResult,
    softResetWrongFlashSoon,
    lockedCorrect,
    hardReset,
    playClick,
    playSuccess,
    playError,
    hasAnswer,
  ]);

  // ===== Render =====
  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, className)}
      // ugyanaz az adat-attribútumos fázisjelzés, mint a Riddle-ben
      data-puzzle-phase={phase}
      style={{ ["--pr-dur-exit" as any]: `${EXIT_FADE_MS}ms` }}
      role="group"
      aria-label="Runák kirakó"
    >
      {/* Elérhető runák */}
      <div role="list" aria-label="Elérhető runák" className={styles.pool}>
        {options.map((id) => {
          const isLocked = lockedCorrect.has(id);
          const isPicked = picked.includes(id);
          const isWrong = wrongFlash.has(id);
          const disabled =
            isLocked ||
            isPicked ||
            picked.length + lockedCorrect.size >= maxPick ||
            phase !== "idle";

          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              disabled={disabled}
              className={clsx(styles.choice, buttonClassName)}
              aria-pressed={isPicked || isLocked}
              data-state={
                isLocked
                  ? "locked"
                  : isWrong
                  ? "wrong"
                  : isPicked
                  ? "picked"
                  : "idle"
              }
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* Kiválasztott / rögzített elemek */}
      <div
        role="list"
        aria-label="Kiválasztott halmaz/sorrend"
        className={styles.pickedRow}
      >
        {[...lockedCorrect].map((id) => (
          <button
            key={`locked-${id}`}
            type="button"
            disabled
            className={clsx(styles.choice, buttonClassName)}
            data-state="locked"
            aria-label={`${id} rögzített (helyes)`}
          >
            {id} ✓
          </button>
        ))}

        {picked.map((id) => (
          <button
            key={`picked-${id}`}
            type="button"
            onClick={() => undo(id)}
            disabled={phase !== "idle"}
            className={clsx(styles.choice, buttonClassName)}
            data-state="picked"
          >
            {id} ✕
          </button>
        ))}
      </div>

      {/* Vezérlők */}
      <div className={styles.controls}>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || phase !== "idle"}
          className={clsx(styles.action, buttonClassName)}
          data-action="submit"
        >
          Ellenőrzés
        </button>

        <button
          type="button"
          onClick={hardReset}
          disabled={phase === "locked" || phase === "exiting"}
          className={clsx(styles.action, buttonClassName)}
          data-action="reset"
        >
          Reset
        </button>

        <span
          className={styles.attempts}
          aria-label={`Hátralévő életek: ${maxAttempts - attempts}/${maxAttempts}`}
        >
          <img
            src="/icons/heart.png"
            alt=""
            aria-hidden="true"
            width="26px"
            className={styles.heartIcon}
          />
          {maxAttempts - attempts}/{maxAttempts}
        </span>
      </div>
    </div>
  );
}

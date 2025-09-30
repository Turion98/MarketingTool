"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./TypingText.module.scss";
import { useGameState } from "../../lib/GameStateContext";

/**
 * Stabil alapértelmezett szünetek – modul szinten, fagyasztva (nem változik a referencia).
 */
const DEFAULT_PUNCTUATION_PAUSES = Object.freeze({
  ".": 1250,
  ",": 150,
  "!": 1220,
  "?": 220,
  "…": 280,
  "\n": 120,
});

const PARA = "\u2029"; // bekezdés-törés jel

type Props = {
  lines: string[];
  /** ms/char – ha cps meg van adva, azt felülírja */
  speed?: number;
  /** chars per second – ha megadod, a speed-et figyelmen kívül hagyjuk */
  cps?: number;
  /** külső skip kérés – azonnal kiírja a teljes szöveget */
  skipRequested?: boolean;
  /** replay trigger – szám növelésével újraindítható a gépelés */
  replayTrigger?: number;
  /** gépelés indulási késleltetés ms */
  delayMs?: number;
  /** írásjelekhez extra megállások */
  punctuationPauses?: Partial<Record<string, number>>;
  /** gépelés indulására jelzés (delay után, első karakter előtt) */
  onReady?: () => void;
  /** készre futás callback */
  onComplete?: () => void;
  /** ÚJ: blokkok közötti extra szünet (ms) */
  blockPauseMs?: number;
};

const TypingText: React.FC<Props> = ({
  lines,
  speed = 40,
  cps,
  skipRequested = false,
  replayTrigger = 0,
  delayMs = 1000,
  punctuationPauses,
  onReady,
  onComplete,
  blockPauseMs = 300,
}) => {
  const [displayedText, setDisplayedText] = useState<string>("");
  const [isReady, setIsReady] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Hooks-t mindig feltétel nélkül hívd:
  const gs = useGameState();
  const registerTimeout = gs?.registerTimeout;

  // sebesség (ms/char) – ha cps van, akkor 1000 / cps
  const baseInterval = useMemo(() => {
    if (cps && cps > 0) return Math.max(1, Math.round(1000 / cps));
    return Math.max(1, Math.round(speed));
  }, [cps, speed]);

  // szünetek referencia
  const pausesRef = useRef(DEFAULT_PUNCTUATION_PAUSES);
  useEffect(() => {
    const nextBase = punctuationPauses
      ? { ...DEFAULT_PUNCTUATION_PAUSES, ...punctuationPauses }
      : DEFAULT_PUNCTUATION_PAUSES;
    const next = { ...nextBase, [PARA]: Math.max(0, blockPauseMs) };
    const same = JSON.stringify(next) === JSON.stringify(pausesRef.current);
    if (!same) pausesRef.current = next;
  }, [punctuationPauses, blockPauseMs]);

  // callback ref-ek
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // összevont teljes szöveg (blokkok közé PARA kerül)
  const joined = useMemo(() => {
    if (!lines?.length) return "";
    return lines.filter(Boolean).join(PARA);
  }, [JSON.stringify(lines)]);

  // Strict Mode / versenyhelyzet guard
  const runIdRef = useRef(0);
  const doneRef = useRef(false);
  const fullTextRef = useRef(joined);

  // időzítők
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number | null>(null);

  const clearAllTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopAll = () => {
    clearAllTimers();
  };

  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    if (typeof registerTimeout === "function") {
      try {
        registerTimeout(id as unknown as number);
      } catch {
        // no-op
      }
    }
    return id;
  };

  const finishNow = () => {
    if (doneRef.current) return;
    stopAll();
    const finalText = fullTextRef.current.replaceAll(PARA, "\n\n");
    setDisplayedText(finalText);
    doneRef.current = true;
    setIsComplete(true);
    onCompleteRef.current?.();
  };

  // gépelés fő effect
  useEffect(() => {
    const runId = ++runIdRef.current;
    doneRef.current = false;
    fullTextRef.current = joined;
    setDisplayedText("");
    setIsReady(false);
    setIsComplete(false);

    // indulási delay
    scheduleTimeout(() => {
      if (runId !== runIdRef.current) return;

      setIsReady(true);
      onReadyRef.current?.();

      let i = 0;
      const text = fullTextRef.current;
      const len = text.length;

      const typeNext = () => {
        if (runId !== runIdRef.current) return;
        if (doneRef.current) return;

        if (i >= len) {
          doneRef.current = true;
          setIsComplete(true);
          onCompleteRef.current?.();
          return;
        }

        const ch = text[i];
        // render szöveg: PARA -> \n\n
        setDisplayedText((prev) => (prev + ch).replaceAll(PARA, "\n\n"));
        i += 1;

        const extra = pausesRef.current[ch as keyof typeof pausesRef.current] ?? 0;
        const nextDelay = (baseInterval || 1) + (extra || 0);

        scheduleTimeout(typeNext, nextDelay);
      };

      typeNext();
    }, Math.max(0, delayMs));

    return () => {
      stopAll();
    };
  }, [joined, replayTrigger, delayMs, baseInterval]);

  // skip
  useEffect(() => {
    if (skipRequested) {
      finishNow();
    }
  }, [skipRequested]);

  return (
    <div
      className={styles.container}
      data-ready={isReady ? "1" : "0"}
      data-complete={isComplete ? "1" : "0"}
      data-status={isComplete ? "complete" : isReady ? "ready" : "idle"}
    >
      <div
        className={styles.text}
        style={{ whiteSpace: "pre-wrap" }}
        aria-live="polite"
      >
        {displayedText}
        {!isComplete && (
          <span className={styles.cursor} aria-hidden="true">
            ▌
          </span>
        )}
      </div>
    </div>
  );
};

export default TypingText;

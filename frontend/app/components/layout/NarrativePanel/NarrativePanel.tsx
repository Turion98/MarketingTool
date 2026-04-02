"use client";
import React, { useEffect, useRef } from "react";
import NineSlicePanel from "../../NineSlicePanel/NineSlicePanel";
import TypingText from "../../TypingText/TypingText";
import s from "./NarrativePanel.module.scss";

export type Measure = {
  panel: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
};

function rectNearlyEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  eps = 1
): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.width - b.width) <= eps &&
    Math.abs(a.height - b.height) <= eps
  );
}

function measuresNearlyEqual(a: Measure | null, b: Measure): boolean {
  if (!a) return false;
  return (
    rectNearlyEqual(a.panel, b.panel) && rectNearlyEqual(a.content, b.content)
  );
}

export type NarrativePanelProps = {
  pageId: string;
  lines: string[];
  skipRequested: boolean;
  replayTrigger: number;
  delayMs: number;
  onReady: () => void;
  onComplete: () => void;
  onMeasure: (m: Measure) => void;
  typingDone: boolean;
  lockedMeasure: Measure | null;
  setLockedMeasure: (m: Measure) => void;
  firstLockTimerRef: React.MutableRefObject<number | null>;
  backdrop?: React.ReactNode;
  title?: string;

  /** oldalváltás kifade flag StoryPage-ből */
  exiting?: boolean;

  /** StoryPage-nek jelezzünk vissza ha a kifade tényleg LEFUTOTT */
  onExitDone?: () => void;

  /** ms-ben: mennyi idő a kifade transition (syncben --np-exit-dur-rel) */
  exitMs?: number;

  /** Ghost embed: minimális króm */
  embedGhost?: boolean;
};

/**
 * NarrativePanel wraps NineSlicePanel + TypingText.
 * NineSlice is a skin-variant here; can be swapped later via theme.
 */
const NarrativePanel: React.FC<NarrativePanelProps> = (props) => {
  const {
    pageId,
    lines,
    skipRequested,
    replayTrigger,
    delayMs,
    onReady,
    onComplete,
    onMeasure,
    typingDone,
    lockedMeasure,
    setLockedMeasure,
    firstLockTimerRef,
    backdrop,
    title,
    exiting = false,
    onExitDone,
    exitMs = 220,
    embedGhost = false,
  } = props;

  // Ez az a node, amin a kilépő transition fut (.textboxContainer a scss-ben)
  const boxRef = useRef<HTMLDivElement | null>(null);

  // amikor exiting -> várjuk meg míg lefut az opacity/transform transition,
  // utána egyszer jelezzünk vissza onExitDone()
  useEffect(() => {
    if (!exiting) return;
    const el = boxRef.current;

    // ha nincs ref valamiért, ne akadjunk fenn
    if (!el) {
      onExitDone?.();
      return;
    }

    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onTransEnd, true);
      el.removeEventListener("animationend", onAnimEnd, true);
      onExitDone?.();
    };

    const onTransEnd = () => finish();
    const onAnimEnd = () => finish();

    el.addEventListener("transitionend", onTransEnd, true);
    el.addEventListener("animationend", onAnimEnd, true);

    // fallback (pl. Safari edge case)
    const fallback = window.setTimeout(finish, exitMs + 80);

    return () => {
      window.clearTimeout(fallback);
      el.removeEventListener("transitionend", onTransEnd, true);
      el.removeEventListener("animationend", onAnimEnd, true);
    };
  }, [exiting, exitMs, onExitDone]);

  return (
    <div
      className={s.textDockTop}
      role="region"
      aria-label="Narration box"
      data-exiting={exiting ? "1" : "0"}
      data-embed-ghost={embedGhost ? "1" : undefined}
    >
      <div className={s.textboxContainer} ref={boxRef}>
        <NineSlicePanel
          padding={{ top: 16, right: 16, bottom: 16, left: 16 }}
          trackScroll
          onMeasure={(m: Measure) => {
            onMeasure(m);

            // első stabil mérés lockolása ~350ms után
            if (!lockedMeasure && firstLockTimerRef.current == null) {
              firstLockTimerRef.current = window.setTimeout(() => {
                setLockedMeasure(m);
                firstLockTimerRef.current = null;
              }, 350) as unknown as number;
              return;
            }

            // Typing után: csak ha a méret tényleg változott (különben setState → layout → végtelen ciklus)
            if (lockedMeasure && typingDone && !measuresNearlyEqual(lockedMeasure, m)) {
              setLockedMeasure(m);
            }
          }}
          backdrop={backdrop}
        >
          {lines.length > 0 ? (
            <div className={s.textClamp}>
              {title ? (
                <span
                  className={s.titleOverlay}
                  data-page-title-overlay
                  aria-hidden="true"
                >
                  {title}
                </span>
              ) : null}

              <TypingText
                key={`tt_${pageId}`}
                lines={lines}
                skipRequested={skipRequested}
                replayTrigger={replayTrigger}
                delayMs={delayMs}
                onReady={onReady}
                onComplete={onComplete}
              />
            </div>
          ) : (
            <div />
          )}
        </NineSlicePanel>
      </div>
    </div>
  );
};

export default NarrativePanel;

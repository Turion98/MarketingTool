"use client";
import React from "react";
import NineSlicePanel from "../../NineSlicePanel/NineSlicePanel";
import TypingText from "../../TypingText/TypingText";
import s from "./NarrativePanel.module.scss";

export type Measure = {
  panel: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
};

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
  } = props;

  return (
    <div className={s.textDockTop} role="region" aria-label="Narration box">
      <div className={s.textboxContainer}>
        <NineSlicePanel
          src="/ui/textbox_9slice.png"
          slice={{ top: 48, right: 43, bottom: 48, left: 43 }}
          padding={{ top: 75, right: 55, bottom: 70, left: 65 }}
          inner={{ width: 640, height: 381 }}
          trackScroll
          animate
          onMeasure={(m: Measure) => {
            onMeasure(m);
            if (!lockedMeasure && firstLockTimerRef.current == null) {
              firstLockTimerRef.current = window.setTimeout(() => {
                setLockedMeasure(m);
                firstLockTimerRef.current = null;
              }, 350) as unknown as number;
              return;
            }
            if (lockedMeasure && typingDone) setLockedMeasure(m);
          }}
          backdrop={backdrop}
        >
          {lines.length > 0 ? (
            <TypingText
              key={`tt_${pageId}`}
              lines={lines}
              skipRequested={skipRequested}
              replayTrigger={replayTrigger}
              delayMs={delayMs}
              onReady={onReady}
              onComplete={onComplete}
            />
          ) : (
            <div />
          )}
        </NineSlicePanel>
      </div>
    </div>
  );
};

export default NarrativePanel;

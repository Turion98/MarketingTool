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
  title?: string;  
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
          padding={{ top: 16, right: 16, bottom: 16, left: 16 }}
          trackScroll
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
          <div className={s.textClamp}>
            {/* ⬇️ Láthatatlan cím overlay a TypingText felett */}
      {props.title ? (
        <span
          className={s.titleOverlay}
          data-page-title-overlay
          aria-hidden="true"
        >
          {props.title}
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

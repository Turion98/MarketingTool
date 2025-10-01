// /components/SkipButton/SkipButton.tsx
import React, { useEffect, useState, useCallback } from "react";
import styles from "./SkipButton.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { trackUiClick } from "../../lib/analytics";

interface SkipButtonProps {
  active: boolean;
  onSkip: () => void;
}

export default function SkipButton({ active, onSkip }: SkipButtonProps) {
  const [animate, setAnimate] = useState(false);

  // analitika kontextus
  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  useEffect(() => {
    if (active) {
      const timeout = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(timeout);
    } else {
      setAnimate(false);
    }
  }, [active]);

  const handleClick = useCallback(() => {
    // eredeti működés
    onSkip();

    // analitika – UI kattintás
    try {
      if (storyId && sessionId && currentPageId) {
        trackUiClick(
          String(storyId),
          String(sessionId),
          String(currentPageId),
          "skip_click",
          { source: "SkipButton", active: true }
        );
      }
    } catch {
      /* no-op */
    }
  }, [onSkip, storyId, sessionId, currentPageId]);

  return (
    <button
      className={`${styles.skipButton} ${animate ? styles.visible : ""}`}
      disabled={!active}
      onClick={handleClick}
      aria-label="Skip"
      title="Skip"
    >
      <img
        src="/ui/skip.png"
        alt=""
        className={styles.icon}
        draggable={false}
      />
    </button>
  );
}

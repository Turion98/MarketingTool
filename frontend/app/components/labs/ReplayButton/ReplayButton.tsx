// /components/ReplayButton/ReplayButton.tsx
"use client";
import React, { useCallback } from "react";
import styles from "./ReplayButton.module.scss";
import { useGameState } from "../../../lib/GameStateContext";
import { trackUiClick } from "../../../lib/analytics";

type Props = {
  active?: boolean;
  onReplay?: () => void;
  title?: string;
};

export default function ReplayButton({
  active = true,
  onReplay,
  title = "Replay / Újra",
}: Props) {
  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  const handleClick = useCallback(() => {
    if (!active) return;

    // Eredeti működés
    onReplay?.();

    // Analitika
    try {
      if (storyId && sessionId && (currentPageId || typeof window !== "undefined")) {
        const pageId = String(currentPageId ?? "unknown");
        trackUiClick(String(storyId), String(sessionId), pageId, "replay_click", {
          source: "ReplayButton",
          active: true,
        });
      }
    } catch {
      /* no-op */
    }
  }, [active, onReplay, storyId, sessionId, currentPageId]);

  return (
    <button
      type="button"
      className={styles.replayBtn + " " + (active ? styles.active : styles.disabled)}
      onClick={handleClick}
      title={title}
      aria-label={title}
      aria-disabled={!active}
    >
      {/* Ha nincs ikon, a ↺ unicode jel elég lesz */}
      <img
        src="/icons/rune_replay_128_transparent.png"
        alt=""
        width={48}
        height={48}
        className={styles.icon}
        draggable={false}
        onError={(e) => {
          // Fallback: ha nincs ikon fájl, jelenjen meg a ↺ jel
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const parent = e.currentTarget.parentElement as HTMLElement;
          if (parent && !parent.querySelector("span")) {
            const span = document.createElement("span");
            span.textContent = "↺";
            span.className = styles.fallbackGlyph;
            parent.appendChild(span);
          }
        }}
      />
    </button>
  );
}

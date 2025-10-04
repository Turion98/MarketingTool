// /components/RestartButton/RestartButton.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import style from "./RestartButton.module.scss";
import { createSessionSeeds } from "../../lib/sessionSeeds";
import { clearAllCache } from "../../lib/clearAllCache";
import { useGameState } from "../../lib/GameStateContext";
import { trackUiClick } from "../../lib/analytics";

type RestartButtonProps = {
  seedCount?: number;
  startPageId?: string;
  /** ActionBar-ból érkező extra osztály (pl. s.btn) */
  className?: string;
  /** Felirat testreszabása (alap: "Restart") */
  label?: string;
};

const RestartButton: React.FC<RestartButtonProps> = ({
  seedCount = 20,
  startPageId = "landing",
  className,
  label = "Restart",
}) => {
  const router = useRouter();
  const { resetGame, setCurrentPageId, storyId, sessionId, currentPageId } =
    (useGameState() as any) ?? {};

  const hardResetAudio = () => {
    try {
      document.dispatchEvent(new Event("qzera:audio-reset"));
      const anyWin = window as any;

      if (anyWin.__bgm__) {
        try {
          anyWin.__bgm__.pause?.();
          if (typeof anyWin.__bgm__.currentTime === "number") {
            anyWin.__bgm__.currentTime = 0;
          }
          anyWin.__bgm__.src && anyWin.__bgm__.load?.();
        } finally {
          anyWin.__bgm__ = null;
        }
      }

      if (anyWin.__narration__) {
        try {
          anyWin.__narration__.pause?.();
          if (typeof anyWin.__narration__.currentTime === "number") {
            anyWin.__narration__.currentTime = 0;
          }
          anyWin.__narration__.src && anyWin.__narration__.load?.();
        } finally {
          anyWin.__narration__ = null;
        }
      }

      if (anyWin.__audioCtx__?.state) {
        try {
          anyWin.__audioCtx__.close?.();
        } finally {
          anyWin.__audioCtx__ = null;
        }
      }

      localStorage.removeItem("bgmPosition");
      localStorage.removeItem("bgmPaused");
      localStorage.removeItem("narrationPosition");
    } catch (e) {
      console.warn("hardResetAudio warn:", e);
    }
  };

  const handleRestart = () => {
    if (typeof window === "undefined") return;

    try {
      if (storyId && sessionId) {
        const page = String(currentPageId ?? "unknown");
        trackUiClick(String(storyId), String(sessionId), page, "restart_click", {
          seedCount,
          startPageId,
        });
      }
    } catch {}

    try {
      hardResetAudio();
      resetGame?.();
      clearAllCache();
      createSessionSeeds(seedCount);

      localStorage.setItem("currentPageId", startPageId);
      setCurrentPageId?.(startPageId);
    } catch (err) {
      console.error("Restart error:", err);
    }

    router.push(`/?page=${encodeURIComponent(startPageId)}`);
  };

  return (
    <button
      className={`${style.restartButton} ${className ?? ""}`.trim()}
      onClick={handleRestart}
      title="Restart"
      aria-label="Restart"
      type="button"
    >
      {label}
    </button>
  );
};

export default RestartButton;

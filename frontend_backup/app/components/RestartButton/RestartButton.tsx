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
  startPageId?: string; // alapértelmezett start oldal
};

const RestartButton: React.FC<RestartButtonProps> = ({
  seedCount = 20,
  startPageId = "landing",
}) => {
  const router = useRouter();
  const { resetGame, setCurrentPageId, storyId, sessionId, currentPageId } =
    (useGameState() as any) ?? {};

  const hardResetAudio = () => {
    try {
      // 1) Broadcast az audio rétegeknek (ha hallgatják)
      document.dispatchEvent(new Event("qzera:audio-reset"));

      // 2) BGM HTMLAudioElement lenullázása (ha globálisan tárolod)
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

      // 3) Narráció / egyéb HTMLAudioElement(ek)
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

      // 4) Web Audio API context bezárása (ha használtok)
      if (anyWin.__audioCtx__?.state) {
        try {
          anyWin.__audioCtx__.close?.();
        } finally {
          anyWin.__audioCtx__ = null;
        }
      }

      // 5) Esetleges perzisztált pozíció/flag törlések
      localStorage.removeItem("bgmPosition");
      localStorage.removeItem("bgmPaused");
      localStorage.removeItem("narrationPosition");
    } catch (e) {
      console.warn("hardResetAudio warn:", e);
    }
  };

  const handleRestart = () => {
    if (typeof window === "undefined") return;

    // 🔎 Analitika: UI kattintás a restart gombon
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
      // 0) Audiók brutál reset – ez a kulcs, hogy ne folytassa
      hardResetAudio();

      // 1) Futó műveletek, hangok, timeoutok leállítása (játék state)
      resetGame?.();

      // 2) Cache törlése (image/audio/cache kulcsok)
      clearAllCache();

      // 3) Új session seed lista
      createSessionSeeds(seedCount);

      // 4) Oldal állapot beállítása (NINCS firstRun)
      localStorage.setItem("currentPageId", startPageId);
      setCurrentPageId?.(startPageId);
    } catch (err) {
      console.error("Restart error:", err);
    }

    // 5) Kezdőoldalra navigálás
    router.push(`/?page=${encodeURIComponent(startPageId)}`);
  };

  return (
    <button
      className={style.restartButton}
      onClick={handleRestart}
      title="Restart"
      aria-label="Restart"
    >
      Restart
    </button>
  );
};

export default RestartButton;

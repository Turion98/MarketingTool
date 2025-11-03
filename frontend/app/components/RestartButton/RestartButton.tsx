// /components/RestartButton/RestartButton.tsx
"use client";

import React, { useEffect, useState } from "react";
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

  const [isAdmin, setIsAdmin] = useState(false);

  // 🔹 Admin detektálás (a Landing admin-login által használt kulcsok alapján)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const isFlag = localStorage.getItem("adminMode") === "true";
      const hasKey = !!sessionStorage.getItem("adminKey");
      setIsAdmin(isFlag && hasKey);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const hardResetAudio = () => {
    try {
      document.dispatchEvent(new Event("qzera:audio-reset"));
      const anyWin = window as any;

      if (anyWin.__bgm__) {
        anyWin.__bgm__.pause?.();
        if (typeof anyWin.__bgm__.currentTime === "number")
          anyWin.__bgm__.currentTime = 0;
        anyWin.__bgm__.src && anyWin.__bgm__.load?.();
        anyWin.__bgm__ = null;
      }

      if (anyWin.__narration__) {
        anyWin.__narration__.pause?.();
        if (typeof anyWin.__narration__.currentTime === "number")
          anyWin.__narration__.currentTime = 0;
        anyWin.__narration__.src && anyWin.__narration__.load?.();
        anyWin.__narration__ = null;
      }

      if (anyWin.__audioCtx__?.state) {
        anyWin.__audioCtx__.close?.();
        anyWin.__audioCtx__ = null;
      }

      localStorage.removeItem("bgmPosition");
      localStorage.removeItem("bgmPaused");
      localStorage.removeItem("narrationPosition");
    } catch (e) {
      console.warn("hardResetAudio warn:", e);
    }
  };

  // --- backend admin restart hívás
  const callAdminRestart = async () => {
    if (!isAdmin) return;

    const ADMIN_KEY =
      process.env.NEXT_PUBLIC_DEV_CLEAR_SECRET || "KAB1T05Z3r!25";

    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE ||
      window.localStorage.getItem("apiBase") ||
      "http://127.0.0.1:8000";

    try {
      const res = await fetch(`${apiBase.replace(/\/+$/, "")}/admin/restart`, {
        method: "POST",
        headers: {
          "x-admin-key": ADMIN_KEY,
          "Content-Type": "application/json",
        },
      });
      const json = await res.json().catch(() => null);
      console.log("[RestartButton] admin /admin/restart →", json);
    } catch (err) {
      console.warn("[RestartButton] admin restart failed:", err);
    }
  };

  const handleRestart = async () => {
    if (typeof window === "undefined") return;

    // analitika
    try {
      if (storyId && sessionId) {
        const page = String(currentPageId ?? "unknown");
        trackUiClick(String(storyId), String(sessionId), page, "restart_click", {
          seedCount,
          startPageId,
          admin: isAdmin ? "1" : "0",
        });
      }
    } catch {}

    // ha admin → először backend
    if (isAdmin) {
      await callAdminRestart();
    }

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

    const baseTarget = `/play/${encodeURIComponent(startPageId)}`;
    if (isAdmin) router.push(`${baseTarget}?admin=1`);
    else router.push(baseTarget);
  };

  // 🔸 Ha nem admin → semmit nem renderel
  if (!isAdmin) return null;

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

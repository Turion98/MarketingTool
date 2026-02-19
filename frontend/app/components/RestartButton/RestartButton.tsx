// /components/RestartButton/RestartButton.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import style from "./RestartButton.module.scss";
import { createSessionSeeds } from "../../lib/sessionSeeds";
import { clearAllCache } from "../../lib/clearAllCache";
import { useGameState } from "../../lib/GameStateContext";
import { trackUiClick, startNewRunSession } from "../../lib/analytics";

type RestartButtonProps = {
  seedCount?: number;
  startPageId?: string;
  /** ActionBar-ból érkező extra osztály (pl. s.btn) */
  className?: string;
  /** Felirat testreszabása (alap: "Restart") */
  label?: string;
};

// Új session indítása restartnál (a StoryPage a localStorage "sessionId_v2" kulcsot olvassa)
const generateNewSessionId = () =>
  `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;


const RestartButton: React.FC<RestartButtonProps> = ({
  seedCount = 20,
  startPageId = "landing",
  className,
  label = "Restart",
}) => {
  const router = useRouter();
  const { resetGame, setCurrentPageId, storyId, sessionId, currentPageId } =
    (useGameState() as any) ?? {};

  // --- kliens oldali admin-detektálás (ugyanazt a logikát használjuk, amit a UI-ban is fogsz)
  const isAdminClient = (): boolean => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("admin") === "1") return true;
    const ls = window.localStorage.getItem("questell_admin");
    return ls === "1";
  };

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

  // --- backend admin restart hívás
  const callAdminRestart = async () => {
    if (typeof window === "undefined") return;
    const admin = isAdminClient();
    if (!admin) return;

    // ugyanaz a secret, mint amit a clearAllCache-ben is használsz
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

    const admin = isAdminClient();

    // analitika
    try {
      if (storyId && sessionId) {
        const page = String(currentPageId ?? "unknown");
        trackUiClick(String(storyId), String(sessionId), page, "restart_click", {
          seedCount,
          startPageId,
          admin: admin ? "1" : "0",
        });
      }
    } catch {}

    // ha admin → először backend
    if (admin) {
      await callAdminRestart();
    }

    // ✅ Restart = új session
// - a StoryPage a "sessionId_v2"-t használja
// - a régi (per-story) kulcsot is frissítjük, ha valahol még azt olvassa a kliens
try {
  localStorage.removeItem("sessionId_v2");
localStorage.removeItem(`qz_session_${storyId}`);

} catch {}

    // helyi reset
    try {
      hardResetAudio();
      resetGame?.();
      clearAllCache();
      createSessionSeeds(seedCount);

      // frontend állapotok
      localStorage.setItem("currentPageId", startPageId);
      setCurrentPageId?.(startPageId);
    } catch (err) {
      console.error("Restart error:", err);
    }

    // ✅ Restart = új run session
try {
  if (storyId) startNewRunSession(String(storyId));
  else startNewRunSession();
} catch {}

          // redirect – ha admin volt, vigyük tovább az admin=1-et
      const baseTarget = `/play/${encodeURIComponent(startPageId)}`;
      // biztosítsuk, hogy ugyanarra a route-ra navigálva is újra mountoljon
      const rs = Date.now();

      if (admin) {
        router.push(`${baseTarget}?admin=1&rs=${rs}`);
      } else {
        router.push(`${baseTarget}?rs=${rs}`);
      }

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

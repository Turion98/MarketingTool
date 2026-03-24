// app/components/RestartGameButton/RestartGameButton.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useGameState } from "@/app/lib/GameStateContext";
import { clearAllCache } from "@/app/lib/clearAllCache";
import { createSessionSeeds } from "@/app/lib/sessionSeeds";
import type { GameStateGlobals, PageData } from "@/app/lib/gameStateTypes";
type Props = {
  className?: string;
};

// Univerzális startPageId feloldás MINDEN kampányra
type RestartGameGlobals = GameStateGlobals & {
  meta?: { startPageId?: string };
  story?: { startPageId?: string };
};

function resolveStartPageId(
  pageData?: PageData | null,
  globals?: RestartGameGlobals
): string {
  const candidates = [
    globals?.meta?.startPageId,     // story meta-ból (preferált)
    globals?.startPageId,           // esetleges globál kulcs
    globals?.story?.startPageId,    // ha story objektumban van
    pageData?.startPageId,          // current page-hez csomagolva
  ];

  for (const raw of candidates) {
    if (typeof raw === "string") {
      const v = raw.trim();
      if (v && v !== "landing" && v !== "feedback" && v !== "__END__") {
        return v;
      }
    }
  }

  // Ha semmi nincs, akkor is legyen stabil default
  return "ch1_pg1";
}

const RestartGameButton: React.FC<Props> = ({ className }) => {
  const router = useRouter();
  const {
    currentPageData,
    globals,
    setCurrentPageId,
    resetGame,
    setStorySrc,
    storyId,
  } = useGameState();

  const handleRestart = () => {
    if (typeof window === "undefined") return;

    const startPageId = resolveStartPageId(currentPageData, globals);

    // 🔹 Jelenlegi query (src, skin, runemode, runes, stb.) megtartása
    const search = window.location.search || "";
    const params = new URLSearchParams(search);
    const srcParam = params.get("src");

    // 🔹 Játékállapot reset (progress, fragmentek, flag-ek, stb.)
    resetGame?.();

    // 🔹 storySrc visszaírása, hogy a StoryPage ne essen szét
    if (srcParam && typeof setStorySrc === "function") {
      setStorySrc(srcParam);
    }

    // 🔹 Új kezdőoldal beállítása state-ben + LS-ben
    setCurrentPageId?.(startPageId);
    try {
      window.localStorage.setItem("currentPageId", startPageId);
    } catch {
      // leszarjuk, ha nincs storage
    }
    // 🔹 Cache ürítés – async, ne blokkolja a navigációt
    clearAllCache().catch((err) => {
      console.warn("[RestartGameButton] clearAllCache error", err);
    });

    // 🔹 Új random seed session (ha használod)
    try {
      createSessionSeeds(1);
    } catch (err) {
      console.warn("[RestartGameButton] createSessionSeeds error", err);
    }

    // 🔹 Maradjunk a /story runtime-on, eredeti query-vel (skin is megmarad)
    router.push(`/story${search}`);
  };

  return (
    <button type="button" className={className} onClick={handleRestart}>
      <span>Restart</span>
    </button>
  );
};

export default RestartGameButton;

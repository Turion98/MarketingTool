// app/components/RestartGameButton/RestartGameButton.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useGameState } from "@/app/lib/GameStateContext";
import { clearAllCache } from "@/app/lib/clearAllCache";
import { createSessionSeeds } from "@/app/lib/sessionSeeds";

type Props = {
  className?: string;
};

// Univerzális startPageId feloldás MINDEN kampányra
function resolveStartPageId(pageData: any, globals: any): string {
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
  const { currentPageData, globals, setCurrentPageId } = useGameState() as any;

  const handleRestart = async () => {
    if (typeof window === "undefined") return;

    const startPageId = resolveStartPageId(currentPageData, globals);

    // 🔹 Cache ürítés – de ne blokkolja a navigációt
    clearAllCache().catch((err) => {
      console.warn("[RestartGameButton] clearAllCache error", err);
    });

    // 🔹 Új random seed session (ha használod)
    try {
      createSessionSeeds(1);
    } catch (err) {
      console.warn("[RestartGameButton] createSessionSeeds error", err);
    }

    // 🔹 currentPageId persist + context frissítés
    try {
      window.localStorage.setItem("currentPageId", startPageId);
    } catch {
      // ha nincs storage, lenyeljük
    }

    setCurrentPageId?.(startPageId);

    // 🔹 route: mindig /play/{startPageId} – storySrc már globals-ben van
    router.push(`/play/${encodeURIComponent(startPageId)}`);
  };

  return (
    <button type="button" className={className} onClick={handleRestart}>
      <span>Restart</span>
    </button>
  );
};

export default RestartGameButton;

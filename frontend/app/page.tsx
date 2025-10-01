"use client";

import React, { useEffect, useState } from "react";
import LandingPage from "./components/LandingPage/LandingPage";
import StoryPage from "./components/StoryPage/StoryPage";
import { useGameState } from "./lib/GameStateContext";
import { useSearchParams } from "next/navigation";

export default function StoryRoot() {
  const params = useSearchParams();
  const pid = params.get("pid");
  const { setCurrentPageId, currentPageId } = useGameState();

  // 💡 Hydration-gate: SSR és az első CSR render mindig ugyanazt adja vissza
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Deep-link (pid) érvényesítése csak hydration után
  useEffect(() => {
    if (!hydrated) return;
    if (pid && setCurrentPageId) {
      setCurrentPageId(pid);
    }
  }, [hydrated, pid, setCurrentPageId]);

  // ⬇️ Amíg nem hydrated, mindig LandingPage megy → stabil SSR/CSR markup
  if (!hydrated) {
    return <LandingPage />;
  }

  // Hydration után: ha van pid vagy nem "landing" a state, akkor StoryPage
  const shouldShowStory =
    !!pid || (currentPageId && currentPageId !== "landing");

  return shouldShowStory ? <StoryPage /> : <LandingPage />;
}

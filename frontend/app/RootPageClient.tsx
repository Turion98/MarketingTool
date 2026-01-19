"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useGameState } from "./lib/GameStateContext";

// Dinamikus importok – SSR off
const LandingPage = dynamic(() => import("./components/LandingPage/LandingPage"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading…</div>,
});
const StoryPage = dynamic(() => import("./components/StoryPage/StoryPage"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading story…</div>,
});

// Egyszerű hibafogó – ne legyen fehér képernyő
type EBState = { hasError: boolean; err?: unknown };
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, err };
  }
  componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Root ErrorBoundary]", err);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Hopp, valami hibázott a nézet betöltése közben.</h2>
          <p style={{ opacity: 0.8, marginTop: 8 }}>
            Térj vissza a kezdőlapra, vagy próbáld újra később.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RootPage() {
  const params = useSearchParams();
  const pid = params.get("pid");
  const { setCurrentPageId, currentPageId } = useGameState();

  // Hydration-kapu
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Deep-link pid
  useEffect(() => {
    if (!hydrated || !pid || !setCurrentPageId) return;
    setCurrentPageId(pid);
  }, [hydrated, pid, setCurrentPageId]);

  // Stabil markup SSR alatt (dinamikus komponensek ssr:false, így itt úgyis üresen renderelnének)
  if (!hydrated) {
    return (
      <ErrorBoundary>
        <LandingPage />
      </ErrorBoundary>
    );
  }

  // Csak akkor mutassuk a Story-t, ha VAN valós forrás
  const hasQuerySrc = !!params.get("src");
  const hasGlobalSrc = !!(globalThis as any).__quest_globals__?.storySrc;
  const hasLsSrc =
    typeof window !== "undefined" &&
    (() => {
      try {
        return !!localStorage.getItem("storySrc");
      } catch {
        return false;
      }
    })();

  const hasValidStory = hasQuerySrc || hasGlobalSrc || hasLsSrc;

  // Story akkor, ha pid van, vagy van érvényes story és nem "landing" az oldal
  const shouldShowStory = !!pid || (hasValidStory && !!currentPageId && currentPageId !== "landing");

  return shouldShowStory ? (
    <ErrorBoundary>
      <StoryPage />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary>
      <LandingPage />
    </ErrorBoundary>
  );
}

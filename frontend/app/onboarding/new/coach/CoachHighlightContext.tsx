"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface CoachHighlightContextValue {
  activeTargets: Set<string>;
  highlightTargets: (ids: string[]) => void;
  clearHighlights: () => void;
}

const CoachHighlightContext = createContext<CoachHighlightContextValue | null>(
  null,
);

export function useCoachHighlight(): CoachHighlightContextValue {
  const ctx = useContext(CoachHighlightContext);
  if (!ctx) {
    throw new Error("useCoachHighlight must be used within CoachHighlightProvider");
  }
  return ctx;
}

export function coachTargetAttrs(
  targetId: string | undefined,
  activeTargets: Set<string>,
): Record<string, string> | undefined {
  if (!targetId) return undefined;
  const attrs: Record<string, string> = {
    "data-coach-target": targetId,
  };
  if (activeTargets.has(targetId)) {
    attrs["data-coach-highlight"] = "true";
  }
  return attrs;
}

export function CoachHighlightProvider({ children }: { children: ReactNode }) {
  const [activeTargets, setActiveTargets] = useState<Set<string>>(new Set());

  const highlightTargets = useCallback((ids: string[]) => {
    setActiveTargets(new Set(ids));
    requestAnimationFrame(() => {
      const first = document.querySelector(
        `[data-coach-target="${ids[0]}"]`,
      );
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const clearHighlights = useCallback(() => {
    setActiveTargets(new Set());
  }, []);

  useEffect(() => {
    if (activeTargets.size === 0) return;
    const t = setTimeout(() => setActiveTargets(new Set()), 6000);
    return () => clearTimeout(t);
  }, [activeTargets]);

  const value = useMemo(
    () => ({ activeTargets, highlightTargets, clearHighlights }),
    [activeTargets, highlightTargets, clearHighlights],
  );

  return (
    <CoachHighlightContext.Provider value={value}>
      {children}
      <style jsx global>{`
        [data-coach-highlight="true"] {
          outline: 2px solid rgba(200, 120, 50, 0.75);
          outline-offset: 3px;
          border-radius: 10px;
          animation: coachPulse 1.4s ease-in-out 2;
          box-shadow: 0 0 0 4px rgba(200, 120, 50, 0.15);
        }
        @keyframes coachPulse {
          0%,
          100% {
            box-shadow: 0 0 0 4px rgba(200, 120, 50, 0.12);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(200, 120, 50, 0.22);
          }
        }
      `}</style>
    </CoachHighlightContext.Provider>
  );
}

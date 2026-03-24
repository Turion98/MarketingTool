"use client";

import { flushSync } from "react-dom";

type StoryPageChoiceTransitionParams = {
  next: string;
  currentPageId?: string;
  scrollContainer: HTMLElement | null;
  lockHeightsForTransition: () => void;
  unlockHeightsAfterTransition: () => void;
  setIsFadingOut: (value: boolean) => void;
  setShowChoices: (value: boolean) => void;
  setChoicePageId: (value: string | null) => void;
  setPageUnlockedForInteraction: (value: string | null) => void;
  setSkipRequested: (value: boolean) => void;
  setDockJustAppeared: (value: boolean) => void;
  setHideNarration: (value: boolean) => void;
  goToNextPage: (id: string) => void;
};

export function runChoiceTransition({
  next,
  currentPageId,
  scrollContainer,
  lockHeightsForTransition,
  unlockHeightsAfterTransition,
  setIsFadingOut,
  setShowChoices,
  setChoicePageId,
  setPageUnlockedForInteraction,
  setSkipRequested,
  setDockJustAppeared,
  setHideNarration,
  goToNextPage,
}: StoryPageChoiceTransitionParams): void {
  if (!next || next === currentPageId) return;

  lockHeightsForTransition();
  setIsFadingOut(true);

  const fadeMs = 600;
  const scrollMs = fadeMs * 2;

  let fadeDone = false;
  let scrollDone = false;

  const tryProceed = () => {
    if (!(fadeDone && scrollDone)) return;
    if (!next || next === currentPageId) return;

    try {
      localStorage.setItem("currentPageId", next);
    } catch {}

    flushSync(() => {
      setShowChoices(false);
      setChoicePageId(null);
      setPageUnlockedForInteraction(null);
      setSkipRequested(false);
    });

    goToNextPage(next);

    requestAnimationFrame(() => {
      unlockHeightsAfterTransition();

      flushSync(() => {
        setIsFadingOut(false);
        setDockJustAppeared(false);
      });
    });
  };

  window.setTimeout(() => {
    fadeDone = true;

    flushSync(() => {
      setHideNarration(true);
    });

    tryProceed();
  }, fadeMs);

  if (scrollContainer) {
    requestAnimationFrame(() => {
      const startTop = scrollContainer.scrollTop;
      const startTime = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / scrollMs);
        const eased = 1 - (1 - t) * (1 - t);
        scrollContainer.scrollTop = startTop * (1 - eased);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          scrollDone = true;
          tryProceed();
        }
      };

      requestAnimationFrame(step);
    });
  } else {
    scrollDone = true;
    tryProceed();
  }
}

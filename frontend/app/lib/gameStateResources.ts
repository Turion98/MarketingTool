"use client";

import type { MutableRefObject } from "react";

import { LS_KEYS } from "./gameStateStorage";

export function clearAbortControllers(
  abortControllers: MutableRefObject<AbortController[]>
): void {
  abortControllers.current.forEach((controller) => {
    try {
      controller.abort();
    } catch {}
  });
  abortControllers.current = [];
}

export function clearRegisteredTimeouts(
  timeouts: MutableRefObject<number[]>
): void {
  timeouts.current.forEach((id) => {
    try {
      clearTimeout(id);
    } catch {}
  });
  timeouts.current = [];
}

export function clearRegisteredAudioElements(
  audioEls: MutableRefObject<HTMLAudioElement[]>
): void {
  audioEls.current.forEach((el) => {
    try {
      el.pause();
      el.currentTime = 0;
    } catch {}
  });
  audioEls.current = [];
}

export function resetPersistedGameState(): void {
  try {
    localStorage.removeItem(LS_KEYS.unlocked);
    localStorage.removeItem(LS_KEYS.fragments);
    localStorage.removeItem(LS_KEYS.globalBank);
    localStorage.removeItem(LS_KEYS.flags);
    localStorage.removeItem(LS_KEYS.globals);
    localStorage.removeItem(LS_KEYS.runeImgs);
    localStorage.setItem(LS_KEYS.page, "landing");
  } catch {}
}

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
  resetPersistedGameStateForKeys(LS_KEYS);
}

export function resetPersistedGameStateForKeys(
  keys: typeof LS_KEYS
): void {
  try {
    localStorage.removeItem(keys.unlocked);
    localStorage.removeItem(keys.fragments);
    localStorage.removeItem(keys.globalBank);
    localStorage.removeItem(keys.flags);
    localStorage.removeItem(keys.globals);
    localStorage.removeItem(keys.runeImgs);
    localStorage.setItem(keys.page, "landing");
  } catch {}
}

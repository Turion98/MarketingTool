// app/lib/useUiClickSound.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameState } from "./GameStateContext";

export function useUiClickSound(
  src: string = "/sounds/questell-click.wav"
) {
  const { isMuted } = useGameState();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const ensureAudio = () => {
    if (typeof window === "undefined") return null;

    if (!audioRef.current) {
      const audio = new Audio(src);
      audio.preload = "auto";   // 🔹 előtöltés
      audio.volume = 0.4;
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  // 🔹 amikor a hook “életre kel”, már kérjük a böngészőt, hogy töltse be
  useEffect(() => {
    const audio = ensureAudio();
    // optional “warm-up”
    if (!audio) return;
    // itt nem játszunk le semmit, csak hagyjuk, hogy betöltsön
  }, []);

  const play = useCallback(() => {
    if (isMuted) return;

    const audio = ensureAudio();
    if (!audio) return;

    try {
      audio.currentTime = 0;
      // a preload miatt itt már csak bufferből szól
      audio.play().catch(() => {
        // ha autoplay-blokk van, lenyeljük
      });
    } catch {
      // ignore
    }
  }, [isMuted]);

  return play;
}

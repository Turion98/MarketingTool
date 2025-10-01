// app/components/TransitionVideo/TransitionVideo.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./TransitionVideo.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { audioDucking } from "../../lib/audioDucking";

type Props = {
  pageId: string;
  src: string;
  srcWebm?: string;
  poster?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  skipAfterMs?: number;
  nextPageId: string;
  duckToVol?: number;
  attackMs?: number;
  releaseMs?: number;
  preloadNext?: boolean;
};

const TransitionVideo: React.FC<Props> = ({
  pageId,
  src,
  srcWebm,
  poster,
  autoplay = true,
  muted = true,
  loop = false,
  fadeInMs = 300,
  fadeOutMs = 300,
  skipAfterMs = 999999,
  nextPageId,
  duckToVol = 0.2,
  attackMs = 240,
  releaseMs = 600,
  preloadNext = true,
}) => {
  const game = useGameState() as any;
  const { goToNextPage, setCurrentPageId, isMuted, setUiLocked, preloadNextPages } = game || {};

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skipTimerRef = useRef<number | null>(null);
  const enableSkipTimerRef = useRef<number | null>(null);

  const [canSkip, setCanSkip] = useState(false);
  const [visible, setVisible] = useState(false);      // csak fade-IN-hez
  const [tapToPlay, setTapToPlay] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);  // csak a VIDEÓ halványul
  const [navigated, setNavigated] = useState(false);  // idempotens védelem

  const navigateTo = (pid: string) => {
    if (typeof goToNextPage === "function") return goToNextPage(pid);
    if (typeof setCurrentPageId === "function") return setCurrentPageId(pid);
  };

  const goNext = () => {
    if (navigated) return; // idempotens
    setNavigated(true);

    // Csak a videót halványítjuk, a stage fekete marad → nincs fehér villanás
    if (fadeOutMs > 0) {
      setFadingOut(true);
      window.setTimeout(() => navigateTo(nextPageId), Math.max(120, fadeOutMs));
    } else {
      navigateTo(nextPageId);
    }
  };

  // UI lock
  useEffect(() => {
    try { setUiLocked?.(true); } catch {}
    return () => { try { setUiLocked?.(false); } catch {} };
  }, [setUiLocked]);

  // Ducking
  useEffect(() => {
    const duckId = `transition:${pageId}`;
    audioDucking.startDuck(duckId, { duckTo: duckToVol, attackMs, releaseMs });
    return () => audioDucking.endDuck(duckId);
  }, [pageId, duckToVol, attackMs, releaseMs]);

  // Preload next page assets (ha van)
  useEffect(() => {
    try { preloadNext && preloadNextPages?.([nextPageId]); } catch {}
  }, [preloadNext, preloadNextPages, nextPageId]);

  // Autoplay első próbálkozás
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Legyen azonnal látható a színpad (fekete háttér), még play előtt
    setVisible(true);

    // Mute policy miatt még a play előtt beállítjuk
    v.muted = isMuted || muted;

    (async () => {
      try {
        if (autoplay) await v.play();
        setTapToPlay(false);
      } catch {
        // autoplay blokkolva → overlay
        setTapToPlay(true);
      }
    })();
  }, [autoplay, muted, isMuted]);

  // Ha betöltődött a videó, próbáljuk újra (Safari/Chrome policy-k miatt)
  const handleLoadedData = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (autoplay && v.paused) {
        await v.play();
        setTapToPlay(false);
      }
    } catch {
      setTapToPlay(true);
    }
  };

  // Skip engedély + auto-advance (ha nem loopol)
  useEffect(() => {
    // canSkip engedélyezése
    enableSkipTimerRef.current = window.setTimeout(
      () => setCanSkip(true),
      Math.max(0, skipAfterMs)
    );

    // automatikus tovább, ha nem loopol
   

    return () => {
      if (enableSkipTimerRef.current) clearTimeout(enableSkipTimerRef.current);
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    };
    // szándékosan nem függünk goNext-től
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipAfterMs, loop]);

  const handleUserPlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      setTapToPlay(false);
    } catch {
      setCanSkip(true); // ha így sem megy, engedjük a skipet
    }
  };

  // Hibák kezelése: ha a forrás hibás/404 → rövid várakozás után tovább
  const handleError = () => {
    window.setTimeout(goNext, 500);
  };

  return (
    <div
      className={styles.stage}
      data-visible={visible ? "1" : "0"}
      style={{
        ["--fade-in" as any]: `${fadeInMs}ms`,
        // Fix: fekete háttér a villanás ellen még akkor is, ha SCSS-ben nincs
        backgroundColor: "#000",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <video
        key={src}                 // forszírozza az újratöltést src váltásnál
        ref={videoRef}
        className={styles.video}
        style={{
          // Csak a videó fade-el, a stage nem tűnik el
          opacity: fadingOut ? 0 : 1,
          transition: `opacity ${Math.max(0, fadeOutMs)}ms ease`,
        }}
        playsInline
        preload="auto"
        poster={poster}
        autoPlay={autoplay}
        muted={isMuted || muted}
        loop={loop}
        onLoadedData={handleLoadedData}
        onEnded={() => !loop && goNext()}
        onError={handleError}
      >
        {srcWebm && <source src={srcWebm} type="video/webm" onError={handleError} />}
        <source src={src} type="video/mp4" onError={handleError} />
      </video>

      {tapToPlay && (
        <button
          className={styles.tapToPlay}
          onClick={handleUserPlay}
          aria-label="Tap to play"
        >
          Tap to play
        </button>
      )}

      <button
        className={styles.skip}
        onClick={() => canSkip && goNext()}
        disabled={!canSkip}
        aria-label="Skip transition"
      >
        Skip
      </button>
    </div>
  );
};

export default TransitionVideo;

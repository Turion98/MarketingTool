// components/RuneSaveOverlay/RuneSaveOverlay.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./RuneSaveOverlay.module.scss";
import { RUNE_ICON } from "../../lib/runeIcons"; // flagId -> abszolút/relatív útvonal

type Props = {
  /** Elfogad flagId-t (pl. "rune_ch1") vagy közvetlen kép URL-t */
  imageSrc: string;
  startSize?: number;
  centerOffsetX?: number;
  centerOffsetY?: number;
  fadeInMs?: number;
  holdMs?: number;
  fadeOutMs?: number;
  ease?: any;
  /** Animáció végén hívódik (egyszer) – StoryPage intézi a flag írást + tracket */
  onComplete?: () => void;
};

export default function RuneSaveOverlay({
  imageSrc,
  startSize = 180,
  centerOffsetX = 0,
  centerOffsetY = 0,
  fadeInMs = 450,
  holdMs = 3000,
  fadeOutMs = 400,
  ease = "easeOut",
  onComplete,
}: Props) {
  // 1) Portal guard (SSR safe)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 2) flagId -> asset feloldás (memo: inputtól függ)
  const resolvedSrc = useMemo(() => {
    const raw = (RUNE_ICON as any)[imageSrc] ?? imageSrc;
    if (typeof window === "undefined") return raw;
    try {
      // Abszolút URL-t gyárt, ha relatív
      return new URL(raw, window.location.origin).toString();
    } catch {
      return raw;
    }
  }, [imageSrc]);

  // 3) Kép preload (egyszerű és biztos)
  useEffect(() => {
    const im = new Image();
    im.src = resolvedSrc;
  }, [resolvedSrc]);

  // 4) Motion időarányok
  const total = fadeInMs + holdMs + fadeOutMs;
  const t1 = fadeInMs / total;
  const t2 = (fadeInMs + holdMs) / total;

  // 5) Egyszeri onComplete védelem
  const doneRef = useRef(false);
  const handleComplete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { onComplete?.(); } catch {}
  };

  // 6) Reduced motion – kímélő mód: villanás + azonnali complete
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reduced motion: rövid megjelenítés, majd complete
  useEffect(() => {
    if (!prefersReduced) return;
    const t = window.setTimeout(handleComplete, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReduced]);

  const node = (
    <AnimatePresence>
      <div
        className={styles?.overlayRoot || ""}
        style={{
          // Fallback stílusok, ha nincs SCSS:
          position: styles?.overlayRoot ? undefined : "fixed",
          inset: styles?.overlayRoot ? undefined : 0,
          zIndex: styles?.overlayRoot ? undefined : 2000,
          display: styles?.overlayRoot ? undefined : "flex",
          alignItems: styles?.overlayRoot ? undefined : "center",
          justifyContent: styles?.overlayRoot ? undefined : "center",
          pointerEvents: "none",
          transform: `translate(${centerOffsetX}px, ${centerOffsetY}px)`,
        }}
        aria-hidden={true}
        role="presentation"
      >
        {!prefersReduced && (
          <motion.img
            src={resolvedSrc}
            alt=""                 // dekoratív
            className={styles?.runeImage || ""}
            style={{
              width: startSize,
              height: startSize,
              // Fallback glow, ha nincs SCSS
              filter: styles?.runeImage ? undefined : "drop-shadow(0 0 12px rgba(255,230,140,.9))",
              userSelect: "none",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 1.05] }}
            exit={{ opacity: 0 }}
            transition={{ duration: total / 1000, ease, times: [0, t1, t2, 1] }}
            onAnimationComplete={handleComplete}
            draggable={false}
          />
        )}
        {prefersReduced && (
          <img
            src={resolvedSrc}
            alt=""
            style={{ width: startSize, height: startSize, userSelect: "none" }}
            draggable={false}
          />
        )}
      </div>
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}

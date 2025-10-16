// components/RuneSaveOverlay/RuneSaveOverlay.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./RuneSaveOverlay.module.scss";
import Icon from "../../ui/Icon"; // ⬅️ ÚJ központi ikon
import { IconKey } from "../../../lib/IconRegistry";
// (meghagyjuk a régit fallbacknek, ha még létezik)
import { RUNE_ICON } from "../../../lib/runeIcons";

type Props = {
  /** ÚJ (preferált): ikon kulcs a registryből (pl. "cross" | "branch" | "shield") */
  iconType?: IconKey | string;
  /** Visszafelé kompatibilis: közvetlen kép URL vagy régi flagId */
  imageSrc?: string;

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
  iconType,
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
  // Portal guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fallback: régi imageSrc → feloldott URL (ha nem registry kulcs)
  const resolvedImgSrc = useMemo(() => {
    const raw = imageSrc ? ((RUNE_ICON as any)[imageSrc] ?? imageSrc) : undefined;
    if (!raw || typeof window === "undefined") return raw;
    try { return new URL(raw, window.location.origin).toString(); } catch { return raw; }
  }, [imageSrc]);

  // Motion időarányok
  const total = fadeInMs + holdMs + fadeOutMs;
  const t1 = fadeInMs / total;
  const t2 = (fadeInMs + holdMs) / total;

  // Egyszeri onComplete
  const doneRef = useRef(false);
  const handleComplete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { onComplete?.(); } catch {}
  };

  // Reduced motion
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!prefersReduced) return;
    const t = window.setTimeout(handleComplete, 200);
    return () => window.clearTimeout(t);
  }, [prefersReduced]); // eslint-disable-line

  const node = (
    <AnimatePresence>
      <div
        className={styles?.overlayRoot || ""}
        style={{
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
          <motion.div
            className={styles?.runeImage || ""}
            style={{
              width: startSize,
              height: startSize,
              filter: styles?.runeImage ? undefined : "drop-shadow(0 0 12px rgba(255,230,140,.9))",
              userSelect: "none",
              display: "grid",
              placeItems: "center",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 1.05] }}
            exit={{ opacity: 0 }}
            transition={{ duration: total / 1000, ease, times: [0, t1, t2, 1] }}
            onAnimationComplete={handleComplete}
          >
            {iconType
              ? <Icon type={iconType} size={startSize} variant="active" aria-label="Rune saved" />
              : resolvedImgSrc
                ? <img src={resolvedImgSrc} alt="" width={startSize} height={startSize} draggable={false}/>
                : null}
          </motion.div>
        )}
        {prefersReduced && (
          iconType
            ? <Icon type={iconType} size={startSize} variant="active" aria-label="Rune saved" />
            : resolvedImgSrc
              ? <img src={resolvedImgSrc} alt="" width={startSize} height={startSize} draggable={false}/>
              : null
        )}
      </div>
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}

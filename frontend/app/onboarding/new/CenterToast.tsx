"use client";

import { useEffect, useState } from "react";
import s from "./centerToast.module.scss";

export interface CenterToastProps {
  message: string;
  /** Megjelenés időtartama ms-ben (default 3200). */
  durationMs?: number;
  onDone?: () => void;
}

/**
 * Központi, transient toast — Card 2 újramentésekor jelzi, hogy a Card 4
 * érintett lesz. ~3s után fade-out, nem blokkol interakciót.
 */
export default function CenterToast({
  message,
  durationMs = 3200,
  onDone,
}: CenterToastProps) {
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("out"), durationMs - 400);
    const doneTimer = setTimeout(() => onDone?.(), durationMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [durationMs, onDone]);

  return (
    <div
      className={[s.overlay, phase === "out" ? s.overlayOut : ""].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className={[s.bubble, phase === "out" ? s.bubbleOut : ""].join(" ")}>
        <span className={s.icon} aria-hidden="true">
          ⚠
        </span>
        <p className={s.text}>{message}</p>
      </div>
    </div>
  );
}

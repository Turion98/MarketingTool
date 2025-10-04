"use client";

import React from "react";
import styles from "./Canvas.module.scss";

type CanvasProps = {
  children: React.ReactNode;
  /** Skin token override (inline style), opcionális */
  style?: React.CSSProperties;
  /** Extra class, opcionális */
  className?: string;
};

/** Egyszerű segédfüggvény a className-ek összefűzésére */
function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

/**
 * Canvas
 * - A teljes játékfelület outer wrap-je (viewport szélesség, max szélesség, padding stb.)
 * - A belső .playfield grid (Media → Narrative → Choices) elrendezését a SCSS biztosítja.
 * - Nincs abszolút pozicionálás itt; minden komponens a "normál flow"-ban marad.
 */
export default function Canvas({ children, style, className }: CanvasProps) {
  return (
    <main
      className={cx(styles.canvasWrap, className)}
      style={style}
      data-layout="media-narrative-choices"
      aria-label="Interactive Story Canvas"
    >
      <div className={styles.playfield} role="group" aria-label="Playfield">
        {children}
      </div>
    </main>
  );
}

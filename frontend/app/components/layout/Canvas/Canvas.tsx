"use client";

import React from "react";
import styles from "./Canvas.module.scss";

/** 
 * Canvas: slotos + visszafelé kompatibilis (children) API.
 * - Ha bármely slot meg van adva, a grid-területeket rendereli.
 * - Ha NINCS slot, akkor a régi viselkedéssel a children-t jeleníti meg.
 */
type CanvasProps = {
  topbar?: React.ReactNode;
  progress?: React.ReactNode;
  media?: React.ReactNode;
  narr?: React.ReactNode;
  dock?: React.ReactNode;
  action?: React.ReactNode;

  /** Régi API támogatásához meghagyjuk a children-t */
  children?: React.ReactNode;

  /** Skin token override (inline style), opcionális */
  style?: React.CSSProperties;
  /** Extra class, opcionális */
  className?: string;
};

function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

export default function Canvas({
  topbar,
  progress,
  media,
  narr,
  dock,
  action,
  children,
  style,
  className,
}: CanvasProps) {
  const hasSlots = !!(topbar || progress || media || narr || dock || action);

  return (
    <main
      className={cx(styles.canvasWrap, className)}
      style={style}
      data-layout="media-narrative-choices"
      aria-label="Interactive Story Canvas"
    >
      <div className={styles.playfield} role="group" aria-label="Playfield">
        {hasSlots ? (
          <>
            <div className={styles.areaTopbar}>{topbar}</div>
            <div className={styles.areaProgress}>{progress}</div>
            <div className={styles.areaMedia}>{media}</div>
            <div className={styles.areaNarr}>{narr}</div>
            <div className={styles.areaDock}>{dock}</div>
            <div className={styles.areaAction}>{action}</div>
          </>
        ) : (
          // RÉGI: ha nincs slot, a children megy változatlanul
          children
        )}
      </div>
    </main>
  );
}

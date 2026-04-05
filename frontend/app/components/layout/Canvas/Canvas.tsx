"use client";

import React from "react";
import styles from "./Canvas.module.scss";


/**
 * Canvas: slotos + visszafelé kompatibilis (children) API.
 * - Ha bármely slot meg van adva, a grid-területeket rendereli.
 * - Ha NINCS slot, akkor a régi viselkedéssel a children-t jeleníti meg.
 */
type CanvasProps = {
  /** ÚJ: háttér slot (pl. <DecorBackground />) */
  background?: React.ReactNode;

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

  /** Ghost embed: nem fixed fullscreen, átlátszó — iframe auto-height méréshez */
  embedGhost?: boolean;
};

function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

export default function Canvas({
  background,
  topbar,
  progress,
  media,
  narr,
  dock,
  action,
  children,
  style,
  className,
  embedGhost = false,
}: CanvasProps) {
  // 🔹 ténylegesen csak akkor számítson "van mediának", ha van legalább 1 gyerek-node
  const hasMedia = React.Children.toArray(media ?? []).length > 0;
  const hasSlots = !!(topbar || progress || hasMedia || narr || dock || action);

  return (
    <main
      className={cx(styles.canvasWrap, embedGhost && styles.canvasEmbedGhost, className)}
      style={style}
      data-layout="media-narrative-choices"
      aria-label="Interactive Story Canvas"
    >
      {/* ÚJ: háttér réteg */}
      {background && (
        <div className={styles.background} aria-hidden data-bg-present="1">
          {background}
        </div>
      )}

      {/* 🔹 data-has-media csak akkor 1, ha tényleg van media-tartalom */}
      <div
        className={styles.playfield}
        role="group"
        aria-label="Playfield"
        data-has-media={hasMedia ? "1" : "0"}
      >
        {hasSlots ? (
          <>
            <div className={styles.areaProgress}>{progress}</div>
            <div className={styles.areaTopbar}>{topbar}</div>

            {/* 🔥 Csak akkor rendereljük a media cellát, ha tényleg van! */}
            {hasMedia && (
              <div className={styles.areaMedia}>
                <div className={styles.areaMediaSlot}>{media}</div>
              </div>
            )}

            <div className={styles.areaNarr}>{narr}</div>
            <div className={styles.areaDock}>{dock}</div>
            <div className={styles.areaAction}>{action}</div>
          </>
        ) : (
          children
        )}
      </div>
    </main>
  );
}

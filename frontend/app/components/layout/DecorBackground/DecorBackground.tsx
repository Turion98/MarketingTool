"use client";

import React, { useMemo } from "react";
import s from "./DecorBackground.module.scss";

export type DecorBackgroundProps = {
  /** "none" | "subtle" | "promo" — vizuális preset */
  preset?: "none" | "subtle" | "promo";
  /** Forrás. Lehet kép- vagy videó-URL. Ha nincs megadva, a skin tokenek döntenek (CSS réteg). */
  src?: string;
  /** Ha videó: poszter képe (opcionális) */
  poster?: string;
  /** 'auto' (alap), 'css', 'image' vagy 'video' */
  kind?: "auto" | "css" | "image" | "video";
  /** alt szöveg, ha képet renderelünk */
  alt?: string;
  /** Videó flag-ek (skinből is felülírhatók CSS-sel, de itt JS-ben is adhatók) */
  loop?: boolean;
  muted?: boolean;
  autoplay?: boolean;
};

function guessKind(kind: DecorBackgroundProps["kind"], src?: string): "css" | "image" | "video" {
  if (kind && kind !== "auto") return kind;
  const s = (src || "").toLowerCase();
  if (!s) return "css";
  if (/\.(mp4|webm|ogg)(\?|#|$)/.test(s)) return "video";
  return "image";
}

const DecorBackground: React.FC<DecorBackgroundProps> = ({
  preset = "subtle",
  src,
  poster,
  kind = "auto",
  alt = "Background",
  loop = true,
  muted = true,
  autoplay = true,
}) => {
  const resolvedKind = useMemo(() => guessKind(kind, src), [kind, src]);
  const presetClass = preset === "promo" ? s.promo : preset === "none" ? s.none : s.subtle;

  return (
    <div
      className={`${s.storyBackground} ${presetClass}`}
      aria-hidden
      data-bg-kind={resolvedKind}
      data-bg-preset={preset}
    >
      {/* 1) Pure CSS háttér-réteg – SKIN TOKENEK irányítják */}
      <div className={s.cssBg} />

      {/* 2) Média réteg szkinfüggetlenül (ha van explicit src) */}
      {src && resolvedKind === "image" && (
        <img
          src={src}
          alt={alt}
          className={s.backgroundImage}
          fetchPriority="high"
          decoding="async"
        />
      )}

      {src && resolvedKind === "video" && (
        <video
          className={s.backgroundVideo}
          src={src}
          poster={poster}
          loop={loop}
          muted={muted}
          autoPlay={autoplay}
          playsInline
        />
      )}

      {/* 3) Opcionális overlay (színezés/blur/minta — skinből vezérelve) */}
      <div className={s.backgroundOverlay} />
    </div>
  );
};

export default DecorBackground;

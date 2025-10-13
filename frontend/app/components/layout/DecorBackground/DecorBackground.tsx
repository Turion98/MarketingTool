"use client";

import React, { useMemo, useEffect, useState } from "react";
import s from "./DecorBackground.module.scss";

export type DecorBackgroundProps = {
  preset?: "none" | "subtle" | "promo";
  src?: string;
  poster?: string;
  kind?: "auto" | "css" | "image" | "video";
  alt?: string;
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

/* 🔧 idézőjelek lecsupaszítása, ha a CSS var stringként jön ("...") */
const stripQuotes = (v?: string | null) => (v ? v.replace(/^['"]|['"]$/g, "").trim() : "");

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
  /* 🔎 token-alapú fallback források (skinből) */
  const [tokenVideo, setTokenVideo] = useState<string | null>(null);
  const [tokenImage, setTokenImage] = useState<string | null>(null);

  useEffect(() => {
    // body-ról olvasunk, mert oda kerülnek a skin tokenek
    const el = document.body;
    if (!el) return;
    const cs = getComputedStyle(el);
    // --bg-video: pl. "/assets/campaigns/forest/bg_loop.mp4"
    const v = stripQuotes(cs.getPropertyValue("--bg-video"));
    // --bg-image-elem: ha tényleg img tag-et akarsz a cssBg fölé (nem kötelező)
    const i = stripQuotes(cs.getPropertyValue("--bg-image-elem"));
    setTokenVideo(v || null);
    setTokenImage(i || null);
  }, []);

  /* 🔀 Forrás és típus kiválasztása prioritással:
     1) props.src
     2) --bg-video (video)
     3) --bg-image-elem (image)
     4) nincs → css */
  const autoSrc = useMemo(() => {
    if (src) return src;
    if (tokenVideo) return tokenVideo;
    if (tokenImage) return tokenImage;
    return "";
  }, [src, tokenVideo, tokenImage]);

  const resolvedKind = useMemo(() => {
    if (src) return guessKind(kind, src);
    if (tokenVideo) return "video";
    if (tokenImage) return "image";
    return "css";
  }, [kind, src, tokenVideo, tokenImage]);

  const presetClass = preset === "promo" ? s.promo : preset === "none" ? s.none : s.subtle;

  return (
    <div
      className={`${s.storyBackground} ${presetClass}`}
      aria-hidden
      data-bg-kind={resolvedKind}
      data-bg-preset={preset}
    >
      {/* 1) CSS tokenes háttér mindig megy alul */}
      <div className={s.cssBg} />

      {/* 2) Képréteg (prop.src VAGY --bg-image-elem) */}
      {autoSrc && resolvedKind === "image" && (
        <img
          src={autoSrc}
          alt={alt}
          className={s.backgroundImage}
          fetchPriority="high"
          decoding="async"
          loading="eager"
        />
      )}

      {/* 3) Videóréteg (prop.src VAGY --bg-video) */}
      {autoSrc && resolvedKind === "video" && (
        <video
          className={s.backgroundVideo}
          src={autoSrc}
          poster={poster}
          loop={loop}
          muted={muted}
          autoPlay={autoplay}
          playsInline
          preload="auto"
        />
      )}

      {/* 4) Overlay (skin tokens: --bg-overlay, --bg-blur, stb.) */}
      <div className={s.backgroundOverlay} />
    </div>
  );
};

export default DecorBackground;

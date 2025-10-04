// app/components/layout/MediaFrame/MediaFrame.tsx
"use client";

import React from "react";
import s from "./MediaFrame.module.scss";

type ContentInsetPct = { top?: number; right?: number; bottom?: number; left?: number };

type MediaFrameImageProps = {
  frameSrc?: string;
  /** Optional: some callers passed fadeIn here; keep for backward-compat */
  fadeIn?: boolean;
  className?: string;
};

type MediaFrameProps = {
  mode?: "image" | "video";
  imageProps?: MediaFrameImageProps;
  /** Preferred place for fadeIn flag */
  fadeIn?: boolean;
  /** Safe area of the frame's inner window in percentages */
  contentInsetPct?: ContentInsetPct;
  children?: React.ReactNode;
};

/**
 * Keret + logó + belső tartalom (GeneratedImage) host komponens
 * - Backward-compatible: accepts `fadeIn` either top-level or inside imageProps.
 */
const MediaFrame: React.FC<MediaFrameProps> = ({
  mode = "image",
  imageProps,
  fadeIn,
  contentInsetPct,
  children,
}) => {
  const { frameSrc = "/assets/frame.png" } = imageProps || {};
  const effectiveFadeIn = (typeof fadeIn === "boolean" ? fadeIn : imageProps?.fadeIn) ?? false;

  const styleVars: React.CSSProperties = {
    ["--mf-inset-top" as any]: contentInsetPct?.top != null ? `${contentInsetPct.top}%` : undefined,
    ["--mf-inset-right" as any]: contentInsetPct?.right != null ? `${contentInsetPct.right}%` : undefined,
    ["--mf-inset-bottom" as any]: contentInsetPct?.bottom != null ? `${contentInsetPct.bottom}%` : undefined,
    ["--mf-inset-left" as any]: contentInsetPct?.left != null ? `${contentInsetPct.left}%` : undefined,
  };

  return (
    <div
      className={`${s.mediaFrame} ${effectiveFadeIn ? s.fadeIn : ""}`}
      aria-label="Media frame"
      data-mode={mode}
    >
      {/* FRAME */}
      <img src={frameSrc} alt="Frame" className={s.frameImage} draggable={false} />
      {/* LOGO */}
      <div className={s.logoUnderlay}>
        <img src="/logo.png" alt="logo" className={s.logoImage} draggable={false} />
      </div>
      {/* CONTENT */}
      <div className={s.inner} style={styleVars}>
        <div className={s.content}>{children}</div>
      </div>
    </div>
  );
};

export default MediaFrame;

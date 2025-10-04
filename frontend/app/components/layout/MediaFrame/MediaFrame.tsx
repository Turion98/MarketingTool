// app/components/layout/MediaFrame/MediaFrame.tsx
"use client";

import React from "react";
import s from "./MediaFrame.module.scss";

type MediaFrameProps = {
  mode?: "image" | "video";
  fadeIn?: boolean;
  children?: React.ReactNode;
  /** Skin token override (CSS custom properties) */
  style?: React.CSSProperties;
};

/**
 * CLEAN BASE VERSION
 * - Nincs frame, nincs logo.
 * - Csak a tartalmat (pl. GeneratedImage) jeleníti meg,
 *   és biztosítja a teljes, középre igazított rendelkezésre álló területet.
 * - CSS tokeneket (pl. --gi-scale, --gi-fit) inline át tud venni.
 */
const MediaFrame: React.FC<MediaFrameProps> = ({
  mode = "image",
  fadeIn = false,
  children,
  style,
}) => {
  return (
    <div
      className={`${s.mediaFrame} ${fadeIn ? s.fadeIn : ""}`}
      aria-label="Media frame"
      data-mode={mode}
      style={style}          // 🔹 itt alkalmazzuk az inline tokeneket
    >
      <div className={s.content}>{children}</div>
    </div>
  );
};

export default MediaFrame;

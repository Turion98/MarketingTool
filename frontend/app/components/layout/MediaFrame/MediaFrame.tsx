"use client";
import React from "react";
import s from "./MediaFrame.module.scss";

type MediaFrameProps = {
  mode: "image" | "video";
  imageProps?: {
    frameSrc?: string;
    fadeIn?: boolean;
  };
  children?: React.ReactNode; // ide jön a GeneratedImage_with_fadein
};

const MediaFrame: React.FC<MediaFrameProps> = ({
  mode,
  imageProps,
  children,
}) => {
  const { frameSrc = "/frame.png", fadeIn = true } = imageProps || {};

  return (
    <div className={s.mediaFrame} aria-label="Media frame" data-mode={mode}>
      {/* keret */}
      <img src={frameSrc} alt="Frame" className={s.frameImage} />

      {/* tartalom */}
      <div className={s.inner}>
        <div className={`${s.content} ${fadeIn ? s.fadeIn : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default MediaFrame;

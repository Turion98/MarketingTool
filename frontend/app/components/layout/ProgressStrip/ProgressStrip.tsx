"use client";
import React from "react";
import s from "./ProgressStrip.module.scss";

export type ProgressStripProps = {
  /** value in [0..1] */
  value?: number;
  className?: string;
};

const ProgressStrip: React.FC<ProgressStripProps> = ({ value = 0 }) => {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={s.progressHud} aria-label="Story progress">
      <div className={s.progressTrack}>
        <div
          className={s.progressFill}
          style={{ ["--progress-pct" as any]: `${pct}%` } as React.CSSProperties}
        />
      </div>
      <div className={s.progressLabel}>{pct}%</div>
    </div>
  );
};

export default ProgressStrip;

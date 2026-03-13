"use client";
import React from "react";
import s from "./ProgressStrip.module.scss";

export type ProgressStripProps = {
  /** progress value in range [0..1] */
  value?: number;
  /** optional className override */
  className?: string;
  /** visual mode: "bar" = thin top line only, "hud" = with label */
  variant?: "bar" | "hud";
  /** optional milestones along the bar in [0..1] */
  milestones?: Array<{ x: number; label?: string }>;
};

const ProgressStrip: React.FC<ProgressStripProps> = ({
  value = 0,
  className = "",
  variant = "bar",
  milestones,
}) => {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <div
      className={`${s.progressHud} ${className}`}
      data-variant={variant}
      aria-label="Story progress"
    >
      <div className={s.progressTrack}>
        <div
          className={s.progressFill}
          style={
            { ["--progress-pct" as any]: `${pct}%` } as React.CSSProperties
          }
        />
        {milestones?.map((m, i) => (
          <div
            key={i}
            className={s.progressMarker}
            style={{
              ["--progress-marker-x" as any]: `${Math.round(
                Math.max(0, Math.min(1, m.x)) * 100
              )}%`,
            } as React.CSSProperties}
            title={m.label}
          />
        ))}
      </div>
      {variant === "hud" && (
        <div className={s.progressLabel}>{pct}%</div>
      )}
    </div>
  );
};

export default ProgressStrip;

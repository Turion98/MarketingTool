"use client";
import React, { useEffect, useState } from "react";
import AnalyticsReport from "@/app/components/AnalyticsReport/AnalyticsReport";
import style from "./ReportDrawer.module.scss";

type Range = "last7d" | "last30d";

export type ReportDrawerProps = {
  storyId: string;
  onClose: () => void;
  defaultRange?: Range;
};

export default function ReportDrawer({
  storyId,
  onClose,
  defaultRange = "last7d",
}: ReportDrawerProps) {
  const [range, setRange] = useState<Range>(defaultRange);

  // Esc-re zárás
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // backdrop kattintásra zárás
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={style.backdrop}
      role="dialog"
      aria-modal="true"
      onClick={handleBackdrop}
    >
      <div className={style.panel}>
        {/* Header */}
        <div className={style.header}>
          <div className={style.title}>Report – {storyId}</div>

          <div className={style.controls}>
            <label>
              <span>Range</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as Range)}
              >
                <option value="last7d">Last 7 days</option>
                <option value="last30d">Last 30 days</option>
              </select>
            </label>

            <button
              className={style.closeBtn}
              onClick={onClose}
              aria-label="Close report drawer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className={style.bodyScroll}>
          <AnalyticsReport
            key={storyId + "|" + range}
            storyId={storyId}
            defaultRange={range}
          />
        </div>
      </div>
    </div>
  );
}

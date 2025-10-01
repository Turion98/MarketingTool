"use client";
import React, { useEffect, useState } from "react";
import AnalyticsReport from "@/app/components/AnalyticsReport/AnalyticsReport";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdrop}
    >
      <div className="absolute right-0 top-0 h-full w-[min(560px,92vw)] bg-white text-black overflow-hidden shadow-xl">
        {/* Sticky fejlec */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
          <h2 className="text-base font-semibold truncate">Report – {storyId}</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm flex items-center gap-2">
              <span className="text-gray-600">Range</span>
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={range}
                onChange={(e) => setRange(e.target.value as Range)}
              >
                <option value="last7d">Last 7 days</option>
                <option value="last30d">Last 30 days</option>
              </select>
            </label>
            <button
              onClick={onClose}
              className="text-sm px-2 py-1 border rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        {/* Tartalom görgethető */}
        <div className="h-full overflow-auto px-3 py-3">
          <AnalyticsReport storyId={storyId} defaultRange={range} />
        </div>
      </div>
    </div>
  );
}

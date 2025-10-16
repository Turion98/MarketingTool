// components/RuneDockOverlay.tsx
"use client";
import React, { useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import RuneDockDisplay, { RuneKey } from "../../runes/RuneDockDisplay";
import style from "./RuneDockOverlay.module.scss";
// Meghagyjuk a régit fallbacknek, de elsődleges most már kulcsokkal dolgozni
import { RUNE_ICON } from "../../../lib/runeIcons";

type Rect = { x: number; y: number; width: number; height: number };

function flagToRuneKey(flagId: string): RuneKey | null {
  if (/rune_ch1|^cross$/i.test(flagId)) return "cross";
  if (/rune_ch2|^branch$/i.test(flagId)) return "branch";
  if (/rune_ch3|^shield$/i.test(flagId)) return "shield";
  return null;
}

type Props = {
  /** (Opcionális) közvetlen megjelenítési sorrend / kulcsok. */
  runes?: string[];
  /** Feloldott flag ID-k (pl. rune_ch1/ch2/ch3) */
  flagIds?: string[];
  /** Opcionális: flag → egyedi PNG (régi fallback) */
  imagesByFlag?: Record<string, string>;
  /** Viewport koordinátás content rect (portalhoz/fixed-hez) */
  anchor?: Rect;

  /** Layout paraméterek (CSS változók) */
  offsetY?: number;
  offsetX?: number;
  slotSize?: number;
  slots?: number;
  framePaddingX?: number;
  framePaddingY?: number;

  /** Portal vagy lokális render */
  usePortal?: boolean;
};

export default function RuneDockOverlay({
  runes,
  flagIds = [],
  imagesByFlag = {},
  anchor,
  offsetY,
  offsetX,
  slotSize,
  slots,
  framePaddingX,
  framePaddingY,
  usePortal = false,
}: Props) {
  // Anchor cache
  const lastAnchorRef = useRef<Rect | null>(null);
  if (anchor) lastAnchorRef.current = anchor;
  const effectiveAnchor = anchor ?? lastAnchorRef.current ?? undefined;

  // Kerekités
  const x = Math.round(effectiveAnchor?.x ?? 0);
  const y = Math.round(effectiveAnchor?.y ?? 0);
  const w = Math.round(effectiveAnchor?.width ?? 0);
  const h = Math.round(effectiveAnchor?.height ?? 0);

  // flag → kulcs + (régi) asset URL feloldás fallback célból
  const assetsFromFlags = useMemo(() => {
    const out: Partial<Record<RuneKey, string>> = {};
    for (const fid of flagIds) {
      const key = flagToRuneKey(fid);
      if (!key) continue;
      out[key] = imagesByFlag[fid] || (RUNE_ICON as any)[fid] || (RUNE_ICON as any)[key];
    }
    return out;
  }, [flagIds, imagesByFlag]);

  // Kijelzett kulcsok: explicit runes vagy flags-ből
  const runesForDisplay = useMemo(() => {
    if (Array.isArray(runes) && runes.length) return runes;
    return Object.keys(assetsFromFlags);
  }, [runes, assetsFromFlags]);

  // CSS változók
  const styleVars: React.CSSProperties = useMemo(
    () => ({
      ...(usePortal && effectiveAnchor ? {
        ["--ns-content-x" as any]: `${x}px`,
        ["--ns-content-y" as any]: `${y}px`,
        ["--ns-content-w" as any]: `${w}px`,
        ["--ns-content-h" as any]: `${h}px`,
      } : null),
      ...(offsetX !== undefined ? { ["--rune-offset-x" as any]: `${offsetX}px` } : null),
      ...(offsetY !== undefined ? { ["--rune-offset-y" as any]: `${offsetY}px` } : null),
      ...(slotSize !== undefined ? { ["--rune-slot" as any]: `${slotSize}px` } : null),
      ...(slots !== undefined ? { ["--rune-slots" as any]: `${slots}` } : null),
      ...(framePaddingX !== undefined ? { ["--frame-padding-x" as any]: `${framePaddingX}px` } : null),
      ...(framePaddingY !== undefined ? { ["--frame-padding-y" as any]: `${framePaddingY}px` } : null),
    }),
    [usePortal, effectiveAnchor, x, y, w, h, offsetX, offsetY, slotSize, slots, framePaddingX, framePaddingY]
  );

  const node = (
    <div
      className={`${style.runeDockOverlay} ${usePortal ? style.isPortal : ""}`}
      style={styleVars}
      aria-hidden={true}
    >
      <RuneDockDisplay
        runes={runesForDisplay as RuneKey[]}
        flagIds={flagIds}
        /** assets megmarad fallbacknek, de elsődlegesen már ikon-kulcsokból renderelünk */
        assets={assetsFromFlags}
      />
    </div>
  );

  if (usePortal && typeof window !== "undefined") {
    return effectiveAnchor ? createPortal(node, document.body) : node;
  }
  return node;
}

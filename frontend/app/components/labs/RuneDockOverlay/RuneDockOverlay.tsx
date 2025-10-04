// /components/RuneDockOverlay.tsx
"use client";
import React, { useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import RuneDockDisplay, { RuneKey } from "../../runes/RuneDockDisplay";
import style from "./RuneDockOverlay.module.scss";
import { RUNE_ICON } from "../../../lib/runeIcons";

type Rect = { x: number; y: number; width: number; height: number };

/** FlagID -> RuneKey (igazítsd a saját nevezéktanodhoz, ha bővül) */
function flagToRuneKey(flagId: string): RuneKey | null {
  if (/rune_ch1|^cross$/i.test(flagId)) return "cross";
  if (/rune_ch2|^branch$/i.test(flagId)) return "branch";
  if (/rune_ch3|^shield$/i.test(flagId)) return "shield";
  return null;
}

type Props = {
  /** (Opcionális) közvetlen megjelenítési sorrend. Ha nincs, flags/asset alapján állítjuk össze. */
  runes?: string[];
  /** Feloldott flag ID-k (pl. rune_ch1/ch2/ch3) */
  flagIds?: string[];
  /** Opcionális: flag → egyedi PNG (pl. { rune_ch1: "/assets/runes/cross_custom.png" }) */
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

  /**
   * Ha true → createPortal(document.body) (ált. position: fixed).
   * Ha false → helyben renderel (ált. NineSlicePanel backdrop), position: absolute.
   */
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
  // ⬇️ Oldalváltáskor is legyen utolsó érvényes anchor (villogás ellen)
  const lastAnchorRef = useRef<Rect | null>(null);
  if (anchor) lastAnchorRef.current = anchor;
  const effectiveAnchor = anchor ?? lastAnchorRef.current ?? undefined;

  // Kerekítés: elkerüli az animáció alatti subpixeles sodródást
  const x = Math.round(effectiveAnchor?.x ?? 0);
  const y = Math.round(effectiveAnchor?.y ?? 0);
  const w = Math.round(effectiveAnchor?.width ?? 0);
  const h = Math.round(effectiveAnchor?.height ?? 0);

  // Assets a flags alapján: custom > flag ikon > rune key ikon
  const assetsFromFlags: Partial<Record<RuneKey, string>> = useMemo(() => {
    const out: Partial<Record<RuneKey, string>> = {};
    for (const fid of flagIds) {
      const key = flagToRuneKey(fid);
      if (!key) continue;
      out[key] =
        imagesByFlag[fid] || // egyedi PNG elsőbbség
        (RUNE_ICON as any)[fid] || // flag-hez rendelt ikon
        (RUNE_ICON as any)[key]; // key-hez rendelt ikon
    }
    return out;
  }, [flagIds, imagesByFlag]);

  // Megjelenítendő lista: explicit runes vagy flags-ből kikövetkeztetett kulcsok
  const runesForDisplay = useMemo(() => {
    if (Array.isArray(runes) && runes.length) return runes;
    // alap: a flags-ből összegyűjtött kulcsok (sorrendben, duplikátum nélkül)
    return Object.keys(assetsFromFlags);
  }, [runes, assetsFromFlags]);

  // CSS változók (SCSS pozicionál)
  const styleVars: React.CSSProperties = useMemo(
    () => ({
      ...(usePortal && effectiveAnchor
        ? {
            ["--ns-content-x" as any]: `${x}px`,
            ["--ns-content-y" as any]: `${y}px`,
            ["--ns-content-w" as any]: `${w}px`,
            ["--ns-content-h" as any]: `${h}px`,
          }
        : null),
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
      aria-hidden={true} // dekoratív, ne kerüljön a képernyőolvasó fókuszába
    >
      <RuneDockDisplay
        runes={runesForDisplay}
        flagIds={flagIds}
        assets={assetsFromFlags}
      />
    </div>
  );

  // Ha portalos, de még nincs anchor, inkább lokálisan rendereljünk, ne tűnjön el
  if (usePortal && typeof window !== "undefined") {
    return effectiveAnchor ? createPortal(node, document.body) : node;
  }

  return node;
}

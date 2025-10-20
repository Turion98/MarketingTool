// components/labs/RuneDockOverlay/RuneDockOverlay.tsx
"use client";

import React, { useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import RuneDockDisplay, { RuneKey } from "../../runes/RuneDockDisplay";
import style from "./RuneDockOverlay.module.scss";
import { RUNE_ICON } from "../../../lib/runeIcons";
import { useGameState } from "../../../lib/GameStateContext";

type Rect = { x: number; y: number; width: number; height: number };

/* Flag → RuneKey segédfüggvény (helyben) */
function flagToRuneKey(flagId?: string | null): RuneKey | null {
  if (!flagId) return null;
  const s = String(flagId).toLowerCase();
  if (s === "rune_ch1") return "cross";
  if (s === "rune_ch2") return "branch";
  if (s === "rune_ch3") return "shield";
  return null;
}

/* Alap fallback sorrend – ha nincs aktív adat */
const FALLBACK_ORDER: RuneKey[] = ["cross", "branch", "shield"];

type Props = {
  runes?: RuneKey[];
  flagIds?: string[];
  imagesByFlag?: Record<string, string>;
  anchor?: Rect;
  offsetX?: number;
  offsetY?: number;
  slotSize?: number;
  slots?: number;
  framePaddingX?: number;
  framePaddingY?: number;
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
  const { globals } = useGameState();

  /* Kampány-szintű ikoncsomag (single/triple + paletta) – nincs típus import,
     az átadott objektum strukturálisan illeszkedik a RuneDockDisplay Props-hoz. */
  const runePackForDisplay = useMemo(() => {
    const rp: any = globals?.runePack;
    if (!rp || typeof rp !== "object") return undefined;

    const isTriple = rp.mode === "triple";

    if (!isTriple) {
      // SINGLE mód: elfogadjuk {icon} vagy {icons[0]}-t
      const icon: string | undefined =
        typeof rp.icon === "string"
          ? rp.icon
          : Array.isArray(rp.icons) && typeof rp.icons[0] === "string"
          ? rp.icons[0]
          : undefined;

      if (!icon) return undefined;

      // FONTOS: literál "single", hogy ne legyen 'string' szétesés
      return {
        mode: "single" as const,
        icon,
        palette: rp.palette,
      };
    }

    // TRIPLE mód
    const icons: string[] = Array.isArray(rp.icons)
      ? rp.icons.filter((x: any) => typeof x === "string").slice(0, 3)
      : [];

    if (icons.length === 0) return undefined;

    // FONTOS: literál "triple"
    return {
      mode: "triple" as const,
      icons,
      palette: rp.palette,
    };
  }, [globals?.runePack]);

  /* Anchor stabilizálása portálhoz */
  const lastAnchorRef = useRef<Rect | null>(null);
  if (anchor) lastAnchorRef.current = anchor;
  const effectiveAnchor = anchor ?? lastAnchorRef.current ?? undefined;

  const x = Math.round(effectiveAnchor?.x ?? 0);
  const y = Math.round(effectiveAnchor?.y ?? 0);
  const w = Math.round(effectiveAnchor?.width ?? 0);
  const h = Math.round(effectiveAnchor?.height ?? 0);

  /* Flag → ikon forrás (PNG/alias) */
  const assetsFromFlags = useMemo(() => {
    const out: Partial<Record<RuneKey, string>> = {};
    for (const fid of flagIds) {
      const key = flagToRuneKey(fid);
      if (!key) continue;
      out[key] =
        imagesByFlag[fid] ||
        (RUNE_ICON as any)[fid] ||
        (RUNE_ICON as any)[key] ||
        out[key];
    }
    return out;
  }, [flagIds, imagesByFlag]);

  /* Slotok meghatározása */
  const runesForDisplay = useMemo<RuneKey[]>(() => {
    if (Array.isArray(runes) && runes.length) return runes;
    const keys = Object.keys(assetsFromFlags) as RuneKey[];
    if (keys.length) return keys;
    return FALLBACK_ORDER;
  }, [runes, assetsFromFlags]);

  /* CSS változók (pozíció, méret, offset, padding) */
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
      ...(framePaddingX !== undefined
        ? { ["--frame-padding-x" as any]: `${framePaddingX}px` }
        : null),
      ...(framePaddingY !== undefined
        ? { ["--frame-padding-y" as any]: `${framePaddingY}px` }
        : null),
    }),
    [
      usePortal,
      effectiveAnchor,
      x,
      y,
      w,
      h,
      offsetX,
      offsetY,
      slotSize,
      slots,
      framePaddingX,
      framePaddingY,
    ]
  );

  /* Render */
  const node = (
    <div
      className={`${style.runeDockOverlay} ${usePortal ? style.isPortal : ""}`}
      style={styleVars}
      aria-hidden={true}
    >
      <RuneDockDisplay
        runes={runesForDisplay}           // RuneKey[] kompatibilis a string[]-del
        flagIds={flagIds}
        imagesByFlag={imagesByFlag}
        assets={assetsFromFlags}
        runePack={runePackForDisplay}     // literálos unionnal típushelyes
        delayMs={0}
      />
    </div>
  );

  if (usePortal && typeof window !== "undefined") {
    return effectiveAnchor ? createPortal(node, document.body) : node;
  }
  return node;
}

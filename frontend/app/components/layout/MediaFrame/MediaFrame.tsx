// app/components/layout/MediaFrame/MediaFrame.tsx
"use client";

import React, { CSSProperties } from "react";
import s from "./MediaFrame.module.scss";
import { useGameState } from "../../../lib/GameStateContext";

type MediaFrameProps = {
  mode?: "image" | "video";
  fadeIn?: boolean;
  children?: React.ReactNode;
  style?: CSSProperties;
  showGoldFrame?: boolean;
  logoSrc?: string;

  /** Oldal azonosító – hogy oldalváltáskor tudjunk újranyitni */
  pageId?: string;

  /** StoryPage-ből jön: amikor igaz, zárjuk a keretet (fade out fázis) */
  pageIsFadingOut?: boolean;

  /** Mennyi késleltetés után nyíljon ki a keret oldalváltáskor (ms) */
  openDelayMs?: number;

  /** 🔹 Első oldal: ne nyíljon ki automatikusan, csak ha tényleg jön media-gyerek */
  suppressFirstAutoOpen?: boolean;
};

const VIEWBOX_W = 1600;
const VIEWBOX_H = 900;

/**
 * ✅ Csak számokhoz használjuk (stroke vastagság, méretek).
 * Fontos: body-ról is olvasunk, mert a skin tokenek gyakran ott vannak.
 */
function readCssNumber(varName: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;

  const root = document.documentElement;
  const body = document.body;

  const raw =
    getComputedStyle(root).getPropertyValue(varName).trim() ||
    getComputedStyle(body).getPropertyValue(varName).trim();

  if (!raw) return fallback;

  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : fallback;
}

const MediaFrame: React.FC<MediaFrameProps> = ({
  mode = "image",
  fadeIn = false,
  children,
  style,
  showGoldFrame = true,
  logoSrc = "assets/my_logo.png",
  pageId,
  pageIsFadingOut = false,
  openDelayMs = 3900,
  suppressFirstAutoOpen = false,
}) => {
  const { registerRewardFrame } = useGameState();

  // SVG stroke-ok (skin felülírhatja)
  const OUTER_STROKE = readCssNumber("--mf-svg-outer-stroke", 26);
  const INNER_STROKE = readCssNumber("--mf-svg-inner-stroke", 16);
  const OVERLAY_STROKE = readCssNumber("--mf-svg-overlay-stroke", OUTER_STROKE);

  const BASE_INSET = Math.ceil(OUTER_STROKE / 2) + 2;

  // logó méret és hely – teljesen skinből
  const LOGO_BOX_W = readCssNumber("--mf-logo-box-w", 330);
  const LOGO_BOX_H = readCssNumber("--mf-logo-box-h", 218);
  const LOGO_MARGIN_RIGHT = readCssNumber("--mf-logo-margin-right", 0);
  const LOGO_MARGIN_BOTTOM = readCssNumber("--mf-logo-margin-bottom", 0);

  // panel kerekítés / kitolás
  const PANEL_EXPAND = readCssNumber("--mf-logo-panel-extra", 3);
  const RADIUS = readCssNumber("--mf-logo-panel-radius", 22);
  const PANEL_RAISE = readCssNumber("--mf-logo-panel-raise", 12);

  // logó belső paddingje % -ban volt megadva → itt átszámoljuk px-re
  const LOGO_PAD_X_PCT = readCssNumber("--mf-logo-pad-x", 1); // %
  const LOGO_PAD_Y_PCT = readCssNumber("--mf-logo-pad-y", 1); // %

  const LOGO_PAD_X = (LOGO_BOX_W * LOGO_PAD_X_PCT) / 100;
  const LOGO_PAD_Y = (LOGO_BOX_H * LOGO_PAD_Y_PCT) / 100;

  // 🔸 keret nyit/zár state – KEZDŐDJEK ZÁRTAN!
  const [frameOpen, setFrameOpen] = React.useState(false);

  // 🔸 volt-e már valaha kinyitva? (első oldal logikához)
  const [hasEverOpened, setHasEverOpened] = React.useState(false);

  // 🔸 az utolsó pageId – induljon undefined-ről, ne a current pageId-ről
  const lastPageIdRef = React.useRef<string | undefined>(undefined);

  const openTimerRef = React.useRef<number | null>(null);

  // 🔸 crossfade: aktuális és előző gyerek
  const [currentChild, setCurrentChild] = React.useState<React.ReactNode | null>(
    children ?? null
  );
  const [prevChild, setPrevChild] = React.useState<React.ReactNode | null>(null);
  const crossfadeTimerRef = React.useRef<number | null>(null);
  const [isCrossfading, setIsCrossfading] = React.useState(false);

  // 🔸 dinamikus képarány a bitmap alapján
  const [contentAspect, setContentAspect] = React.useState<number | null>(null);
  const imageWrapRef = React.useRef<HTMLDivElement | null>(null);

  // 🔸 közös nyitó-függvény, hogy mindenhol ugyanúgy állítsuk a state-et
  const scheduleOpen = React.useCallback((delayMs: number) => {
    if (typeof window === "undefined") {
      setFrameOpen(true);
      setHasEverOpened(true);
      return;
    }

    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
    }

    openTimerRef.current = window.setTimeout(() => {
      setFrameOpen(true);
      setHasEverOpened(true);
      openTimerRef.current = null;
    }, delayMs);
  }, []);

  // cleanup: komponens unmountkor töröljük a timereket
  React.useEffect(() => {
    return () => {
      if (openTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(openTimerRef.current);
      }
      if (crossfadeTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(crossfadeTimerRef.current);
      }
    };
  }, []);

  // oldalváltás: keret csuk → kis késleltetéssel nyit
  React.useEffect(() => {
    if (pageId === undefined) return;

    const isFirstPage = lastPageIdRef.current === undefined;
    const pageChanged = pageId !== lastPageIdRef.current;
    if (!pageChanged) return;

    lastPageIdRef.current = pageId;

    setFrameOpen(false);

    if (suppressFirstAutoOpen && isFirstPage) {
      return;
    }

    scheduleOpen(openDelayMs);
  }, [pageId, openDelayMs, suppressFirstAutoOpen, scheduleOpen]);

  // fade out fázis: csukjuk a keretet és ne nyíljon ki újra
  React.useEffect(() => {
    if (pageIsFadingOut) {
      if (openTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      setFrameOpen(false);
    }
  }, [pageIsFadingOut]);

  // 🔹 Első oldal speciális: ha eddig nem nyitottunk ki, de végre jött media-gyerek
  React.useEffect(() => {
    if (!suppressFirstAutoOpen) return;
    if (hasEverOpened) return;
    if (!children) return;

    scheduleOpen(openDelayMs);
  }, [children, suppressFirstAutoOpen, hasEverOpened, openDelayMs, scheduleOpen]);

  // 🔹 EXTRA BIZTOSÍTÉK: ha van pageId + vizuális tartalom, de valamiért nem nyitottunk
  React.useEffect(() => {
    if (!pageId) return;
    if (hasEverOpened) return;
    if (!currentChild && !prevChild && !showGoldFrame) return;
    if (frameOpen) return;

    scheduleOpen(openDelayMs);
  }, [
    pageId,
    hasEverOpened,
    currentChild,
    prevChild,
    showGoldFrame,
    frameOpen,
    openDelayMs,
    scheduleOpen,
  ]);

  // 🔸 crossfade logika
  React.useEffect(() => {
    if (currentChild === null && children) {
      setCurrentChild(children);
      return;
    }

    if (children && children !== currentChild) {
      setPrevChild(currentChild);
      setCurrentChild(children);
      setIsCrossfading(true);

      if (typeof window !== "undefined") {
        if (crossfadeTimerRef.current !== null) {
          window.clearTimeout(crossfadeTimerRef.current);
        }

        crossfadeTimerRef.current = window.setTimeout(() => {
          setPrevChild(null);
          setIsCrossfading(false);
          crossfadeTimerRef.current = null;
        }, 500);
      } else {
        setPrevChild(null);
        setIsCrossfading(false);
      }
    }
  }, [children, currentChild]);

  // 🔸 képarány mérés – a látható img alapján
  React.useEffect(() => {
    const root = imageWrapRef.current;
    if (!root) return;

    const visibleSelector = `.${s.imageLayerVisible} img`;
    let img = root.querySelector(visibleSelector) as HTMLImageElement | null;

    if (!img) {
      img = root.querySelector("img") as HTMLImageElement | null;
    }
    if (!img) return;

    const updateAspect = () => {
      if (!img!.naturalWidth || !img!.naturalHeight) return;
      setContentAspect(img!.naturalWidth / img!.naturalHeight);
    };

    if (img.complete && img.naturalWidth && img.naturalHeight) {
      updateAspect();
      return;
    }

    img.addEventListener("load", updateAspect);
    return () => {
      img && img.removeEventListener("load", updateAspect);
    };
  }, [currentChild, isCrossfading]);

  // teljes, folyamatos keret
  function buildRectPath(inset: number = BASE_INSET): string {
    const left = inset;
    const top = inset;
    const right = VIEWBOX_W - inset;
    const bottom = VIEWBOX_H - inset;
    return `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`;
  }

  const path = buildRectPath();

  const slotX = VIEWBOX_W - BASE_INSET - LOGO_MARGIN_RIGHT - LOGO_BOX_W;
  const slotY = VIEWBOX_H - BASE_INSET - LOGO_MARGIN_BOTTOM - LOGO_BOX_H;

  const fillLeft = slotX - PANEL_EXPAND;
  const fillTop =
    VIEWBOX_H -
    BASE_INSET -
    LOGO_MARGIN_BOTTOM -
    LOGO_BOX_H -
    PANEL_RAISE -
    PANEL_EXPAND;
  const fillRight = VIEWBOX_W - BASE_INSET + PANEL_EXPAND;
  const fillBottom = VIEWBOX_H - BASE_INSET + PANEL_EXPAND;

  const logoFillPath = [
    `M ${fillLeft} ${fillTop + RADIUS}`,
    `Q ${fillLeft} ${fillTop} ${fillLeft + RADIUS} ${fillTop}`,
    `H ${fillRight}`,
    `V ${fillBottom}`,
    `H ${fillLeft}`,
    `Z`,
  ].join(" ");

  const frameStyle: CSSProperties = {
    ...style,
    ["--mf-open" as any]: frameOpen ? 1 : 0,
    ["--mf-aspect-ratio" as any]: contentAspect ?? 16 / 9,
  };

  // 🔹 Fallback: ha nincs pageId logika, de már van tartalom / keret, nyissuk ki egyszer
  React.useEffect(() => {
    if (pageId) return;
    if (frameOpen) return;
    if (!(currentChild || prevChild || showGoldFrame)) return;

    setFrameOpen(true);
    setHasEverOpened(true);
  }, [pageId, frameOpen, currentChild, prevChild, showGoldFrame]);

  const shouldRender = Boolean(currentChild || prevChild || showGoldFrame || frameOpen);
  if (!shouldRender) return null;

  return (
    <div
      ref={registerRewardFrame}
      className={`${s.mediaFrame} ${fadeIn ? s.fadeIn : ""}`}
      aria-label="Media frame"
      data-mode={mode}
      style={frameStyle}
    >
      <div className={s.content}>
        {/* BITMAP CROSSFADE RÉTEGEK */}
        <div ref={imageWrapRef} className={s.imageLayerWrap}>
          {prevChild && (
            <div className={`${s.imageLayer} ${s.imageLayerHidden}`} aria-hidden="true">
              {prevChild}
            </div>
          )}

          {currentChild && (
            <div
              className={`${s.imageLayer} ${
                isCrossfading || !prevChild ? s.imageLayerVisible : s.imageLayerHidden
              }`}
            >
              {currentChild}
            </div>
          )}
        </div>

    {/* Dekor keret + logo-bay */}
{showGoldFrame && (
  <div className={s.decorLayer}>
    <svg
      className={s.goldOverlay}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="frameBase"
          x1="0"
          y1="0"
          x2={VIEWBOX_W}
          y2={VIEWBOX_H}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="var(--contract-media-svg-base-1, #6E0F1F)" />
          <stop offset="55%"  stopColor="var(--contract-media-svg-base-2, #3A0A14)" />
          <stop offset="100%" stopColor="var(--contract-media-svg-base-3, #12060A)" />
        </linearGradient>

        <linearGradient
          id="frameAccent"
          x1={VIEWBOX_W}
          y1={VIEWBOX_H}
          x2={VIEWBOX_W * 0.24}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="var(--contract-media-svg-inner-2, #FFD66B)" />
          <stop offset="45%"  stopColor="var(--contract-media-svg-inner-3, #145C4A)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>

        <linearGradient
          id="logoBayFill"
          x1={slotX + LOGO_BOX_W*0.4}
          y1={slotY + LOGO_BOX_H*0.7}
          x2={slotX }
          y2={slotY}
          gradientUnits="userSpaceOnUse"
        >

          <stop offset="0%"   stopColor="var(--contract-media-svg-inner-3, #EFCB6A)" />
          <stop offset="95%"  stopColor="var(--contract-media-svg-base-1, #145C4A)" />
          <stop offset="100%" stopColor="var(--contract-media-svg-base-1, #2A0A12)" />
        </linearGradient>


        <linearGradient
  id="logoBayHighlight"
  x1={slotX + LOGO_BOX_W}
  y1={slotY + LOGO_BOX_H}
  x2={slotX + LOGO_BOX_W * 0.5}
  y2={slotY + LOGO_BOX_H * 0.5}
  gradientUnits="userSpaceOnUse"
>
  <stop offset="0%"   stopColor="var(--contract-media-logo-bay-overlay)" />
  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
</linearGradient>


        <linearGradient
          id="frameOverlay"
          x1="0"
          y1="0"
          x2={VIEWBOX_W}
          y2={VIEWBOX_H}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="var(--contract-media-svg-overlay-top, rgba(255,214,107,0.12))" />
          <stop offset="50%"  stopColor="var(--contract-media-svg-overlay-mid, rgba(0,0,0,0.10))" />
          <stop offset="100%" stopColor="var(--contract-media-svg-overlay-bottom, rgba(31,174,138,0.12))" />
        </linearGradient>

        <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feFlood floodColor="var(--contract-media-shadow-color, rgba(0,0,0,0.35))" />
          <feComposite operator="out" in2="SourceGraphic" in="SourceGraphic" />
          <feGaussianBlur stdDeviation="var(--contract-media-shadow-blur, 4)" />
          <feOffset dx="0" dy="0" />
          <feComposite operator="atop" in2="SourceGraphic" />
        </filter>

        <clipPath id="logoClip">
          <rect x={slotX} y={slotY} width={LOGO_BOX_W} height={LOGO_BOX_H} />
        </clipPath>
      </defs>

      <path d={logoFillPath} fill="var(--contract-media-logo-bay-fill)" opacity={0.96} />
      <path d={logoFillPath} fill="url(#frameOverlay)" opacity={0.22} />
      <linearGradient
  id="logoBayHighlight"
  x1={slotX + LOGO_BOX_W * 0.15}
  y1={slotY + LOGO_BOX_H * 0.85}
  x2={slotX + LOGO_BOX_W * 0.85}
  y2={slotY + LOGO_BOX_H * 0.15}
  gradientUnits="userSpaceOnUse"
>
  {/* szélek: 0 */}
  <stop offset="0%"   stopColor="rgba(255,255,255,0)" />

  {/* közép-sáv: fel → le (keskeny csík) */}
  <stop offset="44%"  stopColor="var(--contract-media-logo-bay-overlay)" />
  <stop offset="50%"  stopColor="var(--contract-media-logo-bay-overlay)" />
  <stop offset="56%"  stopColor="rgba(255,255,255,0)" />

  {/* szélek: 0 */}
  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
</linearGradient>


      <g filter="url(#innerShadow)">
        <path
          d={path}
          fill="none"
          stroke="url(#frameBase)"
          strokeWidth={OUTER_STROKE}
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
        />
      </g>

      <path
        d={path}
        fill="none"
        stroke="url(#frameAccent)"
        strokeWidth={INNER_STROKE}
        strokeLinejoin="round"
        opacity={0.72}
      />

      <path
        d={path}
        fill="none"
        stroke="url(#frameOverlay)"
        strokeWidth={OVERLAY_STROKE}
        strokeLinejoin="round"
        opacity={0.32}
      />

      <g clipPath="url(#logoClip)">
        <image
          href={logoSrc}
          x={slotX + LOGO_PAD_X}
          y={slotY + LOGO_PAD_Y}
          width={LOGO_BOX_W - LOGO_PAD_X * 2}
          height={LOGO_BOX_H - LOGO_PAD_Y * 2}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    </svg>
  </div>
)}

      </div>
    </div>
  );
};

function areEqualMediaFrameProps(prev: MediaFrameProps, next: MediaFrameProps) {
  return (
    prev.pageId === next.pageId &&
    prev.mode === next.mode &&
    prev.fadeIn === next.fadeIn &&
    prev.pageIsFadingOut === next.pageIsFadingOut &&
    prev.showGoldFrame === next.showGoldFrame &&
    prev.logoSrc === next.logoSrc &&
    prev.openDelayMs === next.openDelayMs &&
    prev.suppressFirstAutoOpen === next.suppressFirstAutoOpen &&
    prev.children === next.children &&
    prev.style === next.style
  );
}

export default React.memo(MediaFrame, areEqualMediaFrameProps);

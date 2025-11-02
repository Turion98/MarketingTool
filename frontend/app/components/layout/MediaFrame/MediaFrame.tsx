// app/components/layout/MediaFrame/MediaFrame.tsx
"use client";

import React, { CSSProperties } from "react";
import s from "./MediaFrame.module.scss";

type MediaFrameProps = {
  mode?: "image" | "video";
  fadeIn?: boolean;
  children?: React.ReactNode;
  style?: CSSProperties;
  showGoldFrame?: boolean;
  logoSrc?: string;
};

const VIEWBOX_W = 1600;
const VIEWBOX_H = 900;

/**
 * Helper: CSS változót olvasunk ki (számként).
 * px vagy unit nélküli szám esetén is működik.
 */
function readCssNumber(varName: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue(varName).trim();
  if (!raw) return fallback;
  // lehet "330", "330px", "26", stb.
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
}) => {
  // SVG stroke-ok (skin felülírhatja)
  const OUTER_STROKE = readCssNumber("--mf-svg-outer-stroke", 26);
  const INNER_STROKE = readCssNumber("--mf-svg-inner-stroke", 16);
  const OVERLAY_STROKE = readCssNumber("--mf-svg-overlay-stroke", OUTER_STROKE);

  // stroke felezés + kis ráhagyás
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

  // teljes, folyamatos keret
  function buildRectPath(inset: number = BASE_INSET): string {
    const left = inset;
    const top = inset;
    const right = VIEWBOX_W - inset;
    const bottom = VIEWBOX_H - inset;
    return `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`;
  }

  const path = buildRectPath();

  // jobb alsó sarok slot pozíciója – ez is skinből jövő méretek alapján
  const slotX = VIEWBOX_W - BASE_INSET - LOGO_MARGIN_RIGHT - LOGO_BOX_W;
  const slotY = VIEWBOX_H - BASE_INSET - LOGO_MARGIN_BOTTOM - LOGO_BOX_H;

  // a panel, amit a keret “kitölt” a logó mögött
  const fillLeft = slotX - PANEL_EXPAND;
  const fillTop = VIEWBOX_H - BASE_INSET - LOGO_MARGIN_BOTTOM - LOGO_BOX_H - PANEL_RAISE - PANEL_EXPAND;
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

  return (
    <div
      className={`${s.mediaFrame} ${fadeIn ? s.fadeIn : ""}`}
      aria-label="Media frame"
      data-mode={mode}
      style={style}
    >
      <div className={s.content}>
        {children}

        {showGoldFrame && (
          <div className={s.decorLayer}>
            <svg
              className={s.goldOverlay}
              viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
              aria-hidden="true"
            >
              <defs>
                {/* 1) ALAP: fehér arany */}
                <linearGradient
                  id="platinumBase"
                  x1="0"
                  y1="0"
                  x2={VIEWBOX_W}
                  y2={VIEWBOX_H}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--mf-svg-base-1)" />
                  <stop offset="45%" stopColor="var(--mf-svg-base-2)" />
                  <stop offset="100%" stopColor="var(--mf-svg-base-3)" />
                </linearGradient>

                {/* 2) BELSŐ: fehér arany + zöld */}
                <linearGradient
                  id="platinumGreen"
                  x1="0"
                  y1="0"
                  x2={VIEWBOX_W}
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--mf-svg-inner-1)" />
                  <stop offset="50%" stopColor="var(--mf-svg-inner-2)" />
                  <stop offset="100%" stopColor="var(--mf-svg-inner-3)" />
                </linearGradient>

                {/* 3) OVERLAY: fémes fény */}
                <linearGradient
                  id="metalOverlay"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={VIEWBOX_H}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--mf-svg-overlay-top)" />
                  <stop offset="35%" stopColor="var(--mf-svg-overlay-mid)" />
                  <stop offset="100%" stopColor="var(--mf-svg-overlay-bottom)" />
                </linearGradient>

                {/* BELSŐ ÁRNYÉK FILTER – marad fix, de akár ezt is kivihetjük tokenre */}
                <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feFlood floodColor="rgba(0,0,0,0.45)" />
                  <feComposite operator="out" in2="SourceGraphic" in="SourceGraphic" />
                  <feGaussianBlur stdDeviation="5" />
                  <feOffset dx="0" dy="0" />
                  <feComposite operator="atop" in2="SourceGraphic" />
                </filter>

                <clipPath id="logoClip">
                  <rect x={slotX} y={slotY} width={LOGO_BOX_W} height={LOGO_BOX_H} />
                </clipPath>
              </defs>

              {/* 0) KITÖLTÉS – panel a logó alatt (skinből jövő méret) */}
              <path d={logoFillPath} fill="url(#platinumBase)" />
              <path d={logoFillPath} fill="url(#metalOverlay)" opacity={0.6} />

              {/* 1) KÜLSŐ KERET */}
              <g filter="url(#innerShadow)">
                <path
                  d={path}
                  fill="none"
                  stroke="url(#platinumBase)"
                  strokeWidth={OUTER_STROKE}
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
              </g>

              {/* 2) BELSŐ CSÍK */}
              <path
                d={path}
                fill="none"
                stroke="url(#platinumGreen)"
                strokeWidth={INNER_STROKE}
                strokeLinejoin="round"
                opacity={0.97}
              />

              {/* 3) FÉNY OVERLAY */}
              <path
                d={path}
                fill="none"
                stroke="url(#metalOverlay)"
                strokeWidth={OVERLAY_STROKE}
                strokeLinejoin="round"
                opacity={0.6}
              />

              {/* 4) LOGÓ – klippelve */}
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

export default MediaFrame;

// app/components/layout/ProfileCardFrame/ProfileCardFrame.tsx
"use client";

import React, { CSSProperties } from "react";
import s from "./ProfileCardFrame.module.scss";
import { useGameState } from "../../../lib/GameStateContext";

type ProfileCardFrameProps = {
  children?: React.ReactNode;
  logoSrc?: string;
  pageId?: string;
  pageIsFadingOut?: boolean;
};

// A kártya fizikai mérete a Canvas cellán belül
const CARD_WIDTH = 340;
const CARD_HEIGHT = 440;

// Polaroid-szerű, álló viewBox – ugyanaz az arány (0.8), mint a 400×500
const VIEWBOX_W = 1600;
const VIEWBOX_H = 2000;

/** CSS változó olvasása számmá */
function readCssNumber(varName: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : fallback;
}

/** CSS szín-/string változó olvasása */
function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

const ProfileCardFrame: React.FC<ProfileCardFrameProps> = ({
  children,
  logoSrc,
  pageId,
  pageIsFadingOut = false,
}) => {
  const { registerRewardFrame, currentPageData, setRewardImageReady } =
    useGameState() as any;

  const profile = (currentPageData as any)?.profile || {};
  const name: string | undefined = profile.name ?? profile.title;
  const subtitle: string | undefined =
    profile.subtitle ?? profile.tagline ?? profile.role;
  const extra: string | undefined = profile.extra ?? profile.meta;

  // SVG stroke-ok (ugyanazok a tokenek, mint a MediaFrame-ben)
  const OUTER_STROKE = readCssNumber("--mf-svg-outer-stroke", 26);
  const INNER_STROKE = readCssNumber("--mf-svg-inner-stroke", 16);
  const OVERLAY_STROKE = readCssNumber(
    "--mf-svg-overlay-stroke",
    OUTER_STROKE
  );

  const BASE_INSET = Math.ceil(OUTER_STROKE / 2) + 2;

  // logó méretek – kereten belüli “logo-bay”-hez
  const LOGO_BOX_W = 300; // eddigi 330 helyett
  const LOGO_BOX_H = 320;
  const LOGO_MARGIN_RIGHT = 12;
  const LOGO_MARGIN_BOTTOM = 0;

  const LOGO_PAD_X = 0;
  const LOGO_PAD_Y = -20;


  // alap téglalap koordináták
  const left = BASE_INSET;
  const top = BASE_INSET;
  const right = VIEWBOX_W - BASE_INSET;
  const bottom = VIEWBOX_H - BASE_INSET;

  // 🔹 LOGO-BAY: a keret jobb alsó részén egy "felugró" polc
  const LOGO_STRIP_W = LOGO_BOX_W + 80; // mennyi szélességet kapjon a polc
  const LOGO_STRIP_H = LOGO_BOX_H + 20; // mennyire menjen fel a polc a kártyába
  const LOGO_RISE = LOGO_STRIP_H; // ennyivel megy fel a keret alja ezen a részen

  const logoStripRight = right - LOGO_MARGIN_RIGHT;
  const logoStripLeft = logoStripRight - LOGO_STRIP_W;
  const logoStripBottom = bottom - LOGO_MARGIN_BOTTOM;
  const logoStripTop = logoStripBottom - LOGO_STRIP_H;

// alap középre igazított pozíció
const logoBaseX =
  logoStripLeft + (LOGO_STRIP_W - LOGO_BOX_W) / 2;
const logoBaseY =
  logoStripTop + (LOGO_STRIP_H - LOGO_BOX_H) / 2;

// kézi finomhangoló offset – ezt tudod állítani szemre
const LOGO_TWEAK_X = 12;  // + jobbra, - balra
const LOGO_TWEAK_Y = 0;   // + le, - fel

// végső pozíció
const logoInnerX = logoBaseX + LOGO_TWEAK_X;
const logoInnerY = logoBaseY + LOGO_TWEAK_Y;

  // 🔥 LÉPCSŐZETES keret-path: az alsó él jobb oldalán felugrik (logo-bay polc)
  const framePath = [
    `M ${left} ${top}`, // bal felső
    `H ${right}`, // top jobbig
    `V ${bottom}`, // jobb oldal le
    `H ${logoStripRight}`, // alul vissza a polc jobb széléig
    `V ${bottom - LOGO_RISE}`, // felugrás
    `H ${logoStripLeft}`, // polc teteje balra
    `V ${bottom}`, // vissza az alsó élre
    `H ${left}`, // vissza balra
    `Z`,
  ].join(" ");

  // ➕ extra alsó szakasz, hogy a logó alatt is fusson egy egyenes keret
  const bottomExtraPath = `M ${logoStripLeft} ${bottom} H ${logoStripRight}`;

  const frameStyle: CSSProperties = {
    ["--mf-open" as any]: pageIsFadingOut ? 0 : 1,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  // skin színek az SVG-nek
  const svgColors = {
    base1: getCssVar("--mf-svg-base-1", "#f6f3ee"),
    base2: getCssVar("--mf-svg-base-2", "#ddd2bf"),
    base3: getCssVar("--mf-svg-base-3", "#c0ad8d"),

    inner1: getCssVar("--mf-svg-inner-1", "#f2efe9"),
    inner2: getCssVar("--mf-svg-inner-2", "#8ea98e"),
    inner3: getCssVar("--mf-svg-inner-3", "#d9cba9"),

    overlayTop: getCssVar("--mf-svg-overlay-top", "rgba(255,255,255,0.0)"),
    overlayMid: getCssVar("--mf-svg-overlay-mid", "rgba(255,255,255,0.22)"),
    overlayBottom: getCssVar(
      "--mf-svg-overlay-bottom",
      "rgba(255,255,255,0.0)"
    ),
  };

  // 🔹 amikor a profilkártya DOM-ban van, engedjük a GET exportot
  React.useEffect(() => {
    setRewardImageReady(true);
  }, [setRewardImageReady]);

  return (
    <div
      ref={registerRewardFrame}
      className={s.profileFrame}
      data-page={pageId}
      style={frameStyle}
    >
      <div className={s.cardInner}>
        {/* Dekor keret + logo-bay – TELJES háttérként működik */}
        <div className={s.decorLayer}>
          <svg
            className={s.goldOverlay}
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            aria-hidden="true"
          >
            <defs>
              {/* TELJES HÁTTÉR GRADIENT */}
              <linearGradient
                id="pc_bg"
                x1="0"
                y1="0"
                x2="0"
                y2={VIEWBOX_H}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={svgColors.base1} />
                <stop offset="45%" stopColor={svgColors.base2} />
                <stop offset="100%" stopColor="rgba(10,10,10,0.96)" />
              </linearGradient>

              <linearGradient
                id="pc_base"
                x1="0"
                y1="0"
                x2={VIEWBOX_W}
                y2={VIEWBOX_H}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={svgColors.base1} />
                <stop offset="45%" stopColor={svgColors.base2} />
                <stop offset="100%" stopColor={svgColors.base3} />
              </linearGradient>

              <linearGradient
                id="pc_inner"
                x1="0"
                y1="0"
                x2={VIEWBOX_W}
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={svgColors.inner1} />
                <stop offset="50%" stopColor={svgColors.inner2} />
                <stop offset="100%" stopColor={svgColors.inner3} />
              </linearGradient>

              <linearGradient
                id="pc_overlay"
                x1="0"
                y1="0"
                x2="0"
                y2={VIEWBOX_H}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={svgColors.overlayTop} />
                <stop offset="35%" stopColor={svgColors.overlayMid} />
                <stop offset="100%" stopColor={svgColors.overlayBottom} />
              </linearGradient>

              {/* LOGO-BAY – ide clippingelünk logót */}
              <clipPath id="pc_logoClip">
                <rect
                  x={logoInnerX}
                  y={logoInnerY}
                  width={LOGO_BOX_W}
                  height={LOGO_BOX_H}
                  rx={LOGO_BOX_H * 0.2}
                  ry={LOGO_BOX_H * 0.2}
                />
              </clipPath>
            </defs>

            {/* 🔥 TELJES KÁRTYA HÁTTÉR – a polc “belül” kap sötét fillt */}
            <path d={framePath} fill="url(#pc_bg)" />

            {/* teljes keret strokes – LÉPCSŐZETES PATH-ra */}
            <path
              d={framePath}
              fill="none"
              stroke="url(#pc_base)"
              strokeWidth={OUTER_STROKE}
              strokeLinejoin="round"
            />
            <path
              d={framePath}
              fill="none"
              stroke="url(#pc_inner)"
              strokeWidth={INNER_STROKE}
              strokeLinejoin="round"
              opacity={0.97}
            />
            <path
              d={framePath}
              fill="none"
              stroke="url(#pc_overlay)"
              strokeWidth={OVERLAY_STROKE}
              strokeLinejoin="round"
              opacity={0.6}
            />

            {/* ➕ EXTRA: egyenes alsó szakasz, hogy a logó alatt is fusson a keret */}
            <path
              d={bottomExtraPath}
              fill="none"
              stroke="url(#pc_base)"
              strokeWidth={OUTER_STROKE}
            />
            <path
              d={bottomExtraPath}
              fill="none"
              stroke="url(#pc_inner)"
              strokeWidth={INNER_STROKE}
              opacity={0.97}
            />
            <path
              d={bottomExtraPath}
              fill="none"
              stroke="url(#pc_overlay)"
              strokeWidth={OVERLAY_STROKE}
              opacity={0.6}
            />

            {/* LOGO-BAY háttere – ugyanaz a gradient, mint a fő kereten,
                pontosan a lépcső tetejétől, a felugrás teljes magasságában */}
            <rect
              x={logoStripLeft}
              y={bottom - LOGO_RISE}
              width={LOGO_STRIP_W}
              height={LOGO_RISE}
              rx={12}
              ry={12}
              fill="url(#pc_bg)"
            />

            {/* logó a logo-bay-en belül */}
            {logoSrc && (
              <g clipPath="url(#pc_logoClip)">
                <image
                  href={logoSrc}
                  x={logoInnerX + LOGO_PAD_X}
                  y={logoInnerY + LOGO_PAD_Y}
                  width={LOGO_BOX_W - LOGO_PAD_X * 2}
                  height={LOGO_BOX_H - LOGO_PAD_Y * 2}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            )}
          </svg>
        </div>

        {/* Tartalom a keret alatt */}
        <div className={s.content}>
          {/* TOP: 1:1 kép slot */}
          <div className={s.imageSlot}>
            <div className={s.imageInner}>{children}</div>
          </div>

          {/* BOTTOM: bal oldalon szöveg */}
          <div className={s.bottomRow}>
            <div className={s.infoSlot}>
              {name && <div className={s.profileName}>{name}</div>}
              {subtitle && (
                <div className={s.profileSubtitle}>{subtitle}</div>
              )}
              {extra && <div className={s.profileMeta}>{extra}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCardFrame;

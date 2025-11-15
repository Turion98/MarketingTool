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

// Polaroid-szerű, kicsit álló formátum
const VIEWBOX_W = 1600;
const VIEWBOX_H = 2000;

function readCssNumber(name: string, fb: number) {
  if (typeof window === "undefined") return fb;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const num = parseFloat(v);
  return Number.isFinite(num) ? num : fb;
}

function getCssVar(name: string, fb: string) {
  if (typeof window === "undefined") return fb;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fb;
}

const ProfileCardFrame: React.FC<ProfileCardFrameProps> = ({
  children,
  logoSrc,
  pageId,
  pageIsFadingOut = false,
}) => {
  const { registerRewardFrame, currentPageData } = useGameState() as any;

  const profile = (currentPageData as any)?.profile || {};
  const name: string | undefined = profile.name ?? profile.title;
  const subtitle: string | undefined =
    profile.subtitle ?? profile.tagline ?? profile.role;
  const extra: string | undefined = profile.extra ?? profile.meta;

  // keret vastagság – ugyanazok a tokenek, mint a MediaFrame-ben
  const OUTER_STROKE = readCssNumber("--mf-svg-outer-stroke", 26);
  const INNER_STROKE = readCssNumber("--mf-svg-inner-stroke", 16);
  const OVERLAY_STROKE = readCssNumber(
    "--mf-svg-overlay-stroke",
    OUTER_STROKE
  );

  // stroke felezés + kis ráhagyás
  const BASE_INSET = Math.ceil(OUTER_STROKE / 2) + 2;

  // polaroid: alsó extra "perem" magasság (kártya alja vastagabb)
  const BOTTOM_EXTRA = readCssNumber("--mf-polaroid-bottom-extra", 260);

  // logó méret és hely – továbbra is skin tokenek
  const LOGO_BOX_W = readCssNumber("--mf-logo-box-w", 260);
  const LOGO_BOX_H = readCssNumber("--mf-logo-box-h", 140);
  const LOGO_MARGIN_RIGHT = readCssNumber("--mf-logo-margin-right", 32);

  // logó belső padding % → px
  const LOGO_PAD_X_PCT = readCssNumber("--mf-logo-pad-x", 8);
  const LOGO_PAD_Y_PCT = readCssNumber("--mf-logo-pad-y", 8);

  const LOGO_PAD_X = (LOGO_BOX_W * LOGO_PAD_X_PCT) / 100;
  const LOGO_PAD_Y = (LOGO_BOX_H * LOGO_PAD_Y_PCT) / 100;

  // teljes kártya keret path
  function buildRectPath(inset: number = BASE_INSET): string {
    const left = inset;
    const top = inset;
    const right = VIEWBOX_W - inset;
    const bottom = VIEWBOX_H - inset;
    return `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`;
  }

  const path = buildRectPath();

  // polaroid alsó sáv (ahol a "nyomtatott" infó lenne)
  const cardBottom = VIEWBOX_H - BASE_INSET;
  const bottomBarTop = cardBottom - BOTTOM_EXTRA;

  // ez a sáv tölti ki a teljes lap alját – ettől néz ki polaroidnak
  const bottomBandPath = [
    `M ${BASE_INSET} ${bottomBarTop}`,
    `H ${VIEWBOX_W - BASE_INSET}`,
    `V ${cardBottom}`,
    `H ${BASE_INSET}`,
    `Z`,
  ].join(" ");

  // logó: a polaroid alsó sávjában, jobb alsó sarokban
  const slotX =
    VIEWBOX_W - BASE_INSET - LOGO_MARGIN_RIGHT - LOGO_BOX_W;
  const slotY =
    bottomBarTop + (BOTTOM_EXTRA - LOGO_BOX_H) / 2;

  const frameStyle: CSSProperties = {
    ["--mf-open" as any]: pageIsFadingOut ? 0 : 1,
  };

  // skin színek → konkrét RGBA string az SVG-nek
  const svgColors = {
    base1: getCssVar("--mf-svg-base-1", "#f6f3ee"),
    base2: getCssVar("--mf-svg-base-2", "#ddd2bf"),
    base3: getCssVar("--mf-svg-base-3", "#c0ad8d"),
    inner1: getCssVar("--mf-svg-inner-1", "#f2efe9"),
    inner2: getCssVar("--mf-svg-inner-2", "#8ea98e"),
    inner3: getCssVar("--mf-svg-inner-3", "#d9cba9"),
    overlayTop: getCssVar(
      "--mf-svg-overlay-top",
      "rgba(255,255,255,0.0)"
    ),
    overlayMid: getCssVar(
      "--mf-svg-overlay-mid",
      "rgba(255,255,255,0.22)"
    ),
    overlayBottom: getCssVar(
      "--mf-svg-overlay-bottom",
      "rgba(255,255,255,0.0)"
    ),
  };

  return (
    <div
      ref={registerRewardFrame}
      className={s.profileFrame}
      data-page={pageId}
      style={frameStyle}
    >
      <div className={s.cardInner}>
        {/* SVG: polaroid keret + logó a jobb alsó sarokban */}
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          aria-hidden="true"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          <defs>
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

            <clipPath id="pc_logoClip">
              <rect
                x={slotX}
                y={slotY}
                width={LOGO_BOX_W}
                height={LOGO_BOX_H}
                rx={LOGO_BOX_H * 0.25}
                ry={LOGO_BOX_H * 0.25}
              />
            </clipPath>
          </defs>

          {/* Alsó polaroid sáv – "nyomtatott" rész */}
          <path d={bottomBandPath} fill="url(#pc_base)" />
          <path
            d={bottomBandPath}
            fill="url(#pc_overlay)"
            opacity={0.5}
          />

          {/* Külső keret */}
          <path
            d={path}
            fill="none"
            stroke="url(#pc_base)"
            strokeWidth={OUTER_STROKE}
            strokeLinejoin="round"
          />

          {/* Belső csík */}
          <path
            d={path}
            fill="none"
            stroke="url(#pc_inner)"
            strokeWidth={INNER_STROKE}
            strokeLinejoin="round"
            opacity={0.97}
          />

          {/* Fény overlay */}
          <path
            d={path}
            fill="none"
            stroke="url(#pc_overlay)"
            strokeWidth={OVERLAY_STROKE}
            strokeLinejoin="round"
            opacity={0.6}
          />

          {/* Logó: jobb alsó sarok, a polaroid sávban */}
          {logoSrc && (
            <g clipPath="url(#pc_logoClip)">
              <image
                href={logoSrc}
                x={slotX + LOGO_PAD_X}
                y={slotY + LOGO_PAD_Y}
                width={LOGO_BOX_W - LOGO_PAD_X * 2}
                height={LOGO_BOX_H - LOGO_PAD_Y * 2}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          )}
        </svg>

        {/* 1:1-es fotó a keretben – a háttérben fut, az SVG csak rákerül */}
        <div className={s.imageSlot}>
          <div className={s.imageInner}>{children}</div>
        </div>
      </div>

      {/* Alsó szöveges infó – a polaroid alján "felirat" érzés */}
      <div className={s.infoSlot}>
        {name && <div className={s.profileName}>{name}</div>}
        {subtitle && <div className={s.profileSubtitle}>{subtitle}</div>}
        {extra && <div className={s.profileMeta}>{extra}</div>}
      </div>
    </div>
  );
};

export default ProfileCardFrame;

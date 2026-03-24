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

const CARD_WIDTH = 340;
const CARD_HEIGHT = 440;

const VIEWBOX_W = 1600;
const VIEWBOX_H = 2000;

function readCssNumber(varName: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : fallback;
}

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
    useGameState();

  const [opened, setOpened] = React.useState(false);
  const [openAnimDone, setOpenAnimDone] = React.useState(false);
  const [nameReady, setNameReady] = React.useState(false);
  const [subtitleReady, setSubtitleReady] = React.useState(false);
  const cardInnerRef = React.useRef<HTMLDivElement | null>(null);

  // Kártya nyitása/zárása
  React.useEffect(() => {
    if (pageIsFadingOut) {
      setOpened(false);
      setOpenAnimDone(false);
      setNameReady(false);
      setSubtitleReady(false);
      return;
    }

    setOpened(false);
    setOpenAnimDone(false);
    setNameReady(false);
    setSubtitleReady(false);

    const t = setTimeout(() => {
      setOpened(true);
    }, 50);

    return () => clearTimeout(t);
  }, [pageIsFadingOut]);

  // Nyitó animáció vége: csak ezután engedjük a "Get" exportot
  React.useEffect(() => {
    const el = cardInnerRef.current;
    if (!el) return;

    if (!opened) {
      setOpenAnimDone(false);
      return;
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      setOpenAnimDone(true);
    };
    el.addEventListener("transitionend", onEnd);

    // Fallback: ha nincs transitionend (pl. reduced motion), egy kis késleltetéssel kész
    // (CSS: transition-delay ~1000ms + duration ~2000ms → ~3000ms)
    const tid = window.setTimeout(() => setOpenAnimDone(true), 3300);

    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(tid);
    };
  }, [opened]);

  // Szöveg lépcsőzetes animáció
  React.useEffect(() => {
    if (!opened) {
      setNameReady(false);
      setSubtitleReady(false);
      return;
    }

    // 3s múlva jöjjön a name
    const nameTimer = setTimeout(() => {
      setNameReady(true);
    }, 3000);

    // 3s + 350ms múlva a subtitle + extra
    const subtitleTimer = setTimeout(() => {
      setSubtitleReady(true);
    }, 3350);

    return () => {
      clearTimeout(nameTimer);
      clearTimeout(subtitleTimer);
    };
  }, [opened]);

  const profile = currentPageData?.profile || {};
  const name: string | undefined = profile.name ?? profile.title;
  const subtitle: string | undefined =
    profile.subtitle ?? profile.tagline ?? profile.role;
  const extra: string | undefined = profile.extra ?? profile.meta;

  const OUTER_STROKE = readCssNumber("--mf-svg-outer-stroke", 26);
  const INNER_STROKE = readCssNumber("--mf-svg-inner-stroke", 16);
  const OVERLAY_STROKE = readCssNumber(
    "--mf-svg-overlay-stroke",
    OUTER_STROKE
  );

  const BASE_INSET = Math.ceil(OUTER_STROKE / 2) + 2;

  const LOGO_BOX_W = 300;
  const LOGO_BOX_H = 320;
  const LOGO_MARGIN_RIGHT = 12;
  const LOGO_MARGIN_BOTTOM = 0;

  const LOGO_PAD_X = 0;
  const LOGO_PAD_Y = -20;

  const left = BASE_INSET;
  const top = BASE_INSET;
  const right = VIEWBOX_W - BASE_INSET;
  const bottom = VIEWBOX_H - BASE_INSET;

  const LOGO_STRIP_W = LOGO_BOX_W + 80;
  const LOGO_STRIP_H = LOGO_BOX_H + 20;
  const LOGO_RISE = LOGO_STRIP_H;

  const logoStripRight = right - LOGO_MARGIN_RIGHT;
  const logoStripLeft = logoStripRight - LOGO_STRIP_W;
  const logoStripBottom = bottom - LOGO_MARGIN_BOTTOM;
  const logoStripTop = logoStripBottom - LOGO_STRIP_H;

  const logoBaseX = logoStripLeft + (LOGO_STRIP_W - LOGO_BOX_W) / 2;
  const logoBaseY = logoStripTop + (LOGO_STRIP_H - LOGO_BOX_H) / 2;

  const LOGO_TWEAK_X = 12;
  const LOGO_TWEAK_Y = 0;

  const logoInnerX = logoBaseX + LOGO_TWEAK_X;
  const logoInnerY = logoBaseY + LOGO_TWEAK_Y;

  const framePath = [
    `M ${left} ${top}`,
    `H ${right}`,
    `V ${bottom}`,
    `H ${logoStripRight}`,
    `V ${bottom - LOGO_RISE}`,
    `H ${logoStripLeft}`,
    `V ${bottom}`,
    `H ${left}`,
    `Z`,
  ].join(" ");

  const bottomExtraPath = `M ${logoStripLeft} ${bottom} H ${logoStripRight}`;

  const frameStyle: CSSProperties = {
    ["--mf-open" as any]: opened ? 1 : 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  const svgColors = {
    base1: getCssVar("--mf-svg-base-1", "#f6f3ee"),
    base2: getCssVar("--mf-svg-base-2", "#ddd2bf"),
    base3: getCssVar("--mf-svg-base-3", "#c0ad8d"),

    inner1: getCssVar("--mf-svg-inner-1", "#f2efe9"),
    inner2: getCssVar("--mf-svg-inner-2", "#8ea98e"),
    inner3: getCssVar("--mf-svg-inner-3", "#d9cba9"),

    overlayTop: getCssVar("--mf-svg-overlay-top", "rgba(255,255,255,0.0)"),
    overlayMid: getCssVar("--mf-svg-overlay-mid", "rgba(255,255,255,0.12)"),
    overlayBottom: getCssVar("--mf-svg-overlay-bottom", "rgba(255,255,255,0.0)"),
  };

  React.useEffect(() => {
    // fontos: a profilkártyán a belső konténer scaleY(0)-ról nyílik,
    // ezért az export csak akkor legyen aktív, ha a nyitó animáció lefutott.
    setRewardImageReady(!!opened && !!openAnimDone && !pageIsFadingOut);
  }, [opened, openAnimDone, pageIsFadingOut, setRewardImageReady]);

  return (
    <div
      ref={registerRewardFrame}
      className={s.profileFrame}
      data-page={pageId}
      style={frameStyle}
    >
      <div
        ref={cardInnerRef}
        className={`${s.cardInner} ${
          opened ? s.cardInnerOpen : s.cardInnerClosed
        }`}
      >
        {/* Dekor keret + logo-bay */}
        <div className={s.decorLayer}>
          <svg
            className={s.goldOverlay}
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            aria-hidden="true"
          >
            <defs>
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
                <stop
  offset="100%"
  stopColor="var(--pf-svg-bg-bottom, rgba(10, 10, 10, 0.96))"
/>
              </linearGradient>
              <linearGradient
                id="pc_base"
                x1="0"
                y1="0"
                x2={VIEWBOX_W}
                y2={VIEWBOX_H}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%"   stopColor="var(--pf-svg-base-1, var(--mf-svg-base-1, #f6f3ee))" />
<stop offset="45%"  stopColor="var(--pf-svg-base-2, var(--mf-svg-base-2, #ddd2bf))" />
<stop offset="100%" stopColor="var(--pf-svg-base-3, var(--mf-svg-base-3, #c0ad8d))" />

              </linearGradient>
              <linearGradient
                id="pc_inner"
                x1="0"
                y1="0"
                x2={VIEWBOX_W}
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%"   stopColor="var(--pf-svg-inner-1, var(--mf-svg-inner-1, #f2efe9))" />
<stop offset="50%"  stopColor="var(--pf-svg-inner-2, var(--mf-svg-inner-2, #8ea98e))" />
<stop offset="100%" stopColor="var(--pf-svg-inner-3, var(--mf-svg-inner-3, #d9cba9))" />

              </linearGradient>
              <linearGradient
                id="pc_overlay"
                x1="0"
                y1="0"
                x2="0"
                y2={VIEWBOX_H}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%"   stopColor="var(--pf-svg-overlay-top, var(--mf-svg-overlay-top, rgba(255,255,255,0)))" />
<stop offset="35%"  stopColor="var(--pf-svg-overlay-mid, var(--mf-svg-overlay-mid, rgba(255,255,255,0.22)))" />
<stop offset="100%" stopColor="var(--pf-svg-overlay-bottom, var(--mf-svg-overlay-bottom, rgba(255,255,255,0)))" />

              </linearGradient>

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

            <path d={framePath} fill="url(#pc_bg)" />

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
              opacity={0.67}
            />
            <path
              d={framePath}
              fill="none"
              stroke="url(#pc_overlay)"
              strokeWidth={OVERLAY_STROKE}
              strokeLinejoin="round"
              opacity={0.7}
            />

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
              opacity={0.67}
            />
            <path
              d={bottomExtraPath}
              fill="none"
              stroke="url(#pc_overlay)"
              strokeWidth={OVERLAY_STROKE}
              opacity={0.6}
            />

            <rect
              x={logoStripLeft}
              y={bottom - LOGO_RISE}
              width={LOGO_STRIP_W}
              height={LOGO_RISE}
              rx={12}
              ry={12}
              fill="url(#pc_bg)"
            />

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

        {/* Tartalom */}
        <div className={s.content}>
          <div className={s.imageSlot}>
            <div className={s.imageInner}>{children}</div>
          </div>

          <div className={s.bottomRow}>
            <div className={s.infoSlot}>
              {name && (
                <div
                  className={`${s.profileName} ${
                    nameReady ? s.nameReady : ""
                  }`}
                >
                  {name}
                </div>
              )}

              {subtitle && (
                <div
                  className={`${s.profileSubtitle} ${
                    subtitleReady ? s.subtitleReady : ""
                  }`}
                >
                  {subtitle}
                </div>
              )}

              {extra && (
                <div
                  className={`${s.profileMeta} ${
                    subtitleReady ? s.subtitleReady : ""
                  }`}
                >
                  {extra}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCardFrame;

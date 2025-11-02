// app/components/layout/MediaFrame/MediaFrame.tsx
"use client";

import React, {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  CSSProperties,
} from "react";
import s from "./MediaFrame.module.scss";

type MediaFrameProps = {
  mode?: "image" | "video";
  fadeIn?: boolean;
  children?: React.ReactNode;
  style?: CSSProperties;
  showGoldFrame?: boolean;
};

// stroke beállítások EGY helyen
const OUTER_STROKE = 26; // vastag alap
const INNER_STROKE = 16; // belső
const OVERLAY_STROKE = OUTER_STROKE;

const VIEWBOX_W = 1600;
const VIEWBOX_H = 900;

// hogy ne vágja le a stroke fele
const BASE_INSET = Math.ceil(OUTER_STROKE / 2) + 2; // 26/2=13 → +2 = 15

function buildPathFromRects(
  frame: DOMRect,
  logo: DOMRect | null,
  inset: number = BASE_INSET
): string {
  if (!frame) {
    return `M ${inset} ${inset} H ${VIEWBOX_W - inset} V ${
      VIEWBOX_H - inset
    } H ${inset} Z`;
  }

  const left = inset;
  const top = inset;
  const right = VIEWBOX_W - inset;
  const bottom = VIEWBOX_H - inset;

  const scaleX = VIEWBOX_W / frame.width;
  const scaleY = VIEWBOX_H / frame.height;

  if (!logo) {
    return `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`;
  }

  const logoLeftDom = logo.left - frame.left;
  const logoTopDom = logo.top - frame.top;
  const logoRightDom = logoLeftDom + logo.width;
  const logoBottomDom = logoTopDom + logo.height;

  const logoLeft = logoLeftDom * scaleX;
  const logoTop = logoTopDom * scaleY;
  const logoRight = logoRightDom * scaleX;
  const logoBottom = logoBottomDom * scaleY;

  const gap = inset;
  const logoTopAdj = Math.min(logoTop - gap, bottom);
  const logoLeftAdj = Math.max(logoLeft - gap, left);
  const logoRightAdj = Math.min(logoRight + gap, right);
  const logoBottomAdj = Math.min(logoBottom + gap, bottom);

  return [
    `M ${left} ${top}`,
    `H ${right}`,
    `V ${logoTopAdj}`,
    `H ${logoRightAdj}`,
    `V ${logoBottomAdj}`,
    `H ${logoLeftAdj}`,
    `V ${bottom}`,
    `H ${left}`,
    `V ${top}`,
    "Z",
  ].join(" ");
}

const MediaFrame: React.FC<MediaFrameProps> = ({
  mode = "image",
  fadeIn = false,
  children,
  style,
  showGoldFrame = true,
}) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);
  const [path, setPath] = useState<string>("");

  const recalc = useCallback(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const frameRect = contentEl.getBoundingClientRect();
    const logoEl = logoRef.current;
    const logoRect = logoEl ? logoEl.getBoundingClientRect() : null;
    setPath(buildPathFromRects(frameRect, logoRect));
  }, []);

  useLayoutEffect(() => {
    recalc();
    const onResize = () => recalc();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recalc]);

  return (
    <div
      className={`${s.mediaFrame} ${fadeIn ? s.fadeIn : ""}`}
      aria-label="Media frame"
      data-mode={mode}
      style={style}
    >
      <div ref={contentRef} className={s.content}>
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
                <linearGradient id="platinumBase" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0603ee" />
                  <stop offset="45%" stopColor="#ddd2bf" />
                  <stop offset="100%" stopColor="#c0ad8d" />
                </linearGradient>

                {/* 2) BELSŐ: fehér arany + zöld */}
                <linearGradient id="platinumGreen" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f2efe9" />
                  <stop offset="50%" stopColor="#8ea98e" />
                  <stop offset="100%" stopColor="#d9cba9" />
                </linearGradient>

                {/* 3) OVERLAY: fémes fény */}
                <linearGradient id="metalOverlay" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="35%" stopColor="rgba(255,255,255,0.08)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
                </linearGradient>
              </defs>

              {path && (
                <>
                  {/* 1. RÉTEG – VASTAG ALAP */}
                  <path
                    d={path}
                    fill="none"
                    stroke="url(#platinumBase)"
                    strokeWidth={OUTER_STROKE}
                    strokeLinejoin="round"
                    shapeRendering="geometricPrecision"
                  />

                  {/* 2. RÉTEG – KÖZÉPEN ülő BELSŐ */}
                  <path
                    d={path}
                    fill="none"
                    stroke="url(#platinumGreen)"
                    strokeWidth={INNER_STROKE}
                    strokeLinejoin="round"
                    opacity={0.95}
                  />

                  {/* 3. RÉTEG – OVERLAY ugyanazon a vastagságon */}
                  <path
                    d={path}
                    fill="none"
                    stroke="url(#metalOverlay)"
                    strokeWidth={OVERLAY_STROKE}
                    strokeLinejoin="round"
                    opacity={0.6}
                  />
                </>
              )}
            </svg>

            {/* LOGO SLOT */}
            <div
              ref={logoRef}
              className={s.logoSlot}
              style={{
                right: "4px",
                bottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.12)",
                border: "2px solid rgba(230,224,210,0.6)",
                borderRadius: "6px",
              }}
            >
              <img
                src="assets/my_logo.png"
                alt="Logo"
                data-logo
                style={{
                  maxWidth: "70%",
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 0 3px rgba(0,0,0,0.4))",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaFrame;

"use client";

import React from "react";
import s from "../LandingPage.module.scss";

type Lang = "hu" | "en";

const stepsByLang: Record<
  Lang,
  { id: number; line1: string; line2: string }[]
> = {
  hu: [
    { id: 1, line1: "Kapcsolatfelvétel", line2: "& igény" },
    { id: 2, line1: "Árajánlat", line2: "& szerződés" },
    { id: 3, line1: "Kickoff", line2: "meeting" },
    { id: 4, line1: "Szöveg + demo", line2: "(1 hét)" },
    { id: 5, line1: "Módosítási körök", line2: "(1–2 hét)" },
    { id: 6, line1: "AI-vizuálok", line2: "(1 hét)" },
    { id: 7, line1: "Kész link", line2: "átadása" },
  ],
  en: [
    { id: 1, line1: "Intro call", line2: "& brief" },
    { id: 2, line1: "Proposal", line2: "& contract" },
    { id: 3, line1: "Kickoff", line2: "meeting" },
    { id: 4, line1: "Copy + demo", line2: "(~1 week)" },
    { id: 5, line1: "Review", line2: "& iterations (1–2 weeks)" },
    { id: 6, line1: "AI visuals", line2: "(~1 week)" },
    { id: 7, line1: "Final link", line2: "handover" },
  ],
};

// Pontokat az ívre pozicionáljuk
const getEllipsePoint = (t: number) => {
  const cx = 50;
  const cy = 36;
  const rx = 50;
  const ry = 27;

  const angle = Math.PI - t * Math.PI;
  const x = cx + rx * Math.cos(angle);
  const y = cy - ry * Math.sin(angle);

  return { x, y };
};

type CollabDiagramProps = {
  lang: Lang;
};

export const CollabDiagram: React.FC<CollabDiagramProps> = ({ lang }) => {
  const steps = stepsByLang[lang];

  return (
    <div className={s.collabDiagram}>
      <svg
        className={s.collabSvg}
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
      >

        {/* ========= LOGÓ A KÖZÉPEN ========= */}
        {/* A viewBox közepéhez igazítva: (50, 18 környéke) */}
        <image
          href="/assets/my_logo.png"
          x="35"
          y="20"
          width="30"
          height="30"
          opacity="0.9"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* ========= ÍV ========= */}
        <path
          d="M 0 36 A 48 26 0 0 1 100 36"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />

        {/* ========= NODE-OK + LABEL ========= */}
        {steps.map((step, i) => {
          const t = i / (steps.length - 1);
          const { x, y } = getEllipsePoint(t);

          const isFirst = i === 0;
          const isLast = i === steps.length - 1;
          const isLeftSide = i === 1;
          const isRightSide = i === steps.length - 2;

          let labelY = -6.5;
          let labelX = 0;

          if (isFirst || isLast) {
            labelY = 8;
          } else if (isLeftSide) {
            labelY = -7.5;
            labelX = -6;
          } else if (isRightSide) {
            labelY = -7.5;
            labelX = 5;
          }

          return (
            <g key={step.id} transform={`translate(${x} ${y})`}>
              <circle className={s.collabDot} r={1.8} />

              <text className={s.collabLabel} y={labelY}>
                <tspan x={labelX}>{step.line1}</tspan>
                <tspan x={labelX} dy="3.3">
                  {step.line2}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

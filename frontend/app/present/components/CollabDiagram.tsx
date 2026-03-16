"use client";

import React, { useState, useEffect, useRef } from "react";
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

const DURATION = {
  intro: 600,
  show: 450,
  hold: 1700,
  hide: 350,
  move: 2800,
  outro: 500,
};

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type Phase = "intro" | "show" | "hold" | "hide" | "move" | "outro";

type CollabDiagramProps = { lang: Lang };

export const CollabDiagram: React.FC<CollabDiagramProps> = ({ lang }) => {
  const steps = stepsByLang[lang];
  const n = steps.length;
  const getT = (i: number) => i / (n - 1);

  const [phase, setPhase] = useState<Phase>("intro");
  const [stationIndex, setStationIndex] = useState(0);
  const [orbT, setOrbT] = useState(0);
  const [visibleLabelIndex, setVisibleLabelIndex] = useState<number | null>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const orbRef = useRef<SVGCircleElement | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  useEffect(() => {
    if (phase === "intro") {
      setVisibleLabelIndex(0);
      setOrbT(0);
      timerRef.current = setTimeout(() => {
        setPhase("hold");
      }, DURATION.intro);
      return clearTimer;
    }

    if (phase === "show") {
      setVisibleLabelIndex(stationIndex);
      timerRef.current = setTimeout(() => {
        setPhase("hold");
      }, DURATION.show);
      return clearTimer;
    }

    if (phase === "hold") {
      timerRef.current = setTimeout(() => {
        setPhase("hide");
      }, DURATION.hold);
      return clearTimer;
    }

    if (phase === "hide") {
      timerRef.current = setTimeout(() => {
        setVisibleLabelIndex(null);
        if (stationIndex >= n - 1) {
          setPhase("outro");
        } else {
          setPhase("move");
          moveStartRef.current = performance.now();
        }
      }, DURATION.hide);
      return clearTimer;
    }

    if (phase === "outro") {
      setOrbT(1);
      timerRef.current = setTimeout(() => {
        setStationIndex(0);
        setPhase("intro");
      }, DURATION.outro);
      return clearTimer;
    }

    if (phase === "move") {
      const startT = getT(stationIndex);
      const endT = getT(stationIndex + 1);
      moveStartRef.current = performance.now();

      const tick = (now: number) => {
        const elapsed = now - moveStartRef.current;
        const rawProgress = Math.min(elapsed / DURATION.move, 1);
        const progress = easeInOutCubic(rawProgress);
        const interpolatedT = startT + progress * (endT - startT);
        const pos = getEllipsePoint(interpolatedT);
        if (orbRef.current) {
          orbRef.current.setAttribute("cx", String(pos.x));
          orbRef.current.setAttribute("cy", String(pos.y));
        }
        if (rawProgress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setOrbT(endT);
          setStationIndex((prev) => prev + 1);
          setPhase("show");
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }
  }, [phase, stationIndex, n]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const orbPos = getEllipsePoint(orbT);

  return (
    <div className={s.collabDiagram}>
      <svg
        className={s.collabSvg}
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="collabOrbGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <image
          href="/assets/my_logo.png"
          x="35"
          y="20"
          width="30"
          height="30"
          opacity="0.9"
          preserveAspectRatio="xMidYMid meet"
        />

        <path
          d="M 0 36 A 48 26 0 0 1 100 36"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />

        {/* Állomás pontok – kisebb, stílusos */}
        {steps.map((step, i) => {
          const t = getT(i);
          const { x, y } = getEllipsePoint(t);
          const isFirst = i === 0;
          const isLast = i === n - 1;
          const isLeftSide = i === 1;
          const isRightSide = i === n - 2;
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
          const isActive = visibleLabelIndex === i;

          return (
            <g key={step.id} transform={`translate(${x} ${y})`}>
              <circle className={s.collabDot} r={1} />
              <text
                className={s.collabLabel}
                y={labelY}
                style={{ opacity: isActive ? 1 : 0.38 }}
              >
                <tspan x={labelX}>{step.line1}</tspan>
                <tspan x={labelX} dy="3.3">
                  {step.line2}
                </tspan>
              </text>
            </g>
          );
        })}

        {/* Mozgó fénygömb – ref-fel frissítve mozgás közben (smooth, nincs re-render) */}
        <circle
          ref={orbRef}
          className={s.collabOrb}
          cx={orbPos.x}
          cy={orbPos.y}
          r={1.4}
        />
      </svg>
    </div>
  );
};

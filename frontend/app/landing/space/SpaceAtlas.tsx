"use client";

import React from "react";
import s from "./SpaceAtlas.module.scss";

type SectionId =
  | "platform"
  | "examples"
  | "principles"
  | "collab"
  | "audience"
  | "tech"
  | "finalCta";

type PlanetConfig = {
  id: string;
  label: string;
  sectionId: SectionId;
  orbit: number;
  angleDeg: number;
  radius: number;
  depth: number;
};

type SystemConfig = {
  id: SectionId;
  label: string;
  cx: number;
  cy: number;
  starRadius: number;
  tint: string;
  planets: PlanetConfig[];
};

const SYSTEMS: SystemConfig[] = [
  {
    id: "platform",
    label: "Platform",
    cx: 190,
    cy: 180,
    starRadius: 18,
    tint: "#00e5ff",
    planets: [
      { id: "platform-core", label: "Core", sectionId: "platform", orbit: 56, angleDeg: 14, radius: 7, depth: 0.8 },
      { id: "platform-forms", label: "Formátumok", sectionId: "platform", orbit: 86, angleDeg: 132, radius: 6, depth: 0.6 },
      { id: "platform-data", label: "Mérés", sectionId: "platform", orbit: 110, angleDeg: 250, radius: 5, depth: 0.5 },
    ],
  },
  {
    id: "examples",
    label: "Példák",
    cx: 420,
    cy: 120,
    starRadius: 15,
    tint: "#7cffb2",
    planets: [
      { id: "examples-launch", label: "Launch", sectionId: "examples", orbit: 52, angleDeg: -18, radius: 7, depth: 0.85 },
      { id: "examples-insight", label: "Insight", sectionId: "examples", orbit: 82, angleDeg: 90, radius: 6, depth: 0.7 },
      { id: "examples-onboard", label: "Edukáció", sectionId: "examples", orbit: 108, angleDeg: 205, radius: 6, depth: 0.6 },
    ],
  },
  {
    id: "principles",
    label: "Elvek",
    cx: 600,
    cy: 220,
    starRadius: 16,
    tint: "#b46cff",
    planets: [
      { id: "principles-structure", label: "Struktúra", sectionId: "principles", orbit: 58, angleDeg: 38, radius: 7, depth: 0.8 },
      { id: "principles-logic", label: "Logika", sectionId: "principles", orbit: 88, angleDeg: 150, radius: 6, depth: 0.65 },
      { id: "principles-visual", label: "Vizuál", sectionId: "principles", orbit: 114, angleDeg: 262, radius: 6, depth: 0.55 },
    ],
  },
  {
    id: "collab",
    label: "Együttműködés",
    cx: 330,
    cy: 300,
    starRadius: 17,
    tint: "#ffb36c",
    planets: [
      { id: "collab-brief", label: "Brief", sectionId: "collab", orbit: 60, angleDeg: -35, radius: 7, depth: 0.85 },
      { id: "collab-design", label: "Design", sectionId: "collab", orbit: 88, angleDeg: 88, radius: 6, depth: 0.7 },
      { id: "collab-run", label: "Pilot", sectionId: "collab", orbit: 116, angleDeg: 210, radius: 6, depth: 0.6 },
    ],
  },
  {
    id: "audience",
    label: "Kinek szól",
    cx: 140,
    cy: 320,
    starRadius: 14,
    tint: "#ff4fd8",
    planets: [
      { id: "audience-marketing", label: "Marketing", sectionId: "audience", orbit: 54, angleDeg: 10, radius: 7, depth: 0.82 },
      { id: "audience-product", label: "Product", sectionId: "audience", orbit: 84, angleDeg: 135, radius: 6, depth: 0.68 },
      { id: "audience-edu", label: "Edukáció", sectionId: "audience", orbit: 112, angleDeg: 245, radius: 6, depth: 0.55 },
    ],
  },
  {
    id: "tech",
    label: "Tech & analitika",
    cx: 520,
    cy: 60,
    starRadius: 13,
    tint: "#9be7ff",
    planets: [
      { id: "tech-engine", label: "Motor", sectionId: "tech", orbit: 50, angleDeg: -10, radius: 6, depth: 0.82 },
      { id: "tech-security", label: "Security", sectionId: "tech", orbit: 80, angleDeg: 140, radius: 6, depth: 0.7 },
      { id: "tech-analytics", label: "Analitika", sectionId: "tech", orbit: 108, angleDeg: 230, radius: 6, depth: 0.6 },
    ],
  },
  {
    id: "finalCta",
    label: "Következő lépés",
    cx: 720,
    cy: 120,
    starRadius: 14,
    tint: "#f5ff8c",
    planets: [
      { id: "final-pilot", label: "Pilot", sectionId: "finalCta", orbit: 52, angleDeg: 6, radius: 7, depth: 0.84 },
      { id: "final-structure", label: "Atlasz", sectionId: "finalCta", orbit: 82, angleDeg: 128, radius: 6, depth: 0.7 },
      { id: "final-loop", label: "Iteráció", sectionId: "finalCta", orbit: 112, angleDeg: 242, radius: 6, depth: 0.55 },
    ],
  },
];

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function SpaceAtlas() {
  return (
    <main className={s.pageRoot}>
      <svg
        className={s.canvas}
        viewBox="0 0 900 440"
        role="img"
        aria-label="Questell Atlas – naprendszerek a landing szekcióihoz igazítva"
      >
              <defs>
                <radialGradient id="bgGlow" cx="50%" cy="0%" r="80%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
                  <stop offset="35%" stopColor="#3bc6ff" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#000814" stopOpacity="0" />
                </radialGradient>

                <radialGradient id="starCore" cx="28%" cy="22%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="35%" stopColor="#ffffff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ffd091" stopOpacity="0.1" />
                </radialGradient>

                <radialGradient id="starHalo" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                  <stop offset="45%" stopColor="#ffffff" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>

                <radialGradient id="planetCore" cx="28%" cy="22%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="40%" stopColor="#ffffff" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#a6d9ff" stopOpacity="0.1" />
                </radialGradient>

                <linearGradient id="decorTrail" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00e5ff" stopOpacity="0" />
                  <stop offset="35%" stopColor="#00e5ff" stopOpacity="0.4" />
                  <stop offset="65%" stopColor="#b46cff" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ff4fd8" stopOpacity="0" />
                </linearGradient>
              </defs>

        <rect x="0" y="0" width="900" height="440" fill="url(#bgGlow)" />

        <g className={s.bgStars}>
          {Array.from({ length: 120 }).map((_, idx) => {
            const x = (idx * 73) % 920;
            const y = ((idx * 193) % 520) - 40;
            const r = (idx % 7 === 0 ? 1.2 : 0.7) + (idx % 3 === 0 ? 0.3 : 0);
            const o = 0.18 + ((idx * 13) % 70) / 200;
            return (
              <circle
                key={`st-${idx}`}
                cx={x}
                cy={y}
                r={r}
                fill="#ffffff"
                opacity={o}
              />
            );
          })}
        </g>

        <g className={s.decorTrail}>
          <path
            d="M 60 390 C 220 340 320 330 460 350 C 600 370 720 360 860 320"
            stroke="url(#decorTrail)"
            strokeWidth={1.2}
            strokeLinecap="round"
            fill="none"
            opacity={0.65}
          />
          <path
            d="M 40 80 C 220 120 340 110 480 90 C 640 70 760 80 880 120"
            stroke="url(#decorTrail)"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
            opacity={0.5}
          />
        </g>

        {SYSTEMS.map((sys, sysIndex) => {
          const haloOpacity = 0.32 + sysIndex * 0.03;
          return (
            <g key={sys.id}>
              <circle
                cx={sys.cx}
                cy={sys.cy}
                r={sys.starRadius * 3.1}
                fill={sys.tint}
                opacity={0.12}
              />
              <circle
                cx={sys.cx}
                cy={sys.cy}
                r={sys.starRadius * 1.9}
                fill="url(#starHalo)"
                opacity={haloOpacity}
              />
              <circle
                cx={sys.cx}
                cy={sys.cy}
                r={sys.starRadius}
                fill="url(#starCore)"
              />

              <text
                x={sys.cx}
                y={sys.cy - sys.starRadius - 14}
                textAnchor="middle"
                className={s.systemTag}
              >
                {sys.label}
              </text>

              {sys.planets.map((p) => {
                const rad = toRad(p.angleDeg);
                const px = sys.cx + p.orbit * Math.cos(rad);
                const py = sys.cy + p.orbit * Math.sin(rad) * 0.82;
                const orbitOpacity = 0.16 + p.depth * 0.14;
                const blur = (1 - p.depth) * 1.2;

                return (
                  <g key={p.id}>
                    <ellipse
                      cx={sys.cx}
                      cy={sys.cy}
                      rx={p.orbit}
                      ry={p.orbit * 0.82}
                      stroke={sys.tint}
                      strokeWidth={0.6}
                      strokeDasharray="2.5 7"
                      opacity={orbitOpacity}
                      fill="none"
                    />
                    <g
                      className={s.planetCore}
                      style={{
                        filter:
                          blur > 0.3
                            ? `blur(${blur.toFixed(2)}px)`
                            : "none",
                      }}
                    >
                      <circle
                        cx={px}
                        cy={py}
                        r={p.radius}
                        fill="url(#planetCore)"
                        stroke={sys.tint}
                        strokeWidth={0.9}
                        opacity={0.9}
                      />
                      <circle
                        cx={px + p.radius * 0.3}
                        cy={py - p.radius * 0.35}
                        r={p.radius * 0.55}
                        fill="#ffffff"
                        opacity={0.32}
                      />
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </main>
  );
}


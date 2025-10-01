"use client";

import React from "react";

const PaperEffect: React.FC = () => {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {/* Papír textúra */}
        <filter id="paperEffect">
  <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="10" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" />
  <feColorMatrix type="matrix"
    values="1.8 0   0   0 0
            0   1.8 0   0 0
            0   0   1.8 0 0
            0   0   0   0.6 0" />
</filter>


        {/* Statikus maszk - teljesen nyitva */}
        <mask id="revealMask" maskUnits="objectBoundingBox">
          <rect x="0" y="0" width="1" height="1" fill="white" />
        </mask>
      </defs>
    </svg>
  );
};

export default PaperEffect;

"use client";
import React from "react";
import SmokeField from "../../SmokeField/SmokeField";
import s from "./DecorBackground.module.scss";

export type DecorBackgroundProps = {
  /** "none" | "subtle" | "promo" */
  preset?: "none" | "subtle" | "promo";
  /** háttérkép override (alap: /assets/background.1.png) */
  src?: string;
  /** alt szöveg a háttérhez */
  alt?: string;
};

const DecorBackground: React.FC<DecorBackgroundProps> = ({
  preset = "subtle",
  src = "/assets/background.1.png",
  alt = "Background",
}) => {
  return (
    <div
      className={`${s.storyBackground} ${
        preset === "promo" ? s.promo : preset === "none" ? s.none : s.subtle
      }`}
      aria-hidden
    >
      <img
        src={src}
        alt={alt}
        className={s.backgroundImage}
        fetchPriority="high"
      />

      {preset !== "none" && (
        <SmokeField
          globalScale={1.3}
          layers={[
            {
              src: "/assets/smoke1.png",
              speed: -14,
              z: 1,
              opacity: 0.22,
              opacityAmplitude: 0.1,
              opacityCycleTime: 23,
              scaleMultiplier: 1.3,
              horizAmplitude: 18,
              vertAmplitude: 42,
              cycleTime: 10,
            },
            {
              src: "/assets/smoke2.png",
              speed: -18,
              z: 2,
              opacity: 0.24,
              opacityAmplitude: 0.32,
              opacityCycleTime: 31,
              scaleMultiplier: 1.3,
              horizAmplitude: 26,
              vertAmplitude: 56,
              cycleTime: 10,
            },
            {
              src: "/assets/smoke5.png",
              speed: -30,
              z: 3,
              opacity: 0.16,
              opacityAmplitude: 0.15,
              opacityCycleTime: 29,
              scaleMultiplier: 1.3,
              horizAmplitude: 32,
              vertAmplitude: 18,
              cycleTime: 13,
            },
            {
              src: "/assets/smoke6.png",
              speed: 18,
              z: 4,
              opacity: 0.08,
              opacityAmplitude: 0.09,
              opacityCycleTime: 37,
              scaleMultiplier: 1.3,
              horizAmplitude: 38,
              vertAmplitude: 24,
              cycleTime: 10,
            },
            {
              src: "/assets/smoke3.png",
              speed: 22,
              z: 5,
              opacity: 0.28,
              opacityAmplitude: 0.15,
              opacityCycleTime: 41,
              scaleMultiplier: 1.3,
              horizAmplitude: 28,
              vertAmplitude: 22,
              cycleTime: 15,
            },
            {
              src: "/assets/smoke4.png",
              speed: 20,
              z: 6,
              opacity: 0.34,
              opacityAmplitude: 0.3,
              cycleTime: 27,
              scaleMultiplier: 1.3,
              horizAmplitude: 34,
              vertAmplitude: 20,
            },
          ]}
        />
      )}
    </div>
  );
};

export default DecorBackground;

// lib/IconRegistry.tsx
import React from "react";

export type IconKey = string;

export type IconSVGProps = React.SVGProps<SVGSVGElement> & {
  variant?: "active" | "locked" | "dim";
};

const baseProps = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 64 64",
  fill: "none",
} as const;

const stroke = "var(--icon-stroke, currentColor)";
const strokeWidth = Number(
  (typeof window !== "undefined" && getComputedStyle(document.documentElement).getPropertyValue("--icon-stroke-w")) ||
  0
) || 4; // vékonyabb alap (viewBox-arányos)

const fillActive = "var(--icon-fill-active, currentColor)";
const fillLocked = "var(--icon-fill-locked, color-mix(in oklch, currentColor 24%, transparent))";

function pickFill(variant: IconSVGProps["variant"]) {
  return variant === "locked" || variant === "dim" ? fillLocked : fillActive;
}

/* ——— Letisztított, csak stroke, a „háttérkör” fill 0 opacitással ——— */

export const IconCross: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest}>
    <circle cx="32" cy="32" r="28" fill={pickFill(variant)} opacity="0" />
    <path d="M16 16 L48 48 M48 16 L16 48"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

export const IconBranch: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest}>
    <circle cx="32" cy="32" r="28" fill={pickFill(variant)} opacity="0" />
    <path d="M32 52 V12 M32 28 C28 26 24 22 22 18 M32 36 C36 34 40 30 42 26"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
  </svg>
);

export const IconShield: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest}>
    {/* pajzs testét NEM töltjük (opacity 0), marad letisztult kontúr */}
    <path
      d="M32 8 L52 16 V32 C52 44 44 54 32 58 C20 54 12 44 12 32 V16 Z"
      fill={pickFill(variant)} opacity="0"
    />
    <path
      d="M32 8 L52 16 V32 C52 44 44 54 32 58 C20 54 12 44 12 32 V16 Z"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" fill="none"
    />
  </svg>
);

export const ICON_REGISTRY: Record<string, React.FC<IconSVGProps & React.SVGProps<SVGSVGElement>>> = {
  cross: IconCross,
  branch: IconBranch,
  shield: IconShield,
};

export function registerIcons(
  pack: Record<string, React.FC<IconSVGProps & React.SVGProps<SVGSVGElement>>>
) {
  Object.assign(ICON_REGISTRY, pack);
}

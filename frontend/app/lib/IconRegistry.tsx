// lib/IconRegistry.tsx
import React from "react";

export type IconKey = string;
export type IconVariant = "active" | "locked" | "dim";

export type IconSVGProps = React.SVGProps<SVGSVGElement> & {
  variant?: IconVariant;
};

const baseProps = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 64 64",
  fill: "none",
  focusable: "false",
  "aria-hidden": true,
} as const;

/* ===== Tokenok (skin/contract felülírhatja) ===== */
const STROKE = "var(--icon-stroke, currentColor)";
const STROKE_W = "var(--icon-stroke-w, 3)";
const STROKE_CAP = "var(--icon-stroke-cap, round)";    // butt|round|square
const STROKE_JOIN = "var(--icon-stroke-join, round)";  // miter|round|bevel
const FILL_ACTIVE = "var(--icon-fill-active, transparent)";
const FILL_LOCKED = "var(--icon-fill-locked, transparent)";
const OPACITY_ACTIVE = "var(--icon-opacity-active, 1)";
const OPACITY_DIM = "var(--icon-opacity-dim, .55)";
const FILTER = "var(--icon-filter, none)";             // pl. drop-shadow(...)

/* ===== Segédfüggók ===== */
function pickFill(v?: IconVariant) {
  return v === "locked" || v === "dim" ? FILL_LOCKED : FILL_ACTIVE;
}
function pickOpacity(v?: IconVariant) {
  return v === "dim" ? OPACITY_DIM : OPACITY_ACTIVE;
}

/* ======================================================================= */
/* ===============   UNIVERZÁLIS, SEMLEGES ALAPIKONOK   ================== */
/* ======================================================================= */

/** Kör kontúr (ring) – a legsemlegesebb univerzál */
export const IconRing: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <circle cx="32" cy="32" r="26"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any} strokeLinejoin={STROKE_JOIN as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Telipont (dot) – diszkrét állapotjel vagy dísz */
export const IconDot: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <circle cx="32" cy="32" r="6"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Négyzet kontúr (square) */
export const IconSquare: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <rect x="12" y="12" width="40" height="40" rx="6"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any} strokeLinejoin={STROKE_JOIN as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Rombusz (diamond) */
export const IconDiamond: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M32 10 L54 32 L32 54 L10 32 Z"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinejoin={STROKE_JOIN as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Háromszög (triangle) – semleges, nem “warning” jelleg (nagy, lekerekített) */
export const IconTriangle: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M32 10 L54 50 H10 Z"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinejoin={STROKE_JOIN as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Hatszög (hex) – tech/semleges forma */
export const IconHex: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M22 12 H42 L54 32 L42 52 H22 L10 32 Z"
      fill={pickFill(variant)}
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinejoin={STROKE_JOIN as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Negyedív (arc) – visszafogott dinamika */
export const IconArc: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M48 16 A32 32 0 0 1 16 48"
      fill="none"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Kettős ív (arc-dual) – ritmus érzet */
export const IconArcDual: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M46 18 A28 28 0 0 1 18 46" fill="none"
      stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)} />
    <path d="M52 12 A34 34 0 0 1 12 52" fill="none"
      stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)} />
  </svg>
);

/** Vízszintes vonal (line) – minimal akcent */
export const IconLine: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M12 32 H52"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** Plusz (plus) – semleges, nem “confirm” jelleg */
export const IconPlus: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M32 14 V50 M14 32 H50"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/** (MEGMARAD) Kereszt (cross) – kérésed szerint */
export const IconCross: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <circle cx="32" cy="32" r="28" fill={pickFill(variant)} opacity="0" />
    <path d="M16 16 L48 48 M48 16 L16 48"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any}
      opacity={pickOpacity(variant)}
    />
  </svg>
);

/* ===== (Opcionális) korábbiak: ha kell, megtarthatod ===== */
export const IconBranch: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <circle cx="32" cy="32" r="28" fill={pickFill(variant)} opacity="0" />
    <path d="M32 52 V12 M32 28 C28 26 24 22 22 18 M32 36 C36 34 40 30 42 26"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinecap={STROKE_CAP as any} fill="none" opacity={pickOpacity(variant)} />
  </svg>
);
export const IconShield: React.FC<IconSVGProps> = ({ variant = "active", ...rest }) => (
  <svg {...baseProps} {...rest} style={{ filter: FILTER }}>
    <path d="M32 8 L52 16 V32 C52 44 44 54 32 58 C20 54 12 44 12 32 V16 Z"
      fill={pickFill(variant)} opacity="0" />
    <path d="M32 8 L52 16 V32 C52 44 44 54 32 58 C20 54 12 44 12 32 V16 Z"
      stroke={STROKE} strokeWidth={STROKE_W}
      strokeLinejoin={STROKE_JOIN as any} fill="none"
      opacity={pickOpacity(variant)} />
  </svg>
);

/* ======================================================================= */
/* =====================   REGISTRY + EXPORT PACK   ====================== */
/* ======================================================================= */

export const ICON_REGISTRY: Record<string, React.FC<IconSVGProps & React.SVGProps<SVGSVGElement>>> = {
  ring: IconRing,
  dot: IconDot,
  square: IconSquare,
  diamond: IconDiamond,
  triangle: IconTriangle,
  hex: IconHex,
  arc: IconArc,
  "arc-dual": IconArcDual,
  line: IconLine,
  plus: IconPlus,
  cross: IconCross,
  // opcionális örökölt: branch, shield
  branch: IconBranch,
  shield: IconShield,
};

/** Egyszerű bővítéshez */
export function registerIcons(
  pack: Record<string, React.FC<IconSVGProps & React.SVGProps<SVGSVGElement>>>
) {
  Object.assign(ICON_REGISTRY, pack);
}

/* ===== Gyors „alappackok” kampányválasztáshoz =====
   - 1 ikon: “ring”
   - 3 ikon: “ring”, “arc”, “dot” (nagyon semleges, modern trió)
*/
export const UNIVERSAL_PACK_1: IconKey[] = ["ring"];
export const UNIVERSAL_PACK_3: IconKey[] = ["ring", "arc", "dot"];

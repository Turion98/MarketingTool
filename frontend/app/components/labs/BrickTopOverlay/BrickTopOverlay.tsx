"use client";
import React, { ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "../BrickTopOverlay.module.scss";

export type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  /** Ha true: a gomb (children) portálon, viewport koordinátákkal */
  usePortal?: boolean;
  /** Anchor a NineSlicePanel content-hez (viewport koordináták) */
  anchor?: Rect | null;
  /** Vízszintes igazítás */
  align?: "center" | "left" | "right";
  /** Offsetek px-ben */
  offsetX?: number;
  offsetY?: number;
  /** Fix szélesség px (ha nincs: auto) */
  width?: number;
  /** Gomb portál z-indexe (ha nincs UiLayers, body-ra portálva ezt használjuk) */
  zIndex?: number;
  /** Dekor PNG (háttér) – ha nincs, csak a gyerek(ek) lesznek */
  src?: string;
  /**
   * A dekor hova kerüljön:
   * - "portal": a keret ELŐTT, de a gomb ALATT (ajánlott, MID réteg)
   * - "backdrop": a keret MÖGÖTT (kitakarhatja a frame!)
   */
  decorMount?: "portal" | "backdrop";
  /** A dekor portál z-indexe (ha NINCS UiLayers és body-ra megy) – alap: zIndex - 1 */
  decorZIndex?: number;
  /** Gyerek(ek) – pl. SkipButton */
  children?: ReactNode;
};

export default function BrickTopOverlay({
  usePortal = true,
  anchor,
  align = "center",
  offsetX = -260,
  offsetY = -103,      // 🔧 Y csak a komponensből – nem CSS var-ból
  width,
  zIndex = 999,
  src,
  decorMount = "portal", // 🔧 alap: dekor is portálon, de a gomb alatt (MID)
  decorZIndex,
  children,
}: Props) {
  // ===== Helpers =====
  const computeLeft = (a: Rect) => {
    const dx = offsetX ?? 0;
    if (align === "left") return a.x + dx;
    if (align === "right") return a.x + a.width + dx;
    return a.x + a.width / 2 + dx;
  };
  const computeTransform =
    align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : "none";

  // ===== UiLayers célpontok (ha vannak) =====
  const midTarget =
    typeof window !== "undefined" ? document.getElementById("ui-midlayer") : null;
  const topTarget =
    typeof window !== "undefined" ? document.getElementById("ui-toplayer") : null;

  // ===== 1) BACKDROP dekor (opcionális, keret mögött) =====
  // ⚠️ INLINE háttér és pozíció: nem függünk CSS változóktól, ha van anchor.
  const makeBackdropStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      backgroundImage: src ? `url("${src}")` : "none",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "contain",
      ...(width !== undefined ? { width: `${width}px` } : null),
    };
    if (anchor) {
      return {
        ...base,
        position: "absolute",
        left: Math.round(
          align === "left"
            ? anchor.x + (offsetX ?? 0)
            : align === "right"
            ? anchor.x + anchor.width + (offsetX ?? 0)
            : anchor.x + anchor.width / 2 + (offsetX ?? 0)
        ),
        top: Math.round(anchor.y + (offsetY ?? 0)),
        transform:
          align === "center"
            ? "translateX(-50%)"
            : align === "right"
            ? "translateX(-100%)"
            : "none",
      };
    }
    // Fallback: ha nincs anchor, hagyunk egy minimális CSS-var alapú pozicionálási lehetőséget
    return {
      ...base,
      ["--brick-top-offset-x" as any]: `${offsetX ?? 0}px`,
      ["--brick-top-offset-y" as any]: `${offsetY ?? 0}px`,
      ["--brick-top-width" as any]: width !== undefined ? `${width}px` : undefined,
    };
  };

  const BackdropDecor =
    decorMount === "backdrop" && src ? (
      <div
        className={`${styles.brickTopOverlay} ${styles.backdropMode} ${styles.decorOnly}`}
        data-align={align}
        style={makeBackdropStyle()}
        aria-hidden
      />
    ) : null;

  // ===== 2) Nem portál mód (gomb + esetleges dekor együtt, hátul) =====
  if (!usePortal) {
    return (
      <div
        className={`${styles.brickTopOverlay} ${styles.backdropMode}`}
        data-align={align}
        style={makeBackdropStyle()}
      >
        <div className={styles.inner}>{children}</div>
      </div>
    );
  }

  // ===== 3) PORTÁLOK =====
  if (!anchor) {
    // Nincs anchor → legalább a backdrop-dekor jelenjen meg, ha kérted
    return BackdropDecor;
  }

  const left = Math.round(computeLeft(anchor));
  const top = Math.round(anchor.y + (offsetY ?? 0)); // 🔧 számmal számolunk, nincs CSS var

  // 3/a) Dekor portálon – a gomb ALATT (MID rétegen, ha van), nem interaktív
  const DecorPortal =
    decorMount === "portal" && src
      ? createPortal(
          <div
            className={`${styles.brickTopOverlay} ${styles.isPortal} ${styles.decorOnly}`}
            data-align={align}
            style={{
              position: "fixed",
              left,
              top,
              transform: computeTransform,
              width: width ? `${width}px` : undefined,
              // Ha van UiLayers → pointerEvents none, z-index a rétegen adott
              // Ha nincs UiLayers → body-ra megy, z-index-szel tesszük a gomb alá
              zIndex: midTarget ? undefined : (decorZIndex ?? zIndex - 1),
              pointerEvents: "none",
              backgroundImage: `url("${src}")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "contain",
            }}
            aria-hidden
          />,
          // MID réteg, ha van; különben body
          (midTarget ?? document.body)
        )
      : null;

  // 3/b) Gomb portálon – interaktív (TOP rétegen, ha van)
  const ButtonPortal = createPortal(
    <div
      className={`${styles.brickTopOverlay} ${styles.isPortal}`}
      data-align={align}
      style={{
        position: "fixed",
        left,
        top,
        transform: computeTransform,
        width: width ? `${width}px` : undefined,
        zIndex: topTarget ? undefined : zIndex,
        // TOP rétegen pointerEvents alapból auto; body-n is maradjon interaktív
      }}
    >
      <div className={styles.inner}>{children}</div>
    </div>,
    // TOP réteg, ha van; különben body
    (topTarget ?? document.body)
  );

  return (
    <>
      {BackdropDecor}
      {DecorPortal}
      {ButtonPortal}
    </>
  );
}

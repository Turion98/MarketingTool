// /components/BrickBottomOverlay.tsx
"use client";
import React from "react";
import { createPortal } from "react-dom";
import s from "./BrickBottomOverlay.module.scss";

type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  anchor?: Rect;
  usePortal?: boolean;
  src?: string;
  position?: "bottom" | "top";
  offsetY?: number;
  offsetX?: number;
  sizePx?: number;   // 🔹 egyetlen tégla mérete (width = height = sizePx)
  zIndex?: number;
};

export default function BrickBottomOverlay({
  anchor,
  usePortal = true,
  src = "/ui/brickbottom.png",
  position = "bottom",
  offsetY = 15,
  offsetX = -6,
  sizePx = 145,
  zIndex = 5,
}: Props) {
  // 🔕 Top dekoráció ideiglenesen kikapcsolva
  if (position === "top") return null;

  if (usePortal && !anchor) return null;

  const x = Math.round(anchor?.x ?? 0);
  const y = Math.round(anchor?.y ?? 0);
  const w = Math.round(anchor?.width ?? 0);
  const h = Math.round(anchor?.height ?? 0);

  const styleVars: React.CSSProperties = {
    ...(usePortal && anchor
      ? {
          ["--ns-content-x" as any]: `${x}px`,
          ["--ns-content-y" as any]: `${y}px`,
          ["--ns-content-w" as any]: `${w}px`,
          ["--ns-content-h" as any]: `${h}px`,
          ["--brick-z" as any]: String(zIndex),
        }
      : null),
    ["--brick-src" as any]: `url("${src}")`,
    ["--brick-offset-x" as any]: `${offsetX}px`,
    ["--brick-offset-y" as any]: `${offsetY}px`,
    ["--brick-size" as any]: `${sizePx}px`,
  };

  const node = (
    <div
      className={`${s.brickOverlay} ${usePortal ? s.isPortal : s.isInline}`}
      style={styleVars}
      data-pos="bottom"
      aria-hidden
    />
  );

  return usePortal && typeof window !== "undefined"
    ? createPortal(node, document.body)
    : node;
}

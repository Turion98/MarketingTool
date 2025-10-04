"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import s from "./NineSlicePanel.module.scss";

type Pad = { top?: number; right?: number; bottom?: number; left?: number };

type MeasureBox = {
  panel:   { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
  padding: Required<Pad>;
  dpr: number;
};

type UnderlayOpts = {
  enabled?: boolean;
  opacity?: number;
  background?: string;
};

type Props = {
  /** Safe-area padding a doboz körül (px) */
  padding?: Pad;
  className?: string;
  children?: React.ReactNode;
  /** Csak mérési/UX okból: kapjon-e scroll/resize mérés figyelést */
  trackScroll?: boolean;
  /** Visszamérés (panel + content) – layoutot NEM befolyásoljuk vele */
  onMeasure?: (m: MeasureBox) => void;
  /** Opcionális belső fedőréteg (content alatt) */
  underlay?: UnderlayOpts;
  /** Opcionális háttérelem a content mögé */
  backdrop?: React.ReactNode;

  /** Z-index és stacking context kontroll (szülő scope-on belül) */
  zIndex?: number;
  isolate?: boolean;
};

export default function NineSlicePanel({
  padding,
  className,
  children,
  trackScroll = false,
  onMeasure,
  underlay,
  backdrop,
  zIndex = 1,
  isolate = true,
}: Props) {
  // safe-area padding (px)
  const padTop = padding?.top ?? 0;
  const padRight = padding?.right ?? 0;
  const padBottom = padding?.bottom ?? 0;
  const padLeft = padding?.left ?? 0;

  const styleVars = useMemo(
    () =>
      ({
        ["--ns-pad-top" as any]: `${padTop}px`,
        ["--ns-pad-right" as any]: `${padRight}px`,
        ["--ns-pad-bottom" as any]: `${padBottom}px`,
        ["--ns-pad-left" as any]: `${padLeft}px`,
      } as React.CSSProperties),
    [padTop, padRight, padBottom, padLeft]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const R = (v: number) => Math.round(v);

  const doMeasure = () => {
    if (!onMeasure) return;
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;

    const panelRect = root.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    onMeasure({
      panel: {
        x: R(panelRect.x),
        y: R(panelRect.y),
        width: R(panelRect.width),
        height: R(panelRect.height),
      },
      content: {
        x: R(contentRect.x),
        y: R(contentRect.y),
        width: R(contentRect.width),
        height: R(contentRect.height),
      },
      padding: { top: padTop, right: padRight, bottom: padBottom, left: padLeft },
      dpr,
    });
  };

  useLayoutEffect(() => {
    doMeasure();
    const ro = new ResizeObserver(() => doMeasure());
    const root = rootRef.current;
    const content = contentRef.current;
    root && ro.observe(root);
    content && ro.observe(content);

    const handle = () => doMeasure();
    if (trackScroll) window.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("resize", handle, { passive: true });

    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.("change", handle);

    document.fonts?.ready?.then(() => doMeasure()).catch(() => {});

    return () => {
      ro.disconnect();
      if (trackScroll) window.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
      mq.removeEventListener?.("change", handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackScroll]);

  const styleAll: React.CSSProperties = {
    ...styleVars,
    position: "relative",
    contain: "layout",
    isolation: isolate ? "isolate" : undefined,
    zIndex,
  };

  const underlayEnabled = !!underlay?.enabled;
  const underlayStyle: React.CSSProperties | undefined = underlayEnabled
    ? {
        position: "absolute",
        top: `var(--ns-pad-top)`,
        right: `var(--ns-pad-right)`,
        bottom: `var(--ns-pad-bottom)`,
        left: `var(--ns-pad-left)`,
        background: underlay?.background ?? "rgba(0,0,0,0.12)",
        opacity: underlay?.opacity ?? 1,
        pointerEvents: "none",
        zIndex: 1,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={[s.panel, className].filter(Boolean).join(" ")}
      style={styleAll}
      role="group"
      aria-label="Panel"
    >
      {underlayEnabled && <div style={underlayStyle} aria-hidden />}
      {backdrop && <div className={s.backdrop} aria-hidden>{backdrop}</div>}
      <div ref={contentRef} className={s.content}>
        {children}
      </div>
    </div>
  );
}

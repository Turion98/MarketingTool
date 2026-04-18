"use client";

import { useCallback, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import s from "./storyCanvas.module.scss";

export type MinimapWorldBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type EditorCanvasMinimapProps = {
  fitBounds: { minX: number; minY: number; maxX: number; maxY: number };
  boxes: MinimapWorldBox[];
  pan: { x: number; y: number };
  zoom: number;
  viewportW: number;
  viewportH: number;
  selectedPageIds: string[];
  disabled?: boolean;
  onCenterWorld: (worldX: number, worldY: number) => void;
};

const MAX_W = 168;
const MAX_H = 112;

export function EditorCanvasMinimap({
  fitBounds,
  boxes,
  pan,
  zoom,
  viewportW,
  viewportH,
  selectedPageIds,
  disabled = false,
  onCenterWorld,
}: EditorCanvasMinimapProps) {
  /** Külön X/Y skála: a belső doboz mindig MAX_W×MAX_H (széles gráfnál nem „csík”-osodik össze). */
  const layout = useMemo(() => {
    const bw = Math.max(1, fitBounds.maxX - fitBounds.minX);
    const bh = Math.max(1, fitBounds.maxY - fitBounds.minY);
    const scaleX = MAX_W / bw;
    const scaleY = MAX_H / bh;
    return {
      bw,
      bh,
      scaleX,
      scaleY,
      innerW: MAX_W,
      innerH: MAX_H,
      minX: fitBounds.minX,
      minY: fitBounds.minY,
    };
  }, [fitBounds]);

  const viewRect = useMemo(() => {
    if (viewportW < 4 || viewportH < 4 || zoom < 1e-6) return null;
    const { scaleX, scaleY, minX, minY } = layout;
    const wx0 = -pan.x / zoom;
    const wy0 = -pan.y / zoom;
    const wx1 = (viewportW - pan.x) / zoom;
    const wy1 = (viewportH - pan.y) / zoom;
    const left = (Math.min(wx0, wx1) - minX) * scaleX;
    const top = (Math.min(wy0, wy1) - minY) * scaleY;
    const width = Math.abs(wx1 - wx0) * scaleX;
    const height = Math.abs(wy1 - wy0) * scaleY;
    return { left, top, width, height };
  }, [layout, pan, zoom, viewportW, viewportH]);

  const selectedSet = useMemo(
    () => new Set(selectedPageIds),
    [selectedPageIds]
  );

  const onMinimapPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { bw, bh, minX, minY } = layout;
      const wx = minX + (mx / MAX_W) * bw;
      const wy = minY + (my / MAX_H) * bh;
      onCenterWorld(wx, wy);
    },
    [disabled, layout, onCenterWorld]
  );

  return (
    <div
      className={`${s.minimapRoot} ${disabled ? s.minimapRootDisabled : ""}`}
      data-editor-minimap="1"
      role="region"
      aria-label="Gráf mini térkép"
      aria-hidden={disabled}
    >
      <div className={s.minimapLabel}>Térkép</div>
      <div
        className={s.minimapInner}
        style={{ width: layout.innerW, height: layout.innerH }}
        onPointerDown={onMinimapPointerDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Kattintásra a vászon a kiválasztott pontra görget"
        title="Kattintás: ugrás ide a vásznon"
      >
        {boxes.map((b) => {
          const left = (b.x - layout.minX) * layout.scaleX;
          const top = (b.y - layout.minY) * layout.scaleY;
          const w = Math.max(2, b.w * layout.scaleX);
          const h = Math.max(2, b.h * layout.scaleY);
          const sel = selectedSet.has(b.id);
          return (
            <div
              key={b.id}
              className={`${s.minimapCard} ${sel ? s.minimapCardSelected : ""}`}
              style={{ left, top, width: w, height: h }}
            />
          );
        })}
        {viewRect ? (
          <div
            className={s.minimapViewport}
            style={{
              left: viewRect.left,
              top: viewRect.top,
              width: Math.max(4, viewRect.width),
              height: Math.max(4, viewRect.height),
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

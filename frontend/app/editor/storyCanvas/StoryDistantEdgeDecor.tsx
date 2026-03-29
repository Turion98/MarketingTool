"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DistantEdgeBundle } from "./StoryEdges";
import { replaceDistantPathEndY } from "./distantInboundLayout";
import s from "./storyCanvas.module.scss";

const DISTANT_STROKE = "rgba(192, 180, 255, 0.92)";
const DISTANT_WIDTH = 1.75;

function dashForKind(k: DistantEdgeBundle["kind"]): string {
  if (k === "logicIf") return "6 4";
  return "none";
}

function shortId(id: string, max = 14): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

export function distantBundleActive(
  b: DistantEdgeBundle,
  hoveredKey: string | null,
  selectedPageIds: readonly string[]
): boolean {
  if (hoveredKey === b.key) return true;
  if (!selectedPageIds.length) return false;
  return (
    selectedPageIds.includes(b.fromPageId) ||
    selectedPageIds.includes(b.toPageId)
  );
}

type LinesProps = {
  bundles: DistantEdgeBundle[];
  selectedPageIds: readonly string[];
  hoveredKey: string | null;
  /** Bemeneti oldali Y a címkékkel egyezően (függőleges csomagolás). */
  inboundYByKey: Map<string, number>;
};

/** Kártyák alatt (z-index 1): távoli él vonalai csak hover / kijelölés. */
export function StoryDistantEdgeLines({
  bundles,
  selectedPageIds,
  hoveredKey,
  inboundYByKey,
}: LinesProps) {
  if (bundles.length === 0) return null;

  return (
    <svg className={s.distantEdgeLinesSvg} aria-hidden>
      {bundles.map((b) => {
        const active = distantBundleActive(b, hoveredKey, selectedPageIds);
        const opacity = active ? 1 : 0;
        const dash = dashForKind(b.kind);
        const lineStyle = {
          opacity,
          transition: "opacity 0.12s ease-out",
        };
        const yIn = inboundYByKey.get(b.key) ?? b.y2;
        if (b.drawMode === "line") {
          return (
            <line
              key={`dl:${b.key}`}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={yIn}
              stroke={DISTANT_STROKE}
              strokeWidth={DISTANT_WIDTH}
              strokeDasharray={dash}
              style={lineStyle}
            />
          );
        }
        const d =
          b.pathD != null ? replaceDistantPathEndY(b.pathD, yIn) : "";
        return (
          <path
            key={`dl:${b.key}`}
            d={d}
            fill="none"
            stroke={DISTANT_STROKE}
            strokeWidth={DISTANT_WIDTH}
            strokeDasharray={dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={lineStyle}
          />
        );
      })}
    </svg>
  );
}

type ChipsProps = {
  bundles: DistantEdgeBundle[];
  onHoverKey: (key: string | null) => void;
  inboundYByKey: Map<string, number>;
};

/** Csak ennyi lógjon a forrás kártyára (a nyíl hegye + kevés test). */
const OUT_CARD_OVERLAP_PX = 11;
/** Bemeneti címke hegye ennyivel hatoljon a cél kártyába. */
const IN_CARD_OVERLAP_PX = 9;

function chipPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
  e.stopPropagation();
  e.preventDefault();
}

/** Kártyák felett: nyíl alakú port címkék (szöveg, ikon nélkül). */
export function StoryDistantEdgeChips({
  bundles,
  onHoverKey,
  inboundYByKey,
}: ChipsProps) {
  if (bundles.length === 0) return null;

  return (
    <div className={s.distantEdgeChips} aria-hidden>
      {bundles.map((b) => {
        const outTop =
          b.drawMode === "path" && b.yMid != null ? b.yMid : b.y1;
        const outLeft = b.x1 - OUT_CARD_OVERLAP_PX;
        const toLabel =
          b.edgeIds.length > 1
            ? `${shortId(b.toPageId)} ×${b.edgeIds.length}`
            : shortId(b.toPageId);

        const inTop = inboundYByKey.get(b.key) ?? b.y2;
        const inLeft = b.x2 + IN_CARD_OVERLAP_PX;

        return (
          <div key={`dc:${b.key}`} className={s.distantEdgeChipPair}>
            <div
              role="presentation"
              data-distant-edge-chip
              className={`${s.distantEdgeChip} ${s.distantEdgeChipOut}`}
              style={{
                left: outLeft,
                top: outTop,
                transform: "translate(0, -50%)",
              }}
              title={b.toPageId}
              onPointerEnter={() => onHoverKey(b.key)}
              onPointerLeave={() => onHoverKey(null)}
              onPointerDown={chipPointerDown}
            >
              <span className={s.distantEdgeChipText}>{toLabel}</span>
            </div>
            <div
              role="presentation"
              data-distant-edge-chip
              className={`${s.distantEdgeChip} ${s.distantEdgeChipIn}`}
              style={{
                left: inLeft,
                top: inTop,
                transform: "translate(-100%, -50%)",
              }}
              title={b.fromPageId}
              onPointerEnter={() => onHoverKey(b.key)}
              onPointerLeave={() => onHoverKey(null)}
              onPointerDown={chipPointerDown}
            >
              <span className={s.distantEdgeChipText}>
                {shortId(b.fromPageId)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

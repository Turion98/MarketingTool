"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DistantEdgeBundle } from "./StoryEdges";
import { replaceDistantPathEndY } from "./distantInboundLayout";
import s from "./storyCanvas.module.scss";

const END_INGRESS_STROKE = "rgba(52, 211, 153, 0.9)";
const END_INGRESS_WIDTH = 1.85;

function dashForKind(k: DistantEdgeBundle["kind"]): string {
  if (k === "logicIf") return "6 4";
  return "none";
}

function shortId(id: string, max = 12): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

export function endIngressLineVisible(
  b: DistantEdgeBundle,
  hoveredKey: string | null,
  selectedPageIds: readonly string[]
): boolean {
  if (hoveredKey === b.key) return true;
  return selectedPageIds.includes(b.toPageId);
}

const OUT_CARD_OVERLAP_PX = 11;
const IN_CARD_OVERLAP_PX = 9;

function chipPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
  e.stopPropagation();
  e.preventDefault();
}

/** Végoldalra mutató élek: zöld vonal csak kijelölt vég / chip hover esetén. */
export function StoryEndIngressLines({
  bundles,
  selectedPageIds,
  hoveredKey,
  inboundYByKey,
}: {
  bundles: DistantEdgeBundle[];
  selectedPageIds: readonly string[];
  hoveredKey: string | null;
  inboundYByKey: Map<string, number>;
}) {
  if (bundles.length === 0) return null;

  return (
    <svg className={s.endIngressLinesSvg} aria-hidden>
      {bundles.map((b) => {
        const active = endIngressLineVisible(b, hoveredKey, selectedPageIds);
        const opacity = active ? 1 : 0;
        const dash = dashForKind(b.kind);
        const lineStyle = {
          opacity,
          transition: "opacity 0.14s ease-out",
        };
        const yIn = inboundYByKey.get(b.key) ?? b.y2;
        if (b.drawMode === "line") {
          return (
            <line
              key={`ei:${b.key}`}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={yIn}
              stroke={END_INGRESS_STROKE}
              strokeWidth={END_INGRESS_WIDTH}
              strokeDasharray={dash}
              style={lineStyle}
            />
          );
        }
        const d =
          b.pathD != null ? replaceDistantPathEndY(b.pathD, yIn) : "";
        return (
          <path
            key={`ei:${b.key}`}
            d={d}
            fill="none"
            stroke={END_INGRESS_STROKE}
            strokeWidth={END_INGRESS_WIDTH}
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

/** Kis nyíl-kártyák: forrás oldalon cél (vég) id, vég kártyán honnan jöttünk. */
export function StoryEndIngressChips({
  bundles,
  onHoverKey,
  inboundYByKey,
  hideInboundChip,
}: {
  bundles: DistantEdgeBundle[];
  onHoverKey: (key: string | null) => void;
  inboundYByKey: Map<string, number>;
  /**
   * Ha true: a cél (vég) oldali „be” chip nem renderelődik (pl. összeomlott kategória-kártya).
   * A forrás oldali chip és a vonal réteg változatlan; a vonal továbbra is a `inboundYByKey` szerint fut.
   */
  hideInboundChip?: (toPageId: string) => boolean;
}) {
  if (bundles.length === 0) return null;

  return (
    <div className={s.endIngressChips} aria-hidden>
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
        const hideIn = hideInboundChip?.(b.toPageId) ?? false;

        return (
          <div key={`eic:${b.key}`} className={s.endIngressChipPair}>
            <div
              role="presentation"
              data-end-ingress-chip="1"
              className={`${s.endIngressChip} ${s.endIngressChipOut}`}
              style={{
                left: outLeft,
                top: outTop,
                transform: "translate(0, -50%)",
              }}
              title={`→ ${b.toPageId}`}
              onPointerEnter={() => onHoverKey(b.key)}
              onPointerLeave={() => onHoverKey(null)}
              onPointerDown={chipPointerDown}
            >
              <span className={s.endIngressChipText}>{toLabel}</span>
            </div>
            {!hideIn ? (
              <div
                role="presentation"
                data-end-ingress-chip="1"
                className={`${s.endIngressChip} ${s.endIngressChipIn}`}
                style={{
                  left: inLeft,
                  top: inTop,
                  transform: "translate(-100%, -50%)",
                }}
                title={`Honnan: ${b.fromPageId}`}
                onPointerEnter={() => onHoverKey(b.key)}
                onPointerLeave={() => onHoverKey(null)}
                onPointerDown={chipPointerDown}
              >
                <span className={s.endIngressChipText}>
                  {shortId(b.fromPageId)}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

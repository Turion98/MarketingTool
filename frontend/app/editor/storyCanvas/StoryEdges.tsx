"use client";

import type { EditorCanvasCluster } from "@/app/lib/editor/editorCanvasCluster";
import {
  clusterTopIngressPoint,
  filterOutClusterInternalEdges,
  findClusterForTopIngress,
} from "@/app/lib/editor/editorCanvasCluster";
import {
  STORY_GRAPH_START_NODE_ID,
  type StoryGraphEdge,
  type StoryGraphEdgeKind,
} from "@/app/lib/editor/storyGraph";

export type EdgeDrawOp =
  | {
      type: "line";
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind: StoryGraphEdgeKind;
    }
  | {
      type: "path";
      key: string;
      d: string;
      kind: StoryGraphEdgeKind;
    };

const MERGE_INSET = 14;

/** Cél balra a forrás kimenetéhez képest → távoli / vissza él (world px). */
export const DISTANT_EDGE_EPS = 16;

export type DistantEdgeBundle = {
  key: string;
  fromPageId: string;
  toPageId: string;
  kind: StoryGraphEdgeKind;
  drawMode: "line" | "path";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pathD?: string;
  /** Merge ág: kimeneti címke a függőleges busznál. */
  mergeX?: number;
  yMid?: number;
  y1s?: number[];
  edgeIds: string[];
};

function strokeForKind(k: StoryGraphEdgeKind): string {
  switch (k) {
    case "start":
      return "rgba(139, 168, 255, 0.85)";
    case "logicIf":
    case "logicElse":
      return "rgba(251, 191, 36, 0.75)";
    case "puzzleSuccess":
      return "rgba(52, 211, 153, 0.75)";
    case "puzzleFail":
      return "rgba(248, 113, 113, 0.7)";
    default:
      return "rgba(148, 163, 184, 0.55)";
  }
}

function dashForKind(k: StoryGraphEdgeKind): string {
  if (k === "logicIf") return "6 4";
  return "none";
}

function mergePathD(
  x1: number,
  mergeX: number,
  x2: number,
  y1s: number[],
  y2: number
): string {
  const ymin = Math.min(...y1s);
  const ymax = Math.max(...y1s);
  const yMid = (ymin + ymax) / 2;
  const parts: string[] = [];
  for (const y of y1s) {
    parts.push(`M ${x1} ${y} L ${mergeX} ${y}`);
  }
  if (y1s.length > 1 && ymax - ymin > 0.5) {
    parts.push(`M ${mergeX} ${ymin} L ${mergeX} ${ymax}`);
  }
  parts.push(`M ${mergeX} ${yMid} L ${x2} ${y2}`);
  return parts.join(" ");
}

function kindForGroup(group: StoryGraphEdge[]): StoryGraphEdgeKind {
  const k0 = group[0]!.kind;
  if (group.every((e) => e.kind === k0)) return k0;
  return "choice";
}

export default function StoryEdges({ ops }: { ops: EdgeDrawOp[] }) {
  if (ops.length === 0) return null;
  return (
    <svg
      className="storyCanvasWorldSvg"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 0,
      }}
    >
      {ops.map((op) =>
        op.type === "line" ? (
          <line
            key={op.key}
            x1={op.x1}
            y1={op.y1}
            x2={op.x2}
            y2={op.y2}
            stroke={strokeForKind(op.kind)}
            strokeWidth={op.kind === "start" ? 2 : 1.5}
            strokeDasharray={dashForKind(op.kind)}
          />
        ) : (
          <path
            key={op.key}
            d={op.d}
            fill="none"
            stroke={strokeForKind(op.kind)}
            strokeWidth={op.kind === "start" ? 2 : 1.5}
            strokeDasharray={dashForKind(op.kind)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      )}
    </svg>
  );
}

export type WorldMetricsNode = {
  x: number;
  y: number;
  w: number;
  h: number;
  outSlotY: Map<string, number>;
  inSlotY: Map<string, number>;
};

function isDistantEdge(x1: number, x2: number, fromPageId: string): boolean {
  if (fromPageId === STORY_GRAPH_START_NODE_ID) return false;
  return x2 < x1 - DISTANT_EDGE_EPS;
}

/** Csoportosítás: azonos forrás + azonos cél → egy összefutó köteg. */
export function buildEdgeLayers(input: {
  edges: StoryGraphEdge[];
  world: Map<string, WorldMetricsNode>;
  clusters?: EditorCanvasCluster[];
  /** `type: end` célú oldalak: külön zöld / chip réteg, nem a normál lokális vonalak. */
  endTargetPageIds?: ReadonlySet<string> | null;
}): {
  localOps: EdgeDrawOp[];
  distantBundles: DistantEdgeBundle[];
  endIngressBundles: DistantEdgeBundle[];
} {
  const clusters = input.clusters ?? [];
  const edges =
    clusters.length > 0
      ? filterOutClusterInternalEdges(input.edges, clusters)
      : input.edges;
  const { world } = input;
  const endTargets = input.endTargetPageIds ?? null;
  const groups = new Map<string, StoryGraphEdge[]>();
  for (const e of edges) {
    const k = `${e.from}\0${e.to}`;
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  const sorted = Array.from(groups.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const localOps: EdgeDrawOp[] = [];
  const distantBundles: DistantEdgeBundle[] = [];
  const endIngressBundles: DistantEdgeBundle[] = [];

  for (const [, group] of sorted) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    const e0 = group[0]!;
    const a = world.get(e0.from);
    const b = world.get(e0.to);
    if (!a || !b) continue;

    const kind = kindForGroup(group);
    const toIsEnd = Boolean(endTargets?.has(e0.to));

    if (group.length === 1) {
      const e = e0;
      const y1 = a.y + (a.outSlotY.get(e.id) ?? a.h / 2);
      const x1 = a.x + a.w;
      const topCluster = findClusterForTopIngress(clusters, e);
      const ingress = topCluster
        ? clusterTopIngressPoint(world, topCluster)
        : null;
      const y2 = ingress
        ? ingress.top
        : b.y + (b.inSlotY.get(e.id) ?? b.h / 2);
      const x2 = ingress ? ingress.cx : b.x;

      if (toIsEnd) {
        endIngressBundles.push({
          key: `end:${e.id}`,
          fromPageId: e0.from,
          toPageId: e0.to,
          kind: e.kind,
          drawMode: "line",
          x1,
          y1,
          x2,
          y2,
          edgeIds: [e.id],
        });
      } else if (isDistantEdge(x1, x2, e0.from)) {
        distantBundles.push({
          key: e.id,
          fromPageId: e0.from,
          toPageId: e0.to,
          kind: e.kind,
          drawMode: "line",
          x1,
          y1,
          x2,
          y2,
          edgeIds: [e.id],
        });
      } else {
        localOps.push({
          type: "line",
          key: e.id,
          x1,
          y1,
          x2,
          y2,
          kind: e.kind,
        });
      }
      continue;
    }

    const x1 = a.x + a.w;
    const mergeX = a.x + a.w + MERGE_INSET;
    const x2 = b.x;
    const y1s = group.map(
      (e) => a.y + (a.outSlotY.get(e.id) ?? a.h / 2)
    );
    const y2 = b.y + (b.inSlotY.get(e0.id) ?? b.h / 2);
    const ymin = Math.min(...y1s);
    const ymax = Math.max(...y1s);
    const yMid = (ymin + ymax) / 2;
    const pathD = mergePathD(x1, mergeX, x2, y1s, y2);
    const edgeIds = group.map((e) => e.id);

    if (toIsEnd) {
      endIngressBundles.push({
        key: `end:merge:${e0.from}>${e0.to}`,
        fromPageId: e0.from,
        toPageId: e0.to,
        kind,
        drawMode: "path",
        x1,
        y1: yMid,
        x2,
        y2,
        pathD,
        mergeX,
        yMid,
        y1s,
        edgeIds,
      });
    } else if (isDistantEdge(x1, x2, e0.from)) {
      distantBundles.push({
        key: `merge:${e0.from}>${e0.to}`,
        fromPageId: e0.from,
        toPageId: e0.to,
        kind,
        drawMode: "path",
        x1,
        y1: yMid,
        x2,
        y2,
        pathD,
        mergeX,
        yMid,
        y1s,
        edgeIds,
      });
    } else {
      localOps.push({
        type: "path",
        key: `merge:${e0.from}>${e0.to}`,
        d: pathD,
        kind,
      });
    }
  }

  return { localOps, distantBundles, endIngressBundles };
}

export function buildEdgeDrawOps(input: {
  edges: StoryGraphEdge[];
  world: Map<string, WorldMetricsNode>;
  clusters?: EditorCanvasCluster[];
}): EdgeDrawOp[] {
  return buildEdgeLayers(input).localOps;
}

"use client";

import type { StoryGraphEdge } from "./storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "./storyGraph";
import { getEditorCanvasClustersEffective } from "./editorCanvasCluster";

export type EditorLayoutNode = { x: number; y: number };
export type EditorLayoutState = {
  version: 1;
  nodes: Record<string, EditorLayoutNode>;
};

const LAYOUT_VERSION = 1 as const;
const DEFAULT_CARD_W = 200;
const DEFAULT_CARD_H = 112;
const COL_GAP = 56;
const ROW_GAP = 32;
/** Egyeznie kell a vászon `CARD_W`-val (200). */
const CLUSTER_CARD_W = 200;
/** Riddle-csoport: kártyák között a vásznon. */
const CLUSTER_PACK_GAP = 28;
/** Retry kártya becsült magasság (pack); egyeztetve a vászon kártya becsléssel. */
const CLUSTER_RETRY_EST_H = 112;
/** Retry és a riddle-sor közötti függőleges rés. */
const CLUSTER_GAP_ABOVE_RETRY = 28;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function readEditorLayoutFromStory(
  story: Record<string, unknown>
): EditorLayoutState | null {
  const meta = asRecord(story.meta);
  if (!meta) return null;
  const raw = meta.editorLayout;
  const wrap = asRecord(raw);
  if (!wrap) return null;
  if (wrap.version !== LAYOUT_VERSION) return null;
  const nodesRaw = wrap.nodes;
  if (!nodesRaw || typeof nodesRaw !== "object" || Array.isArray(nodesRaw)) {
    return null;
  }
  const nodes: Record<string, EditorLayoutNode> = {};
  for (const [k, v] of Object.entries(nodesRaw)) {
    const o = asRecord(v);
    if (!o) continue;
    const x = typeof o.x === "number" ? o.x : Number(o.x);
    const y = typeof o.y === "number" ? o.y : Number(o.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    nodes[k] = { x, y };
  }
  return Object.keys(nodes).length ? { version: LAYOUT_VERSION, nodes } : null;
}

export function mergeEditorLayoutIntoStory(
  story: Record<string, unknown>,
  layout: EditorLayoutState
): Record<string, unknown> {
  const next = { ...story };
  const prevMeta = asRecord(story.meta) ?? {};
  next.meta = {
    ...prevMeta,
    editorLayout: {
      version: LAYOUT_VERSION,
      nodes: { ...layout.nodes },
    },
  };
  return next;
}

/**
 * BFS from start page + virtual start node; assign columns by depth, rows within column.
 */
export function computeDefaultLayout(input: {
  pageIds: string[];
  edges: StoryGraphEdge[];
  startPageId: string | null;
}): EditorLayoutState {
  const { pageIds, edges, startPageId } = input;
  const idSet = new Set(pageIds);

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === STORY_GRAPH_START_NODE_ID) continue;
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }

  const roots: string[] = [];
  if (startPageId && idSet.has(startPageId)) {
    roots.push(startPageId);
  } else if (pageIds.length) {
    roots.push(pageIds[0]!);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [...roots];
  for (const r of roots) depth.set(r, 0);

  while (queue.length) {
    const u = queue.shift()!;
    const d = depth.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      if (depth.has(v)) continue;
      depth.set(v, d + 1);
      queue.push(v);
    }
  }

  for (const id of pageIds) {
    if (!depth.has(id)) depth.set(id, 0);
  }

  const byCol = new Map<number, string[]>();
  for (const id of pageIds) {
    const c = depth.get(id) ?? 0;
    const col = byCol.get(c) ?? [];
    col.push(id);
    byCol.set(c, col);
  }

  const nodes: Record<string, EditorLayoutNode> = {};
  const sortedCols = Array.from(byCol.keys()).sort((a, b) => a - b);

  let maxRow = 0;
  sortedCols.forEach((colIndex, ci) => {
    const row = byCol.get(colIndex) ?? [];
    row.sort();
    row.forEach((id, ri) => {
      nodes[id] = {
        x: ci * (DEFAULT_CARD_W + COL_GAP),
        y: ri * (DEFAULT_CARD_H + ROW_GAP),
      };
      maxRow = Math.max(maxRow, ri);
    });
  });

  const startY = Math.max(0, (maxRow * (DEFAULT_CARD_H + ROW_GAP)) / 2 - 24);
  nodes[STORY_GRAPH_START_NODE_ID] = {
    x: -DEFAULT_CARD_W - COL_GAP,
    y: startY,
  };

  return { version: LAYOUT_VERSION, nodes };
}

function applyClusterHorizontalPacks(
  story: Record<string, unknown>,
  nodes: Record<string, EditorLayoutNode>,
  pageIds: string[]
): Record<string, EditorLayoutNode> {
  const clusters = getEditorCanvasClustersEffective(story);
  if (!clusters.length) return nodes;
  let next = { ...nodes };
  for (const cl of clusters) {
    if (!cl.packHorizontal) continue;
    const row = (cl.riddleRowPageIds ?? []).filter((id) =>
      pageIds.includes(id)
    );
    const retryId =
      cl.retryPageId && pageIds.includes(cl.retryPageId)
        ? cl.retryPageId
        : "";

    if (row.length >= 2 && !retryId) {
      const first = row[0]!;
      const base = next[first];
      if (!base) continue;
      let x = base.x;
      const y = base.y;
      for (const id of row) {
        next[id] = { x, y };
        x += CLUSTER_CARD_W + CLUSTER_PACK_GAP;
      }
      continue;
    }

    if (row.length >= 2 && retryId) {
      const first = row[0]!;
      const base = next[first];
      if (!base) continue;
      let x = base.x;
      const y = base.y;
      for (const id of row) {
        next[id] = { x, y };
        x += CLUSTER_CARD_W + CLUSTER_PACK_GAP;
      }
      const n = row.length;
      const rowLeft = next[row[0]!]!.x;
      const rowRight = next[row[n - 1]!]!.x + CLUSTER_CARD_W;
      const midX = (rowLeft + rowRight) / 2;
      next[retryId] = {
        x: midX - CLUSTER_CARD_W / 2,
        y: y - CLUSTER_GAP_ABOVE_RETRY - CLUSTER_RETRY_EST_H,
      };
      continue;
    }

    const members = cl.members.filter((id) => pageIds.includes(id));
    if (members.length < 2) continue;
    const firstM = members[0]!;
    const baseM = next[firstM];
    if (!baseM) continue;
    let xm = baseM.x;
    const ym = baseM.y;
    for (const id of members) {
      next[id] = { x: xm, y: ym };
      xm += CLUSTER_CARD_W + CLUSTER_PACK_GAP;
    }
  }
  return next;
}

export function ensureLayout(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): EditorLayoutState {
  const computed = computeDefaultLayout({ pageIds, edges, startPageId });
  const saved = readEditorLayoutFromStory(story);
  if (!saved) {
    const nodes = applyClusterHorizontalPacks(story, { ...computed.nodes }, pageIds);
    return { version: LAYOUT_VERSION, nodes };
  }
  const nodes = { ...computed.nodes };
  for (const id of pageIds) {
    if (saved.nodes[id]) nodes[id] = { ...saved.nodes[id] };
  }
  if (saved.nodes[STORY_GRAPH_START_NODE_ID]) {
    nodes[STORY_GRAPH_START_NODE_ID] = {
      ...saved.nodes[STORY_GRAPH_START_NODE_ID],
    };
  }
  const packed = applyClusterHorizontalPacks(story, nodes, pageIds);
  return { version: LAYOUT_VERSION, nodes: packed };
}

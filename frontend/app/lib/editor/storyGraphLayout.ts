"use client";

import type { StoryGraphEdge } from "./storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "./storyGraph";
import { getEditorCanvasClustersEffective } from "./editorCanvasCluster";
import { computeStructuredLayoutWithStartNode } from "./editorGraphAutoLayout";
import { classifyEditorPage } from "./storyPagesFlatten";
import {
  CARD_BODY_BOTTOM_PAD,
  HEADER_H,
  ROW2_H,
  ROW_H,
} from "@/app/editor/storyCanvas/storyCanvasGeometry";

export type EditorLayoutNode = { x: number; y: number; z?: number };
export type EditorLayoutState = {
  version: 1;
  nodes: Record<string, EditorLayoutNode>;
};

const LAYOUT_VERSION = 1 as const;
const DEFAULT_CARD_W = 200;
const DEFAULT_CARD_H = 112;
/** Oszlopok közötti vízszintes rés (egyezzen az editorGraphAutoLayout COL_GAP-pal). */
const COL_GAP = 88;
const ROW_GAP = 32;
/** Fő gráf jobb széle és a végoldal-oszlop között (world px). */
const END_ZONE_GAP_PX = 56;
/** Végkártya magasság — egyeztetve a `slotCount === 3` end kártyával a storyCanvasGeometry-ben. */
const END_CARD_LAYOUT_EST_H =
  HEADER_H + ROW2_H + 3 * ROW_H + CARD_BODY_BOTTOM_PAD;
/** Extra függőleges rés két végoldal között (world px). */
const END_COLUMN_ROW_GAP_EXTRA = 24;

/** Kártya szélesség + oszlop-rés — vászon koordináták, új oldal a start mellett stb. */
export const EDITOR_LAYOUT_COL_STEP_PX = DEFAULT_CARD_W + COL_GAP;
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
    const zRaw = o.z;
    const z =
      typeof zRaw === "number" && Number.isFinite(zRaw) ? zRaw : undefined;
    nodes[k] = z !== undefined ? { x, y, z } : { x, y };
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
 * Oszlop: BFS mélység; függőleges: piramis (rétegenként kompakt sorok), sorrend layout-fa DFS preorder.
 */
export function computeDefaultLayout(input: {
  pageIds: string[];
  edges: StoryGraphEdge[];
  startPageId: string | null;
  story: Record<string, unknown>;
}): EditorLayoutState {
  return {
    version: LAYOUT_VERSION,
    nodes: finalizeEditorLayoutNodes(
      input.story,
      input.pageIds,
      input.edges,
      input.startPageId
    ),
  };
}

/**
 * Mentett pozíciók figyelmen kívül hagyása: újraszámolás + cluster pack;
 * a régi `z` rétegsorrend megmarad, ahol volt.
 */
export function recomputeEditorLayoutForStory(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): EditorLayoutState {
  const packed = finalizeEditorLayoutNodes(story, pageIds, edges, startPageId);
  const saved = readEditorLayoutFromStory(story);
  if (!saved) return { version: LAYOUT_VERSION, nodes: packed };
  const nextNodes: Record<string, EditorLayoutNode> = { ...packed };
  for (const id of Object.keys(nextNodes)) {
    const z = saved.nodes[id]?.z;
    if (z !== undefined && Number.isFinite(z)) {
      nextNodes[id] = { ...nextNodes[id], z };
    }
  }
  return { version: LAYOUT_VERSION, nodes: nextNodes };
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
        next[id] = { ...next[id], x, y };
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
        next[id] = { ...next[id], x, y };
        x += CLUSTER_CARD_W + CLUSTER_PACK_GAP;
      }
      const n = row.length;
      const rowLeft = next[row[0]!]!.x;
      const rowRight = next[row[n - 1]!]!.x + CLUSTER_CARD_W;
      const midX = (rowLeft + rowRight) / 2;
      next[retryId] = {
        ...next[retryId],
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
      next[id] = { ...next[id], x: xm, y: ym };
      xm += CLUSTER_CARD_W + CLUSTER_PACK_GAP;
    }
  }
  return next;
}

export function collectEndPageIdsFromStory(
  story: Record<string, unknown>
): string[] {
  const out: string[] = [];
  const pages = story.pages;
  const push = (p: unknown) => {
    const rec = asRecord(p);
    if (!rec) return;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return;
    if (classifyEditorPage(rec) === "end") out.push(id);
  };
  if (Array.isArray(pages)) pages.forEach(push);
  else if (pages && typeof pages === "object") {
    Object.values(pages).forEach(push);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export function packEndNodesIntoRightColumn(
  nodes: Record<string, EditorLayoutNode>,
  pageIds: string[],
  endIds: string[],
  options?: { skipPageIds?: ReadonlySet<string> }
): Record<string, EditorLayoutNode> {
  if (!endIds.length) return nodes;
  const skip = options?.skipPageIds ?? new Set<string>();
  const endSet = new Set(endIds);
  let maxRight = 0;
  for (const id of pageIds) {
    if (endSet.has(id)) continue;
    const n = nodes[id];
    if (!n) continue;
    maxRight = Math.max(maxRight, n.x + DEFAULT_CARD_W);
  }
  const baseX = maxRight + COL_GAP + END_ZONE_GAP_PX;
  let y = 20;
  const step = END_CARD_LAYOUT_EST_H + ROW_GAP + END_COLUMN_ROW_GAP_EXTRA;
  const next = { ...nodes };
  for (const id of endIds) {
    if (skip.has(id)) continue;
    const prev = next[id];
    next[id] = prev ? { ...prev, x: baseX, y } : { x: baseX, y };
    y += step;
  }
  return next;
}

function finalizeEditorLayoutNodes(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null,
  structuredBase?: Record<string, EditorLayoutNode>
): Record<string, EditorLayoutNode> {
  const structured =
    structuredBase ??
    computeStructuredLayoutWithStartNode({
      pageIds,
      edges,
      startPageId,
    });
  const clustered = applyClusterHorizontalPacks(
    story,
    { ...structured },
    pageIds
  );
  return packEndNodesIntoRightColumn(
    clustered,
    pageIds,
    collectEndPageIdsFromStory(story)
  );
}

export function ensureLayout(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): EditorLayoutState {
  const fresh = finalizeEditorLayoutNodes(story, pageIds, edges, startPageId);
  const saved = readEditorLayoutFromStory(story);
  if (!saved) {
    return { version: LAYOUT_VERSION, nodes: fresh };
  }
  const nodes = { ...fresh };
  for (const id of pageIds) {
    if (saved.nodes[id]) nodes[id] = { ...saved.nodes[id] };
  }
  if (saved.nodes[STORY_GRAPH_START_NODE_ID]) {
    nodes[STORY_GRAPH_START_NODE_ID] = {
      ...saved.nodes[STORY_GRAPH_START_NODE_ID],
    };
  }
  const packed = applyClusterHorizontalPacks(story, nodes, pageIds);
  const endIds = collectEndPageIdsFromStory(story);
  const skipPackedEnds = new Set(
    endIds.filter((id) => Boolean(saved.nodes[id]))
  );
  return {
    version: LAYOUT_VERSION,
    nodes: packEndNodesIntoRightColumn(packed, pageIds, endIds, {
      skipPageIds: skipPackedEnds,
    }),
  };
}

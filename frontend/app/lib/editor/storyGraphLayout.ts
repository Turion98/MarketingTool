"use client";

import {
  STORY_GRAPH_START_NODE_ID,
  buildStoryGraph,
  type StoryGraphEdge,
} from "./storyGraph";
import {
  computeStructuredLayoutWithStartNode,
  type GraphVerticalAnchorMode,
} from "./editorGraphAutoLayout";
import { classifyEditorPage } from "./storyPagesFlatten";
import {
  CARD_BODY_BOTTOM_PAD,
  HEADER_H,
  ROW2_H,
  ROW_H,
  START_H,
  cardDimensions,
  orderedOutgoingEdges,
} from "@/app/editor/storyCanvas/storyCanvasGeometry";
import { inferEndPageCategoryKey } from "./endPageIdParts";

export type { GraphVerticalAnchorMode } from "./editorGraphAutoLayout";

export { inferEndPageCategoryKey } from "./endPageIdParts";
export {
  buildEndPageId,
  collectEndCategoryKeysFromStory,
  countEndPagesWithCategoryPrefix,
  isValidEndCategorySlug,
  mergeStoryMetaEditorEndCategoryColors,
  mergeStoryMetaEditorEndCategorySlugs,
  parseEndPageIdSegments,
  readEditorEndCategorySlugsFromStory,
  resolveEndPageBodyBackground,
} from "./endPageIdParts";

export type EditorLayoutNode = { x: number; y: number; z?: number };
export type EditorLayoutState = {
  version: 1;
  /**
   * Algoritmus / mentés generáció. Régi JSON-okban hiányzik → `readEditorLayoutFromStory` null,
   * így a szerkesztő nem „ragad rá” a régi, szétnyílt pozíciókra.
   */
  layoutRevision: number;
  nodes: Record<string, EditorLayoutNode>;
};

const LAYOUT_VERSION = 1 as const;
/** Növeld, ha az auto-layout szabályai változnak és a régi mentett pozíciókat el kell dobni. */
export const EDITOR_LAYOUT_REVISION = 14;
const DEFAULT_CARD_W = 200;
const DEFAULT_CARD_H = 112;
/** Oszlopok közötti vízszintes rés (egyezzen az editorGraphAutoLayout COL_GAP-pal). */
const COL_GAP = 56;
const ROW_GAP = 20;
/** Fő gráf jobb széle és a végoldal-oszlop között (world px). */
const END_ZONE_GAP_PX = 56;
/** Végkártya magasság — egyeztetve a `slotCount === 3` end kártyával a storyCanvasGeometry-ben. */
const END_CARD_LAYOUT_EST_H =
  HEADER_H + ROW2_H + 3 * ROW_H + CARD_BODY_BOTTOM_PAD;
/** Extra függőleges rés két végoldal között (world px). */
const END_COLUMN_ROW_GAP_EXTRA = 24;
/**
 * Egyszerű (nem kategóriás) vég-zóna: ennyi kártya után új vízszintes szuboszlop.
 */
const END_ZONE_SUBCOLUMN_MAX_NODES = 6;
/**
 * Kategóriás módban (12 feletti végoldalszám): rövidebb „oszlop” — legfeljebb 4 kártya egymás alatt.
 */
const END_ZONE_SUBCOLUMN_MAX_NODES_GROUPED = 4;
/**
 * Ha a végoldalak száma **szigorúan több mint** ennyi, kategória szerint elkülönített
 * vízszintes blokkokba pakolunk (`end_<kategória>_…` első szegmens).
 */
const END_ZONE_GROUPED_LAYOUT_THRESHOLD = 12;
/** Függőleges rés két kategória-blokk (tömb) között (world px). */
const END_ZONE_CATEGORY_BLOCK_GAP_PX = 104;
/** Vízszintes lépés a vég-szuboszlopok között (world px). */
const END_ZONE_SUBCOLUMN_STEP_X = DEFAULT_CARD_W + 56;

/** Kártya szélesség + oszlop-rés — vászon koordináták, új oldal a start mellett stb. */
export const EDITOR_LAYOUT_COL_STEP_PX = DEFAULT_CARD_W + COL_GAP;

/** Automatikus elrendezés: függőleges lépcső a valós kártyamagassággal (runes opciósávak). */
function buildEditorLayoutCardHeightGetter(
  story: Record<string, unknown>,
  edges: StoryGraphEdge[]
): (pageId: string) => number {
  const { nodes } = buildStoryGraph(story);
  const byId = new Map(nodes.map((n) => [n.pageId, n]));
  const outgoingByFrom = new Map<string, StoryGraphEdge[]>();
  for (const e of edges) {
    if (e.from === STORY_GRAPH_START_NODE_ID) continue;
    const list = outgoingByFrom.get(e.from) ?? [];
    list.push(e);
    outgoingByFrom.set(e.from, list);
  }
  return (pageId: string) => {
    if (pageId === STORY_GRAPH_START_NODE_ID) return START_H;
    const n = byId.get(pageId);
    if (!n) return DEFAULT_CARD_H;
    const ord = orderedOutgoingEdges(
      pageId,
      outgoingByFrom.get(pageId) ?? []
    );
    return cardDimensions(n, ord).h;
  };
}

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
  const revRaw = wrap.layoutRevision;
  const rev = typeof revRaw === "number" ? revRaw : Number(revRaw);
  if (!Number.isFinite(rev) || rev !== EDITOR_LAYOUT_REVISION) return null;
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
  return Object.keys(nodes).length
    ? {
        version: LAYOUT_VERSION,
        layoutRevision: EDITOR_LAYOUT_REVISION,
        nodes,
      }
    : null;
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
      layoutRevision: layout.layoutRevision ?? EDITOR_LAYOUT_REVISION,
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
    layoutRevision: EDITOR_LAYOUT_REVISION,
    nodes: finalizeEditorLayoutNodes(
      input.story,
      input.pageIds,
      input.edges,
      input.startPageId
    ),
  };
}

/**
 * Mentett pozíciók figyelmen kívül hagyása: újraszámolás;
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
  if (!saved) {
    return {
      version: LAYOUT_VERSION,
      layoutRevision: EDITOR_LAYOUT_REVISION,
      nodes: packed,
    };
  }
  const nextNodes: Record<string, EditorLayoutNode> = { ...packed };
  for (const id of Object.keys(nextNodes)) {
    const z = saved.nodes[id]?.z;
    if (z !== undefined && Number.isFinite(z)) {
      nextNodes[id] = { ...nextNodes[id], z };
    }
  }
  return {
    version: LAYOUT_VERSION,
    layoutRevision: EDITOR_LAYOUT_REVISION,
    nodes: nextNodes,
  };
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

/**
 * `meta.startPageId`-től kimenő élek mentén elérhető oldalak.
 * Árva lapok ne toljanak ki indokolatlanul messzire a végzónát (maxRight).
 */
function pagesReachableFromStoryStart(
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): Set<string> | null {
  const idSet = new Set(pageIds);
  const root =
    startPageId && idSet.has(startPageId) ? startPageId : null;
  if (!root) return null;

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === STORY_GRAPH_START_NODE_ID) continue;
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }

  const seen = new Set<string>();
  const q = [root];
  seen.add(root);
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      q.push(v);
    }
  }
  return seen;
}

/**
 * Végoldalak: vízszintes szuboszlopok, oszloponként max `maxRowsPerSubcolumn` kártya.
 * Visszaadja a blokk alsó élének becsült Y + magasság értékét (következő blokk `y` offsethez).
 */
function packEndIdsIntoVerticalStacks(
  next: Record<string, EditorLayoutNode>,
  ids: string[],
  baseX: number,
  yBase: number,
  step: number,
  maxRowsPerSubcolumn: number
): number {
  let col = 0;
  let row = 0;
  let maxBottom = yBase;
  for (const id of ids) {
    if (row >= maxRowsPerSubcolumn) {
      col += 1;
      row = 0;
    }
    const x = baseX + col * END_ZONE_SUBCOLUMN_STEP_X;
    const y = yBase + row * step;
    const prev = next[id];
    next[id] = prev ? { ...prev, x, y } : { x, y };
    maxBottom = Math.max(maxBottom, y + END_CARD_LAYOUT_EST_H);
    row += 1;
  }
  return maxBottom;
}

/** Vég-zóna bal széle (baseX) + start kártya függőleges közepe — world px. */
export function computeEndZoneAnchor(
  nodes: Record<string, EditorLayoutNode>,
  pageIds: string[],
  endIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): { baseX: number; startCenterY: number } | null {
  if (!endIds.length) return null;
  const endSet = new Set(endIds);
  const reachable = pagesReachableFromStoryStart(pageIds, edges, startPageId);
  let maxRight = 0;
  for (const id of pageIds) {
    if (endSet.has(id)) continue;
    if (reachable && !reachable.has(id)) continue;
    const n = nodes[id];
    if (!n) continue;
    maxRight = Math.max(maxRight, n.x + DEFAULT_CARD_W);
  }
  const baseX = maxRight + COL_GAP + END_ZONE_GAP_PX;
  const sn = nodes[STORY_GRAPH_START_NODE_ID];
  const startTop = sn && Number.isFinite(sn.y) ? sn.y : 20;
  const startCenterY = startTop + START_H / 2;
  return { baseX, startCenterY };
}

/** A vég-blokk függőleges középpontját a virtuális start kártya középpontjához igazítja. */
function shiftEndNodesVerticallyAroundStartCenter(
  next: Record<string, EditorLayoutNode>,
  activeEndIds: string[],
  startCenterY: number
): void {
  if (!activeEndIds.length) return;
  let minY = Infinity;
  let maxBottom = -Infinity;
  for (const id of activeEndIds) {
    const n = next[id];
    if (!n || !Number.isFinite(n.y)) continue;
    minY = Math.min(minY, n.y);
    maxBottom = Math.max(maxBottom, n.y + END_CARD_LAYOUT_EST_H);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxBottom)) return;
  const blockCenterY = (minY + maxBottom) / 2;
  const deltaY = startCenterY - blockCenterY;
  for (const id of activeEndIds) {
    const n = next[id];
    if (!n || !Number.isFinite(n.y)) continue;
    next[id] = { ...n, y: n.y + deltaY };
  }
}

export function packEndNodesIntoRightColumn(
  nodes: Record<string, EditorLayoutNode>,
  pageIds: string[],
  endIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null,
  options?: { skipPageIds?: ReadonlySet<string> }
): Record<string, EditorLayoutNode> {
  if (!endIds.length) return nodes;
  const skip = options?.skipPageIds ?? new Set<string>();
  const anchor = computeEndZoneAnchor(
    nodes,
    pageIds,
    endIds,
    edges,
    startPageId
  );
  if (!anchor) return nodes;
  const { baseX, startCenterY } = anchor;
  const step = END_CARD_LAYOUT_EST_H + ROW_GAP + END_COLUMN_ROW_GAP_EXTRA;
  const next = { ...nodes };
  const activeEnds = endIds.filter((id) => !skip.has(id));
  if (!activeEnds.length) return next;

  const useGrouped = activeEnds.length > END_ZONE_GROUPED_LAYOUT_THRESHOLD;

  if (!useGrouped) {
    packEndIdsIntoVerticalStacks(
      next,
      activeEnds,
      baseX,
      0,
      step,
      END_ZONE_SUBCOLUMN_MAX_NODES
    );
  } else {
    const byCat = new Map<string, string[]>();
    for (const id of activeEnds) {
      const k = inferEndPageCategoryKey(id);
      const list = byCat.get(k) ?? [];
      list.push(id);
      byCat.set(k, list);
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => a.localeCompare(b));
    }
    const catKeys = [...byCat.keys()].sort((a, b) => a.localeCompare(b));
    let yBlock = 0;
    for (const k of catKeys) {
      const list = byCat.get(k)!;
      const bottom = packEndIdsIntoVerticalStacks(
        next,
        list,
        baseX,
        yBlock,
        step,
        END_ZONE_SUBCOLUMN_MAX_NODES_GROUPED
      );
      yBlock = bottom + END_ZONE_CATEGORY_BLOCK_GAP_PX;
    }
  }

  shiftEndNodesVerticallyAroundStartCenter(next, activeEnds, startCenterY);
  return next;
}

function finalizeEditorLayoutNodes(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null,
  structuredBase?: Record<string, EditorLayoutNode>,
  opts?: { graphVerticalAnchor?: GraphVerticalAnchorMode }
): Record<string, EditorLayoutNode> {
  const getCardH = buildEditorLayoutCardHeightGetter(story, edges);
  const structured =
    structuredBase ??
    computeStructuredLayoutWithStartNode({
      pageIds,
      edges,
      startPageId,
      dims: {
        cardW: DEFAULT_CARD_W,
        cardH: DEFAULT_CARD_H,
        colGap: COL_GAP,
        rowGap: ROW_GAP,
        getCardH,
      },
      graphVerticalAnchor: opts?.graphVerticalAnchor ?? "balanceWithStart",
    });
  return packEndNodesIntoRightColumn(
    { ...structured },
    pageIds,
    collectEndPageIdsFromStory(story),
    edges,
    startPageId
  );
}

/** Teljes friss layout (strukturált + vég-zóna). `anchor`: start-középpont vs. fix felső sáv. */
export function buildFreshEditorLayoutNodes(
  story: Record<string, unknown>,
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null,
  anchor: GraphVerticalAnchorMode
): Record<string, EditorLayoutNode> {
  return finalizeEditorLayoutNodes(story, pageIds, edges, startPageId, undefined, {
    graphVerticalAnchor: anchor,
  });
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
    return {
      version: LAYOUT_VERSION,
      layoutRevision: EDITOR_LAYOUT_REVISION,
      nodes: fresh,
    };
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
  const endIds = collectEndPageIdsFromStory(story);
  const skipPackedEnds = new Set(
    endIds.filter((id) => Boolean(saved.nodes[id]))
  );
  return {
    version: LAYOUT_VERSION,
    layoutRevision: EDITOR_LAYOUT_REVISION,
    nodes: packEndNodesIntoRightColumn(
      nodes,
      pageIds,
      endIds,
      edges,
      startPageId,
      {
        skipPageIds: skipPackedEnds,
      }
    ),
  };
}

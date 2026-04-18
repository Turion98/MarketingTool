import type { StoryGraphEdge } from "./storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "./storyGraph";

/** Egyezik a storyGraphLayout.ts értékeivel. */
const DEFAULT_CARD_W = 200;
const DEFAULT_CARD_H = 112;
const COL_GAP = 56;
const ROW_GAP = 20;

export type StructuredLayoutDims = {
  cardW: number;
  cardH: number;
  colGap: number;
  rowGap: number;
  /**
   * Oldalankénti becsült magasság (pl. runes sok opciósávval). Ha nincs, `cardH` az egész gráfra.
   */
  getCardH?: (pageId: string) => number;
};

const DEFAULT_DIMS: StructuredLayoutDims = {
  cardW: DEFAULT_CARD_W,
  cardH: DEFAULT_CARD_H,
  colGap: COL_GAP,
  rowGap: ROW_GAP,
};

function resolveCardH(dims: StructuredLayoutDims, pageId: string): number {
  return dims.getCardH?.(pageId) ?? dims.cardH;
}

function buildAdjSorted(
  pageIds: string[],
  edges: StoryGraphEdge[]
): Map<string, string[]> {
  const idSet = new Set(pageIds);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === STORY_GRAPH_START_NODE_ID) continue;
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  for (const [, list] of adj) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return adj;
}

/**
 * BFS rétegek + layout-fa: első felfedező a kanonikus szülő (determinisztikus élrend).
 * A fő komponens után a fő gyökértől nem elérhető részgráfokra külön BFS (szülő / mélység).
 */
function computeDepthAndLayoutParents(
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): {
  depth: Map<string, number>;
  layoutParent: Map<string, string>;
} {
  const idSet = new Set(pageIds);
  const adj = buildAdjSorted(pageIds, edges);

  const mainRoot =
    startPageId && idSet.has(startPageId) ? startPageId : pageIds[0] ?? "";

  const depth = new Map<string, number>();
  const layoutParent = new Map<string, string>();
  const reached = new Set<string>();

  const runBfsFrom = (seeds: string[], isMain: boolean) => {
    const queue: string[] = [];
    for (const s of seeds) {
      if (!idSet.has(s) || reached.has(s)) continue;
      reached.add(s);
      if (isMain) {
        depth.set(s, 0);
      } else if (!depth.has(s)) {
        depth.set(s, 0);
      }
      queue.push(s);
    }
    while (queue.length) {
      const u = queue.shift()!;
      const d = depth.get(u) ?? 0;
      for (const v of adj.get(u) ?? []) {
        if (!idSet.has(v) || reached.has(v)) continue;
        reached.add(v);
        depth.set(v, d + 1);
        layoutParent.set(v, u);
        queue.push(v);
      }
    }
  };

  if (mainRoot) {
    runBfsFrom([mainRoot], true);
  }

  for (const id of [...pageIds].sort((a, b) => a.localeCompare(b))) {
    if (reached.has(id)) continue;
    runBfsFrom([id], false);
  }

  for (const id of pageIds) {
    if (!depth.has(id)) depth.set(id, 0);
  }

  return { depth, layoutParent };
}

function buildChildrenMap(
  pageIds: string[],
  layoutParent: Map<string, string>
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const id of pageIds) {
    const p = layoutParent.get(id);
    if (!p) continue;
    const list = children.get(p) ?? [];
    list.push(id);
    children.set(p, list);
  }
  for (const [, list] of children) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return children;
}

/** DFS preorder a layout-erdőn (gyökér sorrend + rendezett gyerekek). */
function dfsPreorderForest(
  roots: string[],
  children: Map<string, string[]>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (u: string) => {
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
    for (const c of children.get(u) ?? []) {
      visit(c);
    }
  };
  for (const r of roots) {
    visit(r);
  }
  return out;
}

/** Egy mélységi oszlop kártyáinak függőleges középpontja (befoglaló téglalap, változó kártyamagassággal). */
function columnVerticalCenter(
  ids: string[],
  yMap: Map<string, number>,
  getCardH: (id: string) => number
): number {
  if (ids.length === 0) return 0;
  let minT = Infinity;
  let maxB = -Infinity;
  for (const id of ids) {
    const y = yMap.get(id) ?? 0;
    const h = getCardH(id);
    minT = Math.min(minT, y);
    maxB = Math.max(maxB, y + h);
  }
  return (minT + maxB) / 2;
}

/**
 * BFS mélység + mélységenkénti laplista (DFS preorder szerinti sorrend),
 * ugyanaz mint a strukturált auto-layout belső sorrendje.
 */
export function computeStructuredLayoutDepthMetadata(
  pageIds: string[],
  edges: StoryGraphEdge[],
  startPageId: string | null
): {
  depth: Map<string, number>;
  byDepth: Map<number, string[]>;
  depthValues: number[];
} {
  if (pageIds.length === 0) {
    return {
      depth: new Map(),
      byDepth: new Map(),
      depthValues: [],
    };
  }

  const idSet = new Set(pageIds);
  const mainRoot =
    startPageId && idSet.has(startPageId) ? startPageId : pageIds[0]!;

  const { depth, layoutParent } = computeDepthAndLayoutParents(
    pageIds,
    edges,
    startPageId
  );
  const children = buildChildrenMap(pageIds, layoutParent);

  const roots = pageIds
    .filter((id) => !layoutParent.has(id))
    .sort((a, b) => {
      if (a === mainRoot) return -1;
      if (b === mainRoot) return 1;
      return a.localeCompare(b);
    });

  const preorder = dfsPreorderForest(roots, children);
  const preorderRank = new Map<string, number>();
  preorder.forEach((id, i) => preorderRank.set(id, i));
  const tailRank = preorder.length + 1;
  for (const id of pageIds) {
    if (!preorderRank.has(id)) preorderRank.set(id, tailRank);
  }

  const byDepth = new Map<number, string[]>();
  for (const id of pageIds) {
    const d = depth.get(id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(id);
    byDepth.set(d, list);
  }
  for (const [, list] of byDepth) {
    list.sort((a, b) => {
      const ra = preorderRank.get(a) ?? 0;
      const rb = preorderRank.get(b) ?? 0;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }

  const depthValues = [...new Set(pageIds.map((id) => depth.get(id) ?? 0))].sort(
    (a, b) => a - b
  );

  return { depth, byDepth, depthValues };
}

export type StructuredColumnVerticalMode =
  /** Oszlopok függőleges középpontja igazodik a szomszéd oszlophoz (alapértelmezett). */
  | "neighborColumnCenters"
  /** Oszlopok önállóan felülről épülnek; nincs oszlop–oszlop középpont-eltolás. */
  | "columnsFromTop";

/**
 * Piramis / kompakt réteg: X = BFS mélység oszlop; Y = azonos mélységen belül változó magasságú sorlépcső.
 * `neighborColumnCenters`: oszloponként a blokk függőlegesen középre igazít a szomszéd oszlophoz képest.
 */
export function computeStructuredLayoutPositions(
  input: {
    pageIds: string[];
    edges: StoryGraphEdge[];
    startPageId: string | null;
    columnVerticalMode?: StructuredColumnVerticalMode;
  },
  dims: StructuredLayoutDims = DEFAULT_DIMS
): Record<string, { x: number; y: number }> {
  const { pageIds, edges, startPageId, columnVerticalMode } = input;
  const colVert = columnVerticalMode ?? "neighborColumnCenters";
  if (pageIds.length === 0) return {};

  const { depth, byDepth, depthValues } = computeStructuredLayoutDepthMetadata(
    pageIds,
    edges,
    startPageId
  );

  const getH = (id: string) => resolveCardH(dims, id);
  const yPos = new Map<string, number>();
  for (const [, list] of byDepth) {
    let yAcc = 0;
    for (const id of list) {
      yPos.set(id, yAcc);
      yAcc += getH(id) + dims.rowGap;
    }
  }

  const yWorking = new Map(yPos);
  if (colVert === "neighborColumnCenters") {
    for (let i = 1; i < depthValues.length; i++) {
      const d = depthValues[i]!;
      const list = byDepth.get(d) ?? [];
      if (list.length === 0) continue;
      const dPrev = depthValues[i - 1]!;
      const listPrev = byDepth.get(dPrev) ?? [];
      const cPrev = columnVerticalCenter(listPrev, yWorking, getH);
      const cCurr = columnVerticalCenter(list, yWorking, getH);
      const delta = cPrev - cCurr;
      for (const id of list) {
        yWorking.set(id, (yWorking.get(id) ?? 0) + delta);
      }
    }
  }

  let minY = Infinity;
  for (const id of pageIds) {
    const y = yWorking.get(id);
    if (y !== undefined && Number.isFinite(y)) minY = Math.min(minY, y);
  }
  if (!Number.isFinite(minY)) minY = 0;
  const normShift = minY;

  const colIndex = new Map<number, number>();
  depthValues.forEach((d, i) => colIndex.set(d, i));

  const colW = dims.cardW + dims.colGap;
  const nodes: Record<string, { x: number; y: number }> = {};
  for (const id of pageIds) {
    const d = depth.get(id) ?? 0;
    const ci = colIndex.get(d) ?? 0;
    const y = (yWorking.get(id) ?? 0) - normShift;
    nodes[id] = {
      x: ci * colW,
      y,
    };
  }

  return nodes;
}

/** Felső határ (world px) a „felülről” nézethez — a tartalom teteje ehhez igazodik. */
export const GRAPH_TOP_ANCHOR_PAD_PX = 28;

export type GraphVerticalAnchorMode =
  /** Virtuális start a tartalomhoz képest függőlegesen középre (régi viselkedés). */
  | "balanceWithStart"
  /** Fix felső sáv: oszlopok felülről, start is a sávhoz igazítva. */
  | "topBand";

export function computeStructuredLayoutWithStartNode(input: {
  pageIds: string[];
  edges: StoryGraphEdge[];
  startPageId: string | null;
  dims?: StructuredLayoutDims;
  graphVerticalAnchor?: GraphVerticalAnchorMode;
}): Record<string, { x: number; y: number }> {
  const dims = input.dims ?? DEFAULT_DIMS;
  const anchor = input.graphVerticalAnchor ?? "balanceWithStart";
  const getH = (id: string) => resolveCardH(dims, id);
  const columnVerticalMode: StructuredColumnVerticalMode =
    anchor === "topBand" ? "columnsFromTop" : "neighborColumnCenters";
  const nodes = computeStructuredLayoutPositions(
    {
      pageIds: input.pageIds,
      edges: input.edges,
      startPageId: input.startPageId,
      columnVerticalMode,
    },
    dims
  );

  if (anchor === "topBand") {
    const pad = GRAPH_TOP_ANCHOR_PAD_PX;
    for (const id of input.pageIds) {
      const n = nodes[id];
      if (n) nodes[id] = { x: n.x, y: n.y + pad };
    }
    const startY = pad;
    nodes[STORY_GRAPH_START_NODE_ID] = {
      x: -dims.cardW - dims.colGap,
      y: startY,
    };
    return nodes;
  }

  let maxBottom = 0;
  for (const id of input.pageIds) {
    const n = nodes[id];
    if (n) maxBottom = Math.max(maxBottom, n.y + getH(id));
  }
  const startY = Math.max(0, maxBottom / 2 - 24);
  nodes[STORY_GRAPH_START_NODE_ID] = {
    x: -dims.cardW - dims.colGap,
    y: startY,
  };

  return nodes;
}

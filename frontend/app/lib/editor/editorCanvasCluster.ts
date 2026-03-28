"use client";

import type { StoryGraphEdge } from "./storyGraph";
import { collectRiddleNextTargetsInOrder } from "./storyGraph";
import {
  collectStoryPageIds,
  findPageInStoryDocument,
} from "./findPageInStory";

export type EditorCanvasCluster = {
  members: string[];
  /** Riddle-sor (vízszintesen); a retry külön mezőben, a sor felett középen. */
  riddleRowPageIds?: string[];
  retryPageId?: string;
  /** Ha nincs mentett elrendezés: tagok balról jobbra, azonos Y. */
  packHorizontal?: boolean;
  /** Rejtett élek két tag között (pl. D2→D3→D4). */
  hideEdgesBetweenMembers?: boolean;
  /** Kiválasztott külső forrásoktól a csoport tetejéhez köt (pl. D_retry). */
  mergeExternalIngressToTop?: boolean;
  /** Ha üres / hiányzik és mergeExternalIngressToTop: minden külső→tag. */
  ingressTopFromPageIds?: string[];
};

export type RiddleChainContext = {
  rowIds: string[];
  retryPageId: string;
  pageIndex: number;
  isLast: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function isRiddlePageRec(rec: Record<string, unknown>): boolean {
  return rec.type === "puzzle" && rec.kind === "riddle";
}

function isScoreSwitchRiddle(rec: Record<string, unknown>): boolean {
  const onA = asRecord(rec.onAnswer);
  const sw = asRecord(onA?.nextSwitch);
  return sw?.switch === "score";
}

function readScoreDefaultTarget(rec: Record<string, unknown>): string {
  const onA = asRecord(rec.onAnswer);
  const sw = asRecord(onA?.nextSwitch);
  if (sw?.switch !== "score") return "";
  const cases = asRecord(sw?.cases);
  const d = cases?.__default;
  return typeof d === "string" ? d.trim() : "";
}

function uniformRiddleTarget(rec: Record<string, unknown>): string | null {
  const ordered = collectRiddleNextTargetsInOrder(rec);
  if (ordered.length === 0) return null;
  const u = ordered[0]!;
  return ordered.every((t) => t === u) ? u : null;
}

function buildRiddleRowEndingAt(
  lastId: string,
  byId: Map<string, Record<string, unknown>>,
  allIds: string[]
): string[] | null {
  const lastPage = byId.get(lastId);
  if (
    !lastPage ||
    !isRiddlePageRec(lastPage) ||
    !isScoreSwitchRiddle(lastPage)
  ) {
    return null;
  }
  const row: string[] = [lastId];
  let cur = lastId;
  while (true) {
    const preds = allIds.filter((pid) => {
      if (pid === cur) return false;
      const p = byId.get(pid);
      if (!p || !isRiddlePageRec(p)) return false;
      if (isScoreSwitchRiddle(p)) return false;
      const t = uniformRiddleTarget(p);
      return t === cur;
    });
    if (preds.length !== 1) break;
    const pred = preds[0]!;
    if (row.includes(pred)) break;
    row.unshift(pred);
    cur = pred;
  }
  if (row.length < 2) return null;
  return row;
}

/**
 * Láncok felismerése meta.editorCanvasClusters nélkül: utolsó kérdés
 * (`onAnswer.nextSwitch.switch === "score"`), visszafelé egyértelmű
 * riddle→riddle ugrásokkal. A retry cél a score oldal `cases.__default`.
 */
export function inferRiddleClustersFromStory(
  story: Record<string, unknown>
): EditorCanvasCluster[] {
  const allIds = collectStoryPageIds(story);
  const idSet = new Set(allIds);
  const byId = new Map<string, Record<string, unknown>>();
  for (const id of allIds) {
    const p = findPageInStoryDocument(story, id);
    if (p) byId.set(id, p as Record<string, unknown>);
  }

  const terminals = allIds.filter((id) => {
    const p = byId.get(id);
    return p && isRiddlePageRec(p) && isScoreSwitchRiddle(p);
  });

  type Cand = { row: string[]; retryId: string };
  const candidates: Cand[] = [];
  for (const tid of terminals) {
    const row = buildRiddleRowEndingAt(tid, byId, allIds);
    if (!row) continue;
    const lastPage = byId.get(row[row.length - 1]!)!;
    const retryId = readScoreDefaultTarget(lastPage);
    if (!retryId) continue;
    candidates.push({ row, retryId });
  }

  candidates.sort((a, b) => b.row.length - a.row.length);

  const assigned = new Set<string>();
  const clusters: EditorCanvasCluster[] = [];

  for (const { row, retryId } of candidates) {
    const last = row[row.length - 1]!;
    if (assigned.has(last)) continue;
    if (row.some((id) => assigned.has(id))) continue;

    for (const id of row) assigned.add(id);

    const retryInStory = idSet.has(retryId);
    const retryPage = retryInStory ? byId.get(retryId) : undefined;
    const retryIsNonEnd = retryPage && retryPage.type !== "end";

    if (retryInStory) assigned.add(retryId);

    const members = retryInStory ? [...row, retryId] : [...row];

    clusters.push({
      members,
      riddleRowPageIds: row,
      retryPageId: retryId,
      packHorizontal: true,
      hideEdgesBetweenMembers: true,
      mergeExternalIngressToTop: !!retryIsNonEnd,
      ingressTopFromPageIds: retryIsNonEnd ? [retryId] : undefined,
    });
  }

  return clusters;
}

export function getEditorCanvasClustersEffective(
  story: Record<string, unknown>
): EditorCanvasCluster[] {
  const explicit = readEditorCanvasClusters(story);
  const touched = new Set<string>();
  for (const c of explicit) {
    for (const m of c.members) touched.add(m);
  }
  const inferred = inferRiddleClustersFromStory(story).filter(
    (c) => !c.members.some((id) => touched.has(id))
  );
  return [...explicit, ...inferred];
}

export function findRiddleChainContext(
  story: Record<string, unknown>,
  pageId: string
): RiddleChainContext | null {
  for (const c of getEditorCanvasClustersEffective(story)) {
    const row =
      c.riddleRowPageIds?.filter(
        (x) => typeof x === "string" && x.trim() !== ""
      ) ?? [];
    if (row.length < 2) continue;
    let retry =
      typeof c.retryPageId === "string" ? c.retryPageId.trim() : "";
    if (!retry) {
      const lastId = row[row.length - 1]!;
      const lastP = findPageInStoryDocument(story, lastId);
      if (lastP) retry = readScoreDefaultTarget(lastP as Record<string, unknown>);
    }
    if (!retry) continue;
    const idx = row.indexOf(pageId);
    if (idx >= 0) {
      return {
        rowIds: row,
        retryPageId: retry,
        pageIndex: idx,
        isLast: idx === row.length - 1,
      };
    }
  }
  return null;
}

export function readEditorCanvasClusters(
  story: Record<string, unknown>
): EditorCanvasCluster[] {
  const meta = asRecord(story.meta);
  if (!meta) return [];
  const raw = meta.editorCanvasClusters;
  if (!Array.isArray(raw)) return [];
  const out: EditorCanvasCluster[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const rowIds = Array.isArray(o.riddleRowPageIds)
      ? o.riddleRowPageIds.filter(
          (x): x is string => typeof x === "string" && x.trim() !== ""
        )
      : [];
    const retryId =
      typeof o.retryPageId === "string" && o.retryPageId.trim()
        ? o.retryPageId.trim()
        : "";
    let members = Array.isArray(o.members)
      ? o.members.filter((x): x is string => typeof x === "string" && !!x)
      : [];
    if (rowIds.length >= 2 && retryId) {
      members = [...rowIds, retryId];
    }
    if (members.length < 2) continue;
    const fromPages = Array.isArray(o.ingressTopFromPageIds)
      ? o.ingressTopFromPageIds.filter(
          (x): x is string => typeof x === "string" && !!x
        )
      : undefined;
    out.push({
      members,
      riddleRowPageIds: rowIds.length >= 2 ? rowIds : undefined,
      retryPageId: retryId || undefined,
      packHorizontal: o.packHorizontal === true,
      hideEdgesBetweenMembers: o.hideEdgesBetweenMembers !== false,
      mergeExternalIngressToTop: o.mergeExternalIngressToTop === true,
      ingressTopFromPageIds:
        fromPages && fromPages.length ? fromPages : undefined,
    });
  }
  return out;
}

export function findClusterContainingPageId(
  clusters: EditorCanvasCluster[],
  pageId: string
): EditorCanvasCluster | undefined {
  return clusters.find((c) => c.members.includes(pageId));
}

export function clusterMemberIdsToDrag(
  clusters: EditorCanvasCluster[],
  pageId: string
): string[] {
  const c = findClusterContainingPageId(clusters, pageId);
  return c ? [...c.members] : [pageId];
}

export function isClusterInternalEdge(
  e: StoryGraphEdge,
  cluster: EditorCanvasCluster
): boolean {
  if (!cluster.hideEdgesBetweenMembers) return false;
  const row = cluster.riddleRowPageIds?.filter(Boolean) ?? [];
  const retry = cluster.retryPageId?.trim();
  if (row.length >= 2) {
    for (let i = 0; i < row.length - 1; i++) {
      if (e.from === row[i] && e.to === row[i + 1]) return true;
    }
    if (retry && e.from === retry && e.to === row[0]) return true;
    if (retry) return false;
  }
  const set = new Set(cluster.members);
  return set.has(e.from) && set.has(e.to);
}

export function filterOutClusterInternalEdges(
  edges: StoryGraphEdge[],
  clusters: EditorCanvasCluster[]
): StoryGraphEdge[] {
  if (!clusters.length) return edges;
  return edges.filter(
    (e) => !clusters.some((c) => isClusterInternalEdge(e, c))
  );
}

export function shouldUseTopIngress(
  e: StoryGraphEdge,
  c: EditorCanvasCluster
): boolean {
  if (!c.mergeExternalIngressToTop) return false;
  if (!c.members.includes(e.to)) return false;
  if (c.members.includes(e.from)) return false;
  const allow = c.ingressTopFromPageIds;
  if (!allow || allow.length === 0) return true;
  return allow.includes(e.from);
}

export function findClusterForTopIngress(
  clusters: EditorCanvasCluster[],
  e: StoryGraphEdge
): EditorCanvasCluster | undefined {
  return clusters.find((c) => shouldUseTopIngress(e, c));
}

export type WorldNodeMetrics = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function clusterTopIngressPoint(
  world: Map<string, WorldNodeMetrics>,
  cluster: EditorCanvasCluster
): { cx: number; top: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let any = false;
  for (const id of cluster.members) {
    const n = world.get(id);
    if (!n) continue;
    any = true;
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.w);
    minY = Math.min(minY, n.y);
  }
  if (!any || !Number.isFinite(minX)) return null;
  return { cx: (minX + maxX) / 2, top: minY };
}

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  STORY_GRAPH_START_NODE_ID,
  buildPathFlowClusters,
  buildStoryGraph,
  bundleIncomingEdgesForTarget,
  type StoryGraphEdge,
  type StoryGraphNode,
} from "@/app/lib/editor/storyGraph";
import {
  buildMetroMapLayout,
  collectDownstreamNodeIds,
  nodeIdsForMetroSegment,
} from "@/app/lib/editor/metroMapLayout";
import {
  clusterMemberIdsToDrag,
  clusterMemberIdsToDragUnion,
  getEditorCanvasClustersEffective,
} from "@/app/lib/editor/editorCanvasCluster";
import { editorPageMilestoneActive } from "@/app/lib/editor/storyChoiceFragmentIds";
import {
  EDITOR_LAYOUT_COL_STEP_PX,
  buildFreshEditorLayoutNodes,
  collectEndPageIdsFromStory,
  EDITOR_LAYOUT_REVISION,
  ensureLayout,
  mergeEditorLayoutIntoStory,
  recomputeEditorLayoutForStory,
  type EditorLayoutNode,
  type EditorLayoutState,
} from "@/app/lib/editor/storyGraphLayout";
import { computeEndCategoryClusterCanvasLayout } from "@/app/lib/editor/endCategoryCanvasLayout";
import {
  collectEndCategoryKeysFromStory,
  inferEndPageCategoryKey,
  resolveEndPageBodyBackground,
} from "@/app/lib/editor/endPageIdParts";
import {
  CATEGORY_LABELS,
  EDITOR_CATEGORY_ORDER,
  type EditorPageCategory,
  flattenStoryPages,
  groupPagesByCategory,
} from "@/app/lib/editor/storyPagesFlatten";
import { collectStoryPageIds } from "@/app/lib/editor/findPageInStory";
import {
  applyEditorLayout,
  removePageFromStory,
} from "@/app/lib/editor/storyPagePatch";
import {
  appendPageToStory,
  buildEmptyPageForCategory,
  isEditorPendingPageId,
} from "@/app/lib/editor/storyTemplateInsert";
import type { PageValidationIssue } from "@/app/lib/editor/pageInspectorValidation";
import {
  cardDimensions,
  editorEndCardAccentFrameStyle,
  editorEndCardAccentHeaderStripStyle,
  editorEndCardAccentStyle,
  inputPortYs,
  isRiddleNode,
  orderedOutgoingEdges,
  outPortY,
  outgoingSlotIndexForEdge,
  slotCount,
} from "./storyCanvasGeometry";
import StoryCard from "./StoryCard";
import { computeDistantInboundYByKey } from "./distantInboundLayout";
import {
  StoryDistantEdgeChips,
  StoryDistantEdgeLines,
} from "./StoryDistantEdgeDecor";
import {
  StoryEndIngressChips,
  StoryEndIngressLines,
} from "./StoryEndIngressDecor";
import StoryEdges, { buildEdgeLayers } from "./StoryEdges";
import EditorEndCategoriesPopover from "../EditorEndCategoriesPopover";
import s from "./storyCanvas.module.scss";

/** Vég kategória csoport a csúszkán — ugyanaz a szín-hash mint az outline end sablon. */
const CATEGORY_STRIP_END_ACCENT_ID = "__editor_end_page_template__";

const CATEGORY_STRIP_POPOVER_GAP_PX = 4;

/** Teljes képernyő: szélhez húzva folyamatos pásztázás */
const EDGE_PAN_MARGIN_PX = 26;
const EDGE_PAN_MAX_STEP = 13;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function metroHueFromId(id: string): number {
  let h = 216;
  for (let i = 0; i < id.length; i++) {
    h = (h * 33 + id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.1;
/** Ha a régi vagy új zoom ≤ ez, a nagyítás a fókuszpont (görgő: kurzor, +/-: kép közepe) körül marad. */
const ZOOM_CURSOR_ANCHOR_MAX = 0.45;

/**
 * `transform: translate(pan) scale(z)` + `transform-origin: 0 0` mellett:
 * ugyanaz a világbeli pont maradjon a `focalX / focalY` viewport-pont alatt.
 */
function computeAnchoredPanForZoom(
  pan0: { x: number; y: number },
  z0: number,
  z2: number,
  focalX: number,
  focalY: number
): { x: number; y: number } | null {
  if (Math.abs(z0) < 1e-6) return null;
  if (z0 > ZOOM_CURSOR_ANCHOR_MAX && z2 > ZOOM_CURSOR_ANCHOR_MAX) return null;
  return {
    x: focalX - (focalX - pan0.x) * (z2 / z0),
    y: focalY - (focalY - pan0.y) * (z2 / z0),
  };
}

const CANVAS_VIEWPORT_HEIGHT_LS = "questell:editor:storyCanvasViewportPx";

/** Egyeznie kell a `.viewport` `min-height` értékével a storyCanvas.module.scss-ben */
const MIN_CANVAS_VIEWPORT_PX = 220;

/** Új kártya a virtuális kezdő csomóponttól (world koordináta). */
const NEAR_START_DX = 130;
const NEAR_START_DY = -22;

const CATEGORY_STRIP_SCROLL_STEP_PX = 260;

/** Üres vászon „kattintás” vs pásztázás: ennél kisebb elmozdulás = kattintás. */
const VIEWPORT_CLICK_MOVE_THRESHOLD_PX = 5;

/** Shift + üres vászon: téglalap kijelölés minimális mérete (képernyő px). */
const MARQUEE_MIN_DRAG_PX = 4;

function clientRectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: Pick<DOMRect, "left" | "top" | "right" | "bottom">
): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function maxCanvasViewportPx(inFullscreen: boolean) {
  if (typeof window === "undefined") return 920;
  const inner = window.innerHeight;
  if (inFullscreen) {
    return Math.max(
      MIN_CANVAS_VIEWPORT_PX,
      Math.min(Math.round(inner * 0.88), inner - 120)
    );
  }
  return Math.min(920, Math.round(inner * 0.92));
}

function defaultCanvasViewportPx() {
  if (typeof window === "undefined") return 360;
  return Math.round(
    clamp(window.innerHeight * 0.38, MIN_CANVAS_VIEWPORT_PX, 720)
  );
}

const START_SYNTH: StoryGraphNode = {
  pageId: STORY_GRAPH_START_NODE_ID,
  category: "other",
  raw: {},
  isLogicPage: false,
  isPuzzlePage: false,
  choiceCount: 0,
};

/** Gráf oszlop-nézet: alap = starthez igazított függőleges egyensúly; felül = fix felső sáv. */
type EditorGraphColumnViewMode = "startBalanced" | "topStack";

type StoryCanvasProps = {
  draftStory: Record<string, unknown>;
  onStoryChange: (next: Record<string, unknown>) => void;
  selectedPageIds: string[];
  onSelectPageIds: (pageIds: string[]) => void;
  issuesByPage: Map<string, PageValidationIssue[]>;
  metaIssues: PageValidationIssue[];
  /** Panelben: nincs dupla keret */
  embedded?: boolean;
  /** Kártya / inspektor törlés — megerősítés a hívóban. */
  onDeletePage?: (pageId: string) => void;
  /** Kártya tartalom alaphelyzetbe (ID marad). */
  onCleanPage?: (pageId: string) => void;
  /** Kártya duplikálás új, egyedi ID-val. */
  onDuplicatePage?: (pageId: string) => void;
  /** Dupla kattintásos oldal-ID a kártyán; `null` = siker. */
  onRenamePageId?: (fromId: string, toId: string) => string | null;
  /** Új függő oldal létrejöttekor (pl. jobb panel megnyitása). */
  onPendingPageCreated?: () => void;
  /** Bal szél: teljes képernyő, sztori választó, mentés stb. */
  visualBarLeading?: ReactNode;
  /** Új sztori meta fázis: nincs szerkesztés a vásznon. */
  interactionLocked?: boolean;
  /** Szülő szerinti teljes képernyő — nagyobb max vászon magasság. */
  canvasFullscreen?: boolean;
  /**
   * Csak teljes képernyőn: vezérlősáv alatt, a vászon melletti jobb oszlop
   * (szülő adja, pl. előnézet + inspektor).
   */
  fullscreenSideSlot?: ReactNode;
};

type EditorViewMode = "graph" | "pathFlow" | "metro";

export default function StoryCanvas({
  draftStory,
  onStoryChange,
  selectedPageIds,
  onSelectPageIds,
  issuesByPage,
  metaIssues,
  embedded = false,
  onDeletePage,
  onCleanPage,
  onDuplicatePage,
  onRenamePageId,
  onPendingPageCreated,
  visualBarLeading,
  interactionLocked = false,
  canvasFullscreen = false,
  fullscreenSideSlot,
}: StoryCanvasProps) {
  const [viewMode] = useState<EditorViewMode>("graph");
  const [focusedPathClusterId, setFocusedPathClusterId] = useState<string | null>(
    null
  );
  const [graphPathFilterClusterId, setGraphPathFilterClusterId] = useState<
    string | null
  >(null);
  const [graphPathFilterNodeIdsOverride, setGraphPathFilterNodeIdsOverride] =
    useState<Set<string> | null>(null);
  const [expandedPathBubbleId, setExpandedPathBubbleId] = useState<string | null>(
    null
  );
  const [metroDrillNodeSet, setMetroDrillNodeSet] = useState<Set<string> | null>(
    null
  );
  /** Vég csík: + helyett lenyíló (végoldal / kategóriák). Portálon, mert a vízszintes scroll clipeli. */
  const [endToolbarPhase, setEndToolbarPhase] = useState<
    null | "menu" | "categories"
  >(null);
  const [endToolbarPopoverBox, setEndToolbarPopoverBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const endToolbarMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const endToolbarPopoverRef = useRef<HTMLDivElement | null>(null);
  const { nodes, edges, startPageId } = useMemo(
    () => buildStoryGraph(draftStory),
    [draftStory]
  );
  const pathFlowClusters = useMemo(
    () => buildPathFlowClusters(nodes, edges),
    [nodes, edges]
  );
  useEffect(() => {
    if (viewMode !== "pathFlow") {
      setFocusedPathClusterId(null);
      setExpandedPathBubbleId(null);
    } else {
      setGraphPathFilterClusterId(null);
      setGraphPathFilterNodeIdsOverride(null);
    }
    if (viewMode !== "metro") {
      setMetroDrillNodeSet(null);
    }
  }, [viewMode]);

  const pageIds = useMemo(() => nodes.map((n) => n.pageId), [nodes]);
  const pathClusterById = useMemo(
    () => new Map(pathFlowClusters.map((c) => [c.id, c])),
    [pathFlowClusters]
  );
  const pathBubbleGroups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; nodeIds: Set<string> }>();
    for (const c of pathFlowClusters) {
      const k = c.startNodeId;
      const got = m.get(k);
      if (got) {
        for (const n of c.nodeIds) got.nodeIds.add(n);
      } else {
        m.set(k, {
          id: `bubble_${k}`,
          name: `Path · ${k}`,
          nodeIds: new Set(c.nodeIds),
        });
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [pathFlowClusters]);
  const pathBubbleById = useMemo(
    () => new Map(pathBubbleGroups.map((b) => [b.id, b])),
    [pathBubbleGroups]
  );
  const expandedPathNodeSet = useMemo(() => {
    if (!expandedPathBubbleId) return null;
    const b = pathBubbleById.get(expandedPathBubbleId);
    if (!b) return null;
    return new Set(b.nodeIds);
  }, [expandedPathBubbleId, pathBubbleById]);
  const graphFilterNodeIds = useMemo(() => {
    if (graphPathFilterNodeIdsOverride) return graphPathFilterNodeIdsOverride;
    if (!graphPathFilterClusterId) return null;
    const c = pathClusterById.get(graphPathFilterClusterId);
    if (!c) return null;
    return new Set(c.nodeIds);
  }, [
    graphPathFilterClusterId,
    pathClusterById,
    graphPathFilterNodeIdsOverride,
  ]);

  const canvasClusters = useMemo(
    () => getEditorCanvasClustersEffective(draftStory),
    [draftStory]
  );

  const layout = useMemo(
    () => ensureLayout(draftStory, pageIds, edges, startPageId),
    [draftStory, pageIds, edges, startPageId]
  );
  const balancedLayoutRef = useRef(layout);
  balancedLayoutRef.current = layout;

  const [graphColumnViewMode, setGraphColumnViewMode] =
    useState<EditorGraphColumnViewMode>("startBalanced");

  const [localLayout, setLocalLayout] = useState<EditorLayoutState>(layout);
  const layoutRef = useRef(localLayout);
  layoutRef.current = localLayout;
  useEffect(() => {
    setLocalLayout(layout);
    setGraphColumnViewMode("startBalanced");
  }, [layout]);

  const [pan, setPan] = useState({ x: 48, y: 36 });
  const [zoom, setZoom] = useState(1);
  const panZoomAnchorRef = useRef({ pan: { x: 48, y: 36 }, zoom: 1 });
  panZoomAnchorRef.current = { pan, zoom };

  const [canvasH, setCanvasH] = useState(() =>
    Math.max(MIN_CANVAS_VIEWPORT_PX, defaultCanvasViewportPx())
  );
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{
    ids: string[];
    sx: number;
    sy: number;
    startPositions: Record<string, EditorLayoutNode>;
  } | null>(null);
  const panRef = useRef<{
    sx: number;
    sy: number;
    px: number;
    py: number;
    moved: boolean;
  } | null>(null);
  const marqueeDragRef = useRef<{
    cx0: number;
    cy0: number;
    cx1: number;
    cy1: number;
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const canvasHRef = useRef(canvasH);
  canvasHRef.current = canvasH;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [overlayMountEl, setOverlayMountEl] = useState<HTMLDivElement | null>(
    null
  );
  const setOverlayPortalEl = useCallback((el: HTMLDivElement | null) => {
    setOverlayMountEl(el);
  }, []);
  const lastMouseClientRef = useRef({ x: 0, y: 0 });
  const edgePanLoopRef = useRef<number | null>(null);
  const cardRootRefs = useRef(new Map<string, HTMLDivElement>());
  const cardRootRefCbByPage = useRef(
    new Map<string, (el: HTMLDivElement | null) => void>()
  );
  const getCardRootRef = useCallback((pageId: string) => {
    let cb = cardRootRefCbByPage.current.get(pageId);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) cardRootRefs.current.set(pageId, el);
        else cardRootRefs.current.delete(pageId);
      };
      cardRootRefCbByPage.current.set(pageId, cb);
    }
    return cb;
  }, []);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const categoryStripScrollRef = useRef<HTMLDivElement>(null);
  const categoryStripPopoverRef = useRef<HTMLDivElement | null>(null);
  const categoryStripAnchorRefs = useRef<
    Partial<Record<EditorPageCategory, HTMLButtonElement | null>>
  >({});
  const [openCategory, setOpenCategory] = useState<EditorPageCategory | null>(
    null
  );
  const [categoryPopoverBox, setCategoryPopoverBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [catStripNav, setCatStripNav] = useState({
    canBack: false,
    canFwd: false,
  });

  const pagesByCategory = useMemo(
    () => groupPagesByCategory(flattenStoryPages(draftStory)),
    [draftStory]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CANVAS_VIEWPORT_HEIGHT_LS);
      if (raw) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          const maxH = maxCanvasViewportPx(canvasFullscreen);
          setCanvasH(clamp(parsed, MIN_CANVAS_VIEWPORT_PX, maxH));
        }
      }
    } catch {
      /* ignore */
    }
  }, [canvasFullscreen]);

  useEffect(() => {
    const onWinResize = () => {
      const maxH = maxCanvasViewportPx(canvasFullscreen);
      setCanvasH((h) => clamp(h, MIN_CANVAS_VIEWPORT_PX, maxH));
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, [canvasFullscreen]);

  const nodesWithStart = useMemo(() => {
    const hasStartEdge = edges.some(
      (e) => e.from === STORY_GRAPH_START_NODE_ID
    );
    if (!hasStartEdge) return nodes;
    return [START_SYNTH, ...nodes];
  }, [nodes, edges]);

  const graphRenderNodesWithStart = useMemo(() => {
    if (!graphFilterNodeIds) return nodesWithStart;
    return nodesWithStart.filter(
      (n) =>
        n.pageId === STORY_GRAPH_START_NODE_ID || graphFilterNodeIds.has(n.pageId)
    );
  }, [nodesWithStart, graphFilterNodeIds]);

  const graphRenderEdges = useMemo(() => {
    if (!graphFilterNodeIds) return edges;
    return edges.filter((e) => {
      if (e.from === STORY_GRAPH_START_NODE_ID) {
        return graphFilterNodeIds.has(e.to);
      }
      return graphFilterNodeIds.has(e.from) && graphFilterNodeIds.has(e.to);
    });
  }, [edges, graphFilterNodeIds]);

  const outgoingByPage = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of graphRenderEdges) {
      const list = m.get(e.from) ?? [];
      list.push(e);
      m.set(e.from, list);
    }
    return m;
  }, [graphRenderEdges]);

  const incomingEdgesByTarget = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of graphRenderEdges) {
      const list = m.get(e.to) ?? [];
      list.push(e);
      m.set(e.to, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return m;
  }, [graphRenderEdges]);

  const endPageIds = useMemo(
    () => collectEndPageIdsFromStory(draftStory),
    [draftStory]
  );
  const endPageIdSet = useMemo(
    () => new Set(endPageIds),
    [endPageIds]
  );
  const endCategoryPicklist = useMemo(
    () => collectEndCategoryKeysFromStory(draftStory),
    [draftStory]
  );

  const [expandedEndCategoryKey, setExpandedEndCategoryKey] = useState<
    string | null
  >(null);

  const endIdsForCluster = useMemo(() => {
    if (!graphFilterNodeIds) return endPageIds;
    return endPageIds.filter((id) => graphFilterNodeIds.has(id));
  }, [endPageIds, graphFilterNodeIds]);

  const endClusterCanvasLayout = useMemo(() => {
    if (viewMode !== "graph" || !endIdsForCluster.length) return null;
    return computeEndCategoryClusterCanvasLayout({
      nodes: localLayout.nodes,
      pageIds,
      endIds: endIdsForCluster,
      edges,
      startPageId,
      expandedCategoryKey: expandedEndCategoryKey,
    });
  }, [
    viewMode,
    endIdsForCluster,
    localLayout.nodes,
    pageIds,
    edges,
    startPageId,
    expandedEndCategoryKey,
  ]);

  const endClusterSnapSig = useMemo(() => {
    if (!endClusterCanvasLayout) return "";
    return JSON.stringify(endClusterCanvasLayout.endPagePositions);
  }, [endClusterCanvasLayout]);

  // endClusterCanvasLayout olvasása a snaphez — a stabil aláírás: endClusterSnapSig.
  useLayoutEffect(() => {
    if (viewMode !== "graph" || !expandedEndCategoryKey || !endClusterCanvasLayout)
      return;
    const pack = endClusterCanvasLayout.endPagePositions;
    const keys = Object.keys(pack);
    if (!keys.length) return;
    setLocalLayout((prev) => {
      const nodes = { ...prev.nodes };
      let changed = false;
      for (const id of keys) {
        const p = pack[id]!;
        const cur = nodes[id];
        if (
          !cur ||
          Math.abs(cur.x - p.x) > 0.5 ||
          Math.abs(cur.y - p.y) > 0.5
        ) {
          nodes[id] = cur ? { ...cur, x: p.x, y: p.y } : { x: p.x, y: p.y };
          changed = true;
        }
      }
      return changed ? { ...prev, nodes } : prev;
    });
  }, [viewMode, expandedEndCategoryKey, endClusterSnapSig]);

  useEffect(() => {
    if (!expandedEndCategoryKey) return;
    const keys = new Set(
      endIdsForCluster.map((id) => inferEndPageCategoryKey(id))
    );
    if (!keys.has(expandedEndCategoryKey)) {
      setExpandedEndCategoryKey(null);
    }
  }, [endIdsForCluster, expandedEndCategoryKey]);

  const graphCanvasRenderNodes = useMemo(() => {
    if (viewMode !== "graph") return graphRenderNodesWithStart;
    if (!endPageIds.length) return graphRenderNodesWithStart;
    if (!endIdsForCluster.length) {
      return graphRenderNodesWithStart.filter((n) => n.category !== "end");
    }
    if (!endClusterCanvasLayout) return graphRenderNodesWithStart;
    return graphRenderNodesWithStart.filter((n) => {
      if (n.category !== "end") return true;
      return inferEndPageCategoryKey(n.pageId) === expandedEndCategoryKey;
    });
  }, [
    viewMode,
    graphRenderNodesWithStart,
    endPageIds.length,
    endIdsForCluster,
    endClusterCanvasLayout,
    expandedEndCategoryKey,
  ]);

  const endCategoryCardMeta = useMemo(() => {
    if (!endClusterCanvasLayout) return [];
    const m = new Map<string, number>();
    for (const id of endIdsForCluster) {
      const k = inferEndPageCategoryKey(id);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return endClusterCanvasLayout.categoryCards.map((c) => ({
      ...c,
      count: m.get(c.key) ?? 0,
    }));
  }, [endClusterCanvasLayout, endIdsForCluster]);

  /** Kategória-kártyán (összeomlott vég): csak a „be” chip rejtve; forrás chip + vonal marad. */
  const hideEndIngressInboundOnCategoryCard = useCallback(
    (toPageId: string) => {
      if (viewMode !== "graph" || !endClusterCanvasLayout) return false;
      if (!endPageIdSet.has(toPageId)) return false;
      return expandedEndCategoryKey !== inferEndPageCategoryKey(toPageId);
    },
    [viewMode, endClusterCanvasLayout, endPageIdSet, expandedEndCategoryKey]
  );

  const metroLayout = useMemo(
    () =>
      buildMetroMapLayout({
        edges,
        endPageIds,
        labelForPageId: (id) => id,
      }),
    [edges, endPageIds]
  );

  const metroEdgePairs = useMemo(
    () => edges.map((e) => ({ from: e.from, to: e.to })),
    [edges]
  );

  const worldMetrics = useMemo(() => {
    const world = new Map<
      string,
      {
        x: number;
        y: number;
        w: number;
        h: number;
        outSlotY: Map<string, number>;
        inSlotY: Map<string, number>;
      }
    >();

    for (const n of graphRenderNodesWithStart) {
      const clusterWorld = endClusterCanvasLayout?.endPageWorld[n.pageId];
      const pos = clusterWorld?.collapsed
        ? { x: clusterWorld.x, y: clusterWorld.y }
        : localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
      const out = outgoingByPage.get(n.pageId) ?? [];
      const ord = orderedOutgoingEdges(n.pageId, out);
      const { w, h } =
        clusterWorld?.collapsed
          ? { w: clusterWorld.w, h: clusterWorld.h }
          : cardDimensions(n, ord);

      const outSlotY = new Map<string, number>();
      const riddlePortRows =
        n.pageId !== STORY_GRAPH_START_NODE_ID && isRiddleNode(n)
          ? slotCount(n, ord)
          : 0;
      ord.forEach((e, edgeIdx) => {
        let slot = edgeIdx;
        if (riddlePortRows > 0) {
          slot = Math.min(edgeIdx, riddlePortRows - 1);
        } else if (
          n.pageId !== STORY_GRAPH_START_NODE_ID &&
          n.isPuzzlePage &&
          n.puzzleKind === "runes"
        ) {
          slot = outgoingSlotIndexForEdge(n, ord, edgeIdx);
        }
        const py =
          n.pageId === STORY_GRAPH_START_NODE_ID ? h / 2 : outPortY(slot);
        outSlotY.set(e.id, py);
      });

      const incAll = incomingEdgesByTarget.get(n.pageId) ?? [];
      const bundles = bundleIncomingEdgesForTarget(incAll);
      const inYs = inputPortYs(bundles.length, h, {
        logicLayout: n.isLogicPage,
      });
      const inSlotY = new Map<string, number>();
      bundles.forEach((bundle, i) => {
        const py = inYs[i] ?? h / 2;
        for (const e of bundle) {
          inSlotY.set(e.id, py);
        }
      });

      world.set(n.pageId, {
        x: pos.x,
        y: pos.y,
        w,
        h,
        outSlotY,
        inSlotY,
      });
    }

    return world;
  }, [
    graphRenderNodesWithStart,
    localLayout,
    outgoingByPage,
    incomingEdgesByTarget,
    endClusterCanvasLayout,
  ]);

  const { localOps: edgeOps, distantBundles, endIngressBundles } = useMemo(
    () =>
      buildEdgeLayers({
        edges: graphRenderEdges,
        world: worldMetrics,
        clusters: canvasClusters,
        endTargetPageIds: endPageIdSet,
      }),
    [graphRenderEdges, worldMetrics, canvasClusters, endPageIdSet]
  );

  const pathExpandedEdges = useMemo(() => {
    if (!expandedPathNodeSet) return [] as StoryGraphEdge[];
    return edges.filter((e) => {
      if (e.from === STORY_GRAPH_START_NODE_ID) return expandedPathNodeSet.has(e.to);
      return expandedPathNodeSet.has(e.from) && expandedPathNodeSet.has(e.to);
    });
  }, [expandedPathNodeSet, edges]);

  const pathExpandedNodesWithStart = useMemo(() => {
    if (!expandedPathNodeSet) return [] as StoryGraphNode[];
    return nodesWithStart.filter(
      (n) => n.pageId === STORY_GRAPH_START_NODE_ID || expandedPathNodeSet.has(n.pageId)
    );
  }, [expandedPathNodeSet, nodesWithStart]);

  const pathExpandedOutgoingByPage = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of pathExpandedEdges) {
      const list = m.get(e.from) ?? [];
      list.push(e);
      m.set(e.from, list);
    }
    return m;
  }, [pathExpandedEdges]);

  const pathExpandedIncomingByTarget = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of pathExpandedEdges) {
      const list = m.get(e.to) ?? [];
      list.push(e);
      m.set(e.to, list);
    }
    for (const [, list] of m) list.sort((a, b) => a.id.localeCompare(b.id));
    return m;
  }, [pathExpandedEdges]);

  const { localOps: pathExpandedEdgeOps } = useMemo(
    () =>
      buildEdgeLayers({
        edges: pathExpandedEdges,
        world: worldMetrics,
        clusters: canvasClusters,
        endTargetPageIds: endPageIdSet,
      }),
    [pathExpandedEdges, worldMetrics, canvasClusters, endPageIdSet]
  );

  const metroExpandedEdges = useMemo(() => {
    if (!metroDrillNodeSet) return [] as StoryGraphEdge[];
    return edges.filter((e) => {
      if (e.from === STORY_GRAPH_START_NODE_ID) {
        return metroDrillNodeSet.has(e.to);
      }
      return metroDrillNodeSet.has(e.from) && metroDrillNodeSet.has(e.to);
    });
  }, [metroDrillNodeSet, edges]);

  const metroExpandedNodesWithStart = useMemo(() => {
    if (!metroDrillNodeSet) return [] as StoryGraphNode[];
    return nodesWithStart.filter(
      (n) =>
        n.pageId === STORY_GRAPH_START_NODE_ID ||
        metroDrillNodeSet.has(n.pageId)
    );
  }, [metroDrillNodeSet, nodesWithStart]);

  const metroExpandedOutgoingByPage = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of metroExpandedEdges) {
      const list = m.get(e.from) ?? [];
      list.push(e);
      m.set(e.from, list);
    }
    return m;
  }, [metroExpandedEdges]);

  const metroExpandedIncomingByTarget = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of metroExpandedEdges) {
      const list = m.get(e.to) ?? [];
      list.push(e);
      m.set(e.to, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return m;
  }, [metroExpandedEdges]);

  const { localOps: metroExpandedEdgeOps } = useMemo(
    () =>
      buildEdgeLayers({
        edges: metroExpandedEdges,
        world: worldMetrics,
        clusters: canvasClusters,
        endTargetPageIds: endPageIdSet,
      }),
    [metroExpandedEdges, worldMetrics, canvasClusters, endPageIdSet]
  );

  const [hoveredDistantKey, setHoveredDistantKey] = useState<string | null>(
    null
  );
  const [hoveredEndIngressKey, setHoveredEndIngressKey] = useState<
    string | null
  >(null);

  const distantEdgeIdSet = useMemo(
    () => new Set(distantBundles.flatMap((b) => b.edgeIds)),
    [distantBundles]
  );

  const endIngressEdgeIdSet = useMemo(
    () => new Set(endIngressBundles.flatMap((b) => b.edgeIds)),
    [endIngressBundles]
  );

  const distantOrEndIngressEdgeIdSet = useMemo(
    () => new Set([...distantEdgeIdSet, ...endIngressEdgeIdSet]),
    [distantEdgeIdSet, endIngressEdgeIdSet]
  );

  const distantInboundWorldBox = useMemo(() => {
    const m = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [pageId, w] of worldMetrics) {
      m.set(pageId, { x: w.x, y: w.y, w: w.w, h: w.h });
    }
    return m;
  }, [worldMetrics]);

  const distantInboundYByKey = useMemo(
    () => computeDistantInboundYByKey(distantBundles, distantInboundWorldBox),
    [distantBundles, distantInboundWorldBox]
  );

  const endIngressInboundYByKey = useMemo(
    () =>
      computeDistantInboundYByKey(endIngressBundles, distantInboundWorldBox),
    [endIngressBundles, distantInboundWorldBox]
  );

  const incomingPortDotVisibleByPageId = useMemo(() => {
    const m = new Map<string, boolean[]>();
    for (const n of graphRenderNodesWithStart) {
      const pid = n.pageId;
      if (pid === STORY_GRAPH_START_NODE_ID) continue;
      const inc = incomingEdgesByTarget.get(pid) ?? [];
      const bundles = bundleIncomingEdgesForTarget(inc);
      if (n.category === "end") {
        m.set(
          pid,
          bundles.map(() => false)
        );
        continue;
      }
      m.set(
        pid,
        bundles.map((bundle) =>
          bundle.some((e) => !distantOrEndIngressEdgeIdSet.has(e.id))
        )
      );
    }
    return m;
  }, [
    graphRenderNodesWithStart,
    incomingEdgesByTarget,
    distantOrEndIngressEdgeIdSet,
  ]);

  const bbox = useMemo(() => {
    let maxX = 400;
    let maxY = 300;
    for (const m of worldMetrics.values()) {
      maxX = Math.max(maxX, m.x + m.w + 120);
      maxY = Math.max(maxY, m.y + m.h + 120);
    }
    if (endClusterCanvasLayout) {
      const b = endClusterCanvasLayout.bounds;
      maxX = Math.max(maxX, b.maxX + 120);
      maxY = Math.max(maxY, b.maxY + 120);
    }
    return { w: maxX, h: maxY };
  }, [worldMetrics, endClusterCanvasLayout]);

  /** Kártyák tényleges befoglalója (beleértve negatív X-et is) — zoom „beleillesztéshez”. */
  const fitContentBounds = useMemo(() => {
    let minX = 0;
    let minY = 0;
    let maxX = 400;
    let maxY = 300;
    for (const m of worldMetrics.values()) {
      minX = Math.min(minX, m.x - 40);
      minY = Math.min(minY, m.y - 40);
      maxX = Math.max(maxX, m.x + m.w + 40);
      maxY = Math.max(maxY, m.y + m.h + 40);
    }
    if (endClusterCanvasLayout) {
      const b = endClusterCanvasLayout.bounds;
      minX = Math.min(minX, b.minX - 40);
      minY = Math.min(minY, b.minY - 40);
      maxX = Math.max(maxX, b.maxX + 40);
      maxY = Math.max(maxY, b.maxY + 40);
    }
    return { minX, minY, maxX, maxY };
  }, [worldMetrics, endClusterCanvasLayout]);


  const pathBubbleLayout = useMemo(() => {
    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const bubble of pathBubbleGroups) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of bubble.nodeIds) {
        const m = worldMetrics.get(id);
        if (!m) continue;
        minX = Math.min(minX, m.x);
        minY = Math.min(minY, m.y);
        maxX = Math.max(maxX, m.x + m.w);
        maxY = Math.max(maxY, m.y + m.h);
      }
      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        const padX = 22;
        const padY = 16;
        boxes.set(bubble.id, {
          x: minX - padX,
          y: minY - padY,
          w: Math.max(180, maxX - minX + padX * 2),
          h: Math.max(72, maxY - minY + padY * 2),
        });
      }
    }
    return boxes;
  }, [pathBubbleGroups, worldMetrics]);

  const pathBubbleEdges = useMemo(() => {
    const ownerByNode = new Map<string, string>();
    for (const b of pathBubbleGroups) {
      for (const n of b.nodeIds) ownerByNode.set(n, b.id);
    }
    const counts = new Map<string, number>();
    for (const e of edges) {
      if (e.from === STORY_GRAPH_START_NODE_ID) continue;
      const from = ownerByNode.get(e.from);
      const to = ownerByNode.get(e.to);
      if (!from || !to || from === to) continue;
      const k = `${from}\0${to}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].map(([k, c], idx) => {
      const i = k.indexOf("\0");
      return {
        id: `pbe_${idx}`,
        fromBubbleId: k.slice(0, i),
        toBubbleId: k.slice(i + 1),
        count: c,
      };
    });
  }, [pathBubbleGroups, edges]);

  const endZoneSeparatorWorldX = useMemo(() => {
    if (!endPageIds.length) return null;
    if (viewMode === "graph" && endClusterCanvasLayout) {
      return Math.max(0, endClusterCanvasLayout.bounds.minX - 28);
    }
    let minX = Infinity;
    for (const id of endPageIds) {
      const pos = localLayout.nodes[id];
      if (!pos) continue;
      minX = Math.min(minX, pos.x);
    }
    if (!Number.isFinite(minX)) return null;
    return Math.max(0, minX - 28);
  }, [endPageIds, localLayout.nodes, viewMode, endClusterCanvasLayout]);

  const commitLayout = useCallback(() => {
    if (interactionLocked) return;
    onStoryChange(applyEditorLayout(draftStory, layoutRef.current));
  }, [draftStory, onStoryChange, interactionLocked]);

  const onAutoRelayout = useCallback(() => {
    if (interactionLocked) return;
    const layout = recomputeEditorLayoutForStory(
      draftStory,
      pageIds,
      edges,
      startPageId
    );
    onStoryChange(mergeEditorLayoutIntoStory(draftStory, layout));
  }, [
    draftStory,
    pageIds,
    edges,
    startPageId,
    onStoryChange,
    interactionLocked,
  ]);

  const onToggleGraphColumnView = useCallback(() => {
    if (interactionLocked) return;
    setGraphColumnViewMode((prev) => {
      const next: EditorGraphColumnViewMode =
        prev === "startBalanced" ? "topStack" : "startBalanced";
      if (next === "topStack") {
        const fresh = buildFreshEditorLayoutNodes(
          draftStory,
          pageIds,
          edges,
          startPageId,
          "topBand"
        );
        setLocalLayout((l0) => {
          const nodes: Record<string, EditorLayoutNode> = { ...fresh };
          for (const id of Object.keys(nodes)) {
            const z = l0.nodes[id]?.z;
            const cur = nodes[id];
            if (
              cur &&
              z != null &&
              typeof z === "number" &&
              Number.isFinite(z)
            ) {
              nodes[id] = { ...cur, z };
            }
          }
          return { ...l0, nodes };
        });
      } else {
        setLocalLayout(balancedLayoutRef.current);
      }
      return next;
    });
  }, [interactionLocked, draftStory, pageIds, edges, startPageId]);

  const onFitGraphInView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 8 || vh < 8) return;
    const pad = 28;
    const bounds =
      viewMode === "metro" && !metroDrillNodeSet
        ? { minX: 0, minY: 0, maxX: metroLayout.width, maxY: metroLayout.height }
        : fitContentBounds;
    const bw = Math.max(bounds.maxX - bounds.minX, 1);
    const bh = Math.max(bounds.maxY - bounds.minY, 1);
    let z = Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh);
    z = clamp(Number(z.toFixed(3)), ZOOM_MIN, ZOOM_MAX);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    setZoom(z);
    setPan({ x: vw / 2 - z * cx, y: vh / 2 - z * cy });
  }, [fitContentBounds, viewMode, metroDrillNodeSet, metroLayout]);

  const onCardDragStart = useCallback(
    (pageId: string, e: ReactPointerEvent) => {
      if (interactionLocked) return;
      e.stopPropagation();
      e.preventDefault();
      const idsToMove =
        selectedPageIds.includes(pageId) && selectedPageIds.length > 0
          ? clusterMemberIdsToDragUnion(canvasClusters, selectedPageIds)
          : clusterMemberIdsToDrag(canvasClusters, pageId);
      const startPositions: Record<string, EditorLayoutNode> = {};
      for (const id of idsToMove) {
        const p = localLayout.nodes[id];
        if (p) startPositions[id] = { ...p };
      }
      if (!startPositions[pageId]) return;
      dragRef.current = {
        ids: idsToMove,
        sx: e.clientX,
        sy: e.clientY,
        startPositions,
      };
      const move = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = (ev.clientX - d.sx) / zoom;
        const dy = (ev.clientY - d.sy) / zoom;
        setLocalLayout((prev) => {
          const nodes = { ...prev.nodes };
          for (const id of d.ids) {
            const p0 = d.startPositions[id];
            if (p0) nodes[id] = { x: p0.x + dx, y: p0.y + dy };
          }
          return { ...prev, nodes };
        });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        dragRef.current = null;
        commitLayout();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [
      localLayout.nodes,
      zoom,
      commitLayout,
      canvasClusters,
      selectedPageIds,
      interactionLocked,
    ]
  );

  const onCanvasCardBodyPointerDown = useCallback(
    (pageId: string, e: ReactPointerEvent) => {
      if (pageId === STORY_GRAPH_START_NODE_ID) {
        onSelectPageIds([STORY_GRAPH_START_NODE_ID]);
        return;
      }
      if (e.shiftKey) {
        const set = new Set(selectedPageIds);
        if (set.has(pageId)) set.delete(pageId);
        else set.add(pageId);
        onSelectPageIds([...set]);
      } else {
        onSelectPageIds([pageId]);
      }
    },
    [selectedPageIds, onSelectPageIds]
  );

  const onViewportPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (canvasFullscreen && edgePanLoopRef.current != null) {
        cancelAnimationFrame(edgePanLoopRef.current);
        edgePanLoopRef.current = null;
      }
      if ((e.target as HTMLElement).closest('[data-story-card="1"]')) return;
      if ((e.target as HTMLElement).closest("[data-distant-edge-chip]"))
        return;
      if ((e.target as HTMLElement).closest("[data-end-ingress-chip]")) return;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        /* ignore */
      }
      const vp = viewportRef.current;
      if (e.shiftKey && vp) {
        const r = vp.getBoundingClientRect();
        marqueeDragRef.current = {
          cx0: e.clientX,
          cy0: e.clientY,
          cx1: e.clientX,
          cy1: e.clientY,
        };
        setMarqueeRect({
          left: e.clientX - r.left,
          top: e.clientY - r.top,
          width: 0,
          height: 0,
        });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      panRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: pan.x,
        py: pan.y,
        moved: false,
      };
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pan.x, pan.y, canvasFullscreen]
  );

  const onViewportPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const m = marqueeDragRef.current;
      if (m) {
        m.cx1 = e.clientX;
        m.cy1 = e.clientY;
        const vp = viewportRef.current;
        if (vp) {
          const r = vp.getBoundingClientRect();
          setMarqueeRect({
            left: Math.min(m.cx0, m.cx1) - r.left,
            top: Math.min(m.cy0, m.cy1) - r.top,
            width: Math.abs(m.cx1 - m.cx0),
            height: Math.abs(m.cy1 - m.cy0),
          });
        }
        return;
      }
      const p = panRef.current;
      if (p) {
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;
        if (
          !p.moved &&
          Math.hypot(dx, dy) >= VIEWPORT_CLICK_MOVE_THRESHOLD_PX
        ) {
          p.moved = true;
        }
        setPan({
          x: p.px + dx,
          y: p.py + dy,
        });
      }
    },
    []
  );

  const onViewportPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const m = marqueeDragRef.current;
      if (m) {
        marqueeDragRef.current = null;
        setMarqueeRect(null);
        const w = Math.abs(m.cx1 - m.cx0);
        const h = Math.abs(m.cy1 - m.cy0);
        if (w >= MARQUEE_MIN_DRAG_PX || h >= MARQUEE_MIN_DRAG_PX) {
          const sel = {
            left: Math.min(m.cx0, m.cx1),
            top: Math.min(m.cy0, m.cy1),
            right: Math.max(m.cx0, m.cx1),
            bottom: Math.max(m.cy0, m.cy1),
          };
          const hit = new Set<string>();
          for (const n of graphRenderNodesWithStart) {
            if (n.pageId === STORY_GRAPH_START_NODE_ID) continue;
            const el = cardRootRefs.current.get(n.pageId);
            if (!el) continue;
            const cr = el.getBoundingClientRect();
            if (clientRectsOverlap(sel, cr)) hit.add(n.pageId);
          }
          const next = new Set(selectedPageIds);
          for (const id of hit) next.add(id);
          onSelectPageIds([...next]);
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        return;
      }
      const p = panRef.current;
      if (p && !p.moved) {
        onSelectPageIds([]);
      }
      panRef.current = null;
      setPanning(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [graphRenderNodesWithStart, onSelectPageIds, selectedPageIds]
  );

  const singleSelectedScrollTarget =
    selectedPageIds.length === 1 ? selectedPageIds[0]! : null;

  /** Jobb panel / preview alapú kijelölés: a kártya kerüljön a vászon látható területére. */
  useEffect(() => {
    if (
      !singleSelectedScrollTarget ||
      singleSelectedScrollTarget === STORY_GRAPH_START_NODE_ID
    )
      return;

    let cancelled = false;
    let innerRaf = 0;
    const run = () => {
      if (cancelled) return;
      const cardEl = cardRootRefs.current.get(singleSelectedScrollTarget);
      const vp = viewportRef.current;
      if (!cardEl || !vp) return;
      const cr = cardEl.getBoundingClientRect();
      const vr = vp.getBoundingClientRect();
      const margin = 28;
      let dx = 0;
      let dy = 0;
      if (cr.left < vr.left + margin) dx = vr.left + margin - cr.left;
      else if (cr.right > vr.right - margin) dx = vr.right - margin - cr.right;
      if (cr.top < vr.top + margin) dy = vr.top + margin - cr.top;
      else if (cr.bottom > vr.bottom - margin) dy = vr.bottom - margin - cr.bottom;
      if (dx !== 0 || dy !== 0) {
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    };

    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [singleSelectedScrollTarget, zoom, canvasH]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      e.preventDefault();
      const dz = e.deltaY > 0 ? -0.08 : 0.08;
      const { pan: p0, zoom: z0 } = panZoomAnchorRef.current;
      const z2 = clamp(Number((z0 + dz).toFixed(2)), ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(z2 - z0) < 1e-6) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nextPan = computeAnchoredPanForZoom(p0, z0, z2, mx, my);
      setZoom(z2);
      if (nextPan) setPan(nextPan);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const stopEdgePanLoop = useCallback(() => {
    if (edgePanLoopRef.current != null) {
      cancelAnimationFrame(edgePanLoopRef.current);
      edgePanLoopRef.current = null;
    }
  }, []);

  const edgePanPickTargetAllows = useCallback((target: EventTarget | null) => {
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.closest("[data-editor-overlay-portal]")) return false;
    if (el.closest('[data-story-card="1"]')) return false;
    if (el.closest("[data-distant-edge-chip]")) return false;
    if (el.closest("[data-end-ingress-chip]")) return false;
    if (el.closest("[data-metro-kind]")) return false;
    return true;
  }, []);

  const edgePanTick = useCallback(() => {
    edgePanLoopRef.current = null;
    if (!canvasFullscreen || interactionLocked) return;
    if (panRef.current || marqueeDragRef.current) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const { x, y } = lastMouseClientRef.current;
    const hit = document.elementFromPoint(x, y);
    if (!edgePanPickTargetAllows(hit)) return;
    const r = vp.getBoundingClientRect();
    const m = EDGE_PAN_MARGIN_PX;
    let dx = 0;
    let dy = 0;
    if (x < r.left + m && x >= r.left) {
      dx = EDGE_PAN_MAX_STEP * (1 - (x - r.left) / m);
    } else if (x > r.right - m && x <= r.right) {
      dx = -EDGE_PAN_MAX_STEP * (1 - (r.right - x) / m);
    }
    if (y < r.top + m && y >= r.top) {
      dy = EDGE_PAN_MAX_STEP * (1 - (y - r.top) / m);
    } else if (y > r.bottom - m && y <= r.bottom) {
      dy = -EDGE_PAN_MAX_STEP * (1 - (r.bottom - y) / m);
    }
    if (dx !== 0 || dy !== 0) {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      edgePanLoopRef.current = requestAnimationFrame(edgePanTick);
    }
  }, [canvasFullscreen, interactionLocked, edgePanPickTargetAllows]);

  const onViewportMouseMoveEdgePan = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!canvasFullscreen || interactionLocked) return;
      lastMouseClientRef.current = { x: e.clientX, y: e.clientY };
      if (panRef.current || marqueeDragRef.current) {
        stopEdgePanLoop();
        return;
      }
      if (!edgePanPickTargetAllows(e.target)) {
        stopEdgePanLoop();
        return;
      }
      const vp = viewportRef.current;
      if (!vp) return;
      const { x, y } = lastMouseClientRef.current;
      const r = vp.getBoundingClientRect();
      const m = EDGE_PAN_MARGIN_PX;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
        stopEdgePanLoop();
        return;
      }
      const inBand =
        x < r.left + m ||
        x > r.right - m ||
        y < r.top + m ||
        y > r.bottom - m;
      if (!inBand) {
        stopEdgePanLoop();
        return;
      }
      if (edgePanLoopRef.current === null) {
        edgePanLoopRef.current = requestAnimationFrame(edgePanTick);
      }
    },
    [
      canvasFullscreen,
      interactionLocked,
      edgePanTick,
      edgePanPickTargetAllows,
      stopEdgePanLoop,
    ]
  );

  const onViewportMouseLeaveEdgePan = useCallback(() => {
    stopEdgePanLoop();
  }, [stopEdgePanLoop]);

  useEffect(() => {
    if (!canvasFullscreen) stopEdgePanLoop();
    return () => {
      stopEdgePanLoop();
    };
  }, [canvasFullscreen, stopEdgePanLoop]);

  const bumpZoom = useCallback((delta: number) => {
    const { pan: p0, zoom: z0 } = panZoomAnchorRef.current;
    const z2 = clamp(Number((z0 + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z2 - z0) < 1e-6) return;
    const vp = viewportRef.current;
    const rect = vp?.getBoundingClientRect();
    const focalX = rect && rect.width > 0 ? rect.width / 2 : 0;
    const focalY = rect && rect.height > 0 ? rect.height / 2 : 0;
    const nextPan = computeAnchoredPanForZoom(p0, z0, z2, focalX, focalY);
    setZoom(z2);
    if (nextPan) setPan(nextPan);
  }, []);

  const updateCategoryPopoverPosition = useCallback(() => {
    if (openCategory === null || typeof window === "undefined") {
      setCategoryPopoverBox(null);
      return;
    }
    const btn = categoryStripAnchorRefs.current[openCategory];
    if (!btn) {
      setCategoryPopoverBox(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    const minW = Math.max(r.width, 168);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left;
    if (left + minW > vw - 8) {
      left = Math.max(8, vw - minW - 8);
    }
    const top = r.bottom + CATEGORY_STRIP_POPOVER_GAP_PX;
    const maxHeight = Math.max(120, vh - top - 10);
    setCategoryPopoverBox({ top, left, width: minW, maxHeight });
  }, [openCategory]);

  useLayoutEffect(() => {
    updateCategoryPopoverPosition();
  }, [updateCategoryPopoverPosition, pagesByCategory]);

  useEffect(() => {
    if (openCategory === null) return;
    const ro = () => updateCategoryPopoverPosition();
    window.addEventListener("resize", ro);
    window.addEventListener("scroll", ro, true);
    const scrollEl = categoryStripScrollRef.current;
    scrollEl?.addEventListener("scroll", ro);
    return () => {
      window.removeEventListener("resize", ro);
      window.removeEventListener("scroll", ro, true);
      scrollEl?.removeEventListener("scroll", ro);
    };
  }, [openCategory, updateCategoryPopoverPosition]);

  useEffect(() => {
    if (openCategory === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenCategory(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCategory]);

  useEffect(() => {
    if (openCategory === null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (categoryStripRef.current?.contains(t)) return;
      if (categoryStripPopoverRef.current?.contains(t)) return;
      setOpenCategory(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openCategory]);

  useEffect(() => {
    if (openCategory !== null) setEndToolbarPhase(null);
  }, [openCategory]);

  /** Régi lista soha ne legyen „end” kategóriára nyitva. */
  useEffect(() => {
    if (openCategory === "end") setOpenCategory(null);
  }, [openCategory]);

  const updateEndToolbarPopoverPosition = useCallback(() => {
    if (!endToolbarPhase || typeof window === "undefined") {
      setEndToolbarPopoverBox(null);
      return;
    }
    const btn = endToolbarMenuBtnRef.current;
    if (!btn) {
      setEndToolbarPopoverBox(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW =
      endToolbarPhase === "categories"
        ? Math.min(360, vw - 16)
        : Math.min(220, vw - 16);
    let left = r.right - panelW;
    left = Math.max(8, Math.min(left, vw - panelW - 8));
    const top = r.bottom + CATEGORY_STRIP_POPOVER_GAP_PX;
    const maxHeight = Math.max(120, vh - top - 10);
    setEndToolbarPopoverBox({ top, left, width: panelW, maxHeight });
  }, [endToolbarPhase]);

  useLayoutEffect(() => {
    updateEndToolbarPopoverPosition();
  }, [updateEndToolbarPopoverPosition, pagesByCategory]);

  useEffect(() => {
    if (!endToolbarPhase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEndToolbarPhase(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endToolbarPhase]);

  useEffect(() => {
    if (!endToolbarPhase) return;
    const ro = () => updateEndToolbarPopoverPosition();
    window.addEventListener("resize", ro);
    window.addEventListener("scroll", ro, true);
    const scrollEl = categoryStripScrollRef.current;
    scrollEl?.addEventListener("scroll", ro);
    return () => {
      window.removeEventListener("resize", ro);
      window.removeEventListener("scroll", ro, true);
      scrollEl?.removeEventListener("scroll", ro);
    };
  }, [endToolbarPhase, updateEndToolbarPopoverPosition]);

  useEffect(() => {
    if (!endToolbarPhase) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (endToolbarMenuBtnRef.current?.contains(t)) return;
      if (endToolbarPopoverRef.current?.contains(t)) return;
      setEndToolbarPhase(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [endToolbarPhase]);

  const syncCategoryStripNav = useCallback(() => {
    const el = categoryStripScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    const eps = 2;
    setCatStripNav({
      canBack: left > eps,
      canFwd: max > eps && left < max - eps,
    });
  }, []);

  useEffect(() => {
    syncCategoryStripNav();
  }, [pagesByCategory, openCategory, syncCategoryStripNav]);

  useEffect(() => {
    const el = categoryStripScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncCategoryStripNav());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncCategoryStripNav]);

  const onAddPageForCategory = useCallback(
    (category: EditorPageCategory) => {
      if (interactionLocked) return;
      let base = draftStory;
      for (const pid of collectStoryPageIds(base)) {
        if (isEditorPendingPageId(pid)) {
          base = removePageFromStory(base, pid);
        }
      }
      const page = buildEmptyPageForCategory(category, base);
      const id = typeof page.id === "string" ? page.id : "";
      if (!id) return;
      const storyWithPage = appendPageToStory(base, page);
      const start =
        layoutRef.current.nodes[STORY_GRAPH_START_NODE_ID] ?? {
          x: -EDITOR_LAYOUT_COL_STEP_PX,
          y: 80,
        };
      let maxZ = 0;
      for (const n of Object.values(layoutRef.current.nodes)) {
        if (typeof n.z === "number" && Number.isFinite(n.z)) {
          maxZ = Math.max(maxZ, n.z);
        }
      }
      const z = Math.max(2, maxZ + 1);
      const position: EditorLayoutNode = {
        x: start.x + NEAR_START_DX,
        y: start.y + NEAR_START_DY,
        z,
      };
      const nextLayout: EditorLayoutState = {
        version: 1,
        layoutRevision:
          layoutRef.current.layoutRevision ?? EDITOR_LAYOUT_REVISION,
        nodes: { ...layoutRef.current.nodes, [id]: position },
      };
      onStoryChange(applyEditorLayout(storyWithPage, nextLayout));
      onSelectPageIds([id]);
      onPendingPageCreated?.();
    },
    [
      draftStory,
      onStoryChange,
      onSelectPageIds,
      onPendingPageCreated,
      interactionLocked,
    ]
  );

  const onResizeDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: canvasHRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onResizeMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const r = resizeRef.current;
      if (!r) return;
      const maxH = maxCanvasViewportPx(canvasFullscreen);
      const dy = e.clientY - r.startY;
      setCanvasH(
        clamp(r.startH + dy, MIN_CANVAS_VIEWPORT_PX, maxH)
      );
    },
    [canvasFullscreen]
  );

  const onResizeUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current !== null) {
      resizeRef.current = null;
      try {
        localStorage.setItem(
          CANVAS_VIEWPORT_HEIGHT_LS,
          String(
            clamp(
              canvasHRef.current,
              MIN_CANVAS_VIEWPORT_PX,
              maxCanvasViewportPx(canvasFullscreen)
            )
          )
        );
      } catch {
        /* ignore */
      }
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [canvasFullscreen]);

  const viewportColumn = (
    <div className={s.viewportColumn}>
      <div
        ref={viewportRef}
        className={`${s.viewport} ${panning ? s.viewportPanning : ""} ${marqueeRect !== null ? s.viewportMarquee : ""} ${canvasFullscreen ? s.viewportFullscreen : ""}`}
        style={
          canvasFullscreen
            ? undefined
            : {
                height: Math.max(canvasH, MIN_CANVAS_VIEWPORT_PX),
              }
        }
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
        onMouseMove={onViewportMouseMoveEdgePan}
        onMouseLeave={onViewportMouseLeaveEdgePan}
      >
        <div
          className={s.world}
          style={{
            width: bbox.w,
            height: bbox.h,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {viewMode === "graph" ? (
            <>
              <StoryEdges ops={edgeOps} />
              <StoryDistantEdgeLines
                bundles={distantBundles}
                selectedPageIds={selectedPageIds}
                hoveredKey={hoveredDistantKey}
                inboundYByKey={distantInboundYByKey}
              />
              <StoryEndIngressLines
                bundles={endIngressBundles}
                selectedPageIds={selectedPageIds}
                hoveredKey={hoveredEndIngressKey}
                inboundYByKey={endIngressInboundYByKey}
              />
              {graphCanvasRenderNodes.map((n) => {
                const pos = localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
                const out = outgoingByPage.get(n.pageId) ?? [];
                const inc = incomingEdgesByTarget.get(n.pageId) ?? [];
                const incomingPortCount = bundleIncomingEdgesForTarget(inc).length;
                const issues =
                  n.pageId === STORY_GRAPH_START_NODE_ID
                    ? []
                    : issuesByPage.get(n.pageId) ?? [];
                const stackZ = localLayout.nodes[n.pageId]?.z;
                return (
                  <div key={n.pageId} data-story-card="1">
                    <StoryCard
                      node={n}
                      x={pos.x}
                      y={pos.y}
                      outgoing={out}
                      incomingPortCount={incomingPortCount}
                      incomingPortDotVisible={incomingPortDotVisibleByPageId.get(
                        n.pageId
                      )}
                      distantOutgoingEdgeIds={distantOrEndIngressEdgeIdSet}
                      selected={selectedPageIds.includes(n.pageId)}
                      domRef={getCardRootRef(n.pageId)}
                      issues={issues}
                      stackZ={
                        typeof stackZ === "number" && Number.isFinite(stackZ)
                          ? stackZ
                          : undefined
                      }
                      milestoneActive={
                        n.pageId === STORY_GRAPH_START_NODE_ID
                          ? undefined
                          : editorPageMilestoneActive(draftStory, n.pageId)
                      }
                      bootstrapStartHint={
                        interactionLocked &&
                        n.pageId === STORY_GRAPH_START_NODE_ID
                      }
                      onBodyPointerDown={(e) =>
                        onCanvasCardBodyPointerDown(n.pageId, e)
                      }
                      onSelectSingleForA11y={() =>
                        n.pageId === STORY_GRAPH_START_NODE_ID
                          ? onSelectPageIds([])
                          : onSelectPageIds([n.pageId])
                      }
                      onDragStart={(e) => onCardDragStart(n.pageId, e)}
                      onRequestDelete={
                        interactionLocked ||
                        n.pageId === STORY_GRAPH_START_NODE_ID ||
                        !onDeletePage
                          ? undefined
                          : () => onDeletePage(n.pageId)
                      }
                      onRequestClean={
                        interactionLocked ||
                        n.pageId === STORY_GRAPH_START_NODE_ID ||
                        !onCleanPage
                          ? undefined
                          : () => onCleanPage(n.pageId)
                      }
                      onRequestDuplicate={
                        interactionLocked ||
                        n.pageId === STORY_GRAPH_START_NODE_ID ||
                        !onDuplicatePage
                          ? undefined
                          : () => onDuplicatePage(n.pageId)
                      }
                      onRenamePageId={
                        interactionLocked ||
                        n.pageId === STORY_GRAPH_START_NODE_ID ||
                        !onRenamePageId
                          ? undefined
                          : onRenamePageId
                      }
                      endCategoryPicklist={endCategoryPicklist}
                      endPageBodyBackground={
                        n.category === "end"
                          ? resolveEndPageBodyBackground(draftStory, n.pageId)
                          : undefined
                      }
                    />
                  </div>
                );
              })}
              {endCategoryCardMeta.map((c) => {
                const catAccentId = `end_cat_${c.key}`;
                const active = expandedEndCategoryKey === c.key;
                const frame = editorEndCardAccentFrameStyle(catAccentId, active);
                return (
                  <button
                    key={`endcat:${c.key}`}
                    type="button"
                    className={`${s.endCategoryClusterCard} ${active ? s.endCategoryClusterCardActive : ""}`}
                    data-end-category-card="1"
                    style={{
                      left: c.x,
                      top: c.y,
                      width: c.w,
                      height: c.h,
                      borderColor: frame.borderColor,
                      boxShadow: frame.boxShadow,
                      background: "transparent",
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedEndCategoryKey((prev) =>
                        prev === c.key ? null : c.key
                      );
                    }}
                  >
                    <div
                      className={s.endCategoryClusterCardHead}
                      style={editorEndCardAccentHeaderStripStyle(
                        catAccentId,
                        active
                      )}
                    />
                    <div
                      className={s.endCategoryClusterCardBody}
                      style={{
                        background: resolveEndPageBodyBackground(
                          draftStory,
                          `end_${c.key}_cluster`
                        ),
                      }}
                    >
                      <span className={s.endCategoryClusterSlug}>{c.key}</span>
                      <div className={s.endCategoryClusterMeta}>
                        <span className={s.endCategoryClusterCountNum}>
                          {c.count}
                        </span>
                        <span className={s.endCategoryClusterCountLabel}>
                          vég típusú lap
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {endZoneSeparatorWorldX != null ? (
                <div
                  className={s.endZoneSeparator}
                  style={{
                    left: endZoneSeparatorWorldX,
                    height: bbox.h,
                  }}
                  aria-hidden
                />
              ) : null}
              <StoryEndIngressChips
                bundles={endIngressBundles}
                onHoverKey={setHoveredEndIngressKey}
                inboundYByKey={endIngressInboundYByKey}
                hideInboundChip={hideEndIngressInboundOnCategoryCard}
              />
              <StoryDistantEdgeChips
                bundles={distantBundles}
                onHoverKey={setHoveredDistantKey}
                inboundYByKey={distantInboundYByKey}
              />
            </>
          ) : viewMode === "pathFlow" ? (
            <div className={s.pathFlowLayer}>
              {expandedPathNodeSet ? (
                <>
                  <StoryEdges ops={pathExpandedEdgeOps} />
                  {pathExpandedNodesWithStart.map((n) => {
                    const pos = localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
                    const out = pathExpandedOutgoingByPage.get(n.pageId) ?? [];
                    const inc = pathExpandedIncomingByTarget.get(n.pageId) ?? [];
                    const incomingPortCount = bundleIncomingEdgesForTarget(inc).length;
                    const issues =
                      n.pageId === STORY_GRAPH_START_NODE_ID
                        ? []
                        : issuesByPage.get(n.pageId) ?? [];
                    const stackZ = localLayout.nodes[n.pageId]?.z;
                    return (
                      <div key={n.pageId} data-story-card="1">
                        <StoryCard
                          node={n}
                          x={pos.x}
                          y={pos.y}
                          outgoing={out}
                          incomingPortCount={incomingPortCount}
                          selected={selectedPageIds.includes(n.pageId)}
                          domRef={getCardRootRef(n.pageId)}
                          issues={issues}
                          stackZ={
                            typeof stackZ === "number" && Number.isFinite(stackZ)
                              ? stackZ
                              : undefined
                          }
                          milestoneActive={
                            n.pageId === STORY_GRAPH_START_NODE_ID
                              ? undefined
                              : editorPageMilestoneActive(draftStory, n.pageId)
                          }
                          onBodyPointerDown={(e) =>
                            onCanvasCardBodyPointerDown(n.pageId, e)
                          }
                          onSelectSingleForA11y={() =>
                            n.pageId === STORY_GRAPH_START_NODE_ID
                              ? onSelectPageIds([])
                              : onSelectPageIds([n.pageId])
                          }
                          onDragStart={(e) => onCardDragStart(n.pageId, e)}
                          onRequestDelete={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onDeletePage
                              ? undefined
                              : () => onDeletePage(n.pageId)
                          }
                          onRequestClean={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onCleanPage
                              ? undefined
                              : () => onCleanPage(n.pageId)
                          }
                          onRequestDuplicate={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onDuplicatePage
                              ? undefined
                              : () => onDuplicatePage(n.pageId)
                          }
                          onRenamePageId={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onRenamePageId
                              ? undefined
                              : onRenamePageId
                          }
                          endCategoryPicklist={endCategoryPicklist}
                          endPageBodyBackground={
                            n.category === "end"
                              ? resolveEndPageBodyBackground(draftStory, n.pageId)
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <svg className={s.pathFlowEdgesSvg} aria-hidden>
                    {pathBubbleEdges.map((e) => {
                      const from = pathBubbleLayout.get(e.fromBubbleId);
                      const to = pathBubbleLayout.get(e.toBubbleId);
                      if (!from || !to) return null;
                      const x1 = from.x + from.w;
                      const y1 = from.y + from.h / 2;
                      const x2 = to.x;
                      const y2 = to.y + to.h / 2;
                      const c1x = x1 + 40;
                      const c2x = x2 - 40;
                      return (
                        <g key={e.id}>
                          <path
                            d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`}
                            className={`${s.pathFlowEdge} ${s.pathFlowEdgeDim}`}
                          />
                          {e.count > 1 ? (
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 4}
                              className={s.pathFlowEdgeCount}
                            >
                              {e.count}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
                  {pathBubbleGroups.map((bubble) => {
                    const box = pathBubbleLayout.get(bubble.id);
                    if (!box) return null;
                    const focused = focusedPathClusterId === bubble.id;
                    return (
                      <button
                        key={bubble.id}
                        type="button"
                        className={`${s.pathBand} ${s.pathBandFlow} ${focused ? s.pathBandFocused : ""}`}
                        style={{
                          left: box.x,
                          top: box.y,
                          width: box.w,
                          height: box.h,
                        }}
                        onClick={() => {
                          setFocusedPathClusterId((prev) =>
                            prev === bubble.id ? null : bubble.id
                          );
                          setExpandedPathBubbleId(bubble.id);
                          onSelectPageIds([]);
                        }}
                        title="Részút megnyitása: kattintásra kibontjuk ezt az ágat / szakaszt"
                      >
                        <span className={s.pathBandLabel}>{bubble.name}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            <div className={s.metroLayer}>
              {metroDrillNodeSet ? (
                <>
                  <StoryEdges ops={metroExpandedEdgeOps} />
                  {metroExpandedNodesWithStart.map((n) => {
                    const pos = localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
                    const out = metroExpandedOutgoingByPage.get(n.pageId) ?? [];
                    const inc =
                      metroExpandedIncomingByTarget.get(n.pageId) ?? [];
                    const incomingPortCount =
                      bundleIncomingEdgesForTarget(inc).length;
                    const issues =
                      n.pageId === STORY_GRAPH_START_NODE_ID
                        ? []
                        : issuesByPage.get(n.pageId) ?? [];
                    const stackZ = localLayout.nodes[n.pageId]?.z;
                    return (
                      <div key={n.pageId} data-story-card="1">
                        <StoryCard
                          node={n}
                          x={pos.x}
                          y={pos.y}
                          outgoing={out}
                          incomingPortCount={incomingPortCount}
                          selected={selectedPageIds.includes(n.pageId)}
                          domRef={getCardRootRef(n.pageId)}
                          issues={issues}
                          stackZ={
                            typeof stackZ === "number" && Number.isFinite(stackZ)
                              ? stackZ
                              : undefined
                          }
                          milestoneActive={
                            n.pageId === STORY_GRAPH_START_NODE_ID
                              ? undefined
                              : editorPageMilestoneActive(draftStory, n.pageId)
                          }
                          onBodyPointerDown={(e) =>
                            onCanvasCardBodyPointerDown(n.pageId, e)
                          }
                          onSelectSingleForA11y={() =>
                            n.pageId === STORY_GRAPH_START_NODE_ID
                              ? onSelectPageIds([])
                              : onSelectPageIds([n.pageId])
                          }
                          onDragStart={(e) => onCardDragStart(n.pageId, e)}
                          onRequestDelete={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onDeletePage
                              ? undefined
                              : () => onDeletePage(n.pageId)
                          }
                          onRequestClean={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onCleanPage
                              ? undefined
                              : () => onCleanPage(n.pageId)
                          }
                          onRequestDuplicate={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onDuplicatePage
                              ? undefined
                              : () => onDuplicatePage(n.pageId)
                          }
                          onRenamePageId={
                            interactionLocked ||
                            n.pageId === STORY_GRAPH_START_NODE_ID ||
                            !onRenamePageId
                              ? undefined
                              : onRenamePageId
                          }
                          endCategoryPicklist={endCategoryPicklist}
                          endPageBodyBackground={
                            n.category === "end"
                              ? resolveEndPageBodyBackground(draftStory, n.pageId)
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </>
              ) : metroLayout.stations.length === 0 ? (
                <p className={s.metroEmpty}>
                  A metró nézetnek kell kiindulópont és legalább egy él a START felől.
                  Ellenőrizd: van-e <code>startPageId</code>, és kapcsolódnak-e hozzá
                  oldalak.
                </p>
              ) : (
                <>
                  <svg
                    className={s.metroSvg}
                    width={bbox.w}
                    height={bbox.h}
                    aria-hidden
                  >
                    {metroLayout.segments.map((seg) => {
                      const a = metroLayout.stationById.get(seg.from);
                      const b = metroLayout.stationById.get(seg.to);
                      if (!a || !b) return null;
                      const x1 = a.x;
                      const y1 = a.y;
                      const x2 = b.x;
                      const y2 = b.y;
                      const span = Math.max(40, x2 - x1);
                      const pull = Math.min(100, span * 0.45);
                      const c1x = x1 + pull;
                      const c2x = x2 - pull;
                      const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
                      const hue = metroHueFromId(seg.from);
                      const sw = 2.25 + Math.min(9, seg.branchWidth * 2.2);
                      return (
                        <g key={seg.id}>
                          <path
                            d={d}
                            className={s.metroTrackHit}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMetroDrillNodeSet(nodeIdsForMetroSegment(seg));
                              onSelectPageIds([]);
                            }}
                          />
                          <path
                            d={d}
                            className={s.metroTrack}
                            style={{
                              stroke: `hsla(${hue}, 72%, 58%, 0.92)`,
                              strokeWidth: sw,
                            }}
                          />
                          {seg.branchWidth > 1 ? (
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 6}
                              className={s.metroBranchCount}
                            >
                              ×{seg.branchWidth}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
                  <div className={s.metroStationOverlay}>
                    {metroLayout.stations.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        className={s.metroStation}
                        data-metro-kind={st.kind}
                        style={{
                          left: st.x,
                          top: st.y,
                        }}
                        title="Kattintásra megnyitjuk ezt a részgráfot (leszármazott oldalak)"
                        aria-label={`${st.label} állomás — részgráf megnyitása`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMetroDrillNodeSet(
                            collectDownstreamNodeIds(metroEdgePairs, st.id)
                          );
                          onSelectPageIds([]);
                        }}
                      >
                        <span className={s.metroStationLabel}>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {marqueeRect ? (
          <div className={s.marqueeOverlay} aria-hidden>
            <div
              className={s.marqueeBox}
              style={{
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          </div>
        ) : null}
      </div>
      {!canvasFullscreen ? (
        <div
          className={s.resizeHandle}
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={MIN_CANVAS_VIEWPORT_PX}
          aria-valuemax={maxCanvasViewportPx(canvasFullscreen)}
          aria-valuenow={Math.round(canvasH)}
          aria-label="A vászon terület magasságának állítása (húzd a választó sávot)"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />
      ) : null}
    </div>
  );

  const overlayPortalParent =
    overlayMountEl ??
    (typeof document !== "undefined" ? document.body : null);

  return (
    <div
      className={`${s.wrap} ${embedded ? s.wrapEmbedded : ""} ${canvasFullscreen ? s.wrapCanvasFullscreen : ""}`}
    >
      <div className={s.unifiedVisualBar}>
        {visualBarLeading ? (
          <div className={s.unifiedLeading}>{visualBarLeading}</div>
        ) : null}
        <div className={s.toolbar}>
        <div
          className={s.toolbarZoomGroup}
          role="group"
          aria-label="Vászon nagyítása és kicsinyítése"
        >
          <button
            type="button"
            className={s.toolbarZoomBtn}
            disabled={zoom <= ZOOM_MIN + 1e-4}
            onClick={() => bumpZoom(-ZOOM_STEP)}
            aria-label="Kicsinyítés egy lépéssel"
            title="Kicsinyítés: több kártya fér a képernyőre"
          >
            −
          </button>
          <span className={s.toolbarZoomValue} aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={s.toolbarZoomBtn}
            disabled={zoom >= ZOOM_MAX - 1e-4}
            onClick={() => bumpZoom(ZOOM_STEP)}
            aria-label="Nagyítás egy lépéssel"
            title="Nagyítás: részletek és szövegek olvashatóbbak"
          >
            +
          </button>
        </div>
        <span
          className={s.toolbarZoomHint}
          title="Gyors nagyítás: tartsd lenyomva a Ctrl+Shift billentyűket, és görgess az egérrel a vászon fölött"
        >
          Ctrl+Shift+görgő: zoom
        </span>
        <button type="button" onClick={() => setZoom(1)}>
          Zoom 100%
        </button>
        <button
          type="button"
          disabled={interactionLocked}
          onClick={onToggleGraphColumnView}
          title={
            graphColumnViewMode === "startBalanced"
              ? "Átkapcsolás: oszlopok felülről, egy közös felső vonalhoz igazítva (nem a START függőleges középpontjához)"
              : "Átkapcsolás: oszlopok a START kártya függőleges középpontjához igazítva"
          }
          aria-label="Gráf elrendezés: START középre vagy felülről építkezés"
        >
          {graphColumnViewMode === "startBalanced"
            ? "Elrendezés: START középre"
            : "Elrendezés: felülről"}
        </button>
        <button
          type="button"
          onClick={onFitGraphInView}
          title="Beleillesztés: a nagyítás és a görgetés úgy áll be, hogy az összes kártya látszódjon"
          aria-label="Teljes gráf beleillesztése a látható vászonba"
        >
          Összes kártya kilátásba
        </button>
        <button
          type="button"
          disabled={interactionLocked}
          onClick={onAutoRelayout}
          title="Automatikus elrendezés: a kártyák pozíciói a kapcsolatok alapján újraszámolódnak (felülírja a kézi húzásokat)"
          aria-label="Automatikus gráf-elrendezés — mentett pozíciók felülírása"
        >
          Auto elrendezés
        </button>
        {metaIssues.length > 0 ? (
          <span style={{ color: "#fca5a5" }}>
            Meta: {metaIssues[0]?.message}
          </span>
        ) : null}
        </div>
      </div>

      <div ref={categoryStripRef} className={s.categoryStripWrap}>
        {catStripNav.canBack ? (
          <button
            type="button"
            className={s.categoryStripNavBtn}
            aria-label="Kategória-sáv görgetése balra"
            title="Kategóriák balra görgetése"
            onClick={() => {
              categoryStripScrollRef.current?.scrollBy({
                left: -CATEGORY_STRIP_SCROLL_STEP_PX,
                behavior: "smooth",
              });
            }}
          >
            ‹
          </button>
        ) : null}
        <div
          ref={categoryStripScrollRef}
          className={s.categoryStripScroll}
          aria-label="Oldaltípusok kategóriánként — kattintásra lista, plusz gombbal új oldal"
          onScroll={syncCategoryStripNav}
        >
          {EDITOR_CATEGORY_ORDER.map((cat) => {
            const pages = pagesByCategory[cat];
            const isOpen = openCategory === cat;
            const isEndCat = cat === "end";
            return (
              <div
                key={cat}
                className={`${s.categoryStripGroup} ${isEndCat ? s.categoryStripGroupEnd : ""} ${isEndCat ? s.categoryStripGroupEndWrap : ""}`}
                style={
                  isEndCat
                    ? editorEndCardAccentStyle(CATEGORY_STRIP_END_ACCENT_ID, false)
                    : undefined
                }
              >
                {isEndCat ? (
                  <div
                    className={s.categoryStripEndLabelStatic}
                    title="Végoldalak: a részletes lista és az új vég lap a ▾ menüben"
                  >
                    <span className={s.categoryStripGroupTitle}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className={s.categoryStripCount}>({pages.length})</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    ref={(el) => {
                      categoryStripAnchorRefs.current[cat] = el;
                    }}
                    className={s.categoryStripTriggerBtn}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                    onClick={() => {
                      setEndToolbarPhase(null);
                      setOpenCategory((o) => (o === cat ? null : cat));
                    }}
                  >
                    <span className={s.categoryStripChevron} aria-hidden>
                      {isOpen ? "▼" : "▶"}
                    </span>
                    <span
                      className={s.categoryStripGroupTitle}
                      title={CATEGORY_LABELS[cat]}
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className={s.categoryStripCount}>({pages.length})</span>
                  </button>
                )}
                {isEndCat ? (
                  <button
                    ref={endToolbarMenuBtnRef}
                    type="button"
                    className={s.categoryStripEndMenuBtn}
                    title="Vég szekció menü: új végoldal, vagy vég-kategóriák és színek kezelése"
                    aria-label="Vég menü — új végoldal vagy kategóriák"
                    aria-expanded={endToolbarPhase !== null}
                    aria-haspopup="menu"
                    data-no-card-drag="1"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEndToolbarPhase((p) => (p ? null : "menu"));
                    }}
                  >
                    <span aria-hidden>▾</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.categoryStripAdd}
                    title={`Új üres oldal beszúrása: ${CATEGORY_LABELS[cat]}`}
                    aria-label={`Új oldal létrehozása — ${CATEGORY_LABELS[cat]}`}
                    onClick={() => onAddPageForCategory(cat)}
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {catStripNav.canFwd ? (
          <button
            type="button"
            className={s.categoryStripNavBtn}
            aria-label="Kategória-sáv görgetése jobbra"
            title="Kategóriák jobbra görgetése"
            onClick={() => {
              categoryStripScrollRef.current?.scrollBy({
                left: CATEGORY_STRIP_SCROLL_STEP_PX,
                behavior: "smooth",
              });
            }}
          >
            ›
          </button>
        ) : null}
      </div>

      {canvasFullscreen && fullscreenSideSlot ? (
        <div className={s.fullscreenMainRow}>
          <div className={s.canvasStage}>{viewportColumn}</div>
          <div className={s.fullscreenSideMount}>{fullscreenSideSlot}</div>
        </div>
      ) : (
        <div className={s.canvasStage}>{viewportColumn}</div>
      )}
      {openCategory !== null &&
      categoryPopoverBox &&
      overlayPortalParent
        ? createPortal(
            <div
              ref={categoryStripPopoverRef}
              className={s.categoryStripPopover}
              data-editor-overlay-portal
              style={{
                top: categoryPopoverBox.top,
                left: categoryPopoverBox.left,
                width: categoryPopoverBox.width,
                maxHeight: categoryPopoverBox.maxHeight,
              }}
              role="listbox"
              aria-label={`${CATEGORY_LABELS[openCategory]} — oldalak`}
            >
              {pagesByCategory[openCategory].length === 0 ? (
                <span className={s.categoryStripEmpty}>
                  Ebben a típusban még nincs oldal — használd a + gombot a sávban.
                </span>
              ) : (
                pagesByCategory[openCategory].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    className={`${s.categoryStripChip} ${selectedPageIds.includes(p.id) ? s.categoryStripChipSelected : ""}`}
                    title={p.id}
                    onClick={() => {
                      onSelectPageIds([p.id]);
                      setOpenCategory(null);
                    }}
                  >
                    {p.id}
                  </button>
                ))
              )}
            </div>,
            overlayPortalParent
          )
        : null}
      {endToolbarPhase &&
      endToolbarPopoverBox &&
      overlayPortalParent
        ? createPortal(
            <div
              ref={endToolbarPopoverRef}
              className={s.endToolbarPopoverPortal}
              data-editor-overlay-portal
              style={{
                top: endToolbarPopoverBox.top,
                left: endToolbarPopoverBox.left,
                width: endToolbarPopoverBox.width,
                maxHeight: endToolbarPopoverBox.maxHeight,
              }}
              data-phase={endToolbarPhase}
              role="presentation"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className={`${s.endToolbarShell} ${
                  endToolbarPhase === "categories"
                    ? s.endToolbarShellWide
                    : ""
                }`}
              >
                {endToolbarPhase === "menu" ? (
                  <div
                    className={s.endToolbarMenu}
                    role="menu"
                    aria-label="Vég szekció — új lap vagy kategóriák"
                  >
                    <button
                      type="button"
                      className={s.endToolbarMenuItem}
                      role="menuitem"
                      onClick={() => {
                        onAddPageForCategory("end");
                        setEndToolbarPhase(null);
                      }}
                    >
                      Új végoldal létrehozása
                    </button>
                    <button
                      type="button"
                      className={s.endToolbarMenuItem}
                      role="menuitem"
                      onClick={() => setEndToolbarPhase("categories")}
                    >
                      Vég-kategóriák és színek…
                    </button>
                  </div>
                ) : (
                  <EditorEndCategoriesPopover
                    draftStory={draftStory}
                    onStoryChange={onStoryChange}
                    onBack={() => setEndToolbarPhase("menu")}
                  />
                )}
              </div>
            </div>,
            overlayPortalParent
          )
        : null}
      <div
        ref={setOverlayPortalEl}
        className={s.overlayPortalHost}
        aria-hidden
      />
    </div>
  );
}

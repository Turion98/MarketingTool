"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  STORY_GRAPH_START_NODE_ID,
  buildStoryGraph,
  bundleIncomingEdgesForTarget,
  type StoryGraphEdge,
  type StoryGraphNode,
} from "@/app/lib/editor/storyGraph";
import {
  clusterMemberIdsToDrag,
  clusterMemberIdsToDragUnion,
  getEditorCanvasClustersEffective,
} from "@/app/lib/editor/editorCanvasCluster";
import { editorPageMilestoneActive } from "@/app/lib/editor/storyChoiceFragmentIds";
import {
  EDITOR_LAYOUT_COL_STEP_PX,
  ensureLayout,
  mergeEditorLayoutIntoStory,
  recomputeEditorLayoutForStory,
  type EditorLayoutNode,
  type EditorLayoutState,
} from "@/app/lib/editor/storyGraphLayout";
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
  inputPortYs,
  isRiddleNode,
  orderedOutgoingEdges,
  outPortY,
  slotCount,
} from "./storyCanvasGeometry";
import StoryCard from "./StoryCard";
import { computeDistantInboundYByKey } from "./distantInboundLayout";
import {
  StoryDistantEdgeChips,
  StoryDistantEdgeLines,
} from "./StoryDistantEdgeDecor";
import StoryEdges, { buildEdgeLayers } from "./StoryEdges";
import s from "./storyCanvas.module.scss";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.1;

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
  /** Dupla kattintásos oldal-ID a kártyán; `null` = siker. */
  onRenamePageId?: (fromId: string, toId: string) => string | null;
  /** Új függő oldal létrejöttekor (pl. jobb panel megnyitása). */
  onPendingPageCreated?: () => void;
  /** Bal szél: teljes képernyő + admin stb. */
  visualBarLeading?: ReactNode;
  /** Szülő szerinti teljes képernyő — nagyobb max vászon magasság. */
  canvasFullscreen?: boolean;
  /**
   * Csak teljes képernyőn: vezérlősáv alatt, a vászon melletti jobb oszlop
   * (szülő adja, pl. előnézet + inspektor).
   */
  fullscreenSideSlot?: ReactNode;
};

export default function StoryCanvas({
  draftStory,
  onStoryChange,
  selectedPageIds,
  onSelectPageIds,
  issuesByPage,
  metaIssues,
  embedded = false,
  onDeletePage,
  onRenamePageId,
  onPendingPageCreated,
  visualBarLeading,
  canvasFullscreen = false,
  fullscreenSideSlot,
}: StoryCanvasProps) {
  const { nodes, edges, startPageId } = useMemo(
    () => buildStoryGraph(draftStory),
    [draftStory]
  );

  const pageIds = useMemo(() => nodes.map((n) => n.pageId), [nodes]);

  const canvasClusters = useMemo(
    () => getEditorCanvasClustersEffective(draftStory),
    [draftStory]
  );

  const layout = useMemo(
    () => ensureLayout(draftStory, pageIds, edges, startPageId),
    [draftStory, pageIds, edges, startPageId]
  );

  const [localLayout, setLocalLayout] = useState<EditorLayoutState>(layout);
  const layoutRef = useRef(localLayout);
  layoutRef.current = localLayout;
  useEffect(() => {
    setLocalLayout(layout);
  }, [layout]);

  const [pan, setPan] = useState({ x: 48, y: 36 });
  const [zoom, setZoom] = useState(1);
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
  const [openCategory, setOpenCategory] = useState<EditorPageCategory | null>(
    null
  );
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

  const outgoingByPage = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of edges) {
      const list = m.get(e.from) ?? [];
      list.push(e);
      m.set(e.from, list);
    }
    return m;
  }, [edges]);

  const incomingEdgesByTarget = useMemo(() => {
    const m = new Map<string, StoryGraphEdge[]>();
    for (const e of edges) {
      const list = m.get(e.to) ?? [];
      list.push(e);
      m.set(e.to, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return m;
  }, [edges]);

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

    for (const n of nodesWithStart) {
      const pos = localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
      const out = outgoingByPage.get(n.pageId) ?? [];
      const ord = orderedOutgoingEdges(n.pageId, out);
      const { w, h } = cardDimensions(n, ord);

      const outSlotY = new Map<string, number>();
      const riddlePortRows =
        n.pageId !== STORY_GRAPH_START_NODE_ID && isRiddleNode(n)
          ? slotCount(n, ord)
          : 0;
      ord.forEach((e, slotIndex) => {
        let slot = slotIndex;
        if (riddlePortRows > 0) {
          slot = Math.min(slotIndex, riddlePortRows - 1);
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
  }, [nodesWithStart, localLayout, outgoingByPage, incomingEdgesByTarget]);

  const { localOps: edgeOps, distantBundles } = useMemo(
    () =>
      buildEdgeLayers({
        edges,
        world: worldMetrics,
        clusters: canvasClusters,
      }),
    [edges, worldMetrics, canvasClusters]
  );

  const [hoveredDistantKey, setHoveredDistantKey] = useState<string | null>(
    null
  );

  const distantEdgeIdSet = useMemo(
    () => new Set(distantBundles.flatMap((b) => b.edgeIds)),
    [distantBundles]
  );

  const distantInboundWorldBox = useMemo(() => {
    const m = new Map<string, { y: number; h: number }>();
    for (const [pageId, w] of worldMetrics) {
      m.set(pageId, { y: w.y, h: w.h });
    }
    return m;
  }, [worldMetrics]);

  const distantInboundYByKey = useMemo(
    () => computeDistantInboundYByKey(distantBundles, distantInboundWorldBox),
    [distantBundles, distantInboundWorldBox]
  );

  const incomingPortDotVisibleByPageId = useMemo(() => {
    const m = new Map<string, boolean[]>();
    for (const n of nodesWithStart) {
      const pid = n.pageId;
      if (pid === STORY_GRAPH_START_NODE_ID) continue;
      const inc = incomingEdgesByTarget.get(pid) ?? [];
      const bundles = bundleIncomingEdgesForTarget(inc);
      m.set(
        pid,
        bundles.map((bundle) =>
          bundle.some((e) => !distantEdgeIdSet.has(e.id))
        )
      );
    }
    return m;
  }, [nodesWithStart, incomingEdgesByTarget, distantEdgeIdSet]);

  const bbox = useMemo(() => {
    let maxX = 400;
    let maxY = 300;
    for (const m of worldMetrics.values()) {
      maxX = Math.max(maxX, m.x + m.w + 120);
      maxY = Math.max(maxY, m.y + m.h + 120);
    }
    return { w: maxX, h: maxY };
  }, [worldMetrics]);

  const commitLayout = useCallback(() => {
    onStoryChange(applyEditorLayout(draftStory, layoutRef.current));
  }, [draftStory, onStoryChange]);

  const onAutoRelayout = useCallback(() => {
    const layout = recomputeEditorLayoutForStory(
      draftStory,
      pageIds,
      edges,
      startPageId
    );
    onStoryChange(mergeEditorLayoutIntoStory(draftStory, layout));
  }, [draftStory, pageIds, edges, startPageId, onStoryChange]);

  const onCardDragStart = useCallback(
    (pageId: string, e: ReactPointerEvent) => {
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
    ]
  );

  const onCanvasCardBodyPointerDown = useCallback(
    (pageId: string, e: ReactPointerEvent) => {
      if (pageId === STORY_GRAPH_START_NODE_ID) {
        onSelectPageIds([]);
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
      if ((e.target as HTMLElement).closest('[data-story-card="1"]')) return;
      if ((e.target as HTMLElement).closest("[data-distant-edge-chip]"))
        return;
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
    [pan.x, pan.y]
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
          for (const n of nodesWithStart) {
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
    [nodesWithStart, onSelectPageIds, selectedPageIds]
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
      setZoom((z) =>
        clamp(Number((z + dz).toFixed(2)), ZOOM_MIN, ZOOM_MAX)
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) =>
      clamp(Number((z + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX)
    );
  }, []);

  useEffect(() => {
    if (openCategory === null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (categoryStripRef.current?.contains(t)) return;
      setOpenCategory(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openCategory]);

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
        nodes: { ...layoutRef.current.nodes, [id]: position },
      };
      onStoryChange(applyEditorLayout(storyWithPage, nextLayout));
      onSelectPageIds([id]);
      onPendingPageCreated?.();
    },
    [draftStory, onStoryChange, onSelectPageIds, onPendingPageCreated]
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
        className={`${s.viewport} ${panning ? s.viewportPanning : ""} ${marqueeRect !== null ? s.viewportMarquee : ""}`}
        style={{
          height: Math.max(canvasH, MIN_CANVAS_VIEWPORT_PX),
        }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        <div
          className={s.world}
          style={{
            width: bbox.w,
            height: bbox.h,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <StoryEdges ops={edgeOps} />
          <StoryDistantEdgeLines
            bundles={distantBundles}
            selectedPageIds={selectedPageIds}
            hoveredKey={hoveredDistantKey}
            inboundYByKey={distantInboundYByKey}
          />
          {nodesWithStart.map((n) => {
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
                  distantOutgoingEdgeIds={distantEdgeIdSet}
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
                    n.pageId === STORY_GRAPH_START_NODE_ID || !onDeletePage
                      ? undefined
                      : () => onDeletePage(n.pageId)
                  }
                  onRenamePageId={
                    n.pageId === STORY_GRAPH_START_NODE_ID || !onRenamePageId
                      ? undefined
                      : onRenamePageId
                  }
                />
              </div>
            );
          })}
          <StoryDistantEdgeChips
            bundles={distantBundles}
            onHoverKey={setHoveredDistantKey}
            inboundYByKey={distantInboundYByKey}
          />
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
      <div
        className={s.resizeHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={MIN_CANVAS_VIEWPORT_PX}
        aria-valuemax={maxCanvasViewportPx(canvasFullscreen)}
        aria-valuenow={Math.round(canvasH)}
        aria-label="Rács vászon magasságának állítása"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
    </div>
  );

  return (
    <div className={`${s.wrap} ${embedded ? s.wrapEmbedded : ""}`}>
      <div className={s.unifiedVisualBar}>
        {visualBarLeading ? (
          <div className={s.unifiedLeading}>{visualBarLeading}</div>
        ) : null}
        <div className={s.toolbar}>
        <div className={s.toolbarZoomGroup} role="group" aria-label="Vászon nagyítás">
          <button
            type="button"
            className={s.toolbarZoomBtn}
            disabled={zoom <= ZOOM_MIN + 1e-4}
            onClick={() => bumpZoom(-ZOOM_STEP)}
            aria-label="Kicsinyítés"
            title="Kicsinyítés"
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
            aria-label="Nagyítás"
            title="Nagyítás"
          >
            +
          </button>
        </div>
        <span className={s.toolbarZoomHint} title="Ctrl+Shift + egérgörgő">
          Ctrl+Shift+scroll: zoom
        </span>
        <button type="button" onClick={() => setZoom(1)}>
          Zoom 100%
        </button>
        <button
          type="button"
          onClick={() => {
            setPan({ x: 48, y: 36 });
            setZoom(1);
          }}
        >
          Központ
        </button>
        <button
          type="button"
          onClick={onAutoRelayout}
          title="Pozíciók újraszámolása a gráf szerint (felülírja a mentett elrendezést)"
          aria-label="Automatikus elrendezés a gráf szerint"
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
            aria-label="Kategóriák görgetése balra"
            title="Balra"
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
          aria-label="Oldalak kategóriánként"
          onScroll={syncCategoryStripNav}
        >
          {EDITOR_CATEGORY_ORDER.map((cat) => {
            const pages = pagesByCategory[cat];
            const isOpen = openCategory === cat;
            return (
              <div key={cat} className={s.categoryStripGroup}>
                <details className={s.categoryStripDetails} open={isOpen}>
                  <summary
                    className={s.categoryStripSummary}
                    onClick={(e) => {
                      e.preventDefault();
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
                  </summary>
                  <div className={s.categoryStripPanel}>
                    {pages.length === 0 ? (
                      <span className={s.categoryStripEmpty}>
                        Nincs ilyen típusú oldal.
                      </span>
                    ) : (
                      pages.map((p) => (
                        <button
                          key={p.id}
                          type="button"
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
                  </div>
                </details>
                <button
                  type="button"
                  className={s.categoryStripAdd}
                  title={`Új üres: ${CATEGORY_LABELS[cat]}`}
                  aria-label={`Új oldal (${CATEGORY_LABELS[cat]})`}
                  onClick={() => onAddPageForCategory(cat)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        {catStripNav.canFwd ? (
          <button
            type="button"
            className={s.categoryStripNavBtn}
            aria-label="Kategóriák görgetése jobbra"
            title="Jobbra"
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
    </div>
  );
}

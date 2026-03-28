"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
  getEditorCanvasClustersEffective,
} from "@/app/lib/editor/editorCanvasCluster";
import {
  ensureLayout,
  type EditorLayoutNode,
  type EditorLayoutState,
} from "@/app/lib/editor/storyGraphLayout";
import { applyEditorLayout } from "@/app/lib/editor/storyPagePatch";
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
import StoryEdges, { buildEdgeDrawOps } from "./StoryEdges";
import s from "./storyCanvas.module.scss";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

const CANVAS_VIEWPORT_HEIGHT_LS = "questell:editor:storyCanvasViewportPx";

/** Egyeznie kell a `.viewport` `min-height` értékével a storyCanvas.module.scss-ben */
const MIN_CANVAS_VIEWPORT_PX = 220;

function maxCanvasViewportPx() {
  if (typeof window === "undefined") return 920;
  return Math.min(920, Math.round(window.innerHeight * 0.92));
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
  selectedPageId: string | null;
  onSelectPage: (pageId: string | null) => void;
  issuesByPage: Map<string, PageValidationIssue[]>;
  metaIssues: PageValidationIssue[];
  /** Panelben: nincs dupla keret */
  embedded?: boolean;
};

export default function StoryCanvas({
  draftStory,
  onStoryChange,
  selectedPageId,
  onSelectPage,
  issuesByPage,
  metaIssues,
  embedded = false,
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
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(
    null
  );
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const canvasHRef = useRef(canvasH);
  canvasHRef.current = canvasH;
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CANVAS_VIEWPORT_HEIGHT_LS);
      if (raw) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          const maxH = maxCanvasViewportPx();
          setCanvasH(clamp(parsed, MIN_CANVAS_VIEWPORT_PX, maxH));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      const maxH = maxCanvasViewportPx();
      setCanvasH((h) => clamp(h, MIN_CANVAS_VIEWPORT_PX, maxH));
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

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
      const inYs = inputPortYs(bundles.length, h);
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

  const edgeOps = useMemo(
    () =>
      buildEdgeDrawOps({
        edges,
        world: worldMetrics,
        clusters: canvasClusters,
      }),
    [edges, worldMetrics, canvasClusters]
  );

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

  const onCardDragStart = useCallback(
    (pageId: string, e: ReactPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const idsToMove = clusterMemberIdsToDrag(canvasClusters, pageId);
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
    [localLayout.nodes, zoom, commitLayout, canvasClusters]
  );

  const onViewportPointerDown = useCallback((e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-story-card="1"]')) return;
    panRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      px: pan.x,
      py: pan.y,
    };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pan.x, pan.y]);

  const onViewportPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = panRef.current;
      if (p) {
        setPan({
          x: p.px + (e.clientX - p.sx),
          y: p.py + (e.clientY - p.sy),
        });
      }
    },
    []
  );

  const onViewportPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      panRef.current = null;
      setPanning(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      e.preventDefault();
      const dz = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => clamp(Number((z + dz).toFixed(2)), 0.45, 1.8));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const onResizeDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: canvasHRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onResizeMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const r = resizeRef.current;
      if (!r) return;
      const maxH = maxCanvasViewportPx();
      const dy = e.clientY - r.startY;
      setCanvasH(
        clamp(r.startH + dy, MIN_CANVAS_VIEWPORT_PX, maxH)
      );
    },
    []
  );

  const onResizeUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current !== null) {
      resizeRef.current = null;
      try {
        localStorage.setItem(
          CANVAS_VIEWPORT_HEIGHT_LS,
          String(
            clamp(canvasHRef.current, MIN_CANVAS_VIEWPORT_PX, maxCanvasViewportPx())
          )
        );
      } catch {
        /* ignore */
      }
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div className={`${s.wrap} ${embedded ? s.wrapEmbedded : ""}`}>
      <div className={s.toolbar}>
        <span style={{ opacity: 0.75 }}>Ctrl+Shift+görgetés: vászon zoom</span>
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
        {metaIssues.length > 0 ? (
          <span style={{ color: "#fca5a5" }}>
            Meta: {metaIssues[0]?.message}
          </span>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={`${s.viewport} ${panning ? s.viewportPanning : ""}`}
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
          {nodesWithStart.map((n) => {
            const pos = localLayout.nodes[n.pageId] ?? { x: 0, y: 0 };
            const out = outgoingByPage.get(n.pageId) ?? [];
            const inc = incomingEdgesByTarget.get(n.pageId) ?? [];
            const incomingPortCount = bundleIncomingEdgesForTarget(inc).length;
            const issues =
              n.pageId === STORY_GRAPH_START_NODE_ID
                ? []
                : issuesByPage.get(n.pageId) ?? [];
            return (
              <div key={n.pageId} data-story-card="1">
                <StoryCard
                  node={n}
                  x={pos.x}
                  y={pos.y}
                  outgoing={out}
                  incomingPortCount={incomingPortCount}
                  selected={selectedPageId === n.pageId}
                  issues={issues}
                  onSelect={() =>
                    onSelectPage(
                      n.pageId === STORY_GRAPH_START_NODE_ID
                        ? null
                        : n.pageId
                    )
                  }
                  onDragStart={(e) => onCardDragStart(n.pageId, e)}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={s.resizeHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={MIN_CANVAS_VIEWPORT_PX}
        aria-valuemax={maxCanvasViewportPx()}
        aria-valuenow={Math.round(canvasH)}
        aria-label="Rács vászon magasságának állítása"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
    </div>
  );
}

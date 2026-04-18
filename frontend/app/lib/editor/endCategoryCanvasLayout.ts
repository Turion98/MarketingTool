"use client";

import {
  CARD_W,
  CARD_BODY_BOTTOM_PAD,
  HEADER_H,
  ROW2_H,
  ROW_H,
} from "@/app/editor/storyCanvas/storyCanvasGeometry";
import type { StoryGraphEdge } from "./storyGraph";
import { inferEndPageCategoryKey } from "./endPageIdParts";
import { computeEndZoneAnchor, type EditorLayoutNode } from "./storyGraphLayout";

const END_CARD_LAYOUT_EST_H =
  HEADER_H + ROW2_H + 3 * ROW_H + CARD_BODY_BOTTOM_PAD;
const ROW_GAP_PACK = 20;
const END_COLUMN_ROW_GAP_EXTRA = 24;
const STEP_Y = END_CARD_LAYOUT_EST_H + ROW_GAP_PACK + END_COLUMN_ROW_GAP_EXTRA;
const MAX_ROWS_PER_COL = 4;

/** Kategória-kártya: fix magasság (world px). */
export const END_CATEGORY_CARD_W_PX = 228;
/** Két sor nagyobb szöveg + fejléc-hez. */
export const END_CATEGORY_CARD_H_PX = 132;
const CAT_GAP = 18;
const EXPANDED_COL_STEP_X = CARD_W + 56;

export type EndCategoryCanvasCard = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EndCategoryClusterCanvasLayout = {
  endPagePositions: Record<string, { x: number; y: number }>;
  /** Végcél world metrika: összeomlva a kategória kártya; kibontva valódi kártya. */
  endPageWorld: Record<
    string,
    { x: number; y: number; w: number; h: number; collapsed: boolean }
  >;
  categoryCards: EndCategoryCanvasCard[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Vég-zóna: kategória-kártyák **függőleges oszlopban**; kibontáskor a lapok a kártya jobb oldalán,
 * max. 4 magas oszlopokban, szegmensenként igazítva.
 */
export function computeEndCategoryClusterCanvasLayout(input: {
  nodes: Record<string, EditorLayoutNode>;
  pageIds: string[];
  endIds: string[];
  edges: StoryGraphEdge[];
  startPageId: string | null;
  expandedCategoryKey: string | null;
}): EndCategoryClusterCanvasLayout | null {
  const { nodes, pageIds, endIds, edges, startPageId, expandedCategoryKey } =
    input;
  const anchor = computeEndZoneAnchor(
    nodes,
    pageIds,
    endIds,
    edges,
    startPageId
  );
  if (!anchor || !endIds.length) return null;

  const byCat = new Map<string, string[]>();
  for (const id of endIds) {
    const k = inferEndPageCategoryKey(id);
    const list = byCat.get(k) ?? [];
    list.push(id);
    byCat.set(k, list);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  const catKeys = [...byCat.keys()].sort((a, b) => a.localeCompare(b));

  type Seg = {
    cat: string;
    ids: string[];
    segmentTop: number;
    segmentH: number;
    expanded: boolean;
  };
  const segments: Seg[] = [];
  let cursorY = 0;

  for (const cat of catKeys) {
    const ids = byCat.get(cat)!;
    const expanded = expandedCategoryKey === cat;
    let clusterContentH = END_CATEGORY_CARD_H_PX;
    if (expanded && ids.length) {
      let maxBottom = 0;
      for (let i = 0; i < ids.length; i++) {
        const row = i % MAX_ROWS_PER_COL;
        maxBottom = Math.max(maxBottom, row * STEP_Y + END_CARD_LAYOUT_EST_H);
      }
      clusterContentH = Math.max(END_CATEGORY_CARD_H_PX, maxBottom);
    }
    const segmentH = clusterContentH;
    segments.push({
      cat,
      ids,
      segmentTop: cursorY,
      segmentH,
      expanded: Boolean(expanded && ids.length),
    });
    cursorY += segmentH + CAT_GAP;
  }

  const totalH = Math.max(1, cursorY - CAT_GAP);
  const shiftY = anchor.startCenterY - totalH / 2;
  const cardX = anchor.baseX;

  const endPagePositions: Record<string, { x: number; y: number }> = {};
  const endPageWorld: EndCategoryClusterCanvasLayout["endPageWorld"] = {};
  const categoryCards: EndCategoryCanvasCard[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const bump = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const seg of segments) {
    const ids = seg.ids;
    const segmentWorldTop = shiftY + seg.segmentTop;
    const catY =
      segmentWorldTop + (seg.segmentH - END_CATEGORY_CARD_H_PX) / 2;

    categoryCards.push({
      key: seg.cat,
      x: cardX,
      y: catY,
      w: END_CATEGORY_CARD_W_PX,
      h: END_CATEGORY_CARD_H_PX,
    });
    bump(cardX, catY, END_CATEGORY_CARD_W_PX, END_CATEGORY_CARD_H_PX);

    if (!seg.expanded) {
      for (const id of ids) {
        endPageWorld[id] = {
          x: cardX,
          y: catY,
          w: END_CATEGORY_CARD_W_PX,
          h: END_CATEGORY_CARD_H_PX,
          collapsed: true,
        };
        bump(cardX, catY, END_CATEGORY_CARD_W_PX, END_CATEGORY_CARD_H_PX);
      }
      continue;
    }

    const expandX = cardX + END_CATEGORY_CARD_W_PX + CAT_GAP;
    for (let i = 0; i < ids.length; i++) {
      const col = Math.floor(i / MAX_ROWS_PER_COL);
      const row = i % MAX_ROWS_PER_COL;
      const px = expandX + col * EXPANDED_COL_STEP_X;
      const py = segmentWorldTop + row * STEP_Y;
      const id = ids[i]!;
      endPagePositions[id] = { x: px, y: py };
      endPageWorld[id] = {
        x: px,
        y: py,
        w: CARD_W,
        h: END_CARD_LAYOUT_EST_H,
        collapsed: false,
      };
      bump(px, py, CARD_W, END_CARD_LAYOUT_EST_H);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = anchor.baseX;
    minY = shiftY;
    maxX = anchor.baseX + END_CATEGORY_CARD_W_PX;
    maxY = shiftY + END_CATEGORY_CARD_H_PX;
  }

  return {
    endPagePositions,
    endPageWorld,
    categoryCards,
    bounds: { minX, minY, maxX, maxY },
  };
}

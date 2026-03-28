import type { StoryGraphEdge, StoryGraphNode } from "@/app/lib/editor/storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "@/app/lib/editor/storyGraph";

export const CARD_W = 200;
/** Fejléc (drag) — pixelben, a .cardDragStrip magasságával egyezik. */
export const HEADER_H = 32;
/** Meta sor (tag + fragment jel) — .cardRow2 */
export const ROW2_H = 20;
/** Egy opció / ág keskeny sávja — .cardOptStrip, port a sáv közepén. */
export const ROW_H = 22;
export const CARD_BODY_BOTTOM_PAD = 6;
export const START_W = 112;
export const START_H = 52;

export function isRiddleNode(node: StoryGraphNode): boolean {
  return Boolean(node.isPuzzlePage && node.puzzleKind === "riddle");
}

export function orderedOutgoingEdges(
  pageId: string,
  out: StoryGraphEdge[]
): StoryGraphEdge[] {
  const e = out.filter((x) => x.from === pageId);
  const puzzle = e.filter(
    (x) => x.kind === "puzzleSuccess" || x.kind === "puzzleFail"
  );
  if (puzzle.length) {
    const succs = e
      .filter((x) => x.kind === "puzzleSuccess")
      .sort((a, b) => Number(a.label) - Number(b.label));
    const fail = e.find((x) => x.kind === "puzzleFail");
    if (fail) {
      const rows: StoryGraphEdge[] = [];
      if (succs[0]) rows.push(succs[0]);
      rows.push(fail);
      return rows;
    }
    if (succs.length) return succs;
  }
  const logicElse = e.find((x) => x.kind === "logicElse");
  const logicIf = e
    .filter((x) => x.kind === "logicIf")
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  if (logicElse || logicIf.length) {
    const rows: StoryGraphEdge[] = [];
    rows.push(...logicIf);
    if (logicElse) rows.push(logicElse);
    return rows;
  }
  const choices = e
    .filter((x) => x.kind === "choice")
    .sort((a, b) => Number(a.label) - Number(b.label));
  return choices.length ? choices : e;
}

function riddleFilledOptionCount(node: StoryGraphNode): number {
  const o = node.raw.options;
  if (!Array.isArray(o)) return 0;
  return o.filter((x): x is string => typeof x === "string" && !!x).length;
}

export function slotCount(node: StoryGraphNode, orderedOut: StoryGraphEdge[]): number {
  if (node.pageId === STORY_GRAPH_START_NODE_ID) return 1;
  if (isRiddleNode(node)) {
    const nOpt = riddleFilledOptionCount(node);
    /** Riddle: annyi sor/port, ahány megírt opció; a score-lánc többlet ágai nem opciók. */
    if (nOpt >= 1) return nOpt;
    return Math.max(1, orderedOut.length);
  }
  if (node.isPuzzlePage) return 2;
  if (node.isLogicPage) {
    return Math.max(1, orderedOut.length);
  }
  if (orderedOut.length) {
    return Math.max(orderedOut.length, node.choiceCount, 1);
  }
  return Math.max(1, node.choiceCount);
}

export function cardDimensions(
  node: StoryGraphNode,
  orderedOut: StoryGraphEdge[]
): { w: number; h: number } {
  if (node.pageId === STORY_GRAPH_START_NODE_ID) {
    return { w: START_W, h: START_H };
  }
  const rows = slotCount(node, orderedOut);
  const h =
    HEADER_H + ROW2_H + rows * ROW_H + CARD_BODY_BOTTOM_PAD;
  return { w: CARD_W, h };
}

export function portYForSlot(slotIndex: number): number {
  return HEADER_H + ROW2_H + slotIndex * ROW_H + ROW_H / 2;
}

export function outPortY(slotIndex: number): number {
  return portYForSlot(slotIndex);
}

export function inputPortYs(inCount: number, cardH: number): number[] {
  if (inCount <= 0) return [];
  const top = HEADER_H + ROW2_H;
  const inner = cardH - top - 6;
  return Array.from({ length: inCount }, (_, i) => {
    return top + ((i + 1) / (inCount + 1)) * inner;
  });
}

import type { CSSProperties } from "react";
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

/** Runes puzzle: nem üres opciófeliratok száma (ugyanaz a mező, mint riddle `options`). */
function runesFilledOptionCount(node: StoryGraphNode): number {
  if (!node.isPuzzlePage || node.puzzleKind !== "runes") return 0;
  return riddleFilledOptionCount(node);
}

/**
 * Kimenő él → opciósáv index a kártyán (runes: siker/hiba az utolsó két sávra, ne az 1–2. opcióra).
 */
export function outgoingSlotIndexForEdge(
  node: StoryGraphNode,
  orderedOut: StoryGraphEdge[],
  edgeIndex: number
): number {
  if (
    node.pageId === STORY_GRAPH_START_NODE_ID ||
    !node.isPuzzlePage ||
    node.puzzleKind !== "runes"
  ) {
    return edgeIndex;
  }
  const nOpt = runesFilledOptionCount(node);
  const displayRows = Math.max(2, nOpt);
  const e0 = orderedOut[0];
  const e1 = orderedOut[1];
  const looksLikePuzzlePair =
    orderedOut.length >= 2 &&
    edgeIndex < 2 &&
    ((e0?.kind === "puzzleSuccess" && e1?.kind === "puzzleFail") ||
      (e0?.kind === "puzzleFail" && e1?.kind === "puzzleSuccess"));
  if (looksLikePuzzlePair) {
    if (e0?.kind === "puzzleSuccess") {
      return displayRows - 2 + edgeIndex;
    }
    if (e0?.kind === "puzzleFail" && e1?.kind === "puzzleSuccess") {
      return displayRows - 2 + (edgeIndex === 0 ? 1 : 0);
    }
  }
  return edgeIndex;
}

export function slotCount(node: StoryGraphNode, orderedOut: StoryGraphEdge[]): number {
  /** Végoldal: ugyanakkora „testmagasság”, mint egy tipikus több sávos kártyán. */
  if (node.category === "end") return 3;
  if (node.pageId === STORY_GRAPH_START_NODE_ID) return 1;
  if (isRiddleNode(node)) {
    const nOpt = riddleFilledOptionCount(node);
    /** Riddle: annyi sor/port, ahány megírt opció; a score-lánc többlet ágai nem opciók. */
    if (nOpt >= 1) return nOpt;
    return Math.max(1, orderedOut.length);
  }
  if (node.isPuzzlePage && node.puzzleKind === "runes") {
    const nOpt = runesFilledOptionCount(node);
    return Math.max(2, nOpt);
  }
  if (node.isPuzzlePage) return 2;
  if (
    node.category === "puzzleRoute" ||
    node.category === "decision" ||
    node.category === "scorecard"
  ) {
    return Math.max(1, orderedOut.length);
  }
  if (node.isLogicPage) {
    return Math.max(1, orderedOut.length);
  }
  if (orderedOut.length) {
    return Math.max(orderedOut.length, node.choiceCount, 1);
  }
  return Math.max(1, node.choiceCount);
}

/**
 * Végoldal: oldal-id alapú egyedi arany + zöldes árnyalat (szerkesztő vászon).
 */
export function editorEndCardAccentStyle(
  pageId: string,
  selected: boolean
): CSSProperties {
  let h = 2166136261;
  for (let i = 0; i < pageId.length; i++) {
    h ^= pageId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const goldHue = 32 + (u % 28);
  const greenHue = 104 + ((u >> 8) % 40);
  const goldS = 52 + (u % 16);
  const greenS = 36 + ((u >> 16) % 18);
  const innerRing = `0 0 0 1px hsla(${greenHue} 48% 32% / 0.5), inset 0 1px 0 hsla(${goldHue} 62% 50% / 0.18)`;
  const base: CSSProperties = {
    borderColor: `hsl(${goldHue} ${goldS}% 54%)`,
    background: `linear-gradient(156deg, hsla(${goldHue} 48% 16% / 0.98) 0%, hsla(${greenHue} ${greenS}% 12% / 0.96) 100%)`,
    boxShadow: innerRing,
  };
  if (selected) {
    return {
      ...base,
      borderColor: "rgba(139, 168, 255, 0.82)",
      boxShadow: `${innerRing}, 0 0 0 1px rgba(139, 168, 255, 0.38)`,
    };
  }
  return base;
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

export type InputPortYsOpts = {
  /**
   * Logic oldal: bemenetek egy sávban a fejléc alatti törzsben (nem a teljes kártyán),
   * egységes elhelyezés a belső sorokhoz képest.
   */
  logicLayout?: boolean;
};

/**
 * Bemeneti port Y a kártya bal szélén, egyenlő lépésközzel.
 * Alap: teljes kártyamagasság; logicLayout: csak a törzs (HEADER+ROW2 alatt).
 */
export function inputPortYs(
  inCount: number,
  cardH: number,
  opts?: InputPortYsOpts
): number[] {
  if (inCount <= 0) return [];
  if (opts?.logicLayout) {
    const top = HEADER_H + ROW2_H + 8;
    const bottom = cardH - Math.max(CARD_BODY_BOTTOM_PAD, 8);
    const span = Math.max(bottom - top, 1);
    const step = span / (inCount + 1);
    return Array.from({ length: inCount }, (_, i) => top + (i + 1) * step);
  }
  const pad = 10;
  const top = pad;
  const bottom = cardH - pad;
  const span = Math.max(bottom - top, 1);
  const step = span / (inCount + 1);
  return Array.from({ length: inCount }, (_, i) => top + (i + 1) * step);
}

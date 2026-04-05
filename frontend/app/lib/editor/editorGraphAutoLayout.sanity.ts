/**
 * Futtatás (frontend mappából): `npx tsx app/lib/editor/editorGraphAutoLayout.sanity.ts`
 */
import { computeStructuredLayoutPositions } from "./editorGraphAutoLayout";
import type { StoryGraphEdge } from "./storyGraph";

const CARD_H = 112;
const ROW_GAP = 20;
const rowH = CARD_H + ROW_GAP;

const edges: StoryGraphEdge[] = [
  { id: "1", from: "r", to: "a", kind: "choice" },
  { id: "2", from: "r", to: "b", kind: "choice" },
  { id: "3", from: "a", to: "a1", kind: "choice" },
  { id: "4", from: "a", to: "a2", kind: "choice" },
];

const p = computeStructuredLayoutPositions({
  pageIds: ["r", "a", "b", "a1", "a2"],
  edges,
  startPageId: "r",
});

// Preorder r,a,a1,a2,b → depth1: a then b (b below a, same column)
if (p.a!.y >= p.b!.y) {
  console.error("FAIL: expected a above b in column", p);
  process.exit(1);
}
if (Math.abs(p.b!.y - p.a!.y - rowH) > 1e-3) {
  console.error("FAIL: expected b one row below a", p);
  process.exit(1);
}

if (p.a1!.x !== p.a2!.x || p.a!.x === p.a1!.x) {
  console.error("FAIL: column / depth mismatch", p);
  process.exit(1);
}

console.log("editorGraphAutoLayout sanity OK", p);

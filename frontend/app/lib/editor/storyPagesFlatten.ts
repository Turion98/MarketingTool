"use client";

/** Szerkesztői kategória — `end` külön kiszűrve a listákból. */
export type EditorPageCategory =
  | "narrative1"
  | "narrativeN"
  | "puzzleRiddle"
  | "puzzleRunes"
  | "logic"
  | "conditionalRouting"
  | "transition"
  | "other";

export type FlatStoryPage = {
  id: string;
  category: EditorPageCategory;
  raw: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function classifyEditorPage(
  page: Record<string, unknown>
): EditorPageCategory | "end" {
  const t = typeof page.type === "string" ? page.type : "default";
  if (t === "end") return "end";
  if (t === "logic") return "logic";
  if (t === "conditionalRouting") return "conditionalRouting";
  if (t === "transition") return "transition";
  if (t === "puzzle") {
    const k = page.kind;
    if (k === "riddle") return "puzzleRiddle";
    if (k === "runes") return "puzzleRunes";
    return "other";
  }
  const choices = Array.isArray(page.choices) ? page.choices : [];
  const logic = page.logic;
  if (
    logic &&
    typeof logic === "object" &&
    !Array.isArray(logic) &&
    choices.length === 0
  ) {
    return "logic";
  }
  if (choices.length === 1) return "narrative1";
  if (choices.length >= 2) return "narrativeN";
  return "other";
}

/** Szerkesztő: logic kártya (milestone UI nincs). */
export function isEditorLogicPage(page: Record<string, unknown>): boolean {
  return classifyEditorPage(page) === "logic";
}

/** `pages` tömb vagy objektum — gyökér `chapters` legacy nélkül (első körben). */
export function flattenStoryPages(story: Record<string, unknown>): FlatStoryPage[] {
  const out: FlatStoryPage[] = [];
  const pages = story.pages;

  const pushPage = (p: unknown) => {
    const rec = asRecord(p);
    if (!rec) return;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return;
    const cls = classifyEditorPage(rec);
    if (cls === "end") return;
    out.push({ id, category: cls, raw: rec });
  };

  if (Array.isArray(pages)) {
    pages.forEach(pushPage);
  } else if (pages && typeof pages === "object") {
    Object.values(pages).forEach(pushPage);
  }

  return out;
}

export function groupPagesByCategory(
  pages: FlatStoryPage[]
): Record<EditorPageCategory, FlatStoryPage[]> {
  const empty = (): Record<EditorPageCategory, FlatStoryPage[]> => ({
    narrative1: [],
    narrativeN: [],
    puzzleRiddle: [],
    puzzleRunes: [],
    logic: [],
    conditionalRouting: [],
    transition: [],
    other: [],
  });
  const g = empty();
  for (const p of pages) {
    g[p.category].push(p);
  }
  return g;
}

export const CATEGORY_LABELS: Record<EditorPageCategory, string> = {
  narrative1: "Egy opció",
  narrativeN: "Több opció",
  puzzleRiddle: "Puzzle — riddle",
  puzzleRunes: "Puzzle — runes",
  logic: "Logic",
  conditionalRouting: "Feltételes / routing",
  transition: "Átvezetés",
  other: "Egyéb",
};

/** Vázlat + vászon: minden szerkesztői típus fix sorrendben. */
export const EDITOR_CATEGORY_ORDER: EditorPageCategory[] = [
  "narrative1",
  "narrativeN",
  "puzzleRiddle",
  "puzzleRunes",
  "logic",
  "conditionalRouting",
  "transition",
  "other",
];

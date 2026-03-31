"use client";

import type { EditorPageCategory } from "./storyPagesFlatten";
import { classifyEditorPage, isEditorLogicPage } from "./storyPagesFlatten";
import { getStartPageIdFromStory } from "./findPageInStory";

export const STORY_GRAPH_START_NODE_ID = "__editor_start__";

export type StoryGraphEdgeKind =
  | "start"
  | "choice"
  | "logicElse"
  | "logicIf"
  | "puzzleSuccess"
  | "puzzleFail";

export type StoryGraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: StoryGraphEdgeKind;
  /** choice index, logic branch index, or label */
  label?: string;
};

export type StoryGraphNode = {
  pageId: string;
  category: EditorPageCategory;
  raw: Record<string, unknown>;
  /** `classifyEditorPage === "logic"` (egyezik az `isEditorLogicPage` szemantikával). */
  isLogicPage: boolean;
  isPuzzlePage: boolean;
  /** `puzzle` oldal `kind` mezője (riddle, runes, …) */
  puzzleKind?: string;
  choiceCount: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function collectPages(story: Record<string, unknown>): StoryGraphNode[] {
  const pages = story.pages;
  const out: StoryGraphNode[] = [];

  const push = (p: unknown) => {
    const rec = asRecord(p);
    if (!rec) return;
    const id = readString(rec.id);
    if (!id) return;
    const cls = classifyEditorPage(rec);
    if (cls === "end") return;

    const choices = Array.isArray(rec.choices) ? rec.choices : [];
    const isLogicPage = isEditorLogicPage(rec);
    const isPuzzlePage = rec.type === "puzzle";
    const puzzleKind =
      typeof rec.kind === "string" ? rec.kind : undefined;

    out.push({
      pageId: id,
      category: cls,
      raw: rec,
      isLogicPage,
      isPuzzlePage,
      puzzleKind,
      choiceCount: choices.length,
    });
  };

  if (Array.isArray(pages)) {
    pages.forEach(push);
  } else if (pages && typeof pages === "object") {
    Object.values(pages).forEach(push);
  }

  return out;
}

function choiceNext(choice: unknown): string | undefined {
  const c = asRecord(choice);
  return readString(c?.next);
}

function puzzleGoto(branch: unknown): string | undefined {
  const b = asRecord(branch);
  return readString(b?.goto);
}

/**
 * Riddle `onAnswer.nextSwitch`: string → egy elem; objektum → `cases` értékek kulcssorrendben
 * (duplikátum megmarad — külön vászni ág).
 */
export function collectRiddleBranchTargetsOrdered(
  page: Record<string, unknown>
): string[] {
  const onAnswer = asRecord(page.onAnswer);
  if (!onAnswer) return [];
  const ns = onAnswer.nextSwitch;
  if (typeof ns === "string" && ns.trim()) return [ns.trim()];
  const sw = asRecord(ns);
  if (!sw) return [];
  const cases = asRecord(sw.cases);
  if (!cases) return [];
  const keys = Object.keys(cases).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
  const out: string[] = [];
  for (const k of keys) {
    const v = cases[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  return out;
}

/**
 * Vászon / kártya: annyi cél-slot, ahány opciósor kell (több él ugyanarra az oldalra is).
 */
export function collectRiddleNextTargetsInOrder(
  page: Record<string, unknown>
): string[] {
  const branches = collectRiddleBranchTargetsOrdered(page);
  if (branches.length === 0) return [];

  const opts = Array.isArray(page.options)
    ? page.options.filter((x): x is string => typeof x === "string" && !!x)
    : [];
  const nOpt = opts.length;
  const onAnswer = asRecord(page.onAnswer);
  const nsRaw = onAnswer?.nextSwitch;

  if (typeof nsRaw === "string" && nsRaw.trim() && nOpt >= 1) {
    const t = nsRaw.trim();
    return Array.from({ length: nOpt }, () => t);
  }

  const nBranch = branches.length;
  const slots = Math.max(nOpt, nBranch, 1);
  return Array.from({ length: slots }, (_, i) =>
    i < nBranch ? branches[i]! : branches[nBranch - 1]!
  );
}

/** Egyedi céloldalak (validáció). */
export function collectRiddleNextTargets(
  page: Record<string, unknown>
): string[] {
  const ordered = collectRiddleNextTargetsInOrder(page);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of ordered) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Builds directed edges for editor canvas (choices, logic, puzzle branches).
 * Virtual start node `STORY_GRAPH_START_NODE_ID` links to meta.startPageId.
 */
export function buildStoryGraph(story: Record<string, unknown>): {
  nodes: StoryGraphNode[];
  edges: StoryGraphEdge[];
  startPageId: string | null;
} {
  const nodes = collectPages(story);
  const idSet = new Set(nodes.map((n) => n.pageId));
  const edges: StoryGraphEdge[] = [];
  let e = 0;
  const add = (
    from: string,
    to: string | undefined,
    kind: StoryGraphEdgeKind,
    label?: string
  ) => {
    if (!to || !idSet.has(to)) return;
    edges.push({
      id: `e${e++}`,
      from,
      to,
      kind,
      label,
    });
  };

  const startPageId = getStartPageIdFromStory(story);
  if (startPageId && idSet.has(startPageId)) {
    add(STORY_GRAPH_START_NODE_ID, startPageId, "start");
  }

  for (const n of nodes) {
    const rec = n.raw;
    const choices = Array.isArray(rec.choices) ? rec.choices : [];

    choices.forEach((ch, idx) => {
      const next = choiceNext(ch);
      add(n.pageId, next, "choice", String(idx));
    });

    const logic = asRecord(rec.logic);
    if (logic) {
      const ifHas = Array.isArray(logic.ifHasFragment)
        ? logic.ifHasFragment
        : [];
      ifHas.forEach((entry, idx) => {
        const row = asRecord(entry);
        const goTo = readString(row?.goTo);
        const frag = readString(row?.fragment);
        add(n.pageId, goTo, "logicIf", frag ?? String(idx));
      });
      const elseGoTo = readString(logic.elseGoTo);
      add(n.pageId, elseGoTo, "logicElse");
    }

    /** Tömbös logic (pl. SkinCare: `{ if, goto }` + `{ default }`) — különben a gráf megszakad. */
    if (Array.isArray(rec.logic)) {
      rec.logic.forEach((entry, idx) => {
        const row = asRecord(entry);
        if (!row) return;
        const goTo = readString(row.goto);
        const defaultTo = readString(row.default);
        const ifArr = Array.isArray(row.if)
          ? row.if.filter(
              (x): x is string => typeof x === "string" && x.length > 0
            )
          : [];
        if (ifArr.length > 0 && goTo) {
          add(n.pageId, goTo, "logicIf", ifArr.join(", "));
          return;
        }
        if (defaultTo && !goTo && ifArr.length === 0) {
          add(n.pageId, defaultTo, "logicElse");
          return;
        }
        const target = goTo ?? defaultTo;
        if (target) {
          add(n.pageId, target, "logicIf", String(idx));
        }
      });
    }

    if (rec.type === "conditionalRouting") {
      const ns = Array.isArray(rec.nextSwitch) ? rec.nextSwitch : [];
      ns.forEach((entry, idx) => {
        const row = asRecord(entry);
        const goTo = readString(row?.goto);
        add(n.pageId, goTo, "logicIf", `cr:${idx}`);
      });
    }

    if (rec.type === "puzzleRoute") {
      const ra = asRecord(rec.routeAssignments) ?? {};
      Object.entries(ra).forEach(([key, v]) => {
        const goTo = typeof v === "string" ? v : "";
        add(n.pageId, goTo, "logicIf", `rt:${key}`);
      });
      const def = readString(rec.defaultGoto);
      add(n.pageId, def, "logicElse");
    }

    if (rec.type === "puzzle") {
      if (rec.kind === "riddle") {
        const targets = collectRiddleNextTargetsInOrder(rec);
        targets.forEach((t, idx) => {
          add(n.pageId, t, "puzzleSuccess", String(idx));
        });
      } else {
        const onSuccess = asRecord(rec.onSuccess);
        const onFail = asRecord(rec.onFail);
        add(n.pageId, puzzleGoto(onSuccess), "puzzleSuccess");
        add(n.pageId, puzzleGoto(onFail), "puzzleFail");
      }
    }
  }

  return { nodes, edges, startPageId };
}

/**
 * Ugyanabból a forrásoldalból ugyanarra a céloldalra mutató élek egy kötegbe —
 * a vásznon egy bekötés + korai összefutás.
 */
export function bundleIncomingEdgesForTarget(
  incoming: StoryGraphEdge[]
): StoryGraphEdge[][] {
  const m = new Map<string, StoryGraphEdge[]>();
  for (const e of incoming) {
    const k = `${e.from}\0${e.to}`;
    const arr = m.get(k) ?? [];
    arr.push(e);
    m.set(k, arr);
  }
  return Array.from(m.entries())
    .sort(([ka], [kb]) => ka.localeCompare(kb))
    .map(([, v]) => v.sort((a, b) => a.id.localeCompare(b.id)));
}

/** Incoming edge count per target (for input port dots). */
export function countIncomingEdges(
  edges: StoryGraphEdge[],
  excludeStart = true
): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of edges) {
    if (excludeStart && e.from === STORY_GRAPH_START_NODE_ID) continue;
    m.set(e.to, (m.get(e.to) ?? 0) + 1);
  }
  return m;
}

/** Per source page: list of outgoing targets (for layout ordering). */
export function outgoingTargetsForPage(
  pageId: string,
  edges: StoryGraphEdge[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of edges) {
    if (e.from !== pageId) continue;
    if (seen.has(e.to)) continue;
    seen.add(e.to);
    out.push(e.to);
  }
  return out;
}

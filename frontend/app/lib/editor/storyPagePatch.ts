"use client";

import {
  collectStoryPageIds,
  findPageInStoryDocument,
  getStartPageIdFromStory,
} from "./findPageInStory";
import { STORY_GRAPH_START_NODE_ID } from "./storyGraph";
import {
  mergeEditorLayoutIntoStory,
  readEditorLayoutFromStory,
  type EditorLayoutState,
} from "./storyGraphLayout";
import { classifyEditorPage } from "./storyPagesFlatten";
import { isEditorPendingPageId } from "./storyTemplateInsert";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function replacePageInStory(
  story: Record<string, unknown>,
  pageId: string,
  newPage: Record<string, unknown>
): Record<string, unknown> {
  const next = clone(story);
  const pages = next.pages;
  const merged = { ...newPage, id: pageId };
  if (Array.isArray(pages)) {
    next.pages = pages.map((p) => {
      const rec = asRecord(p);
      if (!rec || rec.id !== pageId) return p;
      return merged;
    });
    return next;
  }
  if (pages && typeof pages === "object" && !Array.isArray(pages)) {
    const dict = { ...(pages as Record<string, unknown>) };
    if (pageId in dict) dict[pageId] = merged;
    next.pages = dict;
    return next;
  }
  return next;
}

/** Szerkesztő / story JSON: `fragments[id].text` */
export function readFragmentTextFromStory(
  story: Record<string, unknown>,
  fragmentId: string
): string {
  const id = fragmentId.trim();
  if (!id) return "";
  const bank = asRecord(story.fragments);
  if (!bank || !(id in bank)) return "";
  const fr = asRecord(bank[id]);
  const t = fr?.text;
  return typeof t === "string" ? t : "";
}

export function upsertStoryFragmentText(
  story: Record<string, unknown>,
  fragmentId: string,
  text: string
): Record<string, unknown> {
  const next = clone(story);
  const prev = asRecord(next.fragments) ?? {};
  next.fragments = {
    ...prev,
    [fragmentId]: {
      ...(asRecord(prev[fragmentId]) ?? {}),
      id: fragmentId,
      text,
    },
  };
  return next;
}

export function removeStoryFragment(
  story: Record<string, unknown>,
  fragmentId: string
): Record<string, unknown> {
  const next = clone(story);
  const prev = asRecord(next.fragments);
  if (!prev || !(fragmentId in prev)) return next;
  const rest = { ...prev };
  delete rest[fragmentId];
  next.fragments = rest;
  return next;
}

export function applyEditorLayout(
  story: Record<string, unknown>,
  layout: EditorLayoutState
): Record<string, unknown> {
  return mergeEditorLayoutIntoStory(story, layout);
}

export function setMetaStartPageId(
  story: Record<string, unknown>,
  startPageId: string
): Record<string, unknown> {
  const next = clone(story);
  const meta = asRecord(next.meta) ?? {};
  next.meta = { ...meta, startPageId };
  return next;
}

/** Eltávolítja az oldalt a `pages` tömbből/objektumból, a layoutból; ha ez volt a kezdő, új kezdőt állít. */
export function removePageFromStory(
  story: Record<string, unknown>,
  pageId: string
): Record<string, unknown> {
  const id = pageId.trim();
  if (!id) return story;
  const next = clone(story);
  const pages = next.pages;

  if (Array.isArray(pages)) {
    next.pages = pages.filter((p) => {
      const r = asRecord(p);
      return !r || r.id !== id;
    });
  } else if (pages && typeof pages === "object" && !Array.isArray(pages)) {
    const dict = { ...(pages as Record<string, unknown>) };
    delete dict[id];
    next.pages = dict;
  }

  const meta = asRecord(next.meta) ?? {};
  const layoutWrap = asRecord(meta.editorLayout);
  if (layoutWrap && layoutWrap.version === 1) {
    const nodesRaw = layoutWrap.nodes;
    if (nodesRaw && typeof nodesRaw === "object" && !Array.isArray(nodesRaw)) {
      const nodes = { ...(nodesRaw as Record<string, unknown>) };
      delete nodes[id];
      next.meta = {
        ...meta,
        editorLayout: {
          ...layoutWrap,
          nodes,
        },
      };
    }
  }

  const start = getStartPageIdFromStory(next);
  if (start === id) {
    const ids = collectStoryPageIds(next);
    const nextMeta = { ...(asRecord(next.meta) ?? {}) };
    if (ids.length > 0) {
      nextMeta.startPageId = ids[0]!;
    } else {
      delete nextMeta.startPageId;
    }
    next.meta = nextMeta;
  }

  return next;
}

/** Navigációs célok frissítése más oldalakon, ha `from` → `to` átnevezés történt. */
export function patchOutgoingNavRefsInPage(
  page: Record<string, unknown>,
  from: string,
  to: string
): Record<string, unknown> {
  const next = { ...page };
  if (typeof next.next === "string" && next.next === from) next.next = to;

  if (Array.isArray(next.choices)) {
    next.choices = next.choices.map((ch) => {
      const c = asRecord(ch);
      if (!c) return ch;
      if (c.next === from) return { ...c, next: to };
      return c;
    });
  }

  const logicVal = next.logic;
  const logicObj = asRecord(logicVal);
  if (logicObj && !Array.isArray(logicVal)) {
    const l = { ...logicObj };
    if (typeof l.elseGoTo === "string" && l.elseGoTo === from) l.elseGoTo = to;
    if (Array.isArray(l.ifHasFragment)) {
      l.ifHasFragment = l.ifHasFragment.map((entry) => {
        const row = asRecord(entry);
        if (row && typeof row.goTo === "string" && row.goTo === from)
          return { ...row, goTo: to };
        return entry;
      });
    }
    next.logic = l;
  }
  if (Array.isArray(logicVal)) {
    next.logic = logicVal.map((entry) => {
      const row = asRecord(entry);
      if (!row) return entry;
      const o = { ...row };
      if (o.goto === from) o.goto = to;
      return o;
    });
  }

  if (
    typeof next.scorecardFallback === "string" &&
    next.scorecardFallback === from
  ) {
    next.scorecardFallback = to;
  }

  if (next.type === "conditionalRouting" && Array.isArray(next.nextSwitch)) {
    next.nextSwitch = next.nextSwitch.map((entry) => {
      const row = asRecord(entry);
      if (!row) return entry;
      if (typeof row.goto === "string" && row.goto === from)
        return { ...row, goto: to };
      return entry;
    });
  }

  if (next.type === "puzzleRoute") {
    if (
      typeof next.puzzleSourcePageId === "string" &&
      next.puzzleSourcePageId === from
    ) {
      next.puzzleSourcePageId = to;
    }
    const ra = asRecord(next.routeAssignments);
    if (ra) {
      const nr: Record<string, unknown> = { ...ra };
      for (const k of Object.keys(nr)) {
        if (nr[k] === from) nr[k] = to;
      }
      next.routeAssignments = nr;
    }
  }
  if (classifyEditorPage(next) === "decision") {
    if (typeof next.defaultGoto === "string" && next.defaultGoto === from) {
      next.defaultGoto = to;
    }
    if (typeof next.defaultNext === "string" && next.defaultNext === from) {
      next.defaultNext = to;
    }
    const ra =
      asRecord(next.routeAssignments) ??
      asRecord(next.routes) ??
      asRecord(next.nextByPoolKey) ??
      asRecord(next.routeMap);
    if (ra) {
      const nr: Record<string, unknown> = { ...ra };
      for (const k of Object.keys(nr)) {
        if (nr[k] === from) nr[k] = to;
      }
      if (asRecord(next.routeAssignments)) next.routeAssignments = nr;
      else if (asRecord(next.routes)) next.routes = nr;
      else if (asRecord(next.nextByPoolKey)) next.nextByPoolKey = nr;
      else next.routeAssignments = nr;
    }
  }

  const tr = asRecord(next.transition);
  if (tr && typeof tr.nextPageId === "string" && tr.nextPageId === from) {
    next.transition = { ...tr, nextPageId: to };
  }

  if (next.type === "puzzle") {
    const onS = asRecord(next.onSuccess);
    if (onS && onS.goto === from) next.onSuccess = { ...onS, goto: to };
    const onF = asRecord(next.onFail);
    if (onF && onF.goto === from) next.onFail = { ...onF, goto: to };
    const oa = asRecord(next.onAnswer);
    if (oa) {
      const ns = oa.nextSwitch;
      if (typeof ns === "string" && ns === from) {
        next.onAnswer = { ...oa, nextSwitch: to };
      } else {
        const sw = asRecord(ns);
        if (sw) {
          const cases = asRecord(sw.cases);
          if (cases) {
            const newCases = { ...cases };
            for (const k of Object.keys(newCases)) {
              if (newCases[k] === from) newCases[k] = to;
            }
            next.onAnswer = {
              ...oa,
              nextSwitch: { ...sw, cases: newCases },
            };
          }
        }
      }
    }
  }

  return next;
}

export type RenameStoryPageIdResult =
  | { ok: true; story: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Oldal `id` és `pages` kulcs átnevezése, hivatkozások + layout + opcionális `{id}_DONE` fragment.
 */
export function renameStoryPageIdInStory(
  story: Record<string, unknown>,
  fromId: string,
  toId: string
): RenameStoryPageIdResult {
  const from = fromId.trim();
  const trimmed = toId.trim();
  if (!from) return { ok: false, error: "Add meg a régi oldal-ID-t, amit át szeretnél nevezni." };
  if (!trimmed) return { ok: false, error: "Az új oldal-ID nem maradhat üresen." };
  if (trimmed === STORY_GRAPH_START_NODE_ID) {
    return { ok: false, error: "Ez a név a virtuális START csomópontot jelenti — válassz másik ID-t." };
  }
  if (isEditorPendingPageId(trimmed)) {
    return { ok: false, error: "Ez az ID szerkesztői előtagot használ — nem lehet végleges név." };
  }
  if (!findPageInStoryDocument(story, from)) {
    return { ok: false, error: "Nincs ilyen oldal a projektben — ellenőrizd az ID-t." };
  }
  const existing = collectStoryPageIds(story);
  if (existing.includes(trimmed) && trimmed !== from) {
    return { ok: false, error: "Ez az ID már foglalt — válassz másik nevet." };
  }
  if (trimmed === from) return { ok: true, story: clone(story) };

  const next = clone(story);
  const pages = next.pages;

  if (pages && typeof pages === "object" && !Array.isArray(pages)) {
    const d = { ...(pages as Record<string, unknown>) };
    const src = asRecord(d[from]);
    if (!src) return { ok: false, error: "Nincs ilyen oldal a projektben — ellenőrizd az ID-t." };
    const newD: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (k === from) continue;
      const rec = asRecord(v);
      if (!rec) {
        newD[k] = v;
        continue;
      }
      newD[k] = patchOutgoingNavRefsInPage(rec, from, trimmed);
    }
    const patchedSrc = patchOutgoingNavRefsInPage(src, from, trimmed);
    newD[trimmed] = { ...patchedSrc, id: trimmed };
    next.pages = newD;
  } else if (Array.isArray(pages)) {
    next.pages = pages.map((p) => {
      const rec = asRecord(p);
      if (!rec) return p;
      let patched = patchOutgoingNavRefsInPage(rec, from, trimmed);
      if (typeof patched.id === "string" && patched.id === from) {
        patched = { ...patched, id: trimmed };
      }
      return patched;
    });
  } else {
    return { ok: false, error: "A pages mező formátuma nem ismert — várd meg a teljes betöltést, vagy javítsd a JSON-t." };
  }

  const start = getStartPageIdFromStory(next);
  if (start === from) {
    const meta = asRecord(next.meta) ?? {};
    next.meta = { ...meta, startPageId: trimmed };
  }

  const layout = readEditorLayoutFromStory(next);
  if (layout?.nodes[from]) {
    const nodes = { ...layout.nodes };
    const pos = nodes[from]!;
    delete nodes[from];
    nodes[trimmed] = pos;
    Object.assign(
      next,
      mergeEditorLayoutIntoStory(next, { ...layout, nodes })
    );
  }

  const doneOld = `${from}_DONE`;
  const doneNew = `${trimmed}_DONE`;
  const fragBank = asRecord(next.fragments);
  if (fragBank && doneOld in fragBank && !(doneNew in fragBank)) {
    const rest = { ...fragBank };
    const entry = rest[doneOld];
    delete rest[doneOld];
    const fr = asRecord(entry);
    rest[doneNew] = fr ? { ...fr, id: doneNew } : entry;
    next.fragments = rest;
  }

  return { ok: true, story: next };
}

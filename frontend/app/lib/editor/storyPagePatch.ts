"use client";

import {
  collectStoryPageIds,
  getStartPageIdFromStory,
} from "./findPageInStory";
import { mergeEditorLayoutIntoStory, type EditorLayoutState } from "./storyGraphLayout";

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

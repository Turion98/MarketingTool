"use client";

const PAGE_LIKE_KEYS = [
  "type",
  "text",
  "choices",
  "logic",
  "imagePrompt",
  "audio",
  "transition",
] as const;

function looksLikeStoryPage(node: Record<string, unknown>): boolean {
  if (typeof node.id !== "string" || !node.id) return false;
  return PAGE_LIKE_KEYS.some((k) => k in node);
}

/**
 * Ugyanaz a logika, mint a backend `find_page_recursive` (story_runtime.py).
 */
export function findPageRecursive(
  node: unknown,
  pageId: string
): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const it of node) {
      const found = findPageRecursive(it, pageId);
      if (found) return found;
    }
    return null;
  }

  const o = node as Record<string, unknown>;
  if (o.id === pageId && looksLikeStoryPage(o)) {
    return o;
  }

  const pages = o.pages;
  if (Array.isArray(pages)) {
    for (const it of pages) {
      const found = findPageRecursive(it, pageId);
      if (found) return found;
    }
  }

  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const found = findPageRecursive(v, pageId);
      if (found) return found;
    }
  }

  return null;
}

export function findPageInStoryDocument(
  story: Record<string, unknown>,
  pageId: string
): Record<string, unknown> | null {
  const pages = story.pages;
  if (pages && typeof pages === "object" && !Array.isArray(pages)) {
    const dict = pages as Record<string, unknown>;
    if (pageId in dict) {
      const p = dict[pageId];
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    }
  }
  return findPageRecursive(story, pageId);
}

export function collectStoryPageIds(story: unknown): string[] {
  const ids = new Set<string>();

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const o = node as Record<string, unknown>;
    if (looksLikeStoryPage(o) && typeof o.id === "string") {
      ids.add(o.id);
    }
    for (const v of Object.values(o)) visit(v);
  }

  visit(story);
  return Array.from(ids);
}

export function getStartPageIdFromStory(story: unknown): string | null {
  if (!story || typeof story !== "object" || Array.isArray(story)) return null;
  const meta = (story as Record<string, unknown>).meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const sp = (meta as Record<string, unknown>).startPageId;
    if (typeof sp === "string" && sp) return sp;
  }
  return null;
}

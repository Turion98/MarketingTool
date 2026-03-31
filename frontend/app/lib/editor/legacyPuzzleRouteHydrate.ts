"use client";

import { findPageInStoryDocument } from "./findPageInStory";
import { canonicalRouteKey } from "../puzzleRoutePick";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function iterStoryPages(story: Record<string, unknown>): Record<string, unknown>[] {
  const pages = story.pages;
  const out: Record<string, unknown>[] = [];
  if (Array.isArray(pages)) {
    for (const p of pages) {
      const r = asRecord(p);
      if (r && typeof r.id === "string" && r.id) out.push(r);
    }
  } else if (pages && typeof pages === "object") {
    for (const p of Object.values(pages)) {
      const r = asRecord(p);
      if (r && typeof r.id === "string" && r.id) out.push(r);
    }
  }
  return out;
}

/** Runes puzzle, amelynek onSuccess.goto erre a route oldalra mutat. */
export function inferRunesSourcePageIdForRouteTarget(
  story: Record<string, unknown>,
  routePageId: string
): string | null {
  for (const p of iterStoryPages(story)) {
    if (p.type !== "puzzle" || p.kind !== "runes") continue;
    const os = asRecord(p.onSuccess);
    const g = typeof os?.goto === "string" ? os.goto.trim() : "";
    if (g === routePageId) {
      const id = typeof p.id === "string" ? p.id : "";
      return id || null;
    }
  }
  return null;
}

/**
 * Régi `type: "logic"` + tömb (`if`: optionFlagsBase + index, `goto` / `default`).
 * A játék runtime globál kulcs alapján is működik; a szerkesztő indexkulcsokra konvertál.
 */
export function parseLegacyLogicArrayToRouteAssignments(
  logicArr: unknown[],
  sourcePage: Record<string, unknown>
): { assignments: Record<string, string>; defaultGoto: string } | null {
  const base =
    typeof sourcePage.optionFlagsBase === "string"
      ? sourcePage.optionFlagsBase
      : "";
  if (!base.trim()) return null;
  const mode = sourcePage.mode === "ordered" ? "ordered" : "set";
  const assignments: Record<string, string> = {};
  let defaultGoto = "";

  for (const entry of logicArr) {
    const r = asRecord(entry);
    if (!r) continue;
    const def = typeof r.default === "string" ? r.default.trim() : "";
    const go = typeof r.goto === "string" ? r.goto.trim() : "";
    const ifRaw = Array.isArray(r.if) ? r.if : null;

    if ((!ifRaw || ifRaw.length === 0) && def && !go) {
      defaultGoto = def;
      continue;
    }
    if (!ifRaw || !go) continue;

    const indices: number[] = [];
    for (const raw of ifRaw) {
      if (typeof raw !== "string") return null;
      const f = raw.trim();
      if (!f.startsWith(base)) return null;
      const rest = f.slice(base.length);
      const n = Number.parseInt(rest, 10);
      if (!Number.isFinite(n) || n < 1) return null;
      indices.push(n);
    }
    if (indices.length === 0) continue;
    const key = canonicalRouteKey(indices, mode);
    if (key) assignments[key] = go;
  }

  return { assignments, defaultGoto };
}

export function hydrateRouteFieldsFromStoryPage(
  story: Record<string, unknown>,
  routePageId: string,
  page: Record<string, unknown>
): {
  sourceId: string;
  defaultGoto: string;
  assignments: Record<string, string>;
} {
  if (page.type === "puzzleRoute") {
    let sid =
      typeof page.puzzleSourcePageId === "string"
        ? page.puzzleSourcePageId.trim()
        : "";
    if (!sid) {
      sid = inferRunesSourcePageIdForRouteTarget(story, routePageId) ?? "";
    }
    const def =
      typeof page.defaultGoto === "string" ? page.defaultGoto.trim() : "";
    const ra = asRecord(page.routeAssignments) ?? {};
    const assignments: Record<string, string> = {};
    for (const [k, v] of Object.entries(ra)) {
      assignments[k] = typeof v === "string" ? v : "";
    }
    return { sourceId: sid, defaultGoto: def, assignments };
  }

  const logicArr = Array.isArray(page.logic) ? page.logic : [];
  if (page.type !== "logic" || logicArr.length === 0) {
    return { sourceId: "", defaultGoto: "", assignments: {} };
  }

  const inferred =
    inferRunesSourcePageIdForRouteTarget(story, routePageId) ?? "";
  const sp = inferred ? findPageInStoryDocument(story, inferred) : null;
  if (!sp) {
    return { sourceId: inferred, defaultGoto: "", assignments: {} };
  }

  const parsed = parseLegacyLogicArrayToRouteAssignments(logicArr, sp);
  if (!parsed) {
    return { sourceId: inferred, defaultGoto: "", assignments: {} };
  }

  return {
    sourceId: inferred,
    defaultGoto: parsed.defaultGoto,
    assignments: parsed.assignments,
  };
}

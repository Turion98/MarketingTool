"use client";

/** Regex speciális karakterek menekítése. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

/**
 * `openBracePos` a `{` karakter indexe. Visszaadja a párosító `}` indexét, vagy -1.
 */
export function findMatchingObjectEnd(text: string, openBracePos: number): number {
  if (text[openBracePos] !== "{") return -1;
  let depth = 1;
  let inString = false;
  let escape = false;
  for (let i = openBracePos + 1; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readJsonStringKey(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null;
  let i = start + 1;
  let out = "";
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') return { value: out, end: i + 1 };
    if (c === "\\") {
      i++;
      if (i >= text.length) return null;
      out += text[i]!;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return null;
}

function extractPageIdFromObjectSlice(slice: string): string | null {
  const m = /"id"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(slice);
  return m?.[1] ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : null;
}

/** `pages: [ {...}, ... ]` — első előfordulás / oldal id. */
function rangesFromPagesArray(text: string): Map<string, { start: number; end: number }> {
  const map = new Map<string, { start: number; end: number }>();
  const head = /"pages"\s*:\s*\[\s*/.exec(text);
  if (!head) return map;
  let i = head.index + head[0].length;
  const n = text.length;
  while (i < n) {
    i = skipWs(text, i);
    if (i >= n) break;
    if (text[i] === "]") break;
    if (text[i] !== "{") {
      i++;
      continue;
    }
    const objStart = i;
    const objEnd = findMatchingObjectEnd(text, objStart);
    if (objEnd < 0) break;
    const slice = text.slice(objStart, objEnd + 1);
    const pid = extractPageIdFromObjectSlice(slice);
    if (pid && !map.has(pid)) {
      map.set(pid, { start: objStart, end: objEnd + 1 });
    }
    i = objEnd + 1;
    i = skipWs(text, i);
    if (i < n && text[i] === ",") i++;
  }
  return map;
}

/** `pages: { "pageId": { ... }, ... }` */
function rangesFromPagesObject(text: string): Map<string, { start: number; end: number }> {
  const map = new Map<string, { start: number; end: number }>();
  const head = /"pages"\s*:\s*\{/.exec(text);
  if (!head) return map;
  let i = head.index + head[0].length;
  const n = text.length;
  while (i < n) {
    i = skipWs(text, i);
    if (i >= n || text[i] === "}") break;
    const ks = readJsonStringKey(text, i);
    if (!ks) break;
    const key = ks.value;
    i = skipWs(text, ks.end);
    if (i >= n || text[i] !== ":") break;
    i++;
    i = skipWs(text, i);
    if (i >= n || text[i] !== "{") break;
    const objStart = i;
    const objEnd = findMatchingObjectEnd(text, objStart);
    if (objEnd < 0) break;
    if (!map.has(key)) {
      map.set(key, { start: objStart, end: objEnd + 1 });
    }
    i = objEnd + 1;
    i = skipWs(text, i);
    if (i < n && text[i] === ",") i++;
  }
  return map;
}

/**
 * Oldal id → a teljes page objektum [start, end) a nyers JSON-ban (`pages` tömb vagy objektum).
 */
export function buildPageObjectRangeMap(
  jsonText: string
): Map<string, { start: number; end: number }> {
  const fromArr = rangesFromPagesArray(jsonText);
  if (fromArr.size > 0) return fromArr;
  return rangesFromPagesObject(jsonText);
}

export function rangesForPageIds(
  pageIds: string[],
  rangeById: Map<string, { start: number; end: number }>
): Array<{ pageId: string; start: number; end: number }> {
  const out: Array<{ pageId: string; start: number; end: number }> = [];
  for (const id of pageIds) {
    const r = rangeById.get(id);
    if (r) out.push({ pageId: id, start: r.start, end: r.end });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

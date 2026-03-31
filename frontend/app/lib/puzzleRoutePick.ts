"use client";

/** Globál kulcs: utolsó runes választás kombinációja (1-alapú indexek, pl. "2,4"). */
export function puzzleRoutePickGlobalKey(puzzlePageId: string): string {
  return `puzzleRoutePick__${puzzlePageId}`;
}

export function runesPickBounds(page: {
  minPick?: number;
  maxPick?: number;
  answer?: unknown[];
}): { minPick: number; maxPick: number } {
  const ans = Array.isArray(page.answer) ? page.answer : [];
  const hasAnswer = ans.some(
    (x) => typeof x === "string" && String(x).trim().length > 0
  );
  const maxPick =
    typeof page.maxPick === "number" && page.maxPick > 0
      ? page.maxPick
      : hasAnswer
        ? ans.filter((x) => typeof x === "string" && String(x).trim()).length
        : 2;
  /** Nyitott puzzle: üres minPick = 1..maxPick (route + submit). Graded: üres min = pontos darabszám. */
  const rawMin =
    typeof page.minPick === "number" && page.minPick > 0
      ? page.minPick
      : hasAnswer
        ? maxPick
        : 1;
  const minPick = Math.max(1, Math.min(rawMin, maxPick));
  return { minPick, maxPick };
}

export function labelsToIndices1Based(
  picked: string[],
  options: string[]
): number[] {
  return picked
    .map((label) => {
      const idx = options.indexOf(label);
      return idx >= 0 ? idx + 1 : -1;
    })
    .filter((i) => i > 0);
}

export function canonicalRouteKey(
  indices: number[],
  mode: "set" | "ordered"
): string {
  const valid = indices.filter((x) => x > 0);
  if (valid.length === 0) return "";
  if (mode === "set") {
    return [...valid].sort((a, b) => a - b).join(",");
  }
  return valid.join(",");
}

/** Open (nincs answer) runes siker után: kanonikus kulcs a route táblához. */
export function buildOpenModeRoutePickKey(
  picked: string[],
  options: string[],
  mode: "set" | "ordered",
  minPick: number,
  maxPick: number
): string | null {
  const idx = labelsToIndices1Based(picked, options);
  if (idx.length < minPick || idx.length > maxPick) return null;
  if (mode === "set" && new Set(idx).size !== idx.length) return null;
  const key = canonicalRouteKey(idx, mode);
  return key || null;
}

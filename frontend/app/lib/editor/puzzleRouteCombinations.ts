"use client";

function combinationsSizeK(n: number, k: number): number[][] {
  const res: number[][] = [];
  function dfs(start: number, path: number[]) {
    if (path.length === k) {
      res.push([...path]);
      return;
    }
    for (let i = start; i <= n; i++) {
      path.push(i);
      dfs(i + 1, path);
      path.pop();
    }
  }
  dfs(1, []);
  return res;
}

function kPermutations(n: number, k: number): number[][] {
  const nums = Array.from({ length: n }, (_, i) => i + 1);
  const res: number[][] = [];
  function dfs(path: number[], used: Set<number>) {
    if (path.length === k) {
      res.push([...path]);
      return;
    }
    for (const x of nums) {
      if (used.has(x)) continue;
      used.add(x);
      path.push(x);
      dfs(path, used);
      path.pop();
      used.delete(x);
    }
  }
  dfs([], new Set());
  return res;
}

function compareKeys(a: string, b: string): number {
  const aa = a.split(",").map((x) => Number.parseInt(x, 10) || 0);
  const bb = b.split(",").map((x) => Number.parseInt(x, 10) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const d = (aa[i] ?? -1) - (bb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** 1..n opció indexekből összes érvényes kombináció kulcs (vesszővel). */
export function generatePuzzleRouteKeys(
  n: number,
  minK: number,
  maxK: number,
  mode: "set" | "ordered"
): string[] {
  if (n < 1) return [];
  const lo = Math.max(1, minK);
  const hi = Math.min(Math.max(lo, maxK), n);
  if (lo > hi) return [];
  const keys = new Set<string>();
  for (let k = lo; k <= hi; k++) {
    if (mode === "set") {
      for (const c of combinationsSizeK(n, k)) {
        keys.add(c.join(","));
      }
    } else {
      for (const c of kPermutations(n, k)) {
        keys.add(c.join(","));
      }
    }
  }
  return Array.from(keys).sort(compareKeys);
}

export function formatRouteKeyWithLabels(
  key: string,
  options: string[]
): string {
  const parts = key
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((i) => i >= 1 && i <= options.length)
    .map((i) => options[i - 1] ?? `#${i}`);
  return parts.length ? `${key} — ${parts.join(" · ")}` : key;
}

/** Egyszerű javaslat: opció szövege és oldal cím / id részleges egyezés. */
export function suggestPageIdForRouteKey(
  key: string,
  options: string[],
  candidates: Array<{ id: string; title?: string }>
): string {
  const idxs = key
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => n >= 1);
  const labels = idxs
    .map((i) => options[i - 1])
    .filter((t): t is string => typeof t === "string" && !!t.trim());
  const hay = `${labels.join(" ")} ${key}`.toLowerCase();

  let best = "";
  let bestScore = 0;
  for (const c of candidates) {
    const id = c.id.toLowerCase();
    const title = (c.title ?? "").toLowerCase();
    let score = 0;
    for (const lab of labels) {
      const l = lab.toLowerCase();
      if (l && title.includes(l)) score += 3;
      if (l && id.includes(l)) score += 2;
    }
    if (key && id.includes(key.replace(/,/g, ""))) score += 1;
    if (
      hay &&
      title &&
      hay.split(/\s+/).some((w) => w.length > 2 && title.includes(w))
    )
      score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = c.id;
    }
  }
  return best;
}

import type { DistantEdgeBundle } from "./StoryEdges";

const INBOUND_CHIP_MIN_GAP = 19;
const CLAMP_MARGIN = 8;

type WorldBox = { y: number; h: number };

function clampInboundY(pageId: string, y: number, world: Map<string, WorldBox>): number {
  const w = world.get(pageId);
  if (!w) return y;
  const y0 = w.y + CLAMP_MARGIN;
  const y1 = w.y + w.h - CLAMP_MARGIN;
  return Math.min(y1, Math.max(y0, y));
}

function targetBand(
  pageId: string,
  world: Map<string, WorldBox>
): { y0: number; y1: number } | null {
  const w = world.get(pageId);
  if (!w) return null;
  const y0 = w.y + CLAMP_MARGIN;
  const y1 = w.y + w.h - CLAMP_MARGIN;
  if (y1 <= y0) return { y0: w.y + w.h / 2, y1: w.y + w.h / 2 };
  return { y0, y1 };
}

/**
 * Ugyanazon cél oldal távoli bemeneti címkéi: azonos X, Y-ban nem fedik egymást.
 * Először függőleges „lépcső” a geometriai y2 szerint, majd az egész csoport
 * beleillesztése a cél kártya sávjába (tolás vagy arányos skálázás).
 */
export function computeDistantInboundYByKey(
  bundles: DistantEdgeBundle[],
  world: Map<string, WorldBox>
): Map<string, number> {
  const byTo = new Map<string, DistantEdgeBundle[]>();
  for (const b of bundles) {
    const arr = byTo.get(b.toPageId) ?? [];
    arr.push(b);
    byTo.set(b.toPageId, arr);
  }
  const out = new Map<string, number>();

  for (const [, list] of byTo) {
    if (list.length === 0) continue;
    const toId = list[0]!.toPageId;
    if (list.length === 1) {
      const b = list[0]!;
      out.set(b.key, clampInboundY(toId, b.y2, world));
      continue;
    }
    const sorted = [...list].sort(
      (a, b) => a.y2 - b.y2 || a.key.localeCompare(b.key)
    );
    const stacked: number[] = [];
    stacked.push(sorted[0]!.y2);
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i]!;
      stacked.push(Math.max(b.y2, stacked[i - 1]! + INBOUND_CHIP_MIN_GAP));
    }

    const band = targetBand(toId, world);
    if (!band) {
      for (let i = 0; i < sorted.length; i++) {
        out.set(sorted[i]!.key, stacked[i]!);
      }
      continue;
    }

    const { y0, y1 } = band;
    const avail = y1 - y0;
    let placed: number[];

    if (avail <= 0) {
      placed = sorted.map(() => y0);
    } else {
      const minP = Math.min(...stacked);
      const maxP = Math.max(...stacked);
      const span = maxP - minP;
      if (span <= avail) {
        const midBand = (y0 + y1) / 2;
        const midStack = (minP + maxP) / 2;
        let off = midBand - midStack;
        off = Math.min(off, y1 - maxP);
        off = Math.max(off, y0 - minP);
        placed = stacked.map((v) => v + off);
      } else if (span > 0) {
        placed = stacked.map((v) => y0 + ((v - minP) * avail) / span);
      } else {
        placed = stacked.map(() => (y0 + y1) / 2);
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      out.set(sorted[i]!.key, placed[i]!);
    }
  }
  return out;
}

/** Utolsó `L x y` szegmens Y-jának cseréje (merge távoli path). */
export function replaceDistantPathEndY(pathD: string, yEnd: number): string {
  return pathD.replace(/L\s+([\d.-]+)\s+([\d.-]+)\s*$/, (_, x) => `L ${x} ${yEnd}`);
}

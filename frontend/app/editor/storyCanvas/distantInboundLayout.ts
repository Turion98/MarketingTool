import type { DistantEdgeBundle } from "./StoryEdges";

/** World px: bekötés-chip „magasság” + légzőtér (összeomlott kategória-kártyán több él). */
const INBOUND_CHIP_MIN_GAP = 30;
const CLAMP_MARGIN = 10;

export type InboundWorldBox = { x: number; y: number; w: number; h: number };

function clampInboundY(
  pageId: string,
  y: number,
  world: Map<string, InboundWorldBox>
): number {
  const w = world.get(pageId);
  if (!w) return y;
  const y0 = w.y + CLAMP_MARGIN;
  const y1 = w.y + w.h - CLAMP_MARGIN;
  return Math.min(y1, Math.max(y0, y));
}

function targetBand(
  pageId: string,
  world: Map<string, InboundWorldBox>
): { y0: number; y1: number } | null {
  const w = world.get(pageId);
  if (!w) return null;
  const y0 = w.y + CLAMP_MARGIN;
  const y1 = w.y + w.h - CLAMP_MARGIN;
  if (y1 <= y0) return { y0: w.y + w.h / 2, y1: w.y + w.h / 2 };
  return { y0, y1 };
}

function inboundBandKey(
  toPageId: string,
  world: Map<string, InboundWorldBox>
): string {
  const w = world.get(toPageId);
  if (!w) return `id:${toPageId}`;
  const q = (n: number) => Math.round(n * 2) / 2;
  return `${q(w.x)}_${q(w.y)}_${q(w.w)}_${q(w.h)}`;
}

/**
 * Távoli / vég-bekötés chip Y: azonos cél **vizuális** téglalapjához tartozó kötegek
 * együtt lépcsőznek (pl. összeomlott kategória-kártya: több vég-oldal ugyanazon a dobozon).
 * Először függőleges „lépcső” a geometriai y2 szerint, majd a cél sávba illesztés.
 */
export function computeDistantInboundYByKey(
  bundles: DistantEdgeBundle[],
  world: Map<string, InboundWorldBox>
): Map<string, number> {
  const byBand = new Map<string, DistantEdgeBundle[]>();
  for (const b of bundles) {
    const k = inboundBandKey(b.toPageId, world);
    const arr = byBand.get(k) ?? [];
    arr.push(b);
    byBand.set(k, arr);
  }
  const out = new Map<string, number>();

  for (const [, list] of byBand) {
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

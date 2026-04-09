"use client";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readPoolRegistry(story: Record<string, unknown>): Record<string, unknown> | null {
  const direct = asRecord(story.pools);
  if (direct) return direct;
  const meta = asRecord(story.meta);
  if (!meta) return null;
  return asRecord(meta.pools);
}

export function listPoolIdsFromStory(story: Record<string, unknown>): string[] {
  const reg = readPoolRegistry(story);
  if (!reg) return [];
  return Object.keys(reg)
    .map((k) => k.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function listKeysFromArray(values: unknown[]): string[] {
  const out: string[] = [];
  for (const item of values) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const key =
      (typeof rec.key === "string" && rec.key.trim()) ||
      (typeof rec.id === "string" && rec.id.trim()) ||
      (typeof rec.value === "string" && rec.value.trim()) ||
      "";
    if (key) out.push(key);
  }
  return out;
}

export function listPoolKeysForPoolId(
  story: Record<string, unknown>,
  poolId: string
): string[] {
  const pid = poolId.trim();
  if (!pid) return [];
  const reg = readPoolRegistry(story);
  if (!reg) return [];
  const pool = reg[pid];
  if (Array.isArray(pool)) {
    return Array.from(new Set(listKeysFromArray(pool))).sort((a, b) =>
      a.localeCompare(b)
    );
  }
  const poolObj = asRecord(pool);
  if (!poolObj) return [];
  if (Array.isArray(poolObj.items)) {
    return Array.from(new Set(listKeysFromArray(poolObj.items))).sort((a, b) =>
      a.localeCompare(b)
    );
  }
  if (Array.isArray(poolObj.options)) {
    return Array.from(new Set(listKeysFromArray(poolObj.options))).sort((a, b) =>
      a.localeCompare(b)
    );
  }
  return Object.keys(poolObj)
    .map((k) => k.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

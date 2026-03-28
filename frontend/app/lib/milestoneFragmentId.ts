"use client";

/**
 * Milestone fragment id: `${pageId}_DONE`. Legacy stories used lowercase `_done`.
 * Minden helyen a kanonikus `_DONE` végződést használjuk.
 */
export function canonicalMilestoneFragmentId(id: string): string {
  const t = id.trim();
  return t.replace(/_done$/i, "_DONE");
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function mergeFragmentEntriesForSameId(
  list: Record<string, unknown>[],
  id: string
): Record<string, unknown> {
  let text = "";
  let replayImageId: unknown;
  for (const r of list) {
    const t = r.text;
    if (typeof t === "string" && t.trim() && !text.trim()) text = t;
    if (r.replayImageId != null) replayImageId = r.replayImageId;
  }
  const base: Record<string, unknown> = { id, text };
  if (replayImageId != null) base.replayImageId = replayImageId;
  return base;
}

function normalizeFragmentBankKeys(bank: Record<string, unknown>): Record<string, unknown> {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const [k, raw] of Object.entries(bank)) {
    const c = canonicalMilestoneFragmentId(k);
    const rec = asRecord(raw) ?? {};
    const list = buckets.get(c) ?? [];
    list.push({ ...rec, id: c });
    buckets.set(c, list);
  }
  const out: Record<string, unknown> = {};
  for (const [c, list] of buckets) {
    out[c] = mergeFragmentEntriesForSameId(list, c);
  }
  return out;
}

function replaceMigratedIdStrings(
  value: unknown,
  migrations: Map<string, string>
): unknown {
  if (migrations.size === 0) return value;
  if (typeof value === "string") {
    return migrations.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((x) => replaceMigratedIdStrings(x, migrations));
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = replaceMigratedIdStrings(v, migrations);
    }
    return out;
  }
  return value;
}

/**
 * Átírja a `*_done` / `*_DONE` inkonzisztenciát: bank kulcsok + minden pontos id hivatkozás → `_DONE`.
 * Idempotens (másodszor nem változik).
 */
export function normalizeLegacyMilestoneFragmentIdsInStory(
  story: Record<string, unknown>
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(story)) as Record<string, unknown>;
  const bank = asRecord(next.fragments);
  const migrations = new Map<string, string>();

  if (bank) {
    for (const k of Object.keys(bank)) {
      const c = canonicalMilestoneFragmentId(k);
      if (k !== c) migrations.set(k, c);
    }
    next.fragments = normalizeFragmentBankKeys(bank);
  }

  return replaceMigratedIdStrings(next, migrations) as Record<string, unknown>;
}

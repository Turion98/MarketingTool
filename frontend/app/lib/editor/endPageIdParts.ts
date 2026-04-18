"use client";

import { classifyEditorPage } from "./storyPagesFlatten";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** `end_<kategória>_…` → első szegmens `kategória` (pl. veg, bveg, bmix). */
export function inferEndPageCategoryKey(pageId: string): string {
  if (!pageId.startsWith("end_")) return "_other";
  const after = pageId.slice("end_".length);
  if (!after) return "_other";
  const seg = after.split("_")[0];
  return seg || "_other";
}

/** Szerkesztő: `end_<cat>_<farok>` — farok lehet több szegmens is (underscore). */
export function parseEndPageIdSegments(
  pageId: string
): { category: string; tail: string } | null {
  if (!pageId.startsWith("end_")) return null;
  const rest = pageId.slice("end_".length);
  const i = rest.indexOf("_");
  if (i <= 0 || i >= rest.length - 1) return null;
  const category = rest.slice(0, i);
  const tail = rest.slice(i + 1);
  if (!category.trim() || !tail) return null;
  return { category, tail };
}

export function buildEndPageId(category: string, tail: string): string {
  const c = category.trim();
  const t = tail.trim();
  return `end_${c}_${t}`;
}

/** Szerkesztői meta: előre felvett vég-kategória slugok (opcionális). */
export function readEditorEndCategorySlugsFromStory(
  story: Record<string, unknown>
): string[] {
  const meta = asRecord(story.meta);
  if (!meta) return [];
  const raw = meta.editorEndCategorySlugs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function collectEndCategoryKeysFromStory(
  story: Record<string, unknown>
): string[] {
  const set = new Set<string>();
  for (const s of readEditorEndCategorySlugsFromStory(story)) {
    set.add(s.trim());
  }
  const pages = story.pages;
  const visit = (p: unknown) => {
    const rec = asRecord(p);
    if (!rec) return;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return;
    if (classifyEditorPage(rec) !== "end") return;
    const k = inferEndPageCategoryKey(id);
    if (k && k !== "_other") set.add(k);
  };
  if (Array.isArray(pages)) pages.forEach(visit);
  else if (pages && typeof pages === "object") {
    Object.values(pages).forEach(visit);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Új vég-kategória slug: kisbetű, szám, aláhúzás; nem üres. */
export function isValidEndCategorySlug(slug: string): boolean {
  const t = slug.trim().toLowerCase();
  if (!t || t === "_other") return false;
  return /^[a-z][a-z0-9_]*$/.test(t);
}

export function countEndPagesWithCategoryPrefix(
  story: Record<string, unknown>,
  categorySlug: string
): number {
  const prefix = `end_${categorySlug}_`;
  let n = 0;
  const pages = story.pages;
  const visit = (p: unknown) => {
    const rec = asRecord(p);
    if (!rec) return;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return;
    if (classifyEditorPage(rec) !== "end") return;
    if (id.startsWith(prefix)) n += 1;
  };
  if (Array.isArray(pages)) pages.forEach(visit);
  else if (pages && typeof pages === "object") {
    Object.values(pages).forEach(visit);
  }
  return n;
}

export function mergeStoryMetaEditorEndCategorySlugs(
  story: Record<string, unknown>,
  slugs: string[]
): Record<string, unknown> {
  const next = { ...story };
  const prevMeta = asRecord(story.meta) ?? {};
  const uniq = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
  next.meta = {
    ...prevMeta,
    editorEndCategorySlugs: uniq,
  };
  return next;
}

const EDITOR_END_CATEGORY_COLORS_META_KEY = "editorEndCategoryColors";

function hashString32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: clampByte((rp + m) * 255),
    g: clampByte((gp + m) * 255),
    b: clampByte((bp + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Ha nincs meta szín: stabil „auto” szín a slugból (#rrggbb). */
export function defaultEndCategoryAccentHex(categorySlug: string): string {
  const u = hashString32(categorySlug || "_other");
  const h = (u * 137.508) % 360;
  const s = 46 + (u % 14);
  const l = 40 + ((u >> 8) % 10);
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** `#rgb` / `#rrggbb` → `#rrggbb` vagy `null`. */
export function normalizeEditorEndCategoryHex(raw: string): string | null {
  const t = raw.trim();
  if (!t.startsWith("#")) return null;
  const body = t.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(body)) {
    const a = body[0];
    const b = body[1];
    const c = body[2];
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(body)) {
    return `#${body.toLowerCase()}`;
  }
  return null;
}

export function readEditorEndCategoryColorsFromStory(
  story: Record<string, unknown>
): Record<string, string> {
  const meta = asRecord(story.meta);
  if (!meta) return {};
  const raw = meta[EDITOR_END_CATEGORY_COLORS_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const hex = normalizeEditorEndCategoryHex(v);
    if (hex) out[k.trim()] = hex;
  }
  return out;
}

export function mergeStoryMetaEditorEndCategoryColors(
  story: Record<string, unknown>,
  updates: Record<string, string | null | undefined>
): Record<string, unknown> {
  const prevMeta = asRecord(story.meta) ?? {};
  const prev = readEditorEndCategoryColorsFromStory(story);
  const next: Record<string, string> = { ...prev };
  for (const [k, v] of Object.entries(updates)) {
    const key = k.trim();
    if (!key) continue;
    if (v == null || v === "") {
      delete next[key];
      continue;
    }
    const hex = normalizeEditorEndCategoryHex(String(v));
    if (hex) next[key] = hex;
    else delete next[key];
  }
  const rest = { ...prevMeta };
  delete (rest as Record<string, unknown>)[EDITOR_END_CATEGORY_COLORS_META_KEY];
  if (Object.keys(next).length === 0) {
    return { ...story, meta: rest };
  }
  return {
    ...story,
    meta: {
      ...rest,
      [EDITOR_END_CATEGORY_COLORS_META_KEY]: next,
    },
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeEditorEndCategoryHex(hex);
  if (!n) return null;
  const body = n.slice(1);
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

/** Végkártya törzs: CSS `background` (rétegezett gradiens). */
export function endCategoryBodyBackgroundFromHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `linear-gradient(175deg, hsla(210 38% 22% / 0.72) 0%, hsla(230 32% 10% / 0.5) 100%), rgba(20, 26, 40, 0.94)`;
  }
  const { r, g, b } = rgb;
  return `linear-gradient(180deg, rgba(${r},${g},${b},0.48) 0%, rgba(${r},${g},${b},0.16) 52%, rgba(18,22,34,0.94) 100%)`;
}

export function resolveEndPageBodyBackground(
  story: Record<string, unknown>,
  pageId: string
): string {
  const cat = inferEndPageCategoryKey(pageId);
  const colors = readEditorEndCategoryColorsFromStory(story);
  const hex = colors[cat];
  if (hex) return endCategoryBodyBackgroundFromHex(hex);
  return endCategoryBodyBackgroundFromHex(defaultEndCategoryAccentHex(cat));
}

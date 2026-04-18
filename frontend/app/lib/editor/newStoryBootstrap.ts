/**
 * Új sztori létrehozása: üres vászon (pages: []) + sentinel forrás, amíg nincs első mentés.
 */

export const NEW_STORY_SRC_SENTINEL = "__editor_new_story__";

export function isNewStorySentinel(src: string): boolean {
  return src.trim() === NEW_STORY_SRC_SENTINEL;
}

/** Slug → backend fájlnév (`{slug}.json`). */
export function validateStorySlug(slug: string): string | null {
  const t = slug.trim();
  if (!t) return "Add meg a projekt fájlnevét (slug) — ez lesz a mentés alapja.";
  if (t.length > 80) return "A slug legfeljebb 80 karakter lehet.";
  if (!/^[a-z0-9_-]+$/i.test(t)) {
    return "A slug csak betűt, számot, aláhúzást és kötőjelet tartalmazhat.";
  }
  return null;
}

export function validateStartPageId(id: string): string | null {
  const t = id.trim();
  if (!t) return "Add meg, melyik oldal legyen az első képernyő (kezdő oldal ID).";
  if (t.length > 120) return "A kezdő oldal ID túl hosszú (max. 120 karakter).";
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) {
    return "A kezdő oldal ID csak betűt, számot, _ és - jelet tartalmazhat.";
  }
  return null;
}

export function validateCtaHttpsUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return "Minden CTA gombhoz https://-sel kezdődő URL kell.";
  if (!/^https:\/\//i.test(t)) {
    return "A CTA linknek https:// előtaggal kell kezdődnie (biztonságos böngészés).";
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return "Csak https protokoll engedélyezett.";
  } catch {
    return "Ez nem érvényes URL formátum.";
  }
  return null;
}

export type CtaPresetFormRow = {
  key: string;
  label: string;
  urlTemplate: string;
  subtitle: string;
};

export function validateCtaPresetKey(key: string): string | null {
  const t = key.trim();
  if (!t) return "Minden CTA sorhoz adj meg egy rövid kulcsot (pl. default, shop).";
  if (t.length > 64) return "A CTA kulcs legfeljebb 64 karakter lehet.";
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) {
    return "A CTA kulcs csak betűt, számot, _ és - jelet tartalmazhat.";
  }
  return null;
}

export function validateCtaRowsForm(
  rows: CtaPresetFormRow[],
  endDefaultCta: string
): string | null {
  if (!rows.length) return "Legalább egy CTA sort adj meg — ez határozza meg a gombok URL-jeit.";
  const keys = new Set<string>();
  for (const row of rows) {
    const kErr = validateCtaPresetKey(row.key);
    if (kErr) return kErr;
    const k = row.key.trim();
    if (keys.has(k)) return `Minden CTA kulcs egyedi legyen — a(z) „${k}” már szerepel.`;
    keys.add(k);
    if (!row.label.trim()) return `Add meg a(z) „${k}” gomb feliratát a látogatónak.`;
    const uErr = validateCtaHttpsUrl(row.urlTemplate);
    if (uErr) return `${k}: ${uErr}`;
  }
  const end = endDefaultCta.trim();
  if (!end) return "Válaszd ki, melyik CTA legyen a végoldalak alapértelmezett gombja.";
  if (!keys.has(end)) {
    return "Az alapértelmezett vége CTA kulcsának szerepelnie kell a felsorolt presetek között.";
  }
  return null;
}

export function buildCtaPresetsFromRows(
  rows: CtaPresetFormRow[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    const obj: Record<string, unknown> = {
      kind: "link",
      label: r.label.trim(),
      urlTemplate: r.urlTemplate.trim(),
    };
    if (r.subtitle.trim()) obj.subtitle = r.subtitle.trim();
    out[k] = obj;
  }
  return out;
}

export type StoryMetaFormModel = {
  title: string;
  startPageId: string;
  ctaRows: CtaPresetFormRow[];
  endDefaultCta: string;
  description: string;
  author: string;
  locale: string;
  logoPath: string;
};

export function defaultStoryMetaFormModel(
  startPageId = "start"
): StoryMetaFormModel {
  return {
    title: "",
    startPageId,
    ctaRows: [
      {
        key: "default",
        label: "",
        urlTemplate: "https://",
        subtitle: "",
      },
    ],
    endDefaultCta: "default",
    description: "",
    author: "",
    locale: "",
    logoPath: "",
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function draftStoryToMetaFormModel(
  draft: Record<string, unknown>
): StoryMetaFormModel {
  const meta = asRecord(draft.meta);
  const m = meta ?? {};
  const presetsRaw = m.ctaPresets;
  const rows: CtaPresetFormRow[] = [];
  if (
    presetsRaw &&
    typeof presetsRaw === "object" &&
    !Array.isArray(presetsRaw)
  ) {
    for (const [key, val] of Object.entries(presetsRaw)) {
      const o = asRecord(val);
      rows.push({
        key,
        label: typeof o?.label === "string" ? o.label : "",
        urlTemplate:
          typeof o?.urlTemplate === "string" ? o.urlTemplate : "https://",
        subtitle: typeof o?.subtitle === "string" ? o.subtitle : "",
      });
    }
  }
  if (rows.length === 0) {
    return defaultStoryMetaFormModel(
      typeof m.startPageId === "string" && m.startPageId.trim()
        ? m.startPageId.trim()
        : "start"
    );
  }
  let end =
    typeof m.endDefaultCta === "string" && m.endDefaultCta.trim()
      ? m.endDefaultCta.trim()
      : "default";
  const keySet = new Set(rows.map((r) => r.key.trim()));
  if (!keySet.has(end)) end = rows[0]!.key.trim();

  return {
    title: typeof m.title === "string" ? m.title : "",
    startPageId:
      typeof m.startPageId === "string" && m.startPageId.trim()
        ? m.startPageId.trim()
        : "start",
    ctaRows: rows,
    endDefaultCta: end,
    description: typeof m.description === "string" ? m.description : "",
    author: typeof m.author === "string" ? m.author : "",
    locale: typeof draft.locale === "string" ? draft.locale : "",
    logoPath: typeof m.logo === "string" ? m.logo : "",
  };
}

export function validateMetaFormBasics(model: StoryMetaFormModel): string | null {
  if (!model.title.trim()) return "Adj meg megjelenített címet — ez a látogatónak látszó projektnév.";
  const st = validateStartPageId(model.startPageId);
  if (st) return st;
  return validateCtaRowsForm(model.ctaRows, model.endDefaultCta);
}

export function applyStoryMetaFormModelToDraft(
  draft: Record<string, unknown>,
  model: StoryMetaFormModel
): Record<string, unknown> {
  const prevMeta = asRecord(draft.meta) ?? {};
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    title: model.title.trim(),
    startPageId: model.startPageId.trim(),
    ctaPresets: buildCtaPresetsFromRows(model.ctaRows),
    endDefaultCta: model.endDefaultCta.trim(),
  };
  if (model.description.trim()) nextMeta.description = model.description.trim();
  else delete nextMeta.description;
  if (model.author.trim()) nextMeta.author = model.author.trim();
  else delete nextMeta.author;
  if (model.logoPath.trim()) nextMeta.logo = model.logoPath.trim();
  else delete nextMeta.logo;

  const next: Record<string, unknown> = { ...draft, meta: nextMeta };
  if (model.locale.trim()) next.locale = model.locale.trim();
  else delete next.locale;
  return next;
}

export type NewStoryBootstrapForm = {
  storySlug: string;
  title: string;
  startPageId: string;
  ctaRows: CtaPresetFormRow[];
  endDefaultCta: string;
  logo?: string;
  description?: string;
  author?: string;
  locale?: string;
};

export function createBootstrapShellDraft(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    storyId: "",
    meta: {
      id: "",
      title: "",
      startPageId: "start",
    },
    pages: [],
  };
}

/**
 * Első mentés: teljes, CoreSchema-kompatibilis dokumentum (legalább 1 oldal).
 */
export function buildStoryDocumentForFirstSave(
  form: NewStoryBootstrapForm
): Record<string, unknown> {
  const slug = form.storySlug.trim();
  const startId = form.startPageId.trim() || "start";
  const title = form.title.trim();

  const meta: Record<string, unknown> = {
    id: slug,
    title,
    startPageId: startId,
    campaignId: slug,
    ctaPresets: buildCtaPresetsFromRows(form.ctaRows),
    endDefaultCta: form.endDefaultCta.trim(),
  };

  if (form.logo?.trim()) meta.logo = form.logo.trim();
  if (form.description?.trim()) meta.description = form.description.trim();
  if (form.author?.trim()) meta.author = form.author.trim();

  const doc: Record<string, unknown> = {
    schemaVersion: "1.0.0",
    storyId: slug,
    meta,
    pages: [
      {
        id: startId,
        title: title || "Kezdő oldal",
        text: "",
        choices: [],
      },
    ],
  };

  if (form.locale?.trim()) doc.locale = form.locale.trim();

  return doc;
}

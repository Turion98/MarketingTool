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
  if (!t) return "Kötelező a sztori azonosító (slug).";
  if (t.length > 80) return "Maximum 80 karakter.";
  if (!/^[a-z0-9_-]+$/i.test(t)) {
    return "Csak betű, szám, aláhúzás és kötőjel (slug).";
  }
  return null;
}

export function validateStartPageId(id: string): string | null {
  const t = id.trim();
  if (!t) return "Kötelező a kezdő oldal ID.";
  if (t.length > 120) return "Túl hosszú kezdő oldal ID.";
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) {
    return "Kezdő oldal ID: csak betű, szám, _ és -.";
  }
  return null;
}

export function validateCtaHttpsUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return "Kötelező a CTA URL.";
  if (!/^https:\/\//i.test(t)) {
    return "A CTA URL-nek https://-sel kell kezdődnie (szerver validáció).";
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return "Csak https URL engedélyezett.";
  } catch {
    return "Érvénytelen URL.";
  }
  return null;
}

export type NewStoryBootstrapForm = {
  storySlug: string;
  title: string;
  startPageId: string;
  ctaLabel: string;
  ctaUrl: string;
  logo?: string;
  description?: string;
  author?: string;
  coverImage?: string;
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
    ctaPresets: {
      default: {
        kind: "link",
        label: form.ctaLabel.trim(),
        urlTemplate: form.ctaUrl.trim(),
      },
    },
    endDefaultCta: "default",
  };

  if (form.logo?.trim()) meta.logo = form.logo.trim();
  if (form.description?.trim()) meta.description = form.description.trim();
  if (form.author?.trim()) meta.author = form.author.trim();
  if (form.coverImage?.trim()) meta.coverImage = form.coverImage.trim();

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

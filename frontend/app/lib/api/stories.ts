// app/lib/api/stories.ts

import { getClientFetchApiBase } from "../publicApiBase";

// NEM használjuk itt a safeFetch-et, hogy biztosan átmenjen a body.
// import { safeFetch, HttpError } from "../safeFetch";

// ---- Alap típusok ----
type ImportMode = "strict" | "warnOnly";

type QueryValue = string | number | boolean;
type Query = Record<string, QueryValue | null | undefined>;

export type ValidationIssue = {
  message?: string;
  path?: string | string[];
  code?: string;
};

export type ImportOk = {
  ok: true;
  warnings?: ValidationIssue[];
  // backend adhat extra mezőket is:
  [k: string]: unknown;
};

export type ImportErrPayload = {
  ok?: false;
  detail?:
    | string
    | {
        errors?: ValidationIssue[];
        warnings?: ValidationIssue[];
        [k: string]: unknown;
      };
  message?: string;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
  [k: string]: unknown;
};

// ---- Helperek ----
function apiBase(): string {
  return getClientFetchApiBase();
}

function buildUrl(path: string, qs?: Query): string {
  const base = apiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (!qs) return url;

  const sp = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    sp.set(k, String(v));
  });
  const q = sp.toString();
  return q ? `${url}?${q}` : url;
}

// Backend hibák normalizálása emberi üzenetté
function humanizeImportError(payload: ImportErrPayload, status?: number): string {
  const fromIssues = (arr?: ValidationIssue[]) =>
    Array.isArray(arr) ? arr.map((e) => e?.message || String(e)).filter(Boolean).join("\n") : "";

  const detail = payload?.detail;
  const detailStr =
    typeof detail === "string"
      ? detail
      : fromIssues(detail?.errors) || fromIssues(detail?.warnings);

  const topErrors = fromIssues(payload?.errors);
  const topWarns = fromIssues(payload?.warnings);

  return (
    detailStr ||
    payload?.message ||
    topErrors ||
    topWarns ||
    (typeof status === "number" ? `Upload/validate failed (HTTP ${status})` : "Upload/validate failed")
  );
}

// Kényelmi parser a válaszhoz: JSON ha lehet, különben text
async function parseResponse(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function ensureHttpUrlLike(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (!s) return "https://";
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s.replace(/^\/+/, "")}`;
}

function legacyRoutePageToConditionalRouting(
  page: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...page, type: "conditionalRouting" };
  const assignments =
    asRecord(page.routeAssignments) ??
    asRecord(page.routes) ??
    asRecord(page.nextByPoolKey) ??
    asRecord(page.routeMap) ??
    {};
  const cases: Record<string, string> = {};
  for (const [k, v] of Object.entries(assignments)) {
    const key = String(k).trim();
    const target = typeof v === "string" ? v.trim() : "";
    if (key && target) cases[key] = target;
  }
  const rawSource =
    page.puzzleSourcePageId ?? page.poolId ?? page.pool ?? page.poolKey;
  const source = typeof rawSource === "string" && rawSource.trim()
    ? rawSource.trim()
    : "poolPick";
  const rawDefault = page.defaultGoto ?? page.defaultNext;
  const fallback = typeof rawDefault === "string" ? rawDefault.trim() : "";
  next.next = fallback
    ? { switch: source, cases, default: fallback }
    : { switch: source, cases };

  delete next.routeAssignments;
  delete next.routes;
  delete next.nextByPoolKey;
  delete next.routeMap;
  delete next.defaultGoto;
  delete next.defaultNext;
  delete next.puzzleSourcePageId;
  delete next.poolId;
  delete next.pool;
  delete next.poolKey;
  delete next.nextSwitch;
  return next;
}

function sanitizeStoryDocumentForStrictImport(
  input: Record<string, unknown>
): Record<string, unknown> {
  const doc =
    typeof structuredClone === "function"
      ? (structuredClone(input) as Record<string, unknown>)
      : (JSON.parse(JSON.stringify(input)) as Record<string, unknown>);

  const meta = asRecord(doc.meta);
  if (meta) {
    delete meta.editorLayout;
    const ctaPresets = asRecord(meta.ctaPresets);
    if (ctaPresets) {
      for (const [key, value] of Object.entries(ctaPresets)) {
        const preset = asRecord(value);
        if (!preset) continue;
        if (typeof preset.subtitle === "string" && preset["x-subtitle"] == null) {
          preset["x-subtitle"] = preset.subtitle;
        }
        delete preset.subtitle;
        preset.urlTemplate = ensureHttpUrlLike(preset.urlTemplate);
        ctaPresets[key] = preset;
      }
      meta.ctaPresets = ctaPresets;
    }
    doc.meta = meta;
  }

  if (Array.isArray(doc.pages)) {
    doc.pages = doc.pages.map((pageLike) => {
      const page = asRecord(pageLike);
      if (!page) return pageLike;

      const type = typeof page.type === "string" ? page.type : "";
      let nextPage = page;
      if (type === "poolRoute" || type === "puzzleRoute") {
        nextPage = legacyRoutePageToConditionalRouting(nextPage);
      }

      const answer = nextPage.answer;
      if (Array.isArray(answer) && answer.length === 0) {
        nextPage.answer = "";
      }
      return nextPage;
    });
  }

  return doc;
}

// ---- API függvények ----

/**
 * Sztori feltöltése (multipart).
 * Vissza: { ok: true, warnings?: [...] } – hiba esetén kivétel normált üzenettel.
 */
export async function uploadStory(
  file: File,
  overwrite = false,
  mode: ImportMode = "strict"
): Promise<ImportOk> {
  const fd = new FormData();
  fd.append("file", file); // 🔹 kulcs: "file" – ezt várja a backend

  const url = buildUrl("/api/stories/import", { overwrite, mode });

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });

  const payload = (await parseResponse(res)) as any;

  if (!res.ok) {
    const errPayload: ImportErrPayload =
      typeof payload === "object" && payload !== null
        ? payload
        : { detail: typeof payload === "string" ? payload : undefined };

    const msg = humanizeImportError(errPayload, res.status);
    const e = new Error(msg);
    (e as any).response = errPayload;
    throw e;
  }

  return (payload || { ok: true }) as ImportOk;
}

/**
 * Sztori validálása szerveren (JSON body).
 * Vissza: { ok: true, warnings?: [...] } – hiba esetén kivétel normált üzenettel.
 */
export async function validateStoryServer(
  file: File,
  mode: ImportMode = "strict"
): Promise<ImportOk> {
  const fd = new FormData();
  fd.append("file", file);

  const url = buildUrl("/api/stories/validate", { mode });

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });

  const payload = (await parseResponse(res)) as any;

  if (!res.ok) {
    const errPayload: ImportErrPayload =
      typeof payload === "object" && payload !== null
        ? payload
        : { detail: typeof payload === "string" ? payload : undefined };

    const msg = humanizeImportError(errPayload, res.status);
    const e = new Error(msg);
    (e as any).errors =
      (errPayload.detail &&
        typeof errPayload.detail !== "string" &&
        errPayload.detail.errors) ||
      errPayload.errors ||
      [];
    (e as any).warnings =
      (errPayload.detail &&
        typeof errPayload.detail !== "string" &&
        errPayload.detail.warnings) ||
      errPayload.warnings ||
      [];
    (e as any).response = errPayload;
    throw e;
  }

  return (payload || { ok: true }) as ImportOk;
}

/**
 * Sztori mentése szerkesztőből a szerverre (`STORIES_DIR`).
 * Fontos: multipart/file mezővel küldjük, mert az import endpoint
 * file + body fallbackot kezel, és production-ben a JSON body olykor nem kötődik be.
 */
export async function saveStoryDocumentJson(
  document: Record<string, unknown>,
  options?: { overwrite?: boolean; mode?: ImportMode }
): Promise<ImportOk> {
  const overwrite = options?.overwrite ?? true;
  const mode = options?.mode ?? "strict";

  const url = buildUrl("/api/stories/import", { overwrite, mode });
  const fd = new FormData();
  const sanitized = sanitizeStoryDocumentForStrictImport(document);
  const blob = new Blob([JSON.stringify(sanitized)], {
    type: "application/json",
  });
  fd.append("file", blob, "story.json");

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });

  const payload = (await parseResponse(res)) as any;

  if (!res.ok) {
    const errPayload: ImportErrPayload =
      typeof payload === "object" && payload !== null
        ? payload
        : { detail: typeof payload === "string" ? payload : undefined };

    const msg = humanizeImportError(errPayload, res.status);
    const e = new Error(msg);
    (e as any).response = errPayload;
    throw e;
  }

  return (payload || { ok: true }) as ImportOk;
}

export type UploadStoryAssetOk = {
  ok: true;
  path: string;
};

/**
 * Kampány logó / brand kép feltöltése: `assets/stories/{storyId}/logo.{ext}`.
 */
export async function uploadStoryBrandAsset(
  storyId: string,
  file: File
): Promise<UploadStoryAssetOk> {
  const id = storyId.trim();
  if (!id) throw new Error("Hiányzó sztori azonosító a feltöltéshez.");

  const fd = new FormData();
  fd.append("file", file);

  const url = buildUrl(`/api/stories/${encodeURIComponent(id)}/upload-asset`);

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });

  const payload = (await parseResponse(res)) as unknown;

  if (!res.ok) {
    const errPayload: ImportErrPayload =
      typeof payload === "object" && payload !== null
        ? (payload as ImportErrPayload)
        : { detail: typeof payload === "string" ? payload : undefined };
    const msg = humanizeImportError(errPayload, res.status);
    throw new Error(msg);
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as UploadStoryAssetOk).path === "string"
  ) {
    return payload as UploadStoryAssetOk;
  }

  throw new Error("Érvénytelen válasz a feltöltéshez.");
}


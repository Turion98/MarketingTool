// app/lib/api/stories.ts

import { safeFetch, HttpError } from "../safeFetch";

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
  const raw = process.env.NEXT_PUBLIC_API_BASE || "";
  return raw.replace(/\/+$/, "");
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
  fd.append("file", file);

  const url = buildUrl("/api/stories/import", { overwrite, mode });

  try {
    // FormData esetén NEM állítunk Content-Type-ot (boundary-t a böngésző teszi rá)
    const res = await safeFetch<ImportOk>(url, {
      method: "POST",
      body: fd,
      cache: "no-store",
    });
    return res;
  } catch (err) {
    if (err instanceof HttpError) {
      const payload = (err.payload ?? {}) as ImportErrPayload;
      const msg = humanizeImportError(payload, err.status);
      const e = new Error(msg);
      (e as any).response = payload; // ha logolni szeretnéd
      throw e;
    }
    throw err;
  }
}

/**
 * Sztori validálása szerveren (JSON body).
 * Vissza: { ok: true, warnings?: [...] } – hiba esetén kivétel normált üzenettel.
 */
export async function validateStoryServer(
  json: unknown,
  mode: ImportMode = "strict"
): Promise<ImportOk> {
  const url = buildUrl("/api/stories/import", { mode });

  try {
    const res = await safeFetch<ImportOk>(url, {
      method: "POST",
      json, // safeFetch gondoskodik a JSON serializationről + header-ről
      cache: "no-store",
    });
    return res;
  } catch (err) {
    if (err instanceof HttpError) {
      const payload = (err.payload ?? {}) as ImportErrPayload;
      const msg = humanizeImportError(payload, err.status);
      const e = new Error(msg);
      (e as any).errors =
        (payload.detail && typeof payload.detail !== "string" && payload.detail.errors) ||
        payload.errors ||
        [];
      (e as any).warnings =
        (payload.detail && typeof payload.detail !== "string" && payload.detail.warnings) ||
        payload.warnings ||
        [];
      (e as any).response = payload;
      throw e;
    }
    throw err;
  }
}

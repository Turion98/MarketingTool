function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE || "";
  // vágjuk le a záró per(eke)t, hogy ne legyen //api
  return raw.replace(/\/+$/, "");
}

function buildUrl(path: string, qs?: Record<string, any>) {
  const base = apiBase();
  const prefix = base ? `${base}` : ""; // ha üres → relatív (dev proxy támogatott)
  const url = `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
  if (!qs) return url;
  const sp = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    sp.set(k, String(v));
  });
  const q = sp.toString();
  return q ? `${url}?${q}` : url;
}

async function parseErrorResponse(r: Response) {
  // próbáljuk JSON-ként, különben text
  try {
    const j = await r.json();
    return j;
  } catch {
    try {
      const t = await r.text();
      return { detail: t || `HTTP ${r.status}` };
    } catch {
      return { detail: `HTTP ${r.status}` };
    }
  }
}

export async function uploadStory(
  file: File,
  overwrite = false,
  mode: "strict" | "warnOnly" = "strict"
) {
  const fd = new FormData();
  fd.append("file", file);

  const url = buildUrl("/api/stories/import", { overwrite, mode });

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      body: fd,
      // ne tegyünk Content-Type-ot: a böngésző állítja be a multipart boundary-t
      cache: "no-store",
    });
  } catch (err: any) {
    // Hálózati / CORS szintű hiba
    throw new Error(`Network/CORS error while uploading: ${err?.message || err}`);
  }

  if (!r.ok) {
    const payload = await parseErrorResponse(r);
    const msg =
      payload?.detail ||
      payload?.message ||
      (Array.isArray(payload?.errors) && payload.errors.map((e: any) => e?.message).filter(Boolean).join("\n")) ||
      `Upload failed (HTTP ${r.status})`;
    const e = new Error(msg);
    (e as any).response = payload;
    throw e;
  }

  return r.json();
}

export async function validateStoryServer(
  json: any,
  mode: "strict" | "warnOnly" = "strict"
) {
  const url = buildUrl("/api/stories/import", { mode });

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
      cache: "no-store",
    });
  } catch (err: any) {
    throw new Error(`Network/CORS error while validating: ${err?.message || err}`);
  }

  const payload = r.ok ? await r.json() : await parseErrorResponse(r);

  if (!r.ok) {
    const errs = payload?.detail?.errors || payload?.errors || [];
    const warns = payload?.detail?.warnings || payload?.warnings || [];
    const msg =
      (Array.isArray(errs) && errs.map((e: any) => e?.message || e).filter(Boolean).join("\n")) ||
      payload?.detail ||
      payload?.message ||
      `Server validation failed (HTTP ${r.status})`;

    const e = new Error(msg);
    (e as any).errors = errs;
    (e as any).warnings = warns;
    (e as any).response = payload;
    throw e;
  }

  // siker: pl. { ok:true, warnings:[...] }
  return payload;
}

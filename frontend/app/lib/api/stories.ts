export async function uploadStory(file: File, overwrite = false, mode: "strict" | "warnOnly" = "strict") {
  const fd = new FormData();
  fd.append("file", file);
  const url = `${process.env.NEXT_PUBLIC_API_BASE || ""}/api/stories/import?overwrite=${overwrite ? "true" : "false"}&mode=${mode}`;
  const r = await fetch(url, { method: "POST", body: fd });
  if (!r.ok) {
    const detail = await r.json().catch(() => null);
    throw new Error(detail?.detail || "Upload failed");
  }
  return await r.json();
}

export async function validateStoryServer(json: any, mode: "strict" | "warnOnly" = "strict") {
  const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ""}/api/stories/import?mode=${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => null);
    const errs = detail?.detail?.errors || detail?.errors || [];
    const warns = detail?.detail?.warnings || detail?.warnings || [];
    const msg = errs.map((e: any) => e?.message || "").filter(Boolean).join("\n");
    const e = new Error(msg || "Server validation failed");
    (e as any).errors = errs;
    (e as any).warnings = warns;
    throw e;
  }
  return await r.json(); // { ok: true, warnings: [...] }
}

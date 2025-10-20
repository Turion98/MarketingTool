export type WLSuggestReq = {
  clientDomain: string;
  campaignId: string;
  mode?: "managed" | "cname";
  skin?: string;                  // pl. "neon_fiesta"
  runes?: string;                 // pl. "ring,arc,dot"
  runemode?: "single" | "triple"; // rendezés módja
};

export type WLSuggestRes = {
  status: "ok";
  brandId: string;
  wlDomain: string;
  playUrl: string;
  embedUrl: string;
  verification?: {
    type: string;
    host: string;
    value: string;
    note?: string;
  } | null;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(
  /\/+$/,
  ""
);

export async function suggestWhiteLabel(req: WLSuggestReq): Promise<WLSuggestRes> {
  const res = await fetch(`${API_BASE}/api/white-label/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // az alapértelmezett "managed" felülírható a hívó által
    body: JSON.stringify({ mode: "managed", ...req }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WL suggest failed (${res.status}) ${text}`);
  }
  return (await res.json()) as WLSuggestRes;
}

import { buildEmbedUrl } from "./whitelabel/buildEmbedUrl";

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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

/**
 * A backend által adott URL-t átírja a dedikált WL-domainre, megtartja a query-ket,
 * és felülírja/hozzáadja a kulcs paramétereket.
 */
function rewriteToWL(
  srcUrlStr: string,
  wlDomain: string,
  overrides: { campaignId: string; brandId: string; skin?: string; runes?: string; runemode?: "single" | "triple"; forceEmbed?: boolean }
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const proto  = typeof window !== "undefined" && window.location?.protocol ? window.location.protocol : "https:";

  // forrás URL (amit a backend adott)
  const src = new URL(srcUrlStr, origin);

  // cél WL-URL ugyanazzal az útvonallal (pl. /story)
  const wl = new URL(`${proto}//${wlDomain}${src.pathname}`);

  // átmásoljuk az összes meglévő paramot
  src.searchParams.forEach((v, k) => wl.searchParams.set(k, v));

  // biztosítjuk az alap paramokat: campaign (c), brand (b)
  wl.searchParams.set("c", overrides.campaignId);
  wl.searchParams.set("b", overrides.brandId);

  // ha a hívó adott skin/runes/runemode-t, ezek felülírják a backendét
  if (overrides.skin) wl.searchParams.set("skin", overrides.skin);
  if (overrides.runes) wl.searchParams.set("runes", overrides.runes);
  if (overrides.runemode) wl.searchParams.set("runemode", overrides.runemode);

  // ha kifejezetten embed linket szeretnénk, jelöljük (ha még nincs)
  if (overrides.forceEmbed && !wl.searchParams.has("mode")) {
    wl.searchParams.set("mode", "embed");
  }

  return wl.toString();
}

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

  const data = (await res.json()) as WLSuggestRes;

  // ── ROBUSZTUS: a backend play/embed URL-jét WL-domainre írjuk át, query-ket megtartjuk ──
  const common = {
    campaignId: req.campaignId,
    brandId: data.brandId,
    skin: req.skin,
    runes: req.runes,
    runemode: req.runemode,
  };

  const playWL  = rewriteToWL(data.playUrl,  data.wlDomain, { ...common });
  const embedWL = rewriteToWL(data.embedUrl, data.wlDomain, { ...common, forceEmbed: true });

  // Ha valamiért a forrás URL-ek üresek lennének, építsünk biztonságos fallbacket:
  const fallbackBase = `https://${data.wlDomain}/story`;
  const fallbackPlay  = buildEmbedUrl({ base: fallbackBase, campaignId: req.campaignId, skin: req.skin, runes: req.runes, runemode: req.runemode });
  const fallbackEmbed = buildEmbedUrl({ base: fallbackBase, campaignId: req.campaignId, skin: req.skin, runes: req.runes, runemode: req.runemode, analytics: true });

  data.playUrl  = playWL  || fallbackPlay;
  data.embedUrl = embedWL || fallbackEmbed;

  return data;
}

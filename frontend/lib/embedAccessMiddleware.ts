/**
 * Next.js middleware helpers: signed embed gate (optional via REQUIRE_SIGNED_EMBED).
 * See app/lib/embedAccess/ARCHITECTURE.md.
 */

export function requireSignedEmbed(): boolean {
  const v = process.env.REQUIRE_SIGNED_EMBED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function embedCampaignFromPath(pathname: string): string | null {
  if (pathname === "/embed") return null;
  if (!pathname.startsWith("/embed/")) return null;
  const rest = pathname.slice("/embed/".length);
  const segment = rest.split("/")[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function verifyEmbedAccess(params: {
  apiBase: string;
  token: string;
  pathCampaignId: string;
  parentReferrer: string | null;
}): Promise<{ ok: boolean; code?: string; reason?: string }> {
  const base = params.apiBase.replace(/\/+$/, "");
  const url = `${base}/api/embed-access/verify`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        path_campaign_id: params.pathCampaignId,
        parent_referrer: params.parentReferrer,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        code: "verify_http",
        reason: `HTTP ${res.status}`,
      };
    }
    const j = (await res.json()) as {
      ok?: boolean;
      code?: string;
      reason?: string;
    };
    return {
      ok: Boolean(j.ok),
      code: j.code,
      reason: j.reason,
    };
  } catch (e) {
    return {
      ok: false,
      code: "verify_fetch",
      reason: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

/**
 * Embed verify must hit the API that reads *your* grants file (often local FastAPI).
 * If NEXT_PUBLIC_API_BASE points to production but you edit local JSON, set
 * EMBED_ACCESS_VERIFY_API_BASE=http://127.0.0.1:8000 in .env.local (middleware is server-side).
 */
export function apiBaseForMiddleware(): string {
  const verify = process.env.EMBED_ACCESS_VERIFY_API_BASE?.trim();
  if (verify) return verify.replace(/\/+$/, "");
  const pub = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (pub) return pub.replace(/\/+$/, "");
  return "http://127.0.0.1:8000";
}

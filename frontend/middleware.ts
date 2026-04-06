import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiBaseForMiddleware,
  embedCampaignFromPath,
  requireSignedEmbed,
  verifyEmbedAccess,
} from "@/lib/embedAccessMiddleware";
import { applySecurityHeaders, isEmbedPath } from "@/lib/cspMiddleware";

function embedDeniedResponse(isDev: boolean): NextResponse {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Embed access denied</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;background:#0b0f18;color:#e8ecf4;"><p>Embed access denied.</p></body></html>`;
  const res = new NextResponse(html, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  return applySecurityHeaders(res, isDev, true);
}

export async function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const { pathname, searchParams } = request.nextUrl;

  if (requireSignedEmbed() && isEmbedPath(pathname)) {
    const campaign = embedCampaignFromPath(pathname);
    const token = searchParams.get("token");
    if (!campaign || !token?.trim()) {
      return embedDeniedResponse(isDev);
    }
    const ref =
      request.headers.get("referer") || request.headers.get("Referer") || null;
    const v = await verifyEmbedAccess({
      apiBase: apiBaseForMiddleware(),
      token: token.trim(),
      pathCampaignId: campaign,
      parentReferrer: ref,
    });
    if (!v.ok) {
      return embedDeniedResponse(isDev);
    }
  }

  const response = NextResponse.next();
  return applySecurityHeaders(
    response,
    isDev,
    isEmbedPath(pathname)
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

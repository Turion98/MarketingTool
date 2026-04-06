import { NextResponse } from "next/server";
import { getServerDashboardEmbedApiBase } from "@/app/lib/publicApiBase";

/**
 * Same-origin BFF: a böngésző ide kér, a Next szerver a megfelelő FastAPI-ra továbbítja
 * (l. EMBED_ACCESS_VERIFY_API_BASE / DASHBOARD_EMBED_API_BASE vs NEXT_PUBLIC_API_BASE).
 */
export async function GET() {
  const api = getServerDashboardEmbedApiBase();
  try {
    const r = await fetch(`${api}/api/embed-access/live-embed-registry`, {
      cache: "no-store",
    });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json({ stories: [] }, { status: 200 });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ stories: [] }, { status: 200 });
  }
}

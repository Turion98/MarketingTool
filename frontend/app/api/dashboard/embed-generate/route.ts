import { NextResponse } from "next/server";
import { getServerDashboardEmbedApiBase } from "@/app/lib/publicApiBase";
const DEFAULT_EMBED_TTL_SECONDS = 86400 * 365;

/**
 * Dashboard: admin kulcs csak szerveren — a böngésző nem látja.
 * Body: storyId, jsonSrc, start, title, playerOrigin?, ttlSeconds?, livePageUrl?
 */
export async function POST(req: Request) {
  const adminKey =
    process.env.DASHBOARD_EMBED_ADMIN_KEY?.trim() ||
    process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json(
      {
        error:
          "_szerver_ env: állítsd be DASHBOARD_EMBED_ADMIN_KEY vagy ADMIN_KEY (egyezzen a FastAPI admin kulccsal).",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId =
    typeof body.storyId === "string" ? body.storyId.trim() : "";
  const jsonSrc =
    typeof body.jsonSrc === "string" ? body.jsonSrc.trim() : "";
  const start = typeof body.start === "string" ? body.start.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!storyId || !jsonSrc || !start) {
    return NextResponse.json(
      { error: "storyId, jsonSrc, start kötelező" },
      { status: 400 }
    );
  }

  let playerOrigin =
    typeof body.playerOrigin === "string" && body.playerOrigin.trim()
      ? body.playerOrigin.trim().replace(/\/+$/, "")
      : "";
  if (!playerOrigin) {
    try {
      const u = new URL(req.url);
      playerOrigin = `${u.protocol}//${u.host}`;
    } catch {
      playerOrigin = "http://localhost:3000";
    }
  }

  const ttlSeconds =
    typeof body.ttlSeconds === "number" &&
    Number.isFinite(body.ttlSeconds) &&
    body.ttlSeconds >= 60
      ? Math.min(Math.floor(body.ttlSeconds), DEFAULT_EMBED_TTL_SECONDS)
      : DEFAULT_EMBED_TTL_SECONDS;

  const livePageUrl =
    typeof body.livePageUrl === "string" && body.livePageUrl.trim()
      ? body.livePageUrl.trim()
      : null;

  const api = getServerDashboardEmbedApiBase();
  const r = await fetch(`${api}/api/embed-access/dashboard-generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({
      story_id: storyId,
      json_src: jsonSrc,
      start,
      title: title || storyId,
      player_origin: playerOrigin,
      ttl_seconds: ttlSeconds,
      live_page_url: livePageUrl,
    }),
  });

  const text = await r.text();
  if (!r.ok) {
    const endpoint = `${api}/api/embed-access/dashboard-generate`;
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
    } catch {
      /* keep text */
    }
    return NextResponse.json(
      {
        error:
          detail ||
          `Backend HTTP ${r.status} at ${endpoint} (check API base + backend deploy)`,
      },
      { status: r.status >= 400 && r.status < 600 ? r.status : 502 }
    );
  }

  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Invalid backend response" },
      { status: 502 }
    );
  }
}

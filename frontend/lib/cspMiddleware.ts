import type { NextResponse } from "next/server";

const IMG_SRC =
  "img-src 'self' data: blob: https://replicate.delivery https://*.replicate.delivery https://api.thequestell.com";

/** CSP frame-ancestors for /embed/* (Edge middleware reads env at request time on Vercel). */
export function embedFrameAncestorsFromEnv(): string {
  const raw = (
    process.env.EMBED_FRAME_ANCESTORS ||
    process.env.NEXT_PUBLIC_EMBED_FRAME_ANCESTORS ||
    "*"
  ).trim();
  if (!raw || raw === "*") return "*";
  return raw.split(/[\s,]+/).filter(Boolean).join(" ");
}

/** Dev: lokális API + WS + gyakori éles API (ha NEXT_PUBLIC_API_BASE külső). */
function devConnectSrcDirective(): string {
  const origins = new Set<string>([
    "'self'",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://azenc.local:8000",
    "ws://localhost:3000",
    "ws://127.0.0.1:3000",
    "ws://azenc.local:3000",
    "https://api.thequestell.com",
    "https://www.thequestell.com",
  ]);
  const raw = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      origins.add(`${u.protocol}//${u.host}`);
    } catch {
      /* ignore invalid */
    }
  }
  return `connect-src ${[...origins].join(" ")}`;
}

function buildCsp(isDev: boolean, frameAncestors: string): string {
  const connect = isDev
    ? devConnectSrcDirective()
    : "connect-src 'self' https: wss:";
  const script = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    /* Kezdőlap / egyéb oldalak: külső player iframe (pl. thequestell.com ghost embed) */
    "frame-src 'self' https://www.thequestell.com",
    `frame-ancestors ${frameAncestors}`,
    IMG_SRC,
    "object-src 'none'",
    script,
    "style-src 'self' 'unsafe-inline'",
    connect,
  ].join("; ");
}

export function buildDefaultCsp(isDev: boolean): string {
  return buildCsp(isDev, "'none'");
}

export function buildEmbedCsp(isDev: boolean): string {
  return buildCsp(isDev, embedFrameAncestorsFromEnv());
}

export function isEmbedPath(pathname: string): boolean {
  if (pathname === "/embed") return true;
  if (pathname.startsWith("/embed/")) return true;
  return false;
}

export function applySecurityHeaders(
  response: NextResponse,
  isDev: boolean,
  embed: boolean
): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "geolocation=()");
  if (embed) {
    response.headers.delete("x-frame-options");
    response.headers.set("Content-Security-Policy", buildEmbedCsp(isDev));
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", buildDefaultCsp(isDev));
  }
  return response;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  applySecurityHeaders,
  isEmbedPath,
} from "@/lib/cspMiddleware";

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const response = NextResponse.next();
  return applySecurityHeaders(
    response,
    isDev,
    isEmbedPath(request.nextUrl.pathname)
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

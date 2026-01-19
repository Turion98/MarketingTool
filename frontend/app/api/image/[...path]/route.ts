// app/api/image/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

export async function GET(_req: NextRequest, context: any) {
  const path = (context?.params?.path ?? []) as string[];
  const rel = path.join("/"); // default/ch1_...png
  const target = `${BACKEND}/generated/images/${rel}`;
  console.log("[image-proxy] GET", target);

  const res = await fetch(target, { cache: "no-store" });
  if (!res.ok) {
    return new NextResponse("Not found", { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "image/png";

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=60",
    },
  });
}

import { NextResponse } from "next/server";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

// Próbálkozunk több lehetséges backend útvonallal,
// majd normalizáljuk {id,title,jsonSrc,startPageId} formára.
// Ha minden bukik, adunk egy fallbackot.
export async function GET() {
  const candidates = ["/stories", "/api/stories", "/story/list", "/campaigns"];

  for (const path of candidates) {
    try {
      const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      const list = normalizeList(data);
      if (list.length) return NextResponse.json(list, { status: 200 });
    } catch {
      // próbálkozunk a következő candidattel
    }
  }

  // 🔙 Fallback – legalább egy sztori legyen játszható lokálból
  return NextResponse.json(
    [
      {
        id: "global_story",
        title: "Main Campaign",
        jsonSrc: "/stories/global.json",
        startPageId: "ch1_pg1",
      },
    ],
    { status: 200 }
  );
}

function normalizeList(input: any) {
  let arr: any[] = [];
  if (Array.isArray(input)) arr = input;
  else if (input?.items && Array.isArray(input.items)) arr = input.items;

  return arr
    .map((x) => {
      const id = x?.id ?? x?.slug ?? x?.brandId ?? x?.name;
      const title = x?.title ?? x?.name ?? id;
      const jsonSrc = x?.jsonSrc ?? x?.src ?? x?.storySrc;
      const startPageId = x?.startPageId ?? x?.start ?? "ch1_pg1";
      if (!id || !jsonSrc) return null;
      return { id, title, jsonSrc, startPageId };
    })
    .filter(Boolean);
}

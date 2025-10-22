"use client";

import React, { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { loadTokens } from "../lib/tokenLoader";

// 🔧 Központi API_BASE (env → fallback localhost)
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

// Dinamikus StoryPage – SSR nélkül
const StoryPage = dynamic(() => import("../components/StoryPage/StoryPage"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading story…</div>,
});

// Egyszerű hibafogó
type EBState = { hasError: boolean; err?: unknown };
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, err };
  }
  componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("[StoryRoute Error]", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Hopp, valami hibázott a történet betöltése közben.</h2>
          <p style={{ opacity: 0.8, marginTop: 8 }}>Próbáld meg frissíteni az oldalt.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const RUNE_LS_KEY = "runePackByCampaignId";
type Runemode = "single" | "triple";

export default function StoryRoutePage() {
  const q = useSearchParams();

  // Snapshot a query paramokról – így tisztán tehetők a dep-ek
  const { skin, src, title, start, runes, runemode, campaignId } = useMemo(() => {
    const skin = q.get("skin") ?? "contract_default";
    const src = q.get("src");
    const title = q.get("title");
    const start = q.get("start");
    const runes = q.get("runes");
    const runemode = q.get("runemode") as Runemode | null;
    const campaignId = q.get("c");
    return { skin, src, title, start, runes, runemode, campaignId };
  }, [q]);

  // 1) Skin betöltés
  useEffect(() => {
    loadTokens(`/skins/${skin}.json`).catch((err) => console.warn("⚠️ Skin load failed:", err));
  }, [skin]);

  // 2) Paraméterek persistálása
  useEffect(() => {
    const saveRunes = (cid: string | null, r: string | null, mode: Runemode | null) => {
      if (!cid || !r || (mode !== "single" && mode !== "triple")) return;
      try {
        const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
        all[cid] = { mode, icons: r.split(",").map((s) => s.trim()).filter(Boolean) };
        localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
      } catch {
        /* no-op */
      }
    };

    (async () => {
      try {
        // Teljes, önhordó query -> azonnal storage
        if (src) {
          try {
            localStorage.setItem("storySrc", src);
            if (title) localStorage.setItem("storyTitle", title);
            if (start) localStorage.setItem("currentPageId", start);
          } catch {
            /* no-op */
          }
          saveRunes(campaignId, runes, runemode);
          return;
        }

        // campaignId alapján feloldás a backend /stories-ról (NEM Next /api)
        if (campaignId && !src) {
          const r = await fetch(`${API_BASE}/stories`, { cache: "no-store" });
          if (r.ok) {
            const list = await r.json();
            const item =
              (Array.isArray(list) ? list : []).find((x: any) => x?.id === campaignId) || null;
            if (item?.jsonSrc) {
              try {
                localStorage.setItem("storySrc", item.jsonSrc);
                localStorage.setItem("storyTitle", item.title || campaignId);
                localStorage.setItem("currentPageId", item.startPageId || "ch1_pg1");
              } catch {
                /* no-op */
              }
            }
            saveRunes(campaignId, runes, runemode);
          } else {
            console.warn("⚠️ /stories fetch failed:", r.status);
          }
        }
      } catch (e) {
        console.warn("⚠️ StoryRoutePage init failed:", e);
      }
    })();
  }, [src, title, start, runes, runemode, campaignId]);

  return (
    <ErrorBoundary>
      <StoryPage />
    </ErrorBoundary>
  );
}

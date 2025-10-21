"use client";

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import StoryPage from "../components/StoryPage/StoryPage";
import { loadTokens } from "../lib/tokenLoader";

// Opcionális: ugyanaz a kulcs, mint az Adventures oldalon
const RUNE_LS_KEY = "runePackByCampaignId";

export default function StoryRoutePage() {
  const q = useSearchParams();

  // 1) Skin betöltés (marad a te verziód logikája)
  useEffect(() => {
    const skin = q.get("skin") || "contract_default";
    loadTokens(`/skins/${skin}.json`).catch((err) =>
      console.warn("⚠️ Skin load failed:", err)
    );
  }, [q]);

  // 2) Paraméterek persistálása:
  //    - Ha érkezik src/start/title (és opcionálisan runes/runemode), akkor ezek localStorage-ba mennek.
  //    - Ha nincs src, de van c (campaignId), akkor /api/stories-ból feloldjuk a src/start/title-t.
  useEffect(() => {
    (async () => {
      try {
        const src = q.get("src");
        const title = q.get("title");
        const start = q.get("start");
        const skin = q.get("skin"); // már betöltjük feljebb, itt nem muszáj tárolni
        const runes = q.get("runes"); // pl. "ring,arc,dot"
        const runemode = q.get("runemode") as "single" | "triple" | null;
        const campaignId = q.get("c"); // ha csak campaignId érkezik

        // Ha teljes, önhordó query érkezik, írjuk ki a storage-ba
        if (src) {
          localStorage.setItem("storySrc", src);
          if (title) localStorage.setItem("storyTitle", title);
          if (start) localStorage.setItem("currentPageId", start);

          // Rúnák mentése (ha van campaignId, storyId alatt tároljuk)
          if (runes && runemode && (runemode === "single" || runemode === "triple")) {
            try {
              const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
              if (campaignId) {
                all[campaignId] = { mode: runemode, icons: runes.split(",") };
                localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
              }
            } catch {}
          }

          return; // kész
        }

        // Ha nincs src, de van campaignId -> feloldás az /api/stories listából
        if (campaignId && !src) {
          const r = await fetch("/api/stories", { cache: "no-store" });
          if (r.ok) {
            const list = await r.json();
            const item =
              (Array.isArray(list) ? list : []).find((x: any) => x?.id === campaignId) || null;

            if (item?.jsonSrc) {
              localStorage.setItem("storySrc", item.jsonSrc);
              localStorage.setItem("storyTitle", item.title || campaignId);
              localStorage.setItem("currentPageId", item.startPageId || "ch1_pg1");
            }

            // Ha a query-ben így is jött runes/runemode, mentsük el a campaignId alá
            if (runes && runemode && (runemode === "single" || runemode === "triple")) {
              try {
                const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
                all[campaignId] = { mode: runemode, icons: runes.split(",") };
                localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
              } catch {}
            }
          } else {
            console.warn("⚠️ /api/stories fetch failed:", r.status);
          }
        }
      } catch (e) {
        console.warn("⚠️ StoryRoutePage init failed:", e);
      }
    })();
  }, [q]);

  return <StoryPage />;
}

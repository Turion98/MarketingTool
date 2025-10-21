"use client";

import React, { useEffect } from "react";
import StoryPage from "@/app/components/StoryPage/StoryPage";
import { useSearchParams } from "next/navigation";
import { loadTokens } from "@/app/lib/tokenLoader";

const RUNE_LS_KEY = "runePackByCampaignId";

export default function EmbedCampaignPage() {
  const q = useSearchParams();

  useEffect(() => {
    const skin = q.get("skin") || "contract_default";
    loadTokens(`/skins/${skin}.json`).catch(() => {});
  }, [q]);

  useEffect(() => {
    try {
      const src       = q.get("src");
      const title     = q.get("title");
      const start     = q.get("start");
      const campaignId= q.get("c");            // ha küldöd
      const runes     = q.get("runes");        // pl. "ring,arc,dot"
      const runemode  = q.get("runemode");     // "single" | "triple"

      if (src)   localStorage.setItem("storySrc", src);
      if (title) localStorage.setItem("storyTitle", title);
      if (start) localStorage.setItem("currentPageId", start);

      // Rúnák mentése per-kampány (ha van story/campaign azonosító)
      if (campaignId && runes && (runemode === "single" || runemode === "triple")) {
        try {
          const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
          all[campaignId] = { mode: runemode, icons: runes.split(",") };
          localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
        } catch {}
      }
    } catch {}
  }, [q]);

  return <StoryPage />;
}

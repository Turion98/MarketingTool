"use client";

import React, { useEffect } from "react";
import StoryPage from "@/app/components/StoryPage/StoryPage";
import { useSearchParams } from "next/navigation";
import { loadTokens } from "@/app/lib/tokenLoader";

export default function EmbedCampaignPage() {
  const q = useSearchParams();
  const skin = q.get("skin");
  const src  = q.get("src");
  const title= q.get("title");

  // opcionális: skin előtöltés (StoryPage is elintézi, de itt eager)
  useEffect(() => {
    if (!skin) return;
    loadTokens(`/skins/${skin}.json`).catch(() => {});
  }, [skin]);

  // Opcionális: title/src persist a StoryPage globál logikájához (ő is kezeli ezt) :contentReference[oaicite:3]{index=3}
  useEffect(() => {
    try {
      if (src) localStorage.setItem("storySrc", src);
      if (title) localStorage.setItem("storyTitle", title);
    } catch {}
  }, [src, title]);

  return <StoryPage />;
}

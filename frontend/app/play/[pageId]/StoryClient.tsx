// app/play/[pageId]/StoryClient.tsx
"use client";

import { useEffect } from "react";
import StoryPage from "@/app/components/StoryPage/StoryPage";   // ⬅ igazítsd az elérési utat, ha máshol van
import { loadTokens } from "@/app/lib/tokenLoader";            // ⬅ igazítsd az elérési utat, ha máshol van

export default function StoryClient({ pageId, skin, src }: { pageId: string; skin: string; src: string }) {
  useEffect(() => {
    loadTokens(`/skins/${skin}.json`).catch((err) => console.warn("⚠ skin load failed", err));
  }, [skin]);

  // Ha a StoryPage propokat vár, add át neki (pageId, src, stb.)
  return <StoryPage />;
}

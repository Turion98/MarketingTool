"use client";

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import StoryPage from "../components/StoryPage/StoryPage";
import { loadTokens } from "../lib/tokenLoader"; // ✅ ellenőrizd az elérési útvonalat

export default function StoryRoutePage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // 1️⃣ kiolvassuk a query paramot
    const skin = searchParams.get("skin") || "contract_default";

    // 2️⃣ betöltjük a skin JSON-t
    loadTokens(`/skins/${skin}.json`).catch((err) =>
      console.warn("⚠️ Skin load failed:", err)
    );
  }, [searchParams]);

  return <StoryPage />;
}

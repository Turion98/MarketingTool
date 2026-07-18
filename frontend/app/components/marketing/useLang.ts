"use client";

import { useEffect, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";

/**
 * A portfólió nyelv-állapota. A rendszer kétnyelvűségre kész (HU/EN), de
 * jelenleg csak a HU ág van feltöltve. A meglévő nav-beli HU/EN kapcsoló és a
 * `presentLangSync` (localStorage + custom event) vezérli — ugyanaz a forrás,
 * amit a `MarketingNav` és a `PresentDeck` is használ.
 */
export type UiLang = "hu" | "en";

export function useLang(defaultLang: UiLang = "hu"): UiLang {
  const [lang, setLang] = useState<UiLang>(defaultLang);

  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);

    const onLangChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ lang?: UiLang }>).detail;
      const next = detail?.lang;
      if (next === "hu" || next === "en") setLang(next);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
    return () =>
      window.removeEventListener(
        PRESENT_LANG_CHANGED_EVENT,
        onLangChanged as EventListener,
      );
  }, []);

  return lang;
}

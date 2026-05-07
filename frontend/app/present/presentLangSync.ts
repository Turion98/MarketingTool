import type { PresentLang } from "./presentDeck.types";

/** Present + marketing nav: közös nyelvtár + esemény a kliens-oldali szinkronhoz. */
export const PRESENT_LANG_STORAGE_KEY = "questell_present_lang_v1";

export const PRESENT_LANG_CHANGED_EVENT = "questell_present_lang_changed";

export function readPresentLangFromStorage(): PresentLang | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(PRESENT_LANG_STORAGE_KEY);
    return saved === "hu" || saved === "en" ? saved : null;
  } catch {
    return null;
  }
}

export function writePresentLangToStorage(lang: PresentLang) {
  try {
    window.localStorage.setItem(PRESENT_LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function notifyPresentLangChanged(lang: PresentLang) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PRESENT_LANG_CHANGED_EVENT, { detail: { lang } })
  );
}

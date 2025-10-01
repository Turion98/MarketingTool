import { clearImageCache } from "./clearImageCache";
import { clearVoiceCache } from "./clearVoiceCache";

/**
 * Törli az összes cache-t (képek, hangok) a localStorage-ból
 * és a backend generated mappáit is kiüríti.
 */
export async function clearAllCache() {
  try {
    // 🔹 Frontend cache törlés
    clearImageCache();
    clearVoiceCache();

    // 🔹 Backend cache törlés
    const secret = process.env.NEXT_PUBLIC_DEV_CLEAR_SECRET || "KAB1T05Z3r!25";
    const apiBase = process.env.NEXT_PUBLIC_API_BASE; // pl. http://127.0.0.1:8000

    if (!apiBase) {
      console.error("API base URL nincs beállítva (NEXT_PUBLIC_API_BASE)");
      return;
    }

    const res = await fetch(`${apiBase}/clear-cache?secret=${secret}`, {
      method: "POST", // vagy GET, attól függ, a backend hogy van megírva
    });

    if (!res.ok) {
      console.error("Backend cache törlés sikertelen:", await res.text());
    }
  } catch (err) {
    console.error("Cache törlés sikertelen:", err);
  }
}

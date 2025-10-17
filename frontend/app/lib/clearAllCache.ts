import { clearImageCache } from "./clearImageCache";
import { clearVoiceCache } from "./clearVoiceCache";

/**
 * Törli az összes cache-t (képek, hangok) a localStorage-ból
 * és – ha elérhető – a backend generated mappáit is kiüríti.
 */
export async function clearAllCache() {
  try {
    // 🔹 Frontend cache törlés
    clearImageCache();
    clearVoiceCache();

    // 🔹 API base + secret beolvasás biztonságosan
    const secret = process.env.NEXT_PUBLIC_DEV_CLEAR_SECRET || "KAB1T05Z3r!25";
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE ||
      (typeof window !== "undefined"
        ? localStorage.getItem("apiBase") || "http://127.0.0.1:8000"
        : "http://127.0.0.1:8000");

    // 🔹 Ha nincs elérhető backend, csak lokális cache törlődik
    if (!apiBase) {
      console.warn("⚠️ API base URL nincs beállítva, kihagyva a szerver törlést.");
      return;
    }

    const res = await fetch(`${apiBase}/clear-cache?secret=${secret}`, {
      method: "POST", // vagy GET, ha úgy van a backend
    });

    if (!res.ok) {
      console.error("⚠️ Backend cache törlés sikertelen:", await res.text());
    } else {
      console.info("✅ Backend cache törölve.");
    }
  } catch (err) {
    console.error("❌ Cache törlés sikertelen:", err);
  }
}

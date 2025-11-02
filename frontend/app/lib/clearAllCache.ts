import { clearImageCache } from "./clearImageCache";
import { clearVoiceCache } from "./clearVoiceCache";

/**
 * Törli az összes cache-t (képek, hangok, backend) biztonságosan.
 * Összehangolva a backend `/api/cache/clear` endpointtal.
 */
export async function clearAllCache() {
  try {
    // 🔹 Frontend cache törlés
    clearImageCache();
    clearVoiceCache();

    // 🔹 API base beolvasása biztonságosan
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE ||
      (typeof window !== "undefined"
        ? localStorage.getItem("apiBase") || "http://127.0.0.1:8000"
        : "http://127.0.0.1:8000");

    if (!apiBase) {
      console.warn("⚠️ API base URL nincs beállítva, kihagyva a szerver törlést.");
      return;
    }

    // 🔹 Backend cache törlés hívás
    const res = await fetch(`${apiBase}/api/cache/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("⚠️ Backend cache törlés sikertelen:", errText);
      return;
    }

    console.info("✅ Backend cache törölve.");

    // 🔹 Extra: helyi storage kulcsok törlése (ha van)
    try {
      localStorage.removeItem("imageCache");
      localStorage.removeItem("storyCache");
    } catch (err) {
      console.warn("localStorage törlés figyelmeztetés:", err);
    }
  } catch (err) {
    console.error("❌ Cache törlés sikertelen:", err);
  }
}

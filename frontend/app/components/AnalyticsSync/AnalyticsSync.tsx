"use client";
import { useEffect } from "react";
import { uploadBatch } from "../../lib/analytics";

type Props = {
  storyId?: string;
  sessionId?: string; // kompat miatt megtartjuk
  intervalMs?: number; // alap: 30s
};

// Hova küldünk:
// - állítható: NEXT_PUBLIC_ANALYTICS_ENDPOINT
// - fallback: FastAPI lokál endpoint
const ENDPOINT =
  process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT ??
  "http://127.0.0.1:8000/api/analytics/batch";

export default function AnalyticsSync({
  storyId,
  sessionId, // nem használjuk, de maradhat propban
  intervalMs = 30000,
}: Props) {
  useEffect(() => {
    const willMount = !!storyId;
    console.log("[AnalyticsSync mount check]", { storyId, sessionId, willMount });
    if (!storyId) return;

    let timer: number | null = null;

    const tick = async () => {
      try {
        await uploadBatch(storyId, ENDPOINT);
      } catch (err) {
        console.warn("[AnalyticsSync] upload error", err);
      }
      timer = window.setTimeout(tick, intervalMs) as unknown as number;
    };

    // induló flush + ciklus
    tick();

    // tab visszatéréskor is próbálunk küldeni
    const onVis = () => {
      if (document.visibilityState === "visible") {
        uploadBatch(storyId, ENDPOINT).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // kilépés előtt: best-effort (pagehide + beforeunload)
    const onPageHide = () => {
      try {
        uploadBatch(storyId, ENDPOINT);
      } catch {}
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      if (timer != null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [storyId, sessionId, intervalMs]);

  return null;
}

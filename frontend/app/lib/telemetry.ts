// frontend/lib/telemetry.ts

type TelemetryEvent =
  | { type: "cache_hit"; pageId: string; url: string }
  | { type: "cache_miss"; pageId: string }
  | { type: "generation_start"; pageId: string }
  | { type: "generation_end"; pageId: string; durationMs: number }
  | { type: "error"; pageId: string; message: string }
  | { type: "sfx_trigger"; pageId: string; file: string; scheduledMs: number; delayMs: number }; // ⬅ új típus

const TELEMETRY_ENDPOINT = process.env.NEXT_PUBLIC_TELEMETRY_URL || null;

/**
 * Küld vagy konzolra ír telemetry eseményeket.
 */
export function logTelemetry(event: TelemetryEvent) {
  // Konzol log fejlesztéshez
  if (process.env.NODE_ENV === "development") {
    console.log("[Telemetry]", event);
  }

  // Opcionális: küldés szerverre
  if (TELEMETRY_ENDPOINT) {
    fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
      }),
    }).catch((err) => {
      console.warn("Telemetry send failed:", err);
    });
  }
}

/**
 * SFX-trigger loggolása.
 * @param pageId – oldal azonosító
 * @param file – SFX fájlnév vagy URL
 * @param scheduledMs – tervezett lejátszási idő T0-hoz képest (ms)
 * @param delayMs – tényleges eltérés (ms)
 */
export function logSfxTrigger(
  pageId: string,
  file: string,
  scheduledMs: number,
  delayMs: number
) {
  logTelemetry({
    type: "sfx_trigger",
    pageId,
    file,
    scheduledMs,
    delayMs,
  });
}

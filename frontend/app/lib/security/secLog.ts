// frontend/app/lib/security/secLog.ts
//
// Egységes security log wrapper, hogy minden biztonsági modul
// ugyanazzal a formátummal írjon naplót fejlesztés közben.
//
// Fontos:
// - soha ne logoljunk teljes sessionId-t, PII-t, query paramot nyersen
// - ez a log CSAK lokális fejlesztésre készült, nincs hálózati küldés
//
// Használat:
//   secLog("WARN", "RATE_LIMIT_BLOCK", "local rate limit triggered", { actionKey, sessionId })
//
// A rateLimiter jelenleg saját secLog-ot használ. Később át lehet húzni
// arra is ezt az egységes verziót.

export type SecLogLevel = "WARN" | "INFO" | "ERROR";

export function secLog(
  level: SecLogLevel,
  code: string,
  msg: string,
  ctx: Record<string, string | number | boolean> = {}
): void {
  // sessionId maszkolása, ha lenne
  const safeCtx: Record<string, string | number | boolean> = { ...ctx };
  if ("sessionId" in safeCtx && typeof safeCtx.sessionId === "string") {
    const raw = String(safeCtx.sessionId);
    safeCtx.sessionId = raw.slice(0, 6) + "...";
  }

  const ts = Date.now();
  // eslint-disable-next-line no-console
  console.warn(
    `[SEC] ${ts} ${level} ${code} ${msg} ${JSON.stringify(safeCtx)}`
  );
}

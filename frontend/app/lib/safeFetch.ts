"use client";

import { useAuth } from "./auth/useAuth";

/** Extra beállítások a fetch-hez */
type ExtraInit = {
  timeoutMs?: number;
  retries?: number;
};

/** JSON-t ad vissza típusbiztosan */
export type FetchJSON = <T>(
  input: RequestInfo | URL,
  init?: RequestInit & ExtraInit
) => Promise<T>;

/** Exponenciális backoff */
function backoff(attempt: number): number {
  const base = 250; // ms
  return base * Math.pow(2, attempt);
}

/** Központosított, biztonságos fetch */
export const createSafeFetch = (getToken: () => Promise<string | null>): FetchJSON => {
  return async function fetchJSON<T>(
    input: RequestInfo | URL,
    init?: RequestInit & ExtraInit
  ): Promise<T> {
    const timeoutMs: number = init?.timeoutMs ?? 8000;
    const retries: number = init?.retries ?? 1;

    let lastErr: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const token = await getToken();

        // Fejlécek típusosan
        const headersInit: HeadersInit = init?.headers ?? {};
        const headers = new Headers(headersInit);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("Accept", "application/json");

        const res = await fetch(input, {
          ...init,
          headers,
          signal: ctrl.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

          if (typeof window !== "undefined" && (window as any).Sentry) {
            (window as any).Sentry.captureException(err);
          }

          // 5xx esetén retry
          if (res.status >= 500 && attempt < retries) {
            await new Promise((r) => setTimeout(r, backoff(attempt)));
            continue;
          }
          throw err;
        }

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return (await res.text()) as unknown as T;
        }
        return (await res.json()) as T;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;

        // Abort/timeout/hálózati hiba → retry
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, backoff(attempt)));
          continue;
        }
      }
    }

    if (typeof window !== "undefined" && (window as any).Sentry) {
      (window as any).Sentry.captureException(lastErr as any);
    }
    throw lastErr;
  };
};

/** React hook a kényelmes használathoz */
export function useSafeFetch(): FetchJSON {
  const { getToken } = useAuth();
  return createSafeFetch(getToken);
}

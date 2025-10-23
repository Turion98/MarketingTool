// app/lib/safeFetch.ts

// ---- Közös util típusok (ha van global.d.ts, ezek mehetnek onnan is) ----
export type Json =
  | string | number | boolean | null
  | Json[]
  | { [k: string]: Json };

export type Dict<T = unknown> = Record<string, T>;

// ---- Publikus típusok ----
export type FetchOptions = Omit<RequestInit, "body"> & {
  /** Ha JSON-t küldesz, ezt add meg. FormData/string esetén mehet simán body-ként is. */
  json?: unknown;
  /** Explicit body (FormData, string, Blob, URLSearchParams, stb.). */
  body?: BodyInit | null;
  /** Kliens oldali timeout (ms). */
  timeoutMs?: number;
  /** Újrapróbálkozások száma (egyszerű retry). */
  retries?: number;
  /** Fix késleltetés retry-k között (ms). */
  retryDelayMs?: number;
};

/**
 * Típusos, biztonságos fetch wrapper.
 * - Timeout-ol, újrapróbálkozik, JSON-t automatikusan értelmez.
 * - A visszatérési típus generikus <T>.
 */
export async function safeFetch<T = unknown>(
  url: string,
  opts: FetchOptions = {}
): Promise<T> {
  const {
    json,
    timeoutMs = 15_000,
    retries = 0,
    retryDelayMs = 300,
    ...init
  } = opts;

  // Body & headers előkészítés
  const headers = new Headers(init.headers ?? {});
  const explicitBody = init.body as BodyInit | null | undefined;

  const body: BodyInit | null | undefined =
    (json !== undefined &&
     !(json instanceof FormData) &&
     typeof json !== "string" &&
     !(json instanceof Blob) &&
     !(json instanceof URLSearchParams))
      ? (headers.set("Content-Type", headers.get("Content-Type") ?? "application/json"),
         JSON.stringify(json))
      : (json ?? explicitBody) as BodyInit | null | undefined;

  // Idempotens retry loop (egyszerű, lineáris backoff)
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        body,
        headers,
        signal: controller.signal,
        cache: init.cache ?? "no-store",
      });

      if (!res.ok) {
        // próbálj JSON hibát olvasni, de ne ess hasra
        const ct = res.headers.get("content-type") || "";
        let payload: unknown;
        try {
          payload = ct.includes("application/json") ? await res.json() : await res.text();
        } catch {
          payload = `HTTP ${res.status}`;
        }
        throw new HttpError(res.status, payload);
      }

      // Sikeres válasz → próbálj JSON-t, különben text
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        return (await res.json()) as T;
      }
      // Ha nem JSON, engedd vissza a text-et (vagy blob-ot később bővíthetjük)
      return (await res.text()) as unknown as T;
    } catch (err) {
      lastErr = err;

      // AbortError vagy hálózati hiba esetén retry, ha van még kísérlet
      const isAbort = isAbortError(err);
      const shouldRetry =
        attempt < retries && (isAbort || isNetworkLikeError(err) || isHttpRetryable(err));

      if (!shouldRetry) break;

      attempt += 1;
      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    } finally {
      clearTimeout(t);
    }
  }

  // Ha idáig jut, minden kísérlet elbukott
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Unknown fetch error"));
}

// ---- Kisegítő típusok/függvények ----

/** HTTP hiba, beágyazott payload-dal (típus: unknown). */
export class HttpError extends Error {
  public readonly status: number;
  public readonly payload: unknown;
  constructor(status: number, payload: unknown) {
    const msg =
      typeof payload === "string" ? payload : `HTTP ${status}${payload ? `: ${safeJson(payload)}` : ""}`;
    super(msg);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

function isAbortError(err: unknown): boolean {
  // böngésző: DOMException name: 'AbortError'
  return (err as { name?: string })?.name === "AbortError";
}

function isNetworkLikeError(err: unknown): boolean {
  // nagyon egyszerű heurisztika: nincs status, Error típus
  return !(err as { status?: number })?.status && err instanceof Error;
}

function isHttpRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  // 502/503/504 tipikusan retry-olható
  return status === 502 || status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

// ---- Cukor-függvények (opcionális) ----

/** JSON küldése és JSON várása erős típussal. */
export async function postJson<T = unknown>(url: string, body: Json, opts: Omit<FetchOptions, "json" | "method"> = {}) {
  return safeFetch<T>(url, { ...opts, method: "POST", json: body });
}

/** GET + erős típus. */
export async function getJson<T = unknown>(url: string, opts: Omit<FetchOptions, "json" | "method"> = {}) {
  return safeFetch<T>(url, { ...opts, method: "GET" });
}

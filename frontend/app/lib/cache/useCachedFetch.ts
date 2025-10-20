import { useEffect, useRef, useState } from "react";
import { getCache, setCache } from "./frontendCache";

type Opts = {
  bucket?: "skin" | "campaign" | "page" | "wl" | string;
  id?: string;
  ttlMs?: number;          // default 5 perc
  asText?: boolean;        // default JSON
  fetchInit?: RequestInit;
  enabled?: boolean;
};

export function useCachedFetch<T = any>(url: string | null | undefined, opts: Opts = {}) {
  const { bucket = "page", id, ttlMs = 5 * 60_000, asText = false, fetchInit, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!enabled && !!url);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !url) { setLoading(false); return; }
    const cid = (id || url).replace(/\s+/g, "");
    const cached = getCache<T>(bucket, cid);
    if (cached != null) { setData(cached); setLoading(false); setError(null); return; }

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        setLoading(true); setError(null);
        const res = await fetch(url, { signal: ac.signal, cache: "no-store", ...fetchInit });
        if (!res.ok) { setError(`HTTP ${res.status}`); setLoading(false); return; }
        const val: any = asText ? await res.text() : await res.json();
        setData(val as T);
        setCache<T>(bucket, cid, val, ttlMs);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "fetch error");
      } finally {
        setLoading(false);
      }
    })();

    return () => { try { abortRef.current?.abort(); } catch {} abortRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, bucket, id, ttlMs, asText]);

  return { data, loading, error };
}

import { useEffect, useRef, useState, useMemo } from "react";
import { getSeedForPage } from "./sessionSeeds";

const toHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${h >>> 0}`;
};

type UseImageCacheArgs = {
  enabled?: boolean;
  pageId: string;
  prompt: string;
  params?: Record<string, any>;
  styleProfile?: Record<string, any>;
  mode?: "draft" | "refine";
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  retryTrigger?: number;
};

type UseImageCacheResult = {
  imageUrl?: string;
  loading: boolean;
  error: string | null;
};

// ⬇️ Dev perf log (StoryPage dev-sorhoz)
let lastImagePerfLog: { key: string; url?: string; hit: boolean; ms: number } | null = null;
export function getLastImagePerfLog() {
  return lastImagePerfLog;
}

export function useImageCache({
  enabled = true,
  pageId,
  prompt,
  params = {},
  styleProfile = {},
  mode = "draft",
  maxRetries = 2,
  retryDelayMs = 2000,
  timeoutMs = 15000,
  retryTrigger = 0,
}: UseImageCacheArgs): UseImageCacheResult {
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⬇️ guard: ha egyszer fail, addig nem indul újra, amíg nincs retryTrigger
  const hasFailedRef = useRef(false);

  // stabil hash kulcsok, hogy ne triggereljen feleslegesen
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const styleKey = useMemo(() => JSON.stringify(styleProfile), [styleProfile]);

  useEffect(() => {
    if (!enabled) {
      if (abortRef.current) abortRef.current.abort();
      setLoading(false);
      setError(null);
      setImageUrl(undefined);
      hasFailedRef.current = false;
      return;
    }

    // 🔴 Ha korábban fail volt és nincs új retryTrigger, akkor ne induljunk újra
    if (hasFailedRef.current && retryTrigger === 0) return;

    let isMounted = true;
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        setImageUrl(undefined);
        hasFailedRef.current = false; // új próbálkozásnál reset

        const seed = getSeedForPage(pageId);
        const promptKey = toHash(
          JSON.stringify({ pageId, prompt, params, styleProfile, seed, mode })
        );

        // ⬇️ Local cache check + HIT mérés
        const cacheKey = `image_${pageId}_${mode}`;
        const t0 = performance.now();
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const ms = Math.round(performance.now() - t0);
          lastImagePerfLog = { key: cacheKey, url: cached, hit: true, ms };
          if (process.env.NODE_ENV === "development") {
            console.debug(`[IMAGE CACHE] HIT ${cacheKey} (${ms}ms)`);
          }
          setImageUrl(cached);
          setLoading(false);
          return;
        }

        // ⬇️ Offline kezelés
        if (typeof navigator !== "undefined" && navigator && !navigator.onLine) {
          const ms = Math.round(performance.now() - t0);
          lastImagePerfLog = { key: cacheKey, hit: false, ms };
          if (process.env.NODE_ENV === "development") {
            console.debug(`[IMAGE CACHE] MISS (offline) ${cacheKey} (${ms}ms)`);
          }
          setLoading(false);
          setError("Offline: nincs cache-elt kép");
          setImageUrl(undefined);
          hasFailedRef.current = true;
          return;
        }

        const body = {
          pageId,
          prompt,
          params,
          styleProfile,
          seed,
          promptKey,
          cache: true,
          format: "png",
          reuseExisting: true,
          mode,
        };

        // ⬇️ Fetch + retry + MISS mérés
        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            const startNet = performance.now();

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
            );

            const fetchPromise = fetch(
              `${process.env.NEXT_PUBLIC_API_URL ?? ""}/generate_image`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
              }
            );

            const res: any = (await Promise.race([fetchPromise, timeoutPromise])) as Response;

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (!isMounted) return;

            if (data?.path) {
              const finalUrl = data.path.startsWith("/") ? data.path : `/${data.path}`;

              try {
                localStorage.setItem(cacheKey, finalUrl);
              } catch {
                // localStorage megtelt, ignoráljuk
              }

              const ms = Math.round(performance.now() - startNet);
              lastImagePerfLog = { key: cacheKey, url: finalUrl, hit: false, ms };
              if (process.env.NODE_ENV === "development") {
                console.debug(`[IMAGE CACHE] MISS→STORE ${cacheKey} (${ms}ms)`);
              }

              setImageUrl(finalUrl);
              setLoading(false);
              setError(null);
              return;
            }

            throw new Error("Invalid response");
          } catch (err: any) {
            if (controller.signal.aborted) return;
            if (attempt === maxRetries) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, retryDelayMs));
            attempt++;
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        setLoading(false);
        setError(err?.message || "Image request failed");
        setImageUrl(undefined);
        hasFailedRef.current = true; // ⬅️ mark: fail állapot
      }
    };

    run();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    enabled,
    pageId,
    prompt,
    paramsKey,
    styleKey,
    mode,
    maxRetries,
    retryDelayMs,
    timeoutMs,
    retryTrigger, // ⬅️ csak Retry indít újra
  ]);

  return { imageUrl, loading, error };
}

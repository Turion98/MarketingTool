import { useEffect, useRef, useState, useMemo } from "react";
import { getSeedForPage } from "./sessionSeeds";

const toHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${h >>> 0}`;
};

function normalizePrompt(p: any): string {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p === "object") {
    // 1. ha van combinedPrompt → ez az első
    if (p.combinedPrompt) {
      const base = String(p.combinedPrompt).trim();
      return p.negativePrompt ? `${base}, Negative: ${String(p.negativePrompt).trim()}` : base;
    }
    // 2. külön mezőkből
    const parts: string[] = [];
    if (p.global) parts.push(String(p.global).trim());
    if (p.chapter) parts.push(String(p.chapter).trim());
    if (p.page) parts.push(String(p.page).trim());
    let base = parts.join(", ");
    if (p.negativePrompt) {
      base = `${base}, Negative: ${String(p.negativePrompt).trim()}`;
    }
    return base.trim();
  }
  return String(p).trim();
}

type UseImageCacheArgs = {
  enabled?: boolean;
  pageId: string;
  prompt: any; // lehet string vagy object is
  params?: Record<string, any>;
  styleProfile?: Record<string, any>;
  mode?: "draft" | "refine";
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  retryTrigger?: number;
  apiKey?: string;
  // ha később áthozod a GameState-ből, ide is jöhet:
  storySlug?: string;
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
  apiKey,
  storySlug = "default", // ⬅️ fontos: backend is ezt várta a tesztben
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

    // 🔴 ha korábban fail volt és nincs új retryTrigger, akkor ne induljunk újra
    if (hasFailedRef.current && retryTrigger === 0) return;

    // 🔽 itt laposítjuk a promptot, hogy a fetch-nek már mindig string menjen
    const normalizedPrompt = normalizePrompt(prompt);

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
          JSON.stringify({
            pageId,
            prompt: normalizedPrompt,
            params,
            styleProfile,
            seed,
            mode,
            storySlug,
          })
        );

        // ⬇️ Local cache check + HIT mérés
        const cacheKey = `image_${pageId}_${mode}`;
        const t0 = performance.now();
        const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
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

        // ⬇️ backend alap (pont ugyanaz, mint amit PowerShellből hívtál)
        const API_BASE =
          process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") || "http://127.0.0.1:8000";

        const body = {
          pageId,
          prompt: normalizedPrompt, // 🔴 innen már sosem megy object
          params,
          styleProfile,
          seed,
          promptKey,
          cache: true,
          format: "png",
          reuseExisting: true,
          mode,
          apiKey,
          storySlug, // ⬅️ ez kellett a tesztedben is
        };

        // ⬇️ Fetch + retry + MISS mérés
        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            const startNet = performance.now();

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
            );

            const fetchPromise = fetch(`${API_BASE}/api/generate-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            const res: any = (await Promise.race([fetchPromise, timeoutPromise])) as Response;

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (!isMounted) return;

            // === VÁLASZ FELDOLGOZÁSA ===
            const rawUrl: string | undefined = data?.url || data?.path;

            if (rawUrl) {
              let finalUrl = rawUrl as string;

              // ha a backend lokális fájlt ad vissza → rakjuk elé az API_BASE-et
              if (finalUrl.startsWith("/generated/")) {
                finalUrl = `${API_BASE}${finalUrl}`;
              } else if (!finalUrl.startsWith("http")) {
                // biztos ami biztos
                finalUrl = `${API_BASE}/${finalUrl.replace(/^\/+/, "")}`;
              }

              try {
                if (typeof window !== "undefined") {
                  localStorage.setItem(cacheKey, finalUrl);
                }
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
    retryTrigger,
    storySlug, // ha változik, új kép
  ]);

  return { imageUrl, loading, error };
}

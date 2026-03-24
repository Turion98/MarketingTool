import { useEffect, useRef, useState, useMemo } from "react";
import { getSeedForPage } from "./sessionSeeds";
import type {
  ImageCacheResult,
  ImageGenerateResponse,
  ImagePerfLog,
  ImagePromptInput,
  ImageRequestParams,
  ImageStyleProfile,
} from "./imageTypes";

const toHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${h >>> 0}`;
};

type PromptObjectWithFields = {
  combinedPrompt?: unknown;
  negativePrompt?: unknown;
  global?: unknown;
  chapter?: unknown;
  page?: unknown;
};

function asPromptObject(value: ImagePromptInput): PromptObjectWithFields | null {
  if (!value || typeof value !== "object") return null;
  return value as PromptObjectWithFields;
}

export function normalizeImagePromptInput(p: ImagePromptInput): string {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  const prompt = asPromptObject(p);
  if (prompt) {
    if (prompt.combinedPrompt) {
      const base = String(prompt.combinedPrompt).trim();
      return prompt.negativePrompt
        ? `${base}, Negative: ${String(prompt.negativePrompt).trim()}`
        : base;
    }
    const parts: string[] = [];
    if (prompt.global) parts.push(String(prompt.global).trim());
    if (prompt.chapter) parts.push(String(prompt.chapter).trim());
    if (prompt.page) parts.push(String(prompt.page).trim());
    let base = parts.join(", ");
    if (prompt.negativePrompt) {
      base = `${base}, Negative: ${String(prompt.negativePrompt).trim()}`;
    }
    return base.trim();
  }
  return String(p).trim();
}

type UseImageCacheArgs = {
  enabled?: boolean;
  pageId: string;
  prompt: ImagePromptInput;
  params?: ImageRequestParams;
  styleProfile?: ImageStyleProfile;
  mode?: "draft" | "refine";
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  retryTrigger?: number;
  apiKey?: string;
  // ha később áthozod a GameState-ből, ide is jöhet:
  storySlug?: string;
};

// ⬇️ Dev perf log (StoryPage dev-sorhoz)
let lastImagePerfLog: ImagePerfLog | null = null;
export function getLastImagePerfLog(): ImagePerfLog | null {
  return lastImagePerfLog;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Image request failed";
}

function asGeneratedResponse(value: unknown): ImageGenerateResponse | null {
  if (!value || typeof value !== "object") return null;
  return value as ImageGenerateResponse;
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
}: UseImageCacheArgs): ImageCacheResult {
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
    const normalizedPrompt = normalizeImagePromptInput(prompt);

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

            const res = (await Promise.race([fetchPromise, timeoutPromise])) as Response;

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = asGeneratedResponse(await res.json());
            if (!isMounted) return;

            // === VÁLASZ FELDOLGOZÁSA ===
            const rawUrl =
              typeof data?.url === "string"
                ? data.url
                : typeof data?.path === "string"
                ? data.path
                : undefined;

            if (rawUrl) {
              let finalUrl = rawUrl;

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
          } catch (err: unknown) {
            if (controller.signal.aborted) return;
            if (attempt === maxRetries) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, retryDelayMs));
            attempt++;
          }
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setLoading(false);
        setError(getErrorMessage(err));
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

// frontend/lib/preloadImage.ts
import { getSessionSeeds } from "./sessionSeeds";
import { getImageApiKey } from "./storage"; // helper, ha nincs, marad localStorage
import type {
  ImageGenerateResponse,
  ImagePromptInput,
  ImageRequestParams,
  ImageStyleProfile,
} from "./imageTypes";
import { normalizeImagePromptInput } from "./useImageCache";

const toHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return `${h >>> 0}`;
};

export async function preloadImage(
  pageId: string,
  prompt: ImagePromptInput,
  params: ImageRequestParams = {},
  styleProfile: ImageStyleProfile = {},
  mode: "draft" | "refine" = "draft"
): Promise<string | null> {
  // ✅ Közvetlen hívás, nem opcionális láncolás
  const imageApiKey = getImageApiKey() ?? localStorage.getItem("imageApiKey");
  if (!imageApiKey || !imageApiKey.trim()) {
    return null;
  }

  const normalizedPrompt = normalizeImagePromptInput(prompt);

  // Draft és refine külön cache kulccsal
  const cacheKey = `image_${pageId}_${mode}`;
  const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
  if (cached) return cached;

  // Determinisztikus seed
  const seeds = getSessionSeeds();
  const seed = seeds[Math.abs(parseInt(toHash(pageId), 10)) % seeds.length];

  const promptKey = toHash(
    JSON.stringify({ pageId, prompt: normalizedPrompt, params, styleProfile, seed, mode })
  );

  // Draft/refine külön timeout
  const timeoutMs = mode === "draft" ? 8000 : 15000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("preload timeout"), timeoutMs);

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? ""}/v1/image/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          pageId,
          prompt: normalizedPrompt,
          params,
          styleProfile,
          seed,
          promptKey,
          preload: true,
          mode, // fontos: backend így tudja, draft vagy refine
        }),
      }
    );

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as ImageGenerateResponse;
    const raw = data.file ?? data.url;
    if (!raw) return null;

    const finalUrl = raw.startsWith("/") ? raw : `/${raw}`;
    localStorage.setItem(cacheKey, finalUrl);
    return finalUrl;
  } catch (e) {
    console.error(`Preload image failed for ${pageId} [${mode}]:`, e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

"use client";

import { useEffect } from "react";

import type {
  ImagePromptInput,
  ImageRequestParams,
  ImageStyleProfile,
} from "../../lib/imageTypes";
import { preloadAudio } from "../../lib/audioCache";
import { normalizeImagePrompt } from "../../lib/gameStateHelpers";
import type { ImagePromptObj } from "../../lib/gameStateTypes";
import { preloadImage } from "../../lib/preloadImage";
import { fetchPageJsonCached } from "../../lib/story/fetchPageJson";

import { resolvePromptFragments } from "./storyPageText";
import type { FragmentBank } from "./storyPageTypes";

type FetchedAudioPlaylistItem = {
  src?: string;
  path?: string;
  narration?: string;
  file?: string;
};

type FetchedAudio = {
  mainNarration?: string;
  playlist?: FetchedAudioPlaylistItem[];
  background?: string;
};

type FetchedSfx = {
  file?: string;
};

type FetchedPageData = {
  id?: string;
  sfx?: FetchedSfx[];
  audio?: FetchedAudio & { sidePreloadPages?: string[] };
  imagePrompt?: string | ImagePromptObj | Record<string, unknown> | null;
  imageParams?: Record<string, unknown>;
  styleProfile?: Record<string, unknown>;
};

function normalizeNarrUrl(raw?: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  if (s.startsWith("assets/")) return `/${s.replace(/^assets\//, "assets/")}`;
  if (s.startsWith("audio/")) return `/assets/${s}`;
  return `/assets/audio/${s}`;
}

function asImagePrompt(
  value: FetchedPageData["imagePrompt"]
): string | ImagePromptObj | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value as ImagePromptObj;
  return undefined;
}

export function useStoryPagePreloads(params: {
  apiBase: string;
  storySrc?: string;
  derivedStoryId?: string;
  sidePreloadPages?: string[];
  preloadNextPages?: string[];
  registerAbort: (ac: AbortController) => void;
  normalizeSfxUrl: (raw?: string) => string | null;
  unlockedPlus: Set<string>;
  fragments: FragmentBank;
  globalFragments: FragmentBank;
}): void {
  const {
    apiBase,
    storySrc,
    derivedStoryId,
    sidePreloadPages,
    preloadNextPages,
    registerAbort,
    normalizeSfxUrl,
    unlockedPlus,
    fragments,
    globalFragments,
  } = params;

  useEffect(() => {
    if (!storySrc) return;
    if (!sidePreloadPages?.length) return;

    const controllers: AbortController[] = [];

    sidePreloadPages.forEach((pid) => {
      const ac = new AbortController();
      controllers.push(ac);
      registerAbort(ac);

      fetchPageJsonCached<FetchedPageData>(
        `${apiBase}/page/${pid}?src=${encodeURIComponent(storySrc)}`,
        {
          storyId: derivedStoryId,
          pageId: pid,
          ttlMs: 18 * 60_000,
          signal: ac.signal,
        }
      )
        .then((data) => {
          if (Array.isArray(data?.sfx)) {
            data.sfx.forEach((sfx) => {
              const url = normalizeSfxUrl(sfx?.file);
              if (!url) return;
              try {
                preloadAudio(url);
              } catch {}
            });
          }

          if (data?.audio?.mainNarration) {
            const url = normalizeNarrUrl(data.audio.mainNarration);
            if (url) {
              try {
                preloadAudio(url);
              } catch {}
            }
          }

          if (Array.isArray(data?.audio?.playlist)) {
            data.audio.playlist.forEach((item) => {
              const src = item?.src ?? item?.path ?? item?.narration ?? item?.file;
              const url = normalizeNarrUrl(src);
              if (!url) return;
              try {
                preloadAudio(url);
              } catch {}
            });
          }

          if (data?.audio?.background) {
            const url = normalizeNarrUrl(data.audio.background);
            if (url) {
              try {
                preloadAudio(url);
              } catch {}
            }
          }
        })
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            console.error(`Side preload error for ${pid}`, err);
          }
        });
    });

    return () => {
      controllers.forEach((controller) => {
        try {
          controller.abort();
        } catch {}
      });
    };
  }, [
    apiBase,
    storySrc,
    sidePreloadPages,
    registerAbort,
    derivedStoryId,
    normalizeSfxUrl,
  ]);

  useEffect(() => {
    if (!storySrc) return;
    if (!preloadNextPages?.length) return;

    const controllers: AbortController[] = [];

    preloadNextPages.forEach(async (nextId) => {
      const ac = new AbortController();
      controllers.push(ac);
      registerAbort(ac);

      try {
        const nextPageData = await fetchPageJsonCached<FetchedPageData>(
          `${apiBase}/page/${nextId}?src=${encodeURIComponent(storySrc)}`,
          {
            storyId: derivedStoryId,
            pageId: nextId,
            ttlMs: 18 * 60_000,
            signal: ac.signal,
          }
        );

        const imagePrompt = asImagePrompt(nextPageData?.imagePrompt);
        if (imagePrompt && nextPageData?.id) {
          const raw = normalizeImagePrompt(imagePrompt);
          const resolvedPrompt = resolvePromptFragments(
            raw.prompt || "",
            unlockedPlus,
            fragments,
            globalFragments
          );
          const resolvedNegative = resolvePromptFragments(
            raw.negative || "",
            unlockedPlus,
            fragments,
            globalFragments
          );

          const mergedParams: ImageRequestParams = {
            ...(nextPageData.imageParams || {}),
            negativePrompt:
              resolvedNegative || nextPageData.imageParams?.negativePrompt,
            seed:
              typeof raw.seed === "number"
                ? raw.seed
                : nextPageData.imageParams?.seed,
            styleProfile:
              raw.styleProfile ?? nextPageData.imageParams?.styleProfile,
          };

          const objectPrompt =
            imagePrompt && typeof imagePrompt === "object" ? imagePrompt : {};
          const promptForPreload: ImagePromptInput = {
            ...objectPrompt,
            combinedPrompt: resolvedPrompt,
            negativePrompt:
              resolvedNegative ??
              (typeof imagePrompt === "object"
                ? imagePrompt.negativePrompt ??
                  ("negative" in imagePrompt &&
                  typeof imagePrompt.negative === "string"
                    ? imagePrompt.negative
                    : undefined)
                : undefined),
          };

          await preloadImage(
            nextPageData.id,
            promptForPreload,
            mergedParams,
            (nextPageData.styleProfile || {}) as ImageStyleProfile,
            "draft"
          );
        }
      } catch (err: unknown) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error(`Preload fetch error for ${nextId}`, err);
        }
      }
    });

    return () => {
      controllers.forEach((controller) => {
        try {
          controller.abort();
        } catch {}
      });
    };
  }, [
    apiBase,
    storySrc,
    preloadNextPages,
    registerAbort,
    derivedStoryId,
    unlockedPlus,
    fragments,
    globalFragments,
  ]);
}

"use client";

import { useEffect, useMemo } from "react";
import type { MutableRefObject, ReactNode } from "react";

import GeneratedImage_with_fadein from "../GeneratedImage/GeneratedImage";
import MediaFrame from "../layout/MediaFrame/MediaFrame";
import ProfileCardFrame from "../layout/ProfileCardFrame/ProfileCardFrame";
import { isRuneId } from "../../lib/runeIcons";

import type { FragmentBank } from "./storyPageTypes";

type ReplayVisual = {
  imageId: string | null;
  durationMs: number;
};

type ImageTimingRecord = Record<string, unknown> & {
  generate?: boolean;
  mode?: "draft" | "refine";
};

type LayoutRecord = {
  mediaMode?: string;
};

type PlaylistItem = {
  src?: unknown;
  path?: unknown;
  narration?: unknown;
  file?: unknown;
  label?: unknown;
  gapAfterMs?: unknown;
  gapMs?: unknown;
  when?: { unlocked?: unknown } | null;
  unlocked?: unknown;
  ifUnlocked?: unknown;
};

type AudioRecord = {
  playlist?: PlaylistItem[];
  playMode?: "single" | "playlist";
  ducking?: {
    duckTo?: number;
    db?: number;
    attackMs?: number;
    releaseMs?: number;
    fadeMs?: number;
  };
};

type ReplayOverlayItem = {
  fragmentId?: string;
  imageId?: string;
  durationMs?: number;
};

type StoryPageMediaData = {
  id?: string;
  imageTiming?: ImageTimingRecord;
  layout?: LayoutRecord;
  audio?: AudioRecord;
  replayOverlay?: ReplayOverlayItem[];
};

type Measure = {
  content: { x: number; y: number; width: number; height: number };
};

type UseStoryPageMediaAudioParams = {
  pageData?: StoryPageMediaData | null;
  showFrame: boolean;
  isProfileCardPage: boolean;
  isFadingOut: boolean;
  logoUrl: string;
  shouldGenerate: boolean;
  resolvedPrompt?: string;
  effectiveImageParams: Record<string, unknown>;
  stableImageTiming: Record<string, unknown>;
  unlockedPlus: Set<string>;
  unlockedFragments: string[];
  fragments: FragmentBank;
  flags?: Set<string>;
  runePackForDisplay?: unknown;
  measure: Measure | null;
  anchorPortalRef: MutableRefObject<Measure["content"] | null>;
};

function pickReplayVisual(
  page: StoryPageMediaData | null | undefined,
  unlocked: string[] | Set<string>,
  bank: FragmentBank | undefined
): ReplayVisual {
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;
  const list = Array.isArray(page?.replayOverlay) ? page.replayOverlay : [];

  for (const item of list) {
    const { fragmentId, imageId, durationMs } = item || {};
    if (!fragmentId) continue;
    if (!unlockedSet.has(fragmentId)) continue;
    const chosenImage = imageId || bank?.[fragmentId]?.replayImageId || null;
    if (chosenImage) {
      return {
        imageId: chosenImage,
        durationMs: Number(durationMs ?? 1800),
      };
    }
  }

  for (const id of unlockedSet) {
    const replayImageId = bank?.[id as string]?.replayImageId;
    if (replayImageId) {
      return { imageId: replayImageId, durationMs: 1800 };
    }
  }

  return { imageId: null, durationMs: 1800 };
}

function toLinearFromDb(db?: number): number | undefined {
  return typeof db === "number" ? Math.pow(10, db / 20) : undefined;
}

export function useStoryPageMediaAudio({
  pageData,
  showFrame,
  isProfileCardPage,
  isFadingOut,
  logoUrl,
  shouldGenerate,
  resolvedPrompt,
  effectiveImageParams,
  stableImageTiming,
  unlockedPlus,
  unlockedFragments,
  fragments,
  flags,
  runePackForDisplay,
  measure,
  anchorPortalRef,
}: UseStoryPageMediaAudioParams): {
  mediaNode: ReactNode;
  narrationPlaylistMemo: Array<{ src: string; gapAfterMs: number; label?: string }>;
  playModeMemo: "single" | "playlist";
  duckingMemo: { duckTo?: number; attackMs?: number; releaseMs?: number };
  selectedReplay: ReplayVisual;
  unlockedRunes: string[];
  showRuneDock: boolean;
  anchorPortal: Measure["content"] | null;
} {
  const mediaNode = useMemo(() => {
    if (!showFrame) return null;
    if (!pageData?.id) return null;

    const pageId = pageData.id;
    const mode = pageData.imageTiming?.mode || "draft";

    if (isProfileCardPage) {
      return (
        <ProfileCardFrame
          pageId={pageId}
          pageIsFadingOut={isFadingOut}
          logoSrc={logoUrl}
        >
          <GeneratedImage_with_fadein
            pageId={pageId}
            prompt={shouldGenerate ? resolvedPrompt : undefined}
            params={effectiveImageParams}
            imageTiming={{
              ...stableImageTiming,
              generate: shouldGenerate,
            }}
            mode={mode}
            pageIsFadingOut={isFadingOut}
          />
        </ProfileCardFrame>
      );
    }

    return (
      <MediaFrame
        mode="image"
        pageId={pageId}
        pageIsFadingOut={isFadingOut}
        logoSrc={logoUrl}
      >
        <GeneratedImage_with_fadein
          pageId={pageId}
          prompt={shouldGenerate ? resolvedPrompt : undefined}
          params={effectiveImageParams}
          imageTiming={{
            ...stableImageTiming,
            generate: shouldGenerate,
          }}
          mode={mode}
          pageIsFadingOut={isFadingOut}
        />
      </MediaFrame>
    );
  }, [
    showFrame,
    pageData?.id,
    pageData?.imageTiming?.mode,
    isProfileCardPage,
    isFadingOut,
    logoUrl,
    shouldGenerate,
    resolvedPrompt,
    effectiveImageParams,
    stableImageTiming,
  ]);

  const narrationPlaylistMemo = useMemo(() => {
    const raw = Array.isArray(pageData?.audio?.playlist)
      ? pageData.audio.playlist
      : [];

    const passes = (item: PlaylistItem) => {
      const cond = item?.when?.unlocked ?? item?.unlocked ?? item?.ifUnlocked;
      if (!cond) return true;
      if (Array.isArray(cond)) {
        return cond.every((entry) => unlockedPlus.has(String(entry)));
      }
      return unlockedPlus.has(String(cond));
    };

    const pickSrc = (item: PlaylistItem) =>
      item?.src ?? item?.path ?? item?.narration ?? item?.file;

    return raw
      .filter(passes)
      .map((item) => ({
        src: String(pickSrc(item) ?? ""),
        gapAfterMs:
          typeof item?.gapAfterMs === "number"
            ? item.gapAfterMs
            : typeof item?.gapMs === "number"
              ? item.gapMs
              : 0,
        label: typeof item?.label === "string" ? item.label : undefined,
      }))
      .filter((item) => Boolean(item.src));
  }, [pageData?.audio?.playlist, unlockedPlus]);

  const playModeMemo = useMemo<"single" | "playlist">(() => {
    const playMode = pageData?.audio?.playMode;
    if (playMode === "playlist" && narrationPlaylistMemo.length > 0) {
      return "playlist";
    }
    return "single";
  }, [pageData?.audio?.playMode, narrationPlaylistMemo.length]);

  const duckingMemo = useMemo(() => {
    const ducking = pageData?.audio?.ducking || {};
    const duckTo =
      typeof ducking.duckTo === "number"
        ? Math.min(1, Math.max(0, ducking.duckTo))
        : toLinearFromDb(ducking.db);
    const attackMs = ducking.attackMs ?? ducking.fadeMs;
    const releaseMs = ducking.releaseMs ?? ducking.fadeMs;
    return { duckTo, attackMs, releaseMs };
  }, [pageData?.audio?.ducking]);

  const selectedReplay = useMemo(
    () => pickReplayVisual(pageData, unlockedFragments, fragments),
    [pageData, unlockedFragments, fragments]
  );

  const unlockedRunes = useMemo(
    () => Array.from(flags ?? new Set<string>()).filter(isRuneId),
    [flags]
  );

  const showRuneDock = useMemo(
    () => Boolean(runePackForDisplay) && unlockedRunes.length > 0,
    [runePackForDisplay, unlockedRunes]
  );

  const anchorPortal = useMemo(() => measure?.content ?? null, [measure]);

  useEffect(() => {
    anchorPortalRef.current = measure?.content ?? null;
  }, [measure, anchorPortalRef]);

  return {
    mediaNode,
    narrationPlaylistMemo,
    playModeMemo,
    duckingMemo,
    selectedReplay,
    unlockedRunes,
    showRuneDock,
    anchorPortal,
  };
}

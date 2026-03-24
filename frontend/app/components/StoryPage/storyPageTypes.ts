"use client";

import type {
  GameStateGlobals,
  NextSwitch,
  PageData as BasePageData,
} from "../../lib/gameStateTypes";

export type FragmentData = {
  text?: string;
  [k: string]: unknown;
};

export type FragmentBank = Record<
  string,
  FragmentData & {
    replayImageId?: string;
    [k: string]: unknown;
  }
>;

export type FragmentRef = { id: string; prefix?: string; suffix?: string };

export type TransitionVideoData = {
  id: string;
  type: "transition";
  transition: {
    kind: "video";
    src: string;
    srcWebm?: string;
    poster?: string;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    fadeInMs?: number;
    fadeOutMs?: number;
    skipAfterMs?: number;
    nextPageId: string;
    duckToVol?: number;
    attackMs?: number;
    releaseMs?: number;
    preloadNext?: boolean;
  };
};

export type PuzzleRiddle = {
  type: "puzzle";
  kind: "riddle";
  question: string;
  options: string[];
  correctIndex: number;
  correctLabel?: string;
  riddle?: { correctLabel?: string };
  onAnswer?: {
    setFlags?: string[] | Record<string, boolean>;
    setGlobals?: Record<string, string>;
    nextSwitch?:
      | string
      | {
          switch: string;
          cases: Record<string, string | null>;
          __default?: string | null;
          default?: string | null;
        };
  };
};

export type PuzzleRunesPage = {
  id: string;
  type: "puzzle";
  kind: "runes";
  prompt?: string;
  options: string[];
  answer?: string[];
  maxAttempts?: number;
  maxPick?: number;
  optionFlagsBase?: string;
  mode?: "ordered" | "set";
  feedback?: "keep" | "reset";
  onSuccess?: { goto: string; setFlags?: string[] | Record<string, boolean> };
  onFail?: { goto: string; setFlags?: string[] | Record<string, boolean> };
};

export type StoryPageRunePack = {
  mode?: "single" | "triple";
  icons?: string[];
  icon?: string;
  palette?: {
    active?: Array<string | null | undefined>;
    locked?: Array<string | null | undefined>;
  };
};

export type StoryPageGlobals = GameStateGlobals & {
  skin?: string;
  storySrc?: string;
  storyTitle?: string;
  score?: number | string;
  riddleCorrectLabel?: string;
  quiz?: { labels?: { correct?: string } };
  runePack?: StoryPageRunePack;
};

export type StoryPageData = BasePageData & {
  title?: string;
  next?: NextSwitch;
  layout?: { mediaMode?: string } & Record<string, unknown>;
  imageTiming?: BasePageData["imageTiming"] & {
    staticImage?: string;
    existingImageId?: string;
    imageId?: string;
  };
  audio?: {
    playlist?: Array<{
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
    }>;
    playMode?: "single" | "playlist";
    ducking?: {
      duckTo?: number;
      db?: number;
      attackMs?: number;
      releaseMs?: number;
      fadeMs?: number;
    };
    background?: string;
    mainNarration?: string;
    sidePreloadPages?: string[];
  };
  unlockRunes?: string[];
  overlayRunesOnEnter?: boolean;
  correctLabel?: string;
  riddle?: { correctLabel?: string };
  endAlias?: string;
  replayOverlay?: Array<{
    fragmentId?: string;
    imageId?: string;
    durationMs?: number;
  }>;
};

"use client";

export type NextSwitch =
  | string
  | { switch: string; cases: Record<string, string>; default?: string };

export type ImagePromptObj = {
  global?: string;
  chapter?: string;
  page?: string;
  combinedPrompt?: string;
  negativePrompt?: string;
  styleProfile?: string;
  seed?: number;
};

export type PageData = {
  id: string;
  type?: string;
  startPageId?: string;
  profile?: {
    name?: string;
    title?: string;
    subtitle?: string;
    tagline?: string;
    role?: string;
    extra?: string;
    meta?: string;
  };
  text?: string | unknown[];
  next?: NextSwitch;
  choices?: unknown[];
  layout?: unknown;
  imagePrompt?: string | ImagePromptObj | null;
  effectiveImagePrompt?: {
    global?: string;
    chapter?: string;
    page?: string;
    negativePrompt?: string;
  };
  effectiveImagePromptString?: string;
  imagePromptMerge?: {
    include?: string[];
    exclude?: string[];
  };
  imageTiming?: {
    generate?: boolean;
    preloadNextPages?: string[];
    delayMs?: number;
    mode?: "draft" | "refine";
  };
  imageParams?: Record<string, unknown>;
  audio?: unknown;
  replayImage?: unknown;
  replayOverlay?: unknown;
  voicePrompt?:
    | {
        prompt: string;
        voice?: string;
        style?: string;
      }
    | null;
  styleProfile?: Record<string, unknown>;
  sfx?: { file: string; time: number }[];
  fragmentsGlobal?: FragmentBank;
  unlockFragments?: string[];
  unlockEnterFragments?: string[];
  fragmentRefs?: Array<{ id: string; prefix?: string; suffix?: string }>;
  fragmentRecall?:
    | { id?: string; textFallback?: string }
    | Array<{ id?: string; textFallback?: string }>;
  onAnswer?: {
    nextSwitch?: {
      switch: string;
      cases: Record<string, string>;
      __default?: string;
      default?: string;
    };
  };
  logic?: {
    ifHasFragment?: { fragment: string; goTo: string }[];
    elseGoTo?: string;
  };
  needsFragment?: string[];
  needsFragmentAny?: string[];
};

export type FragmentData = {
  text?: string;
  image?: unknown;
  replayImageId?: string;
  createdAt?: number;
};

export type FragmentBank = Record<string, FragmentData>;

export type ProgressDisplay = {
  value: number;
  label?: string;
  milestones: Array<{ x: number; label?: string }>;
};

export type RuneChoice = { mode: "single" | "triple"; icons: string[] };
export type GameStateGlobals = Record<string, unknown>;

export type GameStateContextType = {
  voiceApiKey?: string;
  setVoiceApiKey?: (key: string) => void;
  imageApiKey?: string;
  setImageApiKey?: (key: string) => void;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  ensureRunOnStart?: () => string | undefined;
  unlockedFragments: string[];
  setUnlockedFragments: (tags: string[]) => void;
  unlockFragment: (idOrIds: string | string[]) => void;
  hasUnlocked: (id: string) => boolean;
  fragments: Record<string, FragmentData>;
  addFragment: (id: string, data: FragmentData) => void;
  globalFragments: FragmentBank;
  flags: Set<string>;
  setFlag: (id: string) => void;
  clearFlag: (id: string) => void;
  hasFlag: (id: string) => boolean;
  globals: GameStateGlobals;
  setGlobal: (key: string, value: unknown) => void;
  setStorySrc?: (src: string) => void;
  imagesByFlag: Record<string, string>;
  setRuneImage: (flagId: string, url: string) => void;
  clearRuneImage: (flagId: string) => void;
  currentPageId: string;
  setCurrentPageId: (id: string) => void;
  currentPageData?: PageData | null;
  goToNextPage: (nextPageId: string) => void;
  handleAnswer?: (
    page: PageData,
    res: { correct: boolean; choiceIdx: number; elapsedMs: number }
  ) => void;
  storyId?: string;
  sessionId?: string;
  runId?: string;
  globalError: string | null;
  setGlobalError: (msg: string | null) => void;
  isMuted: boolean;
  setIsMuted: (value: boolean) => void;
  audioRestartToken: number;
  triggerAudioRestart: () => void;
  resetGame: () => void;
  registerAbort: (ac: AbortController) => void;
  registerTimeout: (id: number) => void;
  clearAllTimeouts?: () => void;
  registerAudio: (el: HTMLAudioElement) => void;
  setUiLocked?: (value: boolean) => void;
  preloadNextPages?: (pageIds: string[]) => void;
  visitedPages: Set<string>;
  progressValue: number;
  progressDisplay: ProgressDisplay;
  rewardImageReady: boolean;
  setRewardImageReady: (ready: boolean) => void;
  registerRewardFrame: (el: HTMLDivElement | null) => void;
  downloadRewardImage: () => void;
};

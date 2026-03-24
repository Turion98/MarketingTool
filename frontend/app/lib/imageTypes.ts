"use client";

import type { CSSProperties } from "react";

export type ImagePromptObject = {
  combinedPrompt?: unknown;
  negativePrompt?: unknown;
  negative?: unknown;
  global?: unknown;
  chapter?: unknown;
  page?: unknown;
  styleProfile?: unknown;
  seed?: unknown;
};

export type ImagePromptInput =
  | string
  | ImagePromptObject
  | null
  | undefined;

export type ImageRequestParams = Record<string, unknown>;
export type ImageStyleProfile = Record<string, unknown>;

export type ImageCacheResult = {
  imageUrl?: string;
  loading: boolean;
  error: string | null;
};

export type ImagePerfLog = {
  key: string;
  url?: string;
  hit: boolean;
  ms: number;
};

export type ImageGenerateResponse = {
  url?: string;
  path?: string;
  file?: string;
};

export type ImageRootVars = CSSProperties & {
  "--gi-fit"?: string;
};

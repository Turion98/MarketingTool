"use client";

import type { ImagePromptObj, PageData, RuneChoice } from "./gameStateTypes";

export function sanitizePageId(x: string | null | undefined): string {
  const value = (x ?? "").trim();
  if (!value || value === "feedback" || value === "__END__") return "landing";
  return value;
}

export function normalizeImagePrompt(
  promptInput?: string | ImagePromptObj | null
): {
  prompt: string | undefined;
  negative?: string;
  styleProfile?: string;
  seed?: number;
} {
  if (!promptInput) return { prompt: undefined };

  if (typeof promptInput === "string") {
    const trimmed = promptInput.trim();
    return { prompt: trimmed.length ? trimmed : undefined };
  }

  const prompt =
    promptInput.combinedPrompt ||
    [promptInput.global, promptInput.chapter, promptInput.page]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    undefined;

  const extendedPrompt = promptInput as ImagePromptObj & { negative?: string };
  const negative = extendedPrompt.negativePrompt ?? extendedPrompt.negative ?? undefined;

  return {
    prompt,
    negative,
    styleProfile: promptInput.styleProfile || undefined,
    seed: typeof promptInput.seed === "number" ? promptInput.seed : undefined,
  };
}

export function resolveNextFromPage(
  page?: PageData | null,
  globals: Record<string, string> = {}
): string | null {
  if (!page?.next) return null;
  if (typeof page.next === "string") return page.next;

  const key = page.next.switch;
  const value = (globals?.[key] ?? "").toString();
  return page.next.cases?.[value] ?? page.next.default ?? null;
}

export function deriveStoryId(globals: Record<string, unknown>): string | undefined {
  const direct = globals?.storyId;
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (trimmed) return trimmed;
  }

  const src = typeof globals?.storySrc === "string" ? globals.storySrc : "";
  if (src) {
    try {
      const last = src.split("/").pop() || "";
      const base = last.replace(/\.[a-z0-9]+$/i, "");
      if (base) return base;
    } catch {}
  }

  const title = typeof globals?.storyTitle === "string" ? globals.storyTitle : "";
  if (title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
  }
  return undefined;
}

export const DEFAULT_RUNE_SINGLE = ["ring"];
export const DEFAULT_RUNE_TRIPLE = ["ring", "arc", "dot"];
export const PROGRESS_TAIL_BUFFER = 4;

export function normalizeRuneChoice(input?: Partial<RuneChoice> | null): RuneChoice {
  const mode = input?.mode === "triple" ? "triple" : "single";
  const raw = Array.isArray(input?.icons) ? input.icons.filter(Boolean) : [];
  if (mode === "single") {
    return { mode, icons: raw.length ? [raw[0]] : DEFAULT_RUNE_SINGLE };
  }
  const icons = raw.slice(0, 3);
  return { mode, icons: icons.length ? icons : DEFAULT_RUNE_TRIPLE };
}

export function parseRuneChoiceFromQuery(): RuneChoice | null {
  if (typeof window === "undefined") return null;
  const searchParams = new URLSearchParams(window.location.search);
  const modeParam = (searchParams.get("runemode") || searchParams.get("runeMode") || "").toLowerCase();
  const listParam = searchParams.get("runes") || "";
  if (!modeParam && !listParam) return null;

  const mode: "single" | "triple" = modeParam === "triple" ? "triple" : "single";
  const icons = listParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return normalizeRuneChoice({ mode, icons });
}

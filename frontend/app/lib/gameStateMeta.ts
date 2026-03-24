"use client";

import { normalizeProgressMilestones } from "./gameStateProgress";
import { getPublicApiBase } from "./publicApiBase";
import type { ProgressDisplay } from "./gameStateTypes";

type StoryMetaRecord = Record<string, unknown>;

function asRecord(value: unknown): StoryMetaRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as StoryMetaRecord;
}

export function buildStoryMetaUrl(storySrc: string): string {
  const normalizedSrc = storySrc.replace(/^\/?stories\//, "/stories/");
  const base = normalizedSrc.startsWith("http")
    ? normalizedSrc
    : `${getPublicApiBase()}${normalizedSrc.startsWith("/") ? normalizedSrc : `/${normalizedSrc}`}`;
  const cacheBust = base.includes("?") ? `&v=${Date.now()}` : `?v=${Date.now()}`;
  return `${base}${cacheBust}`;
}

export function applyStoryMetaToState(params: {
  meta: unknown;
  setGlobal: (key: string, value: unknown) => void;
  setProgressDisplay?: (display: ProgressDisplay) => void;
}): boolean {
  const meta = asRecord(params.meta);
  if (!meta) return false;

  params.setGlobal("meta", meta);
  if (typeof meta.ctaPresets !== "undefined") params.setGlobal("ctaPresets", meta.ctaPresets);
  if (typeof meta.endDefaultCta !== "undefined") {
    params.setGlobal("endDefaultCta", meta.endDefaultCta);
  }
  if (typeof meta.title === "string") params.setGlobal("storyTitle", meta.title);
  if (typeof meta.id === "string") params.setGlobal("storyId", meta.id);

  try {
    localStorage.setItem("storyMetaCache", JSON.stringify(meta));
  } catch {}

  if (params.setProgressDisplay) {
    params.setProgressDisplay({
      value: 0,
      milestones: normalizeProgressMilestones(asRecord(meta.progress)?.milestones),
    });
  }

  return true;
}

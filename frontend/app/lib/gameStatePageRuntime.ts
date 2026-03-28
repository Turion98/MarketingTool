"use client";

import type { FragmentBank, PageData } from "./gameStateTypes";
import { getClientFetchApiBase } from "./publicApiBase";

type PageRuntimeDecision =
  | { kind: "ok" }
  | { kind: "redirect"; pageId: string }
  | { kind: "blocked" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && !!entry);
}

function flattenFragmentBank(value: unknown): FragmentBank {
  const srcBank = asRecord(value);
  if (!srcBank) return {};

  const recall = asRecord(srcBank.recall) ?? {};
  const saved = asRecord(srcBank.saved) ?? {};
  const fragments = asRecord(srcBank.fragments) ?? {};
  const merged =
    Object.keys(recall).length || Object.keys(saved).length || Object.keys(fragments).length
      ? { ...recall, ...saved, ...fragments, ...srcBank }
      : srcBank;

  const result: FragmentBank = {};
  Object.entries(merged).forEach(([key, entry]) => {
    const record = asRecord(entry);
    if (!record) return;
    result[key] = {
      text: typeof record.text === "string" ? record.text : undefined,
      replayImageId:
        typeof record.replayImageId === "string" ? record.replayImageId : undefined,
      createdAt: typeof record.createdAt === "number" ? record.createdAt : undefined,
    };
  });
  return result;
}

export function buildPageRequestUrl(pageId: string, storySrc: string): string {
  const base = getClientFetchApiBase();
  return `${base}/page/${encodeURIComponent(pageId)}?src=${encodeURIComponent(storySrc)}`;
}

export function resolvePageRuntimeDecision(
  raw: unknown,
  unlockedFragments: string[]
): PageRuntimeDecision {
  const page = asRecord(raw);
  if (!page) return { kind: "ok" };

  const logic = asRecord(page.logic);
  const ifHasFragment = Array.isArray(logic?.ifHasFragment) ? logic.ifHasFragment : [];
  for (const entry of ifHasFragment) {
    const cond = asRecord(entry);
    const fragment = typeof cond?.fragment === "string" ? cond.fragment : undefined;
    const goTo = typeof cond?.goTo === "string" ? cond.goTo : undefined;
    if (fragment && goTo && unlockedFragments.includes(fragment)) {
      return { kind: "redirect", pageId: goTo };
    }
  }

  const elseGoTo = typeof logic?.elseGoTo === "string" ? logic.elseGoTo : undefined;
  if (ifHasFragment.length || elseGoTo) {
    if (elseGoTo) return { kind: "redirect", pageId: elseGoTo };
  }

  const needsAll = readStringArray(page.needsFragment);
  const needsAny = readStringArray(page.needsFragmentAny);

  if (needsAll.some((fragment) => !unlockedFragments.includes(fragment))) {
    return { kind: "blocked" };
  }

  if (needsAny.length && !needsAny.some((fragment) => unlockedFragments.includes(fragment))) {
    return { kind: "blocked" };
  }

  return { kind: "ok" };
}

export function normalizeFetchedPage(raw: unknown): PageData {
  const page = asRecord(raw) ?? {};
  const audio = asRecord(page.audio);
  const flatFragments = flattenFragmentBank(page.fragmentsGlobal ?? page.fragments);

  return {
    ...(page as PageData),
    audio: {
      ...audio,
      text: typeof page.text === "string" ? page.text : "",
      background: audio?.background ?? audio?.bg ?? null,
      mainNarration: audio?.mainNarration ?? audio?.main ?? null,
      sidePreloadPages: readStringArray(audio?.sidePreloadPages),
    },
    voicePrompt: asRecord(page.voicePrompt ?? page.tts) as PageData["voicePrompt"],
    fragmentsGlobal: Object.keys(flatFragments).length ? flatFragments : undefined,
    unlockEnterFragments: readStringArray(page.unlockEnterFragments),
  };
}

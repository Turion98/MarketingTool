"use client";

import type { EditorPageCategory } from "./storyPagesFlatten";
import {
  collectStoryPageIds,
  getStartPageIdFromStory,
} from "./findPageInStory";

export type StoryTemplateKey =
  | "linear"
  | "oneChoice"
  | "multiChoice"
  | "logic"
  | "riddle"
  | "runes";

function defaultNextTarget(story: Record<string, unknown>): string {
  const s = getStartPageIdFromStory(story);
  if (s) return s;
  const ids = collectStoryPageIds(story);
  return ids[0] ?? "start";
}

function buildTemplatePageByKey(
  key: StoryTemplateKey,
  nid: string,
  next: string
): Record<string, unknown> {
  switch (key) {
    case "linear":
      return {
        id: nid,
        text: "Új lineáris oldal (szerkeszd a szöveget és a következő oldalt).",
        next,
      };
    case "oneChoice":
      return {
        id: nid,
        text: "Új oldal — egy választás.",
        choices: [
          {
            id: `${nid}_opt1`,
            text: "Tovább",
            next,
          },
        ],
      };
    case "multiChoice":
      return {
        id: nid,
        text: "Új oldal — több választás.",
        choices: [
          { id: `${nid}_a`, text: "A opció", next },
          { id: `${nid}_b`, text: "B opció", next },
        ],
      };
    case "logic":
      return {
        id: nid,
        type: "logic",
        logic: [{ default: next }],
      };
    case "riddle":
      return {
        id: nid,
        type: "puzzle",
        kind: "riddle",
        question: "Kérdés?",
        options: ["Helyes", "Hibás"],
        correctIndex: 0,
        onAnswer: {
          nextSwitch: next,
        },
      };
    case "runes":
      return {
        id: nid,
        type: "puzzle",
        kind: "runes",
        prompt: "Válaszd ki a helyes szimbólumokat.",
        options: ["alfa", "béta", "gamma"],
        answer: ["alfa"],
        maxPick: 1,
        onSuccess: { goto: next },
        onFail: { goto: next },
      };
    default:
      return { id: nid, text: "Új oldal", next };
  }
}

export function appendPageToStory(
  story: Record<string, unknown>,
  page: Record<string, unknown>
): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(story)) as Record<string, unknown>;
  const nid = typeof page.id === "string" ? page.id : "";
  if (!nid) return copy;
  const pages = copy.pages;

  if (Array.isArray(pages)) {
    copy.pages = [...pages, page];
  } else if (pages && typeof pages === "object" && !Array.isArray(pages)) {
    copy.pages = { ...(pages as Record<string, unknown>), [nid]: page };
  } else {
    copy.pages = [page];
  }

  return copy;
}

/** Új, minimálisan kitöltött oldal a szerkesztői kategória szerint (vászon + sablon). */
export function buildEmptyPageForCategory(
  category: EditorPageCategory,
  story: Record<string, unknown>
): Record<string, unknown> {
  const next = defaultNextTarget(story);
  const nid = `new_${Date.now()}`;

  switch (category) {
    case "narrative1":
      return buildTemplatePageByKey("oneChoice", nid, next);
    case "narrativeN":
      return buildTemplatePageByKey("multiChoice", nid, next);
    case "puzzleRiddle":
      return buildTemplatePageByKey("riddle", nid, next);
    case "puzzleRunes":
      return buildTemplatePageByKey("runes", nid, next);
    case "logic":
      return buildTemplatePageByKey("logic", nid, next);
    case "conditionalRouting":
      return {
        id: nid,
        type: "conditionalRouting",
        text: "Új feltételes routing (szerkeszd a nextSwitch szabályokat).",
        nextSwitch: [{ ifNone: [], goto: next }],
      };
    case "transition":
      return {
        id: nid,
        type: "transition",
        transition: {
          kind: "video",
          src: "",
          poster: "",
          autoplay: false,
          muted: true,
          loop: false,
          fadeInMs: 200,
          fadeOutMs: 200,
          nextPageId: next,
        },
      };
    case "other":
    default:
      return buildTemplatePageByKey("linear", nid, next);
  }
}

export function insertStoryTemplate(
  story: Record<string, unknown>,
  key: StoryTemplateKey
): Record<string, unknown> {
  const next = defaultNextTarget(story);
  const nid = `new_${Date.now()}`;
  const page = buildTemplatePageByKey(key, nid, next);
  return appendPageToStory(story, page);
}

export const TEMPLATE_LABELS: Record<StoryTemplateKey, string> = {
  linear: "Lineáris (next)",
  oneChoice: "Egy választás",
  multiChoice: "Több választás",
  logic: "Logic (default ág)",
  riddle: "Riddle puzzle",
  runes: "Runes puzzle",
};

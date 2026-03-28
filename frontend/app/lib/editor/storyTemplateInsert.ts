"use client";

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

export function insertStoryTemplate(
  story: Record<string, unknown>,
  key: StoryTemplateKey
): Record<string, unknown> {
  const next = defaultNextTarget(story);
  const nid = `new_${Date.now()}`;
  let page: Record<string, unknown>;

  switch (key) {
    case "linear":
      page = {
        id: nid,
        text: "Új lineáris oldal (szerkeszd a szöveget és a következő oldalt).",
        next,
      };
      break;
    case "oneChoice":
      page = {
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
      break;
    case "multiChoice":
      page = {
        id: nid,
        text: "Új oldal — több választás.",
        choices: [
          { id: `${nid}_a`, text: "A opció", next },
          { id: `${nid}_b`, text: "B opció", next },
        ],
      };
      break;
    case "logic":
      page = {
        id: nid,
        type: "logic",
        logic: [{ default: next }],
      };
      break;
    case "riddle":
      page = {
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
      break;
    case "runes":
      page = {
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
      break;
    default:
      page = { id: nid, text: "Új oldal", next };
  }

  const copy = JSON.parse(JSON.stringify(story)) as Record<string, unknown>;
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

export const TEMPLATE_LABELS: Record<StoryTemplateKey, string> = {
  linear: "Lineáris (next)",
  oneChoice: "Egy választás",
  multiChoice: "Több választás",
  logic: "Logic (default ág)",
  riddle: "Riddle puzzle",
  runes: "Runes puzzle",
};

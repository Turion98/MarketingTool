"use client";

import type { EditorPageCategory } from "./storyPagesFlatten";

export type StoryTemplateKey =
  | "linear"
  | "oneChoice"
  | "multiChoice"
  | "logic"
  | "riddle"
  | "runes"
  | "end";

/** Szerkesztő: még át nem nevezett új oldal — kötelező ID megadás, különben elvetjük. */
export const EDITOR_PENDING_PAGE_PREFIX = "__editor_pending_" as const;

export function isEditorPendingPageId(pageId: string): boolean {
  return pageId.startsWith(EDITOR_PENDING_PAGE_PREFIX);
}

export function createPendingPageId(): string {
  const u =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${EDITOR_PENDING_PAGE_PREFIX}${u}`;
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
        text: "Lineáris oldal: írd át a szöveget, majd állítsd be a következő oldal ID-ját (next).",
        next,
      };
    case "oneChoice":
      return {
        id: nid,
        text: "Egyválaszos oldal: egy gomb / opció, ami a következő lapra visz.",
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
        text: "Többválaszos oldal: minden gomb más-más következő oldalra mutathat.",
        choices: [
          { id: `${nid}_a`, text: "A opció", next },
          { id: `${nid}_b`, text: "B opció", next },
        ],
      };
    case "logic":
      return {
        id: nid,
        type: "logic",
        title: "Új logic routing",
        logic: [],
      };
    case "riddle":
      return {
        id: nid,
        type: "puzzle",
        kind: "riddle",
        question: "Írd ide a kvíz kérdését.",
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
        prompt: "Instrukció a játékosnak: mit kell kiválasztania.",
        options: ["alfa", "béta", "gamma"],
        answer: ["alfa"],
        maxPick: 1,
        onSuccess: { goto: next },
        onFail: { goto: next },
      };
    case "end":
      return {
        id: nid,
        type: "end",
        title: "Új végoldal",
        text: [
          {
            text: "Köszönő / záró szöveg — a jobb oldali panelben szerkesztheted.",
          },
        ],
        endMeta: {
          cta: "default",
        },
      };
    default:
      return { id: nid, text: "Új oldal — töltsd ki a tartalmat.", next };
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
  _story: Record<string, unknown>
): Record<string, unknown> {
  const next = "";
  const nid = createPendingPageId();

  switch (category) {
    case "narrative1":
      return buildTemplatePageByKey("oneChoice", nid, next);
    case "narrativeN":
      return buildTemplatePageByKey("multiChoice", nid, next);
    case "puzzleRiddle":
      return buildTemplatePageByKey("riddle", nid, next);
    case "puzzleRunes":
      return buildTemplatePageByKey("runes", nid, next);
    case "puzzleRoute":
      return {
        id: nid,
        type: "puzzleRoute",
        title: "Puzzle route",
        puzzleSourcePageId: "",
        routeAssignments: {},
      };
    case "scorecard":
      return {
        id: nid,
        type: "scorecard",
        title: "Scorecard",
        text: [
          {
            text: "Scorecard: itt írd le a rövid szöveget; a szabályok a logic blokkban következnek.",
          },
        ],
        logic: [],
      };
    case "logic":
      return buildTemplatePageByKey("logic", nid, next);
    case "conditionalRouting":
      return {
        id: nid,
        type: "conditionalRouting",
        text: "Feltételes routing: a nextSwitch tömbben sorold fel, mikor melyik oldal következzen.",
        nextSwitch: [{ ifNone: [], goto: next }],
      };
    case "decision":
      return {
        id: nid,
        type: "decision",
        title: "Decision",
        poolId: "",
        routeAssignments: {},
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
    case "end":
      return buildTemplatePageByKey("end", nid, next);
    case "other":
    default:
      return buildTemplatePageByKey("linear", nid, next);
  }
}

export function insertStoryTemplate(
  story: Record<string, unknown>,
  key: StoryTemplateKey
): Record<string, unknown> {
  const nid = createPendingPageId();
  const page = buildTemplatePageByKey(key, nid, "");
  return appendPageToStory(story, page);
}

export const TEMPLATE_LABELS: Record<StoryTemplateKey, string> = {
  linear: "Lineáris lap (egyenes next)",
  oneChoice: "Egy gombos narratív",
  multiChoice: "Több gombos narratív",
  logic: "Logic (feltételek és ugrás)",
  riddle: "Riddle kvíz",
  runes: "Runes szimbólum puzzle",
  end: "Végoldal CTA-val",
};

"use client";

import {
  collectStoryPageIds,
  findPageInStoryDocument,
  getStartPageIdFromStory,
} from "./findPageInStory";
import { findRiddleChainContext } from "./editorCanvasCluster";
import {
  collectRiddleNextTargets,
  collectRiddleNextTargetsInOrder,
} from "./storyGraph";
import { isEditorLogicPage } from "./storyPagesFlatten";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export type PageValidationIssue = { path: string; message: string };

export function validatePage(
  story: Record<string, unknown>,
  pageId: string,
  knownIds: Set<string>
): PageValidationIssue[] {
  const issues: PageValidationIssue[] = [];
  const page = findPageInStoryDocument(story, pageId);
  if (!page) {
    issues.push({ path: "id", message: "Az oldal nem található a sztoriban." });
    return issues;
  }

  const choices = Array.isArray(page.choices) ? page.choices : [];
  const logic = asRecord(page.logic);
  const isPuzzle = page.type === "puzzle";

  if (!readString(page.id)) {
    issues.push({ path: "id", message: "Hiányzó oldalazonosító." });
  }

  const pageRec = page as Record<string, unknown>;
  if (
    pageRec.saveMilestone === true &&
    !isEditorLogicPage(pageRec)
  ) {
    const pid = readString(page.id);
    if (pid) {
      const doneId = `${pid}_DONE`;
      const bank = asRecord(story.fragments);
      if (!bank || !(doneId in bank)) {
        issues.push({
          path: "saveMilestone",
          message: `${doneId}: még nincs a fragment bankban; mentéskor létrejön.`,
        });
      }
    }
  }

  if (isPuzzle && page.kind === "riddle") {
    const q = readString(page.question);
    if (!q) {
      issues.push({ path: "question", message: "Riddle: hiányzó kérdés." });
    }
    const opts = Array.isArray(page.options) ? page.options : [];
    const optStrs = opts.filter((x): x is string => typeof x === "string" && !!x);
    if (optStrs.length < 2) {
      issues.push({
        path: "options",
        message: "Riddle: legalább két választási lehetőség kell.",
      });
    }
    const ci = page.correctIndex;
    if (
      typeof ci !== "number" ||
      ci < 0 ||
      (optStrs.length > 0 && ci >= optStrs.length)
    ) {
      issues.push({
        path: "correctIndex",
        message: "Riddle: érvénytelen helyes válasz index.",
      });
    }
    const chainCtx = findRiddleChainContext(story, pageId);
    if (chainCtx && !chainCtx.isLast) {
      const expectNext = chainCtx.rowIds[chainCtx.pageIndex + 1];
      const ordered = collectRiddleNextTargetsInOrder(page);
      if (
        ordered.length > 0 &&
        ordered.some((t) => t !== expectNext)
      ) {
        issues.push({
          path: "onAnswer.nextSwitch",
          message: `Riddle lánc: minden válasz opciónak „${expectNext}” felé kell mutatnia.`,
        });
      }
    }
    if (chainCtx?.isLast) {
      const onA = asRecord(page.onAnswer);
      const sw = asRecord(onA?.nextSwitch);
      if (sw?.switch !== "score") {
        issues.push({
          path: "onAnswer.nextSwitch.switch",
          message:
            'Riddle lánc (utolsó kérdés): a switch értéke "score" legyen.',
        });
      }
      const cases = asRecord(sw?.cases);
      const n = chainCtx.rowIds.length;
      for (let i = 0; i <= n; i++) {
        const dest = readString(cases?.[String(i)]);
        if (!dest) {
          issues.push({
            path: `onAnswer.nextSwitch.cases.${i}`,
            message: `Hiányzó cél a ${i} pontértékhez.`,
          });
        }
      }
      if (!readString(cases?.__default)) {
        issues.push({
          path: "onAnswer.nextSwitch.cases.__default",
          message: "Hiányzó __default ág (pl. újrapróbálkozás).",
        });
      }
    }

    const targets = collectRiddleNextTargets(page);
    if (targets.length === 0) {
      issues.push({
        path: "onAnswer.nextSwitch",
        message: "Riddle: hiányzó következő oldal (nextSwitch / ágak).",
      });
    }
    for (const t of targets) {
      if (!knownIds.has(t)) {
        issues.push({
          path: "onAnswer.nextSwitch",
          message: `Ismeretlen oldal: "${t}"`,
        });
      }
    }
  } else if (isPuzzle) {
    const onSuccess = asRecord(page.onSuccess);
    const onFail = asRecord(page.onFail);
    const ok = readString(onSuccess?.goto);
    const fail = readString(onFail?.goto);
    if (ok && !knownIds.has(ok)) {
      issues.push({
        path: "onSuccess.goto",
        message: `Ismeretlen oldal: "${ok}"`,
      });
    }
    if (fail && !knownIds.has(fail)) {
      issues.push({
        path: "onFail.goto",
        message: `Ismeretlen oldal: "${fail}"`,
      });
    }
    if (!ok) {
      issues.push({
        path: "onSuccess.goto",
        message: "Puzzle (runes): hiányzó sikeres ugrás.",
      });
    }
    if (!fail) {
      issues.push({
        path: "onFail.goto",
        message: "Puzzle (runes): hiányzó sikertelen / újra ugrás.",
      });
    }
  } else if (logic) {
    const ifHas = Array.isArray(logic.ifHasFragment) ? logic.ifHasFragment : [];
    for (let i = 0; i < ifHas.length; i++) {
      const row = asRecord(ifHas[i]);
      const go = readString(row?.goTo);
      const frag = readString(row?.fragment);
      if (!frag) {
        issues.push({
          path: `logic.ifHasFragment[${i}].fragment`,
          message: "Logic ág: hiányzó fragment.",
        });
      }
      if (!go) {
        issues.push({
          path: `logic.ifHasFragment[${i}].goTo`,
          message: "Logic ág: hiányzó cél oldal.",
        });
      } else if (!knownIds.has(go)) {
        issues.push({
          path: `logic.ifHasFragment[${i}].goTo`,
          message: `Ismeretlen oldal: "${go}"`,
        });
      }
    }
    const elseGo = readString(logic.elseGoTo);
    if (!elseGo && ifHas.length > 0) {
      issues.push({
        path: "logic.elseGoTo",
        message: "Logic: hiányzó elseGoTo (kötelező, ha van ifHasFragment).",
      });
    }
    if (elseGo && !knownIds.has(elseGo)) {
      issues.push({
        path: "logic.elseGoTo",
        message: `Ismeretlen oldal: "${elseGo}"`,
      });
    }
  } else {
    for (let i = 0; i < choices.length; i++) {
      const c = asRecord(choices[i]);
      const label = readString(c?.text) ?? readString(c?.label) ?? `#${i}`;
      const next = readString(c?.next);
      if (!next || !next.trim()) {
        issues.push({
          path: `choices[${i}].next`,
          message: `Opció "${label}": hiányzó következő oldal.`,
        });
      } else if (!knownIds.has(next)) {
        issues.push({
          path: `choices[${i}].next`,
          message: `Opció "${label}": ismeretlen oldal "${next}".`,
        });
      }
    }
    if (choices.length === 0 && !isPuzzle && !logic) {
      const hasEnd = page.type === "end";
      if (!hasEnd) {
        issues.push({
          path: "choices",
          message: "Nincs választás és nem puzzle/logic/end — hiányzó ágazás.",
        });
      }
    }
  }

  return issues;
}

export function validateStoryPages(
  story: Record<string, unknown>
): Map<string, PageValidationIssue[]> {
  const ids = new Set(collectStoryPageIds(story));
  const start = getStartPageIdFromStory(story);
  const map = new Map<string, PageValidationIssue[]>();

  if (start && !ids.has(start)) {
    map.set("__meta__", [
      { path: "meta.startPageId", message: `A kezdőoldal nem létezik: "${start}"` },
    ]);
  }

  for (const id of ids) {
    const issues = validatePage(story, id, ids);
    if (issues.length) map.set(id, issues);
  }
  return map;
}

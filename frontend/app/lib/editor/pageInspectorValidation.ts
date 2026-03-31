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
import { canonicalMilestoneFragmentId } from "../milestoneFragmentId";
import {
  hydrateRouteFieldsFromStoryPage,
  parseLegacyLogicArrayToRouteAssignments,
} from "./legacyPuzzleRouteHydrate";
import {
  classifyEditorPage,
  isEditorLogicPage,
} from "./storyPagesFlatten";
import { generatePuzzleRouteKeys } from "./puzzleRouteCombinations";
import { runesPickBounds } from "../puzzleRoutePick";

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
      const doneId = canonicalMilestoneFragmentId(`${pid}_DONE`);
      const rawDone = `${pid}_DONE`;
      const bank = asRecord(story.fragments);
      if (!bank || (!(doneId in bank) && !(rawDone in bank))) {
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
    if (page.kind === "runes") {
      const { minPick, maxPick } = runesPickBounds(page as Record<string, unknown>);
      if (minPick > maxPick) {
        issues.push({
          path: "minPick",
          message: "Runes: minPick nem lehet nagyobb, mint maxPick.",
        });
      }
      const opts = Array.isArray(page.options) ? page.options : [];
      const n = opts.filter((x) => typeof x === "string" && String(x).trim()).length;
      if (n > 0 && maxPick > n) {
        issues.push({
          path: "maxPick",
          message: `Runes: maxPick (${maxPick}) több, mint az opciók száma (${n}).`,
        });
      }
    }
  } else if (classifyEditorPage(page as Record<string, unknown>) === "puzzleRoute") {
    const pageRec = page as Record<string, unknown>;
    const h = hydrateRouteFieldsFromStoryPage(story, pageId, pageRec);
    const src = h.sourceId.trim();
    if (!src) {
      issues.push({
        path: "puzzleSourcePageId",
        message:
          "Puzzle route: válassz forrás runes puzzle oldalt (vagy kösd a runes siker → erre az oldalra).",
      });
    } else if (!knownIds.has(src)) {
      issues.push({
        path: "puzzleSourcePageId",
        message: `Ismeretlen forrás oldal: "${src}".`,
      });
    }
    const def = h.defaultGoto.trim();
    if (!def) {
      issues.push({
        path: "defaultGoto",
        message: "Puzzle route: kötelező a default (maradék kombináció / hiba) céloldal.",
      });
    } else if (!knownIds.has(def)) {
      issues.push({
        path: "defaultGoto",
        message: `Ismeretlen oldal: "${def}".`,
      });
    }
    const ra: Record<string, unknown> = { ...h.assignments };
    for (const [k, raw] of Object.entries(ra)) {
      const t = typeof raw === "string" ? raw.trim() : "";
      if (t && !knownIds.has(t)) {
        issues.push({
          path: `routeAssignments.${k}`,
          message: `Ismeretlen oldal: "${t}".`,
        });
      }
    }
    if (
      page.type === "logic" &&
      Array.isArray(page.logic) &&
      src &&
      knownIds.has(src)
    ) {
      const sp = findPageInStoryDocument(story, src);
      if (
        sp &&
        parseLegacyLogicArrayToRouteAssignments(page.logic as unknown[], sp) === null
      ) {
        issues.push({
          path: "logic",
          message:
            "Régi tömbös route: a forrás runes-on legyen `optionFlagsBase`, vagy ments `puzzleRoute` sémára (Változások alkalmazása).",
        });
      }
    }
    if (src && knownIds.has(src)) {
      const srcPage = findPageInStoryDocument(story, src);
      if (
        srcPage &&
        srcPage.type === "puzzle" &&
        srcPage.kind === "runes"
      ) {
        const opts = Array.isArray(srcPage.options) ? srcPage.options : [];
        const n = opts.filter((x) => typeof x === "string" && String(x).trim()).length;
        const ans = Array.isArray(srcPage.answer) ? srcPage.answer : [];
        const open = !ans.some((x) => typeof x === "string" && String(x).trim());
        if (open && n > 0) {
          const { minPick, maxPick } = runesPickBounds(
            srcPage as Record<string, unknown>
          );
          const mode =
            srcPage.mode === "ordered" ? "ordered" : "set";
          const expected = generatePuzzleRouteKeys(n, minPick, maxPick, mode);
          for (const ek of expected) {
            const dest = readString(ra[ek]);
            if (!dest) {
              issues.push({
                path: `routeAssignments['${ek}']`,
                message: `Hiányzó céloldal a kombinációhoz: ${ek}.`,
              });
            }
          }
        }
      }
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
    if (
      choices.length === 0 &&
      !isPuzzle &&
      !logic &&
      classifyEditorPage(page as Record<string, unknown>) !== "puzzleRoute"
    ) {
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

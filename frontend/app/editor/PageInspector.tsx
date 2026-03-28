"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { findPageInStoryDocument } from "@/app/lib/editor/findPageInStory";
import type { PageValidationIssue } from "@/app/lib/editor/pageInspectorValidation";
import { buildFragmentPicklist } from "@/app/lib/editor/storyChoiceFragmentIds";
import {
  readFragmentTextFromStory,
  replacePageInStory,
  upsertStoryFragmentText,
} from "@/app/lib/editor/storyPagePatch";
import s from "./pageInspector.module.scss";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

type TextFragRow = {
  ifUnlocked: string;
  mode: "append_after" | "override";
  text: string;
  separator?: string;
};

function getPrimaryText(page: Record<string, unknown>): string {
  const t = page.text;
  if (typeof t === "string") return t;
  if (!Array.isArray(t)) return "";
  const parts: string[] = [];
  for (const item of t) {
    const o = asRecord(item);
    if (!o) continue;
    if (typeof o.ifUnlocked === "string") continue;
    if (typeof o.ifFragment === "string") continue;
    if (typeof o.text === "string") parts.push(o.text);
    if (typeof o.default === "string") parts.push(o.default);
  }
  return parts.join("\n\n");
}

function setPrimaryTextInPage(
  page: Record<string, unknown>,
  newText: string
): Record<string, unknown> {
  const p = { ...page };
  const t = page.text;
  if (typeof t === "string" || t == null) {
    p.text = newText;
    return p;
  }
  if (Array.isArray(t)) {
    const arr = [...t];
    let done = false;
    const next = arr.map((item) => {
      const o = asRecord(item);
      if (!o || typeof o.ifUnlocked === "string" || typeof o.ifFragment === "string") {
        return item;
      }
      if (!done && (typeof o.text === "string" || o.default != null)) {
        done = true;
        const rest = { ...o };
        delete rest.default;
        return { ...rest, text: newText };
      }
      return item;
    });
    if (!done) next.unshift({ text: newText });
    p.text = next;
    return p;
  }
  p.text = newText;
  return p;
}

function extractFragRows(page: Record<string, unknown>): TextFragRow[] {
  const t = page.text;
  if (!Array.isArray(t)) return [];
  const out: TextFragRow[] = [];
  for (const item of t) {
    const o = asRecord(item);
    if (!o || typeof o.ifUnlocked !== "string") continue;
    const mode = o.mode === "append_after" ? "append_after" : "override";
    out.push({
      ifUnlocked: o.ifUnlocked,
      mode,
      text: typeof o.text === "string" ? o.text : "",
      separator: typeof o.separator === "string" ? o.separator : undefined,
    });
  }
  return out;
}

/** Token vagy üres szöveg helyett a story `fragments[id].text` a szerkesztőben. */
function hydrateFragRowTextsFromStory(
  rows: TextFragRow[],
  story: Record<string, unknown>
): TextFragRow[] {
  return rows.map((r) => {
    const id = r.ifUnlocked.trim();
    if (!id) return r;
    const bank = readFragmentTextFromStory(story, id);
    if (!bank) return r;
    const t = r.text.trim();
    const m = t.match(/^\{fragment:([\w-]+)\}$/);
    const tokenMatchesId = m && m[1] === id;
    if (t === "" || tokenMatchesId) {
      return { ...r, text: bank };
    }
    return r;
  });
}

function mergeFragRowsIntoPage(
  page: Record<string, unknown>,
  rows: TextFragRow[],
  primaryText: string
): Record<string, unknown> {
  const base = setPrimaryTextInPage({ ...page }, primaryText);
  const t = base.text;
  const preserved: unknown[] = [];
  if (Array.isArray(t)) {
    for (const item of t) {
      const o = asRecord(item);
      if (o && typeof o.ifUnlocked === "string") continue;
      preserved.push(item);
    }
  } else if (typeof t === "string") {
    preserved.push({ text: t });
  }
  if (preserved.length === 0) {
    preserved.push({ text: primaryText });
  }
  const fragItems = rows
    .filter((r) => r.ifUnlocked.trim())
    .map((r) => ({
      ifUnlocked: r.ifUnlocked.trim(),
      text: r.text || `{fragment:${r.ifUnlocked.trim()}}`,
      mode: r.mode,
      ...(r.separator ? { separator: r.separator } : {}),
    }));
  base.text = [...preserved, ...fragItems];
  return base;
}

type VisibilityMode = "none" | "showWhenUnlocked" | "hideWhenUnlocked";

type ChoiceForm = {
  text: string;
  next: string;
  unlockIds: string;
  visibilityMode: VisibilityMode;
  visibilityFragment: string;
};

function readChoiceVisibility(o: Record<string, unknown>): {
  mode: VisibilityMode;
  fragment: string;
} {
  const show = Array.isArray(o.showIfHasFragment)
    ? (o.showIfHasFragment as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim() !== ""
      )
    : [];
  const hide = Array.isArray(o.hideIfHasFragment)
    ? (o.hideIfHasFragment as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim() !== ""
      )
    : [];
  if (show.length) return { mode: "showWhenUnlocked", fragment: show[0]! };
  if (hide.length) return { mode: "hideWhenUnlocked", fragment: hide[0]! };
  return { mode: "none", fragment: "" };
}

function readChoices(page: Record<string, unknown>): ChoiceForm[] {
  const ch = Array.isArray(page.choices) ? page.choices : [];
  return ch.map((c) => {
    const o = asRecord(c) ?? {};
    const r = asRecord(o.reward);
    const uf = Array.isArray(r?.unlockFragments)
      ? (r!.unlockFragments as unknown[]).filter((x) => typeof x === "string")
      : [];
    const vis = readChoiceVisibility(o);
    return {
      text: String(o.text ?? o.label ?? ""),
      next: String(o.next ?? ""),
      unlockIds: uf.join(", "),
      visibilityMode: vis.mode,
      visibilityFragment: vis.fragment,
    };
  });
}

/** Narratív opció JSON — megőrzi a reward egyéb mezőit, frissíti a láthatóságot. */
function buildChoiceRecord(row: ChoiceForm, prev: unknown): Record<string, unknown> {
  const o = { ...(asRecord(prev) ?? {}) };
  o.text = row.text;
  o.next = row.next;

  const ids = row.unlockIds
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const prevReward = asRecord(o.reward);
  const reward: Record<string, unknown> = prevReward ? { ...prevReward } : {};
  if (ids.length) reward.unlockFragments = ids;
  else delete reward.unlockFragments;
  if (Object.keys(reward).length) o.reward = reward;
  else delete o.reward;

  delete o.showIfHasFragment;
  delete o.hideIfHasFragment;
  const vf = row.visibilityFragment.trim();
  if (row.visibilityMode === "showWhenUnlocked" && vf) {
    o.showIfHasFragment = [vf];
  } else if (row.visibilityMode === "hideWhenUnlocked" && vf) {
    o.hideIfHasFragment = [vf];
  }

  return o;
}

type RiddleCaseRow = { key: string; pageId: string };

/** `logic.ifHasFragment[]` szerkesztő sor — a futtató `fragment` + `goTo` mezőket várja. */
type LogicIfForm = { fragment: string; goTo: string };

type RunesOptionForm = { text: string; correct: boolean };

const EMPTY_RUNES_OPTION: RunesOptionForm = { text: "", correct: false };

function loadRunesOptionRows(page: Record<string, unknown>): RunesOptionForm[] {
  const ro = Array.isArray(page.options) ? page.options : [];
  const ansRaw = Array.isArray(page.answer) ? page.answer : [];
  const ansPool = ansRaw
    .map((x) => (typeof x === "string" ? x : String(x)).trim())
    .filter(Boolean);
  if (ro.length === 0) return [{ ...EMPTY_RUNES_OPTION }];
  return ro.map((x) => {
    const t = (typeof x === "string" ? x : String(x)).trim();
    const i = ansPool.indexOf(t);
    if (i >= 0) {
      ansPool.splice(i, 1);
      return { text: t, correct: true };
    }
    return { text: t, correct: false };
  });
}

function loadLogicIfRows(page: Record<string, unknown>): LogicIfForm[] {
  const logic = asRecord(page.logic);
  if (!logic) return [];
  const arr = Array.isArray(logic.ifHasFragment) ? logic.ifHasFragment : [];
  return arr.map((item) => {
    const o = asRecord(item);
    return {
      fragment: typeof o?.fragment === "string" ? o.fragment : "",
      goTo: typeof o?.goTo === "string" ? o.goTo : "",
    };
  });
}

function loadRiddleCaseRows(page: Record<string, unknown>): RiddleCaseRow[] {
  const onAnswer = asRecord(page.onAnswer);
  const ns = onAnswer?.nextSwitch;
  if (typeof ns === "string" && ns.trim()) {
    return [{ key: "next", pageId: ns.trim() }];
  }
  const sw = asRecord(ns);
  const cases = asRecord(sw?.cases);
  if (!cases || !Object.keys(cases).length) {
    return [
      { key: "true", pageId: "" },
      { key: "false", pageId: "" },
    ];
  }
  return Object.entries(cases).map(([key, v]) => ({
    key,
    pageId: typeof v === "string" ? v : "",
  }));
}

function loadRiddleSwitchKey(page: Record<string, unknown>): string {
  const onAnswer = asRecord(page.onAnswer);
  const ns = onAnswer?.nextSwitch;
  if (typeof ns === "string") return "correct";
  const sw = asRecord(ns);
  return typeof sw?.switch === "string" ? sw.switch : "correct";
}

function choiceVisibilityFoldLabel(ch: ChoiceForm): string {
  if (ch.visibilityMode === "none") return "mindig látszik";
  const id = ch.visibilityFragment.trim() || "…";
  if (ch.visibilityMode === "showWhenUnlocked")
    return `megjelenik, ha megvan: ${id}`;
  return `eltűnik, ha megvan: ${id}`;
}

type FragmentIdSelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  disabled?: boolean;
  emptyLabel?: string;
};

function FragmentIdSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  emptyLabel = "— válassz —",
}: FragmentIdSelectProps) {
  const t = value.trim();
  const inList = options.some((o) => o === t);
  const orphan = t !== "" && !inList;
  return (
    <label className={s.field}>
      <span>{label}</span>
      <select
        className={s.input}
        disabled={disabled}
        value={orphan ? t : t || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {orphan ? (
          <option value={t}>
            {t} (régi érték, nincs a jegyzékben)
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

type PageInspectorProps = {
  draftStory: Record<string, unknown>;
  selectedPageId: string | null;
  onStoryChange: (next: Record<string, unknown>) => void;
  issues: PageValidationIssue[];
  knownPageIds: string[];
};

export default function PageInspector({
  draftStory,
  selectedPageId,
  onStoryChange,
  issues,
  knownPageIds,
}: PageInspectorProps) {
  const page = useMemo(
    () =>
      selectedPageId
        ? findPageInStoryDocument(draftStory, selectedPageId)
        : null,
    [draftStory, selectedPageId]
  );

  const [title, setTitle] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [fragRows, setFragRows] = useState<TextFragRow[]>([]);
  const [choices, setChoices] = useState<ChoiceForm[]>([]);

  const [riddleQuestion, setRiddleQuestion] = useState("");
  const [riddleOptionsText, setRiddleOptionsText] = useState("");
  const [riddleCorrectIndex, setRiddleCorrectIndex] = useState("0");
  const [riddleCorrectLabel, setRiddleCorrectLabel] = useState("");
  const [riddleSwitchKey, setRiddleSwitchKey] = useState("correct");
  const [riddleCaseRows, setRiddleCaseRows] = useState<RiddleCaseRow[]>([]);

  const [runesText, setRunesText] = useState("");
  const [runesOptionRows, setRunesOptionRows] = useState<RunesOptionForm[]>([
    { ...EMPTY_RUNES_OPTION },
  ]);
  const [runesMaxAttempts, setRunesMaxAttempts] = useState("3");
  const [runesMode, setRunesMode] = useState("set");
  const [runesFeedback, setRunesFeedback] = useState("keep");
  const [runesSuccessGoto, setRunesSuccessGoto] = useState("");
  const [runesFailGoto, setRunesFailGoto] = useState("");
  const [runesSuccessFlags, setRunesSuccessFlags] = useState("");

  const [logicIfRows, setLogicIfRows] = useState<LogicIfForm[]>([]);
  const [logicElseGoTo, setLogicElseGoTo] = useState("");

  const fragmentPicklist = useMemo(
    () =>
      buildFragmentPicklist(
        draftStory,
        choices.map((c) => c.unlockIds)
      ),
    [draftStory, choices]
  );

  useEffect(() => {
    if (!page) {
      setTitle("");
      setPrimaryText("");
      setFragRows([]);
      setChoices([]);
      setLogicIfRows([]);
      setLogicElseGoTo("");
      setRiddleQuestion("");
      setRiddleOptionsText("");
      setRiddleCorrectIndex("0");
      setRiddleCorrectLabel("");
      setRiddleSwitchKey("correct");
      setRiddleCaseRows([]);
      setRunesText("");
      setRunesOptionRows([{ ...EMPTY_RUNES_OPTION }]);
      setRunesMaxAttempts("3");
      setRunesMode("set");
      setRunesFeedback("keep");
      setRunesSuccessGoto("");
      setRunesFailGoto("");
      setRunesSuccessFlags("");
      return;
    }

    const logicRec = asRecord(page.logic);
    const isObjectLogic = Boolean(logicRec);

    setTitle(typeof page.title === "string" ? page.title : "");

    if (isObjectLogic) {
      setLogicIfRows(loadLogicIfRows(page));
      setLogicElseGoTo(
        typeof logicRec?.elseGoTo === "string" ? logicRec.elseGoTo : ""
      );
      setPrimaryText("");
      setFragRows([]);
      setChoices([]);
    } else {
      setLogicIfRows([]);
      setLogicElseGoTo("");
      setPrimaryText(getPrimaryText(page));
      setFragRows(
        hydrateFragRowTextsFromStory(extractFragRows(page), draftStory)
      );
      setChoices(readChoices(page));
    }

    if (page.type === "puzzle" && page.kind === "riddle") {
      setRiddleQuestion(
        typeof page.question === "string" ? page.question : ""
      );
      const opts = Array.isArray(page.options) ? page.options : [];
      setRiddleOptionsText(
        opts.map((x) => (typeof x === "string" ? x : String(x))).join("\n")
      );
      setRiddleCorrectIndex(
        String(
          typeof page.correctIndex === "number" ? page.correctIndex : 0
        )
      );
      setRiddleCorrectLabel(
        typeof page.correctLabel === "string" ? page.correctLabel : ""
      );
      setRiddleSwitchKey(loadRiddleSwitchKey(page));
      setRiddleCaseRows(loadRiddleCaseRows(page));
    } else {
      setRiddleQuestion("");
      setRiddleOptionsText("");
      setRiddleCorrectIndex("0");
      setRiddleCorrectLabel("");
      setRiddleSwitchKey("correct");
      setRiddleCaseRows([]);
    }

    if (page.type === "puzzle" && page.kind === "runes") {
      setRunesText(
        typeof page.text === "string" ? page.text : getPrimaryText(page)
      );
      setRunesOptionRows(loadRunesOptionRows(page));
      setRunesMaxAttempts(
        String(
          typeof page.maxAttempts === "number" ? page.maxAttempts : 3
        )
      );
      setRunesMode(typeof page.mode === "string" ? page.mode : "set");
      setRunesFeedback(
        typeof page.feedback === "string" ? page.feedback : "keep"
      );
      const os = asRecord(page.onSuccess);
      const of = asRecord(page.onFail);
      setRunesSuccessGoto(typeof os?.goto === "string" ? os.goto : "");
      setRunesFailGoto(typeof of?.goto === "string" ? of.goto : "");
      const sf = os?.setFlags;
      if (Array.isArray(sf)) {
        setRunesSuccessFlags(
          sf.filter((x) => typeof x === "string").join(", ")
        );
      } else {
        setRunesSuccessFlags("");
      }
    } else {
      setRunesText("");
      setRunesOptionRows([{ ...EMPTY_RUNES_OPTION }]);
      setRunesMaxAttempts("3");
      setRunesMode("set");
      setRunesFeedback("keep");
      setRunesSuccessGoto("");
      setRunesFailGoto("");
      setRunesSuccessFlags("");
    }
  }, [page, selectedPageId]);

  const applyPage = useCallback(
    (nextPage: Record<string, unknown>) => {
      if (!selectedPageId) return;
      let s = replacePageInStory(draftStory, selectedPageId, nextPage);
      for (const row of fragRows) {
        const id = row.ifUnlocked.trim();
        if (id && row.text.trim()) {
          s = upsertStoryFragmentText(s, id, row.text.trim());
        }
      }
      onStoryChange(s);
    },
    [draftStory, selectedPageId, fragRows, onStoryChange]
  );

  const onSaveFields = useCallback(() => {
    if (!page || !selectedPageId) return;
    const logic = asRecord(page.logic);
    const isRiddle = page.type === "puzzle" && page.kind === "riddle";
    const isRunes = page.type === "puzzle" && page.kind === "runes";
    const isOtherPuzzle =
      page.type === "puzzle" && !isRiddle && !isRunes;
    let nextP: Record<string, unknown>;

    if (isRiddle) {
      const options = riddleOptionsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const ci = Math.min(
        Math.max(0, Number.parseInt(riddleCorrectIndex, 10) || 0),
        Math.max(0, options.length - 1)
      );
      const cases: Record<string, string> = {};
      for (const row of riddleCaseRows) {
        const k = row.key.trim();
        const pid = row.pageId.trim();
        if (k && pid) cases[k] = pid;
      }
      const prevOnAnswer = asRecord(page.onAnswer) ?? {};
      const swKey = riddleSwitchKey.trim() || "correct";
      const nextSw: unknown =
        Object.keys(cases).length === 1 && typeof cases.next === "string"
          ? cases.next
          : { switch: swKey, cases };
      const textMerged = mergeFragRowsIntoPage(
        { ...page, title },
        fragRows,
        primaryText
      ).text;
      nextP = {
        ...page,
        title,
        text: textMerged,
        question: riddleQuestion.trim(),
        options,
        correctIndex: ci,
        correctLabel: riddleCorrectLabel.trim(),
        type: "puzzle",
        kind: "riddle",
        onAnswer: {
          ...prevOnAnswer,
          nextSwitch: nextSw,
        },
      };
    } else if (isRunes) {
      const options = runesOptionRows
        .map((r) => r.text.trim())
        .filter(Boolean);
      const answer = runesOptionRows
        .filter((r) => r.correct && r.text.trim())
        .map((r) => r.text.trim());
      const flags = runesSuccessFlags
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const prevOs = asRecord(page.onSuccess) ?? {};
      const prevOf = asRecord(page.onFail) ?? {};
      const nextOs: Record<string, unknown> = {
        ...prevOs,
        goto: runesSuccessGoto.trim(),
      };
      if (flags.length) nextOs.setFlags = flags;
      else delete nextOs.setFlags;
      nextP = {
        ...page,
        title,
        text: runesText,
        options,
        answer,
        maxAttempts: Math.max(1, Number.parseInt(runesMaxAttempts, 10) || 3),
        mode: runesMode,
        feedback: runesFeedback,
        type: "puzzle",
        kind: "runes",
        onSuccess: nextOs,
        onFail: {
          ...prevOf,
          goto: runesFailGoto.trim(),
        },
      };
    } else if (isOtherPuzzle) {
      nextP = { ...page, title, text: primaryText };
    } else if (logic) {
      const ifHas = logicIfRows
        .filter((r) => r.fragment.trim() && r.goTo.trim())
        .map((r) => ({
          fragment: r.fragment.trim(),
          goTo: r.goTo.trim(),
        }));
      const elseTrim = logicElseGoTo.trim();
      const prevLogic = asRecord(page.logic) ?? {};
      const nextLogic: Record<string, unknown> = {
        ...prevLogic,
        ifHasFragment: ifHas,
      };
      if (elseTrim) nextLogic.elseGoTo = elseTrim;
      else delete nextLogic.elseGoTo;
      nextP = {
        ...page,
        title,
        logic: nextLogic,
        text: "",
      };
    } else {
      const oldChoices = Array.isArray(page.choices) ? page.choices : [];
      nextP = mergeFragRowsIntoPage(
        { ...page, title },
        fragRows,
        primaryText
      );
      nextP.choices = choices.map((row, i) =>
        buildChoiceRecord(row, oldChoices[i])
      );
    }

    applyPage(nextP);
  }, [
    page,
    selectedPageId,
    title,
    primaryText,
    fragRows,
    choices,
    applyPage,
    riddleQuestion,
    riddleOptionsText,
    riddleCorrectIndex,
    riddleCorrectLabel,
    riddleSwitchKey,
    riddleCaseRows,
    runesText,
    runesOptionRows,
    runesMaxAttempts,
    runesMode,
    runesFeedback,
    runesSuccessGoto,
    runesFailGoto,
    runesSuccessFlags,
    logicIfRows,
    logicElseGoTo,
  ]);

  const addFragRow = useCallback(() => {
    setFragRows((r) => [
      ...r,
      { ifUnlocked: "", mode: "append_after", text: "" },
    ]);
  }, []);

  const addChoice = useCallback(() => {
    setChoices((c) => [
      ...c,
      {
        text: "",
        next: "",
        unlockIds: "",
        visibilityMode: "none",
        visibilityFragment: "",
      },
    ]);
  }, []);

  const addRiddleCase = useCallback(() => {
    setRiddleCaseRows((r) => [...r, { key: "", pageId: "" }]);
  }, []);

  const addLogicIfRow = useCallback(() => {
    setLogicIfRows((r) => [...r, { fragment: "", goTo: "" }]);
  }, []);

  const addRunesOptionRow = useCallback(() => {
    setRunesOptionRows((r) => [...r, { ...EMPTY_RUNES_OPTION }]);
  }, []);

  const idSet = useMemo(() => new Set(knownPageIds), [knownPageIds]);

  if (!selectedPageId) {
    return (
      <div className={s.wrap}>
        <p className={s.muted}>Válassz egy oldalt a vásznon a részletekhez.</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className={s.wrap}>
        <p className={s.err}>Az oldal nem található: {selectedPageId}</p>
      </div>
    );
  }

  const logic = asRecord(page.logic);
  const isRiddlePage = page.type === "puzzle" && page.kind === "riddle";
  const isRunesPage = page.type === "puzzle" && page.kind === "runes";
  const isOtherPuzzle =
    page.type === "puzzle" && !isRiddlePage && !isRunesPage;
  const isLogic = Boolean(logic);

  return (
    <div className={s.details}>
      <h3 className={s.summary}>Oldal részletek — {selectedPageId}</h3>
      <div className={s.body}>
        {issues.length > 0 ? (
          <ul className={s.issueList}>
            {issues.map((it, i) => (
              <li key={i}>
                <code>{it.path}</code>: {it.message}
              </li>
            ))}
          </ul>
        ) : null}

        <label className={s.field}>
          <span>Cím</span>
          <input
            className={s.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {!isLogic && !isRiddlePage && !isRunesPage && !isOtherPuzzle ? (
          <>
            <label className={s.field}>
              <span>Fő szöveg</span>
              <textarea
                className={s.textarea}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                rows={5}
              />
            </label>

            <div className={s.blockHead}>
              <span>Fragment feloldás (szövegblokkok)</span>
              <button type="button" className={s.btnSm} onClick={addFragRow}>
                + blokk
              </button>
            </div>
            <p className={s.hintSmall}>
              Fragment id csak a jegyzékből: az opciók „Mentett fragment id-k”
              mezői (mentett történet + mostani szerkesztés). Új id először ott
              adható meg.
            </p>
            {fragRows.map((row, idx) => (
              <div key={idx} className={s.fragCard}>
                <FragmentIdSelect
                  label="Fragment (feloldás)"
                  value={row.ifUnlocked}
                  onChange={(v) => {
                    const id = v.trim();
                    const bank = id ? readFragmentTextFromStory(draftStory, id) : "";
                    setFragRows((r) =>
                      r.map((x, j) =>
                        j === idx
                          ? { ...x, ifUnlocked: v, text: bank || "" }
                          : x
                      )
                    );
                  }}
                  options={fragmentPicklist}
                  emptyLabel="— válassz fragmentet —"
                />
                <label className={s.field}>
                  <span>Mód</span>
                  <select
                    className={s.input}
                    value={row.mode}
                    onChange={(e) => {
                      const v = e.target.value as "append_after" | "override";
                      setFragRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, mode: v } : x))
                      );
                    }}
                  >
                    <option value="append_after">append after</option>
                    <option value="override">override</option>
                  </select>
                </label>
                <label className={s.field}>
                  <span>Tartalom (feloldott szöveg)</span>
                  <textarea
                    className={s.textarea}
                    rows={2}
                    value={row.text}
                    placeholder="A story.fragments[id].text tartalma; mentéskor oda is íródik."
                    onChange={(e) => {
                      const v = e.target.value;
                      setFragRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, text: v } : x))
                      );
                    }}
                  />
                </label>
                <label className={s.field}>
                  <span>Elválasztó (append after)</span>
                  <input
                    className={s.input}
                    value={row.separator ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFragRows((r) =>
                        r.map((x, j) =>
                          j === idx ? { ...x, separator: v || undefined } : x
                        )
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={() =>
                    setFragRows((r) => r.filter((_, j) => j !== idx))
                  }
                >
                  Blokk törlése
                </button>
              </div>
            ))}

            <div className={s.blockHead}>
              <span>Opciók (kötelező: szöveg + következő oldal)</span>
              <button type="button" className={s.btnSm} onClick={addChoice}>
                + opció
              </button>
            </div>
            {choices.map((ch, idx) => (
              <div key={idx} className={s.choiceCard}>
                <label className={s.field}>
                  <span>Opció szöveg</span>
                  <input
                    className={s.input}
                    value={ch.text}
                    onChange={(e) => {
                      const v = e.target.value;
                      setChoices((c) =>
                        c.map((x, j) => (j === idx ? { ...x, text: v } : x))
                      );
                    }}
                  />
                </label>
                <label className={s.field}>
                  <span>Következő oldal (id)</span>
                  <input
                    className={`${s.input} ${ch.next && !idSet.has(ch.next) ? s.inputWarn : ""}`}
                    value={ch.next}
                    list="editor-known-page-ids"
                    onChange={(e) => {
                      const v = e.target.value;
                      setChoices((c) =>
                        c.map((x, j) => (j === idx ? { ...x, next: v } : x))
                      );
                    }}
                  />
                </label>
                <label className={s.field}>
                  <span>Mentett fragment id-k (vesszővel)</span>
                  <input
                    className={s.input}
                    value={ch.unlockIds}
                    placeholder="pl. A1_done, B_done"
                    onChange={(e) => {
                      const v = e.target.value;
                      setChoices((c) =>
                        c.map((x, j) => (j === idx ? { ...x, unlockIds: v } : x))
                      );
                    }}
                  />
                </label>
                <details className={s.foldBlock}>
                  <summary className={s.foldSummary}>
                    Láthatóság: {choiceVisibilityFoldLabel(ch)}
                  </summary>
                  <div className={s.foldBody}>
                    <label className={s.field}>
                      <span>Mód</span>
                      <select
                        className={s.input}
                        value={ch.visibilityMode}
                        onChange={(e) => {
                          const v = e.target.value as VisibilityMode;
                          setChoices((c) =>
                            c.map((x, j) =>
                              j === idx ? { ...x, visibilityMode: v } : x
                            )
                          );
                        }}
                      >
                        <option value="none">Alap: mindig látszik</option>
                        <option value="showWhenUnlocked">
                          Megjelenik, ha megvan a fragment
                        </option>
                        <option value="hideWhenUnlocked">
                          Eltűnik, ha megvan a fragment
                        </option>
                      </select>
                    </label>
                    <FragmentIdSelect
                      label="Fragment (láthatóság)"
                      value={ch.visibilityFragment}
                      onChange={(v) => {
                        setChoices((c) =>
                          c.map((x, j) =>
                            j === idx ? { ...x, visibilityFragment: v } : x
                          )
                        );
                      }}
                      options={fragmentPicklist}
                      disabled={ch.visibilityMode === "none"}
                      emptyLabel="— válassz —"
                    />
                  </div>
                </details>
                <p className={s.hintSmall}>
                  Jutalom: <code>reward.unlockFragments</code> (szabad szöveg).
                  Láthatóság / feloldás: csak ebből a jegyzékből választható
                  fragment.
                </p>
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={() =>
                    setChoices((c) => c.filter((_, j) => j !== idx))
                  }
                >
                  Opció törlése
                </button>
              </div>
            ))}
          </>
        ) : isRiddlePage ? (
          <>
            <p className={s.hintSmall}>
              Riddle: narratív szöveg + fragmentek, majd kvíz mezők és ágak.
            </p>
            <label className={s.field}>
              <span>Fő szöveg (blokkok / default)</span>
              <textarea
                className={s.textarea}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                rows={4}
              />
            </label>
            <div className={s.blockHead}>
              <span>Fragment feloldás</span>
              <button type="button" className={s.btnSm} onClick={addFragRow}>
                + blokk
              </button>
            </div>
            <p className={s.hintSmall}>
              Fragment id a jegyzékből (opciók jutalom mezői), mint a narratív
              oldalakon.
            </p>
            {fragRows.map((row, idx) => (
              <div key={idx} className={s.fragCard}>
                <FragmentIdSelect
                  label="Fragment (feloldás)"
                  value={row.ifUnlocked}
                  onChange={(v) => {
                    const id = v.trim();
                    const bank = id ? readFragmentTextFromStory(draftStory, id) : "";
                    setFragRows((r) =>
                      r.map((x, j) =>
                        j === idx
                          ? { ...x, ifUnlocked: v, text: bank || "" }
                          : x
                      )
                    );
                  }}
                  options={fragmentPicklist}
                  emptyLabel="— válassz fragmentet —"
                />
                <label className={s.field}>
                  <span>Mód</span>
                  <select
                    className={s.input}
                    value={row.mode}
                    onChange={(e) => {
                      const v = e.target.value as "append_after" | "override";
                      setFragRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, mode: v } : x))
                      );
                    }}
                  >
                    <option value="append_after">append after</option>
                    <option value="override">override</option>
                  </select>
                </label>
                <label className={s.field}>
                  <span>Tartalom (feloldott szöveg)</span>
                  <textarea
                    className={s.textarea}
                    rows={2}
                    value={row.text}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFragRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, text: v } : x))
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={() =>
                    setFragRows((r) => r.filter((_, j) => j !== idx))
                  }
                >
                  Blokk törlése
                </button>
              </div>
            ))}
            <label className={s.field}>
              <span>Kvíz kérdés</span>
              <textarea
                className={s.textarea}
                value={riddleQuestion}
                onChange={(e) => setRiddleQuestion(e.target.value)}
                rows={2}
              />
            </label>
            <label className={s.field}>
              <span>Válaszlehetőségek (soronként egy)</span>
              <textarea
                className={s.textarea}
                value={riddleOptionsText}
                onChange={(e) => setRiddleOptionsText(e.target.value)}
                rows={5}
              />
            </label>
            <label className={s.field}>
              <span>Helyes válasz index (0-tól)</span>
              <input
                className={s.input}
                type="number"
                min={0}
                value={riddleCorrectIndex}
                onChange={(e) => setRiddleCorrectIndex(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Helyes válasz címke (visszajelzés)</span>
              <input
                className={s.input}
                value={riddleCorrectLabel}
                onChange={(e) => setRiddleCorrectLabel(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>nextSwitch változó (pl. correct, score)</span>
              <input
                className={s.input}
                value={riddleSwitchKey}
                onChange={(e) => setRiddleSwitchKey(e.target.value)}
              />
            </label>
            <div className={s.blockHead}>
              <span>Ágak → cél oldal (cases)</span>
              <button type="button" className={s.btnSm} onClick={addRiddleCase}>
                + ág
              </button>
            </div>
            {riddleCaseRows.map((row, idx) => (
              <div key={idx} className={s.choiceCard}>
                <label className={s.field}>
                  <span>Case kulcs (pl. true, false, 3, __default)</span>
                  <input
                    className={s.input}
                    value={row.key}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRiddleCaseRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, key: v } : x))
                      );
                    }}
                  />
                </label>
                <label className={s.field}>
                  <span>Cél oldal id</span>
                  <input
                    className={`${s.input} ${row.pageId && !idSet.has(row.pageId) ? s.inputWarn : ""}`}
                    value={row.pageId}
                    list="editor-known-page-ids"
                    onChange={(e) => {
                      const v = e.target.value;
                      setRiddleCaseRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, pageId: v } : x))
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={() =>
                    setRiddleCaseRows((r) => r.filter((_, j) => j !== idx))
                  }
                >
                  Ág törlése
                </button>
              </div>
            ))}
          </>
        ) : isRunesPage ? (
          <>
            <p className={s.hintSmall}>
              Runes: minden opció külön panel; balra jelöld a helyes megoldás(oka)t
              (a játék a <code>answer</code> tömböt tölti ebből).
            </p>
            <label className={s.field}>
              <span>Szöveg / instrukció</span>
              <textarea
                className={s.textarea}
                value={runesText}
                onChange={(e) => setRunesText(e.target.value)}
                rows={4}
              />
            </label>
            <div className={s.blockHead}>
              <span>Opciók (runes)</span>
              <button type="button" className={s.btnSm} onClick={addRunesOptionRow}>
                + opció
              </button>
            </div>
            {runesOptionRows.map((row, idx) => (
              <div key={idx} className={s.runesOptPanel}>
                <div className={s.runesOptSide}>
                  <label className={s.runesOptCheck}>
                    <input
                      type="checkbox"
                      checked={row.correct}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setRunesOptionRows((r) =>
                          r.map((x, j) =>
                            j === idx ? { ...x, correct: v } : x
                          )
                        );
                      }}
                    />
                    <span>Helyes</span>
                  </label>
                </div>
                <div className={s.runesOptBody}>
                  <textarea
                    className={s.textarea}
                    rows={2}
                    value={row.text}
                    placeholder="Opció felirata"
                    onChange={(e) => {
                      const v = e.target.value;
                      setRunesOptionRows((r) =>
                        r.map((x, j) => (j === idx ? { ...x, text: v } : x))
                      );
                    }}
                  />
                  <button
                    type="button"
                    className={s.btnGhost}
                    onClick={() =>
                      setRunesOptionRows((r) =>
                        r.length > 1 ? r.filter((_, j) => j !== idx) : r
                      )
                    }
                  >
                    Opció törlése
                  </button>
                </div>
              </div>
            ))}
            <label className={s.field}>
              <span>Max próbálkozás</span>
              <input
                className={s.input}
                type="number"
                min={1}
                value={runesMaxAttempts}
                onChange={(e) => setRunesMaxAttempts(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Mód</span>
              <select
                className={s.input}
                value={runesMode}
                onChange={(e) => setRunesMode(e.target.value)}
              >
                <option value="set">set</option>
                <option value="ordered">ordered</option>
              </select>
            </label>
            <label className={s.field}>
              <span>Feedback</span>
              <select
                className={s.input}
                value={runesFeedback}
                onChange={(e) => setRunesFeedback(e.target.value)}
              >
                <option value="keep">keep</option>
                <option value="reset">reset</option>
              </select>
            </label>
            <label className={s.field}>
              <span>Siker → oldal id</span>
              <input
                className={`${s.input} ${runesSuccessGoto && !idSet.has(runesSuccessGoto) ? s.inputWarn : ""}`}
                value={runesSuccessGoto}
                list="editor-known-page-ids"
                onChange={(e) => setRunesSuccessGoto(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Sikertelen / újra → oldal id</span>
              <input
                className={`${s.input} ${runesFailGoto && !idSet.has(runesFailGoto) ? s.inputWarn : ""}`}
                value={runesFailGoto}
                list="editor-known-page-ids"
                onChange={(e) => setRunesFailGoto(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Siker setFlags (vesszővel)</span>
              <input
                className={s.input}
                value={runesSuccessFlags}
                placeholder="pl. c2_core_elements_ok"
                onChange={(e) => setRunesSuccessFlags(e.target.value)}
              />
            </label>
          </>
        ) : isOtherPuzzle ? (
          <label className={s.field}>
            <span>Puzzle (egyéb kind) — szöveg / jegyzet</span>
            <textarea
              className={s.textarea}
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              rows={4}
            />
          </label>
        ) : isLogic ? (
          <>
            <p className={s.hintSmall}>
              Logic: nincs megjelenő szöveg — a játék a birtokolt fragmentek
              alapján választ ágat. Ha egyik feltétel sem teljesül, az{" "}
              <strong>egyébként</strong> ág kötelező. A fragment id-k a
              történetben opció-jutalomként definiált jegyzékből választhatók.
            </p>
            <div className={s.blockHead}>
              <span>Ha megvan a fragment → ugrás</span>
              <button type="button" className={s.btnSm} onClick={addLogicIfRow}>
                + ág
              </button>
            </div>
            {logicIfRows.length === 0 ? (
              <p className={s.hintSmall}>
                Még nincs if-ág — csak az „egyébként” cél oldal fut (ha megadod).
              </p>
            ) : (
              logicIfRows.map((row, idx) => (
                <div key={idx} className={s.choiceCard}>
                  <FragmentIdSelect
                    label="Fragment (játékosnál feloldott)"
                    value={row.fragment}
                    onChange={(v) => {
                      setLogicIfRows((r) =>
                        r.map((x, j) =>
                          j === idx ? { ...x, fragment: v } : x
                        )
                      );
                    }}
                    options={fragmentPicklist}
                    emptyLabel="— válassz fragmentet —"
                  />
                  <label className={s.field}>
                    <span>Cél oldal id</span>
                    <input
                      className={`${s.input} ${row.goTo.trim() && !idSet.has(row.goTo.trim()) ? s.inputWarn : ""}`}
                      value={row.goTo}
                      list="editor-known-page-ids"
                      onChange={(e) => {
                        const v = e.target.value;
                        setLogicIfRows((r) =>
                          r.map((x, j) => (j === idx ? { ...x, goTo: v } : x))
                        );
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={s.btnGhost}
                    onClick={() =>
                      setLogicIfRows((r) => r.filter((_, j) => j !== idx))
                    }
                  >
                    Ág törlése
                  </button>
                </div>
              ))
            )}
            <label className={s.field}>
              <span>Egyébként → oldal id (kötelező, ha van if ág)</span>
              <input
                className={`${s.input} ${logicElseGoTo.trim() && !idSet.has(logicElseGoTo.trim()) ? s.inputWarn : ""}`}
                value={logicElseGoTo}
                list="editor-known-page-ids"
                onChange={(e) => setLogicElseGoTo(e.target.value)}
              />
            </label>
          </>
        ) : null}

        <datalist id="editor-known-page-ids">
          {knownPageIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>

        <button type="button" className={s.btnPrimary} onClick={onSaveFields}>
          Változások alkalmazása
        </button>
      </div>
    </div>
  );
}

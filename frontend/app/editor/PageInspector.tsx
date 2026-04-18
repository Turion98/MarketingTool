"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { findPageInStoryDocument } from "@/app/lib/editor/findPageInStory";
import type { PageValidationIssue } from "@/app/lib/editor/pageInspectorValidation";
import {
  buildFragmentPicklistSections,
  editorPageMilestoneActive,
  type FragmentPicklistSections,
} from "@/app/lib/editor/storyChoiceFragmentIds";
import { findRiddleChainContext } from "@/app/lib/editor/editorCanvasCluster";
import {
  formatRouteKeyWithLabels,
  generatePuzzleRouteKeys,
  suggestPageIdForRouteKey,
} from "@/app/lib/editor/puzzleRouteCombinations";
import { hydrateRouteFieldsFromStoryPage } from "@/app/lib/editor/legacyPuzzleRouteHydrate";
import {
  classifyEditorPage,
  isEditorLogicPage,
  isEditorScorecardPage,
} from "@/app/lib/editor/storyPagesFlatten";
import { runesPickBounds } from "@/app/lib/puzzleRoutePick";
import { canonicalMilestoneFragmentId } from "@/app/lib/milestoneFragmentId";
import {
  readFragmentTextFromStory,
  removeStoryFragment,
  replacePageInStory,
  upsertStoryFragmentText,
} from "@/app/lib/editor/storyPagePatch";
import { isEditorPendingPageId } from "@/app/lib/editor/storyTemplateInsert";
import {
  buildEndPageId,
  collectEndCategoryKeysFromStory,
  parseEndPageIdSegments,
} from "@/app/lib/editor/endPageIdParts";
import {
  buildScorecardLockSources,
  loadScorecardRuleForms,
  scorecardRuleConditionsToIf,
  scorecardRuleHasDuplicateSourcePages,
  type ScorecardRuleConditionForm,
  type ScorecardRuleForm,
} from "@/app/lib/editor/scorecardLockCatalog";
import { STORY_GRAPH_START_NODE_ID } from "@/app/lib/editor/storyGraph";
import StoryMetaInspector from "./StoryMetaInspector";
import EndPageIdSegments from "./EndPageIdSegments";
import s from "./pageInspector.module.scss";
import { EditorInfoHoverPanel } from "./EditorInfoHoverPanel";
import hi from "./editorInfoHoverPanel.module.scss";

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

type ChoiceForm = {
  text: string;
  next: string;
  /** `reward.unlockFragments` — külön blokk minden fragment-azonosítóhoz. */
  unlockFragments: string[];
  /** `reward.locks` — scorecard / routing; csak automatikus ID (jelölőnégyzet). */
  lockIds: string;
};

function readLockIdsFromReward(
  reward: Record<string, unknown> | null | undefined
): string {
  if (!reward) return "";
  const locks = reward.locks;
  if (Array.isArray(locks)) {
    return locks
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .join(", ");
  }
  if (typeof locks === "string" && locks.trim()) return locks.trim();
  return "";
}

function readChoices(page: Record<string, unknown>): ChoiceForm[] {
  const ch = Array.isArray(page.choices) ? page.choices : [];
  return ch.map((c) => {
    const o = asRecord(c) ?? {};
    const r = asRecord(o.reward);
    const uf = Array.isArray(r?.unlockFragments)
      ? (r!.unlockFragments as unknown[]).filter((x) => typeof x === "string")
      : [];
    return {
      text: String(o.text ?? o.label ?? ""),
      next: String(o.next ?? ""),
      unlockFragments: uf.map((x) => String(x).trim()).filter(Boolean),
      lockIds: readLockIdsFromReward(r),
    };
  });
}

/** Narratív opció JSON — megőrzi a reward egyéb mezőit, frissíti a reward mezőket. */
function buildChoiceRecord(row: ChoiceForm, prev: unknown): Record<string, unknown> {
  const o = { ...(asRecord(prev) ?? {}) };
  o.text = row.text;
  o.next = row.next;

  const ids = row.unlockFragments.map((x) => x.trim()).filter(Boolean);
  const lockParts = row.lockIds
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const prevReward = asRecord(o.reward);
  const reward: Record<string, unknown> = prevReward ? { ...prevReward } : {};
  if (ids.length) reward.unlockFragments = ids;
  else delete reward.unlockFragments;
  if (lockParts.length) reward.locks = lockParts;
  else delete reward.locks;
  if (Object.keys(reward).length) o.reward = reward;
  else delete o.reward;

  delete o.showIfHasFragment;
  delete o.hideIfHasFragment;

  return o;
}

type RiddleCaseRow = { key: string; pageId: string };

/** `logic.ifHasFragment[]` szerkesztő sor — a futtató `fragment` + `goTo` mezőket várja. */
type LogicIfForm = { fragment: string; goTo: string };

type RunesOptionForm = { text: string; correct: boolean };

const EMPTY_RUNES_OPTION: RunesOptionForm = { text: "", correct: false };

function emptyChoiceForm(): ChoiceForm {
  return {
    text: "",
    next: "",
    unlockFragments: [],
    lockIds: "",
  };
}

function defaultChoiceLockId(pageId: string, choiceIndex: number): string {
  const base = (pageId || "page").trim() || "page";
  return `${base}_L${choiceIndex + 1}`;
}

function normalizeDecisionChoices(rows: ChoiceForm[]): ChoiceForm[] {
  const out = [...rows];
  while (out.length < 6) out.push(emptyChoiceForm());
  if (out.length % 2 !== 0) out.push(emptyChoiceForm());
  return out;
}

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

type RiddleOptionPanelRow = { text: string };

type RiddleScoreExitRow = {
  scoreLevel: number;
  accepted: boolean;
  /** Elfogadott ág: bármely oldal vagy vég (end); üres = retry. */
  destination: string;
};

function loadRiddleScoreExitRows(
  story: Record<string, unknown>,
  page: Record<string, unknown>,
  numQuestions: number,
  retryId: string
): RiddleScoreExitRow[] {
  const maxScore = numQuestions;
  const onAnswer = asRecord(page.onAnswer);
  const ns = onAnswer?.nextSwitch;
  const sw = asRecord(ns);
  const cases = asRecord(sw?.cases) ?? {};
  const rows: RiddleScoreExitRow[] = [];
  for (let score = 0; score <= maxScore; score++) {
    const key = String(score);
    const raw = cases[key];
    let target = typeof raw === "string" ? raw.trim() : "";
    if (!target) target = retryId;
    const accepted = target !== retryId;
    const destination = accepted && target ? target : "";
    rows.push({ scoreLevel: score, accepted, destination });
  }
  return rows;
}

function RiddleScoreDestinationSelect({
  label,
  value,
  onChange,
  story,
  knownPageIds,
  idSet,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  story: Record<string, unknown>;
  knownPageIds: string[];
  idSet: Set<string>;
}) {
  const t = value.trim();
  const sorted = [...knownPageIds].sort((a, b) => a.localeCompare(b));
  const orphan = t !== "" && !idSet.has(t);
  return (
    <label className={s.field}>
      <span>{label}</span>
      <select
        className={`${s.input} ${orphan ? s.inputWarn : ""}`}
        value={orphan ? t : t || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— válassz cél oldalt —</option>
        {orphan ? (
          <option value={t}>
            {t} (régi érték, nincs a jegyzékben)
          </option>
        ) : null}
        {sorted.map((id) => {
          const p = findPageInStoryDocument(story, id);
          const end = p?.type === "end";
          return (
            <option key={id} value={id}>
              {id}
              {end ? " (vég)" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function KnownPageSelect({
  label,
  value,
  onChange,
  knownPageIds,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  knownPageIds: string[];
  emptyLabel?: string;
}) {
  const t = value.trim();
  const sorted = [...knownPageIds].sort((a, b) => a.localeCompare(b));
  const orphan = t !== "" && !knownPageIds.includes(t);
  return (
    <label className={s.field}>
      <span>{label}</span>
      <select
        className={s.input}
        value={orphan ? t : t || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {orphan ? (
          <option value={t}>
            {t} (régi érték, nincs a jegyzékben)
          </option>
        ) : null}
        {sorted.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

type FragmentIdSelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  sections: FragmentPicklistSections;
  disabled?: boolean;
  emptyLabel?: string;
};

function FragmentIdSelect({
  label,
  value,
  onChange,
  sections,
  disabled,
  emptyLabel = "— válassz —",
}: FragmentIdSelectProps) {
  const t = value.trim();
  const all = [...sections.milestones, ...sections.others];
  const inList = all.some((o) => o === t);
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
        {sections.milestones.length > 0 ? (
          <optgroup label="Milestone">
            {sections.milestones.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </optgroup>
        ) : null}
        {sections.others.length > 0 ? (
          <optgroup label="Fragment">
            {sections.others.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

type PageInspectorProps = {
  draftStory: Record<string, unknown>;
  selectedPageId: string | null;
  onStoryChange: (next: Record<string, unknown>) => void;
  /** Ugyanaz a megerősítő törlés, mint a vásznon. */
  onRequestDeletePage?: (pageId: string) => void;
  issues: PageValidationIssue[];
  knownPageIds: string[];
  /** Oldal-ID átnevezés / véglegesítés (függő → valódi id). */
  onRenamePageId?: (fromId: string, toId: string) => string | null;
  /** Oldal váltása a jobb panelben (legördülő). */
  onSelectPageInEditor?: (id: string | null) => void;
};

export default function PageInspector({
  draftStory,
  selectedPageId,
  onStoryChange,
  onRequestDeletePage,
  issues,
  knownPageIds,
  onRenamePageId,
  onSelectPageInEditor,
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
  const [riddleOptionRows, setRiddleOptionRows] = useState<
    RiddleOptionPanelRow[]
  >([{ text: "" }]);
  const [riddleCorrectIndex, setRiddleCorrectIndex] = useState("0");
  const [riddleCorrectLabel, setRiddleCorrectLabel] = useState("");
  const [riddleSwitchKey, setRiddleSwitchKey] = useState("correct");
  const [riddleCaseRows, setRiddleCaseRows] = useState<RiddleCaseRow[]>([]);
  const [riddleScoreExitRows, setRiddleScoreExitRows] = useState<
    RiddleScoreExitRow[]
  >([]);

  const [runesText, setRunesText] = useState("");
  const [runesOptionRows, setRunesOptionRows] = useState<RunesOptionForm[]>([
    { ...EMPTY_RUNES_OPTION },
  ]);
  const [runesMaxAttempts, setRunesMaxAttempts] = useState("3");
  const [runesFeedback, setRunesFeedback] = useState("keep");
  const [runesSuccessGoto, setRunesSuccessGoto] = useState("");
  const [runesFailGoto, setRunesFailGoto] = useState("");
  /** Van kötelező helyes megoldás (`answer` tömb nem üres mentéskor). */
  const [runesRequiresCorrect, setRunesRequiresCorrect] = useState(true);
  const [runesFormError, setRunesFormError] = useState<string | null>(null);
  const [runesMinPick, setRunesMinPick] = useState("");
  const [runesMaxPick, setRunesMaxPick] = useState("");

  const [routeSourcePageId, setRouteSourcePageId] = useState("");
  const [routeAssignments, setRouteAssignments] = useState<
    Record<string, string>
  >({});

  const [logicIfRows, setLogicIfRows] = useState<LogicIfForm[]>([]);
  const [logicElseGoTo, setLogicElseGoTo] = useState("");
  const [scorecardRuleRows, setScorecardRuleRows] = useState<
    ScorecardRuleForm[]
  >([]);
  const [scorecardRuleOpenIndices, setScorecardRuleOpenIndices] = useState<
    Set<number>
  >(() => new Set());
  const [scorecardFallbackField, setScorecardFallbackField] = useState("");
  const [saveMilestone, setSaveMilestone] = useState(false);
  const [endCtaPresetKey, setEndCtaPresetKey] = useState("");
  const [endCtaInlineLocked, setEndCtaInlineLocked] = useState(false);
  const [pageIdDraft, setPageIdDraft] = useState("");
  const [pageIdError, setPageIdError] = useState<string | null>(null);
  const pageIdInputRef = useRef<HTMLInputElement>(null);
  const [pageIdMenuOpen, setPageIdMenuOpen] = useState(false);
  const [pageIdBarEditing, setPageIdBarEditing] = useState(false);
  const pageIdBarRootRef = useRef<HTMLDivElement>(null);
  const pageIdClickTimerRef = useRef<number | null>(null);
  const prevSelForBarRef = useRef<string | null | undefined>(undefined);
  const [endSegCategory, setEndSegCategory] = useState("");
  const [endSegTail, setEndSegTail] = useState("");
  const [endSegLegacy, setEndSegLegacy] = useState(false);
  const endInspectorTailRef = useRef<HTMLInputElement>(null);

  const clearPageIdClickTimer = useCallback(() => {
    if (pageIdClickTimerRef.current != null) {
      clearTimeout(pageIdClickTimerRef.current);
      pageIdClickTimerRef.current = null;
    }
  }, []);

  const fragmentPicklistSections = useMemo(() => {
    const sections = buildFragmentPicklistSections(
      draftStory,
      choices.map((c) => c.unlockFragments.filter(Boolean).join(", "))
    );
    const extra =
      saveMilestone && selectedPageId?.trim()
        ? `${selectedPageId.trim()}_DONE`
        : null;
    if (!extra) return sections;
    const ms = new Set(sections.milestones);
    ms.add(extra);
    const milestones = Array.from(ms).sort((a, b) => a.localeCompare(b));
    const milestoneSet = new Set(milestones);
    const others = sections.others.filter((o) => !milestoneSet.has(o));
    return { milestones, others };
  }, [draftStory, choices, saveMilestone, selectedPageId]);

  const fragmentIdHintOptions = useMemo(
    () => [
      ...fragmentPicklistSections.milestones,
      ...fragmentPicklistSections.others,
    ],
    [fragmentPicklistSections]
  );

  const endCategoryPicklist = useMemo(
    () => collectEndCategoryKeysFromStory(draftStory),
    [draftStory]
  );

  const ctaPresetKeys = useMemo(() => {
    const meta = draftStory.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
    const presets = (meta as Record<string, unknown>).ctaPresets;
    if (
      !presets ||
      typeof presets !== "object" ||
      Array.isArray(presets)
    ) {
      return [];
    }
    return Object.keys(presets as Record<string, unknown>).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [draftStory]);

  const scorecardLockSources = useMemo(
    () => buildScorecardLockSources(draftStory),
    [draftStory]
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
      setRiddleOptionRows([{ text: "" }]);
      setRiddleCorrectIndex("0");
      setRiddleCorrectLabel("");
      setRiddleSwitchKey("correct");
      setRiddleCaseRows([]);
      setRiddleScoreExitRows([]);
      setRunesText("");
      setRunesOptionRows([{ ...EMPTY_RUNES_OPTION }]);
      setRunesMaxAttempts("3");
      setRunesFeedback("keep");
      setRunesSuccessGoto("");
      setRunesFailGoto("");
      setRunesRequiresCorrect(true);
      setRunesFormError(null);
      setRunesMinPick("");
      setRunesMaxPick("");
      setRouteSourcePageId("");
      setRouteAssignments({});
      setSaveMilestone(false);
      setEndCtaPresetKey("");
      setEndCtaInlineLocked(false);
      setScorecardRuleRows([]);
      setScorecardRuleOpenIndices(new Set());
      setScorecardFallbackField("");
      return;
    }

    const logicRec = asRecord(page.logic);
    const isObjectLogic = Boolean(logicRec);
    const pageCategory = classifyEditorPage(page as Record<string, unknown>);

    setTitle(typeof page.title === "string" ? page.title : "");
    setSaveMilestone(
      selectedPageId
        ? editorPageMilestoneActive(draftStory, selectedPageId)
        : false
    );

    if (pageCategory === "scorecard") {
      setScorecardRuleRows(loadScorecardRuleForms(page, draftStory));
      setScorecardRuleOpenIndices(new Set());
      setScorecardFallbackField(
        typeof page.scorecardFallback === "string" ? page.scorecardFallback : ""
      );
      setPrimaryText(getPrimaryText(page));
      setFragRows([]);
      setChoices([]);
      setLogicIfRows([]);
      setLogicElseGoTo("");
    } else if (isObjectLogic) {
      setScorecardRuleRows([]);
      setScorecardRuleOpenIndices(new Set());
      setScorecardFallbackField("");
      setLogicIfRows(loadLogicIfRows(page));
      setLogicElseGoTo(
        typeof logicRec?.elseGoTo === "string" ? logicRec.elseGoTo : ""
      );
      setPrimaryText("");
      setFragRows([]);
      setChoices([]);
    } else {
      setScorecardRuleRows([]);
      setScorecardRuleOpenIndices(new Set());
      setScorecardFallbackField("");
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
      const strs = opts.map((x) =>
        typeof x === "string" ? x : String(x)
      );
      setRiddleOptionRows(
        strs.length ? strs.map((text) => ({ text })) : [{ text: "" }]
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
      const chain =
        selectedPageId != null
          ? findRiddleChainContext(draftStory, selectedPageId)
          : null;
      if (chain?.isLast) {
        setRiddleScoreExitRows(
          loadRiddleScoreExitRows(
            draftStory,
            page,
            chain.rowIds.length,
            chain.retryPageId
          )
        );
      } else {
        setRiddleScoreExitRows([]);
      }
    } else {
      setRiddleQuestion("");
      setRiddleOptionRows([{ text: "" }]);
      setRiddleCorrectIndex("0");
      setRiddleCorrectLabel("");
      setRiddleSwitchKey("correct");
      setRiddleCaseRows([]);
      setRiddleScoreExitRows([]);
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
      setRunesFeedback(
        typeof page.feedback === "string" ? page.feedback : "keep"
      );
      const os = asRecord(page.onSuccess);
      const of = asRecord(page.onFail);
      setRunesSuccessGoto(typeof os?.goto === "string" ? os.goto : "");
      const ansArr = Array.isArray(page.answer) ? page.answer : [];
      const hasGradedAnswer = ansArr.some(
        (x) => typeof x === "string" && x.trim()
      );
      setRunesRequiresCorrect(hasGradedAnswer);
      setRunesFailGoto(
        hasGradedAnswer && typeof of?.goto === "string" ? of.goto : ""
      );
      setRunesFormError(null);
      setRunesMinPick(
        typeof page.minPick === "number" ? String(page.minPick) : ""
      );
      setRunesMaxPick(
        typeof page.maxPick === "number" ? String(page.maxPick) : ""
      );
    } else {
      setRunesText("");
      setRunesOptionRows([{ ...EMPTY_RUNES_OPTION }]);
      setRunesMaxAttempts("3");
      setRunesFeedback("keep");
      setRunesSuccessGoto("");
      setRunesFailGoto("");
      setRunesRequiresCorrect(true);
      setRunesFormError(null);
      setRunesMinPick("");
      setRunesMaxPick("");
    }

    if (
      page &&
      selectedPageId &&
      classifyEditorPage(page as Record<string, unknown>) === "puzzleRoute"
    ) {
      const h = hydrateRouteFieldsFromStoryPage(
        draftStory,
        selectedPageId,
        page as Record<string, unknown>
      );
      setRouteSourcePageId(h.sourceId);
      setRouteAssignments(h.assignments);
    } else if (
      page &&
      classifyEditorPage(page as Record<string, unknown>) === "decision"
    ) {
      setChoices(normalizeDecisionChoices(readChoices(page)));
    } else {
      setRouteSourcePageId("");
      setRouteAssignments({});
    }

    if (page.type === "end") {
      setChoices([]);
      const em = asRecord(page.endMeta);
      const cta = em?.cta;
      if (typeof cta === "string" && cta.trim()) {
        setEndCtaPresetKey(cta.trim());
        setEndCtaInlineLocked(false);
      } else if (cta && typeof cta === "object") {
        setEndCtaPresetKey("");
        setEndCtaInlineLocked(true);
      } else {
        setEndCtaPresetKey("");
        setEndCtaInlineLocked(false);
      }
    } else {
      setEndCtaPresetKey("");
      setEndCtaInlineLocked(false);
    }

    if (page.type === "end" && selectedPageId) {
      if (isEditorPendingPageId(selectedPageId)) {
        setEndSegCategory("");
        setEndSegTail("");
        setEndSegLegacy(false);
      } else {
        const parsed = parseEndPageIdSegments(selectedPageId);
        if (parsed) {
          setEndSegCategory(parsed.category);
          setEndSegTail(parsed.tail);
          setEndSegLegacy(false);
        } else {
          setEndSegLegacy(true);
        }
      }
    } else {
      setEndSegLegacy(false);
    }
  }, [page, selectedPageId, draftStory]);

  useEffect(() => {
    if (!selectedPageId) return;
    setPageIdError(null);
    if (isEditorPendingPageId(selectedPageId)) {
      setPageIdDraft("");
    } else {
      setPageIdDraft(selectedPageId);
    }
  }, [selectedPageId]);

  const commitInspectorPageId = useCallback(() => {
    if (!selectedPageId || !onRenamePageId) return;
    const isEnd = page?.type === "end";
    let t = pageIdDraft.trim();
    if (isEnd && !endSegLegacy) {
      const c = endSegCategory.trim();
      const tail = endSegTail.trim();
      if (!c || !tail) {
        if (isEditorPendingPageId(selectedPageId)) {
          setPageIdError(
            "Végoldal ID: válassz kategóriát, majd adj egyedi farok részt (pl. koszonk).",
          );
        }
        return;
      }
      t = buildEndPageId(c, tail);
    }
    if (t === selectedPageId) {
      setPageIdError(null);
      return;
    }
    if (!t) {
      if (isEditorPendingPageId(selectedPageId)) {
        setPageIdError("Adj meg egyedi oldal-ID-t — ez alapján hivatkoznak rá más lapok.");
      }
      return;
    }
    const err = onRenamePageId(selectedPageId, t);
    if (err) setPageIdError(err);
    else setPageIdError(null);
  }, [
    selectedPageId,
    pageIdDraft,
    onRenamePageId,
    page,
    endSegLegacy,
    endSegCategory,
    endSegTail,
  ]);

  useEffect(() => () => clearPageIdClickTimer(), [clearPageIdClickTimer]);

  useEffect(() => {
    if (!pageIdMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const root = pageIdBarRootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setPageIdMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pageIdMenuOpen]);

  useEffect(() => {
    if (prevSelForBarRef.current === undefined) {
      prevSelForBarRef.current = selectedPageId;
      if (selectedPageId && isEditorPendingPageId(selectedPageId)) {
        setPageIdBarEditing(true);
      }
      return;
    }
    if (prevSelForBarRef.current !== selectedPageId) {
      prevSelForBarRef.current = selectedPageId;
      setPageIdMenuOpen(false);
      clearPageIdClickTimer();
      setPageIdBarEditing(
        Boolean(selectedPageId && isEditorPendingPageId(selectedPageId))
      );
    }
  }, [selectedPageId, clearPageIdClickTimer]);

  useEffect(() => {
    if (!selectedPageId || !isEditorPendingPageId(selectedPageId)) return;
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (cancelled) return;
      pageIdInputRef.current?.focus();
      pageIdInputRef.current?.select();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [selectedPageId]);

  useEffect(() => {
    if (!pageIdBarEditing) return;
    if (!selectedPageId || isEditorPendingPageId(selectedPageId)) return;
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (cancelled) return;
      pageIdInputRef.current?.focus();
      pageIdInputRef.current?.select();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [pageIdBarEditing, selectedPageId]);

  const applyPage = useCallback(
    (
      nextPage: Record<string, unknown>,
      opts?: { stripPageDoneFragment?: boolean }
    ) => {
      if (!selectedPageId) return;
      let s = replacePageInStory(draftStory, selectedPageId, nextPage);
      const pid =
        (typeof nextPage.id === "string" && nextPage.id.trim()) ||
        selectedPageId.trim();
      if (nextPage.saveMilestone === true && pid) {
        const done = canonicalMilestoneFragmentId(`${pid}_DONE`);
        const bank = asRecord(s.fragments);
        if (!bank || !(done in bank)) {
          s = upsertStoryFragmentText(s, done, "");
        }
      } else if (
        opts?.stripPageDoneFragment &&
        pid &&
        !isEditorLogicPage(nextPage as Record<string, unknown>) &&
        !isEditorScorecardPage(nextPage as Record<string, unknown>)
      ) {
        const done = canonicalMilestoneFragmentId(`${pid}_DONE`);
        const rawKey = `${pid}_DONE`;
        s = removeStoryFragment(s, done);
        if (rawKey !== done) s = removeStoryFragment(s, rawKey);
      }
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
    const isEditorRoutePage =
      classifyEditorPage(page as Record<string, unknown>) === "puzzleRoute";
    const isEditorDecisionPage =
      classifyEditorPage(page as Record<string, unknown>) === "decision";
    const isScorecardSave =
      classifyEditorPage(page as Record<string, unknown>) === "scorecard";
    let nextP: Record<string, unknown>;

    if (isRiddle) {
      const options = riddleOptionRows
        .map((r) => r.text.trim())
        .filter(Boolean);
      const ci = Math.min(
        Math.max(0, Number.parseInt(riddleCorrectIndex, 10) || 0),
        Math.max(0, options.length - 1)
      );
      const chain = findRiddleChainContext(draftStory, selectedPageId);
      const prevOnAnswer = asRecord(page.onAnswer) ?? {};
      let nextSw: unknown;

      if (chain && !chain.isLast) {
        const nextId = chain.rowIds[chain.pageIndex + 1]!;
        nextSw = {
          switch: "correct",
          cases: {
            true: nextId,
            false: nextId,
            __default: nextId,
          },
        };
      } else if (chain && chain.isLast) {
        const cases: Record<string, string> = {};
        for (const row of riddleScoreExitRows) {
          let dest: string;
          if (!row.accepted) dest = chain.retryPageId;
          else {
            dest = row.destination.trim();
            if (!dest) dest = chain.retryPageId;
          }
          cases[String(row.scoreLevel)] = dest;
        }
        cases.__default = chain.retryPageId;
        nextSw = { switch: "score", cases };
      } else {
        const cases: Record<string, string> = {};
        for (const row of riddleCaseRows) {
          const k = row.key.trim();
          const pid = row.pageId.trim();
          if (k && pid) cases[k] = pid;
        }
        const swKey = riddleSwitchKey.trim() || "correct";
        nextSw =
          Object.keys(cases).length === 1 && typeof cases.next === "string"
            ? cases.next
            : { switch: swKey, cases };
      }

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
      const answer = runesRequiresCorrect
        ? runesOptionRows
            .filter((r) => r.correct && r.text.trim())
            .map((r) => r.text.trim())
        : [];
      if (runesRequiresCorrect && options.length > 0 && answer.length === 0) {
        setRunesFormError(
          "Ha kötelező a helyes megoldás, jelölj legalább egy helyes opciót — vagy kapcsold ki a kötelező módot."
        );
        return;
      }
      setRunesFormError(null);
      const prevOs = asRecord(page.onSuccess) ?? {};
      const nextOs: Record<string, unknown> = {
        ...prevOs,
        goto: runesSuccessGoto.trim(),
      };
      delete nextOs.setFlags;
      const prevOf = asRecord(page.onFail) ?? {};
      const failGotoOut = runesRequiresCorrect ? runesFailGoto.trim() : "";
      const parsedMax = Number.parseInt(runesMaxPick, 10);
      const parsedMin = Number.parseInt(runesMinPick, 10);
      let maxPickVal =
        Number.isFinite(parsedMax) && parsedMax > 0
          ? parsedMax
          : runesRequiresCorrect
            ? answer.length
            : 2;
      let minPickVal =
        Number.isFinite(parsedMin) && parsedMin > 0
          ? parsedMin
          : runesRequiresCorrect
            ? maxPickVal
            : 1;
      minPickVal = Math.min(Math.max(1, minPickVal), maxPickVal);
      if (minPickVal < 1) minPickVal = 1;
      maxPickVal = Math.max(1, maxPickVal);
      nextP = {
        ...page,
        title,
        text: runesText,
        options,
        answer,
        minPick: minPickVal,
        maxPick: maxPickVal,
        mode: "set",
        type: "puzzle",
        kind: "runes",
        onSuccess: nextOs,
        onFail: {
          ...prevOf,
          goto: failGotoOut,
        },
      };
      if (runesRequiresCorrect) {
        nextP = {
          ...nextP,
          maxAttempts: Math.max(1, Number.parseInt(runesMaxAttempts, 10) || 3),
          feedback: runesFeedback,
        };
      } else {
        const rp = nextP as Record<string, unknown>;
        delete rp.maxAttempts;
        delete rp.feedback;
      }
    } else if (isEditorRoutePage) {
      const sid = routeSourcePageId.trim();
      const sp = sid ? findPageInStoryDocument(draftStory, sid) : null;
      let keys: string[] = [];
      if (sp && sp.type === "puzzle" && sp.kind === "runes") {
        const opts = Array.isArray(sp.options) ? sp.options : [];
        const n = opts.filter(
          (x): x is string => typeof x === "string" && !!x.trim()
        ).length;
        if (n >= 1) {
          const { minPick, maxPick } = runesPickBounds(
            sp as Record<string, unknown>
          );
          keys = generatePuzzleRouteKeys(n, minPick, maxPick, "set");
        }
      }
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = (routeAssignments[k] ?? "").trim();
        if (v) out[k] = v;
      }
      nextP = {
        ...page,
        title,
        type: "puzzleRoute",
        puzzleSourcePageId: routeSourcePageId.trim(),
        routeAssignments: out,
      };
      delete (nextP as Record<string, unknown>).defaultGoto;
      delete (nextP as Record<string, unknown>).defaultNext;
      delete nextP.choices;
      delete nextP.logic;
      delete nextP.text;
    } else if (isEditorDecisionPage) {
      const oldChoices = Array.isArray(page.choices) ? page.choices : [];
      const normalized = normalizeDecisionChoices(choices);
      nextP = {
        ...page,
        title,
        type: "decision",
        choices: normalized.map((row, i) => buildChoiceRecord(row, oldChoices[i])),
      };
      delete nextP.logic;
      delete nextP.poolId;
      delete nextP.pool;
      delete nextP.poolKey;
      delete nextP.routeAssignments;
      delete nextP.routes;
      delete nextP.nextByPoolKey;
      delete nextP.routeMap;
      delete nextP.defaultGoto;
      delete nextP.defaultNext;
    } else if (isScorecardSave) {
      const rules = scorecardRuleRows
        .map((row) => {
          const conds = row.conditions ?? [];
          if (scorecardRuleHasDuplicateSourcePages(conds)) return null;
          const ifPart = scorecardRuleConditionsToIf(
            conds,
            scorecardLockSources
          );
          const go = row.goto.trim();
          if (!ifPart.length || !go) return null;
          return { if: ifPart, goto: go };
        })
        .filter(Boolean) as { if: string[]; goto: string }[];
      const fb = scorecardFallbackField.trim();
      const textMerged = mergeFragRowsIntoPage(
        { ...page, title },
        fragRows,
        primaryText
      ).text;
      nextP = {
        ...page,
        title,
        type: "scorecard",
        text: textMerged,
        logic: rules,
      };
      delete nextP.choices;
      delete nextP.puzzleSourcePageId;
      delete (nextP as Record<string, unknown>).routeAssignments;
      delete (nextP as Record<string, unknown>).routes;
      delete (nextP as Record<string, unknown>).nextByPoolKey;
      delete (nextP as Record<string, unknown>).routeMap;
      delete (nextP as Record<string, unknown>).poolId;
      delete (nextP as Record<string, unknown>).pool;
      delete (nextP as Record<string, unknown>).poolKey;
      if (fb) nextP.scorecardFallback = fb;
      else delete (nextP as Record<string, unknown>).scorecardFallback;
    } else if (isOtherPuzzle) {
      nextP = { ...page, title, text: primaryText };
    } else if (page.type === "end") {
      nextP = mergeFragRowsIntoPage(
        { ...page, title },
        fragRows,
        primaryText
      );
      delete nextP.choices;
      if (!endCtaInlineLocked) {
        const key = endCtaPresetKey.trim();
        if (key) {
          nextP.endMeta = {
            ...(asRecord(nextP.endMeta) ?? {}),
            cta: key,
          };
        } else {
          const em = { ...(asRecord(nextP.endMeta) ?? {}) };
          delete em.cta;
          if (Object.keys(em).length) nextP.endMeta = em;
          else delete nextP.endMeta;
        }
      }
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

    if (
      page &&
      (isEditorLogicPage(page as Record<string, unknown>) ||
        isEditorScorecardPage(page as Record<string, unknown>))
    ) {
      delete nextP.saveMilestone;
    } else if (saveMilestone) {
      nextP.saveMilestone = true;
    } else {
      delete nextP.saveMilestone;
    }

    applyPage(nextP, {
      stripPageDoneFragment: page.saveMilestone === true && !saveMilestone,
    });
  }, [
    page,
    selectedPageId,
    draftStory,
    title,
    primaryText,
    fragRows,
    choices,
    applyPage,
    riddleQuestion,
    riddleOptionRows,
    riddleCorrectIndex,
    riddleCorrectLabel,
    riddleSwitchKey,
    riddleCaseRows,
    riddleScoreExitRows,
    runesText,
    runesOptionRows,
    runesMaxAttempts,
    runesFeedback,
    runesSuccessGoto,
    runesFailGoto,
    runesRequiresCorrect,
    runesMinPick,
    runesMaxPick,
    routeSourcePageId,
    routeAssignments,
    logicIfRows,
    logicElseGoTo,
    scorecardRuleRows,
    scorecardLockSources,
    scorecardFallbackField,
    saveMilestone,
    endCtaPresetKey,
    endCtaInlineLocked,
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
        unlockFragments: [],
        lockIds: "",
      },
    ]);
  }, []);

  const addRiddleCase = useCallback(() => {
    setRiddleCaseRows((r) => [...r, { key: "", pageId: "" }]);
  }, []);

  const addRiddleOptionRow = useCallback(() => {
    setRiddleOptionRows((r) => [...r, { text: "" }]);
  }, []);

  const addLogicIfRow = useCallback(() => {
    setLogicIfRows((r) => [...r, { fragment: "", goTo: "" }]);
  }, []);

  const addScorecardRuleRow = useCallback(() => {
    let newIdx = 0;
    setScorecardRuleRows((r) => {
      newIdx = r.length;
      return [...r, { conditions: [], goto: "" }];
    });
    setScorecardRuleOpenIndices((prev) => {
      const next = new Set(prev);
      next.add(newIdx);
      return next;
    });
  }, []);

  const addRunesOptionRow = useCallback(() => {
    setRunesOptionRows((r) => [...r, { ...EMPTY_RUNES_OPTION }]);
  }, []);

  const idSet = useMemo(() => new Set(knownPageIds), [knownPageIds]);
  const decisionChoices = useMemo(
    () => normalizeDecisionChoices(choices),
    [choices]
  );

  const runesSourcePageIds = useMemo(
    () =>
      knownPageIds.filter((id) => {
        const p = findPageInStoryDocument(draftStory, id);
        return p?.type === "puzzle" && p?.kind === "runes";
      }),
    [draftStory, knownPageIds]
  );
  const routeExpectedKeys = useMemo(() => {
    const sid = routeSourcePageId.trim();
    if (!sid) return [] as string[];
    const sp = findPageInStoryDocument(draftStory, sid);
    if (!sp || sp.type !== "puzzle" || sp.kind !== "runes") return [];
    const opts = Array.isArray(sp.options) ? sp.options : [];
    const n = opts.filter(
      (x): x is string => typeof x === "string" && !!x.trim()
    ).length;
    if (n < 1) return [];
    const { minPick, maxPick } = runesPickBounds(
      sp as Record<string, unknown>
    );
    return generatePuzzleRouteKeys(n, minPick, maxPick, "set");
  }, [draftStory, routeSourcePageId]);

  const routeKeysSig = useMemo(
    () => JSON.stringify(routeExpectedKeys),
    [routeExpectedKeys]
  );

  useEffect(() => {
    let keys: string[] = [];
    try {
      keys = JSON.parse(routeKeysSig) as string[];
      if (!Array.isArray(keys)) keys = [];
    } catch {
      keys = [];
    }
    // Csak új (üres) kulcsokat adunk hozzá. Ne töröljünk itt: üres `keys` (pl. még nem
    // állt be a forrás runes ID) versenyben lehet a hidratálással és kitörölné a
    // `routeAssignments`-ot. Oldalváltáskor a fő page-sync effect teljes cserét csinál.
    if (keys.length === 0) return;
    setRouteAssignments((prev) => {
      const next: Record<string, string> = { ...prev };
      let changed = false;
      for (const k of keys) {
        if (next[k] === undefined) {
          next[k] = "";
          changed = true;
        }
      }
      if (!changed) return prev;
      return next;
    });
  }, [routeKeysSig]);

  const isRiddlePageForChain = Boolean(
    page?.type === "puzzle" && page?.kind === "riddle"
  );
  const riddleChainCtx = useMemo(
    () =>
      isRiddlePageForChain && selectedPageId
        ? findRiddleChainContext(draftStory, selectedPageId)
        : null,
    [draftStory, selectedPageId, isRiddlePageForChain]
  );

  const renderPageIdUnifiedBar = () => {
    const canPick = Boolean(onSelectPageInEditor);
    const sel = selectedPageId;
    const pending = Boolean(sel && isEditorPendingPageId(sel));
    const renameOk =
      Boolean(onRenamePageId) && Boolean(sel) && (pending || page != null);

    const showInput = Boolean(sel && (pending || pageIdBarEditing));

    const openMenuSoon = () => {
      if (!canPick) return;
      clearPageIdClickTimer();
      pageIdClickTimerRef.current = window.setTimeout(() => {
        pageIdClickTimerRef.current = null;
        setPageIdMenuOpen(true);
      }, 320);
    };

    const onDisplayClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (!canPick) return;
      if (e.detail >= 2) {
        clearPageIdClickTimer();
        return;
      }
      openMenuSoon();
    };

    const onDisplayDblClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (!renameOk || !onRenamePageId) return;
      e.preventDefault();
      clearPageIdClickTimer();
      setPageIdMenuOpen(false);
      setPageIdBarEditing(true);
    };

    const finishIdEdit = () => {
      commitInspectorPageId();
      if (selectedPageId && !isEditorPendingPageId(selectedPageId)) {
        setPageIdBarEditing(false);
      }
    };

    const useEndSegmentsUi = Boolean(
      showInput &&
        renameOk &&
        page?.type === "end" &&
        !endSegLegacy
    );

    return (
      <div className={s.pageIdStripOuter} ref={pageIdBarRootRef}>
        <div className={s.field}>
          <span>Oldal</span>
          <div
            className={`${s.pageIdStrip} ${
              pageIdError && showInput ? s.pageIdStripWarn : ""
            }`}
          >
            {showInput ? (
              useEndSegmentsUi ? (
                <div className={s.pageIdEndSegCol}>
                  <EndPageIdSegments
                    categories={endCategoryPicklist}
                    category={endSegCategory}
                    tail={endSegTail}
                    onCategoryChange={(v) => {
                      setEndSegCategory(v);
                      setPageIdError(null);
                    }}
                    onTailChange={(v) => {
                      setEndSegTail(v);
                      setPageIdError(null);
                    }}
                    onBlurCommit={() => {
                      window.setTimeout(() => finishIdEdit(), 0);
                    }}
                    onEscape={() => {
                      if (
                        selectedPageId &&
                        isEditorPendingPageId(selectedPageId)
                      ) {
                        setEndSegCategory("");
                        setEndSegTail("");
                      } else if (selectedPageId) {
                        const p = parseEndPageIdSegments(selectedPageId);
                        if (p) {
                          setEndSegCategory(p.category);
                          setEndSegTail(p.tail);
                        }
                      }
                      setPageIdError(null);
                      if (
                        selectedPageId &&
                        !isEditorPendingPageId(selectedPageId)
                      ) {
                        setPageIdBarEditing(false);
                      }
                    }}
                    tailInputRef={endInspectorTailRef}
                  />
                  <button
                    type="button"
                    className={s.pageIdModeLink}
                    onClick={() => {
                      setEndSegLegacy(true);
                      setPageIdDraft(
                        isEditorPendingPageId(selectedPageId ?? "")
                          ? ""
                          : (selectedPageId ?? "")
                      );
                      setPageIdError(null);
                    }}
                  >
                    Teljes ID szerkesztése (haladó mód)
                  </button>
                </div>
              ) : (
                <div className={s.pageIdEndSegCol}>
                  <input
                    ref={pageIdInputRef}
                    type="text"
                    className={s.pageIdStripInput}
                    value={pageIdDraft}
                    onChange={(e) => {
                      setPageIdDraft(e.target.value);
                      setPageIdError(null);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => finishIdEdit(), 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        finishIdEdit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        if (
                          selectedPageId &&
                          isEditorPendingPageId(selectedPageId)
                        ) {
                          setPageIdDraft("");
                          setEndSegCategory("");
                          setEndSegTail("");
                        } else {
                          setPageIdDraft(selectedPageId ?? "");
                        }
                        setPageIdError(null);
                        if (
                          selectedPageId &&
                          !isEditorPendingPageId(selectedPageId)
                        ) {
                          setPageIdBarEditing(false);
                        }
                      }
                    }}
                    list="editor-known-page-ids"
                    aria-invalid={!!pageIdError}
                    aria-describedby={
                      pageIdError ? "inspector-page-id-err" : undefined
                    }
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {page?.type === "end" &&
                  endSegLegacy &&
                  parseEndPageIdSegments(pageIdDraft.trim()) ? (
                    <button
                      type="button"
                      className={s.pageIdModeLink}
                      onClick={() => {
                        const p = parseEndPageIdSegments(pageIdDraft.trim());
                        if (!p) return;
                        setEndSegCategory(p.category);
                        setEndSegTail(p.tail);
                        setEndSegLegacy(false);
                        setPageIdError(null);
                      }}
                    >
                      Vissza a szegmentált nézethez
                    </button>
                  ) : null}
                </div>
              )
            ) : (
              <button
                type="button"
                className={s.pageIdStripDisplay}
                disabled={!canPick && !sel}
                onClick={onDisplayClick}
                onDoubleClick={onDisplayDblClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (canPick) setPageIdMenuOpen(true);
                  }
                }}
              >
                <span className={s.pageIdStripDisplayText}>
                  {sel
                    ? sel
                    : knownPageIds.length
                      ? "— Válassz oldalt —"
                      : "Nincs oldal a projektben"}
                </span>
              </button>
            )}
            {canPick ? (
              <button
                type="button"
                className={s.pageIdStripChevron}
                aria-expanded={pageIdMenuOpen}
                aria-label="Oldalak listája"
                onClick={(e) => {
                  e.stopPropagation();
                  clearPageIdClickTimer();
                  setPageIdMenuOpen((o) => !o);
                }}
              >
                ▼
              </button>
            ) : null}
          </div>
          {pageIdError ? (
            <p id="inspector-page-id-err" className={s.pageIdErr}>
              {pageIdError}
            </p>
          ) : null}
        </div>
        {pageIdMenuOpen && canPick && onSelectPageInEditor ? (
          <ul className={s.pageIdMenu} role="listbox">
            <li>
              <button
                type="button"
                role="option"
                className={s.pageIdMenuItem}
                onClick={() => {
                  onSelectPageInEditor(null);
                  setPageIdMenuOpen(false);
                }}
              >
                — Nincs kijelölés —
              </button>
            </li>
            {knownPageIds.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={id === sel}
                  className={
                    id === sel ? s.pageIdMenuItemActive : s.pageIdMenuItem
                  }
                  onClick={() => {
                    onSelectPageInEditor(id);
                    setPageIdMenuOpen(false);
                  }}
                >
                  {id}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  if (!selectedPageId) {
    if (!onSelectPageInEditor) {
      return (
        <div className={s.wrap}>
          <p className={s.muted}>
            Kezdés: kattints egy kártyára a vásznon — a jobb oldali panelben szerkesztheted a
            tartalmát és a következő lépéseket.
          </p>
        </div>
      );
    }
    return (
      <div className={s.details}>
        <div className={s.summaryRow}>
          <h3 className={s.summary}>Oldal</h3>
        </div>
        <div className={s.body}>
          {renderPageIdUnifiedBar()}
          <div className={s.inspectorControlRow}>
            <p className={s.inspectorHintRowTitle}>Oldalváltás</p>
            <EditorInfoHoverPanel ariaLabel="Oldalváltás: útmutató">
              <div className={hi.section}>
                <p className={hi.sectionBody}>
                  <strong>Oldalváltás:</strong> kattints az ID sávra vagy a ▼ ikonra — megjelenik
                  a lista. Ugyanezt elérheted, ha közvetlenül a vászonon választasz kártyát.
                </p>
              </div>
            </EditorInfoHoverPanel>
          </div>
        </div>
      </div>
    );
  }

  if (selectedPageId === STORY_GRAPH_START_NODE_ID) {
    return (
      <StoryMetaInspector
        draftStory={draftStory}
        onStoryChange={onStoryChange}
      />
    );
  }

  if (!page) {
    return (
      <div className={s.details}>
        <div className={s.summaryRow}>
          <h3 className={s.summary}>Oldal</h3>
        </div>
        <div className={s.body}>
          {renderPageIdUnifiedBar()}
          <p className={s.err}>
            Ez az oldal-ID nem található a betöltött projektben: {selectedPageId}. Válassz
            másikat a listából, vagy hozz létre új oldalt a vásznon.
          </p>
        </div>
      </div>
    );
  }

  const logic = asRecord(page.logic);
  const isRiddlePage = page.type === "puzzle" && page.kind === "riddle";
  const isRunesPage = page.type === "puzzle" && page.kind === "runes";
  const isOtherPuzzle =
    page.type === "puzzle" && !isRiddlePage && !isRunesPage;
  const isEditorPuzzleRoutePage =
    classifyEditorPage(page as Record<string, unknown>) === "puzzleRoute";
  const isEditorDecisionPage =
    classifyEditorPage(page as Record<string, unknown>) === "decision";
  const isEditorScorecardPageFlag =
    classifyEditorPage(page as Record<string, unknown>) === "scorecard";
  const isLogic =
    Boolean(logic) && !isEditorPuzzleRoutePage && !isEditorDecisionPage;
  const isEndPage = page.type === "end";
  const milestoneEligible =
    !isEditorLogicPage(page as Record<string, unknown>) &&
    !isEditorScorecardPage(page as Record<string, unknown>) &&
    !isEndPage;

  const narrativeMultiChoiceUi =
    !isLogic &&
    !isRiddlePage &&
    !isRunesPage &&
    !isOtherPuzzle &&
    !isEditorPuzzleRoutePage &&
    !isEditorDecisionPage &&
    !isEditorScorecardPageFlag &&
    !isEndPage &&
    choices.length >= 2;

  const choiceLockBulkEligible =
    milestoneEligible &&
    (isEditorDecisionPage || narrativeMultiChoiceUi);

  const lockIdBase =
    (selectedPageId?.trim() ||
      (typeof page.id === "string" ? page.id.trim() : "")) ||
    "page";

  const allChoiceLocksOn =
    choices.length > 0 &&
    choices.every((c) => {
      const has =
        c.text.trim().length > 0 || c.next.trim().length > 0;
      return !has || c.lockIds.trim().length > 0;
    });
  const anyChoiceLocks = choices.some((c) => c.lockIds.trim().length > 0);

  return (
    <div className={s.details}>
      <div className={s.summaryRow}>
        <h3 className={s.summary}>Oldal beállítások</h3>
        {selectedPageId && onRequestDeletePage ? (
          <button
            type="button"
            className={s.btnDanger}
            onClick={() => onRequestDeletePage(selectedPageId)}
          >
            Oldal törlése
          </button>
        ) : null}
      </div>
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

        {onSelectPageInEditor || onRenamePageId ? (
          <div className={s.pageChrome}>
            {selectedPageId && isEditorPendingPageId(selectedPageId) ? (
              <div className={s.pendingIdBanner} role="status">
                <strong>Adj meg egyedi oldal-ID-t.</strong> Példa:{" "}
                <code>chapter_3_shop</code>. Amíg nincs név, ez egy ideiglenes lap; ha
                másik oldalt választasz, a névtelen lap elveszik.
              </div>
            ) : null}
            {renderPageIdUnifiedBar()}
            <div className={s.inspectorControlRow}>
              <p className={s.inspectorHintRowTitle}>Oldal-ID és átnevezés</p>
              <EditorInfoHoverPanel ariaLabel="Oldal-ID: részletes útmutató">
                {onSelectPageInEditor ? (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Lista és szinkron</h4>
                    <p className={hi.sectionBody}>
                      Egy kattintás az ID sávra: megnyílik a lista (▼). A választás szinkronban van
                      a vászonnal és az előnézettel.
                    </p>
                  </div>
                ) : null}
                {onRenamePageId && !pageIdError ? (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Átnevezés</h4>
                    <p className={hi.sectionBody}>
                      Dupla kattintás az ID mezőn: átnevezés. Ugyanezt megteheted a kártya
                      fejlécében is a vásznon.
                    </p>
                  </div>
                ) : null}
                {onSelectPageInEditor && pageIdError ? (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Ha elakadtál</h4>
                    <p className={hi.sectionBody}>
                      Válassz másik oldalt a listából vagy a ▼ menüből.
                    </p>
                  </div>
                ) : null}
              </EditorInfoHoverPanel>
            </div>
          </div>
        ) : null}

        {milestoneEligible ? (
          <>
            <div className={s.inspectorControlRow}>
              <label
                className={`${s.saveMilestoneRow} ${s.saveMilestoneRowCompact}`}
              >
                <input
                  type="checkbox"
                  checked={saveMilestone}
                  onChange={(e) => setSaveMilestone(e.target.checked)}
                />
                <span>Milestone (haladás mentése)</span>
              </label>
              <EditorInfoHoverPanel ariaLabel="Milestone: részletes útmutató">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Mire való?</h4>
                  <p className={hi.sectionBody}>
                    Ha bekapcsolod, ez az oldal <strong>haladási pontnak</strong> számít: a
                    rendszer jelezheti, hogy a látogató elérte. A folyamat többi része (például
                    feltételes szöveg vagy pontozó) erre a jelre éphet.
                  </p>
                  <p className={hi.sectionBody}>
                    Bekapcsolás után a látogató megérkezésekor megjelenhet egy rövid{" "}
                    <strong>kész-jelző</strong> szöveg is — ha a projektben ehhez az azonosítóhoz
                    tartalom tartozik. Mentéskor a pipa együtt mentődik a projekttel.
                  </p>
                </div>
                {selectedPageId?.trim() ? (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Kész-jelző azonosító</h4>
                    <p className={hi.sectionBody}>
                      Ehhez az oldalhoz tartozó név:{" "}
                      <code>
                        {canonicalMilestoneFragmentId(`${selectedPageId.trim()}_DONE`)}
                      </code>
                      . Ezt az azonosítót használhatod fragment-feltételeknél vagy a lap „Fragment
                      feloldás” blokkjainál.
                    </p>
                  </div>
                ) : (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Kész-jelző azonosító</h4>
                    <p className={hi.sectionBody}>
                      Adj ennek az oldalnak egy végleges azonosítót — utána itt látszik majd a
                      hozzá tartozó <code>…_DONE</code> név is.
                    </p>
                  </div>
                )}
              </EditorInfoHoverPanel>
            </div>
            {choiceLockBulkEligible ? (
              <div className={s.inspectorControlRow}>
                <label
                  className={`${s.saveMilestoneRow} ${s.saveMilestoneRowCompact}`}
                >
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          anyChoiceLocks && !allChoiceLocksOn && choices.length > 0;
                      }
                    }}
                    checked={allChoiceLocksOn}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (on) {
                        setChoices((rows) =>
                          rows.map((row, j) => {
                            const has =
                              row.text.trim().length > 0 ||
                              row.next.trim().length > 0;
                            if (!has) return { ...row, lockIds: "" };
                            return {
                              ...row,
                              lockIds: defaultChoiceLockId(lockIdBase, j),
                            };
                          })
                        );
                      } else {
                        setChoices((rows) =>
                          rows.map((row) => ({ ...row, lockIds: "" }))
                        );
                      }
                    }}
                  />
                  <span>Minden opcióhoz saját választás-címke</span>
                </label>
                <EditorInfoHoverPanel ariaLabel="Választás-címkék tömegben: útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mire való?</h4>
                    <p className={hi.sectionBody}>
                      Bekapcsolva minden <strong>kitöltött</strong> választáshoz kapsz egy rögzített
                      nevet — például <code>{lockIdBase}_L1</code>, majd sorban a következő gombokhoz
                      hasonló végződéssel.
                    </p>
                    <p className={hi.sectionBody}>
                      Ezeket a neveket a <strong>pontozó</strong> lépés szabályai ismerik fel: így
                      meg tudod mondani, „ha ezt a gombot nyomták, akkor ez a szabály teljesül”,
                      és merre vigye tovább a folyamatot.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Kikapcsolás és egyenként</h4>
                    <p className={hi.sectionBody}>
                      Ha kikapcsolod a tömeges pipát, az összes ilyen név törlődik. Lent, az egyes
                      opcióknál továbbra is be- vagy kikapcsolhatod a címkét egyenként.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
              </div>
            ) : null}
          </>
        ) : null}

        <label className={s.field}>
          <span>Cím</span>
          <input
            className={s.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {!isLogic &&
        !isRiddlePage &&
        !isRunesPage &&
        !isOtherPuzzle &&
        !isEditorPuzzleRoutePage &&
        !isEditorDecisionPage &&
        !isEditorScorecardPageFlag ? (
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
              <span className={s.blockHeadGrow}>
                Fragment feloldás (szövegblokkok)
              </span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Fragment feloldás: részletes útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mi a fragment?</h4>
                    <p className={hi.sectionBody}>
                      <strong>Fragment</strong> = elmentett szövegrészlet, amit egy rövid név (ID)
                      azonosít. Ha a látogatónál „fel van oldva” ez az ID (például egy választás
                      után vagy egy lépés elérésekor), a szöveg megjelenhet ezen az oldalon: a fő
                      szöveg után, vagy helyette — attól függően, mit állítasz be lent.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Hogyan töltöm ki?</h4>
                    <p className={hi.sectionBody}>
                      Adj blokkot (+ blokk), válassz ID-t a listából (olyat, ami már létezik a
                      projektben, vagy amit az opciók „Feloldandó fragmentek” blokkjaiban adsz
                      meg). A „Tartalom” mezőbe írd a szöveget; mentéskor a szerkesztő elmenti a
                      projektbe.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mód: hozzáfűzés / felülírás</h4>
                    <p className={hi.sectionBody}>
                      <em>Hozzáfűzés</em> (append after) = a fő szöveg után jön a plusz szöveg; az
                      „Elválasztó” mezőbe írhatsz sortörést vagy rövid kötőszöveget.{" "}
                      <em>Felülírás</em> (override) = ha aktív a fragment, csak ez a szöveg látszik a
                      fő helyen.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button type="button" className={s.btnSm} onClick={addFragRow}>
                  + blokk
                </button>
              </div>
            </div>
            {fragRows.map((row, idx) => (
              <div key={idx} className={s.fragCard}>
                <p className={s.optionCardTitle}>Blokk {idx + 1}</p>
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
                  sections={fragmentPicklistSections}
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
                    placeholder="A fragment szövege — mentéskor a projektbe kerül."
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

            {!isEndPage ? (
              <>
            <div className={s.blockHead}>
              <span className={s.blockHeadGrow}>
                Opciók (kötelező: szöveg + következő oldal)
              </span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Opciók és választás-címke: részletes útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Opciók</h4>
                    <p className={hi.sectionBody}>
                      Minden sor egy gomb a látogatónak. Az <strong>Opció szöveg</strong> a gomb
                      felirata. A <strong>Következő oldal</strong> mezőbe annak a lépésnek az
                      azonosítóját írd, amerre továbbmegy a folyamat — legyen ilyen oldal a
                      projektben (vagy hozd létre a vásznon), különben az előnézet hibára futhat.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Feloldandó fragmentek (blokkonként)</h4>
                    <p className={hi.sectionBody}>
                      Minden <strong>+ fragment</strong> egy külön mezőt ad: ide{" "}
                      <strong>szabadon begépelheted</strong> a fragment azonosítót, vagy a
                      böngésző javaslatai közül választhatsz, ha már szerepel a projektben. Több
                      fragmenthez több blokk — nem kell vesszővel egy sorba írni.
                    </p>
                    <p className={hi.sectionBody}>
                      A szöveg magát a lap felső „Fragment feloldás” részén szerkesztheted; a
                      Haladó nézetben is kiegészíthető. Mentéskor a megadott azonosítók ehhez a
                      választáshoz kerülnek — a látogató kattintása után a következő lépéseken ezek
                      válhatnak elérhetővé.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Választás címkéje</h4>
                    <p className={hi.sectionBody}>
                      A <strong>pontozó</strong> lépésnél gyakran azt szeretnéd: „ha a látogató ezt
                      a gombot választotta, akkor ez a szabály teljesül”. Ehhez a rendszernek egy{" "}
                      <strong>állandó nevet</strong> kell adnia minden ilyen gombnak — ezt hívjuk
                      választás-címkének. Ha bekapcsolod a jelölőnégyzetet, megkapod ezt a nevet
                      (lent a kártyán látszik is). A pontozó szabályainál ezt a nevet választhatod
                      feltételnek.
                    </p>
                    <p className={hi.sectionBody}>
                      Ha nincs pontozó a projektben, és csak továbbnavigálsz más oldalakra,
                      általában <strong>nem kell</strong> címke — elég a következő oldal mező.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button type="button" className={s.btnSm} onClick={addChoice}>
                  + opció
                </button>
              </div>
            </div>
            {choices.map((ch, idx) => (
              <div key={idx} className={s.choiceCard}>
                <p className={s.optionCardTitle}>Opció {idx + 1}</p>
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
                <div className={s.choiceUnlockBlock}>
                  <div className={s.blockHead}>
                    <span>Feloldandó fragmentek</span>
                    <button
                      type="button"
                      className={s.btnSm}
                      onClick={() =>
                        setChoices((c) =>
                          c.map((x, j) =>
                            j === idx
                              ? { ...x, unlockFragments: [...x.unlockFragments, ""] }
                              : x
                          )
                        )
                      }
                    >
                      + fragment
                    </button>
                  </div>
                  {ch.unlockFragments.length === 0 ? (
                    <p className={s.hintSmall}>
                      Ha ehhez a gombhoz szeretnél szövegrészletet feloldani, adj hozzá legalább
                      egy fragment blokkot.
                    </p>
                  ) : null}
                  {ch.unlockFragments.map((fragId, fragIdx) => (
                    <div key={fragIdx} className={s.fragCard}>
                      <p className={s.optionCardTitle}>Fragment {fragIdx + 1}</p>
                      <label className={s.field}>
                        <span>Fragment azonosító</span>
                        <input
                          className={s.input}
                          value={fragId}
                          list="editor-fragment-id-hints"
                          spellCheck={false}
                          placeholder="azonosító — gépelés vagy javaslat"
                          onChange={(e) => {
                            const v = e.target.value;
                            setChoices((c) =>
                              c.map((x, j) => {
                                if (j !== idx) return x;
                                const next = [...x.unlockFragments];
                                next[fragIdx] = v;
                                return { ...x, unlockFragments: next };
                              })
                            );
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className={s.btnGhost}
                        onClick={() =>
                          setChoices((c) =>
                            c.map((x, j) => {
                              if (j !== idx) return x;
                              return {
                                ...x,
                                unlockFragments: x.unlockFragments.filter(
                                  (_, fi) => fi !== fragIdx
                                ),
                              };
                            })
                          )
                        }
                      >
                        Fragment blokk törlése
                      </button>
                    </div>
                  ))}
                </div>
                {!narrativeMultiChoiceUi ? (
                  <p className={s.hintSmall}>
                    Mentéskor a fenti blokkokban megadott azonosítók ehhez a választáshoz
                    kerülnek — a látogató választása után ezek a szövegek válhatnak elérhetővé.
                  </p>
                ) : null}
                <label className={s.saveMilestoneRow}>
                  <input
                    type="checkbox"
                    checked={ch.lockIds.trim().length > 0}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setChoices((c) =>
                        c.map((x, j) => {
                          if (j !== idx) return x;
                          if (on) {
                            return {
                              ...x,
                              lockIds: defaultChoiceLockId(lockIdBase, idx),
                            };
                          }
                          return { ...x, lockIds: "" };
                        })
                      );
                    }}
                  />
                  <span>Választás címkéje (automatikus név)</span>
                  {ch.lockIds.trim() ? (
                    <code className={s.choiceLockIdPreview}>{ch.lockIds.trim()}</code>
                  ) : null}
                </label>
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
            ) : (
              <>
                <label className={s.field}>
                  <div className={s.blockHead}>
                    <span className={s.blockHeadGrow}>
                      CTA gomb (projektbe mentett előbeállítás)
                    </span>
                    {endCtaInlineLocked ? (
                      <EditorInfoHoverPanel ariaLabel="Végoldal CTA: beágyazott gomb">
                        <div className={hi.section}>
                          <p className={hi.sectionBody}>
                            Ennél a végoldalnál a gomb részletei be vannak ágyazva — a Haladó
                            nézetben szerkeszthetők. Preset választással egyszerűbb, előre mentett
                            gombot használhatsz.
                          </p>
                        </div>
                      </EditorInfoHoverPanel>
                    ) : null}
                  </div>
                  <select
                    className={s.input}
                    value={endCtaPresetKey}
                    disabled={endCtaInlineLocked}
                    onChange={(e) => {
                      setEndCtaPresetKey(e.target.value);
                      if (e.target.value.trim()) setEndCtaInlineLocked(false);
                    }}
                  >
                    <option value="">— alapértelmezett vég-gomb a projekt beállításai szerint —</option>
                    {ctaPresetKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </>
        ) : isRiddlePage ? (
          <>
            <div className={s.inspectorControlRow}>
              <p className={s.inspectorHintRowTitle}>Kvíz (riddle) oldal</p>
              <EditorInfoHoverPanel ariaLabel="Kvíz oldal: áttekintés és lánc">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Hogyan épül fel?</h4>
                  <p className={hi.sectionBody}>
                    Egy lapon összerakhatsz bevezető szöveget, opcionálisan feltételes plusz
                    szövegeket (fragmentek), majd egy kérdést válaszgombokkal. A látogató először a
                    szöveget látja, utána a kérdést. A <strong>Helyesnek jelölt</strong> sor a jó
                    válasz; attól függően, mit állítasz be lent, más-más következő oldal következhet.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Több kérdés egymás után</h4>
                  <p className={hi.sectionBody}>
                    Ha egymásra kötött kvíz-lépcsőt építesz, a köztes lépéseknél minden válasz
                    ugyanarra a következő kérdésre visz. Az utolsó lépésnél állíthatod a pontszám
                    szerinti vagy elfogadás szerinti kimenetet.
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
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
              <span className={s.blockHeadGrow}>Fragment feloldás</span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Fragment feloldás (kvíz): útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mi a fragment?</h4>
                    <p className={hi.sectionBody}>
                      <strong>Fragment</strong> = elmentett szövegrészlet, amit egy rövid név (ID)
                      azonosít. Ha a látogatónál „fel van oldva” ez az ID, a szöveg megjelenhet ezen
                      az oldalon: a fő szöveg után, vagy helyette — attól függően, mit állítasz be
                      lent.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Hogyan töltöm ki?</h4>
                    <p className={hi.sectionBody}>
                      Adj blokkot (+ blokk), válassz ID-t a listából. A „Tartalom” mezőbe írd a
                      szöveget; mentéskor a szerkesztő elmenti a projektbe.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mód: hozzáfűzés / felülírás</h4>
                    <p className={hi.sectionBody}>
                      <em>Hozzáfűzés</em> = a fő szöveg után jön a plusz szöveg; az „Elválasztó”
                      mezőbe írhatsz sortörést vagy rövid kötőszöveget. <em>Felülírás</em> = ha aktív
                      a fragment, csak ez a szöveg látszik a fő helyen.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Kvízre tipikusan</h4>
                    <p className={hi.sectionBody}>
                      A riddle oldalon a blokkok ugyanúgy működnek, mint a narratív lapokon: a
                      kiválasztott ID szövege jelenik meg a feltétel teljesülésekor. Ide szokták a
                      „ha már megvan a tipp” extra bekezdéseket tenni, mielőtt a kvíz megjelenne.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button type="button" className={s.btnSm} onClick={addFragRow}>
                  + blokk
                </button>
              </div>
            </div>
            {fragRows.map((row, idx) => (
              <div key={idx} className={s.fragCard}>
                <p className={s.optionCardTitle}>Blokk {idx + 1}</p>
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
                  sections={fragmentPicklistSections}
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
            <div className={s.blockHead}>
              <label htmlFor="inspector-riddle-question" className={s.blockHeadGrow}>
                Kvíz kérdés
              </label>
              <EditorInfoHoverPanel ariaLabel="Kvíz kérdés megfogalmazása">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Hol látszik?</h4>
                  <p className={hi.sectionBody}>
                    A kérdés szövege a válaszgombok <strong>felett</strong> jelenik meg. Fogalmazz
                    egyértelműen (pl. „Melyik állítás igaz?”).
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
            <div className={s.field}>
              <textarea
                id="inspector-riddle-question"
                className={s.textarea}
                value={riddleQuestion}
                onChange={(e) => setRiddleQuestion(e.target.value)}
                rows={2}
                aria-label="Kvíz kérdés"
              />
            </div>
            {riddleChainCtx && !riddleChainCtx.isLast ? (
              <p className={s.hintSmall}>
                Ez a lánc köztes kérdése: a kimeneteket nem lehet szétválasztani —
                minden választás a következő lépésre visz:{" "}
                <code>
                  {riddleChainCtx.rowIds[riddleChainCtx.pageIndex + 1]}
                </code>
                .
              </p>
            ) : null}
            <div className={s.blockHead}>
              <span className={s.blockHeadGrow}>
                Válaszlehetőségek (soronként, mint a több opciós oldal)
              </span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Válaszlehetőségek: útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Válaszok</h4>
                    <p className={hi.sectionBody}>
                      Minden sor egy gomb. Pontosan egy sort jelölj <strong>Helyesnek</strong> — a
                      rendszer ezt tekinti jó válasznak. Legalább két lehetőséget adj; a felirat
                      lehet rövid („A”, „B”) vagy hosszabb mondat.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button
                  type="button"
                  className={s.btnSm}
                  onClick={addRiddleOptionRow}
                >
                  + opció
                </button>
              </div>
            </div>
            {riddleOptionRows.map((row, idx) => {
              const ci = Math.min(
                Math.max(0, Number.parseInt(riddleCorrectIndex, 10) || 0),
                Math.max(0, riddleOptionRows.length - 1)
              );
              const radioName = selectedPageId
                ? `riddle-correct-${selectedPageId}`
                : "riddle-correct";
              return (
                <div
                  key={idx}
                  className={`${s.choiceCard} ${ci === idx ? s.riddleOptPanelSelected : ""}`}
                >
                  <p className={s.optionCardTitle}>Opció {idx + 1}</p>
                  <label className={s.field}>
                    <span>Helyes válasz</span>
                    <label className={s.riddleOptRadio}>
                      <input
                        type="radio"
                        name={radioName}
                        checked={ci === idx}
                        onChange={() => setRiddleCorrectIndex(String(idx))}
                      />
                      <span>Helyesnek jelöl</span>
                    </label>
                  </label>
                  <label className={s.field}>
                    <span>Opció szöveg</span>
                    <input
                      className={s.input}
                      value={row.text}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRiddleOptionRows((r) =>
                          r.map((x, j) =>
                            j === idx ? { ...x, text: v } : x
                          )
                        );
                      }}
                    />
                  </label>
                  {riddleOptionRows.length > 2 ? (
                    <button
                      type="button"
                      className={s.btnGhost}
                      onClick={() => {
                        setRiddleOptionRows((r) => {
                          const next = r.filter((_, j) => j !== idx);
                          const nl = next.length;
                          setRiddleCorrectIndex((prev) => {
                            const p = Number.parseInt(prev, 10) || 0;
                            if (idx < p) return String(Math.max(0, p - 1));
                            if (idx === p)
                              return String(Math.max(0, nl - 1));
                            return String(Math.min(p, nl - 1));
                          });
                          return next;
                        });
                      }}
                    >
                      Opció törlése
                    </button>
                  ) : null}
                </div>
              );
            })}
            <div className={s.blockHead}>
              <label htmlFor="inspector-riddle-correct-label" className={s.blockHeadGrow}>
                Helyes válasz címke (visszajelzés)
              </label>
              <EditorInfoHoverPanel ariaLabel="Helyes válasz címke">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Opcionális üzenet</h4>
                  <p className={hi.sectionBody}>
                    Rövid szöveg jó válasz esetén (pl. „Köszönjük!”). Üresen hagyva az előnézet az
                    alapértelmezett visszajelzést használhatja.
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
            <div className={s.field}>
              <input
                id="inspector-riddle-correct-label"
                className={s.input}
                value={riddleCorrectLabel}
                onChange={(e) => setRiddleCorrectLabel(e.target.value)}
                aria-label="Helyes válasz címke (visszajelzés)"
              />
            </div>
            {riddleChainCtx?.isLast ? (
              <>
                <div className={s.blockHead}>
                  <span className={s.blockHeadGrow}>Utolsó kérdés kimenetei</span>
                  <EditorInfoHoverPanel ariaLabel="Utolsó kérdés kimenetei: útmutató">
                    <div className={hi.section}>
                      <h4 className={hi.sectionTitle}>Pontszám és elfogadás</h4>
                      <p className={hi.sectionBody}>
                        Pontszám szerint választhatsz céloldalt. A <strong>Nem elfogadva</strong>{" "}
                        eset mindig erre az oldalra visz:{" "}
                        <strong>{riddleChainCtx.retryPageId}</strong>. Az <strong>Elfogadva</strong>{" "}
                        soroknál válassz cél lépést vagy záró oldalt.
                      </p>
                    </div>
                  </EditorInfoHoverPanel>
                </div>
                {riddleScoreExitRows.map((row) => (
                  <div key={row.scoreLevel} className={s.riddleScoreCard}>
                    <div className={s.blockHead}>
                      <span>Elért pont / siker: {row.scoreLevel}</span>
                    </div>
                    <div className={s.riddleExitAccRow}>
                      <label className={s.riddleExitAccLabel}>
                        <input
                          type="radio"
                          name={`riddle-exit-acc-${selectedPageId}-${row.scoreLevel}`}
                          checked={row.accepted}
                          onChange={() =>
                            setRiddleScoreExitRows((rows) =>
                              rows.map((r) =>
                                r.scoreLevel === row.scoreLevel
                                  ? { ...r, accepted: true }
                                  : r
                              )
                            )
                          }
                        />
                        Elfogadva
                      </label>
                      <label className={s.riddleExitAccLabel}>
                        <input
                          type="radio"
                          name={`riddle-exit-acc-${selectedPageId}-${row.scoreLevel}`}
                          checked={!row.accepted}
                          onChange={() =>
                            setRiddleScoreExitRows((rows) =>
                              rows.map((r) =>
                                r.scoreLevel === row.scoreLevel
                                  ? { ...r, accepted: false, nextPage: "", endPage: "" }
                                  : r
                              )
                            )
                          }
                        />
                        Nem elfogadva → {riddleChainCtx.retryPageId}
                      </label>
                    </div>
                    {row.accepted ? (
                      <RiddleScoreDestinationSelect
                        label="Cél oldal (normál vagy vég)"
                        value={row.destination}
                        story={draftStory}
                        knownPageIds={knownPageIds}
                        idSet={idSet}
                        onChange={(v) =>
                          setRiddleScoreExitRows((rows) =>
                            rows.map((r) =>
                              r.scoreLevel === row.scoreLevel
                                ? { ...r, destination: v }
                                : r
                            )
                          )
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </>
            ) : null}
            {!riddleChainCtx ? (
              <>
                <label className={s.field}>
                  <span>Válasz típus neve (például: jó / rossz / pont)</span>
                  <input
                    className={s.input}
                    value={riddleSwitchKey}
                    onChange={(e) => setRiddleSwitchKey(e.target.value)}
                  />
                </label>
                <div className={s.blockHead}>
                  <span className={s.blockHeadGrow}>Ágak → cél oldal (cases)</span>
                  <div className={s.blockHeadEnd}>
                    <EditorInfoHoverPanel ariaLabel="Önálló kvíz: ágak és következő oldal">
                      <div className={hi.section}>
                        <h4 className={hi.sectionTitle}>Önálló kvíz lépés</h4>
                        <p className={hi.sectionBody}>
                          A válasz után a rendszer egy rövid név alapján választ következő oldalt
                          (például „jó válasz” / „rossz válasz” / pontérték). A fenti mezőbe írd ezt a
                          nevet. Az „Ágak” táblázatban soronként add meg: milyen névhez melyik
                          következő lépés tartozzon. Érdemes lennie egy „minden más” sorodnak is,
                          ha nem akarsz elakadást.
                        </p>
                      </div>
                    </EditorInfoHoverPanel>
                    <button
                      type="button"
                      className={s.btnSm}
                      onClick={addRiddleCase}
                    >
                      + ág
                    </button>
                  </div>
                </div>
                {riddleCaseRows.map((row, idx) => (
                  <div key={idx} className={s.choiceCard}>
                    <label className={s.field}>
                      <span>Ág neve (például: jó, rossz, 3, alapértelmezett)</span>
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
                            r.map((x, j) =>
                              j === idx ? { ...x, pageId: v } : x
                            )
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
            ) : null}
          </>
        ) : isRunesPage ? (
          <>
            <div className={s.inspectorControlRow}>
              <p className={s.inspectorHintRowTitle}>Szimbólum-választós feladat (runes)</p>
              <EditorInfoHoverPanel ariaLabel="Runes puzzle: részletes útmutató">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Áttekintés</h4>
                  <p className={hi.sectionBody}>
                    A látogató több elemet jelöl ki <strong>halmaz</strong> módban: a helyes
                    megoldás elemei tetszőleges sorrendben kijelölhetők. Ha be van kapcsolva a
                    kötelező megoldás, a rendszer összeveti a kijelölést a helyes elemekkel, és
                    figyelembe veszi, hány elemet lehet választani. Ha elfogynak a próbák, a
                    beállított kudarc-lépés következik.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Ajánlott szerkesztési sorrend</h4>
                  <p className={hi.sectionBody}>
                    1) instrukció, 2) választható elemek listája és helyes jelölés, 3) kötelező
                    megoldásnál: próbák száma, hibás próba utáni viselkedés, siker és kudarc ugrás.
                    Ha később „útvonal” lépést kötsz ehhez, annál a forráslépésnél állítsd be, hogy
                    erre az oldalra érkezzen a folyamat.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Instrukció mező</h4>
                  <p className={hi.sectionBody}>
                    Írd le röviden, mit csináljon a látogató (pl. „Jelöld ki a három helyes
                    ikont.”).
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Opciók</h4>
                  <p className={hi.sectionBody}>
                    Minden sor egy választható elem felirata. Ha a kötelező megoldás be van
                    kapcsolva, pipáld a helyes sorokat — ezek együtt adják a megoldást. Ha ki van
                    kapcsolva, minden beküldés sikeresnek számít.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Min./max. választás és kombinációk</h4>
                  <p className={hi.sectionBody}>
                    Az „útvonal” lépés kombinációs listája a min./max. választás beállításaitól
                    függ. Kötelező megoldásnál a beküldésnek pontosan annyi elemet kell
                    tartalmaznia, amennyit a min./max. mezőkben megadsz.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Kötelező megoldás: hibás próba</h4>
                  <p className={hi.sectionBody}>
                    Csak ha be van kapcsolva a kötelező helyes megoldás, állítható a hibás próba
                    utáni viselkedés (megtartás vagy teljes törlés), a próbák száma és a kudarc
                    ugrás.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Open mód (kötelező megoldás nélkül)</h4>
                  <p className={hi.sectionBody}>
                    Nincs kötelező helyes megoldás: bármely érvényes beküldés sikeresnek számít; a
                    próbák, a hibás próba utáni viselkedés és a kudarc-lépés nem értelmezett.
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
            <div className={s.runesModeBar}>
              <p className={s.runesModeBarLabel}>Puzzle működés</p>
              <div className={s.runesModeToggleRow}>
                <label className={s.runesModeToggle}>
                  <input
                    type="checkbox"
                    checked={runesRequiresCorrect}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setRunesRequiresCorrect(on);
                      setRunesFormError(null);
                      if (!on) {
                        setRunesOptionRows((r) =>
                          r.map((x) => ({ ...x, correct: false }))
                        );
                        setRunesFailGoto("");
                      }
                    }}
                  />
                  <span>Kötelező helyes megoldás</span>
                </label>
              </div>
              <p className={s.runesModeHint}>
                {runesRequiresCorrect
                  ? "Bekapcsolva: a látogató választását a helyesként megjelölt elemekkel vetjük össze. Rossz próbánál csökken a próbák száma, majd a beállított kudarc-lépés következik."
                  : "Kikapcsolva nincs „rossz” megoldás: bármilyen beküldés a sikeres lépésre visz. A kudarc-lépés ilyenkor nem használható."}
              </p>
              {runesFormError ? (
                <p className={s.runesFormError}>{runesFormError}</p>
              ) : null}
            </div>
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
              <span>Opciók</span>
              <button type="button" className={s.btnSm} onClick={addRunesOptionRow}>
                + opció
              </button>
            </div>
            {runesOptionRows.map((row, idx) => (
              <div key={idx} className={s.runesOptBlock}>
                <p className={s.optionCardTitle}>Opció {idx + 1}</p>
                <div className={s.runesOptPanel}>
                  {runesRequiresCorrect ? (
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
                  ) : null}
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
              </div>
            ))}
            {runesRequiresCorrect ? (
              <>
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
              </>
            ) : null}
            <label className={s.field}>
              <span>Min. választható elemszám (open mód)</span>
              <input
                className={s.input}
                type="number"
                min={1}
                placeholder="üres = max-szal azonos"
                value={runesMinPick}
                onChange={(e) => setRunesMinPick(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Max. választható elemszám</span>
              <input
                className={s.input}
                type="number"
                min={1}
                placeholder="üres = answer hossz vagy 2"
                value={runesMaxPick}
                onChange={(e) => setRunesMaxPick(e.target.value)}
              />
            </label>
            {runesRequiresCorrect ? (
              <label className={s.field}>
                <span>Hibás próba után</span>
                <select
                  className={s.input}
                  value={runesFeedback}
                  onChange={(e) => setRunesFeedback(e.target.value)}
                >
                  <option value="keep">
                    A már helyesen megjelölt elemek megmaradnak — csak a hibás
                    újrapróbálható
                  </option>
                  <option value="reset">
                    Minden kijelölés törlődik — a próba elölről kezdődik
                  </option>
                </select>
              </label>
            ) : null}
            <label className={s.field}>
              <span>Sikeres beküldés után → oldal (id)</span>
              <input
                className={`${s.input} ${runesSuccessGoto && !idSet.has(runesSuccessGoto) ? s.inputWarn : ""}`}
                value={runesSuccessGoto}
                list="editor-known-page-ids"
                onChange={(e) => setRunesSuccessGoto(e.target.value)}
              />
            </label>
            {runesRequiresCorrect ? (
              <label className={s.field}>
                <span>Sikertelen / próbák elfogyása után → oldal (id)</span>
                <input
                  className={`${s.input} ${runesFailGoto && !idSet.has(runesFailGoto) ? s.inputWarn : ""}`}
                  value={runesFailGoto}
                  list="editor-known-page-ids"
                  onChange={(e) => setRunesFailGoto(e.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : isEditorPuzzleRoutePage ? (
          <>
            <div className={s.inspectorControlRow}>
              <p className={s.inspectorHintRowTitle}>Puzzle útvonal (kombinációk)</p>
              <EditorInfoHoverPanel ariaLabel="Puzzle útvonal: részletes útmutató">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Mit állítasz itt?</h4>
                  <p className={hi.sectionBody}>
                    Itt adod meg: a szimbólumos feladat <strong>sikeres</strong> beküldése után
                    melyik választás-kombináció melyik következő lépésre vigyen. A forráslépésnél
                    állítsd be, hogy a folyamat erre az „útvonal” lépésre érkezzen. Egyszerűbb
                    feladatnál elég csak a kombinációk és célok kitöltése.
                  </p>
                </div>
                {page.type === "logic" || page.type === "puzzleOutcomeLogic" ? (
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Régi forma</h4>
                    <p className={hi.sectionBody}>
                      Mentéskor a szerkesztő egységes „útvonal” formára rendezi ezt a lépést.
                    </p>
                  </div>
                ) : null}
              </EditorInfoHoverPanel>
            </div>
            <label className={s.field}>
              <span>Forrás puzzle (runes oldal)</span>
              <select
                className={s.input}
                value={routeSourcePageId}
                onChange={(e) => setRouteSourcePageId(e.target.value)}
              >
                <option value="">— válassz runes oldalt —</option>
                {runesSourcePageIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            {routeExpectedKeys.length > 0 ? (
              <p className={s.hintSmall} role="status">
                Kombinációk: {routeExpectedKeys.length} összesen; kitöltve:{" "}
                {
                  routeExpectedKeys.filter(
                    (k) => (routeAssignments[k] ?? "").trim() !== ""
                  ).length
                }
                ; hiány:{" "}
                {
                  routeExpectedKeys.filter(
                    (k) => !(routeAssignments[k] ?? "").trim()
                  ).length
                }
                . Késznek számít, ha minden kombinációhoz van céloldal.
              </p>
            ) : routeSourcePageId.trim() ? (
              <p className={s.hintSmall}>
                A kiválasztott oldal nem runes puzzle, vagy nincs rajta opció.
              </p>
            ) : null}
            <div className={s.blockHead}>
              <span>Kombináció → cél oldal</span>
              <button
                type="button"
                className={s.btnSm}
                onClick={() => {
                  const sid = routeSourcePageId.trim();
                  if (!sid) return;
                  const sp = findPageInStoryDocument(draftStory, sid);
                  const opts = Array.isArray(sp?.options)
                    ? (sp.options as unknown[]).filter(
                        (x): x is string => typeof x === "string" && !!x.trim()
                      )
                    : [];
                  const candidates = knownPageIds.map((id) => {
                    const p = findPageInStoryDocument(draftStory, id);
                    return {
                      id,
                      title:
                        typeof p?.title === "string" ? p.title : undefined,
                    };
                  });
                  setRouteAssignments((prev) => {
                    const next = { ...prev };
                    for (const k of routeExpectedKeys) {
                      if ((next[k] ?? "").trim()) continue;
                      const sug = suggestPageIdForRouteKey(k, opts, candidates);
                      if (sug) next[k] = sug;
                    }
                    return next;
                  });
                }}
              >
                Javaslat üres sorokra
              </button>
            </div>
            {routeExpectedKeys.map((key) => {
              const src = findPageInStoryDocument(
                draftStory,
                routeSourcePageId.trim()
              );
              const opts = Array.isArray(src?.options)
                ? (src.options as unknown[]).filter(
                    (x): x is string => typeof x === "string" && !!x.trim()
                  )
                : [];
              const label = formatRouteKeyWithLabels(key, opts);
              return (
                <div key={key} className={s.choiceCard}>
                  <RiddleScoreDestinationSelect
                    label={label}
                    value={routeAssignments[key] ?? ""}
                    onChange={(v) =>
                      setRouteAssignments((prev) => ({ ...prev, [key]: v }))
                    }
                    story={draftStory}
                    knownPageIds={knownPageIds}
                    idSet={idSet}
                  />
                </div>
              );
            })}
          </>
        ) : isEditorDecisionPage ? (
          <>
            <div className={s.inspectorControlRow}>
              <p className={s.inspectorHintRowTitle}>Döntési pool</p>
              <EditorInfoHoverPanel ariaLabel="Döntési pool: részletes útmutató">
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Mi ez a lépés?</h4>
                  <p className={hi.sectionBody}>
                    <strong>Döntési pool lépés:</strong> itt egyszerre több, egymás melletti
                    választási „helyet” (slotot) adsz meg. A látogatónak minden slotból egy gomb
                    jelenik meg — a gomb felirata és hova visz, az alábbi párokból jön.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Elsődleges és tartalék</h4>
                  <p className={hi.sectionBody}>
                    Minden slothoz <strong>két opció</strong> tartozik: egy{" "}
                    <strong>elsődleges</strong> és egy <strong>tartalék</strong>. Alapból az
                    elsődleges szöveg és céloldal látszik. Ha a látogató a folyamat során{" "}
                    <strong>már járt</strong> az elsődleges céloldalon, ugyanazon a helyen a
                    tartalék szövege és célja kerül elő — így elkerülhető, hogy ugyanazt az ágat
                    kényszerítve ismételje a rendszer.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Gombok a helyekhez</h4>
                  <p className={hi.sectionBody}>
                    Az <strong>„Elsődleges / tartalék csere”</strong> gomb felcseréli a két
                    opció szerepét egy slotban (melyik számít „alap” útvonalnak, és melyik
                    tartaléknak). A <strong>„+ hely”</strong> új párost ad hozzá (mindig páros
                    számú opció kell); felesleges párokat az <strong>„Utolsó hely törlése”</strong>{" "}
                    távolítja el.
                  </p>
                </div>
                <div className={hi.section}>
                  <h4 className={hi.sectionTitle}>Választás címkéje és fő szöveg</h4>
                  <p className={hi.sectionBody}>
                    A <strong>választás címkéje</strong> (pipa) ugyanazt adja, mint a több opciós
                    lépéseknél: <strong>állandó nevet</strong> a gombhoz, hogy a{" "}
                    <strong>pontozó</strong> szabályai tudják, melyik út választódott. Ha nem
                    építesz pontozót, általában nem kell. A „Fő szöveg” opcionális; ha kitöltöd, a
                    látogató a választási helyek felett is olvashat rövid útmutatót.
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
            <label className={s.field}>
              <span>Fő szöveg (opcionális)</span>
              <textarea
                className={s.textarea}
                rows={3}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
              />
            </label>
            <div className={s.blockHead}>
              <span>Választási helyek száma: {Math.floor(decisionChoices.length / 2)}</span>
              <button
                type="button"
                className={s.btnSm}
                onClick={() =>
                  setChoices((prev) => {
                    const n = normalizeDecisionChoices(prev);
                    const pairCount = Math.floor(n.length / 2);
                    n.splice(pairCount, 0, emptyChoiceForm()); // új primary a primary blokk végére
                    n.push(emptyChoiceForm()); // új fallback a fallback blokk végére
                    return n;
                  })
                }
              >
                + hely
              </button>
            </div>
            {Math.floor(decisionChoices.length / 2) > 1 ? (
              <button
                type="button"
                className={s.btnGhost}
                onClick={() =>
                  setChoices((prev) => {
                    const n = normalizeDecisionChoices(prev);
                    const pairCount = Math.floor(n.length / 2);
                    if (pairCount <= 1) return n;
                    n.splice(pairCount - 1, 1); // utolsó primary törlés
                    n.pop(); // utolsó fallback törlés
                    return n;
                  })
                }
              >
                Utolsó hely törlése
              </button>
            ) : null}
            {Array.from({ length: Math.floor(decisionChoices.length / 2) }, (_, slot) => {
              const primaryIdx = slot;
              const pairCount = Math.floor(decisionChoices.length / 2);
              const fallbackIdx = slot + pairCount;
              const primary = decisionChoices[primaryIdx]!;
              const fallback = decisionChoices[fallbackIdx]!;
              return (
                <div key={slot} className={s.choiceCard}>
                  <p className={s.optionCardTitle}>Választási hely {slot + 1}</p>
                  <button
                    type="button"
                    className={s.btnSm}
                    onClick={() =>
                      setChoices((prev) => {
                        const next = normalizeDecisionChoices(prev);
                        const nPairs = Math.floor(next.length / 2);
                        const pIdx = slot;
                        const fIdx = slot + nPairs;
                        const keep = next[pIdx]!;
                        next[pIdx] = next[fIdx]!;
                        next[fIdx] = keep;
                        return next;
                      })
                    }
                  >
                    Elsődleges / tartalék csere
                  </button>
                  <label className={s.field}>
                    <span>Elsődleges felirat</span>
                    <input
                      className={s.input}
                      value={primary.text}
                      onChange={(e) => {
                        const v = e.target.value;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const pIdx = slot;
                          next[pIdx] = { ...next[pIdx]!, text: v };
                          return next;
                        });
                      }}
                    />
                  </label>
                  <label className={s.field}>
                    <span>Elsődleges céloldal (id)</span>
                    <input
                      className={`${s.input} ${primary.next.trim() && !idSet.has(primary.next.trim()) ? s.inputWarn : ""}`}
                      value={primary.next}
                      list="editor-known-page-ids"
                      onChange={(e) => {
                        const v = e.target.value;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const pIdx = slot;
                          next[pIdx] = { ...next[pIdx]!, next: v };
                          return next;
                        });
                      }}
                    />
                  </label>
                  <label className={s.saveMilestoneRow}>
                    <input
                      type="checkbox"
                      checked={primary.lockIds.trim().length > 0}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const pIdx = slot;
                          const cur = next[pIdx]!;
                          next[pIdx] = {
                            ...cur,
                            lockIds: on
                              ? defaultChoiceLockId(lockIdBase, pIdx)
                              : "",
                          };
                          return next;
                        });
                      }}
                    />
                    <span>Elsődleges — választás címkéje (automatikus név)</span>
                    {primary.lockIds.trim() ? (
                      <code className={s.choiceLockIdPreview}>
                        {primary.lockIds.trim()}
                      </code>
                    ) : null}
                  </label>
                  <label className={s.field}>
                    <span>Tartalék felirat</span>
                    <input
                      className={s.input}
                      value={fallback.text}
                      onChange={(e) => {
                        const v = e.target.value;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const nPairs = Math.floor(next.length / 2);
                          const fIdx = slot + nPairs;
                          next[fIdx] = { ...next[fIdx]!, text: v };
                          return next;
                        });
                      }}
                    />
                  </label>
                  <label className={s.field}>
                    <span>Tartalék céloldal (id)</span>
                    <input
                      className={`${s.input} ${fallback.next.trim() && !idSet.has(fallback.next.trim()) ? s.inputWarn : ""}`}
                      value={fallback.next}
                      list="editor-known-page-ids"
                      onChange={(e) => {
                        const v = e.target.value;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const nPairs = Math.floor(next.length / 2);
                          const fIdx = slot + nPairs;
                          next[fIdx] = { ...next[fIdx]!, next: v };
                          return next;
                        });
                      }}
                    />
                  </label>
                  <label className={s.saveMilestoneRow}>
                    <input
                      type="checkbox"
                      checked={fallback.lockIds.trim().length > 0}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setChoices((prev) => {
                          const next = normalizeDecisionChoices(prev);
                          const nPairs = Math.floor(next.length / 2);
                          const fIdx = slot + nPairs;
                          const cur = next[fIdx]!;
                          next[fIdx] = {
                            ...cur,
                            lockIds: on
                              ? defaultChoiceLockId(lockIdBase, fIdx)
                              : "",
                          };
                          return next;
                        });
                      }}
                    />
                    <span>Tartalék — választás címkéje (automatikus név)</span>
                    {fallback.lockIds.trim() ? (
                      <code className={s.choiceLockIdPreview}>
                        {fallback.lockIds.trim()}
                      </code>
                    ) : null}
                  </label>
                </div>
              );
            })}
          </>
        ) : isEditorScorecardPageFlag ? (
          <>
            {scorecardLockSources.length === 0 ? (
              <p className={s.hintSmall} role="status">
                Még nincs automatikusan felkínált <strong>választás-címke</strong> a projektben —
                töltsd ki a szabályokat kézzel, vagy kapcsold be a „választás címkéje” mezőt a
                döntő kérdések (több opciós) oldalain, hogy a pontozó kiválaszthassa a választást.
              </p>
            ) : null}
            <label className={s.field}>
              <span>Szöveg (opcionális, megjelenhet az ugrás előtt)</span>
              <textarea
                className={s.textarea}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                rows={4}
              />
            </label>
            <div className={s.blockHead}>
              <span className={s.blockHeadGrow}>
                Szabályok (feltételek → céloldal)
              </span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Pontozó: részletes útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Működés</h4>
                    <p className={hi.sectionBody}>
                      <strong>Pontozó / feltételes ugrás:</strong> a szabályok egyszerre
                      teljesülő feltételekből állnak. Egy döntő kérdés oldalról szabályonként
                      csak egy választás köthető. Ha speciális azonosítót adsz meg, azt kézzel is
                      beírhatod a feltételhez.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Ha még nincs szabály</h4>
                    <p className={hi.sectionBody}>
                      Állíts be legalább egy szabályt, vagy adj meg fallback céloldalt — különben
                      nem lesz egyértelmű, hova ugorjon a látogató.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button type="button" className={s.btnSm} onClick={addScorecardRuleRow}>
                  + szabály
                </button>
              </div>
            </div>
            {scorecardRuleRows.length === 0 ? null : (
              scorecardRuleRows.map((row, idx) => {
                const conds = row.conditions ?? [];
                const dupPages = scorecardRuleHasDuplicateSourcePages(conds);
                const ruleOpen = scorecardRuleOpenIndices.has(idx);
                const gotoPreview = row.goto.trim() || "—";
                return (
                  <details
                    key={idx}
                    className={s.choiceCard}
                    open={ruleOpen}
                  >
                    <summary
                      className={`${s.foldSummary} ${s.scorecardRuleFoldSummary}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setScorecardRuleOpenIndices((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      }}
                    >
                      <span className={s.scorecardRuleFoldChevron} aria-hidden>
                        {ruleOpen ? "\u25bc" : "\u25b6"}
                      </span>
                      <span className={s.scorecardRuleFoldTitle}>
                        Szabály {idx + 1}
                      </span>
                      <span className={s.scorecardRuleFoldMeta}>
                        · {conds.length} felt. → {gotoPreview}
                      </span>
                      {dupPages ? (
                        <span
                          className={s.scorecardRuleFoldWarn}
                          title="Ugyanabból az oldalról többször választottál kimenetet"
                          aria-label="Figyelmeztetés: ütköző forrás oldalak"
                        >
                          {"\u26a0"}
                        </span>
                      ) : null}
                    </summary>
                    <div className={s.foldBody}>
                      {dupPages ? (
                        <p className={s.err}>
                          Ugyanabból az oldalról többször választottál kimenetet — törölj
                          vagy módosíts, különben a mentés hibás kombinációt írna.
                        </p>
                      ) : null}
                      {conds.length === 0 ? (
                        <p className={s.hintSmall}>
                          Még nincs feltétel ebben a szabályban.
                        </p>
                      ) : (
                        conds.map((cond, cidx) => {
                        const taken = new Set<string>();
                        conds.forEach((c, j) => {
                          if (j !== cidx && c.mode === "pick" && c.pageId)
                            taken.add(c.pageId);
                        });
                        return (
                          <div key={cidx} className={s.fragCard}>
                            {cond.mode === "pick" ? (
                              <>
                                <label className={s.field}>
                                  <span>Döntési oldal (lock forrás)</span>
                                  <select
                                    className={s.input}
                                    value={cond.pageId}
                                    onChange={(e) => {
                                      const pid = e.target.value;
                                      setScorecardRuleRows((r) =>
                                        r.map((x, j) => {
                                          if (j !== idx) return x;
                                          const next = [...(x.conditions ?? [])];
                                          next[cidx] = {
                                            mode: "pick",
                                            pageId: pid,
                                            outcomeIndex: 0,
                                          };
                                          return { ...x, conditions: next };
                                        })
                                      );
                                    }}
                                  >
                                    <option value="">— válassz oldalt —</option>
                                    {scorecardLockSources
                                      .filter(
                                        (src) =>
                                          !taken.has(src.pageId) ||
                                          src.pageId === cond.pageId
                                      )
                                      .map((src) => (
                                        <option key={src.pageId} value={src.pageId}>
                                          {src.pageTitle} ({src.pageId})
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label className={s.field}>
                                  <span>Választás (címke szerint)</span>
                                  <select
                                    className={s.input}
                                    disabled={!cond.pageId}
                                    value={String(cond.outcomeIndex)}
                                    onChange={(e) => {
                                      const oi = Number.parseInt(e.target.value, 10) || 0;
                                      setScorecardRuleRows((r) =>
                                        r.map((x, j) => {
                                          if (j !== idx) return x;
                                          const next = [...(x.conditions ?? [])];
                                          next[cidx] = {
                                            mode: "pick",
                                            pageId: cond.pageId,
                                            outcomeIndex: oi,
                                          };
                                          return { ...x, conditions: next };
                                        })
                                      );
                                    }}
                                  >
                                    {(
                                      scorecardLockSources.find(
                                        (s) => s.pageId === cond.pageId
                                      )?.outcomes ?? []
                                    ).map((o, oi) => (
                                      <option key={oi} value={String(oi)}>
                                        {o.choiceLabel} — címke: {o.lockIds.join(", ")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </>
                            ) : (
                              <label className={s.field}>
                                <span>Kézi feltétel ID</span>
                                <input
                                  className={s.input}
                                  value={cond.rawId}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setScorecardRuleRows((r) =>
                                      r.map((x, j) => {
                                        if (j !== idx) return x;
                                        const next = [...(x.conditions ?? [])];
                                        next[cidx] = { mode: "custom", rawId: v };
                                        return { ...x, conditions: next };
                                      })
                                    );
                                  }}
                                />
                              </label>
                            )}
                            <button
                              type="button"
                              className={s.btnGhost}
                              onClick={() =>
                                setScorecardRuleRows((r) =>
                                  r.map((x, j) => {
                                    if (j !== idx) return x;
                                    return {
                                      ...x,
                                      conditions: (x.conditions ?? []).filter(
                                        (_, k) => k !== cidx
                                      ),
                                    };
                                  })
                                )
                              }
                            >
                              Feltétel törlése
                            </button>
                          </div>
                        );
                      })
                    )}
                    <div className={s.blockHead}>
                      <span>Feltétel hozzáadása</span>
                      <button
                        type="button"
                        className={s.btnSm}
                        onClick={() =>
                          setScorecardRuleRows((r) =>
                            r.map((x, j) => {
                              if (j !== idx) return x;
                              const first = scorecardLockSources[0];
                              return {
                                ...x,
                                conditions: [
                                  ...(x.conditions ?? []),
                                  {
                                    mode: "pick",
                                    pageId: first?.pageId ?? "",
                                    outcomeIndex: 0,
                                  },
                                ],
                              };
                            })
                          )
                        }
                      >
                        + választás alapján
                      </button>
                      <button
                        type="button"
                        className={s.btnSm}
                        onClick={() =>
                          setScorecardRuleRows((r) =>
                            r.map((x, j) => {
                              if (j !== idx) return x;
                              return {
                                ...x,
                                conditions: [
                                  ...(x.conditions ?? []),
                                  { mode: "custom", rawId: "" },
                                ],
                              };
                            })
                          )
                        }
                      >
                        + kézi ID
                      </button>
                    </div>
                    <label className={s.field}>
                      <span>Céloldal (id)</span>
                      <input
                        className={`${s.input} ${row.goto.trim() && !idSet.has(row.goto.trim()) ? s.inputWarn : ""}`}
                        value={row.goto}
                        list="editor-known-page-ids"
                        onChange={(e) => {
                          const v = e.target.value;
                          setScorecardRuleRows((r) =>
                            r.map((x, j) => (j === idx ? { ...x, goto: v } : x))
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={s.btnGhost}
                      onClick={() => {
                        setScorecardRuleRows((r) => r.filter((_, j) => j !== idx));
                        setScorecardRuleOpenIndices((prev) => {
                          const next = new Set<number>();
                          for (const i of prev) {
                            if (i === idx) continue;
                            if (i > idx) next.add(i - 1);
                            else next.add(i);
                          }
                          return next;
                        });
                      }}
                    >
                      Szabály törlése
                    </button>
                    </div>
                  </details>
                );
              })
            )}
            <label className={s.field}>
              <span>Fallback céloldal (ha egyik szabály sem illeszkedik)</span>
              <input
                className={`${s.input} ${scorecardFallbackField.trim() && !idSet.has(scorecardFallbackField.trim()) ? s.inputWarn : ""}`}
                value={scorecardFallbackField}
                list="editor-known-page-ids"
                onChange={(e) => setScorecardFallbackField(e.target.value)}
              />
            </label>
          </>
        ) : isOtherPuzzle ? (
          <>
            <label className={s.field}>
              <div className={s.blockHead}>
                <span className={s.blockHeadGrow}>
                  Puzzle (egyéb kind) — szöveg / jegyzet
                </span>
                <EditorInfoHoverPanel ariaLabel="Egyéb puzzle: útmutató">
                  <div className={hi.section}>
                    <p className={hi.sectionBody}>
                      Ezt a feladatotípust a szerkesztő még nem bontja ki külön űrlapon. A lenti
                      mező jegyzetnek vagy rövid szövegnek használható; a részletes mezőket a
                      Haladó nézetben érdemes szerkeszteni.
                    </p>
                  </div>
                </EditorInfoHoverPanel>
              </div>
              <textarea
                className={s.textarea}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                rows={4}
              />
            </label>
          </>
        ) : isLogic ? (
          <>
            <div className={s.blockHead}>
              <span className={s.blockHeadGrow}>Ha megvan a fragment → ugrás</span>
              <div className={s.blockHeadEnd}>
                <EditorInfoHoverPanel ariaLabel="Feltételes ugrás: részletes útmutató">
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Mi történik ezen a lépésen?</h4>
                    <p className={hi.sectionBody}>
                      <strong>Feltételes ugrás (fragment alapján):</strong> ez a lépés a
                      látogatónak nem tartalomként jelenik meg — rögtön továbbvisz egy másik
                      oldalra. A rendszer megnézi, melyik <strong>feloldott szövegrészlet</strong>{" "}
                      (fragment) tartozik már a látogatóhoz, és aszerint választ útvonalat.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Honnan jönnek a fragmentek?</h4>
                    <p className={hi.sectionBody}>
                      A fragmenteket korábbi lépések „adják”: például választás után, mérföldkő
                      mentésénél vagy más lépés beállításainál. A listában olyan azonosítókat
                      válassz, amelyek a projektben tényleg előfordulnak — így nem marad üresen
                      egy ág.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Sorrend</h4>
                    <p className={hi.sectionBody}>
                      <strong>Sorrend számít:</strong> a „Ha megvan a fragment → ugrás” sorokat
                      felülről lefelé vizsgálja a rendszer; az <strong>első</strong> olyan sor
                      nyer, amelynél a megadott fragment már fel van oldva, és a hozzá tartozó
                      céloldalra ugrik.
                    </p>
                  </div>
                  <div className={hi.section}>
                    <h4 className={hi.sectionTitle}>Egyébként ág</h4>
                    <p className={hi.sectionBody}>
                      Ha van legalább egy ilyen feltétel-sor, töltsd ki az{" "}
                      <strong>„Egyébként → oldal”</strong> mezőt is. Ha egyik feltétel sem illik és
                      nincs egyébként ág, a látogató <strong>beragadhat</strong> erre a lépésre.
                      Ha nincs egyetlen feltétel-sor sem, csak az egyébként ág irányít (ha
                      megadtad).
                    </p>
                  </div>
                </EditorInfoHoverPanel>
                <button type="button" className={s.btnSm} onClick={addLogicIfRow}>
                  + ág
                </button>
              </div>
            </div>
            {logicIfRows.length === 0 ? (
              <p className={s.hintSmall}>
                Még nincs feltétel-sor: csak az „Egyébként” irányít tovább (ha kitöltöd a cél
                oldal azonosítóját). Ha üresen hagyod az egyébként mezőt is, ez a lépés nem
                visz tovább automatikusan.
              </p>
            ) : (
              logicIfRows.map((row, idx) => (
                <div key={idx} className={s.choiceCard}>
                  <p className={s.optionCardTitle}>Ág {idx + 1}</p>
                  <FragmentIdSelect
                    label="Fragment (ha a látogatónál fel van oldva)"
                    value={row.fragment}
                    onChange={(v) => {
                      setLogicIfRows((r) =>
                        r.map((x, j) =>
                          j === idx ? { ...x, fragment: v } : x
                        )
                      );
                    }}
                    sections={fragmentPicklistSections}
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
        <datalist id="editor-fragment-id-hints">
          {fragmentIdHintOptions.map((id) => (
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

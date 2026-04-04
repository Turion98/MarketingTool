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
  const [runesMode, setRunesMode] = useState("set");
  const [runesFeedback, setRunesFeedback] = useState("keep");
  const [runesSuccessGoto, setRunesSuccessGoto] = useState("");
  const [runesFailGoto, setRunesFailGoto] = useState("");
  /** Van kötelező helyes megoldás (`answer` tömb nem üres mentéskor). */
  const [runesRequiresCorrect, setRunesRequiresCorrect] = useState(true);
  const [runesFormError, setRunesFormError] = useState<string | null>(null);
  const [runesMinPick, setRunesMinPick] = useState("");
  const [runesMaxPick, setRunesMaxPick] = useState("");

  const [routeSourcePageId, setRouteSourcePageId] = useState("");
  const [routeDefaultGoto, setRouteDefaultGoto] = useState("");
  const [routeAssignments, setRouteAssignments] = useState<
    Record<string, string>
  >({});

  const [logicIfRows, setLogicIfRows] = useState<LogicIfForm[]>([]);
  const [logicElseGoTo, setLogicElseGoTo] = useState("");
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

  const clearPageIdClickTimer = useCallback(() => {
    if (pageIdClickTimerRef.current != null) {
      clearTimeout(pageIdClickTimerRef.current);
      pageIdClickTimerRef.current = null;
    }
  }, []);

  const fragmentPicklistSections = useMemo(() => {
    const sections = buildFragmentPicklistSections(
      draftStory,
      choices.map((c) => c.unlockIds)
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
      setRunesMode("set");
      setRunesFeedback("keep");
      setRunesSuccessGoto("");
      setRunesFailGoto("");
      setRunesRequiresCorrect(true);
      setRunesFormError(null);
      setRunesMinPick("");
      setRunesMaxPick("");
      setRouteSourcePageId("");
      setRouteDefaultGoto("");
      setRouteAssignments({});
      setSaveMilestone(false);
      setEndCtaPresetKey("");
      setEndCtaInlineLocked(false);
      return;
    }

    const logicRec = asRecord(page.logic);
    const isObjectLogic = Boolean(logicRec);

    setTitle(typeof page.title === "string" ? page.title : "");
    setSaveMilestone(
      selectedPageId
        ? editorPageMilestoneActive(draftStory, selectedPageId)
        : false
    );

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
      setRunesMode(typeof page.mode === "string" ? page.mode : "set");
      setRunesFeedback(
        typeof page.feedback === "string" ? page.feedback : "keep"
      );
      const os = asRecord(page.onSuccess);
      const of = asRecord(page.onFail);
      setRunesSuccessGoto(typeof os?.goto === "string" ? os.goto : "");
      setRunesFailGoto(typeof of?.goto === "string" ? of.goto : "");
      const ansArr = Array.isArray(page.answer) ? page.answer : [];
      const hasGradedAnswer = ansArr.some(
        (x) => typeof x === "string" && x.trim()
      );
      setRunesRequiresCorrect(hasGradedAnswer);
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
      setRunesMode("set");
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
      setRouteDefaultGoto(h.defaultGoto);
      setRouteAssignments(h.assignments);
    } else {
      setRouteSourcePageId("");
      setRouteDefaultGoto("");
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
    const t = pageIdDraft.trim();
    if (t === selectedPageId) {
      setPageIdError(null);
      return;
    }
    if (!t) {
      if (isEditorPendingPageId(selectedPageId)) {
        setPageIdError("Add meg az oldal egyedi azonosítóját.");
      }
      return;
    }
    const err = onRenamePageId(selectedPageId, t);
    if (err) setPageIdError(err);
    else setPageIdError(null);
  }, [selectedPageId, pageIdDraft, onRenamePageId]);

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
        !isEditorLogicPage(nextPage as Record<string, unknown>)
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
          "Jelölj legalább egy helyes opciót, vagy kapcsold ki a kötelező helyes megoldást."
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
        maxAttempts: Math.max(1, Number.parseInt(runesMaxAttempts, 10) || 3),
        minPick: minPickVal,
        maxPick: maxPickVal,
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
          const mode = sp.mode === "ordered" ? "ordered" : "set";
          keys = generatePuzzleRouteKeys(n, minPick, maxPick, mode);
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
        defaultGoto: routeDefaultGoto.trim(),
      };
      delete nextP.choices;
      delete nextP.logic;
      delete nextP.text;
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

    if (page && isEditorLogicPage(page as Record<string, unknown>)) {
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
    runesMode,
    runesFeedback,
    runesSuccessGoto,
    runesFailGoto,
    runesRequiresCorrect,
    runesMinPick,
    runesMaxPick,
    routeSourcePageId,
    routeDefaultGoto,
    routeAssignments,
    logicIfRows,
    logicElseGoTo,
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
        unlockIds: "",
        visibilityMode: "none",
        visibilityFragment: "",
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

  const addRunesOptionRow = useCallback(() => {
    setRunesOptionRows((r) => [...r, { ...EMPTY_RUNES_OPTION }]);
  }, []);

  const idSet = useMemo(() => new Set(knownPageIds), [knownPageIds]);

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
    const mode = sp.mode === "ordered" ? "ordered" : "set";
    return generatePuzzleRouteKeys(n, minPick, maxPick, mode);
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
    setRouteAssignments((prev) => {
      const next: Record<string, string> = { ...prev };
      let changed = false;
      for (const k of keys) {
        if (next[k] === undefined) {
          next[k] = "";
          changed = true;
        }
      }
      for (const ok of Object.keys(next)) {
        if (!keys.includes(ok)) {
          delete next[ok];
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
                      : "Nincs oldal a sztoriban"}
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
          <p className={s.muted}>Válassz egy oldalt a vásznon a részletekhez.</p>
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
          <p className={s.hintSmall}>
            Egy kattintás az ID sávra vagy a ▼ gomb: lista. Kattinthatsz egy kártyára a
            vásznon is.
          </p>
        </div>
      </div>
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
          <p className={s.err}>Az oldal nem található: {selectedPageId}</p>
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
  const isLogic = Boolean(logic) && !isEditorPuzzleRoutePage;
  const isEndPage = page.type === "end";
  const milestoneEligible =
    !isEditorLogicPage(page as Record<string, unknown>) && !isEndPage;

  return (
    <div className={s.details}>
      <div className={s.summaryRow}>
        <h3 className={s.summary}>Oldal részletek</h3>
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
                <strong>Oldalazonosító szükséges.</strong> Adj meg egy egyedi ID-t
                (pl. <code>chapter_3_shop</code>). Ha másik oldalt választasz a
                listában vagy a vásznon, ez a vázlat eltűnik.
              </div>
            ) : null}
            {renderPageIdUnifiedBar()}
            {(() => {
              const hints: string[] = [];
              if (onSelectPageInEditor) {
                hints.push(
                  "Egy kattintás az ID sávra: lista (▼ azonnal). A lista a vásznat és az előnézetet is erre állítja."
                );
              }
              if (onRenamePageId && !pageIdError) {
                hints.push(
                  "Dupla kattintás az ID-n: átírás. A vászonon a kártya fejlécében is szerkeszthető."
                );
              }
              if (onSelectPageInEditor && pageIdError) {
                hints.push("Másik oldal: lista vagy ▼.");
              }
              if (!hints.length) return null;
              return <p className={s.hintSmall}>{hints.join(" ")}</p>;
            })()}
          </div>
        ) : null}

        {milestoneEligible ? (
          <label className={s.saveMilestoneRow}>
            <input
              type="checkbox"
              checked={saveMilestone}
              onChange={(e) => setSaveMilestone(e.target.checked)}
            />
            <span>Milestone (oldalazonosító alapú)</span>
            {saveMilestone && selectedPageId ? (
              <span className={s.saveMilestoneHint}>
                Fragment: <code>{canonicalMilestoneFragmentId(`${selectedPageId}_DONE`)}</code> —
                belépéskor feloldódik a játékban. Mentéskor a történetben is beállítjuk a flaget és a
                bank kulcsot.
              </span>
            ) : null}
          </label>
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
        !isEditorPuzzleRoutePage ? (
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

            {!isEndPage ? (
              <>
            <div className={s.blockHead}>
              <span>Opciók (kötelező: szöveg + következő oldal)</span>
              <button type="button" className={s.btnSm} onClick={addChoice}>
                + opció
              </button>
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
                <label className={s.field}>
                  <span>Mentett fragment id-k (vesszővel)</span>
                  <input
                    className={s.input}
                    value={ch.unlockIds}
                    placeholder="pl. A1_DONE, B_DONE"
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
                      sections={fragmentPicklistSections}
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
            ) : (
              <>
                {endCtaInlineLocked ? (
                  <p className={s.hintSmall}>
                    Az <code>endMeta.cta</code> egy beágyazott objektum — a JSON
                    nézetben szerkeszthető. Preset kulcs választásával felülírhatod
                    string hivatkozásra.
                  </p>
                ) : null}
                <label className={s.field}>
                  <span>
                    CTA preset (<code>meta.ctaPresets</code> kulcs)
                  </span>
                  <select
                    className={s.input}
                    value={endCtaPresetKey}
                    disabled={endCtaInlineLocked}
                    onChange={(e) => {
                      setEndCtaPresetKey(e.target.value);
                      if (e.target.value.trim()) setEndCtaInlineLocked(false);
                    }}
                  >
                    <option value="">
                      — alapértelmezett (meta.endDefaultCta / motor) —
                    </option>
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
            <label className={s.field}>
              <span>Kvíz kérdés</span>
              <textarea
                className={s.textarea}
                value={riddleQuestion}
                onChange={(e) => setRiddleQuestion(e.target.value)}
                rows={2}
              />
            </label>
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
              <span>Válaszlehetőségek (soronként, mint a több opciós oldal)</span>
              <button
                type="button"
                className={s.btnSm}
                onClick={addRiddleOptionRow}
              >
                + opció
              </button>
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
            <label className={s.field}>
              <span>Helyes válasz címke (visszajelzés)</span>
              <input
                className={s.input}
                value={riddleCorrectLabel}
                onChange={(e) => setRiddleCorrectLabel(e.target.value)}
              />
            </label>
            {riddleChainCtx?.isLast ? (
              <>
                <p className={s.hintSmall}>
                  Csak a lánc utolsó kérdésénél állítható a kimenet: összesített
                  pont (score) szerint. „Nem elfogadva” mindig ide mutat:{" "}
                  <code>{riddleChainCtx.retryPageId}</code>. Elfogadott ágnál egy
                  listából választhatsz bármely oldalt vagy vég (end) oldalt.
                </p>
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
                  <span>nextSwitch változó (pl. correct, score)</span>
                  <input
                    className={s.input}
                    value={riddleSwitchKey}
                    onChange={(e) => setRiddleSwitchKey(e.target.value)}
                  />
                </label>
                <div className={s.blockHead}>
                  <span>Ágak → cél oldal (cases)</span>
                  <button
                    type="button"
                    className={s.btnSm}
                    onClick={addRiddleCase}
                  >
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
                      }
                    }}
                  />
                  <span>Kötelező helyes megoldás</span>
                </label>
              </div>
              <p className={s.runesModeHint}>
                {runesRequiresCorrect
                  ? "A játékos választását a megjelölt helyes opciókhoz hasonlítjuk (answer tömb). Hibás próbánál a max. próbálkozás és az ugrások érvényesülnek."
                  : "Nincs helyes/hibás ellenőrzés: ha a játékos beküldi a kiválasztott elemeket, sikeres ág (open mód). Opcionálisan használható optionFlagsBase a story JSON-ban."}
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
            <p className={s.hintSmall}>
              A puzzle route kombinációk a forrás puzzle min/max és mód (halmaz /
              sorrend) alapján generálódnak. Graded (helyes válasz) módban a beküldés
              továbbra is pontosan max elemszámot vár.
            </p>
            <label className={s.field}>
              <span>Választási mód</span>
              <select
                className={s.input}
                value={runesMode}
                onChange={(e) => setRunesMode(e.target.value)}
              >
                <option value="set">Halmaz — helyes elemek bármilyen sorrendben</option>
                <option value="ordered">Sorrend — a helyes válasz sorrendje számít</option>
              </select>
            </label>
            {runesMode === "set" ? (
              <label className={s.field}>
                <span>Hibás próba után (halmaz mód)</span>
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
            ) : (
              <p className={s.hintSmall}>
                Sorrend módban a visszajelzés mindig újrapróbálható körökkel dolgozik
                (nincs „megtartás” állapot).
              </p>
            )}
            <label className={s.field}>
              <span>Sikeres beküldés után → oldal (id)</span>
              <input
                className={`${s.input} ${runesSuccessGoto && !idSet.has(runesSuccessGoto) ? s.inputWarn : ""}`}
                value={runesSuccessGoto}
                list="editor-known-page-ids"
                onChange={(e) => setRunesSuccessGoto(e.target.value)}
              />
            </label>
            <label className={s.field}>
              <span>Sikertelen / próbák elfogyása után → oldal (id)</span>
              <input
                className={`${s.input} ${runesFailGoto && !idSet.has(runesFailGoto) ? s.inputWarn : ""}`}
                value={runesFailGoto}
                list="editor-known-page-ids"
                onChange={(e) => setRunesFailGoto(e.target.value)}
              />
            </label>
          </>
        ) : isEditorPuzzleRoutePage ? (
          <>
            <p className={s.hintSmall}>
              A runes puzzle <strong>sikeres</strong> beküldése után a játék eltárolja
              a választás kombinációját, majd erre az oldalra érkezve a megfelelő cél
              oldalra ugrik. Kösd a runes <code>onSuccess.goto</code> mezőjét erre a
              route oldalra. Open (nincs kötelező helyes) mód + globál kulcs alapján
              működik.
            </p>
            {page.type === "logic" ? (
              <p className={s.hintSmall}>
                Mentéskor az oldal <code>puzzleRoute</code> sémára alakul (nem marad
                tömbös <code>logic</code> JSON).
              </p>
            ) : null}
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
                . Késznek számít, ha mindegyikhez van cél és a default is megvan.
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
            <RiddleScoreDestinationSelect
              label="Default → cél (ismeretlen kombináció / első betöltés)"
              value={routeDefaultGoto}
              onChange={setRouteDefaultGoto}
              story={draftStory}
              knownPageIds={knownPageIds}
              idSet={idSet}
            />
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
                  <p className={s.optionCardTitle}>Ág {idx + 1}</p>
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

        <button type="button" className={s.btnPrimary} onClick={onSaveFields}>
          Változások alkalmazása
        </button>
      </div>
    </div>
  );
}

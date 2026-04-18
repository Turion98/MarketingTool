"use client";

/**
 * Scorecard szerkesztő: mely oldalak választásai milyen lock ID-kat állítanak,
 * hogy strukturáltan lehessen szabályokat építeni (egy oldal = egy kimenet / feltétel).
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function normalizeLockList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(/[,\s]+/g))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

type ChoiceAction = { id?: unknown; type?: unknown };

function collectLocksFromChoice(ch: Record<string, unknown>): string[] {
  const reward = asRecord(ch.reward);
  const locks = normalizeLockList(reward?.locks);
  const actions = Array.isArray(ch.actions) ? (ch.actions as ChoiceAction[]) : [];
  for (const a of actions) {
    const t = typeof a?.type === "string" ? a.type : "";
    if (
      (t === "setFlag" || t === "unlockRune") &&
      typeof a?.id === "string" &&
      a.id.trim()
    ) {
      locks.push(a.id.trim());
    }
  }
  return Array.from(new Set(locks));
}

export type ScorecardLockOutcome = {
  choiceLabel: string;
  lockIds: string[];
};

export type ScorecardLockSourcePage = {
  pageId: string;
  pageTitle: string;
  outcomes: ScorecardLockOutcome[];
};

/** Oldalak, ahol legalább egy választás lockot ad (reward.locks / setFlag). */
export function buildScorecardLockSources(
  story: Record<string, unknown>
): ScorecardLockSourcePage[] {
  const pages = story.pages;
  const list: unknown[] = Array.isArray(pages)
    ? pages
    : pages && typeof pages === "object"
      ? Object.values(pages as Record<string, unknown>)
      : [];

  const out: ScorecardLockSourcePage[] = [];

  for (const p of list) {
    const rec = asRecord(p);
    if (!rec) continue;
    const pid = typeof rec.id === "string" ? rec.id : "";
    if (!pid) continue;
    const choices = Array.isArray(rec.choices) ? rec.choices : [];
    if (choices.length === 0) continue;

    const outcomes: ScorecardLockOutcome[] = [];
    for (const ch of choices) {
      const c = asRecord(ch);
      if (!c) continue;
      const lockIds = collectLocksFromChoice(c);
      if (lockIds.length === 0) continue;
      const label =
        (typeof c.text === "string" && c.text.trim()) ||
        (typeof c.label === "string" && c.label.trim()) ||
        "opció";
      outcomes.push({ choiceLabel: label, lockIds });
    }

    if (outcomes.length === 0) continue;

    const pageTitle =
      (typeof rec.title === "string" && rec.title.trim()) || pid;
    out.push({ pageId: pid, pageTitle, outcomes });
  }

  out.sort((a, b) => a.pageId.localeCompare(b.pageId));
  return out;
}

/** Első előfordulás: lock ID → forrás oldal (ahol a választás definiálja). */
export function buildLockIdToSourcePageMap(
  sources: ScorecardLockSourcePage[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sources) {
    for (const o of s.outcomes) {
      for (const id of o.lockIds) {
        if (!m.has(id)) m.set(id, s.pageId);
      }
    }
  }
  return m;
}

export type ScorecardRuleConditionForm =
  | { mode: "pick"; pageId: string; outcomeIndex: number }
  | { mode: "custom"; rawId: string };

export type ScorecardRuleForm = {
  /** Régi szerkesztői state / legacy `conditionIds` betöltés után is lehet üres/hiányzó. */
  conditions?: ScorecardRuleConditionForm[];
  goto: string;
};

function outcomeSignature(lockIds: string[]): string {
  return [...lockIds].map((x) => x.trim()).filter(Boolean).sort().join("\0");
}

/**
 * JSON `if` tömb → szerkesztői feltételek: összecsiszoljuk azonos oldalról jövő
 * lockokat egy pick sorba, ha pont egy outcome egyezik.
 */
export function parseScorecardIfToConditions(
  ifArr: string[],
  sources: ScorecardLockSourcePage[]
): ScorecardRuleConditionForm[] {
  const trimmed = ifArr.map((x) => String(x || "").trim()).filter(Boolean);
  if (trimmed.length === 0) return [];

  const lockToPage = buildLockIdToSourcePageMap(sources);
  const byPage = new Map<string, string[]>();
  const orphans: string[] = [];

  for (const id of trimmed) {
    const pid = lockToPage.get(id);
    if (pid) {
      const g = byPage.get(pid) ?? [];
      g.push(id);
      byPage.set(pid, g);
    } else {
      orphans.push(id);
    }
  }

  const conditions: ScorecardRuleConditionForm[] = [];
  const used = new Set<string>();

  for (const s of sources) {
    const ids = byPage.get(s.pageId);
    if (!ids?.length) continue;

    const sig = outcomeSignature(ids);
    const idx = s.outcomes.findIndex(
      (o) => outcomeSignature(o.lockIds) === sig
    );
    if (idx >= 0) {
      conditions.push({ mode: "pick", pageId: s.pageId, outcomeIndex: idx });
      for (const id of ids) used.add(id);
    }
  }

  for (const id of trimmed) {
    if (!used.has(id)) {
      conditions.push({ mode: "custom", rawId: id });
    }
  }

  return conditions;
}

export function loadScorecardRuleForms(
  page: Record<string, unknown>,
  story: Record<string, unknown>
): ScorecardRuleForm[] {
  const sources = buildScorecardLockSources(story);
  const log = page.logic;
  if (!Array.isArray(log)) return [];

  return log.map((entry) => {
    const o = asRecord(entry);
    const ifArr = Array.isArray(o?.if) ? o.if : [];
    const strIf = ifArr.filter(
      (x): x is string => typeof x === "string"
    ) as string[];
    let conditions = parseScorecardIfToConditions(strIf, sources);
    if (
      conditions.length === 0 &&
      Array.isArray(o?.conditionIds)
    ) {
      const ids = (o.conditionIds as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0
      );
      conditions = ids.map((rawId) => ({
        mode: "custom" as const,
        rawId: rawId.trim(),
      }));
    }
    return {
      conditions,
      goto: typeof o?.goto === "string" ? o.goto : "",
    };
  });
}

/** Egy szabály `if` tömbje mentéshez. */
export function scorecardRuleConditionsToIf(
  conditions: ScorecardRuleConditionForm[] | undefined,
  sources: ScorecardLockSourcePage[]
): string[] {
  const list = conditions ?? [];
  const sourceById = new Map(sources.map((s) => [s.pageId, s] as const));
  const out: string[] = [];
  for (const c of list) {
    if (c.mode === "custom") {
      const t = c.rawId.trim();
      if (t) out.push(t);
      continue;
    }
    const src = sourceById.get(c.pageId);
    const o = src?.outcomes[c.outcomeIndex];
    if (o?.lockIds?.length) {
      for (const id of o.lockIds) {
        const x = id.trim();
        if (x) out.push(x);
      }
    }
  }
  return Array.from(new Set(out));
}

/** Ugyanarról az oldalról több pick = ütközés. */
export function scorecardRuleHasDuplicateSourcePages(
  conditions: ScorecardRuleConditionForm[] | undefined
): boolean {
  if (!conditions?.length) return false;
  const seen = new Set<string>();
  for (const c of conditions) {
    if (c.mode !== "pick") continue;
    if (!c.pageId) continue;
    if (seen.has(c.pageId)) return true;
    seen.add(c.pageId);
  }
  return false;
}

export function normalizedScorecardRuleKey(ifSorted: string[]): string {
  return [...ifSorted].sort().join("\0");
}

import { getClientDashboardAnalyticsApiBase } from "@/app/lib/publicApiBase";

export type RollupRangePayload = {
  storyId: string;
  from: string;
  to: string;
  sessions: number;
  users: number;
  runs?: number;
  totals: {
    pageViews: number;
    choices: number;
    puzzles: {
      tries: number;
      solved: number;
      byKind?: Record<string, { tries: number; solved: number }>;
    };
    runes: number;
    mediaStarts: number;
    mediaStops: number;
    ctaShown?: number;
    ctaClicks?: number;
  };
  kpis: {
    completionRate: number;
    avgSessionDurationMs: number;
    puzzleSuccessRate: number;
    ctaCtr?: number;
    avgRunsPerUser?: number;
  };
  dau?: Array<{ day: string; users: number; sessions: number }>;
  pages?: Array<{
    pageId: string;
    views: number;
    uniqueSessions: number;
    exitsAfterPage: number;
    exitRate?: number;
  }>;
  choices?: Array<{
    pageId: string;
    choices: Array<{ choiceId: string; count: number }>;
  }>;
  outcomes?: Array<{
    outcomeKey?: string;
    outcomeLabel?: string;
    outcomeId?: string;
    runs?: number;
    sessions?: number;
    users?: number;
    ctaShown?: number;
    ctaClicks?: number;
    endPagesCount?: number;
    topEndPageId?: string;
  }>;
  endPages?: Array<{
    pageId: string;
    runs?: number;
    sessions?: number;
    users?: number;
    ctaShown?: number;
    ctaClicks?: number;
  }>;
  dropOffs?: Array<{
    pageId: string;
    dropOffRuns: number;
    users?: number;
    dropOffPct?: number;
  }>;
  paths?: Array<{
    pathId: string;
    runs: number;
    users?: number;
    topOutcomeId?: string;
    ctaShown?: number;
    ctaClicks?: number;
  }>;
  pathConversion?: Array<{
    pathId: string;
    runs: number;
    endRuns: number;
    conversionRate: number;
  }>;
  restartStats?: {
    totalRuns: number;
    runsWithRestart: number;
    completionRateWithRestart: number;
    completionRateWithoutRestart: number;
  };
  endDistribution?: Array<{
    id: string;
    count: number;
    share: number;
  }>;
  puzzleRunesTopOptions?: Array<{ label: string; count: number }>;
  puzzleRunesStats?: {
    avgAttemptWhenSolved: number | null;
    solvedByAttempt: Array<{ attempt: number; count: number }>;
  };
  riddleStats?: {
    avgRetriesPerRun: number;
    runsWithRiddle: number;
    wrongByQuestion: Array<{ pageId: string; count: number; pct: number }>;
  };
  steps?: Array<{
    stepId: string;
    stepType: "choice" | "rotate" | "puzzle" | "logic";
    options: Array<{ value: string; runs: number }>;
  }>;
  domains?: Array<{
    domain: string;
    sessions: number;
    users: number;
    runs: number;
    totals: {
      pageViews: number;
      choices: number;
      puzzles: { tries: number; solved: number };
      runes: number;
      mediaStarts: number;
      mediaStops: number;
      ctaShown: number;
      ctaClicks: number;
      completions: number;
    };
  }>;
  notes?: Record<string, string>;
};

export async function fetchRollupRange(input: {
  storyId: string;
  from: string;
  to: string;
  terminal?: string;
  signal?: AbortSignal;
}): Promise<RollupRangePayload> {
  const params = new URLSearchParams({
    storyId: input.storyId,
    from: input.from,
    to: input.to,
  });
  if (input.terminal?.trim()) params.set("terminal", input.terminal.trim());

  const base = getClientDashboardAnalyticsApiBase();
  const url = `${base}/api/analytics/rollup-range?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}${text ? ` - ${text}` : ""}`);
  }
  return (await res.json()) as RollupRangePayload;
}

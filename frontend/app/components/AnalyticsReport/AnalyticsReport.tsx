"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  rollupDaily,
  exportStoryCSV,
  exportStoryJSON,
  clearStoryAnalytics,
} from "@/app/lib/analytics";
import styles from "./AnalyticsReport.module.scss";

type Range = "last7d" | "last30d";

type RangeRollup = {
  storyId: string;
  from: string;
  to: string;
  sessions: number;
  users: number;
  runs?: number;
  totals: {
    pageViews: number;
    choices: number;
    puzzles: { tries: number; solved: number };
    runes: number;
    mediaStarts: number;
    mediaStops: number;
    // opcionális: ha később hozzáadod
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

  // ❗ DAU/pages/choices maradhat a backend válaszban, de UI-ból kivesszük
  dau?: Array<{ day: string; users: number; sessions: number }>;
  pages?: Array<{
    pageId: string;
    views: number;
    uniqueSessions: number;
    exitsAfterPage: number;
  }>;
  choices?: Array<{
    pageId: string;
    choices: Array<{ choiceId: string; count: number }>;
  }>;


outcomes?: Array<{
  outcomeKey?: string;          // ✅ új (üzleti)
  outcomeLabel?: string;        // ✅ új (emberi címke)
  // kompatibilitás:
  outcomeId?: string;           // régi (end page id / legacy)
  runs?: number;                // ✅ új
  sessions?: number;            // régi
  users?: number;
  ctaShown?: number;
  ctaClicks?: number;

  // extra üzleti insight:
  endPagesCount?: number;       // ✅ hány end page tartozik ide
  topEndPageId?: string;        // ✅ opcionális: leggyakoribb end page
}>;

// End pages: run-alap + share + ctr (UI számolja)
endPages?: Array<{
  pageId: string;
  runs?: number;                // ✅ új
  sessions?: number;            // régi
  users?: number;
  ctaShown?: number;
  ctaClicks?: number;
}>;

// Drop-offs: ideális backend mező (ha van)
dropOffs?: Array<{
  pageId: string;               // nem end page
  dropOffRuns: number;          // ✅ run-alap
  users?: number;
  dropOffPct?: number;          // opcionális (UI is számolja)
}>;


  paths?: Array<{
    pathId: string; // pl. "Q1:A > Q2:B > ROT:gold/dark"
    sessions: number;
    users?: number;
    topOutcomeId?: string;
    ctaShown?: number;
    ctaClicks?: number;
  }>;

  steps?: Array<{
    stepId: string; // pl. "Q1", "taste_profile", "rotate_style"
    stepType: "choice" | "rotate" | "puzzle" | "logic";
    options: Array<{ value: string; sessions: number }>;
  }>;

  notes?: Record<string, string>;
};

export type AnalyticsReportProps = {
  storyId: string;
  defaultRange?: Range;
};

function msToHMS(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m || (!h && !s)) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(" ");
}

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pct(n: number, d: number) {
  return d <= 0 ? 0 : (n / d) * 100;
}
function safeDiv(n: number, d: number) {
  return d <= 0 ? 0 : n / d;
}
function fmtPct(x: number) {
  return `${x.toFixed(1)}%`;
}
function asCount(x: number | undefined | null) {
  return x == null ? 0 : x;
}
function isEndLike(id: string) {
  const s = (id || "").toUpperCase();
  return s.includes("END__") || s.includes("__END__") || s.startsWith("END_");
}

export default function AnalyticsReport({
  storyId,
  defaultRange = "last7d",
}: AnalyticsReportProps) {
  const daily = useMemo(() => (storyId ? rollupDaily(storyId) : []), [storyId]);

  const initialFrom =
    defaultRange === "last30d" ? daysAgoStr(30) : daysAgoStr(7);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(todayStr());
  const [terminal, setTerminal] = useState<string>(""); // maradhat (backendnek hasznos)
  const [loadingRange, setLoadingRange] = useState(false);
  const [rangeData, setRangeData] = useState<RangeRollup | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!storyId) return;
    const ac = new AbortController();

    async function fetchRange() {
      setLoadingRange(true);
      setRangeError(null);
      try {
        const params = new URLSearchParams({ storyId, from, to });
        if (terminal.trim()) params.set("terminal", terminal.trim());

       const base =
  (typeof window !== "undefined" &&
  (window.location.hostname === "www.thequestell.com" ||
    window.location.hostname.endsWith(".thequestell.com")))
    ? "https://api.thequestell.com"
    : "http://127.0.0.1:8000";


const url = `${base}/api/analytics/rollup-range?${params.toString()}`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status} – ${text || "rollup-range hiba"}`);
        }
        const json = (await res.json()) as RangeRollup;
        console.log("[report] rollup ok", {
  storyId: json.storyId,
  users: json.users,
  sessions: json.sessions,
  pv: json.totals?.pageViews,
  choices: json.totals?.choices,
});

        setRangeData(json);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setRangeError(
            e?.message || "Ismeretlen hiba a rollup-range lekérdezésekor."
          );
          
        }
      } finally {
        setLoadingRange(false);
      }
    }

    fetchRange();
    return () => ac.abort();
  }, [storyId, from, to, terminal]);

  if (!storyId) {
    return (
      <div className={styles.root}>
        <div className={styles.error}>Hiányzó storyId</div>
      </div>
    );
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const ctaCtr =
    rangeData?.kpis?.ctaCtr ??
    (rangeData?.totals?.ctaShown && rangeData?.totals?.ctaClicks != null
      ? rangeData.totals.ctaClicks / Math.max(1, rangeData.totals.ctaShown)
      : null);

  return (
    <div className={styles.card}>
      <h3>Riport – {storyId}</h3>

      <div className={styles.actions}>
        <button onClick={() => download(exportStoryCSV(storyId), `${storyId}.csv`)}>
          Export CSV
        </button>
        <button onClick={() => download(exportStoryJSON(storyId), `${storyId}.json`)}>
          Export JSON
        </button>
        <button
          onClick={() => {
            clearStoryAnalytics(storyId);
            location.reload();
          }}
        >
          Clear
        </button>
      </div>

      <div className={styles.rangeControls}>
        <div className={styles.row}>
          <label>
            From:&nbsp;
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To:&nbsp;
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className={styles.terminalField}>
            Terminal pages (opcionális, vesszővel):&nbsp;
            <input
              type="text"
              placeholder="__END__,ch3_pg4_end"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* KPI blokk (megtartjuk) */}
      <div className={styles.kpis}>
        {loadingRange && <div className={styles.info}>Időszakos riport töltése…</div>}
        {rangeError && <div className={styles.error}>{rangeError}</div>}

        {rangeData && (
          <>
            <div className={styles.kpiGrid}>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Időszak</div>
                <div className={styles.kpiValue}>
                  {rangeData.from} → {rangeData.to}
                </div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Felhasználók</div>
                <div className={styles.kpiValue}>{rangeData.users}</div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Sessionök</div>
                <div className={styles.kpiValue}>{rangeData.sessions}</div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Játék indítások (run)</div>
                <div className={styles.kpiValue}>{rangeData.runs ?? "—"}</div>
              </div>
              <div className={styles.kpi}>
  <div className={styles.kpiLabel}>Átlag run / user</div>
  <div className={styles.kpiValue}>
    {rangeData.kpis.avgRunsPerUser == null
      ? (rangeData.runs != null && rangeData.users != null
          ? (rangeData.runs / Math.max(1, rangeData.users)).toFixed(2)
          : "—")
      : rangeData.kpis.avgRunsPerUser.toFixed(2)}
  </div>
</div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Completion rate</div>
                <div className={styles.kpiValue}>
                  {(rangeData.kpis.completionRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Átlag session idő</div>
                <div className={styles.kpiValue}>
                  {msToHMS(rangeData.kpis.avgSessionDurationMs)}
                </div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Puzzle success</div>
                <div className={styles.kpiValue}>
                  {(rangeData.kpis.puzzleSuccessRate * 100).toFixed(1)}%
                </div>
              </div>

              {/* ✅ ÚJ: CTA CTR (ha van adat) */}
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>CTA CTR</div>
                <div className={styles.kpiValue}>
                  {ctaCtr == null ? "—" : `${(ctaCtr * 100).toFixed(1)}%`}
                </div>
              </div>
            </div>

<h4>Végoldalak és outcome-ok</h4>
{(() => {
  const totalRuns =
    rangeData?.runs ??
    // fallback: ha nincs runs, próbáljuk összerakni outcomes/endPages alapján (nem tökéletes, de jobb mint a semmi)
    rangeData?.outcomes?.reduce((acc, o) => acc + (o.runs ?? o.sessions ?? 0), 0) ??
    rangeData?.endPages?.reduce((acc, e) => acc + (e.runs ?? e.sessions ?? 0), 0) ??
    0;

  // ----- OUTCOMES: üzleti nézet -----
  const outcomes = (rangeData?.outcomes ?? []).map((o) => {
    const runs = o.runs ?? o.sessions ?? 0;
    const shown = asCount(o.ctaShown);
    const clicks = asCount(o.ctaClicks);
    const ctr = safeDiv(clicks, Math.max(1, shown));
    const share = pct(runs, Math.max(1, totalRuns));

    const key = o.outcomeKey ?? o.outcomeId ?? "—";
    const label = o.outcomeLabel ?? key;

    return {
      key,
      label,
      runs,
      users: o.users ?? null,
      share,
      shown: o.ctaShown ?? null,
      clicks: o.ctaClicks ?? null,
      ctr,
      endPagesCount: o.endPagesCount ?? null,
      topEndPageId: o.topEndPageId ?? null,
    };
  });

  // ----- END PAGES: technikai, de üzleti hangvétellel (share + ctr) -----
  const endPages = (rangeData?.endPages ?? []).map((e) => {
    const runs = e.runs ?? e.sessions ?? 0;
    const shown = asCount(e.ctaShown);
    const clicks = asCount(e.ctaClicks);
    const ctr = safeDiv(clicks, Math.max(1, shown));
    const share = pct(runs, Math.max(1, totalRuns));

    return {
      pageId: e.pageId,
      runs,
      users: e.users ?? null,
      shown: e.ctaShown ?? null,
      clicks: e.ctaClicks ?? null,
      ctr,
      share,
    };
  });

  // ----- DROP-OFFS: nem végoldalak, ahol elhagyták -----
  // 1) preferált: backend dropOffs
  let dropOffRows: Array<{ pageId: string; dropOffRuns: number; dropOffPct: number }> = [];
  if (rangeData?.dropOffs && rangeData.dropOffs.length > 0) {
    dropOffRows = rangeData.dropOffs
      .map((d) => ({
        pageId: d.pageId,
        dropOffRuns: d.dropOffRuns,
        dropOffPct: d.dropOffPct ?? pct(d.dropOffRuns, Math.max(1, totalRuns)),
      }))
      .sort((a, b) => b.dropOffRuns - a.dropOffRuns);
  } else if (rangeData?.pages && rangeData.pages.length > 0) {
    // 2) fallback: pages[].exitsAfterPage (nem tökéletes run-alap, de addig hasznos)
    dropOffRows = rangeData.pages
      .filter((p) => !isEndLike(p.pageId)) // csak nem-end oldalak
      .map((p) => ({
        pageId: p.pageId,
        dropOffRuns: p.exitsAfterPage ?? 0,
        dropOffPct: pct(p.exitsAfterPage ?? 0, Math.max(1, totalRuns || rangeData.sessions || 1)),
      }))
      .filter((x) => x.dropOffRuns > 0)
      .sort((a, b) => b.dropOffRuns - a.dropOffRuns)
      .slice(0, 10);
  }

  const hasAnything =
    outcomes.length > 0 || endPages.length > 0 || dropOffRows.length > 0;

  if (!hasAnything) {
    return (
      <div className={styles.info}>
        (Még nincs outcome / endPages / drop-off adat a range riportban.)
      </div>
    );
  }

  return (
    <>
      {/* ✅ 1) OUTCOME MEGOSZLÁS – üzleti */}
      {outcomes.length > 0 && (
        <>
          <div className={styles.info}>Outcome megoszlás (üzleti)</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Runs</th>
                <th>Users</th>
                <th>Share</th>
                <th>CTA shown</th>
                <th>CTA clicks</th>
                <th>CTA CTR</th>
                <th>End pages</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((x) => (
                <tr key={x.key}>
                  <td title={x.key}>{x.label}</td>
                  <td>{x.runs}</td>
                  <td>{x.users ?? "—"}</td>
                  <td>{fmtPct(x.share)}</td>
                  <td>{x.shown ?? "—"}</td>
                  <td>{x.clicks ?? "—"}</td>
                  <td>{x.shown == null || x.clicks == null ? "—" : fmtPct(x.ctr * 100)}</td>
                  <td>
                    {x.endPagesCount != null
                      ? x.endPagesCount
                      : x.topEndPageId
                        ? 1
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      

      {/* ✅ 3) DROP-OFF – nem végoldalak, ahol elhagyták */}
{dropOffRows.length > 0 && (
  <>
    <div className={styles.info}>Lemorzsolódási pontok (nem-végoldalak)</div>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Page</th>
          <th>Drop-offs</th>
          <th>Runs (total)</th>
          <th>Drop-off %</th>
        </tr>
      </thead>
      <tbody>
        {dropOffRows.map((d) => (
          <tr key={d.pageId}>
            <td>{d.pageId}</td>
            <td>{d.dropOffRuns}</td>
            <td>{totalRuns}</td>
            <td>{fmtPct(d.dropOffPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
)}
    </>
  );
})()}
            {/* ✅ ÚJ: Pathok */}
            <h4>Top pathok</h4>
            {!rangeData.paths || rangeData.paths.length === 0 ? (
              <div className={styles.info}>
                (Még nincs path adat a range riportban.)
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Sessions</th>
                    <th>Users</th>
                    <th>Top outcome</th>
                    <th>CTA shown</th>
                    <th>CTA clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeData.paths.map((p) => (
                    <tr key={p.pathId}>
                      <td style={{ maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.pathId}
                      </td>
                      <td>{p.sessions}</td>
                      <td>{p.users ?? "—"}</td>
                      <td>{p.topOutcomeId ?? "—"}</td>
                      <td>{p.ctaShown ?? "—"}</td>
                      <td>{p.ctaClicks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ✅ ÚJ: Decision step teljesítmény */}
            <h4>Decision step megoszlás</h4>
            {!rangeData.steps || rangeData.steps.length === 0 ? (
              <div className={styles.info}>
                (Még nincs steps adat a range riportban.)
              </div>
            ) : (
              <div className={styles.choiceList}>
                {rangeData.steps.map((st) => (
                  <div className={styles.choiceGroup} key={st.stepId}>
                    <div className={styles.choiceTitle}>
                      {st.stepId} <span style={{ opacity: 0.7 }}>({st.stepType})</span>
                    </div>
                    <ul>
                      {st.options.map((o) => (
                        <li key={o.value}>
                          {o.value}: <b>{o.sessions}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lokális rollup maradhat debugnak */}
      <h4>Napi összesítés (lokális rollup)</h4>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Nap</th>
            <th>Sessions</th>
            <th>Pages</th>
            <th>PV</th>
            <th>Choices</th>
            <th>Puzzle tries</th>
            <th>Solved</th>
            <th>Runes</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d: any) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.sessions}</td>
              <td>{d.pages}</td>
              <td>{d.totals.pageViews}</td>
              <td>{d.totals.choices}</td>
              <td>{d.totals.puzzles.tries}</td>
              <td>{d.totals.puzzles.solved}</td>
              <td>{d.totals.runes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ❌ Top oldalak – kiszedve */}
    </div>
  );
}

"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  rollupDaily,
  exportStoryCSV,
  exportStoryJSON,
  clearStoryAnalytics,
} from "../../lib/analytics";
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
    // opcionális: ha később hozzáadod
    ctaCtr?: number;
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

  // ✅ ÚJ: Questell riport mezők (opcionálisak, később jönnek a backendből)
  outcomes?: Array<{
    outcomeId: string; // end page id / outcome key
    sessions: number;
    users?: number;
    ctaShown?: number;
    ctaClicks?: number;
  }>;

  endPages?: Array<{
    pageId: string; // végoldal id
    sessions: number;
    users?: number;
    ctaShown?: number;
    ctaClicks?: number;
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

            {/* ✅ ÚJ: Outcome / End Pages */}
            <h4>Végoldalak és outcome-ok</h4>
            {(!rangeData.endPages || rangeData.endPages.length === 0) &&
            (!rangeData.outcomes || rangeData.outcomes.length === 0) ? (
              <div className={styles.info}>
                (Még nincs outcome/endPages adat a range riportban.)
              </div>
            ) : (
              <>
                {rangeData.endPages && rangeData.endPages.length > 0 && (
                  <>
                    <div className={styles.info}>Top végoldalak (end pages)</div>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>End page</th>
                          <th>Sessions</th>
                          <th>Users</th>
                          <th>CTA shown</th>
                          <th>CTA clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rangeData.endPages.map((x) => (
                          <tr key={x.pageId}>
                            <td>{x.pageId}</td>
                            <td>{x.sessions}</td>
                            <td>{x.users ?? "—"}</td>
                            <td>{x.ctaShown ?? "—"}</td>
                            <td>{x.ctaClicks ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {rangeData.outcomes && rangeData.outcomes.length > 0 && (
                  <>
                    <div className={styles.info}>Outcome megoszlás</div>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Outcome</th>
                          <th>Sessions</th>
                          <th>Users</th>
                          <th>CTA shown</th>
                          <th>CTA clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rangeData.outcomes.map((x) => (
                          <tr key={x.outcomeId}>
                            <td>{x.outcomeId}</td>
                            <td>{x.sessions}</td>
                            <td>{x.users ?? "—"}</td>
                            <td>{x.ctaShown ?? "—"}</td>
                            <td>{x.ctaClicks ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}

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

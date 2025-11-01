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
  totals: {
    pageViews: number;
    choices: number;
    puzzles: { tries: number; solved: number };
    runes: number;
    mediaStarts: number;
    mediaStops: number;
  };
  kpis: {
    completionRate: number;
    avgSessionDurationMs: number;
    puzzleSuccessRate: number;
  };
  dau: Array<{ day: string; users: number; sessions: number }>;
  pages: Array<{
    pageId: string;
    views: number;
    uniqueSessions: number;
    exitsAfterPage: number;
  }>;
  choices: Array<{
    pageId: string;
    choices: Array<{ choiceId: string; count: number }>;
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
  // napi lokális rollup
  const daily = useMemo(
    () => (storyId ? rollupDaily(storyId) : []),
    [storyId]
  );

  // időszak lekérdezés állapot
  const initialFrom =
    defaultRange === "last30d" ? daysAgoStr(30) : daysAgoStr(7);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(todayStr());
  const [terminal, setTerminal] = useState<string>(""); // "__END__,ch3_pg4_end"
  const [loadingRange, setLoadingRange] = useState(false);
  const [rangeData, setRangeData] = useState<RangeRollup | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // automata fetch amint a panel megjelent
  useEffect(() => {
    if (!storyId) return;
    const ac = new AbortController();

    async function fetchRange() {
      setLoadingRange(true);
      setRangeError(null);
      try {
        const params = new URLSearchParams({
          storyId,
          from,
          to,
        });
        if (terminal.trim()) params.set("terminal", terminal.trim());

        const base =
          process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
        const url = `${base}/api/analytics/rollup-range?${params.toString()}`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `HTTP ${res.status} – ${text || "rollup-range hiba"}`
          );
        }
        const json = (await res.json()) as RangeRollup;
        setRangeData(json);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setRangeError(
            e?.message || "Ismeretlen hiba a rollup-range lekérdezésekor."
          );
          setRangeData(null);
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

  return (
    <div className={styles.card}>
      <h3>Riport – {storyId}</h3>

      {/* Export / törlés */}
      <div className={styles.actions}>
        <button
          onClick={() => download(exportStoryCSV(storyId), `${storyId}.csv`)}
        >
          Export CSV
        </button>
        <button
          onClick={() => download(exportStoryJSON(storyId), `${storyId}.json`)}
        >
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

      {/* Időszak vezérlők */}
      <div className={styles.rangeControls}>
        <div className={styles.row}>
          <label>
            From:&nbsp;
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To:&nbsp;
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
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

      {/* KPI blokk */}
      <div className={styles.kpis}>
        {loadingRange && (
          <div className={styles.info}>Időszakos riport töltése…</div>
        )}
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
            </div>

            <h4>DAU trend</h4>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nap</th>
                  <th>Users</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rangeData.dau.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.users}</td>
                    <td>{d.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>Oldal metrikák</h4>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Views</th>
                  <th>Unique sessions</th>
                  <th>Exits after page</th>
                </tr>
              </thead>
              <tbody>
                {rangeData.pages.map((p) => (
                  <tr key={p.pageId}>
                    <td>{p.pageId}</td>
                    <td>{p.views}</td>
                    <td>{p.uniqueSessions}</td>
                    <td>{p.exitsAfterPage}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>Választás megoszlás</h4>
            {rangeData.choices.length === 0 ? (
              <div className={styles.info}>
                Nincs choice adat ebben az időszakban.
              </div>
            ) : (
              <div className={styles.choiceList}>
                {rangeData.choices.map((group) => (
                  <div className={styles.choiceGroup} key={group.pageId}>
                    <div className={styles.choiceTitle}>{group.pageId}</div>
                    <ul>
                      {group.choices.map((c) => (
                        <li key={c.choiceId}>
                          {c.choiceId}: <b>{c.count}</b>
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

      <h4>Top oldalak (utolsó napból)</h4>
      <ul>
        {(daily[0]?.topPages || []).map((p: any) => (
          <li key={p.pageId}>
            {p.pageId} – {p.views}
          </li>
        ))}
      </ul>
    </div>
  );
}

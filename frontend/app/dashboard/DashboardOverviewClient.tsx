"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildLiveEmbeddedRows } from "@/app/lib/buildLiveEmbeddedRows";
import { fetchRollupRange, type RollupRangePayload } from "@/app/lib/dashboardAnalytics";
import { fetchLiveEmbeddedConfig } from "@/app/lib/liveEmbeddedConfig";
import { fetchStoriesWithMultiFallback } from "@/app/lib/storiesListing";
import p from "./dashboardPage.module.scss";
import o from "./dashboardOverview.module.scss";

const LIVE_SECTION_LEAD =
  "Minden sor egy ügyféloldalon futó beágyazás. Ide kerül a teljesítmény és az események összefoglalója — hogy egy pillantással lásd, mi történik az élő linkeken.";

type SeriesKey = "users" | "sessions";
type RangePreset = "last7d" | "last30d";

function isEndLike(id: string) {
  const s = (id || "").toUpperCase();
  return s.includes("END__") || s.includes("__END__") || s.startsWith("END_");
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFromPreset(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (preset === "last30d" ? 30 : 7));
  return { from: ymd(from), to: ymd(to) };
}

/** Ha nincs choice_select bontás, a page_enter alapú step átmenetekből becsülünk ágazást. */
function branchingFromSteps(
  steps: NonNullable<RollupRangePayload["steps"]> | undefined
): Array<{ pageId: string; choices: Array<{ choiceId: string; count: number }> }> {
  if (!steps?.length) return [];
  return steps
    .filter((s) => (s.options?.length ?? 0) >= 2)
    .map((s) => ({
      pageId: s.stepId,
      choices: [...(s.options ?? [])]
        .sort((a, b) => b.runs - a.runs)
        .slice(0, 8)
        .map((o) => ({
          choiceId: `→ ${o.value}`,
          count: o.runs,
        })),
    }))
    .slice(0, 12);
}

function Bar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className={o.barTrack}>
      <div className={o.barFill} style={{ width: `${width}%` }} />
    </div>
  );
}

function ActivityChart({
  dau,
  visible,
}: {
  dau: NonNullable<RollupRangePayload["dau"]>;
  visible: Record<SeriesKey, boolean>;
}) {
  const width = 860;
  const height = 210;
  const padX = 24;
  const padY = 16;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const maxVal = Math.max(
    1,
    ...dau.map((d) => d.users),
    ...dau.map((d) => d.sessions)
  );

  const toPoints = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = padX + (i * plotW) / Math.max(1, arr.length - 1);
        const y = padY + (1 - v / maxVal) * plotH;
        return `${x},${y}`;
      })
      .join(" ");

  const series = {
    users: dau.map((d) => d.users),
    sessions: dau.map((d) => d.sessions),
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={o.activityChart} role="img">
      <rect x={0} y={0} width={width} height={height} className={o.activityBg} />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = padY + (i * plotH) / 4;
        return <line key={i} x1={padX} x2={width - padX} y1={y} y2={y} className={o.gridLine} />;
      })}
      {visible.users ? <polyline points={toPoints(series.users)} className={o.seriesUsers} /> : null}
      {visible.sessions ? <polyline points={toPoints(series.sessions)} className={o.seriesSessions} /> : null}
    </svg>
  );
}

function LiveAnalyticsSection({ storyId }: { storyId: string }) {
  const [range, setRange] = useState<RangePreset>("last7d");
  const [data, setData] = useState<RollupRangePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    users: true,
    sessions: true,
  });

  useEffect(() => {
    const ac = new AbortController();
    const { from, to } = rangeFromPreset(range);
    setLoading(true);
    setError(null);
    fetchRollupRange({ storyId, from, to, signal: ac.signal })
      .then((j) => setData(j))
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : "Analitika betöltési hiba.");
          setData(null);
        }
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [storyId, range]);

  const ctaCtr =
    data?.kpis.ctaCtr ??
    (data?.totals.ctaShown && data?.totals.ctaClicks != null
      ? data.totals.ctaClicks / Math.max(1, data.totals.ctaShown)
      : 0);

  const topPages = useMemo(() => (data?.pages ?? []).slice(0, 8), [data]);
  const sessionsPerUser = data?.users ? data.sessions / data.users : 0;
  const runsPerSession = data?.sessions ? (data.runs ?? 0) / data.sessions : 0;
  const maxPageViews = Math.max(1, ...topPages.map((x) => x.views));
  const dropOffs = useMemo(() => {
    if (!data) return [];
    if (data.dropOffs && data.dropOffs.length > 0) return data.dropOffs.slice(0, 8);
    // fallback: exitsAfterPage alapú "dropout" (mint az Adventures reportban)
    const rows =
      (data.pages ?? [])
        .filter((p) => !isEndLike(p.pageId))
        .map((p) => ({ pageId: p.pageId, dropOffRuns: p.exitsAfterPage ?? 0 }))
        .filter((x) => x.dropOffRuns > 0)
        .sort((a, b) => b.dropOffRuns - a.dropOffRuns)
        .slice(0, 8);
    return rows;
  }, [data]);
  const maxDrop = Math.max(1, ...dropOffs.map((x) => x.dropOffRuns));
  const outcomes = useMemo(
    () =>
      (data?.outcomes ?? []).map((x) => ({
        id: x.outcomeKey ?? x.outcomeId ?? "ismeretlen",
        runs: x.runs ?? x.sessions ?? 0,
        ctaShown: x.ctaShown ?? 0,
        ctaClicks: x.ctaClicks ?? 0,
      })),
    [data]
  );
  const totalsRuns = data?.runs ?? 0;
  const totalsShown = data?.totals.ctaShown ?? 0;
  const totalsClicked = data?.totals.ctaClicks ?? 0;
  const outcomeTotalsChartMax = Math.max(1, totalsRuns, totalsShown, totalsClicked);
  const maxOutcomeRuns = Math.max(1, ...outcomes.map((x) => x.runs));
  const pathRows = (data?.paths ?? []).slice(0, 10);
  const steps = (data?.steps ?? []).slice(0, 12);
  const domains = (data?.domains ?? []).slice(0, 8);

  const choiceBlocks = useMemo(() => {
    if (!data) return { rows: [] as Array<{ pageId: string; choices: Array<{ choiceId: string; count: number }> }>, source: "none" as const };
    const fromEvents = (data.choices ?? []).filter((c) => (c.choices?.length ?? 0) > 0);
    if (fromEvents.length > 0) return { rows: fromEvents.slice(0, 12), source: "events" as const };
    const fromSteps = branchingFromSteps(data.steps);
    if (fromSteps.length > 0) return { rows: fromSteps, source: "steps" as const };
    return { rows: [], source: "none" as const };
  }, [data]);

  if (loading) return <p className={o.panelInfo}>Analitika betöltése…</p>;
  if (error) return <p className={o.panelError}>{error}</p>;
  if (!data) return <p className={o.panelInfo}>Nincs elérhető adat.</p>;

  return (
    <div className={o.analyticsWrap}>
      <div className={o.rangeRow}>
        <button
          type="button"
          className={`${o.rangeBtn} ${range === "last7d" ? o.rangeBtnActive : ""}`}
          onClick={() => setRange("last7d")}
        >
          7 nap
        </button>
        <button
          type="button"
          className={`${o.rangeBtn} ${range === "last30d" ? o.rangeBtnActive : ""}`}
          onClick={() => setRange("last30d")}
        >
          30 nap
        </button>
      </div>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>1) Overview</h4>
        <div className={o.kpiGrid}>
          <div className={o.kpiCard}><span>Users</span><strong>{data.users}</strong></div>
          <div className={o.kpiCard}><span>Sessions</span><strong>{data.sessions}</strong></div>
          <div className={o.kpiCard}><span>Runs</span><strong>{data.runs ?? 0}</strong></div>
          <div className={o.kpiCard}><span>Completion</span><strong>{fmtPct(data.kpis.completionRate)}</strong></div>
          <div className={o.kpiCard}><span>Avg session</span><strong>{fmtMs(data.kpis.avgSessionDurationMs)}</strong></div>
          <div className={o.kpiCard}><span>CTA CTR</span><strong>{fmtPct(ctaCtr)}</strong></div>
          <div className={o.kpiCard}><span>Puzzle success</span><strong>{fmtPct(data.kpis.puzzleSuccessRate)}</strong></div>
        </div>
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>2) Traffic & Activity</h4>
        <div className={o.activitySplit}>
          <div className={o.activityMain}>
            {data.dau && data.dau.length > 1 ? (
              <>
                <div className={o.seriesToggle}>
                  {(["users", "sessions"] as SeriesKey[]).map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={visible[k]}
                        onChange={(e) => setVisible((s) => ({ ...s, [k]: e.target.checked }))}
                      />
                      {k}
                    </label>
                  ))}
                </div>
                <ActivityChart dau={data.dau} visible={visible} />
              </>
            ) : (
              <p className={o.panelInfo}>Nincs elég idősoros adat a grafikonhoz.</p>
            )}
          </div>
          <div className={o.activityStats}>
            <div className={o.miniStat}>
              <span className={o.miniLabel}>Users</span>
              <strong className={o.miniValue}>{data.users}</strong>
            </div>
            <div className={o.miniStat}>
              <span className={o.miniLabel}>Sessions</span>
              <strong className={o.miniValue}>{data.sessions}</strong>
            </div>
            <div className={o.miniStat}>
              <span className={o.miniLabel}>Sessions / user</span>
              <strong className={o.miniValue}>{sessionsPerUser.toFixed(2)}</strong>
            </div>
            <div className={o.miniStat}>
              <span className={o.miniLabel}>Runs / session</span>
              <strong className={o.miniValue}>{runsPerSession.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>3) Journey Flow</h4>
        <div className={o.twoCol}>
          <div className={o.subCard}>
            <h5>Page Performance</h5>
            <div className={o.journeyTableHead}>
              <span>Page</span>
              <span>Views</span>
              <span>Exit</span>
              <span>Flow</span>
            </div>
            {topPages.map((pg) => (
              <div key={pg.pageId} className={`${o.rowItem} ${o.rowItemCompact}`}>
                <p className={o.rowTitle}>{pg.pageId}</p>
                <p className={`${o.rowMeta} ${o.journeyMeta} ${o.journeyValue}`}>{pg.views}</p>
                <p className={`${o.rowMeta} ${o.journeyMeta} ${o.journeyValue}`}>{((pg.exitRate ?? 0) * 100).toFixed(1)}%</p>
                <Bar value={pg.views} max={maxPageViews} />
              </div>
            ))}
          </div>
          <div className={o.subCard}>
            <h5>Drop-off Points</h5>
            {dropOffs.length ? dropOffs.map((d) => (
              <div key={d.pageId} className={o.rowItem}>
                <div>
                  <p className={o.rowTitle}>{d.pageId}</p>
                  <p className={`${o.rowMeta} ${o.journeyMeta}`}>Runs {d.dropOffRuns}</p>
                </div>
                <Bar value={d.dropOffRuns} max={maxDrop} />
              </div>
            )) : <p className={o.panelInfo}>Nincs drop-off adat.</p>}
            {data.restartStats ? (
              <div className={o.miniStatsGrid}>
                <div className={o.miniStat}>
                  <span className={o.miniLabel}>Restart Count</span>
                  <strong className={o.miniValue}>
                    {data.restartStats.runsWithRestart}/{data.restartStats.totalRuns}
                  </strong>
                </div>
                <div className={o.miniStat}>
                  <span className={o.miniLabel}>Restart Rate</span>
                  <strong className={o.miniValue}>
                    {fmtPct(
                      data.restartStats.totalRuns > 0
                        ? data.restartStats.runsWithRestart / data.restartStats.totalRuns
                        : 0
                    )}
                  </strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>4) Decision Analytics</h4>
        <div className={o.twoCol}>
          <div className={o.subCard}>
            <h5>Top paths</h5>
            {pathRows.length ? pathRows.map((r) => (
              <div key={r.pathId} className={o.rowItem}>
                <div>
                  <p className={o.rowTitle} title={r.pathId}>{r.pathId}</p>
                  <p className={o.rowMeta}>{r.runs} runs</p>
                </div>
              </div>
            )) : <p className={o.panelInfo}>Nincs path adat.</p>}
          </div>
          <div className={o.subCard}>
            <h5>Path conversion</h5>
            {(data.pathConversion ?? []).slice(0, 10).map((r) => (
              <div key={r.pathId} className={o.rowItem}>
                <div>
                  <p className={o.rowTitle} title={r.pathId}>{r.pathId}</p>
                  <p className={o.rowMeta}>{r.runs} runs · {fmtPct(r.conversionRate)}</p>
                </div>
                <Bar value={Math.round(r.conversionRate * 100)} max={100} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>5) Choices</h4>
        <div className={o.subCard}>
          {choiceBlocks.source === "steps" ? (
            <p className={o.panelInfo}>
              Nincs <code className={o.inlineCode}>choice_select</code> esemény az időszakban; az ágazás a{" "}
              <strong>page_enter</strong> sorrendből van becsülve (következő oldal eloszlás).
            </p>
          ) : null}
          {choiceBlocks.rows.length > 0 ? (
            choiceBlocks.rows.map((c) => (
              <div key={c.pageId} className={o.choiceBlock}>
                <p className={o.rowTitle}>{c.pageId}</p>
                <div className={o.choiceTags}>
                  {c.choices.slice(0, 6).map((ch) => (
                    <span key={`${c.pageId}-${ch.choiceId}`}>
                      {ch.choiceId}: {ch.count}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className={o.panelInfo}>
              Nincs választás-adat (nincs rögzített choice esemény és nincs többági oldalátmenet sem az
              időszakban).
            </p>
          )}
        </div>
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>6) Outcomes & CTA</h4>
        <div className={o.twoCol}>
          <div className={o.subCard}>
            <h5>Elért végoldalak</h5>
            {outcomes.length > 0 ? (
              <div className={o.outcomesScroll}>
                <div className={o.outcomeList}>
                  {outcomes.map((x) => (
                    <div key={x.id} className={o.outcomeItem}>
                      <div className={o.outcomeRow}>
                        <p className={o.rowTitle} title={x.id}>{x.id}</p>
                        <div className={o.outcomeMetrics}>
                          <span className={o.outcomeMetric}>Run: <strong>{x.runs}</strong></span>
                          <span className={o.outcomeMetric}>CTA shown: <strong>{x.ctaShown}</strong></span>
                          <span className={o.outcomeMetric}>Click: <strong>{x.ctaClicks}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className={o.panelInfo}>Nincs elért végoldal ebben az időszakban.</p>
            )}
          </div>
          <div className={o.subCard}>
            <h5>CTA összesítés</h5>
            <p className={o.panelInfo}>Összes CTA shown: <strong>{data.totals.ctaShown ?? 0}</strong></p>
            <p className={o.panelInfo}>Összes CTA click: <strong>{data.totals.ctaClicks ?? 0}</strong></p>
            <p className={o.restartInfo}>Összesített CTA CTR: {fmtPct(ctaCtr)}</p>
          </div>
        </div>
        {totalsRuns > 0 || totalsShown > 0 || totalsClicked > 0 ? (
          <div className={`${o.subCard} ${o.outcomeChartWide}`}>
            <h5>Outcome Comparison</h5>
            <div className={o.outcomeChartLegend}>
              <span><i className={o.seriesRun} />Runs</span>
              <span><i className={o.seriesShown} />CTA shown</span>
              <span><i className={o.seriesClick} />CTA clicked</span>
            </div>
            <div className={o.outcomeChartRowsCompact}>
              <div className={o.outcomeChartRowCompact}>
                <div className={o.outcomeBarsInline}>
                  <div className={o.outcomeInlineTrack}>
                    <div
                      className={`${o.outcomeInlineFill} ${o.seriesRun}`}
                      style={{ width: `${Math.max(4, Math.round((totalsRuns / outcomeTotalsChartMax) * 100))}%` }}
                    />
                  </div>
                  <span>{totalsRuns}</span>
                </div>
                <div className={o.outcomeBarsInline}>
                  <div className={o.outcomeInlineTrack}>
                    <div
                      className={`${o.outcomeInlineFill} ${o.seriesShown}`}
                      style={{ width: `${Math.max(4, Math.round((totalsShown / outcomeTotalsChartMax) * 100))}%` }}
                    />
                  </div>
                  <span>{totalsShown}</span>
                </div>
                <div className={o.outcomeBarsInline}>
                  <div className={o.outcomeInlineTrack}>
                    <div
                      className={`${o.outcomeInlineFill} ${o.seriesClick}`}
                      style={{ width: `${Math.max(4, Math.round((totalsClicked / outcomeTotalsChartMax) * 100))}%` }}
                    />
                  </div>
                  <span>{totalsClicked}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className={o.section}>
        <h4 className={o.sectionTitle}>7) Puzzle & Interaction Quality</h4>
        <div className={o.twoCol}>
          <div className={o.subCard}>
            <h5>Runes</h5>
            {(data.puzzleRunesTopOptions ?? []).map((x) => (
              <div key={x.label} className={o.rowItem}>
                <div><p className={o.rowTitle}>{x.label}</p><p className={o.rowMeta}>{x.count} választás</p></div>
              </div>
            ))}
            {(data.puzzleRunesStats?.solvedByAttempt ?? []).map((a) => (
              <div key={a.attempt} className={o.rowItem}>
                <div><p className={o.rowMeta}>Solved at attempt {a.attempt}</p></div>
                <Bar value={a.count} max={Math.max(1, ...(data.puzzleRunesStats?.solvedByAttempt ?? []).map((x) => x.count))} />
              </div>
            ))}
          </div>
          <div className={o.subCard}>
            <h5>Riddle</h5>
            {(data.riddleStats?.wrongByQuestion ?? []).slice(0, 8).map((q) => (
              <div key={q.pageId} className={o.rowItem}>
                <div>
                  <p className={o.rowTitle}>{q.pageId}</p>
                  <p className={o.rowMeta}>{q.count} hiba</p>
                </div>
                <Bar value={Math.round(q.pct * 100)} max={100} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <details className={o.advanced}>
        <summary>8) Advanced: structure és domain</summary>
        <div className={o.advancedBody}>
          <div className={o.twoCol}>
            <div className={o.subCard}>
              <h5>Steps / transitions</h5>
              {steps.map((s) => (
                <div key={s.stepId} className={o.choiceBlock}>
                  <p className={o.rowTitle}>{s.stepId}</p>
                  <div className={o.choiceTags}>
                    {s.options.slice(0, 6).map((op) => (
                      <span key={op.value}>{op.value}: {op.runs}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className={o.subCard}>
              <h5>Domain / source</h5>
              {domains.map((d) => (
                <div key={d.domain} className={o.rowItem}>
                  <div>
                    <p className={o.rowTitle}>{d.domain}</p>
                    <p className={o.rowMeta}>{d.sessions} sessions · {d.runs} runs</p>
                  </div>
                  <Bar value={d.sessions} max={Math.max(1, ...domains.map((x) => x.sessions))} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export default function DashboardOverviewClient() {
  const [count, setCount] = useState<number | null>(null);
  const [liveRows, setLiveRows] = useState<ReturnType<typeof buildLiveEmbeddedRows>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const [catalog, liveCfg] = await Promise.all([
          fetchStoriesWithMultiFallback("Dashboard"),
          fetchLiveEmbeddedConfig(),
        ]);
        if (cancelled) return;
        setCount(catalog.length);
        setLiveRows(buildLiveEmbeddedRows(catalog, liveCfg));
      } catch (e) {
        if (!cancelled) {
          setCount(null);
          setLiveRows([]);
          setErr(e instanceof Error ? e.message : "Betöltés sikertelen.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={o.page}>
      <header className={o.hero}>
        <p className={o.eyebrow}>Questell · Munkaterület</p>
        <h1 className={`${p.pageTitle} ${o.heroTitle}`}>Áttekintés</h1>
        <p className={`${p.lead} ${o.heroLead}`}>
          Építsd a sztorikat, tedd közzé őket ügyféloldalakon, és kövesd nyomon a következő
          lépéseket — innen érheted el a katalógust, a szerkesztőt és hamarosan az analitikát is.
        </p>
      </header>

      {err ? <p className={p.error}>{err}</p> : null}

      <div className={`${p.card} ${o.surfaceCard}`}>
        <h2 className={p.cardTitle}>Sztorik a katalógusban</h2>
        <div className={o.statStack}>
          <span className={o.statLabel}>Kampányok, amelyekkel most dolgozhatsz</span>
          <div className={`${p.statValue} ${o.statFigure}`}>
            {count === null && !err ? "…" : count ?? "—"}
          </div>
        </div>
        <div className={p.actions}>
          <Link
            href="/dashboard/stories"
            className={`${p.btn} ${p.btnPrimary} ${o.btnAccent}`}
          >
            Összes sztori
          </Link>
          <Link
            href="/dashboard/video-page"
            className={`${p.btn} ${p.btnGhost} ${o.btnGhostSoft}`}
          >
            Video Landing (Temp)
          </Link>
          <Link
            href="/editor"
            className={`${p.btn} ${p.btnGhost} ${o.btnGhostSoft}`}
          >
            Szerkesztő megnyitása
          </Link>
        </div>
      </div>

      <div className={`${p.card} ${o.surfaceCard}`}>
        <div className={o.liveSectionHead}>
          <div className={o.liveSectionTitleRow}>
            <span className={o.livePill}>Élő</span>
            <h2 className={`${p.cardTitle} ${o.liveCardTitle}`}>
              Beágyazás az ügyfél oldalán
            </h2>
          </div>
          <p className={`${p.liveSectionLead} ${o.liveLead}`}>{LIVE_SECTION_LEAD}</p>
        </div>
        {liveRows.length === 0 ? (
          <p className={p.liveEmpty}>
            Még nincs bejegyzett élő beágyazás. Generálj tokent egy sztori beágyazás oldalán —
            a lista automatikusan bővül, és itt jelennek meg az összefoglalók.
          </p>
        ) : (
          <ul className={`${p.liveList} ${o.liveList}`}>
            {liveRows.map((row) => (
              <li key={row.storyId} className={p.liveAccordionItem}>
                <details className={`${p.liveDetails} ${o.liveDetailsGlow}`}>
                  <summary className={p.liveSummary}>
                    <span className={p.liveSummaryChevron} aria-hidden>
                      ▶
                    </span>
                    <span className={p.liveSummaryText}>
                      <span className={p.liveSummaryTitle}>{row.displayTitle}</span>
                      <span className={p.liveSummaryId}>{row.storyId}</span>
                    </span>
                    {row.livePageUrl ? (
                      <a
                        href={row.livePageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={p.liveSummaryExternal}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Élő oldal
                      </a>
                    ) : null}
                  </summary>
                  <div className={p.liveDetailsBody}>
                    <LiveAnalyticsSection storyId={row.storyId} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

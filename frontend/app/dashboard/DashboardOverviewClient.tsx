"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildLiveEmbeddedRows } from "@/app/lib/buildLiveEmbeddedRows";
import { fetchLiveEmbeddedConfig } from "@/app/lib/liveEmbeddedConfig";
import { fetchStoriesWithMultiFallback } from "@/app/lib/storiesListing";
import p from "./dashboardPage.module.scss";
import o from "./dashboardOverview.module.scss";

const LIVE_SECTION_LEAD =
  "Minden sor egy ügyféloldalon futó beágyazás. Ide kerül a teljesítmény és az események összefoglalója — hogy egy pillantással lásd, mi történik az élő linkeken.";

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
                    <p className={p.liveDetailsPlaceholder}>
                      Statisztika és események összefoglalója — fejlesztés alatt.
                    </p>
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

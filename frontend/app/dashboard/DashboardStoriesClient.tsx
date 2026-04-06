"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deriveStoryId,
  fetchStoriesWithMultiFallback,
  type StoryListItem,
} from "@/app/lib/storiesListing";
import { buildStoryPreviewHref } from "./storyPreviewNav";
import p from "./dashboardPage.module.scss";

function rowFromItem(a: StoryListItem) {
  const storyId = deriveStoryId(a);
  const jsonSrc = a.jsonSrc || `/stories/${storyId}.json`;
  const startPageId = a.startPageId || "ch1_pg1";
  const title = a.title || storyId;
  const blurb = a.description || "";
  return { storyId, jsonSrc, startPageId, title, blurb };
}

export default function DashboardStoriesClient() {
  const router = useRouter();
  const [items, setItems] = useState<StoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const list = await fetchStoriesWithMultiFallback("Dashboard");
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Nem sikerült betölteni a sztorikat.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPreview = (row: ReturnType<typeof rowFromItem>) => {
    const href = buildStoryPreviewHref({
      storyId: row.storyId,
      jsonSrc: row.jsonSrc,
      startPageId: row.startPageId,
      title: row.title,
    });
    router.push(href);
  };

  if (loading) {
    return <p className={p.lead}>Betöltés…</p>;
  }

  if (err) {
    return <p className={p.error}>{err}</p>;
  }

  return (
    <>
      <h1 className={p.pageTitle}>Sztorijaim</h1>
      <p className={p.lead}>
        Lista a szerverről / registry-ből. Egy sztorihoz előnézet, szerkesztő és beágyazási
        eszközök.
      </p>

      <div className={p.tableWrap}>
        <table className={p.table}>
          <thead>
            <tr>
              <th className={p.th}>Cím</th>
              <th className={p.th}>Azonosító</th>
              <th className={p.th}>Leírás</th>
              <th className={p.th}>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const row = rowFromItem(a);
              return (
                <tr key={row.storyId}>
                  <td className={p.td}>{row.title}</td>
                  <td className={p.td}>
                    <span className={p.mono}>{row.storyId}</span>
                  </td>
                  <td className={p.td}>
                    {row.blurb ? (
                      <span className={p.desc} title={row.blurb}>
                        {row.blurb}
                      </span>
                    ) : (
                      <span className={p.desc}>—</span>
                    )}
                  </td>
                  <td className={p.td}>
                    <div className={p.rowActions}>
                      <button
                        type="button"
                        className={p.rowBtn}
                        onClick={() => onPreview(row)}
                      >
                        Előnézet
                      </button>
                      <Link href="/editor" className={p.rowBtn}>
                        Szerkesztő
                      </Link>
                      <Link
                        href={`/dashboard/stories/${encodeURIComponent(row.storyId)}/embed`}
                        className={p.rowBtn}
                      >
                        Beágyazás
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 ? (
        <p className={p.lead}>Nincs egy sztori sem a listában.</p>
      ) : null}
    </>
  );
}

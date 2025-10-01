"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ParallaxBackground from "@/app/components/ParallaxBackground/ParallaxBackground";
import { layers } from "@/app/components/LayersConfig";
import styles from "./adventures.module.scss";
import ReportDrawer from "../components/ReportDrawer/ReportDrawer";
import ReportScheduleForm from "../components/ReportScheduleForm/ReportScheduleForm";

type StoryMeta = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  jsonSrc: string;        // pl. /stories/forest_v1.json
  startPageId?: string;   // ha később bevezetjük a metában
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

function deriveStoryId(a: Partial<StoryMeta> & Record<string, any>): string {
  // preferáld az API id-t
  if (a?.id) return String(a.id);
  // fallback jsonSrc -> fájlnév kiterjesztés nélkül
  const src = a?.jsonSrc;
  if (typeof src === "string") {
    const base = (src.split("/").pop() || "").replace(/\.[^.]+$/, "");
    if (base) return base;
  }
  // legvégső fallback
  return "unknown";
}

export default function AdventuresPage() {
  const router = useRouter();
  const [items, setItems] = useState<StoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const r = await fetch(`${API_BASE}/api/stories`, { cache: "no-store" });
        if (!r.ok) throw new Error(`GET /api/stories ${r.status}`);
        const list = (await r.json()) as StoryMeta[];
        setItems(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setErr(e?.message || "Nem sikerült betölteni a sztorikat.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className={styles.adventuresRoot}>
        <ParallaxBackground layers={layers} />
        <div className={styles.headerBar}>
          <h1>Adventures</h1>
          <button onClick={() => router.push("/")}>Vissza</button>
        </div>
        <div className={styles.grid}>Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className={styles.adventuresRoot}>
        <ParallaxBackground layers={layers} />
        <div className={styles.headerBar}>
          <h1>Adventures</h1>
          <button onClick={() => router.push("/")}>Vissza</button>
        </div>
        <div className={styles.grid} style={{ color: "tomato" }}>
          {err}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adventuresRoot}>
      <ParallaxBackground layers={layers} />

      <div className={styles.headerBar}>
        <h1>Adventures</h1>
        <button onClick={() => router.push("/")}>Vissza</button>
      </div>

      <div className={styles.grid}>
        {items.map((a) => {
          const storyId = deriveStoryId(a);
          const cover =
            a.coverImage ||
            (a as any)?.meta?.coverImage || // ha a backend visszaadna meta-t is
            "/assets/covers/default.jpg";
          const jsonSrc = a.jsonSrc || `/stories/${storyId}.json`;
          const startPageId = a.startPageId || "ch1_pg1";
          const title = a.title || storyId;
          const blurb = a.description || "";

          return (
            <article key={storyId} className={styles.card}>
              <div
                className={styles.cover}
                style={{ backgroundImage: `url(${cover})` }}
              />
              <div className={styles.body}>
                <h2>{title}</h2>
                {blurb && <p>{blurb}</p>}

                <div className={styles.actions}>
                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem("storySrc", jsonSrc);
                        localStorage.setItem("currentPageId", startPageId);
                        localStorage.setItem("storyTitle", title);
                      } catch {}
                      router.push(
                        `/story?src=${encodeURIComponent(
                          jsonSrc
                        )}&start=${encodeURIComponent(
                          startPageId
                        )}&title=${encodeURIComponent(title)}`
                      );
                    }}
                    disabled={!jsonSrc}
                    title={!jsonSrc ? "Hiányzó jsonSrc" : ""}
                  >
                    Start
                  </button>

                  <button
                    aria-label={`Open report for ${storyId}`}
                    onClick={() => setReportFor(storyId)}
                  >
                    Report
                  </button>

                  <button
                    aria-label={`Open schedule for ${storyId}`}
                    onClick={() => setScheduleFor(storyId)}
                  >
                    Schedule
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {reportFor && (
        <ReportDrawer storyId={reportFor} onClose={() => setReportFor(null)} />
      )}

      {scheduleFor !== null && (
        <ReportScheduleForm
          storyId={scheduleFor || "unknown"}
          onClose={() => setScheduleFor(null)}
        />
      )}
    </div>
  );
}

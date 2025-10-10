"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ParallaxBackground from "@/app/components/ParallaxBackground/ParallaxBackground";
import { layers } from "@/app/components/LayersConfig";
import styles from "./adventures.module.scss";
import ReportDrawer from "../components/ReportDrawer/ReportDrawer";
import ReportScheduleForm from "../components/ReportScheduleForm/ReportScheduleForm";
import { loadTokens } from "@/app/lib/tokenLoader";

type StoryMeta = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  jsonSrc: string;        // pl. /stories/forest_v1.json
  startPageId?: string;   // ha később bevezetjük a metában
};

type SkinMeta = { id: string; title: string; preview?: string };

const SKIN_LS_KEY = "skinByCampaignId";

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

  // ⬇️ Skin registry + per-kampány beállítások
  const [skins, setSkins] = useState<SkinMeta[]>([]);
  const [skinMap, setSkinMap] = useState<Record<string, string>>({});

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

  // ⬇️ Skin registry + LS visszatöltés
  useEffect(() => {
    fetch("/skins/registry.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSkins(Array.isArray(j?.skins) ? j.skins : []))
      .catch(() => setSkins([]));

    try {
      const raw = localStorage.getItem(SKIN_LS_KEY);
      if (raw) setSkinMap(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const persistSkin = (campaignId: string, skinId: string) => {
    const next = { ...skinMap, [campaignId]: skinId };
    setSkinMap(next);
    try {
      localStorage.setItem(SKIN_LS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const applySkin = async (skinId?: string) => {
    if (!skinId) return; // Default: ne írjunk felül semmit, marad a SCSS fallback
    try {
      await loadTokens(`/skins/${skinId}.json?v=${Date.now()}`);
    } catch {
      // ignore; ha nem sikerül, marad a jelenlegi stílus
    }
  };

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

          const selectedSkin = skinMap[storyId] || "";

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
                  {/* ⬇️ ÚJ: Skin dropdown */}
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span>Theme:</span>
                    <select
                      value={selectedSkin}
                      onChange={async (e) => {
                        const skinId = e.target.value;
                        persistSkin(storyId, skinId);
                        await applySkin(skinId); // élő előnézet az Adventures oldalon
                      }}
                    >
                      <option value="">Default</option>
                      {skins.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title || s.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem("storySrc", jsonSrc);
                        localStorage.setItem("currentPageId", startPageId);
                        localStorage.setItem("storyTitle", title);
                      } catch {}
                      // opcionális: skin átadás query paramként is
                      const skinPart = selectedSkin
                        ? `&skin=${encodeURIComponent(selectedSkin)}`
                        : "";
                      router.push(
                        `/story?src=${encodeURIComponent(
                          jsonSrc
                        )}&start=${encodeURIComponent(
                          startPageId
                        )}&title=${encodeURIComponent(title)}${skinPart}`
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

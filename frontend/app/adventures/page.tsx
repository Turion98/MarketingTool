"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ParallaxBackground from "@/app/components/ParallaxBackground/ParallaxBackground";
import { layers } from "@/app/components/LayersConfig";
import styles from "./adventures.module.scss";
import ReportDrawer from "../components/ReportDrawer/ReportDrawer";
import ReportScheduleForm from "../components/ReportScheduleForm/ReportScheduleForm";
import { loadTokens } from "@/app/lib/tokenLoader";
import CampaignCard, { type RuneChoice } from "./components/CampaignCard";

type StoryMeta = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  jsonSrc: string;
  startPageId?: string;
};

type SkinMeta = { id: string; title: string; preview?: string };

const SKIN_LS_KEY = "skinByCampaignId";
const RUNE_LS_KEY = "runePackByCampaignId";

/* =========================
   Többlépcsős történetlista betöltés
   ========================= */

function envBase() {
  const v = process.env.NEXT_PUBLIC_API_BASE || "";
  return v ? v.replace(/\/+$/, "") : "";
}
function curOrigin() {
  return typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "";
}

function buildStoryCandidates(): string[] {
  const env = envBase();
  const origin = curOrigin();
  const dev = "http://127.0.0.1:8000";

  const urls: string[] = [];
  if (env) urls.push(`${env}/api/stories`);             // 1) explicit backend
  if (origin) urls.push(`${origin}/api/stories`);       // 2) same-origin API (ha van proxy)
  urls.push(`/stories/registry.json`);                  // 3) statikus fallback ugyanazon originről
  urls.push(`${dev}/api/stories`);                      // 4) DEV backend
  return Array.from(new Set(urls));
}

function normalizeStories(payload: any): StoryMeta[] | null {
  // forma A: tömb
  if (Array.isArray(payload)) return payload as StoryMeta[];
  // forma B: { stories: [...] }
  if (payload && Array.isArray(payload.stories)) return payload.stories as StoryMeta[];
  return null;
}

async function tryFetch(url: string): Promise<StoryMeta[] | null> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const norm = normalizeStories(j);
  if (!norm) return null;

  // registry.json-ból hiányozhat a jsonSrc → képezzük le
  return norm.map((s: any) => {
    const id = s?.id || deriveStoryId(s);
    const jsonSrc =
      s?.jsonSrc ||
      (typeof id === "string" && id ? `/stories/${id}.json` : undefined);
    return { ...s, id, jsonSrc } as StoryMeta;
  });
}

async function fetchStoriesWithMultiFallback(): Promise<StoryMeta[]> {
  const urls = buildStoryCandidates();
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const res = await tryFetch(u);
      if (res && res.length) {
        if (u.includes("127.0.0.1")) console.info("[Adventures] DEV fallback @", u);
        if (u.endsWith("/stories/registry.json")) console.info("[Adventures] Static registry @", u);
        return res;
      }
      console.warn("[Adventures] no data @", u);
    } catch (e) {
      lastErr = e;
      console.warn("[Adventures] fetch error @", u, e);
    }
  }
  throw lastErr || new Error("No story source succeeded");
}

/* =========================
   Segédek
   ========================= */

function deriveStoryId(a: Partial<StoryMeta> & Record<string, any>): string {
  if (a?.id) return String(a.id);
  const src = a?.jsonSrc;
  if (typeof src === "string") {
    const base = (src.split("/").pop() || "").replace(/\.[^.]+$/, "");
    if (base) return base;
  }
  return "unknown";
}

/* =========================
   Komponens
   ========================= */

export default function AdventuresPage() {
  const router = useRouter();

  // adat betöltés
  const [items, setItems] = useState<StoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // modálisok
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  // skinek & kiválasztások
  const [skins, setSkins] = useState<SkinMeta[]>([]);
  const [skinMap, setSkinMap] = useState<Record<string, string>>({});

  // runes per kampány
  const [runeMap, setRuneMap] = useState<Record<string, RuneChoice>>({});

  // sztorik betöltése fallback lánccal
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const list = await fetchStoriesWithMultiFallback();
        setItems(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setErr(e?.message || "Nem sikerült betölteni a sztorikat.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // skinek + localStorage visszatöltés
  useEffect(() => {
    fetch("/skins/registry.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSkins(Array.isArray(j?.skins) ? j.skins : []))
      .catch(() => setSkins([]));

    try {
      const raw = localStorage.getItem(SKIN_LS_KEY);
      if (raw) setSkinMap(JSON.parse(raw));
    } catch {}

    try {
      const rawR = localStorage.getItem(RUNE_LS_KEY);
      if (rawR) setRuneMap(JSON.parse(rawR));
    } catch {}
  }, []);

  // persist helpers
  const persistSkin = (campaignId: string, skinId: string) => {
    const next = { ...skinMap, [campaignId]: skinId };
    setSkinMap(next);
    try {
      localStorage.setItem(SKIN_LS_KEY, JSON.stringify(next));
    } catch {}
  };

  const persistRunes = (campaignId: string, choice: RuneChoice) => {
    const next = { ...runeMap, [campaignId]: choice };
    setRuneMap(next);
    try {
      localStorage.setItem(RUNE_LS_KEY, JSON.stringify(next));
    } catch {}
  };

  const applySkin = async (skinId?: string) => {
    if (!skinId) return;
    try {
      await loadTokens(`/skins/${skinId}.json?v=${Date.now()}`);
    } catch {}
  };

  // prop-szintű handler a kártyáknak
  const handleSkinChange = async (storyId: string, skinId: string) => {
    persistSkin(storyId, skinId);
    await applySkin(skinId); // élő előnézet
  };

  const handleRunesChange = (storyId: string, choice: RuneChoice) => {
    persistRunes(storyId, choice);
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
            a.coverImage || (a as any)?.meta?.coverImage || "/assets/covers/default.jpg";
          const jsonSrc = a.jsonSrc || `/stories/${storyId}.json`;
          const startPageId = a.startPageId || "ch1_pg1";
          const title = a.title || storyId;
          const blurb = a.description || "";

          const selectedSkin = skinMap[storyId] || "contract_default";
          const runeChoice = runeMap[storyId] || { mode: "single", icons: ["ring"] };

          return (
            <CampaignCard
              key={storyId}
              storyId={storyId}
              title={title}
              blurb={blurb}
              cover={cover}
              jsonSrc={jsonSrc}
              startPageId={startPageId}
              skins={skins}
              selectedSkin={selectedSkin}
              onChangeSkin={handleSkinChange}
              runeChoice={runeChoice}
              onChangeRunes={handleRunesChange}
              onOpenReport={setReportFor}
              onOpenSchedule={setScheduleFor}
            />
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

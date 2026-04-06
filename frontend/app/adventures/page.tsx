"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ParallaxBackground from "@/app/components/ParallaxBackground/ParallaxBackground";
import { layers } from "@/app/components/LayersConfig";
import styles from "./adventures.module.scss";
import ReportDrawer from "../components/ReportDrawer/ReportDrawer";
import ReportScheduleForm from "../components/ReportScheduleForm/ReportScheduleForm";
import { loadTokens } from "@/app/lib/tokenLoader";
import { clearSkinCache } from "@/app/lib/utils/skinCacheDebug";
import CampaignCard, { type RuneChoice } from "./components/CampaignCard";
import {
  deriveStoryId,
  fetchStoriesWithMultiFallback,
  type StoryListItem,
} from "@/app/lib/storiesListing";

type StoryMeta = StoryListItem;

type SkinMeta = { id: string; title: string; preview?: string };

const SKIN_LS_KEY = "skinByCampaignId";
const RUNE_LS_KEY = "runePackByCampaignId";

/* =========================
   Komponens
   ========================= */

function AdventuresHeaderBar() {
  const router = useRouter();
  return (
    <div className={styles.headerBar}>
      <h1>Adventures</h1>
      <div className={styles.headerActions}>
        <button type="button" onClick={() => router.push("/landing/space")}>
          Atlasz
        </button>
        <button type="button" onClick={() => router.push("/")}>
          Vissza
        </button>
        <button
          type="button"
          className={styles.devSkinCacheBtn}
          onClick={() => {
            const n = clearSkinCache();
            alert(`Skin cache törölve (${n} kulcs). Frissítek...`);
            location.reload();
          }}
          title="mt:v1:skin:* + skinByCampaignId törlése (localStorage)"
        >
          Clear skin cache
        </button>
      </div>
    </div>
  );
}

export default function AdventuresPage() {
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
        const list = await fetchStoriesWithMultiFallback("Adventures");
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
        <AdventuresHeaderBar />
        <div className={styles.grid}>Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className={styles.adventuresRoot}>
        <ParallaxBackground layers={layers} />
        <AdventuresHeaderBar />
        <div className={styles.grid} style={{ color: "tomato" }}>
          {err}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adventuresRoot}>
      <ParallaxBackground layers={layers} />

      <AdventuresHeaderBar />

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

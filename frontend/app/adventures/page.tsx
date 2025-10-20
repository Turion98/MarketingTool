"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ParallaxBackground from "@/app/components/ParallaxBackground/ParallaxBackground";
import { layers } from "@/app/components/LayersConfig";
import styles from "./adventures.module.scss";
import ReportDrawer from "../components/ReportDrawer/ReportDrawer";
import ReportScheduleForm from "../components/ReportScheduleForm/ReportScheduleForm";
import { loadTokens } from "@/app/lib/tokenLoader";

// Ikon registry kulcsaihoz
import { ICON_REGISTRY } from "@/app/lib/IconRegistry";

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

// Rune választás per-kampány
type RuneChoice = { mode: "single" | "triple"; icons: string[] };

const SKIN_LS_KEY = "skinByCampaignId";
const RUNE_LS_KEY = "runePackByCampaignId"; // per-campaign rune választás

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

function deriveStoryId(a: Partial<StoryMeta> & Record<string, any>): string {
  if (a?.id) return String(a.id);
  const src = a?.jsonSrc;
  if (typeof src === "string") {
    const base = (src.split("/").pop() || "").replace(/\.[^.]+$/, "");
    if (base) return base;
  }
  return "unknown";
}

// Default ikonok (fallback)
const DEFAULT_SINGLE = ["ring"];
const DEFAULT_TRIPLE = ["ring", "arc", "dot"];

export default function AdventuresPage() {
  const router = useRouter();
  const [items, setItems] = useState<StoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  // Skin registry + per-kampány beállítások
  const [skins, setSkins] = useState<SkinMeta[]>([]);
  const [skinMap, setSkinMap] = useState<Record<string, string>>({});

  // Rune választások per-kampány
  const [runeMap, setRuneMap] = useState<Record<string, RuneChoice>>({});

  // Legördülő menü nyitottsága (storyId szerint)
  const [openRuneMenuFor, setOpenRuneMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // A legördülő portál pozíciója (gomb alá)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  // Ikon kulcsok a registry-ből
  const iconKeys = useMemo(() => Object.keys(ICON_REGISTRY || {}), []);

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

  // Skin registry + LS visszatöltés + rune választások visszatöltése
  useEffect(() => {
    fetch("/skins/registry.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSkins(Array.isArray(j?.skins) ? j.skins : []))
      .catch(() => setSkins([]));

    try {
      const raw = localStorage.getItem(SKIN_LS_KEY);
      if (raw) setSkinMap(JSON.parse(raw));
    } catch {
      /* ignore */
    }

    try {
      const rawR = localStorage.getItem(RUNE_LS_KEY);
      if (rawR) setRuneMap(JSON.parse(rawR));
    } catch {
      /* ignore */
    }
  }, []);

  // Kívülre kattintásra zárjuk a nyitott menüt
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openRuneMenuFor) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenRuneMenuFor(null);
        setMenuPos(null);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenRuneMenuFor(null);
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openRuneMenuFor]);

  const persistSkin = (campaignId: string, skinId: string) => {
    const next = { ...skinMap, [campaignId]: skinId };
    setSkinMap(next);
    try {
      localStorage.setItem(SKIN_LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const persistRunes = (campaignId: string, choice: RuneChoice) => {
    const next = { ...runeMap, [campaignId]: choice };
    setRuneMap(next);
    try {
      localStorage.setItem(RUNE_LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const applySkin = async (skinId?: string) => {
    if (!skinId) return;
    try {
      await loadTokens(`/skins/${skinId}.json?v=${Date.now()}`);
    } catch {
      /* ignore */
    }
  };

  // Kampányhoz aktuális rune choice (defaulttal)
  const getChoice = (storyId: string): RuneChoice => {
    const saved = runeMap[storyId];
    if (saved?.mode === "single") {
      return {
        mode: "single",
        icons: saved.icons?.length ? saved.icons.slice(0, 1) : DEFAULT_SINGLE,
      };
    }
    if (saved?.mode === "triple") {
      const picked = Array.isArray(saved.icons) ? saved.icons.slice(0, 3) : [];
      return {
        mode: "triple",
        icons: picked.length ? picked : DEFAULT_TRIPLE,
      };
    }
    return { mode: "single", icons: DEFAULT_SINGLE };
  };

  // Kattintási sorrend szervezése (triple módban)
  const toggleIcon = (storyId: string, key: string) => {
    const prev = getChoice(storyId);
    if (prev.mode === "single") {
      persistRunes(storyId, { mode: "single", icons: [key] });
      return;
    }
    const cur = [...prev.icons];
    const idx = cur.indexOf(key);
    if (idx >= 0) {
      cur.splice(idx, 1);
    } else {
      if (cur.length < 3) cur.push(key);
    }
    persistRunes(storyId, { mode: "triple", icons: cur });
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
            (a as any)?.meta?.coverImage ||
            "/assets/covers/default.jpg";
          const jsonSrc = a.jsonSrc || `/stories/${storyId}.json`;
          const startPageId = a.startPageId || "ch1_pg1";
          const title = a.title || storyId;
          const blurb = a.description || "";

          const selectedSkin = skinMap[storyId] || "contract_default";

          // aktuális rune choice
          const choice = getChoice(storyId);

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
                  {/* Theme választó */}
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span>Theme:</span>
                    <select
                      value={selectedSkin}
                      onChange={async (e) => {
                        const skinId = e.target.value;
                        persistSkin(storyId, skinId);
                        await applySkin(skinId); // élő előnézet
                      }}
                      onFocus={async () => {
                        if (selectedSkin) await applySkin(selectedSkin);
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

                  {/* Runes (Single / Triple) + legördülő többes választó */}
                  <div className={styles.runes} style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span>Runes:</span>

                      {/* módválasztó */}
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name={`mode-${storyId}`}
                          value="single"
                          checked={choice.mode === "single"}
                          onChange={() => {
                            const next = choice.icons[0] ? [choice.icons[0]] : DEFAULT_SINGLE;
                            persistRunes(storyId, { mode: "single", icons: next.slice(0, 1) });
                          }}
                        />
                        Single
                      </label>

                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name={`mode-${storyId}`}
                          value="triple"
                          checked={choice.mode === "triple"}
                          onChange={() => {
                            const cur = choice.icons.length ? choice.icons.slice(0, 3) : DEFAULT_TRIPLE;
                            persistRunes(storyId, { mode: "triple", icons: cur });
                          }}
                        />
                        Triple
                      </label>

                      {/* legördülő nyitógomb: jelzi a darabszámot és (ha 3-as) a sorrendet */}
                      <div className={styles.runeDropdown}>
                        <button
                          type="button"
                          className={styles.runeDropdownButton}
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setMenuPos({
                              left: Math.round(rect.left + window.scrollX),
                              top: Math.round(rect.bottom + window.scrollY + 6),
                            });
                            setOpenRuneMenuFor((prev) => (prev === storyId ? null : storyId));
                          }}
                          aria-expanded={openRuneMenuFor === storyId}
                          aria-haspopup="listbox"
                          title="Válaszd ki az ikon(oka)t"
                        >
                          {choice.mode === "single"
                            ? `Choose… (current: ${choice.icons[0] ?? DEFAULT_SINGLE[0]})`
                            : `Choose… (${choice.icons.length}/3)`}
                        </button>

                        {openRuneMenuFor === storyId &&
                          createPortal(
                            <div
                              ref={menuRef}
                              className={styles.runeMenu}
                              role="listbox"
                              aria-multiselectable={choice.mode === "triple" ? true : undefined}
                              style={{
                                position: "fixed",
                                left: menuPos?.left ?? 0,
                                top: menuPos?.top ?? 0,
                                width: "min(320px, 80vw)",
                                maxHeight: "50vh",
                                overflow: "auto",
                                zIndex: 10000,
                              }}
                            >
                              <ul className={styles.runeMenuList}>
                                {iconKeys.map((key) => {
                                  const IconComp = (ICON_REGISTRY as any)[key];
                                  const activeIdx = choice.icons.indexOf(key);
                                  const isActive = activeIdx >= 0;
                                  const disabled =
                                    choice.mode === "triple" &&
                                    !isActive &&
                                    choice.icons.length >= 3;

                                  return (
                                    <li key={key} className={styles.runeMenuItem}>
                                      <label className={disabled ? styles.disabled : ""}>
                                        <input
                                          type="checkbox"
                                          checked={isActive}
                                          disabled={disabled && choice.mode === "triple"}
                                          onChange={() => {
                                            if (choice.mode === "single") {
                                              // single: azonnali kizárólagosság és menü zárása
                                              persistRunes(storyId, { mode: "single", icons: [key] });
                                              setOpenRuneMenuFor(null);
                                              setMenuPos(null);
                                            } else {
                                              // triple: push/eltávolítás a sorrend megőrzésével
                                              toggleIcon(storyId, key);
                                            }
                                          }}
                                        />

                                        {/* IKON ELŐNÉZET */}
                                        <span aria-hidden className={styles.iconPreview}>
                                          {IconComp ? <IconComp style={{ width: 18, height: 18 }} /> : "•"}
                                        </span>

                                        <span className={styles.labelText}>{key}</span>

                                        {choice.mode === "triple" && isActive && (
                                          <span className={styles.orderBadge}>{activeIdx + 1}</span>
                                        )}
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>

                              <div className={styles.runeMenuFooter}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRuneMenuFor(null);
                                    setMenuPos(null);
                                  }}
                                  className={styles.closeBtn}
                                >
                                  Done
                                </button>
                              </div>
                            </div>,
                            document.body
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Start */}
                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem("storySrc", jsonSrc);
                        localStorage.setItem("currentPageId", startPageId);
                        localStorage.setItem("storyTitle", title);

                        // Biztonság kedvéért külön is letesszük a CURRENT választást
                        const c = getChoice(storyId);
                        const all = { ...runeMap, [storyId]: c };
                        localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
                      } catch {}

                      // opcionális: átadás query paramként (megosztható link)
                      const skinPart = selectedSkin
                        ? `&skin=${encodeURIComponent(selectedSkin)}`
                        : "";
                      const c = getChoice(storyId);
                      const runesPart =
                        c.icons?.length
                          ? `&runes=${encodeURIComponent(
                              c.icons.join(",")
                            )}&runemode=${c.mode}`
                          : "";

                      router.push(
                        `/story?src=${encodeURIComponent(
                          jsonSrc
                        )}&start=${encodeURIComponent(
                          startPageId
                        )}&title=${encodeURIComponent(title)}${skinPart}${runesPart}`
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

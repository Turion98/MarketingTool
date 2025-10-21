"use client";

import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "../adventures.module.scss";
import { ICON_REGISTRY } from "@/app/lib/IconRegistry";
import type { WLSuggestRes } from "@/app/lib/wl";
import { suggestWhiteLabel } from "@/app/lib/wl";
import { buildEmbedUrl } from "@/app/lib/whitelabel/buildEmbedUrl";

export type RuneChoice = { mode: "single" | "triple"; icons: string[] };

type CampaignCardProps = {
  storyId: string;
  title: string;
  blurb?: string;
  cover: string;
  jsonSrc: string;
  startPageId: string;
  skins: Array<{ id: string; title: string }>;
  selectedSkin?: string;
  onChangeSkin: (storyId: string, skinId: string) => Promise<void> | void;
  runeChoice: RuneChoice;
  onChangeRunes: (storyId: string, choice: RuneChoice) => void;
  onOpenReport: (storyId: string) => void;
  onOpenSchedule: (storyId: string) => void;
};

const DEFAULT_SINGLE = ["ring"];
const DEFAULT_TRIPLE = ["ring", "arc", "dot"];
const RUNE_LS_KEY = "runePackByCampaignId";

export default function CampaignCard({
  storyId,
  title,
  blurb,
  cover,
  jsonSrc,
  startPageId,
  skins,
  selectedSkin,
  onChangeSkin,
  runeChoice,
  onChangeRunes,
  onOpenReport,
  onOpenSchedule,
}: CampaignCardProps) {
  const router = useRouter();

  // ---------- Rune dropdown lokális állapot ----------
  const [openRuneMenu, setOpenRuneMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const iconKeys = useMemo(() => Object.keys(ICON_REGISTRY || {}), []);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openRuneMenu) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenRuneMenu(false);
        setMenuPos(null);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenRuneMenu(false);
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openRuneMenu]);

  const getChoice = React.useCallback((): RuneChoice => {
    const c = runeChoice;
    if (c?.mode === "single") {
      return { mode: "single", icons: c.icons?.length ? c.icons.slice(0, 1) : DEFAULT_SINGLE };
    }
    if (c?.mode === "triple") {
      const picked = Array.isArray(c.icons) ? c.icons.slice(0, 3) : [];
      return { mode: "triple", icons: picked.length ? picked : DEFAULT_TRIPLE };
    }
    return { mode: "single", icons: DEFAULT_SINGLE };
  }, [runeChoice]);

  const toggleIcon = (key: string) => {
    const prev = getChoice();
    if (prev.mode === "single") {
      onChangeRunes(storyId, { mode: "single", icons: [key] });
      return;
    }
    const cur = [...prev.icons];
    const idx = cur.indexOf(key);
    if (idx >= 0) cur.splice(idx, 1);
    else if (cur.length < 3) cur.push(key);
    onChangeRunes(storyId, { mode: "triple", icons: cur });
  };

  // ---------- Start gomb ----------
  const start = () => {
    try {
      localStorage.setItem("storySrc", jsonSrc);
      localStorage.setItem("currentPageId", startPageId);
      localStorage.setItem("storyTitle", title);
      const c = getChoice();
      const all = JSON.parse(localStorage.getItem(RUNE_LS_KEY) || "{}");
      all[storyId] = c;
      localStorage.setItem(RUNE_LS_KEY, JSON.stringify(all));
    } catch {}

    const skinPart = selectedSkin ? `&skin=${encodeURIComponent(selectedSkin)}` : "";
    const c = getChoice();
    const runesPart =
      c.icons?.length
        ? `&runes=${encodeURIComponent(c.icons.join(","))}&runemode=${c.mode}`
        : "";

    router.push(
      `/story?src=${encodeURIComponent(jsonSrc)}&start=${encodeURIComponent(
        startPageId
      )}&title=${encodeURIComponent(title)}${skinPart}${runesPart}`
    );
  };

  const choice = getChoice();

  // ---------- White-label: API hívás + linkek ----------
  const [wlOpen, setWlOpen] = useState(false);
  const [clientDomain, setClientDomain] = useState("");
  const [wlRes, setWlRes] = useState<WLSuggestRes | null>(null);
  const [wlLoading, setWlLoading] = useState(false);
  const [wlError, setWlError] = useState<string | null>(null);

  async function onSuggestWL() {
    if (!clientDomain) return;
    const c = getChoice();
    const runes = c.icons?.length ? c.icons.join(",") : undefined;
    setWlLoading(true);
    setWlError(null);
    try {
      const data = await suggestWhiteLabel({
        clientDomain: clientDomain.trim(),
        campaignId: storyId,
        mode: "managed",
        skin: selectedSkin || undefined,
        runes,
        runemode: c.mode,
      });
      setWlRes(data);
    } catch (err: any) {
      setWlError(err?.message || String(err));
      setWlRes(null);
    } finally {
      setWlLoading(false);
    }
  }

  function CopyBtn({ text, label }: { text: string; label?: string }) {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
          } catch {}
        }}
        className={styles.copyBtn}
        title="Másolás vágólapra"
      >
        {label || "Copy"}
      </button>
    );
  }

  // ====== WHITE-LABEL LINK GENERÁLÁS (javított) ======
  const wlBase = wlRes?.wlDomain ? `https://${wlRes.wlDomain}` : "";
  const embedBase = wlBase ? `${wlBase}/embed` : "/embed";
  const playBase = wlBase ? `${wlBase}/story` : "/story";

  const runesQS =
    choice.icons?.length
      ? `&runes=${encodeURIComponent(choice.icons.join(","))}&runemode=${choice.mode}`
      : "";

  // Mindig önhordó embed URL
  const computedEmbedUrl = buildEmbedUrl({
    base: embedBase,
    campaignId: storyId,
    src: jsonSrc,
    start: startPageId,
    title,
    skin: selectedSkin || undefined,
    runes: choice.icons?.length ? choice.icons.join(",") : undefined,
    runemode: choice.mode,
  });

  // Mindig önhordó play URL
  const computedPlayUrl =
    `${playBase}?src=${encodeURIComponent(jsonSrc)}` +
    `&start=${encodeURIComponent(startPageId)}` +
    `&title=${encodeURIComponent(title)}` +
    (selectedSkin ? `&skin=${encodeURIComponent(selectedSkin)}` : "") +
    runesQS;

  // ====== RENDER ======
  return (
    <article className={styles.card}>
      <div className={styles.cover} style={{ backgroundImage: `url(${cover})` }} />
      <div className={styles.body}>
        <h2>{title}</h2>
        {blurb && <p>{blurb}</p>}

        <div className={styles.actions}>
          {/* Theme választó */}
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Theme:</span>
            <select
              value={selectedSkin || "contract_default"}
              onChange={(e) => onChangeSkin(storyId, e.target.value)}
            >
              <option value="">Default</option>
              {skins.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || s.id}
                </option>
              ))}
            </select>
          </label>

          {/* Runes */}
          <div className={styles.runes} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span>Runes:</span>

              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name={`mode-${storyId}`}
                  value="single"
                  checked={choice.mode === "single"}
                  onChange={() => {
                    const next = choice.icons[0] ? [choice.icons[0]] : DEFAULT_SINGLE;
                    onChangeRunes(storyId, { mode: "single", icons: next.slice(0, 1) });
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
                    onChangeRunes(storyId, { mode: "triple", icons: cur });
                  }}
                />
                Triple
              </label>

              {/* Dropdown */}
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
                    setOpenRuneMenu((v) => !v);
                  }}
                  aria-expanded={openRuneMenu}
                  aria-haspopup="listbox"
                  title="Válaszd ki az ikon(oka)t"
                >
                  {choice.mode === "single"
                    ? `Choose… (current: ${choice.icons[0] ?? DEFAULT_SINGLE[0]})`
                    : `Choose… (${choice.icons.length}/3)`}
                </button>

                {openRuneMenu &&
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
                            choice.mode === "triple" && !isActive && choice.icons.length >= 3;
                          return (
                            <li key={key} className={styles.runeMenuItem}>
                              <label className={disabled ? styles.disabled : ""}>
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  disabled={disabled && choice.mode === "triple"}
                                  onChange={() => {
                                    if (choice.mode === "single") {
                                      onChangeRunes(storyId, { mode: "single", icons: [key] });
                                      setOpenRuneMenu(false);
                                      setMenuPos(null);
                                    } else {
                                      toggleIcon(key);
                                    }
                                  }}
                                />
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
                            setOpenRuneMenu(false);
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

          {/* Start + kiegészítő gombok */}
          <button onClick={start} disabled={!jsonSrc} title={!jsonSrc ? "Hiányzó jsonSrc" : ""}>
            Start
          </button>
          <button aria-label={`Open report for ${storyId}`} onClick={() => onOpenReport(storyId)}>
            Report
          </button>
          <button aria-label={`Open schedule for ${storyId}`} onClick={() => onOpenSchedule(storyId)}>
            Schedule
          </button>

          {/* White-label panel */}
          <div className={styles.wlPanel} style={{ marginTop: 12 }}>
            {!wlOpen ? (
              <button type="button" onClick={() => setWlOpen(true)}>
                White-label link
              </button>
            ) : (
              <div className={styles.wlInner} style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Ügyfél domain</span>
                  <input
                    placeholder="pl. greenforest.com"
                    value={clientDomain}
                    onChange={(e) => setClientDomain(e.target.value)}
                    autoFocus
                  />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={!clientDomain || wlLoading} onClick={onSuggestWL}>
                    {wlLoading ? "Generálás…" : "Generálás"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWlOpen(false);
                      setClientDomain("");
                      setWlRes(null);
                      setWlError(null);
                    }}
                  >
                    Bezár
                  </button>
                </div>
                {!!wlError && <p style={{ color: "tomato" }}>{String(wlError)}</p>}

                {wlRes && (
                  <div className={styles.wlResult} style={{ display: "grid", gap: 6 }}>
                    <div>
                      <strong>Brand ID:</strong> {wlRes.brandId}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>Dedikált domain:</strong>
                      <code>{wlRes.wlDomain || clientDomain}</code>
                      <CopyBtn text={wlRes.wlDomain || clientDomain} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>Play:</strong>
                      <a href={computedPlayUrl} target="_blank" rel="noreferrer">
                        {computedPlayUrl}
                      </a>
                      <CopyBtn text={computedPlayUrl} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>Embed:</strong>
                      <a href={computedEmbedUrl} target="_blank" rel="noreferrer">
                        {computedEmbedUrl}
                      </a>
                      <CopyBtn text={computedEmbedUrl} />
                    </div>
                    {wlRes.verification && (
                      <details>
                        <summary>DNS verifikáció (CNAME mód esetén)</summary>
                        <pre style={{ whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(wlRes.verification, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

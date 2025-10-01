// /components/RuneDockDisplay.tsx
"use client";
import React from "react";
import style from "./labs/RuneDockOverlay/RuneDockOverlay.module.scss";

export type RuneKey = "cross" | "branch" | "shield";

type Props = {
  unlocked?: RuneKey[];
  runes?: string[];
  flagIds?: string[];
  imagesByFlag?: Record<string, string>;
  assets?: Partial<Record<RuneKey, string>>;
  order?: RuneKey[];
  ariaLabel?: string;
  /** Új: késleltetés ms-ben (pl. 500) */
  delayMs?: number;
};

const DEFAULT_ASSETS: Record<RuneKey, string> = {
  cross:  "/assets/runes/cross.png",
  branch: "/assets/runes/branch.png",
  shield: "/assets/runes/shield.png",
};

const DEFAULT_ORDER: RuneKey[] = ["cross", "branch", "shield"];

function flagToKey(flagId?: string): RuneKey | null {
  if (!flagId) return null;
  if (flagId === "rune_ch1") return "cross";
  if (flagId === "rune_ch2") return "branch";
  if (flagId === "rune_ch3") return "shield";
  return null;
}

function mapFlagsToKeys(flagIds?: string[]): RuneKey[] {
  if (!flagIds?.length) return [];
  const out: RuneKey[] = [];
  for (const id of flagIds) {
    const k = flagToKey(id);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function detectUnlockedFromPaths(paths?: string[]): RuneKey[] {
  if (!paths?.length) return [];
  const L = (s: string) => s.toLowerCase();
  const hit = (s: string, k: RuneKey) =>
    L(s).includes(k) || (k === "branch" && (L(s).includes("twig") || L(s).includes("leaf")));
  const out: RuneKey[] = [];
  for (const p of paths) {
    if (hit(p, "cross") && !out.includes("cross")) out.push("cross");
    else if (hit(p, "branch") && !out.includes("branch")) out.push("branch");
    else if (hit(p, "shield") && !out.includes("shield")) out.push("shield");
  }
  return out;
}

function buildKeyToFlagMap(flagIds?: string[]): Partial<Record<RuneKey, string>> {
  const out: Partial<Record<RuneKey, string>> = {};
  if (!flagIds?.length) return out;
  for (const id of flagIds) {
    const k = flagToKey(id);
    if (k && !out[k]) out[k] = id;
  }
  return out;
}

export default function RuneDockDisplay({
  unlocked,
  runes,
  flagIds,
  imagesByFlag = {},
  assets,
  order = DEFAULT_ORDER,
  ariaLabel = "Rune dock",
  delayMs = 5500,
}: Props) {
  const fromFlags = mapFlagsToKeys(flagIds);
  const fromPaths = detectUnlockedFromPaths(runes);
  const active: RuneKey[] =
    unlocked?.length ? unlocked : (fromFlags.length ? fromFlags : fromPaths);

  const keyToFlag = buildKeyToFlagMap(flagIds);
  const baseAssets = { ...DEFAULT_ASSETS, ...assets };

  return (
    <div className={style.runeDock} role="list" aria-label={ariaLabel}>
      <img
        className={style.runeDock__frame}
        src="/ui/rune_dock_frame.png"
        alt=""
        aria-hidden
        draggable={false}
      />
      <div className={style.runeDock__rail}>
        {order.map((key, i) => {
          const isUnlocked = active.includes(key);
          const savedSrc =
            isUnlocked && keyToFlag[key] ? imagesByFlag[keyToFlag[key] as string] : undefined;
          const src = isUnlocked ? savedSrc || baseAssets[key] : undefined;

          return src ? (
            <img
              key={key}
              src={src}
              alt={`${key} rune`}
              className={`${style.runeImg} ${style.runeImgDelayed}`}
              style={{ animationDelay: "3s"}} // ⬅️ egyszerű késleltetés
              draggable={false}
              role="listitem"
              data-slot-key={key}
            />
          ) : (
            <div
              key={key}
              className={`${style.runeSlot} ${style.runeSlotLocked ?? ""}`}
              role="listitem"
              aria-label={`${key} rune (locked)`}
              title="Locked rune"
              data-slot-key={key}
              data-state="locked"
            />
          );
        })}
      </div>
    </div>
  );
}

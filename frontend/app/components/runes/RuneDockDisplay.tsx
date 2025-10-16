// components/runes/RuneDockDisplay.tsx
"use client";

import React from "react";
import style from "./RuneDockDisplay.module.scss";
import Icon from "../ui/Icon";
import { ICON_REGISTRY } from "../../lib/IconRegistry";

export type RuneKey = "cross" | "branch" | "shield";

type RunePack = {
  /** Egy ikon ismétlése 3 slotban VAGY három külön ikon */
  mode: "single" | "triple";
  /** single módban kötelező: registry-kulcs VAGY URL (SVG/PNG) */
  icon?: string;
  /** triple módban kötelező: 3 elem – registry-kulcsok VAGY URL-ek */
  icons?: string[];
  /** Opcionális paletta slotonként; ha nincs megadva, CSS oldja meg */
  palette?: {
    active?: (string | null | undefined)[];
    locked?: (string | null | undefined)[];
  };
};

type Props = {
  /** Elsődleges: ikon-kulcsok (aktív/unlocked logika flagIds alapján is felismerhető) */
  runes?: string[];
  /** Régi kompat: feloldott flag ID-k */
  flagIds?: string[];
  /** Régi kompat: flag → PNG útvonal */
  imagesByFlag?: Record<string, string>;
  /** Régi kompat: kulcs → PNG útvonal */
  assets?: Partial<Record<RuneKey, string>>;
  /** Sorrend (slot-kulcsok) */
  order?: RuneKey[];
  ariaLabel?: string;
  /** Késleltetés ms-ben animációhoz (ha a CSS használja) */
  delayMs?: number;
  /** ÚJ: kampány-szintű ikoncsomag (single/triple + paletta) */
  runePack?: RunePack;
};

const DEFAULT_ORDER: RuneKey[] = ["cross", "branch", "shield"];

function flagToKey(flagId?: string): RuneKey | null {
  if (!flagId) return null;
  if (/^rune_ch1$/i.test(flagId)) return "cross";
  if (/^rune_ch2$/i.test(flagId)) return "branch";
  if (/^rune_ch3$/i.test(flagId)) return "shield";
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

function buildKeyToFlagMap(flagIds?: string[]): Partial<Record<RuneKey, string>> {
  const out: Partial<Record<RuneKey, string>> = {};
  if (!flagIds?.length) return out;
  for (const id of flagIds) {
    const k = flagToKey(id);
    if (k && !out[k]) out[k] = id;
  }
  return out;
}

/** Nagyon egyszerű heur. annak eldöntésére, hogy string inkább URL/útvonal-e, nem registry-kulcs */
function looksLikeUrlOrPath(s?: string | null): s is string {
  if (!s) return false;
  const lower = s.toLowerCase().trim();
  return (
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}

export default function RuneDockDisplay({
  runes,
  flagIds,
  imagesByFlag = {},
  assets = {},
  order = DEFAULT_ORDER,
  ariaLabel = "Rune dock",
  delayMs = 0,
  runePack,
}: Props) {
  // Aktív (unlocked) kulcsok feloldása – a régi logika megmarad
  const activeFromFlags = mapFlagsToKeys(flagIds);
  const activeKeys: RuneKey[] = (runes?.length ? (runes as RuneKey[]) : activeFromFlags) as RuneKey[];

  // FlagId -> RuneKey reverse map (legacy PNG-hez)
  const keyToFlag = buildKeyToFlagMap(flagIds);

  // Segéd: runePack alapján slot-ikon kiválasztása (név vagy URL)
  const resolvePackIconForSlot = (slotIdx: number): string | undefined => {
    if (!runePack) return undefined;
    if (runePack.mode === "single") return runePack.icon;
    // triple
    return runePack.icons?.[slotIdx];
  };

  // Segéd: slot szín kiválasztása palettából (ha adtunk), különben hagyjuk a CSS-re
  const resolveSlotColor = (slotIdx: number, isUnlocked: boolean): string | undefined => {
    if (!runePack?.palette) return undefined;
    const arr = isUnlocked ? runePack.palette.active : runePack.palette.locked;
    return arr?.[slotIdx] ?? undefined;
  };

  // Segéd: registry-lekérdezés biztonságosan
  const hasRegistryIcon = (name?: string | null): boolean => {
    if (!name) return false;

    return Boolean((ICON_REGISTRY as any)[name]);
  };

  return (
    <div className={style.runeDock} role="list" aria-label={ariaLabel}>
      {/* Frame továbbra is PNG lehet (később tokenizálható) */}
      

      <div className={style.runeDock__rail}>
        {order.map((key, idx) => {
          const isUnlocked = activeKeys.includes(key);
          const slotIdx = idx; // 0..2
          const slotIdx1 = slotIdx + 1; // 1..3

          // 1) Próbáljuk a runePack ikonját
          const packIcon = resolvePackIconForSlot(slotIdx);

          // 2) Legacy források feloldása
          const legacySavedSrc =
            keyToFlag[key] ? imagesByFlag[keyToFlag[key] as string] : undefined;
          const legacySrc = legacySavedSrc || assets[key];

          // 3) Döntés: registry vs URL vs legacy
          let renderAsRegistry: string | undefined;
          let renderAsImg: string | undefined;

          if (packIcon) {
            if (looksLikeUrlOrPath(packIcon)) {
              renderAsImg = packIcon;
            } else if (hasRegistryIcon(packIcon)) {
              renderAsRegistry = packIcon;
            } else if (looksLikeUrlOrPath(legacySrc)) {
              // ha packIcon ismeretlen, de van legacy kép, essünk vissza arra
              renderAsImg = legacySrc;
            }
          } else {
            // Nincs runePack – próbáljuk a jelenlegi key-t registryből
            if (hasRegistryIcon(key)) {
              renderAsRegistry = key; // eredeti kulcs (cross/branch/shield)
            } else if (legacySrc) {
              renderAsImg = legacySrc;
            }
          }

          // Locked is jelenjen meg (dimelhető), ha bármely forrás rendelkezésre áll.
          const shouldRender = Boolean(renderAsRegistry || renderAsImg);

          // Slot inline color – CSAK ha palettát adtunk; amúgy mindent a CSS intéz
          const inlineColor = resolveSlotColor(slotIdx, isUnlocked);

          // animationDelay + inlineColor egyesítése
          const itemStyle: React.CSSProperties | undefined =
            delayMs || inlineColor
              ? {
                  ...(delayMs ? { animationDelay: `${Math.max(0, delayMs)}ms` } : null),
                  ...(inlineColor ? { color: inlineColor } : null),
                }
              : undefined;

          return (
            <div
              key={`${key}-${slotIdx}`}
              className={style.runeSlot}
              role="listitem"
              data-slot-key={key}
              data-slot-idx={slotIdx1}
              data-state={isUnlocked ? "unlocked" : "locked"}
              style={itemStyle}
            >
              {shouldRender ? (
                renderAsRegistry ? (
                  <Icon
                    /** registry-kulcs lehet a packIcon (tetszőleges string) vagy a RuneKey */
                    type={renderAsRegistry as any}
                    size={22}
                    variant={isUnlocked ? "active" : "locked"}
                    aria-label={`${renderAsRegistry} rune`}
                  />
                ) : (
                  <img
                    src={renderAsImg as string}
                    alt={`${key} rune`}
                    className={`${style.runeImg} ${style.runeImgDelayed}`}
                    draggable={false}
                  />
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

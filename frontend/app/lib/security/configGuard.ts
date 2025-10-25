// frontend/app/lib/security/configGuard.ts
//
// Feladat:
// - A kampány/skin/runes/stb. paraméterek (runtime config) ne legyenek
//   futás közben átírhatók külső manipulációval.
// - Induláskor készítünk egy "guardolt" snapshotot + hash-t.
// - Bármikor ellenőrizhető, hogy ezt valaki megpiszkálta-e.
// - Ha eltérés van, safe fallbackre esünk.
//
// Ez továbbra is szerver és domain nélkül működik.
// Nem küldünk sehová semmit, minden lokális memória.
//
// Használat tipikusan:
//   const guarded = createGuardedConfig({
//     campaignId: "global_story",
//     storyId: "start",
//     skin: "contract_default",
//     runes: "ring,arc,dot",
//   });
//
//   const check = validateGuardedConfig(guarded);
//   if (!check.ok) {
//      // valaki átírta → használd check.safeConfig (fallback)
//   } else {
//      // minden oké → használd guarded.data
//   }

import { secLog } from "./secLog";

// SECURITY NOTE:
// LOCAL_SALT kizárólag fejlesztői környezetre van.
// Ez NEM hálózati titok, és nem mehet ki semmilyen szerveres/verziózott "prod secret" helyett.
// Production esetben a backend oldali aláírás / hitelesítés dönt, nem ez.
// Ez csak lokális manipuláció-detektálásra szolgál fejlesztés közben.
const LOCAL_SALT = "local_dev_salt_v1";

// Ezek lesznek a kötelező mezők, amiket védeni akarunk.
// Ha bővül a runtime konfig, itt kell bővíteni.
export type RuntimeConfig = {
  campaignId: string;
  storyId: string;
  skin: string;
  runes?: string;
};

// A guardolt csomag: az eredeti adat + a hash, amit mi számoltunk.
export type GuardedConfig = {
  readonly data: Readonly<RuntimeConfig>;
  readonly hash: string;
};

// Ha manipulációt észlelünk, ide esünk vissza.
// Ezeket a fallback értékeket a projektből vettük:
// - campaignId: "global_story" (ez nálunk létező kampány ID volt)
// - storyId: "start"          (ez az első oldal az engine-ben)
// - skin: "contract_default"  (ez az a skin, amit már használtunk mint default)
// - runes: undefined          (biztonságos alap)
const SAFE_FALLBACK: RuntimeConfig = Object.freeze({
  campaignId: "global_story",
  storyId: "start",
  skin: "contract_default",
  runes: undefined,
});

// Stabil stringify fix kulcssorrendben + sózás.
// Ez NEM kriptográfiai védelem, hanem manipuláció-detektálás fejlesztéshez.
function stableSerialize(cfg: RuntimeConfig): string {
  const ordered = [
    cfg.campaignId ?? "",
    cfg.storyId ?? "",
    cfg.skin ?? "",
    cfg.runes ?? "",
    LOCAL_SALT,
  ];
  return ordered.join("|");
}

// Egyszerű FNV-1a 32 bites hash hexában.
// Nem kripto, csak változásérzékeléshez lokálban.
function fnv1a32(str: string): string {
  let hash = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32 bites overflow-olt szorzások
    hash = (hash * 0x01000193) >>> 0;
  }
  // hex string
  return ("0000000" + hash.toString(16)).slice(-8);
}

// Ezt hívjuk induláskor.
// - Lefagyasztja a configot (Object.freeze)
// - Kiszámolja és eltárolja a hash-t
export function createGuardedConfig(initial: RuntimeConfig): GuardedConfig {
  const frozen: Readonly<RuntimeConfig> = Object.freeze({ ...initial });
  const sig = fnv1a32(stableSerialize(frozen));
  return {
    data: frozen,
    hash: sig,
  };
}

// Ellenőrzés bármikor.
// - Újrahassoljuk a jelenlegi data-t
// - Ha eltér, WARN log + fallback ajánlás
//
// Visszatérés:
//   { ok: boolean; safeConfig: RuntimeConfig }
//
// safeConfig:
//   - ha ok=true → az eredeti guardolt data
//   - ha ok=false → SAFE_FALLBACK
export function validateGuardedConfig(
  guarded: GuardedConfig
): { ok: boolean; safeConfig: RuntimeConfig } {
  const currentSig = fnv1a32(stableSerialize(guarded.data));
  if (currentSig === guarded.hash) {
    return {
      ok: true,
      safeConfig: guarded.data,
    };
  }

  // ha mismatch van, jelentsük
  secLog(
    "WARN",
    "CONFIG_TAMPER",
    "Guarded runtime config hash mismatch (fallback applied)",
    {
      // nem logoljuk ki a teljes configot, csak minimális kontextust
      campaignId: guarded.data.campaignId,
      storyId: guarded.data.storyId,
      skin: guarded.data.skin,
    }
  );

  return {
    ok: false,
    safeConfig: SAFE_FALLBACK,
  };
}

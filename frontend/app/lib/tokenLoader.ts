// Cache-elt token loader: JSON -> :root CSS var-ok (SSR-safe)
import { setCache, getCache } from "./cache/frontendCache";

type TokensJson = { id?: string; title?: string; tokens: Record<string, string> };

const hasWindow = typeof window !== "undefined";

function normalizeCssVarValue(v: unknown): string {
  let s = String(v ?? "").trim();

  // ha teljesen idézőjelezett: "'...'" vagy "\"...\""
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  return s;
}

function applyTokensInline(map: Record<string, string>) {
  if (!hasWindow) return; // SSR: nincs document
  const root = document.documentElement;
  Object.entries(map || {}).forEach(([k, v]) => {
    try {
      root.style.setProperty(k.trim(), String(v));
    } catch {}
  });
}

/**
 * Contract skin JSON: --contract-choice-* …
 * InteractionDock: --choice-* (legacy bridge a CSS-ben html[data-skin] alatt, de nem mindig fut le időben / iframe-ben).
 * Ez a :root inline var-lánc biztosítja, hogy a dock tokenjei a contract skinből jöjjenek.
 */
function applyDockChoiceAliasesFromContractTokens() {
  if (!hasWindow) return;
  const r = document.documentElement;
  const pairs: [string, string][] = [
    [
      "--choice-color",
      "var(--contract-interaction-text-color, var(--contract-choice-text-color, #ffffff))",
    ],
    [
      "--choice-text-color",
      "var(--contract-interaction-text-color, var(--contract-choice-text-color, #ffffff))",
    ],
    ["--choice-bg-top", "var(--contract-choice-bg-color-top, rgba(255,255,255,.12))"],
    ["--choice-bg-bot", "var(--contract-choice-bg-color-bot, rgba(255,255,255,.06))"],
    ["--choice-border", "var(--contract-choice-border-color, rgba(255,255,255,.18))"],
    ["--choice-border-width", "var(--contract-choice-border-width, 1px)"],
    ["--choice-border-style", "var(--contract-choice-border-style, solid)"],
    ["--choice-radius", "var(--contract-choice-radius, 12px)"],
    [
      "--choice-shadow",
      "var(--contract-choice-shadow-rest, var(--contract-interaction-shadow-rest, 0 6px 18px rgba(0,0,0,.30)))",
    ],
    ["--choice-font", "var(--contract-choice-font-size, 18px)"],
    ["--choice-font-mobile", "var(--contract-choice-font-size-mobile, 15px)"],
    ["--choice-padding-x", "var(--contract-choice-pad-x, 16px)"],
    ["--choice-padding-y", "var(--contract-choice-pad-y, 14px)"],
    [
      "--choice-font-family",
      "var(--contract-choice-font-family, var(--contract-typography-b-font-family, var(--contract-font-family, sans-serif)))",
    ],
    [
      "--choice-bg-top-hover",
      "color-mix(in oklch, var(--contract-quiz-accent-color, var(--brand-accent, #ffc861)) var(--contract-interactive-hover-bg-tint, 12%), var(--contract-choice-bg-color-top, rgba(255,255,255,.12)))",
    ],
    [
      "--choice-bg-bot-hover",
      "color-mix(in oklch, var(--contract-quiz-accent-color, var(--brand-accent, #ffc861)) calc(var(--contract-interactive-hover-bg-tint, 12%) - 4%), var(--contract-choice-bg-color-bot, rgba(255,255,255,.06)))",
    ],
    [
      "--choice-bg-top-active",
      "color-mix(in oklch, var(--contract-quiz-accent-color, var(--brand-accent, #ffc861)) var(--contract-interactive-active-bg-tint, 20%), var(--contract-choice-bg-color-top, rgba(255,255,255,.12)))",
    ],
    [
      "--choice-bg-bot-active",
      "color-mix(in oklch, var(--contract-quiz-accent-color, var(--brand-accent, #ffc861)) calc(var(--contract-interactive-active-bg-tint, 20%) - 6%), var(--contract-choice-bg-color-bot, rgba(255,255,255,.06)))",
    ],
    [
      "--choice-shadow-hover",
      "var(--contract-interactive-hover-shadow, 0 10px 24px rgba(0,0,0,.36))",
    ],
    [
      "--choice-shadow-active",
      "var(--contract-interactive-active-shadow, 0 6px 16px rgba(0,0,0,.44))",
    ],
  ];
  for (const [k, v] of pairs) {
    try {
      r.style.setProperty(k, v);
    } catch {
      /* ignore */
    }
  }
}

/** Feloldott contract értékek → --choice-* (ghost / szűk iframe / var-lánc hibák ellen). */
function stampResolvedChoiceTokensFromContract() {
  if (!hasWindow) return;
  const r = document.documentElement;
  const cs = getComputedStyle(r);
  const pick = (name: string) => cs.getPropertyValue(name).trim();
  const stamp = (alias: string, source: string) => {
    const v = pick(source);
    if (v) r.style.setProperty(alias, v);
  };
  stamp("--choice-color", "--contract-choice-text-color");
  if (!pick("--choice-color")) {
    const t = pick("--contract-text-color");
    if (t) r.style.setProperty("--choice-color", t);
  }
  stamp("--choice-bg-top", "--contract-choice-bg-color-top");
  stamp("--choice-bg-bot", "--contract-choice-bg-color-bot");
  stamp("--choice-border", "--contract-choice-border-color");
  stamp("--choice-radius", "--contract-choice-radius");
  stamp("--choice-shadow", "--contract-choice-shadow-rest");
  stamp("--choice-font", "--contract-choice-font-size");
  stamp("--choice-font-mobile", "--contract-choice-font-size-mobile");
  stamp("--choice-padding-x", "--contract-choice-pad-x");
  stamp("--choice-padding-y", "--contract-choice-pad-y");
  const ff = pick("--contract-choice-font-family");
  if (ff) r.style.setProperty("--choice-font-family", ff);
}

export async function loadTokens(
  url: string,
  opts?: { ttlMs?: number; forceReload?: boolean }
) {
  const ttl = opts?.ttlMs ?? 24 * 60 * 60_000; // 24h
  const bucket = "skin";
  // cache-busting query nélkül kulcsolunk
  const id = url.replace(/\?.*$/, "");
  const forceReload = opts?.forceReload === true;

  // 1) FE cache hit? (szerkesztő „skin frissítés”: kihagyjuk)
  if (!forceReload) {
    const cached = getCache<TokensJson>(bucket, id);
    if (cached?.tokens) {
      applyTokensInline(cached.tokens);
      applyDockChoiceAliasesFromContractTokens();
      stampResolvedChoiceTokensFromContract();
      return cached;
    }
  }

  // 2) Hálózat — forceReload: no-store + újratöltött JSON a cache-be
  const res = await fetch(url, forceReload ? { cache: "no-store" } : undefined);
  if (!res.ok) throw new Error(`Token load failed: ${res.status}`);

  const json = (await res.json()) as TokensJson;

  // 3) Write-through FE cache + inline alkalmazás csak kliensen
  setCache(bucket, id, json, ttl);
  if (json?.tokens) {
    applyTokensInline(json.tokens);
    applyDockChoiceAliasesFromContractTokens();
    stampResolvedChoiceTokensFromContract();
  }

  return json;
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildEmbedUrl } from "@/app/lib/whitelabel/buildEmbedUrl";
import {
  deriveStoryId,
  fetchStoriesWithMultiFallback,
  type StoryListItem,
} from "@/app/lib/storiesListing";
import p from "@/app/dashboard/dashboardPage.module.scss";
import s from "./StoryEmbedClient.module.scss";

const DEFAULT_SKIN = "contract_default";
const DEFAULT_RUNES = "ring";
const DEFAULT_RUNEMODE = "single" as const;
const DEFAULT_TTL_SECONDS = 86400 * 365;

/** Példa blokk: nem élő kampány, minden sztorihoz ugyanaz. */
const EXAMPLE_SLUG = "pelda_kampany_slug";
const EXAMPLE_SRC = "/stories/pelda_kampany_slug.json";
const EXAMPLE_START = "ch1_pg1";
const EXAMPLE_TITLE = "Példa sztori címe";

type GenResponse = {
  token: string;
  grant_id: string;
  story_id: string;
  ttl_seconds: number;
  standard_url: string;
  ghost_url: string;
  grant_action?: "created" | "reused";
};

type RevealKey = "standard" | "ghost" | "iframe" | "embedjs";

function escAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function formatIframeSnippet(url: string, title: string): string {
  return [
    `<iframe`,
    `  src="${escAttr(url)}"`,
    `  title="${escAttr(title)}"`,
    `  style="display:block;width:100%;border:0;min-height:400px;height:400px;background:transparent;"`,
    `  allow="fullscreen"`,
    `  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"`,
    `></iframe>`,
  ].join("\n");
}

function formatEmbedJsSnippet(opts: {
  origin: string;
  campaignId: string;
  src: string;
  start: string;
  title: string;
  skin: string;
  runes: string;
  runemode: "single" | "triple";
  ghost: boolean;
  gmin: string;
  accessToken?: string;
}): string {
  const o = opts.origin.replace(/\/+$/, "");
  const lines = [
    `<script src="${escAttr(o + "/embed.js")}"`,
    `  data-campaign="${escAttr(opts.campaignId)}"`,
    `  data-src="${escAttr(opts.src)}"`,
    `  data-start="${escAttr(opts.start)}"`,
    `  data-title="${escAttr(opts.title)}"`,
    `  data-skin="${escAttr(opts.skin)}"`,
    `  data-runes="${escAttr(opts.runes)}"`,
    `  data-runemode="${escAttr(opts.runemode)}"`,
  ];
  if (opts.ghost) lines.push(`  data-mode="ghost"`);
  lines.push(`  data-gmin="${escAttr(opts.gmin)}"`);
  if (opts.accessToken) {
    lines.push(`  data-access-token="${escAttr(opts.accessToken)}"`);
  }
  lines.push(`></script>`);
  return lines.join("\n");
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function useExampleUrls(origin: string) {
  return useMemo(() => {
    const baseParams = {
      base: "/embed",
      campaignId: EXAMPLE_SLUG,
      src: EXAMPLE_SRC,
      start: EXAMPLE_START,
      title: EXAMPLE_TITLE,
      skin: DEFAULT_SKIN,
      runes: DEFAULT_RUNES,
      runemode: DEFAULT_RUNEMODE,
    };
    const standard = buildEmbedUrl({ ...baseParams, ghost: false });
    const ghost = buildEmbedUrl({ ...baseParams, ghost: true });
    const iframeGhost = formatIframeSnippet(ghost, EXAMPLE_TITLE);
    const jsGhost = formatEmbedJsSnippet({
      origin,
      campaignId: EXAMPLE_SLUG,
      src: EXAMPLE_SRC,
      start: EXAMPLE_START,
      title: EXAMPLE_TITLE,
      skin: DEFAULT_SKIN,
      runes: DEFAULT_RUNES,
      runemode: DEFAULT_RUNEMODE,
      ghost: true,
      gmin: "400",
    });
    return { standard, ghost, iframeGhost, jsGhost };
  }, [origin]);
}

export default function StoryEmbedClient() {
  const params = useParams();
  const rawId = params?.storyId;
  const storyIdParam =
    typeof rawId === "string"
      ? decodeURIComponent(rawId)
      : Array.isArray(rawId)
        ? rawId[0]
        : "";

  const [items, setItems] = useState<StoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [livePageUrl, setLivePageUrl] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<GenResponse | null>(null);
  const [reveal, setReveal] = useState<Record<RevealKey, boolean>>({
    standard: false,
    ghost: false,
    iframe: false,
    embedjs: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const list = await fetchStoriesWithMultiFallback("Dashboard");
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Betöltés sikertelen.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const story = useMemo(() => {
    if (!storyIdParam || !items.length) return null;
    return items.find((a) => deriveStoryId(a) === storyIdParam) ?? null;
  }, [items, storyIdParam]);

  const resolved = useMemo(() => {
    if (!story) return null;
    const sid = deriveStoryId(story);
    const jsonSrc = story.jsonSrc || `/stories/${sid}.json`;
    const startPageId = story.startPageId || "ch1_pg1";
    const title = story.title || sid;
    return { sid, jsonSrc, startPageId, title };
  }, [story]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin.replace(/\/+$/, "")
      : "";

  const example = useExampleUrls(origin || "http://localhost:3000");

  const generatedSnippets = useMemo(() => {
    if (!genResult || !origin) return { iframe: "", js: "" };
    return {
      iframe: formatIframeSnippet(genResult.ghost_url, resolved?.title || genResult.story_id),
      js: formatEmbedJsSnippet({
        origin,
        campaignId: genResult.story_id,
        src: resolved?.jsonSrc || `/stories/${genResult.story_id}.json`,
        start: resolved?.startPageId || "ch1_pg1",
        title: resolved?.title || genResult.story_id,
        skin: DEFAULT_SKIN,
        runes: DEFAULT_RUNES,
        runemode: DEFAULT_RUNEMODE,
        ghost: true,
        gmin: "400",
        accessToken: genResult.token,
      }),
    };
  }, [genResult, origin, resolved]);

  const toggleReveal = useCallback((k: RevealKey) => {
    setReveal((r) => ({ ...r, [k]: !r[k] }));
  }, []);

  const onGenerate = useCallback(async () => {
    if (!resolved) return;
    setGenErr(null);
    setGenBusy(true);
    setGenResult(null);
    setReveal({
      standard: false,
      ghost: false,
      iframe: false,
      embedjs: false,
    });
    try {
      const r = await fetch("/api/dashboard/embed-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: resolved.sid,
          jsonSrc: resolved.jsonSrc,
          start: resolved.startPageId,
          title: resolved.title,
          playerOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
          ttlSeconds: DEFAULT_TTL_SECONDS,
          livePageUrl: livePageUrl.trim() || undefined,
        }),
      });
      const j = (await r.json()) as GenResponse & { error?: string };
      if (!r.ok) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      if (!j.token || !j.standard_url || !j.ghost_url) {
        throw new Error("Érvénytelen válasz");
      }
      setGenResult(j);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : "Generálás sikertelen.");
    } finally {
      setGenBusy(false);
    }
  }, [resolved, livePageUrl]);

  if (loading) {
    return <p className={p.lead}>Betöltés…</p>;
  }

  if (err) {
    return <p className={s.error}>{err}</p>;
  }

  if (!storyIdParam) {
    return <p className={s.error}>Hiányzó sztori azonosító.</p>;
  }

  if (!resolved) {
    return (
      <>
        <div className={s.topRow}>
          <h1 className={p.pageTitle}>Beágyazás</h1>
          <Link href="/dashboard/stories" className={s.back}>
            Vissza a listához
          </Link>
        </div>
        <p className={s.error}>
          Nem található sztori ezzel az azonosítóval:{" "}
          <span className={p.mono}>{storyIdParam}</span>
        </p>
      </>
    );
  }

  return (
    <>
      <div className={s.topRow}>
        <div>
          <h1 className={p.pageTitle}>Beágyazás</h1>
          <p className={p.lead} style={{ marginBottom: 0 }}>
            {resolved.title}{" "}
            <span className={p.mono} style={{ display: "block", marginTop: "0.35rem" }}>
              {resolved.sid}
            </span>
          </p>
        </div>
        <Link href="/dashboard/stories" className={s.back}>
          Vissza a listához
        </Link>
      </div>

      <details className={s.detailsBox}>
        <summary className={s.detailsSummary}>
          Példa blokkok (statikus, nem élő URL — minden sztorihoz ugyanaz a minta)
        </summary>
        <div className={s.detailsBody}>
          <p className={s.sectionLead}>
            A <code className={p.mono}>{EXAMPLE_SLUG}</code> csak illusztráció. Valós embed a
            „Linkek generálása” szekcióból, aláírt tokennel (ha REQUIRE_SIGNED_EMBED).
          </p>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Példa — embed URL (normál)</h2>
            <div className={s.codeBlockWrap}>
              <pre className={s.codeBlock}>{example.standard}</pre>
              <div className={s.copyRow}>
                <button
                  type="button"
                  className={s.copyBtn}
                  onClick={() => void copyText(example.standard)}
                >
                  Másolás
                </button>
              </div>
            </div>
          </section>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Példa — embed URL (ghost)</h2>
            <div className={s.codeBlockWrap}>
              <pre className={s.codeBlock}>{example.ghost}</pre>
              <div className={s.copyRow}>
                <button
                  type="button"
                  className={s.copyBtn}
                  onClick={() => void copyText(example.ghost)}
                >
                  Másolás
                </button>
              </div>
            </div>
          </section>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Példa — iframe (ghost)</h2>
            <div className={s.codeBlockWrap}>
              <pre className={s.codeBlock}>{example.iframeGhost}</pre>
              <div className={s.copyRow}>
                <button
                  type="button"
                  className={s.copyBtn}
                  onClick={() => void copyText(example.iframeGhost)}
                >
                  Másolás
                </button>
              </div>
            </div>
          </section>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Példa — embed.js (ghost)</h2>
            <div className={s.codeBlockWrap}>
              <pre className={s.codeBlock}>{example.jsGhost}</pre>
              <div className={s.copyRow}>
                <button
                  type="button"
                  className={s.copyBtn}
                  onClick={() => void copyText(example.jsGhost)}
                >
                  Másolás
                </button>
              </div>
            </div>
          </section>
        </div>
      </details>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>Linkek generálása</h2>
        <p className={s.sectionLead}>
          Generáláskor a rendszer automatikusan <strong>active grantet</strong> készít vagy újrahasznál
          a sztorihoz, majd hosszú élettartamú tokent ad. A hozzáférés fő kapcsolója a grant
          állapota (<code className={p.mono}>active/revoked</code>), nem az URL cseréje.
        </p>
        <label className={s.fieldLabel}>
          Élő ügyféloldal URL (opcionális, a dashboard listához)
          <input
            type="url"
            className={s.textInput}
            placeholder="https://ugyfel.hu/oldal"
            value={livePageUrl}
            onChange={(e) => setLivePageUrl(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={s.genPrimary}
          disabled={genBusy}
          onClick={() => void onGenerate()}
        >
          {genBusy ? "Generálás…" : "Token és linkek generálása"}
        </button>
        {genErr ? <p className={s.error}>{genErr}</p> : null}
        {genResult ? (
          <div className={s.genMeta}>
            <p>
              Grant: <code className={p.mono}>{genResult.grant_id}</code> · TTL:{" "}
              {genResult.ttl_seconds}s
            </p>
            <p>
              Grant művelet:{" "}
              <code className={p.mono}>
                {genResult.grant_action === "created" ? "auto-created" : "reused-existing"}
              </code>
            </p>
            <p className={s.hint}>
              Linkek megjelenítése gombbal — másolás után vigyázz, a token a queryben látszik.
            </p>
          </div>
        ) : null}

        {genResult ? (
          <>
            <div className={s.revealBlock}>
              <button
                type="button"
                className={s.revealToggle}
                onClick={() => toggleReveal("standard")}
              >
                {reveal.standard ? "Elrejtés" : "Megjelenítés"} — embed URL (normál, tokennel)
              </button>
              {reveal.standard ? (
                <div className={s.codeBlockWrap}>
                  <pre className={s.codeBlock}>{genResult.standard_url}</pre>
                  <div className={s.copyRow}>
                    <button
                      type="button"
                      className={s.copyBtn}
                      onClick={() => void copyText(genResult.standard_url)}
                    >
                      Másolás
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={s.revealBlock}>
              <button
                type="button"
                className={s.revealToggle}
                onClick={() => toggleReveal("ghost")}
              >
                {reveal.ghost ? "Elrejtés" : "Megjelenítés"} — embed URL (ghost, tokennel)
              </button>
              {reveal.ghost ? (
                <div className={s.codeBlockWrap}>
                  <pre className={s.codeBlock}>{genResult.ghost_url}</pre>
                  <div className={s.copyRow}>
                    <button
                      type="button"
                      className={s.copyBtn}
                      onClick={() => void copyText(genResult.ghost_url)}
                    >
                      Másolás
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={s.revealBlock}>
              <button
                type="button"
                className={s.revealToggle}
                onClick={() => toggleReveal("iframe")}
              >
                {reveal.iframe ? "Elrejtés" : "Megjelenítés"} — iframe snippet
              </button>
              {reveal.iframe ? (
                <div className={s.codeBlockWrap}>
                  <pre className={s.codeBlock}>{generatedSnippets.iframe}</pre>
                  <div className={s.copyRow}>
                    <button
                      type="button"
                      className={s.copyBtn}
                      onClick={() => void copyText(generatedSnippets.iframe)}
                    >
                      Másolás
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={s.revealBlock}>
              <button
                type="button"
                className={s.revealToggle}
                onClick={() => toggleReveal("embedjs")}
              >
                {reveal.embedjs ? "Elrejtés" : "Megjelenítés"} — embed.js (data-access-token)
              </button>
              {reveal.embedjs ? (
                <div className={s.codeBlockWrap}>
                  <pre className={s.codeBlock}>{generatedSnippets.js}</pre>
                  <div className={s.copyRow}>
                    <button
                      type="button"
                      className={s.copyBtn}
                      onClick={() => void copyText(generatedSnippets.js)}
                    >
                      Másolás
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <p className={s.note}>
        <strong>CSP / domain:</strong> ha az iframe blokkolt, lásd{" "}
        <code>EMBED_FRAME_ANCESTORS</code> az <code>.env.example</code>-ban.
      </p>
    </>
  );
}

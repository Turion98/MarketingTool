"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  buildMarketingEmbedUrl,
  type SkinEntry,
} from "@/app/lib/marketingEmbedPreview";
import { useEmbedParentIframeHeight } from "@/app/lib/useEmbedParentIframeHeight";
import s from "./HomeEntry.module.scss";
import ls from "@/app/login/login.module.scss";

const QUESTELL_HOME_EMBED_URL =
  "https://www.thequestell.com/embed/questell_node_graph_demo_hu?skin=contract_creative_dusk&start=1.1&src=%2Fstories%2Fquestell_node_graph_demo_hu.json&title=Questell+%E2%80%93+interakt%C3%ADv+d%C3%B6nt%C3%A9si+%C3%A9lm%C3%A9ny&runes=ring&runemode=single&ghost=1";

const QUESTELL_HOME_EMBED_ORIGIN = new URL(QUESTELL_HOME_EMBED_URL).origin;

export default function HomeEntry() {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  /** DOM-ban marad a kicsúszás animáció végéig */
  const [dockMounted, setDockMounted] = useState(false);
  /** true = látható pozíció (jobbról beúszva) */
  const [dockEntered, setDockEntered] = useState(false);
  const [skin, setSkin] = useState("contract_creative_dusk");
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  /** Volt már „beúszott” állapot (transition end / gyors bezárás elágazás) */
  const dockWasRevealedRef = useRef(false);
  const homeEmbedIframeHeight = useEmbedParentIframeHeight(
    QUESTELL_HOME_EMBED_ORIGIN,
    120
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/skins/registry.json")
      .then((r) => r.json())
      .then((data: { skins?: SkinEntry[] }) => {
        if (cancelled || !Array.isArray(data?.skins)) return;
        setSkins(data.skins);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sidePanelOpen) {
      setIframeSrc(null);
      return;
    }
    setIframeSrc(buildMarketingEmbedUrl(skin));
  }, [sidePanelOpen, skin]);

  useEffect(() => {
    if (sidePanelOpen) {
      dockWasRevealedRef.current = false;
      setDockMounted(true);
      setDockEntered(false);
      let id2: number | undefined;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => {
          setDockEntered(true);
          dockWasRevealedRef.current = true;
        });
      });
      return () => {
        cancelAnimationFrame(id1);
        if (id2 !== undefined) cancelAnimationFrame(id2);
      };
    }
    setDockEntered(false);
    if (!dockWasRevealedRef.current) {
      setDockMounted(false);
    }
  }, [sidePanelOpen]);

  const onDockTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLElement>) => {
      if (e.propertyName !== "transform") return;
      if (!sidePanelOpen) {
        setDockMounted(false);
        dockWasRevealedRef.current = false;
      }
    },
    [sidePanelOpen]
  );

  const skinOptions = useMemo(() => {
    if (skins.length) return skins;
    return [{ id: "contract_creative_dusk", title: "Creative – Dusk" }];
  }, [skins]);

  return (
    <div className={s.root}>
      <div className={s.mainRow}>
        <div className={s.leftColumn}>
          <div
            className={s.brandDockShell}
            aria-label="Questell — bemutatkozás"
          >
            <div className={s.brandDock}>
              <Image
                src="/assets/my_logo.png"
                alt="Questell"
                width={400}
                height={137}
                className={s.brandLogo}
                priority
              />
            </div>
          </div>

          <section
            className={s.leftMainFrame}
            aria-label="Interaktív demó — Questell"
          >
            <div className={s.leftMainFrameInner}>
              <iframe
                src={QUESTELL_HOME_EMBED_URL}
                title="Questell — interaktív döntési élmény"
                className={s.homeEmbedIframe}
                style={{ height: homeEmbedIframeHeight }}
                allow="fullscreen"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
              />
            </div>
          </section>
        </div>

        <div className={s.centerWrap}>
          <div className={`${ls.panelCol} ${s.panelColWide}`}>
            <div className={s.panel}>
            <h1 className={s.srOnly}>Questell — gyors belépés</h1>

            <section className={s.block}>
              <p className={s.blurb}>
                A szerkesztőbe való belépéshez használd az e-mailt és a jelszót.
                Ez a rész <strong>még fejlesztés alatt</strong> áll — a jogosultságok
                és a folyamat változhat.
              </p>
              <Link
                href="/login?next=/editor"
                className={`${s.btn} ${s.btnPrimary}`}
              >
                Belépés a szerkesztőbe
              </Link>
            </section>

            <section className={s.block}>
              <p className={s.blurb}>
                A present oldal a termék bemutatója: áttekintheted a fő üzeneteket
                és a felületet.
              </p>
              <Link href="/present" className={`${s.btn} ${s.btnSecondary}`}>
                Present oldal megtekintése
              </Link>
            </section>

            <section className={s.block}>
              <p className={s.blurb}>
                Nyisd meg a beágyazott játék előnézetét telefonkeretben, válassz
                megjelenés (skin) közül — ugyanúgy, mint eddig a belépés oldalon.
              </p>
              <button
                type="button"
                className={`${s.btn} ${s.btnOutline}`}
                onClick={() => setSidePanelOpen((o) => !o)}
              >
                {sidePanelOpen ? "Panel bezárása" : "Panel megnyitása"}
              </button>
            </section>

            <p className={s.footer}>
              <Link href="/landing">Közvetlenül a demó / játék indítóhoz</Link>
            </p>
            </div>
          </div>
        </div>
      </div>

      {dockMounted ? (
        <div
          className={s.previewDockShell}
          aria-hidden={!sidePanelOpen || !dockEntered}
        >
          <aside
            className={`${s.previewDock} ${dockEntered ? s.previewDockVisible : ""}`}
            aria-label="Beágyazott nézet panel"
            onTransitionEnd={onDockTransitionEnd}
          >
            <div className={s.previewDockInner}>
              <div className={ls.previewHeader}>
                <span className={ls.previewTitle}>Beágyazott nézet</span>
                <div className={ls.previewToolbar}>
                  <select
                    id="home-panel-skin"
                    className={ls.previewSelect}
                    value={skin}
                    onChange={(e) => setSkin(e.target.value)}
                    aria-label="Megjelenés (skin)"
                  >
                    {skinOptions.map((sk) => (
                      <option key={sk.id} value={sk.id}>
                        {sk.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={ls.previewClose}
                    onClick={() => setSidePanelOpen(false)}
                  >
                    Bezárás
                  </button>
                </div>
              </div>
              <div className={ls.phoneChrome}>
                {iframeSrc ? (
                  <iframe
                    key={iframeSrc}
                    className={ls.phoneIframe}
                    src={iframeSrc}
                    title="Beágyazott player"
                    allow="fullscreen"
                  />
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

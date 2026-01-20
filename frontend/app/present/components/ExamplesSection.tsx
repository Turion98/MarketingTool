"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ⬇️ igazítsd az útvonalat a saját struktúrádhoz
import s from "../LandingPage.module.scss";

type ExampleDetailBlock =
  | { type: "intro"; text: string }
  | { type: "howItWorks" | "whyInCampaign" | "output"; title: string; bullets: string[] }
  | { type: "bridge"; text: string };

export type ExampleItem = {
  id: string;
  navLabel: string;
  jsonFile: string;

  title: string;
  heroLine: string;

  details: { blocks: ExampleDetailBlock[] };

  revealLabel: string;
  startLabel: string;

  startPageId?: string;
  skinId?: string;
  runes?: string;
  runemode?: "single" | "triple";
};
const EXAMPLES: ExampleItem[] = [
  // ─────────────────────────────────────────────────────────────
  // SKINCARE
  // ─────────────────────────────────────────────────────────────
  {
    id: "skincare",
    navLabel: "Skincare ajánló útvonal",
    jsonFile: "SCv2_ABCD_EGA_merged_E_branch_full.json",

    title: "Skincare ajánló útvonal",
    heroLine:
      "Döntések mentén vezetett élmény, ahol a végén egy koherens, végiggondolt bőrápolási rutin áll össze.",

    details: {
      blocks: [
        {
          type: "intro",
          text: "Egy döntések mentén felépülő ajánlóélmény.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A felhasználó preferenciák és fókuszok mentén hoz döntéseket, nem helyes válaszokat keres.",
            "A választások alapján eltérő oldal- és vizuális útvonalakon halad tovább.",
            "A folyamat végén egy egymásra épülő, átgondolt rutin-struktúra áll össze.",
          ],
        },
        {
          type: "bridge",
          text:
            "A döntési út maga is érték: segít megérteni, miért ez az ajánlás a legrelevánsabb.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "Összetettebb bőrápolási termékrendszerek bemutatására, narratív logikával.",
            "Edukációs és márkaépítő kampányokra, ahol a döntési folyamat önmagában is értéket képvisel.",
            "Landingekre, ahol a bizalomépítés és az ajánlás kéz a kézben jár.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy személyre szabott bőrápolási rutin váza, lépésekre bontva.",
            "Egy világos ajánlási irány, amely a felhasználói döntésekből következik.",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Skincare ajánló indítása",
    startPageId: "L1_routine_style",
    skinId: "skin_care",
  },

  // ─────────────────────────────────────────────────────────────
  // COFFEE
  // ─────────────────────────────────────────────────────────────
  {
    id: "coffee",
    navLabel: "Kávé hangulatprofil",
    jsonFile: "coffee_quiz_demo_full.json",

    title: "Kávé hangulatprofil",
    heroLine:
      "Rövid döntési útvonal, ahol néhány hétköznapi választásból egy személyes, megosztható hangulatprofil áll össze.",

    startPageId: "Q1",
    skinId: "contract_coffee_dark_roast",

    details: {
      blocks: [
        {
          type: "intro",
          text:
            "Döntések mentén felépülő élmény, amely egyéni kávéhangulatot teremt.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A felhasználó három egyszerű, élethelyzethez kötődő döntést hoz.",
            "A választások eltérő narratív és vizuális irányokba terelik az élményt.",
            "A folyamat végén egy karakteres hangulatprofil áll össze.",
          ],
        },
        {
          type: "bridge",
          text:
            "A kevés, de tudatos döntés gyorsan értelmezhető képet ad a felhasználó preferenciáiról.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "Gyors engagement-indításra, alacsony belépési küszöbbel.",
            "Megosztható, személyes profilkártyák generálására.",
            "Social vagy landing környezetben futó rövid kampányokra.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy egyedi kávéhangulat-profil, döntésekből levezetve.",
            "Egy vizuálisan egységes, megosztható profilkártya.",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Kávé profil indítása",
  },

  // ─────────────────────────────────────────────────────────────
  // HOLIDAY
  // ─────────────────────────────────────────────────────────────
  {
    id: "holiday",
    navLabel: "Holiday mode",
    jsonFile: "karácsony.json",

    title: "Holiday mode",
    heroLine:
      "Hangulati döntések mentén felépülő szezonális élmény, ahol a végén egy személyes ünnepi kimenet áll össze.",

    startPageId: "Q1",
    skinId: "kari",

    details: {
      blocks: [
        {
          type: "intro",
          text:
            "Egy rövid, döntések mentén felépülő szezonális élmény, amely a felhasználó ünnepi hangulatát vizuális kimenetté fordítja.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A felhasználó néhány hangulati döntést hoz az ünnepi preferenciáiról.",
            "A választások eltérő vizuális irányokba terelik az élményt (színek, tónus, jelenet).",
            "A végén egy koherens, egyedi holiday mode kimenet áll össze.",
          ],
        },
        {
          type: "bridge",
          text:
            "A döntési út segít megmutatni, milyen hangulatot keres a felhasználó – és miért pont ezt kapta kimenetként.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "Szezonális kampányok gyors indítására, alacsony belépési küszöbbel.",
            "Könnyen újranyitható és frissíthető formátumként (évenkénti reskin / új kimenetek).",
            "Social forgalom aktiválására és továbbvezetésére landingre vagy ajánlatra.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy személyes holiday mode vizuál, döntésekből levezetve.",
            "Egy megosztható, ünnepi hangulatú kimenet (profilkártya / kép).",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Holiday mode indítása",
  },

  // ─────────────────────────────────────────────────────────────
  // MARKETING SIM
  // ─────────────────────────────────────────────────────────────
  {
    id: "marketing-sim",
    navLabel: "Marketing döntési szimuláció",
    jsonFile: "Mrk6_D_text_updated.json",

    title: "Marketing döntési szimuláció",
    heroLine:
      "Valós marketinghelyzeteken végigvezető döntési élmény, ahol a végén egy érthető stratégiai irány és megoldáslogika áll össze.",

    details: {
      blocks: [
        {
          type: "intro",
          text:
            "Egy történetvezérelt döntési szimuláció, ahol a résztvevő marketinghelyzetekben hoz döntéseket.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A résztvevő valószerű marketing szituációkban hoz döntéseket, nem „tesztkérdésekre” válaszol.",
            "A választások eltérő narratív és tartalmi útvonalakat nyitnak, és lépésről lépésre építik a logikát.",
            "A folyamat végén összeáll egy koherens megoldás- és stratégiai keret, ami visszavezethető a döntésekre.",
          ],
        },
        {
          type: "bridge",
          text:
            "A szimuláció ereje az, hogy nem funkciókat sorol, hanem megmutatja a döntési logikát és az ok-okozati összefüggéseket.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "B2B edukációs és sales storytelling célokra, ahol a megértés kulcsérték.",
            "Komplex megoldások üzleti logikájának bemutatására, „kattintható” narratívával.",
            "Olyan helyzetekre, ahol a döntési folyamat hitelesebben győz meg, mint egy funkciólista.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy felépített marketingmegoldás narratívája, döntések mentén levezetve.",
            "Egy érthető stratégiai irány és ajánlási logika, ami később továbbvihető sales beszélgetésbe.",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Marketing szimuláció indítása",
  },

  // ─────────────────────────────────────────────────────────────
  // SOFTDRINK
  // ─────────────────────────────────────────────────────────────
  {
    id: "softdrink",
    navLabel: "Üdítő ajánló",
    jsonFile: "uditő.json",

    title: "Üdítő ajánló",
    heroLine:
      "Gyors döntési útvonal, ahol néhány választásból egy világos, konkrét termékajánlás áll össze.",

    startPageId: "Q1",
    skinId: "contract_softdrink_fresh",

    details: {
      blocks: [
        {
          type: "intro",
          text:
            "Egy rövid, döntések mentén felépülő ajánlóélmény, amely közvetlen termékkimenetbe fut ki.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A felhasználó két egyszerű döntést hoz ízlés- és helyzetalapon.",
            "A választások azonnal szűkítik az ajánlási irányt a termékcsaládon belül.",
            "A folyamat végén egy egyértelmű, könnyen értelmezhető termékkimenet jelenik meg.",
          ],
        },
        {
          type: "bridge",
          text:
            "A kevés, célzott döntés gyorsan érthetővé teszi, miért pont ez a termék a legrelevánsabb.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "Termékcsaládok gyors és érthető pozicionálására.",
            "Retail és promóciós környezetben beléptető ajánlóélményként.",
            "Rövid, de személyes termékajánló flow-khoz megosztható kimenettel.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy konkrét termékajánlás, döntésekből levezetve.",
            "Egy vizuális profilkártya a kiválasztott üdítőhöz.",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Üdítő ajánló indítása",
  },

  // ─────────────────────────────────────────────────────────────
  // CREATIVE
  // ─────────────────────────────────────────────────────────────
  {
    id: "creative",
    navLabel: "Kreatív problémamegoldó profil",
    jsonFile: "uj.json",

    title: "Kreatív problémamegoldó profil",
    heroLine:
      "Döntések mentén felépülő élmény, ahol néhány választásból egy jól körülírható kreatív archetípus áll össze.",

    startPageId: "Q1",
    skinId: "contract_creative_light_breeze",

    details: {
      blocks: [
        {
          type: "intro",
          text:
            "Egy rövid, döntések mentén felépülő élmény, amely a válaszok kombinációjából kreatív problémamegoldó archetípust határoz meg.",
        },
        {
          type: "howItWorks",
          title: "Hogyan működik?",
          bullets: [
            "A felhasználó három döntést hoz gondolkodásmódra és helyzetkezelésre vonatkozóan.",
            "A választások különböző archetípus-irányokba terelik az élményt.",
            "A folyamat végén egy koherens, könnyen értelmezhető kreatív profil áll össze.",
          ],
        },
        {
          type: "bridge",
          text:
            "A döntési út megmutatja, milyen típusú problémamegoldás áll közel a felhasználóhoz, és miért.",
        },
        {
          type: "whyInCampaign",
          title: "Mire jó kampányban?",
          bullets: [
            "Employer branding és HR kommunikációs kampányokra.",
            "Személyes, megosztható profilkártyák létrehozására.",
            "Olyan élményekhez, ahol a döntések ténylegesen formálják a kimenetet.",
          ],
        },
        {
          type: "output",
          title: "Mi lesz a kimenet?",
          bullets: [
            "Egy kreatív problémamegoldó archetípus, döntésekből levezetve.",
            "Egy vizuálisan egységes, megosztható profilkártya.",
          ],
        },
      ],
    },

    revealLabel: "Továbbiak megtekintése",
    startLabel: "Kreatív profil indítása",
  },
];


type Props = {
  defaultLogoSrc: string;
  logoAlt?: string;
  // opcionális: ha szeretnéd késleltetni a mountot
  lazyMount?: boolean;
};

function ExamplesSectionInner({ defaultLogoSrc, logoAlt = "Questell", lazyMount = true }: Props) {
  const router = useRouter();

  // ✅ (nagy nyereség): csak akkor rendereld a részletes UI-t, ha közel van a viewporthoz
  const sectionRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(!lazyMount);

  useEffect(() => {
    if (!lazyMount) return;
    const el = sectionRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: "800px 0px" } // 800px-el előbb tölt
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [lazyMount]);

  const startExample = useCallback(
    (item: ExampleItem) => {
      const src = `/stories/${item.jsonFile}`;
      const start = item.startPageId || "ch1_pg1";
      const skin = item.skinId || "contract_default";

      const qs =
        `src=${encodeURIComponent(src)}` +
        `&start=${encodeURIComponent(start)}` +
        `&title=${encodeURIComponent(item.title)}` +
        `&skin=${encodeURIComponent(skin)}` +
        `&c=${encodeURIComponent(item.id)}` +
        (item.runes && item.runemode
          ? `&runes=${encodeURIComponent(item.runes)}&runemode=${encodeURIComponent(item.runemode)}`
          : "");

      router.push(`/embed/${encodeURIComponent(item.id)}?${qs}`);
    },
    [router]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  const active = useMemo(() => EXAMPLES.find((x) => x.id === activeId), [activeId]);

  const playedPreviewRef = useRef<Set<string>>(new Set());
  const [previewNonce, setPreviewNonce] = useState(0);

  return (
    <section
      id="example-campaigns"
      ref={sectionRef}
      className={s.examplesSection}
      aria-labelledby="examples-title"
    >
      <div className={s.examplesInner}>
        <header className={s.examplesHeader}>
          <h2 id="examples-title" className={s.examplesTitle}>
            Példa kampányok
          </h2>
        </header>

        <div className={s.examplesIntrok}>
          <p className={s.examplesIntroLead}>
            Az alábbi kampányformátumok kipróbálható példák arra, hogyan épülnek fel a Questell
            interaktív élményei.
          </p>
          <p className={s.examplesIntroLead}>
            <strong>Minden elem igény szerint továbbalakítható, bővíthető vagy teljesen újraértelmezhető</strong>
          </p>
        </div>

        {/* ✅ ha még nincs mount (lazy), csak egy könnyű placeholder */}
        {!mounted ? (
          <div className={s.examplesChooser}>
            <div className={s.examplesPanel} aria-label="Példa kampányok (betöltés)">
              <div className={s.examplesEmptyPanel}>
                <div className={s.examplesEmpty}>
                  <div className={s.examplesEmptyLogo}>
                    <img src={defaultLogoSrc} alt={logoAlt} className={s.examplesLogo} />
                  </div>
                </div>
                <p className={s.examplesEmptyText}>Görgess ide a betöltéshez…</p>
              </div>
            </div>
          </div>
        ) : (
          <div className={s.examplesChooser}>
            <div className={s.examplesPanel} role="region" aria-label="Példa kampányok választó">
              {/* Bal oszlop */}
              <aside className={s.examplesNav} aria-label="Kampányok listája">
                <ul className={s.examplesNavList}>
                  {EXAMPLES.map((item) => {
                    const isActive = item.id === activeId;
                    return (
                      <li key={item.id} className={s.examplesNavItem}>
                        <button
                          type="button"
                          className={`${s.examplesNavButton} ${isActive ? s.isActive : ""}`}
                          onClick={() => {
                            setActiveId(item.id);

                            setIsExpanded(false);
                            setIsExiting(false);
                            setIsEntering(false);

                            if (!playedPreviewRef.current.has(item.id)) {
                              playedPreviewRef.current.add(item.id);
                              setPreviewNonce((n) => n + 1);
                            }
                          }}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <span className={s.examplesNavLabel}>{item.navLabel}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              {/* Jobb oszlop */}
              <div
                className={[s.examplesDetail, isEntering ? s.isEntering : ""].filter(Boolean).join(" ")}
                aria-live="polite"
                onAnimationEnd={(e) => {
                  if ((e as any).animationName === "detailEnterWrap") setIsEntering(false);
                }}
              >
                {!active && (
                  <div className={s.examplesEmptyPanel}>
                    <div className={s.examplesEmpty}>
                      <div className={s.examplesEmptyLogo}>
                        <img src={defaultLogoSrc} alt={logoAlt} className={s.examplesLogo} />
                      </div>
                    </div>
                    <p className={s.examplesEmptyText}>Válassz egy példa kampányt a bal oldalon.</p>
                  </div>
                )}

                {active && (
                  <div
                    className={`${s.examplesDetailInner} ${isExpanded ? s.isExpanded : ""} ${isExiting ? s.isExiting : ""}`}
                  >
                    <div className={s.examplesHero} key={`${activeId}-${previewNonce}`}>
                      <div className={s.examplesHeroTop}>
                        <div className={s.examplesPreviewStack}>
                          <h3 className={s.examplesHeroTitle}>{active.title}</h3>
                          <p className={s.examplesHeroLine}>{active.heroLine}</p>

                          <div className={s.examplesPreviewActions}>
                            <button
                              type="button"
                              className={s.examplesPreviewStartButton}
                              onClick={() => startExample(active)}
                            >
                              {active.startLabel}
                            </button>

                            {!isExpanded && (
                              <button
                                type="button"
                                className={s.examplesRevealButton}
                                onClick={() => {
                                  setIsExiting(true);
                                  window.setTimeout(() => {
                                    setIsExpanded(true);
                                    setIsExiting(false);
                                    setIsEntering(true);
                                    requestAnimationFrame(() => setIsEntering(true));
                                  }, 650);
                                }}
                              >
                                {active.revealLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <>
                        <div className={s.examplesMedia}>
                          <div className={s.examplesMediaPlaceholder} aria-hidden="true" />
                        </div>

                        <div className={s.examplesContent}>
                          <h3 className={s.examplesContentTitle}>{active.title}</h3>

                          {active.details.blocks.map((block, idx) => {
                            switch (block.type) {
                              case "intro":
                                return (
                                  <p key={idx} className={s.examplesIntro}>
                                    {block.text}
                                  </p>
                                );
                              case "bridge":
                                return (
                                  <p key={idx} className={s.examplesBridge}>
                                    {block.text}
                                  </p>
                                );
                              case "howItWorks":
                              case "whyInCampaign":
                              case "output":
                                return (
                                  <div key={idx} className={s.examplesBlock}>
                                    <h4 className={s.examplesBlockTitle}>{block.title}</h4>
                                    <ul className={s.examplesBullets}>
                                      {block.bullets.map((li, i) => (
                                        <li key={i} className={s.examplesBullet}>
                                          {li}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              default:
                                return null;
                            }
                          })}

                          <div className={s.examplesActions}>
                            <button
                              type="button"
                              className={s.examplesStartButton}
                              onClick={() => startExample(active)}
                            >
                              {active.startLabel}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={s.examplesClosing}>
          A Questell pilot <strong>rövid ciklusban készül</strong>: gyorsan kipróbálható, és{" "}
          <strong>azonnal</strong> éles helyzetben <strong>működik</strong>.
        </div>
      </div>
    </section>
  );
}

// ✅ React.memo: ha a LandingPage re-renderel (intent/mesh/hero), ez nem fog újrarajzolódni
export const ExamplesSection = React.memo(ExamplesSectionInner);

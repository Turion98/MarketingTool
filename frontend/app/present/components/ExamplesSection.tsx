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
  navLabel: "Ajánló / döntési modell",
  jsonFile: "SCv2_ABCD_EGA_merged_E_branch_full.json",

  title: "Strukturált ajánlómodell – példa",
  heroLine:
    "Elágazó döntési modell, amely a teljes bejárási út alapján állít össze koherens, indokolható ajánlást.",

  details: {
    blocks: [
      {
        type: "intro",
        text: "Egy strukturált, elágazó döntési rendszer példája, ahol a kimenet nem egyetlen válaszból, hanem a teljes útvonalból épül fel.",
      },
      {
        type: "howItWorks",
        title: "Hogyan működik?",
        bullets: [
          "A felhasználó preferenciák és fókuszok mentén hoz döntéseket — nem helyes válaszokat keres.",
          "Minden döntés állapotváltást eredményez, amely meghatározza a következő lépést.",
          "Az elágazások mentén eltérő útvonalak és mintázatok rajzolódnak ki.",
        ],
      },
      {
        type: "bridge",
        text:
          "Az ajánlás nem előre rögzített sablonból érkezik, hanem a teljes döntési folyamat strukturált eredménye.",
      },
      {
        type: "whyInCampaign",
        title: "Mire használható?",
        bullets: [
          "Összetett termék- vagy szolgáltatásrendszerek modellezésére.",
          "Olyan helyzetekben, ahol az ajánlásnak a teljes döntési mintázatból kell következnie.",
          "Konfigurálható ajánlatok vagy többváltozós választási helyzetek strukturálására.",
        ],
      },
      {
        type: "output",
        title: "Mi a kimenet?",
        bullets: [
          "Egy strukturált, indokolható ajánlási eredmény.",
          "Visszakövethető döntési út, amely alapján az ajánlás értelmezhető.",
        ],
      },
    ],
  },

  revealLabel: "Részletek megtekintése",
  startLabel: "Ajánló modell indítása",
  startPageId: "L1_routine_style",
  skinId: "skin_care",
},

  // ─────────────────────────────────────────────────────────────
  // COFFEE
  // ─────────────────────────────────────────────────────────────
  {
  id: "coffee",
  navLabel: "Gyors mintázat-feltáró modell",
  jsonFile: "coffee_quiz_demo_full.json",

  title: "Rövid döntési profil – példa",
  heroLine:
    "Alacsony lépésszámú döntési modell, amely néhány választásból strukturált, értelmezhető preferenciamintát rajzol ki.",

  startPageId: "Q1",
  skinId: "contract_coffee_dark_roast",

  details: {
    blocks: [
      {
        type: "intro",
        text:
          "Egy rövid, strukturált döntési folyamat példája, ahol kevés lépésből is értelmezhető minta áll össze.",
      },
      {
        type: "howItWorks",
        title: "Hogyan működik?",
        bullets: [
          "A felhasználó néhány, hétköznapi kontextushoz kötött döntést hoz.",
          "Minden választás eltérő állapotba vezeti a modellt.",
          "Az elágazások mentén kirajzolódik egy karakteres preferenciaminta.",
        ],
      },
      {
        type: "bridge",
        text:
          "A kevés, de jól definiált döntési pont gyorsan látható mintázatot eredményez.",
      },
      {
        type: "whyInCampaign",
        title: "Mire használható?",
        bullets: [
          "Gyors kvalifikációra vagy előszűrésre.",
          "Preferenciák feltérképezésére alacsony súrlódással.",
          "Belépő szintű döntési adatgyűjtésre.",
        ],
      },
      {
        type: "output",
        title: "Mi a kimenet?",
        bullets: [
          "Egy strukturált, kategorizált preferenciaprofil.",
          "Visszakövethető döntési út, amely alapján a minta értelmezhető.",
        ],
      },
    ],
  },

  revealLabel: "Részletek megtekintése",
  startLabel: "Profilmodell indítása",
},

  // ─────────────────────────────────────────────────────────────
  // HOLIDAY
  // ─────────────────────────────────────────────────────────────
 {
  id: "holiday",
  navLabel: "Időszakos aktiváció",
  jsonFile: "karácsony.json",

  title: "Szezonális döntési minta – példa",
  heroLine:
    "Rövid, hangulati döntésekre épülő modell, amely néhány választásból egy koherens, személyre szabott ünnepi kimenetet állít össze.",

  startPageId: "Q1",
  skinId: "kari",

  details: {
    blocks: [
      {
        type: "intro",
        text:
          "Egy rövid, szezonális döntési folyamat példája, ahol a választások egy vizuális és tartalmi kimenetben állnak össze.",
      },
      {
        type: "howItWorks",
        title: "Hogyan működik?",
        bullets: [
          "A felhasználó néhány hangulati döntést hoz az ünnepi preferenciáiról.",
          "A döntések eltérő útvonalakra terelik a modellt (tónus, stílus, jelenet).",
          "A végén egy konzisztens, személyre szabott holiday mode kimenet áll össze.",
        ],
      },
      {
        type: "bridge",
        text:
          "A rövid döntési út nem csak kimenetet ad: visszakövethetővé teszi, milyen preferenciák vezettek az eredményhez.",
      },
      {
        type: "whyInCampaign",
        title: "Mire használható?",
        bullets: [
          "Időszakos aktivációkra, ahol fontos a gyors indítás és az alacsony belépési küszöb.",
          "Olyan formátumként, ami könnyen újranyitható: reskinelhető és évről évre frissíthető új kimenetekkel.",
          "Megosztható kimenetekkel dolgozó belépő modellekre (social / landing belépő pont).",
        ],
      },
      {
        type: "output",
        title: "Mi a kimenet?",
        bullets: [
          "Egy személyre szabott holiday mode kimenet, döntésekből levezetve.",
          "Egy egységes, megosztható ünnepi vizuál / profilkártya jellegű eredmény.",
        ],
      },
    ],
  },

  revealLabel: "Részletek megtekintése",
  startLabel: "Holiday mode indítása",
},

  // ─────────────────────────────────────────────────────────────
  // MARKETING SIM
  // ─────────────────────────────────────────────────────────────
  {
  id: "marketing-sim",
  navLabel: "Onboarding / edukációs flow",
  jsonFile: "Mrk6_D_text_updated.json",

  title: "Edukációs döntési modell – példa",
  heroLine:
    "Szituáció-alapú döntési folyamat, ahol a választások mentén épül fel egy érthető, strukturált megoldáslogika.",

  details: {
    blocks: [
      {
        type: "intro",
        text:
          "Egy történetvezérelt edukációs példa, ahol a résztvevő döntési helyzeteken keresztül érti meg egy komplex probléma logikáját.",
      },
      {
        type: "howItWorks",
        title: "Hogyan működik?",
        bullets: [
          "A résztvevő valószerű szituációkban hoz döntéseket — nem tesztkérdésekre válaszol.",
          "Minden választás eltérő útvonalat és logikai következményt eredményez.",
          "A végén egy koherens megoldási keret áll össze, amely visszakövethető a döntési folyamatból.",
        ],
      },
      {
        type: "bridge",
        text:
          "A hangsúly nem információátadáson, hanem a döntési logika és az ok-okozati összefüggések megértésén van.",
      },
      {
        type: "whyInCampaign",
        title: "Mire használható?",
        bullets: [
          "Onboarding vagy belső tréning helyzetekben, ahol a megértés döntési szituációkon keresztül épül fel.",
          "Komplex rendszerek vagy megoldások logikájának strukturált bemutatására.",
          "Olyan edukációs környezetben, ahol fontos a döntések következményeinek láthatóvá tétele.",
        ],
      },
      {
        type: "output",
        title: "Mi a kimenet?",
        bullets: [
          "Egy strukturált megoldási logika, döntések mentén felépítve.",
          "Egy visszakövethető döntési út, amely alapján a résztvevő megérti az összefüggéseket.",
        ],
      },
    ],
  },

  revealLabel: "Részletek megtekintése",
  startLabel: "Flow indítása",
},

  // ─────────────────────────────────────────────────────────────
  // SOFTDRINK
  // ─────────────────────────────────────────────────────────────
  {
  id: "softdrink",
  navLabel: "Ajánló / döntési út",
  jsonFile: "uditő.json",

  title: "Gyors termékajánló modell – példa",
  heroLine:
    "Rövid döntési modell, ahol néhány választás strukturált módon szűkíti az ajánlási irányt egy konkrét termékre.",

  startPageId: "Q1",
  skinId: "contract_softdrink_fresh",

  details: {
    blocks: [
      {
        type: "intro",
        text:
          "Egy alacsony lépésszámú ajánlómodell példája, amely közvetlen termékkimenetbe fut ki.",
      },
      {
        type: "howItWorks",
        title: "Hogyan működik?",
        bullets: [
          "A felhasználó néhány egyszerű, ízlés- vagy helyzetalapú döntést hoz.",
          "Minden választás szűkíti a lehetséges termékkimenetek körét.",
          "A folyamat végén egy egyértelmű, strukturált ajánlás jelenik meg.",
        ],
      },
      {
        type: "bridge",
        text:
          "A döntési út rövid, de visszakövethető: látható, milyen preferenciák vezettek a konkrét ajánláshoz.",
      },
      {
        type: "whyInCampaign",
        title: "Mire használható?",
        bullets: [
          "Termékcsaládok gyors strukturált bemutatására.",
          "Beléptető ajánlómodellként retail vagy promóciós környezetben.",
          "Olyan helyzetekben, ahol a gyors döntéstámogatás fontosabb, mint a mély konfiguráció.",
        ],
      },
      {
        type: "output",
        title: "Mi a kimenet?",
        bullets: [
          "Egy konkrét termékajánlás, a döntésekből levezetve.",
          "Egy vizuálisan konzisztens kimenet, amely a választásokhoz kötődik.",
        ],
      },
    ],
  },

  revealLabel: "Részletek megtekintése",
  startLabel: "Ajánló indítása",
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
            Döntési modellek működés közben
          </h2>
        </header>

        <div className={s.examplesIntrok}>
          <p className={s.examplesIntroLead}>
            Az alábbi példák bemutatják, hogyan modellezhetők különböző döntési helyzetek a Questell rendszerében.
          </p>
          <p className={s.examplesIntroLead}>
            <strong>Minden struktúra szabadon alakítható, bővíthető vagy új célra konfigurálható.</strong>
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

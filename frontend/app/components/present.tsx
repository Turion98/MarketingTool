// app/components/landing/LandingPage.tsx
"use client";

import React from "react";
import s from "./LandingPage.module.scss";

type LandingPageProps = {
  logoSrc?: string;
  logoAlt?: string;
  onRequestQuoteClick?: () => void;
  onViewDemosClick?: () => void;
};

const campaignTypes = [
  {
    id: "product-launch",
    label: "1) Termékbevezetés (Awareness + Engagement)",
    desc: "Interaktív, storytelling-alapú élmény, amely vizuálisan kiemeli az új terméket és érzelmi kötést épít.",
    ideal: "Ideális: új SKU, szezonális termék, limitált kiadás.",
  },
  {
    id: "customer-survey",
    label: "2) Vásárlói felmérés (Insight + Profilkártya élmény)",
    desc: "Kérdésekre épülő interakció + AI-asszisztált vizuális profilkártya, amely a válaszokból készül.",
    ideal: "Ideális: insight-gyűjtés, célcsoport-felmérés, preferenciák feltérképezése.",
  },
  {
    id: "seasonal-campaign",
    label: "3) Szezonális kampány (Brand mood + aktivitás)",
    desc: "Gyorsan skinelhető, vizuálisan erős, egyszerű élmény karácsonyra, nyárra, back-to-schoolra stb.",
    ideal: "Ideális: FMCG, retail, beauty, szezonális akciók.",
  },
  {
    id: "decision-path",
    label: "4) Döntési út / Személyre szabott kimenet (Fragment-logika)",
    desc: "A felhasználó döntései alapján fragment-logika segítségével egyedi befejezést vagy kimenetet hozunk létre (ajánlás, insight vagy narratív lezárás).",
    note: "(A teljes termékajánló UI fejlesztés alatt áll, de a logika működik.)",
    ideal: "Ideális: szépségápolás, tech, szolgáltatások.",
  },
  {
    id: "educational",
    label: "5) Edukáló kampány (PR / CSR / Használati útmutató)",
    desc: "Interaktív történet vagy minijáték, amely érthetően tanít: termékhasználat, összetevők, fenntarthatóság, márkaérték.",
    ideal: "Ideális: PR, CSR, edukációs anyagok, tutorial jellegű tartalom.",
  },
  {
    id: "modular-minigames",
    label: "6) Moduláris minijátékok (Bővíthető élmény)",
    desc: "A platform moduláris szerkezete lehetővé teszi több rövid élmény összekötését sorozattá.",
    note: "(A többnapos visszatérési logika és cross-session memória fejlesztés alatt áll.)",
    ideal: "Ideális: loyalty-programok, napi mini-aktivációk, közösségi kampányok.",
  },
];

const LandingPage: React.FC<LandingPageProps> = ({
  logoSrc,
  logoAlt = "Questell logo",
  onRequestQuoteClick,
  onViewDemosClick,
}) => {
  return (
    <main className={s.page}>

      {/* ───────────── HERO SZEKCIÓ ───────────── */}
      <section id="hero" className={s.heroSection} aria-labelledby="hero-title">
        <div className={s.heroInner}>
          <div className={s.heroLogoSlot}>
            {logoSrc ? (
              <img src={logoSrc} alt={logoAlt} className={s.heroLogo} />
            ) : (
              <div className={s.heroLogoPlaceholder} />
            )}
          </div>

          <div className={s.heroContent}>
            <h1 id="hero-title" className={s.heroTitle}>
              AI-asszisztált, storytelling-alapú élmények – márkára szabva
            </h1>

            <p className={s.heroSubtitle}>
              A demóban látott játék egy skálázható, teljesen márkára
              szabható marketingeszköz mintája.
            </p>

            <p className={s.heroSubtitle}>
              A platformunk AI-vezérelt képgenerálást, fragment-logikát és
              személyre szabott UX-et kombinál, hogy néhány nap alatt
              készítsünk kampányszintű élményeket – márkáknak,
              termékbevezetésekhez és insight gyűjtéshez.
            </p>

            <div className={s.heroCtas}>
              <button
                type="button"
                className={s.primaryCta}
                onClick={onRequestQuoteClick}
                data-cta="request-quote"
              >
                Kérj ajánlatot
              </button>

              <button
                type="button"
                className={s.secondaryCta}
                onClick={onViewDemosClick}
                data-cta="view-demos"
              >
                Nézd meg a további demókat
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── MIT TUD A PLATFORM? ───────────── */}
      <section
        id="platform-capabilities"
        className={s.platformSection}
        aria-labelledby="platform-title"
      >
        <div className={s.platformInner}>
          <header className={s.platformHeader}>
            <p className={s.platformKicker}>MIT TUD A PLATFORM?</p>
            <h2 id="platform-title" className={s.platformTitle}>
              6 kampánytípus, amit ma is reálisan meg tudunk csinálni
            </h2>
            <p className={s.platformLead}>
              A platform moduláris: storytelling-alapú interakcióból,
              fragment-logikából és AI-képgenerálásból építünk kampányokat.
            </p>
            <p className={s.platformLead}>
              A következő 6 kampánytípus az, amit jelenleg valóban támogatunk – és
              amelyekhez már stabil technológiai alapunk van.
            </p>
          </header>

          <div className={s.campaignGrid}>
            {campaignTypes.map((item) => (
              <article
                key={item.id}
                className={s.campaignCard}
                aria-label={item.label}
              >
                <h3 className={s.campaignTitle}>{item.label}</h3>
                <p className={s.campaignDesc}>{item.desc}</p>
                {item.note && <p className={s.campaignNote}>{item.note}</p>}
                <p className={s.campaignIdeal}>{item.ideal}</p>
              </article>
            ))}
          </div>

          <p className={s.platformClosing}>
            Mindegyik kampánytípus teljesen márkára szabható: vizuál, szöveg,
            skin, AI-kép stílus, UX-flow, CTA és fragment-logika egyaránt a
            brand igényeihez igazítható.
          </p>
        </div>
      </section>

      {/* ───────────── MIÉRT MÁS, MINT EGY SABLONOS MINIJÁTÉK? ───────────── */}
      <section
        id="why-different"
        className={s.whySection}
        aria-labelledby="why-title"
      >
        <div className={s.whyInner}>
          <header className={s.whyHeader}>
            <h2 id="why-title" className={s.whyTitle}>
              Miért más, mint egy sablonos minijáték?
            </h2>

            <p className={s.whyLead}>
              A legtöbb interaktív kampány sablonokra épül: ugyanaz a wheel,
              scratch card, shuffle vagy quiz — más színekkel, más logóval.
            </p>

            <p className={s.whyLead}>
              A Questell ezzel szemben storytelling-alapú, AI-asszisztált élményt ad,
              amely valódi brandértéket teremt.
            </p>

            <p className={s.whyLead}>Ezért teljesen más kategória:</p>
          </header>

          <div className={s.whyList}>
            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  1) Személyre szabott élmény fragment-logikával
                </h3>
                <p>
                  A felhasználó döntései ténylegesen alakítják a történetet,
                  a vizuálokat és a végkimenetet.
                </p>
                <p>Nem lineáris minijáték, hanem személyre szabott interakció.</p>
              </div>
            </div>

            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  2) AI-vezérelt vizuálok — brand-safe módon
                </h3>
                <p>A generált képek nem randomok:</p>
                <p>
                  fragmentekkel, stílus-tokenekkel és kontrollált promptlogikával
                  készülnek, hogy mindig a márka vizuális világába illeszkedjenek.
                </p>
              </div>
            </div>

            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  3) Storytelling, nem mechanikus feladat
                </h3>
                <p>Nem kaparás, nem pörgetés.</p>
                <p>
                  A user belép egy mini történetbe, amelyben saját döntései alakítják
                  a percepciót, a hangulatot és a márka értékét.
                </p>
                <p>Ez érzelmi kapcsolatot épít, nem csak aktivitást mér.</p>
              </div>
            </div>

            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  4) Teljesen skinezhető UI — a márkához igazítva
                </h3>
                <p>
                  A vizuális rendszer (tipográfia, színek, UI-elemek, frame-ek)
                  mind cserélhetők.
                </p>
                <p>
                  A platform nem sablon: márkaidentitású élmény, nem generikus játék.
                </p>
              </div>
            </div>

            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  5) Moduláris rendszer — több formátum egy platformon
                </h3>
                <p>
                  Story, quiz, vizuális kártyák, döntési pontok, minijátékok —
                  minden modul kombinálható.
                </p>
                <p>Így a brand egyedi élményt kap a céljához igazítva.</p>
              </div>
            </div>

            <div className={s.whyItem}>
              <div className={s.whyText}>
                <h3 className={s.whyItemTitle}>
                  6) Gyors és hatékony gyártás
                </h3>
                <p>
                  A moduláris rendszer miatt egy kampány néhány nap alatt elkészül,
                  mégis egyedi élményt ad.
                </p>
                <p>A marketingcsapatnak nem kell hónapokig fejleszteni.</p>
              </div>
            </div>
          </div>

          <p className={s.whyClosing}>
            Ez a platform nem egy sablonos aktiváció — hanem egy minikampány,
            amely élményt, adatot és valódi márkaértéket ad egyszerre.
          </p>
        </div>
      </section>

      {/* ───────────── PÉLDA KAMPÁNYOK – 4 KÁRTYA ───────────── */}
      <section
        id="example-campaigns"
        className={s.examplesSection}
        aria-labelledby="examples-title"
      >
        <div className={s.examplesInner}>
          <header className={s.examplesHeader}>
            <h2 id="examples-title" className={s.examplesTitle}>
              Példa kampányok
            </h2>
          </header>

          <div className={s.examplesGrid}>
            <article className={s.exampleCard} aria-label="Termékbevezetés">
              <h3 className={s.exampleCardTitle}>
                1) Termékbevezetés – “Új skincare termék AI-élményben”
              </h3>
              <p>
                Interaktív mini történet, ahol a felhasználó döntései alapján
                különböző vizuális jelenetek generálódnak.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> egy új termék érzelmi bevezetése
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> emlékezetes vizuális élmény + magas engagement
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Vásárlói felmérés">
              <h3 className={s.exampleCardTitle}>
                2) Vásárlói felmérés – “Profilkártya a válaszok alapján”
              </h3>
              <p>
                A user néhány kérdésre válaszol, majd AI-generál egy személyre
                szabott profilkártyát.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> insight + preferenciák gyűjtése
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> a kimenet megosztható, így virális potenciál
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Szezonális kampány">
              <h3 className={s.exampleCardTitle}>
                3) Szezonális kampány – “Karácsonyi élmény a márka hangulatával”
              </h3>
              <p>
                Skinelt design, tematikus vizuálok, season mood — néhány nap alatt
                elkészítve.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> brand mood + időszakos aktivitás
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> gyors előállítás, erős vizuális identitás
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Edukáló kampány">
              <h3 className={s.exampleCardTitle}>
                4) Edukáló kampány – “Használati út egy interaktív narratívában”
              </h3>
              <p>
                Rövid történet, amely játékosan mutatja be a termék helyes
                használatát vagy egy CSR témát.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> edukáció egyszerűen
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> a tanulás élményalapú, nem unalmas
              </p>
            </article>
          </div>

          <p className={s.examplesClosing}>
            A példák csak irányok — minden élményt a márka céljaihoz,
            vizuális világához és üzeneteihez igazítunk.
          </p>
        </div>
      </section>

      {/* ───────────── HOGYAN MŰKÖDIK AZ EGYÜTTMŰKÖDÉS? ───────────── */}
      <section
        id="collaboration"
        className={s.collabSection}
        aria-labelledby="collab-title"
      >
        <div className={s.collabInner}>
          <header className={s.collabHeader}>
            <h2 id="collab-title" className={s.collabTitle}>
              Hogyan működik az együttműködés?
            </h2>
            <p className={s.collabLead}>
              Egyszerű, átlátható folyamat — gyorsan szállítható, márkára szabott élménnyel
            </p>
          </header>

          <div className={s.collabSteps}>

            {/* 1. lépés */}
            <div className={s.collabStep}>
              <h3 className={s.collabStepTitle}>1) Rövid igényfelmérés és koncepció</h3>
              <p>
                Egy rövid megbeszélés során átbeszéljük a kampány célját, a kívánt élmény
                típusát és a márka vizuális irányait.
              </p>
              <p>
                Ez alapján összeállítjuk a koncepciót és a javasolt kampánystruktúrát.
              </p>
            </div>

            {/* 2. lépés */}
            <div className={s.collabStep}>
              <h3 className={s.collabStepTitle}>2) Demo élmény elkészítése (kb. 1 hét)</h3>
              <p>A koncepció elfogadása után körülbelül egy hét alatt elkészítjük a teljes belső demót:</p>

              <ul className={s.collabChecklist}>
                <li>interaktív flow</li>
                <li>AI-vizuálok kontrollált stílussal</li>
                <li>fragment-logika</li>
                <li>skinek + szöveg + UI</li>
              </ul>

              <p>A márka/ügynökség kipróbálhatja és visszajelzést ad.</p>
            </div>

            {/* 3. lépés */}
            <div className={s.collabStep}>
              <h3 className={s.collabStepTitle}>3) Finomhangolás és véglegesítés (néhány hét alatt)</h3>
              <p>A demó jóváhagyása után gyors finomhangolási kör következik:</p>

              <ul className={s.collabChecklist}>
                <li>vizuálok pontosítása</li>
                <li>UX + narratíva igazítása</li>
                <li>CTA-k, integrációk, beágyazási opciók</li>
              </ul>

              <p>
                A teljes élmény néhány héten belül készen áll a publikálásra.
              </p>
            </div>
          </div>

          <p className={s.collabClosing}>
            A folyamat gyors, kiszámítható és alacsony terhet jelent a marketingcsapat számára —
            mi visszük a kreatívot és a technikát, ők csak döntéseket hoznak.
          </p>
        </div>
      </section>

      {/* ───────────── ÁRAZÁSI BLOKK ───────────── */}
      <section
        id="pricing"
        className={s.pricingSection}
        aria-labelledby="pricing-title"
      >
        <div className={s.pricingInner}>
          <header className={s.pricingHeader}>
            <h2 id="pricing-title" className={s.pricingTitle}>
              Árazási logika
            </h2>
            <p className={s.pricingLead}>
              A kampány összetettségéhez igazítva — Méret → komplexitás → valós platformképesség.
            </p>
            <p className={s.pricingLead}>
              És nem olyat árulunk, ami nincs.
            </p>
          </header>

          {/* Ár-kategória kártyák */}
          <div className={s.pricingGrid}>

            {/* STORY CAMPAIGN */}
            <article className={s.pricingCard} aria-label="Story Campaign">
              <h3 className={s.pricingCardTitle}>Story Campaign</h3>

              <p className={s.pricingMeta}>
                (3–6 oldal, 1–3 végkimenetellel — pl. a TERMÉKBEVEZETÉS élmény)
              </p>

              <p>
                Tökéletes, ha egyetlen terméket vagy termékcsaládot akarsz bemutatni élményformában.
              </p>

              <h4 className={s.pricingSubheading}>Mit tartalmaz:</h4>
              <ul className={s.pricingList}>
                <li>teljes storytelling flow</li>
                <li>puzzle / döntési pont</li>
                <li>1–3 vizuális ajánlás vagy végkimenet</li>
                <li>AI-vizuálok (brand-safe)</li>
                <li>skin + UI</li>
                <li>publikálható kampánylink</li>
              </ul>

              <p className={s.pricingIdeal}>
                <strong>Ideális:</strong> új termék bevezetése, szezonális kampány, rövid aktiváció
              </p>
            </article>

            {/* MULTI-OUTCOME CAMPAIGN */}
            <article className={s.pricingCard} aria-label="Multi-Outcome Campaign">
              <h3 className={s.pricingCardTitle}>Multi-Outcome Campaign</h3>

              <p className={s.pricingMeta}>
                (komplex marketing story – pl. a MARKETING STORY, amit most gyártasz)
              </p>

              <p>
                Ha mélyebb narratívát, több döntést, több kimenetet, több vizuálstílust és ágazást szeretnél.
              </p>

              <h4 className={s.pricingSubheading}>Mit tartalmaz:</h4>
              <ul className={s.pricingList}>
                <li>10–25 oldal, több modul</li>
                <li>több puzzle, több decision-tree</li>
                <li>fragment-emlékezet</li>
                <li>3–6 végkimenet</li>
                <li>komplex AI-vizuál stíluscsoportok</li>
                <li>remarketing-szegmentek előkészítése</li>
                <li>teljes márkára szabott flow</li>
              </ul>

              <p className={s.pricingIdeal}>
                <strong>Ideális:</strong> nagyobb kampányok, PR storytelling, insight kampányok, pitch anyagok
              </p>
            </article>

            {/* MODULAR SERIES */}
            <article className={s.pricingCard} aria-label="Modular Series">
              <h3 className={s.pricingCardTitle}>Modular Series (opcionális)</h3>

              <p className={s.pricingMeta}>
                (több epizódos campaign, ismételt visszatérés)
              </p>

              <p>
                Napi / heti modulokra bontott élmény — loyalty jelleg.
              </p>
            </article>
          </div>

          <p className={s.pricingClosing}>
            A pontos ár mindig a komplexitástól függ — a termékbevezetés és a marketing story két külön kategória,
            és nem ugyanazt az erőforrást igényli. A brief alapján 24 órán belül pontos ajánlatot készítünk.
          </p>
        </div>
      </section>

      {/* ───────────── KIKNEK AJÁNLJUK? ───────────── */}
      <section
        id="audience"
        className={s.audienceSection}
        aria-labelledby="audience-title"
      >
        <div className={s.audienceInner}>
          <header className={s.audienceHeader}>
            <h2 id="audience-title" className={s.audienceTitle}>
              Kiknek ajánljuk?
            </h2>
            <p className={s.audienceLead}>
              Olyan márkáknak és ügynökségeknek, akik nem sablonos aktivációt szeretnének, hanem élményt.
            </p>
          </header>

          <div className={s.audienceList}>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>FMCG márkáknak</h3>
              <p>
                Akik gyorsan fogyó termékekhez szeretnének emlékezetes, megosztható kampányt —
                szezonális, promóciós vagy újdonságbevezető fókuszban.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Beauty & skincare brandeknek</h3>
              <p>
                Ahol a vizuális élmény és a személyre szabott ajánlások számítanak.
                A story-alapú, AI-képes bőrápolási útvonalak különösen jól működnek.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Retail láncoknak és e-commerce szereplőknek</h3>
              <p>
                Akik szeretnék növelni a bevonódást, kiemelni termékkategóriákat,
                vagy insightot gyűjteni vásárlási preferenciákról.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Telekom, tech és szolgáltatói szektoroknak</h3>
              <p>
                Akik komplex szolgáltatásokat szeretnének emberközeli,
                interaktív formában bemutatni — nem száraz feature-listákkal.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Ügynökségeknek, akik új formátumot keresnek</h3>
              <p>
                Amikor a briefben az szerepel: „legyen valami interaktív, élményalapú,
                de gyorsan kell és ne legyen egyedi fejlesztés” — ez a formátum tökéletesen illik.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Márkáknak, akik insightot gyűjtenének kérdőív helyett</h3>
              <p>
                Ahol fontos, hogy ne egyszerű survey legyen, hanem egy flow, ami közben valós döntéseket látunk —
                és jobb remarketing szegmenseket építünk.
              </p>
            </div>

            <div className={s.audienceItem}>
              <h3 className={s.audienceItemTitle}>Bármilyen brandnek, aki szeretne kitűnni a social zajból</h3>
              <p>
                A story-alapú élmények végén megosztható ajánlásokkal, vizuális kártyával vagy személyre szabott outputtal
                lehet viralitást építeni.
              </p>
            </div>
          </div>
        </div>
      </section>
{/* ───────────── TECHNOLÓGIA & BIZTONSÁG ───────────── */}
<section
  id="tech-security"
  className={s.techSection}
  aria-labelledby="tech-title"
>
  <div className={s.techInner}>
    <header className={s.techHeader}>
      <h2 id="tech-title" className={s.techTitle}>
        Technológia & Biztonság
      </h2>
      <p className={s.techLead}>
        Brand-biztos, stabil, skálázható kampány­technológia
      </p>
    </header>

    <div className={s.techList}>

      {/* Brand-safe AI-vizuálok */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Brand-safe AI-vizuálok</h3>
        <p>
          Minden AI-kép előre definiált, kontrollált promptlogikából készül:
          beépített negatív promptokkal, tiltott motívumokkal, és stílus­tokenekkel.
        </p>
        <p>
          A rendszer két védelmi réteggel dolgozik: promptszintű szűrés + automatikus
          output-ellenőrzés, így a márkára nézve kockázatos tartalom nem kerülhet ki.
        </p>
      </div>

      {/* GDPR */}
      <div className={s.techItem}>
  <h3 className={s.techItemTitle}>Brand-safe AI-vizuálok</h3>
  <p>
    Minden AI-kép előre definiált, kontrollált promptlogikából készül:
    negatív promptokkal, tiltott motívumokkal és stílustokenekkel.
  </p>
  <p>
    A rendszer kétlépcsős védelmet alkalmaz: először promptszinten szűr, majd
    automatikus OCR-alapú output-ellenőrzéssel vizsgálja a generált képet.
    Ha a modell szöveget, UI-elemet vagy márkára nézve kockázatos részletet
    hozna létre, a rendszer újragenerálja a képet.
  </p>
</div>

      {/* Hosting */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Saját hosting, gyors betöltés</h3>
        <p>
          Minden kampány saját szerveren fut, optimalizált médiakezeléssel.
          A vizuálok gyorsan érkeznek mobilon és gyengébb hálózaton is.
        </p>
      </div>

      {/* Runtime izoláció */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Izolált, márkára szabott runtime</h3>
        <p>
          Minden élmény külön, izolált futtatási környezetben él —
          semmi nem keveredik, egy kampány sem érintheti a másikat.
        </p>
      </div>

      {/* Monitoring */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Stabilitás, uptime, monitoring</h3>
        <p>
          A futást aktívan monitorozzuk. Hibát, leállást vagy anomáliát
          azonnal látunk és javítunk — a márkának nem kell saját IT-t bevonni.
        </p>
      </div>

      {/* AI-kitettség nélkül */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Nincs AI-kitettség a márka számára</h3>
        <p>
          A márka nem futtat saját AI-modellt, nem visel technológiai kockázatot.
        </p>
        <p>
          A generált vizuálok zárt, kontrollált rendszerben készülnek és kerülnek használatba.
        </p>
      </div>

      {/* Jogilag tiszta képi tartalom */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Jogilag tiszta képi tartalom</h3>
        <p>A vizuálok minden esetben:</p>
        <ul className={s.techBullets}>
          <li>nem stock</li>
          <li>nem jogvédett anyag alapján készülnek</li>
          <li>nincsenek valódi márkák, címkék, logók</li>
        </ul>
        <p>→ a márka kockázat nélkül használhatja a kampányban.</p>
      </div>

      {/* Frissítés */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Bármikor frissíthető, módosítható</h3>
        <p>
          Ha kampány közben változtatni kell (szöveg, kép, prompt, átvezetés),
          azt a rendszer azonnal, biztonságosan kezeli — downtime nélkül.
        </p>
      </div>
    </div>

    <p className={s.techClosing}>
  A platform valós idejű kontrollt, automatikus képi biztonsági szűrést és
  stabil infrastrukturális hátteret biztosít — így a márkára nézve
  kockázatos tartalom sem a prompt szintjén, sem a generált outputban
  nem jelenhet meg.
</p>

  </div>
</section>

      {/* ───────────── ZÁRÓ CTA ───────────── */}
      <section
        id="final-cta"
        className={s.finalCtaSection}
        aria-labelledby="final-cta-title"
      >
        <div className={s.finalCtaInner}>
          <h2 id="final-cta-title" className={s.finalCtaTitle}>
            Indítsuk el a saját interaktív kampányodat.
          </h2>

          <p className={s.finalCtaText}>
            Legyen szó termékbevezetésről, insight gyűjtésről vagy storytelling élményről,
            a platformunk néhány nap alatt elkészíti a testreszabott demót —
            és pár héten belül indulhat a kampány.
          </p>

          <div className={s.finalCtaButtons}>
            <button
              type="button"
              className={s.primaryCta}
              data-cta="request-quote-final"
              onClick={onRequestQuoteClick}
            >
              Ajánlatkérés
            </button>

            <button
              type="button"
              className={s.secondaryCta}
              data-cta="view-demos-final"
              onClick={onViewDemosClick}
            >
              Demó megtekintése
            </button>
          </div>
        </div>
      </section>

    </main>
  );
};

export default LandingPage;

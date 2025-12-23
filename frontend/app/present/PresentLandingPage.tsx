
"use client";

import React, { useState } from "react";
import s from "./LandingPage.module.scss";
import { ContactModal } from "./components/ContactModal";
import { CollabDiagram } from "./components/CollabDiagram";
import { DynamicMeshBackground } from "./components/DynamicMeshBackground";
import { useEffect, useRef } from "react";

type LandingPageProps = {
  logoSrc?: string;
  logoAlt?: string;
  onRequestQuoteClick?: () => void;
  onViewDemosClick?: () => void;
};

// 🔹 intent state: hero-ból vezérelt vizuális fókusz a "Mit tud a platform?" kártyákon
type Intent = "convert" | "engage" | null;

const campaignTypes: Array<{
  id: string;
  label: string;
  desc: string;
  ideal: string;
  note?: string;
  intents?: Intent[]; // 🔹 melyik intentnél legyen hangsúlyos
}> = [
  {
  id: "product-launch",
  label: "Termékbevezetés",
  desc: "Nem teaser + banner, hanem egy végigjátszható élmény, amely érzelmi első benyomást épít, és természetesen vezeti tovább a felhasználót a termék felé.",
  ideal: "Ideális: új SKU, szezonális vagy limitált termék, relaunch.",
  intents: ["convert", "engage"],
},
{
  id: "customer-survey",
  label: "Vásárlói felmérés",
  desc: "Nem klasszikus kérdőív: a felhasználó döntéseiből személyre szabott kimenet születik, miközben a márka valódi viselkedési insightot kap.",
  ideal: "Ideális: insight-gyűjtés, célcsoport-feltérképezés, preferenciák megértése.",
  intents: ["convert"],
},
{
  id: "seasonal-campaign",
  label: "Szezonális kampány",
  desc: "Nem egyszeri kreatív, hanem gyorsan indítható, erős vizuális élmény, amely rövid kampányablakban is magas bevonódást hoz.",
  ideal: "Ideális: FMCG, retail, beauty, rövid kampányablakok.",
  intents: ["engage"],
},
{
  id: "decision-path",
  label: "Termékajánló",
  desc: "Nem egyetlen válaszon múlik az eredmény: a teljes döntési út számít, és ebből áll össze a valóban személyre szabott ajánlás.",
  ideal: "Ideális: ott, ahol fontos, hogy a felhasználó releváns és hiteles választ kapjon.",
  intents: ["convert"],
},
{
  id: "educational",
  label: "Edukációs kampány",
  desc: "Nem PDF vagy hosszú magyarázat, hanem végigjátszható tanulási élmény, amely közben a termékhasználat és a márkaértékek is rögzülnek.",
  ideal: "Ideális: PR-, CSR-kampányok, tutorial tartalmak, onboarding.",
  intents: ["engage"],
},
{
  id: "modular-minigames",
  label: "Moduláris minijátékok (In the Future)",
  desc: "Egymásra épülő rövid élmények sorozata azonos vizuális világgal, amely hosszabb távon is fenntartja az aktivitást.",
  ideal: "Ideális: loyalty aktivációk, napi mini-élmények, gamified kampánysorozatok.",
  note: "In the future",
}
,
];

const LandingPage: React.FC<LandingPageProps> = ({
  logoSrc,
  logoAlt = "Questell logo",
  onRequestQuoteClick,
  onViewDemosClick, // ⛔️hero-ból kivezetjük, de a komponens API-ja maradhat
}) => {
  const [isContactOpen, setIsContactOpen] = useState(false);

  // 🔹 új intent state
  const [intent, setIntent] = useState<Intent>(null);

  // 🔹 ide scrollozunk a hero intent gombok után (platform szekció)
  const platformRef = useRef<HTMLElement | null>(null);
const handleRequestQuote = () => {
  if (onRequestQuoteClick) {
    onRequestQuoteClick(); // analytics / tracking
  }
  setIsContactOpen(true);
};

// 🔹 intent toggle — CSAK STATE, NINCS SCROLL
const handleIntentSelect = (next: Exclude<Intent, null>) => {
  setIntent((prev) => (prev === next ? null : next));
};
  

  const principlesRef = useRef<HTMLDivElement | null>(null);
  const [principlesInView, setPrinciplesInView] = useState(false);

  useEffect(() => {
    const el = principlesRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPrinciplesInView(true);
          observer.disconnect(); // csak egyszer fusson
        }
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <DynamicMeshBackground intensity={4} color="255,255,255" />

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

              {/* ✅ demo-játék említés kivezetve */}
              <p className={s.heroSubtitle}>
                A Questell egy olyan kampánymotor, amely döntésekre épülő UX-et és kontrollált AI-vizuál
                generálást kombinál.
              </p>

              <p className={s.heroSubtitle}>
                Ugyanaz a rendszer használható brand-élményre, insight-gyűjtésre vagy konverzióra — a cél
                határozza meg a flow-t és a kimenetet.
              </p>

              {/* ✅ új intent gombok + átírt ajánlatkérés */}
              <div className={s.heroCtas}>
                <button
                  type="button"
                  className={s.secondaryCta}
                  onClick={() => handleIntentSelect("engage")}
                  data-cta="intent-engage"
                  aria-pressed={intent === "engage"}
                >
                  Szeretném, hogy bevonjon
                </button>

                <button
                  type="button"
                  className={s.secondaryCta}
                  onClick={() => handleIntentSelect("convert")}
                  data-cta="intent-convert"
                  aria-pressed={intent === "convert"}
                >
                  Szeretném, hogy eladjon
                </button>

                <button
                  type="button"
                  className={s.primaryCta}
                  onClick={handleRequestQuote}
                  data-cta="contact"
                >
                  Kapcsolatfelvétel
                </button>

                {/* ⛔️ "Nézd meg a további demókat" kivezetve a heróból */}
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── ALAPELVEK ───────────── */}
{/* sentinel – EZT figyeli az IntersectionObserver */}
<div
  ref={principlesRef}
  aria-hidden="true"
  style={{ height: "1px" }}
/>

<section
  id="principles"
  className={s.whySection}
  data-inview={principlesInView ? "true" : "false"}
  aria-labelledby="principles-title"
>


 <div className={s.whyInner}>
  <header className={s.whyHeader}>
    <h2 id="principles-title" className={s.whyTitle}>
      Alapelvek
    </h2>
  </header>

  <div className={s.whyList}>
    <div className={s.whyItem}>
      <div className={s.whyItemInner}>
        <div className={s.whyText}>
          <h3 className={s.whyItemTitle}>Döntésekre épülő kampánylogika</h3>
          <p>
            A felhasználó válaszai nem elvesznek egy flow végén, hanem
            építőelemei az élménynek.
          </p>
        </div>
      </div>
    </div>

    <div className={s.whyItem}>
      <div className={s.whyItemInner}>
        <div className={s.whyText}>
          <h3 className={s.whyItemTitle}>Valódi személyre szabott kimenetek</h3>
          <p>
            Minden döntési út más vizuált, más történetet és más végkimenetet
            eredményez.
          </p>
        </div>
      </div>
    </div>

    <div className={s.whyItem}>
      <div className={s.whyItemInner}>
        <div className={s.whyText}>
          <h3 className={s.whyItemTitle}>AI, márkára szabott vizuális rendszerben</h3>
          <p>
            A vizuálok nem random generálódnak, hanem fragmentekkel,
            stílus-tokenekkel és szabályokkal irányítva.
          </p>
        </div>
      </div>
    </div>

    <div className={s.whyItem}>
      <div className={s.whyItemInner}>
        <div className={s.whyText}>
          <h3 className={s.whyItemTitle}>Egyetlen motor, több kampánycélhoz</h3>
          <p>
            Ugyanaz a rendszer használható márkaélményre, insight-gyűjtésre vagy
            konverzióra — a cél határozza meg a flow-t.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
</section>


       {/* ───────────── MIT TUD A PLATFORM? ───────────── */}
<section
  id="platform-capabilities"
  ref={platformRef}
  className={s.platformSection}
  aria-labelledby="platform-title"
  data-intent={intent ?? "none"} // 🔹 SCSS-ben erre tudsz majd támaszkodni
>
  <div className={s.platformInner}>
    <header className={s.platformHeader}>
      <h2 id="platform-title" className={s.platformTitle}>
        MIT AD EGY QUESTELL KAMPÁNY?
      </h2>

      <p className={s.platformLeadek}>
        Nem egy quizet vagy sablonos minijátékot kapsz.
        </p>
        <p className={s.platformLead}>
        Egy végigjátszható kampányt, ami figyelmet tart, döntésekhez segít, és közben adatot is ad.
      </p>

      <p className={s.platformLead}>
        A formátum mindig a célhoz igazodik — brand-élményhez, insight-gyűjtéshez vagy konverzióhoz.
      </p>

      <p className={s.platformLeader}>Javasolt kampányformátumok</p>
    </header>

    <div className={s.campaignGrid}>
      {campaignTypes.map((item) => {
        const isEmphasized = intent !== null && (item.intents?.includes(intent) ?? false);
        const isDeemphasized = intent !== null && !isEmphasized;

        return (
          <article
            key={item.id}
            className={[
              s.campaignCard,
              isEmphasized ? s.campaignCardEmphasized : "",
              isDeemphasized ? s.campaignCardDeemphasized : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={item.label}
            data-intent-state={
              intent === null ? "neutral" : isEmphasized ? "emphasized" : "deemphasized"
            }
          >
            <h3 className={s.campaignTitle}>{item.label}</h3>
            <p className={s.campaignDesc}>{item.desc}</p>
            {item.note && <p className={s.campaignNote}>{item.note}</p>}
            <p className={s.campaignIdeal}>{item.ideal}</p>
          </article>
        );
      })}
    </div>

    <p className={s.platformClosing}>
      Ezek nem “kész termékek”, hanem bevált kampányformátumok.
      <br />
      Egy pilot során kiválasztjuk a célnak megfelelőt, és erre építjük fel az egyedi kampányélményt.
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
              Termékbevezetés
              </h3>
              <p>  “Új bőrápolási termék bevezetése”</p>
              <p>
                Interaktív mini történet, ahol a felhasználó döntései alapján
                különböző vizuális jelenetek generálódnak.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> Az új termék élményalapú bevezetése
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> emlékezetes vizuális élmény és magas elköteleződés
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Vásárlói felmérés">
              <h3 className={s.exampleCardTitle}>
                Vásárlói felmérés
              </h3>
              <p> “Profilkártya a válaszok alapján”</p>
              <p>
                A felhasználó néhány kérdésre válaszol, majd AI-generál egy személyre
                szabott profilkártyát.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> insight + preferenciák gyűjtése
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> a kimenet személyre szabott, egyedi és megosztható
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Szezonális kampány">
              <h3 className={s.exampleCardTitle}>
                Szezonális kampány
              </h3>
              <p>“Ünnepi élmény a márka hangulatával”</p>
              <p>
                Egyedi arculatú, tematikus vizuálokkal készülő kampány, amely gyorsan, akár néhány nap alatt  megvalósítható.
              </p>
              <p className={s.exampleMeta}>
                <strong>Cél:</strong> szezonális jelenlét erősítése és a közönség bevonása.
              </p>
              <p className={s.exampleMeta}>
                <strong>Érték:</strong> Könnyen befogadható, látványos és rögtön bevon.
              </p>
            </article>

            <article className={s.exampleCard} aria-label="Edukáló kampány">
              <h3 className={s.exampleCardTitle}>
                Edukáló kampány
              </h3>
              <p>„Interaktív játék, amely élmény alapon tanít.”</p>
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
        Kiszámítható, lépésről lépésre épülő folyamat — gyors szállítással és alacsony ügyféloldali terheléssel.
      </p>
    </header>

    <p className={s.collabLead}>
    A folyamat átlátható, hatékony és minden döntési pontnál kézben tartható.
A célok rögzítése után a kreatív és technológiai megvalósítás fókuszált, jól kontrollált keretben történik.
    </p>

    <CollabDiagram />

    <p className={s.collabClosing}>
     A Questell biztositja, hogy a  folyamat végén egy stabil, önállóan működő és azonnal bevethető élményt kapnak, amely bármikor publikálható.
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
        Brand-biztos, átlátható és skálázható kampánytechnológia
      </p>
    </header>

    <div className={s.techList}>

      {/* Brand-safe AI-vizuálok */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Brand-safe AI-vizuálok</h3>
        <p>
          A képgenerálás szerveroldali, kontrollált promptlogikából történik.
          A rendszer automatikusan tiltott motívumokat kizáró negatív blokkal
          dolgozik (logók, feliratok, watermarkok, érzékeny elemek nélkül),
          és minden vizuál kampányonként elkülönített tárhelyre kerül.
        </p>
        <p>
          Így a márka biztonságos, egységes vizuális környezetben kap AI-képeket.
        </p>
      </div>

      {/* Cache & stabilitás */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Gyors cache-rendszer, stabil futás</h3>
        <p>
          A storyk, oldalak és generált assetek szerveroldali cache-ből érkeznek,
          ami gyors válaszidőt és stabil működést ad nagy terhelés mellett is.
        </p>
        <p>
          Módosítás esetén dedikált cache-tisztító mechanizmus frissíti a tartalmat —
          teljes rendszerleállás nélkül.
        </p>
      </div>

      {/* Kampány szeparáció */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Kampányonként szeparált tartalom</h3>
        <p>
          Minden kampány saját story-fájlokkal és asset-könyvtárral fut.
          A backend path-ellenőrzést használ, így egy élmény nem férhet hozzá
          más kampány tartalmához.
        </p>
        <p>
          Ez tiszta, rendezett és biztonságos környezetet ad minden márkának.
        </p>
      </div>

      {/* API biztonság */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Biztonságos API és HTTP-védelem</h3>
        <p>
          A rendszer alapértelmezett biztonsági headereket alkalmaz
          (X-Frame-Options, HSTS, Referrer-Policy, MIME-sniffing tiltása),
          a CORS pedig kizárólag a jóváhagyott domainekre van nyitva.
        </p>
        <p>
          Így az élmény nem ágyazható be illetéktelen helyre, és külső oldalak
          nem férnek hozzá az API-hoz.
        </p>
      </div>

      {/* Analitika */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Átlátható analitika, aláírt export</h3>
        <p>
          Az interakciók kampányonként, JSONL formátumban kerülnek mentésre.
          A riportok exportálása időkorlátos, HMAC-aláírt tokennel történik,
          így csak az fér hozzá, akinek a márka ezt jóváhagyja.
        </p>
        <p>
          A kampányadatok biztonságosan és tisztán kezelhetők.
        </p>
      </div>

      {/* Jogtisztaság */}
      <div className={s.techItem}>
        <h3 className={s.techItemTitle}>Jogilag tiszta képi tartalom</h3>
        <p>A vizuálok minden esetben:</p>
        <ul className={s.techBullets}>
          <li>nem stock vagy jogvédett fotóból készülnek</li>
          <li>nem tartalmaznak valódi logókat vagy márkaneveket</li>
          <li>nem jelenítenek meg felismerhető, valós személyeket</li>
        </ul>
        <p>→ A márka minimális vizuális-jogi kockázattal dolgozik.</p>
      </div>

    </div>

    <p className={s.techClosing}>
      A platform kontrollált AI-vizuálokat, gyors cache-alapú működést,
      szeparált kampánykörnyezetet és biztonságos API-réteget biztosít —
      így a márka egy stabil, kiszámítható technológián futtathat minden élményt.
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
              onClick={handleRequestQuote}
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
      <ContactModal
  open={isContactOpen}
  onClose={() => setIsContactOpen(false)}
/>

    </main>
    </>
  );
};

export default LandingPage;


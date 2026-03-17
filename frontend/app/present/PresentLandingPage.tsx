"use client";

import React, { useLayoutEffect, useState, useRef, useEffect } from "react";

import s from "./LandingPage.module.scss";
import { ContactModal } from "./components/ContactModal";
import { CollabDiagram } from "./components/CollabDiagram";
import { DynamicMeshBackground } from "./components/DynamicMeshBackground";
import { ExamplesSection } from "./components/ExamplesSection";
import { PlatformCutout } from "./components/PlatformCutout";

type LandingPageProps = {
  logoSrc?: string;
  logoAlt?: string;
  onRequestQuoteClick?: () => void;
  onViewDemosClick?: () => void;
};

type Intent = "convert" | "engage" | null;
type Lang = "hu" | "en";

const DEFAULT_LOGO = "/assets/my_logo.png";
const LANG_STORAGE_KEY = "questell_present_lang_v1";

/** ✅ TOP-LEVEL: fordítások (tömbök/objektumok) */
const HERO_PROBLEMS_BY_LANG: Record<Lang, readonly string[]> = {
  hu: [
    "Hetek mennek el, mieltt kiderül, működik-e.",
    "A forgalom jön, de nem derül ki, merre lépj tovább.",
    "Nem látod, kinek mi működik valójában.",
    "Nem kapsz egyértelmű jelzést, mit kellene változtatni.",
    "Nem derül ki, mi hozott valódi megtérülést.",
    "A kampány megy, de a döntési felelősség végig rajtad marad.",
  ] as const,
  en: [
    "Weeks go by before you know what actually works.",
    "Traffic comes in, but you still don’t know what to do next.",
    "You can’t see what works for whom — in practice.",
    "You don’t get a clear signal on what to change.",
    "You can’t tell what produced real ROI.",
    "The campaign runs, but the decision burden stays on you.",
  ] as const,
};

type CampaignType = {
  id: string;
  label: string;
  desc: string;
  ideal: string;
  note?: string;
  intents?: Intent[];
};

const CAMPAIGN_TYPES_BY_LANG: Record<Lang, CampaignType[]> = {
  hu: [
    {
      id: "product-launch",
      label: "Termékbevezetés",
      desc: "Nem teaser vagy banner: irányított döntési út, ami kontextust ad, felépíti az első benyomást, és természetesen vezeti tovább a felhasználót.",
      ideal: "Ideális: új termék/szolgáltatás, relaunch, szezonális bevezetés.",
      intents: ["convert"],
    },
    {
      id: "customer-survey",
      label: "Insight gyűjtés",
      desc: "Nem klasszikus kérdőív: a döntésekből személyre szabott kimenet készül, miközben a bejárási út és a mintázatok is értelmezhetők.",
      ideal: "Ideális: insight-gyűjtés, szegmentáció, igényfeltárás, kvalifikáció.",
      intents: ["engage", "convert"],
    },
    {
      id: "seasonal-campaign",
      label: "Időszakos aktiváció",
      desc: "Gyorsan indítható, rövid időszakban is jól működő interaktív útvonal — nem egyszeri kreatív, hanem bejárható élmény.",
      ideal: "Ideális: időszakos aktivációk, retail/FMCG, event vagy kiemelt ajánlatok.",
      intents: ["engage"],
    },
    {
      id: "decision-path",
      label: "Ajánló / döntési út",
      desc: "Nem egyetlen válasz dönt: a teljes döntési út alapján áll össze a releváns ajánlás, következő lépés vagy csomag.",
      ideal: "Ideális: összetett választás, széles portfólió, konfigurálható ajánlatok.",
      intents: ["convert"],
    },
    {
      id: "educational",
      label: "Onboarding / edukációs flow",
      desc: "Nem PDF vagy hosszú magyarázat: bejárható tanulási út, ahol a döntési pontok mentén rögzül a lényeg és látszik, hol bizonytalan a felhasználó.",
      ideal: "Ideális: onboarding, tutorial, awareness, belső tréning, PR/CSR edukáció.",
      intents: ["engage"],
    },
    {
      id: "modular-minigames",
      label: "Moduláris mini-élmények",
      desc: "Egymásra épülő rövid, strukturált élmények azonos világgal — sorozatként futtatható, több epizóddal és visszatérő ritmussal.",
      ideal: "Ideális: loyalty, visszatérő aktivációk, gamified sorozatok, retention.",
      note: "Fejlesztés alatt",
    },
  ],
  en: [
    {
      id: "product-launch",
      label: "Product launch",
      desc: "Not a teaser or a banner — a guided decision path that sets context, builds first impression, and naturally moves the user forward.",
      ideal: "Ideal for: new product/service, relaunch, seasonal launch.",
      intents: ["convert"],
    },
    {
      id: "customer-survey",
      label: "Insight collection",
      desc: "Not a classic questionnaire: choices generate a personalized outcome while the journey and patterns stay interpretable.",
      ideal: "Ideal for: insight collection, segmentation, need discovery, qualification.",
      intents: ["engage", "convert"],
    },
    {
      id: "seasonal-campaign",
      label: "Seasonal activation",
      desc: "Fast to launch and effective in short windows — not a one-off creative, but a walkable interactive journey.",
      ideal: "Ideal for: seasonal activations, retail/FMCG, events or highlighted offers.",
      intents: ["engage"],
    },
    {
      id: "decision-path",
      label: "Recommender / decision path",
      desc: "Not a single answer decides it — the full decision path builds the relevant recommendation, next step, or package.",
      ideal: "Ideal for: complex choices, wide portfolios, configurable offerings.",
      intents: ["convert"],
    },
    {
      id: "educational",
      label: "Onboarding / learning flow",
      desc: "Not a PDF or long explanation — a walkable learning path where decision points make understanding visible.",
      ideal: "Ideal for: onboarding, tutorials, awareness, internal training, PR/CSR education.",
      intents: ["engage"],
    },
    {
      id: "modular-minigames",
      label: "Modular mini-experiences",
      desc: "Short structured experiences that build on each other — designed to run as a series with recurring rhythm.",
      ideal: "Ideal for: loyalty, recurring activations, gamified series, retention.",
      note: "In development",
    },
  ],
};

const FEATURED_DEFAULT_IDS = ["product-launch", "customer-survey", "decision-path"] as const;

const LandingPage: React.FC<LandingPageProps> = ({
  logoSrc,
  logoAlt = "Questell logo",
  onRequestQuoteClick,
}) => {
  /** ✅ HU/EN állapot + persist */
  const [lang, setLang] = useState<Lang>("hu");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
      if (saved === "hu" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  const setLangPersist = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {}
  };

  const toggleLang = () => setLangPersist(lang === "hu" ? "en" : "hu");

  /** ✅ nyelvfüggő tartalom */
  const HERO_PROBLEMS = HERO_PROBLEMS_BY_LANG[lang];
  const campaignTypes = CAMPAIGN_TYPES_BY_LANG[lang];

  const [isContactOpen, setIsContactOpen] = useState(false);
  const [intent, setIntent] = useState<Intent>(null);

  const platformRef = useRef<HTMLElement | null>(null);

  const handleRequestQuote = () => {
    onRequestQuoteClick?.();
    setIsContactOpen(true);
  };

  const handleIntentSelect = (next: Exclude<Intent, null>) => {
    setIntent((prev) => (prev === next ? null : next));
  };

  const meshColor =
    intent === "engage"
      ? "80,190,240"
      : intent === "convert"
      ? "175,135,95"
      : "255,255,255";

  const meshIntensity = intent === "engage" ? 1.15 : intent === "convert" ? 0.85 : 1;

  const meshFocus =
    intent === "convert"
      ? { x: 0.72, y: 0.42 }
      : intent === "engage"
      ? { x: 0.35, y: 0.22 }
      : { x: 0.5, y: 0.5 };

  const meshFocusStrength = intent === "convert" ? 0.85 : intent === "engage" ? 0.35 : 0.2;

  const principlesRef = useRef<HTMLDivElement | null>(null);
  const [principlesInView, setPrinciplesInView] = useState(false);

  useEffect(() => {
    const el = principlesRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPrinciplesInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // featured logika
  const isFeatured = (item: (typeof campaignTypes)[number]) => {
    if (intent) return item.intents?.includes(intent) ?? false;
    return FEATURED_DEFAULT_IDS.includes(item.id as any);
  };

  const featuredAll = campaignTypes.filter(isFeatured);
  const featured = intent !== null ? featuredAll.slice(0, 3) : featuredAll;

  const featuredIds = new Set(featured.map((x) => x.id));
  const moreItems = campaignTypes.filter((x) => !featuredIds.has(x.id));

  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasMoreOpenRef = useRef(false);
  const closingWithAnchorRef = useRef(false);

  const closeWithAnchor = () => {
    const el = moreButtonRef.current;
    if (!el) return;

    closingWithAnchorRef.current = true;

    const before = el.getBoundingClientRect().top;
    setMoreOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const after = el.getBoundingClientRect().top;
        const delta = after - before;
        window.scrollBy({ top: delta, left: 0, behavior: "auto" });
      });
    });
  };

  useLayoutEffect(() => {
    if (moreOpen) {
      wasMoreOpenRef.current = true;
      return;
    }
    if (!wasMoreOpenRef.current) return;
    if (closingWithAnchorRef.current) {
      closingWithAnchorRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        moreButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }, [moreOpen]);

  const [rotatorPaused, setRotatorPaused] = useState(false);
  const [heroProblemIndex, setHeroProblemIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(!!mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (reduceMotion || rotatorPaused) return;
    const t = window.setInterval(() => {
      setHeroProblemIndex((i) => (i + 1) % HERO_PROBLEMS.length);
    }, 3200);
    return () => window.clearInterval(t);
  }, [reduceMotion, rotatorPaused, HERO_PROBLEMS.length]);

  const [isTechOpen, setIsTechOpen] = useState(false);
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);

  const resolvedLogoSrc = logoSrc ?? DEFAULT_LOGO;

  // ⬇️ a toggleLang / setLangPersist / lang változó készen van
  // A gombot a JSX-ben (header/hero) fogjuk elhelyezni a következő szekcióban.

 /** ───────────── PLATFORM / CAMPAIGNS COPY ───────────── */
const platformCopy = {
  hu: {
    headerTitle: "MIT AD A QUESTELL?",
    leadStrong: "Nem egy quizet vagy sablonos minijátékot kapsz.",
    lead:
      "Egy bejárható döntési rendszert, amely végigvezeti a felhasználót a folyamaton, és közben értelmezhető, mérhető adatot ad.",
    moreFormats: (count: number) => `További formátumok (${count})`,
    moreAria: "További formátumok",
    closing:
      "Ez nem egy egyszer lefutó élmény.",
    closingAfter:
      "Egy újrahasználható, adaptálható döntési struktúra, amely különböző célokra és helyzetekre is alkalmazható.",
  },
  en: {
    headerTitle: "WHAT DOES QUESTELL DELIVER?",
    leadStrong: "Not a quiz. Not a template-based mini game.",
    lead:
      "A walkable decision system that guides users through a structured process while generating meaningful, measurable data.",
    moreFormats: (count: number) => `More formats (${count})`,
    moreAria: "More formats",
    closing:
      "This is not a one-off experience.",
    closingAfter:
      "It’s a reusable, adaptable decision structure that can serve different goals and contexts.",
  },
} as const;
const principlesCopy = {
  hu: {
    heroTitle: "Egyetlen motor, több döntési helyzetre",
    heroBody:
      "Ugyanaz a rendszer különböző döntési folyamatokat képes modellezni és mérhetővé tenni.\nA cél határozza meg a struktúrát, nem egy előre rögzített sablon.",
    bullets: [
      "Strukturált, bejárható flow",
      "Átlátható és mérhető döntési logika",
      "Rugalmasan formálható rendszer",
    ],
    p1Title: "Döntésekre épülő, mérhető struktúra",
    p1Body:
      "A válaszok nem csak rögzítésre kerülnek.\nMinden lépés állapotváltást eredményez, amely visszakövethető és elemezhető.",
    p2Title: "Eltérő útvonalak, eltérő mintázatok",
    p2Body:
      "A különböző döntési irányok más folyamatot és más végpontot eredményeznek.\nAz elágazások és útvonalak pontosan láthatók és összehasonlíthatók.",
    p3Title: "Integrált vizuális és AI-réteg",
    p3Body:
      "Az AI-alapú vizuálok a döntési logikához igazodva jelennek meg.\nA tartalom a folyamat része, nem attól független elem.",
    closing:
      "A rendszer nem csak levezeti a döntési folyamatot — hanem láthatóvá és elemezhetővé is teszi azt.",
  },
  en: {
    heroTitle: "One engine. Multiple decision contexts.",
    heroBody:
      "The same system can model and measure different decision processes.\nThe goal defines the structure — not a fixed template.",
    bullets: [
      "Structured, walkable flows",
      "Transparent and measurable logic",
      "Adaptable system design",
    ],
    p1Title: "Decision-driven, measurable structure",
    p1Body:
      "Responses are not only recorded.\nEach step produces a state transition that can be tracked and analyzed.",
    p2Title: "Different paths, observable patterns",
    p2Body:
      "Different decision directions produce different flows and endpoints.\nBranches and pathways remain visible and comparable.",
    p3Title: "Integrated visual and AI layer",
    p3Body:
      "AI-based visuals align with the decision logic.\nContent remains part of the process, not a separate layer.",
    closing:
      "The engine doesn’t just guide decisions — it makes the process visible and analyzable.",
  },
} as const;
/** ───────────── COLLAB COPY ───────────── */
const collabCopy = {
  hu: {
    title: "Hogyan működik az együttműködés?",
    lead:
      "Kiszámítható, lépésről lépésre épülő folyamat — gyors szállítással és alacsony ügyféloldali terheléssel.",
    body:
      "A folyamat átlátható, hatékony és minden döntési pontnál kézben tartható. A célok rögzítése után a kreatív és technológiai megvalósítás fókuszált, jól kontrollált keretben történik.",
    closing:
    "Az együttműködés lépésről lépésre épül, és egy működő, önállóan futtatható rendszert eredményez.",
  },
  en: {
    title: "How does the collaboration work?",
    lead:
      "A predictable, step-by-step process — fast delivery with minimal client-side load.",
    body:
      "The process is transparent, efficient, and controllable at every decision point. After defining goals, creative and technical execution happens in a focused, structured framework.",
    closing:
      "The collaboration builds step by step and results in a functioning, independently operable system.",
  },
} as const;

const pCopy = platformCopy[lang];
const prCopy = principlesCopy[lang];
const cCopy = collabCopy[lang];


   // ✅ copy ehhez a szekcióhoz (HU/EN)
 const copy = {
  hu: {
    intent: {
      aria: "Kampánycél kiválasztása",
      label: "Válaszd ki a projekted célját",
      engage: "Bevonzás",
      convert: "Konverzió",
      hintEngage: "Bevonzás → görgess tovább",
      hintConvert: "Konverzió → görgess tovább",
    },
    hero: {
      titleLine1: "Döntésvezérelt,",
      titleLine2: "interaktív élmény",
      subtitle:
        "Egy élő rendszer, ahol a felhasználói döntések alakítják a folyamatot és a kimenetet.",
      subtitles:
       "Használható onboardingra, termékajánlásra, edukációra vagy kampányélményre — a cél határozza meg a logikát és az eredményt.",
      rotatorLabel: "Tipikus probléma:",
      cta: "Kapcsolatfelvétel",
    },
    audienceStatement: {
      aria: "Kinek szól a Questell",
      textBeforeStrong:
        "A Questell döntési folyamatok modellezésére és mérésére készült.",
      strong: "Strukturált, irányított és visszakövethető rendszerként.",
    },
    langSwitch: {
      aria: "Nyelv váltása",
      hu: "HU",
      en: "EN",
    },

audience: {
  aria: "Kinek szól a Questell",
  title: "Kiknek ajánljuk?",
  leadClosed:
    "Azoknak, akik nem csak információt akarnak megmutatni, hanem döntési helyzetet akarnak teremteni.",
  leadOpen:
    "Akiknek fontos, hogy a felhasználó ne végigkattintson egy oldalon, hanem valódi választási pontokon haladjon át — és ez látható is legyen.",
  items: [
    {
      title:
        "Ha egy bevezetésnél nem a figyelem, hanem a döntés számít",
      body:
        "Amikor azt akarod, hogy a felhasználó kontextusban értse meg a terméket vagy szolgáltatást, és saját döntései mentén jusson el a következő lépéshez.",
    },
    {
      title:
        "Ha nem egy kérdőívet, hanem egy döntési folyamatot akarsz felépíteni",
      body:
        "Amikor a válaszok egymásra épülnek, és a cél nem egy lista, hanem egy irányított, következetes útvonal.",
    },
    {
      title:
        "Ha látni akarod, hogyan gondolkodik a felhasználó",
      body:
        "Amikor a sorrend, az elágazások és a bizonytalansági pontok is fontosak — nem csak az, hogy mi lett a végső választás.",
    },
    {
      title:
        "Ha interaktív rendszert akarsz, nem egyedi fejlesztési projektet",
      body:
        "Amikor szükséged van strukturált, stabil működésre, de nem akarsz minden alkalommal nulláról fejleszteni.",
    },
  ],
},

    tech: {
      title: "Technológia & Biztonság",
      lead: "Brand-biztos, átlátható és skálázható kampánytechnológia",
      items: [
        {
          title: "Brand-safe AI-vizuálok",
          p1:
            "A képgenerálás szerveroldali, kontrollált promptlogikából történik. A rendszer automatikusan tiltott motívumokat kizáró negatív blokkal dolgozik (logók, feliratok, watermarkok, érzékeny elemek nélkül), és minden vizuál kampányonként elkülönített tárhelyre kerül.",
          p2:
            "Így a márka biztonságos, egységes vizuális környezetben kap AI-képeket.",
        },
        {
          title: "Gyors cache-rendszer, stabil futás",
          p1:
            "A storyk, oldalak és generált assetek szerveroldali cache-ből érkeznek, ami gyors válaszidőt és stabil működést ad nagy terhelés mellett is.",
          p2:
            "Módosítás esetén dedikált cache-tisztító mechanizmus frissíti a tartalmat — teljes rendszerleállás nélkül.",
        },
        {
          title: "Kampányonként szeparált tartalom",
          p1:
            "Minden kampány saját story-fájlokkal és asset-könyvtárral fut. A backend path-ellenőrzést használ, így egy élmény nem férhet hozzá más kampány tartalmához.",
          p2:
            "Ez tiszta, rendezett és biztonságos környezetet ad minden márkának.",
        },
        {
          title: "Biztonságos API és HTTP-védelem",
          p1:
            "A rendszer alapértelmezett biztonsági headereket alkalmaz (X-Frame-Options, HSTS, Referrer-Policy, MIME-sniffing tiltása), a CORS pedig kizárólag a jóváhagyott domainekre van nyitva.",
          p2:
            "Így az élmény nem ágyazható be illetéktelen helyre, és külső oldalak nem férnek hozzá az API-hoz.",
        },
        {
          title: "Átlátható analitika, aláírt export",
          p1:
            "Az interakciók kampányonként, JSONL formátumban kerülnek mentésre. A riportok exportálása időkorlátos, HMAC-aláírt tokennel történik, így csak az fér hozzá, akinek a márka ezt jóváhagyja.",
          p2:
            "A kampányadatok biztonságosan és tisztán kezelhetők.",
        },
        {
          title: "Jogilag tiszta képi tartalom",
          p1: "A vizuálok minden esetben:",
          bullets: [
            "nem stock vagy jogvédett fotóból készülnek",
            "nem tartalmaznak valódi logókat vagy márkaneveket",
            "nem jelenítenek meg felismerhető, valós személyeket",
          ],
          p2: "→ A márka minimális vizuális-jogi kockázattal dolgozik.",
        },
      ],
      closing:
        "A platform kontrollált AI-vizuálokat, gyors cache-alapú működést, szeparált kampánykörnyezetet és biztonságos API-réteget biztosít — így a márka egy stabil, kiszámítható technológián futtathat minden élményt.",
    },

    finalCta: {
      title: "Indítsuk el a saját interaktív kampányodat.",
      body:
        "Legyen szó termékbevezetésről, insight gyűjtésről vagy storytelling élményről, a csapatunk néhány nap alatt elkészíti a testreszabott demót, a márkádhoz és a céljaidhoz igazítva.",
      strong: "A következő lépésben összeállítjuk, mire van szükséged.",
      button: "Ajánlatkérés",
    },
  },

  en: {
    intent: {
      aria: "Select campaign goal",
      label: "Choose your project goal",
      engage: "Engagement",
      convert: "Conversion",
      hintEngage: "Engagement → scroll down",
      hintConvert: "Conversion → scroll down",
    },
    hero: {
      titleLine1: "Decision-driven",
      titleLine2: "interactive experiences",
      subtitle:
        "A living system where user choices shape both the journey and the outcome.",
      subtitles:
       "Use it for onboarding, product recommendation, education, or campaign experiences — the goal defines the logic and measurable result.",
      rotatorLabel: "Common friction:",
      cta: "Get in touch",
    },
    audienceStatement: {
      aria: "Who Questell is for",
      textBeforeStrong:
        "Questell is built for custom campaigns where user decisions generate real, measurable data",
      strong: "without long development cycles or unpredictable costs.",
    },
    langSwitch: {
      aria: "Switch language",
      hu: "HU",
      en: "EN",
    },

    audience: {
  aria: "Who Questell is for",
  title: "Who is it for?",
  leadClosed:
    "For those who don’t just want to present information, but want to create real decision situations.",
  leadOpen:
    "For teams who want users to move through meaningful choice points — and to see how those decisions unfold.",
  items: [
    {
      title:
        "If what matters is the decision process, not just the final click",
      body:
        "When you want users to understand a product or service through context and choice — and move forward based on their own decisions, not a linear path.",
    },
    {
      title:
        "If you need to turn complex logic into something walkable",
      body:
        "When a multi-layered product or service can’t be explained through static pages alone. The system structures complexity into a guided, understandable decision process.",
    },
    {
      title:
        "If you want to see how users think — not just what they choose",
      body:
        "When the order of decisions, the branches taken, and the hesitation points matter — not only the final outcome.",
    },
    {
      title:
        "If you need an interactive system without building everything from scratch",
      body:
        "When you want a structured, stable framework for interactivity — without turning every project into a full custom development effort.",
    },
  ],
},

    tech: {
      title: "Technology & Security",
      lead: "Brand-safe, transparent, and scalable campaign technology",
      items: [
        {
          title: "Brand-safe AI visuals",
          p1:
            "Image generation runs server-side with controlled prompt logic. The system uses a negative block to exclude restricted motifs (no logos, text, watermarks, or sensitive elements), and every visual is stored in a campaign-isolated location.",
          p2:
            "This ensures AI visuals arrive in a consistent, brand-safe environment.",
        },
        {
          title: "Fast caching, stable runtime",
          p1:
            "Stories, pages, and generated assets are served from server-side cache — enabling fast response times and stable performance under load.",
          p2:
            "When updates happen, a dedicated cache invalidation mechanism refreshes content without full downtime.",
        },
        {
          title: "Campaign-isolated content",
          p1:
            "Each campaign runs with its own story files and asset directory. The backend enforces path checks, so one experience cannot access another campaign’s content.",
          p2:
            "This creates a clean, organized, and secure environment for every brand.",
        },
        {
          title: "Secure API & HTTP protection",
          p1:
            "The system applies standard security headers (X-Frame-Options, HSTS, Referrer-Policy, disabling MIME sniffing), and CORS is restricted to approved domains only.",
          p2:
            "This prevents unauthorized embedding and blocks external sites from accessing the API.",
        },
        {
          title: "Transparent analytics, signed export",
          p1:
            "Interactions are stored per campaign in JSONL format. Report exports use time-limited, HMAC-signed tokens so only authorized parties can access them.",
          p2:
            "Campaign data stays clean and securely managed.",
        },
        {
          title: "Legally clean visual content",
          p1: "Visuals are always:",
          bullets: [
            "not generated from stock or copyrighted photos",
            "not containing real logos or brand names",
            "not depicting recognizable real people",
          ],
          p2: "→ Minimal visual-legal risk for the brand.",
        },
      ],
      closing:
        "The platform provides controlled AI visuals, fast cache-based runtime, isolated campaign environments, and a secure API layer — so every experience runs on stable, predictable technology.",
    },

    finalCta: {
      title: "Let’s launch your interactive campaign.",
      body:
        "Whether it’s a product launch, insight collection, or a storytelling experience, our team can build a tailored demo within days — aligned to your brand and your goals.",
      strong: "Next, we’ll map what you need.",
      button: "Request a quote",
    },
  },
} as const;

const t = copy[lang];




  return (
    <>
      <DynamicMeshBackground
        intensity={meshIntensity}
        color={meshColor}
        focus={meshFocus}
        focusStrength={meshFocusStrength}
        className={s.meshBackgroundCanvas}
      />

      <main className={s.page}>
        {/* HERO */}
        <section
          id="hero"
          className={s.heroSection}
          aria-labelledby="hero-title"
          data-intent={intent ?? "none"}
        >
          {/* Nyelvváltó: finom, lebegő gomb a hero jobb felső sarkában */}
          <button
            type="button"
            className={s.langToggle}
            onClick={toggleLang}
            aria-label={t.langSwitch.aria}
            data-lang={lang}
          >
            {lang === "hu" ? t.langSwitch.en : t.langSwitch.hu}
          </button>

          <div className={s.heroInner}>
            <div className={s.heroLogoSlot}>
              <img
                src={resolvedLogoSrc}
                alt={logoAlt ?? "Questell logo"}
                className={s.heroLogo}
              />

              <div className={s.intentBlock} aria-label={t.intent.aria}>
                <p className={s.intentLabel}>{t.intent.label}</p>

                <div className={s.intentCtas}>
                  <button
                    type="button"
                    className={s.secondaryCta}
                    onClick={() => handleIntentSelect("engage")}
                    data-cta="intent-engage"
                    aria-pressed={intent === "engage"}
                  >
                    {t.intent.engage}
                  </button>

                  <button
                    type="button"
                    className={s.secondaryCta}
                    onClick={() => handleIntentSelect("convert")}
                    data-cta="intent-convert"
                    aria-pressed={intent === "convert"}
                  >
                    {t.intent.convert}
                  </button>
                </div>

                <div
                  className={s.intentHint}
                  aria-live="polite"
                  data-visible={intent !== null}
                >
                  {intent === "engage" && t.intent.hintEngage}
                  {intent === "convert" && t.intent.hintConvert}
                </div>
              </div>
            </div>

            <div className={s.heroContent}>
              <h1 id="hero-title" className={s.heroTitle}>
                {t.hero.titleLine1}
                <br />
                <span className={s.heroTitleAccent}>{t.hero.titleLine2}</span>
              </h1>

              <p className={s.heroSubtitle}>{t.hero.subtitle}</p>

              <p className={s.heroSubtitles}>{t.hero.subtitles}</p>

              <div
                className={s.heroRotator}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                onMouseEnter={() => setRotatorPaused(true)}
                onMouseLeave={() => setRotatorPaused(false)}
                onFocusCapture={() => setRotatorPaused(true)}
                onBlurCapture={() => setRotatorPaused(false)}
              >
                <span className={s.heroRotatorLabel}>{t.hero.rotatorLabel}</span>{" "}
                <span key={heroProblemIndex} className={s.heroRotatorText}>
                  {HERO_PROBLEMS[heroProblemIndex]}
                </span>
              </div>

              <button
                type="button"
                className={s.primaryCta}
                onClick={handleRequestQuote}
                data-cta="contact"
              >
                {t.hero.cta}
              </button>
            </div>
          </div>
        </section>

        {/* ───────────── WHO IS IT FOR? – POSITIONING STATEMENT ───────────── */}
        <section
          id="audience-statement"
          className={s.audienceStatementSection}
          aria-label={t.audienceStatement.aria}
        >
          <div className={s.audienceStatementInner}>
            <p className={s.audienceStatementText}>
              {t.audienceStatement.textBeforeStrong}
              <br /> <strong>{t.audienceStatement.strong}</strong>
            </p>
          </div>
        </section>

{/* ───────────── MIT TUD A PLATFORM? ───────────── */}
<section
  id="platform-capabilities"
  ref={platformRef}
  className={s.platformSection}
  aria-labelledby="platform-title"
  data-intent={intent ?? "none"}
>
  <div className={s.platformInner}>
<div
  className={s.platformCutout}
  aria-hidden="true"
  style={
    {
      ["--cutoutPath" as any]:
        'path("M420 22 H995 Q1015 22 1015 42 V278 Q1015 298 995 298 H780 V220 H690 V160 H420 Z")',
    } as React.CSSProperties
  }
>
  <svg className={s.cutoutSvg} viewBox="0 0 1040 320" preserveAspectRatio="none">
    <defs>
      {/* ── PANEL SHAPE (SVG clip) ───────────────────────── */}
      <clipPath id="cutShape">
        <path d="M420 22 H995 Q1015 22 1015 42 V278 Q1015 298 995 298 H780 V220 H690 V160 H420 Z" />
      </clipPath>

      {/* finom felületi highlight a panelen belül */}
      <linearGradient id="cutGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      {/* ── TRACE GRADIENTEK ───────── */}
      <linearGradient id="traceGradOuter" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.28" />
        <stop offset="18%" stopColor="#7CFFB2" stopOpacity="0.32" />
        <stop offset="38%" stopColor="#00B3FF" stopOpacity="0.42" />
        <stop offset="58%" stopColor="#B46CFF" stopOpacity="0.34" />
        <stop offset="78%" stopColor="#FF4FD8" stopOpacity="0.26" />
        <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.22" />
      </linearGradient>

      <linearGradient id="traceGradMid" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.36" />
        <stop offset="16%" stopColor="#A7FF3A" stopOpacity="0.42" />
        <stop offset="34%" stopColor="#00B3FF" stopOpacity="0.62" />
        <stop offset="52%" stopColor="#FFFFFF" stopOpacity="0.22" />
        <stop offset="66%" stopColor="#B46CFF" stopOpacity="0.52" />
        <stop offset="84%" stopColor="#FF4FD8" stopOpacity="0.34" />
        <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.28" />
      </linearGradient>

      <linearGradient id="traceGradInner" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.48" />
        <stop offset="14%" stopColor="#7CFFB2" stopOpacity="0.52" />
        <stop offset="30%" stopColor="#00B3FF" stopOpacity="0.84" />
        <stop offset="46%" stopColor="#FFFFFF" stopOpacity="0.28" />
        <stop offset="60%" stopColor="#B46CFF" stopOpacity="0.78" />
        <stop offset="78%" stopColor="#FF4FD8" stopOpacity="0.52" />
        <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.42" />
      </linearGradient>

      {/* ─────────────────────────────
         EDGE FADES: BAL + FELSŐ + ALUL
         FONTOS: BLACK→WHITE (luminance), stopOpacity=1
         ───────────────────────────── */}

      {/* BAL: x=420-nál 0 (black) → befelé 1 (white) */}
      <linearGradient
        id="fadeLeftGrad"
        gradientUnits="userSpaceOnUse"
        x1="420"
        y1="0"
        x2="590"
        y2="0"
      >
        <stop offset="0%" stopColor="#000" stopOpacity="1" />
        <stop offset="20%" stopColor="#000" stopOpacity="1" />
        <stop offset="100%" stopColor="#fff" stopOpacity="1" />
      </linearGradient>

      <mask id="fadeLeftMask" maskUnits="userSpaceOnUse">
        {/* alap: minden látszik */}
        <rect x="0" y="0" width="1040" height="320" fill="#fff" />
        {/* bal sáv: felülírjuk luminance-szel (black→white) */}
        <rect x="420" y="0" width="170" height="320" fill="url(#fadeLeftGrad)" />
      </mask>

      {/* FELSŐ: y=22-nél 0 (black) → lefelé 1 (white) */}
      <linearGradient
        id="fadeTopGrad"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="22"
        x2="0"
        y2="120"
      >
        <stop offset="0%" stopColor="#000" stopOpacity="1" />
        <stop offset="100%" stopColor="#fff" stopOpacity="1" />
      </linearGradient>

      <mask id="fadeTopMask" maskUnits="userSpaceOnUse">
        <rect x="0" y="0" width="1040" height="320" fill="#fff" />
        <rect x="0" y="22" width="1040" height="98" fill="url(#fadeTopGrad)" />
      </mask>

      {/* ALUL: y=298-nál 0 (black) → felfelé 1 (white) */}
      <linearGradient
        id="fadeBottomGrad"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="298"
        x2="0"
        y2="210"
      >
        <stop offset="0%" stopColor="#000" stopOpacity="1" />
        <stop offset="40%" stopColor="#000" stopOpacity="1" />
        <stop offset="100%" stopColor="#fff" stopOpacity="1" />
      </linearGradient>

      <mask id="fadeBottomMask" maskUnits="userSpaceOnUse">
        <rect x="0" y="0" width="1040" height="320" fill="#fff" />
        <rect x="0" y="210" width="1040" height="110" fill="url(#fadeBottomGrad)" />
      </mask>
    </defs>

    {/* ✅ CLIP + (BAL→TOP→BOTTOM) MASZKOLÁS: a panel + trace + node EGYBEN */}
    <g clipPath="url(#cutShape)">
      <g mask="url(#fadeLeftMask)">
        <g mask="url(#fadeTopMask)">
          <g mask="url(#fadeBottomMask)">
            {/* ✅ PANEL FILL (EZ TŰNIK EL A SZÉLEKEN) */}
            <rect x="0" y="0" width="1040" height="320" fill="rgba(255,255,255,0.06)" />
            <rect x="0" y="0" width="1040" height="320" fill="url(#cutGrad)" />

            {/* ✅ KIVITT TRACE + NODE RÉSZ (flowMode / auto gating) */}
            <PlatformCutout flowMode="auto" rootMargin="700px 0px" />
          </g>
        </g>
      </g>
    </g>

    {/* kontúr */}
    <path
      className={s.cutOutline}
      d="M420 22 H995 Q1015 22 1015 42 V278 Q1015 298 995 298 H780 V220 H690 V160 H420 Z"
    />
  </svg>
</div>



    <header className={s.platformHeader}>
  <h2 id="platform-title" className={s.platformTitle}>
    {pCopy.headerTitle}
  </h2>

  <p className={s.platformLead}>
    <strong>{pCopy.leadStrong}</strong>
  </p>

  <p className={s.platformLeadek}>
    {pCopy.lead}
  </p>

  <p className={s.platformLeader}></p>
</header>

<div className={s.campaignGridFeatured}>
  {featured.map((item) => {
    const isEmphasized =
      intent !== null && (item.intents?.includes(intent) ?? false);
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
          intent === null
            ? "neutral"
            : isEmphasized
            ? "emphasized"
            : "deemphasized"
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

{moreItems.length > 0 && (
  <div
    className={s.campaignMore}
    data-open={moreOpen ? "true" : "false"}
    data-intent={intent ?? "none"}
  >
    <button
      ref={moreButtonRef}
      type="button"
      className={s.campaignMoreSummary}
      onClick={() => {
        if (moreOpen) closeWithAnchor();
        else setMoreOpen(true);
      }}
      aria-expanded={moreOpen}
      aria-controls="campaign-more-panel"
    >
      <span className={s.campaignMoreLabel}>
        {pCopy.moreFormats(moreItems.length)}
      </span>
    </button>

    <div
      id="campaign-more-panel"
      className={s.campaignMoreReveal}
      role="region"
      aria-label={pCopy.moreAria}
    >
      <div className={s.campaignGridMore}>
        {moreItems.map((item) => (
          <article key={item.id} className={s.campaignCard} aria-label={item.label}>
            <h3 className={s.campaignTitle}>{item.label}</h3>
            <p className={s.campaignDesc}>{item.desc}</p>
            {item.note && <p className={s.campaignNote}>{item.note}</p>}
            <p className={s.campaignIdeal}>{item.ideal}</p>
          </article>
        ))}
      </div>
    </div>
  </div>
)}

<p className={s.platformClosing}>
  {pCopy.closing} <br />
  {pCopy.closingAfter}
</p>
  </div>
</section>

<ExamplesSection
  defaultLogoSrc={DEFAULT_LOGO}
  lazyMount={true}
  lang={lang}
/>

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
    <header className={s.whyHeader}></header>

    <div className={s.whyGrid}>
      <div className={`${s.whyItem} ${s.whyHero}`}>
        <div className={s.whyCard}>
          <h3 className={s.whyItemTitle}>{prCopy.heroTitle}</h3>

          <p className={s.whyBody}>
            {prCopy.heroBody.split("\n").map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </p>

          <ul className={s.whyBullets}>
            {prCopy.bullets.map((b, i) => (
              <li key={i} className={s.whyBullet}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={s.whyItem}>
        <div className={s.whyCard}>
          <h3 className={s.whyItemTitle}>{prCopy.p1Title}</h3>
          <p className={s.whyBody}>{prCopy.p1Body}</p>
        </div>
      </div>

      <div className={s.whyItem}>
        <div className={s.whyCard}>
          <h3 className={s.whyItemTitle}>{prCopy.p2Title}</h3>
          <p className={s.whyBody}>{prCopy.p2Body}</p>
        </div>
      </div>

      <div className={s.whyItem}>
        <div className={s.whyCard}>
          <h3 className={s.whyItemTitle}>{prCopy.p3Title}</h3>
          <p className={s.whyBody}>{prCopy.p3Body}</p>
        </div>
      </div>
    </div>

    <div className={s.whyClosing}>
      {prCopy.closing}
    </div>
  </div>
</section>

<section
  id="collaboration"
  className={s.collabSection}
  aria-labelledby="collab-title"
>
  <div className={s.collabInner}>
    <header className={s.collabHeader}>
      <div className={s.collabCutout} aria-hidden="true">
        <div className={s.collabGlassEdgeTop} />
        <div className={s.collabGlassEdgeBottom} />
        <div className={s.collabGlassEdgeRight} />
      </div>

      <h2 id="collab-title" className={s.collabTitle}>
        {cCopy.title}
      </h2>

      <p className={s.collabLead}>
        {cCopy.lead}
      </p>
    </header>

    <p className={s.collabLead}>
      {cCopy.body}
    </p>

    <CollabDiagram lang={lang} />

    <div className={s.collabClosing}>
      {cCopy.closing}
    </div>
  </div>
</section>
{/* ───────────── AUDIENCE ───────────── */}
<section
  id="audience"
  className={s.audienceSection}
  aria-labelledby="audience-title"
>
  <div className={s.audienceInner}>
    <header
      className={s.audienceHeader}
      role="button"
      tabIndex={0}
      aria-expanded={isAudienceOpen}
      onClick={() => setIsAudienceOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsAudienceOpen((v) => !v);
        }
      }}
    >
      <h2 id="audience-title" className={s.audienceTitle}>
        {t.audience.title}
      </h2>

      <p className={s.audienceLead}>
        {t.audience.leadClosed}
      </p>

      <span className={s.audienceToggle} aria-hidden="true" />
    </header>

    <div className={`${s.audienceContent} ${isAudienceOpen ? s.isOpen : ""}`}>
      <p className={s.audienceLead}>
        {t.audience.leadOpen}
      </p>

      <div className={s.audienceList}>
        {t.audience.items.map((it, idx) => (
          <div key={idx} className={s.audienceItem}>
            <h3 className={s.audienceItemTitle}>{it.title}</h3>
            <p>{it.body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
</section>

{/* ───────────── TECH & SECURITY ───────────── */}
<section
  id="tech-security"
  className={s.techSection}
  aria-labelledby="tech-title"
>
  <div className={s.techInner}>
    <header
      className={s.techHeader}
      role="button"
      tabIndex={0}
      aria-expanded={isTechOpen}
      onClick={() => setIsTechOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsTechOpen((v) => !v);
        }
      }}
    >
      <h2 id="tech-title" className={s.techTitle}>
        {t.tech.title}
      </h2>
      <p className={s.techLead}>
        {t.tech.lead}
      </p>

      <span className={s.techToggle} aria-hidden="true" />
    </header>

    <div className={`${s.techContent} ${isTechOpen ? s.isOpen : ""}`}>
      <div className={s.techList}>
        {/* 1 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[0].title}</h3>
          <p>{t.tech.items[0].p1}</p>
          <p>{t.tech.items[0].p2}</p>
        </div>

        {/* 2 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[1].title}</h3>
          <p>{t.tech.items[1].p1}</p>
          <p>{t.tech.items[1].p2}</p>
        </div>

        {/* 3 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[2].title}</h3>
          <p>{t.tech.items[2].p1}</p>
          <p>{t.tech.items[2].p2}</p>
        </div>

        {/* 4 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[3].title}</h3>
          <p>{t.tech.items[3].p1}</p>
          <p>{t.tech.items[3].p2}</p>
        </div>

        {/* 5 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[4].title}</h3>
          <p>{t.tech.items[4].p1}</p>
          <p>{t.tech.items[4].p2}</p>
        </div>

        {/* 6 */}
        <div className={s.techItem}>
          <h3 className={s.techItemTitle}>{t.tech.items[5].title}</h3>
          <p>{t.tech.items[5].p1}</p>
          <ul className={s.techBullets}>
            {t.tech.items[5].bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p>{t.tech.items[5].p2}</p>
        </div>
      </div>

      <p className={s.techClosing}>
        {t.tech.closing}
      </p>
    </div>
  </div>
</section>

{/* ───────────── FINAL CTA ───────────── */}
<section
  id="final-cta"
  className={s.finalCtaSection}
  aria-labelledby="final-cta-title"
>
  <div className={s.finalCtaInner}>
    <h2 id="final-cta-title" className={s.finalCtaTitle}>
      {t.finalCta.title}
    </h2>

    <p className={s.finalCtaText}>
      {t.finalCta.body}
      <br />
      <strong>{t.finalCta.strong}</strong>
    </p>

    <div className={s.finalCtaButtons}>
      <button
        type="button"
        className={s.finalQuoteCta}
        data-cta="request-quote-final"
        onClick={handleRequestQuote}
      >
        {t.finalCta.button}
      </button>
    </div>
  </div>
</section>

<ContactModal
  open={isContactOpen}
  onClose={() => setIsContactOpen(false)}
  lang={lang}
/>


    </main>
    </>
  );
};

export default LandingPage;


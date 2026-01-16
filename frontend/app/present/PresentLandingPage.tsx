
"use client";

import React, { useLayoutEffect, useState, useRef, useEffect } from "react";

import s from "./LandingPage.module.scss";
import { ContactModal } from "./components/ContactModal";
import { CollabDiagram } from "./components/CollabDiagram";
import { DynamicMeshBackground } from "./components/DynamicMeshBackground";
import { useRouter } from "next/navigation";

type LandingPageProps = {
  logoSrc?: string;
  logoAlt?: string;
  onRequestQuoteClick?: () => void;
  onViewDemosClick?: () => void;
};

// 🔹 intent state: hero-ból vezérelt vizuális fókusz a "Mit tud a platform?" kártyákon
type Intent = "convert" | "engage" | null;

const DEFAULT_LOGO = "/assets/my_logo.png";

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
  desc: "Nem teaser vagy banner, irányított élmény, amely érzelmi első benyomást épít, és természetesen vezeti a felhasználót a termék felé.",
  ideal: "Ideális: új SKU, szezonális vagy limitált termék, relaunch.",
  intents: ["convert"],
},
{
  id: "customer-survey",
  label: "Vásárlói felmérés",
  desc: "Nem klasszikus kérdőív: a felhasználó döntéseiből személyre szabott kimenet születik, miközben a márka viselkedési insightot kap.",
  ideal: "Ideális: insight-gyűjtés, célcsoport-feltérképezés.",
  intents: ["engage", "convert"],
},
{
  id: "seasonal-campaign",
  label: "Szezonális kampány",
  desc: "Nem egyszeri kreatív, hanem gyorsan indítható, vizuálisan erős élmény, amely rövid kampányablakban is magas bevonódást hoz.",
  ideal: "Ideális: FMCG, retail, beauty, időszakos aktivációk.",
  intents: ["engage"],
},
{
  id: "decision-path",
  label: "Termékajánló",
  desc: "Nem egyetlen válasz dönt: a teljes döntési út számít, és ebből áll össze a valóban releváns ajánlás.",
  ideal: "Ideális: összetett választás, széles portfólió, szakértői ajánlás.",
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
  label: "Moduláris minijátékok",
  desc: "Egymásra épülő rövid élmények azonos vizuális világgal, amelyek hosszabb távon is fenntartják az aktivitást.",
  ideal: "Ideális: loyalty aktivációk, napi mini-élmények, gamified kampánysorozatok.",
  note: "Fejlesztés alatt",
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
  const router = useRouter();
  function startExample(item: ExampleItem) {
  const src = `/stories/${item.jsonFile}`;
  const start = item.startPageId || "ch1_pg1"; // backend default is gyakran ez
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

}
  const meshColor =
  intent === "engage"
    ? "90,180,220"     // cyan / engage
    : intent === "convert"
    ? "200,150,80"     // amber / convert
    : "255,255,255";  // default

const meshIntensity =
  intent === "engage"
    ? 1.15
    : intent === "convert"
    ? 0.85
    : 1;

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


  // 🔹 featured logika: intent -> matching top 3, egyébként default top 3 id alapján
const FEATURED_DEFAULT_IDS = ["product-launch", "customer-survey", "decision-path"];

const isFeatured = (item: (typeof campaignTypes)[number]) => {
  if (intent) return item.intents?.includes(intent) ?? false;
  return FEATURED_DEFAULT_IDS.includes(item.id);
};

// intent esetén limitáljuk 3-ra, hogy tényleg “felső sor” maradjon
const featuredAll = campaignTypes.filter(isFeatured);
const featured =
  intent !== null ? featuredAll.slice(0, 3) : featuredAll;

// a “more” lista: minden, ami nincs a featured-ben
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

  // ✅ 2 raf: biztos layout után mérünk
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

  // ha még sosem volt nyitva, ne csináljunk semmit
  if (!wasMoreOpenRef.current) return;

  // ✅ ha anchor-close volt, NE legyen extra scroll
  if (closingWithAnchorRef.current) {
    closingWithAnchorRef.current = false;
    return;
  }

  // (opcionális) ha mégis kell “vissza a gombra” smooth záráskor:
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      moreButtonRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  });
}, [moreOpen]);


type FlipState = {
  phase: "idle" | "measureLast" | "animating";
  firstRect: DOMRect | null;
  lastRect: DOMRect | null;
  fixed: { left: number; top: number; width: number; height: number } | null;
  invert: { dx: number; dy: number; sx: number; sy: number } | null;
};

const heroTitleRef = React.useRef<HTMLHeadingElement | null>(null);
const contentTitleRef = React.useRef<HTMLHeadingElement | null>(null);

const [flip, setFlip] = React.useState<FlipState>({
  phase: "idle",
  firstRect: null,
  lastRect: null,
  fixed: null,
  invert: null,
});

const [showContentTitle, setShowContentTitle] = React.useState(true); 


// ───────────── Example Campaigns – types + data + state ─────────────

type ExampleDetailBlock =
  | {
      type: "intro";
      text: string;
    }
  | {
      type: "howItWorks" | "whyInCampaign" | "output";
      title: string;
      bullets: string[];
    }
  | {
      type: "bridge";
      text: string;
    };

type ExampleItem = {
  id: string;
  navLabel: string;
  jsonFile: string;

  title: string;
  heroLine: string;

  details: {
    blocks: ExampleDetailBlock[];
  };

  revealLabel: string;
  startLabel: string;
  startPageId?: string;
  skinId?: string;
  runes?: string; // pl. "ring,arc,dot"
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

  startPageId: "Q1", // ✅ meta.startPageId
  skinId: "contract_coffee_dark_roast", // ✅ fájlnév alapján

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
}

,

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
}
,

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
}
,

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
}
,

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
  startPageId: "Q1",                         // ✅ uj.json meta.startPageId
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
}
,
];

// ⬇️ Component-en belül
const [activeId, setActiveId] = React.useState<string | null>(null);
const [isExpanded, setIsExpanded] = React.useState(false);
const [isExiting, setIsExiting] = React.useState(false);
const [isEntering, setIsEntering] = React.useState(false);

const active = EXAMPLES.find((x) => x.id === activeId);

const playedPreviewRef = useRef<Set<string>>(new Set());
const [previewNonce, setPreviewNonce] = useState(0);

const [rotatorPaused, setRotatorPaused] = useState(false);


// ✅ HERO – rotáló "engine problem" mondatok
const HERO_PROBLEMS = [
  "Hetek mennek el, mieltt kiderül, működik-e.",

  "A forgalom jön, de nem derül ki, merre lépj tovább.",

  "Nem látod, kinek mi működik valójában.",

  "Nem kapsz egyértelmű jelzést, mit kellene változtatni.",

  "Nem derül ki, mi hozott valódi megtérülést.",

  "A kampány megy, de a döntési felelősség végig rajtad marad.",
] as const;

const [heroProblemIndex, setHeroProblemIndex] = useState(0);

// (opcionális, de erős) prefer-reduced-motion tisztelet
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
}, [reduceMotion, rotatorPaused]);


const [isTechOpen, setIsTechOpen] = useState(false);
const [isAudienceOpen, setIsAudienceOpen] = useState(false);


const TRACE_W = {
  "trace-1": 1.6,  // outer
  "trace-2": 1.6,  // outer
  "trace-3": 2.1,  // mid
  "trace-4": 2.6,  // mid (ez lehet a legerősebb mid)
  "trace-5": 3.1,  // inner (fő)
  "trace-6": 2.8,  // inner
  "trace-7": 2.9,  // inner
  "trace-8": 2.0,  // mid
} as const;

type TraceId = keyof typeof TRACE_W;

const traceStyle = (id: keyof typeof TRACE_W) => ({ strokeWidth: TRACE_W[id] });

const TRACE_GRAD = {
  outer: "url(#traceGradOuter)",
  mid: "url(#traceGradMid)",
  inner: "url(#traceGradInner)",
} as const;

const preview = (text: string, n = 30) =>
  text.length > n ? text.slice(0, n).trimEnd() + "…" : text;

  return (
    <>
      <DynamicMeshBackground intensity={4} color="255,255,255" />

      <main className={s.page}>
       {/* ───────────── HERO SZEKCIÓ ───────────── */}
<section
  id="hero"
  className={s.heroSection}
  aria-labelledby="hero-title"
  data-intent={intent ?? "none"}
>
  <div className={s.heroInner}>
    <div className={s.heroLogoSlot}>
      {logoSrc ? (
        <img src={DEFAULT_LOGO} alt="Questell" className={s.heroLogo} />
      ) : (
        <div className={s.heroLogoPlaceholder} />
      )}
      {/* ✅ Secondary blokk */}
      <div className={s.intentBlock} aria-label="Kampánycél kiválasztása">
        <p className={s.intentLabel}>Válaszd ki a projekted célját</p>

        <div className={s.intentCtas}>
          <button
            type="button"
            className={s.secondaryCta}
            onClick={() => handleIntentSelect("engage")}
            data-cta="intent-engage"
            aria-pressed={intent === "engage"}
          >
            Bevonzás
          </button>

          <button
            type="button"
            className={s.secondaryCta}
            onClick={() => handleIntentSelect("convert")}
            data-cta="intent-convert"
            aria-pressed={intent === "convert"}
          >
            Konverzió
          </button>
        </div>

        {/* 🔁 Élő visszajelzés a gombok alatt */}
        <div
          className={s.intentHint}
          aria-live="polite"
          data-visible={intent !== null}
        >
          {intent === "engage" && "Bevonzás → görgess tovább"}
          {intent === "convert" && "Konverzió → görgess tovább"}
        </div>
      </div>

    </div>

    <div className={s.heroContent}>
      <h1 id="hero-title" className={s.heroTitle}>
        Döntésvezérelt, interaktív élmény
      </h1>

      <p className={s.heroSubtitle}>
        Egy élő rendszer, ahol a felhasználói döntések alakítják a folyamatot és a kimenetet.
      </p>

      <p className={s.heroSubtitles}>
        Ugyanaz a rendszer használható brand-élményre, insight-gyűjtésre vagy konverzióra — a cél
        határozza meg a logikát és az eredményt.
      </p>

      {/* 🔁 Rotáló "megoldható problémák" sor (hero panelen belül) */}
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
  <span className={s.heroRotatorLabel}>Tipikus probléma:</span>{" "}
  <span key={heroProblemIndex} className={s.heroRotatorText}>{HERO_PROBLEMS[heroProblemIndex]}</span>
</div>


      
      {/* ✅ Primary CTA */}
      <button
        type="button"
        className={s.primaryCta}
        onClick={handleRequestQuote}
        data-cta="contact"
      >
        Kapcsolatfelvétel
      </button>
    </div>
  </div>
</section>


   {/* ───────────── KINEK SZÓL? – POZICIONÁLÓ ÁLLÍTÁS ───────────── */}
<section
  id="audience-statement"
  className={s.audienceStatementSection}
  aria-label="Kinek szól a Questell"
>
  <div className={s.audienceStatementInner}>
    <p className={s.audienceStatementText}>
      A Questell egyedi kampányokhoz készült, ahol a felhasználói döntések valódi, mérhető adatot adnak <br /> <strong>Hosszú fejlesztés és kiszámíthatatlan költségek nélkül.</strong>
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

            {/* ── TRACE RENDSZER ── */}
            <g className={s.chipTraces}>
              <path id="trace-1" data-rank="outer" className={s.trace} fill="none" stroke="url(#traceGradOuter)" style={traceStyle("trace-1")} d="M424 36 H1010 V292" />
              <path data-rank="outer" className={s.traceGlow} fill="none" d="M424 36 H1010 V292" />

              <path id="trace-2" data-rank="outer" className={s.trace} fill="none" stroke="url(#traceGradOuter)" style={traceStyle("trace-2")} d="M424 56 H992 V292" />
              <path data-rank="outer" className={s.traceGlow} fill="none" d="M424 56 H992 V292" />

              <path id="trace-3" data-rank="mid" className={s.trace} fill="none" stroke="url(#traceGradMid)" style={traceStyle("trace-3")} d="M424 78 H972 V290" />
              <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 78 H972 V290" />

              <path id="trace-4" data-rank="mid" className={s.trace} fill="none" stroke="url(#traceGradMid)" style={traceStyle("trace-4")} d="M424 102 H948 V282" />
              <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 102 H948 V282" />

              <path id="trace-5" data-rank="inner" className={s.trace} fill="none" stroke="url(#traceGradInner)" style={traceStyle("trace-5")} d="M424 102 H910 V146 H935 V290" />
              <path data-rank="inner" className={s.traceGlow} fill="none" d="M424 102 H910 V146 H935 V290" />

              <path id="trace-6" data-rank="inner" className={s.trace} fill="none" stroke="url(#traceGradInner)" style={traceStyle("trace-6")} d="M424 120 H760 V166 H880 V290" />
              <path data-rank="inner" className={s.traceGlow} fill="none" d="M424 120 H760 V166 H880 V290" />

              <path id="trace-7" data-rank="inner" className={s.trace} fill="none" stroke="url(#traceGradInner)" style={traceStyle("trace-7")} d="M424 135 H900 V166 H910 V290" />
              <path data-rank="inner" className={s.traceGlow} fill="none" d="M424 135 H900 V166 H910 V290" />

              <path id="trace-8" data-rank="mid" className={s.trace} fill="none" stroke="url(#traceGradMid)" style={traceStyle("trace-8")} d="M424 150 H705 V198 H820 V292" />
              <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 150 H705 V198 H820 V292" />
            </g>

            
              
            
<g className={s.flowNodes}>
        {/* trace-1 (1 pont, gyorsabb) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="18s"
            begin="10.2s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="18s"
            begin="10.2s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-1" />
          </animateMotion>
        </circle>

        {/* trace-2 (2 pont, gyorsabb) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="19.5s"
            begin="0.8s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="19.5s"
            begin="0.8s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-2" />
          </animateMotion>
        </circle>

        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="19.5s"
            begin="11.4s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="19.5s"
            begin="11.4s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-2" />
          </animateMotion>
        </circle>

        {/* trace-3 (1 pont, közepes) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="23s"
            begin="6.4s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="23s"
            begin="6.4s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-3" />
          </animateMotion>
        </circle>

        {/* trace-4 (2 pont, közepes) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="24.5s"
            begin="8.1s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="24.5s"
            begin="8.1s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-4" />
          </animateMotion>
        </circle>

        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="24.5s"
            begin="15.3s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="24.5s"
            begin="15.3s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-4" />
          </animateMotion>
        </circle>

        {/* trace-5 (1 pont, inner lassabb) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="28s"
            begin="3.6s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="28s"
            begin="3.6s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-5" />
          </animateMotion>
        </circle>

        {/* trace-6 (2 pont, inner lassabb) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="29.5s"
            begin="1.4s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="29.5s"
            begin="1.4s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-6" />
          </animateMotion>
        </circle>

        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="29.5s"
            begin="24.2s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="29.5s"
            begin="24.2s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-6" />
          </animateMotion>
        </circle>

        {/* trace-7 (1 pont, inner lassabb) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="18.5s"
            begin="0.9s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="18.5s"
            begin="0.9s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-7" />
          </animateMotion>
        </circle>

        {/* trace-8 (1 pont, közepes) */}
        <circle className={s.node} r="4" opacity="0">
          <animate
            attributeName="opacity"
            dur="24s"
            begin="1.8s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.08;0.88;1"
          />
          <animateMotion
            dur="24s"
            begin="1.8s"
            repeatCount="indefinite"
            keyTimes="0;1"
            keySplines="0.2 0 0.2 1"
            calcMode="spline"
          >
            <mpath href="#trace-8" />
          </animateMotion>
        </circle>
      </g>
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
        MIT AD A QUESTELL?
      </h2>

      <p className={s.platformLead}><strong>Nem egy quizet vagy sablonos minijátékot kapsz.</strong></p>

      <p className={s.platformLeadek}>
        Egy végigjátszható kampányélményt, amely figyelmet tart, döntések mentén vezeti a
        felhasználót, és közben értelmezhető adatot kapsz.
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
        További kampányformátumok ({moreItems.length})
      </span>
    </button>

    <div
      id="campaign-more-panel"
      className={s.campaignMoreReveal}
      role="region"
      aria-label="További kampányformátumok"
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
      <strong>Ez nem egy egyszer lefutó kampány.</strong> <br /> Egy adaptálható formátum, amely új célokra, időszakokra és célcsoportokra is továbbépíthető
    </p>
  </div>
</section>
        
      
     {/* ───────────── PÉLDA KAMPÁNYOK – INTERAKTÍV VÁLASZTÓ ───────────── */}
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

    {/* Szekció nyitó mondatok */}
    <div className={s.examplesIntrok}>
      <p className={s.examplesIntroLead}>
        Az alábbi kampányformátumok kipróbálható példák arra, hogyan épülnek fel a
        Questell interaktív élményei.
      </p>
      <p className={s.examplesIntroLead}>
        <strong>Minden elem igény szerint továbbalakítható, bővíthető vagy teljesen
        újraértelmezhető</strong>
      </p>
    </div>

    <div className={s.examplesChooser}>
      
      <div
        className={s.examplesPanel}
        role="region"
        aria-label="Példa kampányok választó"
      >
        {/* Bal oszlop */}
        <aside className={s.examplesNav} aria-label="Kampányok listája">
          <ul className={s.examplesNavList}>
            {EXAMPLES.map((item) => {
              const isActive = item.id === activeId;
              return (
                <li key={item.id} className={s.examplesNavItem}>
                  <button
                    type="button"
                    className={`${s.examplesNavButton} ${
                      isActive ? s.isActive : ""
                    }`}
                    onClick={() => {
                      setActiveId(item.id);

                      // reset
                      setIsExpanded(false);
                      setIsExiting(false);
                      setIsEntering(false);
                      if (!playedPreviewRef.current.has(item.id)) {
    playedPreviewRef.current.add(item.id);
                      setPreviewNonce((n) => n + 1);}
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
          className={[s.examplesDetail, isEntering ? s.isEntering : ""]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
          onAnimationEnd={(e) => {
            // csak a WRAP enter anim végén kapcsold ki, különben a gyerek fade-ek is triggerelhetik
            if ((e as any).animationName === "detailEnterWrap") {
              setIsEntering(false);
            }
          }}
        >
          {/* EMPTY STATE */}
          {!active && (
            <div className={s.examplesEmptyPanel}>
            <div className={s.examplesEmpty}>
              <div className={s.examplesEmptyLogo}>
                <img
                  src={DEFAULT_LOGO}
                  alt="Questell"
                  className={s.examplesLogo}
                />
              </div>
              
            </div>
            <p className={s.examplesEmptyText}>
                Válassz egy példa kampányt a bal oldalon.
              </p>
            </div>
          )}

          {/* ACTIVE STATE */}
          {active && (
            <div
              className={`${s.examplesDetailInner} 
      ${isExpanded ? s.isExpanded : ""}
      ${isExiting ? s.isExiting : ""}
      `}
            >
              {/* HERO / PREVIEW */}
              {/* HERO / PREVIEW (SCSS-hez igazítva) */}

              <div className={s.examplesHero} key={`${activeId}-${previewNonce}`}>
                <div className={s.examplesHeroTop}>
                  <div className={s.examplesPreviewStack}>
                    <h3 className={s.examplesHeroTitle}>{active.title}</h3>
                    <p className={s.examplesHeroLine}>{active.heroLine}</p>

                    {/* gombok: egymás alatt, demo felül, mindkettő a jobb félben indul */}
                    <div className={s.examplesPreviewActions}>
                      <button
  type="button"
  className={s.examplesPreviewStartButton}
  onClick={() => active && startExample(active)}
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

                              // ✅ biztos anim restart: előbb le, következő frame-ben fel
                              setIsEntering(true);
                              requestAnimationFrame(() => {
                                setIsEntering(true);
                              });
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

              {/* REVEAL */}
              {isExpanded && (
                <>
                  {/* MEDIA */}
                  <div className={s.examplesMedia}>
                    <div
                      className={s.examplesMediaPlaceholder}
                      aria-hidden="true"
                    />
                  </div>

                  {/* CONTENT */}
                  <div className={s.examplesContent}>
                    {/* 🔴 EZ HIÁNYZOTT: TITLE A LENYITOTT ÁLLAPOTBAN */}
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
                              <h4 className={s.examplesBlockTitle}>
                                {block.title}
                              </h4>
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

                    {/* START */}
                    <div className={s.examplesActions}>
                      <button
  type="button"
  className={s.examplesStartButton}
  onClick={() => active && startExample(active)}
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
    <div className={s.examplesClosing}>
  A Questell pilot <strong>rövid ciklusban készül</strong>: gyorsan kipróbálható,
  és <strong>azonnal</strong> éles helyzetben <strong>működik</strong>.
</div>
  </div>
</section>



{/* ───────────── ALAPELVEK ───────────── */}
{/* sentinel – EZT figyeli az IntersectionObserver */}
{/* anchor / inview trigger */}
<div
  ref={principlesRef}
  aria-hidden="true"
  style={{ height: "1px" }}
/>

{/* helper – tedd a komponensben a return fölé (vagy ide, ha nálatok így oké) */}
{/*

*/}
<section
  id="principles"
  className={s.whySection}
  data-inview={principlesInView ? "true" : "false"}
  aria-labelledby="principles-title"
>
  <div className={s.whyInner}>
    <header className={s.whyHeader}>{/* üresen hagyva */}</header>

    {/* ✅ ÚJ: 1 nagy "hero" + 3 pillér */}
    <div className={s.whyGrid}>
  {/* HERO */}
  <div className={`${s.whyItem} ${s.whyHero}`}>
    <div className={s.whyCard}>
      <h3 className={s.whyItemTitle}>Egyetlen motor, több kampánycélhoz</h3>

      <p className={s.whyBody}>
        Ugyanaz a rendszer használható brand-élményre, insight-gyűjtésre vagy konverzióra.
        <br />
        A cél határozza meg a logikát – nem egy előre rögzített sablon.
      </p>

      <ul className={s.whyBullets}>
        <li className={s.whyBullet}>Gyors pilot, skálázható kampány</li>
        <li className={s.whyBullet}>Célhoz hangolt flow és hangnem</li>
        <li className={s.whyBullet}>Ugyanazon platform, több use-case</li>
      </ul>
    </div>
  </div>

  {/* 3 PILLÉR */}
  <div className={s.whyItem}>
    <div className={s.whyCard}>
      <h3 className={s.whyItemTitle}>Döntésekre épülő kampánylogika</h3>
      <p className={s.whyBody}>
        A felhasználói válaszok nem a flow végén jelennek meg, hanem aktív építőelemei az élménynek.
        <br />
        Minden döntés alakítja a következő lépést.
      </p>
    </div>
  </div>

  <div className={s.whyItem}>
    <div className={s.whyCard}>
      <h3 className={s.whyItemTitle}>Valódi személyre szabott kimenetek</h3>
      <p className={s.whyBody}>
        Nincs egyetlen „helyes” út.
        <br />
        Minden döntési irány más narratívát, más vizuált és más végkimenetet eredményez.
      </p>
    </div>
  </div>

  <div className={s.whyItem}>
    <div className={s.whyCard}>
      <h3 className={s.whyItemTitle}>AI, márkára szabott vizuális rendszerben</h3>
      <p className={s.whyBody}>
        A vizuálok a kampány céljához és hangulatához igazodnak.
        <br />
        Nem önálló generálásként, hanem integrált élményelemként jelennek meg.
      </p>
    </div>
  </div>
</div>


    <div className={s.whyClosing}>
      Nem külön eszköz engagementre, insight-gyűjtésre és ajánlásra – ugyanaz a
      motor szolgál több kampánycélt.
    </div>
  </div>
</section>


 {/* ───────────── HOGYAN MŰKÖDIK AZ EGYÜTTMŰKÖDÉS? ───────────── */}
<section
  id="collaboration"
  className={s.collabSection}
  aria-labelledby="collab-title"
>
  <div className={s.collabInner}>
    {/* ✅ HEADER WRAPPER: ide kerül a cutout, hogy a z-index logika működjön */}
    <header className={s.collabHeader}>
      {/* ── COLLAB CUTOUT (U-dísz) ── */}
      <div className={s.collabCutout} aria-hidden="true">
        

        {/* ✅ Üveg edge overlayk – ez hiányzott */}
        <div className={s.collabGlassEdgeTop} />
        <div className={s.collabGlassEdgeBottom} />
        <div className={s.collabGlassEdgeRight} />
      </div>

      {/* ✅ a szöveg most tényleg a cutout fölé kerül */}
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

    <div className={s.collabClosing}>
      Az együttműködés <strong>lépésenként épül</strong>: az első futtatás után egy{" "}
      <strong>önállóan működő</strong> élmény marad, nem egy <strong>függőség</strong>.
    </div>
  </div>
</section>

{/* ───────────── KIKNEK AJÁNLJUK? ───────────── */}
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
        Kiknek ajánljuk?
      </h2>

      {/* 🔒 ZÁRT állapotban is látszik */}
      <p className={s.audienceLead}>
        Márkáknak és ügynökségeknek, akik mélyebb bevonódást szeretnének
        a hagyományos quizeknél és űrlap-alapú eszközöknél.
      </p>

      <span className={s.audienceToggle} aria-hidden="true" />
    </header>

    {/* 🔓 LENYITHATÓ TARTALOM */}
    <div className={`${s.audienceContent} ${isAudienceOpen ? s.isOpen : ""}`}>
      {/* ➕ csak lenyitás után jelenik meg */}
      <p className={s.audienceLead}>
        Akik pontosabb döntési insightot és irányított, logikaalapú élményt keresnek —
        nem egyszerű kitöltéseket, hanem valódi döntési útvonalakat.
      </p>

      <div className={s.audienceList}>
        <div className={s.audienceItem}>
          <h3 className={s.audienceItemTitle}>
            Amikor a kampány hatékonyságát a döntési útvonal, nem pedig a kitöltésszám határozza meg
          </h3>
          <p>
            Promóciókhoz vagy termékbevezetésekhez, ahol az a cél, hogy a felhasználó valós
            preferenciákat feltáró döntéssoron menjen végig, ne csak végigkattintson egy lineáris
            folyamaton. A motor emlékező logikája összefüggő, magasabb minőségű felhasználói
            mintázatokat tár fel, ami pontosabb célzást és hatékonyabb kampányokat eredményez.
          </p>
        </div>

        <div className={s.audienceItem}>
          <h3 className={s.audienceItemTitle}>
            Amikor komplex szolgáltatást vagy terméklogikát kell egyszerű, érthető folyamatba rendezni
          </h3>
          <p>
            Telekom, tech, pénzügyi vagy bármilyen több összetevős ajánlat esetén, ahol a statikus
            landingek és a funkciófelsorolások nem adják át a működési logika lényegét. A motor a
            bonyolult struktúrákat irányított, bejárható döntési folyamattá alakítja, így a felhasználó
            saját útvonalon jut el a számára releváns megoldásig — félreértés és információvesztés nélkül.
          </p>
        </div>

        <div className={s.audienceItem}>
          <h3 className={s.audienceItemTitle}>
            Amikor a leadek mellett a viselkedési mintákra és a döntések mögötti logikára is szükség van
          </h3>
          <p>
            A rendszer nem csak a végső választ, hanem a teljes bejárási útvonalat méri: döntési sorrendet,
            csomóponti viselkedést, lemorzsolódási pontokat. Ez pontos remarketing-szegmenseket,
            értékesebb insightot és jobban optimalizálható kampányokat eredményez — olyan adatminőséggel,
            amit klasszikus lineáris eszközök nem tudnak biztosítani.
          </p>
        </div>

        <div className={s.audienceItem}>
          <h3 className={s.audienceItemTitle}>
            Amikor ügynökségként új, határidő-biztos formátumra van szükség, egyedi fejlesztés nélkül
          </h3>
          <p>
            Olyan briefekhez, ahol az interaktív, élményalapú megoldás az elvárás, de szükség van előre
            keretezett, kiszámítható kivitelezésre. A pilot fix struktúrával, mérhető eredményekkel és
            brandkontrollált vizuállal záruló élményt ad — alacsony kockázattal, garantált minőségben.
          </p>
        </div>
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

    {/* ✅ kattintható header */}
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
        Technológia & Biztonság
      </h2>
      <p className={s.techLead}>
        Brand-biztos, átlátható és skálázható kampánytechnológia
      </p>

      {/* ✅ opcionális: nyíl/ikon helye (SCSS-ben forgatható) */}
      <span className={s.techToggle} aria-hidden="true" />
    </header>

    {/* ✅ lenyitható tartalom wrapper */}
    <div className={`${s.techContent} ${isTechOpen ? s.isOpen : ""}`}>

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
  a csapatunk néhány nap alatt elkészíti a testreszabott demót,
  a márkádhoz és a céljaidhoz igazítva.
  <br />
<strong>A következő lépésben összeállítjuk, mire van szükséged.</strong>

</p>

    <div className={s.finalCtaButtons}>
      <button
        type="button"
        className={s.finalQuoteCta}   
        data-cta="request-quote-final"
        onClick={handleRequestQuote}  
      >
        Ajánlatkérés
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


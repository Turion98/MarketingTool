/** Copy and structure for the Questell /features marketing page. */

export type UiLang = "en" | "hu";

export const FEATURES_METADATA = {
  en: {
    title: "Features",
    description:
      "A decision flow is not a form with a result at the end. It is a system that reads what answers imply together and narrows the space accordingly.",
  },
  hu: {
    title: "Funkciók",
    description:
      "A döntési flow nem egy űrlap a végén eredménnyel. Olyan rendszer, amely együtt értelmezi a válaszokat, és ennek megfelelően szűkíti a teret.",
  },
} as const;

export type FeatureCardData = {
  title: string;
  sentence: string;
  bullets: [string, string, string];
};

export type StepBlock = {
  stepLabel: string;
  title: string;
  subtitle: string;
  introLine?: string;
  closingLine?: string;
  topVisualLabel?: string;
  /** Step 1: 4 cards + lifecycle visual beside card 4 (desktop). */
  visualBesideLastCard?: boolean;
  cards: FeatureCardData[];
  /** Bottom placeholder; omit on Step 1 when only topVisualLabel is used. */
  visualLabel?: string;
};

type FeaturesCopy = {
  featuresHero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    bullets: [string, string, string];
    supporting: string;
    primaryCta: { label: string; href: string };
    /** Másodlagos CTA — a /test-chat demo oldalra vezet (Try the live demo). */
    secondaryCta?: { label: string; href: string };
    heroVisualLabel: string;
  };
  featureSteps: StepBlock[];
  trustSection: {
    title: string;
    subtitle: string;
  };
  finalCtaSection: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    /** Másodlagos CTA — a /test-chat demo oldalra vezet (Try the live demo). */
    secondaryCta?: { label: string; href: string };
    visualLabel: string;
  };
};

export const FEATURES_COPY: Record<UiLang, FeaturesCopy> = {
  en: {
    featuresHero: {
      eyebrow: "Questell",
      headline: "AI understands what the user says. Questell retains that, and structures a process around it.",
      subheadline:
        "Modern AI chatbots can already extract meaning from complex human input. Interpretation is no longer the primary challenge.",
      bullets: [
        "Context is lost as conversations progress",
        "Earlier information gradually loses weight",
        "The system cannot track what has already been resolved",
      ],
      supporting:
        "This is not a language problem. It is an architecture problem.",
      primaryCta: { label: "Build your own chatbot", href: "/about" },
      secondaryCta: { label: "Try the live demo", href: "/test-chat" },
      heroVisualLabel: "[Visual placeholder: Questell conversation flow preview]",
    },
    featureSteps: [
      {
        stepLabel: "The problem",
        title: "LLMs were designed for interpretation. Not for process control.",
        subtitle:
          "Today, virtually anyone can deploy an AI assistant quickly and without technical expertise. It can respond, communicate, and remain continuously available. But once a process involves direction, conditions, or operational rules, significant limitations begin to emerge.",
        introLine: undefined,
        closingLine:
          "Addressing these three challenges typically requires specialized engineering teams, extended timelines, and substantial investment. Even then, most systems remain opaque and inaccessible to non-technical teams.",
        cards: [
          {
            title: "A context window is not structure",
            sentence:
              "The model can access everything that has been written, but cannot determine which information should retain importance. In extended conversations, earlier context gradually loses weight.",
            bullets: [
              "Earlier inputs diminish in relevance",
              "No awareness of what already matters",
              "Long conversations lose continuity",
            ],
          },
          {
            title: "Prompt rules are not business logic",
            sentence:
              "The LLM interprets instructions rather than enforcing them consistently. Two nearly identical situations may produce different decisions — neither of which is fully traceable.",
            bullets: [
              "Instructions interpreted, not followed",
              "Inconsistent outcomes across similar cases",
              "No audit trail for decisions made",
            ],
          },
          {
            title: "Persistent state does not exist",
            sentence:
              "The model cannot reliably maintain awareness of whether a condition has already been satisfied. With each new message, it reassesses the conversation from the beginning.",
            bullets: [
              "Completed steps are not remembered",
              "Conditions re-evaluated every turn",
              "Process position is never certain",
            ],
          },
        ],
      },
      {
        stepLabel: "The solution",
        title: "Questell introduces structure behind every conversation.",
        subtitle:
          "Once a user provides information, it is retained accurately. It does not disappear or become distorted. The system does not request it again.",
        introLine:
          "Every new message is interpreted within the context of all preceding interactions. Users communicate naturally, while Questell maintains awareness of what has already been completed, what remains outstanding, and what should logically occur next.",
        cards: [
          {
            title: "State lives outside the model",
            sentence:
              "Conditions recognized during the conversation are stored in session state — not in the LLM's context window. What was once satisfied stays satisfied.",
            bullets: [
              "Conditions tracked across turns",
              "No repeated questions",
              "State persists for the full session",
            ],
          },
          {
            title: "Routing is deterministic",
            sentence:
              "The LLM extracts what the user communicated. Business logic decides what happens next. The two responsibilities never mix.",
            bullets: [
              "AI handles language understanding only",
              "Rules handle all branching decisions",
              "Every path is auditable",
            ],
          },
          {
            title: "The process is yours to define",
            sentence:
              "Every business process has its own logic, steps, conditions, branches. Questell lets you describe that logic and run it, without writing a single line of code.",
            bullets: [
              "Define steps and conditions in plain structure",
              "Adjust logic without engineering support",
              "See exactly why each decision was made",
            ],
          },
        ],
        visualLabel: "[Visual placeholder: Questell structured session state view]",
      },
      {
        stepLabel: "What this means",
        title: "A decision-capable AI identity that operates according to your logic.",
        subtitle:
          "The most fundamental business expectation is not fulfilled simply by introducing AI. It is fulfilled when an assistant serves customers with the same consistency and understanding as the business itself.",
        introLine: undefined,
        cards: [
          {
            title: "Transparent",
            sentence:
              "Every step of the conversation is visible. You can see what condition was recognized, what triggered the next step, and where the process currently stands.",
            bullets: [
              "Full session state visible",
              "Every routing decision traceable",
              "No black-box outcomes",
            ],
          },
          {
            title: "Controllable",
            sentence:
              "You define the process. You adjust it when something does not fit. The same way you would train and refine a human support agent.",
            bullets: [
              "Logic defined outside the model",
              "Adjustable without redeployment",
              "Non-technical teams can manage it",
            ],
          },
          {
            title: "Consistent",
            sentence:
              "Two identical situations produce the same outcome. Every time. Not because the model happened to interpret them the same way — but because the rules said so.",
            bullets: [
              "Deterministic routing",
              "No improvisation on business rules",
              "Reliable at scale",
            ],
          },
        ],
        visualLabel: "[Visual placeholder: decision paths and session state side by side]",
      },
    ],
    trustSection: {
      title: "Questell is not a one-size-fits-all solution.",
      subtitle:
        "Every process is unique. Every organization makes decisions differently, communicates differently, and manages operations differently. Questell is a system designed to adapt to your organization's specific logic.",
    },
    finalCtaSection: {
      title: "The first step is a conversation.",
      body: "Start with one process. Define the steps, describe the conditions, and see the logic run. The first flow teaches you more than any planning session.",
      primaryCta: { label: "Build your own chatbot", href: "/about" },
      secondaryCta: { label: "Try the live demo", href: "/test-chat" },
      visualLabel: "[Visual placeholder: final CTA — Questell session flow preview]",
    },
  },
  hu: {
    featuresHero: {
      eyebrow: "Questell",
      headline: "Az AI megérti, mit mondtál. A Questell megőrzi és folyamatot épít belőle.",
      subheadline:
        "Egy AI chatbot ma már képes komplex emberi inputból kiszűrni a lényeget. A probléma nem az értelmezés.",
      bullets: [
        "A kontextus elvész a beszélgetés során",
        "A korai információk súlya fokozatosan csökken",
        "A rendszer nem tartja számon mi teljesült már",
      ],
      supporting:
        "Ez nem nyelvi probléma. Ez architektúrális probléma.",
      primaryCta: { label: "Készítsd el a saját chatbotodat", href: "/about" },
      secondaryCta: { label: "Próbáld ki élőben", href: "/test-chat" },
      heroVisualLabel: "[Vizuális helykitöltő: Questell beszélgetési folyamat előnézet]",
    },
    featureSteps: [
      {
        stepLabel: "A probléma",
        title: "Az LLM értelmezésre lett tervezve. Nem folyamatvezetésre.",
        subtitle:
          "Egy AI asszisztenst ma már bárki bevezethet. Gyorsan, olcsón, technikai tudás nélkül. Válaszol, kommunikál, rendelkezésre áll. De amint a folyamatnak iránya van, feltételei vannak, szabályai vannak — komoly korlátok jelennek meg.",
        introLine: undefined,
        closingLine:
          "Ezt a három problémát külön fejlesztőcsapat, hónapok és jelentős költség nélkül nem lehet megoldani. És ha megoldják, a rendszer még mindig nem látható, nem javítható, és nem tanítható nem technikai embernek.",
        cards: [
          {
            title: "A kontextus ablaka nem struktúra",
            sentence:
              "A modell lát mindent amit leírtál, de nem tudja eldönteni mi fontos és mi nem. Egy hosszabb beszélgetésben a korai információk súlya fokozatosan csökken.",
            bullets: [
              "A korai inputok elveszítik súlyukat",
              "Nincs tudatosság arról, mi számít",
              "A hosszú beszélgetések elveszítik a fonalat",
            ],
          },
          {
            title: "A promptba írt szabályok nem üzleti logika",
            sentence:
              "Az LLM értelmezi az utasításokat, nem következetesen hajtja végre őket. Két hasonló helyzetben két különböző döntést hozhat, és egyik sem lesz nyomon követhető.",
            bullets: [
              "Az utasítások értelmezve lesznek, nem követve",
              "Hasonló esetekben eltérő kimenet",
              "Nincs audit trail a döntésekhez",
            ],
          },
          {
            title: "State nem létezik",
            sentence:
              "Az LLM nem tudja számon tartani, hogy egy feltétel már teljesült. Minden válasznál újraértelmez mindent az elejétől.",
            bullets: [
              "A teljesített lépések nem maradnak meg",
              "A feltételek minden körben újraértékelődnek",
              "A folyamat pozíciója soha nem biztos",
            ],
          },
        ],
      },
      {
        stepLabel: "A megoldás",
        title: "A Questell minden beszélgetés mögé egy struktúrát épít.",
        subtitle:
          "Amit a felhasználó egyszer megadott, az nem veszik el. Nem torzul. A rendszer nem kérdezi meg újra.",
        introLine:
          "Minden új válasz az előzőek kontextusában értelmeződik. A felhasználó természetes nyelven ír. A Questell számon tartja mi teljesült már, mi hiányzik még, és mi következik ebből.",
        cards: [
          {
            title: "A state az LLM-en kívül él",
            sentence:
              "A beszélgetés során felismert feltételek session state-be kerülnek — nem az LLM kontextus ablakában. Ami egyszer teljesült, megmarad.",
            bullets: [
              "Feltételek körök között megmaradnak",
              "Nincs ismételt visszakérdezés",
              "A state a teljes session alatt él",
            ],
          },
          {
            title: "A routing determinisztikus",
            sentence:
              "Az LLM kinyeri amit a felhasználó közölt. Az üzleti logika dönti el mi következik. A két felelősség sosem keveredik.",
            bullets: [
              "Az AI csak a nyelvértelmezést végzi",
              "A szabályok kezelik az összes elágazást",
              "Minden útvonal auditálható",
            ],
          },
          {
            title: "A folyamatot te határozod meg",
            sentence:
              "Minden üzleti folyamatnak saját logikája van — lépések, feltételek, elágazások. A Questell lehetővé teszi hogy ezt leírd és futtasd, egyetlen sor kód nélkül.",
            bullets: [
              "Lépések és feltételek plain struktúrában",
              "A logika módosítható fejlesztői segítség nélkül",
              "Pontosan látható miért született minden döntés",
            ],
          },
        ],
        visualLabel: "[Vizuális helykitöltő: Questell strukturált session state nézet]",
      },
      {
        stepLabel: "Mit jelent ez",
        title: "Egy döntésre képes AI identitás, amely a te logikád szerint működik.",
        subtitle:
          "A legalapvetőbb üzleti elvárás nem teljesül automatikusan attól, hogy AI-t vezetsz be. Attól teljesül, hogy a saját asszisztensed úgy szolgálja a vevőidet, ahogy te is tennéd.",
        introLine: undefined,
        cards: [
          {
            title: "Átlátható",
            sentence:
              "A beszélgetés minden lépése látható. Látod melyik feltétel teljesült, mi váltotta ki a következő lépést, és hol tart jelenleg a folyamat.",
            bullets: [
              "Teljes session state látható",
              "Minden routing döntés követhető",
              "Nincs fekete doboz kimenet",
            ],
          },
          {
            title: "Kontrollálható",
            sentence:
              "Te határozod meg a folyamatot. Te javítod ha valami nem stimmel. Ugyanúgy, ahogy egy munkatársat betanítanál és folyamatosan finomítanád a munkáját.",
            bullets: [
              "A logika a modellen kívül van definiálva",
              "Módosítható újradeployálás nélkül",
              "Nem technikai csapatok is kezelhetik",
            ],
          },
          {
            title: "Következetes",
            sentence:
              "Két azonos helyzet ugyanazt az eredményt adja. Mindig. Nem azért mert a modell véletlenül ugyanúgy értelmezte — hanem mert a szabályok így mondták.",
            bullets: [
              "Determinisztikus routing",
              "Nincs improvizáció az üzleti szabályoknál",
              "Megbízható skálán",
            ],
          },
        ],
        visualLabel: "[Vizuális helykitöltő: döntési útvonalak és session state egymás mellett]",
      },
    ],
    trustSection: {
      title: "A Questell nem egy kész megoldás.",
      subtitle:
        "Minden folyamat egyedi. Minden üzlet másképp dönt, másképp kommunikál, másképp vezeti az ügyeit. A Questell egy rendszer, amit a saját logikád szerint építesz fel.",
    },
    finalCtaSection: {
      title: "Az első lépés egy beszélgetés.",
      body: "Kezdj egyetlen folyamattal. Határozd meg a lépéseket, írd le a feltételeket, és nézd meg ahogy a logika fut. Az első flow többet tanít, mint bármelyik tervezési meeting.",
      primaryCta: { label: "Készítsd el a saját chatbotodat", href: "/about" },
      secondaryCta: { label: "Próbáld ki élőben", href: "/test-chat" },
      visualLabel: "[Vizuális helykitöltő: záró CTA — Questell session flow előnézet]",
    },
  },
};

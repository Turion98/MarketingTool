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
    visualLabel: string;
  };
};

export const FEATURES_COPY: Record<UiLang, FeaturesCopy> = {
  en: {
    featuresHero: {
      eyebrow: "Questell Features",
      headline: "A quiz collects answers. A decision system interprets them.",
      subheadline:
        "Most interactive flows evaluate each response in isolation. Questell tracks what answers imply together:",
      bullets: [
        "which paths they close",
        "which directions they strengthen",
        "what the combination says about this specific person",
      ],
      supporting: "That is not a feature. It is a different architecture.",
      primaryCta: { label: "Request your first flow", href: "/about" },
      heroVisualLabel: "[Visual placeholder: Questell decision flow interface preview]",
    },
    featureSteps: [
      {
        stepLabel: "Step 1",
        title: "Build the knowledge base",
        subtitle: "The system learns your business before it builds anything.",
        introLine:
          "Before a decision flow can guide anyone, the system needs to understand your business. Not from a brief you fill in - from your site itself. Questell crawls your URLs, extracts product logic and user paths, and asks targeted questions while it works. What comes back is a structured knowledge base you can read, correct, and refine. That base is what every subsequent step builds from.",
        closingLine:
          "At this point the decision system is testable. No skin, no live page - just the logic, working.",
        cards: [
          {
            title: "Knowledge base",
            sentence:
              "The pipeline crawls your site and extracts your business logic. You review what it found, correct what it missed, and iterate until it is accurate.",
            bullets: [
              "Site structure and subpages mapped",
              "Product pages and their role identified",
              "User paths and business logic captured",
            ],
          },
          {
            title: "Decision logic",
            sentence:
              "The knowledge base gets reverse-engineered into a decision network. You walk through every path, adjust what does not fit, and iterate until the logic holds.",
            bullets: [
              "Decision network generated from your data",
              "Every path visible and adjustable",
              "Testable before any content is added",
            ],
          },
          {
            title: "Content",
            sentence:
              "The flow fills with base content. You refine the language until it reflects how your users actually think and decide.",
            bullets: [
              "Base content generated from your knowledge base",
              "Every step editable",
              "Flow ready when the content fits",
            ],
          },
        ],
      },
      {
        stepLabel: "Step 2",
        title: "Embed without rebuilding",
        subtitle: "The flow goes where the hesitation is, not where it is convenient.",
        introLine:
          "A decision flow that lives on a separate page asks users to leave the moment they were already in. When the knowledge base is ready and the flow is generated, it goes directly into the page where the decision is already happening. No rebuild. No new infrastructure. It looks like it belongs there because it was built from what was already there.",
        cards: [
          {
            title: "Embeddable experience",
            sentence: "Place decision flows directly inside existing pages.",
            bullets: ["Use iframe or script", "Keep your current site", "Avoid full redesigns"],
          },
          {
            title: "Custom styling",
            sentence: "Make the flow feel native to your brand.",
            bullets: ["Match colors and typography", "Adjust layout feel", "Keep visual consistency"],
          },
          {
            title: "Adaptive interface",
            sentence: "Flows that work across devices and contexts.",
            bullets: ["Desktop friendly", "Mobile ready", "Campaign flexible"],
          },
        ],
        visualLabel: "[Visual placeholder: embedded Questell widget inside a live page]",
      },
      {
        stepLabel: "Step 3",
        title: "Read the combination, not the answer",
        subtitle: "What users decide together matters more than what they say once.",
        introLine:
          "Once the flow is live, the system starts reading. Not individual answers - the pattern of answers together. The user does not land on a category. They land on the direction that fits what they actually described. That specificity is what makes the difference between a result they trust and one they second-guess. And every session that passes through the flow makes the logic easier to improve.",
        cards: [
          {
            title: "Choice tracking",
            sentence: "See what users select at each step.",
            bullets: ["Track decisions", "Identify patterns", "Spot hesitation"],
          },
          {
            title: "Intent segmentation",
            sentence: "Group users based on real preferences and needs.",
            bullets: ["Segment by choices", "Reveal user intent", "Support follow-up"],
          },
          {
            title: "Decision insights",
            sentence: "Understand how decisions actually happen.",
            bullets: ["See common paths", "Detect drop-offs", "Improve flow logic"],
          },
        ],
        visualLabel: "[Visual placeholder: decision paths turning into insights]",
      },
    ],
    trustSection: {
      title: "You are never working alone",
      subtitle:
        "Every workstation has its own agent. Each one built for that stage, that task, that decision. Not a general assistant you redirect. One that already knows where you are.",
    },
    finalCtaSection: {
      title: "One flow on a live page is worth more than a perfect system that never ships.",
      body: "Start with one decision moment. Map the logic, embed the flow, and see how users actually move through it. The first flow teaches you more than any planning session.",
      primaryCta: { label: "Request your first flow", href: "/about" },
      visualLabel: "[Visual placeholder: final CTA product mockup or mini flow preview]",
    },
  },
  hu: {
    featuresHero: {
      eyebrow: "Questell funkciók",
      headline: "A quiz válaszokat gyűjt. A döntési rendszer értelmezi őket.",
      subheadline:
        "A legtöbb interaktív flow izoláltan értékeli a válaszokat. A Questell azt követi, mit jelentenek együtt:",
      bullets: [
        "milyen útvonalakat zárnak le",
        "milyen irányokat erősítenek",
        "mit mond a kombináció erről az adott emberről",
      ],
      supporting: "Ez nem egy extra feature. Ez egy másik architektúra.",
      primaryCta: { label: "Kérem az első flow-t", href: "/about" },
      heroVisualLabel: "[Vizuális helykitöltő: Questell döntési flow felület előnézet]",
    },
    featureSteps: [
      {
        stepLabel: "1. lépés",
        title: "Tudásbázis felépítése",
        subtitle: "A rendszer először a businessedet tanulja meg, és csak utána épít.",
        introLine:
          "Mielőtt egy döntési flow bárkit vezetni tudna, a rendszernek értenie kell a businessedet. Nem egy kitöltött briefből, hanem magából az oldaladból. A Questell bejárja az URL-eket, kinyeri a terméklogikát és felhasználói útvonalakat, majd célzott kérdéseket tesz fel közben. Az eredmény egy strukturált tudásbázis, amit átnézhetsz, javíthatsz és finomíthatsz. Minden következő lépés erre épül.",
        closingLine:
          "Ezen a ponton a döntési rendszer már tesztelhető. Nincs skin, nincs live oldal - csak működő logika.",
        cards: [
          {
            title: "Tudásbázis",
            sentence:
              "A pipeline bejárja az oldalad és kinyeri a business logikát. Átnézed, mit talált, javítod, amit eltévesztett, és iterálsz, amíg pontos nem lesz.",
            bullets: [
              "Oldalstruktúra és aloldalak feltérképezve",
              "Termékoldalak és szerepük azonosítva",
              "Felhasználói utak és business logika rögzítve",
            ],
          },
          {
            title: "Döntési logika",
            sentence:
              "A tudásbázist a rendszer döntési hálóvá fordítja vissza. Végigmész minden útvonalon, módosítod, ami nem illeszkedik, és iterálsz, amíg a logika tart.",
            bullets: [
              "Döntési háló a saját adataidból",
              "Minden útvonal látható és módosítható",
              "Tartalom előtt tesztelhető",
            ],
          },
          {
            title: "Tartalom",
            sentence:
              "A flow feltöltődik alap tartalommal. A nyelvezetet addig finomítod, amíg tényleg azt tükrözi, ahogy a felhasználóid gondolkodnak és döntenek.",
            bullets: [
              "Alap tartalom a tudásbázisból generálva",
              "Minden lépés szerkeszthető",
              "A flow kész, amikor a tartalom pontos",
            ],
          },
        ],
      },
      {
        stepLabel: "2. lépés",
        title: "Beágyazás újraépítés nélkül",
        subtitle: "A flow oda kerül, ahol a bizonytalanság van, nem oda, ahol kényelmes.",
        introLine:
          "A külön oldalra tett döntési flow azt kéri a usertől, hogy pont akkor hagyja el a kontextust, amikor már benne volt. Amikor kész a tudásbázis és legenerálódik a flow, közvetlenül arra az oldalra kerül, ahol a döntés amúgy is történik. Nincs rebuild. Nincs új infrastruktúra. Azért hat natívnak, mert abból épült, ami már ott volt.",
        cards: [
          {
            title: "Beágyazható élmény",
            sentence: "A döntési flow közvetlenül a meglévő oldalaidba kerül.",
            bullets: ["iframe vagy script", "meglévő oldal megtartása", "nincs teljes redesign"],
          },
          {
            title: "Egyedi megjelenés",
            sentence: "A flow vizuálisan a branded részének hat.",
            bullets: ["színek és tipó illesztése", "layout-hangolás", "vizuális konzisztencia"],
          },
          {
            title: "Adaptív felület",
            sentence: "A flow különböző eszközökön és kontextusokban is működik.",
            bullets: ["desktop-barát", "mobilra kész", "kampányra rugalmas"],
          },
        ],
        visualLabel: "[Vizuális helykitöltő: beágyazott Questell widget élő oldalon]",
      },
      {
        stepLabel: "3. lépés",
        title: "A kombináció számít, nem az egyedi válasz",
        subtitle: "Az együtt meghozott döntések többet mondanak, mint egyetlen válasz.",
        introLine:
          "Amint a flow éles, a rendszer olvasni kezd. Nem az egyes válaszokat, hanem a válaszok mintázatát együtt. A user nem egy általános kategóriára érkezik. Arra az irányra érkezik, ami arra illik, amit valójában leírt. Ez adja a különbséget aközött, hogy bízik-e a kimenetben vagy megkérdőjelezi. És minden session, ami végigmegy a flow-n, könnyebbé teszi a logika javítását.",
        cards: [
          {
            title: "Választáskövetés",
            sentence: "Látod, mit választanak a felhasználók lépésről lépésre.",
            bullets: ["döntések követése", "mintázatok azonosítása", "bizonytalanság felismerése"],
          },
          {
            title: "Intent szegmentáció",
            sentence: "Valós preferenciák és igények alapján csoportosíthatsz.",
            bullets: ["szegmentálás választások alapján", "valódi szándék feltárása", "follow-up támogatás"],
          },
          {
            title: "Döntési insightok",
            sentence: "Megérted, hogyan történnek a döntések a gyakorlatban.",
            bullets: ["gyakori utak láthatók", "lemorzsolódási pontok", "flow logika fejlesztése"],
          },
        ],
        visualLabel: "[Vizuális helykitöltő: döntési útvonalakból insight]",
      },
    ],
    trustSection: {
      title: "Nem egyedül dolgozol",
      subtitle:
        "Minden workstationnek saját agentje van. Mindegyik adott szakaszra, feladatra és döntésre épül. Nem egy általános asszisztens, amit folyton át kell irányítani, hanem egy, ami eleve tudja, hol tartasz.",
    },
    finalCtaSection: {
      title: "Egy éles oldalon futó flow többet ér, mint egy tökéletes rendszer, ami sosem indul el.",
      body: "Kezdj egyetlen döntési ponttal. Térképezd fel a logikát, ágyazd be a flow-t, és nézd meg, hogyan mozognak benne valójában a felhasználók. Az első flow többet tanít, mint bármelyik tervezési meeting.",
      primaryCta: { label: "Kérem az első flow-t", href: "/about" },
      visualLabel: "[Vizuális helykitöltő: záró CTA termék mockup vagy mini flow előnézet]",
    },
  },
};

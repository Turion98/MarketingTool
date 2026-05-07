/**
 * r2 tartalom — HU/EN párhuzamos mátrix (szerepkör × súrlódás).
 *
 * Tartalom-QA (guardrail):
 * - SaaS útvonal: kerüljük a webshop / „brief” jellegű ügynökségi nyelvet.
 * - Agency útvonal: SaaS-only zsargon csak ott, ahol ügyfél-oldali kontextus.
 * - Minden cella: diagnózis → üzleti hatás → max 2 szám + forrás-jelölés → r3 előkészítés.
 */
import type {
  PresentPain,
  R2ContentEntry,
  R2ContentMatrix,
  R2HudByRole,
  R2OutcomeByRole,
  R2PainChoiceByRole,
  R2PainChoiceLine,
  R2PromptByRole,
} from "./presentDeck.types";

/** Iparági referencia — ügyfélnél mindig saját mérés / A/B */
const SRC_INDUSTRY = "Iparági referencia — nem garancia egyedi eredményre.";
/** Belső pilot / demo jelleg — publikus case study nélkül óvatosan */
const SRC_PILOT = "Belső pilot irány — publikus case study nélkül óvatosan.";

const SRC_INDUSTRY_EN =
  "Industry reference — not a guarantee for your specific traffic.";
const SRC_PILOT_EN =
  "Internal pilot direction — treat cautiously without public case studies.";

const HUD_TITLE_EN = "FRICTION ANALYSIS";
const HUD_MICRO_EN = "Pick the one that costs the most right now.";
const HUD_TITLE_HU = "SÚRLÓDÁS-ELEMZÉS";
const HUD_MICRO_HU = "Válaszd ki, ami most a legtöbbe kerül.";

/** HU: r2 HUD gépelés (pain választás előtt, szerepkör szerint) */
export const r2HudHu: R2HudByRole = {
  agency: {
    title: HUD_TITLE_HU,
    subtext:
      "Az ügyfél-teljesítmény attól függ, mi történik a kattintás után.",
    micro: HUD_MICRO_HU,
  },
  saas: {
    title: HUD_TITLE_HU,
    subtext:
      "A felhasználók eljutnak a termékhez, de nem mindenki halad tovább.",
    micro: HUD_MICRO_HU,
  },
  webshop: {
    title: HUD_TITLE_HU,
    subtext:
      "A boltba eljut a forgalom, de a vásárlási döntés gyakran megreccsen.",
    micro: HUD_MICRO_HU,
  },
};

/** EN: r2 HUD */
export const r2HudEn: R2HudByRole = {
  agency: {
    title: HUD_TITLE_EN,
    subtext: "Client performance depends on what happens after the click.",
    micro: HUD_MICRO_EN,
  },
  saas: {
    title: HUD_TITLE_EN,
    subtext: "Users reach your product, but not all move forward.",
    micro: HUD_MICRO_EN,
  },
  webshop: {
    title: HUD_TITLE_EN,
    subtext:
      "Traffic reaches the store, but purchase decisions often stall.",
    micro: HUD_MICRO_EN,
  },
};

function painChoices(
  a: R2PainChoiceLine,
  b: R2PainChoiceLine,
  c: R2PainChoiceLine,
  d: R2PainChoiceLine
): Record<PresentPain, R2PainChoiceLine> {
  return {
    low_conversion: a,
    choice_overload: b,
    no_visibility: c,
    need_new: d,
  };
}

export const r2PromptByRoleEn: R2PromptByRole = {
  agency: "Where does performance break down across your client flows?",
  saas: "Where do users stall on the way to value?",
  webshop: "Where do shoppers stop moving toward a decision?",
};

export const r2PromptByRoleHu: R2PromptByRole = {
  agency: "Hol törik meg a teljesítmény az ügyfél-flowok mentén?",
  saas: "Hol akadnak el a felhasználók az érték felé vezető úton?",
  webshop: "Hol torpanak meg a vásárlók a döntés felé vezető úton?",
};

export const r2OutcomeByRoleEn: R2OutcomeByRole = {
  agency: {
    lead: "Your answer shapes what comes next.",
    rest: " We narrow the deployment options to the friction point you picked.",
  },
  saas: {
    lead: "Your answer shapes what comes next.",
    rest: " We narrow the deployment options to where your funnel actually stalls.",
  },
  webshop: {
    lead: "Your answer shapes what comes next.",
    rest: " We narrow the deployment options to where your shoppers stop deciding.",
  },
};

export const r2OutcomeByRoleHu: R2OutcomeByRole = {
  agency: {
    lead: "A válaszod alakítja, mi következik.",
    rest: " A bevetési opciókat a kiválasztott súrlódási pontra szűkítjük.",
  },
  saas: {
    lead: "A válaszod alakítja, mi következik.",
    rest: " A bevetési opciókat oda szűkítjük, ahol a funnel valójában megtorpan.",
  },
  webshop: {
    lead: "A válaszod alakítja, mi következik.",
    rest: " A bevetési opciókat oda szűkítjük, ahol a vásárlók megszakítják a döntést.",
  },
};

export const r2PainChoiceEn: R2PainChoiceByRole = {
  agency: painChoices(
    {
      title: "Conversion gap",
      body: "Campaigns bring clicks. The decision after the click does not close.",
    },
    {
      title: "Decision friction",
      body: "Users move through the funnel but drop before they commit.",
    },
    {
      title: "No visibility into intent",
      body: "You can see traffic. You cannot see where people stop deciding.",
    },
    {
      title: "Execution pressure",
      body: "You know what to fix. Testing and shipping it takes too long.",
    }
  ),
  saas: painChoices(
    {
      title: "Activation gap",
      body: "Users sign up. Most never reach the moment the product proves itself.",
    },
    {
      title: "Choice overload",
      body: "Too many paths, plans, or setup options slow the first decision down.",
    },
    {
      title: "Missing insight",
      body: "Drop-off is visible in the numbers. What causes it is not.",
    },
    {
      title: "Slow iteration",
      body: "You have hypotheses about what to fix. Testing them takes weeks.",
    }
  ),
  webshop: painChoices(
    {
      title: "Add-to-cart gap",
      body: "Product pages get views. Fewer visitors move from interest to intent.",
    },
    {
      title: "Variant friction",
      body: "Size, color, bundle choices create hesitation at the product level.",
    },
    {
      title: "Checkout leakage",
      body: "Shoppers reach the cart. A large share does not complete the purchase.",
    },
    {
      title: "Slow merchandising loop",
      body: "You know which offers and flows to test. Validating them takes too long.",
    }
  ),
};

export const r2PainChoiceHu: R2PainChoiceByRole = {
  agency: painChoices(
    {
      title: "Konverziós rés",
      body: "A kampányok hoznak kattintást, de a kattintás utáni döntés nem zárul le.",
    },
    {
      title: "Döntési súrlódás",
      body: "Haladnak a funnelen, de elköteleződés előtt kiesnek.",
    },
    {
      title: "Nincs rálátás a szándékra",
      body: "Látszik a forgalom. Nem látszik, hol állnak meg az emberek a döntésben.",
    },
    {
      title: "Végrehajtási nyomás",
      body: "Tudod, mit kellene javítani. A tesztelés és a szállítás túl sokáig tart.",
    }
  ),
  saas: painChoices(
    {
      title: "Aktivációs rés",
      body: "Regisztrálnak, de a legtöbben el sem jutnak odáig, ahol a termék igazolná magát.",
    },
    {
      title: "Opció-túlterhelés",
      body: "Túl sok út, csomag vagy beállítás lassítja az első döntést.",
    },
    {
      title: "Rejtett ok",
      body: "A lemorzsolódás a számokban látszik. Az ok nem.",
    },
    {
      title: "Lassú iteráció",
      body: "Vannak hipotéziseid, mit kellene javítani. A tesztelésük hetekbe telik.",
    }
  ),
  webshop: painChoices(
    {
      title: "Kosárba helyezési rés",
      body: "A termékoldalakat nézik, de kevesebben lépnek át érdeklődésből szándékba.",
    },
    {
      title: "Variáns súrlódás",
      body: "Méret, szín, csomagválasztás elbizonytalanít a termék szintjén.",
    },
    {
      title: "Checkout lemorzsolódás",
      body: "Eljutnak a kosárig, de sokan nem fejezik be a vásárlást.",
    },
    {
      title: "Lassú merchandising ciklus",
      body: "Tudod, melyik ajánlatot és flow-t kellene tesztelni. A validálás túl sokáig tart.",
    }
  ),
};

function e(
  headline: string,
  friction: string,
  businessImpact: string,
  proof: [[string, string, string], [string, string, string]],
  nextStep: string,
  fitTags: [string, string, string]
): R2ContentEntry {
  return {
    headline,
    friction,
    businessImpact,
    proofStats: [
      { label: proof[0][0], value: proof[0][1], sourceNote: proof[0][2] },
      { label: proof[1][0], value: proof[1][1], sourceNote: proof[1][2] },
    ],
    nextStep,
    fitTags,
  };
}

/** HU: 12 út — minden (role × pain) külön diagnózis + adat + következő lépés */
export const r2MatrixHu: R2ContentMatrix = {
  agency: {
    low_conversion: e(
      "Kampányforgalom megvan, de az ügyfél oldal nem hoz döntést.",
      "A hirdetés/hírlevél behozza a kattintást, a landing vagy termékút viszont nem zár — a user visszacsúszik böngészésbe.",
      "Ugyanannyi spend mellett romlik a hatékonyság: több iteráció, kevesebb „biztos” nyereség az ügyfélnek.",
      [
        ["Nem vásárlás túl sok opció miatt (irány)", "64%", SRC_INDUSTRY],
        ["Drop-off döntési komplexitás miatt (irány)", "20–40%", SRC_INDUSTRY],
      ],
      "r3-ban arra a bevetési mintára szűkítünk (pl. finder, kvalifikáció, kampány), ami ezt a döntési szakadékot célozza.",
      ["Ügynökség", "Ügyfél oldal", "Konverzió"]
    ),
    choice_overload: e(
      "Túl sok variáns, túl kevés vezetett döntés.",
      "Sok A/B, sok offer, sok landing — a látogató nem tudja, merre induljon, ezért késik a konkrét következő lépés.",
      "Az ügyfél „még egy touchpointot” kér ahelyett, hogy egyszerűsítene — nő a komplexitás és a delivery idő.",
      [
        ["Vásárlási arány (24 vs 6 opció, irány)", "3% vs 30%", SRC_INDUSTRY],
        ["Nem vásárlás overchoice miatt (irány)", "64%", SRC_INDUSTRY],
      ],
      "r3-ban egy olyan mintát emelünk ki, ami szűkíti az opcióteret és vezetett döntési utat ad.",
      ["Komplex ajánlat", "A/B stack", "Vezetett út"]
    ),
    no_visibility: e(
      "Nem látszik, hol vesz el a szándék az ügyfél oldalán.",
      "Van forgalom, de nincs strukturált kép arról, melyik lépésnél bizonytalanodik el a user — nehéz priorizálni a javítást.",
      "A csapat vitákba ragad („dizájn vs offer”), mert nincs közös, mérhető döntési térkép.",
      [
        ["Drop-off döntési komplexitás (irány)", "20–40%", SRC_INDUSTRY],
        ["Útvonal + elakadás jelek", "flow + events", SRC_PILOT],
      ],
      "r3-ban olyan bevetést választasz, ami útvonal-jellegű feedbacket ad — nem csak oldalmegtekintést.",
      ["Ügyfél audit", "Priorizálás", "Mérhetőség"]
    ),
    need_new: e(
      "Gyors nyerés kell az ügyfélnek — kevés a hetekig tartó discovery.",
      "Nyomás van: kell egy új, látványos megoldás, ami gyorsan életbe megy és nem nyitja szét a core rendszert.",
      "Ha nincs alacsony kockázatú minta, minden projekt „nagy integrációvá” nő — csúszik a go-live.",
      [
        ["Embed / iframe go-live", "napok", SRC_PILOT],
        ["Fejlesztői függőség", "minimal", SRC_PILOT],
      ],
      "r3-ban arra a mintára szűkítünk, amit iframe-ben, gyorsan ki tudsz próbálni ügyfélnél.",
      ["Gyors pilot", "Alacsony kockázat", "Ismétlődő deploy"]
    ),
  },
  saas: {
    low_conversion: e(
      "Van trial/forgalom, de kevés az értékre váltás.",
      "A látogató eljut a regisztrációig, de a setup és a „miért érné meg most” nem épül fel — lassul az aktiváció.",
      "CAC nő, sales cycle hosszabb: kevesebb minőségi pipeline jel érkezik ugyanabból a top funnelből.",
      [
        ["Konverzió uplift (iparági irány)", "+20–35%", SRC_INDUSTRY],
        ["Aktiváció / time-to-value", "csökkenő jel", SRC_PILOT],
      ],
      "r3-ban olyan bevetést választasz (pl. csomagválasztás, kvalifikáció), ami a trial→érték ugrást rövidíti.",
      ["B2B SaaS", "Aktiváció", "Pipeline"]
    ),
    choice_overload: e(
      "Túl sok csomag / funkció — nehéz a „nekem melyik?” döntés.",
      "A pricing és a feature-mátrix elbizonytalanít: a user nem tudja, melyik terv illeszkedik a valós használathoz.",
      "Leadek jönnek, de a minősítés gyenge — sok „maybe later”, kevés magabiztos következő lépés.",
      [
        ["Vásárlási arány (24 vs 6 opció, irány)", "3% vs 30%", SRC_INDUSTRY],
        ["Nem vásárlás overchoice miatt (irány)", "64%", SRC_INDUSTRY],
      ],
      "r3-ban a csomagválasztás / qualification mintát emeljük ki: kevesebb opció, több vezetés.",
      ["Árazás", "Csomagok", "Minősítés"]
    ),
    no_visibility: e(
      "Nem látod, hol akad el a szándék a termék-oldalon.",
      "Van analytics, de hiányzik a döntési útvonal: melyik kérdésnél áll meg a user, mielőtt saleshez kerülne.",
      "Sales „vakon” hív: alacsony meeting minőség, hosszabb ciklus.",
      [
        ["Útvonal + elakadás jelek", "flow + events", SRC_PILOT],
        ["Drop-off döntési komplexitás (irány)", "20–40%", SRC_INDUSTRY],
      ],
      "r3-ban olyan bevetést választasz, ami intent és readiness jelet ad — nem csak oldalmegtekintést.",
      ["Intent", "Handoff", "Sales enablement"]
    ),
    need_new: e(
      "Gyors kísérlet kell — nincs idő core átírásra.",
      "Kell valami új, ami már a következő sprintben mérhető jelzést ad, nem „roadmap Q3”.",
      "Ha nincs pilot-minta, a csapat generikus landinget vagy formot rak be — kevés a tanulság.",
      [
        ["Embed / iframe go-live", "napok", SRC_PILOT],
        ["Pilot hipotézis", "A/B-ready", SRC_PILOT],
      ],
      "r3-ban egy olyan mintát választasz, amit gyorsan beágyazhatsz és mérhetővé teszel.",
      ["Pilot", "Sprint", "Mérés"]
    ),
  },
  webshop: {
    low_conversion: e(
      "A webshopban van forgalom, de gyenge a vásárlásra váltás.",
      "A termékoldalról sok user nem jut el kosárig vagy checkoutig; a következő lépés nem elég egyértelmű.",
      "Ugyanabból a trafficből kevesebb rendelés és alacsonyabb bevétel keletkezik.",
      [
        ["Nem vásárlás overchoice miatt (irány)", "64%", SRC_INDUSTRY],
        ["Konverzió uplift vezetett döntési réteggel (irány)", "+20–35%", SRC_INDUSTRY],
      ],
      "r3-ban arra a deploy mintára szűkítünk, ami add-to-cart és checkout átmenetben hoz gyors javulást.",
      ["PDP", "Kosár", "Checkout"]
    ),
    choice_overload: e(
      "Túl sok termék- vagy variáns-opció mellett a vásárló elbizonytalanodik.",
      "A döntési felület túlterhelt: méret, csomag, upsell és kedvezmény egyszerre terheli a választást.",
      "Nő a kilépés kosár vagy checkout előtt, így romlik a rendelésarány.",
      [
        ["Vásárlási arány (24 vs 6 opció, irány)", "3% vs 30%", SRC_INDUSTRY],
        ["Drop-off döntési komplexitás (irány)", "20–40%", SRC_INDUSTRY],
      ],
      "r3-ban vezetett választási mintát emelünk ki, ami szűkíti az opcióteret és felgyorsítja a kosárba helyezést.",
      ["Variáns", "Irányított döntés", "Kosár"]
    ),
    no_visibility: e(
      "Nem látszik pontosan, hol szakad meg a vásárlási szándék.",
      "Van analytics, de kevés a döntési pont-szintű jel a PDP→kosár→checkout útvonalról.",
      "A javítások találgatásra mennek, ezért lassul a konverziós tanulási ciklus.",
      [
        ["Útvonal + elakadás jelek", "flow + events", SRC_PILOT],
        ["Drop-off döntési komplexitás (irány)", "20–40%", SRC_INDUSTRY],
      ],
      "r3-ban olyan mintát választasz, ami kosár és checkout döntési jeleket ad, nem csak oldalmegtekintést.",
      ["Intent", "Checkout jel", "Mérés"]
    ),
    need_new: e(
      "Gyorsan kell egy új webshop kísérlet, alacsony kockázattal.",
      "Nyomás van bevételjavításra, de nem fér bele egy teljes checkout redesign első körben.",
      "Pilot nélkül marad a hosszú backlog, kevés rövid távon mérhető eredménnyel.",
      [
        ["Embed / iframe go-live", "napok", SRC_PILOT],
        ["Fejlesztői függőség", "minimal", SRC_PILOT],
      ],
      "r3-ban gyorsan deployolható webshop mintát választasz, hogy rendelés- és checkout-hatás legyen mérhető.",
      ["Pilot", "Gyors go-live", "Bevételi jel"]
    ),
  },
};

/** EN: 12 routes — parallel structure to HU */
export const r2MatrixEn: R2ContentMatrix = {
  agency: {
    low_conversion: e(
      "Campaign traffic arrives, but the client site doesn’t decide.",
      "Ads bring clicks, yet the landing/product path doesn’t close — visitors drift back to browsing.",
      "Same spend, weaker outcomes: more revisions, less confident revenue for the client.",
      [
        ["No purchase due to overchoice (direction)", "64%", SRC_INDUSTRY_EN],
        ["Drop-off from decision complexity (direction)", "20–40%", SRC_INDUSTRY_EN],
      ],
      "In r3 we narrow to a deployment pattern (finder, qualification, campaign) that targets this decision gap.",
      ["Agency", "Client site", "Conversion"]
    ),
    choice_overload: e(
      "Too many variants, not enough guided decisions.",
      "Many A/Bs, offers, landings — visitors don’t know where to start, so the next step delays.",
      "Clients ask for “one more touchpoint” instead of simplification — complexity and delivery time grow.",
      [
        ["Purchase rate (24 vs 6 options, direction)", "3% vs 30%", SRC_INDUSTRY_EN],
        ["No purchase due to overchoice (direction)", "64%", SRC_INDUSTRY_EN],
      ],
      "In r3 we highlight a pattern that narrows options and adds a guided path.",
      ["Complex offer", "A/B stack", "Guided path"]
    ),
    no_visibility: e(
      "You can’t see where intent dies on the client site.",
      "There’s traffic, but no structured view of which step creates doubt — prioritisation becomes opinion-based.",
      "Teams debate “design vs offer” without a shared, measurable decision map.",
      [
        ["Drop-off from decision complexity (direction)", "20–40%", SRC_INDUSTRY_EN],
        ["Path + hesitation signals", "flow + events", SRC_PILOT_EN],
      ],
      "In r3 you pick a deployment that returns path-level signals — not just pageviews.",
      ["Client audit", "Prioritisation", "Measurement"]
    ),
    need_new: e(
      "The client needs a fast win — not weeks of discovery.",
      "Pressure for something new that ships quickly without opening the core stack.",
      "Without a low-risk pattern, every initiative becomes a “big integration” — go-live slips.",
      [
        ["Embed / iframe go-live", "days", SRC_PILOT_EN],
        ["Engineering dependency", "minimal", SRC_PILOT_EN],
      ],
      "In r3 we narrow to a pattern you can iframe-test at a client quickly.",
      ["Fast pilot", "Low risk", "Repeatable deploy"]
    ),
  },
  saas: {
    low_conversion: e(
      "Trials/traffic exist, but too little converts to value.",
      "Users reach signup, but setup and “why now” don’t compound — activation slows.",
      "CAC rises and cycles lengthen: fewer quality pipeline signals from the same top funnel.",
      [
        ["Conversion uplift (industry direction)", "+20–35%", SRC_INDUSTRY_EN],
        ["Activation / time-to-value", "downward pressure", SRC_PILOT_EN],
      ],
      "In r3 you choose a deployment (packaging, qualification) that shortens trial→value.",
      ["B2B SaaS", "Activation", "Pipeline"]
    ),
    choice_overload: e(
      "Too many plans/features — “which one is for me?” is hard.",
      "Pricing and feature matrices create doubt — users can’t map plans to real usage.",
      "Leads arrive, but qualification is weak — lots of “maybe later”, few confident next steps.",
      [
        ["Purchase rate (24 vs 6 options, direction)", "3% vs 30%", SRC_INDUSTRY_EN],
        ["No purchase due to overchoice (direction)", "64%", SRC_INDUSTRY_EN],
      ],
      "In r3 we emphasise packaging/qualification: fewer options, more guidance.",
      ["Pricing", "Plans", "Qualification"]
    ),
    no_visibility: e(
      "You can’t see where intent stalls on the product site.",
      "Analytics exists, but the decision path is missing — which question stops users before sales?",
      "Sales calls blind: lower meeting quality, longer cycles.",
      [
        ["Path + hesitation signals", "flow + events", SRC_PILOT_EN],
        ["Drop-off from decision complexity (direction)", "20–40%", SRC_INDUSTRY_EN],
      ],
      "In r3 you pick a deployment that surfaces intent/readiness — not just traffic.",
      ["Intent", "Handoff", "Sales enablement"]
    ),
    need_new: e(
      "You need a fast experiment — no time for a core rewrite.",
      "Something new that can produce measurable signals next sprint, not “roadmap Q3”.",
      "Without a pilot pattern, teams ship generic landings/forms — learning stays low.",
      [
        ["Embed / iframe go-live", "days", SRC_PILOT_EN],
        ["Pilot hypothesis", "A/B-ready", SRC_PILOT_EN],
      ],
      "In r3 you choose a pattern you can embed and measure quickly.",
      ["Pilot", "Sprint", "Measurement"]
    ),
  },
  webshop: {
    low_conversion: e(
      "Store traffic is present, but purchase progression is weak.",
      "Many users view product pages but do not move cleanly into cart or checkout.",
      "The same traffic produces fewer completed orders and weaker revenue output.",
      [
        ["No purchase due to overchoice (direction)", "64%", SRC_INDUSTRY_EN],
        ["Conversion uplift with guided decision layer (direction)", "+20–35%", SRC_INDUSTRY_EN],
      ],
      "In r3 we narrow to the deployment pattern that improves add-to-cart and checkout progression fastest.",
      ["PDP", "Cart", "Checkout"]
    ),
    choice_overload: e(
      "Too many product or variant options reduce buying confidence.",
      "Decision surfaces are overloaded with variants, bundles, upsells, and shipping trade-offs at once.",
      "Drop-off increases before order completion, hurting purchase conversion.",
      [
        ["Purchase rate (24 vs 6 options, direction)", "3% vs 30%", SRC_INDUSTRY_EN],
        ["Drop-off from decision complexity (direction)", "20–40%", SRC_INDUSTRY_EN],
      ],
      "In r3 we highlight a guided-choice pattern that narrows options and accelerates add-to-cart decisions.",
      ["Variants", "Guided choice", "Cart"]
    ),
    no_visibility: e(
      "You cannot clearly see where purchase intent is lost.",
      "Analytics exists, but decision-level signals are weak across PDP-to-cart-to-checkout flow.",
      "Optimization becomes guesswork, so conversion learning slows down.",
      [
        ["Path + hesitation signals", "flow + events", SRC_PILOT_EN],
        ["Drop-off from decision complexity (direction)", "20–40%", SRC_INDUSTRY_EN],
      ],
      "In r3 you choose a pattern that returns cart and checkout intent signals, not only page metrics.",
      ["Intent", "Checkout signal", "Measurement"]
    ),
    need_new: e(
      "You need a fast webshop experiment with low delivery risk.",
      "There is pressure to improve revenue, but a full checkout rebuild is too heavy for the first step.",
      "Without a pilot pattern, work stays in backlog while measurable progress remains limited.",
      [
        ["Embed / iframe go-live", "days", SRC_PILOT_EN],
        ["Engineering dependency", "minimal", SRC_PILOT_EN],
      ],
      "In r3 you pick a quickly deployable webshop pattern so order and checkout impact can be measured.",
      ["Pilot", "Fast go-live", "Revenue signal"]
    ),
  },
};

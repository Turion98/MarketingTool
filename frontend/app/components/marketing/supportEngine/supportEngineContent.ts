import type { UiLang } from "../useLang";

/**
 * A support-engine portfólió-oldal szövege. A szerkezet nyelv-kulcsos, hogy a
 * rendszer EN-re bővíthető legyen; jelenleg csak a `hu` ág töltött, az `en`
 * hiányában a `getSupportEngineCopy` HU-ra esik vissza (nincs üres EN oldal).
 *
 * A szöveg szó szerint a szerző kézirata; a strukturált mezők (szám-kártyák,
 * stepper-chipek) csak scannelhető kiemelést adnak, a `body` prózák hordozzák
 * a tényleges tartalmat.
 */
export interface Step {
  /** Sorszám a rail-badge-en, pl. "01". */
  n: string;
  /** Rövid, mono címke a lépéshez. */
  label: string;
  /** Kiemelt chipek — a lépés kulcs-számai / -tényei. */
  chips: string[];
  /** A lépés törzsszövege (a szerző prózája, 1:1). */
  body: string;
}

export interface SupportEngineCopy {
  hero: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    cta: string;
  };
  why: {
    title: string;
    lead: string;
    thesis: string;
    intro: string;
    control: string;
    artifact: { label: string; code: string };
    signpost: string;
  };
  proof: {
    caption: string;
    stats: { value: string; label: string }[];
  };
  turnCycle: {
    title: string;
    lead?: string;
    steps: Step[];
    outro?: string;
  };
  demo: {
    title: string;
    intro: string;
    tryLabel: string;
    tryIts: { prompt: string; outcome: string }[];
    bugLine: string;
    contactLabel: string;
  };
  buildPipeline: {
    title: string;
    lead?: string;
    phasesCaption: string;
    phases: Step[];
    cta: string;
  };
  closing: {
    text: string;
    repoLabel: string;
    contactLabel: string;
  };
}

export const SUPPORT_ENGINE_METADATA = {
  title: "Support engine",
  description:
    "Egy support munkatárs kommunikációs flow-ja szabálykönyvbe zárva: az AI érti " +
    "és fogalmaz, de semmiről nem dönt. Élő demó, kipróbálható motorral.",
} as const;

export const SUPPORT_ENGINE_LINKS = {
  /** A hero „Próbáld ki lent" CTA ide görget. */
  demoAnchor: "#demo",
  /** §6 gomb — az újratervezett onboarding-oldal (intro → lenyitható form → export). */
  onboardingDemoHref: "/projects/support-engine/onboarding",
  /** TODO: publikus GitHub repo URL. */
  repoUrl: "#",
  /** TODO: Kapcsolat (email vagy /about) — a felhasználó adja meg később. */
  contactHref: "#",
} as const;

const hu: SupportEngineCopy = {
  hero: {
    eyebrow: "Saját build. Élő demó lent.",
    headline:
      "Egy AI agent, ami úgy válaszol, mint egy figyelő ember. Mert nem felejthet.",
    subtitle:
      "A feltételek session-szintű flagek, nem a modell memóriája. Amit egyszer " +
      "elmondtál, azt nem kérdezi meg újra. Nem azért, mert emlékszik. Azért, mert " +
      "a szabály tiltja.",
    cta: "Próbáld ki lent",
  },
  why: {
    title: "Egy support munkatárs, szabálykönyvbe zárva",
    lead:
      "A korábbi projektem során egy évet töltöttem azzal, hogy döntési folyamatokat " +
      "modellezek: elágazások, feltételek, kimenetek, fájlba írva. Közben egyre többet " +
      "foglalkoztatott egy gondolat:",
    thesis:
      "Ha egy teljes döntéshozatali folyamat leírható így, akkor egy AI is bezárható " +
      "ugyanebbe a szabályrendszerbe.",
    intro:
      "Ezt akartam kipróbálni. Végigkövettem, hogyan kommunikál egy ügyfélszolgálati " +
      "munkatárs egy panasznál, mit kérdez, mikor, mire figyel, és ezt a flow-t írtam le " +
      "szabályzatként. Az ügyfél chatben mondja el, hogy késett a csomag vagy gyengül az " +
      "akkumulátor, a rendszer végigviszi a bejelentést, a helpdesk pedig kész, " +
      "strukturált ticketet kap.",
    control:
      "Az AI ebben semmiről nem dönt. Két dolga van: megérteni, mit írt az ügyfél, és " +
      "megfogalmazni a választ. Minden más a szabálykönyvben van, egy fájlban, amit ember " +
      "is el tud olvasni. Ezért minden válaszról pontosan megmondható, miért az született. " +
      "Azt akartam, hogy úgy fogalmazzon, mint egy figyelő ember, aki nem felejti el, amit " +
      "mondtál neki, de egyetlen lépést se találhasson ki magától.",
    artifact: {
      label: "delivery-issue — egy node a szabálykönyvből (részlet)",
      code: `"routing": [
  { "if": ["has_order_id", "marked_delivered_not_received",
           "tracking_checked", "surroundings_checked",
           "tracking_screenshot_provided"],
    "goto": "delivery-investigation" },
  { "if": ["has_order_id", "package_lost",
           "courier_contacted", "loss_confirmed"],
    "goto": "delivery-lost-courier-claim" },
  { "if": ["has_order_id", "delay_duration_known"],
    "goto": "investigate-delivery" }
],
"condition_implications": [
  { "when_all": ["marked_delivered_not_received"],
    "then": "delivery_situation_identified" }
]`,
    },
    signpost:
      "Lentebb megmutatom, mekkora ez a szabálykönyv, és mi történik egyetlen " +
      "ügyfélüzenet mögött. Élőben is kipróbálhatod. A végén pedig azt is, hogyan " +
      "születik egy ilyen szabálykönyv egy cég adataiból.",
  },
  proof: {
    caption: "Ekkora a szabálykönyv",
    stats: [
      {
        value: "8",
        label: "panasztípust ismer fel, késett csomagtól az aktivációs zárig.",
      },
      {
        value: "32",
        label:
          "így érhet véget egy beszélgetés, refundtól a platformtiltás " +
          "felülvizsgálatáig.",
      },
      {
        value: "100+",
        label:
          "különálló tényt tart számon egy session alatt, a rendelésszámtól a " +
          "szomszéd megkérdezéséig.",
      },
      {
        value: "58",
        label: "következtetést von le a motor magától, mielőtt az AI megszólal.",
      },
    ],
  },
  turnCycle: {
    title: "Mi történik, amikor az ügyfél ír",
    steps: [
      {
        n: "01",
        label: "Az AI olvas, szigorú keretben",
        chips: ["kényszerített extraction", "mezőszintű whitelist"],
        body:
          "Amikor bejön egy üzenet, először az AI olvassa el, de szigorú keretben. Egy " +
          "kényszerített extraction hívásban strukturáltan visszaadja, mit mondott az " +
          "ügyfél, és csak azokat a feltételeket állíthatja be, amiket az adott ponton a " +
          "szabálykönyv whitelist-je megenged. Ha valamit nem szabad neki, technikailag " +
          "sem tudja.",
      },
      {
        n: "02",
        label: "A motor dolgozik, modell nélkül",
        chips: ["58 következtetés", "kézbesítve ≠ elveszett"],
        body:
          "Utána a motor dolgozik, a modell nélkül. A rendelési adatokból magától vezet " +
          "le feltételeket, és az ötvennyolc következtetési szabály behúzza a logikai " +
          "következményeket. Ha például az ügyfél szerint nem érkezett meg a csomag, de a " +
          "tracking szerint kézbesítve, a motor tudja, hogy ez két külön helyzet, és nem " +
          "kezeli elveszettként, amíg az ügyfél nem ellenőrizte a szomszédnál és nem hívta " +
          "a futárt.",
      },
      {
        n: "03",
        label: "Routing, majd válasz",
        chips: ["a szabálykönyv dönt", "nincs kétszeres kérdés"],
        body:
          "Csak ezután dől el, merre megy a beszélgetés, a szabálykönyv alapján, a már " +
          "kiértékelt állapot felett. A válasz megfogalmazása az utolsó lépés. Ezért nem " +
          "kérdezi meg kétszer ugyanazt: mire fogalmazni kezd, már látja, mit tud. És ha " +
          "az ügyfél az első üzenetében mindent elmondott, az sem vész el, az extraction " +
          "az átugrott lépéseken is lefut.",
      },
    ],
    outro:
      "Van, amit szándékosan nem bízok az AI-ra. Ha kép érkezik, jelzi, de hogy mit " +
      "ábrázol, azt nem ő dönti el; a sérülést ember nézi meg a helpdesken. Dátumot sem " +
      "számol: hogy lejárt-e a visszaküldési ablak, vagy csúszik-e a visszatérítés, azt a " +
      "motor méri. A rendelés tényeit pedig nem kérdezi és nem tippeli, hanem az adatból " +
      "veszi: a garanciát, a fizetési módot, a termék eredeti állapotát. Ezek nem " +
      "véletlenek: minden ilyen ponton egy rossz AI-döntés valakinek pénzbe vagy bizalomba " +
      "kerülne.",
  },
  demo: {
    title: "Ne olvasd. Törd el.",
    intro:
      "Lent egy élő flow fut, mellette a state panel: az aktív lépés, a teljesült és " +
      "hiányzó feltételek, és körönként a napló arról, mit értett meg a modell és melyik " +
      "szabály döntött.",
    tryLabel: "Néhány kiindulópont",
    tryIts: [
      {
        prompt: "Add meg a rendelésszámot, mielőtt bárki kérné",
        outcome:
          "Nézd, ahogy a feltétel beáll, a rákérdező lépés pedig eltűnik az útból.",
      },
      {
        prompt:
          "Mondd, hogy nem kaptad meg a csomagot, pedig a tracking szerint kézbesítve",
        outcome:
          "Nézd, ahogy a rendszer nem elveszettként kezeli, hanem előbb a szomszédról és " +
          "a futárról kérdez.",
      },
      {
        prompt: "Írj valamit, aminek semmi köze a panaszhoz",
        outcome: "Nézd meg, hogyan terel vissza.",
      },
    ],
    bugLine:
      "Ha olyan viselkedést találsz, amit a panel nem magyaráz meg, az bug a " +
      "motorban. Írd meg.",
    contactLabel: "Kapcsolat",
  },
  buildPipeline: {
    title: "Brieftől a futó flow-ig",
    lead:
      "Az első szabálykönyvet hónapokig építettem kézzel. Node-onként tanultam meg, " +
      "mitől működik jól egy lépés és mitől törik el: milyen metaadat kell egy " +
      "lezáráshoz, mit kell átvinni egy témaváltásnál, melyik hiányzó szabály enged " +
      "kiskaput. Ebből a tapasztalatból lett egy checklist, a checklistből pedig " +
      "generálási kényszer: a pipeline már eleve ezek betartásával ír minden node-ot.",
    phasesCaption: "Maga a folyamat így néz ki.",
    phases: [
      {
        n: "01",
        label: "Brief",
        chips: ["csak amit a cég tudhat"],
        body:
          "Az elején egy strukturált brief: a cég visszaküldési feltételei, a " +
          "megoldások sorrendje, a helpdesk integrációja, az eszkalációs határai. Amit " +
          "publikus forrásból ki lehet nyerni, azt a rendszer nyeri ki, a brief csak azt " +
          "kérdezi, amit tényleg csak a cég tudhat.",
      },
      {
        n: "02",
        label: "Domain térkép",
        chips: ["mi jön a cégtől, mi az ügyféltől"],
        body:
          "A briefből előbb egy domain térkép készül: milyen panasztípusok vannak, " +
          "milyen feltételeket kell követni, mi jön a cég rendszereiből és mi az " +
          "ügyféltől.",
      },
      {
        n: "03",
        label: "Generálás + jóváhagyás",
        chips: ["11–13 perc", "validáció + emberi döntés"],
        body:
          "Ebből a térképből generálódik aztán node-onként a teljes szabálykönyv. A " +
          "bekért adatok és a kutatás után ez átlagosan 11-13 perc. Minden generált node " +
          "validáción megy át, és ami átmegy, azt is én nézem végig, mielőtt élesedik: a " +
          "generálás vázlatot ad, a döntés az enyém marad.",
      },
    ],
    cta: "Nézd meg az onboarding folyamatot",
  },
  closing: {
    text: "A teljes kódbázis a repóban ellenőrizhető.",
    repoLabel: "Repo",
    contactLabel: "Kapcsolat",
  },
};

export const SUPPORT_ENGINE_CONTENT: Partial<Record<UiLang, SupportEngineCopy>> = {
  hu,
};

export function getSupportEngineCopy(lang: UiLang): SupportEngineCopy {
  return SUPPORT_ENGINE_CONTENT[lang] ?? hu;
}

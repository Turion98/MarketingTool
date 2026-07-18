import type { UiLang } from "../useLang";

/**
 * Az onboarding portfólió-élmény introja. Ugyanaz a nyelv-kulcsos minta, mint a
 * support-engine oldalé (HU töltve, EN fallback HU-ra). A szöveg draft — a
 * szerző iterálja.
 */
export interface OnboardingStep {
  n: string;
  label: string;
  chips: string[];
  body: string;
}

export interface OnboardingCopy {
  eyebrow: string;
  title: string;
  lead: string;
  stepsCaption: string;
  steps: OnboardingStep[];
  meta: {
    caption: string;
    stats: { value: string; label: string }[];
    keyNote: string;
  };
  formGate: {
    collapsedTitle: string;
    collapsedNote: string;
    openButton: string;
    keyTitle: string;
    keyNote: string;
    keyPlaceholder: string;
    keyContinue: string;
    keyChange: string;
    confirmedNote: string;
  };
  signpost: string;
}

export const ONBOARDING_METADATA = {
  title: "Építs egy support agentet",
  description:
    "Töltsd ki a briefet a cégedről, a rendszer pedig felépít belőle egy működő " +
    "support agentet: domain-elemzés, node-onkénti generálás, letölthető szabálykönyv.",
} as const;

const hu: OnboardingCopy = {
  eyebrow: "Csináld magad",
  title: "Építs egy support agentet a saját cégedre",
  lead:
    "Amit a support-engine oldalon láttál, egy kész szabálykönyv. Itt magad is " +
    "végigviheted, honnan jön: kitöltesz egy briefet a cégedről, a rendszer pedig " +
    "felépít belőle egy működő support agentet.",
  stepsCaption: "Három lépés",
  steps: [
    {
      n: "01",
      label: "Brief",
      chips: ["6 kártya", "kitölthető"],
      body:
        "Megadod a cég szabályait: visszaküldés, garancia, a megoldások sorrendje, " +
        "helpdesk, hatáskör. Amit publikus forrásból ki lehet nyerni, azt a rendszer " +
        "kitölti helyetted.",
    },
    {
      n: "02",
      label: "Domain-elemzés",
      chips: ["mi jön a cégtől, mi az ügyféltől"],
      body:
        "A briefből a rendszer feltérképezi a te panasz-domainedet: milyen esetek " +
        "vannak, milyen feltételeket kell követni, mi jön a rendszereidből és mi az " +
        "ügyféltől.",
    },
    {
      n: "03",
      label: "Generálás",
      chips: ["node-onként", "validáció + emberi jóváhagyás"],
      body:
        "A térképből node-onként legenerálódik a teljes szabálykönyv, átfut a " +
        "validáción, és a végén egy működő agentet kapsz.",
    },
  ],
  meta: {
    caption: "Idő és költség",
    stats: [
      {
        value: "10–15 perc",
        label: "a teljes folyamat: domain-elemzés, majd node-onkénti generálás.",
      },
      {
        value: "~$5",
        label:
          "egy teljes futás a saját Anthropic-kulcsodon — a kritikus lépések Opuson, " +
          "a szöveg-passzok Sonneten.",
      },
    ],
    keyNote:
      "A form lenyílásakor kéri be a kulcsot, és a beküldés előtt még egyszer " +
      "megerősíted, mielőtt bármi elindulna.",
  },
  formGate: {
    collapsedTitle: "A brief itt nyílik meg",
    collapsedNote:
      "Hat kártya a cégedről. A megnyitáshoz megadod az Anthropic API-kulcsod — " +
      "ezen fut a generálás, és ez a te költséged.",
    openButton: "Nyisd meg a briefet",
    keyTitle: "Add meg az Anthropic API-kulcsod",
    keyNote:
      "A kulcs csak a böngésződben marad, ezen a munkameneten belül — nem tároljuk " +
      "és nem naplózzuk. A generálás a te kulcsodon fut; egy teljes futás nagyjából $5.",
    keyPlaceholder: "sk-ant-…",
    keyContinue: "Tovább a briefhez",
    keyChange: "Kulcs módosítása",
    confirmedNote:
      "A kulcs beállítva. A 6 kártyás brief + a coach ide kerül a következő lépésben.",
  },
  signpost:
    "A végén letöltöd a kész szabálykönyvet, és megkapod, hogyan ágyazd be, ha éles " +
    "felületen akarod használni.",
};

export const ONBOARDING_CONTENT: Partial<Record<UiLang, OnboardingCopy>> = { hu };

export function getOnboardingCopy(lang: UiLang): OnboardingCopy {
  return ONBOARDING_CONTENT[lang] ?? hu;
}

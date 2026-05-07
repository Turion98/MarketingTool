import type {
  PresentLang,
  PresentRole,
  PresentUsecase,
  R2ContentMatrix,
  R2HudByRole,
  R2OutcomeByRole,
  R2PainChoiceByRole,
  R2PromptByRole,
  R3ClosureByRolePain,
  R3ContentByPain,
} from "./presentDeck.types";
import {
  r2HudEn,
  r2HudHu,
  r2MatrixEn,
  r2MatrixHu,
  r2OutcomeByRoleEn,
  r2OutcomeByRoleHu,
  r2PainChoiceEn,
  r2PainChoiceHu,
  r2PromptByRoleEn,
  r2PromptByRoleHu,
} from "./presentR2Content";
import {
  r3ClosureEn,
  r3ClosureHu,
  r3ContentEn,
  r3ContentHu,
} from "./presentR3Content";

/** Hero: egy blokk, 2 bekezdéssor (intro törzs) */
export type PresentHeroBlocks = readonly [readonly [string, string]];

/** Két sor (cím + alcím vagy két bekezdés) */
export type FlowCarryoverPair = readonly [string, string];

/** r1 alsó info kártyák (0..n pár); üres = nincs info panel */
export type R1CarryoverBlocks = readonly FlowCarryoverPair[];

/** r2: opcionális carryover kártyák (üres tömb = nincs) */
export type R2CarryoverBlocks = readonly FlowCarryoverPair[];

export type PresentFlowUi = {
  /** Kétsoros hero főcím (régi landing szerkezete, új üzenettel) */
  heroTitleLine1: string;
  heroTitleLine2: string;
  /** Egy szövegblokk (intro törzs) */
  heroBlocks: PresentHeroBlocks;
  introCta: string;
  profileAria: string;
  /** r1 fázis főcíme (phaseTitle) */
  r1Prompt: string;
  /** r1: rövid subtext a cím alatt */
  r1Subtext: string;
  /** r1: opcionális harmadik sor */
  r1Micro?: string;
  /** r1: opcionális alsó info kártyák (üres tömb = elrejtve) */
  r1CarryoverBlocks: R1CarryoverBlocks;
  /** r2: opcionális carryover kártyák (üres = nincs) */
  r2CarryoverBlocks: R2CarryoverBlocks;
  /** r2: fő kérdés szerepkör szerint (gépelt első sor) */
  r2PromptByRole: R2PromptByRole;
  /** r2: pain gombok cím + törzs szerepkör szerint */
  r2PainChoiceByRole: R2PainChoiceByRole;
  /** r2: outcome szöveg a panelekben */
  r2OutcomeByRole: R2OutcomeByRole;
  /** r2: gépelős HUD szövegek szerepkör szerint (pain választás előtt) */
  r2HudByRole: R2HudByRole;
  /** r2: 12 út — szerepkör × súrlódás diagnosztika + adatok */
  r2Matrix: R2ContentMatrix;
  /** r3 dock / aria */
  r3Prompt: string;
  /** r3: fix jobb felső CTA gomb felirata (logó alatt) */
  r3DockCta: string;
  /** r3: pain szerinti HUD + narratív panelek */
  r3ContentByPain: R3ContentByPain;
  /** r3: role × pain összegző lezárás az utolsó panelhez */
  r3ClosureByRolePain: R3ClosureByRolePain;
  summaryHint: string;
  skipAll: string;
  back: string;
  restart: string;
  ctaQuote: string;
  ctaDemo: string;
  role: Record<PresentRole, string>;
  usecase: Record<PresentUsecase, string>;
};

export const presentFlowUiByLang: Record<PresentLang, PresentFlowUi> = {
  hu: {
    heroTitleLine1: "Döntésvezérelt",
    heroTitleLine2: "konverziós réteg",
    heroBlocks: [
      [
        "Egy élő döntési folyamat a meglévő oldaladon.",
        "A látogató nem csak néz — halad. Minden lépés egyértelműbbé teszi a következő döntést, a végén pedig nem „kitöltött kvíz”, hanem konkrét kimenet születik: termék, csomag vagy CTA.",
      ],
    ],
    profileAria: "Válaszd ki a profilodat a folytatáshoz",
    introCta: "Kezdjük",
    r1Prompt: "Kinek építesz?",
    r1Subtext: "Válassz szerepet. Onnantól a folyamat ehhez igazodik.",
    r1CarryoverBlocks: [],
    r2CarryoverBlocks: [],
    r2PromptByRole: r2PromptByRoleHu,
    r2PainChoiceByRole: r2PainChoiceHu,
    r2OutcomeByRole: r2OutcomeByRoleHu,
    r2HudByRole: r2HudHu,
    r2Matrix: r2MatrixHu,
    r3Prompt: "Mire szeretnéd elsőként bevetni?",
    r3DockCta: "Lássuk a megoldást",
    r3ContentByPain: r3ContentHu,
    r3ClosureByRolePain: r3ClosureHu,
    summaryHint: "Ez a te Questell-képed — az ajánlat és a következő lépés alul.",
    skipAll: "Átugrás — általános összegzés",
    back: "Vissza",
    restart: "Újrakezdés",
    ctaQuote: "Ajánlatkérés",
    ctaDemo: "Demók / élmények",
    role: {
      agency: "Ügynökség / partner",
      saas: "B2B SaaS",
      webshop: "Webshop",
    },
    usecase: {
      product_finder: "Ecommerce termékajánló (finder)",
      package_pick: "SaaS csomagválasztás",
      qualification: "Szolgáltatás kvalifikáció",
      campaign: "Kampány / landing engagement",
    },
  },
  en: {
    heroTitleLine1: "Decision-led",
    heroTitleLine2: "conversion layer",
    heroBlocks: [
      [
        "A live decision flow on your existing site.",
        "Visitors don't just look — they move. Each step makes the next decision clearer; at the end, it's not a filled-out quiz, but a concrete outcome: product, plan, or CTA.",
      ],
    ],
    profileAria: "Select your profile to continue",
    introCta: "Start",
    r1Prompt: "Who are you building for?",
    r1Subtext: "Pick a role. The flow adjusts from here.",
    r1CarryoverBlocks: [],
    r2CarryoverBlocks: [],
    r2PromptByRole: r2PromptByRoleEn,
    r2PainChoiceByRole: r2PainChoiceEn,
    r2OutcomeByRole: r2OutcomeByRoleEn,
    r2HudByRole: r2HudEn,
    r2Matrix: r2MatrixEn,
    r3Prompt: "What do you want to deploy first?",
    r3DockCta: "See the solution",
    r3ContentByPain: r3ContentEn,
    r3ClosureByRolePain: r3ClosureEn,
    summaryHint: "Your Questell snapshot — offer and next steps below.",
    skipAll: "Skip to general summary",
    back: "Back",
    restart: "Start over",
    ctaQuote: "Request a quote",
    ctaDemo: "View demos",
    role: {
      agency: "Agency / partner",
      saas: "B2B SaaS",
      webshop: "Webshop",
    },
    usecase: {
      product_finder: "Ecommerce product finder",
      package_pick: "SaaS packaging / plan choice",
      qualification: "Service qualification",
      campaign: "Campaign / landing engagement",
    },
  },
};

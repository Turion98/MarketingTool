export type PresentLang = "hu" | "en";

export type PresentPhase = "intro" | "r1" | "r2" | "r3" | "summary";

export type PresentRole = "agency" | "saas" | "webshop";

export type PresentPain =
  | "low_conversion"
  | "choice_overload"
  | "no_visibility"
  | "need_new";

export type PresentUsecase =
  | "product_finder"
  | "package_pick"
  | "qualification"
  | "campaign";

export type CardDensity = "hidden" | "short" | "medium" | "full";

export type VisualHint =
  | "none"
  | "embedFrame"
  | "twoColumn"
  | "statGrid"
  | "icpTags"
  | "useCaseTiles"
  | "stepFlow"
  | "snippetChecks"
  | "pipelineThree"
  | "proofSplit"
  | "compareColumns"
  | "checkTable"
  | "badgeRow"
  | "pricingGrid";

export type CardId =
  | "definition"
  | "outcome"
  | "problem_metrics"
  | "icp"
  | "use_cases"
  | "mechanism"
  | "integration"
  | "ai_layer"
  | "metrics_proof"
  | "competitive"
  | "closest_competitor"
  | "positioning_messaging"
  | "offer_pricing_cta";

export type CardVariantContent = {
  title: string;
  body?: string;
  bullets?: string[];
  stats?: { label: string; value: string }[];
  footnote?: string;
  badges?: string[];
  checklist?: { ok: boolean; label: string }[];
  pricing?: {
    name: string;
    price: string;
    detail: string;
  }[];
  checklistOffer?: string[];
};

export type CardDeckEntry = {
  visualHint: VisualHint;
  variants: Record<Exclude<CardDensity, "hidden">, CardVariantContent>;
};

export type PresentDeck = Record<CardId, CardDeckEntry>;

export type ResolvedCard = {
  id: CardId;
  density: Exclude<CardDensity, "hidden">;
  content: CardVariantContent;
  visualHint: VisualHint;
};

export type PresentChoiceDetail = {
  phase: PresentPhase;
  role: PresentRole | null;
  pain: PresentPain | null;
  usecase: PresentUsecase | null;
  choiceType?: "role" | "pain" | "usecase" | "start" | "skip" | "back";
  choiceValue?: string;
};

/** r2: egy válogatott stat + forrás-jelölés (iparági irány / belső pilot) */
export type R2ProofStat = {
  label: string;
  value: string;
  sourceNote: string;
};

/**
 * r2 diagnosztikai tartalom egy (szerepkör × súrlódás) útra.
 * QA: SaaS útvonalon kerüljük a webshop/brief nyelvet; agency-n a SaaS-only zsargon túlzását.
 */
export type R2ContentEntry = {
  headline: string;
  friction: string;
  businessImpact: string;
  /** max 2 elem a terv szerint */
  proofStats: [R2ProofStat] | [R2ProofStat, R2ProofStat];
  nextStep: string;
  fitTags: readonly [string, string, string];
};

export type R2ContentMatrix = Record<PresentRole, Record<PresentPain, R2ContentEntry>>;

/** r2 HUD (pain választás előtt): szerepkör-specifikus 3 sor a gépelős panelhez */
export type R2HudByRole = Record<
  PresentRole,
  { title: string; subtext: string; micro: string }
>;

/** r2: fő kérdés (szerepkör szerint), gépelős blokk első sora */
export type R2PromptByRole = Record<PresentRole, string>;

/** r2: pain választó kártya cím + rövid törzs */
export type R2PainChoiceLine = { title: string; body: string };

export type R2PainChoiceByRole = Record<
  PresentRole,
  Record<PresentPain, R2PainChoiceLine>
>;

/** r2: outcome szöveg a panelekben (lead + rest) */
export type R2OutcomeLine = { lead: string; rest: string };

export type R2OutcomeByRole = Record<PresentRole, R2OutcomeLine>;

/** r3 HUD: cím + szerepkör-specifikus alcím; micro üres (harmadik gépelős sor nincs) */
export type R3HudForPain = {
  title: string;
  subtextByRole: Record<PresentRole, string>;
  micro: string;
};

export type R3NarrativeSection = {
  title: string;
  body: readonly [string, string];
  bullets?: readonly [string, string, string];
};

export type R3EvidenceLine = {
  signal: string;
  proof: string;
  pattern: string;
};

export type R3ContentForPain = {
  shortLabel: string;
  hud: R3HudForPain;
  questellPrimer: R3NarrativeSection;
  painNarrative: R3NarrativeSection;
  evidenceLine: R3EvidenceLine;
  actionBridge: R3NarrativeSection;
};

export type R3ContentByPain = Record<PresentPain, R3ContentForPain>;
export type R3ClosureByRolePain = Record<
  PresentRole,
  Record<PresentPain, R3NarrativeSection>
>;

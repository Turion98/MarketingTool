import { presentDeckEn } from "./presentDeck.en";
import { presentDeckHu } from "./presentDeck.hu";
import type {
  CardDensity,
  CardId,
  PresentDeck,
  PresentLang,
  PresentPain,
  PresentPhase,
  PresentRole,
  PresentUsecase,
  ResolvedCard,
} from "./presentDeck.types";

export function getPresentDeck(lang: PresentLang): PresentDeck {
  return lang === "hu" ? presentDeckHu : presentDeckEn;
}

function resolveVariant(
  deck: PresentDeck,
  id: CardId,
  density: CardDensity
): ResolvedCard | null {
  if (density === "hidden") return null;
  const entry = deck[id];
  const content = entry.variants[density];
  return { id, density, content, visualHint: entry.visualHint };
}

function pushUnique(
  out: ResolvedCard[],
  card: ResolvedCard | null
): void {
  if (!card) return;
  if (out.some((c) => c.id === card.id)) return;
  out.push(card);
}

function problemDensityForPain(
  pain: PresentPain,
  phase: PresentPhase
): Exclude<CardDensity, "hidden"> {
  if (phase === "r2") return "medium";
  switch (pain) {
    case "choice_overload":
      return "full";
    case "low_conversion":
      return "short";
    case "no_visibility":
      return "medium";
    case "need_new":
    default:
      return "short";
  }
}

function icpDensity(role: PresentRole, phase: PresentPhase): Exclude<CardDensity, "hidden"> {
  if (phase === "r2") {
    if (role === "agency") return "full";
    if (role === "webshop") return "short";
    return "medium";
  }
  if (role === "agency") return "full";
  if (role === "webshop") return "short";
  return "medium";
}

function integrationDensity(
  role: PresentRole,
  phase: PresentPhase
): CardDensity {
  if (phase === "r3") {
    return role === "agency" ? "short" : "hidden";
  }
  if (role === "agency") return "full";
  return "medium";
}

function aiDensity(
  role: PresentRole,
  pain: PresentPain,
  usecase: PresentUsecase,
  phase: PresentPhase
): Exclude<CardDensity, "hidden"> {
  if (phase === "r3") {
    if (role === "saas") return "full";
    return "short";
  }
  if (pain === "need_new") return "short";
  if (role === "saas" || usecase === "package_pick") return "full";
  return "medium";
}

function metricsDensity(
  pain: PresentPain,
  role: PresentRole
): Exclude<CardDensity, "hidden"> {
  if (pain === "low_conversion" || role === "agency") return "full";
  if (pain === "choice_overload") return "medium";
  return "medium";
}

function competitiveDensity(
  role: PresentRole,
  usecase: PresentUsecase
): Exclude<CardDensity, "hidden"> {
  if (role === "agency" || usecase === "product_finder") return "full";
  if (role === "saas") return "short";
  return "medium";
}

function showClosestCompetitor(
  pain: PresentPain,
  usecase: PresentUsecase
): boolean {
  return usecase === "product_finder" || pain === "choice_overload";
}

export type PresentContext = {
  phase: PresentPhase;
  role: PresentRole | null;
  pain: PresentPain | null;
  usecase: PresentUsecase | null;
};

export function resolvePresentCards(
  lang: PresentLang,
  ctx: PresentContext
): ResolvedCard[] {
  const deck = getPresentDeck(lang);
  const { phase, role, pain, usecase } = ctx;
  const out: ResolvedCard[] = [];

  const r: PresentRole = role ?? "webshop";
  const p: PresentPain = pain ?? "need_new";
  const u: PresentUsecase = usecase ?? "product_finder";

  if (phase === "intro") {
    /* Intro: dedikált hero a komponensben, nem kártya-doboz */
    return out;
  }

  if (phase === "r1") {
    /* r1: csak szöveg a flow UI-ban, nincs deck-kártya */
    return out;
  }

  if (phase === "r2" && role) {
    /* r2: pain + szerepkör a deck felbontásához (presentR2Content.r2Matrix) */
    return out;
  }

  if (phase === "r3" && role && pain) {
    /* r3: dedikált narratív panelek a flow UI-ban (presentR3Content), deck-kártyák nélkül */
    return out;
  }

  if (phase === "summary" && role && pain && usecase) {
    pushUnique(out, resolveVariant(deck, "definition", "short"));
    pushUnique(out, resolveVariant(deck, "outcome", "medium"));
    pushUnique(
      out,
      resolveVariant(deck, "problem_metrics", problemDensityForPain(pain, "summary"))
    );
    pushUnique(out, resolveVariant(deck, "icp", icpDensity(role, "summary")));
    pushUnique(out, resolveVariant(deck, "use_cases", "full"));
    pushUnique(out, resolveVariant(deck, "mechanism", "full"));
    pushUnique(
      out,
      resolveVariant(deck, "integration", integrationDensity(role, "summary"))
    );
    pushUnique(
      out,
      resolveVariant(
        deck,
        "ai_layer",
        aiDensity(role, pain, usecase, "summary")
      )
    );
    pushUnique(
      out,
      resolveVariant(deck, "metrics_proof", metricsDensity(pain, role))
    );
    pushUnique(
      out,
      resolveVariant(deck, "competitive", competitiveDensity(role, usecase))
    );
    if (showClosestCompetitor(pain, usecase)) {
      pushUnique(out, resolveVariant(deck, "closest_competitor", "full"));
    }
    pushUnique(out, resolveVariant(deck, "positioning_messaging", "medium"));
    pushUnique(out, resolveVariant(deck, "offer_pricing_cta", "full"));
    return out;
  }

  pushUnique(out, resolveVariant(deck, "definition", "short"));
  return out;
}

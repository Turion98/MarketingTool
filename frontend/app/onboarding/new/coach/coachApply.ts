import type { BusinessModel, SupportChatbotBrief } from "../briefTypes";
import type { CoachSuggestion } from "./coachSession";

const BUSINESS_MODELS = new Set<BusinessModel>([
  "own_inventory",
  "marketplace",
  "dropship",
  "manufacturer",
]);

function parseBusinessModels(
  value: string | number | boolean | null,
): BusinessModel[] | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let parts: string[];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return null;
      parts = parsed.map((x) => String(x).trim());
    } catch {
      return null;
    }
  } else {
    parts = raw.split(/[,;]+/).map((s) => s.trim());
  }
  const models = parts.filter((p): p is BusinessModel =>
    BUSINESS_MODELS.has(p as BusinessModel),
  );
  return models.length > 0 ? models : null;
}

type Applier = (
  brief: SupportChatbotBrief,
  value: string | number | boolean | null,
) => SupportChatbotBrief;

const APPLIERS: Record<string, Applier> = {
  "card1.vendor_name": (b, v) => ({
    ...b,
    card1: { ...b.card1, vendor_name: String(v ?? "") },
  }),
  "card1.website_url": (b, v) => ({
    ...b,
    card1: { ...b.card1, website_url: v ? String(v) : null },
  }),
  "card1.business_models": (b, v) => {
    const models = parseBusinessModels(v);
    if (!models) return b;
    return { ...b, card1: { ...b.card1, business_models: models } };
  },
  "card4.scope_out_message": (b, v) => ({
    ...b,
    card4: { ...b.card4, scope_out_message: String(v ?? "") },
  }),
  "card5.off_topic": (b, v) => ({
    ...b,
    card5: {
      ...b.card5,
      off_topic: { ...b.card5.off_topic, redirect_message: String(v ?? "") },
    },
  }),
  "card5.off_topic.redirect_message": (b, v) => ({
    ...b,
    card5: {
      ...b.card5,
      off_topic: { ...b.card5.off_topic, redirect_message: String(v ?? "") },
    },
  }),
  "card2.returns.return_window_days": (b, v) => {
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (Number.isNaN(n)) return b;
    return {
      ...b,
      card2: {
        ...b.card2,
        returns: { ...b.card2.returns, return_window_days: n },
      },
    };
  },
};

export function canApplySuggestion(suggestion: CoachSuggestion): boolean {
  if (suggestion.apply_value === undefined) return false;
  return suggestion.target in APPLIERS;
}

export function applyCoachSuggestion(
  brief: SupportChatbotBrief,
  suggestion: CoachSuggestion,
): SupportChatbotBrief {
  if (suggestion.apply_value === undefined) return brief;
  const fn = APPLIERS[suggestion.target];
  if (!fn) return brief;
  return fn(brief, suggestion.apply_value);
}

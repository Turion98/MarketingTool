/**
 * localStorage-alapú draft kezelő a `SupportChatbotBrief` szerkesztéséhez.
 *
 * - Egy aktív draft per browser (kulcs: `questell:onboarding:brief:v1`).
 *   A `:v1` suffix ad lehetőséget jövőbeni schema-migrációra.
 * - Az `update*` setterek minden hívásra perzisztálnak (debounce-olva
 *   ~250ms-mal), így a user refresh után pontosan ott folytatja, ahol
 *   abbahagyta.
 * - A `resetDraft()` brand-new `brief_id`-t generál (új UUIDv4) — fontos,
 *   hogy a backend a két submit-et külön session-nek kezelje.
 * - `validity()` és `cardCompletion()` derivációk a progress bar-hoz.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  newEmptyBrief,
  emptySourceSlots,
  type BusinessModel,
  type EndNodeKind,
  type SupportChatbotBrief,
  type AvailabilitySlot,
} from "./briefTypes";
import { cloneDefaultExclusions } from "./card5Exclusions";

const STORAGE_KEY = "questell:onboarding:brief:v1";
const DEBOUNCE_MS = 250;

/** A 6 kártya rövid azonosítója — a progress bar és a card-jelölés ezt használja. */
export type CardId =
  | "card1"
  | "card2"
  | "card3"
  | "card4"
  | "card5"
  | "card6";

export const CARD_ORDER: CardId[] = [
  "card1",
  "card2",
  "card3",
  "card4",
  "card5",
  "card6",
];

export const CARD_LABELS: Record<CardId, string> = {
  card1: "Cégalapok",
  card2: "Működési politikák",
  card3: "Háttérrendszer",
  card4: "Visszajelző szövegek",
  card5: "Hatáskör és határok",
  card6: "Forrásdokumentumok",
};

/**
 * Kötelező-mező heuristic egy adott kártyához. Egyszerű, NEM teljes
 * Pydantic-validáció — a backend validál a `POST /jobs`-kor. Itt csak a
 * progress bar és a "tovább" gomb engedélyezésére.
 */
export function isCardComplete(
  brief: SupportChatbotBrief,
  card: CardId,
): boolean {
  switch (card) {
    case "card1": {
      const c = brief.card1;
      const hasVendor = c.vendor_name.trim().length >= 2;
      const modelsOk = c.business_models.length > 0;
      return hasVendor && modelsOk;
    }
    case "card2": {
      const c = brief.card2;
      const returnsOk = c.returns.return_window_days >= 0;
      const remedyOk = c.remedy.primary_remedy_order.length > 0;
      const refundOk = c.remedy.refund_time_quotable
        ? true
        : c.remedy.post_review_refund_timeline != null;
      const shippingOk =
        c.shipping.carriers.length > 0 &&
        (!c.shipping.carriers.includes("Other") ||
          (c.shipping.carrier_other_name ?? "").trim().length > 0);
      return returnsOk && remedyOk && refundOk && shippingOk;
    }
    case "card3": {
      const c = brief.card3;
      // Helpdesk: ha van, kell credentials.
      if (c.helpdesk.has_helpdesk && c.helpdesk.credentials == null) {
        return false;
      }
      // SLA: minden mező default-tal kitöltött, mindig OK.
      // Urgency: minden user-választás OK; ha `other`-szerű trigger jönne, kéne leírás.
      return true;
    }
    case "card4": {
      // Card 4 a Card 2 mentés után automatikusan generálódik AI-val.
      // A user csak akkor "complete", ha mind a 6 slot legalább `ai_prefilled`
      // (esetleg `user_edited` / `user_approved`) — `empty` blokkol.
      const slots = brief.card4.end_node_texts;
      return (Object.keys(slots) as EndNodeKind[]).every(
        (k) => slots[k].status !== "empty" && slots[k].content.trim().length > 0,
      );
    }
    case "card5": {
      const c = brief.card5;
      const redirectOk = c.off_topic.redirect_message.trim().length > 0;
      const teamOk =
        !c.support_availability.has_support_team ||
        c.support_availability.availability_slots.length > 0;
      return redirectOk && teamOk;
    }
    case "card6": {
      return true;
    }
  }
}

export interface CardCompletionMap {
  card1: boolean;
  card2: boolean;
  card3: boolean;
  card4: boolean;
  card5: boolean;
  card6: boolean;
}

export function cardCompletion(
  brief: SupportChatbotBrief,
  visited?: Set<CardId>,
): CardCompletionMap {
  const base = (card: CardId) => isCardComplete(brief, card);
  const withVisit = (card: CardId) =>
    visited ? visited.has(card) && base(card) : base(card);

  return {
    card1: withVisit("card1"),
    card2: withVisit("card2"),
    card3: withVisit("card3"),
    card4: withVisit("card4"),
    card5: withVisit("card5"),
    card6: withVisit("card6"),
  };
}

/** A 6 kártya completion-summary egy 0..6 számra normalizálva. */
export function completionScore(
  completion: CardCompletionMap,
): { done: number; total: number; ratio: number } {
  const total = CARD_ORDER.length;
  const done = CARD_ORDER.filter((c) => completion[c]).length;
  return { done, total, ratio: done / total };
}

/** Minimális feltétel a beküldés gombhoz: Card 1+2+3+5 kötelező mezők. */
export function canSubmitBrief(
  brief: SupportChatbotBrief,
): boolean {
  return (
    isCardComplete(brief, "card1") &&
    isCardComplete(brief, "card2") &&
    isCardComplete(brief, "card3") &&
    isCardComplete(brief, "card5")
  );
}

// --------------------------------------------------------------------------- //
// React hook                                                                  //
// --------------------------------------------------------------------------- //

export interface UseBriefDraftReturn {
  brief: SupportChatbotBrief;
  /** Replace-stílusú updater — visszakapja a régi briefet, dob újat. */
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
  /** Új, üres briefet generál (új brief_id). A localStorage-ot is törli. */
  resetDraft: () => void;
  hydrated: boolean;
  lastSavedAt: number | null;
}

function readFromStorage(): SupportChatbotBrief | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupportChatbotBrief;
    // Minimális sanity: `brief_id` és `schema_version` jelen, és a 6 kártya.
    if (
      typeof parsed.brief_id !== "string" ||
      parsed.schema_version !== "1.0" ||
      !parsed.card1 ||
      !parsed.card2 ||
      !parsed.card3 ||
      !parsed.card4 ||
      !parsed.card5 ||
      !parsed.card6
    ) {
      return null;
    }
    // v1 → v1.1 migráció: scope_out_message hiány esetén.
    if (typeof parsed.card4.scope_out_message !== "string") {
      parsed.card4.scope_out_message = "";
    }
    // Card 1 migráció: business_model → business_models
    const c1 = parsed.card1 as SupportChatbotBrief["card1"] & {
      business_model?: BusinessModel;
      product_categories?: unknown[];
    };
    if (!Array.isArray(c1.business_models)) {
      const legacy = (c1.business_model ?? "own_inventory") as string;
      const models: BusinessModel[] =
        legacy === "hybrid"
          ? ["own_inventory", "marketplace"]
          : [legacy as BusinessModel];
      c1.business_models = models.filter(
        (m) => (m as string) !== "hybrid",
      ) as BusinessModel[];
      if (c1.business_models.length === 0) {
        c1.business_models = ["own_inventory"];
      }
    }
    delete (c1 as { business_model?: unknown }).business_model;
    delete (c1 as { product_categories?: unknown }).product_categories;

    // Card 2 migráció: refund quotable mezők
    if (parsed.card2.remedy.refund_time_quotable === undefined) {
      parsed.card2.remedy.refund_time_quotable = true;
    }
    if (parsed.card2.remedy.post_review_refund_timeline === undefined) {
      parsed.card2.remedy.post_review_refund_timeline = null;
    }

    // Card 5 migráció: excluded_topics → off_topic_exclusions
    const ot = parsed.card5.off_topic as typeof parsed.card5.off_topic & {
      excluded_topics?: string | null;
    };
    if (!Array.isArray(ot.off_topic_exclusions)) {
      const defaults = cloneDefaultExclusions();
      const legacy = ot.excluded_topics?.trim();
      if (legacy) {
        defaults.push({
          id: `legacy_${Date.now()}`,
          label: legacy,
          enabled: true,
        });
      }
      ot.off_topic_exclusions = defaults;
    }
    delete (ot as { excluded_topics?: unknown }).excluded_topics;
    if (typeof parsed.card5.off_topic.question_limit !== "number") {
      parsed.card5.off_topic.question_limit = 2;
    }
    if (!Array.isArray(parsed.card5.off_topic.whitelist_extra_topics)) {
      parsed.card5.off_topic.whitelist_extra_topics = [];
    }
    const slotMap: Record<string, AvailabilitySlot> = {
      always: "24_7",
      weekdays_9_18: "weekdays_9_20",
      weekdays_8_20: "weekdays_9_20",
      weekdays_24h: "24_7",
      weekend_partial: "weekends_too",
      weekend_full: "weekends_too",
      custom: "weekdays_9_17",
    };
    parsed.card5.support_availability.availability_slots =
      (parsed.card5.support_availability.availability_slots ?? [])
        .map((s) => slotMap[s as string] ?? (s as AvailabilitySlot))
        .filter((s, i, arr) => arr.indexOf(s) === i);
    // Card 6 migráció: régi `attachments[]` → `slots` dict
    const c6 = parsed.card6 as SupportChatbotBrief["card6"] & {
      attachments?: unknown[];
    };
    if (!c6.slots) {
      parsed.card6 = { slots: emptySourceSlots() };
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(brief: SupportChatbotBrief): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(brief));
  } catch {
    // Quota / private mode — silently ignore. A user submit-re minden
    // adat felmegy a backend-re, így nem veszik el.
  }
}

export function useBriefDraft(): UseBriefDraftReturn {
  // Server-side render: mindig az empty brief, hidratálás után fent
  // szinkronizálódik a localStorage-ből. Ez elkerüli a hydration mismatchet.
  const [brief, setBrief] = useState<SupportChatbotBrief>(() => newEmptyBrief());
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydration: első render után megpróbáljuk a localStorage-ből beolvasni.
  useEffect(() => {
    const fromStorage = readFromStorage();
    if (fromStorage) {
      setBrief(fromStorage);
    }
    setHydrated(true);
  }, []);

  // Debounced perzisztálás minden changeset után (csak hydration után).
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      writeToStorage(brief);
      setLastSavedAt(Date.now());
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [brief, hydrated]);

  const updateBrief = useCallback(
    (updater: (prev: SupportChatbotBrief) => SupportChatbotBrief) => {
      setBrief((prev) => updater(prev));
    },
    [],
  );

  const resetDraft = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignored.
      }
    }
    setBrief(newEmptyBrief());
  }, []);

  return { brief, updateBrief, resetDraft, hydrated, lastSavedAt };
}

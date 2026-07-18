/**
 * Frontend TypeScript tükre a backend `services.onboarding.brief_contracts`
 * Pydantic modelljeinek.
 *
 * Itt MINDEN mezőnél a Pydantic `default_factory` és `default` értékeit
 * hűen átvesszük. Az `extra="forbid"` szemantikát a TS strict object literal
 * checking adja vissza. A discriminated union (`HelpdeskCredentials.kind`)
 * TypeScript-ben tagged union-ként implementálva.
 *
 * A snake_case mezőneveket szándékosan megtartjuk — a backend és a JSON
 * payload ugyanezt használja, így a kerítés mindkét irányban (typed
 * fetch helpers) zökkenőmentes.
 */

import { cloneDefaultExclusions } from "./card5Exclusions";

// --------------------------------------------------------------------------- //
// Common enums                                                                //
// --------------------------------------------------------------------------- //

export type Locale = "hu" | "en" | "de";

export type BusinessModel =
  | "own_inventory"
  | "marketplace"
  | "dropship"
  | "manufacturer";

export type TargetMarket = "b2c" | "b2b" | "mixed";

export type CategoryKind =
  | "electronics"
  | "fashion"
  | "home"
  | "beauty"
  | "food"
  | "perishable"
  | "books_media"
  | "sports"
  | "kids"
  | "automotive"
  | "other";

export type ReturnWindowStartsFrom = "delivery" | "shipment" | "order";

export type ReturnShippingPaidBy = "customer" | "company" | "case_by_case";

export type RemedyKind =
  | "refund"
  | "replacement"
  | "repair"
  | "store_credit"
  | "partial_refund";

export type RefundTimeline =
  | "3_business_days"
  | "5_7_business_days"
  | "8_14_business_days"
  | "15_30_days"
  | "case_by_case";

export type InstantReplacementOption = "always" | "if_in_stock" | "no";

export type LostPackageHandledBy = "company" | "customer";

export type DamageReportWindowUnit = "hours" | "days";

export type CarrierName =
  | "GLS"
  | "DPD"
  | "FoxPost"
  | "MPL"
  | "DHL"
  | "Sameday"
  | "UPS"
  | "FedEx"
  | "Other";

export type UrgencyTrigger =
  | "battery_safety"
  | "perishable_food"
  | "medical_use"
  | "child_safety"
  | "data_loss_risk"
  | "scheduled_event_dependency";

export type EndNodeKind =
  | "return_accepted"
  | "refund_initiated"
  | "replacement_initiated"
  | "warranty_investigation"
  | "lost_package"
  | "expired_return_deadline";

export type AvailabilitySlot =
  | "weekdays_9_17"
  | "weekdays_9_20"
  | "weekends_too"
  | "24_7";

/** Card 6 fix forrás-dokumentum slot kulcsai (backend kontrakt). */
export type SourceDocumentKind =
  | "gtc"
  | "warranty_terms"
  | "faq"
  | "product_grades"
  | "past_tickets"
  | "return_process";

export type SourceDocumentPriority =
  | "required"
  | "strongly_recommended"
  | "recommended"
  | "optional";

export type AttachmentInputKind = "file" | "url" | "text";

// --------------------------------------------------------------------------- //
// Card 1 — Company basics                                                    //
// --------------------------------------------------------------------------- //

export interface CategoryEntry {
  category: CategoryKind;
  share_pct: number; // 1..100
  /** Required when `category === "other"`. */
  other_description?: string | null;
}

export interface Card1CompanyBasics {
  vendor_name: string;
  website_url?: string | null;
  business_models: BusinessModel[];
  target_market: TargetMarket;
  locale: Locale;
}

// --------------------------------------------------------------------------- //
// Card 2 — Operations                                                        //
// --------------------------------------------------------------------------- //

export interface CategoryReturnWindow {
  category: CategoryKind;
  return_window_days: number; // 0..365
  /** Required when `category === "other"`. */
  other_description?: string | null;
  notes?: string | null;
}

export interface Card2aReturns {
  return_window_days: number; // 0..365
  category_specific_windows: CategoryReturnWindow[];
  return_window_starts_from: ReturnWindowStartsFrom;
  return_shipping_paid_by: ReturnShippingPaidBy;
  free_return_threshold_huf?: number | null;
}

export interface Card2bRemedy {
  has_own_repair_capacity: boolean;
  repair_capacity_notes?: string | null;
  primary_remedy_order: RemedyKind[];
  instant_replacement: InstantReplacementOption;
  /** A bot megadhatja-e a visszatérítés idejét a vásárlónak. */
  refund_time_quotable: boolean;
  refund_timeline: RefundTimeline;
  /** Ha nem quotable: emberi vizsgálat utáni időablak. */
  post_review_refund_timeline: RefundTimeline | null;
  partial_refund_threshold_pct?: number | null;
}

export interface Card2cShipping {
  carriers: CarrierName[];
  /** Required when `carriers` includes `"Other"`. */
  carrier_other_name?: string | null;
  lost_package_handled_by: LostPackageHandledBy;
  damage_report_window_value: number;
  damage_report_window_unit: DamageReportWindowUnit;
}

export interface Card2Operations {
  returns: Card2aReturns;
  remedy: Card2bRemedy;
  shipping: Card2cShipping;
}

// --------------------------------------------------------------------------- //
// Card 3 — Backend integration                                               //
// --------------------------------------------------------------------------- //

export type HelpdeskCredentials =
  | { kind: "zendesk"; subdomain: string; api_token?: string | null }
  | { kind: "freshdesk"; subdomain: string; api_key?: string | null }
  | { kind: "hubspot"; portal_id: string; api_token?: string | null }
  | { kind: "webhook"; url: string; auth_header?: string | null };

export interface Card3aHelpdesk {
  has_helpdesk: boolean;
  credentials?: HelpdeskCredentials | null;
  ticket_routing_notes?: string | null;
}

export interface Card3bSla {
  first_response_time: "1h" | "4h" | "24h" | "48h" | "72h" | "case_by_case";
  resolution_time: "24h" | "48h" | "72h" | "5d" | "7d" | "case_by_case";
  urgent_response: "15min" | "1h" | "4h" | "24h" | "case_by_case";
}

export interface Card3cUrgency {
  triggers: UrgencyTrigger[];
  other_triggers_description?: string | null;
}

export interface Card3Backend {
  helpdesk: Card3aHelpdesk;
  sla: Card3bSla;
  urgency: Card3cUrgency;
}

// --------------------------------------------------------------------------- //
// Card 4 — Output texts (state machine)                                       //
// --------------------------------------------------------------------------- //

export type AiPrefilledStatus =
  | "empty"
  | "ai_generating"
  | "ai_prefilled"
  | "user_edited"
  | "user_approved";

export interface AiPrefilledText {
  status: AiPrefilledStatus;
  content: string;
  last_ai_generated_at?: string | null; // ISO 8601
  last_user_edited_at?: string | null;
  last_user_approved_at?: string | null;
}

/** Card 4 default value: 6 slot mind "empty" status-szal. */
export type Card4EndNodeTexts = Record<EndNodeKind, AiPrefilledText>;

export interface Card4Output {
  end_node_texts: Card4EndNodeTexts;
  /** Kötelező manuális mező: mit mondjon a bot scope-on kívüli kérésnél. */
  scope_out_message: string;
}

// --------------------------------------------------------------------------- //
// Card 5 — Boundaries                                                        //
// --------------------------------------------------------------------------- //

export interface OffTopicExclusion {
  id: string;
  label: string;
  enabled: boolean;
}

export interface Card5aOffTopic {
  /** Hány off-topic kérdésre válaszoljon mielőtt visszaterel. */
  question_limit: number;
  redirect_message: string;
  /** Kurált, kapcsolható kizárási lista. */
  off_topic_exclusions: OffTopicExclusion[];
  /** Extra engedélyezett témák (chip lista). */
  whitelist_extra_topics: string[];
}

export interface Card5bSupportAvailability {
  has_support_team: boolean;
  availability_slots: AvailabilitySlot[];
  custom_availability_text?: string | null;
  contact_methods: ContactMethod[];
}

export type ContactMethodKind = "email" | "phone" | "form" | "whatsapp" | "messenger";

export interface ContactMethod {
  kind: ContactMethodKind;
  value: string;
}

export interface Card5Boundaries {
  off_topic: Card5aOffTopic;
  support_availability: Card5bSupportAvailability;
}

// --------------------------------------------------------------------------- //
// Card 6 — Source documents                                                  //
// --------------------------------------------------------------------------- //

export interface SourceAttachment {
  id: string;
  kind: AttachmentInputKind;
  name: string;
  raw_text_preview?: string | null;
  source_url?: string | null;
}

export interface SourceDocumentSlot {
  kind: SourceDocumentKind;
  attachments: SourceAttachment[];
}

export interface Card6Sources {
  slots: Record<SourceDocumentKind, SourceDocumentSlot>;
}

// --------------------------------------------------------------------------- //
// Aggregate brief                                                            //
// --------------------------------------------------------------------------- //

export interface SupportChatbotBrief {
  brief_id: string; // UUIDv4
  schema_version: "1.0";
  card1: Card1CompanyBasics;
  card2: Card2Operations;
  card3: Card3Backend;
  card4: Card4Output;
  card5: Card5Boundaries;
  card6: Card6Sources;
}

// --------------------------------------------------------------------------- //
// Defaults — egy üres brief, ami a UI első renderéhez kell                   //
// --------------------------------------------------------------------------- //

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const SOURCE_DOC_KINDS: SourceDocumentKind[] = [
  "gtc",
  "warranty_terms",
  "faq",
  "product_grades",
  "past_tickets",
  "return_process",
];

function emptySourceSlots(): Record<SourceDocumentKind, SourceDocumentSlot> {
  const out = {} as Record<SourceDocumentKind, SourceDocumentSlot>;
  for (const kind of SOURCE_DOC_KINDS) {
    out[kind] = { kind, attachments: [] };
  }
  return out;
}

const END_NODE_KINDS: EndNodeKind[] = [
  "return_accepted",
  "refund_initiated",
  "replacement_initiated",
  "warranty_investigation",
  "lost_package",
  "expired_return_deadline",
];

function emptyEndNodeTexts(): Card4EndNodeTexts {
  const out: Partial<Card4EndNodeTexts> = {};
  for (const kind of END_NODE_KINDS) {
    out[kind] = { status: "empty", content: "" };
  }
  return out as Card4EndNodeTexts;
}

/**
 * Generál egy UUIDv4-et böngészőben — `crypto.randomUUID()`-t használ,
 * fallback-tel a `Math.random()` alapú string-re (jó-elég-formátum,
 * a backend csak Pydantic `Field(default_factory=uuid4)`-tel összehasonlítva
 * fogadja el — minden brief_id stringe valid UUID kell legyen).
 */
function newBriefId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (régi böngészőkre — formátum-pontos, nem kriptográfiailag biztos).
  const hex = "0123456789abcdef";
  const buf = Array.from({ length: 32 }, () =>
    hex[Math.floor(Math.random() * 16)],
  );
  buf[12] = "4";
  buf[16] = hex[(Math.floor(Math.random() * 4)) + 8];
  return (
    buf.slice(0, 8).join("") +
    "-" +
    buf.slice(8, 12).join("") +
    "-" +
    buf.slice(12, 16).join("") +
    "-" +
    buf.slice(16, 20).join("") +
    "-" +
    buf.slice(20, 32).join("")
  );
}

export { newAttachmentId, SOURCE_DOC_KINDS, emptySourceSlots };

/** Üres brief, default értékekkel. A user a UI-on tölti fel. */
export function newEmptyBrief(): SupportChatbotBrief {
  return {
    brief_id: newBriefId(),
    schema_version: "1.0",
    card1: {
      vendor_name: "",
      website_url: null,
      business_models: ["own_inventory"],
      target_market: "b2c",
      locale: "hu",
    },
    card2: {
      returns: {
        return_window_days: 14,
        category_specific_windows: [],
        return_window_starts_from: "delivery",
        return_shipping_paid_by: "customer",
        free_return_threshold_huf: null,
      },
      remedy: {
        has_own_repair_capacity: false,
        repair_capacity_notes: null,
        primary_remedy_order: ["refund"],
        instant_replacement: "no",
        refund_time_quotable: true,
        refund_timeline: "5_7_business_days",
        post_review_refund_timeline: null,
        partial_refund_threshold_pct: null,
      },
      shipping: {
        carriers: [],
        carrier_other_name: null,
        lost_package_handled_by: "company",
        damage_report_window_value: 48,
        damage_report_window_unit: "hours",
      },
    },
    card3: {
      helpdesk: {
        has_helpdesk: false,
        credentials: null,
        ticket_routing_notes: null,
      },
      sla: {
        first_response_time: "24h",
        resolution_time: "48h",
        urgent_response: "4h",
      },
      urgency: {
        triggers: [],
        other_triggers_description: null,
      },
    },
    card4: {
      end_node_texts: emptyEndNodeTexts(),
      scope_out_message: "",
    },
    card5: {
      off_topic: {
        question_limit: 2,
        redirect_message:
          "Ez a kérdés kívül esik azon, amiben segíteni tudok. Visszaküldési, garanciális vagy szállítási problémában tudok segíteni — van ilyen jellegű kérdésed?",
        off_topic_exclusions: cloneDefaultExclusions(),
        whitelist_extra_topics: [],
      },
      support_availability: {
        has_support_team: false,
        availability_slots: [],
        custom_availability_text: null,
        contact_methods: [],
      },
    },
    card6: {
      slots: emptySourceSlots(),
    },
  };
}

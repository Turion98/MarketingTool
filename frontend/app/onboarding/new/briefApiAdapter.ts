/**
 * Frontend `SupportChatbotBrief` → backend Pydantic kontrakt JSON.
 *
 * A frontend és backend séma szándékosan eltérő részletekkel rendelkezik;
 * az API hívások előtt ezt az adaptert használjuk. A Card 4 generálás
 * csak Card 1+2 (+ opcionális scope_out) kontextust igényel, de a
 * teljes brief-et küldjük a konzisztencia miatt.
 */

import type { RefundTimeline, SupportChatbotBrief } from "./briefTypes";
import { exclusionsToBackendString } from "./card5Exclusions";
import { END_NODE_KINDS } from "./card4Utils";
import { SOURCE_DOC_KINDS } from "./card6Utils";

function mapBusinessModels(
  models: SupportChatbotBrief["card1"]["business_models"],
): "own_inventory" | "marketplace" | "both" {
  if (models.length === 0) return "own_inventory";
  const set = new Set(models);
  if (set.has("marketplace") && set.has("own_inventory")) return "both";
  if (models.length > 1) return "both";
  if (set.has("marketplace")) return "marketplace";
  return "own_inventory";
}

function mapTargetMarket(
  v: SupportChatbotBrief["card1"]["target_market"],
): "b2c" | "b2b" | "both" {
  if (v === "b2b") return "b2b";
  if (v === "mixed") return "both";
  return "b2c";
}

function mapLocale(v: SupportChatbotBrief["card1"]["locale"]): "hu" | "en" {
  return v === "hu" ? "hu" : "en";
}

function mapRefundTimeline(
  v: RefundTimeline,
): {
  refund_timeline: "3_business_days" | "5_7_business_days" | "14_business_days" | "other";
  refund_timeline_other?: string | null;
} {
  switch (v) {
    case "3_business_days":
      return { refund_timeline: "3_business_days" };
    case "5_7_business_days":
      return { refund_timeline: "5_7_business_days" };
    case "8_14_business_days":
      return { refund_timeline: "14_business_days" };
    case "15_30_days":
      return {
        refund_timeline: "other",
        refund_timeline_other: "15–30 nap",
      };
    case "case_by_case":
      return {
        refund_timeline: "other",
        refund_timeline_other: "Esetenként",
      };
    default:
      return { refund_timeline: "5_7_business_days" };
  }
}

function mapRemedyRefund(
  remedy: SupportChatbotBrief["card2"]["remedy"],
): {
  refund_timeline: "3_business_days" | "5_7_business_days" | "14_business_days" | "other";
  refund_timeline_other?: string | null;
} {
  if (remedy.refund_time_quotable) {
    return mapRefundTimeline(remedy.refund_timeline);
  }
  const post = remedy.post_review_refund_timeline ?? "case_by_case";
  const mapped = mapRefundTimeline(post);
  return {
    refund_timeline: "other",
    refund_timeline_other: `Emberi vizsgálat után: ${mapped.refund_timeline_other ?? timelineLabel(post)}`,
  };
}

function timelineLabel(v: RefundTimeline): string {
  switch (v) {
    case "3_business_days":
      return "3 munkanapon belül";
    case "5_7_business_days":
      return "5–7 munkanapon belül";
    case "8_14_business_days":
      return "8–14 munkanapon belül";
    case "15_30_days":
      return "15–30 napon belül";
    case "case_by_case":
      return "Esetenként";
    default:
      return "5–7 munkanapon belül";
  }
}

function mapCarriers(carriers: SupportChatbotBrief["card2"]["shipping"]["carriers"]) {
  const known = new Set(["DPD", "DHL", "GLS", "FedEx", "UPS"]);
  const mapped: string[] = [];
  let otherLabel: string | null = null;
  for (const c of carriers) {
    if (c === "Other") {
      mapped.push("other");
    } else if (known.has(c)) {
      mapped.push(c);
    } else {
      mapped.push("other");
      otherLabel = otherLabel ? `${otherLabel}, ${c}` : c;
    }
  }
  return { carriers: mapped.length ? mapped : ["other"], carrier_other_label: otherLabel };
}

function mapLostPackage(
  v: SupportChatbotBrief["card2"]["shipping"]["lost_package_handled_by"],
): "company" | "customer" | "case_by_case" {
  return v;
}

function mapNormalSla(
  v: SupportChatbotBrief["card3"]["sla"]["first_response_time"],
): "24h" | "48h" | "72h" | "1_week" {
  if (v === "48h" || v === "72h") return v;
  if (v === "case_by_case") return "1_week";
  return "24h";
}

function mapUrgentSla(
  v: SupportChatbotBrief["card3"]["sla"]["urgent_response"],
): "1h" | "4h" | "24h" {
  if (v === "4h" || v === "24h") return v;
  return "1h";
}

function mapHelpdeskCredentials(
  creds: NonNullable<SupportChatbotBrief["card3"]["helpdesk"]["credentials"]>,
): Record<string, unknown> | null {
  switch (creds.kind) {
    case "zendesk":
      if (!creds.api_token) return null;
      return {
        provider: "zendesk",
        subdomain: creds.subdomain,
        api_token: creds.api_token,
      };
    case "freshdesk":
      if (!creds.api_key) return null;
      return {
        provider: "freshdesk",
        subdomain: creds.subdomain,
        api_key: creds.api_key,
      };
    case "hubspot":
      if (!creds.api_token) return null;
      return {
        provider: "hubspot",
        oauth_access_token: creds.api_token,
        portal_id: creds.portal_id,
      };
    case "webhook":
      return {
        provider: "other",
        webhook_url: creds.url,
        auth_header: creds.auth_header ?? null,
      };
  }
}

function mapUrgencyTriggers(
  triggers: SupportChatbotBrief["card3"]["urgency"]["triggers"],
  otherDesc: string | null | undefined,
): { triggers: string[]; other_triggers_description?: string | null } {
  const backendKnown = new Set([
    "battery_safety",
    "dead_on_arrival",
    "lost_package_urgent",
    "expired_refund_deadline",
  ]);
  const out = new Set<string>(["battery_safety"]);
  const extras: string[] = [];
  for (const t of triggers) {
    if (t === "battery_safety") continue;
    if (backendKnown.has(t)) {
      out.add(t);
    } else {
      extras.push(t);
    }
  }
  const otherText =
    otherDesc?.trim() ||
    (extras.length ? extras.join(", ") : null);
  if (otherText) {
    out.add("other");
    return {
      triggers: [...out],
      other_triggers_description: otherText,
    };
  }
  return { triggers: [...out] };
}

function defaultSourceSlots(): Record<string, { kind: string; attachments: unknown[] }> {
  const slots: Record<string, { kind: string; attachments: unknown[] }> = {};
  for (const k of SOURCE_DOC_KINDS) {
    slots[k] = { kind: k, attachments: [] };
  }
  return slots;
}

function mapCard6Slots(
  brief: SupportChatbotBrief,
): Record<string, { kind: string; attachments: unknown[] }> {
  const slots = defaultSourceSlots();
  for (const kind of SOURCE_DOC_KINDS) {
    const slot = brief.card6.slots[kind];
    if (!slot) continue;
    slots[kind] = {
      kind,
      attachments: slot.attachments
        .filter((a) => a.name.trim() || a.source_url || a.raw_text_preview)
        .map((a) => {
          if (a.kind === "url") {
            return {
              kind: "url",
              name: a.name.trim() || a.source_url || "URL",
              raw_text_preview: null,
            };
          }
          if (a.kind === "text") {
            return {
              kind: "text",
              name: a.name.trim() || "Szöveg",
              raw_text_preview: (a.raw_text_preview ?? "").slice(0, 8000) || null,
            };
          }
          return {
            kind: "file",
            name: a.name.trim() || "file",
            raw_text_preview: (a.raw_text_preview ?? "").slice(0, 8000) || null,
            byte_size: null,
          };
        }),
    };
  }
  return slots;
}

export type ApiBriefDraftStatus = "draft" | "ready_to_build";

export interface ToApiBriefOptions {
  draftStatus?: ApiBriefDraftStatus;
}

/** Backend-kompatibilis brief JSON a REST API-hoz. */
export function toApiBrief(
  brief: SupportChatbotBrief,
  options?: ToApiBriefOptions,
): Record<string, unknown> {
  const refund = mapRemedyRefund(brief.card2.remedy);
  const carrierMap = mapCarriers(brief.card2.shipping.carriers);
  const remedyOrder = brief.card2.remedy.primary_remedy_order.filter(
    (r) => r !== "store_credit",
  ) as Array<"refund" | "replacement" | "repair" | "partial_refund">;

  const endNodeTexts: Record<string, unknown> = {};
  for (const kind of END_NODE_KINDS) {
    const slot = brief.card4.end_node_texts[kind];
    endNodeTexts[kind] = {
      status: slot.status === "ai_generating" ? "empty" : slot.status,
      content: slot.content,
      last_ai_generated_at: slot.last_ai_generated_at,
      last_user_edited_at: slot.last_user_edited_at ?? null,
      last_user_approved_at: slot.last_user_approved_at ?? null,
    };
  }

  const helpdesk = brief.card3.helpdesk;
  let credentials: Record<string, unknown> | null = null;
  if (helpdesk.has_helpdesk && helpdesk.credentials) {
    credentials = mapHelpdeskCredentials(helpdesk.credentials);
  }

  const urgency = mapUrgencyTriggers(
    brief.card3.urgency.triggers,
    brief.card3.urgency.other_triggers_description,
  );

  return {
    brief_id: brief.brief_id,
    draft_status: options?.draftStatus ?? "draft",
    card1: {
      vendor_name: brief.card1.vendor_name.trim() || "Vendor",
      business_model: mapBusinessModels(brief.card1.business_models),
      target_market: mapTargetMarket(brief.card1.target_market),
      locale: mapLocale(brief.card1.locale),
      website_url: brief.card1.website_url ?? null,
    },
    card2: {
      returns: {
        return_window_days: Math.max(1, brief.card2.returns.return_window_days),
        return_window_starts_from:
          brief.card2.returns.return_window_starts_from === "order"
            ? "order"
            : "delivery",
        has_category_specific_windows: false,
        category_specific_windows: [],
        condition_requirements: [],
        return_shipping_paid_by: brief.card2.returns.return_shipping_paid_by,
      },
      remedy: {
        has_own_repair_capacity: brief.card2.remedy.has_own_repair_capacity,
        primary_remedy_order:
          remedyOrder.length > 0 ? remedyOrder : (["refund"] as const),
        instant_replacement: brief.card2.remedy.instant_replacement,
        refund_timeline: refund.refund_timeline,
        refund_timeline_other: refund.refund_timeline_other ?? null,
        has_extended_warranty: false,
        extended_warranty_coverage: null,
      },
      shipping: {
        carriers: carrierMap.carriers,
        carrier_other_label:
          carrierMap.carrier_other_label ??
          brief.card2.shipping.carrier_other_name ??
          null,
        lost_package_handled_by: mapLostPackage(
          brief.card2.shipping.lost_package_handled_by,
        ),
        damage_report_window_value: brief.card2.shipping.damage_report_window_value,
        damage_report_window_unit: brief.card2.shipping.damage_report_window_unit,
      },
    },
    card3: {
      helpdesk: {
        has_helpdesk: helpdesk.has_helpdesk,
        credentials,
        connection_state: "disconnected",
        last_test_error: null,
        discovered_meta: null,
      },
      sla: {
        normal_response: mapNormalSla(brief.card3.sla.first_response_time),
        urgent_response: mapUrgentSla(brief.card3.sla.urgent_response),
      },
      urgency,
    },
    card4: {
      end_node_texts: endNodeTexts,
      scope_out_message: brief.card4.scope_out_message,
    },
    card5: {
      off_topic: {
        question_limit: brief.card5.off_topic.question_limit,
        redirect_message: brief.card5.off_topic.redirect_message,
        excluded_topics: exclusionsToBackendString(
          brief.card5.off_topic.off_topic_exclusions,
        ),
      },
      support_availability: {
        has_support_team: brief.card5.support_availability.has_support_team,
        availability_slots: brief.card5.support_availability.has_support_team
          ? brief.card5.support_availability.availability_slots
          : [],
      },
    },
    card6: {
      slots: mapCard6Slots(brief),
    },
  };
}

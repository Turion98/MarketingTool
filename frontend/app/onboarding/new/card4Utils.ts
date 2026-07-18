import type {
  AiPrefilledText,
  Card2Operations,
  EndNodeKind,
  SupportChatbotBrief,
} from "./briefTypes";

/** Magyar címkék a 6 end-node-slothoz (Card 4A megjelenítés). */
export const END_NODE_LABELS: Record<EndNodeKind, string> = {
  return_accepted: "Visszaküldés elfogadva",
  refund_initiated: "Visszatérítés indítva",
  replacement_initiated: "Csere indítva",
  warranty_investigation: "Garancia vizsgálat indul",
  lost_package: "Elveszett csomag",
  expired_return_deadline: "Határidőn túli visszaküldés",
};

/** Rövid forrás-badge a UX-hez ("Forrás: 2A — határidő"). */
export const END_NODE_SOURCE_BADGES: Record<EndNodeKind, string> = {
  return_accepted: "Forrás: 2A — visszaküldési határidő",
  refund_initiated: "Forrás: 2B — remedy / refund",
  replacement_initiated: "Forrás: 2B — remedy / csere",
  warranty_investigation: "Forrás: 2B — garancia",
  lost_package: "Forrás: 2C — szállítás",
  expired_return_deadline: "Forrás: 2A — határidő",
};

export const END_NODE_KINDS: EndNodeKind[] = [
  "return_accepted",
  "refund_initiated",
  "replacement_initiated",
  "warranty_investigation",
  "lost_package",
  "expired_return_deadline",
];

/** Card 2 tartalom hash — stale detektáláshoz. */
export function card2Fingerprint(card2: Card2Operations): string {
  return JSON.stringify(card2);
}

/** Van-e bármely slot generálás alatt? */
export function isCard4Generating(brief: SupportChatbotBrief): boolean {
  return END_NODE_KINDS.some(
    (k) => brief.card4.end_node_texts[k].status === "ai_generating",
  );
}

/**
 * Card 4 stale: a Card 2 megváltozott az utolsó sikeres generálás óta.
 * A `card2FingerprintAtGeneration` a session meta-ból jön.
 */
export function isCard4Stale(
  brief: SupportChatbotBrief,
  card2FingerprintAtGeneration: string | null,
): boolean {
  if (!card2FingerprintAtGeneration) return false;
  const current = card2Fingerprint(brief.card2);
  if (current === card2FingerprintAtGeneration) return false;
  // Ha minden slot üres, még nem volt generálás — nem stale.
  const hasGenerated = END_NODE_KINDS.some(
    (k) => brief.card4.end_node_texts[k].status !== "empty",
  );
  return hasGenerated;
}

/** Egy slot stale-e (nem user_edited, de Card 2 változott). */
export function isSlotStale(
  slot: AiPrefilledText,
  cardStale: boolean,
): boolean {
  if (!cardStale) return false;
  if (slot.status === "empty" || slot.status === "ai_generating") return false;
  if (slot.status === "user_edited") return false;
  return true;
}

/** User-szerkesztett slotok száma — overwrite modal-hoz. */
export function countUserEditedSlots(brief: SupportChatbotBrief): number {
  return END_NODE_KINDS.filter(
    (k) => brief.card4.end_node_texts[k].status === "user_edited",
  ).length;
}

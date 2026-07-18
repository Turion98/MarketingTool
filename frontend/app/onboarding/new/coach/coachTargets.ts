import type { CardId } from "../briefDraft";

export interface CoachTargetMeta {
  id: string;
  card: CardId;
  label: string;
  description: string;
}

/** Coach-highlight és AI tool whitelist. */
export const COACH_TARGETS: CoachTargetMeta[] = [
  {
    id: "card1.vendor_name",
    card: "card1",
    label: "Cégnév",
    description: "A chatbot ezzel a névvel azonosítja a vállalkozást.",
  },
  {
    id: "card1.website_url",
    card: "card1",
    label: "Honlap URL",
    description: "Opcionális; későbbi smart-fill forrás.",
  },
  {
    id: "card1.business_models",
    card: "card1",
    label: "Üzleti modellek",
    description: "Több is választható: saját készlet, marketplace, dropship, gyártó.",
  },
  {
    id: "card1.locale",
    card: "card1",
    label: "Nyelv (locale)",
    description: "A bot nyelve és jogi kontextusa.",
  },
  {
    id: "card2.returns.return_window_days",
    card: "card2",
    label: "Visszaküldési határidő (nap)",
    description: "Hány napig lehet visszaküldeni.",
  },
  {
    id: "card2.returns.return_shipping_paid_by",
    card: "card2",
    label: "Visszaküldés költsége",
    description: "Ki fizeti: ügyfél / cég / esetfüggő.",
  },
  {
    id: "card2.remedy.primary_remedy_order",
    card: "card2",
    label: "Remedy-sorrend",
    description: "Refund / csere / javítás prioritása.",
  },
  {
    id: "card2.shipping.carriers",
    card: "card2",
    label: "Futárszolgálatok",
    description: "Mely futárokkal dolgoztok.",
  },
  {
    id: "card3.helpdesk",
    card: "card3",
    label: "Helpdesk integráció",
    description: "Van-e ticketing rendszer.",
  },
  {
    id: "card3.sla",
    card: "card3",
    label: "SLA beállítások",
    description: "Válaszidő ígéretek az ügyfélnek.",
  },
  {
    id: "card4.end_node_texts",
    card: "card4",
    label: "Végállomás-szövegek",
    description: "AI által generált 6 szöveg.",
  },
  {
    id: "card4.scope_out_message",
    card: "card4",
    label: "Scope-out üzenet",
    description: "Kézi szöveg scope-on kívüli kérésre.",
  },
  {
    id: "card5.off_topic",
    card: "card5",
    label: "Off-topic kezelés",
    description: "Visszaterelő üzenet és limit.",
  },
  {
    id: "card5.support_availability",
    card: "card5",
    label: "Support elérhetőség",
    description: "Élő csapat nyitvatartása.",
  },
  {
    id: "card6.sources",
    card: "card6",
    label: "Forrásdokumentumok",
    description: "6 fix dokumentum-slot.",
  },
];

const TARGET_SET = new Set(COACH_TARGETS.map((t) => t.id));

export function isValidCoachTarget(id: string): boolean {
  return TARGET_SET.has(id);
}

export function targetsForCard(card: CardId): CoachTargetMeta[] {
  return COACH_TARGETS.filter((t) => t.card === card);
}

export function coachTargetsForPrompt(card: CardId): string {
  return targetsForCard(card)
    .map((t) => `- ${t.id}: ${t.label} — ${t.description}`)
    .join("\n");
}

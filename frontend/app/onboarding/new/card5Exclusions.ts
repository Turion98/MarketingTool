import type { OffTopicExclusion } from "./briefTypes";

/** Kurált kizárási lista — story off-topic scope + piaci gyakorlat. */
export const DEFAULT_OFF_TOPIC_EXCLUSIONS: OffTopicExclusion[] = [
  {
    id: "off_topic_general",
    label: "Off-topic, irreleváns vagy általános kérdések (időjárás, viccek, csevegés)",
    enabled: true,
  },
  {
    id: "price_negotiation",
    label: "Áralku, egyedi árajánlat, kedvezmény kérés",
    enabled: true,
  },
  {
    id: "pre_purchase_advice",
    label: "Vásárlás előtti általános terméktanácsadás (nem panasz)",
    enabled: true,
  },
  {
    id: "competitor_compare",
    label: "Versenytárs-összehasonlítás, más webshop ajánlata",
    enabled: true,
  },
  {
    id: "legal_medical_financial",
    label: "Jogi, orvosi vagy pénzügyi tanácsadás",
    enabled: true,
  },
  {
    id: "politics_religion",
    label: "Politika, vallás, társadalmi viták",
    enabled: true,
  },
  {
    id: "b2b_wholesale",
    label: "B2B nagyker, egyedi szerződéses feltételek",
    enabled: true,
  },
  {
    id: "press_pr",
    label: "Sajtó, PR, média megkeresés",
    enabled: true,
  },
  {
    id: "hr_jobs",
    label: "Állás, HR, karrier kérdések",
    enabled: true,
  },
  {
    id: "general_tech_howto",
    label: "Általános tech how-to (nem a megrendelt termék panasza)",
    enabled: true,
  },
];

export function cloneDefaultExclusions(): OffTopicExclusion[] {
  return DEFAULT_OFF_TOPIC_EXCLUSIONS.map((e) => ({ ...e }));
}

export function exclusionsToBackendString(
  exclusions: OffTopicExclusion[],
): string | null {
  const enabled = exclusions.filter((e) => e.enabled).map((e) => e.label.trim());
  if (enabled.length === 0) return null;
  return enabled.join("; ");
}

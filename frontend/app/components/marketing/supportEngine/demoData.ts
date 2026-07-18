/**
 * A beágyazott support-demó statikus adatai.
 *
 * - CONDITION_LABELS: a story `meta.condition_labels` tükre + néhány gyakori,
 *   routingban szereplő feltétel emberi címkéje. A nyers id-k (has_order_id,
 *   marked_delivered_not_received) helyett ezt mutatjuk a látogatónak; ismeretlen
 *   id-re a `labelForCondition` visszaadja magát az id-t.
 * - ORDER_SCENARIOS: az 5 mock rendelés (backend `data/mock_orders.csv`), amivel
 *   a látogató elindíthatja a flow-t.
 */

const CONDITION_LABELS: Record<string, string> = {
  // meta.condition_labels (story JSON)
  surroundings_checked: "ellenőrizte a szomszédoknál",
  tracking_screenshot_provided: "tracking képernyőkép megérkezett",
  damage_photos_provided: "sérülési fotók megérkeztek",
  image_provided: "kép csatolva",
  defect_described: "hiba leírása megérkezett",
  exclusion_check_done: "kizárási okok tisztázva",
  evidence_provided: "bizonyíték megérkezett",
  charger_tested: "töltő tesztelve",
  battery_health_known: "akku-állapot megadva",
  remedy_preference_known: "preferált megoldás megadva",
  product_condition_assessed: "termék állapota felmérve",
  reset_confirmed: "gyári visszaállítás megerősítve",
  screenshot_provided: "képernyőkép megérkezett",
  ordered_spec_known: "rendelt specifikáció tisztázva",
  received_spec_known: "kapott specifikáció tisztázva",
  missing_accessory_identified: "hiányzó tartozék azonosítva",
  photos_provided: "fotók megérkeztek",
  package_lost: "csomag elveszettnek jelölve",
  courier_contacted: "futárszolgálat megkeresve",
  loss_confirmed: "csomag elveszett megerősítve",
  payment_method_known: "fizetési mód ismert",
  return_initiated: "visszaküldés rögzítve",
  return_received: "visszaküldés beérkezett",
  refund_initiated: "visszatérítés elindítva",
  refund_eta_known: "visszatérítés dátuma ismert",
  refund_overdue: "visszatérítés lejárt",
  prior_case_exists: "korábbi ügy létezik",
  refund_amount_known: "visszatérítendő összeg ismert",
  // gyakori routing-feltételek, amikhez nincs külön label a story-ban
  has_order_id: "rendelésszám megadva",
  urgency_high: "sürgős eset",
  marked_delivered_not_received: "kézbesítve, de nem érkezett meg",
  packaging_damaged: "sérült csomagolás",
  tracking_checked: "tracking ellenőrizve",
  delay_duration_known: "késés hossza ismert",
  defect_on_arrival: "hibásan érkezett",
  within_return_window: "visszaküldési ablakon belül",
  outside_return_window: "visszaküldési ablakon kívül",
  extended_warranty_active: "kiterjesztett garancia aktív",
  complaint_type_known: "panasztípus tisztázva",
  complaint_shipping: "szállítási panasz",
  return_not_received: "visszaküldés nem érkezett meg",
  return_status_checked: "visszaküldés státusza ellenőrizve",
  sold_threshold_known: "eladott küszöb ismert",
  order_accessory_list_checked: "tartozéklista ellenőrizve",
  delivery_situation_identified: "kézbesítési helyzet tisztázva",
};

export function labelForCondition(id: string): string {
  return CONDITION_LABELS[id] ?? id;
}

export interface OrderScenario {
  id: string;
  title: string;
  hint: string;
}

export const ORDER_SCENARIOS: OrderScenario[] = [
  {
    id: "ORD-CUST-001",
    title: "Ideális, garanciás",
    hint: "Aktív garancia, visszaküldési ablakon belül. Bármelyik panasztípushoz jó.",
  },
  {
    id: "ORD-CUST-002",
    title: "Késő csomag",
    hint: "A csomag még úton van, de az ígért határidő lejárt.",
  },
  {
    id: "ORD-CUST-003",
    title: "Kézbesítve, de nem érkezett meg",
    hint: "Tracking szerint kézbesítve, az ügyfél szerint nincs meg.",
  },
  {
    id: "ORD-CUST-004",
    title: "Ablakon kívül",
    hint: "A visszaküldési ablak lejárt, csak garancia-flow elérhető.",
  },
  {
    id: "ORD-CUST-005",
    title: "Folyamatban lévő refund",
    hint: "A visszatérítés már elindítva, follow-up eset.",
  },
];

/**
 * Fix mapping a backend `customer_actions_required` ID-jeihez.
 * Az ügyintézőnek szóló, magyar nyelvű címkék.
 * Új ID esetén raw fallback: snake_case → szóköz.
 */
export const ACTION_LABELS: Record<string, string> = {
  await_agent_contact: "Ügyintéző felveszi a kapcsolatot",
  await_email_decision: "Döntésről e-mail értesítés szükséges",
  await_email_from_finance: "Pénzügyi csapat visszajelzést küld",
  await_email_update: "Státusz e-mail küldése szükséges",
  await_refund_by_eta: "Visszatérítés figyelése — ETA lejártáig",
  await_warehouse_decision: "Raktári döntés után értesítés szükséges",
  await_warehouse_inspection: "Raktári vizsgálat elvégzendő",
  await_warehouse_receipt: "Visszaküldés beérkezésének nyomon követése",
  file_carrier_claim_with_tracking_number:
    "Futárnál kárigény benyújtása (nyomkövetési számmal)",
  keep_packaging_until_inspection:
    "Csomagolás megőrzése — vizsgálatig ne dobják el",
  send_back_with_label: "Visszaküldési címke kiküldése szükséges",
};

export function humanizeAction(id: string): string {
  return ACTION_LABELS[id] ?? id.replace(/_/g, " ");
}

export function humanizeCategory(category: string): string {
  return category.replace(/_/g, " ").toUpperCase();
}

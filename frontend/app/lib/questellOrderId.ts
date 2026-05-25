/**
 * Questell rendelés-azonosító: ORD- + 2–6 nagybetű + kötőjel + 2–6 számjegy (pl. ORD-DEL-001).
 * A complaint-intake story has_order_id leírásával egyeztetve.
 */
const QUESTELL_ORDER_ID_RE = /\bORD-[A-Z]{2,6}-[0-9]{2,6}\b/i;

export function extractQuestellOrderId(text: string): string | null {
  const m = text.trim().match(QUESTELL_ORDER_ID_RE);
  return m ? m[0].toUpperCase() : null;
}
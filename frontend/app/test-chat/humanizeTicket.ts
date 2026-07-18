/**
 * Demo-céllal: a backend `Ticket` payload-jából emberi nyelvű, egy-két mondatos
 * narratíva, ami a chat alatti `ChatTicketCard`-on jelenik meg.
 *
 * Csak HU; az `?dev=1` SessionLogPanel-en továbbra is a nyers struktúra látszik,
 * a látogatónak szóló kommunikáció itt készül.
 */
import type { Ticket } from "./testChatTypes";

type Priority = "low" | "normal" | "high" | "urgent";

const PRIORITY_PHRASES: Record<Priority, string> = {
  low: "amint kapacitás engedi",
  normal: "rövid határidőn belül",
  high: "kiemelt sürgősséggel",
  urgent: "azonnali figyelemmel",
};

const ROUTING_PHRASES: Record<string, string> = {
  courier_investigation_team: "futárkövetési csapathoz",
  delivery_team: "kézbesítési csapathoz",
  returns_team: "visszáru csapathoz",
  finance_team: "pénzügyi csapathoz",
  technical_support: "műszaki támogatáshoz",
  warehouse_team: "raktári csapathoz",
  customer_service: "ügyfélszolgálathoz",
};

function priorityPhrase(raw: string | null | undefined): string {
  const key = (raw ?? "normal").toLowerCase() as Priority;
  return PRIORITY_PHRASES[key] ?? PRIORITY_PHRASES.normal;
}

function routingPhrase(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "egy szakértői csapathoz";
  return ROUTING_PHRASES[raw] ?? `${raw.replace(/_/g, " ")} csapathoz`;
}

function slaPhrase(slaDueAt: string | null | undefined): string | null {
  if (!slaDueAt) return null;
  const d = new Date(slaDueAt);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "egy órán belül";
  if (hours < 24) return `${hours} órán belül`;
  const days = Math.round(hours / 24);
  return `${days} napon belül`;
}

/**
 * Visszaadja a "Kérésedet rögzítettük…" rövid mondatot.
 * A bemenet a `/api/ai-node/process` válaszában érkező `ticket` mező.
 */
export function summarizeTicket(ticket: Ticket): string {
  const routing = routingPhrase(ticket.routing_target);
  const priority = priorityPhrase(ticket.priority);
  const sla = slaPhrase(ticket.sla_due_at);

  const slaPart = sla ? ` Visszajelzés várható ${sla}.` : "";
  return `Az ügyedet továbbítottuk a ${routing}, ${priority}.${slaPart}`;
}

/**
 * Rövidebb headline szöveg a kártya tetejére (max ~6 szó).
 */
export function ticketHeadline(): string {
  return "Kérésedet rögzítettük";
}

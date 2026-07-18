"use client";

import { Check } from "lucide-react";

import type { Ticket } from "./testChatTypes";
import { humanizeAction, humanizeCategory } from "./ticketLabels";

import s from "./TicketPanel.module.scss";

type TicketPanelProps = {
  ticket: Ticket | null;
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: s.priorityBadgeLow,
  normal: s.priorityBadgeNormal,
  high: s.priorityBadgeHigh,
  urgent: s.priorityBadgeUrgent,
};

function priorityClass(priority: string): string {
  const key = (priority ?? "").toLowerCase();
  return PRIORITY_BADGE_CLASS[key] ?? s.priorityBadgeNormal;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * TicketPanel — ügyintézőnek szóló ticket-megjelenítés a test-chat második sorának
 * bal cellájában (a `ticketPlaceholder` helyén). Ha `ticket` null, nem renderel
 * semmit — teljesen rejtett (pl. még nem ért véget a flow, vagy ticket-blokk
 * nélküli end node-on vagyunk).
 *
 * 7 zóna fentről lefelé:
 *   1. Header — ticket_id (mono) + priority badge
 *   2. Category + routing target
 *   3. Summary (templated mondat)
 *   4. Evidence — teljesült feltételek humanizált címkékkel
 *   5. Customer actions — ügyintéző teendői
 *   6. Tags — chip-szerű inline szöveg
 *   7. Footer — created_at + story_id + order_id
 */
export function TicketPanel({ ticket }: TicketPanelProps) {
  if (!ticket) return null;

  const priorityRaw = (ticket.priority ?? "normal").toString();
  const priorityLabel = priorityRaw.toUpperCase();
  const evidence = Array.isArray(ticket.evidence) ? ticket.evidence : [];
  const actions = Array.isArray(ticket.customer_actions_required)
    ? ticket.customer_actions_required
    : [];
  const tags = Array.isArray(ticket.tags) ? ticket.tags : [];
  const summary =
    typeof ticket.summary === "string" && ticket.summary.trim()
      ? ticket.summary.trim()
      : null;

  return (
    <section
      className={s.panel}
      aria-label={`Ticket ${ticket.ticket_id}`}
    >
      {/* (1) Header */}
      <header className={s.header}>
        <span className={s.ticketId}>{ticket.ticket_id}</span>
        <span
          className={`${s.priorityBadge} ${priorityClass(priorityRaw)}`}
          aria-label={`Prioritás: ${priorityLabel}`}
        >
          {priorityLabel}
        </span>
      </header>

      {/* (2) Category + Routing */}
      <div className={s.categoryBlock}>
        <span className={s.category}>{humanizeCategory(ticket.category)}</span>
        {ticket.routing_target ? (
          <span className={s.routing}>
            <span className={s.routingArrow} aria-hidden>
              →
            </span>
            {ticket.routing_target}
          </span>
        ) : null}
      </div>

      {/* (3) Summary */}
      {summary ? (
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Összefoglaló</h3>
          <p className={s.summary}>{summary}</p>
        </div>
      ) : null}

      {/* (4) Evidence */}
      {evidence.length > 0 ? (
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Bizonyítékok</h3>
          <ul className={s.evidenceList}>
            {evidence.map((item) => (
              <li key={item.id} className={s.evidenceRow}>
                <span className={s.evidenceCheck} aria-hidden>
                  <Check size={11} strokeWidth={3} />
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* (5) Customer actions */}
      {actions.length > 0 ? (
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Ügyfél teendői</h3>
          <ul className={s.actionsList}>
            {actions.map((id) => (
              <li key={id}>{humanizeAction(id)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* (6) Tags */}
      {tags.length > 0 ? (
        <div className={s.tags} aria-label="Címkék">
          {tags.map((tag) => (
            <span key={tag} className={s.tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* (7) Footer */}
      <footer className={s.footer}>
        <span className={s.footerItem}>{formatCreatedAt(ticket.created_at)}</span>
        <span className={s.footerItem}>
          <code>{ticket.story_id}</code>
        </span>
        {ticket.order_id ? (
          <span className={s.footerItem}>
            <code>{ticket.order_id}</code>
          </span>
        ) : null}
      </footer>
    </section>
  );
}

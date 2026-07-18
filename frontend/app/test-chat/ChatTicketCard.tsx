"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { TicketPanel } from "./TicketPanel";
import { summarizeTicket, ticketHeadline } from "./humanizeTicket";
import type { Ticket } from "./testChatTypes";

import s from "./ChatTicketCard.module.scss";

type Props = {
  ticket: Ticket | null;
};

/**
 * Demo-orientált ticket-megjelenítés: rövid, emberi narratíva a látogatónak.
 * Az ügyintézői részletek (a meglévő `TicketPanel`) a "Részletek" gomb mögött
 * lapulnak — egy klikkre kibonthatók.
 *
 * Ha a `ticket` null (még pre-end-page, vagy nincs ticket blokk az end-node-on),
 * a komponens nem renderel semmit.
 */
export function ChatTicketCard({ ticket }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!ticket) return null;

  const summary = summarizeTicket(ticket);
  const headline = ticketHeadline();
  const detailsId = `chat-ticket-details-${ticket.ticket_id}`;

  return (
    <section
      className={s.card}
      aria-label={`Ticket: ${ticket.ticket_id}`}
    >
      <header className={s.header}>
        <span className={s.checkIcon} aria-hidden>
          <Check size={16} strokeWidth={3} />
        </span>
        <h3 className={s.headline}>{headline}</h3>
      </header>

      <p className={s.summary}>{summary}</p>

      <p className={s.refLine}>
        <span className={s.refLabel}>Hivatkozás</span>
        <span className={s.refValue}>{ticket.ticket_id}</span>
      </p>

      <button
        type="button"
        className={s.detailsToggle}
        onClick={() => setDetailsOpen((prev) => !prev)}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
      >
        <span
          className={`${s.detailsCaret} ${detailsOpen ? s.detailsCaretOpen : ""}`}
          aria-hidden
        >
          ▸
        </span>
        {detailsOpen ? "Részletek elrejtése" : "Részletek megjelenítése"}
      </button>

      {detailsOpen ? (
        <div id={detailsId} className={s.detailsBody}>
          <TicketPanel ticket={ticket} />
        </div>
      ) : null}
    </section>
  );
}

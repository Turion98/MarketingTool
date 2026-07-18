"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Ticket } from "@/app/test-chat/testChatTypes";
import { ORDER_SCENARIOS, labelForCondition } from "./demoData";
import { useSupportDemoEngine, type DemoTurn } from "./useSupportDemoEngine";
import s from "./embeddedDemo.module.scss";

function OrderPicker({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={s.picker} ref={ref}>
      <button
        type="button"
        className={s.pickerBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Rendelés beszúrása
        <span aria-hidden="true"> ▾</span>
      </button>
      {open ? (
        <div className={s.pickerMenu} role="menu">
          {ORDER_SCENARIOS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={s.pickerItem}
              role="menuitem"
              onClick={() => {
                onPick(o.id);
                setOpen(false);
              }}
            >
              <span className={s.pickerId}>{o.id}</span>
              <span className={s.pickerTitle}>{o.title}</span>
              <span className={s.pickerHint}>{o.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConditionChips({
  ids,
  tone,
}: {
  ids: string[];
  tone: "sat" | "miss";
}) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return <span className={s.stateEmpty}>—</span>;
  return (
    <div className={s.chipWrap}>
      {unique.map((id) => (
        <span
          key={id}
          className={`${s.condChip} ${tone === "sat" ? s.condSat : s.condMiss}`}
          title={id}
        >
          {tone === "sat" ? "✓ " : ""}
          {labelForCondition(id)}
        </span>
      ))}
    </div>
  );
}

function TurnLog({ turns }: { turns: DemoTurn[] }) {
  if (turns.length === 0) {
    return <span className={s.stateEmpty}>Még nincs forduló.</span>;
  }
  return (
    <ol className={s.turnFeed}>
      {[...turns].reverse().map((t) => (
        <li key={t.id} className={s.turnItem}>
          <div className={s.turnHead}>
            <span className={s.turnNum}>#{t.num}</span>
            {t.latencyMs != null ? (
              <span className={s.turnLatency}>{t.latencyMs} ms</span>
            ) : null}
          </div>
          <div className={s.turnRow}>
            <span className={s.turnKey}>megértett</span>
            {t.understood.length ? (
              <span className={s.turnVal}>
                {t.understood.map((c) => labelForCondition(c)).join(", ")}
              </span>
            ) : (
              <span className={s.turnMuted}>semmi új</span>
            )}
          </div>
          <div className={s.turnRow}>
            <span className={s.turnKey}>döntés</span>
            {t.decision ? (
              <code className={s.turnDecision}>{t.decision}</code>
            ) : (
              <span className={s.turnMuted}>helyben maradt</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <section className={s.ticket} aria-label={`Ticket: ${ticket.ticket_id}`}>
      <div className={s.ticketHead}>
        <span className={s.ticketCheck} aria-hidden="true">
          ✓
        </span>
        <span className={s.ticketTitle}>Strukturált ticket a helpdesknek</span>
        <code className={s.ticketId}>{ticket.ticket_id}</code>
      </div>
      {ticket.summary ? <p className={s.ticketSummary}>{ticket.summary}</p> : null}
      <div className={s.ticketChips}>
        <span className={s.ticketChip}>{ticket.category}</span>
        <span className={s.ticketChip}>prioritás: {ticket.priority}</span>
        <span className={s.ticketChip}>{ticket.routing_target}</span>
      </div>
      {ticket.evidence?.length ? (
        <ul className={s.ticketEvidence}>
          {ticket.evidence.map((e) => (
            <li key={e.id}>{e.label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function EmbeddedSupportDemo() {
  const engine = useSupportDemoEngine();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [engine.messages]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void engine.submit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void engine.submit();
    }
  };
  const appendOrder = (id: string) => {
    engine.setInput((prev) => (prev.trim() ? `${prev.trim()} ${id}` : id));
    taRef.current?.focus();
  };

  return (
    <div className={s.console}>
      <div className={s.consoleHead}>
        <div className={s.headTitle}>
          <span
            className={`${s.headDot} ${engine.isLoading ? s.headDotLive : ""}`}
            aria-hidden="true"
          />
          Élő flow, panaszkezelés
        </div>
        <div className={s.headActions}>
          <OrderPicker onPick={appendOrder} />
          <button type="button" className={s.restartBtn} onClick={engine.restart}>
            Új beszélgetés
          </button>
        </div>
      </div>

      <div className={s.consoleBody}>
        <div className={s.chatPane}>
          <div className={s.messages} ref={scrollRef}>
            {engine.messages.length === 0 ? (
              <p className={s.emptyHint}>
                Írd le egy panaszt, vagy szúrj be egy rendelést fentről. A rendszer
                végigviszi a bejelentést, a panelen pedig látod, mit értett meg és
                melyik szabály döntött.
              </p>
            ) : (
              engine.messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className={s.bubbleUser}>
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className={s.bubbleBot}>
                    {m.loading && (m.text === "" || m.text === "Feldolgozom a kérésedet…") ? (
                      <span className={s.typing} aria-label="Feldolgozás">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      m.text
                    )}
                  </div>
                ),
              )
            )}
          </div>

          <form className={s.composer} onSubmit={onSubmit}>
            <textarea
              ref={taRef}
              className={s.textarea}
              value={engine.input}
              onChange={(e) => engine.setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Írd be az üzeneted… (Shift+Enter = sortörés)"
              rows={2}
              disabled={engine.isLoading}
            />
            <button
              type="submit"
              className={s.sendBtn}
              disabled={engine.isLoading || !engine.input.trim()}
            >
              {engine.isLoading ? "Küldés…" : "Küldés"}
            </button>
          </form>
        </div>

        <aside className={s.statePane} aria-label="Döntési állapot">
          <div className={s.stateBlock}>
            <p className={s.stateLabel}>Aktív lépés</p>
            <code className={s.activeNode}>{engine.activeNodeId}</code>
          </div>
          <div className={s.stateBlock}>
            <p className={s.stateLabel}>Teljesült feltételek</p>
            <ConditionChips ids={engine.satisfied} tone="sat" />
          </div>
          <div className={s.stateBlock}>
            <p className={s.stateLabel}>Hiányzó feltételek</p>
            <ConditionChips ids={engine.missing} tone="miss" />
          </div>
          <div className={s.stateBlock}>
            <p className={s.stateLabel}>Körönkénti napló</p>
            <TurnLog turns={engine.turns} />
          </div>
        </aside>
      </div>

      {engine.ticket ? <TicketCard ticket={engine.ticket} /> : null}
    </div>
  );
}

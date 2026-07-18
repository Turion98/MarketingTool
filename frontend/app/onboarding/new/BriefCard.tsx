"use client";

import { useId, type ReactNode } from "react";
import s from "./briefCard.module.scss";

export interface BriefCardProps {
  /** Sorszám 1..6 — a kártya bal felső sarkán látszik. */
  index: number;
  title: string;
  subtitle: string;
  /** A 6 lépéses brief egyetlen state-je: complete vs. incomplete. */
  complete: boolean;
  /** Open/closed kontrollált — a parent dönt (egyszerre csak 1 nyitott). */
  open: boolean;
  onToggle: () => void;
  /** Card 4-en a "stale" jelölést a parent adja (Card 2 változott). */
  stale?: boolean;
  /** Card 4-en a generation-loading jelölés (folyamatban). */
  generating?: boolean;
  children: ReactNode;
}

export default function BriefCard({
  index,
  title,
  subtitle,
  complete,
  open,
  onToggle,
  stale = false,
  generating = false,
  children,
}: BriefCardProps) {
  const bodyId = useId();
  return (
    <section
      className={[
        s.card,
        open ? s.cardOpen : "",
        complete ? s.cardComplete : "",
        stale ? s.cardStale : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={`${bodyId}-h`}
    >
      <button
        type="button"
        className={s.head}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className={s.headIndex} aria-hidden="true">
          {complete ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 7l3 3 5-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            index
          )}
        </span>
        <span className={s.headText}>
          <h2 id={`${bodyId}-h`} className={s.headTitle}>
            {title}
          </h2>
          <p className={s.headSubtitle}>{subtitle}</p>
        </span>
        <span className={s.headBadges}>
          {generating && (
            <span className={s.badgeGenerating}>
              AI generálás folyamatban…
            </span>
          )}
          {stale && !generating && (
            <span className={s.badgeStale}>
              Friss adatok elérhetők
            </span>
          )}
          {complete && !stale && !generating && (
            <span className={s.badgeComplete}>Kész</span>
          )}
        </span>
        <span className={s.headChevron} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && (
        <div id={bodyId} className={s.body}>
          {children}
        </div>
      )}
    </section>
  );
}

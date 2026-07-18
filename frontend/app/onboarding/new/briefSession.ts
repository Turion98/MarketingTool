/**
 * Backend sync meta a brief draft mellé (külön localStorage kulcs).
 *
 * A form tartalma (`questell:onboarding:brief:v1`) és a szerver-oldali job
 * kapcsolata itt él: job_id, Card 2 mentés-időbélyegek, generálás állapot.
 */

import type { CardId } from "./briefDraft";

const SESSION_KEY = "questell:onboarding:session:v1";

export interface BriefDraftSession {
  /** Backend job azonosító (`brief-<brief_id első 8>`). */
  jobId: string | null;
  /** Card 2 első sikeres mentése megtörtént-e (auto-gen trigger). */
  card2FirstSaveDone: boolean;
  /** Card 2 utolsó "mentés" ideje (ISO). */
  card2SavedAt: string | null;
  /** Card 2 fingerprint az utolsó mentéskor. */
  card2SavedFingerprint: string | null;
  /** Card 2 fingerprint az utolsó sikeres end-node generáláskor. */
  card2FingerprintAtGeneration: string | null;
  /** Utolsó sikeres end-node generálás ideje (ISO). */
  endNodesGeneratedAt: string | null;
  /** Tudásbázis beküldés ideje (ISO), ha már submitolt. */
  submittedAt: string | null;
  /** Beküldött job azonosító (submit után). */
  submittedJobId: string | null;
  /** Beküldött cégnév (submit után, done oldalhoz). */
  submittedVendorName: string | null;
  /** Megnyitott kártyák (haladásjelzőhöz). */
  visitedCards: CardId[];
}

export function emptySession(): BriefDraftSession {
  return {
    jobId: null,
    card2FirstSaveDone: false,
    card2SavedAt: null,
    card2SavedFingerprint: null,
    card2FingerprintAtGeneration: null,
    endNodesGeneratedAt: null,
    submittedAt: null,
    submittedJobId: null,
    submittedVendorName: null,
    visitedCards: [],
  };
}

export function readSession(): BriefDraftSession {
  if (typeof window === "undefined") return emptySession();
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as Partial<BriefDraftSession>;
    return { ...emptySession(), ...parsed };
  } catch {
    return emptySession();
  }
}

export function writeSession(session: BriefDraftSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Quota / private mode — ignored.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignored.
  }
}

export function readVisitedCards(): Set<CardId> {
  return new Set(readSession().visitedCards);
}

export function markCardVisited(card: CardId): void {
  const session = readSession();
  if (session.visitedCards.includes(card)) return;
  writeSession({
    ...session,
    visitedCards: [...session.visitedCards, card],
  });
}

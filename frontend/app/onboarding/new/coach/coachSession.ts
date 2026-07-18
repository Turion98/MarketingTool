import type { CardId } from "../briefDraft";

const VISITED_KEY = "questell:onboarding:coach:visited:v1";
const MESSAGES_KEY = "questell:onboarding:coach:messages:v1";

export type CoachMessageRole = "system" | "user" | "assistant";

export interface CoachSuggestion {
  target: string;
  label: string;
  /** Megjelenített javasolt érték (másolható). */
  display_value: string;
  /** Ha van, az „Elfogadom” ezt alkalmazza (string/number/boolean JSON). */
  apply_value?: string | number | boolean | null;
}

export interface CoachMessage {
  id: string;
  role: CoachMessageRole;
  content: string;
  created_at: string;
  highlights?: string[];
  suggestions?: CoachSuggestion[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMessage(
  role: CoachMessageRole,
  content: string,
  extra?: Pick<CoachMessage, "highlights" | "suggestions">,
): CoachMessage {
  return {
    id: newId(),
    role,
    content,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

export function readVisitedCards(): Set<CardId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(VISITED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((c): c is CardId => /^card[1-6]$/.test(c)));
  } catch {
    return new Set();
  }
}

export function markCardVisited(card: CardId): void {
  if (typeof window === "undefined") return;
  const set = readVisitedCards();
  set.add(card);
  try {
    window.localStorage.setItem(VISITED_KEY, JSON.stringify([...set]));
  } catch {
    // ignored
  }
}

export function readCoachMessages(): CoachMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CoachMessage[];
  } catch {
    return [];
  }
}

export function writeCoachMessages(messages: CoachMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-80)));
  } catch {
    // ignored
  }
}

export function clearCoachSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VISITED_KEY);
    window.localStorage.removeItem(MESSAGES_KEY);
  } catch {
    // ignored
  }
}

/**
 * Közös típusok a test-chat oldalhoz (page.tsx, SessionLogPanel, RightProcessPanel).
 * A backend SSE protokollal megegyező mezőnevek — ne átnevezni.
 */

export type DebugInfo = {
  activeNodeId: string | null;
  nextPageId: string | null;
  status: string | null;
  /** Backend: pl. "fallback" ha story JSON-ból jött assistantMessage. */
  responseType: string | null;
  satisfiedConditions: string[];
  newlySatisfied: string[];
  missing: string[];
  latencyMs: number | null;
  /** Utolsó API válasz `currentStepId` mezője (ha volt a payloadban). */
  lastApiCurrentStepId: string | null;
  stepNextId: string | null;
};

export type TicketEvidenceItem = {
  id: string;
  label: string;
};

export type TicketAttachmentRef = {
  type: string;
  provided: boolean;
  media_key?: string | null;
};

/**
 * Backend `Ticket` (services/ticket_contracts.py) JSON szerializáltja.
 * End-page lezáráskor jön az `/api/ai-node/process` válaszában `ticket` mezőben.
 */
export type Ticket = {
  ticket_id: string;
  created_at: string;
  story_id: string;
  session_id: string;
  run_id?: string | null;
  order_id?: string | null;
  end_page_id: string;
  category: string;
  priority: string;
  routing_target: string;
  tags: string[];
  customer_message: string;
  summary?: string | null;
  order_snapshot: Record<string, unknown>;
  evidence: TicketEvidenceItem[];
  customer_actions_required: string[];
  attachments: TicketAttachmentRef[];
  sla_due_at?: string | null;
  external_refs: Record<string, string>;
};

export type ProcessResponse = {
  assistantMessage?: string;
  /** Goto végoldal fix szövege (ha a backend küldi). */
  endPageContent?: string | null;
  clarificationQuestion?: string | null;
  responseType?: string | null;
  activeNodeId?: string | null;
  nextPageId?: string | null;
  status?: string | null;
  satisfiedConditions?: string[];
  newlySatisfied?: string[];
  missing?: string[];
  currentStepId?: string | null;
  nextStepId?: string | null;
  /**
   * End node lezáráskor érkezik a generált ticket; egyébként `null`.
   * Ugyanaz a `(session_id, end_page_id)` pár idempotensen ugyanazt a ticket-et adja vissza.
   */
  ticket?: Ticket | null;
};

export type LogEntry = {
  id: string;
  ts: number;
  prompt: string;
  assistantMessage: string;
  sentPageId: string | null;
  serverActiveNodeId: string | null;
  responseType: string | null;
  activeNodeId: string | null;
  nextPageId: string | null;
  status: string | null;
  latencyMs: number | null;
  satisfiedConditions: string[];
  newlySatisfied: string[];
  missing: string[];
  clarificationQuestion: string | null;
  sentStepId: string | null;
  responseStepId: string | null;
  responseNextStepId: string | null;
  imageProvided: boolean;
  orderId: string | null;
};

export type ApiTurnLogEntry = {
  id: string;
  turn: number;
  promptTruncated: string;
  sentPageId: string;
  serverActiveNodeId: string | null;
  responseType: string | null;
  /** Kérésben küldött currentStepId (null = nem volt step a kérésben). */
  sentStepId: string | null;
  /** Válasz `currentStepId` (ha szerepelt a payloadban). */
  responseStepId: string | null;
  newlySatisfied: string[];
  status: string | null;
  latencyMs: number | null;
};

/** Statusz + responseType együttes formázás (clarification/fallback megkülönböztetés). */
export function formatStatusForLog(
  status: string | null | undefined,
  responseType: string | null | undefined,
): string {
  if (responseType === "fallback" && status === "clarification") {
    return "fallback (clarification)";
  }
  return status ?? "—";
}

/** Step transition formázás: sentStep → responseStep, ha eltér. */
export function formatApiTurnStepLabel(
  sent: string | null,
  response: string | null,
): string {
  if (sent === null && response === null) return "—";
  if (sent === null) return response as string;
  if (response === null) return sent;
  if (sent === response) return sent;
  return `${sent} → ${response}`;
}

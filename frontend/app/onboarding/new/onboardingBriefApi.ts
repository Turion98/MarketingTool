import { getClientFetchApiBase } from "@/app/lib/publicApiBase";
import { toApiBrief } from "./briefApiAdapter";
import type { Card4Output, SupportChatbotBrief } from "./briefTypes";

const PREFIX = "/api/onboarding/brief";

function baseUrl(path: string): string {
  const api = getClientFetchApiBase();
  return `${api}${path}`;
}

export interface JobSummary {
  job_id: string;
  status: string;
  status_detail?: string | null;
  vendor_name?: string | null;
}

export interface EndNodeGenerationResult {
  job_id: string;
  applied_kinds: string[];
  skipped_user_edited_count: number;
  generated: Record<string, string>;
}

export interface FullJob {
  job_id: string;
  brief?: SupportChatbotBrief & {
    card4: Card4Output;
  };
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ");
    }
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Új job létrehozása a brief-ből (Phase 0 sync). */
export async function createJobFromBrief(
  brief: SupportChatbotBrief,
  options?: Parameters<typeof toApiBrief>[1],
): Promise<JobSummary> {
  const res = await fetch(baseUrl("/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiBrief(brief, options)),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<JobSummary>;
}

/** Brief UPSERT + Phase 0 re-run. */
export async function updateJobBrief(
  jobId: string,
  brief: SupportChatbotBrief,
  options?: Parameters<typeof toApiBrief>[1],
): Promise<JobSummary> {
  const res = await fetch(baseUrl(`/jobs/${encodeURIComponent(jobId)}/brief`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiBrief(brief, options)),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<JobSummary>;
}

/** Card 4A end-node szövegek generálása (sync, 5–20s). */
export async function generateEndNodes(
  jobId: string,
  options?: { overwriteUserEdits?: boolean },
): Promise<EndNodeGenerationResult> {
  const res = await fetch(
    baseUrl(`/jobs/${encodeURIComponent(jobId)}/end-nodes/generate`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overwrite_user_edits: options?.overwriteUserEdits ?? false,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<EndNodeGenerationResult>;
}

/** Teljes job aggregátum (brief.card4 frissítéshez). */
export async function fetchJob(jobId: string): Promise<FullJob> {
  const res = await fetch(baseUrl(`/jobs/${encodeURIComponent(jobId)}`));
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<FullJob>;
}

export interface CoachApiResponse {
  reply: string;
  highlights: string[];
  suggestions: Array<{
    target: string;
    label: string;
    display_value: string;
    apply_value?: string | number | boolean | null;
  }>;
}

export async function askOnboardingCoach(body: {
  active_card: string;
  user_question: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  brief_snapshot: Record<string, unknown>;
  locale?: "hu" | "en";
}): Promise<CoachApiResponse> {
  const res = await fetch(baseUrl("/coach"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CoachApiResponse>;
}

/** Job létrehozás vagy frissítés — egységes helper. */
export async function ensureJob(
  brief: SupportChatbotBrief,
  existingJobId: string | null,
): Promise<string> {
  if (existingJobId) {
    await updateJobBrief(existingJobId, brief);
    return existingJobId;
  }
  const summary = await createJobFromBrief(brief);
  return summary.job_id;
}

/**
 * Tudásbázis beküldése: brief véglegesítése + Phase 0 sync.
 * Nem indít Phase 1–3 buildet — az onboarding utáni pipeline dolga.
 */
export async function submitKnowledgeBaseBrief(
  brief: SupportChatbotBrief,
  existingJobId: string | null,
): Promise<JobSummary> {
  const submitOpts = { draftStatus: "ready_to_build" as const };
  if (existingJobId) {
    return updateJobBrief(existingJobId, brief, submitOpts);
  }
  return createJobFromBrief(brief, submitOpts);
}

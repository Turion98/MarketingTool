"use client";

import { useCallback, useState } from "react";
import type { BriefDraftSession } from "./briefSession";
import { readSession, writeSession } from "./briefSession";
import {
  card2Fingerprint,
  countUserEditedSlots,
  END_NODE_KINDS,
  isCard4Generating,
} from "./card4Utils";
import {
  ensureJob,
  fetchJob,
  generateEndNodes,
} from "./onboardingBriefApi";
import type {
  AiPrefilledText,
  EndNodeKind,
  SupportChatbotBrief,
} from "./briefTypes";

export interface UseCard4GenerationOptions {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
  onResaveWarning?: () => void;
}

export interface UseCard4GenerationReturn {
  session: BriefDraftSession;
  generating: boolean;
  card4Stale: boolean;
  generationError: string | null;
  /** Card 2 elhagyásakor hívandó (ha complete). */
  handleCard2Saved: () => void;
  /** Manuális újragenerálás Card 4-ről. */
  regenerateEndNodes: (overwriteUserEdits?: boolean) => Promise<void>;
  clearError: () => void;
}

function setAllSlotsGenerating(
  brief: SupportChatbotBrief,
): SupportChatbotBrief {
  const nextTexts = { ...brief.card4.end_node_texts };
  for (const kind of END_NODE_KINDS) {
    const slot = nextTexts[kind];
    if (slot.status !== "user_edited") {
      nextTexts[kind] = { ...slot, status: "ai_generating" };
    }
  }
  return {
    ...brief,
    card4: { ...brief.card4, end_node_texts: nextTexts },
  };
}

function mergeCard4FromJob(
  brief: SupportChatbotBrief,
  jobBrief: SupportChatbotBrief,
): SupportChatbotBrief {
  return {
    ...brief,
    card4: jobBrief.card4,
  };
}

export function useCard4Generation({
  brief,
  updateBrief,
  onResaveWarning,
}: UseCard4GenerationOptions): UseCard4GenerationReturn {
  const [session, setSession] = useState<BriefDraftSession>(() => readSession());
  const [generating, setGenerating] = useState(() => isCard4Generating(brief));
  const [generationError, setGenerationError] = useState<string | null>(null);

  const card4Stale =
    session.card2FingerprintAtGeneration != null &&
    card2Fingerprint(brief.card2) !== session.card2FingerprintAtGeneration &&
    END_NODE_KINDS.some((k) => brief.card4.end_node_texts[k].status !== "empty");

  const persistSession = useCallback((next: BriefDraftSession) => {
    setSession(next);
    writeSession(next);
  }, []);

  const runGeneration = useCallback(
    async (overwriteUserEdits = false) => {
      setGenerationError(null);
      setGenerating(true);
      updateBrief((prev) => setAllSlotsGenerating(prev));

      try {
        const currentSession = readSession();
        const jobId = await ensureJob(brief, currentSession.jobId);
        await generateEndNodes(jobId, { overwriteUserEdits });
        const job = await fetchJob(jobId);
        if (job.brief) {
          updateBrief((prev) => mergeCard4FromJob(prev, job.brief!));
        }

        const fp = card2Fingerprint(job.brief?.card2 ?? brief.card2);
        persistSession({
          ...currentSession,
          jobId,
          card2FingerprintAtGeneration: fp,
          endNodesGeneratedAt: new Date().toISOString(),
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Generálás sikertelen.";
        setGenerationError(msg);
        // Visszaállítás: ai_generating → empty (user_edited marad)
        updateBrief((prev) => {
          const nextTexts = { ...prev.card4.end_node_texts };
          for (const kind of END_NODE_KINDS) {
            const slot = nextTexts[kind];
            if (slot.status === "ai_generating") {
              nextTexts[kind] = { ...slot, status: "empty" };
            }
          }
          return {
            ...prev,
            card4: { ...prev.card4, end_node_texts: nextTexts },
          };
        });
      } finally {
        setGenerating(false);
      }
    },
    [brief, persistSession, updateBrief],
  );

  const handleCard2Saved = useCallback(() => {
    const fp = card2Fingerprint(brief.card2);
    const now = new Date().toISOString();

    if (!session.card2FirstSaveDone) {
      persistSession({
        ...session,
        card2FirstSaveDone: true,
        card2SavedAt: now,
        card2SavedFingerprint: fp,
      });
      void runGeneration(false);
      return;
    }

    if (session.card2SavedFingerprint !== fp) {
      persistSession({
        ...session,
        card2SavedAt: now,
        card2SavedFingerprint: fp,
      });
      onResaveWarning?.();
    }
  }, [brief.card2, onResaveWarning, persistSession, runGeneration, session]);

  const regenerateEndNodes = useCallback(
    async (overwriteUserEdits = false) => {
      const edited = countUserEditedSlots(brief);
      if (edited > 0 && !overwriteUserEdits) {
        const ok = window.confirm(
          `${edited} szöveget te szerkesztettél. Az újragenerálás felülírja őket. Folytatod?`,
        );
        if (!ok) return;
        await runGeneration(true);
        return;
      }
      await runGeneration(overwriteUserEdits);
    },
    [brief, runGeneration],
  );

  return {
    session,
    generating,
    card4Stale,
    generationError,
    handleCard2Saved,
    regenerateEndNodes,
    clearError: () => setGenerationError(null),
  };
}

/** Egy slot jóváhagyása (status → user_approved). */
export function approveSlot(
  brief: SupportChatbotBrief,
  kind: EndNodeKind,
): SupportChatbotBrief {
  const slot = brief.card4.end_node_texts[kind];
  const next: AiPrefilledText = {
    ...slot,
    status: "user_approved",
    last_user_approved_at: new Date().toISOString(),
  };
  return {
    ...brief,
    card4: {
      ...brief.card4,
      end_node_texts: {
        ...brief.card4.end_node_texts,
        [kind]: next,
      },
    },
  };
}

"use client";

import { useCallback, useId, type ChangeEvent } from "react";
import s from "./aiPrefilledTextarea.module.scss";
import type { AiPrefilledText } from "./briefTypes";

export interface AiPrefilledTextareaProps {
  label: string;
  sourceBadge?: string;
  value: AiPrefilledText;
  stale?: boolean;
  disabled?: boolean;
  onChange: (next: AiPrefilledText) => void;
  onApprove: () => void;
}

function statusLabel(status: AiPrefilledText["status"]): string | null {
  switch (status) {
    case "ai_prefilled":
      return "AI előkitöltve";
    case "user_edited":
      return "Szerkesztetted";
    case "user_approved":
      return "Jóváhagyva";
    case "ai_generating":
      return "Generálás…";
    default:
      return null;
  }
}

export default function AiPrefilledTextarea({
  label,
  sourceBadge,
  value,
  stale = false,
  disabled = false,
  onChange,
  onApprove,
}: AiPrefilledTextareaProps) {
  const htmlId = useId();
  const badge = statusLabel(value.status);
  const isGenerating = value.status === "ai_generating";
  const isEmpty = value.status === "empty" && !value.content.trim();
  const canApprove =
    value.status === "ai_prefilled" && value.content.trim().length > 0;

  const handleInput = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const content = e.target.value;
      const now = new Date().toISOString();
      if (value.status === "ai_prefilled" || value.status === "user_approved") {
        onChange({
          ...value,
          content,
          status: "user_edited",
          last_user_edited_at: now,
        });
      } else {
        onChange({
          ...value,
          content,
          status: content.trim() ? "user_edited" : "empty",
          last_user_edited_at: content.trim() ? now : null,
        });
      }
    },
    [onChange, value],
  );

  const handleApprove = useCallback(() => {
    onApprove();
  }, [onApprove]);

  return (
    <div
      className={[
        s.shell,
        stale ? s.shellStale : "",
        isGenerating ? s.shellGenerating : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={s.head}>
        <div className={s.headText}>
          <label htmlFor={htmlId} className={s.label}>
            {label}
          </label>
          {sourceBadge && <span className={s.sourceBadge}>{sourceBadge}</span>}
        </div>
        <div className={s.badges}>
          {stale && !isGenerating && (
            <span className={s.staleBadge}>Frissíthető</span>
          )}
          {badge && (
            <span
              className={[
                s.statusBadge,
                value.status === "user_approved" ? s.statusApproved : "",
                value.status === "user_edited" ? s.statusEdited : "",
                value.status === "ai_prefilled" ? s.statusAi : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {badge}
            </span>
          )}
        </div>
      </div>

      {isGenerating ? (
        <div className={s.skeleton} aria-busy="true" aria-label="AI generálás folyamatban">
          <div className={s.skeletonLine} />
          <div className={s.skeletonLine} />
          <div className={s.skeletonLineShort} />
        </div>
      ) : (
        <textarea
          id={htmlId}
          className={s.textarea}
          value={value.content}
          onChange={handleInput}
          disabled={disabled || isGenerating}
          rows={4}
          placeholder={
            isEmpty
              ? "A Card 2 mentése után az AI automatikusan kitölti ezt a szöveget."
              : undefined
          }
        />
      )}

      {canApprove && !disabled && (
        <div className={s.actions}>
          <button type="button" className={s.approveBtn} onClick={handleApprove}>
            ✓ Jóváhagyom
          </button>
        </div>
      )}
    </div>
  );
}

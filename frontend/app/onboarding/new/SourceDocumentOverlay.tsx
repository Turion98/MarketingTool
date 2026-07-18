"use client";

import { useCallback, useRef, useState } from "react";
import { TextareaField, TextField } from "./formFields";
import card6s from "./card6Content.module.scss";
import {
  PRIORITY_LABELS,
  SOURCE_DOC_LABELS,
  SOURCE_DOC_PRIORITIES,
} from "./card6Utils";
import { extractTextFromFile, isSupportedUploadFile } from "./fileTextExtract";
import type {
  AttachmentInputKind,
  SourceAttachment,
  SourceDocumentKind,
} from "./briefTypes";
import { newAttachmentId } from "./briefTypes";

export interface SourceDocumentOverlayProps {
  kind: SourceDocumentKind;
  attachments: SourceAttachment[];
  onChange: (next: SourceAttachment[]) => void;
  onClose: () => void;
}

export default function SourceDocumentOverlay({
  kind,
  attachments,
  onChange,
  onClose,
}: SourceDocumentOverlayProps) {
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priority = SOURCE_DOC_PRIORITIES[kind];

  const addAttachment = (inputKind: AttachmentInputKind) => {
    onChange([
      ...attachments,
      {
        id: newAttachmentId(),
        kind: inputKind,
        name: "",
        raw_text_preview: inputKind === "text" ? "" : null,
        source_url: inputKind === "url" ? "" : null,
      },
    ]);
  };

  const updateAttachment = (id: string, patch: Partial<SourceAttachment>) => {
    onChange(
      attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  };

  const removeAttachment = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  const handleFilePick = useCallback(
    async (file: File) => {
      setFileError(null);
      if (!isSupportedUploadFile(file)) {
        setFileError("Támogatott: .txt, .md, .csv, .pdf");
        return;
      }
      setUploading(true);
      try {
        const text = await extractTextFromFile(file);
        onChange([
          ...attachments,
          {
            id: newAttachmentId(),
            kind: "file",
            name: file.name,
            raw_text_preview: text,
            source_url: null,
          },
        ]);
      } catch (e) {
        setFileError(e instanceof Error ? e.message : "Fájl feldolgozás sikertelen.");
      } finally {
        setUploading(false);
      }
    },
    [attachments, onChange],
  );

  return (
    <div className={card6s.overlayBackdrop} role="presentation" onClick={onClose}>
      <div
        className={card6s.overlayPanel}
        role="dialog"
        aria-labelledby="source-doc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={card6s.overlayHead}>
          <div>
            <h3 id="source-doc-title" className={card6s.overlayTitle}>
              {SOURCE_DOC_LABELS[kind]}
            </h3>
            <span className={[card6s.priorityBadge, card6s[`priority_${priority}`]].join(" ")}>
              {PRIORITY_LABELS[priority]}
            </span>
          </div>
          <button type="button" className={card6s.overlayClose} onClick={onClose} aria-label="Bezárás">
            ×
          </button>
        </header>

        <div className={card6s.overlayBody}>
          {attachments.length === 0 ? (
            <p className={card6s.emptySlot}>Még nincs forrás ehhez a slothoz.</p>
          ) : (
            <div className={card6s.attachmentList}>
              {attachments.map((att) => (
                <div key={att.id} className={card6s.attachmentCard}>
                  <div className={card6s.attachmentHead}>
                    <span className={card6s.attachmentKind}>
                      {att.kind === "url" ? "URL" : att.kind === "text" ? "Szöveg" : "Fájl"}
                    </span>
                    <button
                      type="button"
                      className={card6s.removeBtn}
                      onClick={() => removeAttachment(att.id)}
                      aria-label="Forrás törlése"
                    >
                      ×
                    </button>
                  </div>
                  <TextField
                    label="Megnevezés"
                    value={att.name}
                    onChange={(v) => updateAttachment(att.id, { name: v })}
                  />
                  {att.kind === "url" && (
                    <TextField
                      label="URL"
                      value={att.source_url ?? ""}
                      onChange={(v) =>
                        updateAttachment(att.id, {
                          source_url: v,
                          name: att.name || v,
                        })
                      }
                      placeholder="https://..."
                    />
                  )}
                  {(att.kind === "text" || att.kind === "file") && (
                    <TextareaField
                      label={att.kind === "file" ? "Kinyert szöveg" : "Szöveg"}
                      value={att.raw_text_preview ?? ""}
                      onChange={(v) =>
                        updateAttachment(att.id, {
                          raw_text_preview: v,
                          name: att.name || (att.kind === "file" ? "Fájl" : "Szöveg"),
                        })
                      }
                      rows={5}
                      hint="Az első ~2000 karakter kerül a tudásbázisba."
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {fileError && (
            <p className={card6s.fileError} role="alert">
              {fileError}
            </p>
          )}

          <div className={card6s.addRow}>
            <button type="button" className={card6s.addBtn} onClick={() => addAttachment("url")}>
              + URL
            </button>
            <button type="button" className={card6s.addBtn} onClick={() => addAttachment("text")}>
              + Szöveg
            </button>
            <button
              type="button"
              className={card6s.addBtn}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Feldolgozás…" : "+ Fájl"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.pdf,.json,.html,.htm"
              className={card6s.hiddenFile}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFilePick(file);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

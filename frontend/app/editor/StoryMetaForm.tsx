"use client";

import type {
  CtaPresetFormRow,
  StoryMetaFormModel,
} from "@/app/lib/editor/newStoryBootstrap";
import s from "./editor.module.scss";

function suggestNextCtaKey(rows: CtaPresetFormRow[]): string {
  let n = 1;
  const existing = new Set(rows.map((r) => r.key.trim()));
  while (existing.has(`cta_${n}`)) n += 1;
  return `cta_${n}`;
}

export type StoryMetaFormFieldsProps = {
  model: StoryMetaFormModel;
  onChange: (next: StoryMetaFormModel) => void;
  disabled?: boolean;
  logoFile: File | null;
  onLogoFileChange: (file: File | null) => void;
  onUploadLogo?: () => void | Promise<void>;
  logoUploadBusy?: boolean;
  logoUploadDisabledReason?: string | null;
};

export function StoryMetaFormFields({
  model,
  onChange,
  disabled = false,
  logoFile,
  onLogoFileChange,
  onUploadLogo,
  logoUploadBusy = false,
  logoUploadDisabledReason,
}: StoryMetaFormFieldsProps) {
  const setRow = (idx: number, patch: Partial<CtaPresetFormRow>) => {
    onChange({
      ...model,
      ctaRows: model.ctaRows.map((r, j) =>
        j === idx ? { ...r, ...patch } : r
      ),
    });
  };

  const addCtaRow = () => {
    const key = suggestNextCtaKey(model.ctaRows);
    onChange({
      ...model,
      ctaRows: [
        ...model.ctaRows,
        { key, label: "", urlTemplate: "https://", subtitle: "" },
      ],
    });
  };

  const removeCtaRow = (idx: number) => {
    if (model.ctaRows.length <= 1) return;
    const nextRows = model.ctaRows.filter((_, j) => j !== idx);
    let end = model.endDefaultCta.trim();
    if (!nextRows.some((r) => r.key.trim() === end)) {
      end = nextRows[0]!.key.trim();
    }
    onChange({ ...model, ctaRows: nextRows, endDefaultCta: end });
  };

  const ctaKeyOptions = model.ctaRows.map((r) => r.key.trim()).filter(Boolean);

  return (
    <>
      <label className={s.bootstrapMetaLabel}>
        Megjelenített cím (a látogatónak látszik)
        <input
          className={s.bootstrapMetaInput}
          value={model.title}
          onChange={(e) => onChange({ ...model, title: e.target.value })}
          placeholder="pl. Interaktív kampány"
          disabled={disabled}
        />
      </label>
      <label className={s.bootstrapMetaLabel}>
        Kezdő oldal azonosítója (erre az oldalra érkezik a látogató)
        <input
          className={s.bootstrapMetaInput}
          value={model.startPageId}
          onChange={(e) => onChange({ ...model, startPageId: e.target.value })}
          placeholder="start"
          spellCheck={false}
          disabled={disabled}
        />
      </label>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>CTA presetek (gombok URL-jei)</legend>
        <label className={s.bootstrapMetaLabel}>
          Alapértelmezett vége gomb (preset kulcs)
          <select
            className={s.bootstrapMetaInput}
            value={
              ctaKeyOptions.includes(model.endDefaultCta.trim())
                ? model.endDefaultCta.trim()
                : ctaKeyOptions[0] ?? ""
            }
            onChange={(e) =>
              onChange({ ...model, endDefaultCta: e.target.value })
            }
            disabled={disabled || ctaKeyOptions.length === 0}
          >
            {ctaKeyOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {model.ctaRows.map((row, idx) => (
          <div key={idx} className={s.bootstrapMetaCtaCard}>
            <label className={s.bootstrapMetaLabel}>
              Preset kulcs
              <input
                className={s.bootstrapMetaInput}
                value={row.key}
                onChange={(e) => setRow(idx, { key: e.target.value })}
                spellCheck={false}
                disabled={disabled}
              />
            </label>
            <label className={s.bootstrapMetaLabel}>
              Felirat
              <input
                className={s.bootstrapMetaInput}
                value={row.label}
                onChange={(e) => setRow(idx, { label: e.target.value })}
                disabled={disabled}
              />
            </label>
            <label className={s.bootstrapMetaLabel}>
              URL (https)
              <input
                className={s.bootstrapMetaInput}
                value={row.urlTemplate}
                onChange={(e) => setRow(idx, { urlTemplate: e.target.value })}
                spellCheck={false}
                disabled={disabled}
              />
            </label>
            <label className={s.bootstrapMetaLabel}>
              Alcím (opcionális)
              <input
                className={s.bootstrapMetaInput}
                value={row.subtitle}
                onChange={(e) => setRow(idx, { subtitle: e.target.value })}
                disabled={disabled}
              />
            </label>
            <div className={s.bootstrapMetaCtaToolbar}>
              <button
                type="button"
                className={s.bootstrapMetaBtnSm}
                disabled={disabled || model.ctaRows.length <= 1}
                onClick={() => removeCtaRow(idx)}
              >
                Preset eltávolítása a listából
              </button>
            </div>
          </div>
        ))}
        <div className={s.bootstrapMetaCtaToolbar}>
          <button
            type="button"
            className={s.bootstrapMetaBtnSm}
            disabled={disabled}
            onClick={addCtaRow}
          >
            + Új CTA preset sor
          </button>
        </div>
      </fieldset>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Márka logo</legend>
        <label className={s.bootstrapMetaLabel}>
          Kép kiválasztása (PNG, JPG, WebP, SVG)
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            className={s.bootstrapMetaInput}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onLogoFileChange(f);
            }}
          />
        </label>
        {onUploadLogo ? (
          <div className={s.bootstrapMetaCtaToolbar}>
            <button
              type="button"
              className={s.bootstrapMetaBtnSm}
              disabled={
                disabled ||
                logoUploadBusy ||
                !logoFile ||
                Boolean(logoUploadDisabledReason)
              }
              onClick={() => void onUploadLogo()}
            >
              {logoUploadBusy ? "Feltöltés…" : "Logo feltöltése (külön mentés nélkül is)"}
            </button>
            {logoUploadDisabledReason ? (
              <span className={s.bootstrapMetaLead}>{logoUploadDisabledReason}</span>
            ) : null}
          </div>
        ) : null}
        {model.logoPath.trim() ? (
          <>
            <p className={s.bootstrapMetaLogoPreview}>
              Jelenlegi szerver útvonal: {model.logoPath.trim()}
            </p>
            <div className={s.bootstrapMetaCtaToolbar}>
              <button
                type="button"
                className={s.bootstrapMetaBtnSm}
                disabled={disabled}
                onClick={() => onChange({ ...model, logoPath: "" })}
              >
                Logo eltávolítása a meta adatokból
              </button>
            </div>
          </>
        ) : null}
      </fieldset>

      <label className={s.bootstrapMetaLabel}>
        Leírás
        <textarea
          className={s.bootstrapMetaTextarea}
          value={model.description}
          onChange={(e) => onChange({ ...model, description: e.target.value })}
          rows={2}
          disabled={disabled}
        />
      </label>
      <label className={s.bootstrapMetaLabel}>
        Szerző
        <input
          className={s.bootstrapMetaInput}
          value={model.author}
          onChange={(e) => onChange({ ...model, author: e.target.value })}
          disabled={disabled}
        />
      </label>
      <label className={s.bootstrapMetaLabel}>
        Locale (pl. hu, en)
        <input
          className={s.bootstrapMetaInput}
          value={model.locale}
          onChange={(e) => onChange({ ...model, locale: e.target.value })}
          placeholder="en"
          spellCheck={false}
          disabled={disabled}
        />
      </label>
    </>
  );
}

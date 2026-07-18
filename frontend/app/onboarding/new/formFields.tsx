"use client";

/**
 * Apró, újrahasznosított form-input komponensek a brief kártyák
 * mezőihez. Minden komponens kontrollált (value + onChange), accessibility-tudatos
 * (label kapcsolva, aria-describedby a hint/error-hez).
 *
 * NEM cél hogy formlib (react-hook-form, formik) helyettesítse —
 * a brief egyszerű struktúra, egy `updateBrief()` setter is elég.
 */

import {
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { useCoachHighlight, coachTargetAttrs } from "./coach/CoachHighlightContext";
import s from "./formFields.module.scss";

// --------------------------------------------------------------------------- //
// Field shell: label + hint + error                                          //
// --------------------------------------------------------------------------- //

export interface FieldShellProps {
  label: string;
  required?: boolean;
  /** Opcionális rövid magyarázat a label alatt. */
  hint?: string;
  /** Inline error (piros üzenet a mező alatt). */
  error?: string;
  /** Bal-jobb 50/50 layout-hoz (`fullWidth=false`). */
  fullWidth?: boolean;
  /** Coach highlight target id (data-coach-target). */
  coachTarget?: string;
  children: (htmlFor: string, describedBy: string | undefined) => ReactNode;
}

export function FieldShell({
  label,
  required,
  hint,
  error,
  fullWidth = true,
  coachTarget,
  children,
}: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const { activeTargets } = useCoachHighlight();
  const highlightAttrs = coachTargetAttrs(coachTarget, activeTargets);
  return (
    <div
      className={[s.field, fullWidth ? "" : s.fieldHalf].filter(Boolean).join(" ")}
      {...highlightAttrs}
    >
      <label htmlFor={id} className={s.label}>
        {label}
        {required && <span className={s.required} aria-hidden="true"> *</span>}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={errorId} className={s.error} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={s.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// TextField                                                                   //
// --------------------------------------------------------------------------- //

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  autoComplete?: string;
  maxLength?: number;
  /** Coach highlight target id. */
  coachTarget?: string;
  /** Egy "ikon-üzenet" amit a mező mellé teszünk (pl. ✨ ai-fill trigger). V2. */
  trailingSlot?: ReactNode;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  fullWidth = true,
  type = "text",
  autoComplete,
  maxLength,
  coachTarget,
  trailingSlot,
}: TextFieldProps) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
      coachTarget={coachTarget}
    >
      {(htmlFor, describedBy) => (
        <div className={s.inputWrap}>
          <input
            id={htmlFor}
            type={type}
            value={value}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            placeholder={placeholder}
            autoComplete={autoComplete}
            maxLength={maxLength}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={[s.input, error ? s.inputError : ""].filter(Boolean).join(" ")}
          />
          {trailingSlot && <div className={s.trailing}>{trailingSlot}</div>}
        </div>
      )}
    </FieldShell>
  );
}

// --------------------------------------------------------------------------- //
// NumberField                                                                 //
// --------------------------------------------------------------------------- //

export interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  /** Pl. "nap", "Ft", "%" — a mező jobb oldalán látszik. */
  suffix?: string;
  coachTarget?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  hint,
  error,
  required,
  fullWidth = true,
  suffix,
  coachTarget,
}: NumberFieldProps) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
      coachTarget={coachTarget}
    >
      {(htmlFor, describedBy) => (
        <div className={s.inputWrap}>
          <input
            id={htmlFor}
            type="number"
            value={value === null ? "" : value}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const v = e.target.value;
              if (v === "") {
                onChange(null);
              } else {
                const n = Number.parseFloat(v);
                onChange(Number.isFinite(n) ? n : null);
              }
            }}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={[s.input, s.inputNumber, error ? s.inputError : ""]
              .filter(Boolean)
              .join(" ")}
          />
          {suffix && <span className={s.suffix}>{suffix}</span>}
        </div>
      )}
    </FieldShell>
  );
}

// --------------------------------------------------------------------------- //
// SelectField                                                                 //
// --------------------------------------------------------------------------- //

export interface SelectFieldOption<V extends string> {
  value: V;
  label: string;
  description?: string;
}

export interface SelectFieldProps<V extends string> {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: SelectFieldOption<V>[];
  hint?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
}

export function SelectField<V extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  fullWidth = true,
}: SelectFieldProps<V>) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
    >
      {(htmlFor, describedBy) => (
        <select
          id={htmlFor}
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(e.target.value as V)
          }
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[s.select, error ? s.inputError : ""].filter(Boolean).join(" ")}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.description ? ` — ${opt.description}` : ""}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

// --------------------------------------------------------------------------- //
// RadioCardGroup — vizuális radio "kártya" választó (description-nel)         //
// --------------------------------------------------------------------------- //

export interface RadioCardOption<V extends string> {
  value: V;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export interface RadioCardGroupProps<V extends string> {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: RadioCardOption<V>[];
  hint?: string;
  required?: boolean;
  /** Hány oszlopra törje (default: auto-min 220px). */
  columns?: number;
}

export function RadioCardGroup<V extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  required,
  columns,
}: RadioCardGroupProps<V>) {
  const groupName = useId();
  return (
    <FieldShell label={label} hint={hint} required={required}>
      {(_htmlFor, describedBy) => (
        <div
          role="radiogroup"
          aria-label={label}
          aria-describedby={describedBy}
          className={s.radioGrid}
          style={
            columns
              ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <label
                key={opt.value}
                className={[s.radioCard, selected ? s.radioCardSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={opt.value}
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className={s.srOnly}
                />
                {opt.icon && (
                  <span className={s.radioCardIcon} aria-hidden="true">
                    {opt.icon}
                  </span>
                )}
                <span className={s.radioCardBody}>
                  <span className={s.radioCardLabel}>{opt.label}</span>
                  {opt.description && (
                    <span className={s.radioCardDesc}>{opt.description}</span>
                  )}
                </span>
                <span className={s.radioCardCheck} aria-hidden="true">
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path
                        d="M3 7l3 3 5-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </FieldShell>
  );
}

// --------------------------------------------------------------------------- //
// SegmentedControl — kicsi szegmentes radio (3-5 opció), inline               //
// --------------------------------------------------------------------------- //

export interface SegmentedControlOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: SegmentedControlOption<V>[];
  hint?: string;
  required?: boolean;
}

export function SegmentedControl<V extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  required,
}: SegmentedControlProps<V>) {
  const groupName = useId();
  return (
    <FieldShell label={label} hint={hint} required={required}>
      {(_htmlFor, describedBy) => (
        <div
          role="radiogroup"
          aria-label={label}
          aria-describedby={describedBy}
          className={s.segmented}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <label
                key={opt.value}
                className={[s.segment, selected ? s.segmentSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={opt.value}
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className={s.srOnly}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </FieldShell>
  );
}

// --------------------------------------------------------------------------- //
// TextareaField                                                               //
// --------------------------------------------------------------------------- //

export interface TextareaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  coachTarget?: string;
}

export function TextareaField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  coachTarget,
  rows = 4,
  ...rest
}: TextareaFieldProps) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      coachTarget={coachTarget}
    >
      {(htmlFor, describedBy) => (
        <textarea
          id={htmlFor}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[s.textarea, error ? s.inputError : ""].filter(Boolean).join(" ")}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

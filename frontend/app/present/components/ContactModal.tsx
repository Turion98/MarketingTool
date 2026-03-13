"use client";

import React, { useState } from "react";
import styles from "./ContactModal.module.scss";

type ContactModalProps = {
  open: boolean;
  onClose: () => void;
};

const MAIN_GOALS = [
  { value: "lead", label: "Lead generálás" },
  { value: "brand_edu", label: "Márkaélmény / edukáció" },
  { value: "recommender", label: "Termékajánló / konfigurátor" },
  { value: "hr", label: "HR / employer branding" },
  { value: "other", label: "Egyéb" },
] as const;

const TIMING_OPTIONS = [
  { value: "", label: "Válassz (opcionális)" },
  { value: "1m", label: "Következő 1 hónapban" },
  { value: "1-3m", label: "1–3 hónap" },
  { value: "3-6m", label: "3–6 hónap" },
  { value: "6m+", label: "6+ hónap" },
];

const REFERENCE_EXAMPLES = [
  { value: "", label: "Válassz (opcionális)" },
  { value: "skincare", label: "Strukturált ajánlómodell (pl. bőrápolás)" },
  { value: "coffee", label: "Gyors döntési profil (pl. kávé)" },
  { value: "holiday", label: "Szezonális döntési minta (pl. ünnep)" },
  { value: "marketing-sim", label: "Edukációs / onboarding flow" },
  { value: "softdrink", label: "Gyors termékajánló" },
  { value: "creative", label: "Kreatív problémamegoldó profil" },
  { value: "other", label: "Nem tudom / Egyéb" },
];

const BUDGET_BANDS = [
  { value: "", label: "Válassz (opcionális)" },
  { value: "entry", label: "Belépő (< 1M Ft)" },
  { value: "mid", label: "Közepes (1–3M Ft)" },
  { value: "complex", label: "Komplex (3M+ Ft)" },
  { value: "unknown", label: "Még nem tudom" },
];

const EXPECTED_OUTPUTS = [
  { value: "embed", label: "Landingre beágyazható modul" },
  { value: "social", label: "Social share kimenet" },
  { value: "training", label: "Belső tréning / onboarding" },
  { value: "other_out", label: "Egyéb" },
];

function buildBriefBody(data: BriefFormData): string {
  const lines: string[] = [
    "[Alapadatok]",
    `Név: ${data.name}`,
    data.company ? `Cég: ${data.company}` : "Cég: –",
    `Email: ${data.email}`,
    data.website ? `Weboldal: ${data.website}` : "Weboldal: –",
    "",
    "[Kampány kontextus]",
    `Fő cél: ${
      (MAIN_GOALS.find((g) => g.value === data.mainGoal)?.label ?? data.mainGoal) || "–"
    }`,
    data.targetAudience ? `Célközönség: ${data.targetAudience}` : "Célközönség: –",
    `Időzítés: ${
      (TIMING_OPTIONS.find((t) => t.value === data.timing)?.label ?? data.timing) || "–"
    }`,
    "",
    "[Modell / példa]",
    `Kiinduló példa: ${
      (REFERENCE_EXAMPLES.find((e) => e.value === data.referenceExample)?.label ??
        data.referenceExample) || "–"
    }`,
    data.exampleNote ? `Megjegyzés: ${data.exampleNote}` : "",
    "",
    "[Korlátok / output]",
    `Büdzsé-sáv: ${
      (BUDGET_BANDS.find((b) => b.value === data.budgetBand)?.label ?? data.budgetBand) || "–"
    }`,
    data.expectedOutputs.length
      ? `Várt kimenet: ${data.expectedOutputs
          .map(
            (v) =>
              EXPECTED_OUTPUTS.find((o) => o.value === v)?.label ??
              v
          )
          .join(", ")}`
      : "Várt kimenet: –",
    `Brand guideline: ${data.hasBrandGuideline === "yes" ? "Igen" : data.hasBrandGuideline === "no" ? "Nem" : "–"}`,
    data.brandNote ? `Brand megjegyzés: ${data.brandNote}` : "",
    data.otherNote ? `Egyéb megjegyzés: ${data.otherNote}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

type BriefFormData = {
  name: string;
  company: string;
  email: string;
  website: string;
  mainGoal: string;
  targetAudience: string;
  timing: string;
  referenceExample: string;
  exampleNote: string;
  budgetBand: string;
  expectedOutputs: string[];
  hasBrandGuideline: "" | "yes" | "no";
  brandNote: string;
  otherNote: string;
};

const initialFormData: BriefFormData = {
  name: "",
  company: "",
  email: "",
  website: "",
  mainGoal: "",
  targetAudience: "",
  timing: "",
  referenceExample: "",
  exampleNote: "",
  budgetBand: "",
  expectedOutputs: [],
  hasBrandGuideline: "",
  brandNote: "",
  otherNote: "",
};

export const ContactModal: React.FC<ContactModalProps> = ({ open, onClose }) => {
  const [data, setData] = useState<BriefFormData>(initialFormData);

  const update = (key: keyof BriefFormData, value: string | string[]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleOutput = (value: string) => {
    setData((prev) => ({
      ...prev,
      expectedOutputs: prev.expectedOutputs.includes(value)
        ? prev.expectedOutputs.filter((v) => v !== value)
        : [...prev.expectedOutputs, value],
    }));
  };

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent("Questell – brief / ajánlatkérés");
    const body = encodeURIComponent(buildBriefBody(data));
    window.location.href = `mailto:hello@questell.yourdomain?subject=${subject}&body=${body}`;
    setData(initialFormData);
    onClose();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Bezárás"
        >
          ×
        </button>

        <h2 id="contact-modal-title" className={styles.title}>
          Rövid brief – 3 perc
        </h2>
        <p className={styles.lead}>
          Töltsd ki a blokkokat, és 24 órán belül válaszolok egy konkrét
          javaslattal. 2–3 mondat bőven elég a szöveges mezőkben.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* 1. Alapadatok */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Alapadatok</legend>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="contact-name">Név *</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={data.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Név"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="contact-company">Cég</label>
                <input
                  id="contact-company"
                  type="text"
                  value={data.company}
                  onChange={(e) => update("company", e.target.value)}
                  placeholder="Cég / márka"
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-email">Email *</label>
              <input
                id="contact-email"
                type="email"
                required
                value={data.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="email@ceg.hu"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-website">Weboldal / kampány URL</label>
              <input
                id="contact-website"
                type="url"
                value={data.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </fieldset>

          {/* 2. Kampány kontextus */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Kampány kontextus</legend>
            <div className={styles.field}>
              <label>Fő cél</label>
              <select
                value={data.mainGoal}
                onChange={(e) => update("mainGoal", e.target.value)}
                aria-label="Fő cél"
              >
                <option value="">Válassz (opcionális)</option>
                {MAIN_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-audience">Célközönség (1–2 mondat)</label>
              <textarea
                id="contact-audience"
                value={data.targetAudience}
                onChange={(e) => update("targetAudience", e.target.value)}
                placeholder="Kinek szól a kampány?"
                rows={2}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-timing">Időzítés</label>
              <select
                id="contact-timing"
                value={data.timing}
                onChange={(e) => update("timing", e.target.value)}
              >
                {TIMING_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* 3. Modell / példa */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Melyik példa áll közel?</legend>
            <div className={styles.field}>
              <label htmlFor="contact-reference">Kiinduló példa</label>
              <select
                id="contact-reference"
                value={data.referenceExample}
                onChange={(e) => update("referenceExample", e.target.value)}
              >
                {REFERENCE_EXAMPLES.map((e) => (
                  <option key={e.value || "empty"} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-example-note">Mit kellene máshogy tudnia? (opcionális)</label>
              <textarea
                id="contact-example-note"
                value={data.exampleNote}
                onChange={(e) => update("exampleNote", e.target.value)}
                placeholder="Rövid megjegyzés..."
                rows={2}
              />
            </div>
          </fieldset>

          {/* 4. Korlátok és output */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Korlátok és kimenet</legend>
            <div className={styles.field}>
              <label htmlFor="contact-budget">Büdzsé-sáv</label>
              <select
                id="contact-budget"
                value={data.budgetBand}
                onChange={(e) => update("budgetBand", e.target.value)}
              >
                {BUDGET_BANDS.map((b) => (
                  <option key={b.value || "empty"} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Várt kimenet (több is választható)</span>
              <div className={styles.checkboxGroup}>
                {EXPECTED_OUTPUTS.map((o) => (
                  <label key={o.value} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={data.expectedOutputs.includes(o.value)}
                      onChange={() => toggleOutput(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Van kész vizuális / brand guideline?</span>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="brand-guide"
                    checked={data.hasBrandGuideline === "yes"}
                    onChange={() => update("hasBrandGuideline", "yes")}
                  />
                  <span>Igen</span>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="brand-guide"
                    checked={data.hasBrandGuideline === "no"}
                    onChange={() => update("hasBrandGuideline", "no")}
                  />
                  <span>Nem</span>
                </label>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-brand-note">Brand megjegyzés / link (opcionális)</label>
              <input
                id="contact-brand-note"
                type="text"
                value={data.brandNote}
                onChange={(e) => update("brandNote", e.target.value)}
                placeholder="Pl. link a guideline-hoz"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-other">Egyéb megjegyzés</label>
              <textarea
                id="contact-other"
                value={data.otherNote}
                onChange={(e) => update("otherNote", e.target.value)}
                placeholder="Bármi más, ami fontos..."
                rows={2}
              />
            </div>
          </fieldset>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Mégsem
            </button>
            <button type="submit" className={styles.primary}>
              Brief küldése
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

"use client";

import React, { useState } from "react";
import styles from "./ContactModal.module.scss";

type Lang = "hu" | "en";

type ContactModalProps = {
  open: boolean;
  onClose: () => void;
  lang?: Lang;
};

type Option = { value: string; label: string };

const MAIN_GOALS_BY_LANG: Record<Lang, Option[]> = {
  hu: [
    { value: "", label: "Válassz (opcionális)" },
    { value: "lead", label: "Lead generálás" },
    { value: "brand_edu", label: "Márkaélmény / edukáció" },
    { value: "recommender", label: "Termékajánló / konfigurátor" },
    { value: "hr", label: "HR / employer branding" },
    { value: "other", label: "Egyéb" },
  ],
  en: [
    { value: "", label: "Select (optional)" },
    { value: "lead", label: "Lead generation" },
    { value: "brand_edu", label: "Brand experience / education" },
    { value: "recommender", label: "Product recommender / configurator" },
    { value: "hr", label: "HR / employer branding" },
    { value: "other", label: "Other" },
  ],
};

const TIMING_OPTIONS_BY_LANG: Record<Lang, Option[]> = {
  hu: [
    { value: "", label: "Válassz (opcionális)" },
    { value: "1m", label: "Következő 1 hónapban" },
    { value: "1-3m", label: "1–3 hónap" },
    { value: "3-6m", label: "3–6 hónap" },
    { value: "6m+", label: "6+ hónap" },
  ],
  en: [
    { value: "", label: "Select (optional)" },
    { value: "1m", label: "Within 1 month" },
    { value: "1-3m", label: "1–3 months" },
    { value: "3-6m", label: "3–6 months" },
    { value: "6m+", label: "6+ months" },
  ],
};

const REFERENCE_EXAMPLES_BY_LANG: Record<Lang, Option[]> = {
  hu: [
    { value: "", label: "Válassz (opcionális)" },
    { value: "skincare", label: "Strukturált ajánlómodell (pl. bőrápolás)" },
    { value: "coffee", label: "Gyors döntési profil (pl. kávé)" },
    { value: "holiday", label: "Szezonális döntési minta (pl. ünnep)" },
    { value: "marketing-sim", label: "Edukációs / onboarding flow" },
    { value: "softdrink", label: "Gyors termékajánló" },
    { value: "creative", label: "Kreatív problémamegoldó profil" },
    { value: "other", label: "Nem tudom / Egyéb" },
  ],
  en: [
    { value: "", label: "Select (optional)" },
    { value: "skincare", label: "Structured recommender (e.g. skincare)" },
    { value: "coffee", label: "Short decision profile (e.g. coffee)" },
    { value: "holiday", label: "Seasonal decision pattern (e.g. holiday)" },
    { value: "marketing-sim", label: "Educational / onboarding flow" },
    { value: "softdrink", label: "Quick product recommender" },
    { value: "creative", label: "Creative problem-solving profile" },
    { value: "other", label: "Not sure / Other" },
  ],
};

const BUDGET_BANDS_BY_LANG: Record<Lang, Option[]> = {
  hu: [
    { value: "", label: "Válassz (opcionális)" },
    { value: "entry", label: "Belépő (< 1M Ft)" },
    { value: "mid", label: "Közepes (1–3M Ft)" },
    { value: "complex", label: "Komplex (3M+ Ft)" },
    { value: "unknown", label: "Még nem tudom" },
  ],
  en: [
    { value: "", label: "Select (optional)" },
    { value: "entry", label: "Entry level" },
    { value: "mid", label: "Mid range" },
    { value: "complex", label: "Complex / large" },
    { value: "unknown", label: "Not sure yet" },
  ],
};

const EXPECTED_OUTPUTS_BY_LANG: Record<Lang, Option[]> = {
  hu: [
    { value: "embed", label: "Landingre beágyazható modul" },
    { value: "social", label: "Social share kimenet" },
    { value: "training", label: "Belső tréning / onboarding" },
    { value: "other_out", label: "Egyéb" },
  ],
  en: [
    { value: "embed", label: "Embeddable landing module" },
    { value: "social", label: "Social share output" },
    { value: "training", label: "Internal training / onboarding" },
    { value: "other_out", label: "Other" },
  ],
};

const CONTACT_COPY: Record<
  Lang,
  {
    title: string;
    lead: string;
    closeAria: string;
    sectionBasics: string;
    sectionContext: string;
    sectionExample: string;
    sectionOutput: string;
    labelName: string;
    labelCompany: string;
    labelEmail: string;
    labelWebsite: string;
    labelMainGoal: string;
    labelTargetAudience: string;
    labelTiming: string;
    labelReference: string;
    labelExampleNote: string;
    labelBudget: string;
    labelExpectedOutputs: string;
    labelBrandGuideline: string;
    labelBrandNote: string;
    labelOtherNote: string;
    placeholderName: string;
    placeholderCompany: string;
    placeholderEmail: string;
    placeholderWebsite: string;
    placeholderAudience: string;
    placeholderExampleNote: string;
    placeholderBrandNote: string;
    placeholderOther: string;
    yes: string;
    no: string;
    cancel: string;
    submit: string;
    emailSubject: string;
    emailSectionBasics: string;
    emailSectionContext: string;
    emailSectionExample: string;
    emailSectionOutput: string;
    emailName: string;
    emailCompany: string;
    emailEmail: string;
    emailWebsite: string;
    emailMainGoal: string;
    emailTargetAudience: string;
    emailTiming: string;
    emailReference: string;
    emailNote: string;
    emailBudget: string;
    emailExpectedOutput: string;
    emailBrandGuideline: string;
    emailBrandNote: string;
    emailOtherNote: string;
    dash: string;
  }
> = {
  hu: {
    title: "Rövid brief – 3 perc",
    lead:
      "Töltsd ki a blokkokat, és 24 órán belül válaszolok egy konkrét javaslattal. 2–3 mondat bőven elég a szöveges mezőkben.",
    closeAria: "Bezárás",
    sectionBasics: "Alapadatok",
    sectionContext: "Kampány kontextus",
    sectionExample: "Melyik példa áll közel?",
    sectionOutput: "Korlátok és kimenet",
    labelName: "Név *",
    labelCompany: "Cég",
    labelEmail: "Email *",
    labelWebsite: "Weboldal / kampány URL",
    labelMainGoal: "Fő cél",
    labelTargetAudience: "Célközönség (1–2 mondat)",
    labelTiming: "Időzítés",
    labelReference: "Kiinduló példa",
    labelExampleNote: "Mit kellene máshogy tudnia? (opcionális)",
    labelBudget: "Büdzsé-sáv",
    labelExpectedOutputs: "Várt kimenet (több is választható)",
    labelBrandGuideline: "Van kész vizuális / brand guideline?",
    labelBrandNote: "Brand megjegyzés / link (opcionális)",
    labelOtherNote: "Egyéb megjegyzés",
    placeholderName: "Név",
    placeholderCompany: "Cég / márka",
    placeholderEmail: "email@ceg.hu",
    placeholderWebsite: "https://...",
    placeholderAudience: "Kinek szól a kampány?",
    placeholderExampleNote: "Rövid megjegyzés...",
    placeholderBrandNote: "Pl. link a guideline-hoz",
    placeholderOther: "Bármi más, ami fontos...",
    yes: "Igen",
    no: "Nem",
    cancel: "Mégsem",
    submit: "Brief küldése",
    emailSubject: "Questell – brief / ajánlatkérés",
    emailSectionBasics: "[Alapadatok]",
    emailSectionContext: "[Kampány kontextus]",
    emailSectionExample: "[Modell / példa]",
    emailSectionOutput: "[Korlátok / output]",
    emailName: "Név",
    emailCompany: "Cég",
    emailEmail: "Email",
    emailWebsite: "Weboldal",
    emailMainGoal: "Fő cél",
    emailTargetAudience: "Célközönség",
    emailTiming: "Időzítés",
    emailReference: "Kiinduló példa",
    emailNote: "Megjegyzés",
    emailBudget: "Büdzsé-sáv",
    emailExpectedOutput: "Várt kimenet",
    emailBrandGuideline: "Brand guideline",
    emailBrandNote: "Brand megjegyzés",
    emailOtherNote: "Egyéb megjegyzés",
    dash: "–",
  },
  en: {
    title: "Short brief – 3 min",
    lead:
      "Fill in the sections and you’ll get a concrete proposal within 24 hours. A couple of sentences are enough for text fields.",
    closeAria: "Close",
    sectionBasics: "Basic info",
    sectionContext: "Campaign context",
    sectionExample: "Which example is closest?",
    sectionOutput: "Constraints and output",
    labelName: "Name *",
    labelCompany: "Company",
    labelEmail: "Email *",
    labelWebsite: "Website / campaign URL",
    labelMainGoal: "Main goal",
    labelTargetAudience: "Target audience (1–2 sentences)",
    labelTiming: "Timeline",
    labelReference: "Reference example",
    labelExampleNote: "What should work differently? (optional)",
    labelBudget: "Budget band",
    labelExpectedOutputs: "Expected output (select all that apply)",
    labelBrandGuideline: "Do you have visual / brand guidelines?",
    labelBrandNote: "Brand note / link (optional)",
    labelOtherNote: "Other notes",
    placeholderName: "Name",
    placeholderCompany: "Company / brand",
    placeholderEmail: "email@company.com",
    placeholderWebsite: "https://...",
    placeholderAudience: "Who is this campaign for?",
    placeholderExampleNote: "Short note...",
    placeholderBrandNote: "e.g. link to guidelines",
    placeholderOther: "Anything else that matters...",
    yes: "Yes",
    no: "No",
    cancel: "Cancel",
    submit: "Send brief",
    emailSubject: "Questell – brief / request",
    emailSectionBasics: "[Basic info]",
    emailSectionContext: "[Campaign context]",
    emailSectionExample: "[Model / example]",
    emailSectionOutput: "[Constraints / output]",
    emailName: "Name",
    emailCompany: "Company",
    emailEmail: "Email",
    emailWebsite: "Website",
    emailMainGoal: "Main goal",
    emailTargetAudience: "Target audience",
    emailTiming: "Timeline",
    emailReference: "Reference example",
    emailNote: "Note",
    emailBudget: "Budget band",
    emailExpectedOutput: "Expected output",
    emailBrandGuideline: "Brand guideline",
    emailBrandNote: "Brand note",
    emailOtherNote: "Other note",
    dash: "–",
  },
};

function buildBriefBody(
  data: BriefFormData,
  lang: Lang
): string {
  const c = CONTACT_COPY[lang];
  const mainGoals = MAIN_GOALS_BY_LANG[lang];
  const timingOpts = TIMING_OPTIONS_BY_LANG[lang];
  const refExamples = REFERENCE_EXAMPLES_BY_LANG[lang];
  const budgetBands = BUDGET_BANDS_BY_LANG[lang];
  const expectedOutputs = EXPECTED_OUTPUTS_BY_LANG[lang];

  const lines: string[] = [
    c.emailSectionBasics,
    `${c.emailName}: ${data.name}`,
    data.company ? `${c.emailCompany}: ${data.company}` : `${c.emailCompany}: ${c.dash}`,
    `${c.emailEmail}: ${data.email}`,
    data.website ? `${c.emailWebsite}: ${data.website}` : `${c.emailWebsite}: ${c.dash}`,
    "",
    c.emailSectionContext,
    `${c.emailMainGoal}: ${
      (mainGoals.find((g) => g.value === data.mainGoal)?.label ?? data.mainGoal) || c.dash
    }`,
    data.targetAudience
      ? `${c.emailTargetAudience}: ${data.targetAudience}`
      : `${c.emailTargetAudience}: ${c.dash}`,
    `${c.emailTiming}: ${
      (timingOpts.find((t) => t.value === data.timing)?.label ?? data.timing) || c.dash
    }`,
    "",
    c.emailSectionExample,
    `${c.emailReference}: ${
      (refExamples.find((e) => e.value === data.referenceExample)?.label ??
        data.referenceExample) || c.dash
    }`,
    data.exampleNote ? `${c.emailNote}: ${data.exampleNote}` : "",
    "",
    c.emailSectionOutput,
    `${c.emailBudget}: ${
      (budgetBands.find((b) => b.value === data.budgetBand)?.label ?? data.budgetBand) || c.dash
    }`,
    data.expectedOutputs.length
      ? `${c.emailExpectedOutput}: ${data.expectedOutputs
          .map(
            (v) =>
              expectedOutputs.find((o) => o.value === v)?.label ?? v
          )
          .join(", ")}`
      : `${c.emailExpectedOutput}: ${c.dash}`,
    `${c.emailBrandGuideline}: ${
      data.hasBrandGuideline === "yes"
        ? c.yes
        : data.hasBrandGuideline === "no"
          ? c.no
          : c.dash
    }`,
    data.brandNote ? `${c.emailBrandNote}: ${data.brandNote}` : "",
    data.otherNote ? `${c.emailOtherNote}: ${data.otherNote}` : "",
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

export const ContactModal: React.FC<ContactModalProps> = ({
  open,
  onClose,
  lang: langProp,
}) => {
  const lang: Lang = langProp ?? "hu";
  const t = CONTACT_COPY[lang];
  const mainGoals = MAIN_GOALS_BY_LANG[lang];
  const timingOptions = TIMING_OPTIONS_BY_LANG[lang];
  const referenceExamples = REFERENCE_EXAMPLES_BY_LANG[lang];
  const budgetBands = BUDGET_BANDS_BY_LANG[lang];
  const expectedOutputs = EXPECTED_OUTPUTS_BY_LANG[lang];

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
    const subject = encodeURIComponent(t.emailSubject);
    const body = encodeURIComponent(buildBriefBody(data, lang));
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
          aria-label={t.closeAria}
        >
          ×
        </button>

        <h2 id="contact-modal-title" className={styles.title}>
          {t.title}
        </h2>
        <p className={styles.lead}>{t.lead}</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>{t.sectionBasics}</legend>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="contact-name">{t.labelName}</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={data.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder={t.placeholderName}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="contact-company">{t.labelCompany}</label>
                <input
                  id="contact-company"
                  type="text"
                  value={data.company}
                  onChange={(e) => update("company", e.target.value)}
                  placeholder={t.placeholderCompany}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-email">{t.labelEmail}</label>
              <input
                id="contact-email"
                type="email"
                required
                value={data.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder={t.placeholderEmail}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-website">{t.labelWebsite}</label>
              <input
                id="contact-website"
                type="url"
                value={data.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder={t.placeholderWebsite}
              />
            </div>
          </fieldset>

          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>{t.sectionContext}</legend>
            <div className={styles.field}>
              <label htmlFor="contact-main-goal">{t.labelMainGoal}</label>
              <select
                id="contact-main-goal"
                value={data.mainGoal}
                onChange={(e) => update("mainGoal", e.target.value)}
                aria-label={t.labelMainGoal}
              >
                {mainGoals.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-audience">{t.labelTargetAudience}</label>
              <textarea
                id="contact-audience"
                value={data.targetAudience}
                onChange={(e) => update("targetAudience", e.target.value)}
                placeholder={t.placeholderAudience}
                rows={2}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-timing">{t.labelTiming}</label>
              <select
                id="contact-timing"
                value={data.timing}
                onChange={(e) => update("timing", e.target.value)}
              >
                {timingOptions.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>{t.sectionExample}</legend>
            <div className={styles.field}>
              <label htmlFor="contact-reference">{t.labelReference}</label>
              <select
                id="contact-reference"
                value={data.referenceExample}
                onChange={(e) => update("referenceExample", e.target.value)}
              >
                {referenceExamples.map((e) => (
                  <option key={e.value || "empty"} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-example-note">{t.labelExampleNote}</label>
              <textarea
                id="contact-example-note"
                value={data.exampleNote}
                onChange={(e) => update("exampleNote", e.target.value)}
                placeholder={t.placeholderExampleNote}
                rows={2}
              />
            </div>
          </fieldset>

          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>{t.sectionOutput}</legend>
            <div className={styles.field}>
              <label htmlFor="contact-budget">{t.labelBudget}</label>
              <select
                id="contact-budget"
                value={data.budgetBand}
                onChange={(e) => update("budgetBand", e.target.value)}
              >
                {budgetBands.map((b) => (
                  <option key={b.value || "empty"} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t.labelExpectedOutputs}</span>
              <div className={styles.checkboxGroup}>
                {expectedOutputs.map((o) => (
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
              <span className={styles.label}>{t.labelBrandGuideline}</span>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="brand-guide"
                    checked={data.hasBrandGuideline === "yes"}
                    onChange={() => update("hasBrandGuideline", "yes")}
                  />
                  <span>{t.yes}</span>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="brand-guide"
                    checked={data.hasBrandGuideline === "no"}
                    onChange={() => update("hasBrandGuideline", "no")}
                  />
                  <span>{t.no}</span>
                </label>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-brand-note">{t.labelBrandNote}</label>
              <input
                id="contact-brand-note"
                type="text"
                value={data.brandNote}
                onChange={(e) => update("brandNote", e.target.value)}
                placeholder={t.placeholderBrandNote}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contact-other">{t.labelOtherNote}</label>
              <textarea
                id="contact-other"
                value={data.otherNote}
                onChange={(e) => update("otherNote", e.target.value)}
                placeholder={t.placeholderOther}
                rows={2}
              />
            </div>
          </fieldset>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t.cancel}
            </button>
            <button type="submit" className={styles.primary}>
              {t.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

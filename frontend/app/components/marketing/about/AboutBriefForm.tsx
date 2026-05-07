"use client";

import { useState } from "react";
import styles from "@/app/present/components/ContactModal.module.scss";

type Option = { value: string; label: string };

const MAIN_GOALS: Option[] = [
  { value: "", label: "Select use case" },
  { value: "product-finder", label: "Product finder" },
  { value: "campaign-flows", label: "Campaign flows" },
  { value: "onboarding-flows", label: "Onboarding flows" },
];

type BriefFormData = {
  name: string;
  company: string;
  email: string;
  primaryPageUrl: string;
  secondaryPageUrl: string;
  mainGoal: string;
  targetAudience: string;
  otherNote: string;
};

const initialFormData: BriefFormData = {
  name: "",
  company: "",
  email: "",
  primaryPageUrl: "",
  secondaryPageUrl: "",
  mainGoal: "",
  targetAudience: "",
  otherNote: "",
};

function buildBriefBody(data: BriefFormData): string {
  const lines: string[] = [
    "[Basic info]",
    `Name: ${data.name}`,
    `Company: ${data.company || "-"}`,
    `Email: ${data.email}`,
    `Primary page URL: ${data.primaryPageUrl || "-"}`,
    `Secondary page URL: ${data.secondaryPageUrl || "-"}`,
    "",
    "[Campaign context]",
    `Main goal: ${MAIN_GOALS.find((g) => g.value === data.mainGoal)?.label || "-"}`,
    `Target audience: ${data.targetAudience || "-"}`,
    "",
    "[Other note]",
    `Other note: ${data.otherNote || "-"}`,
  ];
  return lines.join("\n");
}

export default function AboutBriefForm() {
  const [data, setData] = useState<BriefFormData>(initialFormData);

  const update = (key: keyof BriefFormData, value: string | string[]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent("Request your first flow");
    const body = encodeURIComponent(buildBriefBody(data));
    window.location.href = `mailto:hello@questell.io?subject=${subject}&body=${body}`;
    setData(initialFormData);
  };

  return (
    <>
      <h2 className={styles.title}>Request your first flow</h2>
      <p className={styles.lead}>Fill in the sections and we will respond within one business day.</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Basic info</legend>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="about-name">Name *</label>
              <input
                id="about-name"
                type="text"
                required
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Name"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="about-company">Company</label>
              <input
                id="about-company"
                type="text"
                value={data.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="Company / brand"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="about-email">Email *</label>
            <input
              id="about-email"
              type="email"
              required
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="email@company.com"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="about-primary-url">Primary page URL *</label>
            <input
              id="about-primary-url"
              type="url"
              required
              value={data.primaryPageUrl}
              onChange={(e) => update("primaryPageUrl", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="about-secondary-url">Secondary page URL (optional)</label>
            <input
              id="about-secondary-url"
              type="url"
              value={data.secondaryPageUrl}
              onChange={(e) => update("secondaryPageUrl", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Campaign context</legend>
          <div className={styles.field}>
            <label htmlFor="about-main-goal">Main goal</label>
            <select
              id="about-main-goal"
              required
              value={data.mainGoal}
              onChange={(e) => update("mainGoal", e.target.value)}
            >
              {MAIN_GOALS.map((g) => (
                <option key={g.value || "empty"} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <p className={styles.lead}>
              Pick the use case and we map the decision logic and first flow structure to it.
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor="about-audience">Target audience (1–2 sentences)</label>
            <textarea
              id="about-audience"
              value={data.targetAudience}
              onChange={(e) => update("targetAudience", e.target.value)}
              placeholder="Who are they, what do they want now, what blocks the decision?"
              rows={2}
            />
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Egyéb megjegyzés</legend>
          <div className={styles.field}>
            <label htmlFor="about-other">Egyéb megjegyzés</label>
            <textarea
              id="about-other"
              value={data.otherNote}
              onChange={(e) => update("otherNote", e.target.value)}
              placeholder="Írj bármit, ami fontos lehet a flow felépítéséhez..."
              rows={3}
            />
          </div>
        </fieldset>

        <div className={styles.actions}>
          <p className={styles.lead}>Build fee: €179 one-time. Then €59/mo if continued.</p>
          <button type="submit" className={styles.primary}>
            Send request
          </button>
        </div>
      </form>
    </>
  );
}

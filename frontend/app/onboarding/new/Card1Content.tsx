"use client";

import {
  SegmentedControl,
  SelectField,
  TextField,
} from "./formFields";
import s from "./cardContent.module.scss";
import type {
  BusinessModel,
  Locale,
  SupportChatbotBrief,
  TargetMarket,
} from "./briefTypes";

export interface Card1ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

const BUSINESS_MODELS: Array<{
  value: BusinessModel;
  label: string;
  description: string;
}> = [
  {
    value: "own_inventory",
    label: "Saját készlet",
    description: "A termékeket magatok raktározzátok és szállítjátok.",
  },
  {
    value: "marketplace",
    label: "Marketplace platform",
    description: "Több eladó kínál termékeket a felületen.",
  },
  {
    value: "dropship",
    label: "Dropshipping",
    description: "A megrendelést a beszállító teljesíti közvetlenül.",
  },
  {
    value: "manufacturer",
    label: "Gyártó",
    description: "Saját gyártás vagy egyedi készítés.",
  },
];

const TARGET_MARKETS: Array<{ value: TargetMarket; label: string }> = [
  { value: "b2c", label: "B2C" },
  { value: "b2b", label: "B2B" },
  { value: "mixed", label: "Vegyes" },
];

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: "hu", label: "Magyar" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

export default function Card1Content({ brief, updateBrief }: Card1ContentProps) {
  const c = brief.card1;

  const setField = <K extends keyof typeof c>(
    key: K,
    value: (typeof c)[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card1: { ...prev.card1, [key]: value },
    }));
  };

  const toggleBusinessModel = (model: BusinessModel) => {
    const current = c.business_models;
    const next = current.includes(model)
      ? current.filter((m) => m !== model)
      : [...current, model];
    setField("business_models", next.length > 0 ? next : [model]);
  };

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Alap információk a tudásbázis felépítéséhez: cégnév, üzleti modell és
        nyelv.
      </p>

      <div className={s.row}>
        <TextField
          label="Cégnév / márkanév"
          value={c.vendor_name}
          onChange={(v) => setField("vendor_name", v)}
          placeholder="pl. Acme Refurb Kft."
          required
          maxLength={120}
          fullWidth={false}
          coachTarget="card1.vendor_name"
        />
        <TextField
          label="Honlap URL"
          value={c.website_url ?? ""}
          onChange={(v) => setField("website_url", v.trim() === "" ? null : v)}
          placeholder="https://example.com"
          type="url"
          autoComplete="url"
          fullWidth={false}
          coachTarget="card1.website_url"
          hint="Opcionális — később forrásdokumentum-ként is használható."
        />
      </div>

      <div className={s.fieldBlock}>
        <p className={s.fieldLabel}>
          Üzleti modell <span className={s.requiredMark}>*</span>
        </p>
        <p className={s.fieldHint}>Több is választható, ha többféle módon értékesítetek.</p>
        <div className={s.checkGrid}>
          {BUSINESS_MODELS.map((opt) => {
            const selected = c.business_models.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={[s.checkChip, selected ? s.checkChipSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
                title={opt.description}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleBusinessModel(opt.value)}
                />
                <span>
                  <strong>{opt.label}</strong>
                  <br />
                  <small>{opt.description}</small>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className={s.row}>
        <SegmentedControl
          label="Célközönség"
          value={c.target_market}
          onChange={(v) => setField("target_market", v)}
          options={TARGET_MARKETS}
        />
        <SelectField
          label="A chatbot nyelve"
          value={c.locale}
          onChange={(v) => setField("locale", v)}
          options={LOCALES}
          fullWidth={false}
        />
      </div>
    </div>
  );
}

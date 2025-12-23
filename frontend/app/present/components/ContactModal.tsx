"use client";

import React, { useState } from "react";
import styles from "./ContactModal.module.scss";

type ContactModalProps = {
  open: boolean;
  onClose: () => void;
};

const CAMPAIGN_TYPES = [
  "Termékbevezetés",
  "Vásárlói felmérés",
  "Szezonális kampány",
  "Termékajánló",
  "Edukációs kampány",
];

export const ContactModal: React.FC<ContactModalProps> = ({ open, onClose }) => {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [campaignType, setCampaignType] = useState("");
  const [message, setMessage] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // MVP: mailto – később cserélhető API hívásra
    const subject = encodeURIComponent("Questell – ajánlatkérés");
    const bodyLines = [
      `Név: ${name}`,
      company ? `Cég: ${company}` : "",
      `Email: ${email}`,
      campaignType ? `Kampánytípus: ${campaignType}` : "",
      "",
      "Üzenet:",
      message || "(nincs megadva)",
    ].filter(Boolean);

    const body = encodeURIComponent(bodyLines.join("\n"));
    window.location.href = `mailto:hello@questell.yourdomain?subject=${subject}&body=${body}`;

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
          Ajánlatkérés – röviden
        </h2>
        <p className={styles.lead}>
          Add meg az alapadatokat, és 24 órán belül válaszolok egy konkrét
          javaslattal.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="contact-name">Név *</label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Név"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="contact-company">Cég (opcionális)</label>
              <input
                id="contact-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Cég neve"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="contact-email">Email *</label>
            <input
              id="contact-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ceg.hu"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="contact-campaign">Milyen kampánytípus érdekel?</label>
            <select
              id="contact-campaign"
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
            >
              <option value="">Válassz (opcionális)</option>
              {CAMPAIGN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="contact-message">Rövid üzenet (opcionális)</label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Pár mondat a brief-ről vagy a célról..."
              rows={4}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Mégsem
            </button>
            <button type="submit" className={styles.primary}>
              Küldés
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

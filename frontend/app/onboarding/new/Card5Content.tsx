"use client";

import { useCallback, useState } from "react";
import {
  NumberField,
  TextareaField,
  TextField,
} from "./formFields";
import s from "./cardContent.module.scss";
import card5s from "./card5Content.module.scss";
import { cloneDefaultExclusions } from "./card5Exclusions";
import type {
  AvailabilitySlot,
  Card5Boundaries,
  ContactMethod,
  ContactMethodKind,
  OffTopicExclusion,
  SupportChatbotBrief,
} from "./briefTypes";

export interface Card5ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

const AVAILABILITY_OPTIONS: Array<{
  value: AvailabilitySlot;
  label: string;
  description: string;
}> = [
  { value: "weekdays_9_17", label: "Hétköznap 9–17", description: "Klasszikus munkaidő." },
  { value: "weekdays_9_20", label: "Hétköznap 9–20", description: "Kiterjesztett hétköznapi ablak." },
  { value: "weekends_too", label: "Hétvégén is", description: "Hétvégi részleges vagy teljes lefedettség." },
  { value: "24_7", label: "0–24", description: "Folyamatosan elérhető csapat." },
];

const CONTACT_KIND_OPTIONS: Array<{
  value: ContactMethodKind;
  label: string;
  placeholder: string;
}> = [
  { value: "email", label: "E-mail", placeholder: "support@ceg.hu" },
  { value: "phone", label: "Telefon", placeholder: "+36 1 234 5678" },
  { value: "form", label: "Űrlap URL", placeholder: "https://ceg.hu/kapcsolat" },
  { value: "whatsapp", label: "WhatsApp", placeholder: "+36 30 123 4567" },
  { value: "messenger", label: "Messenger", placeholder: "facebook.com/ceg" },
];

function EscalationRulesPanel() {
  return (
    <div className={card5s.fixedPanel}>
      <p className={card5s.fixedPanelTitle}>Fix eszkalációs szabályok</p>
      <ul className={card5s.fixedPanelList}>
        <li>Sürgős ügyeknél a bot emberi ügyintézőhöz eszkalál.</li>
        <li>Off-topic kérdések után visszatereli a beszélgetést a hatáskörére.</li>
        <li>Helpdesk integráció esetén minden eszkaláció automatikusan jegyet nyit.</li>
      </ul>
      <p className={card5s.fixedPanelNote}>
        Ezek a szabályok a rendszerben be vannak építve — nem kell külön megadni.
      </p>
    </div>
  );
}

export default function Card5Content({ brief, updateBrief }: Card5ContentProps) {
  const c5 = brief.card5;
  const [topicInput, setTopicInput] = useState("");
  const [customExclusion, setCustomExclusion] = useState("");

  const setOffTopic = useCallback(
    <K extends keyof Card5Boundaries["off_topic"]>(
      key: K,
      value: Card5Boundaries["off_topic"][K],
    ) => {
      updateBrief((prev) => ({
        ...prev,
        card5: {
          ...prev.card5,
          off_topic: { ...prev.card5.off_topic, [key]: value },
        },
      }));
    },
    [updateBrief],
  );

  const setSupport = useCallback(
    <K extends keyof Card5Boundaries["support_availability"]>(
      key: K,
      value: Card5Boundaries["support_availability"][K],
    ) => {
      updateBrief((prev) => ({
        ...prev,
        card5: {
          ...prev.card5,
          support_availability: {
            ...prev.card5.support_availability,
            [key]: value,
          },
        },
      }));
    },
    [updateBrief],
  );

  const toggleExclusion = (id: string) => {
    const next = c5.off_topic.off_topic_exclusions.map((e) =>
      e.id === id ? { ...e, enabled: !e.enabled } : e,
    );
    setOffTopic("off_topic_exclusions", next);
  };

  const addCustomExclusion = () => {
    const label = customExclusion.trim();
    if (!label) return;
    const id = `custom_${Date.now()}`;
    setOffTopic("off_topic_exclusions", [
      ...c5.off_topic.off_topic_exclusions,
      { id, label, enabled: true },
    ]);
    setCustomExclusion("");
  };

  const resetExclusions = () => {
    setOffTopic("off_topic_exclusions", cloneDefaultExclusions());
  };

  const toggleSlot = (slot: AvailabilitySlot) => {
    const current = c5.support_availability.availability_slots;
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot];
    setSupport("availability_slots", next);
  };

  const addWhitelistTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    if (c5.off_topic.whitelist_extra_topics.includes(t)) return;
    setOffTopic("whitelist_extra_topics", [
      ...c5.off_topic.whitelist_extra_topics,
      t,
    ]);
    setTopicInput("");
  };

  const removeWhitelistTopic = (topic: string) => {
    setOffTopic(
      "whitelist_extra_topics",
      c5.off_topic.whitelist_extra_topics.filter((t) => t !== topic),
    );
  };

  const addContactMethod = () => {
    setSupport("contact_methods", [
      ...c5.support_availability.contact_methods,
      { kind: "email", value: "" },
    ]);
  };

  const updateContact = (index: number, patch: Partial<ContactMethod>) => {
    const methods = [...c5.support_availability.contact_methods];
    methods[index] = { ...methods[index], ...patch };
    setSupport("contact_methods", methods);
  };

  const removeContact = (index: number) => {
    setSupport(
      "contact_methods",
      c5.support_availability.contact_methods.filter((_, i) => i !== index),
    );
  };

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Hatáskör, off-topic kezelés és élő support elérhetőség.
      </p>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>5A</span>
          <div>
            <h3 className={s.subsectionTitle}>Eszkalációs szabályok</h3>
          </div>
        </div>
        <EscalationRulesPanel />
      </div>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>5B</span>
          <div>
            <h3 className={s.subsectionTitle}>Off-topic kezelés</h3>
          </div>
        </div>

        <NumberField
          label="Off-topic kérdések limitje"
          value={c5.off_topic.question_limit}
          onChange={(v) => setOffTopic("question_limit", v ?? 2)}
          min={1}
          max={10}
          hint="Ennyi off-topic válasz után terel vissza a bot."
        />

        <TextareaField
          label="Visszaterelő üzenet"
          value={c5.off_topic.redirect_message}
          coachTarget="card5.off_topic"
          onChange={(v) => setOffTopic("redirect_message", v)}
          rows={3}
          required
        />

        <div className={card5s.exclusionSection}>
          <div className={s.sectionHead}>
            <div>
              <p className={card5s.fieldLabel}>Ajánlott kizárt témák</p>
              <p className={card5s.chipHint}>
                Erős ajánlás — egyenként kikapcsolható vagy bővíthető.
              </p>
            </div>
            <button type="button" className={s.sectionAddBtn} onClick={resetExclusions}>
              Alapértelmezés
            </button>
          </div>
          <div className={card5s.exclusionGrid}>
            {c5.off_topic.off_topic_exclusions.map((ex) => (
              <ExclusionTile
                key={ex.id}
                item={ex}
                onToggle={() => toggleExclusion(ex.id)}
              />
            ))}
          </div>
          <div className={card5s.chipInputRow}>
            <TextField
              label=""
              value={customExclusion}
              onChange={setCustomExclusion}
              placeholder="Saját kizárt téma hozzáadása"
            />
            <button
              type="button"
              className={s.sectionAddBtn}
              onClick={addCustomExclusion}
              disabled={!customExclusion.trim()}
            >
              + Hozzáadás
            </button>
          </div>
        </div>

        <div className={card5s.chipSection}>
          <p className={card5s.chipLabel}>Extra engedélyezett témák</p>
          <div className={card5s.chipInputRow}>
            <TextField
              label=""
              value={topicInput}
              onChange={setTopicInput}
              placeholder="pl. szállítási státusz lekérdezés"
            />
            <button
              type="button"
              className={s.sectionAddBtn}
              onClick={addWhitelistTopic}
              disabled={!topicInput.trim()}
            >
              + Hozzáadás
            </button>
          </div>
          {c5.off_topic.whitelist_extra_topics.length > 0 && (
            <div className={card5s.chipList}>
              {c5.off_topic.whitelist_extra_topics.map((topic) => (
                <span key={topic} className={card5s.chip}>
                  {topic}
                  <button
                    type="button"
                    className={card5s.chipRemove}
                    onClick={() => removeWhitelistTopic(topic)}
                    aria-label={`${topic} eltávolítása`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>5C</span>
          <div>
            <h3 className={s.subsectionTitle}>Support elérhetőség</h3>
          </div>
        </div>

        <label className={s.toggleRow}>
          <input
            type="checkbox"
            checked={c5.support_availability.has_support_team}
            onChange={(e) => {
              const on = e.target.checked;
              updateBrief((prev) => ({
                ...prev,
                card5: {
                  ...prev.card5,
                  support_availability: {
                    ...prev.card5.support_availability,
                    has_support_team: on,
                    availability_slots: on
                      ? prev.card5.support_availability.availability_slots
                      : [],
                  },
                },
              }));
            }}
          />
          <span className={s.toggleRowText}>
            <span className={s.toggleRowLabel}>Van saját support csapatunk</span>
          </span>
        </label>

        {c5.support_availability.has_support_team && (
          <>
            <p className={card5s.fieldLabel}>Elérhetőségi ablakok</p>
            <div className={s.checkGrid}>
              {AVAILABILITY_OPTIONS.map((opt) => {
                const selected =
                  c5.support_availability.availability_slots.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={[s.checkChip, selected ? s.checkChipSelected : ""].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSlot(opt.value)}
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

            <div className={card5s.contactSection}>
              <div className={s.sectionHead}>
                <p className={card5s.fieldLabel}>Kapcsolattartási módok</p>
                <button type="button" className={s.sectionAddBtn} onClick={addContactMethod}>
                  + Kapcsolat
                </button>
              </div>
              {c5.support_availability.contact_methods.length === 0 ? (
                <p className={s.emptyHint}>Még nincs kapcsolattartási mód.</p>
              ) : (
                <div className={card5s.contactList}>
                  {c5.support_availability.contact_methods.map((cm, idx) => {
                    const meta = CONTACT_KIND_OPTIONS.find((o) => o.value === cm.kind);
                    return (
                      <div key={idx} className={card5s.contactRow}>
                        <select
                          className={card5s.contactSelect}
                          value={cm.kind}
                          onChange={(e) =>
                            updateContact(idx, {
                              kind: e.target.value as ContactMethodKind,
                            })
                          }
                        >
                          {CONTACT_KIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <TextField
                          label=""
                          value={cm.value}
                          onChange={(v) => updateContact(idx, { value: v })}
                          placeholder={meta?.placeholder}
                        />
                        <button
                          type="button"
                          className={s.categoryRemove}
                          onClick={() => removeContact(idx)}
                          aria-label="Kapcsolat törlése"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExclusionTile({
  item,
  onToggle,
}: {
  item: OffTopicExclusion;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        card5s.exclusionTile,
        item.enabled ? card5s.exclusionTileOn : card5s.exclusionTileOff,
      ].join(" ")}
      onClick={onToggle}
      aria-pressed={item.enabled}
    >
      <span className={card5s.exclusionTileMark}>{item.enabled ? "✓" : "—"}</span>
      <span className={card5s.exclusionTileLabel}>{item.label}</span>
    </button>
  );
}

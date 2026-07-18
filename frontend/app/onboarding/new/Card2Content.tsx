"use client";

import { useMemo } from "react";
import {
  NumberField,
  RadioCardGroup,
  SegmentedControl,
  SelectField,
  TextField,
} from "./formFields";
import s from "./cardContent.module.scss";
import type {
  CarrierName,
  DamageReportWindowUnit,
  LostPackageHandledBy,
  RefundTimeline,
  RemedyKind,
  ReturnShippingPaidBy,
  ReturnWindowStartsFrom,
  SupportChatbotBrief,
} from "./briefTypes";

export interface Card2ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

// --------------------------------------------------------------------------- //
// Static option lists                                                         //
// --------------------------------------------------------------------------- //

const RETURN_WINDOW_STARTS: Array<{ value: ReturnWindowStartsFrom; label: string }> = [
  { value: "delivery", label: "Átvételtől" },
  { value: "shipment", label: "Feladástól" },
  { value: "order", label: "Megrendelés napjától" },
];

const RETURN_SHIPPING_PAID: Array<{
  value: ReturnShippingPaidBy;
  label: string;
  description: string;
}> = [
  {
    value: "customer",
    label: "A vásárló fizeti",
    description: "Visszaküldés esetén a vásárló saját maga küldi.",
  },
  {
    value: "company",
    label: "Mi fizetjük",
    description: "Mindig küldünk térítésmentes futárcímkét.",
  },
  {
    value: "case_by_case",
    label: "Esetenként",
    description: "Garanciás vagy hibás termék esetén mi, egyébként a vásárló.",
  },
];

const REMEDY_DEFINITIONS: Array<{
  value: RemedyKind;
  label: string;
  description: string;
}> = [
  {
    value: "refund",
    label: "Visszatérítés",
    description: "A teljes vételár visszautalása az eredeti fizetési módra.",
  },
  {
    value: "replacement",
    label: "Csere",
    description: "Ugyanaz a termék újra leszállítva.",
  },
  {
    value: "repair",
    label: "Javítás",
    description: "A hibás termék rendbehozatala (saját vagy szerviz partner).",
  },
  {
    value: "store_credit",
    label: "Áruházi kredit",
    description: "Levásárolható összeg a webshopban későbbi vásárlásra.",
  },
  {
    value: "partial_refund",
    label: "Részleges visszatérítés",
    description: "A vételár egy részének visszautalása (pl. csomagolás-sérülés).",
  },
];

const REFUND_TIMELINES: Array<{ value: RefundTimeline; label: string }> = [
  { value: "3_business_days", label: "3 munkanapon belül" },
  { value: "5_7_business_days", label: "5–7 munkanapon belül" },
  { value: "8_14_business_days", label: "8–14 munkanapon belül" },
  { value: "15_30_days", label: "15–30 napon belül" },
  { value: "case_by_case", label: "Esetenként változó" },
];

const CARRIERS: Array<{ value: CarrierName; label: string }> = [
  { value: "GLS", label: "GLS" },
  { value: "DPD", label: "DPD" },
  { value: "FoxPost", label: "FoxPost" },
  { value: "MPL", label: "MPL (Magyar Posta)" },
  { value: "DHL", label: "DHL" },
  { value: "Sameday", label: "Sameday" },
  { value: "UPS", label: "UPS" },
  { value: "FedEx", label: "FedEx" },
  { value: "Other", label: "Egyéb (kérlek írd be)" },
];

const LOST_PACKAGE_HANDLED: Array<{
  value: LostPackageHandledBy;
  label: string;
  description: string;
}> = [
  {
    value: "company",
    label: "Mi intézzük",
    description: "Mi indítjuk a futárcégnél a kárrendezést a vásárló helyett.",
  },
  {
    value: "customer",
    label: "A vásárlónak kell",
    description: "A vásárlónak magának kell a futárcégnél bejelenteni.",
  },
];

const DAMAGE_REPORT_UNITS: Array<{ value: DamageReportWindowUnit; label: string }> = [
  { value: "hours", label: "óra" },
  { value: "days", label: "nap" },
];

// --------------------------------------------------------------------------- //
// Card 2 content                                                              //
// --------------------------------------------------------------------------- //

export default function Card2Content({ brief, updateBrief }: Card2ContentProps) {
  const c = brief.card2;

  // Common helpers — három alszekcióhoz külön immutable setterek.
  const setReturns = <K extends keyof typeof c.returns>(
    key: K,
    value: (typeof c.returns)[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card2: { ...prev.card2, returns: { ...prev.card2.returns, [key]: value } },
    }));
  };

  const setRemedy = <K extends keyof typeof c.remedy>(
    key: K,
    value: (typeof c.remedy)[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card2: { ...prev.card2, remedy: { ...prev.card2.remedy, [key]: value } },
    }));
  };

  const setShipping = <K extends keyof typeof c.shipping>(
    key: K,
    value: (typeof c.shipping)[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card2: {
        ...prev.card2,
        shipping: { ...prev.card2.shipping, [key]: value },
      },
    }));
  };

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Ez a kártya adja a chatbot szabályrendszerét: mikor fogadtok el
        visszaküldést, milyen sorrendben kínáljátok a megoldásokat, és
        melyik futárcégekkel dolgoztok.
      </p>

      {/* ============================================================== */}
      {/* 2a Returns                                                       */}
      {/* ============================================================== */}
      <div className={s.subsection}>
        <header className={s.subsectionHead}>
          <span className={s.subsectionTag}>2A</span>
          <div>
            <h3 className={s.subsectionTitle}>Visszaküldés szabályai</h3>
            <p className={s.subsectionSubtitle}>
              Az általános visszaküldési ablak és ki fizeti a postaköltséget.
            </p>
          </div>
        </header>

        <div className={s.row}>
          <NumberField
            label="Visszaküldési ablak"
            value={c.returns.return_window_days}
            onChange={(v) => setReturns("return_window_days", v ?? 0)}
            min={0}
            max={365}
            step={1}
            suffix="nap"
            required
            fullWidth={false}
            coachTarget="card2.returns.return_window_days"
            hint="EU-ban a fogyasztói minimum 14 nap; sokan 30 napot adnak versenyelőnyként."
          />
          <SegmentedControl
            label="Ablak kezdete"
            value={c.returns.return_window_starts_from}
            onChange={(v) => setReturns("return_window_starts_from", v)}
            options={RETURN_WINDOW_STARTS}
            hint="Mikortól indul a számláló a vásárló szempontjából."
          />
        </div>

        <RadioCardGroup
          label="Visszaküldési postaköltség"
          value={c.returns.return_shipping_paid_by}
          onChange={(v) => setReturns("return_shipping_paid_by", v)}
          options={RETURN_SHIPPING_PAID}
          required
          columns={3}
        />

        <NumberField
          label="Ingyenes visszaküldés küszöb (opcionális)"
          value={c.returns.free_return_threshold_huf ?? null}
          onChange={(v) => setReturns("free_return_threshold_huf", v)}
          min={0}
          step={1000}
          suffix="Ft"
          placeholder="pl. 15000"
          hint={
            c.returns.return_shipping_paid_by === "customer"
              ? "Ha a vásárló legalább ekkora rendelt, akkor MI fizetjük a visszaküldést."
              : "Akkor releváns, ha jellemzően a vásárló fizeti — adhattok kedvezményt nagyobb rendelésnél."
          }
        />
      </div>

      {/* ============================================================== */}
      {/* 2b Remedy                                                        */}
      {/* ============================================================== */}
      <div className={s.subsection}>
        <header className={s.subsectionHead}>
          <span className={s.subsectionTag}>2B</span>
          <div>
            <h3 className={s.subsectionTitle}>Mit ajánl a bot megoldásként</h3>
            <p className={s.subsectionSubtitle}>
              Pipáld be, mely megoldásokat ajánljátok egyáltalán, majd a
              ↑↓ gombokkal sorrendezd: a bot a fenti opciót ajánlja először.
            </p>
          </div>
        </header>

        <RemedyLadder
          order={c.remedy.primary_remedy_order}
          onChange={(next) => setRemedy("primary_remedy_order", next)}
          hasRepairCapacity={c.remedy.has_own_repair_capacity}
          onRepairCapacityChange={(v) => setRemedy("has_own_repair_capacity", v)}
          repairNotes={c.remedy.repair_capacity_notes ?? ""}
          onRepairNotesChange={(v) =>
            setRemedy("repair_capacity_notes", v.trim() === "" ? null : v)
          }
        />

        <div className={s.fieldBlock}>
          <p className={s.fieldLabel}>
            Megadhatja-e a bot a visszatérítés idejét a vásárlónak?
          </p>
          <div className={s.segmentedInline}>
            <button
              type="button"
              className={[
                s.segmentBtn,
                c.remedy.refund_time_quotable ? s.segmentBtnActive : "",
              ].join(" ")}
              onClick={() => setRemedy("refund_time_quotable", true)}
            >
              Igen
            </button>
            <button
              type="button"
              className={[
                s.segmentBtn,
                !c.remedy.refund_time_quotable ? s.segmentBtnActive : "",
              ].join(" ")}
              onClick={() =>
                setRemedy("refund_time_quotable", false)
              }
            >
              Nem
            </button>
          </div>
        </div>

        {c.remedy.refund_time_quotable ? (
          <SelectField
            label="Visszatérítés ideje"
            value={c.remedy.refund_timeline}
            onChange={(v) => setRemedy("refund_timeline", v)}
            options={REFUND_TIMELINES}
            required
            hint="A bot ezt mondja a vásárlónak a végállomás-szövegekben."
          />
        ) : (
          <SelectField
            label="Emberi vizsgálat után — mennyi idő alatt?"
            value={c.remedy.post_review_refund_timeline ?? "case_by_case"}
            onChange={(v) => setRemedy("post_review_refund_timeline", v)}
            options={REFUND_TIMELINES}
            required
            hint="Ha a bot nem ad fix időt, eszkalációnál ez az ígéret."
          />
        )}

        {c.remedy.primary_remedy_order.includes("partial_refund") && (
          <NumberField
            label="Részleges visszatérítés mértéke"
            value={c.remedy.partial_refund_threshold_pct ?? null}
            onChange={(v) => setRemedy("partial_refund_threshold_pct", v)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            placeholder="pl. 20"
            hint="Tipikus érték: 10–30%, pl. csomagolás-sérülés esetén."
          />
        )}
      </div>

      {/* ============================================================== */}
      {/* 2c Shipping                                                      */}
      {/* ============================================================== */}
      <div className={s.subsection}>
        <header className={s.subsectionHead}>
          <span className={s.subsectionTag}>2C</span>
          <div>
            <h3 className={s.subsectionTitle}>Szállítás és kárrendezés</h3>
            <p className={s.subsectionSubtitle}>
              Futárcégek és az elveszett/sérült csomag forgatókönyvek.
            </p>
          </div>
        </header>

        <CarrierGrid
          carriers={c.shipping.carriers}
          onToggle={(carrier) => {
            const next = c.shipping.carriers.includes(carrier)
              ? c.shipping.carriers.filter((x) => x !== carrier)
              : [...c.shipping.carriers, carrier];
            setShipping("carriers", next);
            // Ha az "Other"-t kivettük, töröljük a "other_name"-t is.
            if (carrier === "Other" && !next.includes("Other")) {
              setShipping("carrier_other_name", null);
            }
          }}
        />

        {c.shipping.carriers.includes("Other") && (
          <TextField
            label="Egyéb futárcég neve"
            value={c.shipping.carrier_other_name ?? ""}
            onChange={(v) => setShipping("carrier_other_name", v)}
            placeholder="pl. PostaPont vagy saját kiszállítás"
            required
            maxLength={80}
            hint="A bot ezt használja, amikor az „egyéb” futárcég kerül szóba."
          />
        )}

        <RadioCardGroup
          label="Elveszett csomag — ki intézi a kárrendezést?"
          value={c.shipping.lost_package_handled_by}
          onChange={(v) => setShipping("lost_package_handled_by", v)}
          options={LOST_PACKAGE_HANDLED}
          columns={2}
          required
        />

        <div className={s.inlinePair}>
          <NumberField
            label="Sérülés-jelentés határidő"
            value={c.shipping.damage_report_window_value}
            onChange={(v) =>
              setShipping("damage_report_window_value", v ?? 0)
            }
            min={1}
            max={365}
            step={1}
            required
            hint="Mennyi időn belül kell a vásárlónak jelentenie az átvételi sérülést."
          />
          <SegmentedControl
            label="Egység"
            value={c.shipping.damage_report_window_unit}
            onChange={(v) => setShipping("damage_report_window_unit", v)}
            options={DAMAGE_REPORT_UNITS}
          />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// RemedyLadder — checkbox + ↑↓ arrow sorrendezés                              //
// --------------------------------------------------------------------------- //

interface RemedyLadderProps {
  order: RemedyKind[];
  onChange: (next: RemedyKind[]) => void;
  hasRepairCapacity: boolean;
  onRepairCapacityChange: (v: boolean) => void;
  repairNotes: string;
  onRepairNotesChange: (v: string) => void;
}

function RemedyLadder({
  order,
  onChange,
  hasRepairCapacity,
  onRepairCapacityChange,
  repairNotes,
  onRepairNotesChange,
}: RemedyLadderProps) {
  // A megjelenítendő lista: először a kiválasztottak (rendezett sorrend), aztán
  // a kiválasztatlanok (definíciós sorrendben).
  const selectedSet = useMemo(() => new Set(order), [order]);
  const unselected = REMEDY_DEFINITIONS.filter((d) => !selectedSet.has(d.value));

  const toggle = (value: RemedyKind) => {
    if (selectedSet.has(value)) {
      onChange(order.filter((x) => x !== value));
    } else {
      onChange([...order, value]);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className={s.remedyLadder}>
      {order.map((kind, idx) => {
        const def = REMEDY_DEFINITIONS.find((d) => d.value === kind);
        if (!def) return null;
        return (
          <div key={kind} className={`${s.remedyRow} ${s.remedyRowSelected}`}>
            <div className={s.remedyRowMain}>
            <span className={s.remedyRank} aria-label={`Sorrend: ${idx + 1}.`}>
              {idx + 1}
            </span>
            <label className={s.remedyCheckbox}>
              <input
                type="checkbox"
                checked
                onChange={() => toggle(kind)}
                aria-label={`Kikapcsolás: ${def.label}`}
              />
              <span className={s.remedyLabel}>
                <span className={s.remedyName}>{def.label}</span>
                <span className={s.remedyDesc}>{def.description}</span>
              </span>
            </label>
            <div className={s.remedyArrows}>
              <button
                type="button"
                className={s.remedyArrowBtn}
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label="Feljebb"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M3 9l4-4 4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={s.remedyArrowBtn}
                onClick={() => move(idx, 1)}
                disabled={idx === order.length - 1}
                aria-label="Lejjebb"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M3 5l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            </div>
            {kind === "repair" && (
              <div className={s.repairSubRow}>
                <label className={s.repairSubCheck}>
                  <input
                    type="checkbox"
                    checked={hasRepairCapacity}
                    onChange={(e) => onRepairCapacityChange(e.target.checked)}
                  />
                  <span>Saját javítási kapacitás</span>
                </label>
                {hasRepairCapacity && (
                  <input
                    type="text"
                    className={s.repairSubInput}
                    value={repairNotes}
                    onChange={(e) => onRepairNotesChange(e.target.value)}
                    placeholder="Opcionális részlet (pl. 2–3 munkanap)"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {unselected.map((def) => (
        <div key={def.value} className={s.remedyRow}>
          <div className={s.remedyRowMain}>
          <span className={`${s.remedyRank} ${s.remedyRankInactive}`} aria-hidden="true">
            —
          </span>
          <label className={s.remedyCheckbox}>
            <input
              type="checkbox"
              checked={false}
              onChange={() => toggle(def.value)}
              aria-label={`Bekapcsolás: ${def.label}`}
            />
            <span className={s.remedyLabel}>
              <span className={s.remedyName}>{def.label}</span>
              <span className={s.remedyDesc}>{def.description}</span>
            </span>
          </label>
          <div className={s.remedyArrows} aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// CarrierGrid — multi-checkbox a futárcégekhez                                //
// --------------------------------------------------------------------------- //

interface CarrierGridProps {
  carriers: CarrierName[];
  onToggle: (carrier: CarrierName) => void;
}

function CarrierGrid({ carriers, onToggle }: CarrierGridProps) {
  return (
    <div>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(20, 30, 30, 0.85)",
          marginBottom: 8,
        }}
      >
        Futárcégek <span style={{ color: "rgb(180, 60, 60)" }}>*</span>
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 400,
            color: "rgba(20, 30, 30, 0.55)",
            marginTop: 2,
          }}
        >
          Pipáld be, melyekkel dolgoztok — több is választható.
        </span>
      </p>
      <div className={s.checkGrid}>
        {CARRIERS.map((c) => {
          const selected = carriers.includes(c.value);
          return (
            <label
              key={c.value}
              className={[s.checkChip, selected ? s.checkChipSelected : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(c.value)}
              />
              <span>{c.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

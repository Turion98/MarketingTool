// app/components/ReportScheduleForm/ReportScheduleForm.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Frequency = "daily" | "weekly" | "monthly";
type RangeSpec = "last7d" | "last30d";

type Settings = {
  storyId: string;
  recipients: string[];
  frequency: Frequency;
  timeOfDay: string;        // "09:00"
  timezone: string;         // "Europe/Amsterdam"
  rangeSpec: RangeSpec;
  terminal?: string[];
  _lastRun?: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

const tzDefault = "Europe/Amsterdam";
const hhmm = (v: string) => /^\d{2}:\d{2}$/.test((v || "").trim());
const splitList = (s: string) =>
  (s || "")
    .split(/[,\s;]+/g) // vessző, pontosvessző, szóköz, TAB, sortörés
    .map((v) => v.trim())
    .filter(Boolean);

// ——— API helpers
async function load(storyId: string): Promise<Settings | null> {
  const r = await fetch(`${API_BASE}/api/report-settings?storyId=${encodeURIComponent(storyId)}`);
  if (r.status === 404) return null; // első megnyitáskor ez OK
  if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
  return await r.json();
}
async function save(s: Settings) {
  const r = await fetch(`${API_BASE}/api/report-settings?storyId=${encodeURIComponent(s.storyId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!r.ok) throw new Error(`Failed to save settings (${r.status})`);
}
async function remove(storyId: string) {
  const r = await fetch(`${API_BASE}/api/report-settings?storyId=${encodeURIComponent(storyId)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(`Failed to delete settings (${r.status})`);
}

// Próbálkozó “send test” 3 lépcsőben (lásd leírás fent):
async function sendTestFlexible(s: Settings) {
  // 1) preferált: külön test endpoint, body=Settings
  try {
    const r1 = await fetch(`${API_BASE}/api/report-settings/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (r1.ok) return await r1.json();
    // ha nem ok, de 404/405/501 → próbáljuk a 2)-t
    if (![404, 405, 501].includes(r1.status)) {
      const txt = await r1.text().catch(() => "");
      throw new Error(`Send test failed (${r1.status}) ${txt || ""}`);
    }
  } catch (e) {
    // hálózati hiba esetén is próbáljuk a 2)-t
  }

  // 2) legacy: /api/report-send body=Settings
  let lastText = "";
  try {
    const r2 = await fetch(`${API_BASE}/api/report-send?storyId=${encodeURIComponent(s.storyId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (r2.ok) return await r2.json();

    lastText = await r2.text().catch(() => "");
    // 400 és “No recipients configured” esetén valószínű, hogy a szerver a TÁROLT beállításból olvas,
    // nem a body-ból → 3) mentsük, majd hívd meg query-only módban.
    if (
      r2.status === 400 &&
      /no recipients configured/i.test(lastText || "")
    ) {
      // esünk át a 3) ágra
    } else if ([404, 405, 501].includes(r2.status)) {
      // esünk át a 3) ágra
    } else {
      throw new Error(`Send failed (${r2.status}) ${lastText || ""}`);
    }
  } catch (e) {
    // 3) fallback-re megyünk
  }

  // 3) fallback: először mentés, aztán /api/report-send csak query-vel (a szerver a tároltból olvas)
  await save(s);
  const r3 = await fetch(`${API_BASE}/api/report-send?storyId=${encodeURIComponent(s.storyId)}`, {
    method: "POST",
  });
  if (!r3.ok) {
    const t = await r3.text().catch(() => "");
    throw new Error(`Send (fallback) failed (${r3.status}) ${t || ""}`);
  }
  return await r3.json();
}

export default function ReportScheduleForm({
  storyId,
  onClose,
}: {
  storyId: string;
  onClose: () => void;
}) {
  // ——— állapotok
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // külön raw textarea tartalom a kényelmes szerkesztéshez
  const [recipientsRaw, setRecipientsRaw] = useState("");

  const [state, setState] = useState<Settings>({
    storyId,
    recipients: [],
    frequency: "weekly",
    timeOfDay: "09:00",
    timezone: tzDefault,
    rangeSpec: "last7d",
  });

  // ——— init betöltés
  useEffect(() => {
    (async () => {
      setErr(null); setOk(null); setLoading(true);
      try {
        const s = await load(storyId);
        if (s) {
          setState({
            storyId,
            recipients: Array.isArray(s.recipients) ? s.recipients : [],
            frequency: (s.frequency as Frequency) || "weekly",
            timeOfDay: hhmm(s.timeOfDay || "") ? s.timeOfDay! : "09:00",
            timezone: s.timezone || tzDefault,
            rangeSpec: (s.rangeSpec as RangeSpec) || "last7d",
            terminal: Array.isArray(s.terminal) ? s.terminal : [],
            _lastRun: s._lastRun,
          });
          setRecipientsRaw((s.recipients || []).join("\n"));
        } else {
          // 404 eset: üres alapértékek, overlay akkor is megjelenik
          setState((prev) => ({ ...prev, storyId, timezone: tzDefault, timeOfDay: "09:00" }));
          setRecipientsRaw("");
        }
      } catch (e: any) {
        setErr(e?.message || "Load error");
      } finally {
        setLoading(false);
      }
    })();
  }, [storyId]);

  // ——— ESC-re zárás
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ——— derived
  const terminalStr = useMemo(() => (state.terminal || []).join(", "), [state.terminal]);
  const isValid =
    !!state.storyId &&
    hhmm(state.timeOfDay) &&
    (state.timezone || "").length > 0 &&
    ["daily", "weekly", "monthly"].includes(state.frequency) &&
    ["last7d", "last30d"].includes(state.rangeSpec) &&
    state.recipients.length > 0;

  // ——— akciók
  async function onSave() {
    setSaving(true); setErr(null); setOk(null);
    try { await save(state); setOk("Saved."); onClose(); }
    catch (e: any) { setErr(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function onDelete() {
    if (!confirm("Delete schedule for this story?")) return;
    setSaving(true); setErr(null); setOk(null);
    try { await remove(storyId); setOk("Deleted."); onClose(); }
    catch (e: any) { setErr(e?.message || "Delete failed"); }
    finally { setSaving(false); }
  }
  async function onSendNow() {
    setSaving(true); setErr(null); setOk(null);

    if (!state.recipients || state.recipients.length === 0) {
      setSaving(false);
      setErr("Add at least one recipient (comma or newline separated).");
      return;
    }
    if (!hhmm(state.timeOfDay)) {
      setSaving(false);
      setErr("Time must be in HH:MM (24h) format.");
      return;
    }
    if (!state.timezone) {
      setSaving(false);
      setErr("Timezone is required.");
      return;
    }

    try {
      const res = await sendTestFlexible(state);
      setOk(`Sent to: ${(res?.sentTo || state.recipients || []).join(", ")}`);
    } catch (e: any) {
      setErr(e?.message || "Send failed");
    } finally {
      setSaving(false);
    }
  }

  // ——— SSR guard
  if (typeof window === "undefined") return null;

  // ——— overlay DOM
  const overlay = (
    <div
      data-test="rsf-overlay"
      className="fixed inset-0 z-[2147483647] bg-black/60"
      role="dialog"
      aria-modal="true"
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="absolute right-0 top-0 h-full w-[min(560px,92vw)] bg-white text-black p-4 overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ willChange: "transform" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Schedule – {storyId}</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>

        {loading && <div className="py-6 text-gray-600">Loading…</div>}

        {!loading && (
          <>
            {err && (
              <div className="mb-3 rounded border border-red-300 bg-red-50 text-red-700 px-3 py-2">
                {err}
              </div>
            )}
            {ok && (
              <div className="mb-3 rounded border border-green-300 bg-green-50 text-green-700 px-3 py-2">
                {ok}
              </div>
            )}

            <div className="space-y-3">
              <label className="block">
                <div>Recipients (comma or newline separated)</div>
                <textarea
                  className="w-full border px-2 py-2 min-h-[72px]"
                  value={recipientsRaw}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setRecipientsRaw(raw);
                    setState((s) => ({ ...s, recipients: splitList(raw) }));
                  }}
                  placeholder={"name@company.com\nanalyst@agency.com"}
                />
                <div className="text-xs text-gray-600">
                  Parsed: {state.recipients.length ? state.recipients.join(", ") : "—"}
                </div>
              </label>

              <label className="block">
                <div>Frequency</div>
                <select
                  className="border px-2 py-1"
                  value={state.frequency}
                  onChange={(e) => setState((s) => ({ ...s, frequency: e.target.value as Frequency }))}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              <div className="flex gap-3">
                <label className="block">
                  <div>Time of day (HH:MM)</div>
                  <input
                    className="border px-2 py-1"
                    value={state.timeOfDay}
                    onChange={(e) => setState((s) => ({ ...s, timeOfDay: e.target.value }))}
                    placeholder="09:00"
                  />
                </label>
                <label className="block">
                  <div>Timezone</div>
                  <input
                    className="border px-2 py-1"
                    value={state.timezone}
                    onChange={(e) => setState((s) => ({ ...s, timezone: e.target.value }))}
                    placeholder="Europe/Amsterdam"
                  />
                </label>
              </div>

              <label className="block">
                <div>Range</div>
                <select
                  className="border px-2 py-1"
                  value={state.rangeSpec}
                  onChange={(e) => setState((s) => ({ ...s, rangeSpec: e.target.value as RangeSpec }))}
                >
                  <option value="last7d">Last 7 days</option>
                  <option value="last30d">Last 30 days</option>
                </select>
              </label>

              <label className="block">
                <div>Terminal pages (optional, comma separated)</div>
                <input
                  className="w-full border px-2 py-1"
                  value={terminalStr}
                  onChange={(e) => setState((s) => ({ ...s, terminal: splitList(e.target.value) }))}
                  placeholder="__END__, ch3_pg4_end"
                />
              </label>

              {state._lastRun && (
                <div className="text-sm text-gray-600">
                  Last run: <b>{state._lastRun}</b>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  className="px-3 py-2 border rounded disabled:opacity-60"
                  onClick={onSave}
                  disabled={!isValid || saving}
                  title={!isValid ? "Fill required fields (recipients, time, timezone...)" : ""}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="px-3 py-2 border rounded disabled:opacity-60"
                  onClick={onSendNow}
                  disabled={saving || state.recipients.length === 0}
                >
                  {saving ? "Sending…" : "Send test now"}
                </button>
                <button
                  className="px-3 py-2 border rounded border-red-400 text-red-600 disabled:opacity-60"
                  onClick={onDelete}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>

              <p className="text-xs text-gray-600 pt-2">
                Tip: ha nincs <code>game_complete</code> event,
                add meg a terminál oldalak ID-it a „Terminal pages” mezőben.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

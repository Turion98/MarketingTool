"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./FeedbackOverlay.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { getLastAudioPerfLog } from "../../lib/audioCache";
import { getLastImagePerfLog } from "../../lib/useImageCache";
import { useRouter } from "next/navigation";

type Props = {
  show?: boolean;
  /** Opcionális override – ha nem a backend /api/feedback az endpoint */
  submitUrl?: string;
  /** StoryPage-ből érkező teljes reset + navigate callback */
  onRestart?: () => void;
};

type Answer =
  | { id: string; type: "rating"; value: number }
  | { id: string; type: "boolean"; value: boolean }
  | { id: string; type: "text"; value: string };

type Payload = {
  sessionId?: string | null;
  pageId?: string | null;
  email?: string | null;
  clientTs?: string;
  answers: Answer[];
  meta?: Record<string, unknown>;
};

// ——— API base ———
// .env.local: NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
const API_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE
    ? process.env.NEXT_PUBLIC_API_BASE
    : "http://127.0.0.1:8000";

const DEFAULT_SUBMIT_URL = `${API_BASE}/api/feedback`;

export default function FeedbackOverlay({
  show,
  submitUrl = DEFAULT_SUBMIT_URL,
  onRestart,
}: Props) {
  const router = useRouter();
  const { currentPageData } = useGameState() as any;

  const pageId: string | null =
    currentPageData?.id ||
    (typeof window !== "undefined"
      ? localStorage.getItem("currentPageId") || null
      : null);

  const sessionId: string | null =
    typeof window !== "undefined" ? localStorage.getItem("sessionId") : null;

  // ——— Kérdések állapota ———
  // 1–3. Pontozás (kötelező)
  const [q1, setQ1] = useState<number | null>(null); // összélmény
  const [q2, setQ2] = useState<number | null>(null); // érthetőség (történet + döntések)
  const [q3, setQ3] = useState<number | null>(null); // bevonódás / hangulat

  // 4–6. Igen/Nem (kötelező)
  const [q4, setQ4] = useState<boolean | null>(null); // ajánlanád?
  const [q5, setQ5] = useState<boolean | null>(null); // audiovizuális kiegészítés ok?
  const [q6, setQ6] = useState<boolean | null>(null); // érdekelne hosszabb verzió?

  // 7. Kifejtős (opcionális)
  const [q7, setQ7] = useState<string>("");

  // 8. Email (opcionális)
  const [email, setEmail] = useState<string>("");

  // Egyéb UI állapot
  const [includeDiag, setIncludeDiag] = useState(true); // jelenleg fixen bekapcsolva (nincs UI toggle)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [redirectTid, setRedirectTid] = useState<number | null>(null);

  // Reset, amikor felnyitjuk vagy oldal vált
  useEffect(() => {
    if (!show) return;
    setQ1(null);
    setQ2(null);
    setQ3(null);
    setQ4(null);
    setQ5(null);
    setQ6(null);
    setQ7("");
    setEmail("");
    setIncludeDiag(true);
    setSubmitting(false);
    setError(null);
    setSent(false);
  }, [show, pageId]);

  // Takarítás: várakozó átirányítás törlése unmountkor/bezáráskor
  useEffect(() => {
    return () => {
      if (redirectTid) {
        clearTimeout(redirectTid);
      }
    };
  }, [redirectTid]);

  // Diagnosztika – UA, URL, idő, audio/image perf
  const diagnostics = useMemo(() => {
    if (!includeDiag) return undefined;
    const audio = typeof getLastAudioPerfLog === "function" ? getLastAudioPerfLog() : null;
    const image = typeof getLastImagePerfLog === "function" ? getLastImagePerfLog() : null;
    return {
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      url: typeof location !== "undefined" ? location.href : "",
      time: new Date().toISOString(),
      perf: { audio, image },
    };
  }, [includeDiag]);

  // Email minimális validálás (opcionális mező)
  const emailLooksValid = useMemo(() => {
    if (!email.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  // Kötelezők teljesülése
  const requiredAnswered =
    q1 != null && q2 != null && q3 != null && q4 != null && q5 != null && q6 != null;

  const answersPreview: Answer[] = useMemo(() => {
    const out: Answer[] = [];
    if (q1 != null) out.push({ id: "overall_experience", type: "rating", value: q1 });
    if (q2 != null) out.push({ id: "story_clarity_and_choices", type: "rating", value: q2 });
    if (q3 != null) out.push({ id: "immersion", type: "rating", value: q3 });
    if (q4 != null) out.push({ id: "recommend_to_others", type: "boolean", value: q4 });
    if (q5 != null) out.push({ id: "audiovisual_fits_story", type: "boolean", value: q5 });
    if (q6 != null) out.push({ id: "interested_in_longer_version", type: "boolean", value: q6 });
    if (q7.trim()) out.push({ id: "favorite_moment", type: "text", value: q7.trim() });
    return out;
  }, [q1, q2, q3, q4, q5, q6, q7]);

  const canSubmit = !!show && !submitting && requiredAnswered && emailLooksValid;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Payload = {
        sessionId,
        pageId: pageId ?? undefined,
        clientTs: new Date().toISOString(),
        email: email.trim() ? email.trim() : undefined,
        answers: answersPreview,
        meta: diagnostics ? { diagnostics } : undefined,
      };

      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Küldési hiba: ${res.status}${txt ? ` — ${txt.slice(0, 180)}` : ""}`);
      }
      setSent(true);

      // Átirányítás 3 mp múlva – preferáltan StoryPage onRestart (hard reset + navigate)
      const tid = window.setTimeout(() => {
        if (typeof onRestart === "function") {
          onRestart();
        } else {
          try {
            localStorage.setItem("currentPageId", "landing");
          } catch {}
          router.push("/?page=landing");
        }
      }, 3000);
      setRedirectTid(tid as unknown as number);
    } catch (e: any) {
      setError(e?.message ?? "Ismeretlen hiba történt.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  // UI segédek
  const StarRow = ({
    value,
    onChange,
    ariaLabelPrefix,
  }: {
    value: number | null;
    onChange: (v: number) => void;
    ariaLabelPrefix: string;
  }) => (
    <div className={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`${styles.star} ${value && value >= n ? styles.active : ""}`}
          onClick={() => onChange(n)}
          aria-label={`${ariaLabelPrefix}: ${n} csillag`}
          type="button"
        >
          ★
        </button>
      ))}
    </div>
  );

  const YesNo = ({
    value,
    onChange,
    yesLabel = "Igen",
    noLabel = "Nem",
  }: {
    value: boolean | null;
    onChange: (v: boolean) => void;
    yesLabel?: string;
    noLabel?: string;
  }) => (
    <div className={styles.ynRow}>
      <button
        type="button"
        className={`${styles.ynBtn} ${value === true ? styles.selected : ""}`}
        onClick={() => onChange(true)}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        className={`${styles.ynBtn} ${value === false ? styles.selected : ""}`}
        onClick={() => onChange(false)}
      >
        {noLabel}
      </button>
    </div>
  );

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal>
        <div className={styles.header}>
          <h3>Visszajelzés</h3>
        </div>

        {!sent ? (
          <>
            {/* 1–3. Pontozás */}
            <div className={styles.section}>
              <label className={styles.label}>Mennyire tetszett összességében az élmény?</label>
              <StarRow value={q1} onChange={setQ1} ariaLabelPrefix="Összbenyomás" />
            </div>

            <div className={styles.section}>
              <label className={styles.label}>
                Mennyire volt könnyen érthető a történet és a döntések?
              </label>
              <StarRow value={q2} onChange={setQ2} ariaLabelPrefix="Érthetőség" />
            </div>

            <div className={styles.section}>
              <label className={styles.label}>
                Mennyire érezted magad bevonva / mennyire magával ragadó volt a hangulat?
              </label>
              <StarRow value={q3} onChange={setQ3} ariaLabelPrefix="Bevonódás" />
            </div>

            {/* 4–6. Igen/Nem */}
            <div className={styles.section}>
              <label className={styles.label}>Ajánlanád másnak a játékot?</label>
              <YesNo value={q4} onChange={setQ4} />
            </div>

            <div className={styles.section}>
              <label className={styles.label}>
                A képi és hang világ jól egészítette ki a storyt?
              </label>
              <YesNo value={q5} onChange={setQ5} />
            </div>

            <div className={styles.section}>
              <label className={styles.label}>
                Érdekelne egy hosszabb, részletesebb változat is a játékból?
              </label>
              <YesNo value={q6} onChange={setQ6} />
            </div>

            {/* 7. Kifejtős (opcionális) */}
            <div className={styles.section}>
              <label className={styles.label}>
                Mi volt a kedvenc pillanatod, vagy mi tetszett a legjobban?
                <span className={styles.optional}> (opcionális)</span>
              </label>
              <textarea
                className={styles.textarea}
                rows={4}
                value={q7}
                onChange={(e) => setQ7(e.target.value)}
              />
            </div>

            {/* 8. Email (opcionális) */}
            <div className={styles.section}>
              <label className={styles.label}>
                Ha szeretnél early access híreket vagy további tesztelést, add meg az email címed
                <span className={styles.optional}> (opcionális)</span>
              </label>
              <input
                type="email"
                className={`${styles.input} ${emailLooksValid ? "" : styles.inputError}`}
                placeholder="pl. te@pelda.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {!emailLooksValid ? (
                <div className={styles.errorInline}>Kérlek, érvényes email címet adj meg.</div>
              ) : null}
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}

            <div className={styles.footer}>
              <button
                className={styles.primary}
                onClick={submit}
                disabled={!canSubmit}
                type="button"
              >
                {submitting ? "Küldés…" : "Küldés"}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.section}>
            <div className={styles.readonly}>
              Köszönjük a visszajelzésed! 🙏
              <br />
              Átirányítás a kezdőlapra…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

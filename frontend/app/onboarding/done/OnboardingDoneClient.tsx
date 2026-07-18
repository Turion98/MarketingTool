"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { readSession } from "../new/briefSession";
import s from "./onboardingDone.module.scss";

export default function OnboardingDoneClient() {
  const params = useSearchParams();
  const session = useMemo(() => readSession(), []);

  const jobId =
    params.get("jobId")?.trim() ||
    session.submittedJobId ||
    session.jobId ||
    null;
  const vendor =
    params.get("vendor")?.trim() || session.submittedVendorName || null;

  return (
    <div className={s.frame}>
      <div className={s.icon} aria-hidden="true">
        ✓
      </div>
      <p className={s.eyebrow}>Tudásbázis beküldve</p>
      <h1 className={s.title}>
        {vendor ? `${vendor} — adataid megérkeztek` : "Az adataid megérkeztek"}
      </h1>
      <p className={s.lead}>
        Köszönjük! A kitöltött információkat rögzítettük. A domain kutatás és a
        tudásbázis felépítése a következő lépésben indul — erről külön értesítünk.
      </p>

      <div className={s.card}>
        <p className={s.cardTitle}>Mi történik ezután?</p>
        <ol className={s.steps}>
          <li>Az adataidat strukturált kutatási anyaggá alakítjuk.</li>
          <li>Domain kutatás indul a szabályaid és forrásaid alapján.</li>
          <li>A tudásbázis összeáll — a chatbot ebből fog táplálkozni később.</li>
        </ol>
      </div>

      {jobId && (
        <p className={s.meta}>
          Referencia: <code>{jobId}</code>
        </p>
      )}

      <div className={s.actions}>
        <Link href="/" className={s.btnPrimary}>
          Vissza a főoldalra
        </Link>
        <Link href="/onboarding/new" className={s.btnGhost}>
          Adatok szerkesztése
        </Link>
      </div>

      <p className={s.placeholderNote}>
        Ez egy ideiglenes lezáró oldal. A tényleges feldolgozási folyamat és
        státusz-követés később kerül ide.
      </p>
    </div>
  );
}

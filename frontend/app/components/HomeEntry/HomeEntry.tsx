"use client";

import Link from "next/link";
import s from "./HomeEntry.module.scss";

export default function HomeEntry() {
  return (
    <div className={s.root}>
      <div className={s.panel}>
        <h1 className={s.title}>Questell</h1>
        <p className={s.lead}>
          Válassz: belépsz a szerkesztőbe, vagy megtekinted a present oldalt.
          A történet lejátszása továbbra is elérhető a demó / játék felületeken.
        </p>
        <div className={s.actions}>
          <Link
            href="/login?next=/editor"
            className={`${s.btn} ${s.btnPrimary}`}
          >
            Belépés a szerkesztőbe
          </Link>
          <Link href="/present" className={`${s.btn} ${s.btnSecondary}`}>
            Present oldal megtekintése
          </Link>
        </div>
        <p className={s.footer}>
          <Link href="/landing">Közvetlenül a demó / játék indítóhoz</Link>
        </p>
      </div>
    </div>
  );
}

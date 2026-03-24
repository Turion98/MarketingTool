"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/app/lib/auth/useAuth";
import s from "./login.module.scss";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") || "/editor";

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy || !ready) return;
      setError(null);
      setBusy(true);
      try {
        await login({ email, password });
        router.replace(nextPath.startsWith("/") ? nextPath : "/editor");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Belépés sikertelen.");
      } finally {
        setBusy(false);
      }
    },
    [busy, ready, login, email, password, router, nextPath]
  );

  return (
    <div className={s.root}>
      <div className={s.panel}>
        <h1 className={s.title}>Belépés</h1>
        <p className={s.lead}>
          Add meg az adataidat a szerkesztő megnyitásához. A{" "}
          <strong>fiók szint</strong> (ingyenes / fizetős / admin) dev módban az
          e-mail alapján dől el:{" "}
          <code style={{ fontSize: "0.8em", opacity: 0.9 }}>
            NEXT_PUBLIC_DEV_ADMIN_EMAILS
          </code>{" "}
          és{" "}
          <code style={{ fontSize: "0.8em", opacity: 0.9 }}>
            NEXT_PUBLIC_DEV_PAID_EMAILS
          </code>{" "}
          (Vercel / .env.local). A játék / demó a{" "}
          <Link href="/landing" className={s.inlineLink}>
            demó indítóról
          </Link>{" "}
          továbbra is belépés nélkül elérhető.
        </p>

        <form className={s.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={s.label} htmlFor="login-email">
            E-mail
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            className={s.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!ready || busy}
            required
          />

          <label className={s.label} htmlFor="login-password">
            Jelszó
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className={s.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready || busy}
            required
          />

          {error ? <p className={s.error}>{error}</p> : null}

          <button
            type="submit"
            className={`${s.btn} ${s.btnPrimary}`}
            disabled={!ready || busy}
          >
            {busy ? "Belépés…" : "Belépés"}
          </button>
        </form>

        <p className={s.footer}>
          <Link href="/">← Vissza a kezdőlapra</Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/lib/auth/useAuth";
import MarketingNav from "@/app/components/marketing/MarketingNav";
import s from "./login.module.scss";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySent, setNotifySent] = useState(false);
  const [showLoginMenu, setShowLoginMenu] = useState(false);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F5") {
        e.preventDefault();
        setShowLoginMenu((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <MarketingNav />
      <div className={s.root}>
        <div className={s.split}>
          <section className={s.comingSection} aria-labelledby="coming-soon-title">
            <p className={s.comingTitle} id="coming-soon-title">
              Coming soon.
            </p>
            <p className={s.comingSubtitle}>We&apos;re almost ready.</p>
            <p className={s.comingText}>
              Questell is being built right now. Sign up and be the first to get access when we
              launch.
            </p>

            {showLoginMenu ? (
              <div className={s.panelCol}>
                <div className={s.panel}>
                  <h1 className={s.title}>Questell fiók belépés</h1>
                  <p className={s.lead}>
                    Lépj be az admin felületre, és folytasd a flow-k szerkesztését, publikálását és
                    mérését.
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

                  <Link href="/test-chat" className={`${s.btn} ${s.btnSecondary} ${s.testBtn}`}>
                    Teszt
                  </Link>

                  <p className={s.footer}>
                    <Link href="/">← Vissza a marketing oldalra</Link>
                  </p>
                </div>
              </div>
            ) : null}

            <form
              className={s.notifyForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (!notifyEmail.trim()) return;
                setNotifySent(true);
              }}
            >
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className={s.input}
                placeholder="Email address"
                aria-label="Email address"
                required
              />
              <button type="submit" className={`${s.btn} ${s.btnSecondary}`}>
                Notify me
              </button>
            </form>
            {notifySent ? <p className={s.notifyOk}>Thanks, we will notify you.</p> : null}
          </section>
        </div>
      </div>
    </>
  );
}

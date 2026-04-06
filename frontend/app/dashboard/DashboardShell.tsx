"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/app/lib/auth/useAuth";
import s from "./dashboardShell.module.scss";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      const next = pathname.startsWith("/") ? pathname : "/dashboard";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready) {
    return (
      <div className={s.loading}>
        <span>Betöltés…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={s.loading}>
        <span>Átirányítás a belépéshez…</span>
      </div>
    );
  }

  const isDashHome = pathname === "/dashboard";
  const isStories =
    pathname === "/dashboard/stories" ||
    pathname.startsWith("/dashboard/stories/");

  return (
    <div className={s.root}>
      <aside className={s.sidebar} aria-label="Dashboard navigáció">
        <div className={s.brand}>
          <p className={s.brandTitle}>Questell</p>
          <p className={s.brandSub}>Dashboard</p>
        </div>
        <nav className={s.nav}>
          <Link
            href="/dashboard"
            className={cx(s.navLink, isDashHome && !isStories && s.navLinkActive)}
          >
            Áttekintés
          </Link>
          <Link
            href="/dashboard/stories"
            className={cx(s.navLink, isStories && s.navLinkActive)}
          >
            Sztorijaim
          </Link>
          <Link
            href="/editor"
            className={cx(s.navLink, s.navLinkExternal)}
          >
            Szerkesztő
          </Link>
          <Link href="/" className={s.navLink}>
            Kezdőlap
          </Link>
        </nav>
        <div className={s.footer}>
          <div className={s.user}>{user.email}</div>
          <button
            type="button"
            className={s.logoutBtn}
            onClick={() => void logout().then(() => router.replace("/"))}
          >
            Kijelentkezés
          </button>
        </div>
      </aside>
      <main className={s.main}>{children}</main>
    </div>
  );
}

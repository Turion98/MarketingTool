"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const isVideoPage =
    pathname === "/dashboard/video-page" ||
    pathname.startsWith("/dashboard/video-page/");

  useEffect(() => {
    if (!sidebarOpen) return;
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [sidebarOpen]);

  return (
    <div className={s.root}>
      <button
        type="button"
        className={s.sidePanelTrigger}
        aria-expanded={sidebarOpen}
        aria-controls="dashboard-sidebar"
        aria-label={sidebarOpen ? "Dashboard panel elrejtése" : "Dashboard panel megnyitása"}
        onClick={() => setSidebarOpen((v) => !v)}
      >
        {sidebarOpen ? "◀" : "▶"}
      </button>

      {sidebarOpen ? (
        <button
          type="button"
          className={s.sidePanelBackdrop}
          aria-label="Dashboard panel bezárása"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        id="dashboard-sidebar"
        className={cx(s.sidebar, sidebarOpen ? s.sidebarOpen : s.sidebarClosed)}
        aria-label="Dashboard navigáció"
      >
        <div className={s.brand}>
          <p className={s.brandTitle}>Questell</p>
          <p className={s.brandSub}>Dashboard</p>
        </div>
        <nav className={s.nav}>
          <Link
            href="/dashboard"
            className={cx(s.navLink, isDashHome && !isStories && s.navLinkActive)}
            onClick={() => setSidebarOpen(false)}
          >
            Áttekintés
          </Link>
          <Link
            href="/dashboard/stories"
            className={cx(s.navLink, isStories && s.navLinkActive)}
            onClick={() => setSidebarOpen(false)}
          >
            Sztorijaim
          </Link>
          <Link
            href="/dashboard/video-page"
            className={cx(s.navLink, isVideoPage && s.navLinkActive)}
            onClick={() => setSidebarOpen(false)}
          >
            Video Landing (Temp)
          </Link>
          <Link
            href="/editor"
            className={cx(s.navLink, s.navLinkExternal)}
            onClick={() => setSidebarOpen(false)}
          >
            Szerkesztő
          </Link>
          <Link href="/" className={s.navLink} onClick={() => setSidebarOpen(false)}>
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

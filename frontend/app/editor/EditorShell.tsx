"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/app/lib/auth/useAuth";

export default function EditorShell() {
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent("/editor")}`);
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "clamp(1.25rem, 4vw, 2rem)",
          background: "#0b0f18",
          color: "#e8ecf4",
          fontFamily: "var(--font-heading-present), system-ui, sans-serif",
        }}
      >
        Betöltés…
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "clamp(1.25rem, 4vw, 2rem)",
          background: "#0b0f18",
          color: "#e8ecf4",
          fontFamily: "var(--font-heading-present), system-ui, sans-serif",
        }}
      >
        Átirányítás a belépéshez…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "clamp(1.25rem, 4vw, 2rem)",
        background: "#0b0f18",
        color: "#e8ecf4",
        fontFamily: "var(--font-heading-present), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Szerkesztő</h1>
        <button
          type="button"
          onClick={() => void logout().then(() => router.replace("/"))}
          style={{
            padding: "0.45rem 0.85rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.06)",
            color: "#e8ecf4",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          Kilépés
        </button>
      </div>
      <p style={{ margin: "0 0 0.35rem", opacity: 0.75, fontSize: "0.9rem" }}>
        Bejelentkezve: <strong>{user.email ?? user.id}</strong>
      </p>
      <p style={{ margin: "0 0 1.25rem", opacity: 0.85, maxWidth: "36rem" }}>
        Ez az üres szerkesztő kezdőlap. A vizuális szerkesztő funkciók ide
        kerülnek. Később ide köthető a külső auth szolgáltató (Clerk, Auth0,
        stb.) a mostani sessionStorage helyett.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          color: "#a8c4ff",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        ← Vissza a kezdőlapra
      </Link>
    </div>
  );
}

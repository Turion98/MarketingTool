"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/app/lib/auth/useAuth";
import EditorStudio from "./EditorStudio";

export default function EditorShell() {
  const router = useRouter();
  const { user, ready, logout, tierLabel, canUsePaidFeatures, isAdmin } =
    useAuth();

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

  const tierColor = isAdmin
    ? "#c4b5fd"
    : canUsePaidFeatures
      ? "#7dd3fc"
      : "#94a3b8";

  return (
    <EditorStudio
      userEmail={user.email}
      userId={user.id}
      tierLabel={tierLabel}
      tierColor={tierColor}
      onLogout={() => void logout().then(() => router.replace("/"))}
    />
  );
}

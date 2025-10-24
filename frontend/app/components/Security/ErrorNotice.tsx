// frontend/app/components/Security/ErrorNotice.tsx
//
// Kis, újrafelhasználható komponens, ami biztonsági blokkolásnál jelenik meg.
// Nem dob stacktrace-et a user arcába, csak elmondja hogy túl sok akció volt.
//
// Használat:
//   {rateLimit.ok ? null : (
//     <ErrorNotice
//        message="Túl sok művelet túl gyorsan. Lassíts egy kicsit 🙏"
//        retryAfterMs={rateLimit.retryAfterMs}
//     />
//   )}

"use client";

import React from "react";

export type ErrorNoticeProps = {
  message: string;
  retryAfterMs?: number;
};

export default function ErrorNotice({
  message,
  retryAfterMs = 0,
}: ErrorNoticeProps) {
  // retryAfterMs emberibb formázása másodpercekre
  const secs =
    retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : undefined;

  return (
    <div
      style={{
        border: "1px solid rgba(255,0,0,0.4)",
        background: "rgba(255,0,0,0.08)",
        color: "#a00000",
        fontSize: "0.9rem",
        lineHeight: 1.4,
        padding: "0.75rem 1rem",
        borderRadius: "8px",
        maxWidth: "320px",
      }}
      role="alert"
    >
      <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
        Biztonsági korlát aktiválva
      </div>
      <div>{message}</div>
      {secs !== undefined && secs > 0 ? (
        <div style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: "0.5rem" }}>
          Próbáld újra kb. {secs} mp múlva.
        </div>
      ) : null}
    </div>
  );
}

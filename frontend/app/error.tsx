// app/error.tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 16, fontFamily: "ui-sans-serif" }}>
      <h1>⚠️ Runtime error</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{String(error?.message || error)}</p>
      {error?.stack && (
        <details style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
          <summary>Stack trace</summary>
          {error.stack}
        </details>
      )}
      <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 12px" }}>
        Try again
      </button>
    </div>
  );
}

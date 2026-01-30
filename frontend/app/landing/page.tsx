// app/landing/page.tsx
import { Suspense } from "react";
import RootPageClient from "../RootPageClient";

export default function LandingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <RootPageClient />
    </Suspense>
  );
}

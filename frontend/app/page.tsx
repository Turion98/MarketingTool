// app/page.tsx
import { Suspense } from "react";
import RootPageClient from "./RootPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <RootPageClient />
    </Suspense>
  );
}

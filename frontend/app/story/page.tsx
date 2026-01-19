// app/story/page.tsx
import { Suspense } from "react";
import StoryPageClient from "./StoryPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading story…</div>}>
      <StoryPageClient />
    </Suspense>
  );
}

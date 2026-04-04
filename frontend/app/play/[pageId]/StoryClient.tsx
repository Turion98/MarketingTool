// app/play/[pageId]/StoryClient.tsx
"use client";

import StoryPage from "@/app/components/StoryPage/StoryPage";

/** Skin / src a StoryPage + GameState + meta.url útvonalon; props a layout kompatibilitásához. */
export default function StoryClient(_props: {
  pageId: string;
  skin: string;
  src: string;
}) {
  return <StoryPage />;
}

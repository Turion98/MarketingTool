// app/play/[pageId]/page.tsx
export const revalidate = 60;            // ✅ ISR
export const dynamic = "force-static";   // ✅ cache-elhető legyen

type Props = {
  params: { pageId: string };
  searchParams: Record<string, string | string[] | undefined>;
};

import StoryClient from "./StoryClient";

export default function Page({ params, searchParams }: Props) {
  const pageId = params.pageId;
  const skin = (searchParams?.skin as string) || "contract_default";
  const src  = (searchParams?.src  as string) || "global.json";

  return <StoryClient pageId={pageId} skin={skin} src={src} />;
}

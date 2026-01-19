// app/play/[pageId]/page.tsx
export const revalidate = 60;            // ✅ ISR
export const dynamic = "force-static";   // ✅ cache-elhető legyen

import StoryClient from "./StoryClient";

type Props = {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ params, searchParams }: Props) {
  const { pageId } = await params;
  const sp = await searchParams;

  const skin = (sp?.skin as string) || "contract_default";
  const src = (sp?.src as string) || "global.json";

  return <StoryClient pageId={pageId} skin={skin} src={src} />;
}

import type { Metadata } from "next";
import SupportEnginePage from "@/app/components/marketing/supportEngine/SupportEnginePage";
import { SUPPORT_ENGINE_METADATA } from "@/app/components/marketing/supportEngine/supportEngineContent";

export const metadata: Metadata = {
  title: SUPPORT_ENGINE_METADATA.title,
  description: SUPPORT_ENGINE_METADATA.description,
  openGraph: {
    title: `${SUPPORT_ENGINE_METADATA.title} | Questell`,
    description: SUPPORT_ENGINE_METADATA.description,
  },
};

export default function Page() {
  return <SupportEnginePage />;
}

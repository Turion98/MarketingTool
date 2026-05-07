import type { Metadata } from "next";
import FeaturesPage from "@/app/components/marketing/features/FeaturesPage";
import { FEATURES_METADATA } from "@/app/components/marketing/features/featuresContent";

export const metadata: Metadata = {
  title: FEATURES_METADATA.en.title,
  description: FEATURES_METADATA.en.description,
  openGraph: {
    title: `${FEATURES_METADATA.en.title} | Questell`,
    description: FEATURES_METADATA.en.description,
  },
};

export default function Page() {
  return <FeaturesPage />;
}

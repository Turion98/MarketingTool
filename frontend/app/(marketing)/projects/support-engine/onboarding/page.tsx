import type { Metadata } from "next";
import OnboardingIntroPage from "@/app/components/marketing/onboarding/OnboardingIntroPage";
import { ONBOARDING_METADATA } from "@/app/components/marketing/onboarding/onboardingContent";

export const metadata: Metadata = {
  title: ONBOARDING_METADATA.title,
  description: ONBOARDING_METADATA.description,
  openGraph: {
    title: `${ONBOARDING_METADATA.title} | Questell`,
    description: ONBOARDING_METADATA.description,
  },
};

export default function Page() {
  return <OnboardingIntroPage />;
}

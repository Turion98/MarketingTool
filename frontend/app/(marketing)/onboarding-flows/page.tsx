import type { Metadata } from "next";
import OnboardingFlowsPage from "@/app/components/marketing/onboardingFlows/OnboardingFlowsPage";

export const metadata: Metadata = {
  title: "Onboarding flows",
  description:
    "Stateful onboarding: Questell interprets how answers combine — not quiz logic where only the last click matters. Route precisely, scale one content set, and capture decision patterns worth acting on.",
  openGraph: {
    title: "Onboarding flows | Questell",
    description:
      "Stateful onboarding: Questell interprets how answers combine — not quiz logic where only the last click matters. Route precisely, scale one content set, and capture decision patterns worth acting on.",
  },
};

export default function Page() {
  return <OnboardingFlowsPage />;
}

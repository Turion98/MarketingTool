import type { Metadata } from "next";
import PricingPage from "@/app/components/marketing/pricing/PricingPage";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple pricing with one starting point and clear plan comparison.",
  openGraph: {
    title: "Pricing | Questell",
    description: "Simple pricing with one starting point and clear plan comparison.",
  },
};

export default function Page() {
  return <PricingPage />;
}

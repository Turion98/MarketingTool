import type { Metadata } from "next";
import SaasPage from "@/app/components/marketing/saas/SaasPage";

export const metadata: Metadata = {
  title: "SaaS",
  description:
    "Most SaaS churn does not start at cancellation. It starts at the first wrong turn inside the product. Questell builds the decision layer that keeps users on the right path from the beginning.",
  openGraph: {
    title: "SaaS | Questell",
    description:
      "Most SaaS churn does not start at cancellation. It starts at the first wrong turn inside the product. Questell builds the decision layer that keeps users on the right path from the beginning.",
  },
};

export default function Page() {
  return <SaasPage />;
}

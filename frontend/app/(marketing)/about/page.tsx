import type { Metadata } from "next";
import AboutRequestPage from "@/app/components/marketing/about/AboutRequestPage";

export const metadata: Metadata = {
  title: "Request your first flow",
  description:
    "Tell us where the decision happens. We map the logic, build the flow, and embed it on a live page.",
  openGraph: {
    title: "Request your first flow | Questell",
    description:
      "Tell us where the decision happens. We map the logic, build the flow, and embed it on a live page.",
  },
};

export default function Page() {
  return <AboutRequestPage />;
}

import type { Metadata } from "next";
import SolutionsHubPage from "@/app/components/marketing/solutions/SolutionsHubPage";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Choose a use case to explore how Questell works in real scenarios.",
  openGraph: {
    title: "Solutions | Questell",
    description:
      "Choose a use case to explore how Questell works in real scenarios.",
  },
};

export default function Page() {
  return <SolutionsHubPage />;
}

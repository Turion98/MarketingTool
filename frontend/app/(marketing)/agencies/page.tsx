import type { Metadata } from "next";
import AgenciesPage from "@/app/components/marketing/agencies/AgenciesPage";

export const metadata: Metadata = {
  title: "Agencies",
  description:
    "Most interactive campaigns end at the click. Questell gives agencies a format that goes further: decision flows that respond to each user, reveal intent, and hold up as a case study.",
  openGraph: {
    title: "Agencies | Questell",
    description:
      "Most interactive campaigns end at the click. Questell gives agencies a format that goes further: decision flows that respond to each user, reveal intent, and hold up as a case study.",
  },
};

export default function Page() {
  return <AgenciesPage />;
}

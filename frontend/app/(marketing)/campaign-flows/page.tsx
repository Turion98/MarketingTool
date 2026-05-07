import type { Metadata } from "next";
import CampaignFlowsPage from "@/app/components/marketing/campaignFlows/CampaignFlowsPage";

export const metadata: Metadata = {
  title: "Campaign flows",
  description:
    "A decision flow is not a quiz you attach to a campaign. It is the campaign — the moment a brand stops broadcasting and starts responding.",
  openGraph: {
    title: "Campaign flows | Questell",
    description:
      "A decision flow is not a quiz you attach to a campaign. It is the campaign — the moment a brand stops broadcasting and starts responding.",
  },
};

export default function Page() {
  return <CampaignFlowsPage />;
}

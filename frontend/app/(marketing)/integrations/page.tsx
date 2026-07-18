import type { Metadata } from "next";
import IntegrationsPage from "@/app/components/marketing/integrations/IntegrationsPage";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Questell connects behind your existing chatbot. One endpoint for the chat, one adapter for your order system, one sink for your helpdesk.",
  openGraph: {
    title: "Integrations | Questell",
    description:
      "Questell connects behind your existing chatbot. One endpoint for the chat, one adapter for your order system, one sink for your helpdesk.",
  },
};

export default function Page() {
  return <IntegrationsPage />;
}

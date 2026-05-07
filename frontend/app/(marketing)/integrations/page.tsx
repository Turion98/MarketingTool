import type { Metadata } from "next";
import IntegrationsPage from "@/app/components/marketing/integrations/IntegrationsPage";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Questell runs inside your existing page. One script or iframe, no rebuild, no separate microsite.",
  openGraph: {
    title: "Integrations | Questell",
    description:
      "Questell runs inside your existing page. One script or iframe, no rebuild, no separate microsite.",
  },
};

export default function Page() {
  return <IntegrationsPage />;
}

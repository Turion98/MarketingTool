import type { Metadata } from "next";
import MarketingShell from "@/app/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: { default: "Questell", template: "%s | Questell" },
  description: "Embeddable decision flows and decision engine for your website.",
};

export default function MarketingRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}

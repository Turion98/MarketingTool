import type { Metadata } from "next";
import EcommercePage from "@/app/components/marketing/ecommerce/EcommercePage";

export const metadata: Metadata = {
  title: "E-commerce",
  description:
    "A shopper alone with your catalog is not a browsing problem. It is a selling problem. Questell puts decision logic where your best salesperson would stand.",
  openGraph: {
    title: "E-commerce | Questell",
    description:
      "A shopper alone with your catalog is not a browsing problem. It is a selling problem. Questell puts decision logic where your best salesperson would stand.",
  },
};

export default function Page() {
  return <EcommercePage />;
}

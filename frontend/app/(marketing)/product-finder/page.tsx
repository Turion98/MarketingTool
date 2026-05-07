import type { Metadata } from "next";
import ProductFinderPage from "@/app/components/marketing/productFinder/ProductFinderPage";

export const metadata: Metadata = {
  title: "Product finder",
  description:
    "Decision logic behind your products: interpret combined answers, narrow the decision space, and embed guided flows on ecommerce pages—without reducing your brand to a static quiz.",
  openGraph: {
    title: "Product finder | Questell",
    description:
      "Decision logic behind your products: interpret combined answers, narrow the decision space, and embed guided flows on ecommerce pages—without reducing your brand to a static quiz.",
  },
};

export default function Page() {
  return <ProductFinderPage />;
}

import type { MarketingPageConfig } from "@/config/marketingPages";
import MarketingPageBody from "../MarketingPageBody";

export default function MarketingPage({ config }: { config: MarketingPageConfig }) {
  return <MarketingPageBody config={config} template="marketing" />;
}

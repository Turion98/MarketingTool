import type { MarketingPageConfig } from "@/config/marketingPages";
import MarketingPageBody from "../MarketingPageBody";

export default function IndustryPage({ config }: { config: MarketingPageConfig }) {
  return <MarketingPageBody config={config} template="industry" />;
}

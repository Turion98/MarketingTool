import type { MarketingPageConfig } from "@/config/marketingPages";
import MarketingPageBody from "../MarketingPageBody";

export default function ResourcePage({ config }: { config: MarketingPageConfig }) {
  return <MarketingPageBody config={config} template="resource" />;
}

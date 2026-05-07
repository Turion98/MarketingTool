import type { MarketingPageConfig } from "@/config/marketingPages";
import MarketingPageBody from "../MarketingPageBody";

export default function UseCasePage({ config }: { config: MarketingPageConfig }) {
  return <MarketingPageBody config={config} template="use-case" />;
}

import MarketingPage from "@/app/components/marketing/templates/MarketingPage";
import { getMarketingPageConfig, marketingPageMetadata } from "@/config/marketingPages";

export const metadata = marketingPageMetadata("demos");

export default function Page() {
  return <MarketingPage config={getMarketingPageConfig("demos")} />;
}

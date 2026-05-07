import MarketingPage from "@/app/components/marketing/templates/MarketingPage";
import { getMarketingPageConfig, marketingPageMetadata } from "@/config/marketingPages";

export const metadata = marketingPageMetadata("examples");

export default function Page() {
  return <MarketingPage config={getMarketingPageConfig("examples")} />;
}

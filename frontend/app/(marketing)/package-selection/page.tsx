import UseCasePage from "@/app/components/marketing/templates/UseCasePage";
import { getMarketingPageConfig, marketingPageMetadata } from "@/config/marketingPages";

export const metadata = marketingPageMetadata("package-selection");

export default function Page() {
  return <UseCasePage config={getMarketingPageConfig("package-selection")} />;
}

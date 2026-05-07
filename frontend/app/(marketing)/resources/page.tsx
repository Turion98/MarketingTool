import ResourcePage from "@/app/components/marketing/templates/ResourcePage";
import { getMarketingPageConfig, marketingPageMetadata } from "@/config/marketingPages";

export const metadata = marketingPageMetadata("resources");

export default function Page() {
  return <ResourcePage config={getMarketingPageConfig("resources")} />;
}

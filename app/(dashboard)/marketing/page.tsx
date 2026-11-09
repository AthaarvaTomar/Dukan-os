import type { Metadata } from "next";
import { MarketingCampaigns } from "@/components/dashboard/marketing-campaigns";

export const metadata: Metadata = { title: "Marketing Campaigns" };

export default function MarketingPage() {
  return <MarketingCampaigns />;
}

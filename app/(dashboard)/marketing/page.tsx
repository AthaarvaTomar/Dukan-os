import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Marketing Campaigns" };

export default function MarketingPage() {
  return <ModulePlaceholder href="/marketing" />;
}

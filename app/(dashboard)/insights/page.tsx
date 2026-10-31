import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Business Insights" };

export default function InsightsPage() {
  return <ModulePlaceholder href="/insights" />;
}

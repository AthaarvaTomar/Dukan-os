import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewDashboard, OverviewLoading } from "@/components/dashboard/overview-dashboard";

export const metadata: Metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewLoading />}>
      <OverviewDashboard />
    </Suspense>
  );
}

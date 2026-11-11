import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingDashboard } from "@/components/dashboard/billing-dashboard";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1440px] animate-pulse space-y-6" role="status">
          <span className="sr-only">Loading billing…</span>
          <div className="h-9 w-48 rounded bg-slate-200" />
          <div className="h-96 rounded-2xl bg-white" />
        </div>
      }
    >
      <BillingDashboard />
    </Suspense>
  );
}


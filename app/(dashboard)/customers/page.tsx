import type { Metadata } from "next";
import { CustomersDashboard } from "@/components/dashboard/customers-dashboard";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <CustomersDashboard />;
}

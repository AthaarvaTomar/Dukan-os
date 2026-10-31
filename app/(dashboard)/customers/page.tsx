import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <ModulePlaceholder href="/customers" />;
}

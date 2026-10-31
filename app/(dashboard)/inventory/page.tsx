import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return <ModulePlaceholder href="/inventory" />;
}

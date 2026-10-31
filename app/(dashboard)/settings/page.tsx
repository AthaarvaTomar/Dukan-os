import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ModulePlaceholder href="/settings" />;
}

import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AiAssistantPage() {
  return <ModulePlaceholder href="/ai-assistant" />;
}

import type { Metadata } from "next";
import { AiAssistant } from "@/components/dashboard/ai-assistant";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AiAssistantPage() {
  return <AiAssistant />;
}

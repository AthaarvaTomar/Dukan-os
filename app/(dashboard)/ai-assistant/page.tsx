import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantChat, AssistantLoading } from "@/components/assistant/assistant-chat";

export const metadata: Metadata = {
  title: "AI assistant",
  description: "Chat and voice assistant for your shop sales, stock, and customer data.",
};

export default function AiAssistantPage() {
  return (
    <Suspense fallback={<AssistantLoading />}>
      <AssistantChat />
    </Suspense>
  );
}

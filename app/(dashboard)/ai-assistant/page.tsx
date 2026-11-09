import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantChat, AssistantLoading } from "@/components/assistant/assistant-chat";

export const metadata: Metadata = {
  title: "AI Assistant",
  description: "Chat and voice assistant for Sharma General Store.",
};

export default function AiAssistantPage() {
  return (
    <Suspense fallback={<AssistantLoading />}>
      <AssistantChat />
    </Suspense>
  );
}

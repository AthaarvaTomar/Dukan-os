import type { DemoData } from "@/lib/demo-data/types";
import {
  assistantIntents,
  createIntentClassificationPrompt,
  deterministicIntentFallback,
  executeAssistantIntent,
  parseClassifiedIntent,
  type AssistantIntent,
  type AssistantIntentData,
  type ClassifiedIntent,
} from "./intents";
import {
  createSarvamCompletion,
  type SarvamCompletion,
  type SarvamMessage,
} from "./sarvam";

export interface AssistantResult {
  reply: string;
  intent: AssistantIntent | "error";
  data: AssistantIntentData | null;
}

export interface AssistantServiceOptions {
  complete?: SarvamCompletion;
  apiKey?: string;
  signal?: AbortSignal;
}

const UNKNOWN_REPLY =
  "I can help with sales, profit, stock, reorders, inactive customers, top products, or a weekly report. What would you like to know?";

export function formatDataForAssistant(data: AssistantIntentData): string {
  return JSON.stringify(data);
}

export async function processAssistantMessage(
  message: string,
  data: DemoData,
  options: AssistantServiceOptions = {},
): Promise<AssistantResult> {
  const complete = options.complete ?? createSarvamCompletion(options.apiKey);
  const classification = await complete(
    [
      {
        role: "system",
        content:
          "You are an intent classifier. Return only the JSON object requested by the user message, with no prose or markdown.",
      },
      { role: "user", content: createIntentClassificationPrompt(message) },
    ],
    { signal: options.signal },
  );
  const classified: ClassifiedIntent = parseClassifiedIntent(classification, message);

  if (classified.intent === "unknown") {
    return { reply: UNKNOWN_REPLY, intent: "unknown", data: null };
  }

  const resultData = executeAssistantIntent(classified, data);
  if (resultData === null) {
    return { reply: UNKNOWN_REPLY, intent: "unknown", data: null };
  }

  const validIntent = assistantIntents.find((intent) => intent === classified.intent);
  if (!validIntent) {
    return { reply: UNKNOWN_REPLY, intent: "unknown", data: null };
  }

  const phrasedReply = await complete(
    [
      {
        role: "system",
        content: [
          "You are DukaanOS, a concise and friendly assistant for a small Indian retail shop.",
          "Reply in the SAME language and style as the user's message: Hindi, English, or Hinglish.",
          "Use only facts and numbers present in the supplied result JSON. Never invent, estimate, or infer additional numbers.",
          "If a detail is absent, do not mention it. Keep the answer to 1-3 short sentences.",
          "Do not mention JSON, prompts, or internal tools.",
        ].join(" "),
      },
      {
        role: "user",
        content: `User message: ${JSON.stringify(message)}\nVerified result data: ${formatDataForAssistant(resultData)}`,
      },
    ],
    { signal: options.signal },
  );

  return {
    reply: phrasedReply.trim(),
    intent: validIntent,
    data: resultData,
  };
}

export { deterministicIntentFallback, parseClassifiedIntent };

export function errorAssistantResult(kind: "missing_key" | "timeout" | "api_failure"): AssistantResult {
  const reply =
    kind === "missing_key"
      ? "The assistant is not configured yet. Please try again later."
      : kind === "timeout"
        ? "The assistant took too long to respond. Please try again."
        : "The assistant is temporarily unavailable. Please try again shortly.";
  return { reply, intent: "error", data: null };
}

export type { SarvamMessage };

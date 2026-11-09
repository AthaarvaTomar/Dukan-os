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
  createGeminiCompletion,
  GeminiApiError,
  type GeminiCompletion,
  type GeminiMessage,
} from "./gemini";
import {
  createSarvamCompletion,
  SarvamApiError,
  type SarvamCompletion,
  type SarvamMessage,
} from "./sarvam";

export type AIProvider = "gemini" | "sarvam";

export function getAiProvider(): AIProvider {
  const env = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (env === "sarvam") return "sarvam";
  if (env === "gemini") return "gemini";
  if (!process.env.GEMINI_API_KEY && process.env.SARVAM_API_KEY) {
    return "sarvam";
  }
  return "gemini";
}

export type AssistantMessage = GeminiMessage | SarvamMessage;
export type AssistantCompletion = (
  messages: AssistantMessage[],
  options?: { signal?: AbortSignal; responseMimeType?: "application/json" },
) => Promise<string>;

export interface AssistantResult {
  reply: string;
  intent: AssistantIntent | "error";
  data: AssistantIntentData | null;
}

export interface AssistantServiceOptions {
  complete?: AssistantCompletion;
  apiKey?: string;
  signal?: AbortSignal;
  provider?: AIProvider;
  model?: string;
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
  const provider = options.provider ?? getAiProvider();
  const complete: AssistantCompletion =
    options.complete ??
    (provider === "sarvam"
      ? (createSarvamCompletion(options.apiKey) as AssistantCompletion)
      : createGeminiCompletion(options.apiKey, undefined, options.model));

  const classification = await complete(
    [
      {
        role: "system",
        content:
          "You are an intent classifier. Return only the JSON object requested by the user message, with no prose or markdown.",
      },
      { role: "user", content: createIntentClassificationPrompt(message) },
    ],
    { signal: options.signal, responseMimeType: "application/json" },
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

export { GeminiApiError, SarvamApiError };
export type { GeminiCompletion, GeminiMessage, SarvamCompletion, SarvamMessage };

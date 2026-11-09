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

function inventoryIntent(intent: AssistantIntent): boolean {
  return [
    "low_stock",
    "reorder_suggestions",
    "stock_summary",
    "stock_below",
    "top_products",
  ].includes(intent);
}

function inventoryFallbackReply(
  intent: AssistantIntent,
  data: AssistantIntentData,
): string {
  if (intent === "stock_summary") {
    const totalUnits = typeof data.totalUnits === "number" ? data.totalUnits : 0;
    const low = typeof data.low === "number" ? data.low : 0;
    const out = typeof data.out === "number" ? data.out : 0;
    return `You have ${totalUnits} units across your products. ${low} products are low on stock and ${out} are out of stock.`;
  }
  const products = Array.isArray(data.products)
    ? data.products.filter(
        (product): product is Record<string, unknown> =>
          typeof product === "object" && product !== null,
      )
    : [];
  if (intent === "stock_below") {
    const names = products
      .map((product) => typeof product.productName === "string" ? product.productName : null)
      .filter((name): name is string => name !== null);
    return names.length
      ? `Products below the requested stock level: ${names.join(", ")}.`
      : "No products are below the requested stock level.";
  }
  if (intent === "top_products") {
    const sellers = products
      .map((product) => {
        const name = product.productName;
        const quantity = product.quantitySold;
        return typeof name === "string" && typeof quantity === "number"
          ? `${name} (${quantity} sold)`
          : null;
      })
      .filter((entry): entry is string => entry !== null);
    return sellers.length
      ? `Your top-selling products are ${sellers.join(", ")}.`
      : "There are no product sales in the available transaction history.";
  }
  const items = products
    .map((product) => {
      const name = product.productName ?? product.name;
      const stock = product.stock;
      const minimum = product.minimumStock ?? product.reorderLevel;
      const reorder = product.suggestedReorderQuantity;
      return typeof name === "string" &&
        typeof stock === "number" &&
        typeof minimum === "number" &&
        typeof reorder === "number"
        ? `${name}: ${stock} in stock, minimum ${minimum}, suggested reorder ${reorder}`
        : null;
    })
    .filter((entry): entry is string => entry !== null);
  return items.length
    ? `Products needing restock: ${items.join("; ")}. Suggestions use current stock, minimum levels, and recent completed sales.`
    : "No products are at or below their minimum stock levels.";
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

  const deterministic = deterministicIntentFallback(message);
  let classified: ClassifiedIntent;
  try {
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
    classified = parseClassifiedIntent(classification, message);
  } catch (error) {
    if (!inventoryIntent(deterministic.intent)) throw error;
    const resultData = executeAssistantIntent(deterministic, data);
    if (resultData === null) throw error;
    return {
      reply: inventoryFallbackReply(deterministic.intent, resultData),
      intent: deterministic.intent,
      data: resultData,
    };
  }

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

  let phrasedReply: string;
  try {
    phrasedReply = await complete(
      [
        {
          role: "system",
          content: [
            "You are DukaanOS, a concise and friendly assistant for a small Indian retail shop.",
            "Reply in the SAME language and style as the user's message: Hindi, English, or Hinglish.",
            "Use only facts and numbers present in the supplied result JSON. Never invent, estimate, or infer additional numbers.",
            "If a detail is absent, do not mention it. Keep the answer to 1-3 short sentences.",
            "For inventory recommendations, explain that quantities use transparent rules and recent sales, not machine learning.",
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
  } catch (error) {
    if (!inventoryIntent(validIntent)) throw error;
    return {
      reply: inventoryFallbackReply(validIntent, resultData),
      intent: validIntent,
      data: resultData,
    };
  }

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

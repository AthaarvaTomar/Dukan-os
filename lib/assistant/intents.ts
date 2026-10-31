import {
  averageOrderValue,
  bestSellingProducts,
  dailyRevenue,
  estimatedProfit,
  inventoryStatus,
  inventorySummary,
  segmentCustomers,
  totalExpenses,
  totalRevenue,
  totalTransactions,
} from "@/lib/demo-data/analytics";
import type { DemoData } from "@/lib/demo-data/types";
import { z } from "zod";

const periodSchema = z.enum(["today", "week", "month"]);

export const assistantIntentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("get_sales"),
    params: z.object({ period: periodSchema }).strict(),
  }).strict(),
  z.object({ intent: z.literal("get_profit"), params: z.object({}).strict() }).strict(),
  z.object({ intent: z.literal("low_stock"), params: z.object({}).strict() }).strict(),
  z.object({ intent: z.literal("reorder_suggestions"), params: z.object({}).strict() }).strict(),
  z.object({
    intent: z.literal("inactive_customers"),
    params: z.object({ days: z.number().int().min(1).max(365) }).strict(),
  }).strict(),
  z.object({
    intent: z.literal("top_products"),
    params: z.object({ limit: z.number().int().min(1).max(20) }).strict(),
  }).strict(),
  z.object({ intent: z.literal("weekly_report"), params: z.object({}).strict() }).strict(),
  z.object({ intent: z.literal("unknown"), params: z.object({}).strict() }).strict(),
]);

export type AssistantIntent = z.infer<typeof assistantIntentSchema>["intent"];
export type ClassifiedIntent = z.infer<typeof assistantIntentSchema>;
export type AssistantIntentData = Record<string, unknown>;

const intentNames = [
  "get_sales",
  "get_profit",
  "low_stock",
  "reorder_suggestions",
  "inactive_customers",
  "top_products",
  "weekly_report",
  "unknown",
] as const satisfies readonly AssistantIntent[];

export const assistantIntents: readonly AssistantIntent[] = intentNames;

const periodDays = {
  today: 1,
  week: 7,
  month: 30,
} as const;

function salesData(data: DemoData, period: keyof typeof periodDays) {
  const days = periodDays[period];
  const daily = dailyRevenue(data.transactions, days, new Date(data.asOf));
  const dates = new Set(daily.map((entry) => entry.date));
  const transactions = data.transactions.filter((transaction) =>
    dates.has(transaction.date.slice(0, 10)),
  );
  return {
    period,
    revenue: totalRevenue(transactions),
    transactions: totalTransactions(transactions),
    daily,
  };
}

function inactiveCustomerData(data: DemoData, days: number) {
  const customers = segmentCustomers(data.customers, data.transactions, new Date(data.asOf));
  const cutoff = new Date(data.asOf).getTime() - days * 24 * 60 * 60 * 1000;
  return {
    days,
    customers: customers.filter(
      (customer) =>
        !customer.lastPurchaseAt || new Date(customer.lastPurchaseAt).getTime() <= cutoff,
    ),
  };
}

function topProductData(data: DemoData, limit: number) {
  return bestSellingProducts(data.products, data.transactions, limit);
}

export function executeAssistantIntent(
  classified: ClassifiedIntent,
  data: DemoData,
): AssistantIntentData | null {
  switch (classified.intent) {
    case "get_sales":
      return salesData(data, classified.params.period);
    case "get_profit":
      return {
        estimatedProfit: estimatedProfit(data),
        revenue: totalRevenue(data.transactions),
        expenses: totalExpenses(data.expenses),
      };
    case "low_stock":
      return { ...inventorySummary(data.products) };
    case "reorder_suggestions":
      return {
        summary: inventorySummary(data.products),
        products: data.products.filter((product) => inventoryStatus(product) !== "normal"),
      };
    case "inactive_customers":
      return inactiveCustomerData(data, classified.params.days);
    case "top_products":
      return { products: topProductData(data, classified.params.limit) };
    case "weekly_report": {
      const sales = salesData(data, "week");
      const customerData = inactiveCustomerData(data, 45);
      return {
        sales,
        profit: {
          estimatedProfit: estimatedProfit(data),
          revenue: totalRevenue(data.transactions),
          expenses: totalExpenses(data.expenses),
        },
        inventory: inventorySummary(data.products),
        topProducts: topProductData(data, 5),
        inactiveCustomers: customerData.customers,
        averageOrderValue: averageOrderValue(data.transactions),
      };
    }
    case "unknown":
      return null;
  }
}

export function deterministicIntentFallback(message: string): ClassifiedIntent {
  const normalized = message.toLocaleLowerCase("en-IN");
  if (/\b(weekly report|week report|hafta|saptah)\b/.test(normalized)) {
    return { intent: "weekly_report", params: {} };
  }
  if (/\b(reorder|re-order|restock|order more|stock up|mang[aou])\b/.test(normalized)) {
    return { intent: "reorder_suggestions", params: {} };
  }
  if (/\b(inactive|not visited|haven't visited|haven't bought|inactive customers?|customers? not)\b/.test(normalized)) {
    const days = normalized.match(/\b(\d{1,3})\s*days?\b/);
    return {
      intent: "inactive_customers",
      params: { days: days ? Math.max(1, Math.min(365, Number(days[1]))) : 45 },
    };
  }
  if (/\b(top|best.sell|popular)\b/.test(normalized) && /\b(products?|items?)\b/.test(normalized)) {
    const limit = normalized.match(/\btop\s+(\d{1,2})\b/);
    return {
      intent: "top_products",
      params: { limit: limit ? Math.max(1, Math.min(20, Number(limit[1]))) : 5 },
    };
  }
  if (/\b(profit|munafa)\b/.test(normalized)) {
    return { intent: "get_profit", params: {} };
  }
  if (/\b(low.stock|out.of.stock|inventory|stock)\b/.test(normalized)) {
    return { intent: "low_stock", params: {} };
  }
  if (/\b(sales|sale|revenue|bikri|vikri|kamai)\b/.test(normalized)) {
    const period = /\b(week|weekly|hafta|saptah)\b/.test(normalized)
      ? "week"
      : /\b(month|monthly|mahina|maheena)\b/.test(normalized)
        ? "month"
        : "today";
    return { intent: "get_sales", params: { period } };
  }
  return { intent: "unknown", params: {} };
}

export function parseClassifiedIntent(
  rawResponse: string,
  originalMessage: string,
): ClassifiedIntent {
  const json = rawResponse
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(json);
    const result = assistantIntentSchema.safeParse(parsed);
    if (result.success && result.data.intent !== "unknown") return result.data;
    return deterministicIntentFallback(originalMessage);
  } catch {
    return deterministicIntentFallback(originalMessage);
  }
}

export function createIntentClassificationPrompt(message: string): string {
  return [
    "Classify the user's request for a small Indian retail shop.",
    "Return ONLY a JSON object with exactly this shape: {\"intent\":\"...\",\"params\":{...}}.",
    "Valid intents and params:",
    "- get_sales: {\"period\":\"today\"|\"week\"|\"month\"}; use today for requests about sales without another period.",
    "- get_profit: {}",
    "- low_stock: {}",
    "- reorder_suggestions: {}",
    "- inactive_customers: {\"days\": integer}; default to 45 if unspecified.",
    "- top_products: {\"limit\": integer}; default to 5 if unspecified.",
    "- weekly_report: {}",
    "- unknown: {}",
    "Do not answer the user or include markdown.",
    `User message: ${JSON.stringify(message)}`,
  ].join("\n");
}

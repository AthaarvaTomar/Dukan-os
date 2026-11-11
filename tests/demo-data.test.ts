import assert from "node:assert/strict";
import test from "node:test";
import {
  averageOrderValue,
  bestSellingProducts,
  customerSpending,
  dashboardTrend,
  dailyRevenue,
  estimatedProfit,
  getCustomerSegment,
  inventoryStatus,
  inventorySummary,
  segmentCustomers,
  totalExpenses,
  totalRevenue,
  totalTransactions,
  transactionCountForCustomer,
} from "../lib/demo-data/analytics.ts";
import { assertDemoDataIntegrity } from "../lib/demo-data/integrity.ts";
import { inventoryMetrics, inventoryRecommendations } from "../lib/demo-data/inventory.ts";
import { createDemoData } from "../lib/demo-data/seed.ts";
import {
  loadDemoData,
  removeById,
  saveDemoData,
  upsertById,
} from "../lib/demo-data/storage.ts";
import {
  deterministicIntentFallback,
  parseClassifiedIntent,
} from "../lib/assistant/intents.ts";
import { getAiProvider, processAssistantMessage } from "../lib/assistant/service.ts";
import { callGemini, GeminiApiError } from "../lib/assistant/gemini.ts";
import {
  callSarvam,
  SARVAM_CHAT_COMPLETIONS_URL,
  SARVAM_CHAT_MODEL,
  SarvamApiError,
} from "../lib/assistant/sarvam.ts";
import { POST as assistantPost } from "../app/api/assistant/route.ts";
import { GET as demoDataGet } from "../app/api/demo-data/route.ts";
import { PUT as inventoryStatePut } from "../app/api/inventory/state/route.ts";
import { GET as sarvamProxyGet } from "../app/api/sarvam/[...path]/route.ts";
import { GET as voiceConfigGet } from "../app/api/voice/config/route.ts";
import {
  GET as voiceCampaignsGet,
  POST as voiceCampaignsPost,
} from "../app/api/voice/campaigns/route.ts";
import { PATCH as voiceCampaignPatch } from "../app/api/voice/campaigns/[id]/route.ts";
import {
  POST as regenerateCampaignMessagePost,
} from "../app/api/voice/campaigns/[id]/messages/[customerId]/regenerate/route.ts";
import { POST as approveVoiceCampaignPost } from "../app/api/voice/campaigns/[id]/approve/route.ts";
import {
  GET as voiceToolsGet,
  POST as voiceToolsPost,
} from "../app/api/voice/tools/[tool]/route.ts";
import { getServerDemoData, updateServerInventory } from "../lib/demo-data/server-store.ts";
import {
  getInactiveCustomers,
  getRevenueAndProfit,
  getTodaySales,
} from "../lib/assistant/voice-tools.ts";
import {
  createPersonalizedCampaign,
  createPersonalizedMessage,
} from "../lib/assistant/campaign-messages.ts";
import type {
  Customer,
  CustomerSpending,
  DemoData,
  Expense,
  Product,
  Transaction,
} from "../lib/demo-data/types.ts";

const anchor = new Date("2026-10-31T12:00:00.000Z");
const customers: Customer[] = [
  { id: "cus-1", name: "Asha Rao", phone: "+91 90000 10001", email: "asha@example.com", address: "Bengaluru", joinedAt: "2026-01-01", notes: "" },
  { id: "cus-2", name: "Kabir Shah", phone: "+91 90000 10002", email: "kabir@example.com", address: "Bengaluru", joinedAt: "2026-01-01", notes: "" },
];
const products: Product[] = [
  { id: "prd-1", name: "Rice", sku: "SGS-0001", category: "Groceries", unit: "1 kg", price: 100, costPrice: 60, stock: 11, reorderLevel: 10 },
  { id: "prd-2", name: "Tea", sku: "SGS-0002", category: "Beverages", unit: "1 pack", price: 50, costPrice: 35, stock: 2, reorderLevel: 5 },
  { id: "prd-3", name: "Water", sku: "SGS-0003", category: "Beverages", unit: "1 bottle", price: 20, costPrice: 10, stock: 0, reorderLevel: 5 },
];

function transaction(
  id: string,
  customerId: string,
  date: string,
  productId: string,
  quantity: number,
  unitPrice: number,
  unitCost: number,
  discount = 0,
): Transaction {
  const subtotal = quantity * unitPrice;
  return {
    id,
    customerId,
    date,
    items: [{ productId, productName: productId, quantity, unitPrice, unitCost }],
    subtotal,
    discount,
    totalAmount: subtotal - discount,
    paymentMethod: "upi",
    status: "completed",
  };
}

const transactions: Transaction[] = [
  transaction("txn-1", "cus-1", "2026-10-30T12:00:00.000Z", "prd-1", 2, 100, 60),
  transaction("txn-2", "cus-1", "2026-10-31T12:00:00.000Z", "prd-2", 2, 50, 35, 5),
  transaction("txn-3", "cus-2", "2026-10-31T12:00:00.000Z", "prd-1", 1, 100, 60),
];
const expenses: Expense[] = [
  { id: "exp-1", description: "Electricity", category: "Utilities", amount: 20, date: "2026-10-31", vendor: "BESCOM", notes: "" },
  { id: "exp-2", description: "Delivery", category: "Transport", amount: 10, date: "2026-10-30", vendor: "Local courier", notes: "" },
];
const fixture: DemoData = {
  asOf: anchor.toISOString(),
  customers,
  products,
  transactions,
  expenses,
  campaigns: [],
};

test("demo data meets requested volume and relationship requirements", () => {
  const data = createDemoData(anchor);
  assert.ok(data.customers.length >= 30);
  assert.ok(data.products.length >= 20);
  assert.ok(data.transactions.length >= 100);
  assert.ok(data.expenses.length >= 20);
  assert.ok(data.campaigns.length >= 5);
  assert.ok(data.campaigns.every((campaign) => new Date(campaign.startDate) <= new Date(campaign.endDate)));
  assert.ok(data.campaigns.some((campaign) =>
    campaign.status === "active" && new Date(campaign.endDate) > anchor,
  ));
  assertDemoDataIntegrity(data);
  assert.ok(data.transactions.every((entry) => data.customers.some((customer) => customer.id === entry.customerId)));
  assert.ok(data.transactions.every((entry) =>
    entry.items.every((item) => data.products.some((product) => product.id === item.productId)),
  ));
  assert.ok(data.transactions.every((entry) => {
    const age = (anchor.getTime() - new Date(entry.date).getTime()) / (24 * 60 * 60 * 1000);
    return age >= 0 && age < 90;
  }));
  assert.ok(data.customers.every((customer) => /^\+91 90000 \d{5}$/.test(customer.phone)));
});

test("revenue, transaction count, expenses, profit, and average order value use source records", () => {
  assert.equal(totalRevenue(transactions), 395);
  assert.equal(totalTransactions(transactions), 3);
  assert.equal(totalExpenses(expenses), 30);
  assert.equal(estimatedProfit(fixture), 115);
  assert.equal(averageOrderValue(transactions), 395 / 3);
  assert.equal(averageOrderValue([]), 0);

  const emptyData: DemoData = {
    asOf: anchor.toISOString(),
    customers: [],
    products: [],
    transactions: [],
    expenses: [],
    campaigns: [],
  };
  assert.equal(estimatedProfit(emptyData), 0);
  assert.equal(totalRevenue([]), 0);
  assert.equal(totalTransactions([]), 0);
  assert.equal(totalExpenses([]), 0);
});

test("best-selling products aggregate item quantities and revenue", () => {
  const best = bestSellingProducts(products, transactions, 3);
  assert.equal(best[0].productId, "prd-1");
  assert.equal(best[0].quantitySold, 3);
  assert.equal(best[0].revenue, 300);
  assert.equal(best.length, 2);
  assert.deepEqual(bestSellingProducts(products, transactions, 0), []);
  assert.throws(
    () => bestSellingProducts(products, [{ ...transactions[0], items: [{ ...transactions[0].items[0], productId: "missing" }] }]),
    /unknown product/,
  );
});

test("customer spending and segments reflect purchase history", () => {
  const spending = customerSpending(customers, transactions);
  assert.equal(spending[0].customerId, "cus-1");
  assert.equal(spending[0].transactionCount, 2);
  assert.equal(spending[0].totalSpent, 295);
  assert.equal(spending[0].averageOrderValue, 147.5);
  assert.equal(spending[0].firstPurchaseAt, "2026-10-30T12:00:00.000Z");
  assert.equal(spending[0].lastPurchaseAt, "2026-10-31T12:00:00.000Z");
  assert.equal(transactionCountForCustomer("cus-1", transactions), 2);
  assert.throws(
    () => customerSpending(customers, [{ ...transactions[0], customerId: "missing" }]),
    /unknown customer/,
  );

  const bySegment: CustomerSpending = {
    customerId: "test",
    customerName: "Test customer",
    transactionCount: 1,
    totalSpent: 50_000,
    averageOrderValue: 50_000,
    firstPurchaseAt: "2026-10-30T12:00:00.000Z",
    lastPurchaseAt: "2026-10-30T12:00:00.000Z",
  };
  assert.equal(getCustomerSegment(bySegment, anchor), "high-value");
  assert.equal(
    getCustomerSegment({ ...bySegment, totalSpent: 100, averageOrderValue: 100 }, anchor),
    "new",
  );
  assert.equal(
    getCustomerSegment({ ...bySegment, transactionCount: 3, totalSpent: 300, averageOrderValue: 100 }, anchor),
    "regular",
  );
  assert.equal(
    getCustomerSegment({
      ...bySegment,
      transactionCount: 0,
      totalSpent: 0,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
    }, anchor),
    "inactive",
  );
  const segments = new Set(
    segmentCustomers(createDemoData(anchor).customers, createDemoData(anchor).transactions, anchor)
      .map((customer) => customer.segment),
  );
  assert.deepEqual([...segments].sort(), ["high-value", "inactive", "new", "regular"]);
});

test("inventory status and summary classify normal, low, and zero stock", () => {
  assert.equal(inventoryStatus(products[0]), "normal");
  assert.equal(inventoryStatus(products[1]), "low");
  assert.equal(inventoryStatus(products[2]), "out");
  assert.deepEqual(inventorySummary(products), {
    totalProducts: 3,
    normal: 1,
    low: 1,
    out: 1,
  });
  assert.deepEqual(inventorySummary([]), {
    totalProducts: 0,
    normal: 0,
    low: 0,
    out: 0,
  });
});

test("inventory recommendations use actual recent sales and minimum-stock shortages", () => {
  const result = inventoryRecommendations(products, transactions, anchor);
  assert.equal(result.find((item) => item.productId === "prd-2")?.shortage, 3);
  assert.equal(result.find((item) => item.productId === "prd-2")?.quantitySoldInWindow, 2);
  assert.equal(result.find((item) => item.productId === "prd-2")?.suggestedReorderQuantity, 3);
  assert.equal(result.find((item) => item.productId === "prd-3")?.suggestedReorderQuantity, 5);
  assert.equal(result.find((item) => item.productId === "prd-1")?.suggestedReorderQuantity, 0);
  assert.equal(inventoryMetrics(fixture).totalUnits, 13);
  assert.deepEqual(
    deterministicIntentFallback("Show me products with less than 5 units"),
    { intent: "stock_below", params: { threshold: 5 } },
  );
  assert.deepEqual(
    deterministicIntentFallback("How much stock do I have?"),
    { intent: "stock_summary", params: {} },
  );
});

test("daily revenue includes every requested day and excludes out-of-range sales", () => {
  const daily = dailyRevenue(transactions, 2, anchor);
  assert.deepEqual(daily, [
    { date: "2026-10-30", revenue: 200, transactions: 1 },
    { date: "2026-10-31", revenue: 195, transactions: 2 },
  ]);
  assert.deepEqual(dailyRevenue(transactions, 0, anchor), []);
});

test("dashboard trend groups revenue, transactions, profit, and customer growth by interval", () => {
  const daily = dashboardTrend(fixture, "daily", 2, anchor);
  assert.deepEqual(daily, [
    {
      date: "2026-10-30",
      label: "30 Oct",
      revenue: 200,
      transactions: 1,
      estimatedProfit: 70,
      newCustomers: 0,
    },
    {
      date: "2026-10-31",
      label: "31 Oct",
      revenue: 195,
      transactions: 2,
      estimatedProfit: 45,
      newCustomers: 0,
    },
  ]);
  const weekly = dashboardTrend(fixture, "weekly", 2, anchor);
  assert.equal(weekly[1].date, "2026-10-26");
  assert.equal(weekly[1].revenue, 395);
  assert.equal(weekly[1].transactions, 3);
  assert.equal(weekly[1].estimatedProfit, 115);
  const monthly = dashboardTrend(fixture, "monthly", 1, anchor);
  assert.equal(monthly[0].date, "2026-10-01");
  assert.equal(monthly[0].revenue, 395);
});

test("integrity checks reject dangling customer and product references", () => {
  assert.throws(
    () => assertDemoDataIntegrity({ ...fixture, transactions: [{ ...transactions[0], customerId: "missing" }] }),
    /unknown customer/,
  );
  assert.throws(
    () => assertDemoDataIntegrity({
      ...fixture,
      transactions: [{ ...transactions[0], items: [{ ...transactions[0].items[0], productId: "missing" }] }],
    }),
    /unknown product/,
  );
  assert.throws(
    () => assertDemoDataIntegrity({
      ...fixture,
      transactions: [],
      campaigns: [{
        id: "cmp-invalid",
        name: "Invalid dates",
        channel: "WhatsApp",
        status: "draft",
        startDate: "2026-10-31T12:00:00.000Z",
        endDate: "2026-10-30T12:00:00.000Z",
        budget: 0,
        audienceSize: 0,
        sentCount: 0,
        conversions: 0,
        revenue: 0,
      }],
    }),
    /ends before it starts/,
  );
});

test("record helpers add, update, and remove by id", () => {
  const added = upsertById(customers, { ...customers[0], id: "cus-3" });
  assert.equal(added.length, 3);
  const updated = upsertById(added, { ...customers[0], name: "Asha Updated" });
  assert.equal(updated.length, 3);
  assert.equal(updated[0].name, "Asha Updated");
  assert.equal(removeById(updated, "cus-3").length, 2);
});

test("valid demo records persist and reload from local storage", () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const records = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });

  try {
    const inventoryFixture: DemoData = {
      ...fixture,
      inventoryMovements: [{
        id: "move-1",
        productId: "prd-1",
        productName: "Rice",
        operation: "stock-in",
        quantityChanged: 4,
        previousStock: 11,
        newStock: 15,
        reason: "Invoice #123",
        createdAt: anchor.toISOString(),
      }],
      supplierOrders: [{
        id: "order-1",
        supplierName: "Local wholesaler",
        status: "draft",
        createdAt: anchor.toISOString(),
        items: [{
          productId: "prd-1",
          productName: "Rice",
          currentStock: 11,
          reorderQuantity: 5,
          purchaseCost: 60,
          estimatedAmount: 300,
        }],
      }],
    };
    saveDemoData(inventoryFixture);
    assert.deepEqual(loadDemoData(), inventoryFixture);
    assert.throws(
      () => saveDemoData({ ...fixture, transactions: [{ ...transactions[0], customerId: "missing" }] }),
      /unknown customer/,
    );
  } finally {
    if (savedWindow) {
      Object.defineProperty(globalThis, "window", savedWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("demo data API returns the current server dataset without caching", async () => {
  const response = demoDataGet();
  const payload = await response.json() as DemoData;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(payload.customers.length >= 30);
  assert.ok(payload.products.length >= 20);
  assert.ok(payload.transactions.length >= 100);
  assertDemoDataIntegrity(payload);
});

test("classifies today's sales in Hindi and phrases the real result", async () => {
  const prompts: string[] = [];
  const result = await processAssistantMessage("Aaj meri total sales kitni hui?", fixture, {
    complete: async (messages) => {
      prompts.push(messages[0].content);
      return prompts.length === 1
        ? '{"intent":"get_sales","params":{"period":"today"}}'
        : "Aaj ki sales â‚¹195 rahi.";
    },
  });

  assert.equal(result.intent, "get_sales");
  assert.equal(result.reply, "Aaj ki sales â‚¹195 rahi.");
  assert.equal(result.data?.revenue, 195);
  assert.match(prompts[1], /SAME language/);
  assert.match(prompts[1], /Never invent/);
});

test("classifies reorder requests and uses deterministic fallback for malformed model JSON", async () => {
  const result = await processAssistantMessage("Which products should I reorder tomorrow?", fixture, {
    complete: async (messages) =>
      messages[0].content.includes("intent classifier")
        ? '{"intent":"reorder_suggestions","params":{}}'
        : "Tea is low on stock and Water is out of stock.",
  });

  assert.equal(result.intent, "reorder_suggestions");
  assert.deepEqual(
    (result.data?.products as Product[]).map((product) => product.id),
    ["prd-2", "prd-3"],
  );
  assert.deepEqual(
    parseClassifiedIntent("```json\n{ definitely not valid json }\n```", "Aaj meri total sales kitni hui?"),
    { intent: "get_sales", params: { period: "today" } },
  );
  assert.deepEqual(parseClassifiedIntent("{ definitely not valid json }", "nonsense"), {
    intent: "unknown",
    params: {},
  });
  assert.deepEqual(deterministicIntentFallback("Which products should I reorder tomorrow?"), {
    intent: "reorder_suggestions",
    params: {},
  });
});

test("inventory assistant answers restock questions from real data when Sarvam is unavailable", async () => {
  const result = await processAssistantMessage(
    "Which products should I reorder?",
    fixture,
    {
      complete: async () => {
        throw new SarvamApiError("Unavailable", "api_failure");
      },
    },
  );
  assert.equal(result.intent, "reorder_suggestions");
  assert.deepEqual(
    (result.data?.products as Product[]).map((product) => product.id),
    ["prd-2", "prd-3"],
  );
  assert.match(result.reply, /Tea: 2 in stock, minimum 5, suggested reorder 3/);
});

test("personalized campaigns use each eligible customer's verified purchase data", () => {
  const asOf = anchor.toISOString();
  const oldTransactions = transactions.map((entry, index) => ({
    ...entry,
    date: new Date(anchor.getTime() - (index < 2 ? 45 : 31) * 24 * 60 * 60 * 1000).toISOString(),
  }));
  const data: DemoData = {
    ...fixture,
    asOf,
    customers: [
      ...customers,
      {
        id: "cus-3",
        name: "Meera Example",
        phone: "+91 90000 10003",
        email: "meera@example.com",
        address: "Bengaluru",
        joinedAt: "2026-01-01",
        notes: "",
      },
    ],
    transactions: oldTransactions,
  };
  const draft = createPersonalizedCampaign(data);
  assert.equal(draft.eligibleCustomerIds.length, 3);
  assert.equal(draft.messages.length, 3);
  assert.equal(new Set(draft.messages.map((entry) => entry.message)).size, 3);

  const knownPurchase = draft.messages.find((entry) => entry.customerId === "cus-1");
  assert.ok(knownPurchase);
  assert.equal(knownPurchase.lastPurchaseAt, oldTransactions[1].date);
  assert.equal(knownPurchase.productCategory, "Groceries");
  assert.equal(knownPurchase.customerSegment, "inactive");
  assert.match(knownPurchase.message, /Asha Rao/);
  assert.match(knownPurchase.message, /groceries/);
  assert.match(knownPurchase.message, /15% OFF/);
  assert.ok(
    knownPurchase.message.includes(
      new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(oldTransactions[1].date)),
    ),
  );
  assert.match(knownPurchase.message, /inactive segment/);

  const noHistory = draft.messages.find((entry) => entry.customerId === "cus-3");
  assert.ok(noHistory);
  assert.equal(noHistory.lastPurchaseAt, null);
  assert.equal(noHistory.previousPurchase, null);
  assert.equal(noHistory.productCategory, null);
  assert.doesNotMatch(noHistory.message, /last shopped|last saw you/i);
  assert.match(noHistory.message, /next purchase/);

  const alternate = createPersonalizedMessage(data, "cus-1", 15, true);
  assert.ok(alternate);
  assert.notEqual(alternate.message, knownPurchase.message);
});

test("Sarvam client uses the documented endpoint, model, and authentication headers", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  const result = await callSarvam(
    [{ role: "user", content: "Hello" }],
    {
      apiKey: "sk_test_key",
      fetcher: async (input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ choices: [{ message: { content: "Namaste" } }] });
      },
    },
  );

  assert.equal(result, "Namaste");
  assert.equal(requestUrl, SARVAM_CHAT_COMPLETIONS_URL);
  assert.equal(requestHeaders?.get("authorization"), "Bearer sk_test_key");
  assert.equal(requestHeaders?.get("api-subscription-key"), "sk_test_key");
  assert.equal(requestBody?.model, SARVAM_CHAT_MODEL);
  assert.equal(requestBody?.max_tokens, 1024);
  await assert.rejects(
    () => callSarvam([{ role: "user", content: "Hello" }], { apiKey: "" }),
    (error: unknown) => error instanceof SarvamApiError && error.kind === "missing_key",
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    () => callSarvam(
      [{ role: "user", content: "Hello" }],
      {
        apiKey: "sk_test_key",
        signal: aborted.signal,
        fetcher: async () => {
          throw new DOMException("Aborted", "AbortError");
        },
      },
    ),
    (error: unknown) => error instanceof SarvamApiError && error.kind === "timeout",
  );
});

test("assistant route returns friendly HTTP 200 errors when Sarvam is not configured or unavailable", async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const previousFetch = globalThis.fetch;
  const request = () =>
    new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How much did I sell today?", data: fixture }),
    });

  try {
    delete process.env.SARVAM_API_KEY;
    const missingKeyResponse = await assistantPost(request());
    const missingKeyBody = await missingKeyResponse.json();
    assert.equal(missingKeyResponse.status, 200);
    assert.equal(missingKeyBody.intent, "error");
    assert.match(missingKeyBody.reply, /not configured/);

    process.env.SARVAM_API_KEY = "sk_test_key";
    globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
    const failedRequestResponse = await assistantPost(request());
    const failedRequestBody = await failedRequestResponse.json();
    assert.equal(failedRequestResponse.status, 200);
    assert.equal(failedRequestBody.intent, "error");
    assert.match(failedRequestBody.reply, /temporarily unavailable/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});

test("Gemini client uses endpoint with model from env, x-goog-api-key header, and handles 429 retry", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  let callCount = 0;

  process.env.GEMINI_MODEL = "gemini-2.5-flash";

  // Test successful call with classification JSON responseMimeType
  const result = await callGemini(
    [
      { role: "system", content: "You are an intent classifier." },
      { role: "user", content: "sales today" },
    ],
    {
      apiKey: "test_gemini_key",
      responseMimeType: "application/json",
      fetcher: async (input, init) => {
        callCount += 1;
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "{\"intent\":\"get_sales\",\"params\":{\"period\":\"today\"}}" }],
              },
            },
          ],
        });
      },
    },
  );

  assert.equal(result, "{\"intent\":\"get_sales\",\"params\":{\"period\":\"today\"}}");
  assert.equal(callCount, 1);
  assert.equal(
    requestUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  assert.equal(requestHeaders?.get("x-goog-api-key"), "test_gemini_key");
  const genConfig = requestBody?.generationConfig as Record<string, unknown>;
  assert.equal(genConfig?.responseMimeType, "application/json");
  assert.equal(genConfig?.temperature, 0);

  // Missing key test
  await assert.rejects(
    () => callGemini([{ role: "user", content: "hi" }], { apiKey: "" }),
    (error: unknown) => error instanceof GeminiApiError && error.kind === "missing_key",
  );

  // Missing model test
  const savedModel = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODEL;
  await assert.rejects(
    () => callGemini([{ role: "user", content: "hi" }], { apiKey: "key", model: "" }),
    (error: unknown) => error instanceof GeminiApiError && error.kind === "missing_key",
  );
  process.env.GEMINI_MODEL = savedModel;

  // 429 retry test
  let attempt = 0;
  const retryResult = await callGemini(
    [{ role: "user", content: "hello" }],
    {
      apiKey: "test_gemini_key",
      fetcher: async () => {
        attempt += 1;
        if (attempt === 1) {
          return new Response("Too Many Requests", { status: 429 });
        }
        return Response.json({
          candidates: [{ content: { parts: [{ text: "retry successful" }] } }],
        });
      },
    },
  );
  assert.equal(attempt, 2);
  assert.equal(retryResult, "retry successful");

  // Timeout test
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    () =>
      callGemini([{ role: "user", content: "hello" }], {
        apiKey: "test_gemini_key",
        signal: aborted.signal,
        fetcher: async () => {
          throw new DOMException("Aborted", "AbortError");
        },
      }),
    (error: unknown) => error instanceof GeminiApiError && error.kind === "timeout",
  );
});

test("provider switch logic respects AI_PROVIDER env var and defaults correctly", () => {
  const origProvider = process.env.AI_PROVIDER;
  const origGeminiKey = process.env.GEMINI_API_KEY;
  const origSarvamKey = process.env.SARVAM_API_KEY;

  try {
    process.env.AI_PROVIDER = "sarvam";
    assert.equal(getAiProvider(), "sarvam");

    process.env.AI_PROVIDER = "gemini";
    assert.equal(getAiProvider(), "gemini");

    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    assert.equal(getAiProvider(), "gemini"); // default

    process.env.SARVAM_API_KEY = "key";
    assert.equal(getAiProvider(), "sarvam"); // fallback if only sarvam configured

    process.env.GEMINI_API_KEY = "gkey";
    assert.equal(getAiProvider(), "gemini"); // prefer gemini if both present
  } finally {
    if (origProvider) process.env.AI_PROVIDER = origProvider;
    else delete process.env.AI_PROVIDER;
    if (origGeminiKey) process.env.GEMINI_API_KEY = origGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (origSarvamKey) process.env.SARVAM_API_KEY = origSarvamKey;
    else delete process.env.SARVAM_API_KEY;
  }
});




test("assistant route returns friendly HTTP 200 errors when Gemini is not configured or unavailable", async () => {
  const origProvider = process.env.AI_PROVIDER;
  const origKey = process.env.GEMINI_API_KEY;
  const origSarvamKey = process.env.SARVAM_API_KEY;
  const previousFetch = globalThis.fetch;

  process.env.AI_PROVIDER = "gemini";
  delete process.env.GEMINI_API_KEY;
  delete process.env.SARVAM_API_KEY;

  const request = () =>
    new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How much did I sell today?", data: fixture }),
    });

  try {
    const missingKeyResponse = await assistantPost(request());
    const missingKeyBody = await missingKeyResponse.json();
    assert.equal(missingKeyResponse.status, 200);
    assert.equal(missingKeyBody.intent, "error");
    assert.match(missingKeyBody.reply, /not configured/);

    process.env.GEMINI_API_KEY = "test_gemini_key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    globalThis.fetch = async () => Response.json({ error: "service unavailable" }, { status: 503 });
    const failedRequestResponse = await assistantPost(request());
    const failedRequestBody = await failedRequestResponse.json();
    assert.equal(failedRequestResponse.status, 200);
    assert.equal(failedRequestBody.intent, "error");
    assert.match(failedRequestBody.reply, /temporarily unavailable/);
  } finally {
    globalThis.fetch = previousFetch;
    if (origProvider) process.env.AI_PROVIDER = origProvider;
    else delete process.env.AI_PROVIDER;
    if (origKey) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
    if (origSarvamKey) process.env.SARVAM_API_KEY = origSarvamKey;
    else delete process.env.SARVAM_API_KEY;
  }
});

test("four core assistant queries are classified and processed with Gemini pipeline", async () => {
  const dataset = createDemoData(anchor);

  const testQueries = [
    {
      query: "aaj ki bikri kitni hui",
      expectedIntent: "get_sales",
      mockClassification: "{\"intent\":\"get_sales\",\"params\":{\"period\":\"today\"}}",
      mockReply: "Aaj aapki total bikri â‚¹195 hui hai.",
    },
    {
      query: "which products are low on stock",
      expectedIntent: "low_stock",
      mockClassification: "{\"intent\":\"low_stock\",\"params\":{}}",
      mockReply: "You currently have 5 products low on stock and 2 out of stock.",
    },
    {
      query: "kitne customers inactive hai",
      expectedIntent: "inactive_customers",
      mockClassification: "{\"intent\":\"inactive_customers\",\"params\":{\"days\":45}}",
      mockReply: "Pichle 45 dino mein 12 customers inactive rahe hain.",
    },
    {
      query: "weekly report",
      expectedIntent: "weekly_report",
      mockClassification: "{\"intent\":\"weekly_report\",\"params\":{}}",
      mockReply: "Is hafte ka total sales aur profit report taiyar hai.",
    },
  ];

  for (const item of testQueries) {
    // 1. Verify deterministic regex fallback works even with invalid/empty AI
    const fallback = deterministicIntentFallback(item.query);
    assert.equal(fallback.intent, item.expectedIntent);

    // 2. Verify full Gemini assistant pipeline execution
    let callStep = 0;
    const mockCompletion = async () => {
      callStep += 1;
      if (callStep === 1) return item.mockClassification;
      return item.mockReply;
    };

    const result = await processAssistantMessage(item.query, dataset, {
      complete: mockCompletion,
      provider: "gemini",
    });

    assert.equal(result.intent, item.expectedIntent);
    assert.equal(result.reply, item.mockReply);
    assert.ok(result.data !== null);
  }
});





test("voice setup reports missing credentials without exposing the API key", async () => {
  const names = ["SARVAM_API_KEY", "SARVAM_ORG_ID", "SARVAM_WORKSPACE_ID", "SARVAM_APP_ID"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const response = voiceConfigGet(new Request("http://localhost/api/voice/config"));
    const payload = await response.json();
    assert.equal(payload.configured, false);
    assert.deepEqual(payload.missing, names);
    assert.equal("apiKey" in payload, false);
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Sarvam proxy forwards only the configured runtime path with the server API key", async () => {
  const envNames = ["SARVAM_API_KEY", "SARVAM_ORG_ID", "SARVAM_WORKSPACE_ID", "SARVAM_APP_ID"] as const;
  const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamHeaders: Headers | undefined;

  try {
    process.env.SARVAM_API_KEY = "server-test-key";
    process.env.SARVAM_ORG_ID = "org-123";
    process.env.SARVAM_WORKSPACE_ID = "workspace-123";
    process.env.SARVAM_APP_ID = "app-123";
    globalThis.fetch = async (input, init) => {
      upstreamUrl = String(input);
      upstreamHeaders = new Headers(init?.headers);
      return Response.json({ url: "wss://example.test", reference_id: "ref-1" });
    };

    const response = await sarvamProxyGet(
      new Request(
        "http://localhost/api/sarvam/orgs/org-123/workspaces/workspace-123/apps/app-123/url?interaction_type=call&version=2",
      ),
      {
        params: Promise.resolve({
          path: ["orgs", "org-123", "workspaces", "workspace-123", "apps", "app-123", "url"],
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(
      upstreamUrl,
      "https://apps.sarvam.ai/api/app-runtime/orgs/org-123/workspaces/workspace-123/apps/app-123/url?interaction_type=call&version=2",
    );
    assert.equal(upstreamHeaders?.get("x-api-key"), "server-test-key");
    assert.equal(response.headers.get("cache-control"), "no-store");

    const rejectedPath = await sarvamProxyGet(
      new Request("http://localhost/api/sarvam/orgs/other/workspaces/workspace-123/apps/app-123/url"),
      {
        params: Promise.resolve({
          path: ["orgs", "other", "workspaces", "workspace-123", "apps", "app-123", "url"],
        }),
      },
    );
    assert.equal(rejectedPath.status, 404);
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of envNames) {
      const value = previousEnv.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("business tools use server demo calculations and require the webhook bearer token", async () => {
  const previousToken = process.env.SARVAM_TOOL_API_TOKEN;
  process.env.SARVAM_TOOL_API_TOKEN = "test-tool-token";
  const data = getServerDemoData();
  const context = (tool: string) => ({ params: Promise.resolve({ tool }) });
  const request = (path: string, method = "GET", token?: string) =>
    new Request(`http://localhost/api/voice/tools/${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

  try {
    const unauthorized = await voiceToolsGet(request("sales-today"), context("sales-today"));
    assert.equal(unauthorized.status, 401);

    const todayResponse = await voiceToolsGet(
      request("sales-today", "GET", "test-tool-token"),
      context("sales-today"),
    );
    assert.deepEqual(await todayResponse.json(), getTodaySales(data));

    const profitResponse = await voiceToolsGet(
      request("revenue-profit", "GET", "test-tool-token"),
      context("revenue-profit"),
    );
    assert.deepEqual(await profitResponse.json(), getRevenueAndProfit(data));

    const inactiveResponse = await voiceToolsGet(
      request("inactive-customers", "GET", "test-tool-token"),
      context("inactive-customers"),
    );
    const inactive = await inactiveResponse.json();
    assert.equal(inactive.count, getInactiveCustomers(data).count);
    assert.ok(inactive.customers.every((customer: { message: string; discountPercent: number }) =>
      customer.message.includes("15% OFF") && customer.discountPercent === 15,
    ));

    const customerName = encodeURIComponent(data.customers[0].name);
    const customerResponse = await voiceToolsGet(
      request(`customer-history?name=${customerName}`, "GET", "test-tool-token"),
      context("customer-history"),
    );
    const history = await customerResponse.json();
    assert.equal(customerResponse.status, 200);
    assert.equal(history.name, data.customers[0].name);
    assert.ok(Array.isArray(history.transactions));

    const draftResponse = await voiceToolsPost(
      request("campaign-draft", "POST", "test-tool-token"),
      context("campaign-draft"),
    );
    const draft = await draftResponse.json();
    assert.equal(draft.requiresMerchantApproval, true);
    assert.equal(draft.simulatedOnly, true);
    assert.equal(draft.eligibleCustomerCount, getInactiveCustomers(data).count);
    assert.equal(draft.messages.length, draft.eligibleCustomerCount);
    assert.ok(draft.messages.every((message: { customerName: string; message: string }) =>
      message.message.includes(message.customerName),
    ));

    const firstDraftMessage = draft.messages[0];
    const editResponse = await voiceCampaignPatch(
      new Request(`http://localhost/api/voice/campaigns/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: firstDraftMessage.customerId,
          message: "Merchant-edited personalized message.",
        }),
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    assert.equal(editResponse.status, 200);

    const regenerateResponse = await regenerateCampaignMessagePost(
      new Request(
        `http://localhost/api/voice/campaigns/${draft.id}/messages/${firstDraftMessage.customerId}/regenerate`,
        { method: "POST" },
      ),
      {
        params: Promise.resolve({
          id: draft.id,
          customerId: firstDraftMessage.customerId,
        }),
      },
    );
    const regenerated = await regenerateResponse.json();
    assert.equal(regenerateResponse.status, 200);
    assert.notEqual(regenerated.message, "Merchant-edited personalized message.");

    const pendingResponse = await voiceCampaignsGet(
      new Request("http://localhost/api/voice/campaigns"),
    );
    const pending = await pendingResponse.json();
    assert.equal(pending.pending.id, draft.id);
    assert.equal(pending.pending.message, draft.message);

    const approvalResponse = await approveVoiceCampaignPost(
      new Request(`http://localhost/api/voice/campaigns/${draft.id}/approve`, { method: "POST" }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    const approval = await approvalResponse.json();
    assert.equal(approval.simulated, true);
    assert.equal(approval.successfulCount, draft.eligibleCustomerCount);
    assert.equal(approval.failedCount, 0);
    assert.match(approval.message, /No messages were sent/);
    const duplicateResponse = await approveVoiceCampaignPost(
      new Request(`http://localhost/api/voice/campaigns/${draft.id}/approve`, { method: "POST" }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    assert.equal(duplicateResponse.status, 409);

    const historyResponse = await voiceToolsGet(
      request("campaign-history", "GET", "test-tool-token"),
      context("campaign-history"),
    );
    const historyBody = await historyResponse.json();
    assert.ok(historyBody.campaigns.some((campaign: {
      id: string;
      status: string;
      successfulCount: number;
      failedCount: number;
      messages: Array<{ status: string; customerId: string }>;
    }) =>
      campaign.id === draft.campaign.id &&
      (campaign.status === "demo_executed" || campaign.status === "simulated") &&
      campaign.successfulCount === draft.eligibleCustomerCount &&
      campaign.failedCount === 0 &&
      campaign.messages.length === draft.eligibleCustomerCount &&
      campaign.messages.every((message) =>
        (message.status === "demo_executed" || message.status === "simulated") && Boolean(message.customerId)
      ),
    ));

    const createResponse = await voiceCampaignsPost(
      new Request("http://localhost/api/voice/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountPercent: 10 }),
      }),
    );
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(created.pending.discountPercent, 10);
    assert.equal(created.pending.eligibleCustomerCount, created.pending.messages.length);
    assert.ok(created.pending.messages.every((message: { discountPercent: number }) =>
      message.discountPercent === 10,
    ));

    const executeCreatedResponse = await approveVoiceCampaignPost(
      new Request(`http://localhost/api/voice/campaigns/${created.pending.id}/approve`, { method: "POST" }),
      { params: Promise.resolve({ id: created.pending.id }) },
    );
    assert.equal(executeCreatedResponse.status, 200);
  } finally {
    if (previousToken === undefined) delete process.env.SARVAM_TOOL_API_TOKEN;
    else process.env.SARVAM_TOOL_API_TOKEN = previousToken;
  }
});

test("inventory state sync updates server-side tools and rejects cross-origin writes", async () => {
  const serverData = getServerDemoData();
  const originalProducts = serverData.products.slice();
  const originalMovements = serverData.inventoryMovements ?? [];
  const originalOrders = serverData.supplierOrders ?? [];
  const product: Product = {
    id: "inventory-sync-test",
    name: "Inventory sync test",
    sku: "INVENTORY-SYNC-TEST",
    category: "Groceries",
    unit: "unit",
    price: 25,
    costPrice: 12,
    stock: 15,
    reorderLevel: 20,
    supplierName: "Test supplier",
    lastUpdatedAt: anchor.toISOString(),
  };
  const inventoryMovements = [{
    id: "inventory-sync-movement",
    productId: product.id,
    productName: product.name,
    operation: "stock-in" as const,
    quantityChanged: 20,
    previousStock: 0,
    newStock: 20,
    reason: "Test invoice",
    createdAt: anchor.toISOString(),
  }];
  const supplierOrders = [{
    id: "inventory-sync-order",
    supplierName: "Test supplier",
    status: "draft" as const,
    createdAt: anchor.toISOString(),
    items: [{
      productId: product.id,
      productName: product.name,
      currentStock: 0,
      reorderQuantity: 20,
      purchaseCost: 12,
      estimatedAmount: 240,
    }],
  }];

  try {
    const body = JSON.stringify({
      products: [...originalProducts, product],
      inventoryMovements,
      supplierOrders,
    });
    const rejected = await inventoryStatePut(new Request("http://localhost/api/inventory/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://other.example" },
      body,
    }));
    assert.equal(rejected.status, 403);

    const saved = await inventoryStatePut(new Request("http://localhost/api/inventory/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body,
    }));
    assert.equal(saved.status, 200);
    const synced = getServerDemoData();
    assert.equal(synced.products.find((entry) => entry.id === product.id)?.stock, 15);
    assert.equal(synced.inventoryMovements?.[0].reason, "Test invoice");
    assert.equal(synced.supplierOrders?.[0].items[0].estimatedAmount, 240);
  } finally {
    updateServerInventory(originalProducts, originalMovements, originalOrders);
  }
});

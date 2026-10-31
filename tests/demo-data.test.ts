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
import { processAssistantMessage } from "../lib/assistant/service.ts";
import {
  callSarvam,
  SARVAM_CHAT_COMPLETIONS_URL,
  SARVAM_CHAT_MODEL,
  SarvamApiError,
} from "../lib/assistant/sarvam.ts";
import { POST as assistantPost } from "../app/api/assistant/route.ts";
import { GET as demoDataGet } from "../app/api/demo-data/route.ts";
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
    saveDemoData(fixture);
    assert.deepEqual(loadDemoData(), fixture);
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
        : "Aaj ki sales ₹195 rahi.";
    },
  });

  assert.equal(result.intent, "get_sales");
  assert.equal(result.reply, "Aaj ki sales ₹195 rahi.");
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

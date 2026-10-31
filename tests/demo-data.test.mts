import assert from "node:assert/strict";
import test from "node:test";
import {
  averageOrderValue,
  bestSellingProducts,
  customerSpending,
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

  const bySegment: CustomerSpending = {
    customerId: "test",
    customerName: "Test customer",
    transactionCount: 1,
    totalSpent: 15_000,
    averageOrderValue: 15_000,
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

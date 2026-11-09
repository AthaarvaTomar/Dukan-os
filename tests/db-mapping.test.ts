import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assembleDemoData,
  mapCampaign,
  mapCustomer,
  mapExpense,
  mapProduct,
  mapSupplierOrder,
  mapTransactions,
  type BusinessTables,
} from "../lib/db/mapping.ts";

const businessId = "11111111-1111-1111-1111-111111111111";

test("mapping: customer rows map to the app entity", () => {
  const customer = mapCustomer({
    id: "c1",
    business_id: businessId,
    name: "Asha",
    phone: "9876543210",
    email: "asha@example.com",
    address: "MG Road",
    notes: "Prefers UPI",
    joined_at: "2026-01-05T10:00:00.000Z",
  });
  assert.deepEqual(customer, {
    id: "c1",
    name: "Asha",
    phone: "9876543210",
    email: "asha@example.com",
    address: "MG Road",
    joinedAt: "2026-01-05T10:00:00.000Z",
    notes: "Prefers UPI",
  });
});

test("mapping: product rows map snake_case fields and defaults", () => {
  const product = mapProduct({
    id: "p1",
    business_id: businessId,
    name: "Basmati Rice 5kg",
    sku: "GRO-001",
    unit: "5 kg bag",
    category: "Something unknown",
    price: 499.5,
    cost_price: 410.25,
    stock: 12,
    reorder_level: 5,
    supplier_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(product.category, "Groceries"); // unknown values fall back safely
  assert.equal(product.costPrice, 410.25);
  assert.equal(product.reorderLevel, 5);
  assert.equal(product.supplierName, undefined);
  assert.equal(product.lastUpdatedAt, "2026-02-01T00:00:00.000Z");
});

test("mapping: transactions combine sales and items and drop cancelled sales", () => {
  const sales = [
    {
      id: "s1",
      business_id: businessId,
      customer_id: null,
      date: "2026-02-10T09:00:00.000Z",
      subtotal: 100,
      discount: 10,
      total_amount: 90,
      payment_method: "upi",
      status: "completed",
    },
    {
      id: "s2",
      business_id: businessId,
      customer_id: "c1",
      date: "2026-02-11T09:00:00.000Z",
      subtotal: 50,
      discount: 0,
      total_amount: 50,
      payment_method: "cash",
      status: "cancelled",
    },
    {
      id: "s3",
      business_id: businessId,
      customer_id: "c1",
      date: "2026-02-12T09:00:00.000Z",
      subtotal: 30,
      discount: 0,
      total_amount: 30,
      payment_method: "card",
      status: "processing",
    },
  ];
  const saleItems = [
    {
      id: "i1",
      sale_id: "s1",
      business_id: businessId,
      product_id: "p1",
      product_name: "Tea",
      quantity: 2,
      unit_price: 50,
      unit_cost: 35,
    },
    {
      id: "i2",
      sale_id: "s3",
      business_id: businessId,
      product_id: null,
      product_name: "Snacks",
      quantity: 1,
      unit_price: 30,
      unit_cost: 20,
    },
  ];

  const transactions = mapTransactions(sales, saleItems);
  assert.equal(transactions.length, 2); // cancelled sale excluded
  assert.equal(transactions[0]!.customerId, ""); // null customer maps to ""
  assert.equal(transactions[0]!.totalAmount, 90);
  assert.equal(transactions[0]!.items.length, 1);
  assert.equal(transactions[1]!.status, "processing");
  assert.equal(transactions[1]!.items[0]!.productId, "");
});

test("mapping: expense, campaign, and supplier order rows map to app entities", () => {
  const expense = mapExpense({
    id: "e1",
    business_id: businessId,
    description: "Electricity",
    category: "Something unknown",
    amount: 1200.5,
    date: "2026-02-01",
    vendor: "BESCOM",
    notes: "",
  });
  assert.equal(expense.category, "Supplies"); // safe fallback
  assert.equal(expense.date, "2026-02-01");

  const campaign = mapCampaign({
    id: "cp1",
    business_id: businessId,
    name: "February winback",
    channel: "WhatsApp",
    status: "simulated",
    start_date: "2026-02-01",
    end_date: "2026-02-15",
    budget: 500,
    audience_size: 12,
    sent_count: 10,
    conversions: 2,
    revenue: 900,
  });
  assert.equal(campaign.channel, "WhatsApp");
  assert.equal(campaign.status, "simulated");

  const order = mapSupplierOrder({
    id: "o1",
    business_id: businessId,
    supplier_name: "Metro Wholesale",
    status: "approved",
    created_at: "2026-02-02T08:00:00.000Z",
    approved_at: "2026-02-03T08:00:00.000Z",
    items: [],
  });
  assert.equal(order.status, "approved");
  assert.equal(order.approvedAt, "2026-02-03T08:00:00.000Z");
});

test("mapping: assembleDemoData builds a complete store snapshot", () => {
  const tables: BusinessTables = {
    customers: [],
    products: [],
    sales: [],
    saleItems: [],
    expenses: [],
    stockMovements: [
      {
        id: "m1",
        business_id: businessId,
        product_id: "p1",
        product_name: "Tea",
        operation: "stock-in",
        quantity_changed: 10,
        previous_stock: 0,
        new_stock: 10,
        reason: "Opening stock",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    campaigns: [],
    supplierOrders: [],
  };
  const data = assembleDemoData(tables);
  assert.equal(data.customers.length, 0);
  assert.equal(data.transactions.length, 0);
  assert.equal(data.inventoryMovements?.length, 1);
  assert.equal(data.inventoryMovements?.[0]!.quantityChanged, 10);
  assert.ok(Date.parse(data.asOf) > 0);
});

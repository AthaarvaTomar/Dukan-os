import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applySaleStockReduction,
  buildWhatsAppReceiptUrl,
  calculateBill,
  formatReceiptText,
  validateBillItems,
} from "../lib/billing.ts";
import { createSaleRpc } from "../lib/db/queries.ts";
import { performCreateSale } from "../lib/db/store.ts";
import { customerSpending, segmentCustomers } from "../lib/demo-data/analytics.ts";
import type { Customer, DemoData, Product } from "../lib/demo-data/types.ts";

const businessId = "11111111-1111-1111-1111-111111111111";

const sampleCustomers: Customer[] = [
  {
    id: "cus-new",
    name: "Asha Rao",
    phone: "+91 98765 43210",
    email: "asha@example.com",
    address: "Bengaluru",
    joinedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
  },
  {
    id: "cus-returning",
    name: "Kabir Shah",
    phone: "9123456789",
    email: "kabir@example.com",
    address: "Bengaluru",
    joinedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
  },
];

const sampleProducts: Product[] = [
  {
    id: "prd-rice",
    name: "Basmati Rice",
    sku: "GRO-001",
    category: "Groceries",
    unit: "5 kg bag",
    price: 499.9,
    costPrice: 410,
    stock: 10,
    reorderLevel: 3,
  },
  {
    id: "prd-tea",
    name: "Tata Tea Gold",
    sku: "BEV-001",
    category: "Beverages",
    unit: "500 g pack",
    price: 150,
    costPrice: 120,
    stock: 4,
    reorderLevel: 2,
  },
  {
    id: "prd-juice",
    name: "Mango Juice",
    sku: "BEV-002",
    category: "Beverages",
    unit: "1 L carton",
    price: 110,
    costPrice: 79,
    stock: 0,
    reorderLevel: 5,
  },
];

test("billing: calculates line totals and grand total accurately", () => {
  const bill = calculateBill(
    [
      { productId: "prd-rice", quantity: 3 },
      { productId: "prd-tea", quantity: 2 },
    ],
    sampleProducts,
  );

  assert.equal(bill.lines.length, 2);
  assert.equal(bill.lines[0]!.lineTotal, 1499.7);
  assert.equal(bill.lines[1]!.lineTotal, 300);
  assert.equal(bill.subtotal, 1799.7);
  assert.equal(bill.grandTotal, 1799.7);
  assert.equal(bill.totalUnits, 5);
});

test("billing: oversell is blocked for single lines, zero stock, and split duplicate lines", () => {
  const singleOversell = validateBillItems([{ productId: "prd-tea", quantity: 5 }], sampleProducts);
  assert.equal(singleOversell.ok, false);
  if (!singleOversell.ok) {
    assert.match(singleOversell.error, /Not enough stock for Tata Tea Gold/i);
  }

  const outOfStock = validateBillItems([{ productId: "prd-juice", quantity: 1 }], sampleProducts);
  assert.equal(outOfStock.ok, false);

  const duplicateSplitOversell = validateBillItems(
    [
      { productId: "prd-tea", quantity: 3 },
      { productId: "prd-tea", quantity: 2 },
    ],
    sampleProducts,
  );
  assert.equal(duplicateSplitOversell.ok, false);

  const invalidQuantity = validateBillItems([{ productId: "prd-rice", quantity: 0 }], sampleProducts);
  assert.equal(invalidQuantity.ok, false);

  const emptyBill = validateBillItems([], sampleProducts);
  assert.equal(emptyBill.ok, false);

  assert.throws(
    () => applySaleStockReduction(sampleProducts, [{ productId: "prd-tea", quantity: 5 }]),
    /Not enough stock/,
  );
});

test("billing: reduces product stock when valid sale is applied", () => {
  const updated = applySaleStockReduction(sampleProducts, [
    { productId: "prd-rice", quantity: 3 },
    { productId: "prd-tea", quantity: 4 },
  ]);

  assert.equal(updated.find((p) => p.id === "prd-rice")?.stock, 7);
  assert.equal(updated.find((p) => p.id === "prd-tea")?.stock, 0);
  assert.equal(updated.find((p) => p.id === "prd-juice")?.stock, 0);
});

test("billing: createSaleRpc sends array p_items (not JSON string) and null for Walk-in", async () => {
  let capturedArgs: Record<string, unknown> | null = null;
  const mockDb = {
    rpc(_fn: string, params: Record<string, unknown>) {
      capturedArgs = params;
      return Promise.resolve({ data: "sale-uuid-1", error: null });
    },
  } as unknown as SupabaseClient;

  const saleId = await createSaleRpc(mockDb, businessId, {
    customerId: "",
    date: "2026-11-11T10:00:00.000Z",
    items: [
      {
        productId: "prd-tea",
        productName: "Tata Tea Gold",
        quantity: 2,
        unitPrice: 150,
        unitCost: 120,
      },
    ],
    discount: 0,
    paymentMethod: "upi",
    status: "completed",
  });

  assert.equal(saleId, "sale-uuid-1");
  assert.equal(capturedArgs!["p_customer_id"], null);
  assert.ok(Array.isArray(capturedArgs!["p_items"]));
});

test("billing: performCreateSale blocks oversell before RPC and updates stock, customer totals, and segments on success", async () => {
  let rpcCalled = 0;
  let storedSales: Array<Record<string, unknown>> = [
    {
      id: "sale-old-1",
      business_id: businessId,
      customer_id: "cus-returning",
      date: "2026-11-05T10:00:00.000Z",
      subtotal: 300,
      discount: 0,
      total_amount: 300,
      payment_method: "cash",
      status: "completed",
    },
    {
      id: "sale-old-2",
      business_id: businessId,
      customer_id: "cus-returning",
      date: "2026-11-07T10:00:00.000Z",
      subtotal: 200,
      discount: 0,
      total_amount: 200,
      payment_method: "upi",
      status: "completed",
    },
  ];
  let storedSaleItems: Array<Record<string, unknown>> = [
    {
      id: "si-1",
      sale_id: "sale-old-1",
      business_id: businessId,
      product_id: "prd-tea",
      product_name: "Tata Tea Gold",
      quantity: 2,
      unit_price: 150,
      unit_cost: 120,
    },
    {
      id: "si-2",
      sale_id: "sale-old-2",
      business_id: businessId,
      product_id: "prd-tea",
      product_name: "Tata Tea Gold",
      quantity: 1,
      unit_price: 200,
      unit_cost: 120,
    },
  ];
  let storedProducts = sampleProducts.map((product) => ({
    id: product.id,
    business_id: businessId,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    category: product.category,
    price: product.price,
    cost_price: product.costPrice,
    stock: product.stock,
    reorder_level: product.reorderLevel,
    supplier_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
  const storedMovements: Array<Record<string, unknown>> = [];

  const createTableQuery = (rows: () => Array<Record<string, unknown>>) => {
    const queryResult = () => Promise.resolve({ data: rows(), error: null });
    return {
      eq() {
        return {
          order() {
            return queryResult();
          },
          then: queryResult().then.bind(queryResult()),
        };
      },
    };
  };

  const mockDb = {
    rpc(fn: string, params: Record<string, unknown>) {
      assert.equal(fn, "create_sale");
      rpcCalled += 1;
      const items = params["p_items"] as Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        unitCost: number;
      }>;
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const id = `sale-${rpcCalled}`;
      storedSales = [
        {
          id,
          business_id: businessId,
          customer_id: params["p_customer_id"],
          date: params["p_date"],
          subtotal,
          discount: params["p_discount"],
          total_amount: subtotal - Number(params["p_discount"]),
          payment_method: params["p_payment_method"],
          status: params["p_status"],
        },
        ...storedSales,
      ];
      storedSaleItems = [
        ...storedSaleItems,
        ...items.map((item, idx) => ({
          id: `si-${id}-${idx}`,
          sale_id: id,
          business_id: businessId,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          unit_cost: item.unitCost,
        })),
      ];
      storedProducts = storedProducts.map((product) => {
        const line = items.find((entry) => entry.productId === product.id);
        if (!line) return product;
        const nextStock = product.stock - line.quantity;
        storedMovements.unshift({
          id: `mov-${id}-${product.id}`,
          business_id: businessId,
          product_id: product.id,
          product_name: product.name,
          operation: "stock-out",
          quantity_changed: -line.quantity,
          previous_stock: product.stock,
          new_stock: nextStock,
          reason: "Sale",
          created_at: String(params["p_date"]),
        });
        return { ...product, stock: nextStock };
      });
      return Promise.resolve({ data: id, error: null });
    },
    from(table: string) {
      return {
        select() {
          if (table === "sales") return createTableQuery(() => storedSales);
          if (table === "sale_items") return createTableQuery(() => storedSaleItems);
          if (table === "products") return createTableQuery(() => storedProducts);
          if (table === "stock_movements") return createTableQuery(() => storedMovements);
          if (table === "customers") {
            return createTableQuery(() =>
              sampleCustomers.map((c) => ({
                id: c.id,
                business_id: businessId,
                name: c.name,
                phone: c.phone,
                email: c.email,
                address: c.address,
                notes: c.notes,
                joined_at: c.joinedAt,
              })),
            );
          }
          throw new Error(`Unexpected table ${table}`);
        },
      };
    },
  } as unknown as SupabaseClient;

  const initialSnapshot: DemoData = {
    asOf: "2026-11-10T10:00:00.000Z",
    customers: sampleCustomers,
    products: sampleProducts,
    transactions: [
      {
        id: "sale-old-1",
        customerId: "cus-returning",
        date: "2026-11-05T10:00:00.000Z",
        items: [{ productId: "prd-tea", productName: "Tata Tea Gold", quantity: 2, unitPrice: 150, unitCost: 120 }],
        subtotal: 300,
        discount: 0,
        totalAmount: 300,
        paymentMethod: "cash",
        status: "completed",
      },
      {
        id: "sale-old-2",
        customerId: "cus-returning",
        date: "2026-11-07T10:00:00.000Z",
        items: [{ productId: "prd-tea", productName: "Tata Tea Gold", quantity: 1, unitPrice: 200, unitCost: 120 }],
        subtotal: 200,
        discount: 0,
        totalAmount: 200,
        paymentMethod: "upi",
        status: "completed",
      },
    ],
    expenses: [],
    campaigns: [],
  };

  // Before sales: cus-new is inactive (0 orders), cus-returning is new (2 orders)
  const initialSegments = segmentCustomers(
    initialSnapshot.customers,
    initialSnapshot.transactions,
    new Date(initialSnapshot.asOf),
  );
  assert.equal(initialSegments.find((c) => c.id === "cus-new")?.segment, "inactive");
  assert.equal(initialSegments.find((c) => c.id === "cus-returning")?.segment, "new");

  // 1) Oversell must be blocked without invoking RPC
  const blocked = await performCreateSale(mockDb, businessId, initialSnapshot, {
    customerId: "cus-new",
    date: "2026-11-11T10:00:00.000Z",
    items: [
      {
        productId: "prd-tea",
        productName: "Tata Tea Gold",
        quantity: 99,
        unitPrice: 150,
        unitCost: 120,
      },
    ],
    discount: 0,
    paymentMethod: "cash",
    status: "completed",
  });
  assert.equal(blocked.ok, false);
  assert.equal(rpcCalled, 0);

  // 2) First purchase for cus-new transitions them from inactive -> new & reduces stock
  const saleDate1 = new Date().toISOString();
  const firstSale = await performCreateSale(mockDb, businessId, initialSnapshot, {
    customerId: "cus-new",
    date: saleDate1,
    items: [
      {
        productId: "prd-tea",
        productName: "Tata Tea Gold",
        quantity: 2,
        unitPrice: 150,
        unitCost: 120,
      },
    ],
    discount: 0,
    paymentMethod: "upi",
    status: "completed",
  });
  assert.equal(firstSale.ok, true);
  if (!firstSale.ok) return;

  assert.equal(firstSale.transaction.totalAmount, 300);
  assert.equal(firstSale.data.products.find((p) => p.id === "prd-tea")?.stock, 2);

  const afterFirstSegments = segmentCustomers(
    firstSale.data.customers,
    firstSale.data.transactions,
    new Date(firstSale.data.asOf),
  );
  const updatedAsha = afterFirstSegments.find((c) => c.id === "cus-new");
  assert.equal(updatedAsha?.totalSpent, 300);
  assert.equal(updatedAsha?.transactionCount, 1);
  assert.equal(updatedAsha?.lastPurchaseAt, saleDate1);
  assert.equal(updatedAsha?.segment, "new");

  // 3) Third order for cus-returning promotes them from new -> regular
  const saleDate2 = new Date(Date.now() + 1000).toISOString();
  const secondSale = await performCreateSale(mockDb, businessId, firstSale.data, {
    customerId: "cus-returning",
    date: saleDate2,
    items: [
      {
        productId: "prd-rice",
        productName: "Basmati Rice",
        quantity: 1,
        unitPrice: 499.9,
        unitCost: 410,
      },
    ],
    discount: 0,
    paymentMethod: "cash",
    status: "completed",
  });
  assert.equal(secondSale.ok, true);
  if (!secondSale.ok) return;

  const afterSecondSegments = segmentCustomers(
    secondSale.data.customers,
    secondSale.data.transactions,
    new Date(secondSale.data.asOf),
  );
  const updatedKabir = afterSecondSegments.find((c) => c.id === "cus-returning");
  assert.equal(updatedKabir?.transactionCount, 3);
  assert.equal(updatedKabir?.totalSpent, 999.9);
  assert.equal(updatedKabir?.lastPurchaseAt, saleDate2);
  assert.equal(updatedKabir?.segment, "regular");

  // 4) Walk-in bill saves with customer_id = null -> customerId = "" without crashing analytics
  const walkInSale = await performCreateSale(mockDb, businessId, secondSale.data, {
    customerId: "",
    date: new Date(Date.now() + 2000).toISOString(),
    items: [
      {
        productId: "prd-tea",
        productName: "Tata Tea Gold",
        quantity: 1,
        unitPrice: 150,
        unitCost: 120,
      },
    ],
    discount: 0,
    paymentMethod: "cash",
    status: "completed",
  });
  assert.equal(walkInSale.ok, true);
  if (!walkInSale.ok) return;
  assert.equal(walkInSale.transaction.customerId, "");
  assert.equal(walkInSale.data.products.find((p) => p.id === "prd-tea")?.stock, 1);
  assert.doesNotThrow(() => customerSpending(walkInSale.data.customers, walkInSale.data.transactions));
});

test("billing: builds WhatsApp wa.me receipt links for customer and Walk-in bills", () => {
  const txn = {
    id: "abcd1234-0000-0000-0000-000000000000",
    customerId: "cus-new",
    date: "2026-11-11T10:30:00.000Z",
    items: [
      {
        productId: "prd-tea",
        productName: "Tata Tea Gold",
        quantity: 2,
        unitPrice: 150,
        unitCost: 120,
      },
    ],
    subtotal: 300,
    discount: 0,
    totalAmount: 300,
    paymentMethod: "upi" as const,
    status: "completed" as const,
  };

  const text = formatReceiptText({
    businessName: "Sharma General Store",
    transaction: txn,
    customerName: "Asha Rao",
  });
  assert.match(text, /Sharma General Store/);
  assert.match(text, /Tata Tea Gold x 2/);
  assert.match(text, /Grand Total/);

  const urlWithCustomer = buildWhatsAppReceiptUrl({
    businessName: "Sharma General Store",
    transaction: txn,
    customer: sampleCustomers[0],
  });
  assert.ok(urlWithCustomer.startsWith("https://wa.me/919876543210?text="));

  const urlWalkIn = buildWhatsAppReceiptUrl({
    businessName: "Sharma General Store",
    transaction: { ...txn, customerId: "" },
    customer: null,
  });
  assert.ok(urlWalkIn.startsWith("https://wa.me/?text="));
  assert.match(decodeURIComponent(urlWalkIn), /Customer: Walk-in/);
});


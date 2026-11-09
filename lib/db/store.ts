"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  adjustStockRpc,
  cancelSaleRpc,
  createSaleRpc,
  deleteCampaignRow,
  deleteCustomerRow,
  deleteExpenseRow,
  deleteProductRow,
  deleteSupplierOrderRow,
  fetchBusinessData,
  fetchMyBusinessId,
  fetchSalesData,
  upsertCampaignRow,
  upsertCustomerRow,
  upsertExpenseRow,
  upsertProductRow,
  upsertSupplierOrderRow,
  type AdjustStockResult,
} from "@/lib/db/queries";
import { mapProduct, mapTransactions, type ProductRow } from "@/lib/db/mapping";
import { upsertById } from "@/lib/demo-data/storage";
import type {
  Customer,
  DemoData,
  Expense,
  MarketingCampaign,
  Product,
  StockOperation,
  SupplierOrderDraft,
} from "@/lib/demo-data/types";

export type StoreStatus = "loading" | "ready" | "error" | "anonymous";

const emptyData: DemoData = {
  asOf: "1970-01-01T12:00:00.000Z",
  customers: [],
  products: [],
  transactions: [],
  expenses: [],
  campaigns: [],
};

let db: SupabaseClient | null = null;
let currentData: DemoData = emptyData;
let currentStatus: StoreStatus = "loading";
let currentError: string | null = null;
let businessId: string | null = null;
let initialized = false;
let initialization: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function fail(message: string): void {
  currentError = message;
  currentStatus = "error";
  notify();
}

function client(): SupabaseClient {
  if (!db) db = createSupabaseBrowserClient();
  return db;
}

async function loadAll(): Promise<void> {
  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    currentStatus = "anonymous";
    currentData = emptyData;
    return;
  }

  businessId = await fetchMyBusinessId(supabase);
  if (!businessId) {
    currentStatus = "anonymous"; // signed in but shop setup not finished
    currentData = emptyData;
    return;
  }
  currentData = await fetchBusinessData(supabase, businessId);
  currentStatus = "ready";
  currentError = null;
}

async function initialize(): Promise<void> {
  if (initialization) return initialization;
  currentStatus = "loading";
  currentError = null;
  notify();

  initialization = loadAll()
    .catch((error: unknown) => {
      currentStatus = "error";
      currentError =
        error instanceof Error ? error.message : "Your business data could not be loaded.";
    })
    .finally(() => {
      initialization = null;
      notify();
    });
  return initialization;
}

export function subscribeToBusinessData(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    void initialize();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getBusinessDataSnapshot(): DemoData {
  return currentData;
}

/** Stable snapshot for SSR/server rendering. */
export function getBusinessDataServerSnapshot(): DemoData {
  return emptyData;
}

export function getBusinessDataStatus(): StoreStatus {
  return currentStatus;
}

export function getBusinessDataError(): string | null {
  return currentError;
}

export function isBusinessDataReady(): boolean {
  return currentStatus === "ready" && businessId !== null;
}

export function getBusinessId(): string | null {
  return businessId;
}

/** Reloads everything from the database (used after sign-in/out and RPC writes). */
export async function reloadBusinessData(): Promise<void> {
  initialized = true;
  await initialize();
}

/** Runs a DB write; returns null on failure (and resyncs local state). */
async function runWrite<T>(action: () => Promise<T>): Promise<T | null> {
  try {
    const result = await action();
    currentError = null;
    notify();
    return result;
  } catch (error) {
    fail(error instanceof Error ? error.message : "The change could not be saved.");
    // Resync local state with the database after a failed write.
    void initialize();
    return null;
  }
}

export const businessActions = {
  async upsertCustomer(record: Customer): Promise<boolean> {
    if (!businessId) return false;
    currentData = { ...currentData, customers: upsertById(currentData.customers, record) };
    notify();
    return (await runWrite(() => upsertCustomerRow(client(), businessId!, record))) !== null;
  },

  async removeCustomer(id: string): Promise<boolean> {
    currentData = { ...currentData, customers: currentData.customers.filter((c) => c.id !== id) };
    notify();
    return (await runWrite(() => deleteCustomerRow(client(), id))) !== null;
  },

  async upsertProduct(record: Product): Promise<boolean> {
    if (!businessId) return false;
    currentData = { ...currentData, products: upsertById(currentData.products, record) };
    notify();
    return (await runWrite(() => upsertProductRow(client(), businessId!, record))) !== null;
  },

  async removeProduct(id: string): Promise<boolean> {
    currentData = { ...currentData, products: currentData.products.filter((p) => p.id !== id) };
    notify();
    return (await runWrite(() => deleteProductRow(client(), id))) !== null;
  },

  async upsertExpense(record: Expense): Promise<boolean> {
    if (!businessId) return false;
    currentData = { ...currentData, expenses: upsertById(currentData.expenses, record) };
    notify();
    return (await runWrite(() => upsertExpenseRow(client(), businessId!, record))) !== null;
  },

  async removeExpense(id: string): Promise<boolean> {
    currentData = { ...currentData, expenses: currentData.expenses.filter((e) => e.id !== id) };
    notify();
    return (await runWrite(() => deleteExpenseRow(client(), id))) !== null;
  },

  async upsertCampaign(record: MarketingCampaign): Promise<boolean> {
    if (!businessId) return false;
    currentData = { ...currentData, campaigns: upsertById(currentData.campaigns, record) };
    notify();
    return (await runWrite(() => upsertCampaignRow(client(), businessId!, record))) !== null;
  },

  async removeCampaign(id: string): Promise<boolean> {
    currentData = { ...currentData, campaigns: currentData.campaigns.filter((c) => c.id !== id) };
    notify();
    return (await runWrite(() => deleteCampaignRow(client(), id))) !== null;
  },

  async upsertSupplierOrder(record: SupplierOrderDraft): Promise<boolean> {
    if (!businessId) return false;
    currentData = {
      ...currentData,
      supplierOrders: upsertById(currentData.supplierOrders ?? [], record),
    };
    notify();
    return (await runWrite(() => upsertSupplierOrderRow(client(), businessId!, record))) !== null;
  },

  async removeSupplierOrder(id: string): Promise<boolean> {
    currentData = {
      ...currentData,
      supplierOrders: (currentData.supplierOrders ?? []).filter((o) => o.id !== id),
    };
    notify();
    return (await runWrite(() => deleteSupplierOrderRow(client(), id))) !== null;
  },

  /**
   * Stock in/out/adjust through the transactional RPC. The database returns
   * the resulting movement, which is applied to the local snapshot.
   */
  async adjustStock(
    productId: string,
    operation: StockOperation,
    quantity: number,
    reason: string,
  ): Promise<AdjustStockResult | null> {
    if (!businessId) return null;
    return runWrite(async () => {
      const adjustment = await adjustStockRpc(client(), productId, operation, quantity, reason);
      const quantityChanged = operation === "stock-out" ? -quantity : quantity;
      currentData = {
        ...currentData,
        products: currentData.products.map((p) =>
          p.id === adjustment.productId ? { ...p, stock: adjustment.newStock } : p,
        ),
        inventoryMovements: [
          {
            id: adjustment.movementId,
            productId: adjustment.productId,
            productName: adjustment.productName,
            operation,
            quantityChanged,
            previousStock: adjustment.newStock - quantityChanged,
            newStock: adjustment.newStock,
            reason,
            createdAt: new Date().toISOString(),
          },
          ...(currentData.inventoryMovements ?? []),
        ],
      };
      return adjustment;
    });
  },

  /**
   * Creates a sale through the transactional RPC (deducts stock, logs
   * movements), then refreshes sales and products from the database.
   */
  async createSale(sale: {
    customerId: string;
    date: string;
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; unitCost: number }>;
    discount: number;
    paymentMethod: string;
    status: string;
  }): Promise<boolean> {
    if (!businessId) return false;
    const result = await runWrite(async () => {
      await createSaleRpc(client(), businessId!, sale);
      const [{ sales, saleItems }, products] = await Promise.all([
        fetchSalesData(client(), businessId!),
        client().from("products").select("*").eq("business_id", businessId!),
      ]);
      if (products.error) throw new Error(products.error.message);
      return { sales, saleItems, products: (products.data ?? []).map((row) => mapProduct(row as ProductRow)) };
    });
    if (!result) return false;
    currentData = {
      ...currentData,
      transactions: mapTransactions(result.sales, result.saleItems),
      products: result.products,
    };
    notify();
    return true;
  },

  /** Cancels a sale: the database restores stock and marks the sale cancelled. */
  async cancelSale(saleId: string): Promise<boolean> {
    const result = await runWrite(async () => {
      await cancelSaleRpc(client(), saleId);
      const [{ sales, saleItems }, products] = await Promise.all([
        fetchSalesData(client(), businessId!),
        client().from("products").select("*").eq("business_id", businessId!),
      ]);
      if (products.error) throw new Error(products.error.message);
      return { sales, saleItems, products: (products.data ?? []).map((row) => mapProduct(row as ProductRow)) };
    });
    if (!result) return false;
    currentData = {
      ...currentData,
      transactions: mapTransactions(result.sales, result.saleItems),
      products: result.products,
    };
    notify();
    return true;
  },

  /** Clears the cached business data (used on sign-out). */
  async reset(): Promise<void> {
    currentData = emptyData;
    currentStatus = "anonymous";
    currentError = null;
    businessId = null;
    notify();
  },
};

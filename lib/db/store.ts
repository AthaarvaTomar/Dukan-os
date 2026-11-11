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
import {
  mapCustomer,
  mapProduct,
  mapStockMovement,
  mapTransactions,
  type CustomerRow,
  type ProductRow,
  type StockMovementRow,
} from "@/lib/db/mapping";
import { calculateBill, validateBillItems } from "@/lib/billing";
import { upsertById } from "@/lib/demo-data/storage";
import type {
  Customer,
  DemoData,
  Expense,
  MarketingCampaign,
  PaymentMethod,
  Product,
  StockOperation,
  SupplierOrderDraft,
  Transaction,
  TransactionStatus,
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

export interface CreateSaleInput {
  customerId: string;
  date: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
  }>;
  discount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
}

export type CreateSaleResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; error: string };

async function fetchAfterSaleMutation(db: SupabaseClient, activeBusinessId: string) {
  const [{ sales, saleItems }, products, customers, stockMovements] = await Promise.all([
    fetchSalesData(db, activeBusinessId),
    db.from("products").select("*").eq("business_id", activeBusinessId),
    db.from("customers").select("*").eq("business_id", activeBusinessId),
    db
      .from("stock_movements")
      .select("*")
      .eq("business_id", activeBusinessId)
      .order("created_at", { ascending: false }),
  ]);
  const firstError = [products, customers, stockMovements].find((res) => res.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    asOf: new Date().toISOString(),
    transactions: mapTransactions(sales, saleItems),
    products: (products.data ?? []).map((row) => mapProduct(row as ProductRow)),
    customers: (customers.data ?? []).map((row) => mapCustomer(row as CustomerRow)),
    inventoryMovements: (stockMovements.data ?? []).map((row) =>
      mapStockMovement(row as StockMovementRow),
    ),
  };
}

/**
 * Validates stock rules cleanly and executes `create_sale` against Supabase,
 * returning the updated snapshot + created transaction without clobbering UI state on error.
 */
export async function performCreateSale(
  db: SupabaseClient,
  activeBusinessId: string | null,
  snapshot: DemoData,
  sale: CreateSaleInput,
): Promise<{ ok: true; data: DemoData; transaction: Transaction } | { ok: false; error: string }> {
  if (!activeBusinessId) {
    return { ok: false, error: "Shop session is not ready yet." };
  }

  const validation = validateBillItems(sale.items, snapshot.products);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const productById = new Map(snapshot.products.map((product) => [product.id, product]));
  const normalizedItems = validation.mergedItems.map((item) => {
    const product = productById.get(item.productId)!;
    return {
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      unitCost: product.costPrice,
    };
  });

  try {
    const saleId = await createSaleRpc(db, activeBusinessId, {
      ...sale,
      items: normalizedItems,
    });
    const refreshed = await fetchAfterSaleMutation(db, activeBusinessId);
    const updatedData: DemoData = {
      ...snapshot,
      ...refreshed,
    };
    const { subtotal, grandTotal } = calculateBill(validation.mergedItems, snapshot.products);
    const createdTransaction: Transaction =
      refreshed.transactions.find((entry) => entry.id === saleId) ?? {
        id: saleId,
        customerId: sale.customerId,
        date: sale.date,
        items: normalizedItems,
        subtotal,
        discount: sale.discount,
        totalAmount: Math.max(0, grandTotal - sale.discount),
        paymentMethod: sale.paymentMethod,
        status: sale.status,
      };
    return { ok: true, data: updatedData, transaction: createdTransaction };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The bill could not be saved.",
    };
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
   * movements, updates customer totals), then refreshes sales, products, customers, and movements.
   */
  async createSale(sale: CreateSaleInput): Promise<CreateSaleResult> {
    const outcome = await performCreateSale(client(), businessId, currentData, sale);
    if (!outcome.ok) return outcome;
    currentData = outcome.data;
    notify();
    return { ok: true, transaction: outcome.transaction };
  },

  /** Cancels a sale: the database restores stock and marks the sale cancelled. */
  async cancelSale(saleId: string): Promise<boolean> {
    if (!businessId) return false;
    const result = await runWrite(async () => {
      await cancelSaleRpc(client(), saleId);
      return fetchAfterSaleMutation(client(), businessId!);
    });
    if (!result) return false;
    currentData = {
      ...currentData,
      ...result,
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

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Customer,
  Expense,
  MarketingCampaign,
  Product,
  StockOperation,
  SupplierOrderDraft,
} from "@/lib/demo-data/types";
import {
  assembleDemoData,
  campaignToRow,
  customerToRow,
  expenseToRow,
  productToRow,
  supplierOrderToRow,
  type BusinessTables,
} from "@/lib/db/mapping";
import type { DemoData } from "@/lib/demo-data/types";

type Db = SupabaseClient;

export async function fetchMyBusinessId(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from("business_members")
    .select("business_id")
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.business_id ?? null;
}

export async function fetchBusinessData(db: Db, businessId: string): Promise<DemoData> {
  const [customers, products, sales, saleItems, expenses, stockMovements, campaigns, supplierOrders] =
    await Promise.all([
      db.from("customers").select("*").eq("business_id", businessId),
      db.from("products").select("*").eq("business_id", businessId),
      db.from("sales").select("*").eq("business_id", businessId).order("date", { ascending: false }),
      db.from("sale_items").select("*").eq("business_id", businessId),
      db.from("expenses").select("*").eq("business_id", businessId),
      db.from("stock_movements").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      db.from("campaigns").select("*").eq("business_id", businessId),
      db.from("supplier_orders").select("*").eq("business_id", businessId),
    ]);

  const firstError = [customers, products, sales, saleItems, expenses, stockMovements, campaigns, supplierOrders]
    .find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const tables: BusinessTables = {
    customers: (customers.data ?? []) as BusinessTables["customers"],
    products: (products.data ?? []) as BusinessTables["products"],
    sales: (sales.data ?? []) as BusinessTables["sales"],
    saleItems: (saleItems.data ?? []) as BusinessTables["saleItems"],
    expenses: (expenses.data ?? []) as BusinessTables["expenses"],
    stockMovements: (stockMovements.data ?? []) as BusinessTables["stockMovements"],
    campaigns: (campaigns.data ?? []) as BusinessTables["campaigns"],
    supplierOrders: (supplierOrders.data ?? []) as BusinessTables["supplierOrders"],
  };
  return assembleDemoData(tables);
}

export async function fetchSalesData(db: Db, businessId: string) {
  const [sales, saleItems] = await Promise.all([
    db.from("sales").select("*").eq("business_id", businessId).order("date", { ascending: false }),
    db.from("sale_items").select("*").eq("business_id", businessId),
  ]);
  if (sales.error) throw new Error(sales.error.message);
  if (saleItems.error) throw new Error(saleItems.error.message);
  return { sales: sales.data ?? [], saleItems: saleItems.data ?? [] };
}

async function run(promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(error.message);
}

export async function upsertCustomerRow(db: Db, businessId: string, customer: Customer) {
  await run(db.from("customers").upsert(customerToRow(businessId, customer)));
}

export async function deleteCustomerRow(db: Db, id: string) {
  const { error } = await db.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertProductRow(db: Db, businessId: string, product: Product) {
  await run(db.from("products").upsert(productToRow(businessId, product)));
}

export async function deleteProductRow(db: Db, id: string) {
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertExpenseRow(db: Db, businessId: string, expense: Expense) {
  await run(db.from("expenses").upsert(expenseToRow(businessId, expense)));
}

export async function deleteExpenseRow(db: Db, id: string) {
  const { error } = await db.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertCampaignRow(db: Db, businessId: string, campaign: MarketingCampaign) {
  await run(db.from("campaigns").upsert(campaignToRow(businessId, campaign)));
}

export async function deleteCampaignRow(db: Db, id: string) {
  const { error } = await db.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertSupplierOrderRow(db: Db, businessId: string, order: SupplierOrderDraft) {
  const { error } = await db.from("supplier_orders").upsert(supplierOrderToRow(businessId, order));
  if (error) throw new Error(error.message);
}

export async function deleteSupplierOrderRow(db: Db, id: string) {
  const { error } = await db.from("supplier_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface AdjustStockResult {
  productId: string;
  productName: string;
  newStock: number;
  movementId: string;
}

export async function adjustStockRpc(
  db: Db,
  productId: string,
  operation: StockOperation,
  quantity: number,
  reason: string,
): Promise<AdjustStockResult> {
  const { data, error } = await db.rpc("adjust_stock", {
    p_product_id: productId,
    p_operation: operation,
    p_quantity: quantity,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  const movement = Array.isArray(data) ? data[0] : data;
  return {
    productId: movement.product_id,
    productName: movement.product_name,
    newStock: movement.new_stock,
    movementId: movement.id,
  };
}

export async function createSaleRpc(
  db: Db,
  businessId: string,
  sale: {
    customerId: string;
    date: string;
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; unitCost: number }>;
    discount: number;
    paymentMethod: string;
    status: string;
  },
): Promise<string> {
  const { data, error } = await db.rpc("create_sale", {
    p_business_id: businessId,
    p_customer_id: sale.customerId || null,
    p_date: sale.date,
    p_discount: sale.discount,
    p_payment_method: sale.paymentMethod,
    p_status: sale.status,
    p_items: sale.items,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as string;
}

export async function cancelSaleRpc(db: Db, saleId: string): Promise<void> {
  const { error } = await db.rpc("cancel_sale", { p_sale_id: saleId });
  if (error) throw new Error(error.message);
}

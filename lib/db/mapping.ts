import type {
  CampaignStatus,
  Customer,
  DemoData,
  Expense,
  ExpenseCategory,
  InventoryMovement,
  MarketingCampaign,
  PaymentMethod,
  Product,
  ProductCategory,
  StockOperation,
  SupplierOrderDraft,
  Transaction,
  TransactionItem,
} from "@/lib/demo-data/types";

// Raw row shapes as Supabase returns them (snake_case columns).

export interface CustomerRow {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  joined_at: string;
}

export interface ProductRow {
  id: string;
  business_id: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  price: number;
  cost_price: number;
  stock: number;
  reorder_level: number;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleRow {
  id: string;
  business_id: string;
  customer_id: string | null;
  date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  payment_method: string;
  status: string;
}

export interface SaleItemRow {
  id: string;
  sale_id: string;
  business_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

export interface ExpenseRow {
  id: string;
  business_id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  vendor: string;
  notes: string;
}

export interface StockMovementRow {
  id: string;
  business_id: string;
  product_id: string;
  product_name: string;
  operation: string;
  quantity_changed: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  business_id: string;
  name: string;
  channel: string;
  status: string;
  execution_mode?: string;
  start_date: string;
  end_date: string;
  budget: number;
  audience_size: number;
  sent_count: number;
  conversions: number;
  revenue: number;
}

/** Full row as selected with "*" (includes timestamps and summary message). */
export interface CampaignRowWithSummary extends CampaignRow {
  summary_message: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierOrderRow {
  id: string;
  business_id: string;
  supplier_name: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  items: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    reorderQuantity: number;
    purchaseCost: number;
    estimatedAmount: number;
  }>;
}

const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Groceries",
  "Beverages",
  "Household",
  "Personal care",
  "Snacks",
  "Stationery",
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Rent",
  "Utilities",
  "Supplies",
  "Transport",
  "Marketing",
  "Maintenance",
];

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "upi", "card"];

const CAMPAIGN_CHANNELS: MarketingCampaign["channel"][] = [
  "WhatsApp",
  "Instagram",
  "In-store",
  "SMS",
];

function asCategory(value: string): ProductCategory {
  return PRODUCT_CATEGORIES.includes(value as ProductCategory)
    ? (value as ProductCategory)
    : "Groceries";
}

function asExpenseCategory(value: string): ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory)
    ? (value as ExpenseCategory)
    : "Supplies";
}

function asPaymentMethod(value: string): PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : "cash";
}

function asChannel(value: string): MarketingCampaign["channel"] {
  return CAMPAIGN_CHANNELS.includes(value as MarketingCampaign["channel"])
    ? (value as MarketingCampaign["channel"])
    : "In-store";
}

function asCampaignStatus(value: string): CampaignStatus {
  return [
    "draft",
    "approved",
    "demo_executed",
    "scheduled",
    "active",
    "completed",
    "simulated",
  ].includes(value)
    ? (value as CampaignStatus)
    : "draft";
}

function asStockOperation(value: string): StockOperation {
  return value === "stock-in" || value === "stock-out" || value === "adjustment"
    ? (value as StockOperation)
    : "adjustment";
}

export function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    joinedAt: row.joined_at,
    notes: row.notes ?? "",
  };
}

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: asCategory(row.category),
    unit: row.unit,
    price: Number(row.price),
    costPrice: Number(row.cost_price),
    stock: row.stock,
    reorderLevel: row.reorder_level,
    ...(row.supplier_name ? { supplierName: row.supplier_name } : {}),
    lastUpdatedAt: row.updated_at,
  };
}

export function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    description: row.description,
    category: asExpenseCategory(row.category),
    amount: Number(row.amount),
    date: row.date,
    vendor: row.vendor ?? "",
    notes: row.notes ?? "",
  };
}

export function mapStockMovement(row: StockMovementRow): InventoryMovement {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    operation: asStockOperation(row.operation),
    quantityChanged: row.quantity_changed,
    previousStock: row.previous_stock,
    newStock: row.new_stock,
    reason: row.reason ?? "",
    createdAt: row.created_at,
  };
}

export function mapCampaign(row: CampaignRow): MarketingCampaign {
  return {
    id: row.id,
    name: row.name,
    channel: asChannel(row.channel),
    status: asCampaignStatus(row.status),
    executionMode: row.execution_mode === "whatsapp" ? "whatsapp" : "demo",
    startDate: row.start_date,
    endDate: row.end_date,
    budget: Number(row.budget),
    audienceSize: row.audience_size,
    sentCount: row.sent_count,
    conversions: row.conversions,
    revenue: Number(row.revenue),
  };
}

export function mapSupplierOrder(row: SupplierOrderRow): SupplierOrderDraft {
  return {
    id: row.id,
    supplierName: row.supplier_name,
    status: row.status === "approved" ? "approved" : "draft",
    createdAt: row.created_at,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    items: Array.isArray(row.items) ? row.items : [],
  };
}

/**
 * Combines sales rows with their items into the app's Transaction shape.
 * Cancelled sales are excluded: they only exist as history, and analytics
 * must not count them.
 */
export function mapTransactions(sales: SaleRow[], items: SaleItemRow[]): Transaction[] {
  const itemsBySale = new Map<string, TransactionItem[]>();
  for (const item of items) {
    const list = itemsBySale.get(item.sale_id) ?? [];
    list.push({
      productId: item.product_id ?? "",
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      unitCost: Number(item.unit_cost),
    });
    itemsBySale.set(item.sale_id, list);
  }

  return sales
    .filter((sale) => sale.status === "completed" || sale.status === "processing")
    .map((sale) => ({
      id: sale.id,
      customerId: sale.customer_id ?? "",
      date: sale.date,
      items: itemsBySale.get(sale.id) ?? [],
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      totalAmount: Number(sale.total_amount),
      paymentMethod: asPaymentMethod(sale.payment_method),
      status: sale.status === "completed" ? "completed" : "processing",
    }));
}

export interface BusinessTables {
  customers: CustomerRow[];
  products: ProductRow[];
  sales: SaleRow[];
  saleItems: SaleItemRow[];
  expenses: ExpenseRow[];
  stockMovements: StockMovementRow[];
  campaigns: CampaignRow[];
  supplierOrders: SupplierOrderRow[];
}

export function assembleDemoData(tables: BusinessTables): DemoData {
  return {
    asOf: new Date().toISOString(),
    customers: tables.customers.map(mapCustomer),
    products: tables.products.map(mapProduct),
    transactions: mapTransactions(tables.sales, tables.saleItems),
    expenses: tables.expenses.map(mapExpense),
    campaigns: tables.campaigns.map(mapCampaign),
    inventoryMovements: tables.stockMovements.map(mapStockMovement),
    supplierOrders: tables.supplierOrders.map(mapSupplierOrder),
  };
}

// ---------------------------------------------------------------------------
// Entity -> row mappers (for writes)
// ---------------------------------------------------------------------------

export function customerToRow(businessId: string, customer: Customer): CustomerRow & { business_id: string } {
  return {
    id: customer.id,
    business_id: businessId,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notes: customer.notes,
    joined_at: customer.joinedAt,
  };
}

export function productToRow(businessId: string, product: Product) {
  return {
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
    supplier_name: product.supplierName ?? null,
  };
}

export function expenseToRow(businessId: string, expense: Expense) {
  return {
    id: expense.id,
    business_id: businessId,
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    date: expense.date,
    vendor: expense.vendor,
    notes: expense.notes,
  };
}

export function campaignToRow(businessId: string, campaign: MarketingCampaign) {
  return {
    id: campaign.id,
    business_id: businessId,
    name: campaign.name,
    channel: campaign.channel,
    status: campaign.status,
    start_date: campaign.startDate,
    end_date: campaign.endDate,
    budget: campaign.budget,
    audience_size: campaign.audienceSize,
    sent_count: campaign.sentCount,
    conversions: campaign.conversions,
    revenue: campaign.revenue,
  };
}

export function supplierOrderToRow(businessId: string, order: SupplierOrderDraft) {
  return {
    id: order.id,
    business_id: businessId,
    supplier_name: order.supplierName,
    status: order.status,
    created_at: order.createdAt,
    approved_at: order.approvedAt ?? null,
    items: order.items,
  };
}

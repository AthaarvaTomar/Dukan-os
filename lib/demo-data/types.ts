export type CustomerSegment = "regular" | "inactive" | "new" | "high-value";
export type ProductCategory =
  | "Groceries"
  | "Beverages"
  | "Household"
  | "Personal care"
  | "Snacks"
  | "Stationery";
export type InventoryStatus = "normal" | "low" | "out";
export type PaymentMethod = "cash" | "upi" | "card";
export type TransactionStatus = "completed" | "processing";
export type ExpenseCategory =
  | "Rent"
  | "Utilities"
  | "Supplies"
  | "Transport"
  | "Marketing"
  | "Maintenance";
export type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "simulated";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  joinedAt: string;
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  unit: string;
  price: number;
  costPrice: number;
  stock: number;
  reorderLevel: number;
  supplierName?: string;
  lastUpdatedAt?: string;
}

export type StockOperation = "stock-in" | "stock-out" | "adjustment";

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  operation: StockOperation;
  quantityChanged: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdAt: string;
}

export interface SupplierOrderItem {
  productId: string;
  productName: string;
  currentStock: number;
  reorderQuantity: number;
  purchaseCost: number;
  estimatedAmount: number;
}

export interface SupplierOrderDraft {
  id: string;
  supplierName: string;
  status: "draft" | "approved";
  createdAt: string;
  approvedAt?: string;
  items: SupplierOrderItem[];
}

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  date: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
}

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  vendor: string;
  notes: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: "WhatsApp" | "Instagram" | "In-store" | "SMS";
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: number;
  audienceSize: number;
  sentCount: number;
  conversions: number;
  revenue: number;
}

export interface DemoData {
  asOf: string;
  customers: Customer[];
  products: Product[];
  transactions: Transaction[];
  expenses: Expense[];
  campaigns: MarketingCampaign[];
  inventoryMovements?: InventoryMovement[];
  supplierOrders?: SupplierOrderDraft[];
}

export interface CustomerSpending {
  customerId: string;
  customerName: string;
  transactionCount: number;
  totalSpent: number;
  averageOrderValue: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
}

export interface CustomerWithSegment extends Customer {
  segment: CustomerSegment;
  transactionCount: number;
  totalSpent: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
}

export interface BestSellingProduct {
  productId: string;
  productName: string;
  category: ProductCategory;
  quantitySold: number;
  revenue: number;
}

export interface InventorySummary {
  totalProducts: number;
  normal: number;
  low: number;
  out: number;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  transactions: number;
}

export type DashboardPeriod = "daily" | "weekly" | "monthly";

export interface DashboardTrendPoint {
  date: string;
  label: string;
  revenue: number;
  transactions: number;
  estimatedProfit: number;
  newCustomers: number;
}

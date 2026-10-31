import type {
  BestSellingProduct,
  Customer,
  CustomerSpending,
  CustomerWithSegment,
  DemoData,
  DailyRevenue,
  InventoryStatus,
  InventorySummary,
  Product,
  Transaction,
} from "./types.ts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function totalRevenue(transactions: readonly Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + transaction.totalAmount, 0);
}

export function totalTransactions(transactions: readonly Transaction[]): number {
  return transactions.length;
}

export function totalExpenses(expenses: DemoData["expenses"]): number {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function estimatedProfit(data: Pick<DemoData, "transactions" | "expenses">): number {
  const grossProfit = data.transactions.reduce(
    (sum, transaction) =>
      sum +
      transaction.items.reduce(
        (itemSum, item) => itemSum + (item.unitPrice - item.unitCost) * item.quantity,
        0,
      ) -
      transaction.discount,
    0,
  );
  return grossProfit - totalExpenses(data.expenses);
}

export function averageOrderValue(transactions: readonly Transaction[]): number {
  if (transactions.length === 0) return 0;
  return totalRevenue(transactions) / transactions.length;
}

export function bestSellingProducts(
  products: readonly Product[],
  transactions: readonly Transaction[],
  limit = 5,
): BestSellingProduct[] {
  const sales = new Map<string, { quantitySold: number; revenue: number }>();
  const productIds = new Set(products.map((product) => product.id));
  for (const transaction of transactions) {
    for (const item of transaction.items) {
      if (!productIds.has(item.productId)) {
        throw new Error(`Transaction ${transaction.id} references an unknown product.`);
      }
      const current = sales.get(item.productId) ?? { quantitySold: 0, revenue: 0 };
      current.quantitySold += item.quantity;
      current.revenue += item.unitPrice * item.quantity;
      sales.set(item.productId, current);
    }
  }

  return products
    .map((product) => {
      const productSales = sales.get(product.id) ?? { quantitySold: 0, revenue: 0 };
      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        ...productSales,
      };
    })
    .filter((product) => product.quantitySold > 0)
    .sort(
      (a, b) =>
        b.quantitySold - a.quantitySold ||
        b.revenue - a.revenue ||
        a.productName.localeCompare(b.productName),
    )
    .slice(0, Math.max(0, limit));
}

export function customerSpending(
  customers: readonly Customer[],
  transactions: readonly Transaction[],
): CustomerSpending[] {
  const spending = new Map<string, CustomerSpending>();
  for (const customer of customers) {
    spending.set(customer.id, {
      customerId: customer.id,
      customerName: customer.name,
      transactionCount: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
    });
  }

  for (const transaction of transactions) {
    const customer = spending.get(transaction.customerId);
    if (!customer) {
      throw new Error(`Transaction ${transaction.id} references an unknown customer.`);
    }
    customer.transactionCount += 1;
    customer.totalSpent += transaction.totalAmount;
    if (!customer.firstPurchaseAt || transaction.date < customer.firstPurchaseAt) {
      customer.firstPurchaseAt = transaction.date;
    }
    if (!customer.lastPurchaseAt || transaction.date > customer.lastPurchaseAt) {
      customer.lastPurchaseAt = transaction.date;
    }
  }

  for (const customer of spending.values()) {
    customer.averageOrderValue =
      customer.transactionCount > 0 ? customer.totalSpent / customer.transactionCount : 0;
  }

  return [...spending.values()].sort(
    (a, b) => b.totalSpent - a.totalSpent || a.customerName.localeCompare(b.customerName),
  );
}

export function getCustomerSegment(
  spending: CustomerSpending,
  asOf = new Date(),
): CustomerWithSegment["segment"] {
  if (spending.totalSpent >= 50_000) return "high-value";
  if (spending.transactionCount === 0) return "inactive";
  if (!spending.lastPurchaseAt) return "inactive";

  const lastPurchase = new Date(spending.lastPurchaseAt).getTime();
  const daysSincePurchase = Math.floor((startOfUtcDay(asOf) - startOfUtcDay(new Date(lastPurchase))) / DAY_IN_MS);

  if (daysSincePurchase >= 45) return "inactive";
  const firstPurchase = spending.firstPurchaseAt ? new Date(spending.firstPurchaseAt).getTime() : lastPurchase;
  const daysSinceFirstPurchase = Math.floor(
    (startOfUtcDay(asOf) - startOfUtcDay(new Date(firstPurchase))) / DAY_IN_MS,
  );
  if (spending.transactionCount <= 2 && daysSinceFirstPurchase <= 30 && daysSinceFirstPurchase >= 0) {
    return "new";
  }
  return "regular";
}

export function segmentCustomers(
  customers: readonly Customer[],
  transactions: readonly Transaction[],
  asOf = new Date(),
): CustomerWithSegment[] {
  const spending = customerSpending(customers, transactions);
  const byCustomerId = new Map(spending.map((customer) => [customer.customerId, customer]));

  return customers.map((customer) => {
    const customerTotals = byCustomerId.get(customer.id);
    if (!customerTotals) {
      return {
        ...customer,
        segment: "inactive",
        transactionCount: 0,
        totalSpent: 0,
        firstPurchaseAt: null,
        lastPurchaseAt: null,
      };
    }
    return {
      ...customer,
      segment: getCustomerSegment(customerTotals, asOf),
      transactionCount: customerTotals.transactionCount,
      totalSpent: customerTotals.totalSpent,
      firstPurchaseAt: customerTotals.firstPurchaseAt,
      lastPurchaseAt: customerTotals.lastPurchaseAt,
    };
  });
}

export function inventoryStatus(product: Pick<Product, "stock" | "reorderLevel">): InventoryStatus {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.reorderLevel) return "low";
  return "normal";
}

export function inventorySummary(products: readonly Product[]): InventorySummary {
  const summary: InventorySummary = {
    totalProducts: products.length,
    normal: 0,
    low: 0,
    out: 0,
  };
  for (const product of products) {
    summary[inventoryStatus(product)] += 1;
  }
  return summary;
}

export function dailyRevenue(
  transactions: readonly Transaction[],
  days = 30,
  asOf = new Date(),
): DailyRevenue[] {
  const safeDays = Math.max(0, Math.floor(days));
  const today = startOfUtcDay(asOf);
  const start = today - Math.max(0, safeDays - 1) * DAY_IN_MS;
  const totals = new Map<string, DailyRevenue>();

  for (let day = 0; day < safeDays; day += 1) {
    const date = new Date(start + day * DAY_IN_MS).toISOString().slice(0, 10);
    totals.set(date, { date, revenue: 0, transactions: 0 });
  }

  for (const transaction of transactions) {
    const date = transaction.date.slice(0, 10);
    const daily = totals.get(date);
    if (!daily) continue;
    daily.revenue += transaction.totalAmount;
    daily.transactions += 1;
  }

  return [...totals.values()];
}

export function transactionCountForCustomer(
  customerId: string,
  transactions: readonly Transaction[],
): number {
  return transactions.filter((transaction) => transaction.customerId === customerId).length;
}

import {
  averageOrderValue,
  customerSpending,
  dailyRevenue,
  estimatedProfit,
  inventorySummary,
  bestSellingProducts,
  totalExpenses,
  totalRevenue,
  totalTransactions,
} from "@/lib/demo-data/analytics";
import type { DemoData } from "@/lib/demo-data/types";
import { inventoryMetrics } from "@/lib/demo-data/inventory";

export function getTodaySales(data: DemoData) {
  const today = dailyRevenue(data.transactions, 1, new Date(data.asOf))[0];
  return {
    date: today?.date ?? data.asOf.slice(0, 10),
    revenue: today?.revenue ?? 0,
    transactionCount: today?.transactions ?? 0,
  };
}

export function getRevenueAndProfit(data: DemoData) {
  return {
    revenue: totalRevenue(data.transactions),
    estimatedProfit: estimatedProfit(data),
    expenses: totalExpenses(data.expenses),
  };
}

export function getLowStockProducts(data: DemoData) {
  const { lowStock, recommendations } = inventoryMetrics(data);
  return {
    summary: inventorySummary(data.products),
    totalUnits: data.products.reduce((sum, product) => sum + product.stock, 0),
    products: lowStock,
    recommendations,
  };
}

export function getInactiveCustomers(data: DemoData, days = 30) {
  const cutoff = new Date(data.asOf).getTime() - days * 24 * 60 * 60 * 1000;
  const spending = customerSpending(data.customers, data.transactions);
  const customers = spending
    .filter(
      (customer) =>
        !customer.lastPurchaseAt || new Date(customer.lastPurchaseAt).getTime() <= cutoff,
    )
    .map(({ customerId, customerName, transactionCount, totalSpent, lastPurchaseAt }) => ({
      customerId,
      name: customerName,
      transactionCount,
      totalSpent,
      lastPurchaseAt,
    }));

  return { days, count: customers.length, customers };
}

export function getBusinessInsights(data: DemoData) {
  return {
    revenue: totalRevenue(data.transactions),
    estimatedProfit: estimatedProfit(data),
    transactionCount: totalTransactions(data.transactions),
    averageOrderValue: averageOrderValue(data.transactions),
    inventory: inventorySummary(data.products),
    inactiveCustomers30Days: getInactiveCustomers(data).count,
    topProducts: bestSellingProducts(data.products, data.transactions, 3),
  };
}

export function getCustomerHistory(data: DemoData, customerId: string) {
  const customer = data.customers.find((entry) => entry.id === customerId);
  if (!customer) return null;

  const spending = customerSpending(data.customers, data.transactions).find(
    (entry) => entry.customerId === customerId,
  );
  const transactions = data.transactions
    .filter((transaction) => transaction.customerId === customerId)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 10)
    .map(({ id, date, totalAmount, items }) => ({
      id,
      date,
      totalAmount,
      items: items.map(({ productName, quantity }) => ({ productName, quantity })),
    }));

  return {
    customerId: customer.id,
    name: customer.name,
    transactionCount: spending?.transactionCount ?? 0,
    totalSpent: spending?.totalSpent ?? 0,
    lastPurchaseAt: spending?.lastPurchaseAt ?? null,
    transactions,
  };
}

import { inventoryStatus } from "./analytics";
import type { DemoData, Product, Transaction } from "./types";

const DEMAND_WINDOW_DAYS = 30;
const TARGET_COVERAGE_DAYS = 14;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface InventoryRecommendation {
  id: string;
  name: string;
  productId: string;
  productName: string;
  category: Product["category"];
  stock: number;
  minimumStock: number;
  reorderLevel: number;
  shortage: number;
  status: ReturnType<typeof inventoryStatus>;
  quantitySoldInWindow: number;
  averageDailySales: number;
  suggestedReorderQuantity: number;
  supplierName: string | null;
  purchaseCost: number;
}

export function inventoryRecommendations(
  products: readonly Product[],
  transactions: readonly Transaction[],
  asOf: Date,
): InventoryRecommendation[] {
  const end = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) + DAY_IN_MS;
  const start = end - DEMAND_WINDOW_DAYS * DAY_IN_MS;
  const soldByProduct = new Map<string, number>();

  for (const transaction of transactions) {
    const time = Date.parse(transaction.date);
    if (transaction.status !== "completed" || time < start || time >= end) continue;
    for (const item of transaction.items) {
      soldByProduct.set(
        item.productId,
        (soldByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
  }

  return products.map((product) => {
    const quantitySoldInWindow = soldByProduct.get(product.id) ?? 0;
    const averageDailySales = quantitySoldInWindow / DEMAND_WINDOW_DAYS;
    const shortage = Math.max(0, product.reorderLevel - product.stock);
    const demandTarget = Math.ceil(averageDailySales * TARGET_COVERAGE_DAYS);

    return {
      id: product.id,
      name: product.name,
      productId: product.id,
      productName: product.name,
      category: product.category,
      stock: product.stock,
      minimumStock: product.reorderLevel,
      reorderLevel: product.reorderLevel,
      shortage,
      status: inventoryStatus(product),
      quantitySoldInWindow,
      averageDailySales,
      suggestedReorderQuantity:
        inventoryStatus(product) === "normal"
          ? 0
          : Math.max(shortage, demandTarget - product.stock, 0),
      supplierName: product.supplierName?.trim() || null,
      purchaseCost: product.costPrice,
    };
  });
}

export function inventoryMetrics(data: Pick<DemoData, "products" | "transactions" | "asOf">) {
  const recommendations = inventoryRecommendations(
    data.products,
    data.transactions,
    new Date(data.asOf),
  );
  const lowStock = recommendations.filter((product) => product.status !== "normal");
  return {
    totalUnits: data.products.reduce((sum, product) => sum + product.stock, 0),
    lowStock,
    recommendations,
  };
}

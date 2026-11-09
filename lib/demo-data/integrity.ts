import type { DemoData } from "./types.ts";

export function assertDemoDataIntegrity(data: DemoData): void {
  if (!Number.isFinite(Date.parse(data.asOf))) {
    throw new Error("Demo data has an invalid reference date.");
  }

  const customerIds = new Set(data.customers.map((customer) => customer.id));
  const productIds = new Set(data.products.map((product) => product.id));
  const entityCollections: [string, string[]][] = [
    ["customer", data.customers.map((customer) => customer.id)],
    ["product", data.products.map((product) => product.id)],
    ["transaction", data.transactions.map((transaction) => transaction.id)],
    ["expense", data.expenses.map((expense) => expense.id)],
    ["campaign", data.campaigns.map((campaign) => campaign.id)],
    ["inventory movement", (data.inventoryMovements ?? []).map((movement) => movement.id)],
    ["supplier order", (data.supplierOrders ?? []).map((order) => order.id)],
  ];

  for (const [entity, ids] of entityCollections) {
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Demo data contains duplicate ${entity} IDs.`);
    }
  }

  for (const product of data.products) {
    if (
      !product.name.trim() ||
      !product.sku.trim() ||
      !Number.isFinite(product.price) ||
      product.price < 0 ||
      !Number.isFinite(product.costPrice) ||
      product.costPrice < 0 ||
      !Number.isInteger(product.stock) ||
      product.stock < 0 ||
      !Number.isInteger(product.reorderLevel) ||
      product.reorderLevel < 0 ||
      (product.lastUpdatedAt !== undefined && !Number.isFinite(Date.parse(product.lastUpdatedAt)))
    ) {
      throw new Error(`Product ${product.id} has invalid inventory details.`);
    }
  }

  for (const movement of data.inventoryMovements ?? []) {
    if (
      !movement.productId ||
      !movement.productName.trim() ||
      !movement.reason.trim() ||
      !Number.isFinite(Date.parse(movement.createdAt)) ||
      !Number.isInteger(movement.quantityChanged) ||
      movement.quantityChanged !== movement.newStock - movement.previousStock ||
      !Number.isInteger(movement.previousStock) ||
      !Number.isInteger(movement.newStock) ||
      movement.previousStock < 0 ||
      movement.newStock < 0 ||
      (movement.operation === "stock-in" && movement.newStock <= movement.previousStock) ||
      (movement.operation === "stock-out" && movement.newStock >= movement.previousStock) ||
      (movement.operation === "adjustment" && movement.newStock === movement.previousStock)
    ) {
      throw new Error(`Inventory movement ${movement.id} is invalid.`);
    }
  }

  for (const order of data.supplierOrders ?? []) {
    if (
      !order.supplierName.trim() ||
      !Number.isFinite(Date.parse(order.createdAt)) ||
      (order.approvedAt !== undefined && !Number.isFinite(Date.parse(order.approvedAt))) ||
      order.items.some(
        (item) =>
          !item.productName.trim() ||
          !Number.isInteger(item.currentStock) ||
          item.currentStock < 0 ||
          !Number.isInteger(item.reorderQuantity) ||
          item.reorderQuantity < 1 ||
          !Number.isFinite(item.purchaseCost) ||
          item.purchaseCost < 0 ||
          !Number.isFinite(item.estimatedAmount) ||
          item.estimatedAmount < 0,
      )
    ) {
      throw new Error(`Supplier order ${order.id} is invalid.`);
    }
  }

  for (const transaction of data.transactions) {
    if (!customerIds.has(transaction.customerId)) {
      throw new Error(`Transaction ${transaction.id} references an unknown customer.`);
    }
    if (!Number.isFinite(Date.parse(transaction.date))) {
      throw new Error(`Transaction ${transaction.id} has an invalid date.`);
    }
    for (const item of transaction.items) {
      if (!productIds.has(item.productId)) {
        throw new Error(`Transaction ${transaction.id} references an unknown product.`);
      }
    }
  }

  for (const campaign of data.campaigns) {
    const startDate = Date.parse(campaign.startDate);
    const endDate = Date.parse(campaign.endDate);
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || startDate > endDate) {
      throw new Error(`Campaign ${campaign.id} has invalid dates or ends before it starts.`);
    }
  }
}

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
  ];

  for (const [entity, ids] of entityCollections) {
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Demo data contains duplicate ${entity} IDs.`);
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

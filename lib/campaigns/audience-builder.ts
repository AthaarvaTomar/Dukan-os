import { segmentCustomers } from "../demo-data/analytics";
import type { DemoData } from "../demo-data/types";
import type { AudienceCustomer } from "./winback";

/**
 * Builds Winback `AudienceCustomer[]` from DukaanOS store data (customers,
 * transactions, products) plus each customer's most recent demo_executed campaign timestamp.
 */
export function buildAudienceCustomers(
  data: DemoData,
  lastCampaignByCustomerId: ReadonlyMap<string, string> = new Map(),
): AudienceCustomer[] {
  const asOf = new Date(data.asOf);
  const segmented = segmentCustomers(data.customers, data.transactions, asOf);
  const productsById = new Map(data.products.map((product) => [product.id, product]));

  const latestTxnByCustomer = new Map<string, (typeof data.transactions)[number]>();
  for (const txn of data.transactions) {
    if (!txn.customerId) continue;
    const prev = latestTxnByCustomer.get(txn.customerId);
    if (!prev || txn.date > prev.date) {
      latestTxnByCustomer.set(txn.customerId, txn);
    }
  }

  return segmented.map((customer) => {
    const lastTxn = latestTxnByCustomer.get(customer.id);
    const productCategory = lastTxn
      ? [
          ...new Set(
            lastTxn.items
              .map((item) => productsById.get(item.productId)?.category)
              .filter((category): category is NonNullable<typeof category> => Boolean(category)),
          ),
        ].join(" and ") || null
      : null;
    const previousPurchase = lastTxn
      ? [...new Set(lastTxn.items.map((item) => item.productName))].join(", ")
      : null;

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? "",
      segment: customer.segment,
      marketingConsent: customer.marketingConsent ?? "unknown",
      optedOutAt: customer.optedOutAt ?? null,
      lastCampaignAt: lastCampaignByCustomerId.get(customer.id) ?? null,
      lastPurchaseAt: customer.lastPurchaseAt,
      previousPurchase,
      productCategory,
    };
  });
}

export function extractDiscountPercent(offerText: string, fallback = 15): number {
  const match = offerText.match(/(\d+)\s*%/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : fallback;
}

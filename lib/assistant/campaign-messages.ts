import { customerSpending, getCustomerSegment } from "@/lib/demo-data/analytics";
import type { DemoData } from "@/lib/demo-data/types";
import type {
  PersonalizedCampaignMessage,
  VoiceCampaignDraft,
} from "@/lib/demo-data/server-store";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysSince(isoDate: string, asOf: string): number {
  const purchaseDay = new Date(isoDate);
  const currentDay = new Date(asOf);
  const purchaseUtc = Date.UTC(
    purchaseDay.getUTCFullYear(),
    purchaseDay.getUTCMonth(),
    purchaseDay.getUTCDate(),
  );
  const currentUtc = Date.UTC(
    currentDay.getUTCFullYear(),
    currentDay.getUTCMonth(),
    currentDay.getUTCDate(),
  );
  return Math.max(0, Math.floor((currentUtc - purchaseUtc) / DAY_IN_MS));
}

function dateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

export function createPersonalizedMessage(
  data: DemoData,
  customerId: string,
  discountPercent: number,
  alternate = false,
  shopName = "our store",
): PersonalizedCampaignMessage | null {
  const customer = data.customers.find((entry) => entry.id === customerId);
  if (!customer) return null;

  const customerTransactions = data.transactions
    .filter((entry) => entry.customerId === customerId)
    .sort((left, right) => right.date.localeCompare(left.date));
  const lastTransaction = customerTransactions[0];
  const spending = customerSpending(data.customers, data.transactions).find(
    (entry) => entry.customerId === customerId,
  );
  const customerSegment = spending
    ? getCustomerSegment(spending, new Date(data.asOf))
    : "inactive";
  const lastPurchaseAt = lastTransaction?.date ?? null;
  const productCategory = lastTransaction
    ? [
        ...new Set(
          lastTransaction.items.map(
            (item) =>
              data.products.find((product) => product.id === item.productId)?.category,
          ),
        ),
      ]
        .filter((category): category is NonNullable<typeof category> => Boolean(category))
        .join(" and ") || null
    : null;
  const previousPurchase = lastTransaction
    ? [...new Set(lastTransaction.items.map((item) => item.productName))].join(", ")
    : null;
  const offer = `${discountPercent}% OFF`;
  const categoryOffer = productCategory
    ? `your next ${productCategory.toLocaleLowerCase("en-IN")} purchase`
    : "your next purchase";
  const segmentReference = `As a customer in our ${customerSegment} segment,`;
  const message = lastPurchaseAt
    ? alternate
      ? `Hi ${customer.name}! You last shopped with us on ${dateLabel(lastPurchaseAt)}. ${segmentReference} enjoy ${offer} on ${categoryOffer}. We'd love to see you again!`
      : `Hi ${customer.name}! We last saw you on ${dateLabel(lastPurchaseAt)}. ${segmentReference} enjoy ${offer} on ${categoryOffer}. We'd love to see you again!`
    : alternate
      ? `Hi ${customer.name}! We'd love to welcome you to ${shopName}. ${segmentReference} enjoy ${offer} on ${categoryOffer}. We hope to see you soon!`
      : `Hi ${customer.name}! We'd love to welcome you to ${shopName}. ${segmentReference} enjoy ${offer} on ${categoryOffer}. See you soon!`;

  return {
    customerId,
    customerName: customer.name,
    previousPurchase,
    productCategory,
    lastPurchaseAt,
    customerSegment,
    discountPercent,
    message,
    status: "draft",
    result: null,
  };
}

export function lastPurchaseAgeDays(lastPurchaseAt: string | null, asOf: string): number | null {
  return lastPurchaseAt ? daysSince(lastPurchaseAt, asOf) : null;
}

export function createPersonalizedCampaign(
  data: DemoData,
  discountPercent = 15,
  shopName = "our store",
): VoiceCampaignDraft {
  const eligible = data.customers.filter((customer) => {
    const lastPurchaseAt = data.transactions
      .filter((transaction) => transaction.customerId === customer.id)
      .reduce<string | null>(
        (latest, transaction) =>
          latest === null || transaction.date > latest ? transaction.date : latest,
        null,
      );
    const ageDays = lastPurchaseAgeDays(lastPurchaseAt, data.asOf);
    return ageDays === null || ageDays >= 30;
  });
  const messages = eligible.flatMap((customer) => {
    const message = createPersonalizedMessage(data, customer.id, discountPercent, false, shopName);
    return message ? [message] : [];
  });
  const now = new Date().toISOString();
  const campaignId = `cmp-voice-${crypto.randomUUID()}`;

  return {
    id: crypto.randomUUID(),
    campaign: {
      id: campaignId,
      name: `${discountPercent}% offer for inactive customers`,
      channel: "WhatsApp",
      status: "draft",
      startDate: now,
      endDate: now,
      budget: 0,
      audienceSize: messages.length,
      sentCount: 0,
      conversions: 0,
      revenue: 0,
    },
    message: `${messages.length} personalized ${discountPercent}% discount messages are ready for merchant review.`,
    eligibleCustomerIds: messages.map((entry) => entry.customerId),
    createdAt: now,
    discountPercent,
    messages,
  };
}

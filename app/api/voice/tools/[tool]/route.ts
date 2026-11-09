import { z } from "zod";
import { bestSellingProducts } from "@/lib/demo-data/analytics";
import { assertDemoDataIntegrity } from "@/lib/demo-data/integrity";
import {
  createPersonalizedCampaign,
  createPersonalizedMessage,
} from "@/lib/assistant/campaign-messages";
import {
  getCampaignHistory,
  getServerDemoData,
  getPendingVoiceCampaign,
  savePendingVoiceCampaign,
} from "@/lib/demo-data/server-store";
import { fetchBusinessData } from "@/lib/db/queries";
import {
  createDraftDb,
  getCampaignHistoryDb,
  getPendingDraftDb,
  resolveServerBusiness,
} from "@/lib/db/voice-campaigns";
import {
  getBusinessInsights,
  getCustomerHistory,
  getInactiveCustomers,
  getLowStockProducts,
  getRevenueAndProfit,
  getTodaySales,
} from "@/lib/assistant/voice-tools";

const campaignDraftSchema = z.object({
  id: z.string(),
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    channel: z.literal("WhatsApp"),
    status: z.literal("draft"),
    startDate: z.string(),
    endDate: z.string(),
    budget: z.number(),
    audienceSize: z.number(),
    sentCount: z.number(),
    conversions: z.number(),
    revenue: z.number(),
  }),
  message: z.string(),
  eligibleCustomerIds: z.array(z.string()),
  createdAt: z.string(),
  discountPercent: z.number().int().min(1).max(100),
  messages: z.array(z.object({
    customerId: z.string(),
    customerName: z.string(),
    previousPurchase: z.string().nullable(),
    productCategory: z.string().nullable(),
    lastPurchaseAt: z.string().nullable(),
    customerSegment: z.string(),
    discountPercent: z.number(),
    message: z.string(),
    status: z.enum(["draft", "simulated", "failed"]),
    result: z.string().nullable(),
  })),
});

function authorized(request: Request): boolean {
  const expected = process.env.SARVAM_TOOL_API_TOKEN?.trim();
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  if (!process.env.SARVAM_TOOL_API_TOKEN?.trim()) {
    return Response.json({ error: "Sarvam business tools are not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { tool } = await context.params;
  const business = await resolveServerBusiness();
  const data = business
    ? await fetchBusinessData(business.db, business.businessId)
    : getServerDemoData();
  assertDemoDataIntegrity(data);
  const url = new URL(request.url);

  switch (tool) {
    case "sales-today":
      return Response.json(getTodaySales(data));
    case "revenue-profit":
      return Response.json(getRevenueAndProfit(data));
    case "top-products": {
      const limit = z.coerce.number().int().min(1).max(10).catch(5).parse(url.searchParams.get("limit"));
      return Response.json({
        products: bestSellingProducts(data.products, data.transactions, limit),
      });
    }
    case "inventory-low":
      return Response.json(getLowStockProducts(data));
    case "inactive-customers": {
      const inactive = getInactiveCustomers(data);
      return Response.json({
        ...inactive,
        customers: inactive.customers.map((customer) => ({
          ...customer,
          ...createPersonalizedMessage(data, customer.customerId, 15),
        })),
      });
    }
    case "customer-history": {
      const customerId = url.searchParams.get("customer_id");
      const name = url.searchParams.get("name")?.trim();
      if (!customerId && !name) {
        return Response.json({ error: "Provide a customer_id or name query parameter." }, { status: 400 });
      }
      const customer = customerId
        ? data.customers.find((entry) => entry.id === customerId)
        : data.customers.find((entry) => entry.name.toLocaleLowerCase("en-IN") === name?.toLocaleLowerCase("en-IN"));
      if (!customer) return Response.json({ error: "Customer not found." }, { status: 404 });
      const history = getCustomerHistory(data, customer.id);
      if (!history) return Response.json({ error: "Customer history is unavailable." }, { status: 404 });
      return Response.json(history);
    }
    case "business-insights":
      return Response.json(getBusinessInsights(data));
    case "campaign-history": {
      const executions = business
        ? await getCampaignHistoryDb(business.db, business.businessId)
        : getCampaignHistory();
      return Response.json({
        campaigns: data.campaigns.map((campaign) => {
          const execution = executions.find(
            (record) => record.campaignId === campaign.id,
          );
          return {
            id: campaign.id,
            name: campaign.name,
            channel: campaign.channel,
            status: campaign.status,
            audienceSize: campaign.audienceSize,
            successfulCount: execution?.successfulCount ?? null,
            failedCount: execution?.failedCount ?? null,
            messages: execution?.messages ?? [],
          };
        }),
      });
    }
    case "campaign-pending": {
      const draft = business
        ? await getPendingDraftDb(business.db, business.businessId)
        : getPendingVoiceCampaign();
      return Response.json({
        pending: draft
          ? {
              id: draft.id,
              campaign: draft.campaign,
              message: draft.message,
              eligibleCustomerCount: draft.eligibleCustomerIds.length,
              createdAt: draft.createdAt,
              messages: draft.messages,
            }
          : null,
      });
    }
    default:
      return Response.json({ error: "Unknown business tool." }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  if (!process.env.SARVAM_TOOL_API_TOKEN?.trim()) {
    return Response.json({ error: "Sarvam business tools are not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { tool } = await context.params;
  if (tool !== "campaign-draft") {
    return Response.json({ error: "Unknown business tool." }, { status: 404 });
  }

  const business = await resolveServerBusiness();
  let draft;
  if (business) {
    const pending = await getPendingDraftDb(business.db, business.businessId);
    draft = pending ?? (await createDraftDb(business.db, business.businessId, 15));
  } else {
    const pending = getPendingVoiceCampaign();
    draft = pending ?? createPersonalizedCampaign(getServerDemoData());
    if (!pending) savePendingVoiceCampaign(draft);
  }

  const parsed = campaignDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return Response.json({ error: "Campaign draft data is invalid." }, { status: 500 });
  }
  return Response.json({
    id: parsed.data.id,
    campaign: parsed.data.campaign,
    message: parsed.data.message,
    eligibleCustomerCount: parsed.data.eligibleCustomerIds.length,
    messages: parsed.data.messages,
    requiresMerchantApproval: true,
    simulatedOnly: true,
  });
}

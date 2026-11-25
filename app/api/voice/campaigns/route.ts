import { z } from "zod";
import {
  createWinbackDraftInStore,
  getCampaignHistory,
  getPendingVoiceCampaign,
  getServerDemoData,
} from "@/lib/demo-data/server-store";
import {
  createDraftDb,
  getCampaignHistoryDb,
  getPendingDraftDb,
  resolveServerBusiness,
} from "@/lib/db/voice-campaigns";

const createCampaignSchema = z.object({
  name: z.string().trim().max(200).optional(),
  targetSegment: z.enum(["all", "inactive", "regular", "new", "high-value"]).optional(),
  offerText: z.string().trim().min(1).max(200).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  cooldownDays: z.number().int().min(0).max(365).optional(),
  messageCap: z.number().int().min(1).max(5000).optional(),
  templateText: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith("/api/voice/campaigns")) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const business = await resolveServerBusiness();
  if (business) {
    const [draft, executions] = await Promise.all([
      getPendingDraftDb(business.db, business.businessId),
      getCampaignHistoryDb(business.db, business.businessId),
    ]);
    return Response.json(
      {
        pending: draft
          ? {
              ...draft,
              eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
            }
          : null,
        campaigns: executions.map((record) => ({
          ...record.campaign,
          executionMode: record.executionMode ?? "demo",
          version: record.version ?? record.campaign.version ?? 1,
          approvedVersion: record.approvedVersion ?? record.campaign.approvedVersion ?? null,
          offerText: record.offerText ?? record.campaign.offerText ?? "",
          targetSegment: record.targetSegment ?? record.campaign.targetSegment ?? "inactive",
          executedAt: record.executedAt,
          successfulCount: record.successfulCount,
          failedCount: record.failedCount,
          skippedCount: record.skippedCount ?? 0,
          messages: record.messages,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const draft = getPendingVoiceCampaign();
  const history = getCampaignHistory();
  const historyById = new Map(history.map((record) => [record.campaignId, record]));
  const campaigns = getServerDemoData().campaigns.map((campaign) => {
    const execution = historyById.get(campaign.id);
    return {
      ...campaign,
      executionMode: execution?.executionMode ?? campaign.executionMode ?? "demo",
      version: execution?.version ?? campaign.version ?? 1,
      approvedVersion: execution?.approvedVersion ?? campaign.approvedVersion ?? null,
      offerText: execution?.offerText ?? campaign.offerText ?? "",
      targetSegment: execution?.targetSegment ?? campaign.targetSegment ?? "inactive",
      executedAt: execution?.executedAt ?? campaign.startDate,
      successfulCount: execution?.successfulCount ?? null,
      failedCount: execution?.failedCount ?? null,
      skippedCount: execution?.skippedCount ?? 0,
      messages: execution?.messages ?? [],
    };
  });

  return Response.json(
    {
      pending: draft
        ? {
            ...draft,
            eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
          }
        : null,
      campaigns,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }

  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Check campaign inputs: segment, offer text, cooldown days, and message cap must be valid." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const business = await resolveServerBusiness();
  if (business) {
    const pending = await getPendingDraftDb(business.db, business.businessId);
    if (pending) {
      return Response.json(
        { error: "Review, approve, or cancel the active campaign draft before creating another." },
        { status: 409 },
      );
    }
    const draft = await createDraftDb(business.db, business.businessId, input);
    return Response.json(
      {
        pending: {
          ...draft,
          eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
        },
      },
      { status: 201 },
    );
  }

  if (getPendingVoiceCampaign()) {
    return Response.json(
      { error: "Review, approve, or cancel the active campaign draft before creating another." },
      { status: 409 },
    );
  }

  const draft = createWinbackDraftInStore(input);
  return Response.json(
    {
      pending: {
        ...draft,
        eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
      },
    },
    { status: 201 },
  );
}

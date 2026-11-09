import { createPersonalizedCampaign } from "@/lib/assistant/campaign-messages";
import {
  getCampaignHistory,
  getPendingVoiceCampaign,
  getServerDemoData,
  savePendingVoiceCampaign,
} from "@/lib/demo-data/server-store";
import { fetchBusinessData } from "@/lib/db/queries";
import {
  createDraftDb,
  getCampaignHistoryDb,
  getPendingDraftDb,
  resolveServerBusiness,
} from "@/lib/db/voice-campaigns";

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith("/api/voice/campaigns")) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const business = await resolveServerBusiness();
  if (business) {
    const [draft, data, executions] = await Promise.all([
      getPendingDraftDb(business.db, business.businessId),
      fetchBusinessData(business.db, business.businessId),
      getCampaignHistoryDb(business.db, business.businessId),
    ]);
    return Response.json({
      pending: draft
        ? {
            id: draft.id,
            campaign: draft.campaign,
            message: draft.message,
            eligibleCustomerCount: draft.eligibleCustomerIds.length,
            createdAt: draft.createdAt,
            discountPercent: draft.discountPercent,
            messages: draft.messages,
          }
        : null,
      campaigns: data.campaigns.map((campaign) => {
        const execution = executions.find((record) => record.campaignId === campaign.id);
        return {
          ...campaign,
          successfulCount: execution?.successfulCount ?? null,
          failedCount: execution?.failedCount ?? null,
          messages: execution?.messages ?? [],
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const draft = getPendingVoiceCampaign();
  const campaigns = getServerDemoData().campaigns.map((campaign) => {
    const execution = getCampaignHistory().find((record) => record.campaignId === campaign.id);
    return {
      ...campaign,
      successfulCount: execution?.successfulCount ?? null,
      failedCount: execution?.failedCount ?? null,
      messages: execution?.messages ?? [],
    };
  });
  return Response.json({
    pending: draft
      ? {
          id: draft.id,
          campaign: draft.campaign,
          message: draft.message,
          eligibleCustomerCount: draft.eligibleCustomerIds.length,
          createdAt: draft.createdAt,
          discountPercent: draft.discountPercent,
          messages: draft.messages,
        }
      : null,
    campaigns,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }
  const discountPercent =
    typeof body === "object" && body !== null && "discountPercent" in body
      ? body.discountPercent
      : 15;
  if (
    typeof discountPercent !== "number" ||
    !Number.isInteger(discountPercent) ||
    discountPercent < 1 ||
    discountPercent > 100
  ) {
    return Response.json({ error: "Discount must be a whole number between 1 and 100." }, { status: 400 });
  }

  const business = await resolveServerBusiness();
  if (business) {
    const pending = await getPendingDraftDb(business.db, business.businessId);
    if (pending) {
      return Response.json(
        { error: "Review or discard the current campaign draft before creating another." },
        { status: 409 },
      );
    }
    const draft = await createDraftDb(business.db, business.businessId, discountPercent);
    return Response.json({
      pending: {
        ...draft,
        eligibleCustomerCount: draft.messages.length,
      },
    }, { status: 201 });
  }

  if (getPendingVoiceCampaign()) {
    return Response.json(
      { error: "Review or discard the current campaign draft before creating another." },
      { status: 409 },
    );
  }
  const draft = createPersonalizedCampaign(getServerDemoData(), discountPercent);
  savePendingVoiceCampaign(draft);
  return Response.json({
    pending: {
      ...draft,
      eligibleCustomerCount: draft.messages.length,
    },
  }, { status: 201 });
}

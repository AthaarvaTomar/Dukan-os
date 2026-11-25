import { buildAudienceCustomers } from "@/lib/campaigns/audience-builder";
import {
  DEFAULT_WINBACK_TEMPLATES,
  personalize,
} from "@/lib/campaigns/winback";
import {
  getPendingVoiceCampaign,
  getServerDemoData,
  updatePendingCampaignMessage,
} from "@/lib/demo-data/server-store";
import {
  attemptValidatedAiRewrite,
  getPendingDraftDb,
  regenerateDraftMessageDb,
  resolveServerBusiness,
} from "@/lib/db/voice-campaigns";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; customerId: string }> },
) {
  let useAiRewrite = false;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { useAiRewrite?: unknown };
      useAiRewrite = body.useAiRewrite === true;
    }
  } catch {
    // Ignore optional body parse errors
  }

  const { id, customerId } = await context.params;
  const business = await resolveServerBusiness();
  if (business) {
    const draft = await getPendingDraftDb(business.db, business.businessId);
    if (!draft || draft.id !== id) {
      return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
    }
    const current = draft.messages.find((entry) => entry.customerId === customerId);
    if (!current) {
      return Response.json({ error: "Customer message was not found." }, { status: 404 });
    }
    const regenerated = await regenerateDraftMessageDb(
      business.db,
      business.businessId,
      id,
      customerId,
      { useAiRewrite },
    );
    if (!regenerated) {
      return Response.json({ error: "Customer is no longer available." }, { status: 404 });
    }
    return Response.json({
      ...regenerated.message,
      version: regenerated.version,
      approvedVersion: regenerated.approvedVersion,
      campaignStatus: regenerated.status,
      usedAi: regenerated.usedAi,
      rejectedReasons: regenerated.rejectedReasons,
    });
  }

  const draft = getPendingVoiceCampaign();
  if (!draft || draft.id !== id) {
    return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
  }
  const current = draft.messages.find((entry) => entry.customerId === customerId);
  if (!current) {
    return Response.json({ error: "Customer message was not found." }, { status: 404 });
  }

  const data = getServerDemoData();
  const customers = buildAudienceCustomers(data);
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    return Response.json({ error: "Customer is no longer available." }, { status: 404 });
  }

  const offerText = draft.offerText ?? `${draft.discountPercent}% off your next order`;
  const templatePool = draft.templateText?.trim()
    ? [draft.templateText.trim(), ...DEFAULT_WINBACK_TEMPLATES]
    : DEFAULT_WINBACK_TEMPLATES;
  const nextOffset = (draft.variantOffsets?.[customerId] ?? 0) + 1;
  let candidate = personalize(customer, templatePool, {
    offerText,
    variantOffset: nextOffset,
  });
  if (candidate === current.message) {
    candidate = personalize(customer, templatePool, {
      offerText,
      variantOffset: nextOffset + 1,
    });
  }

  let usedAi = false;
  let rejectedReasons: string[] = [];
  if (useAiRewrite) {
    const rewritten = await attemptValidatedAiRewrite(candidate, offerText, customer.name);
    candidate = rewritten.text;
    usedAi = rewritten.usedAi;
    rejectedReasons = rewritten.rejectedReasons;
  }

  if (!draft.variantOffsets) draft.variantOffsets = {};
  draft.variantOffsets[customerId] = nextOffset;

  const updated = updatePendingCampaignMessage(id, customerId, candidate);
  if (!updated) {
    return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
  }

  const refreshed = updated.messages.find((entry) => entry.customerId === customerId)!;
  return Response.json({
    ...refreshed,
    version: updated.version,
    approvedVersion: updated.approvedVersion,
    campaignStatus: updated.status,
    usedAi,
    rejectedReasons,
  });
}

import { createPersonalizedMessage } from "@/lib/assistant/campaign-messages";
import {
  getPendingVoiceCampaign,
  getServerDemoData,
  updatePendingCampaignMessage,
} from "@/lib/demo-data/server-store";
import {
  getPendingDraftDb,
  regenerateDraftMessageDb,
  resolveServerBusiness,
} from "@/lib/db/voice-campaigns";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; customerId: string }> },
) {
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
    );
    if (!regenerated) {
      return Response.json({ error: "Customer is no longer available." }, { status: 404 });
    }
    return Response.json(regenerated);
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
  const original = createPersonalizedMessage(data, customerId, draft.discountPercent);
  const regenerated = createPersonalizedMessage(
    data,
    customerId,
    draft.discountPercent,
    current.message === original?.message,
  );
  if (!regenerated) {
    return Response.json({ error: "Customer is no longer available." }, { status: 404 });
  }
  const updated = updatePendingCampaignMessage(id, customerId, regenerated.message);
  if (!updated) {
    return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
  }
  return Response.json(regenerated);
}

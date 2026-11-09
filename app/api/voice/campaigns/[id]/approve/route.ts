import { recordCampaignExecution } from "@/lib/demo-data/server-store";
import { approveDraftDb, resolveServerBusiness } from "@/lib/db/voice-campaigns";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const business = await resolveServerBusiness();
  if (business) {
    const result = await approveDraftDb(business.db, business.businessId, id);
    if (!result) {
      return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
    }
    return Response.json({
      campaign: result.campaign,
      successfulCount: result.successfulCount,
      failedCount: result.failedCount,
      simulated: true,
      message: "Campaign recorded as simulated. No messages were sent.",
    });
  }

  const result = recordCampaignExecution(id);
  if (!result) {
    return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
  }
  if (result.duplicate) {
    return Response.json({ error: "This campaign was already simulated." }, { status: 409 });
  }
  return Response.json({
    campaign: result.execution.campaign,
    successfulCount: result.execution.successfulCount,
    failedCount: result.execution.failedCount,
    simulated: true,
    message: "Campaign recorded as simulated. No messages were sent.",
  });
}

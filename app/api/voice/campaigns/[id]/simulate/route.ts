import { simulatePendingCampaignInStore } from "@/lib/demo-data/server-store";
import { resolveServerBusiness, simulateSendCampaignDb } from "@/lib/db/voice-campaigns";

/**
 * POST /api/voice/campaigns/[id]/simulate
 * Runs Simulated / Demo execution after explicit versioned approval.
 * Rejects with HTTP 409 unless approved_version === version and status === 'approved'.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const business = await resolveServerBusiness();

  try {
    if (business) {
      const result = await simulateSendCampaignDb(business.db, business.businessId, id);
      if (!result) {
        return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
      }
      return Response.json({
        campaign: result.campaign,
        executedCount: result.executedCount,
        skippedCount: result.skippedCount,
        executionMode: "demo",
        status: "demo_executed",
        simulated: true,
        recipients: result.recipients,
        message: result.summary,
      });
    }

    const result = simulatePendingCampaignInStore(id);
    if (!result) {
      return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
    }
    if (result.duplicate) {
      return Response.json(
        { error: "This campaign was already recorded in Simulated / Demo mode." },
        { status: 409 },
      );
    }

    return Response.json({
      campaign: result.execution.campaign,
      executedCount: result.execution.successfulCount,
      skippedCount: result.execution.skippedCount ?? 0,
      executionMode: "demo",
      status: "demo_executed",
      simulated: true,
      recipients: result.execution.messages,
      message: result.summary,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Campaign must be approved at its current version before Simulated / Demo execution.",
      },
      { status: 409 },
    );
  }
}

import {
  approvePendingCampaignVersion,
  cancelPendingCampaign,
  recordCampaignExecution,
  simulatePendingCampaignInStore,
} from "@/lib/demo-data/server-store";
import {
  approveCampaignVersionDb,
  approveDraftDb,
  cancelCampaignDb,
  resolveServerBusiness,
  simulateSendCampaignDb,
} from "@/lib/db/voice-campaigns";

type ApproveAction = "approve" | "simulate" | "cancel" | "legacy";

async function parseAction(request: Request): Promise<ApproveAction> {
  try {
    const text = await request.text();
    if (!text.trim()) return "legacy";
    const parsed = JSON.parse(text) as { action?: unknown };
    if (parsed.action === "approve") return "approve";
    if (parsed.action === "simulate") return "simulate";
    if (parsed.action === "cancel") return "cancel";
    return "legacy";
  } catch {
    return "legacy";
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const action = await parseAction(request);
  const business = await resolveServerBusiness();

  // Explicit Step 1: Review & Approve current version (sets approved_version = version, status = 'approved')
  if (action === "approve") {
    if (business) {
      const draft = await approveCampaignVersionDb(business.db, business.businessId, id);
      if (!draft) {
        return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
      }
      return Response.json({
        pending: {
          ...draft,
          eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
        },
        message: `Version v${draft.version} approved for Simulated / Demo execution.`,
      });
    }

    const draft = approvePendingCampaignVersion(id);
    if (!draft) {
      return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
    }
    return Response.json({
      pending: {
        ...draft,
        eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
      },
      message: `Version v${draft.version} approved for Simulated / Demo execution.`,
    });
  }

  // Cancel active draft
  if (action === "cancel") {
    const cancelled = business
      ? await cancelCampaignDb(business.db, business.businessId, id)
      : cancelPendingCampaign(id);
    if (!cancelled) {
      return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
    }
    return Response.json({
      cancelled: true,
      status: "cancelled",
      message: "Campaign draft cancelled.",
    });
  }

  // Explicit Step 2: Simulate Send (strictly rejects unless approved_version === version)
  if (action === "simulate") {
    try {
      if (business) {
        const result = await simulateSendCampaignDb(business.db, business.businessId, id);
        if (!result) {
          return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
        }
        return Response.json({
          campaign: result.campaign,
          executedCount: result.executedCount,
          skippedCount: result.skippedCount,
          successfulCount: result.executedCount,
          failedCount: 0,
          executionMode: "demo",
          status: "demo_executed",
          simulated: true,
          message: result.summary,
        });
      }

      const result = simulatePendingCampaignInStore(id);
      if (!result) {
        return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
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
        successfulCount: result.execution.successfulCount,
        failedCount: 0,
        executionMode: "demo",
        status: "demo_executed",
        simulated: true,
        message: result.summary,
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Simulated / Demo execution was rejected." },
        { status: 409 },
      );
    }
  }

  // Legacy single-step approval for existing voice-tool callers
  if (business) {
    const result = await approveDraftDb(business.db, business.businessId, id);
    if (!result) {
      return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
    }
    return Response.json({
      campaign: result.campaign,
      successfulCount: result.successfulCount,
      failedCount: result.failedCount,
      executionMode: result.campaign.executionMode ?? "demo",
      status: result.campaign.status,
      simulated: result.campaign.status === "demo_executed" || result.campaign.status === "simulated",
      message: "Campaign recorded as demo_executed in Simulated / Demo mode. No messages were sent.",
    });
  }

  const result = recordCampaignExecution(id);
  if (!result) {
    return Response.json({ error: "This campaign draft is no longer available." }, { status: 404 });
  }
  if (result.duplicate) {
    return Response.json({ error: "This campaign was already executed in demo mode." }, { status: 409 });
  }
  return Response.json({
    campaign: result.execution.campaign,
    successfulCount: result.execution.successfulCount,
    failedCount: result.execution.failedCount,
    executionMode: "demo",
    status: result.execution.status,
    simulated: true,
    message: "Campaign recorded as demo_executed in Simulated / Demo mode. No messages were sent.",
  });
}

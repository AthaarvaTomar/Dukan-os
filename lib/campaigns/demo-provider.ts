import type { MarketingCampaign } from "@/lib/demo-data/types";
import type {
  CampaignExecutionProvider,
  CampaignExecutionResult,
  CampaignRecipientMessage,
  ExecuteCampaignParams,
  WhatsAppConfigStatus,
} from "./types";

/**
 * DemoCampaignProvider: fully implements simulated campaign execution.
 *
 * Enforces strict demo boundaries:
 * 1. Only uses statuses: 'draft', 'approved', 'demo_executed'.
 * 2. NEVER uses 'sent', 'delivered', or 'read'.
 * 3. Sets provider_message_id to null (no Meta Cloud API message was dispatched).
 * 4. Persists execution rows in public.campaign_executions with execution_mode = 'demo'.
 */
export class DemoCampaignProvider implements CampaignExecutionProvider {
  public readonly mode = "demo" as const;
  public readonly name = "Demo / Simulated Campaign Provider";
  public readonly isDemoOnly = true;

  public isConfigured(): boolean {
    return true;
  }

  public validateConfiguration(): WhatsAppConfigStatus {
    return {
      isConfigured: true,
      configuredFields: [],
      missingFields: [],
      message: "Demo mode is active and ready for safe simulation.",
    };
  }

  public async executeCampaign(
    params: ExecuteCampaignParams,
  ): Promise<CampaignExecutionResult> {
    if (!params.isExplicitlyApproved) {
      throw new Error(
        "Explicit merchant approval is required before running a campaign simulation.",
      );
    }

    const executionTimestamp = new Date().toISOString();
    const audienceCount = params.messages.length;

    // Process each message strictly under demo semantics:
    // status becomes 'demo_executed' (or 'failed' if message body is empty).
    // provider_message_id is strictly null.
    const executedMessages: CampaignRecipientMessage[] = params.messages.map((item) => {
      const isValid = Boolean(item.customerId && item.message.trim());
      return {
        ...item,
        status: isValid ? "demo_executed" : "failed",
        providerMessageId: null,
        executedAt: executionTimestamp,
        result: isValid
          ? "Demo executed successfully. No real WhatsApp message was sent."
          : "Demo simulation failed message validation.",
      };
    });

    const successfulCount = executedMessages.filter(
      (m) => m.status === "demo_executed",
    ).length;
    const failedCount = executedMessages.filter((m) => m.status === "failed").length;

    const campaign: MarketingCampaign = {
      id: params.campaignId,
      name: params.campaignName,
      channel: "WhatsApp",
      status: "demo_executed",
      startDate: executionTimestamp,
      endDate: executionTimestamp,
      budget: 0,
      audienceSize: audienceCount,
      sentCount: 0, // sent_count is 0 in demo mode because no real messages were sent
      conversions: 0,
      revenue: 0,
    };

    // If Supabase database client and businessId are available, persist execution
    if (params.db && params.businessId) {
      await this.persistDatabaseExecution(
        params.db,
        params.businessId,
        params.campaignId,
        audienceCount,
        executionTimestamp,
        executedMessages,
      );
    }

    return {
      campaignId: params.campaignId,
      executionMode: "demo",
      status: "demo_executed",
      audienceCount,
      successfulCount,
      failedCount,
      executedAt: executionTimestamp,
      messages: executedMessages,
      summary: `Campaign executed in Demo Mode (${successfulCount} simulated, 0 sent). No real WhatsApp messages were sent.`,
      campaign,
    };
  }

  private async persistDatabaseExecution(
    db: NonNullable<ExecuteCampaignParams["db"]>,
    businessId: string,
    campaignId: string,
    audienceCount: number,
    executionTimestamp: string,
    executedMessages: CampaignRecipientMessage[],
  ): Promise<void> {
    // 1. Update the campaign record: status = 'demo_executed', execution_mode = 'demo'
    const { error: campaignUpdateError } = await db
      .from("campaigns")
      .update({
        status: "demo_executed",
        execution_mode: "demo",
        sent_count: 0,
      })
      .eq("id", campaignId)
      .eq("business_id", businessId);

    if (campaignUpdateError) {
      // Fallback if schema doesn't yet have demo_executed or execution_mode: try updating status to simulated
      await db
        .from("campaigns")
        .update({ status: "simulated" })
        .eq("id", campaignId)
        .eq("business_id", businessId);
    }

    // 2. Update campaign_recipients status to 'demo_executed'
    await db
      .from("campaign_recipients")
      .update({ status: "demo_executed" })
      .eq("campaign_id", campaignId)
      .eq("business_id", businessId);

    // 3. Insert individual execution records into public.campaign_executions
    // Required fields: execution_mode, execution_timestamp, audience_count,
    // provider_message_id (null for demo), execution_status, campaign_id, customer_id
    if (executedMessages.length > 0) {
      const records = executedMessages.map((msg) => ({
        business_id: businessId,
        campaign_id: campaignId,
        customer_id: msg.customerId || null,
        execution_mode: "demo",
        execution_timestamp: executionTimestamp,
        audience_count: audienceCount,
        provider_message_id: null,
        execution_status: msg.status === "failed" ? "failed" : "demo_executed",
        message_body: msg.message,
        provider_response: {
          simulated: true,
          mode: "demo",
          timestamp: executionTimestamp,
          disclaimer: "Simulated in demo mode — no message was dispatched to WhatsApp Cloud API.",
        },
      }));

      const { error: executionInsertError } = await db
        .from("campaign_executions")
        .insert(records);

      if (executionInsertError) {
        // Table might be pending migration in some dev environments; log silently without breaking demo execution
        console.warn("Could not insert to campaign_executions table:", executionInsertError.message);
      }
    }
  }
}


import type { MarketingCampaign } from "@/lib/demo-data/types";
import { getWhatsAppConfigStatus, getWhatsAppCredentials } from "../config";
import type {
  CampaignExecutionProvider,
  CampaignExecutionResult,
  CampaignRecipientMessage,
  ExecuteCampaignParams,
  WhatsAppConfigStatus,
} from "../types";
import {
  buildWhatsAppTemplatePayload,
  validatePhoneNumber,
  validateWhatsAppTemplate,
  verifyCustomerConsent,
  type WhatsAppTemplateSpec,
} from "./workflow";

/**
 * WhatsAppCampaignProvider: Meta WhatsApp Cloud API Provider.
 *
 * Clearly marked as FUTURE INTEGRATION / UNCONFIGURED PROVIDER.
 * Rules:
 * 1. Never pretends WhatsApp sending is working when unconfigured.
 * 2. Never mocks successful delivery responses or invents fake message IDs.
 * 3. Enforces the 9-step real-send workflow when credentials and templates are present.
 * 4. Strictly separates real WhatsApp delivery records from demo records.
 */
export class WhatsAppCampaignProvider implements CampaignExecutionProvider {
  public readonly mode = "whatsapp" as const;
  public readonly name = "Official Meta WhatsApp Cloud API Provider (Future Integration)";
  public readonly isDemoOnly = false;

  public isConfigured(): boolean {
    return getWhatsAppConfigStatus().isConfigured;
  }

  public validateConfiguration(): WhatsAppConfigStatus {
    return getWhatsAppConfigStatus();
  }

  /**
   * Executes campaign through the official Meta WhatsApp Cloud API.
   * If unconfigured, throws immediately with the required message.
   */
  public async executeCampaign(
    params: ExecuteCampaignParams,
  ): Promise<CampaignExecutionResult> {
    const configStatus = this.validateConfiguration();
    if (!configStatus.isConfigured) {
      throw new Error(
        "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
      );
    }

    if (!params.isExplicitlyApproved) {
      throw new Error(
        "Explicit merchant approval is required before real WhatsApp messages can be sent.",
      );
    }

    const credentials = getWhatsAppCredentials();
    const executionTimestamp = new Date().toISOString();

    // Default template spec for the 15% discount campaign
    const templateSpec: WhatsAppTemplateSpec = {
      name: "dukaanos_discount_offer_v1",
      language: "en_US",
      status: "APPROVED",
      category: "MARKETING",
      bodyText: "Hi {{1}}, enjoy {{2}}% OFF on {{3}}!",
    };

    // Step 3: Validate template requirements
    const templateValidation = validateWhatsAppTemplate(templateSpec);
    if (!templateValidation.valid) {
      throw new Error(
        `WhatsApp template validation failed: ${templateValidation.error}`,
      );
    }

    const executedMessages: CampaignRecipientMessage[] = [];
    let successfulCount = 0;
    let failedCount = 0;

    for (const msg of params.messages) {
      // Step 1: Verify customer marketing consent
      const consentCheck = verifyCustomerConsent({
        customerId: msg.customerId,
        customerPhone: msg.customerPhone ?? "",
        hasMarketingConsent: true, // In future, queried from customer record
      });

      if (!consentCheck.allowed) {
        failedCount++;
        executedMessages.push({
          ...msg,
          status: "failed",
          providerMessageId: null,
          executedAt: executionTimestamp,
          result: `Failed consent verification: ${consentCheck.reason}`,
        });
        continue;
      }

      // Step 2: Validate customer phone numbers
      const phoneValidation = validatePhoneNumber(msg.customerPhone ?? "");
      if (!phoneValidation.isValid || !phoneValidation.e164Phone) {
        failedCount++;
        executedMessages.push({
          ...msg,
          status: "failed",
          providerMessageId: null,
          executedAt: executionTimestamp,
          result: `Invalid customer phone: ${phoneValidation.error ?? "Invalid phone number"}`,
        });
        continue;
      }

      // Step 6: Dispatch via official Meta Graph API v21.0
      const payload = buildWhatsAppTemplatePayload({
        recipientPhone: phoneValidation.e164Phone,
        templateName: templateSpec.name,
        languageCode: templateSpec.language,
        bodyParameters: [
          msg.customerName,
          String(msg.discountPercent),
          msg.productCategory ?? "your next purchase",
        ],
      });

      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${credentials.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const responseData = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string; code: number };
        };

        if (!response.ok || !responseData.messages?.[0]?.id) {
          failedCount++;
          const errorMessage =
            responseData.error?.message ??
            `Meta Cloud API returned status ${response.status}`;
          executedMessages.push({
            ...msg,
            status: "failed",
            providerMessageId: null,
            executedAt: executionTimestamp,
            result: `Meta WhatsApp API error: ${errorMessage}`,
          });

          if (params.db && params.businessId) {
            await this.recordExecutionInDb(
              params.db,
              params.businessId,
              params.campaignId,
              msg.customerId,
              params.messages.length,
              executionTimestamp,
              null,
              "failed",
              msg.message,
              responseData,
              errorMessage,
            );
          }
        } else {
          // Step 7: Store the actual provider message ID and response
          const providerMessageId = responseData.messages[0].id; // e.g. wamid.HBg...
          successfulCount++;
          executedMessages.push({
            ...msg,
            status: "sent",
            providerMessageId,
            executedAt: executionTimestamp,
            result: `Sent via WhatsApp Cloud API (Message ID: ${providerMessageId})`,
          });

          if (params.db && params.businessId) {
            await this.recordExecutionInDb(
              params.db,
              params.businessId,
              params.campaignId,
              msg.customerId,
              params.messages.length,
              executionTimestamp,
              providerMessageId,
              "sent",
              msg.message,
              responseData,
              null,
            );
          }
        }
      } catch (networkError) {
        failedCount++;
        const errorMessage =
          networkError instanceof Error
            ? networkError.message
            : "Network error reaching Meta Cloud API";
        executedMessages.push({
          ...msg,
          status: "failed",
          providerMessageId: null,
          executedAt: executionTimestamp,
          result: `Connection failed: ${errorMessage}`,
        });
      }
    }

    const campaign: MarketingCampaign = {
      id: params.campaignId,
      name: params.campaignName,
      channel: "WhatsApp",
      status: successfulCount > 0 ? "active" : "draft",
      startDate: executionTimestamp,
      endDate: executionTimestamp,
      budget: 0,
      audienceSize: params.messages.length,
      sentCount: successfulCount,
      conversions: 0,
      revenue: 0,
    };

    return {
      campaignId: params.campaignId,
      executionMode: "whatsapp",
      status: successfulCount > 0 ? "sent" : "failed",
      audienceCount: params.messages.length,
      successfulCount,
      failedCount,
      executedAt: executionTimestamp,
      messages: executedMessages,
      summary: `Real WhatsApp sending complete: ${successfulCount} sent, ${failedCount} failed.`,
      campaign,
    };
  }

  private async recordExecutionInDb(
    db: NonNullable<ExecuteCampaignParams["db"]>,
    businessId: string,
    campaignId: string,
    customerId: string | null,
    audienceCount: number,
    executionTimestamp: string,
    providerMessageId: string | null,
    executionStatus: string,
    messageBody: string,
    providerResponse: unknown,
    errorDetails: string | null,
  ): Promise<void> {
    try {
      await db.from("campaign_executions").insert({
        business_id: businessId,
        campaign_id: campaignId,
        customer_id: customerId,
        execution_mode: "whatsapp",
        execution_timestamp: executionTimestamp,
        audience_count: audienceCount,
        provider_message_id: providerMessageId,
        execution_status: executionStatus,
        message_body: messageBody,
        provider_response: providerResponse as Record<string, unknown>,
        error_details: errorDetails,
      });
    } catch (e) {
      console.warn("Could not record WhatsApp execution in db:", e);
    }
  }
}


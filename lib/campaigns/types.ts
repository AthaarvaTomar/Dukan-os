import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingCampaign } from "@/lib/demo-data/types";

/**
 * Execution modes supported by the campaign system.
 * - 'demo': Simulated execution. Fully working demo campaign system.
 * - 'whatsapp': Official Meta WhatsApp Cloud API (future integration / unconfigured).
 */
export type CampaignExecutionMode = "demo" | "whatsapp";

/**
 * Strictly separated demo execution statuses.
 * Per requirement E: For current demo mode, use only 'draft', 'approved', 'demo_executed'.
 * Never use 'sent', 'delivered', or 'read' for simulated execution.
 */
export type DemoCampaignStatus = "draft" | "approved" | "demo_executed";

/**
 * Real WhatsApp delivery statuses (used exclusively for real WhatsApp provider execution).
 * Demo records and real WhatsApp records must never be mixed.
 */
export type WhatsAppDeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "rejected";

export type CampaignExecutionStatus = DemoCampaignStatus | WhatsAppDeliveryStatus;

/**
 * Per-customer message recipient details in a campaign.
 */
export interface CampaignRecipientMessage {
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  previousPurchase: string | null;
  productCategory: string | null;
  lastPurchaseAt: string | null;
  customerSegment: string;
  discountPercent: number;
  message: string;
  status: CampaignExecutionStatus | "failed";
  result: string | null;
  providerMessageId?: string | null;
  executedAt?: string | null;
}

/**
 * Stored campaign execution record (matching database table public.campaign_executions).
 */
export interface CampaignExecutionRecord {
  id: string;
  businessId?: string;
  campaignId: string;
  customerId: string | null;
  executionMode: CampaignExecutionMode;
  executionTimestamp: string;
  audienceCount: number;
  providerMessageId: string | null;
  executionStatus: CampaignExecutionStatus | "failed";
  messageBody: string;
  providerResponse?: Record<string, unknown> | null;
  errorDetails?: string | null;
}

/**
 * Result returned by a campaign execution provider.
 */
export interface CampaignExecutionResult {
  campaignId: string;
  executionMode: CampaignExecutionMode;
  status: DemoCampaignStatus | "sent" | "failed";
  audienceCount: number;
  successfulCount: number;
  failedCount: number;
  executedAt: string;
  messages: CampaignRecipientMessage[];
  summary: string;
  campaign: MarketingCampaign;
}

/**
 * Parameters passed to execute a campaign.
 */
export interface ExecuteCampaignParams {
  businessId: string;
  campaignId: string;
  campaignName: string;
  channel: "WhatsApp";
  discountPercent: number;
  messages: CampaignRecipientMessage[];
  isExplicitlyApproved: boolean;
  db?: SupabaseClient | null;
}

/**
 * Secure WhatsApp configuration status summary.
 * Safe to share with the frontend (no secret values exposed).
 */
export interface WhatsAppConfigStatus {
  isConfigured: boolean;
  configuredFields: string[];
  missingFields: string[];
  message: string;
}

/**
 * Universal Campaign Execution Provider Interface.
 * Both DemoCampaignProvider and WhatsAppCampaignProvider adhere to this contract.
 */
export interface CampaignExecutionProvider {
  readonly mode: CampaignExecutionMode;
  readonly name: string;
  readonly isDemoOnly: boolean;

  /**
   * Checks whether the provider is currently configured and capable of execution.
   */
  isConfigured(): boolean;

  /**
   * Validates the provider's configuration and returns human-readable status.
   */
  validateConfiguration(): WhatsAppConfigStatus;

  /**
   * Executes the campaign following this provider's mode.
   * - DemoCampaignProvider: fully implements simulated execution and marks 'demo_executed'.
   * - WhatsAppCampaignProvider: validates credentials and templates; throws cleanly if unconfigured.
   */
  executeCampaign(params: ExecuteCampaignParams): Promise<CampaignExecutionResult>;
}


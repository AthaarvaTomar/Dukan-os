import type { SupabaseClient } from "@supabase/supabase-js";

import { createPersonalizedMessage } from "@/lib/assistant/campaign-messages";
import {
  mapCampaign,
  type CampaignRow,
  type CampaignRowWithSummary,
} from "@/lib/db/mapping";
import { fetchBusinessData, fetchMyBusinessId } from "@/lib/db/queries";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import type { MarketingCampaign } from "@/lib/demo-data/types";
import type {
  CampaignExecutionRecord,
  PersonalizedCampaignMessage,
  VoiceCampaignDraft,
} from "@/lib/demo-data/server-store";

/**
 * Resolves the business context for server-side routes:
 * 1. A signed-in user's session (RLS-scoped) — browser API calls.
 * 2. The service-role client plus SARVAM_BUSINESS_ID — Sarvam webhooks.
 * Returns null when neither is available (callers fall back to demo mode).
 */
export async function resolveServerBusiness(): Promise<{
  db: SupabaseClient;
  businessId: string;
} | null> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const businessId = await fetchMyBusinessId(supabase);
      if (businessId) return { db: supabase, businessId };
    }
  } catch {
    // No request context (e.g. unit tests) or Supabase not configured.
  }

  const envBusinessId = process.env.SARVAM_BUSINESS_ID?.trim();
  if (isSupabaseServiceConfigured() && envBusinessId) {
    return { db: createSupabaseServiceClient(), businessId: envBusinessId };
  }
  return null;
}

interface RecipientRow {
  id: string;
  campaign_id: string;
  customer_id: string | null;
  customer_name: string;
  message: string;
  status: string;
}

function recipientToDraftMessage(
  row: RecipientRow,
  discountPercent: number,
  previousPurchase: string | null,
  productCategory: string | null,
  lastPurchaseAt: string | null,
  customerSegment: string,
): PersonalizedCampaignMessage {
  return {
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    previousPurchase,
    productCategory,
    lastPurchaseAt,
    customerSegment,
    discountPercent,
    message: row.message,
    status: row.status === "sent" ? "simulated" : row.status === "failed" ? "failed" : "draft",
    result: row.status === "sent" ? "Simulated — no message was sent." : null,
  };
}

export async function getPendingDraftDb(
  db: SupabaseClient,
  businessId: string,
): Promise<VoiceCampaignDraft | null> {
  const { data: campaigns, error } = await db
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const campaignRow = (campaigns ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow) return null;

  const { data: recipients, error: recipientsError } = await db
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignRow.id);
  if (recipientsError) throw new Error(recipientsError.message);

  const rows = (recipients ?? []) as RecipientRow[];
  const discount = extractDiscount(campaignRow.summary_message);
  return {
    id: campaignRow.id,
    campaign: mapCampaign(campaignRow as CampaignRow),
    message: campaignRow.summary_message,
    eligibleCustomerIds: rows.map((row) => row.customer_id ?? "").filter(Boolean),
    createdAt: campaignRow.created_at,
    discountPercent: discount,
    messages: rows.map((row) =>
      recipientToDraftMessage(
        row,
        discount,
        null,
        null,
        null,
        "inactive",
      ),
    ),
  };
}

function extractDiscount(summaryMessage: string): number {
  const match = summaryMessage.match(/(\d+)%/);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 15;
}

export async function createDraftDb(
  db: SupabaseClient,
  businessId: string,
  discountPercent: number,
): Promise<VoiceCampaignDraft> {
  const data = await fetchBusinessData(db, businessId);
  const { createPersonalizedCampaign } = await import("@/lib/assistant/campaign-messages");
  const draft = createPersonalizedCampaign(data, discountPercent);

  const { error: campaignError } = await db.from("campaigns").insert({
    id: draft.campaign.id,
    business_id: businessId,
    name: draft.campaign.name,
    channel: draft.campaign.channel,
    status: "draft",
    start_date: draft.campaign.startDate,
    end_date: draft.campaign.endDate,
    budget: draft.campaign.budget,
    audience_size: draft.campaign.audienceSize,
    sent_count: 0,
    conversions: 0,
    revenue: 0,
    summary_message: draft.message,
  });
  if (campaignError) throw new Error(campaignError.message);

  const { error: recipientsError } = await db.from("campaign_recipients").insert(
    draft.messages.map((message) => ({
      business_id: businessId,
      campaign_id: draft.campaign.id,
      customer_id: message.customerId || null,
      customer_name: message.customerName,
      message: message.message,
      status: "pending",
    })),
  );
  if (recipientsError) throw new Error(recipientsError.message);

  return draft;
}

export async function updateDraftMessageDb(
  db: SupabaseClient,
  campaignId: string,
  customerId: string,
  message: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("campaign_recipients")
    .update({ message })
    .eq("campaign_id", campaignId)
    .eq("customer_id", customerId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function regenerateDraftMessageDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
  customerId: string,
): Promise<PersonalizedCampaignMessage | null> {
  const { data: campaignRows, error: campaignError } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (campaignError) throw new Error(campaignError.message);
  const campaign = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaign || campaign.status !== "draft") return null;

  const { data: recipientRows, error: recipientError } = await db
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("customer_id", customerId)
    .limit(1);
  if (recipientError) throw new Error(recipientError.message);
  const recipient = (recipientRows ?? [])[0] as RecipientRow | undefined;
  if (!recipient) return null;

  const data = await fetchBusinessData(db, businessId);
  const discount = extractDiscount(campaign.summary_message);
  const original = createPersonalizedMessage(data, customerId, discount);
  const regenerated = createPersonalizedMessage(
    data,
    customerId,
    discount,
    recipient.message === original?.message,
  );
  if (!regenerated) return null;

  const { error: updateError } = await db
    .from("campaign_recipients")
    .update({ message: regenerated.message })
    .eq("id", recipient.id);
  if (updateError) throw new Error(updateError.message);
  return { ...regenerated, discountPercent: discount };
}

export async function approveDraftDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
): Promise<{
  campaign: MarketingCampaign;
  successfulCount: number;
  failedCount: number;
} | null> {
  const { data: campaignRows, error: campaignError } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (campaignError) throw new Error(campaignError.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow) return null;
  if (campaignRow.status !== "draft") return null;

  const { data: recipientRows, error: recipientsError } = await db
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId);
  if (recipientsError) throw new Error(recipientsError.message);
  const recipients = (recipientRows ?? []) as RecipientRow[];

  const { error: updateRecipientsError } = await db
    .from("campaign_recipients")
    .update({ status: "sent" })
    .eq("campaign_id", campaignId);
  if (updateRecipientsError) throw new Error(updateRecipientsError.message);

  if (recipients.length > 0) {
    const { error: logsError } = await db.from("message_logs").insert(
      recipients.map((recipient) => ({
        business_id: businessId,
        campaign_id: campaignId,
        customer_id: recipient.customer_id,
        channel: campaignRow.channel,
        body: recipient.message,
        status: "sent",
      })),
    );
    if (logsError) throw new Error(logsError.message);
  }

  const { error: updateCampaignError } = await db
    .from("campaigns")
    .update({ status: "simulated", sent_count: recipients.length })
    .eq("id", campaignId);
  if (updateCampaignError) throw new Error(updateCampaignError.message);

  return {
    campaign: mapCampaign({ ...campaignRow, status: "simulated", sent_count: recipients.length }),
    successfulCount: recipients.length,
    failedCount: 0,
  };
}

export async function getCampaignHistoryDb(
  db: SupabaseClient,
  businessId: string,
): Promise<CampaignExecutionRecord[]> {
  const { data: campaignRows, error } = await db
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const records: CampaignExecutionRecord[] = [];
  for (const raw of (campaignRows ?? []) as CampaignRowWithSummary[]) {
    const { data: recipientRows } = await db
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", raw.id);
    const recipients = (recipientRows ?? []) as RecipientRow[];
    const discount = extractDiscount(raw.summary_message);
    records.push({
      campaignId: raw.id,
      draftId: raw.id,
      campaign: mapCampaign(raw as CampaignRow),
      executedAt: raw.updated_at ?? raw.created_at,
      successfulCount: recipients.filter((r) => r.status === "sent").length,
      failedCount: recipients.filter((r) => r.status === "failed").length,
      messages: recipients.map((row) =>
        recipientToDraftMessage(row, discount, null, null, null, "inactive"),
      ),
      status: raw.status as CampaignExecutionRecord["status"],
    });
  }
  return records;
}

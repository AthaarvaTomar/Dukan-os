import type { SupabaseClient } from "@supabase/supabase-js";

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
  CreateWinbackDraftInput,
  HeldBackSummaryItem,
  PersonalizedCampaignMessage,
  VoiceCampaignDraft,
} from "@/lib/demo-data/server-store";
import {
  buildAudienceCustomers,
  extractDiscountPercent,
} from "@/lib/campaigns/audience-builder";
import {
  approveCampaign,
  cancelCampaign,
  computeAudience,
  DEFAULT_WINBACK_TEMPLATES,
  editCampaign,
  HOLD_BACK_REASON_LABELS,
  personalize,
  simulateSend,
  validateAiRewrite,
  type HoldBackReason,
  type WinbackCampaignConfig,
  type WinbackCampaignStatus,
  type WinbackSegment,
} from "@/lib/campaigns/winback";
import { createGeminiCompletion } from "@/lib/assistant/gemini";

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
  skip_reason?: string | null;
  created_at?: string;
}

async function fetchShopName(db: SupabaseClient, businessId: string): Promise<string> {
  const { data } = await db
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  return (data?.name as string | undefined)?.trim() || "our store";
}

async function fetchLastCampaignTimestampsDb(
  db: SupabaseClient,
  businessId: string,
  excludeCampaignId?: string,
): Promise<Map<string, string>> {
  let query = db
    .from("campaign_recipients")
    .select("customer_id, created_at, campaign_id")
    .eq("business_id", businessId)
    .eq("status", "demo_executed")
    .order("created_at", { ascending: false });

  if (excludeCampaignId) {
    query = query.neq("campaign_id", excludeCampaignId);
  }

  const { data } = await query;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ customer_id: string | null; created_at: string }>) {
    if (!row.customer_id || !row.created_at) continue;
    if (!map.has(row.customer_id)) {
      map.set(row.customer_id, row.created_at);
    }
  }
  return map;
}

function rowToWinbackConfig(row: CampaignRowWithSummary): WinbackCampaignConfig {
  const discount = extractDiscountPercent(row.offer_text || row.summary_message || row.name, 15);
  const status: WinbackCampaignStatus =
    row.status === "approved" ||
    row.status === "demo_executed" ||
    row.status === "cancelled"
      ? row.status
      : "draft";
  const targetSegment: WinbackSegment =
    row.target_segment === "all" ||
    row.target_segment === "inactive" ||
    row.target_segment === "regular" ||
    row.target_segment === "new" ||
    row.target_segment === "high-value"
      ? row.target_segment
      : "inactive";

  return {
    id: row.id,
    name: row.name,
    targetSegment,
    offerText: row.offer_text?.trim() || `${discount}% off your next order`,
    templateText: row.template_text ?? "",
    cooldownDays: typeof row.cooldown_days === "number" ? row.cooldown_days : 14,
    messageCap: typeof row.message_cap === "number" ? row.message_cap : 50,
    version: typeof row.version === "number" && row.version >= 1 ? row.version : 1,
    approvedVersion:
      typeof row.approved_version === "number" ? row.approved_version : null,
    status,
  };
}

function normalizeRecipientStatus(status: string): PersonalizedCampaignMessage["status"] {
  if (status === "demo_executed" || status === "simulated") return "demo_executed";
  if (status === "skipped" || status === "failed") return "skipped";
  return "queued";
}

function recipientRowToMessage(
  row: RecipientRow,
  discountPercent: number,
  meta?: {
    phone?: string;
    previousPurchase?: string | null;
    productCategory?: string | null;
    lastPurchaseAt?: string | null;
    customerSegment?: string;
  },
): PersonalizedCampaignMessage {
  const status = normalizeRecipientStatus(row.status);
  return {
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    customerPhone: meta?.phone ?? "",
    previousPurchase: meta?.previousPurchase ?? null,
    productCategory: meta?.productCategory ?? null,
    lastPurchaseAt: meta?.lastPurchaseAt ?? null,
    customerSegment: meta?.customerSegment ?? "inactive",
    discountPercent,
    message: row.message,
    status,
    skipReason: row.skip_reason ?? null,
    result:
      status === "demo_executed"
        ? "Simulated / Demo run recorded locally. No external message dispatch occurred."
        : status === "skipped"
          ? row.skip_reason
            ? `Skipped: ${HOLD_BACK_REASON_LABELS[row.skip_reason as HoldBackReason] ?? row.skip_reason}`
            : "Skipped during Simulated / Demo validation."
          : null,
  };
}

async function hydrateDraftDb(
  db: SupabaseClient,
  businessId: string,
  campaignRow: CampaignRowWithSummary,
): Promise<VoiceCampaignDraft> {
  const [data, shopName, lastCampaignMap, recipientsRes] = await Promise.all([
    fetchBusinessData(db, businessId),
    fetchShopName(db, businessId),
    fetchLastCampaignTimestampsDb(db, businessId, campaignRow.id),
    db.from("campaign_recipients").select("*").eq("campaign_id", campaignRow.id),
  ]);
  if (recipientsRes.error) throw new Error(recipientsRes.error.message);

  const config = rowToWinbackConfig(campaignRow);
  const audienceCustomers = buildAudienceCustomers(data, lastCampaignMap);
  const audience = computeAudience(audienceCustomers, config, new Date(data.asOf));
  const discountPercent = extractDiscountPercent(config.offerText, 15);
  const templateInput = config.templateText?.trim()
    ? config.templateText.trim()
    : DEFAULT_WINBACK_TEMPLATES;

  const storedRows = (recipientsRes.data ?? []) as RecipientRow[];
  const storedByCustomer = new Map<string, RecipientRow>();
  for (const row of storedRows) {
    if (row.customer_id) storedByCustomer.set(row.customer_id, row);
  }

  const messages: PersonalizedCampaignMessage[] = audience.eligible.map((customer) => {
    const saved = storedByCustomer.get(customer.id);
    const messageText =
      saved?.message?.trim() ||
      personalize(customer, templateInput, {
        offerText: config.offerText,
        shopName,
      });
    return {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      previousPurchase: customer.previousPurchase ?? null,
      productCategory: customer.productCategory ?? null,
      lastPurchaseAt: customer.lastPurchaseAt ?? null,
      customerSegment: customer.segment,
      discountPercent,
      message: messageText,
      status: "queued",
      skipReason: null,
      result: null,
    };
  });

  const heldBack: HeldBackSummaryItem[] = audience.held_back.map((entry) => ({
    customerId: entry.customer.id,
    customerName: entry.customer.name,
    customerPhone: entry.customer.phone,
    customerSegment: entry.customer.segment,
    marketingConsent: entry.customer.marketingConsent,
    optedOutAt: entry.customer.optedOutAt,
    reason: entry.reason,
    reasonLabel: HOLD_BACK_REASON_LABELS[entry.reason],
    detail: entry.detail,
  }));

  return {
    id: campaignRow.id,
    campaign: mapCampaign(campaignRow as CampaignRow),
    message:
      campaignRow.summary_message ||
      `Simulated / Demo draft v${config.version}: ${messages.length} eligible, ${heldBack.length} held back.`,
    eligibleCustomerIds: messages.map((m) => m.customerId),
    createdAt: campaignRow.created_at,
    discountPercent,
    messages,
    version: config.version,
    approvedVersion: config.approvedVersion,
    status: config.status,
    targetSegment: config.targetSegment,
    offerText: config.offerText,
    templateText: config.templateText ?? "",
    cooldownDays: config.cooldownDays,
    messageCap: config.messageCap,
    eligibleCount: messages.length,
    heldBackCount: heldBack.length,
    heldBack,
    reasonCounts: audience.reasonCounts,
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
    .in("status", ["draft", "approved"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const campaignRow = (campaigns ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow) return null;

  return hydrateDraftDb(db, businessId, campaignRow);
}

async function syncDraftRecipientsDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
  messages: readonly PersonalizedCampaignMessage[],
  heldBack: readonly HeldBackSummaryItem[],
): Promise<void> {
  const { error: deleteError } = await db
    .from("campaign_recipients")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("business_id", businessId);
  if (deleteError) throw new Error(deleteError.message);

  const rows = [
    ...messages.map((m) => ({
      business_id: businessId,
      campaign_id: campaignId,
      customer_id: m.customerId || null,
      customer_name: m.customerName,
      message: m.message,
      status: "queued",
      skip_reason: null,
    })),
    ...heldBack.map((h) => ({
      business_id: businessId,
      campaign_id: campaignId,
      customer_id: h.customerId || null,
      customer_name: h.customerName,
      message: "",
      status: "skipped",
      skip_reason: h.reason,
    })),
  ];

  if (rows.length > 0) {
    const { error: insertError } = await db.from("campaign_recipients").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
}

export async function createDraftDb(
  db: SupabaseClient,
  businessId: string,
  input: number | CreateWinbackDraftInput,
): Promise<VoiceCampaignDraft> {
  const options: CreateWinbackDraftInput =
    typeof input === "number" ? { discountPercent: input } : input;

  const [data, shopName, lastCampaignMap] = await Promise.all([
    fetchBusinessData(db, businessId),
    fetchShopName(db, businessId),
    fetchLastCampaignTimestampsDb(db, businessId),
  ]);

  const discountPercent =
    options.discountPercent ?? extractDiscountPercent(options.offerText ?? "", 15);
  const offerText = options.offerText?.trim() || `${discountPercent}% off your next order`;
  const targetSegment: WinbackSegment = options.targetSegment ?? "inactive";
  const cooldownDays = Math.max(0, Math.floor(options.cooldownDays ?? 14));
  const messageCap = Math.max(1, Math.floor(options.messageCap ?? 50));
  const templateText = options.templateText?.trim() ?? "";
  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const name =
    options.name?.trim() ||
    `${offerText} (${targetSegment === "all" ? "all customers" : `${targetSegment} customers`})`;

  const config: WinbackCampaignConfig = {
    id,
    name,
    targetSegment,
    offerText,
    templateText,
    cooldownDays,
    messageCap,
    version: 1,
    approvedVersion: null,
    status: "draft",
  };

  const audienceCustomers = buildAudienceCustomers(data, lastCampaignMap);
  const audience = computeAudience(audienceCustomers, config, new Date(data.asOf));
  const templateInput = templateText || DEFAULT_WINBACK_TEMPLATES;

  const messages: PersonalizedCampaignMessage[] = audience.eligible.map((customer) => ({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    previousPurchase: customer.previousPurchase ?? null,
    productCategory: customer.productCategory ?? null,
    lastPurchaseAt: customer.lastPurchaseAt ?? null,
    customerSegment: customer.segment,
    discountPercent,
    message: personalize(customer, templateInput, {
      offerText,
      shopName,
    }),
    status: "queued",
    skipReason: null,
    result: null,
  }));

  const heldBack: HeldBackSummaryItem[] = audience.held_back.map((entry) => ({
    customerId: entry.customer.id,
    customerName: entry.customer.name,
    customerPhone: entry.customer.phone,
    customerSegment: entry.customer.segment,
    marketingConsent: entry.customer.marketingConsent,
    optedOutAt: entry.customer.optedOutAt,
    reason: entry.reason,
    reasonLabel: HOLD_BACK_REASON_LABELS[entry.reason],
    detail: entry.detail,
  }));

  const summaryMessage = `Simulated / Demo draft v1: ${messages.length} eligible, ${heldBack.length} held back.`;

  const { data: insertedRow, error: campaignError } = await db
    .from("campaigns")
    .insert({
      id,
      business_id: businessId,
      name,
      channel: "WhatsApp",
      status: "draft",
      execution_mode: "demo",
      version: 1,
      approved_version: null,
      offer_text: offerText,
      target_segment: targetSegment,
      template_text: templateText,
      cooldown_days: cooldownDays,
      message_cap: messageCap,
      start_date: today,
      end_date: today,
      budget: 0,
      audience_size: messages.length,
      sent_count: 0,
      conversions: 0,
      revenue: 0,
      summary_message: summaryMessage,
    })
    .select("*")
    .single();
  if (campaignError) throw new Error(campaignError.message);

  await syncDraftRecipientsDb(db, businessId, id, messages, heldBack);

  return hydrateDraftDb(db, businessId, insertedRow as CampaignRowWithSummary);
}

async function bumpCampaignVersionDb(
  db: SupabaseClient,
  businessId: string,
  campaignRow: CampaignRowWithSummary,
  extraFields: Record<string, unknown> = {},
): Promise<CampaignRowWithSummary> {
  const currentVersion =
    typeof campaignRow.version === "number" && campaignRow.version >= 1
      ? campaignRow.version
      : 1;
  const nextVersion = currentVersion + 1;

  const { data, error } = await db
    .from("campaigns")
    .update({
      ...extraFields,
      version: nextVersion,
      approved_version: null,
      status: "draft",
    })
    .eq("id", campaignRow.id)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignRowWithSummary;
}

export async function updateDraftMessageDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
  customerId: string,
  message: string,
): Promise<{ draft: VoiceCampaignDraft } | null> {
  const { data: campaignRows, error: campaignError } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (campaignError) throw new Error(campaignError.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow || (campaignRow.status !== "draft" && campaignRow.status !== "approved")) {
    return null;
  }

  const { data: updatedRows, error: recipientError } = await db
    .from("campaign_recipients")
    .update({ message })
    .eq("campaign_id", campaignId)
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .select("id");
  if (recipientError) throw new Error(recipientError.message);
  if ((updatedRows ?? []).length === 0) return null;

  const bumped = await bumpCampaignVersionDb(db, businessId, campaignRow);
  const draft = await hydrateDraftDb(db, businessId, bumped);
  return { draft };
}

export async function updateDraftSettingsDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
  patch: Partial<
    Pick<
      WinbackCampaignConfig,
      "name" | "targetSegment" | "offerText" | "templateText" | "cooldownDays" | "messageCap"
    >
  >,
): Promise<VoiceCampaignDraft | null> {
  const { data: campaignRows, error: campaignError } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (campaignError) throw new Error(campaignError.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow || (campaignRow.status !== "draft" && campaignRow.status !== "approved")) {
    return null;
  }

  const nextConfig = editCampaign(rowToWinbackConfig(campaignRow), patch);
  const bumped = await bumpCampaignVersionDb(db, businessId, campaignRow, {
    name: nextConfig.name,
    target_segment: nextConfig.targetSegment,
    offer_text: nextConfig.offerText,
    template_text: nextConfig.templateText ?? "",
    cooldown_days: nextConfig.cooldownDays,
    message_cap: nextConfig.messageCap,
  });

  // If offer or template changed, regenerate messages cleanly from new settings
  if (patch.offerText !== undefined || patch.templateText !== undefined) {
    await db
      .from("campaign_recipients")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("business_id", businessId);
  }

  const draft = await hydrateDraftDb(db, businessId, bumped);
  await syncDraftRecipientsDb(db, businessId, campaignId, draft.messages, draft.heldBack ?? []);
  await db
    .from("campaigns")
    .update({
      audience_size: draft.messages.length,
      summary_message: draft.message,
    })
    .eq("id", campaignId)
    .eq("business_id", businessId);

  return draft;
}

export async function attemptValidatedAiRewrite(
  original: string,
  offerText: string,
  customerName: string,
): Promise<{ text: string; usedAi: boolean; rejectedReasons: string[] }> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { text: original, usedAi: false, rejectedReasons: [] };
  }
  try {
    const complete = createGeminiCompletion();
    const rewrite = await complete([
      {
        role: "system",
        content:
          "Rewrite this short retail shop winback message in natural language. Keep the exact offer and numbers unchanged. Do not add any new numbers, extra offers, discounts, coupons, or customer personal details. Return only the rewritten message text.",
      },
      {
        role: "user",
        content: `Customer name: ${customerName}\nOffer: ${offerText}\nOriginal message: ${original}`,
      },
    ]);
    const validation = validateAiRewrite(original, rewrite, offerText);
    return {
      text: validation.text,
      usedAi: validation.valid,
      rejectedReasons: validation.rejectedReasons,
    };
  } catch {
    return { text: original, usedAi: false, rejectedReasons: ["ai_unavailable"] };
  }
}

export async function regenerateDraftMessageDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
  customerId: string,
  options: { variantOffset?: number; useAiRewrite?: boolean } = {},
): Promise<{
  message: PersonalizedCampaignMessage;
  version: number;
  approvedVersion: number | null;
  status: WinbackCampaignStatus;
  usedAi: boolean;
  rejectedReasons: string[];
} | null> {
  const { data: campaignRows, error: campaignError } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (campaignError) throw new Error(campaignError.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow || (campaignRow.status !== "draft" && campaignRow.status !== "approved")) {
    return null;
  }

  const { data: recipientRows, error: recipientError } = await db
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .limit(1);
  if (recipientError) throw new Error(recipientError.message);
  const recipient = (recipientRows ?? [])[0] as RecipientRow | undefined;
  if (!recipient) return null;

  const [data, shopName] = await Promise.all([
    fetchBusinessData(db, businessId),
    fetchShopName(db, businessId),
  ]);
  const config = rowToWinbackConfig(campaignRow);
  const customers = buildAudienceCustomers(data);
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) return null;

  const templatePool = config.templateText?.trim()
    ? [config.templateText.trim(), ...DEFAULT_WINBACK_TEMPLATES]
    : DEFAULT_WINBACK_TEMPLATES;
  const baseOffset = options.variantOffset ?? config.version;
  let candidate = personalize(customer, templatePool, {
    offerText: config.offerText,
    shopName,
    variantOffset: baseOffset,
  });
  if (candidate === recipient.message) {
    candidate = personalize(customer, templatePool, {
      offerText: config.offerText,
      shopName,
      variantOffset: baseOffset + 1,
    });
  }

  let usedAi = false;
  let rejectedReasons: string[] = [];
  if (options.useAiRewrite) {
    const rewritten = await attemptValidatedAiRewrite(candidate, config.offerText, customer.name);
    candidate = rewritten.text;
    usedAi = rewritten.usedAi;
    rejectedReasons = rewritten.rejectedReasons;
  }

  const { error: updateError } = await db
    .from("campaign_recipients")
    .update({ message: candidate })
    .eq("id", recipient.id);
  if (updateError) throw new Error(updateError.message);

  const bumped = await bumpCampaignVersionDb(db, businessId, campaignRow);
  const discountPercent = extractDiscountPercent(config.offerText, 15);

  return {
    message: {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      previousPurchase: customer.previousPurchase ?? null,
      productCategory: customer.productCategory ?? null,
      lastPurchaseAt: customer.lastPurchaseAt ?? null,
      customerSegment: customer.segment,
      discountPercent,
      message: candidate,
      status: "queued",
      skipReason: null,
      result: null,
    },
    version: bumped.version ?? config.version + 1,
    approvedVersion: null,
    status: "draft",
    usedAi,
    rejectedReasons,
  };
}

export async function approveCampaignVersionDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
): Promise<VoiceCampaignDraft | null> {
  const { data: campaignRows, error } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (error) throw new Error(error.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow) return null;

  const approved = approveCampaign(rowToWinbackConfig(campaignRow));
  const { data: updated, error: updateError } = await db
    .from("campaigns")
    .update({
      approved_version: approved.approvedVersion,
      status: approved.status,
    })
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  return hydrateDraftDb(db, businessId, updated as CampaignRowWithSummary);
}

export async function cancelCampaignDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
): Promise<boolean> {
  const { data: campaignRows, error } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .limit(1);
  if (error) throw new Error(error.message);
  const campaignRow = (campaignRows ?? [])[0] as CampaignRowWithSummary | undefined;
  if (!campaignRow) return false;

  const cancelled = cancelCampaign(rowToWinbackConfig(campaignRow));
  const { error: updateError } = await db
    .from("campaigns")
    .update({
      approved_version: null,
      status: cancelled.status,
    })
    .eq("id", campaignId)
    .eq("business_id", businessId);
  if (updateError) throw new Error(updateError.message);
  return true;
}

export async function simulateSendCampaignDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
): Promise<{
  campaign: MarketingCampaign;
  executedCount: number;
  skippedCount: number;
  summary: string;
  recipients: PersonalizedCampaignMessage[];
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

  const [data, shopName, lastCampaignMap, recipientRes] = await Promise.all([
    fetchBusinessData(db, businessId),
    fetchShopName(db, businessId),
    fetchLastCampaignTimestampsDb(db, businessId, campaignId),
    db.from("campaign_recipients").select("*").eq("campaign_id", campaignId),
  ]);
  if (recipientRes.error) throw new Error(recipientRes.error.message);

  const config = rowToWinbackConfig(campaignRow);
  const messagesByCustomerId: Record<string, string> = {};
  for (const row of (recipientRes.data ?? []) as RecipientRow[]) {
    if (row.customer_id && row.message?.trim()) {
      messagesByCustomerId[row.customer_id] = row.message;
    }
  }

  const audienceCustomers = buildAudienceCustomers(data, lastCampaignMap);
  const sim = simulateSend({
    campaign: config,
    customers: audienceCustomers,
    messagesByCustomerId,
    shopName,
    now: new Date(data.asOf),
  });

  // Persist recomputed recipients cleanly with per-merchant business_id
  const { error: deleteErr } = await db
    .from("campaign_recipients")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("business_id", businessId);
  if (deleteErr) throw new Error(deleteErr.message);

  if (sim.recipients.length > 0) {
    const { error: insertErr } = await db.from("campaign_recipients").insert(
      sim.recipients.map((r) => ({
        business_id: businessId,
        campaign_id: campaignId,
        customer_id: r.customerId || null,
        customer_name: r.customerName,
        message: r.message,
        status: r.status,
        skip_reason: r.skipReason,
      })),
    );
    if (insertErr) throw new Error(insertErr.message);
  }

  // Record execution log in campaign_executions (demo mode, provider_message_id strictly null)
  const executedRecipients = sim.recipients.filter((r) => r.status === "demo_executed");
  if (executedRecipients.length > 0) {
    const { error: execError } = await db.from("campaign_executions").insert(
      executedRecipients.map((r) => ({
        business_id: businessId,
        campaign_id: campaignId,
        customer_id: r.customerId || null,
        execution_mode: "demo",
        execution_timestamp: sim.executedAt,
        audience_count: sim.executedCount,
        provider_message_id: null,
        execution_status: "demo_executed",
        message_body: r.message,
        provider_response: {
          simulated: true,
          mode: "demo",
          version: config.version,
          timestamp: sim.executedAt,
          disclaimer: "Simulated / Demo run recorded locally. No external message dispatch occurred.",
        },
      })),
    );
    if (execError) {
      console.warn("Could not write campaign_executions audit rows:", execError.message);
    }
  }

  const { data: updatedCampaign, error: updateErr } = await db
    .from("campaigns")
    .update({
      status: "demo_executed",
      execution_mode: "demo",
      audience_size: sim.executedCount,
      sent_count: 0,
      summary_message: sim.summary,
    })
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (updateErr) throw new Error(updateErr.message);

  const discountPercent = extractDiscountPercent(config.offerText, 15);
  return {
    campaign: mapCampaign(updatedCampaign as CampaignRow),
    executedCount: sim.executedCount,
    skippedCount: sim.skippedCount,
    summary: sim.summary,
    recipients: sim.recipients.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      previousPurchase: r.previousPurchase,
      productCategory: r.productCategory,
      lastPurchaseAt: r.lastPurchaseAt,
      customerSegment: r.customerSegment,
      discountPercent,
      message: r.message,
      status: r.status,
      skipReason: r.skipReason,
      result: r.detail,
      providerMessageId: null,
    })),
  };
}

/**
 * Legacy helper for single-step voice approval compatibility.
 */
export async function approveDraftDb(
  db: SupabaseClient,
  businessId: string,
  campaignId: string,
): Promise<{
  campaign: MarketingCampaign;
  successfulCount: number;
  failedCount: number;
} | null> {
  const approved = await approveCampaignVersionDb(db, businessId, campaignId);
  if (!approved) return null;
  const sim = await simulateSendCampaignDb(db, businessId, campaignId);
  if (!sim) return null;
  return {
    campaign: sim.campaign,
    successfulCount: sim.executedCount,
    failedCount: sim.skippedCount,
  };
}

export async function getCampaignHistoryDb(
  db: SupabaseClient,
  businessId: string,
): Promise<CampaignExecutionRecord[]> {
  const [campaignsRes, data] = await Promise.all([
    db
      .from("campaigns")
      .select("*")
      .eq("business_id", businessId)
      .in("status", ["demo_executed", "cancelled", "simulated", "completed"])
      .order("created_at", { ascending: false }),
    fetchBusinessData(db, businessId),
  ]);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);

  const audienceById = new Map(
    buildAudienceCustomers(data).map((customer) => [customer.id, customer]),
  );

  const records: CampaignExecutionRecord[] = [];
  for (const raw of (campaignsRes.data ?? []) as CampaignRowWithSummary[]) {
    const { data: recipientRows } = await db
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", raw.id);
    const recipients = (recipientRows ?? []) as RecipientRow[];
    const config = rowToWinbackConfig(raw);
    const discount = extractDiscountPercent(config.offerText, 15);
    const mapped = recipients.map((row) => {
      const cust = row.customer_id ? audienceById.get(row.customer_id) : undefined;
      return recipientRowToMessage(row, discount, {
        phone: cust?.phone,
        previousPurchase: cust?.previousPurchase,
        productCategory: cust?.productCategory,
        lastPurchaseAt: cust?.lastPurchaseAt,
        customerSegment: cust?.segment,
      });
    });

    const executedCount = mapped.filter((r) => r.status === "demo_executed").length;
    const skippedCount = mapped.filter((r) => r.status === "skipped").length;

    records.push({
      campaignId: raw.id,
      draftId: raw.id,
      campaign: mapCampaign(raw as CampaignRow),
      executionMode: raw.execution_mode === "whatsapp" ? "whatsapp" : "demo",
      executedAt: raw.updated_at ?? raw.created_at,
      successfulCount: executedCount,
      failedCount: 0,
      skippedCount,
      version: config.version,
      approvedVersion: config.approvedVersion,
      offerText: config.offerText,
      targetSegment: config.targetSegment,
      messages: mapped,
      status: raw.status as CampaignExecutionRecord["status"],
    });
  }
  return records;
}

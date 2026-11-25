import { createDemoData } from "./seed";
import type {
  CampaignStatus,
  DemoData,
  InventoryMovement,
  MarketingCampaign,
  Product,
  SupplierOrderDraft,
} from "./types";
import { buildAudienceCustomers, extractDiscountPercent } from "../campaigns/audience-builder";
import {
  approveCampaign,
  cancelCampaign,
  computeAudience,
  DEFAULT_WINBACK_TEMPLATES,
  editCampaign,
  editCampaignMessage,
  HOLD_BACK_REASON_LABELS,
  personalize,
  simulateSend,
  type HoldBackReason,
  type MarketingConsent,
  type WinbackCampaignConfig,
  type WinbackCampaignStatus,
  type WinbackSegment,
} from "../campaigns/winback";

export interface PersonalizedCampaignMessage {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  previousPurchase: string | null;
  productCategory: string | null;
  lastPurchaseAt: string | null;
  customerSegment: string;
  discountPercent: number;
  message: string;
  status: "queued" | "draft" | "approved" | "demo_executed" | "skipped" | "simulated" | "failed";
  skipReason?: string | null;
  result: string | null;
  providerMessageId?: string | null;
}

export interface HeldBackSummaryItem {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerSegment: string;
  marketingConsent: MarketingConsent;
  optedOutAt: string | null;
  reason: HoldBackReason;
  reasonLabel: string;
  detail: string;
}

export interface VoiceCampaignDraft {
  id: string;
  campaign: MarketingCampaign;
  message: string;
  eligibleCustomerIds: string[];
  createdAt: string;
  discountPercent: number;
  messages: PersonalizedCampaignMessage[];
  version?: number;
  approvedVersion?: number | null;
  status?: WinbackCampaignStatus;
  targetSegment?: WinbackSegment;
  offerText?: string;
  templateText?: string;
  cooldownDays?: number;
  messageCap?: number;
  eligibleCount?: number;
  heldBackCount?: number;
  heldBack?: HeldBackSummaryItem[];
  reasonCounts?: Record<HoldBackReason, number>;
  variantOffsets?: Record<string, number>;
}

export interface CampaignExecutionRecord {
  campaignId: string;
  draftId: string;
  campaign: MarketingCampaign;
  executionMode?: "demo" | "whatsapp";
  executedAt: string;
  successfulCount: number;
  failedCount: number;
  skippedCount?: number;
  version?: number;
  approvedVersion?: number | null;
  offerText?: string;
  targetSegment?: WinbackSegment;
  messages: PersonalizedCampaignMessage[];
  status: CampaignStatus;
}

export interface CreateWinbackDraftInput {
  name?: string;
  targetSegment?: WinbackSegment;
  offerText?: string;
  discountPercent?: number;
  cooldownDays?: number;
  messageCap?: number;
  templateText?: string;
  shopName?: string;
}

interface ServerDemoState {
  data: DemoData;
  pendingCampaign: VoiceCampaignDraft | null;
  campaignHistory: CampaignExecutionRecord[];
}

const globalForDemoData = globalThis as typeof globalThis & {
  __dukaanServerDemoState?: ServerDemoState;
};

function getState(): ServerDemoState {
  if (!globalForDemoData.__dukaanServerDemoState) {
    globalForDemoData.__dukaanServerDemoState = {
      data: createDemoData(),
      pendingCampaign: null,
      campaignHistory: [],
    };
  }
  return globalForDemoData.__dukaanServerDemoState;
}

export function getServerDemoData(): DemoData {
  const state = getState();
  state.data.asOf = new Date().toISOString();
  return state.data;
}

export function updateServerInventory(
  products: Product[],
  inventoryMovements: InventoryMovement[],
  supplierOrders: SupplierOrderDraft[],
): void {
  const data = getState().data;
  data.products = products;
  data.inventoryMovements = inventoryMovements;
  data.supplierOrders = supplierOrders;
  data.asOf = new Date().toISOString();
}

export function getPendingVoiceCampaign(): VoiceCampaignDraft | null {
  return getState().pendingCampaign;
}

export function getCampaignHistory(): CampaignExecutionRecord[] {
  return getState().campaignHistory;
}

export function savePendingVoiceCampaign(draft: VoiceCampaignDraft): void {
  const normalized: VoiceCampaignDraft = {
    ...draft,
    version: draft.version ?? draft.campaign.version ?? 1,
    approvedVersion: draft.approvedVersion ?? draft.campaign.approvedVersion ?? null,
    status: (draft.status ?? (draft.campaign.status === "approved" ? "approved" : "draft")) as WinbackCampaignStatus,
    targetSegment: draft.targetSegment ?? draft.campaign.targetSegment ?? "inactive",
    offerText: draft.offerText ?? draft.campaign.offerText ?? `${draft.discountPercent}% off`,
    templateText: draft.templateText ?? draft.campaign.templateText ?? "",
    cooldownDays: draft.cooldownDays ?? draft.campaign.cooldownDays ?? 14,
    messageCap: draft.messageCap ?? draft.campaign.messageCap ?? 50,
    eligibleCount: draft.eligibleCount ?? draft.messages.length,
    heldBackCount: draft.heldBackCount ?? draft.heldBack?.length ?? 0,
    heldBack: draft.heldBack ?? [],
    variantOffsets: draft.variantOffsets ?? {},
  };
  getState().pendingCampaign = normalized;
}

function getLastCampaignTimestamps(history: readonly CampaignExecutionRecord[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const record of history) {
    if (record.status !== "demo_executed" && record.status !== "simulated") continue;
    for (const msg of record.messages) {
      if (msg.status !== "demo_executed" && msg.status !== "simulated") continue;
      const existing = latest.get(msg.customerId);
      if (!existing || record.executedAt > existing) {
        latest.set(msg.customerId, record.executedAt);
      }
    }
  }
  return latest;
}

function toWinbackConfig(draft: VoiceCampaignDraft): WinbackCampaignConfig {
  return {
    id: draft.campaign.id,
    name: draft.campaign.name,
    targetSegment: draft.targetSegment ?? "inactive",
    offerText: draft.offerText ?? `${draft.discountPercent}% off`,
    templateText: draft.templateText ?? "",
    cooldownDays: draft.cooldownDays ?? 14,
    messageCap: draft.messageCap ?? 50,
    version: draft.version ?? 1,
    approvedVersion: draft.approvedVersion ?? null,
    status: draft.status ?? "draft",
  };
}

function buildDraftFromConfig(
  data: DemoData,
  history: readonly CampaignExecutionRecord[],
  config: WinbackCampaignConfig,
  draftId: string,
  createdAt: string,
  existingMessages: Readonly<Record<string, string>> = {},
  variantOffsets: Record<string, number> = {},
  shopName = "our store",
): VoiceCampaignDraft {
  const now = new Date(data.asOf);
  const audienceCustomers = buildAudienceCustomers(data, getLastCampaignTimestamps(history));
  const audience = computeAudience(audienceCustomers, config, now);
  const discountPercent = extractDiscountPercent(config.offerText, 15);
  const templateInput = config.templateText?.trim() ? config.templateText.trim() : DEFAULT_WINBACK_TEMPLATES;

  const messages: PersonalizedCampaignMessage[] = audience.eligible.map((customer) => ({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    previousPurchase: customer.previousPurchase ?? null,
    productCategory: customer.productCategory ?? null,
    lastPurchaseAt: customer.lastPurchaseAt ?? null,
    customerSegment: customer.segment,
    discountPercent,
    message:
      existingMessages[customer.id]?.trim() ||
      personalize(customer, templateInput, {
        offerText: config.offerText,
        shopName,
        variantOffset: variantOffsets[customer.id] ?? 0,
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

  const campaign: MarketingCampaign = {
    id: config.id,
    name: config.name,
    channel: "WhatsApp",
    status: config.status,
    executionMode: "demo",
    version: config.version,
    approvedVersion: config.approvedVersion,
    offerText: config.offerText,
    targetSegment: config.targetSegment,
    templateText: config.templateText ?? "",
    cooldownDays: config.cooldownDays,
    messageCap: config.messageCap,
    startDate: createdAt,
    endDate: createdAt,
    budget: 0,
    audienceSize: messages.length,
    sentCount: 0,
    conversions: 0,
    revenue: 0,
  };

  return {
    id: draftId,
    campaign,
    message: `Simulated / Demo draft v${config.version}: ${messages.length} eligible, ${heldBack.length} held back.`,
    eligibleCustomerIds: messages.map((m) => m.customerId),
    createdAt,
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
    variantOffsets,
  };
}

export function createWinbackDraftInStore(input: CreateWinbackDraftInput): VoiceCampaignDraft {
  const state = getState();
  state.data.asOf = new Date().toISOString();
  const discountPercent = input.discountPercent ?? extractDiscountPercent(input.offerText ?? "", 15);
  const offerText = input.offerText?.trim() || `${discountPercent}% off your next order`;
  const targetSegment: WinbackSegment = input.targetSegment ?? "inactive";
  const cooldownDays = input.cooldownDays ?? 14;
  const messageCap = input.messageCap ?? 50;
  const templateText = input.templateText?.trim() ?? "";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const name =
    input.name?.trim() ||
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

  const draft = buildDraftFromConfig(
    state.data,
    state.campaignHistory,
    config,
    id,
    now,
    {},
    {},
    input.shopName ?? "our store",
  );
  state.pendingCampaign = draft;
  return draft;
}

export function updatePendingCampaignMessage(
  draftId: string,
  customerId: string,
  message: string,
): VoiceCampaignDraft | null {
  const state = getState();
  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return null;
  const customerMessage = draft.messages.find((entry) => entry.customerId === customerId);
  if (!customerMessage) return null;

  const config = toWinbackConfig(draft);
  const currentMap: Record<string, string> = {};
  for (const entry of draft.messages) currentMap[entry.customerId] = entry.message;

  const edited = editCampaignMessage(config, currentMap, customerId, message);
  draft.version = edited.campaign.version;
  draft.approvedVersion = edited.campaign.approvedVersion;
  draft.status = edited.campaign.status;
  draft.campaign = {
    ...draft.campaign,
    version: edited.campaign.version,
    approvedVersion: edited.campaign.approvedVersion,
    status: edited.campaign.status,
  };
  customerMessage.message = edited.messagesByCustomerId[customerId]!;
  return draft;
}

export function updatePendingCampaignSettings(
  draftId: string,
  patch: Partial<
    Pick<
      WinbackCampaignConfig,
      "name" | "targetSegment" | "offerText" | "templateText" | "cooldownDays" | "messageCap"
    >
  >,
): VoiceCampaignDraft | null {
  const state = getState();
  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return null;

  state.data.asOf = new Date().toISOString();
  const nextConfig = editCampaign(toWinbackConfig(draft), patch);
  const existingMessages: Record<string, string> = {};
  const resetMessages = patch.offerText !== undefined || patch.templateText !== undefined;
  if (!resetMessages) {
    for (const msg of draft.messages) existingMessages[msg.customerId] = msg.message;
  }

  const rebuilt = buildDraftFromConfig(
    state.data,
    state.campaignHistory,
    nextConfig,
    draft.id,
    draft.createdAt,
    existingMessages,
    resetMessages ? {} : (draft.variantOffsets ?? {}),
  );
  state.pendingCampaign = rebuilt;
  return rebuilt;
}

export function approvePendingCampaignVersion(draftId: string): VoiceCampaignDraft | null {
  const state = getState();
  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return null;

  const approved = approveCampaign(toWinbackConfig(draft));
  draft.approvedVersion = approved.approvedVersion;
  draft.status = approved.status;
  draft.campaign = {
    ...draft.campaign,
    approvedVersion: approved.approvedVersion,
    status: approved.status,
  };
  return draft;
}

export function cancelPendingCampaign(draftId: string): boolean {
  const state = getState();
  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return false;
  const cancelled = cancelCampaign(toWinbackConfig(draft));
  const record: CampaignExecutionRecord = {
    campaignId: draft.campaign.id,
    draftId: draft.id,
    campaign: {
      ...draft.campaign,
      status: cancelled.status,
      approvedVersion: null,
    },
    executionMode: "demo",
    executedAt: new Date().toISOString(),
    successfulCount: 0,
    failedCount: 0,
    skippedCount: draft.messages.length + (draft.heldBackCount ?? 0),
    version: cancelled.version,
    approvedVersion: null,
    offerText: cancelled.offerText,
    targetSegment: cancelled.targetSegment,
    messages: [],
    status: "cancelled",
  };
  state.data.campaigns = [...state.data.campaigns, record.campaign];
  state.campaignHistory = [...state.campaignHistory, record];
  state.pendingCampaign = null;
  return true;
}

export function simulatePendingCampaignInStore(
  draftId: string,
): { execution: CampaignExecutionRecord; duplicate: boolean; summary: string } | null {
  const state = getState();
  const previous = state.campaignHistory.find((record) => record.draftId === draftId);
  if (previous) {
    return {
      execution: previous,
      duplicate: true,
      summary: "This campaign was already recorded in Simulated / Demo history.",
    };
  }

  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return null;

  state.data.asOf = new Date().toISOString();
  const config = toWinbackConfig(draft);
  const audienceCustomers = buildAudienceCustomers(
    state.data,
    getLastCampaignTimestamps(state.campaignHistory),
  );
  const messagesByCustomerId: Record<string, string> = {};
  for (const m of draft.messages) {
    messagesByCustomerId[m.customerId] = m.message;
  }

  const sim = simulateSend({
    campaign: config,
    customers: audienceCustomers,
    messagesByCustomerId,
    now: new Date(state.data.asOf),
  });

  const discountPercent = extractDiscountPercent(config.offerText, draft.discountPercent);
  const mappedMessages: PersonalizedCampaignMessage[] = sim.recipients.map((r) => ({
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
  }));

  const campaign: MarketingCampaign = {
    ...draft.campaign,
    status: "demo_executed",
    executionMode: "demo",
    version: config.version,
    approvedVersion: config.approvedVersion,
    audienceSize: sim.executedCount,
    sentCount: 0,
  };

  const execution: CampaignExecutionRecord = {
    campaignId: campaign.id,
    draftId,
    campaign,
    executionMode: "demo",
    executedAt: sim.executedAt,
    successfulCount: sim.executedCount,
    failedCount: 0,
    skippedCount: sim.skippedCount,
    version: config.version,
    approvedVersion: config.approvedVersion,
    offerText: config.offerText,
    targetSegment: config.targetSegment,
    messages: mappedMessages,
    status: "demo_executed",
  };

  state.data.campaigns = [...state.data.campaigns, campaign];
  state.campaignHistory = [...state.campaignHistory, execution];
  state.pendingCampaign = null;
  return { execution, duplicate: false, summary: sim.summary };
}

/**
 * Legacy single-step demo execution retained for voice tool / existing tests.
 */
export function recordCampaignExecution(
  draftId: string,
): { execution: CampaignExecutionRecord; duplicate: boolean } | null {
  const state = getState();
  const previous = state.campaignHistory.find((record) => record.draftId === draftId);
  if (previous) return { execution: previous, duplicate: true };

  const draft = state.pendingCampaign;
  if (!draft || draft.id !== draftId) return null;

  const executedAt = new Date().toISOString();
  const messages = draft.messages.map((entry) => {
    const succeeded = Boolean(
      state.data.customers.some((customer) => customer.id === entry.customerId) &&
        entry.message.trim(),
    );
    return {
      ...entry,
      status: succeeded ? ("demo_executed" as const) : ("skipped" as const),
      skipReason: succeeded ? null : "empty_message",
      result: succeeded
        ? "Simulated / Demo run recorded locally. No external message dispatch occurred."
        : "Skipped during Simulated / Demo validation.",
      providerMessageId: null,
    };
  });
  const successfulCount = messages.filter((entry) => entry.status === "demo_executed").length;
  const failedCount = messages.filter((entry) => entry.status === "skipped").length;
  const campaign: MarketingCampaign = {
    ...draft.campaign,
    status: "demo_executed",
    executionMode: "demo",
    version: draft.version ?? 1,
    approvedVersion: draft.version ?? 1,
    sentCount: 0,
  };
  const execution: CampaignExecutionRecord = {
    campaignId: campaign.id,
    draftId,
    campaign,
    executionMode: "demo",
    executedAt,
    successfulCount,
    failedCount,
    skippedCount: failedCount,
    version: campaign.version,
    approvedVersion: campaign.approvedVersion,
    offerText: draft.offerText,
    targetSegment: draft.targetSegment,
    messages,
    status: "demo_executed",
  };

  state.data.campaigns = [...state.data.campaigns, campaign];
  state.campaignHistory = [...state.campaignHistory, execution];
  state.pendingCampaign = null;
  return { execution, duplicate: false };
}

export function approveVoiceCampaign(draftId: string): MarketingCampaign | null {
  return recordCampaignExecution(draftId)?.execution.campaign ?? null;
}

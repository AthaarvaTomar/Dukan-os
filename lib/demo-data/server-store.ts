import { createDemoData } from "./seed";
import type {
  CampaignStatus,
  DemoData,
  InventoryMovement,
  MarketingCampaign,
  Product,
  SupplierOrderDraft,
} from "./types";

export interface PersonalizedCampaignMessage {
  customerId: string;
  customerName: string;
  previousPurchase: string | null;
  productCategory: string | null;
  lastPurchaseAt: string | null;
  customerSegment: string;
  discountPercent: number;
  message: string;
  status: "draft" | "approved" | "demo_executed" | "simulated" | "failed";
  result: string | null;
  providerMessageId?: string | null;
}

export interface VoiceCampaignDraft {
  id: string;
  campaign: MarketingCampaign;
  message: string;
  eligibleCustomerIds: string[];
  createdAt: string;
  discountPercent: number;
  messages: PersonalizedCampaignMessage[];
}

export interface CampaignExecutionRecord {
  campaignId: string;
  draftId: string;
  campaign: MarketingCampaign;
  executionMode?: "demo" | "whatsapp";
  executedAt: string;
  successfulCount: number;
  failedCount: number;
  messages: PersonalizedCampaignMessage[];
  status: CampaignStatus;
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
  getState().pendingCampaign = draft;
}

export function updatePendingCampaignMessage(
  draftId: string,
  customerId: string,
  message: string,
): VoiceCampaignDraft | null {
  const draft = getState().pendingCampaign;
  if (!draft || draft.id !== draftId) return null;
  const customerMessage = draft.messages.find((entry) => entry.customerId === customerId);
  if (!customerMessage) return null;
  customerMessage.message = message;
  return draft;
}

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
      status: succeeded ? ("demo_executed" as const) : ("failed" as const),
      result: succeeded
        ? "Demo executed successfully; no message was sent."
        : "Simulation failed validation.",
      providerMessageId: null,
    };
  });
  const successfulCount = messages.filter((entry) => entry.status === "demo_executed").length;
  const failedCount = messages.filter((entry) => entry.status === "failed").length;
  const campaign: MarketingCampaign = {
    ...draft.campaign,
    status: "demo_executed",
    executionMode: "demo",
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

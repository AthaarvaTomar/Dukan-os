"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  LoaderCircle,
  Lock,
  Megaphone,
  Pencil,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CampaignMessage {
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
}

interface CampaignDraft {
  id: string;
  campaign: {
    id: string;
    name: string;
    channel: string;
    status: string;
    audienceSize: number;
    executionMode?: "demo" | "whatsapp";
  };
  message: string;
  eligibleCustomerCount: number;
  discountPercent: number;
  messages: CampaignMessage[];
}

interface CampaignHistory {
  id: string;
  name: string;
  channel: string;
  status: string;
  executionMode?: "demo" | "whatsapp";
  audienceSize: number;
  successfulCount: number | null;
  failedCount: number | null;
  messages: CampaignMessage[];
}

function formatDate(value: string | null): string {
  if (!value) return "No previous purchase";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function campaignErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Campaign request failed.";
}

export function MarketingCampaigns() {
  const [campaign, setCampaign] = useState<CampaignDraft | null>(null);
  const [history, setHistory] = useState<CampaignHistory[]>([]);
  const [executionMode, setExecutionMode] = useState<"demo" | "whatsapp">("demo");
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string>(
    "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/voice/campaigns/settings", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          mode: "demo" | "whatsapp";
          isWhatsAppConfigured: boolean;
          message: string;
        };
        setExecutionMode(data.mode ?? "demo");
        setIsWhatsAppConfigured(Boolean(data.isWhatsAppConfigured));
        if (data.message) {
          setSettingsNotice(data.message);
        }
      }
    } catch {
      // Retain default safe settings
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadSettings();
      const response = await fetch("/api/voice/campaigns", { cache: "no-store" });
      if (!response.ok) throw new Error("Campaign data could not be loaded.");
      const result: {
        pending: CampaignDraft | null;
        campaigns: CampaignHistory[];
      } = await response.json();
      setCampaign(result.pending);
      setHistory(result.campaigns);
      setError(null);
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [loadSettings]);

  const handleSelectMode = (mode: "demo" | "whatsapp") => {
    if (mode === "whatsapp" && !isWhatsAppConfigured) {
      setError("Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.");
      return;
    }
    setExecutionMode(mode);
  };

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const createCampaign = async () => {
    setIsCreating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/voice/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountPercent: 15 }),
      });
      const result: { pending?: CampaignDraft; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Campaign draft could not be created.");
      if (!result.pending) throw new Error("The campaign draft response was incomplete.");
      setCampaign(result.pending);
      setNotice(`${result.pending.eligibleCustomerCount} personalized messages are ready for review.`);
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsCreating(false);
    }
  };

  const beginEditing = (message: CampaignMessage) => {
    setEditingCustomerId(message.customerId);
    setEditedMessage(message.message);
  };

  const saveMessage = async (customerId: string) => {
    if (!campaign) return;
    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, message: editedMessage }),
      });
      const result: { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Message could not be updated.");
      setCampaign((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((entry) =>
                entry.customerId === customerId
                  ? { ...entry, message: result.message ?? editedMessage }
                  : entry,
              ),
            }
          : current,
      );
      setEditingCustomerId(null);
      setNotice("Personalized message updated.");
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    }
  };

  const regenerateMessage = async (customerId: string) => {
    if (!campaign) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/voice/campaigns/${campaign.id}/messages/${customerId}/regenerate`,
        { method: "POST" },
      );
      const regenerated: CampaignMessage & { error?: string } = await response.json();
      if (!response.ok) throw new Error(regenerated.error ?? "Message could not be regenerated.");
      setCampaign((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((entry) =>
                entry.customerId === customerId ? regenerated : entry,
              ),
            }
          : current,
      );
      setNotice(`Message for ${regenerated.customerName} was regenerated from purchase history.`);
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    }
  };

  const executeCampaign = async () => {
    if (!campaign || isExecuting) return;
    setIsExecuting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/voice/campaigns/${campaign.id}/approve`,
        { method: "POST" },
      );
      const result: {
        successfulCount?: number;
        failedCount?: number;
        message?: string;
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Campaign simulation failed.");
      setNotice(
        `${result.message} ${result.successfulCount ?? 0} successful, ${result.failedCount ?? 0} failed.`,
      );
      setCampaign(null);
      await refresh();
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lime-700">DukaanOS workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            Marketing Campaigns
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create relevant offers from real customer purchases, review every message, and simulate safely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createCampaign()}
          disabled={isCreating || Boolean(campaign)}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Megaphone size={16} aria-hidden="true" />
          )}
          Create 15% campaign
        </button>
      </header>

      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Campaign Execution Settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Campaign Execution Mode</h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Active: {executionMode === "demo" ? "Simulated / Demo" : "Real WhatsApp"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Configure whether approved campaigns run in safe simulation or dispatch via Meta Cloud API.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectMode("demo")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                executionMode === "demo"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Check size={14} className={executionMode === "demo" ? "opacity-100" : "opacity-0"} aria-hidden="true" />
              Simulated / Demo
            </button>

            <button
              type="button"
              onClick={() => handleSelectMode("whatsapp")}
              disabled={!isWhatsAppConfigured}
              title={
                !isWhatsAppConfigured
                  ? "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode."
                  : "Switch to official WhatsApp Cloud API sending"
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                executionMode === "whatsapp"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : isWhatsAppConfigured
                    ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400 opacity-75"
              }`}
            >
              {!isWhatsAppConfigured ? (
                <Lock size={12} className="text-slate-400" aria-hidden="true" />
              ) : (
                <Check size={14} className={executionMode === "whatsapp" ? "opacity-100" : "opacity-0"} aria-hidden="true" />
              )}
              Real WhatsApp
              {!isWhatsAppConfigured && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Not Configured
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Clear status notice for WhatsApp configuration */}
        {!isWhatsAppConfigured && (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            <Info size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber-950">
                {settingsNotice}
              </p>
              <p className="mt-0.5 text-amber-800">
                Meta WhatsApp Cloud API credentials (access token, phone number ID, and app secret) must be configured on the server before live customer messaging can be enabled.
              </p>
            </div>
          </div>
        )}
      </section>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Loading campaign history…
        </p>
      )}

      {campaign && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-lime-700">Review before execution</p>
                <span className="rounded bg-lime-100 px-2 py-0.5 text-[11px] font-semibold text-lime-800">
                  Mode: Demo Only
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">{campaign.campaign.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {campaign.eligibleCustomerCount} eligible customers · {campaign.discountPercent}% discount · {campaign.campaign.channel}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Each message uses the customer&apos;s actual last purchase and category when available. No messages will be delivered.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void executeCampaign()}
              disabled={isExecuting || campaign.messages.length === 0}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-lime-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50"
            >
              {isExecuting ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              Approve demo campaign
            </button>
          </div>

          <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Users size={16} aria-hidden="true" />
              Preview all {campaign.messages.length} messages
            </p>
            <span className="text-xs text-slate-500">Each message can be edited or regenerated</span>
          </div>

          <div className="divide-y divide-slate-100">
            {campaign.messages.map((message) => (
              <article key={message.customerId} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{message.customerName}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Segment: {message.customerSegment}
                      {" · "}Last purchase: {formatDate(message.lastPurchaseAt)}
                      {" · "}Previous purchase: {message.previousPurchase ?? "No recorded purchase"}
                      {message.productCategory ? ` (${message.productCategory})` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void regenerateMessage(message.customerId)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      Regenerate
                    </button>
                    {editingCustomerId === message.customerId ? (
                      <button
                        type="button"
                        onClick={() => void saveMessage(message.customerId)}
                        disabled={!editedMessage.trim()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                      >
                        <Check size={14} aria-hidden="true" />
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEditing(message)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {editingCustomerId === message.customerId ? (
                  <label className="mt-3 block">
                    <span className="sr-only">Edit message for {message.customerName}</span>
                    <textarea
                      value={editedMessage}
                      onChange={(event) => setEditedMessage(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="w-full resize-y rounded-xl border border-lime-400 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none ring-2 ring-lime-100"
                    />
                  </label>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
                    {message.message}
                  </p>
                )}
              </article>
            ))}
            {campaign.messages.length === 0 && (
              <p className="p-6 text-sm text-slate-500">
                There are no customers eligible for this offer based on the last 30 days of purchase history.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Campaign history</h2>
            <p className="mt-0.5 text-xs text-slate-500">Simulated sends are recorded per customer; delivery is not claimed.</p>
          </div>
          <Send size={17} className="text-slate-400" aria-hidden="true" />
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No campaigns recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.slice().reverse().map((entry) => {
              const isExpanded = expandedCampaignId === entry.id;
              return (
                <article key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedCampaignId(isExpanded ? null : entry.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                  >
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      entry.status === "demo_executed" || entry.status === "simulated"
                        ? "bg-blue-50 text-blue-700"
                        : entry.status === "draft"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}>
                      {entry.status === "demo_executed" || entry.status === "simulated"
                        ? "Demo Executed"
                        : entry.status === "approved"
                          ? "Approved"
                          : entry.status}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{entry.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {entry.audienceSize} customers · {entry.channel} · Mode: {entry.executionMode === "whatsapp" ? "Real WhatsApp" : "Demo"}
                        {entry.successfulCount !== null
                          ? ` · ${entry.successfulCount} successful · ${entry.failedCount ?? 0} failed`
                          : ""}
                      </span>
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    ) : (
                      <ChevronDown size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 bg-slate-50 px-5 py-4">
                      {entry.messages.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          This existing campaign has no customer-wise simulation records.
                        </p>
                      ) : (
                        entry.messages.map((message) => (
                          <div key={message.customerId} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-800">{message.customerName}</p>
                              <span className={`text-xs font-medium ${
                                message.status === "demo_executed" || message.status === "simulated"
                                  ? "text-blue-700"
                                  : "text-red-700"
                              }`}>
                                {message.status === "demo_executed" || message.status === "simulated"
                                  ? "Demo Executed (Simulated)"
                                  : "Simulation failed"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{message.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Megaphone,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  HOLD_BACK_REASON_LABELS,
  type HoldBackReason,
  type WinbackSegment,
} from "@/lib/campaigns/winback";

interface CampaignMessage {
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
}

interface HeldBackItem {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerSegment: string;
  marketingConsent: string;
  optedOutAt: string | null;
  reason: HoldBackReason;
  reasonLabel: string;
  detail: string;
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
  eligibleCount?: number;
  heldBackCount?: number;
  heldBack?: HeldBackItem[];
  reasonCounts?: Record<HoldBackReason, number>;
  discountPercent: number;
  version?: number;
  approvedVersion?: number | null;
  status?: "draft" | "approved" | "demo_executed" | "cancelled";
  targetSegment?: WinbackSegment;
  offerText?: string;
  templateText?: string;
  cooldownDays?: number;
  messageCap?: number;
  messages: CampaignMessage[];
}

interface CampaignHistory {
  id: string;
  name: string;
  channel: string;
  status: string;
  executionMode?: "demo" | "whatsapp";
  version?: number;
  approvedVersion?: number | null;
  offerText?: string;
  targetSegment?: WinbackSegment;
  audienceSize: number;
  successfulCount: number | null;
  failedCount: number | null;
  skippedCount?: number;
  messages: CampaignMessage[];
}

const SEGMENT_OPTIONS: Array<{ value: WinbackSegment; label: string }> = [
  { value: "inactive", label: "Inactive customers" },
  { value: "all", label: "All customers" },
  { value: "regular", label: "Regular customers" },
  { value: "new", label: "New customers" },
  { value: "high-value", label: "High-value customers" },
];

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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Campaign form inputs
  const [campaignName, setCampaignName] = useState("");
  const [targetSegment, setTargetSegment] = useState<WinbackSegment>("inactive");
  const [offerText, setOfferText] = useState("15% off your next order");
  const [cooldownDays, setCooldownDays] = useState("14");
  const [messageCap, setMessageCap] = useState("50");
  const [templateText, setTemplateText] = useState("");
  const [showEditSettings, setShowEditSettings] = useState(false);

  // Message editing and panels
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [showHeldBackList, setShowHeldBackList] = useState(false);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const syncFormFromDraft = useCallback((draft: CampaignDraft | null) => {
    if (!draft) return;
    setCampaignName(draft.campaign.name ?? "");
    setTargetSegment(draft.targetSegment ?? "inactive");
    setOfferText(draft.offerText ?? `${draft.discountPercent}% off your next order`);
    setCooldownDays(String(draft.cooldownDays ?? 14));
    setMessageCap(String(draft.messageCap ?? 50));
    setTemplateText(draft.templateText ?? "");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/voice/campaigns", { cache: "no-store" });
      if (!response.ok) throw new Error("Campaign data could not be loaded.");
      const result: {
        pending: CampaignDraft | null;
        campaigns: CampaignHistory[];
      } = await response.json();
      setCampaign(result.pending);
      setHistory(result.campaigns);
      if (result.pending) syncFormFromDraft(result.pending);
      setError(null);
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [syncFormFromDraft]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const createCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating || campaign) return;
    setIsCreating(true);
    setError(null);
    setNotice(null);

    const parsedCooldown = Math.max(0, Math.floor(Number(cooldownDays) || 0));
    const parsedCap = Math.max(1, Math.floor(Number(messageCap) || 50));

    try {
      const response = await fetch("/api/voice/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim() || undefined,
          targetSegment,
          offerText: offerText.trim() || "15% off your next order",
          cooldownDays: parsedCooldown,
          messageCap: parsedCap,
          templateText: templateText.trim() || undefined,
        }),
      });
      const result: { pending?: CampaignDraft; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Campaign draft could not be created.");
      if (!result.pending) throw new Error("The campaign draft response was incomplete.");
      setCampaign(result.pending);
      syncFormFromDraft(result.pending);
      setNotice(
        `Simulated / Demo draft v${result.pending.version ?? 1} created: ${result.pending.eligibleCount ?? result.pending.messages.length} eligible, ${result.pending.heldBackCount ?? 0} held back.`,
      );
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsCreating(false);
    }
  };

  const updateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaign || isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    setError(null);
    setNotice(null);

    const parsedCooldown = Math.max(0, Math.floor(Number(cooldownDays) || 0));
    const parsedCap = Math.max(1, Math.floor(Number(messageCap) || 50));

    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim() || campaign.campaign.name,
          targetSegment,
          offerText: offerText.trim() || campaign.offerText,
          cooldownDays: parsedCooldown,
          messageCap: parsedCap,
          templateText: templateText.trim(),
        }),
      });
      const result: { pending?: CampaignDraft; error?: string } = await response.json();
      if (!response.ok || !result.pending) {
        throw new Error(result.error ?? "Campaign settings could not be updated.");
      }
      setCampaign(result.pending);
      syncFormFromDraft(result.pending);
      setShowEditSettings(false);
      setNotice(
        `Draft updated to v${result.pending.version ?? 1}. Approval was cleared; review and approve again before running Simulated / Demo execution.`,
      );
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const beginEditing = (message: CampaignMessage) => {
    setEditingCustomerId(message.customerId);
    setEditedMessage(message.message);
  };

  const saveMessage = async (customerId: string) => {
    if (!campaign) return;
    setError(null);
    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, message: editedMessage }),
      });
      const result: {
        message?: string;
        version?: number;
        approvedVersion?: number | null;
        status?: CampaignDraft["status"];
        pending?: CampaignDraft;
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Message could not be updated.");
      if (result.pending) {
        setCampaign(result.pending);
      } else {
        setCampaign((current) =>
          current
            ? {
                ...current,
                version: result.version ?? (current.version ?? 1) + 1,
                approvedVersion: null,
                status: "draft",
                messages: current.messages.map((entry) =>
                  entry.customerId === customerId
                    ? { ...entry, message: result.message ?? editedMessage }
                    : entry,
                ),
              }
            : current,
        );
      }
      setEditingCustomerId(null);
      setNotice(
        `Message saved (now v${result.version ?? (campaign.version ?? 1) + 1}). Prior approval cleared; approve this version before running Simulated / Demo execution.`,
      );
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    }
  };

  const regenerateMessage = async (customerId: string) => {
    if (!campaign || regeneratingId) return;
    setRegeneratingId(customerId);
    setError(null);
    try {
      const response = await fetch(
        `/api/voice/campaigns/${campaign.id}/messages/${customerId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useAiRewrite: false }),
        },
      );
      const regenerated: CampaignMessage & {
        version?: number;
        approvedVersion?: number | null;
        campaignStatus?: CampaignDraft["status"];
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(regenerated.error ?? "Message could not be regenerated.");
      setCampaign((current) =>
        current
          ? {
              ...current,
              version: regenerated.version ?? (current.version ?? 1) + 1,
              approvedVersion: null,
              status: "draft",
              messages: current.messages.map((entry) =>
                entry.customerId === customerId ? { ...entry, message: regenerated.message } : entry,
              ),
            }
          : current,
      );
      setNotice(
        `Message for ${regenerated.customerName} regenerated (v${regenerated.version ?? (campaign.version ?? 1) + 1}). Approval cleared.`,
      );
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleApproveVersion = async () => {
    if (!campaign || isApproving) return;
    setIsApproving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const result: { pending?: CampaignDraft; message?: string; error?: string } =
        await response.json();
      if (!response.ok || !result.pending) {
        throw new Error(result.error ?? "Approval failed.");
      }
      setCampaign(result.pending);
      setNotice(
        result.message ??
          `Version v${result.pending.version ?? 1} approved for Simulated / Demo execution.`,
      );
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsApproving(false);
    }
  };

  const handleSimulateSend = async () => {
    if (!campaign || isSimulating) return;
    setIsSimulating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}/simulate`, {
        method: "POST",
      });
      const result: {
        executedCount?: number;
        skippedCount?: number;
        message?: string;
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Simulated / Demo run failed.");
      setNotice(
        result.message ??
          `Simulated / Demo run complete: ${result.executedCount ?? 0} demo_executed, ${result.skippedCount ?? 0} skipped.`,
      );
      setCampaign(null);
      setShowEditSettings(false);
      setShowHeldBackList(false);
      await refresh();
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCancelDraft = async () => {
    if (!campaign || isCancelling) return;
    setIsCancelling(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/voice/campaigns/${campaign.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const result: { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Draft could not be cancelled.");
      setCampaign(null);
      setShowEditSettings(false);
      setNotice(result.message ?? "Campaign draft cancelled.");
      await refresh();
    } catch (requestError) {
      setError(campaignErrorMessage(requestError));
    } finally {
      setIsCancelling(false);
    }
  };

  const currentVersion = campaign?.version ?? 1;
  const approvedVersion = campaign?.approvedVersion ?? null;
  const isCurrentVersionApproved =
    Boolean(campaign) &&
    campaign?.status === "approved" &&
    approvedVersion !== null &&
    approvedVersion === currentVersion;

  const heldBackItems = campaign?.heldBack ?? [];
  const reasonEntries = Object.entries(campaign?.reasonCounts ?? {}).filter(
    ([, count]) => count > 0,
  ) as Array<[HoldBackReason, number]>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-9">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Marketing campaigns
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              Simulated / Demo
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Filter eligible customers by segment, phone, consent, opt-out, cooldown, and cap. Review and approve a version before running a Simulated / Demo execution.
          </p>
        </div>
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

      {/* Segment & Offer Builder Form (shown when no active draft exists) */}
      {!isLoading && !campaign && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">New campaign draft</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Choose a target segment, offer text, cooldown window, and message cap.
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Simulated / Demo
            </span>
          </div>

          <form onSubmit={createCampaign} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Target segment
                <select
                  value={targetSegment}
                  onChange={(event) => setTargetSegment(event.target.value as WinbackSegment)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                >
                  {SEGMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                Offer 
                <input
                  required
                  value={offerText}
                  onChange={(event) => setOfferText(event.target.value)}
                  placeholder="e.g. 15% off your next order"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="block text-xs font-medium text-slate-600">
                Campaign name (optional)
                <input
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Auto-filled from offer and segment"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-600">
                  Cooldown days
                  <input
                    required
                    type="number"
                    min={0}
                    max={365}
                    value={cooldownDays}
                    onChange={(event) => setCooldownDays(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  Message cap
                  <input
                    required
                    type="number"
                    min={1}
                    max={5000}
                    value={messageCap}
                    onChange={(event) => setMessageCap(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Custom message template (optional, supports {"{{name}}"}, {"{{offer}}"}, {"{{category}}"}, {"{{shop}}"})
              <input
                value={templateText}
                onChange={(event) => setTemplateText(event.target.value)}
                placeholder="Leave blank to choose a deterministic variant per customer"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isCreating ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Megaphone size={16} aria-hidden="true" />
              )}
              Create Campaign
            </button>
          </form>
        </section>
      )}

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Loading campaigns...
        </p>
      )}

      {/* Active Draft Review, Audience Breakdown, Editing, Approval & Simulate Send */}
      {campaign && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    Simulated / Demo
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    Version v{currentVersion}
                  </span>
                  {isCurrentVersionApproved ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      <ShieldCheck size={12} aria-hidden="true" />
                      Approved v{approvedVersion}
                    </span>
                  ) : (
                    <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                      Approval required
                    </span>
                  )}
                </div>

                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  {campaign.campaign.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Segment: {campaign.targetSegment ?? "inactive"} · Offer: {campaign.offerText ?? `${campaign.discountPercent}% off`} · Cooldown: {campaign.cooldownDays ?? 14} days · Cap: {campaign.messageCap ?? 50}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditSettings((prev) => !prev)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil size={14} aria-hidden="true" />
                  {showEditSettings ? "Close settings" : "Edit settings"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleApproveVersion()}
                  disabled={isApproving || isCurrentVersionApproved}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isApproving ? (
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Check size={14} aria-hidden="true" />
                  )}
                  {isCurrentVersionApproved ? `Approved v${currentVersion}` : `Review and approve v${currentVersion}`}
                </button>

                <button
                  type="button"
                  onClick={() => void handleSimulateSend()}
                  disabled={isSimulating || !isCurrentVersionApproved}
                  title={
                    isCurrentVersionApproved
                      ? "Run Simulated / Demo execution"
                      : "Approve the current version before simulating"
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-lime-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSimulating ? (
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={14} aria-hidden="true" />
                  )}
                  Run Simulated / Demo
                </button>

                <button
                  type="button"
                  onClick={() => void handleCancelDraft()}
                  disabled={isCancelling}
                  className="inline-flex h-10 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <X size={14} aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </div>

            {showEditSettings && (
              <form
                onSubmit={updateSettings}
                className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-xs font-medium text-slate-700">
                  Saving settings increments the campaign version to v{currentVersion + 1} and clears approval.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs font-medium text-slate-600">
                    Segment
                    <select
                      value={targetSegment}
                      onChange={(event) => setTargetSegment(event.target.value as WinbackSegment)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    >
                      {SEGMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Offer text
                    <input
                      required
                      value={offerText}
                      onChange={(event) => setOfferText(event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Cooldown days
                    <input
                      required
                      type="number"
                      min={0}
                      max={365}
                      value={cooldownDays}
                      onChange={(event) => setCooldownDays(event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Message cap
                    <input
                      required
                      type="number"
                      min={1}
                      max={5000}
                      value={messageCap}
                      onChange={(event) => setMessageCap(event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isUpdatingSettings}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isUpdatingSettings && <LoaderCircle size={13} className="animate-spin" />}
                    Save settings (v{currentVersion + 1})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditSettings(false)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600"
                  >
                    Close
                  </button>
                </div>
              </form>
            )}

            {/* Eligible vs Held-back Summary */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <p className="text-xs font-medium text-emerald-800">Eligible recipients</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {campaign.eligibleCount ?? campaign.messages.length}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Passed segment, phone, consent, opt-out, cooldown, and cap checks.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-600">Held back</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">
                      {campaign.heldBackCount ?? heldBackItems.length}
                    </p>
                  </div>
                  {heldBackItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHeldBackList((prev) => !prev)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {showHeldBackList ? "Hide list" : "View reasons"}
                      {showHeldBackList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>
                {reasonEntries.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasonEntries.map(([reason, count]) => (
                      <span
                        key={reason}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200"
                      >
                        {HOLD_BACK_REASON_LABELS[reason]}: {count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500">No customers held back.</p>
                )}
              </div>
            </div>

            {showHeldBackList && heldBackItems.length > 0 && (
              <div className="mt-3 max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {heldBackItems.map((item) => (
                  <div
                    key={item.customerId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{item.customerName}</span>
                      <span className="ml-2 text-slate-500">
                        {item.customerSegment} · consent: {item.marketingConsent}
                      </span>
                      <p className="mt-0.5 text-slate-500">{item.detail}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                      {item.reasonLabel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Users size={16} aria-hidden="true" />
              Queued messages ({campaign.messages.length}) · Simulated / Demo
            </p>
            <span className="text-xs text-slate-500">
              Editing or regenerating increments version and clears approval
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {campaign.messages.map((message) => (
              <article key={message.customerId} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{message.customerName}</h3>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {message.status}
                      </span>
                    </div>
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
                      disabled={regeneratingId === message.customerId}
                      onClick={() => void regenerateMessage(message.customerId)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        className={regeneratingId === message.customerId ? "animate-spin" : undefined}
                        aria-hidden="true"
                      />
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
                No eligible customers matched the current segment, phone, consent, opt-out, cooldown, and cap rules. Inspect the held-back reasons above or adjust campaign settings.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Campaign History */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Campaign history (Simulated / Demo)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Recorded per customer as demo_executed or skipped with skip reasons.
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Simulated / Demo
          </span>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No Simulated / Demo campaigns recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((entry) => {
              const isExpanded = expandedCampaignId === entry.id;
              const isCancelled = entry.status === "cancelled";
              const executedCount = entry.successfulCount ?? 0;
              const skippedCount =
                entry.skippedCount ??
                entry.messages.filter((m) => m.status === "skipped").length;

              return (
                <article key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedCampaignId(isExpanded ? null : entry.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                  >
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isCancelled
                          ? "bg-slate-100 text-slate-600"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {isCancelled ? "Cancelled" : "Simulated / Demo"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {entry.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        v{entry.version ?? 1} · {entry.channel} · {executedCount} demo_executed · {skippedCount} skipped
                      </span>
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    ) : (
                      <ChevronDown size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="space-y-2.5 bg-slate-50 px-5 py-4">
                      {entry.messages.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No recipient records stored for this campaign.
                        </p>
                      ) : (
                        entry.messages.map((message) => (
                          <div
                            key={`${entry.id}-${message.customerId}`}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-800">
                                {message.customerName}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  message.status === "demo_executed" || message.status === "simulated"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {message.status === "demo_executed" || message.status === "simulated"
                                  ? "demo_executed (Simulated / Demo)"
                                  : `skipped (${message.skipReason ?? "held_back"})`}
                              </span>
                            </div>
                            {message.message ? (
                              <p className="mt-1 text-xs leading-5 text-slate-600">
                                {message.message}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {message.result ?? "Held back during eligibility check."}
                              </p>
                            )}
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

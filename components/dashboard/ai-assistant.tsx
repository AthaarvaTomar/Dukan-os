"use client";

import {
  AgentState,
  BrowserAudioInterface,
  ConversationAgent,
  InteractionType,
} from "sarvam-conv-ai-sdk/browser";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useDemoStore } from "@/components/dashboard/use-demo-store";

interface VoiceConfig {
  org_id: string;
  workspace_id: string;
  app_id: string;
}

interface PendingCampaign {
  id: string;
  campaign: {
    name: string;
    channel: string;
    audienceSize: number;
  };
  message: string;
  eligibleCustomerCount: number;
  messages: Array<{
    customerId: string;
    customerName: string;
    message: string;
    productCategory: string | null;
    lastPurchaseAt: string | null;
    customerSegment: string;
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String(error.name);
    const message = error instanceof Error ? error.message : "";
    const detail = message ? ` (Detail: ${name} — ${message})` : ` (Detail: ${name})`;
    if (name === "NotFoundError") {
      // The SDK also throws NotFoundError for HTTP 404 from the signed-URL
      // request, so only treat it as a missing microphone for device errors.
      if (/resource not found|app not found|signed url|workspace|organization/i.test(message)) {
        return `Sarvam could not find your voice app. Make sure SARVAM_ORG_ID, SARVAM_WORKSPACE_ID, and SARVAM_APP_ID in .env.local match your agent in the Sarvam console, then restart the app.${detail}`;
      }
      return `No microphone was found. Connect a microphone and try again.${detail}`;
    }
    if (name === "NotAllowedError" || name === "SecurityError") {
      return `Microphone permission was denied. Allow microphone access in your browser settings, then try again.${detail}`;
    }
    if (name === "NotReadableError") {
      return `The microphone is busy or unavailable. Close other apps using it and try again.${detail}`;
    }
    if (name === "AuthenticationError") {
      return `Sarvam rejected the API key. Check SARVAM_API_KEY in .env.local, then restart the app.${detail}`;
    }
    if (name === "ForbiddenError") {
      return `The Sarvam API key does not have access to this voice app. Check the key and app settings in the Sarvam console.${detail}`;
    }
    if (name === "RateLimitError") {
      return `Sarvam rate limit reached. Wait a moment and try again.${detail}`;
    }
    if (name === "ServerError") {
      return `Sarvam's voice service had a server error. Please try again shortly.${detail}`;
    }
  }
  return error instanceof Error
    ? error.message
    : "The voice session could not be started. Please try again.";
}

function voiceStateLabel(state: AgentState): string {
  switch (state) {
    case AgentState.CONNECTING:
      return "Connecting";
    case AgentState.CONNECTED:
      return "Connected";
    case AgentState.LISTENING:
      return "Listening";
    case AgentState.SPEAKING:
      return "Speaking";
    case AgentState.ERROR:
      return "Connection error";
    default:
      return "Not connected";
  }
}

export function AiAssistant() {
  const { data, status: dataStatus, error: dataError } = useDemoStore();
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [missingConfig, setMissingConfig] = useState<string[]>([]);
  const [toolsConfigured, setToolsConfigured] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [voiceState, setVoiceState] = useState<AgentState>(AgentState.IDLE);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Namaste! Ask me about your sales, profits, stock, customers, or business insights.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingCampaign, setPendingCampaign] = useState<PendingCampaign | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [isApprovingCampaign, setIsApprovingCampaign] = useState(false);
  const agentRef = useRef<ConversationAgent | null>(null);
  const mountedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    void fetch("/api/voice/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Voice setup status could not be loaded.");
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null) {
          throw new Error("Voice setup status was invalid.");
        }
        const setup = payload;
        if (
          "configured" in setup &&
          setup.configured === true &&
          "config" in setup &&
          "toolsConfigured" in setup
        ) {
          const config = setup.config;
          if (
            typeof config === "object" &&
            config !== null &&
            "org_id" in config &&
            typeof config.org_id === "string" &&
            "workspace_id" in config &&
            typeof config.workspace_id === "string" &&
            "app_id" in config &&
            typeof config.app_id === "string"
          ) {
            setVoiceConfig({
              org_id: config.org_id,
              workspace_id: config.workspace_id,
              app_id: config.app_id,
            });
          } else {
            throw new Error("Sarvam voice configuration was incomplete.");
          }
          setToolsConfigured(setup.toolsConfigured === true);
        } else if ("missing" in setup && Array.isArray(setup.missing)) {
          setMissingConfig(setup.missing.map(String));
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setVoiceError(
            error instanceof Error
              ? error.message
              : "Voice setup status could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (mountedRef.current) setConfigLoading(false);
      });

    return () => {
      mountedRef.current = false;
      const agent = agentRef.current;
      agentRef.current = null;
      if (agent) {
        void agent.stop().catch((error: unknown) => {
          console.error("Could not cleanly stop the Sarvam voice session.", error);
        });
      }
    };
  }, []);

  useEffect(() => {
    const pollCampaign = async () => {
      try {
        const response = await fetch("/api/voice/campaigns", { cache: "no-store" });
        if (!response.ok) throw new Error("Campaign review details could not be loaded.");
        const payload: { pending: PendingCampaign | null } = await response.json();
        setPendingCampaign(payload.pending);
        setCampaignError(null);
      } catch (error) {
        setCampaignError(
          error instanceof Error
            ? error.message
            : "Campaign review details could not be loaded.",
        );
      }
    };

    void pollCampaign();
    const interval = window.setInterval(() => void pollCampaign(), 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [voiceMessages]);

  const stopConversation = useCallback(async () => {
    const agent = agentRef.current;
    if (!agent) return;
    agentRef.current = null;
    try {
      await agent.stop();
    } catch (error) {
      setVoiceError(`The voice session could not be stopped cleanly: ${errorMessage(error)}`);
    } finally {
      setVoiceState(AgentState.IDLE);
      setIsMuted(false);
    }
  }, []);

  const startConversation = useCallback(async () => {
    if (!voiceConfig || agentRef.current) return;
    setVoiceError(null);
    setVoiceMessages([]);
    setIsMuted(false);
    setVoiceState(AgentState.CONNECTING);

    let agent: ConversationAgent;
    try {
      agent = new ConversationAgent({
        apiKey: "",
        baseUrl: "/api/sarvam/",
        config: {
          ...voiceConfig,
          user_identifier: `dukanos-${crypto.randomUUID()}`,
          user_identifier_type: "custom",
          interaction_type: InteractionType.CALL,
          input_sample_rate: 16000,
          output_sample_rate: 16000,
        },
        audioInterface: new BrowserAudioInterface(16000),
        stateCallback: (state) => {
          if (!mountedRef.current) return;
          setVoiceState(state);
          if (state === AgentState.ERROR) {
            setVoiceError("The voice connection failed. Check your network and Sarvam agent setup.");
          }
        },
        transcriptCallback: async (message) => {
          if (!mountedRef.current) return;
          setVoiceMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: message.role === "user" ? "user" : "assistant",
              content: message.content,
            },
          ]);
        },
        endCallback: async () => {
          if (agentRef.current === agent) {
            agentRef.current = null;
            setVoiceState(AgentState.IDLE);
            setIsMuted(false);
          }
        },
      });
      agentRef.current = agent;
      await agent.start();
      const connected = await agent.waitForConnect(20);
      if (!connected) throw new Error("The voice connection timed out. Please try again.");
    } catch (error) {
      const agentToStop = agentRef.current;
      agentRef.current = null;
      if (agentToStop) {
        try {
          await agentToStop.stop();
        } catch (stopError) {
          console.error("Could not clean up the failed Sarvam voice session.", stopError);
        }
      }
      if (mountedRef.current) {
        setVoiceState(AgentState.ERROR);
        setVoiceError(errorMessage(error));
      }
    }
  }, [voiceConfig]);

  const toggleMute = useCallback(() => {
    const agent = agentRef.current;
    if (!agent) return;
    if (agent.isMuted()) {
      agent.unmute();
      setIsMuted(false);
    } else {
      agent.mute();
      setIsMuted(true);
    }
  }, []);

  const sendTextMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || isSending || dataStatus !== "ready") return;
    setChatInput("");
    setIsSending(true);
    setChatMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, data }),
      });
      if (!response.ok) throw new Error(`Assistant request failed with HTTP ${response.status}.`);
      const result: { reply?: string } = await response.json();
      if (!result.reply) throw new Error("The assistant returned an empty response.");
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: result.reply! },
      ]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "The assistant is temporarily unavailable. Please try again.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const approveCampaign = async () => {
    if (!pendingCampaign || isApprovingCampaign) return;
    setIsApprovingCampaign(true);
    setCampaignError(null);
    try {
      const response = await fetch(
        `/api/voice/campaigns/${encodeURIComponent(pendingCampaign.id)}/approve`,
        { method: "POST" },
      );
      const payload: { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Campaign approval failed.");
      setPendingCampaign(null);
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${payload.message ?? "Campaign recorded as simulated. No messages were sent."} ${"successfulCount" in payload ? payload.successfulCount : 0} successful, ${"failedCount" in payload ? payload.failedCount : 0} failed.`,
        },
      ]);
    } catch (error) {
      setCampaignError(
        error instanceof Error ? error.message : "Campaign approval failed.",
      );
    } finally {
      setIsApprovingCampaign(false);
    }
  };

  const isVoiceActive =
    voiceState === AgentState.CONNECTED ||
    voiceState === AgentState.LISTENING ||
    voiceState === AgentState.SPEAKING;
  const canStartVoice =
    Boolean(voiceConfig) && (voiceState === AgentState.IDLE || voiceState === AgentState.ERROR);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-9">
      <header>
        <p className="text-sm font-medium text-lime-700">DukaanOS workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          AI Assistant
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Ask about your shop in Hindi, English, or Hinglish. Use chat or start a voice conversation.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-100 text-lime-800">
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Business chat</h2>
              <p className="mt-0.5 text-xs text-slate-500">Answers based on your current store data</p>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "rounded-br-md bg-slate-900 text-white"
                      : "rounded-bl-md bg-slate-100 text-slate-800"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {isSending && (
              <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                Checking your business data…
              </p>
            )}
          </div>

          {dataStatus === "error" && (
            <p className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {dataError ?? "Your store data could not be loaded."}
            </p>
          )}
          <form onSubmit={sendTextMessage} className="flex items-center gap-2 border-t border-slate-100 p-4">
            <label className="sr-only" htmlFor="assistant-message">Message the assistant</label>
            <input
              id="assistant-message"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about sales, stock, or customers…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
              disabled={dataStatus !== "ready" || isSending}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!chatInput.trim() || dataStatus !== "ready" || isSending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
        </section>

        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <MessageCircle size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">Voice assistant</h2>
              <p className="mt-0.5 text-xs text-slate-500">Speak naturally in Hindi, English, or Hinglish</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600" role="status">
              {voiceState === AgentState.SPEAKING ? (
                <Volume2 size={14} className="text-lime-700" aria-hidden="true" />
              ) : voiceState === AgentState.LISTENING ? (
                <Mic size={14} className="text-lime-700" aria-hidden="true" />
              ) : voiceState === AgentState.CONNECTING ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : null}
              {voiceStateLabel(voiceState)}
            </span>
          </div>

          <div className="flex items-center justify-center border-b border-slate-100 bg-slate-50/70 px-5 py-6">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full transition ${
                voiceState === AgentState.SPEAKING
                  ? "bg-lime-100 text-lime-800 ring-8 ring-lime-50"
                  : voiceState === AgentState.LISTENING
                    ? "bg-emerald-100 text-emerald-800 ring-8 ring-emerald-50"
                    : "bg-white text-slate-500 ring-1 ring-slate-200"
              }`}
              aria-hidden="true"
            >
              {voiceState === AgentState.SPEAKING ? (
                <Volume2 size={31} />
              ) : voiceState === AgentState.LISTENING ? (
                <Mic size={31} />
              ) : (
                <MicOff size={31} />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
            {voiceMessages.length === 0 ? (
              <p className="py-5 text-center text-sm leading-6 text-slate-500">
                Your live conversation transcript will appear here.
              </p>
            ) : (
              voiceMessages.map((message) => (
                <div key={message.id} className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {message.role === "user" ? "You" : "DukaanOS"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.content}</p>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {configLoading && (
            <p className="mx-5 mb-3 flex items-center gap-2 text-xs text-slate-500" role="status">
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              Checking voice setup…
            </p>
          )}
          {!configLoading && !voiceConfig && (
            <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900" role="status">
              <p className="font-semibold">Voice setup required</p>
              <p className="mt-1">
                Add {missingConfig.length > 0 ? missingConfig.join(", ") : "the Sarvam settings"} to
                {" "}<code>.env.local</code>, then restart the app.
              </p>
            </div>
          )}
          {!configLoading && voiceConfig && !toolsConfigured && (
            <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900" role="status">
              <p className="font-semibold">Business tools need setup</p>
              <p className="mt-1">
                Set <code>SARVAM_TOOL_API_TOKEN</code> and configure the same Bearer token in your Sarvam API tools.
              </p>
            </div>
          )}
          {voiceError && (
            <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {voiceError}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-4">
            {!isVoiceActive ? (
              <button
                type="button"
                onClick={() => void startConversation()}
                disabled={!canStartVoice || configLoading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {voiceState === AgentState.CONNECTING ? (
                  <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Mic size={17} aria-hidden="true" />
                )}
                {voiceState === AgentState.CONNECTING ? "Connecting…" : "Start voice"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {isMuted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={() => void stopConversation()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  <Square size={15} aria-hidden="true" />
                  Stop
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {pendingCampaign && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="campaign-review-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Merchant review required</p>
              <h2 id="campaign-review-title" className="mt-1 text-base font-semibold text-slate-900">
                {pendingCampaign.campaign.name}
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                {pendingCampaign.campaign.channel} · {pendingCampaign.eligibleCustomerCount} eligible customers · 15% discount
              </p>
              <blockquote className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3 text-sm leading-6 text-slate-700">
                {pendingCampaign.message}
              </blockquote>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-amber-900">
                  Preview all {pendingCampaign.messages.length} personalized messages
                </summary>
                <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                  {pendingCampaign.messages.map((message) => (
                    <div key={message.customerId} className="rounded-lg border border-amber-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-800">{message.customerName}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{message.message}</p>
                    </div>
                  ))}
                </div>
              </details>
              <p className="mt-2 text-xs text-amber-900">
                Nothing will be sent. Approval executes this campaign in demo mode (demo_executed).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void approveCampaign()}
              disabled={isApprovingCampaign}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isApprovingCampaign ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              Approve demo campaign
            </button>
          </div>
        </section>
      )}
      {campaignError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {campaignError}
        </p>
      )}
    </div>
  );
}

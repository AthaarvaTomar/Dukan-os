"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  Mic,
  Volume2,
  VolumeX,
  Sparkles,
  RotateCcw,
  Square,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import { useVoice } from "@/components/assistant/use-voice";
import { toast } from "sonner";
import type { AssistantIntent } from "@/lib/assistant/intents";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  intent?: AssistantIntent | "error";
  timeLabel: string;
}

const suggestions = [
  { label: "Aaj ki bikri kitni hui?", prompt: "Aaj ki bikri kitni hui?" },
  { label: "Low stock products", prompt: "Which products are low on stock?" },
  { label: "Inactive customers", prompt: "Kitne customers inactive hai?" },
  { label: "Weekly report", prompt: "Weekly report" },
];

function getCurrentTimeLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "numeric",
  }).format(new Date());
}

export function AssistantLoading() {
  return (
    <div
      className="mx-auto flex h-[calc(100vh-140px)] w-full max-w-4xl flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)] animate-pulse"
      role="status"
      aria-label="Loading assistant"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="h-3 w-52 rounded bg-slate-200" />
        </div>
      </div>
      <div className="flex-1 space-y-4 py-6">
        <div className="h-16 w-3/4 rounded-2xl bg-slate-100" />
        <div className="ml-auto h-12 w-1/2 rounded-2xl bg-slate-200" />
        <div className="h-20 w-2/3 rounded-2xl bg-slate-100" />
      </div>
      <div className="h-12 w-full rounded-xl bg-slate-100" />
    </div>
  );
}

export function AssistantChat() {
  const { data } = useDemoStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "assistant",
      text: "Namaste! I am your DukaanOS Assistant. You can ask me about today's sales, low-stock items, inactive customers, or get a weekly business summary in Hindi, Hinglish, or English.",
      timeLabel: "Just now",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Define handleSendMessageRef so useVoice callbacks can safely reference it without hoisting issues
  const handleSendMessageRef = useRef<(prompt?: string) => Promise<void>>(async () => {});

  const {
    isSupported: isVoiceSupported,
    language,
    setLanguage,
    voiceState,
    startListening,
    stopListening,
    isSpeaking,
    isTtsEnabled,
    toggleTts,
    speak,
    stopSpeaking,
  } = useVoice({
    onTranscriptUpdate: (transcript) => {
      setInput(transcript);
    },
    onFinalTranscript: (finalTranscript) => {
      void handleSendMessageRef.current(finalTranscript);
    },
  });

  const handleSendMessage = useCallback(
    async (contentToSend?: string) => {
      const text = (contentToSend ?? input).trim();
      if (!text || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: "user",
        text,
        timeLabel: getCurrentTimeLabel(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, data }),
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const result = await res.json();
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: result.reply,
          intent: result.intent,
          timeLabel: getCurrentTimeLabel(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Read reply aloud using Web Speech API
        speak(result.reply);
      } catch {
        const errorText =
          "Sorry, I couldn't process your request right now. Please check your connection or try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: errorText,
            intent: "error",
            timeLabel: getCurrentTimeLabel(),
          },
        ]);
        toast.error("Failed to get assistant response.");
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, data, speak],
  );

  // Keep ref up to date
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleClearHistory = () => {
    stopSpeaking();
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "assistant",
        text: "History cleared. How can I help your store today?",
        timeLabel: "Just now",
      },
    ]);
  };

  const handleToggleVoice = () => {
    if (voiceState === "listening") {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-140px)] w-full max-w-4xl flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
      {/* Assistant Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-slate-950 shadow-sm">
            <Bot size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900">DukaanOS Assistant</h1>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Store Data
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Sharma General Store · Ask in Hindi, Hinglish, or English
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLanguage("hi-IN")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                language === "hi-IN"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              हिन्दी (Hindi)
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en-IN")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                language === "en-IN"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              English
            </button>
          </div>

          {/* TTS Speaker Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTts}
            className={cn("h-9 w-9 text-slate-500", isTtsEnabled && "text-slate-900")}
            title={isTtsEnabled ? "Mute speech replies" : "Read replies aloud"}
            aria-label={isTtsEnabled ? "Mute speech replies" : "Read replies aloud"}
          >
            {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>

          {/* Stop Speaking button if active */}
          {isSpeaking && (
            <Button
              variant="outline"
              size="sm"
              onClick={stopSpeaking}
              className="h-9 gap-1.5 border-rose-200 bg-rose-50 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              <Square size={13} fill="currentColor" />
              Stop audio
            </Button>
          )}

          {/* Reset / Clear conversation */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearHistory}
            className="h-9 w-9 text-slate-400 hover:text-slate-700"
            title="Clear chat history"
            aria-label="Clear chat history"
          >
            <RotateCcw size={16} />
          </Button>
        </div>
      </div>

      {/* Voice capability alert for unsupported browsers */}
      {!isVoiceSupported && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-6 py-2 text-xs text-amber-800">
          <HelpCircle size={15} className="shrink-0 text-amber-600" />
          <span>Voice works best in Chrome/Edge browsers with microphone access enabled.</span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((message) => {
          const isUser = message.sender === "user";
          return (
            <div
              key={message.id}
              className={cn(
                "flex items-start gap-3",
                isUser ? "flex-row-reverse" : "flex-row",
              )}
            >
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lime-300 shadow-sm">
                  <Bot size={17} />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  isUser
                    ? "rounded-tr-xs bg-slate-900 text-white"
                    : message.intent === "error"
                      ? "rounded-tl-xs border border-rose-200 bg-rose-50 text-rose-900"
                      : "rounded-tl-xs border border-slate-100 bg-slate-50/90 text-slate-800 shadow-xs",
                )}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                <div
                  className={cn(
                    "mt-1.5 flex items-center gap-2 text-[11px]",
                    isUser ? "text-slate-400 justify-end" : "text-slate-400",
                  )}
                >
                  <span>{message.timeLabel}</span>
                  {!isUser && message.intent && message.intent !== "unknown" && message.intent !== "error" && (
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.2 text-[10px] font-medium text-slate-600">
                      {message.intent.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lime-300 shadow-sm">
              <Bot size={17} />
            </div>
            <div className="rounded-2xl rounded-tl-xs border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
                <span className="ml-1 text-xs">Analyzing store records...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="border-t border-slate-100 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="flex shrink-0 items-center gap-1 text-slate-400 font-medium mr-1">
            <Sparkles size={13} className="text-lime-500" />
            Suggestions:
          </span>
          {suggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isLoading}
              onClick={() => void handleSendMessage(item.prompt)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className="p-4 sm:p-6 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                voiceState === "listening"
                  ? "Listening to your voice..."
                  : language === "hi-IN"
                    ? "Store ke baare mein kuch bhi puchein..."
                    : "Ask about sales, stock, customers, or reports..."
              }
              disabled={isLoading || voiceState === "processing"}
              className={cn(
                "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                voiceState === "listening" && "border-rose-300 ring-2 ring-rose-100 bg-rose-50/20",
              )}
            />
          </div>

          {/* Microphone button */}
          {isVoiceSupported && (
            <Button
              type="button"
              variant={voiceState === "listening" ? "default" : "outline"}
              size="icon"
              onClick={handleToggleVoice}
              disabled={isLoading}
              className={cn(
                "h-12 w-12 shrink-0 rounded-xl transition-all",
                voiceState === "listening"
                  ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse shadow-md ring-4 ring-rose-200"
                  : "text-slate-700 hover:bg-slate-50",
              )}
              title={
                voiceState === "listening"
                  ? "Stop listening"
                  : `Start voice input (${language === "hi-IN" ? "Hindi" : "English"})`
              }
              aria-label={voiceState === "listening" ? "Stop listening" : "Start voice input"}
            >
              {voiceState === "listening" ? <Mic size={20} /> : <Mic size={19} />}
            </Button>
          )}

          {/* Send Button */}
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="h-12 w-12 shrink-0 rounded-xl bg-slate-900 text-white transition-all hover:bg-slate-800 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

export type VoiceLanguage = "hi-IN" | "en-IN";
export type VoiceState = "idle" | "listening" | "processing";

export interface UseVoiceOptions {
  onTranscriptUpdate?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  defaultLanguage?: VoiceLanguage;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  item: (index: number) => SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    item: (index: number) => SpeechRecognitionResultItem;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function checkSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionClass() !== null;
}

function checkTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const emptySubscribe = () => () => {};

export function useVoice(options: UseVoiceOptions = {}) {
  const isSupported = useSyncExternalStore(
    emptySubscribe,
    checkSpeechRecognitionSupported,
    () => false,
  );

  const isTtsSupported = useSyncExternalStore(
    emptySubscribe,
    checkTtsSupported,
    () => false,
  );

  const [language, setLanguage] = useState<VoiceLanguage>(options.defaultLanguage ?? "hi-IN");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState<boolean>(true);

  const onTranscriptUpdateRef = useRef(options.onTranscriptUpdate);
  const onFinalTranscriptRef = useRef(options.onFinalTranscript);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const hasReceivedFinalRef = useRef<boolean>(false);
  const latestFinalTranscriptRef = useRef<string>("");

  useEffect(() => {
    onTranscriptUpdateRef.current = options.onTranscriptUpdate;
  }, [options.onTranscriptUpdate]);

  useEffect(() => {
    onFinalTranscriptRef.current = options.onFinalTranscript;
  }, [options.onFinalTranscript]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignored
      }
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, overrideLang?: VoiceLanguage) => {
      if (!isTtsEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const lang = overrideLang ?? language;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        const assignVoice = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length === 0) return;
          const target = lang.toLowerCase();
          let matched = voices.find(
            (v) =>
              v.lang.toLowerCase() === target ||
              v.lang.toLowerCase().replaceAll("_", "-") === target,
          );
          if (!matched) {
            const prefix = target.split("-")[0];
            matched = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
          }
          if (matched) {
            utterance.voice = matched;
          }
        };

        assignVoice();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = assignVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [isTtsEnabled, language],
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignored
      }
    }
    setVoiceState("idle");
  }, []);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionClass = getSpeechRecognitionClass();

    if (!SpeechRecognitionClass) {
      toast("Voice input requires a browser that supports Web Speech (Chrome, Edge).", {
        description: "Please type your message or try Chrome or Edge.",
      });
      return;
    }

    // Cancel active speech synthesis
    stopSpeaking();

    // Abort existing recognition if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignored
      }
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;

      hasReceivedFinalRef.current = false;
      latestFinalTranscriptRef.current = "";

      recognition.onstart = () => {
        setVoiceState("listening");
      };

      recognition.onresult = (event: SpeechRecognitionResultEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0]?.transcript || "";
          if (item.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }

        if (interim) {
          onTranscriptUpdateRef.current?.(interim);
        }

        if (final.trim()) {
          hasReceivedFinalRef.current = true;
          latestFinalTranscriptRef.current = final.trim();
          onTranscriptUpdateRef.current?.(final.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed" || event.error === "permission-denied") {
          toast.error("Microphone access was denied. Please allow microphone permissions in your browser settings.");
        } else if (event.error === "no-speech") {
          // Timeout with no speech detected
        } else if (event.error !== "aborted") {
          toast.error(`Voice recognition error: ${event.error}`);
        }
        setVoiceState("idle");
      };

      recognition.onend = () => {
        if (hasReceivedFinalRef.current && latestFinalTranscriptRef.current) {
          setVoiceState("processing");
          const finalPrompt = latestFinalTranscriptRef.current;
          onFinalTranscriptRef.current?.(finalPrompt);
          setTimeout(() => {
            setVoiceState("idle");
          }, 600);
        } else {
          setVoiceState("idle");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setVoiceState("idle");
      toast.error("Could not start microphone. Please check permissions.");
    }
  }, [language, stopSpeaking]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignored
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignored
        }
      }
    };
  }, []);

  return {
    isSupported,
    isTtsSupported,
    language,
    setLanguage,
    voiceState,
    startListening,
    stopListening,
    isSpeaking,
    isTtsEnabled,
    setIsTtsEnabled,
    toggleTts: () => setIsTtsEnabled((prev) => !prev),
    speak,
    stopSpeaking,
  };
}

export const GEMINI_REQUEST_TIMEOUT_MS = 10_000;

export interface GeminiMessage {
  role: "system" | "user";
  content: string;
}

export type GeminiCompletion = (
  messages: GeminiMessage[],
  options?: { signal?: AbortSignal; responseMimeType?: "application/json" },
) => Promise<string>;

export class GeminiApiError extends Error {
  constructor(
    message: string,
    readonly kind: "missing_key" | "timeout" | "api_failure" = "api_failure",
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

export async function callGemini(
  messages: GeminiMessage[],
  options: {
    apiKey?: string;
    model?: string;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
    responseMimeType?: "application/json";
  } = {},
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiApiError(
      "The assistant is not configured yet. Please try again later.",
      "missing_key",
    );
  }

  const model = options.model ?? process.env.GEMINI_MODEL;
  if (!model) {
    throw new GeminiApiError(
      "The assistant model is not configured. Please set GEMINI_MODEL in your environment.",
      "missing_key",
    );
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const systemInstruction = systemMessage
    ? { parts: [{ text: systemMessage.content }] }
    : undefined;

  const contents =
    nonSystemMessages.length > 0
      ? nonSystemMessages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }))
      : [{ role: "user", parts: [{ text: systemMessage?.content ?? "" }] }];

  const isClassification =
    options.responseMimeType === "application/json" ||
    Boolean(systemMessage?.content.includes("intent classifier"));

  const generationConfig: Record<string, unknown> = {
    temperature: 0,
  };

  if (isClassification) {
    generationConfig.responseMimeType = "application/json";
  }

  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const fetcher = options.fetcher ?? fetch;
  const timeoutSignal = options.signal ?? AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS);

  const makeRequest = async () => {
    return await fetcher(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: timeoutSignal,
    });
  };

  let response: Response;
  try {
    response = await makeRequest();
    if (response.status === 429) {
      // Retry once after about 1.5 seconds on HTTP 429
      await new Promise((resolve) => setTimeout(resolve, 1500));
      response = await makeRequest();
    }
  } catch (error) {
    if (error instanceof GeminiApiError) throw error;
    if (
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
      timeoutSignal.aborted
    ) {
      throw new GeminiApiError(
        "The assistant took too long to respond. Please try again.",
        "timeout",
      );
    }
    throw new GeminiApiError(
      "The assistant is temporarily unavailable. Please try again shortly.",
      "api_failure",
    );
  }

  if (!response.ok) {
    throw new GeminiApiError(
      `Gemini generateContent failed with HTTP ${response.status}.`,
      "api_failure",
    );
  }

  let payload: GeminiResponse;
  try {
    payload = (await response.json()) as GeminiResponse;
  } catch {
    throw new GeminiApiError("Failed to parse Gemini response JSON.", "api_failure");
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new GeminiApiError("Gemini returned an empty response.", "api_failure");
  }

  return text;
}

export function createGeminiCompletion(
  apiKey?: string,
  fetcher?: typeof fetch,
  model?: string,
): GeminiCompletion {
  return (messages, options) =>
    callGemini(messages, {
      apiKey,
      fetcher,
      model,
      signal: options?.signal,
      responseMimeType: options?.responseMimeType,
    });
}

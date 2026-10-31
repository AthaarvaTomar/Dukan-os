export const SARVAM_CHAT_COMPLETIONS_URL = "https://api.sarvam.ai/v1/chat/completions";
export const SARVAM_CHAT_MODEL = "sarvam-105b";
export const SARVAM_REQUEST_TIMEOUT_MS = 10_000;

export interface SarvamMessage {
  role: "system" | "user";
  content: string;
}

export type SarvamCompletion = (
  messages: SarvamMessage[],
  options?: { signal?: AbortSignal },
) => Promise<string>;

export class SarvamApiError extends Error {
  constructor(
    message: string,
    readonly kind: "missing_key" | "timeout" | "api_failure" = "api_failure",
  ) {
    super(message);
    this.name = "SarvamApiError";
  }
}

interface SarvamCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
  }>;
}

export async function callSarvam(
  messages: SarvamMessage[],
  options: { apiKey?: string; signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new SarvamApiError(
      "The assistant is not configured yet. Please try again later.",
      "missing_key",
    );
  }

  try {
    const response = await (options.fetcher ?? fetch)(SARVAM_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SARVAM_CHAT_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 300,
        stream: false,
      }),
      signal: options.signal ?? AbortSignal.timeout(SARVAM_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new SarvamApiError(
        `Sarvam chat completion failed with HTTP ${response.status}.`,
        "api_failure",
      );
    }

    const payload = (await response.json()) as SarvamCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new SarvamApiError("Sarvam returned an empty chat response.", "api_failure");
    }
    return content;
  } catch (error) {
    if (error instanceof SarvamApiError) throw error;
    if (
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
      options.signal?.aborted
    ) {
      throw new SarvamApiError(
        "The assistant took too long to respond. Please try again.",
        "timeout",
      );
    }
    throw new SarvamApiError(
      "The assistant is temporarily unavailable. Please try again shortly.",
      "api_failure",
    );
  }
}

export function createSarvamCompletion(
  apiKey?: string,
  fetcher?: typeof fetch,
): SarvamCompletion {
  return (messages, options) => callSarvam(messages, { apiKey, fetcher, signal: options?.signal });
}

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppDeliveryStatus } from "../types";

/**
 * Meta WhatsApp Webhook event types.
 */
export interface WhatsAppStatusEvent {
  id: string; // Meta provider message id (e.g. wamid.HBg...)
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: WhatsAppStatusEvent[];
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * Verifies webhook GET challenge from Meta Graph API.
 */
export function verifyWebhookChallenge(params: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  expectedToken: string;
}): { isValid: boolean; challenge?: string } {
  if (
    params.mode === "subscribe" &&
    params.verifyToken &&
    params.verifyToken === params.expectedToken &&
    params.challenge
  ) {
    return { isValid: true, challenge: params.challenge };
  }
  return { isValid: false };
}

/**
 * Verifies HMAC-SHA256 signature on incoming Meta webhook POST requests.
 * Header: x-hub-signature-256 (format: "sha256=<hash>")
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const signature = signatureHeader.replace("sha256=", "");
  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Updates campaign execution records in Supabase when delivery webhooks arrive.
 * Strictly checks execution_mode = 'whatsapp' so demo records are never touched.
 */
export async function processWhatsAppDeliveryWebhook(
  db: SupabaseClient,
  statusEvent: WhatsAppStatusEvent,
): Promise<{ updated: boolean; status: WhatsAppDeliveryStatus }> {
  const deliveryStatus: WhatsAppDeliveryStatus =
    statusEvent.status === "read"
      ? "read"
      : statusEvent.status === "delivered"
        ? "delivered"
        : statusEvent.status === "sent"
          ? "sent"
          : "failed";

  // Only update real WhatsApp records with matching provider_message_id
  const { data, error } = await db
    .from("campaign_executions")
    .update({
      execution_status: deliveryStatus,
      provider_response: statusEvent,
      error_details: statusEvent.errors ? JSON.stringify(statusEvent.errors) : null,
    })
    .eq("provider_message_id", statusEvent.id)
    .eq("execution_mode", "whatsapp")
    .select("id");

  if (error) {
    console.error("Failed to update campaign_executions webhook status:", error);
    return { updated: false, status: deliveryStatus };
  }

  return { updated: (data ?? []).length > 0, status: deliveryStatus };
}


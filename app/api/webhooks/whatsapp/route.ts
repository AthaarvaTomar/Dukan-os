import {
  processWhatsAppDeliveryWebhook,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  type WhatsAppWebhookPayload,
} from "@/lib/campaigns";
import { resolveServerBusiness } from "@/lib/db/voice-campaigns";

/**
 * Meta WhatsApp Cloud API Webhook Endpoint.
 * Supports:
 * - GET: Webhook verification challenge during Meta app setup
 * - POST: Real-time message status updates (sent, delivered, read, failed)
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!expectedToken) {
    return new Response("WhatsApp webhook verify token is not configured on server.", {
      status: 503,
    });
  }

  const verification = verifyWebhookChallenge({
    mode,
    verifyToken: token,
    challenge,
    expectedToken,
  });

  if (verification.isValid && verification.challenge) {
    return new Response(verification.challenge, { status: 200 });
  }

  return new Response("Webhook verification failed.", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  const rawBody = await request.text();

  // If app secret is configured, enforce cryptographic signature check
  if (appSecret) {
    const isSignatureValid = verifyWebhookSignature(rawBody, signatureHeader, appSecret);
    if (!isSignatureValid) {
      return new Response("Invalid signature.", { status: 401 });
    }
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return new Response("Invalid JSON payload.", { status: 400 });
  }

  const business = await resolveServerBusiness();

  // Process all status events in the webhook payload
  if (payload.entry && business) {
    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        const statuses = change.value?.statuses ?? [];
        for (const statusEvent of statuses) {
          // Updates real WhatsApp execution records in Supabase (mode = 'whatsapp')
          await processWhatsAppDeliveryWebhook(business.db, statusEvent);
        }
      }
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}


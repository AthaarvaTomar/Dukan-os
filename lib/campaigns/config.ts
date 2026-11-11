import type { WhatsAppConfigStatus } from "./types";

/**
 * Expected server-side environment variables for official Meta WhatsApp Cloud API integration.
 * NEVER prefix these with NEXT_PUBLIC_!
 * NEVER expose secret values to the browser, logs, or database.
 */
export const REQUIRED_WHATSAPP_VARS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
] as const;

export type WhatsAppEnvKey = (typeof REQUIRED_WHATSAPP_VARS)[number];

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret: string;
}

/**
 * Returns safe WhatsApp configuration status without exposing token or secret values.
 * Suitable for client consumption and logging.
 */
export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const configuredFields: string[] = [];
  const missingFields: string[] = [];

  for (const envKey of REQUIRED_WHATSAPP_VARS) {
    const value = process.env[envKey]?.trim();
    if (value && value.length > 0) {
      configuredFields.push(envKey);
    } else {
      missingFields.push(envKey);
    }
  }

  const isConfigured = missingFields.length === 0;

  return {
    isConfigured,
    configuredFields,
    missingFields,
    message: isConfigured
      ? "Official Meta WhatsApp Cloud API integration is configured."
      : "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
  };
}

/**
 * Internal server-side credential resolver.
 * Throws immediately if unconfigured. Never logs the credential values.
 */
export function getWhatsAppCredentials(): WhatsAppCredentials {
  const status = getWhatsAppConfigStatus();
  if (!status.isConfigured) {
    throw new Error(
      `Real WhatsApp integration is not configured yet. Campaigns will run in demo mode. (Missing: ${status.missingFields.join(", ")})`,
    );
  }

  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!.trim(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!.trim(),
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim(),
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!.trim(),
    appSecret: process.env.WHATSAPP_APP_SECRET!.trim(),
  };
}


/**
 * Workflow and validation utilities for Meta WhatsApp Cloud API integration.
 * Adheres strictly to Meta WhatsApp Business Platform guidelines.
 */

export interface CustomerConsentRecord {
  customerId: string;
  customerPhone: string;
  hasMarketingConsent: boolean;
  optedInAt?: string | null;
  optedOutAt?: string | null;
}

export interface WhatsAppTemplateSpec {
  name: string;
  language: string; // e.g. "en_US" or "hi"
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: "MARKETING" | "UTILITY";
  bodyText: string; // Template body with {{1}}, {{2}} placeholders
}

/**
 * Step 1: Verify customer marketing consent.
 * Meta strictly prohibits unsolicited promotional messages without prior opt-in consent.
 */
export function verifyCustomerConsent(
  consent: CustomerConsentRecord,
): { allowed: boolean; reason?: string } {
  if (consent.optedOutAt) {
    return {
      allowed: false,
      reason: `Customer opted out of marketing messages at ${consent.optedOutAt}.`,
    };
  }
  if (!consent.hasMarketingConsent) {
    return {
      allowed: false,
      reason: "Customer has not explicitly provided marketing consent.",
    };
  }
  return { allowed: true };
}

/**
 * Step 2: Validate customer phone numbers against E.164 format.
 * Defaults to Indian country code (+91) if 10 digits are provided.
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  e164Phone: string | null;
  error?: string;
} {
  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Empty check
  if (!cleaned) {
    return { isValid: false, e164Phone: null, error: "Phone number is empty." };
  }

  // Indian standard 10-digit mobile (starts with 6, 7, 8, or 9)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, e164Phone: `+91${cleaned}` };
  }

  // Already prefixed with 91 (12 digits)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, e164Phone: `+${cleaned}` };
  }

  // Already prefixed with +91 (13 chars)
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, e164Phone: cleaned };
  }

  // General international E.164 regex: + followed by 7-15 digits
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return { isValid: true, e164Phone: cleaned };
  }

  return {
    isValid: false,
    e164Phone: null,
    error: `Invalid phone number format: "${phone}". Must be a valid 10-digit Indian mobile or E.164 number.`,
  };
}

/**
 * Step 3: Check WhatsApp template requirements and approval.
 * Meta Cloud API requires all business-initiated marketing messages to use pre-approved templates.
 */
export function validateWhatsAppTemplate(
  template: WhatsAppTemplateSpec,
): { valid: boolean; error?: string } {
  if (template.status !== "APPROVED") {
    return {
      valid: false,
      error: `WhatsApp template "${template.name}" is ${template.status}. Only APPROVED templates can be sent.`,
    };
  }

  if (template.category !== "MARKETING") {
    return {
      valid: false,
      error: `Template "${template.name}" is categorized as ${template.category}, but marketing campaigns require MARKETING category.`,
    };
  }

  return { valid: true };
}

/**
 * Meta Cloud API standard template payload builder.
 * Prepares the JSON payload for: POST /v21.0/{phone_number_id}/messages
 */
export function buildWhatsAppTemplatePayload(options: {
  recipientPhone: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: options.recipientPhone.replace("+", ""),
    type: "template",
    template: {
      name: options.templateName,
      language: {
        code: options.languageCode,
      },
      components: [
        {
          type: "body",
          parameters: options.bodyParameters.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
    },
  };
}


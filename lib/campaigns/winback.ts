import type { CustomerSegment } from "../demo-data/types";
import { validatePhoneNumber } from "./whatsapp/workflow";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type MarketingConsent = "granted" | "unknown" | "revoked";
export type WinbackSegment = "all" | CustomerSegment;
export type WinbackCampaignStatus = "draft" | "approved" | "demo_executed" | "cancelled";
export type WinbackRecipientStatus = "queued" | "demo_executed" | "skipped";

export type HoldBackReason =
  | "segment_mismatch"
  | "missing_phone"
  | "invalid_phone"
  | "consent_unknown"
  | "consent_revoked"
  | "opted_out"
  | "cooldown_active"
  | "message_cap_reached";

export const HOLD_BACK_REASON_LABELS: Record<HoldBackReason, string> = {
  segment_mismatch: "Outside target segment",
  missing_phone: "Missing phone number",
  invalid_phone: "Invalid phone number",
  consent_unknown: "Consent unknown",
  consent_revoked: "Consent revoked",
  opted_out: "Opted out",
  cooldown_active: "In cooldown window",
  message_cap_reached: "Message cap reached",
};

export interface AudienceCustomer {
  id: string;
  name: string;
  phone: string;
  segment: CustomerSegment;
  marketingConsent: MarketingConsent;
  optedOutAt: string | null;
  lastCampaignAt?: string | null;
  lastPurchaseAt?: string | null;
  previousPurchase?: string | null;
  productCategory?: string | null;
}

export interface WinbackCampaignConfig {
  id: string;
  name: string;
  targetSegment: WinbackSegment;
  offerText: string;
  templateText?: string;
  cooldownDays: number;
  messageCap: number;
  version: number;
  approvedVersion: number | null;
  status: WinbackCampaignStatus;
}

export interface HeldBackCustomer {
  customer: AudienceCustomer;
  reason: HoldBackReason;
  detail: string;
}

export interface AudienceResult {
  eligible: AudienceCustomer[];
  held_back: HeldBackCustomer[];
  reasonCounts: Record<HoldBackReason, number>;
}

export interface PersonalizeOptions {
  offerText?: string;
  shopName?: string;
  variantOffset?: number;
}

export interface AiRewriteValidationResult {
  valid: boolean;
  text: string;
  rejectedReasons: string[];
}

export interface SimulatedRecipient {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerSegment: CustomerSegment;
  lastPurchaseAt: string | null;
  previousPurchase: string | null;
  productCategory: string | null;
  message: string;
  status: WinbackRecipientStatus;
  skipReason: HoldBackReason | "empty_message" | null;
  detail: string;
}

export interface SimulateSendParams {
  campaign: WinbackCampaignConfig;
  customers: readonly AudienceCustomer[];
  messagesByCustomerId?: Readonly<Record<string, string>>;
  template?: string | readonly string[];
  shopName?: string;
  now?: Date;
}

export interface SimulateSendResult {
  campaign: WinbackCampaignConfig;
  audience: AudienceResult;
  recipients: SimulatedRecipient[];
  executedCount: number;
  skippedCount: number;
  executedAt: string;
  summary: string;
}

export const DEFAULT_WINBACK_TEMPLATES: readonly string[] = [
  "Hi {{name}}, we miss you at {{shop}}. Enjoy {{offer}} on your next {{category}} visit.",
  "Hello {{name}}, it has been a while since your last visit to {{shop}}. Use {{offer}} on your next {{category}} purchase.",
  "Hi {{name}}, stop by {{shop}} soon and claim {{offer}} on {{category}} items.",
  "Namaste {{name}}, {{shop}} has a special offer for you: {{offer}} on your next {{category}} order.",
];

function emptyReasonCounts(): Record<HoldBackReason, number> {
  return {
    segment_mismatch: 0,
    missing_phone: 0,
    invalid_phone: 0,
    consent_unknown: 0,
    consent_revoked: 0,
    opted_out: 0,
    cooldown_active: 0,
    message_cap_reached: 0,
  };
}

/**
 * Pure audience eligibility evaluator.
 * Checks every customer in strict order:
 * 1. segment
 * 2. phone
 * 3. consent
 * 4. opt-out
 * 5. cooldown
 * 6. cap
 */
export function computeAudience(
  customers: readonly AudienceCustomer[],
  campaign: Pick<WinbackCampaignConfig, "targetSegment" | "cooldownDays" | "messageCap">,
  now: Date = new Date(),
): AudienceResult {
  const eligible: AudienceCustomer[] = [];
  const held_back: HeldBackCustomer[] = [];
  const reasonCounts = emptyReasonCounts();

  const holdBack = (customer: AudienceCustomer, reason: HoldBackReason, detail: string) => {
    held_back.push({ customer, reason, detail });
    reasonCounts[reason] += 1;
  };

  const nowMs = now.getTime();
  const safeCooldownDays = Math.max(0, Math.floor(campaign.cooldownDays));
  const safeCap = Math.max(0, Math.floor(campaign.messageCap));

  for (const customer of customers) {
    // 1. Segment check
    if (campaign.targetSegment !== "all" && customer.segment !== campaign.targetSegment) {
      holdBack(
        customer,
        "segment_mismatch",
        `Customer segment "${customer.segment}" does not match target "${campaign.targetSegment}".`,
      );
      continue;
    }

    // 2. Phone check
    const rawPhone = customer.phone?.trim() ?? "";
    if (!rawPhone) {
      holdBack(customer, "missing_phone", "Customer has no phone number on file.");
      continue;
    }
    const phoneCheck = validatePhoneNumber(rawPhone);
    if (!phoneCheck.isValid) {
      holdBack(
        customer,
        "invalid_phone",
        phoneCheck.error ?? "Phone number is not a valid mobile or E.164 number.",
      );
      continue;
    }

    // 3. Consent check
    if (customer.marketingConsent === "revoked") {
      holdBack(customer, "consent_revoked", "Marketing consent is revoked.");
      continue;
    }
    if (customer.marketingConsent !== "granted") {
      holdBack(customer, "consent_unknown", "Marketing consent has not been granted.");
      continue;
    }

    // 4. Opt-out check
    if (customer.optedOutAt && customer.optedOutAt.trim().length > 0) {
      const optedOutMs = Date.parse(customer.optedOutAt);
      if (!Number.isFinite(optedOutMs) || optedOutMs <= nowMs) {
        holdBack(customer, "opted_out", `Customer opted out on ${customer.optedOutAt}.`);
        continue;
      }
    }

    // 5. Cooldown check
    if (safeCooldownDays > 0 && customer.lastCampaignAt) {
      const lastCampaignMs = Date.parse(customer.lastCampaignAt);
      if (Number.isFinite(lastCampaignMs)) {
        const elapsedMs = nowMs - lastCampaignMs;
        const cooldownMs = safeCooldownDays * DAY_IN_MS;
        if (elapsedMs < cooldownMs) {
          const daysRemaining = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / DAY_IN_MS));
          holdBack(
            customer,
            "cooldown_active",
            `Within ${safeCooldownDays}-day cooldown (${daysRemaining} day(s) remaining).`,
          );
          continue;
        }
      }
    }

    // 6. Cap check
    if (eligible.length >= safeCap) {
      holdBack(
        customer,
        "message_cap_reached",
        `Campaign message cap of ${safeCap} has been reached.`,
      );
      continue;
    }

    eligible.push(customer);
  }

  return { eligible, held_back, reasonCounts };
}

/** Deterministic FNV-1a 32-bit hash for stable per-customer template selection. */
export function hashCustomerId(customerId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < customerId.length; i += 1) {
    hash ^= customerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministically personalizes a campaign message using hash(customer.id)
 * to choose among template variants.
 */
export function personalize(
  customer: Pick<AudienceCustomer, "id" | "name" | "productCategory" | "segment">,
  template: string | readonly string[] = DEFAULT_WINBACK_TEMPLATES,
  options: PersonalizeOptions = {},
): string {
  let variants: readonly string[];
  if (Array.isArray(template)) {
    const nonEmpty = template.map((entry) => entry.trim()).filter(Boolean);
    variants = nonEmpty.length > 0 ? nonEmpty : DEFAULT_WINBACK_TEMPLATES;
  } else if (typeof template === "string" && template.trim().length > 0) {
    variants = [template.trim()];
  } else {
    variants = DEFAULT_WINBACK_TEMPLATES;
  }

  const offset = Math.max(0, Math.floor(options.variantOffset ?? 0));
  const index = (hashCustomerId(customer.id) + offset) % variants.length;
  const chosen = variants[index]!;

  const firstName = customer.name.trim() || "Customer";
  const offer = options.offerText?.trim() || "a special discount";
  const shop = options.shopName?.trim() || "our store";
  const category = customer.productCategory?.trim()
    ? customer.productCategory.trim().toLocaleLowerCase("en-IN")
    : "shopping";

  return chosen
    .replaceAll("{{name}}", firstName)
    .replaceAll("{{offer}}", offer)
    .replaceAll("{{shop}}", shop)
    .replaceAll("{{category}}", category)
    .replaceAll("{{segment}}", customer.segment)
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map((m) => String(Number(m))) : [];
}

const EXTRA_OFFER_PATTERNS: ReadonlyArray<{ key: string; regex: RegExp }> = [
  { key: "free", regex: /\bfree\b/i },
  { key: "bogo", regex: /\bbogo\b|\bbuy\s+(?:1|one)\s+get\s+(?:1|one)\b/i },
  { key: "cashback", regex: /\bcash\s*back\b/i },
  { key: "gift", regex: /\bgift\b/i },
  { key: "voucher", regex: /\bvoucher\b/i },
  { key: "coupon", regex: /\bcoupon\b/i },
  { key: "bonus", regex: /\bbonus\b/i },
  { key: "complimentary", regex: /\bcomplimentary\b/i },
  { key: "extra_discount", regex: /\b(?:extra|additional)\s+(?:off|discount)\b/i },
  { key: "loyalty_points", regex: /\b(?:loyalty\s+points|reward\s+points|points)\b/i },
  { key: "referral", regex: /\breferral\b/i },
];

const CUSTOMER_DETAIL_PATTERNS: ReadonlyArray<{ key: string; regex: RegExp }> = [
  { key: "email_address", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { key: "phone_number", regex: /(?:\+?\d[\d\s-]{6,}\d)/ },
  { key: "currency_amount", regex: /(?:₹|rs\.?|inr)\s*\d+/i },
  { key: "order_reference", regex: /\b(?:invoice|order|bill|receipt)\s*#?\s*[a-z0-9-]+/i },
  { key: "address_cue", regex: /\b(?:street|road|lane|colony|nagar|bengaluru|bangalore|mumbai|delhi|pin\s*code)\b/i },
  { key: "spend_detail", regex: /\b(?:spent|total\s+spend|lifetime\s+spend|orders?\s+placed)\b/i },
];

/**
 * Validates an AI-rewritten campaign message against the deterministic original
 * template and approved offer text.
 * Rejects new numbers, extra offers, invented customer details, or dropped offer terms,
 * falling back to `original`.
 */
export function validateAiRewrite(
  original: string,
  rewrite: string,
  offer: string,
): AiRewriteValidationResult {
  const safeOriginal = original.trim();
  const candidate = rewrite.trim();
  const rejectedReasons: string[] = [];

  if (!candidate || candidate.length > 1000) {
    return {
      valid: false,
      text: safeOriginal,
      rejectedReasons: ["empty_or_too_long"],
    };
  }

  const allowedSource = `${safeOriginal} ${offer}`;

  // 1. Reject any new numbers not present in original or offer
  const allowedNumbers = new Set(extractNumbers(allowedSource));
  const candidateNumbers = extractNumbers(candidate);
  const newNumbers = candidateNumbers.filter((num) => !allowedNumbers.has(num));
  if (newNumbers.length > 0) {
    rejectedReasons.push(`new_numbers:${[...new Set(newNumbers)].join(",")}`);
  }

  // 2. Ensure numeric offer terms were not dropped from the rewrite
  const offerNumbers = extractNumbers(offer);
  const candidateNumberSet = new Set(candidateNumbers);
  const missingOfferNumbers = offerNumbers.filter((num) => !candidateNumberSet.has(num));
  if (missingOfferNumbers.length > 0) {
    rejectedReasons.push(`missing_offer_numbers:${[...new Set(missingOfferNumbers)].join(",")}`);
  }

  // 3. Reject extra promotional offers not present in original or offer
  for (const pattern of EXTRA_OFFER_PATTERNS) {
    if (pattern.regex.test(candidate) && !pattern.regex.test(allowedSource)) {
      rejectedReasons.push(`extra_offer:${pattern.key}`);
    }
  }

  // 4. Reject invented or leaked customer details not present in original
  for (const pattern of CUSTOMER_DETAIL_PATTERNS) {
    if (pattern.regex.test(candidate) && !pattern.regex.test(allowedSource)) {
      rejectedReasons.push(`extra_customer_detail:${pattern.key}`);
    }
  }

  // 5. Reject false send/delivery claims introduced by rewrite
  if (/\b(sent|delivered)\b/i.test(candidate) && !/\b(sent|delivered)\b/i.test(safeOriginal)) {
    rejectedReasons.push("forbidden_delivery_claim");
  }

  if (rejectedReasons.length > 0) {
    return {
      valid: false,
      text: safeOriginal,
      rejectedReasons,
    };
  }

  return {
    valid: true,
    text: candidate,
    rejectedReasons: [],
  };
}

/**
 * Editing a campaign increments `version`, clears `approvedVersion`, and returns to `draft`.
 */
export function editCampaign(
  campaign: WinbackCampaignConfig,
  patch: Partial<
    Pick<
      WinbackCampaignConfig,
      "name" | "targetSegment" | "offerText" | "templateText" | "cooldownDays" | "messageCap"
    >
  >,
): WinbackCampaignConfig {
  if (campaign.status === "demo_executed" || campaign.status === "cancelled") {
    throw new Error(`Cannot edit a campaign with status "${campaign.status}".`);
  }
  return {
    ...campaign,
    ...patch,
    version: campaign.version + 1,
    approvedVersion: null,
    status: "draft",
  };
}

/**
 * Editing a customer message increments campaign `version`, clears `approvedVersion`,
 * and returns campaign status to `draft`.
 */
export function editCampaignMessage(
  campaign: WinbackCampaignConfig,
  messagesByCustomerId: Readonly<Record<string, string>>,
  customerId: string,
  nextMessage: string,
): {
  campaign: WinbackCampaignConfig;
  messagesByCustomerId: Record<string, string>;
} {
  if (campaign.status === "demo_executed" || campaign.status === "cancelled") {
    throw new Error(`Cannot edit messages on a campaign with status "${campaign.status}".`);
  }
  const trimmed = nextMessage.trim();
  if (!trimmed || trimmed.length > 1000) {
    throw new Error("Message must contain between 1 and 1000 characters.");
  }
  return {
    campaign: {
      ...campaign,
      version: campaign.version + 1,
      approvedVersion: null,
      status: "draft",
    },
    messagesByCustomerId: {
      ...messagesByCustomerId,
      [customerId]: trimmed,
    },
  };
}

/**
 * Approves the campaign at its current version.
 */
export function approveCampaign(campaign: WinbackCampaignConfig): WinbackCampaignConfig {
  if (campaign.status === "demo_executed" || campaign.status === "cancelled") {
    throw new Error(`Cannot approve a campaign with status "${campaign.status}".`);
  }
  return {
    ...campaign,
    approvedVersion: campaign.version,
    status: "approved",
  };
}

/**
 * Cancels a draft or approved campaign and clears any approval.
 */
export function cancelCampaign(campaign: WinbackCampaignConfig): WinbackCampaignConfig {
  if (campaign.status === "demo_executed") {
    throw new Error("Cannot cancel a campaign that has already been demo_executed.");
  }
  return {
    ...campaign,
    approvedVersion: null,
    status: "cancelled",
  };
}

/**
 * Simulates campaign execution in Simulated / Demo mode.
 * - Rejects unless approvedVersion === version and status === 'approved'.
 * - Recomputes audience eligibility fresh at execution time.
 * - Writes recipient outcomes using only 'demo_executed' and 'skipped'.
 * - Never uses the words "sent" or "delivered".
 */
export function simulateSend(params: SimulateSendParams): SimulateSendResult {
  const {
    campaign,
    customers,
    messagesByCustomerId = {},
    template,
    shopName,
    now = new Date(),
  } = params;

  if (
    campaign.status !== "approved" ||
    campaign.approvedVersion === null ||
    campaign.approvedVersion !== campaign.version
  ) {
    throw new Error(
      `Approval required for version ${campaign.version} before running Simulated / Demo execution.`,
    );
  }

  const audience = computeAudience(customers, campaign, now);
  const executedAt = now.toISOString();
  const recipients: SimulatedRecipient[] = [];

  for (const customer of audience.eligible) {
    const edited = messagesByCustomerId[customer.id]?.trim();
    const message =
      edited ||
      personalize(customer, template ?? (campaign.templateText || DEFAULT_WINBACK_TEMPLATES), {
        offerText: campaign.offerText,
        shopName,
      });

    if (!message.trim()) {
      recipients.push({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerSegment: customer.segment,
        lastPurchaseAt: customer.lastPurchaseAt ?? null,
        previousPurchase: customer.previousPurchase ?? null,
        productCategory: customer.productCategory ?? null,
        message: "",
        status: "skipped",
        skipReason: "empty_message",
        detail: "Skipped during Simulated / Demo run because message text was empty.",
      });
      continue;
    }

    recipients.push({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerSegment: customer.segment,
      lastPurchaseAt: customer.lastPurchaseAt ?? null,
      previousPurchase: customer.previousPurchase ?? null,
      productCategory: customer.productCategory ?? null,
      message,
      status: "demo_executed",
      skipReason: null,
      detail: "Simulated / Demo run recorded locally. No external message dispatch occurred.",
    });
  }

  for (const held of audience.held_back) {
    recipients.push({
      customerId: held.customer.id,
      customerName: held.customer.name,
      customerPhone: held.customer.phone,
      customerSegment: held.customer.segment,
      lastPurchaseAt: held.customer.lastPurchaseAt ?? null,
      previousPurchase: held.customer.previousPurchase ?? null,
      productCategory: held.customer.productCategory ?? null,
      message: "",
      status: "skipped",
      skipReason: held.reason,
      detail: held.detail,
    });
  }

  const executedCount = recipients.filter((r) => r.status === "demo_executed").length;
  const skippedCount = recipients.filter((r) => r.status === "skipped").length;

  return {
    campaign: {
      ...campaign,
      status: "demo_executed",
    },
    audience,
    recipients,
    executedCount,
    skippedCount,
    executedAt,
    summary: `Simulated / Demo run complete: ${executedCount} demo_executed, ${skippedCount} skipped. No external messages left DukaanOS.`,
  };
}

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  DemoCampaignProvider,
  WhatsAppCampaignProvider,
  getExecutionProvider,
  validateModeSwitch,
  getWhatsAppConfigStatus,
  REQUIRED_WHATSAPP_VARS,
  validatePhoneNumber,
  verifyCustomerConsent,
  validateWhatsAppTemplate,
  buildWhatsAppTemplatePayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  type ExecuteCampaignParams,
  type CampaignRecipientMessage,
} from "../lib/campaigns/index.ts";

test("A: execution provider interface and separation of providers", async () => {
  const demoProvider = getExecutionProvider("demo");
  assert.equal(demoProvider.mode, "demo");
  assert.equal(demoProvider.isDemoOnly, true);
  assert.equal(demoProvider.isConfigured(), true);

  const whatsAppProvider = getExecutionProvider("whatsapp");
  assert.equal(whatsAppProvider.mode, "whatsapp");
  assert.equal(whatsAppProvider.isDemoOnly, false);
  // In default test environment without credentials, WhatsApp is not configured
  assert.equal(whatsAppProvider.isConfigured(), false);
});

test("A: DemoCampaignProvider fully executes campaigns in demo mode", async () => {
  const demoProvider = new DemoCampaignProvider();

  const messages: CampaignRecipientMessage[] = [
    {
      customerId: "cust-1",
      customerName: "Asha Sharma",
      customerPhone: "+919876543210",
      previousPurchase: "Atta, Dal",
      productCategory: "Groceries",
      lastPurchaseAt: "2026-01-10T10:00:00.000Z",
      customerSegment: "inactive",
      discountPercent: 15,
      message: "Hi Asha! Enjoy 15% OFF on your next groceries purchase.",
      status: "draft",
      result: null,
    },
  ];

  const params: ExecuteCampaignParams = {
    businessId: "biz-123",
    campaignId: "cmp-demo-1",
    campaignName: "15% Inactive Winback",
    channel: "WhatsApp",
    discountPercent: 15,
    messages,
    isExplicitlyApproved: true,
  };

  const result = await demoProvider.executeCampaign(params);

  assert.equal(result.executionMode, "demo");
  assert.equal(result.status, "demo_executed");
  assert.equal(result.successfulCount, 1);
  assert.equal(result.failedCount, 0);

  // E. Status separation: demo mode strictly uses demo_executed, never sent/delivered/read
  const executedMsg = result.messages[0];
  assert.equal(executedMsg.status, "demo_executed");
  assert.notEqual(executedMsg.status, "sent");
  assert.notEqual(executedMsg.status, "delivered");
  assert.notEqual(executedMsg.status, "read");
  assert.equal(executedMsg.providerMessageId, null);
  assert.match(executedMsg.result ?? "", /Demo executed/);
});

test("A & G: Demo provider requires explicit merchant approval before execution", async () => {
  const demoProvider = new DemoCampaignProvider();
  const params: ExecuteCampaignParams = {
    businessId: "biz-123",
    campaignId: "cmp-demo-2",
    campaignName: "Test Campaign",
    channel: "WhatsApp",
    discountPercent: 15,
    messages: [],
    isExplicitlyApproved: false, // Not approved!
  };

  await assert.rejects(
    async () => demoProvider.executeCampaign(params),
    /Explicit merchant approval is required/,
  );
});

test("A & G: WhatsAppCampaignProvider rejects execution when unconfigured and never fakes WhatsApp API calls", async () => {
  const whatsAppProvider = new WhatsAppCampaignProvider();

  // Clear env vars to guarantee unconfigured state
  const originalVars: Record<string, string | undefined> = {};
  for (const envKey of REQUIRED_WHATSAPP_VARS) {
    originalVars[envKey] = process.env[envKey];
    delete process.env[envKey];
  }

  try {
    assert.equal(whatsAppProvider.isConfigured(), false);
    const configStatus = whatsAppProvider.validateConfiguration();
    assert.equal(configStatus.isConfigured, false);
    assert.equal(
      configStatus.message,
      "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
    );

    const params: ExecuteCampaignParams = {
      businessId: "biz-123",
      campaignId: "cmp-real-1",
      campaignName: "Real WhatsApp Attempt",
      channel: "WhatsApp",
      discountPercent: 15,
      messages: [],
      isExplicitlyApproved: true,
    };

    // Must cleanly reject and not fake delivery
    await assert.rejects(
      async () => whatsAppProvider.executeCampaign(params),
      /Real WhatsApp integration is not configured yet. Campaigns will run in demo mode./,
    );
  } finally {
    // Restore env vars
    for (const [k, v] of Object.entries(originalVars)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

test("B: Campaign settings disallows switching to real WhatsApp sending when unconfigured", () => {
  const originalVars: Record<string, string | undefined> = {};
  for (const envKey of REQUIRED_WHATSAPP_VARS) {
    originalVars[envKey] = process.env[envKey];
    delete process.env[envKey];
  }

  try {
    // Mode switch to demo is always allowed
    const demoSwitch = validateModeSwitch("demo");
    assert.equal(demoSwitch.allowed, true);

    // Mode switch to real WhatsApp is disallowed when unconfigured
    const whatsAppSwitch = validateModeSwitch("whatsapp");
    assert.equal(whatsAppSwitch.allowed, false);
    assert.equal(
      whatsAppSwitch.reason,
      "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
    );
  } finally {
    for (const [k, v] of Object.entries(originalVars)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

test("C: WhatsApp configuration validator checks all 5 server secrets without exposing values", () => {
  const originalVars: Record<string, string | undefined> = {};
  for (const envKey of REQUIRED_WHATSAPP_VARS) {
    originalVars[envKey] = process.env[envKey];
    delete process.env[envKey];
  }

  try {
    const status = getWhatsAppConfigStatus();
    assert.equal(status.isConfigured, false);
    assert.equal(status.missingFields.length, 5);
    assert.ok(status.missingFields.includes("WHATSAPP_ACCESS_TOKEN"));
    assert.ok(status.missingFields.includes("WHATSAPP_PHONE_NUMBER_ID"));
    assert.ok(status.missingFields.includes("WHATSAPP_BUSINESS_ACCOUNT_ID"));
    assert.ok(status.missingFields.includes("WHATSAPP_WEBHOOK_VERIFY_TOKEN"));
    assert.ok(status.missingFields.includes("WHATSAPP_APP_SECRET"));

    // Verify secret values are NEVER present on the status payload
    const jsonStr = JSON.stringify(status);
    assert.equal(jsonStr.includes("accessToken"), false);
    assert.equal(jsonStr.includes("appSecret"), false);
  } finally {
    for (const [k, v] of Object.entries(originalVars)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

test("D (Step 1): Customer marketing consent validation", () => {
  const consented = verifyCustomerConsent({
    customerId: "c1",
    customerPhone: "+919876543210",
    hasMarketingConsent: true,
  });
  assert.equal(consented.allowed, true);

  const notConsented = verifyCustomerConsent({
    customerId: "c2",
    customerPhone: "+919876543210",
    hasMarketingConsent: false,
  });
  assert.equal(notConsented.allowed, false);
  assert.match(notConsented.reason ?? "", /consent/i);

  const optedOut = verifyCustomerConsent({
    customerId: "c3",
    customerPhone: "+919876543210",
    hasMarketingConsent: true,
    optedOutAt: "2026-02-01T10:00:00.000Z",
  });
  assert.equal(optedOut.allowed, false);
  assert.match(optedOut.reason ?? "", /opted out/i);
});

test("D (Step 2): Customer phone number validation for E.164 and Indian mobiles", () => {
  // Standard Indian 10 digits
  const res1 = validatePhoneNumber("9876543210");
  assert.equal(res1.isValid, true);
  assert.equal(res1.e164Phone, "+919876543210");

  // With +91
  const res2 = validatePhoneNumber("+919876543210");
  assert.equal(res2.isValid, true);
  assert.equal(res2.e164Phone, "+919876543210");

  // Invalid length / garbage
  const res3 = validatePhoneNumber("12345");
  assert.equal(res3.isValid, false);
  assert.equal(res3.e164Phone, null);

  const res4 = validatePhoneNumber("");
  assert.equal(res4.isValid, false);
});

test("D (Step 3 & 6): Template requirements and Meta Cloud API payload generator", () => {
  const approvedTemplate = validateWhatsAppTemplate({
    name: "dukaanos_discount_v1",
    language: "en_US",
    status: "APPROVED",
    category: "MARKETING",
    bodyText: "Hi {{1}}, enjoy {{2}}% OFF!",
  });
  assert.equal(approvedTemplate.valid, true);

  const pendingTemplate = validateWhatsAppTemplate({
    name: "dukaanos_discount_v1",
    language: "en_US",
    status: "PENDING",
    category: "MARKETING",
    bodyText: "Hi {{1}}, enjoy {{2}}% OFF!",
  });
  assert.equal(pendingTemplate.valid, false);

  const payload = buildWhatsAppTemplatePayload({
    recipientPhone: "+919876543210",
    templateName: "dukaanos_discount_v1",
    languageCode: "en_US",
    bodyParameters: ["Asha", "15", "groceries"],
  });

  assert.equal(payload.messaging_product, "whatsapp");
  assert.equal(payload.to, "919876543210");
  assert.equal(payload.type, "template");
  assert.equal(payload.template.name, "dukaanos_discount_v1");
  assert.equal(payload.template.components[0].parameters.length, 3);
  assert.equal(payload.template.components[0].parameters[0].text, "Asha");
});

test("D (Step 8): Meta Webhook challenge and HMAC signature validation", () => {
  // Verification challenge
  const challengeCheck = verifyWebhookChallenge({
    mode: "subscribe",
    verifyToken: "secret_verify_token",
    challenge: "123456789",
    expectedToken: "secret_verify_token",
  });
  assert.equal(challengeCheck.isValid, true);
  assert.equal(challengeCheck.challenge, "123456789");

  const challengeFail = verifyWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong_token",
    challenge: "123456789",
    expectedToken: "secret_verify_token",
  });
  assert.equal(challengeFail.isValid, false);

  // Signature verification (HMAC SHA-256)
  const appSecret = "test_meta_app_secret";
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const validSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(body).digest("hex")}`;

  assert.equal(verifyWebhookSignature(body, validSignature, appSecret), true);
  assert.equal(verifyWebhookSignature(body, "sha256=invalidhash", appSecret), false);
});

test("F: Database migration 0004 specifies all required execution tracking columns and Supabase RLS", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/0004_campaign_executions.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration 0004_campaign_executions.sql must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Required columns from PRD Section 8.F
  assert.match(sql, /execution_mode/i);
  assert.match(sql, /execution_timestamp/i);
  assert.match(sql, /audience_count/i);
  assert.match(sql, /provider_message_id/i);
  assert.match(sql, /execution_status/i);
  assert.match(sql, /campaign_id/i);
  assert.match(sql, /customer_id/i);

  // Status check constraint: draft, approved, demo_executed
  assert.match(sql, /demo_executed/i);

  // Supabase Row Level Security (RLS)
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /is_business_member\(business_id\)/i);
});


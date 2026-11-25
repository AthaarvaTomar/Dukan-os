import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  approveCampaign,
  cancelCampaign,
  computeAudience,
  DEFAULT_WINBACK_TEMPLATES,
  editCampaign,
  editCampaignMessage,
  hashCustomerId,
  personalize,
  simulateSend,
  validateAiRewrite,
  type AudienceCustomer,
  type WinbackCampaignConfig,
} from "../lib/campaigns/winback.ts";
import { POST as campaignsPost } from "../app/api/voice/campaigns/route.ts";
import { PATCH as campaignPatch } from "../app/api/voice/campaigns/[id]/route.ts";
import { POST as campaignApprovePost } from "../app/api/voice/campaigns/[id]/approve/route.ts";
import { POST as campaignSimulatePost } from "../app/api/voice/campaigns/[id]/simulate/route.ts";
import { POST as regeneratePost } from "../app/api/voice/campaigns/[id]/messages/[customerId]/regenerate/route.ts";

const NOW = new Date("2026-11-25T12:00:00.000Z");

function makeCustomer(overrides: Partial<AudienceCustomer> = {}): AudienceCustomer {
  return {
    id: "cust-1",
    name: "Asha Rao",
    phone: "+919876543210",
    segment: "inactive",
    marketingConsent: "granted",
    optedOutAt: null,
    lastCampaignAt: null,
    lastPurchaseAt: "2026-09-01T12:00:00.000Z",
    previousPurchase: "Basmati Rice",
    productCategory: "Groceries",
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<WinbackCampaignConfig> = {}): WinbackCampaignConfig {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "15% off winback",
    targetSegment: "inactive",
    offerText: "15% off your next order",
    templateText: "",
    cooldownDays: 14,
    messageCap: 50,
    version: 1,
    approvedVersion: null,
    status: "draft",
    ...overrides,
  };
}

test("computeAudience evaluates rules in strict order: segment, phone, consent, opt-out, cooldown, cap", () => {
  const customers: AudienceCustomer[] = [
    // Fails segment + missing phone + unknown consent + optedOut + cooldown -> must be segment_mismatch
    makeCustomer({
      id: "c-segment",
      segment: "regular",
      phone: "",
      marketingConsent: "unknown",
      optedOutAt: "2026-11-01T00:00:00.000Z",
      lastCampaignAt: "2026-11-24T00:00:00.000Z",
    }),
    // Passes segment, fails missing phone + consent -> must be missing_phone
    makeCustomer({
      id: "c-missing-phone",
      phone: "   ",
      marketingConsent: "revoked",
      optedOutAt: "2026-11-01T00:00:00.000Z",
    }),
    // Passes segment, fails invalid phone + consent -> must be invalid_phone
    makeCustomer({
      id: "c-invalid-phone",
      phone: "12345",
      marketingConsent: "unknown",
    }),
    // Passes segment & phone, fails unknown consent + optedOut -> must be consent_unknown
    makeCustomer({
      id: "c-consent-unknown",
      marketingConsent: "unknown",
      optedOutAt: "2026-11-01T00:00:00.000Z",
    }),
    // Passes segment & phone, fails revoked consent + optedOut -> must be consent_revoked
    makeCustomer({
      id: "c-consent-revoked",
      marketingConsent: "revoked",
      optedOutAt: "2026-11-01T00:00:00.000Z",
    }),
    // Passes segment, phone, consent, fails opt-out + cooldown -> must be opted_out
    makeCustomer({
      id: "c-opted-out",
      optedOutAt: "2026-11-10T00:00:00.000Z",
      lastCampaignAt: "2026-11-24T00:00:00.000Z",
    }),
    // Passes segment, phone, consent, opt-out, fails 14-day cooldown (sent 5 days ago) -> must be cooldown_active
    makeCustomer({
      id: "c-cooldown",
      lastCampaignAt: "2026-11-20T12:00:00.000Z",
    }),
    // Passes everything (last campaign was 20 days ago, outside 14-day cooldown)
    makeCustomer({
      id: "c-eligible-1",
      lastCampaignAt: "2026-11-05T12:00:00.000Z",
    }),
    // Passes everything (never messaged)
    makeCustomer({
      id: "c-eligible-2",
    }),
    // Passes everything but exceeds cap of 2 -> must be message_cap_reached
    makeCustomer({
      id: "c-capped",
    }),
  ];

  const result = computeAudience(customers, makeCampaign({ messageCap: 2, cooldownDays: 14 }), NOW);

  assert.deepEqual(
    result.eligible.map((c) => c.id),
    ["c-eligible-1", "c-eligible-2"],
  );

  const reasonById = new Map(result.held_back.map((entry) => [entry.customer.id, entry.reason]));
  assert.equal(reasonById.get("c-segment"), "segment_mismatch");
  assert.equal(reasonById.get("c-missing-phone"), "missing_phone");
  assert.equal(reasonById.get("c-invalid-phone"), "invalid_phone");
  assert.equal(reasonById.get("c-consent-unknown"), "consent_unknown");
  assert.equal(reasonById.get("c-consent-revoked"), "consent_revoked");
  assert.equal(reasonById.get("c-opted-out"), "opted_out");
  assert.equal(reasonById.get("c-cooldown"), "cooldown_active");
  assert.equal(reasonById.get("c-capped"), "message_cap_reached");

  assert.equal(result.reasonCounts.segment_mismatch, 1);
  assert.equal(result.reasonCounts.missing_phone, 1);
  assert.equal(result.reasonCounts.invalid_phone, 1);
  assert.equal(result.reasonCounts.consent_unknown, 1);
  assert.equal(result.reasonCounts.consent_revoked, 1);
  assert.equal(result.reasonCounts.opted_out, 1);
  assert.equal(result.reasonCounts.cooldown_active, 1);
  assert.equal(result.reasonCounts.message_cap_reached, 1);
});

test("computeAudience supports targetSegment='all' and cooldownDays=0", () => {
  const customers = [
    makeCustomer({ id: "c1", segment: "regular", lastCampaignAt: "2026-11-25T11:00:00.000Z" }),
    makeCustomer({ id: "c2", segment: "high-value", lastCampaignAt: "2026-11-25T11:30:00.000Z" }),
  ];
  const result = computeAudience(
    customers,
    makeCampaign({ targetSegment: "all", cooldownDays: 0, messageCap: 10 }),
    NOW,
  );
  assert.equal(result.eligible.length, 2);
  assert.equal(result.held_back.length, 0);
});

test("personalize deterministically selects template via hash(customer.id) and fills placeholders", () => {
  const customer = makeCustomer({
    id: "cus-deterministic-42",
    name: "Rohan Verma",
    productCategory: "Beverages",
  });

  const first = personalize(customer, DEFAULT_WINBACK_TEMPLATES, {
    offerText: "15% off",
    shopName: "Daily Needs",
  });
  const second = personalize(customer, DEFAULT_WINBACK_TEMPLATES, {
    offerText: "15% off",
    shopName: "Daily Needs",
  });
  assert.equal(first, second);
  assert.match(first, /Rohan Verma/);
  assert.match(first, /15% off/);
  assert.match(first, /Daily Needs/);
  assert.match(first, /beverages/);

  // Verify hash selects index = hashCustomerId(id) % templates.length
  const templates = ["A {{name}} {{offer}}", "B {{name}} {{offer}}", "C {{name}} {{offer}}"];
  const expectedIndex = hashCustomerId(customer.id) % templates.length;
  const rendered = personalize(customer, templates, { offerText: "10% off" });
  assert.equal(rendered, `${["A", "B", "C"][expectedIndex]} Rohan Verma 10% off`);

  // Variant offset cycles deterministically for Regenerate
  const nextVariant = personalize(customer, templates, {
    offerText: "10% off",
    variantOffset: 1,
  });
  assert.notEqual(nextVariant, rendered);
});

test("validateAiRewrite rejects new numbers, extra offers, and customer details and falls back to template", () => {
  const original = "Hi Asha Rao, enjoy 15% off on your next groceries visit at Daily Needs.";
  const offer = "15% off";

  // Valid rewrite preserving exact offer and numbers
  const good = validateAiRewrite(
    original,
    "Hello Asha Rao, visit Daily Needs soon for 15% off your next groceries order.",
    offer,
  );
  assert.equal(good.valid, true);
  assert.equal(good.rejectedReasons.length, 0);
  assert.match(good.text, /Hello Asha Rao/);

  // Rejects new/changed number
  const newNumber = validateAiRewrite(
    original,
    "Hi Asha Rao, enjoy 25% off on your next groceries visit within 3 days.",
    offer,
  );
  assert.equal(newNumber.valid, false);
  assert.equal(newNumber.text, original);
  assert.ok(newNumber.rejectedReasons.some((r) => r.startsWith("new_numbers:")));

  // Rejects extra offer (free gift / cashback / BOGO)
  const extraOffer = validateAiRewrite(
    original,
    "Hi Asha Rao, enjoy 15% off plus free delivery and a bonus gift on groceries!",
    offer,
  );
  assert.equal(extraOffer.valid, false);
  assert.equal(extraOffer.text, original);
  assert.ok(extraOffer.rejectedReasons.some((r) => r.startsWith("extra_offer:")));

  // Rejects invented customer details (email, phone, address, spend)
  const leakedDetail = validateAiRewrite(
    original,
    "Hi Asha Rao, enjoy 15% off! We saw your email asha@example.com and ₹5000 total spend.",
    offer,
  );
  assert.equal(leakedDetail.valid, false);
  assert.equal(leakedDetail.text, original);
  assert.ok(leakedDetail.rejectedReasons.some((r) => r.startsWith("extra_customer_detail:")));

  // Rejects dropped offer number
  const droppedOffer = validateAiRewrite(
    original,
    "Hi Asha Rao, stop by Daily Needs soon for a great deal on groceries.",
    offer,
  );
  assert.equal(droppedOffer.valid, false);
  assert.equal(droppedOffer.text, original);
  assert.ok(droppedOffer.rejectedReasons.some((r) => r.startsWith("missing_offer_numbers:")));
});

test("editing a campaign or message increments version and clears approvedVersion", () => {
  let campaign = makeCampaign();
  assert.equal(campaign.version, 1);
  assert.equal(campaign.approvedVersion, null);

  campaign = approveCampaign(campaign);
  assert.equal(campaign.status, "approved");
  assert.equal(campaign.approvedVersion, 1);

  // Editing campaign settings bumps version to 2 and clears approval
  campaign = editCampaign(campaign, { offerText: "20% off your next order" });
  assert.equal(campaign.version, 2);
  assert.equal(campaign.approvedVersion, null);
  assert.equal(campaign.status, "draft");

  // Re-approve v2
  campaign = approveCampaign(campaign);
  assert.equal(campaign.approvedVersion, 2);
  assert.equal(campaign.status, "approved");

  // Editing an individual message bumps version to 3 and clears approval
  const edited = editCampaignMessage(campaign, { "cust-1": "Old msg" }, "cust-1", "New msg");
  assert.equal(edited.campaign.version, 3);
  assert.equal(edited.campaign.approvedVersion, null);
  assert.equal(edited.campaign.status, "draft");
  assert.equal(edited.messagesByCustomerId["cust-1"], "New msg");

  // Cancelling clears approval and sets cancelled
  const cancelled = cancelCampaign(approveCampaign(edited.campaign));
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.approvedVersion, null);
});

test("simulateSend enforces approved_version === version, recomputes audience, writes recipients, and never uses sent/delivered", () => {
  const c1 = makeCustomer({ id: "c1", name: "Asha" });
  const c2 = makeCustomer({ id: "c2", name: "Rohan" });

  // 1. Rejects unapproved draft
  const draft = makeCampaign();
  assert.throws(
    () => simulateSend({ campaign: draft, customers: [c1, c2], now: NOW }),
    /Approval required/,
  );

  // 2. Rejects stale approval (approvedVersion !== version)
  const stale: WinbackCampaignConfig = {
    ...draft,
    version: 2,
    approvedVersion: 1,
    status: "approved",
  };
  assert.throws(
    () => simulateSend({ campaign: stale, customers: [c1, c2], now: NOW }),
    /Approval required/,
  );

  // 3. Recomputes audience at simulate time (c2 opted out after draft creation)
  const approved = approveCampaign(draft);
  const c2OptedOut = { ...c2, optedOutAt: "2026-11-25T10:00:00.000Z" };
  const result = simulateSend({
    campaign: approved,
    customers: [c1, c2OptedOut],
    messagesByCustomerId: {
      c1: "Hi Asha, enjoy 15% off at Daily Needs.",
      c2: "Hi Rohan, enjoy 15% off at Daily Needs.",
    },
    now: NOW,
  });

  assert.equal(result.campaign.status, "demo_executed");
  assert.equal(result.executedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.recipients.length, 2);

  const r1 = result.recipients.find((r) => r.customerId === "c1")!;
  const r2 = result.recipients.find((r) => r.customerId === "c2")!;
  assert.equal(r1.status, "demo_executed");
  assert.equal(r1.skipReason, null);
  assert.equal(r2.status, "skipped");
  assert.equal(r2.skipReason, "opted_out");

  // Strictly never uses "sent" or "delivered"
  assert.doesNotMatch(result.summary, /\b(sent|delivered)\b/i);
  for (const r of result.recipients) {
    assert.doesNotMatch(r.status, /\b(sent|delivered)\b/i);
    assert.doesNotMatch(r.detail, /\b(sent|delivered)\b/i);
  }
});

test("Winback API lifecycle enforces versioned approval, regeneration invalidation, and Simulated / Demo execution", async () => {
  // Create a new draft via POST /api/voice/campaigns
  const createRes = await campaignsPost(
    new Request("http://localhost/api/voice/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetSegment: "all",
        offerText: "12% off your next order",
        cooldownDays: 14,
        messageCap: 5,
      }),
    }),
  );
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  const draftId = created.pending.id as string;
  assert.equal(created.pending.version, 1);
  assert.equal(created.pending.approvedVersion, null);
  assert.ok(created.pending.eligibleCount > 0);
  assert.ok(created.pending.heldBackCount > 0);

  // Simulate BEFORE approving must be rejected with 409
  const preApproveSim = await campaignSimulatePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/simulate`, { method: "POST" }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(preApproveSim.status, 409);

  // Approve v1
  const approveV1 = await campaignApprovePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(approveV1.status, 200);
  const v1Body = await approveV1.json();
  assert.equal(v1Body.pending.approvedVersion, 1);
  assert.equal(v1Body.pending.status, "approved");

  // Edit a customer message -> increments to v2 and clears approvedVersion
  const firstCustomerId = created.pending.messages[0].customerId as string;
  const editRes = await campaignPatch(
    new Request(`http://localhost/api/voice/campaigns/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: firstCustomerId,
        message: "Updated custom winback text with 12% off.",
      }),
    }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(editRes.status, 200);
  const editBody = await editRes.json();
  assert.equal(editBody.version, 2);
  assert.equal(editBody.approvedVersion, null);

  // Simulate after edit (approval invalidated) must be rejected with 409
  const staleSim = await campaignSimulatePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/simulate`, { method: "POST" }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(staleSim.status, 409);

  // Regenerate message -> increments to v3 and clears approvedVersion
  const regenRes = await regeneratePost(
    new Request(
      `http://localhost/api/voice/campaigns/${draftId}/messages/${firstCustomerId}/regenerate`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: draftId, customerId: firstCustomerId }) },
  );
  assert.equal(regenRes.status, 200);
  const regenBody = await regenRes.json();
  assert.equal(regenBody.version, 3);
  assert.equal(regenBody.approvedVersion, null);

  // Approve v3 and simulate
  const approveV3 = await campaignApprovePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(approveV3.status, 200);

  const simRes = await campaignSimulatePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/simulate`, { method: "POST" }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(simRes.status, 200);
  const simBody = await simRes.json();
  assert.equal(simBody.status, "demo_executed");
  assert.ok(simBody.executedCount > 0);
  assert.doesNotMatch(simBody.message, /\b(sent|delivered)\b/i);

  // Duplicate simulate must fail with 409
  const dupSim = await campaignSimulatePost(
    new Request(`http://localhost/api/voice/campaigns/${draftId}/simulate`, { method: "POST" }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(dupSim.status, 409);
});

test("Database migration 0006 defines Winback schema columns, constraints, and per-merchant RLS", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/0006_winback_campaigns.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration 0006_winback_campaigns.sql must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");
  assert.match(sql, /marketing_consent/i);
  assert.match(sql, /'granted',\s*'unknown',\s*'revoked'/i);
  assert.match(sql, /opted_out_at/i);
  assert.match(sql, /approved_version/i);
  assert.match(sql, /offer_text/i);
  assert.match(sql, /cooldown_days/i);
  assert.match(sql, /message_cap/i);
  assert.match(sql, /'draft',\s*'approved',\s*'demo_executed',\s*'cancelled'/i);
  assert.match(sql, /skip_reason/i);
  assert.match(sql, /'queued',\s*'demo_executed',\s*'skipped'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /is_business_member\(business_id\)/i);
});

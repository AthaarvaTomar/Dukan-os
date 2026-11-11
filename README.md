# DukaanOS

DukaanOS is a responsive workspace for small-business owners, with a shared dashboard, demo store data, and an AI assistant (Gemini) with text chat, voice interface, and Supabase-backed authentication.

The demo workspace uses fictional records for Sharma General Store. Its dashboard totals and chart are calculated from the same demo transactions and expenses that the data layer exposes.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) key — server only |
| `GEMINI_MODEL` | Model name, e.g. `gemini-2.5-flash` |
| `AI_PROVIDER` | `gemini` (default) or `sarvam` (optional legacy) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (safe for browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server only, never expose |
| `SARVAM_API_KEY` | Optional: Sarvam Voice Agents API key |
| `SARVAM_TOOL_API_TOKEN` | Optional: webhook bearer token for Sarvam voice tools |
| `WHATSAPP_ACCESS_TOKEN` | Future: Meta WhatsApp Cloud API token (server-only) |
| `WHATSAPP_PHONE_NUMBER_ID` | Future: Meta WhatsApp Business Phone Number ID (server-only) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Future: Meta WhatsApp Business Account ID (server-only) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Future: Webhook verification token (server-only) |
| `WHATSAPP_APP_SECRET` | Future: Meta App Secret for HMAC webhook signature validation (server-only) |

## Routes

| Page | Route |
| --- | --- |
| Overview | `/` |
| AI Assistant (chat and voice) | `/ai-assistant` |
| Customers | `/customers` |
| Marketing Campaigns | `/marketing` |
| Inventory | `/inventory` |
| Business Insights | `/insights` |
| Settings | `/settings` |

Settings remains a placeholder; the inventory, customer, campaign, and assistant modules are interactive.

## Project structure

```text
app/
  (dashboard)/      Dashboard routes and shared layout
components/
  dashboard/        Sidebar, shell, chart, and workspace modules
  ui/               shadcn/ui-style primitives
lib/
  demo-data/        Typed demo entities, seeded records, analytics, validation, and storage
  assistant/        Text assistant and business-tool calculations
  navigation.ts     Shared route labels and icons
  utils.ts          Shared class-name helper
tests/
  demo-data.test.ts Calculation, segmentation, inventory, and integrity tests
```

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS 4
- shadcn/ui component conventions
- Lucide React, Recharts, and Sonner

## Demo data

The seed includes 34 customers, 24 products, 418 transactions, 24 expenses, and 6 marketing campaigns. Purchase dates are generated within the last 90 days. Transaction items keep the product price and cost at the time of sale, so revenue and estimated profit remain based on transaction history.

Customer segments are derived from purchases: high-value customers have spent at least â‚¹50,000; new customers have a first purchase within 30 days and no more than two orders; inactive customers have no order in the past 45 days (or have never purchased); all other purchasers are regular customers. Inventory is low at or below its reorder level and out when its stock is zero.

The `useDemoStore` hook provides typed create/update/delete helpers for customer, product, transaction, expense, and campaign records. It saves updates to browser local storage and validates transaction references before saving. Local data can be reset with the hook's `reset` method.

## Inventory

The Inventory page uses the shared `DemoData.products` collection: add, edit, search, filter, and delete products; record stock-in, stock-out, and adjustment movements; review low-stock alerts and rule-based reorder suggestions; and save or approve supplier order drafts. Stock movements and supplier drafts are stored in the same versioned browser local-storage record as the rest of the demo data. Product and stock changes therefore remain available after a page reload and update dashboard metrics and text-assistant answers.

Low stock means current quantity is less than or equal to the configured minimum. Reorder recommendations use actual completed sales from the last 30 days and a 14-day coverage target, while never suggesting less than the minimum-stock shortage. A supplier draft uses the product purchase cost; merchants can edit quantities and must supply a supplier name before saving. Approval only marks the draft approved in DukaanOS. It does not send an order.

When the Inventory page loads or inventory changes, it synchronizes products, stock history, and supplier drafts to the server-side demo store so Sarvam inventory tools use the current inventory. That server store is in memory and resets when its process restarts; browser inventory remains in local storage. This demo architecture does not provide multi-device synchronization or durable server-side history.

Run the data tests with:

```bash
npm test
```

## AI assistant

The `POST /api/assistant` endpoint accepts `{ "message": "...", "data": <current DemoData> }`. The browser sends its current dataset because the server cannot read browser local storage. The response includes `{ reply, intent, data }`, with analytics results available for future chart and table views.

The assistant is powered by **Gemini** (Sarvam legacy provider is optional). Set `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g. `gemini-2.5-flash`), and optionally `AI_PROVIDER=gemini` (default) in `.env.local`.

The API key is used only on the server. The integration classifies supported questions, runs the existing demo analytics, then asks the AI model to phrase a concise reply in the user's language using only calculated values. Invalid classifier JSON falls back to deterministic keyword matching; requests with missing credentials, provider failures, or timeouts return a friendly `error` response with HTTP 200.

## Sarvam Voice Agent setup

The browser uses the official [`sarvam-conv-ai-sdk`](https://docs.sarvam.ai/voice-agents/deploy/sdks/web) web SDK (`ConversationAgent`, `BrowserAudioInterface`, and `InteractionType.CALL`). Its signed-URL request is proxied through `/api/sarvam/`; the Sarvam API key stays on the server and is never placed in browser code.

1. Copy `.env.example` to `.env.local` if it is not already present. The checked-in `.env.example` contains placeholders only; `.env.local` is ignored by Git.
2. In your Sarvam Voice Agents dashboard, open **Settings â†’ API Key** and put that Voice Agents API key in `SARVAM_API_KEY`.
3. Open the agent you intend to use and choose **Deploy with Code â†’ Web SDK**. Copy the `org_id`, `workspace_id`, and `app_id` values shown in the SDK configuration into `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, and `SARVAM_APP_ID`, respectively. `app_id` is the ID of the voice agent, not a Chat Completions model ID.
4. Generate a long random token for `SARVAM_TOOL_API_TOKEN`, then configure the same value as a **Bearer token secret** in the Sarvam workspace. For example, generate a token locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never put this token in browser code or a committed file.
5. In the Sarvam agent builder, use the system instructions below, add the HTTPS API tools listed in the next section, and **commit an agent version**. The SDK cannot connect to an agent with no committed version.
6. Restart `npm run dev`, allow microphone access when prompted, then click **Start voice**. Starting the assistant page does not open the microphone.

The voice agent's system instructions:

> You are DukaanOS, an AI business assistant for Indian shopkeepers. Speak naturally in Hindi, English, or Hinglish. Answer using actual DukaanOS business data. Help merchants understand sales, customers, inventory, and profits. Keep answers short and practical. Never invent business figures. Ask for confirmation before making changes or executing campaigns.

Add these campaign-specific rules after that prompt: for â€œCreate personalized 15% discount messages for inactive customersâ€ (or an equivalent request), call `campaign-draft`; report the returned eligible customer count, explain that each draft uses verified purchase/category/segment details where present, and ask the merchant to review the campaign in DukaanOS. Do not execute anything until the merchant explicitly approves using the review button. Approval records each message as simulated only. Never say a WhatsApp/SMS message was sent or delivered.

### Sarvam HTTPS API tools

Create these as Sarvam **API tools** (not lifecycle webhooks), use the matching HTTP method and path, and configure **Auth â†’ Bearer token** with the secure workspace secret matching `SARVAM_TOOL_API_TOKEN`. Responses are small JSON objects calculated from the server-side demo data:

| Tool name | Method and path | Description |
| --- | --- | --- |
| `sales_today` | `GET /api/voice/tools/sales-today` | Today's actual revenue and transaction count |
| `revenue_and_profit` | `GET /api/voice/tools/revenue-profit` | Calculated total revenue, estimated profit, and expenses |
| `top_products` | `GET /api/voice/tools/top-products?limit=5` | Top-selling products by quantity and revenue |
| `low_stock_and_reorders` | `GET /api/voice/tools/inventory-low` | Low/out-of-stock items and suggested reorder quantities |
| `inactive_customers` | `GET /api/voice/tools/inactive-customers` | Eligible customers, verified purchase details, and segment |
| `customer_purchase_history` | `GET /api/voice/tools/customer-history?name={{customerName}}` | A customer's recent purchases and actual spend |
| `business_insights` | `GET /api/voice/tools/business-insights` | Calculated revenue, profit, inventory, customers, and top products |
| `campaign_history` | `GET /api/voice/tools/campaign-history` | Existing campaign records and simulated campaign status |
| `draft_inactive_customer_campaign` | `POST /api/voice/tools/campaign-draft` | Create personalized 15% messages for eligible customers and request merchant review |

Use the secure bearer credential for every tool. The customer-history tool accepts an exact customer name or `customer_id`. The campaign-draft tool returns a unique message draft per eligible customer, generated from their actual name, segment, last purchase date, and latest product/category when available, plus the eligible count and an approval-required flag. The Marketing Campaigns page supports reviewing, editing, regenerating, and previewing all messages. Only the merchant's explicit **Approve & simulate** action records per-customer simulation results and campaign history; duplicate execution is rejected. No messaging provider is connected and no messages are sent.

### Local testing and deployment limits

The browser voice session can be tested locally at `http://localhost:3000` (localhost is permitted for microphone access). Sarvam's hosted API tools **cannot** call a localhost URL. To test those tools through Sarvam, deploy DukaanOS to a publicly reachable HTTPS host, set the environment variables there, and use that public base URL in each Sarvam tool. Do not configure cloud tools to call localhost.

For a local API smoke test, set the token in the PowerShell session and call one authenticated endpoint:

```powershell
$env:SARVAM_TOOL_API_TOKEN = "the-same-local-test-token-as-.env.local"
curl.exe -H "Authorization: Bearer $env:SARVAM_TOOL_API_TOKEN" http://localhost:3000/api/voice/tools/sales-today
```

Server-side demo data and simulated campaigns are held in memory for the lifetime of a server process. This provides a consistent dataset to the API tools without trusting browser localStorage, but it is not durable or shared across serverless instances/restarts. Browser-only edits are not synchronized. Use a shared persistent data store before relying on edits or campaign history across restarts or production instances.

The integration is **not confirmed end-to-end** until valid Sarvam credentials are configured, an agent is committed, and a real voice session plus authenticated HTTPS tool calls have been tested.

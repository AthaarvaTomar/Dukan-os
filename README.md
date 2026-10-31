# DukaanOS

DukaanOS is a responsive workspace foundation for small-business owners. This first iteration includes the shared dashboard layout, navigation, a sample overview, and placeholders for the upcoming modules.

The demo workspace uses fictional records for Sharma General Store. Its dashboard totals and chart are calculated from the same demo transactions and expenses that the data layer exposes.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Routes

| Page | Route |
| --- | --- |
| Overview | `/` |
| AI Assistant | `/ai-assistant` |
| Customers | `/customers` |
| Marketing Campaigns | `/marketing` |
| Inventory | `/inventory` |
| Business Insights | `/insights` |
| Settings | `/settings` |

The module routes intentionally use placeholders until their features are implemented.

## Project structure

```text
app/
  (dashboard)/      Dashboard routes and shared layout
components/
  dashboard/        Sidebar, shell, chart, and module placeholder
  ui/               shadcn/ui-style primitives
lib/
  demo-data/        Typed demo entities, seeded records, analytics, validation, and local storage
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

Customer segments are derived from purchases: high-value customers have spent at least ₹50,000; new customers have a first purchase within 30 days and no more than two orders; inactive customers have no order in the past 45 days (or have never purchased); all other purchasers are regular customers. Inventory is low at or below its reorder level and out when its stock is zero.

The `useDemoStore` hook provides typed create/update/delete helpers for customer, product, transaction, expense, and campaign records. It saves updates to browser local storage and validates transaction references before saving. Local data can be reset with the hook's `reset` method.

Run the data tests with:

```bash
npm test
```

## AI assistant backend

The `POST /api/assistant` endpoint accepts `{ "message": "...", "data": <current DemoData> }`. The browser must send its current dataset because the server cannot read browser local storage. The response includes `{ reply, intent, data }`, with analytics results available for future chart and table views.

Set `SARVAM_API_KEY` in a local `.env.local` file (see [.env.example](./.env.example)). The key is used only by the server. The integration uses the [Sarvam Chat Completions API](https://docs.sarvam.ai/api-reference/chat/chat-completions-v1), model `sarvam-105b`, the `Authorization: Bearer` header, and the `api-subscription-key` header. It classifies supported questions, runs the existing demo analytics, then asks Sarvam to phrase a concise reply in the user's language using only calculated values. Invalid classifier JSON falls back to deterministic keyword matching; requests with missing credentials, provider failures, or timeouts return a friendly `error` response with HTTP 200.

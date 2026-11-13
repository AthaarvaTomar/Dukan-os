# DukaanOS – AI-Powered Business Management Platform

**Your Business. Your AI Partner.**

DukaanOS is an AI-powered business management platform designed to help small retailers and shopkeepers manage their daily business operations through a unified, intelligent workspace.

The platform combines business analytics, sales tracking, inventory management, customer relationship management, marketing campaigns, and an AI-powered conversational assistant into a single responsive dashboard.

Powered by **Google Gemini AI**, DukaanOS enables merchants to interact with their business data using natural language and receive actionable insights about sales, revenue, expenses, profitability, customers, and inventory. It also supports voice-based interactions through the Sarvam Voice Agents SDK.

The application is built using Next.js, React, TypeScript, Supabase, and modern frontend technologies.

---

## 1. Key Features

### AI Business Assistant – Google Gemini
* Integrated Google Gemini AI as the primary conversational business assistant.
* Supports natural-language queries about business performance and operations.
* Provides contextual responses using calculated business analytics rather than invented business figures.
* Supports questions related to daily sales, total revenue, estimated profit, expenses, inventory, and customer activity.
* Uses intent classification to identify supported business queries.
* Executes predefined business calculations before generating AI responses.
* Supports responses in the user's preferred language.
* Includes fallback handling for invalid classifier responses and AI provider failures.

**Example queries:**
* `"Aaj kitni sale hui?"`
* `"What is my total revenue this month?"`
* `"Which products should I reorder?"`
* `"Who are my inactive customers?"`
* `"Which products generate the highest profit?"`
* `"How much did I spend this month?"`

### Voice-Based AI Assistant
* Integrated the official Sarvam Voice Agents Web SDK.
* Supports browser-based voice interactions.
* Uses the Sarvam ConversationAgent and BrowserAudioInterface.
* Connects voice conversations to authenticated backend business API tools.
* Allows merchants to retrieve sales, inventory, and customer insights through voice queries.
* Keeps voice-agent credentials and tool authentication tokens on the server.
* Supports campaign drafting through voice instructions with merchant approval.

### Business Dashboard and Analytics
* Unified dashboard displaying important business metrics.
* Sales and revenue summaries.
* Estimated profit and expense tracking.
* Customer and product performance insights.
* Interactive charts and visualizations using Recharts.
* Dashboard calculations based on the shared demo-data layer.
* Responsive workspace for desktop, tablet, and mobile screens.

### Sales and Transaction Management
* Maintains transaction records and product-level sales information.
* Calculates transaction totals using recorded product prices.
* Tracks revenue and estimated profit using historical transaction data.
* Maintains product cost and selling price at the time of each transaction.
* Provides transaction data for business analytics and AI responses.

### Inventory Management
* Add, edit, search, filter, and delete products.
* Record stock-in, stock-out, and adjustment movements.
* Monitor available stock quantities.
* Generate low-stock and out-of-stock alerts.
* Calculate reorder suggestions using actual completed sales.
* Generate supplier order drafts.
* Edit supplier order quantities and supplier information.
* Approve supplier drafts within the application.
* Synchronize inventory information with the server-side demo store for voice-agent tools.

**Inventory intelligence:**
* Low stock is determined using the configured minimum stock quantity.
* Reorder recommendations use completed sales from the previous 30 days.
* Recommendations target 14 days of stock coverage.
* Suggested quantities also account for minimum-stock shortages.
* Supplier order drafts use the product's purchase cost.



### Customer Management and Segmentation
* Maintain customer records and purchase histories.
* Track customer spending and order counts.
* Calculate customer segments using purchasing activity.
* Identify high-value, new, inactive, and regular customers.
* Display customer purchase information for business insights.

**Customer segmentation rules:**

| Segment | Condition |
|---|---|
| **High Value** | Total spending of at least ₹50,000 |
| **New** | First purchase within 30 days and no more than two orders |
| **Inactive** | No purchase in the last 45 days or never purchased |
| **Regular** | Other purchasing customers |

### AI-Powered Marketing Campaigns
* Generate personalized marketing campaign drafts.
* Identify eligible inactive customers.
* Create individual 15% discount message drafts.
* Personalize messages using actual customer names, segments, purchase history, and product categories where available.
* Review, edit, regenerate, and preview campaign messages.
* Require explicit merchant approval before recording campaign execution.
* Maintain simulated campaign history.
* Prevent duplicate campaign execution.

> **Important:** Campaign approvals record simulated results only. No WhatsApp or SMS messages are sent because a messaging provider is not connected.

### Authentication and Data Management
* Supabase-backed authentication.
* Environment-based configuration.
* Typed demo-data entities and validation.
* Shared data-access hooks for application modules.
* Browser local-storage persistence for demo workspace updates.
* Transaction reference validation before saving changes.
* Server-side API credential management.

---

## 2. Technology Stack

| Category | Technology |
|---|---|
| **Frontend Framework** | Next.js (App Router) |
| **UI Library** | React |
| **Programming Language** | TypeScript |
| **Styling** | Tailwind CSS 4 |
| **UI Components** | shadcn/ui conventions |
| **Icons** | Lucide React |
| **Charts** | Recharts |
| **Notifications** | Sonner |
| **AI Assistant** | Google Gemini API |
| **Voice Integration** | Sarvam Voice Agents SDK |
| **Authentication** | Supabase Auth |
| **Data Validation** | TypeScript and application-level validation |
| **Browser Persistence** | Local Storage |
| **Testing** | Project test suite using `npm test` |
| **Package Manager** | npm |

### AI and Voice Technologies

* **Google Gemini AI**
  * Natural-language business assistant.
  * Business query intent classification.
  * Contextual response generation.
  * Business insights based on calculated analytics.

* **Sarvam AI**
  * Voice-based conversational interface.
  * Browser microphone and audio handling.
  * Voice-agent deployment through the official Web SDK.
  * Authenticated backend API tools for business operations.

---

## 3. Project Architecture

The application follows a modular Next.js App Router architecture organizing routes, shared components, server-side actions, and state management hooks to ensure scalability and separation of concerns.

---

## 4. Getting Started

### Prerequisites

Make sure you have installed:
* Node.js (compatible with your project's Next.js version)
* npm
* Git
* A Supabase project
* A Google AI Studio API key
* Sarvam Voice Agents credentials (if testing voice functionality)

### Installation

1. Clone the repository:
2. npm install
3. npm run dev

DukaanOS aims to make business intelligence accessible to small retailers by combining everyday business management tools with conversational AI.

Instead of navigating multiple dashboards and manually calculating business figures, merchants can use a unified workspace or simply ask the AI assistant questions about their business.

DukaanOS – Your Business. Your AI Partner.

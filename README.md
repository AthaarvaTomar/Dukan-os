# DukaanOS – AI-Powered Business Management Platform

**Your Business. Your AI Partner.**

DukaanOS is an AI-powered business management platform built to help small retailers and shopkeepers manage their business operations through a single intelligent dashboard.

It combines sales analytics, inventory management, customer insights, marketing campaigns, and conversational AI into one responsive application.

Powered by **Google Gemini AI** and **Sarvam Voice Agents SDK**, DukaanOS allows merchants to interact with business data using natural language and voice commands, helping them make faster, data-driven decisions.

## Key Features

### 🤖 AI Business Assistant
- Integrated Google Gemini API for conversational business intelligence.
- Natural-language queries for sales, revenue, expenses, profit, inventory, and customer insights.
- Intent classification and predefined business calculations for context-aware responses.
- Multilingual response support.
- Example: *"Aaj kitni sale hui?"* and *"Which products should I reorder?"*

### 🎙️ Voice-Based AI Assistant
- Integrated official Sarvam Voice Agents Web SDK.
- Browser-based voice conversations using microphone and audio interfaces.
- Connected voice-agent tools to authenticated backend business APIs.
- Supports voice-based business queries and campaign drafting.

### 📊 Business Analytics Dashboard
- Sales, revenue, expense, and estimated profit summaries.
- Interactive charts and business performance visualizations.
- Product and customer analytics.
- Responsive dashboard for desktop, tablet, and mobile.

### 📦 Inventory Management
- Complete product CRUD operations and stock movement tracking.
- Low-stock and out-of-stock alerts.
- Automated reorder recommendations based on the previous 30 days of sales.
- 14-day stock coverage calculations.
- Supplier order drafting and approval workflow.

### 👥 Customer Management
- Customer records and purchase history tracking.
- Automatic customer segmentation: High Value, New, Inactive, and Regular.
- Customer spending and order analytics.
- Identification of inactive and high-value customers.

### 📢 AI Marketing Campaigns
- AI-generated personalized marketing messages.
- Customer-specific 15% discount campaign drafts.
- Review, edit, regenerate, and approve campaign messages.
- Campaign history and duplicate-execution prevention.

*Note: Campaign execution is simulated. Live WhatsApp/SMS delivery is not connected.*

### 🔐 Authentication & Data Management
- Supabase authentication and session handling.
- Shared application data-access hooks.
- TypeScript-based data models and validation.
- Local Storage persistence for demo workspace updates.
- Server-side handling of AI and voice credentials.

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| UI & Charts | Lucide React, Recharts, Sonner |
| AI Integration | Google Gemini API |
| Voice AI | Sarvam Voice Agents SDK |
| Authentication | Supabase Auth |
| Data Management | TypeScript, Local Storage |
| Testing | npm test |
| Package Manager | npm |

## Architecture Highlights

- Modular Next.js App Router architecture.
- Separation of frontend components, API routes, and business logic.
- Server-side AI integration and credential management.
- Shared business analytics and demo-data layer.
- Authenticated backend tools for voice-agent interactions.
- Reusable components and responsive layouts.

## Getting Started

**Prerequisites:** Node.js, npm, Supabase project, Google Gemini API key, and Sarvam credentials for voice functionality.

```bash
# Clone the repository
git clone <YOUR_REPOSITORY_URL>

# Navigate to project
cd dukaanos

# Install dependencies
npm install

# Configure environment variables
# Add Supabase, Gemini, and Sarvam credentials

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

## Project Highlights

- Built an integrated AI-powered business management solution for small retailers.
- Combined LLM-based business assistance with calculated business analytics.
- Integrated two AI platforms: Google Gemini and Sarvam.
- Developed inventory intelligence using historical sales and stock-level calculations.
- Implemented customer segmentation and personalized marketing workflows.
- Designed a modular, responsive application using modern full-stack technologies.

---

**DukaanOS – Your Business. Your AI Partner.**

-- Migration 0004: WhatsApp Integration Architecture & Campaign Execution Tracking
-- Prepares schema for separate execution modes (demo vs real WhatsApp)
-- and isolates execution records per business with Row Level Security (RLS).

-- 1. Ensure campaigns table has execution_mode and supports demo_executed status
alter table public.campaigns
  add column if not exists execution_mode text not null default 'demo'
  check (execution_mode in ('demo', 'whatsapp'));

-- Update status check on campaigns to support demo execution states
alter table public.campaigns
  drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'approved', 'demo_executed', 'scheduled', 'active', 'completed', 'simulated'));

-- Update recipient status check to include demo_executed
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_status_check;

alter table public.campaign_recipients
  add constraint campaign_recipients_status_check
  check (status in ('pending', 'draft', 'approved', 'demo_executed', 'sent', 'failed'));

-- 2. Campaign executions table: tracks individual message/campaign executions
-- Stores execution_mode, execution_timestamp, audience_count, provider_message_id (nullable),
-- execution_status, campaign_id, and customer_id
create table if not exists public.campaign_executions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  execution_mode text not null check (execution_mode in ('demo', 'whatsapp')),
  execution_timestamp timestamptz not null default now(),
  audience_count integer not null default 1 check (audience_count >= 0),
  provider_message_id text, -- nullable: Meta wamid for real WhatsApp sends, null for demo
  execution_status text not null check (execution_status in (
    -- Demo mode execution statuses (strictly: draft, approved, demo_executed)
    'draft', 'approved', 'demo_executed',
    -- Future real WhatsApp provider execution/delivery statuses
    'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'rejected'
  )),
  message_body text not null default '',
  provider_response jsonb,
  error_details text,
  created_at timestamptz not null default now()
);

-- Indexes for performance and multi-tenant queries
create index if not exists campaign_executions_business_idx
  on public.campaign_executions (business_id, execution_timestamp desc);

create index if not exists campaign_executions_campaign_idx
  on public.campaign_executions (campaign_id);

create index if not exists campaign_executions_customer_idx
  on public.campaign_executions (customer_id);

create index if not exists campaign_executions_provider_msg_idx
  on public.campaign_executions (provider_message_id)
  where provider_message_id is not null;

-- 3. Row Level Security (RLS) to isolate all execution records by merchant/business
alter table public.campaign_executions enable row level security;

drop policy if exists "campaign_executions_member_all" on public.campaign_executions;
create policy "campaign_executions_member_all" on public.campaign_executions
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop trigger if exists guard_campaign_executions_business on public.campaign_executions;
create trigger guard_campaign_executions_business before update on public.campaign_executions
  for each row execute function public.prevent_business_change();


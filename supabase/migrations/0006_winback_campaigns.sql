-- Migration 0006: Winback AI campaign eligibility, consent, versioning, and simulated demo recipients
-- Idempotent migration keeping DukaanOS per-merchant Row Level Security (RLS).

-- 1. Customers: marketing consent, opt-out timestamp, and phone column
alter table public.customers
  add column if not exists phone text not null default '',
  add column if not exists marketing_consent text not null default 'unknown',
  add column if not exists opted_out_at timestamptz;

alter table public.customers
  drop constraint if exists customers_marketing_consent_check;

alter table public.customers
  add constraint customers_marketing_consent_check
  check (marketing_consent in ('granted', 'unknown', 'revoked'));

-- 2. Campaigns: versioned approval, offer text, target segment, template, cooldown, cap, and strict status
alter table public.campaigns
  add column if not exists version integer not null default 1,
  add column if not exists approved_version integer,
  add column if not exists offer_text text not null default '',
  add column if not exists target_segment text not null default 'inactive',
  add column if not exists template_text text not null default '',
  add column if not exists cooldown_days integer not null default 14,
  add column if not exists message_cap integer not null default 50;

alter table public.campaigns
  drop constraint if exists campaigns_version_check,
  drop constraint if exists campaigns_approved_version_check,
  drop constraint if exists campaigns_target_segment_check,
  drop constraint if exists campaigns_cooldown_days_check,
  drop constraint if exists campaigns_message_cap_check,
  drop constraint if exists campaigns_status_check;

-- Normalize any legacy campaign statuses before tightening constraint
update public.campaigns
set status = case
  when status in ('draft', 'approved', 'demo_executed', 'cancelled') then status
  when status in ('simulated', 'completed', 'active') then 'demo_executed'
  else 'draft'
end;

alter table public.campaigns
  add constraint campaigns_version_check check (version >= 1),
  add constraint campaigns_approved_version_check
    check (approved_version is null or (approved_version >= 1 and approved_version <= version)),
  add constraint campaigns_target_segment_check
    check (target_segment in ('all', 'inactive', 'regular', 'new', 'high-value')),
  add constraint campaigns_cooldown_days_check check (cooldown_days >= 0),
  add constraint campaigns_message_cap_check check (message_cap >= 1),
  add constraint campaigns_status_check
    check (status in ('draft', 'approved', 'demo_executed', 'cancelled'));

-- 3. Campaign recipients: queued/demo_executed/skipped statuses and skip_reason
alter table public.campaign_recipients
  add column if not exists skip_reason text;

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_status_check;

update public.campaign_recipients
set status = case
  when status in ('queued', 'demo_executed', 'skipped') then status
  when status in ('pending', 'draft', 'approved') then 'queued'
  when status in ('sent', 'simulated') then 'demo_executed'
  else 'skipped'
end;

alter table public.campaign_recipients
  alter column status set default 'queued',
  add constraint campaign_recipients_status_check
    check (status in ('queued', 'demo_executed', 'skipped'));

create index if not exists campaign_recipients_business_customer_idx
  on public.campaign_recipients (business_id, customer_id, status, created_at desc);

-- 4. Per-merchant Row Level Security (RLS) and immutability guards
alter table public.customers enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

drop policy if exists "customers_member_all" on public.customers;
create policy "customers_member_all" on public.customers
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "campaigns_member_all" on public.campaigns;
create policy "campaigns_member_all" on public.campaigns
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "campaign_recipients_member_all" on public.campaign_recipients;
create policy "campaign_recipients_member_all" on public.campaign_recipients
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop trigger if exists guard_customers_business on public.customers;
create trigger guard_customers_business before update on public.customers
  for each row execute function public.prevent_business_change();

drop trigger if exists guard_campaigns_business on public.campaigns;
create trigger guard_campaigns_business before update on public.campaigns
  for each row execute function public.prevent_business_change();

drop trigger if exists guard_campaign_recipients_business on public.campaign_recipients;
create trigger guard_campaign_recipients_business before update on public.campaign_recipients
  for each row execute function public.prevent_business_change();

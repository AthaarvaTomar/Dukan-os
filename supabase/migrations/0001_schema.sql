-- DukaanOS Phase 1: multi-tenant schema
-- Run in the Supabase SQL editor as migration 1 of 3.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy core
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  currency text not null default 'INR',
  allow_negative_stock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  joined_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);

-- ---------------------------------------------------------------------------
-- Business data (every row scoped by business_id)
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  sku text not null,
  unit text not null default 'piece',
  category text not null check (category in
    ('Groceries', 'Beverages', 'Household', 'Personal care', 'Snacks', 'Stationery')),
  price numeric(12, 2) not null check (price >= 0),
  cost_price numeric(12, 2) not null check (cost_price >= 0),
  stock integer not null default 0,
  reorder_level integer not null default 0 check (reorder_level >= 0),
  supplier_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  date timestamptz not null default now(),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  payment_method text not null check (payment_method in ('cash', 'upi', 'card')),
  -- 'cancelled' rows keep history; stock is restored by cancel_sale()
  status text not null default 'processing' check (status in ('processing', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_business_date_idx on public.sales (business_id, date desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0)
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_business_idx on public.sale_items (business_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 300),
  category text not null check (category in
    ('Rent', 'Utilities', 'Supplies', 'Transport', 'Marketing', 'Maintenance')),
  amount numeric(12, 2) not null check (amount >= 0),
  date date not null default current_date,
  vendor text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  product_name text not null,
  operation text not null check (operation in ('stock-in', 'stock-out', 'adjustment')),
  quantity_changed integer not null,
  previous_stock integer not null,
  new_stock integer not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index stock_movements_business_created_idx on public.stock_movements (business_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements (product_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  channel text not null check (channel in ('WhatsApp', 'Instagram', 'In-store', 'SMS')),
  status text not null default 'draft' check (status in
    ('draft', 'scheduled', 'active', 'completed', 'simulated')),
  start_date date not null,
  end_date date not null,
  budget numeric(12, 2) not null default 0 check (budget >= 0),
  audience_size integer not null default 0 check (audience_size >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  conversions integer not null default 0 check (conversions >= 0),
  revenue numeric(12, 2) not null default 0 check (revenue >= 0),
  summary_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null default '',
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  unique (campaign_id, customer_id)
);

create index campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);

create table public.message_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  channel text not null check (channel in ('WhatsApp', 'Instagram', 'In-store', 'SMS')),
  body text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index message_logs_business_created_idx on public.message_logs (business_id, created_at desc);

-- Supplier orders keep the existing draft/approve workflow; items stored as
-- JSON because a draft's line items are edited as a unit.
create table public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  items jsonb not null default '[]'::jsonb
);

create index supplier_orders_business_idx on public.supplier_orders (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger touch_businesses before update on public.businesses
  for each row execute function public.touch_updated_at();
create trigger touch_customers before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger touch_products before update on public.products
  for each row execute function public.touch_updated_at();
create trigger touch_sales before update on public.sales
  for each row execute function public.touch_updated_at();
create trigger touch_expenses before update on public.expenses
  for each row execute function public.touch_updated_at();
create trigger touch_campaigns before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Stock rule: reject negative stock unless the business allows it.
-- Applies to every write path, not just the RPCs.
-- ---------------------------------------------------------------------------

create function public.enforce_stock_rule() returns trigger
language plpgsql as $$
declare
  allows_negative boolean;
begin
  if new.stock >= 0 then
    return new;
  end if;
  select allow_negative_stock into allows_negative
    from public.businesses where id = new.business_id;
  if coalesce(allows_negative, false) then
    return new;
  end if;
  raise exception 'Stock cannot go negative for business % (product %)', new.business_id, new.id;
end;
$$;

create trigger enforce_product_stock before insert or update on public.products
  for each row execute function public.enforce_stock_rule();

-- DukaanOS Phase 1: Row Level Security
-- Run in the Supabase SQL editor as migration 2 of 3.
-- A merchant can only ever touch rows belonging to businesses they are a member of.

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer avoids RLS recursion)
-- ---------------------------------------------------------------------------

create function public.is_business_member(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid() and bm.business_id = p_business_id
  );
$$;

create function public.is_business_owner(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.business_id = p_business_id
      and bm.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS enablement + policies
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.message_logs enable row level security;
alter table public.supplier_orders enable row level security;

-- profiles: a user sees and edits only their own profile
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- businesses: members read; only the owner creates/updates
create policy "businesses_select_member" on public.businesses
  for select using (public.is_business_member(id));
create policy "businesses_insert_owner" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "businesses_update_owner" on public.businesses
  for update using (public.is_business_owner(id))
  with check (public.is_business_owner(id) and owner_id = auth.uid());

-- business_members: see your own memberships; owners manage members
create policy "members_select_self_or_owner" on public.business_members
  for select using (user_id = auth.uid() or public.is_business_owner(business_id));
create policy "members_insert_owner" on public.business_members
  for insert with check (public.is_business_owner(business_id));
create policy "members_update_owner" on public.business_members
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy "members_delete_owner" on public.business_members
  for delete using (public.is_business_owner(business_id) and role <> 'owner');

-- Generic pattern for all business-data tables
create policy "customers_member_all" on public.customers
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "products_member_all" on public.products
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "sales_member_all" on public.sales
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "sale_items_member_all" on public.sale_items
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "expenses_member_all" on public.expenses
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "stock_movements_member_all" on public.stock_movements
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "campaigns_member_all" on public.campaigns
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "campaign_recipients_member_all" on public.campaign_recipients
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "message_logs_member_all" on public.message_logs
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "supplier_orders_member_all" on public.supplier_orders
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Guard: business_id is immutable on business-data rows, so a member can never
-- move a record into another business they happen to join later.
-- ---------------------------------------------------------------------------

create function public.prevent_business_change() returns trigger
language plpgsql as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed on %', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger guard_customers_business before update on public.customers
  for each row execute function public.prevent_business_change();
create trigger guard_products_business before update on public.products
  for each row execute function public.prevent_business_change();
create trigger guard_sales_business before update on public.sales
  for each row execute function public.prevent_business_change();
create trigger guard_sale_items_business before update on public.sale_items
  for each row execute function public.prevent_business_change();
create trigger guard_expenses_business before update on public.expenses
  for each row execute function public.prevent_business_change();
create trigger guard_stock_movements_business before update on public.stock_movements
  for each row execute function public.prevent_business_change();
create trigger guard_campaigns_business before update on public.campaigns
  for each row execute function public.prevent_business_change();
create trigger guard_campaign_recipients_business before update on public.campaign_recipients
  for each row execute function public.prevent_business_change();
create trigger guard_message_logs_business before update on public.message_logs
  for each row execute function public.prevent_business_change();
create trigger guard_supplier_orders_business before update on public.supplier_orders
  for each row execute function public.prevent_business_change();

-- ---------------------------------------------------------------------------
-- Profile row is created automatically for every new auth user
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

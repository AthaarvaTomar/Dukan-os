-- Migration 0005: Billing fixes (customer totals sync, stock movement logging, item validation)
-- Safe to run multiple times (idempotent).

-- 1. Store denormalized customer spend/order aggregates kept in sync with non-cancelled sales
alter table public.customers
  add column if not exists total_spent numeric(12, 2) not null default 0,
  add column if not exists order_count integer not null default 0,
  add column if not exists last_purchase_date timestamptz;

create or replace function public.refresh_customer_metrics(p_customer_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_customer_id is null then
    return;
  end if;

  update public.customers c
  set
    total_spent = coalesce(stats.total_spent, 0),
    order_count = coalesce(stats.order_count, 0),
    last_purchase_date = stats.last_purchase_date,
    updated_at = now()
  from (
    select
      coalesce(sum(s.total_amount), 0) as total_spent,
      count(*)::integer as order_count,
      max(s.date) as last_purchase_date
    from public.sales s
    where s.customer_id = p_customer_id
      and s.status <> 'cancelled'
  ) stats
  where c.id = p_customer_id;
end;
$$;

-- Backfill existing customers cleanly
update public.customers c
set
  total_spent = coalesce(stats.total_spent, 0),
  order_count = coalesce(stats.order_count, 0),
  last_purchase_date = stats.last_purchase_date
from (
  select
    customer_id,
    coalesce(sum(total_amount), 0) as total_spent,
    count(*)::integer as order_count,
    max(date) as last_purchase_date
  from public.sales
  where customer_id is not null
    and status <> 'cancelled'
  group by customer_id
) stats
where c.id = stats.customer_id;

-- 2. Harden create_sale: validate items & customer ownership, log stock-out movement, update customer metrics
create or replace function public.create_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_date timestamptz,
  p_discount numeric,
  p_payment_method text,
  p_status text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_product public.products;
  v_qty numeric(12, 3);
  v_deduct integer;
  v_new_stock integer;
  v_subtotal numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_allows_negative boolean;
  v_sale_date timestamptz := coalesce(p_date, now());
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'Not a member of this business';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'Customer does not belong to this business';
  end if;
  if p_payment_method not in ('cash', 'upi', 'card') then
    raise exception 'Invalid payment method';
  end if;
  if p_status not in ('processing', 'completed') then
    raise exception 'Invalid sale status';
  end if;
  if p_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item';
  end if;

  select allow_negative_stock into v_allows_negative
    from public.businesses where id = p_business_id;

  insert into public.sales (business_id, customer_id, date, discount, payment_method, status)
  values (p_business_id, p_customer_id, v_sale_date, p_discount, p_payment_method, p_status)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item ->> 'productId' is null then
      raise exception 'Sale item is missing productId';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Sale quantity must be positive';
    end if;
    v_deduct := ceil(v_qty)::int;

    select * into v_product from public.products
      where id = (v_item ->> 'productId')::uuid and business_id = p_business_id
      for update;
    if not found then
      raise exception 'Product % does not belong to this business', v_item ->> 'productName';
    end if;

    if v_product.stock < v_deduct and not coalesce(v_allows_negative, false) then
      raise exception 'Not enough stock for % (available: %)', v_product.name, v_product.stock;
    end if;

    insert into public.sale_items
      (sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost)
    values
      (v_sale_id, p_business_id, v_product.id,
       coalesce(v_item ->> 'productName', v_product.name),
       v_qty,
       coalesce((v_item ->> 'unitPrice')::numeric, v_product.price),
       coalesce((v_item ->> 'unitCost')::numeric, v_product.cost_price));

    v_new_stock := v_product.stock - v_deduct;

    update public.products
      set stock = v_new_stock, updated_at = now()
      where id = v_product.id;

    insert into public.stock_movements
      (business_id, product_id, product_name, operation, quantity_changed, previous_stock, new_stock, reason)
    values
      (p_business_id, v_product.id, v_product.name, 'stock-out',
       -v_deduct, v_product.stock, v_new_stock, 'Sale #' || left(v_sale_id::text, 8));

    v_subtotal := v_subtotal
      + coalesce((v_item ->> 'unitPrice')::numeric, v_product.price) * v_qty;
  end loop;

  v_total := v_subtotal - p_discount;
  if v_total < 0 then
    raise exception 'Discount cannot exceed the sale subtotal';
  end if;

  update public.sales
    set subtotal = v_subtotal, total_amount = v_total
    where id = v_sale_id;

  perform public.refresh_customer_metrics(p_customer_id);

  return v_sale_id;
end;
$$;

-- 3. Keep cancel_sale in sync with customer metrics as well
create or replace function public.cancel_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_item public.sale_items;
  v_new_stock integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found';
  end if;
  if not public.is_business_member(v_sale.business_id) then
    raise exception 'Not a member of this business';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Sale is already cancelled';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    if v_item.product_id is not null then
      select stock into v_new_stock from public.products
        where id = v_item.product_id for update;

      update public.products
        set stock = stock + ceil(v_item.quantity)::int, updated_at = now()
        where id = v_item.product_id;

      insert into public.stock_movements
        (business_id, product_id, product_name, operation, quantity_changed, previous_stock, new_stock, reason)
      values
        (v_sale.business_id, v_item.product_id, v_item.product_name, 'stock-in',
         ceil(v_item.quantity)::int, v_new_stock, v_new_stock + ceil(v_item.quantity)::int,
         'Sale cancelled');
    end if;
  end loop;

  update public.sales
    set status = 'cancelled', updated_at = now()
    where id = p_sale_id;

  perform public.refresh_customer_metrics(v_sale.customer_id);
end;
$$;


-- DukaanOS Phase 1: transactional business operations
-- Run in the Supabase SQL editor as migration 3 of 3.
-- All functions run with the caller's auth.uid() and check membership, so RLS
-- and business logic cannot be bypassed from the client.

-- ---------------------------------------------------------------------------
-- Called once at signup: creates the merchant's shop and owner membership
-- ---------------------------------------------------------------------------

create or replace function public.create_business_for_owner(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if length(btrim(p_name)) < 1 or length(btrim(p_name)) > 120 then
    raise exception 'Shop name must be between 1 and 120 characters';
  end if;

  -- Safety net: users created before the profile trigger existed (or via
  -- admin invites) still get a profile row here.
  insert into public.profiles (id, full_name)
  values (auth.uid(), coalesce(
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()), ''))
  on conflict (id) do nothing;

  insert into public.businesses (owner_id, name)
  values (auth.uid(), btrim(p_name))
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, auth.uid(), 'owner');

  return v_business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock adjustment: updates the product and writes an immutable movement row
-- ---------------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_operation text,
  p_quantity integer,
  p_reason text default ''
) returns public.stock_movements
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_business_id uuid;
  v_new_stock integer;
  v_movement public.stock_movements;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_operation not in ('stock-in', 'stock-out', 'adjustment') then
    raise exception 'Invalid stock operation';
  end if;
  if p_operation in ('stock-in', 'stock-out') and p_quantity <= 0 then
    raise exception 'Quantity must be positive for stock-in/stock-out';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;

  -- RLS-equivalent membership check (definer bypasses RLS, so verify explicitly)
  if not public.is_business_member(v_product.business_id) then
    raise exception 'Not a member of this business';
  end if;
  v_business_id := v_product.business_id;

  v_new_stock := case p_operation
    when 'stock-in' then v_product.stock + p_quantity
    when 'stock-out' then v_product.stock - p_quantity
    else p_quantity
  end;

  insert into public.products (id, business_id, name, sku, unit, category, price, cost_price,
    stock, reorder_level, supplier_name, created_at, updated_at)
  values (v_product.id, v_product.business_id, v_product.name, v_product.sku, v_product.unit,
    v_product.category, v_product.price, v_product.cost_price, v_new_stock,
    v_product.reorder_level, v_product.supplier_name, v_product.created_at, now())
  on conflict (id) do update
    set stock = excluded.stock, updated_at = now();

  insert into public.stock_movements
    (business_id, product_id, product_name, operation, quantity_changed, previous_stock, new_stock, reason)
  values
    (v_business_id, v_product.id, v_product.name, p_operation,
     case p_operation when 'stock-in' then p_quantity
                      when 'stock-out' then -p_quantity
                      else v_new_stock - v_product.stock end,
     v_product.stock, v_new_stock, p_reason)
  returning * into v_movement;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale creation: inserts the sale + items and deducts stock atomically
-- ---------------------------------------------------------------------------

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
  v_subtotal numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_allows_negative boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'Not a member of this business';
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
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item';
  end if;

  select allow_negative_stock into v_allows_negative
    from public.businesses where id = p_business_id;

  insert into public.sales (business_id, customer_id, date, discount, payment_method, status)
  values (p_business_id, p_customer_id, coalesce(p_date, now()), p_discount, p_payment_method, p_status)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item ->> 'productId' is null then
      raise exception 'Sale item is missing productId';
    end if;

    select * into v_product from public.products
      where id = (v_item ->> 'productId')::uuid and business_id = p_business_id
      for update;
    if not found then
      raise exception 'Product % does not belong to this business', v_item ->> 'productName';
    end if;

    -- Stock reservation happens on creation (processing or completed);
    -- cancel_sale() restores it.
    if v_product.stock < ceil((v_item ->> 'quantity')::numeric) and not coalesce(v_allows_negative, false) then
      raise exception 'Not enough stock for % (available: %)', v_product.name, v_product.stock;
    end if;

    insert into public.sale_items
      (sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost)
    values
      (v_sale_id, p_business_id, v_product.id,
       coalesce(v_item ->> 'productName', v_product.name),
       (v_item ->> 'quantity')::numeric,
       coalesce((v_item ->> 'unitPrice')::numeric, v_product.price),
       coalesce((v_item ->> 'unitCost')::numeric, v_product.cost_price));

    update public.products
      set stock = stock - ceil((v_item ->> 'quantity')::numeric)::int, updated_at = now()
      where id = v_product.id;

    v_subtotal := v_subtotal
      + coalesce((v_item ->> 'unitPrice')::numeric, v_product.price)
        * (v_item ->> 'quantity')::numeric;
  end loop;

  v_total := v_subtotal - p_discount;
  if v_total < 0 then
    raise exception 'Discount cannot exceed the sale subtotal';
  end if;

  update public.sales
    set subtotal = v_subtotal, total_amount = v_total
    where id = v_sale_id;

  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale cancellation: restores stock for every item and marks the sale cancelled
-- ---------------------------------------------------------------------------

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
end;
$$;

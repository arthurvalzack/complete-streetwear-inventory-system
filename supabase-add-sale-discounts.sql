alter table public.movements
  add column if not exists discount_type text default 'none',
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists subtotal_amount numeric not null default 0,
  add column if not exists final_amount numeric not null default 0,
  add column if not exists sale_subtotal numeric not null default 0,
  add column if not exists sale_discount_total numeric not null default 0,
  add column if not exists sale_final_total numeric not null default 0;

update public.movements
set
  discount_type = coalesce(discount_type, 'none'),
  discount_amount = coalesce(discount_amount, 0),
  discount_percent = coalesce(discount_percent, 0),
  subtotal_amount = coalesce(nullif(subtotal_amount, 0), total_value, total_amount, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  final_amount = coalesce(nullif(final_amount, 0), total_amount, total_value, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  sale_subtotal = coalesce(nullif(sale_subtotal, 0), nullif(subtotal_amount, 0), total_value, total_amount, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  sale_discount_total = coalesce(sale_discount_total, discount_amount, 0),
  sale_final_total = coalesce(nullif(sale_final_total, 0), nullif(final_amount, 0), total_amount, total_value, coalesce(unit_price, 0) * coalesce(quantity, 0), 0)
where
  discount_type is null
  or discount_amount is null
  or discount_percent is null
  or subtotal_amount is null
  or subtotal_amount = 0
  or final_amount is null
  or final_amount = 0
  or sale_subtotal is null
  or sale_subtotal = 0
  or sale_discount_total is null
  or sale_final_total is null
  or sale_final_total = 0;

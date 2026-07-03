-- Supabase setup/migration for the inventory app.
-- Safe to run more than once. Does not drop existing data.

create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_state add column if not exists data jsonb not null default '{}'::jsonb;
alter table app_state add column if not exists updated_at timestamptz not null default now();

create table if not exists brands (
  id text primary key,
  name text not null,
  slug text,
  logo text,
  updated_at timestamptz not null default now()
);

alter table brands add column if not exists name text;
alter table brands add column if not exists slug text;
alter table brands add column if not exists logo text;
alter table brands add column if not exists updated_at timestamptz not null default now();
create unique index if not exists brands_id_uidx on brands (id);

create table if not exists categories (
  id text primary key,
  name text not null,
  slug text,
  subcategories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table categories add column if not exists name text;
alter table categories add column if not exists slug text;
alter table categories add column if not exists subcategories jsonb not null default '[]'::jsonb;
alter table categories add column if not exists updated_at timestamptz not null default now();
create unique index if not exists categories_id_uidx on categories (id);

create table if not exists products (
  id text primary key,
  name text not null,
  sku text,
  brand_id text,
  brand_name text,
  category_id text,
  category_name text,
  subcategory_id text,
  subcategory_name text,
  description text,
  image text,
  images jsonb not null default '[]'::jsonb,
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  status text not null default 'active',
  variants jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  min_stock integer not null default 0,
  total_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products add column if not exists name text;
alter table products add column if not exists sku text;
alter table products add column if not exists brand_id text;
alter table products add column if not exists brand_name text;
alter table products add column if not exists category_id text;
alter table products add column if not exists category_name text;
alter table products add column if not exists subcategory_id text;
alter table products add column if not exists subcategory_name text;
alter table products add column if not exists description text;
alter table products add column if not exists image text;
alter table products add column if not exists images jsonb not null default '[]'::jsonb;
alter table products add column if not exists cost_price numeric not null default 0;
alter table products add column if not exists sale_price numeric not null default 0;
alter table products add column if not exists status text not null default 'active';
alter table products add column if not exists variants jsonb not null default '[]'::jsonb;
alter table products add column if not exists tags jsonb not null default '[]'::jsonb;
alter table products add column if not exists min_stock integer not null default 0;
alter table products add column if not exists total_quantity integer not null default 0;
alter table products add column if not exists created_at timestamptz not null default now();
alter table products add column if not exists updated_at timestamptz not null default now();
create unique index if not exists products_id_uidx on products (id);
create index if not exists products_brand_id_idx on products (brand_id);
create index if not exists products_category_id_idx on products (category_id);
create index if not exists products_status_idx on products (status);

create table if not exists movements (
  id text primary key,
  type text not null,
  product_id text,
  product_name text,
  customer_name text,
  brand_name text,
  category_name text,
  subcategory_name text,
  variant_id text,
  variant_name text,
  size text,
  color text,
  variant_label text,
  payment_status text default 'paid',
  payment_method text,
  paid_at timestamptz,
  sale_group_id text,
  quantity integer not null default 0,
  unit_price numeric not null default 0,
  unit_cost numeric not null default 0,
  cost_price numeric not null default 0,
  discount_type text default 'none',
  discount_amount numeric not null default 0,
  discount_percent numeric not null default 0,
  subtotal_amount numeric not null default 0,
  final_amount numeric not null default 0,
  sale_subtotal numeric not null default 0,
  sale_discount_total numeric not null default 0,
  sale_final_total numeric not null default 0,
  total_amount numeric not null default 0,
  total_cost numeric not null default 0,
  total_profit numeric not null default 0,
  total_value numeric not null default 0,
  profit numeric not null default 0,
  product_snapshot jsonb,
  reason text,
  notes text,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  date timestamptz not null default now()
);

alter table movements add column if not exists type text;
alter table movements add column if not exists product_id text;
alter table movements add column if not exists product_name text;
alter table movements add column if not exists customer_name text;
alter table movements add column if not exists brand_name text;
alter table movements add column if not exists category_name text;
alter table movements add column if not exists subcategory_name text;
alter table movements add column if not exists variant_id text;
alter table movements add column if not exists variant_name text;
alter table movements add column if not exists size text;
alter table movements add column if not exists color text;
alter table movements add column if not exists variant_label text;
alter table movements add column if not exists payment_status text default 'paid';
alter table movements add column if not exists payment_method text;
alter table movements add column if not exists paid_at timestamptz;
alter table movements add column if not exists sale_group_id text;
alter table movements add column if not exists quantity integer not null default 0;
alter table movements add column if not exists unit_price numeric not null default 0;
alter table movements add column if not exists unit_cost numeric not null default 0;
alter table movements add column if not exists cost_price numeric not null default 0;
alter table movements add column if not exists discount_type text default 'none';
alter table movements add column if not exists discount_amount numeric not null default 0;
alter table movements add column if not exists discount_percent numeric not null default 0;
alter table movements add column if not exists subtotal_amount numeric not null default 0;
alter table movements add column if not exists final_amount numeric not null default 0;
alter table movements add column if not exists sale_subtotal numeric not null default 0;
alter table movements add column if not exists sale_discount_total numeric not null default 0;
alter table movements add column if not exists sale_final_total numeric not null default 0;
alter table movements add column if not exists total_amount numeric not null default 0;
alter table movements add column if not exists total_cost numeric not null default 0;
alter table movements add column if not exists total_profit numeric not null default 0;
alter table movements add column if not exists total_value numeric not null default 0;
alter table movements add column if not exists profit numeric not null default 0;
alter table movements add column if not exists product_snapshot jsonb;
alter table movements add column if not exists reason text;
alter table movements add column if not exists notes text;
alter table movements add column if not exists user_id text;
alter table movements add column if not exists created_at timestamptz not null default now();
alter table movements add column if not exists updated_at timestamptz not null default now();
alter table movements add column if not exists date timestamptz not null default now();
create unique index if not exists movements_id_uidx on movements (id);
create index if not exists movements_product_id_idx on movements (product_id);
create index if not exists movements_created_at_idx on movements (created_at desc);
create index if not exists movements_payment_status_idx on movements (payment_status);
create index if not exists movements_sale_group_id_idx on movements (sale_group_id);

update movements
set
  quantity = coalesce(quantity, 0),
  unit_price = coalesce(unit_price, 0),
  unit_cost = coalesce(unit_cost, cost_price, 0),
  discount_type = coalesce(discount_type, 'none'),
  discount_amount = coalesce(discount_amount, 0),
  discount_percent = coalesce(discount_percent, 0),
  subtotal_amount = coalesce(nullif(subtotal_amount, 0), total_value, total_amount, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  final_amount = coalesce(nullif(final_amount, 0), total_amount, total_value, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  sale_subtotal = coalesce(nullif(sale_subtotal, 0), nullif(subtotal_amount, 0), total_value, total_amount, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  sale_discount_total = coalesce(sale_discount_total, discount_amount, 0),
  sale_final_total = coalesce(nullif(sale_final_total, 0), nullif(final_amount, 0), total_amount, total_value, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  total_amount = coalesce(total_amount, total_value, coalesce(unit_price, 0) * coalesce(quantity, 0), 0),
  total_cost = coalesce(total_cost, coalesce(unit_cost, cost_price, 0) * coalesce(quantity, 0), 0),
  total_profit = coalesce(total_profit, profit, coalesce(total_amount, total_value, 0) - coalesce(total_cost, 0), 0),
  cost_price = coalesce(cost_price, unit_cost, 0),
  payment_status = coalesce(payment_status, 'paid'),
  updated_at = coalesce(updated_at, now())
where
  quantity is null
  or unit_price is null
  or unit_cost is null
  or discount_type is null
  or discount_amount is null
  or discount_percent is null
  or subtotal_amount is null
  or final_amount is null
  or sale_subtotal is null
  or sale_discount_total is null
  or sale_final_total is null
  or total_amount is null
  or total_cost is null
  or total_profit is null
  or cost_price is null
  or payment_status is null
  or updated_at is null;

update movements
set product_name = products.name
from products
where movements.product_id = products.id
  and (movements.product_name is null or movements.product_name = '');

create table if not exists alerts (
  id text primary key,
  type text not null,
  message text not null,
  product_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table alerts add column if not exists type text;
alter table alerts add column if not exists message text;
alter table alerts add column if not exists product_id text;
alter table alerts add column if not exists read boolean not null default false;
alter table alerts add column if not exists created_at timestamptz not null default now();
create unique index if not exists alerts_id_uidx on alerts (id);
create index if not exists alerts_product_id_idx on alerts (product_id);

create table if not exists store_config (
  id text primary key default 'default',
  store_name text not null default 'FRAZON STORE',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_config add column if not exists store_name text not null default 'FRAZON STORE';
alter table store_config add column if not exists logo_url text;
alter table store_config add column if not exists created_at timestamptz not null default now();
alter table store_config add column if not exists updated_at timestamptz not null default now();
create unique index if not exists store_config_id_uidx on store_config (id);

create table if not exists catalog_config (
  id text primary key default 'default',
  items jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table catalog_config add column if not exists items jsonb not null default '[]'::jsonb;
alter table catalog_config add column if not exists config jsonb not null default '{}'::jsonb;
alter table catalog_config add column if not exists updated_at timestamptz not null default now();
create unique index if not exists catalog_config_id_uidx on catalog_config (id);

create table if not exists cash_outflow_categories (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cash_outflow_categories add column if not exists name text;
alter table cash_outflow_categories add column if not exists is_active boolean not null default true;
alter table cash_outflow_categories add column if not exists sort_order integer not null default 0;
alter table cash_outflow_categories add column if not exists created_at timestamptz not null default now();
alter table cash_outflow_categories add column if not exists updated_at timestamptz not null default now();
create unique index if not exists cash_outflow_categories_id_uidx on cash_outflow_categories (id);
create index if not exists cash_outflow_categories_active_idx on cash_outflow_categories (is_active);

create table if not exists cash_outflows (
  id text primary key,
  description text not null,
  amount numeric not null default 0,
  category_id text,
  category_name text not null,
  payment_method text,
  outflow_date timestamptz not null default now(),
  notes text,
  receipt_url text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_size integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cash_outflows add column if not exists description text;
alter table cash_outflows add column if not exists amount numeric not null default 0;
alter table cash_outflows add column if not exists category_id text;
alter table cash_outflows add column if not exists category_name text;
alter table cash_outflows add column if not exists payment_method text;
alter table cash_outflows add column if not exists outflow_date timestamptz not null default now();
alter table cash_outflows add column if not exists notes text;
alter table cash_outflows add column if not exists receipt_url text;
alter table cash_outflows add column if not exists receipt_file_name text;
alter table cash_outflows add column if not exists receipt_mime_type text;
alter table cash_outflows add column if not exists receipt_size integer;
alter table cash_outflows add column if not exists created_at timestamptz not null default now();
alter table cash_outflows add column if not exists updated_at timestamptz not null default now();
create unique index if not exists cash_outflows_id_uidx on cash_outflows (id);
create index if not exists cash_outflows_outflow_date_idx on cash_outflows (outflow_date desc);
create index if not exists cash_outflows_category_id_idx on cash_outflows (category_id);

insert into cash_outflow_categories (id, name, is_active, sort_order)
values
  ('outcat_001', 'Compra de mercadoria', true, 0),
  ('outcat_002', 'Sacolas', true, 1),
  ('outcat_003', 'Tags', true, 2),
  ('outcat_004', 'Frete', true, 3),
  ('outcat_005', 'Marketing', true, 4),
  ('outcat_006', 'Aluguel', true, 5),
  ('outcat_007', 'Funcionário', true, 6),
  ('outcat_008', 'Outros', true, 7)
on conflict (id) do update set
  name = excluded.name,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'allow_select_expense_receipts') then
    create policy "allow_select_expense_receipts" on storage.objects for select to anon, authenticated using (bucket_id = 'expense-receipts');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'allow_insert_expense_receipts') then
    create policy "allow_insert_expense_receipts" on storage.objects for insert to anon, authenticated with check (bucket_id = 'expense-receipts');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'allow_update_expense_receipts') then
    create policy "allow_update_expense_receipts" on storage.objects for update to anon, authenticated using (bucket_id = 'expense-receipts') with check (bucket_id = 'expense-receipts');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'allow_delete_expense_receipts') then
    create policy "allow_delete_expense_receipts" on storage.objects for delete to anon, authenticated using (bucket_id = 'expense-receipts');
  end if;
end $$;

insert into app_state (id, data)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

insert into store_config (id, store_name)
values ('default', 'FRAZON STORE')
on conflict (id) do nothing;

insert into catalog_config (id, items, config)
values ('default', '[]'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- Adds financial cash outflows without touching product stock.
-- Safe to run more than once. Does not drop, truncate, or delete data.

create table if not exists public.cash_outflow_categories (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cash_outflow_categories add column if not exists name text;
alter table public.cash_outflow_categories add column if not exists is_active boolean not null default true;
alter table public.cash_outflow_categories add column if not exists sort_order integer not null default 0;
alter table public.cash_outflow_categories add column if not exists created_at timestamptz not null default now();
alter table public.cash_outflow_categories add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cash_outflows (
  id text primary key,
  description text not null,
  amount numeric not null default 0,
  category_id text,
  category_name text not null,
  payment_method text,
  outflow_date timestamptz not null,
  notes text,
  receipt_url text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_size integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cash_outflows add column if not exists description text;
alter table public.cash_outflows add column if not exists amount numeric not null default 0;
alter table public.cash_outflows add column if not exists category_id text;
alter table public.cash_outflows add column if not exists category_name text;
alter table public.cash_outflows add column if not exists payment_method text;
alter table public.cash_outflows add column if not exists outflow_date timestamptz not null default now();
alter table public.cash_outflows add column if not exists notes text;
alter table public.cash_outflows add column if not exists receipt_url text;
alter table public.cash_outflows add column if not exists receipt_file_name text;
alter table public.cash_outflows add column if not exists receipt_mime_type text;
alter table public.cash_outflows add column if not exists receipt_size integer;
alter table public.cash_outflows add column if not exists created_at timestamptz not null default now();
alter table public.cash_outflows add column if not exists updated_at timestamptz not null default now();

create unique index if not exists cash_outflow_categories_id_uidx on public.cash_outflow_categories (id);
create index if not exists cash_outflow_categories_active_idx on public.cash_outflow_categories (is_active);
create unique index if not exists cash_outflows_id_uidx on public.cash_outflows (id);
create index if not exists cash_outflows_outflow_date_idx on public.cash_outflows (outflow_date desc);
create index if not exists cash_outflows_category_id_idx on public.cash_outflows (category_id);

insert into public.cash_outflow_categories (id, name, is_active, sort_order)
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

alter table public.cash_outflows enable row level security;
alter table public.cash_outflow_categories enable row level security;

do $$
declare
  v_table_name text;
  policy_action text;
begin
  foreach v_table_name in array array['cash_outflows', 'cash_outflow_categories']
  loop
    foreach policy_action in array array['select', 'insert', 'update', 'delete']
    loop
      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = v_table_name
          and policyname = format('allow_%s_%s', policy_action, v_table_name)
      ) then
        if policy_action = 'select' then
          execute format('create policy %I on public.%I for select to anon, authenticated using (true)', format('allow_%s_%s', policy_action, v_table_name), v_table_name);
        elsif policy_action = 'insert' then
          execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', format('allow_%s_%s', policy_action, v_table_name), v_table_name);
        elsif policy_action = 'update' then
          execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', format('allow_%s_%s', policy_action, v_table_name), v_table_name);
        elsif policy_action = 'delete' then
          execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', format('allow_%s_%s', policy_action, v_table_name), v_table_name);
        end if;
      end if;
    end loop;
  end loop;
end $$;

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

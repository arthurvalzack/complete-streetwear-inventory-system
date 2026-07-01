-- Safe migration for pending sales and variant snapshots.
-- Run once in Supabase SQL editor. Safe to run more than once.

alter table public.movements
add column if not exists size text;

alter table public.movements
add column if not exists color text;

alter table public.movements
add column if not exists variant_label text;

alter table public.movements
add column if not exists payment_status text default 'paid';

alter table public.movements
add column if not exists payment_method text;

alter table public.movements
add column if not exists paid_at timestamptz;

alter table public.movements
add column if not exists sale_group_id text;

update public.movements
set payment_status = 'paid'
where payment_status is null;

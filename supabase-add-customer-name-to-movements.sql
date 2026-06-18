-- Safe migration: adds customer name support to existing movement rows.
-- Can be run more than once and does not remove or rewrite existing data.

alter table public.movements
add column if not exists customer_name text;

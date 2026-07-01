-- Optional catalog migration.
-- Safe to run more than once in the public catalog Supabase project.

alter table public.products
add column if not exists total_quantity integer default 0;

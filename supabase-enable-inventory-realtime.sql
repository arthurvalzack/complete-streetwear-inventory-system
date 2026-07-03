-- Enable Supabase Realtime for inventory products.
-- Safe to run more than once. Does not drop, truncate, or delete data.

alter table public.products replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication p
      join pg_publication_rel pr on pr.prpubid = p.oid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;
  else
    raise notice 'Publication supabase_realtime was not found. Enable Realtime in Supabase, then rerun this script.';
  end if;
end $$;

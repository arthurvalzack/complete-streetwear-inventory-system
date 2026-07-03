-- RLS policies for the inventory app.
-- The app uses local authentication, so anon/authenticated must be able to read/write.

do $$
declare
  v_table_name text;
  policy_action text;
begin
  foreach v_table_name in array array[
    'app_state',
    'brands',
    'categories',
    'products',
    'movements',
    'cash_outflows',
    'cash_outflow_categories',
    'alerts',
    'store_config',
    'catalog_config'
  ]
  loop
    execute format('alter table %I enable row level security', v_table_name);

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
          execute format(
            'create policy %I on %I for select to anon, authenticated using (true)',
            format('allow_%s_%s', policy_action, v_table_name),
            v_table_name
          );
        elsif policy_action = 'insert' then
          execute format(
            'create policy %I on %I for insert to anon, authenticated with check (true)',
            format('allow_%s_%s', policy_action, v_table_name),
            v_table_name
          );
        elsif policy_action = 'update' then
          execute format(
            'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
            format('allow_%s_%s', policy_action, v_table_name),
            v_table_name
          );
        elsif policy_action = 'delete' then
          execute format(
            'create policy %I on %I for delete to anon, authenticated using (true)',
            format('allow_%s_%s', policy_action, v_table_name),
            v_table_name
          );
        end if;
      end if;
    end loop;
  end loop;
end $$;

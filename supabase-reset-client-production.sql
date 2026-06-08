-- RODAR UMA UNICA VEZ ANTES DE ENTREGAR AO CLIENTE.
-- ISSO APAGA PRODUTOS, MOVIMENTACOES E ALERTAS EXISTENTES.
-- NAO APAGA A ESTRUTURA DO BANCO.
-- Nao usa DROP TABLE e nao usa TRUNCATE.

do $$
begin
  if to_regclass('public.movements') is not null then
    delete from public.movements;
  end if;
end $$;

do $$
begin
  if to_regclass('public.alerts') is not null then
    delete from public.alerts;
  end if;
end $$;

do $$
begin
  if to_regclass('public.catalog_config') is not null then
    delete from public.catalog_config;
  end if;
end $$;

do $$
begin
  if to_regclass('public.store_config') is not null then
    delete from public.store_config;
  end if;
end $$;

do $$
begin
  if to_regclass('public.products') is not null then
    delete from public.products;
  end if;
end $$;

do $$
begin
  if to_regclass('public.app_state') is not null then
    delete from public.app_state;
  end if;
end $$;

do $$
begin
  if to_regclass('public.store_config') is not null then
    insert into public.store_config (id, store_name)
    values ('default', 'FRAZON STORE')
    on conflict (id) do update
    set
      store_name = excluded.store_name,
      logo_url = null,
      updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regclass('public.catalog_config') is not null then
    insert into public.catalog_config (id, items, config)
    values ('default', '[]'::jsonb, '{}'::jsonb)
    on conflict (id) do update
    set
      items = '[]'::jsonb,
      config = '{}'::jsonb,
      updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regclass('public.app_state') is not null then
    insert into public.app_state (id, data)
    values ('global', '{}'::jsonb)
    on conflict (id) do update
    set
      data = '{}'::jsonb,
      updated_at = now();
  end if;
end $$;

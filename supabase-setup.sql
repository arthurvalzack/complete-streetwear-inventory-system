-- Cria a tabela para armazenar o estado da aplicação (JSON)
create table if not exists app_state (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- Insere uma linha inicial (opcional)
insert into app_state (id, data) values ('global', '{}'::jsonb)
on conflict (id) do nothing;

-- Exemplo de upsert (use no client ou SQL editor para testar)
-- update/insert do estado completo
-- replace :payload com um JSON válido
--
-- insert into app_state (id, data) values ('global', :payload::jsonb)
-- on conflict (id) do update set data = excluded.data, updated_at = now();

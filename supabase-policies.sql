-- Políticas recomendadas para a tabela app_state
-- ATENÇÃO: revise antes de aplicar em produção.

-- Habilita RLS
ALTER TABLE IF EXISTS app_state ENABLE ROW LEVEL SECURITY;

-- 1) Política de leitura pública (permite SELECT para todos)
CREATE POLICY IF NOT EXISTS "allow_select_public" ON app_state
  FOR SELECT
  USING (true);

-- 2) Política de gravação segura (recomendada): apenas usuários autenticados
-- Para usar esta política, habilite autenticação no seu app e use a chave anon
-- NOTA: auth.role() retorna 'authenticated' para usuários logados no Supabase Auth
CREATE POLICY IF NOT EXISTS "allow_mod_auth_users" ON app_state
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3) Política de desenvolvimento (fácil, NÃO RECOMENDADA em produção): permite upsert via anon key
-- Descomente apenas para ambiente de desenvolvimento local quando necessário.
--
-- CREATE POLICY IF NOT EXISTS "allow_mod_anon_dev" ON app_state
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);

-- Observação:
-- - Para operações via API com a anon key, a política acima (dev) permite alteração direta.
-- - Em produção, prefira criar usuários via Supabase Auth e manter a política "allow_mod_auth_users".

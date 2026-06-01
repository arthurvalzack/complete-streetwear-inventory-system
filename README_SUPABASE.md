Passos para configurar Supabase e integrar ao projeto

1) Criar projeto Supabase
- Acesse https://app.supabase.com e crie um novo projeto.

2) Criar tabela
- Abra o SQL Editor no Supabase e cole o conteúdo de `supabase-setup.sql`.

3) Variáveis de ambiente
- No painel do projeto Supabase pegue `URL` e `anon key`.
- Crie um arquivo `.env` na raiz do projeto com o conteúdo de `.env.example`, substituindo pelos valores reais.

4) Instalar dependências e rodar
```bash
npm install
npm run dev
```

5) Testar sincronização
- Ao abrir a app (e fazer login) ela tentará puxar o estado remoto.
- Ao fazer alterações (produtos, movimentos, etc.) a app tentará dar upsert do estado completo para a tabela `app_state`.

Notas:
- Se você quer que apenas usuários autenticados modifiquem o estado remoto, configure Row Level Security (RLS) e políticas no Supabase.
- Se quiser, eu posso criar políticas RLS exemplo para permitir apenas usuários autenticados upsert.

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltando VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const file = process.argv[2] || 'state-export.json';
  if (!fs.existsSync(file)) {
    console.error('Arquivo não encontrado:', file);
    console.error('Crie um JSON exportado do localStorage e salve como state-export.json');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const { error } = await supabase.from('app_state').upsert([{ id: 'global', data: payload }], { returning: 'minimal' });
    if (error) {
      console.error('Erro no upsert:', error);
      process.exit(1);
    }
    console.log('Estado upsertado com sucesso na tabela app_state');
  } catch (e) {
    console.error('Erro inesperado:', e);
    process.exit(1);
  }
}

main();

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { exportState, importState, syncAllToRemote, loadRemoteToLocal, getCategories, createCategory, addSubcategory, deleteCategory } from '../lib/database';
import { isSupabaseConfigured } from '../lib/supabase';

function getLastSyncSafe() {
  try {
    return localStorage.getItem('stck_last_sync') || null;
  } catch (error) {
    console.error('[LOCAL STORAGE READ ERROR]', error);
    return null;
  }
}

export function SettingsPage() {
  const { storeConfig, updateStoreConfig } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(storeConfig.logoUrl || null);
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncSafe());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeMovements, setIncludeMovements] = useState(true);
  const [includeBrands, setIncludeBrands] = useState(true);
  const [includeCategories, setIncludeCategories] = useState(true);
  const [includeConfig, setIncludeConfig] = useState(true);

  const [form, setForm] = useState({
    storeName: storeConfig.storeName,
  });

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setLogoPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.storeName.trim()) {
      toast.error('Nome da loja é obrigatório');
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 400));

    updateStoreConfig({
      storeName: form.storeName,
      logoUrl: logoPreview || undefined,
    });

    setLoading(false);
    setIsEditing(false);
    toast.success('Configurações atualizadas com sucesso!');
  };

  const handleCancel = () => {
    setForm({ storeName: storeConfig.storeName });
    setLogoPreview(storeConfig.logoUrl || null);
    setIsEditing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.15)' }}
        >
          <Settings size={24} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-sm text-white/40">Gerencie as informações da sua loja</p>
        </div>
      </motion.div>

      {/* Categories Management */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/30 font-medium mb-1">Categorias</p>
            <p className="text-sm text-white/60">Gerencie categorias e subcategorias</p>
          </div>
          <div>
            <Button onClick={() => { useStore.getState().loadData(); toast.success('Atualizado'); }}>Atualizar</Button>
            <Button className="ml-2" onClick={() => { syncAllToRemote().then(() => toast.success('Sincronizado')); }}>Sincronizar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-2">
            <p className="text-sm text-white/70 mb-2">Lista de Categorias</p>
            <div className="space-y-2">
              {getCategories().length === 0 && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-sm text-white/50">Nenhuma categoria cadastrada.</div>
              )}
              {getCategories().map(cat => (
                <div key={cat.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm text-white font-medium">{cat.name}</p>
                      <p className="text-xs text-white/40">{cat.subcategories?.length || 0} subcategoria(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-xs text-red-400" onClick={async () => {
                        if (!confirm('Confirma exclusão desta categoria?')) return;
                        const ok = await deleteCategory(cat.id);
                        if (ok) {
                          useStore.getState().loadData();
                          await syncAllToRemote();
                          toast.success('Categoria excluída');
                        } else {
                          toast.error('Não é possível excluir esta categoria porque existem produtos vinculados.');
                        }
                      }}>Excluir</button>
                    </div>
                  </div>
                  <div className="text-xs text-white/40 mb-2">Subcategorias:</div>
                  <div className="flex flex-col gap-2 mb-3">
                    {(cat.subcategories || []).map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-white/[0.01] p-2 rounded">
                        <div className="text-sm text-white/60">{s.name}</div>
                        <div className="flex items-center gap-2">
                          <button className="text-xs text-red-400" onClick={async () => {
                            if (!confirm('Confirma exclusão desta subcategoria?')) return;
                            // delete subcategory with safety
                            const { deleteSubcategory } = await import('../lib/database');
                            const ok = await deleteSubcategory(cat.id, s.id);
                            if (ok) {
                              useStore.getState().loadData();
                              await syncAllToRemote();
                              toast.success('Subcategoria excluída');
                            } else {
                              toast.error('Não é possível excluir esta subcategoria porque existem produtos vinculados.');
                            }
                          }}>Excluir</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input placeholder="Nova subcategoria" id={`sub-${cat.id}`} className="input-dark w-full rounded-xl px-3 py-2 text-sm" />
                    <Button onClick={async () => {
                      const el = document.getElementById(`sub-${cat.id}`) as HTMLInputElement | null;
                      const val = el?.value?.trim();
                      if (!val) { toast.error('Nome da subcategoria é obrigatório'); return; }
                      await addSubcategory(cat.id, val);
                      el!.value = '';
                      useStore.getState().loadData();
                      await syncAllToRemote();
                      toast.success('Subcategoria adicionada');
                    }}>Adicionar</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-white/70 mb-2">Adicionar Categoria</p>
            <div className="space-y-2">
              <Input id="new-cat-name" placeholder="Nome da categoria" />
              <Button onClick={async () => {
                const el = document.getElementById('new-cat-name') as HTMLInputElement | null;
                const name = el?.value?.trim();
                if (!name) { toast.error('Nome é obrigatório'); return; }
                createCategory({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), subcategories: [] });
                el!.value = '';
                useStore.getState().loadData();
                toast.success('Categoria criada');
              }}>Criar Categoria</Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Backup & Sync */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/30 font-medium mb-1">Backup e Sincronização</p>
            <p className="text-sm text-white/60">Gerencie backups locais e sincronização com Supabase</p>
            <p className="text-xs text-white/40 mt-2">Status Supabase: {isSupabaseConfigured ? 'Conectado' : 'Desconectado'}</p>
            <p className="text-xs text-white/40">Última sincronização: {lastSync ? new Date(lastSync).toLocaleString() : '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            <p className="text-sm font-medium text-white/70">Exportar Backup JSON</p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs"><input type="checkbox" checked={includeProducts} onChange={e => setIncludeProducts(e.target.checked)} /> Produtos</label>
              <label className="text-xs"><input type="checkbox" checked={includeMovements} onChange={e => setIncludeMovements(e.target.checked)} /> Movimentações</label>
              <label className="text-xs"><input type="checkbox" checked={includeBrands} onChange={e => setIncludeBrands(e.target.checked)} /> Marcas</label>
              <label className="text-xs"><input type="checkbox" checked={includeCategories} onChange={e => setIncludeCategories(e.target.checked)} /> Categorias</label>
              <label className="text-xs"><input type="checkbox" checked={includeConfig} onChange={e => setIncludeConfig(e.target.checked)} /> Configurações</label>
            </div>
            <div className="mt-2">
              <Button variant="primary" onClick={async () => {
                setExporting(true);
                try {
                  const state = await exportState();
                  const payload: any = {};
                  if (includeProducts) payload.products = state.products || [];
                  if (includeMovements) payload.movements = state.movements || [];
                  if (includeBrands) payload.brands = state.brands || [];
                  if (includeCategories) payload.categories = state.categories || [];
                  if (includeConfig) payload.storeConfig = state.storeConfig || {};
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `backup_${new Date().toISOString()}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success('Backup gerado e baixado');
                } catch (err) {
                  toast.error('Erro ao gerar backup');
                } finally {
                  setExporting(false);
                }
              }} loading={exporting}>Exportar Backup JSON</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">Importar Backup JSON</p>
            <input disabled={importing} type="file" accept="application/json" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              let parsed: any;
              try {
                parsed = JSON.parse(text);
              } catch (err) {
                toast.error('Arquivo JSON inválido');
                return;
              }
              // basic validation
              const ok = (parsed.products === undefined || Array.isArray(parsed.products))
                && (parsed.movements === undefined || Array.isArray(parsed.movements));
              if (!ok) {
                toast.error('Estrutura inválida do backup');
                return;
              }
              if (!confirm('Deseja realmente importar este backup? Isso substituirá o cache local.')) return;
              setImporting(true);
              try {
                await importState(parsed, { overwriteRemote: false });
                // refresh in-memory
                useStore.getState().loadData();
                toast.success('Backup importado e cache atualizado');
              } catch (err) {
                toast.error('Erro ao importar backup');
              } finally {
                setImporting(false);
              }
            }} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={async () => {
            setSyncing(true);
            try {
              await syncAllToRemote();
              const ts = getLastSyncSafe() || new Date().toISOString();
              setLastSync(ts);
              toast.success('Sincronização enviada ao Supabase');
              useStore.getState().loadData();
            } catch (err) {
              toast.error('Erro ao sincronizar');
            } finally { setSyncing(false); }
          }} loading={syncing}>Sincronizar Agora (local → Supabase)</Button>

          <Button variant="outline" onClick={async () => {
            try {
              await loadRemoteToLocal();
              useStore.getState().loadData();
              toast.success('Restaurado do Supabase para cache local');
            } catch (err) {
              toast.error('Erro ao restaurar do Supabase');
            }
          }}>Restaurar do Supabase (substituir cache local)</Button>

          <Button variant="ghost" onClick={async () => {
            const state = await exportState();
            const stats = {
              products: (state.products || []).length,
              movements: (state.movements || []).length,
              sizeKB: Math.round(JSON.stringify(state).length / 1024),
            };
            alert(`Produtos: ${stats.products}\nMovimentações: ${stats.movements}\nTamanho aprox.: ${stats.sizeKB} KB`);
          }}>Estatísticas</Button>
        </div>
      </motion.div>

      {/* Current Config Display */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/30 font-medium mb-1">Configurações Atuais</p>
            <div className="flex items-center gap-3">
              {storeConfig.logoUrl && (
                <img
                  src={storeConfig.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 rounded-lg object-cover"
                />
              )}
              <div>
                <p className="text-sm text-white font-medium">{storeConfig.storeName}</p>
                <p className="text-xs text-white/40">
                  Atualizado em {new Date(storeConfig.updatedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Editar
          </Button>
        </div>
      </motion.div>

      {/* Edit Modal */}
      <Modal
        open={isEditing}
        onClose={handleCancel}
        title="Editar Configurações"
        subtitle="Atualize o nome e logo da sua loja"
      >
        <div className="space-y-5">
          {/* Logo Upload */}
          <div>
            <label className="block text-xs text-white/30 font-medium mb-2">Logo da Loja</label>
            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <Upload size={32} className="text-white/20" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                    className="hidden"
                  />
                  <div className="px-4 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg cursor-pointer text-sm text-indigo-200 font-medium transition-colors text-center">
                    Escolher Imagem
                  </div>
                </label>
                <p className="text-xs text-white/30">
                  PNG, JPG, GIF até 5MB
                </p>
                {logoPreview && (
                  <button
                    onClick={() => setLogoPreview(null)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Store Name */}
          <div>
            <label className="block text-xs text-white/30 font-medium mb-2">Nome da Loja</label>
            <Input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm(prev => ({ ...prev, storeName: e.target.value }))}
              placeholder="Ex: FRAZON STORE"
              className="w-full"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleCancel}
              className="flex-1 bg-white/5 hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

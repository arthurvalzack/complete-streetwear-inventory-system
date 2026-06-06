import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Trash2, UploadCloud, Eye, ArrowRight, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { createCatalogoShareLink, getCatalogoConfig, getCatalogoItems, toggleCatalogoProduct, removeProductFromCatalog, updateCatalogoConfig } from '../services/catalogoService';

function getCatalogShareBaseUrl() {
  try {
    return localStorage.getItem('catalogShareBaseUrl') || window.location.origin;
  } catch (error) {
    console.error('[LOCAL STORAGE READ ERROR]', error);
    return window.location.origin;
  }
}

function saveCatalogShareBaseUrl(baseUrl: string) {
  try {
    localStorage.setItem('catalogShareBaseUrl', baseUrl);
  } catch (error) {
    console.warn('[LOCAL STORAGE WRITE ERROR]', error);
  }
}

export function AdminCatalogPage() {
  const navigate = useNavigate();
  const { products, loadData } = useStore();
  const [catalogIds, setCatalogIds] = useState<string[]>([]);
  const [config, setConfig] = useState<{ title: string; description: string; whatsapp: string; mensagem: string }>({
    title: '',
    description: '',
    whatsapp: '',
    mensagem: 'Oi! Vi o catálogo da Frazon Store e tenho interesse em: {produto}. Pode me passar o valor e disponibilidade? 😊',
  });
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copiar link 📋');
  const [baseUrl, setBaseUrl] = useState<string>(() => {
    return getCatalogShareBaseUrl();
  });

  useEffect(() => {
    loadData();
    setCatalogIds(getCatalogoItems());
    setConfig(getCatalogoConfig());
  }, []);

  const publishedProducts = useMemo(
    () => products.filter(product => catalogIds.includes(product.id)),
    [products, catalogIds],
  );

  const shareableLink = useMemo(
    () => createCatalogoShareLink(baseUrl || window.location.origin, publishedProducts, config),
    [publishedProducts, config, baseUrl],
  );

  const availableProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const handleToggle = (productId: string) => {
    const nextIds = toggleCatalogoProduct(productId);
    setCatalogIds(nextIds);
    toast.success(nextIds.includes(productId) ? 'Produto adicionado ao catálogo público' : 'Produto removido do catálogo público');
  };

  const handleConfigSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const next = updateCatalogoConfig(config);
    setConfig({
      title: next.title,
      description: next.description,
      whatsapp: next.whatsapp,
      mensagem: next.mensagem,
    });
    setSaving(false);
    toast.success('Configuração do catálogo salva');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopyStatus('Copiado! ✅');
      window.setTimeout(() => setCopyStatus('Copiar link 📋'), 2000);
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const handleRemovePublished = (productId: string) => {
    const nextIds = removeProductFromCatalog(productId);
    setCatalogIds(nextIds);
    toast.success('Produto removido do catálogo');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.28em] text-white/40">Configuração de catálogo</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-white">Administração do Catálogo</h1>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-3 text-white/70 hover:bg-white/10 hover:text-white transition"
              title="Configurações do catálogo"
            >
              <Settings size={18} />
            </button>
          </div>
          <p className="max-w-2xl text-white/50">Selecione produtos para publicar em /catalogo e atualize o título, mensagem e link que serão enviados aos clientes.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon={<Eye size={16} />} onClick={() => navigate('/catalogo')}>
            Ver catálogo
          </Button>
          <Button variant="secondary" icon={<ArrowRight size={16} />} onClick={() => navigate('/')}>Voltar</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] mt-8">
        <Card className="p-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.28em] text-white/40">Dados do catálogo</p>
              <p className="text-white/60">Os campos abaixo aparecem na página pública do catálogo.</p>
            </div>

            <Input
              label="Título do catálogo"
              value={config.title}
              onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ex: Catálogo FRAZON STORE"
            />
            <Input
              label="Descrição do catálogo"
              value={config.description}
              onChange={e => setConfig(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Selecione peças icônicas para sua coleção streetwear..."
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" loading={saving} onClick={handleConfigSave} icon={<UploadCloud size={16} />}>
                Salvar alterações
              </Button>
              <Button variant="outline" onClick={() => setConfig(getCatalogoConfig())}>Recarregar</Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-white/40">Produtos publicados</p>
                <p className="text-white/60">Itens atualmente visíveis no catálogo público.</p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/50">{publishedProducts.length} itens</span>
            </div>

            <div className="space-y-3">
              {publishedProducts.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/50">
                  Nenhum produto publicado no catálogo ainda.
                </div>
              ) : (
                publishedProducts.map(product => (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                    <div>
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="text-xs text-white/40">{product.brand?.name || 'Marca'} — {product.category?.name || 'Categoria'}</p>
                    </div>
                    <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => handleRemovePublished(product.id)}>
                      Remover
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Configurações do Catálogo"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={handleConfigSave}>Salvar configurações</Button>
          </>
        }
      >
        <div className="space-y-6">
          <Input
            label="Número do WhatsApp"
            value={config.whatsapp}
            onChange={e => setConfig(prev => ({ ...prev, whatsapp: e.target.value }))}
            placeholder="5511999999999"
          />
          <p className="text-xs text-white/40">Somente números, com DDD e código do país (55)</p>

          <Textarea
            label="Mensagem para o cliente"
            value={config.mensagem}
            onChange={e => setConfig(prev => ({ ...prev, mensagem: e.target.value }))}
            placeholder="Oi! Vi o catálogo da Frazon Store e tenho interesse em: {produto}. Pode me passar o valor e disponibilidade? 😊"
            className="min-h-[140px]"
          />
          <p className="text-xs text-white/40">Use {'{produto}'} onde quiser que apareça o nome da peça automaticamente.</p>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Link para compartilhar com clientes</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareableLink}
                className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm text-white/70 bg-white/5"
              />
              <Button variant="secondary" onClick={handleCopyLink}>{copyStatus}</Button>
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Base URL para o link</label>
            <p className="text-xs text-white/40">Troque `localhost` pelo IP da sua rede para compartilhar com clientes na mesma rede.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                onBlur={() => saveCatalogShareBaseUrl(baseUrl)}
                className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm text-white/70 bg-white/5"
              />
              <Button variant="primary" onClick={() => { saveCatalogShareBaseUrl(baseUrl); toast.success('Base URL salva'); }}>
                Salvar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="primary" onClick={() => window.open(shareableLink, '_blank')}>
              Ver catálogo público
            </Button>
          </div>
        </div>
      </Modal>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/40">Lista de produtos</p>
            <p className="text-white/60">Clique para incluir ou remover produtos do catálogo público.</p>
          </div>
          <span className="text-xs text-white/40">Somente produtos publicados aparecem em /catalogo.</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {availableProducts.map(product => {
            const isPublished = catalogIds.includes(product.id);
            return (
              <Card key={product.id} className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/40">
                      <span>{product.brand?.name || 'Marca'}</span>
                      <span>•</span>
                      <span>{product.category?.name || 'Categoria'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="text-sm text-white/50 line-clamp-2">{product.description}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">R$ {product.salePrice.toFixed(2).replace('.', ',')}</p>
                    <p className="text-xs text-white/40">{product.totalQuantity} un.</p>
                  </div>
                  <Button
                    variant={isPublished ? 'danger' : 'primary'}
                    size="sm"
                    icon={isPublished ? <Trash2 size={14} /> : <CheckCircle2 size={14} />}
                    onClick={() => handleToggle(product.id)}
                  >
                    {isPublished ? 'Remover' : 'Publicar'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

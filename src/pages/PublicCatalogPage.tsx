import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { getProducts, getStoreConfig, loadRemoteToLocal } from '../lib/database';
import { getCatalogoItems, getCatalogoConfig, parseCatalogoShareParam } from '../services/catalogoService';
import { Product, StoreConfig } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function PublicCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<Record<string, any>>({
    title: '',
    description: '',
    whatsapp: '',
    mensagem: 'Oi! Vi o catálogo da Frazon Store e tenho interesse em: {produto}. Pode me passar o valor e disponibilidade? 😊',
  });
  const location = useLocation();
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(getStoreConfig());

  const loadCatalog = async () => {
    await loadRemoteToLocal().catch(error => console.error('[SUPABASE LOAD ERROR]', error));
    const sharedCatalog = parseCatalogoShareParam(location.search);
    const catalogIds = sharedCatalog?.ids ?? getCatalogoItems();
    const allProducts = (sharedCatalog?.products ?? getProducts()) as Product[];
    const productsToShow = allProducts.filter(product => {
      const isPublished = Array.isArray(catalogIds) && catalogIds.length > 0 ? catalogIds.includes(product.id) : true;
      return isPublished && product.status === 'active';
    });
    setProducts(productsToShow.sort((a, b) => a.name.localeCompare(b.name)));
    setConfig({
      ...getCatalogoConfig(),
      ...(sharedCatalog?.config || {}),
    });
    setStoreConfig(getStoreConfig());
  };

  useEffect(() => {
    loadCatalog();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'frazon_catalogo_items' || event.key === 'catalogoConfig') {
        loadCatalog();
      }
    };

    const handleFocus = () => { loadCatalog(); };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [location.search]);

  const handleWhatsApp = (productName: string) => {
    const phone = config.whatsapp?.trim();
    if (!phone) {
      alert('O link do WhatsApp ainda não foi configurado pelo administrador.');
      return;
    }
    const sanitizedPhone = phone.replace(/\D/g, '');
    if (!sanitizedPhone) {
      alert('O link do WhatsApp ainda não foi configurado pelo administrador.');
      return;
    }
    const text = (config.mensagem || '').replace(/\{produto\}/g, productName);
    const url = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const defaultProductImage = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80';

  return (
    <div className="min-h-screen bg-[#05060c] text-white">
      <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm uppercase tracking-[0.24em] text-white/40">
              <MapPin size={16} />
              <span>{storeConfig.storeName}</span>
            </div>
            <div>
              <p className="text-sm text-white/50 uppercase tracking-[0.24em]">Catálogo público</p>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{config.title}</h1>
              <p className="mt-4 max-w-2xl text-white/60 leading-7">{config.description}</p>
            </div>
          </div>

          <div className="hidden" />
        </header>

        <section className="mt-10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/30">Peças publicadas</p>
              <p className="text-sm text-white/40">Produtos apresentados para clientes no catálogo público.</p>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/60">
              {products.length} itens
            </span>
          </div>

          {products.length === 0 ? (
            <Card className="p-10 text-center border border-white/10">
              <div className="space-y-3">
                <p className="text-lg font-semibold">Nenhum produto publicado ainda.</p>
                <p className="text-sm text-white/40">O catálogo público ainda não tem produtos configurados.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map(product => (
                <Card key={product.id} className="overflow-hidden">
                  <div className="h-52 bg-slate-950/80 overflow-hidden">
                    <img
                      src={product.images?.[0] || defaultProductImage}
                      alt={product.name}
                      className="h-52 w-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.28em] text-white/40">
                      <span>{product.brand?.name || 'Marca'}</span>
                      <span>{product.category?.name || 'Categoria'}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-white">{product.name}</h2>
                    <p className="text-sm text-white/50 leading-6 line-clamp-3">{product.description}</p>
                    <div className="flex flex-col gap-3 pt-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-white">R$ {product.salePrice.toFixed(2).replace('.', ',')}</span>
                        <span className="text-white/40">{product.totalQuantity} un.</span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleWhatsApp(product.name)}
                      >
                        Quero esse 💬
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

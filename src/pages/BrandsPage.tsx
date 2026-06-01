import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ShoppingBag, Tag } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { createBrand, createCategory } from '../lib/database';
import toast from 'react-hot-toast';

export function BrandsPage() {
  const { brands, categories, products, loadData } = useStore();

  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [catName, setCatName] = useState('');
  const [catSubcategories, setCatSubcategories] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddBrand = async () => {
    if (!brandName.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    createBrand({
      name: brandName.trim(),
      slug: brandName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    });
    loadData();
    setBrandName('');
    setShowBrandModal(false);
    setLoading(false);
    toast.success('Marca adicionada!');
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const slug = catName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const subs = catSubcategories.split(',').map(s => s.trim()).filter(Boolean).map(s => ({
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: s,
      slug: s.toLowerCase().replace(/\s+/g, '-'),
      categoryId: '',
    }));
    createCategory({
      name: catName.trim(),
      slug,
      subcategories: subs,
    });
    loadData();
    setCatName('');
    setCatSubcategories('');
    setShowCatModal(false);
    setLoading(false);
    toast.success('Categoria adicionada!');
  };

  const getBrandProductCount = (brandId: string) => products.filter(p => p.brandId === brandId).length;
  const getBrandStock = (brandId: string) => products.filter(p => p.brandId === brandId).reduce((acc, p) => acc + p.totalQuantity, 0);
  const getCatProductCount = (catId: string) => products.filter(p => p.categoryId === catId).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Brands Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Marcas</h2>
            <p className="text-xs text-white/30 mt-0.5">{brands.length} marcas cadastradas</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowBrandModal(true)}>
            Nova Marca
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {brands.map((brand, i) => (
            <motion.div
              key={brand.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.04] transition-all"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'rgba(99,102,241,0.15)' }}>
                <ShoppingBag size={18} className="text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-white">{brand.name}</p>
              <p className="text-xs text-white/30 mt-0.5 font-mono">{brand.slug}</p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge variant="info" size="sm">{getBrandProductCount(brand.id)} produtos</Badge>
                <Badge variant="outline" size="sm">{getBrandStock(brand.id)} un.</Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Categories Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Categorias</h2>
            <p className="text-xs text-white/30 mt-0.5">{categories.length} categorias cadastradas</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCatModal(true)}>
            Nova Categoria
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-2xl p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)' }}>
                  <Tag size={16} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{cat.name}</p>
                  <Badge variant="purple" size="sm">{getCatProductCount(cat.id)} produtos</Badge>
                </div>
              </div>

              {cat.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cat.subcategories.map(sub => (
                    <span key={sub.id} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">
                      {sub.name}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Brand Modal */}
      <Modal
        open={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title="Nova Marca"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowBrandModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={handleAddBrand}>Adicionar</Button>
          </>
        }
      >
        <Input
          label="Nome da Marca"
          value={brandName}
          onChange={e => setBrandName(e.target.value)}
          placeholder="Ex: Supreme, Off-White..."
          autoFocus
        />
      </Modal>

      {/* Category Modal */}
      <Modal
        open={showCatModal}
        onClose={() => setShowCatModal(false)}
        title="Nova Categoria"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCatModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={handleAddCategory}>Adicionar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome da Categoria"
            value={catName}
            onChange={e => setCatName(e.target.value)}
            placeholder="Ex: Camisetas, Hoodies..."
          />
          <Input
            label="Subcategorias (separadas por vírgula)"
            value={catSubcategories}
            onChange={e => setCatSubcategories(e.target.value)}
            placeholder="Manga Curta, Manga Longa, Cropped..."
            hint="Opcional"
          />
        </div>
      </Modal>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Filter, X, Package, Edit2, Trash2,
  AlertTriangle, Tag, Eye
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore } from '../store/useStore';
import { getOrCreateBrand } from '../lib/database';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Table, Pagination } from '../components/ui/Table';
import { Product, ProductStatus, ProductVariant } from '../types';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 10;

const statusConfig = {
  active: { label: 'Ativo', variant: 'success' as const },
  inactive: { label: 'Inativo', variant: 'warning' as const },
  archived: { label: 'Arquivado', variant: 'outline' as const },
};

const defaultVariant = (): Omit<ProductVariant, 'id' | 'productId' | 'sku'> => ({
  size: '',
  color: '',
  colorHex: '#000000',
  quantity: 0,
  costPrice: 0,
  salePrice: 0,
});

const defaultForm = {
  name: '',
  brandId: '',
  brandName: '',
  categoryId: '',
  subcategoryId: '',
  description: '',
  tags: '',
  status: 'active' as ProductStatus,
  costPrice: 0,
  salePrice: 0,
  images: [] as string[],
  variants: [defaultVariant()],
};

export function ProductsPage() {
  const { products, brands, categories, addProduct, editProduct, removeProduct, currentPage, setCurrentPage, searchQuery } = useStore();

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = useState({
    brandId: '',
    categoryId: '',
    status: '' as ProductStatus | '',
    stockStatus: 'all' as 'all' | 'in_stock' | 'low_stock' | 'out_of_stock',
  });

  // Form state
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Filtered & paginated products
  const filteredProducts = useMemo(() => {
    let result = [...products];
    const q = searchQuery.toLowerCase();
    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand?.name.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (filters.brandId) result = result.filter(p => p.brandId === filters.brandId);
    if (filters.categoryId) result = result.filter(p => p.categoryId === filters.categoryId);
    if (filters.status) result = result.filter(p => p.status === filters.status);
    if (filters.stockStatus === 'in_stock') result = result.filter(p => p.totalQuantity > 5);
    if (filters.stockStatus === 'low_stock') result = result.filter(p => p.totalQuantity > 0 && p.totalQuantity <= 5);
    if (filters.stockStatus === 'out_of_stock') result = result.filter(p => p.totalQuantity === 0);
    return result;
  }, [products, searchQuery, filters]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const subcategories = useMemo(() => {
    const cat = categories.find(c => c.id === form.categoryId);
    return cat?.subcategories || [];
  }, [categories, form.categoryId]);

  const noCategories = categories.length === 0;

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      setForm(prev => ({ ...prev, images: [base64] }));
    };
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Nome é obrigatório';
    if (!form.brandName.trim()) errors.brandName = 'Marca é obrigatória';
    if (!form.categoryId) errors.categoryId = 'Categoria é obrigatória';
    if (form.variants.length === 0) errors.variants = 'Adicione ao menos uma variação';
    form.variants.forEach((v, i) => {
      if (!v.size) errors[`variant_${i}_size`] = 'Tamanho obrigatório';
      if (!v.color) errors[`variant_${i}_color`] = 'Cor obrigatória';
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAdd = () => {
    setEditingProduct(null);
    setForm(defaultForm);
    setFormErrors({});
    setImagePreview(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      brandId: p.brandId,
      brandName: p.brand?.name || '',
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId,
      description: p.description,
      tags: p.tags.join(', '),
      status: p.status,
      costPrice: p.costPrice,
      salePrice: p.salePrice,
      images: p.images,
      variants: p.variants.map(v => ({
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        quantity: v.quantity,
        costPrice: v.costPrice,
        salePrice: v.salePrice,
      })),
    });
    setImagePreview(p.images[0] || null);
    setFormErrors({});
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));

    // Get or create brand
    const brand = getOrCreateBrand(form.brandName);

    const productData = {
      name: form.name,
      brandId: brand.id,
      brand: brand,
      categoryId: form.categoryId,
      category: categories.find(c => c.id === form.categoryId),
      subcategoryId: form.subcategoryId,
      subcategory: categories.find(c => c.id === form.categoryId)?.subcategories.find(s => s.id === form.subcategoryId),
      description: form.description,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      images: form.images,
      status: form.status,
      costPrice: Number(form.costPrice),
      salePrice: Number(form.salePrice),
      variants: form.variants.map((v, i) => ({
        id: editingProduct?.variants[i]?.id || '',
        productId: editingProduct?.id || '',
        sku: editingProduct?.variants[i]?.sku || '',
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        quantity: Number(v.quantity),
        costPrice: Number(v.costPrice) || Number(form.costPrice),
        salePrice: Number(v.salePrice) || Number(form.salePrice),
      })),
    };

    if (editingProduct) {
      editProduct(editingProduct.id, productData);
      toast.success('Produto atualizado com sucesso!');
    } else {
      addProduct(productData);
      toast.success('Produto cadastrado com sucesso!');
    }
    setLoading(false);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    removeProduct(deleteConfirm.id);
    toast.success('Produto removido.');
    setDeleteConfirm(null);
  };

  const addVariant = () => {
    setForm(prev => ({ ...prev, variants: [...prev.variants, defaultVariant()] }));
  };

  const removeVariant = (i: number) => {
    setForm(prev => ({ ...prev, variants: prev.variants.filter((_, idx) => idx !== i) }));
  };

  const updateVariant = (i: number, field: string, value: string | number) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.map((v, idx) => idx === i ? { ...v, [field]: value } : v),
    }));
  };

  const columns = [
    {
      key: 'product',
      header: 'Produto',
      render: (p: Product) => (
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 overflow-hidden"
            style={{ background: 'rgba(99,102,241,0.1)' }}
          >
            {p.images && p.images.length > 0 && p.images[0] ? (
              <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              '👕'
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate max-w-[180px]">{p.name}</p>
            <p className="text-xs text-white/30 font-mono">{p.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'brand',
      header: 'Marca',
      render: (p: Product) => (
        <span className="text-white/60 text-sm">{p.brand?.name || '—'}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      render: (p: Product) => (
        <div>
          <p className="text-sm text-white/60">{p.category?.name || '—'}</p>
          <p className="text-xs text-white/25">{p.subcategory?.name}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Estoque',
      render: (p: Product) => (
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${p.totalQuantity === 0 ? 'text-red-400' : p.totalQuantity <= 5 ? 'text-amber-400' : 'text-white/80'}`}>
            {p.totalQuantity}
          </span>
          {p.totalQuantity === 0 && <AlertTriangle size={12} className="text-red-400" />}
          {p.totalQuantity > 0 && p.totalQuantity <= 5 && <AlertTriangle size={12} className="text-amber-400" />}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Preço',
      render: (p: Product) => (
        <div>
          <p className="text-sm font-semibold text-white/90">
            R$ {p.salePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-white/30">
            Custo: R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p: Product) => (
        <Badge variant={statusConfig[p.status].variant}>
          {statusConfig[p.status].label}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p: Product) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => setViewingProduct(p)}
            className="p-1.5 text-white/20 hover:text-white/60 hover:bg-white/5 rounded-lg transition-all"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => openEdit(p)}
            className="p-1.5 text-white/20 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => setDeleteConfirm(p)}
            className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm text-white/40">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Filter size={14} />}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            Filtros
            {Object.values(filters).some(v => v && v !== 'all') && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            )}
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass rounded-xl overflow-hidden"
          >
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Select
                label="Marca"
                value={filters.brandId}
                onChange={e => setFilters(prev => ({ ...prev, brandId: e.target.value }))}
                options={brands.map(b => ({ value: b.id, label: b.name }))}
                placeholder="Todas as marcas"
              />
              <Select
                label="Categoria"
                value={filters.categoryId}
                onChange={e => setFilters(prev => ({ ...prev, categoryId: e.target.value }))}
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Todas as categorias"
              />
              <Select
                label="Status"
                value={filters.status}
                onChange={e => setFilters(prev => ({ ...prev, status: e.target.value as ProductStatus | '' }))}
                options={[
                  { value: 'active', label: 'Ativo' },
                  { value: 'inactive', label: 'Inativo' },
                  { value: 'archived', label: 'Arquivado' },
                ]}
                placeholder="Todos os status"
              />
              <Select
                label="Estoque"
                value={filters.stockStatus}
                onChange={e => setFilters(prev => ({ ...prev, stockStatus: e.target.value as typeof filters.stockStatus }))}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'in_stock', label: 'Em estoque' },
                  { value: 'low_stock', label: 'Estoque baixo' },
                  { value: 'out_of_stock', label: 'Esgotado' },
                ]}
              />
            </div>
            <div className="px-4 pb-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ brandId: '', categoryId: '', status: '', stockStatus: 'all' })}
              >
                Limpar filtros
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <Table
          columns={columns}
          data={paginatedProducts}
          keyExtractor={p => p.id}
          emptyMessage="Nenhum produto encontrado"
          emptyIcon={<Package size={32} />}
        />
        {filteredProducts.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredProducts.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        )}
      </motion.div>

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingProduct ? 'Editar Produto' : 'Novo Produto'}
        subtitle={editingProduct ? `SKU: ${editingProduct.sku}` : 'Preencha as informações do produto'}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={handleSubmit}>
              {editingProduct ? 'Salvar alterações' : 'Cadastrar produto'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Nome do Produto"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Supreme Box Logo Tee"
              error={formErrors.name}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 block">
              Imagem do Produto
            </label>
            <div className="flex flex-col gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload(file);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 cursor-pointer hover:border-white/10 transition-colors"
              />
              {imagePreview && (
                <div className="flex items-start gap-3">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-28 h-28 rounded-xl object-cover border border-white/[0.06]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setForm(prev => ({ ...prev, images: [] }));
                    }}
                    className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5 block">
                Marca
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="brands-list"
                  value={form.brandName}
                  onChange={e => setForm(prev => ({ ...prev, brandName: e.target.value }))}
                  placeholder="Digite ou selecione uma marca"
                  className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
                <datalist id="brands-list">
                  {brands.map(b => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </div>
              {formErrors.brandName && <p className="text-xs text-red-400 mt-1">{formErrors.brandName}</p>}
            </div>
            <Select
              label="Status"
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as ProductStatus }))}
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'inactive', label: 'Inativo' },
                { value: 'archived', label: 'Arquivado' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Categoria"
              value={form.categoryId}
              onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value, subcategoryId: '' }))}
              options={categories.map(c => ({ value: c.id, label: c.name }))}
              placeholder={noCategories ? 'Nenhuma categoria cadastrada' : 'Selecione'}
              error={formErrors.categoryId}
            />
            {noCategories ? (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center text-sm text-white/50">
                Nenhuma categoria cadastrada. Cadastre uma categoria em Configurações.
              </div>
            ) : (
              <Select
                label="Subcategoria"
                value={form.subcategoryId}
                onChange={e => setForm(prev => ({ ...prev, subcategoryId: e.target.value }))}
                options={subcategories.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Selecione"
                disabled={!form.categoryId}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Preço de Custo (R$)"
              type="number"
              value={form.costPrice}
              onChange={e => setForm(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
            <Input
              label="Preço de Venda (R$)"
              type="number"
              value={form.salePrice}
              onChange={e => setForm(prev => ({ ...prev, salePrice: Number(e.target.value) }))}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
          </div>

          <Textarea
            label="Descrição"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Descreva o produto..."
            rows={3}
          />

          <Input
            label="Tags (separadas por vírgula)"
            value={form.tags}
            onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
            placeholder="hype, logo, streetwear, collab"
            icon={<Tag size={14} />}
          />

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Variações ({form.variants.length})
              </label>
              <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addVariant}>
                Adicionar variação
              </Button>
            </div>
            {formErrors.variants && (
              <p className="text-xs text-red-400 mb-2">{formErrors.variants}</p>
            )}
            <div className="space-y-3">
              {form.variants.map((v, i) => (
                <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/30 font-medium">Variação {i + 1}</span>
                    {form.variants.length > 1 && (
                      <button
                        onClick={() => removeVariant(i)}
                        className="text-white/20 hover:text-red-400 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Tamanho"
                      value={v.size}
                      onChange={e => updateVariant(i, 'size', e.target.value)}
                      placeholder="M, G, 42..."
                      error={formErrors[`variant_${i}_size`]}
                    />
                    <Input
                      label="Cor"
                      value={v.color}
                      onChange={e => updateVariant(i, 'color', e.target.value)}
                      placeholder="Preto, Branco..."
                      error={formErrors[`variant_${i}_color`]}
                    />
                    <Input
                      label="Quantidade"
                      type="number"
                      value={v.quantity}
                      onChange={e => updateVariant(i, 'quantity', Number(e.target.value))}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        open={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        title={viewingProduct?.name}
        subtitle={`SKU: ${viewingProduct?.sku}`}
        size="xl"
      >
        {viewingProduct && (
          <div className="space-y-5">
            {/* Image Gallery */}
            {viewingProduct.images && viewingProduct.images.length > 0 && viewingProduct.images[0] ? (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <img
                  src={viewingProduct.images[0]}
                  alt={viewingProduct.name}
                  className="w-full h-auto max-h-[400px] object-cover"
                />
              </div>
            ) : (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-12 flex items-center justify-center min-h-[200px]">
                <span className="text-5xl">👕</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/30 mb-1">Marca</p>
                <p className="text-sm text-white font-medium">{viewingProduct.brand?.name}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 mb-1">Categoria</p>
                <p className="text-sm text-white font-medium">{viewingProduct.category?.name} › {viewingProduct.subcategory?.name}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 mb-1">Preço de Custo</p>
                <p className="text-sm text-white font-medium">R$ {viewingProduct.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 mb-1">Preço de Venda</p>
                <p className="text-sm text-white font-semibold text-indigo-300">R$ {viewingProduct.salePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 mb-1">Status</p>
                <Badge variant={statusConfig[viewingProduct.status].variant}>{statusConfig[viewingProduct.status].label}</Badge>
              </div>
              <div>
                <p className="text-xs text-white/30 mb-1">Estoque Total</p>
                <p className={`text-sm font-bold ${viewingProduct.totalQuantity === 0 ? 'text-red-400' : viewingProduct.totalQuantity <= 5 ? 'text-amber-400' : 'text-white'}`}>
                  {viewingProduct.totalQuantity} unidades
                </p>
              </div>
            </div>

            {viewingProduct.description && (
              <div>
                <p className="text-xs text-white/30 mb-1">Descrição</p>
                <p className="text-sm text-white/70">{viewingProduct.description}</p>
              </div>
            )}

            {viewingProduct.tags.length > 0 && (
              <div>
                <p className="text-xs text-white/30 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {viewingProduct.tags.map(tag => (
                    <Badge key={tag} variant="outline" size="sm">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-white/30 mb-3">Variações</p>
              <div className="space-y-2">
                {viewingProduct.variants.map(v => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" style={{ background: v.colorHex }} />
                      <div>
                        <span className="text-sm text-white font-medium">{v.size}</span>
                        <span className="text-xs text-white/30 ml-2">{v.color}</span>
                      </div>
                      <span className="text-xs font-mono text-white/20">{v.sku}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${v.quantity === 0 ? 'text-red-400' : v.quantity <= 3 ? 'text-amber-400' : 'text-white'}`}>
                        {v.quantity} un.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-white/20">
              Criado em {format(parseISO(viewingProduct.createdAt), 'dd/MM/yyyy HH:mm')}
              {' · '}
              Atualizado em {format(parseISO(viewingProduct.updatedAt), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir Produto"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-white/60">
          Tem certeza que deseja excluir o produto{' '}
          <span className="text-white font-medium">"{deleteConfirm?.name}"</span>?
          Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </div>
  );
}

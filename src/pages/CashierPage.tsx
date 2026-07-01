import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Banknote, CreditCard, DollarSign, Minus, Plus, QrCode, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getAlerts, getMovements, getProducts, registerSale } from '../lib/database';
import { CATALOG_STOCK_SYNC_WARNING, shouldSyncCatalogStock, syncCatalogStockAfterSale } from '../lib/catalogStockSync';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function movementTotals(m: any) {
  const qty = safeNumber(m?.quantity, 0);
  const unitPrice = safeNumber(m?.unitPrice ?? m?.unit_price ?? m?.variant?.salePrice ?? m?.product?.salePrice, 0);
  const unitCost = safeNumber(m?.unitCost ?? m?.unit_cost ?? m?.costPrice ?? m?.cost_price ?? m?.variant?.costPrice ?? m?.variant?.cost ?? m?.product?.costPrice, 0);
  const totalAmount = safeNumber(m?.totalAmount ?? m?.total_amount ?? m?.totalValue ?? m?.total_value, unitPrice * qty);
  const totalCost = safeNumber(m?.totalCost ?? m?.total_cost, unitCost * qty);
  const totalProfit = safeNumber(m?.totalProfit ?? m?.total_profit ?? m?.profit, totalAmount - totalCost);
  return { qty, unitPrice, unitCost, totalAmount, totalCost, totalProfit };
}

function formatBRL(value: any): string {
  return safeNumber(value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function displayCustomerName(value: any): string {
  const name = String(value || '').trim();
  return name || 'Cliente nao informado';
}

type CartItem = {
  cartItemId: string;
  productId: string;
  variantId?: string;
  productName: string;
  variantName: string;
  size?: string;
  color?: string;
  variantLabel?: string;
  imageUrl: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  stockAvailable: number;
};

export function CashierPage() {
  const { products, movements, addMovement, removeMovement, user } = useStore();
  const [productId, setProductId] = useState<string>('');
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix' | 'cash'>('card');
  const [customerName, setCustomerName] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedVariantsByProduct, setSelectedVariantsByProduct] = useState<Record<string, string | undefined>>({});

  const today = format(new Date(), 'yyyy-MM-dd');

  const isSale = (m: any) => {
    if (!m) return false;
    if (m.type === 'exit') return true;
    if (typeof m.reason === 'string' && /venda/i.test(m.reason)) return true;
    return false;
  };

  const todaysSales = useMemo(() => {
    return movements.filter(m => {
      if (!m.createdAt) return false;
      try {
        return format(parseISO(m.createdAt), 'yyyy-MM-dd') === today && isSale(m);
      } catch (e) {
        return typeof m.createdAt === 'string' && m.createdAt.startsWith(today) && isSale(m);
      }
    });
  }, [movements]);

  const totals = useMemo(() => {
    let total = 0;
    let profit = 0;
    let items = 0;
    todaysSales.forEach((m: any) => {
      const values = movementTotals(m);
      total += values.totalAmount;
      profit += values.totalProfit;
      items += values.qty;
    });
    return { total, profit, items, transactions: todaysSales.length };
  }, [todaysSales]);

  const selectedProduct = products.find(p => p.id === productId);
  const selectedVariant = selectedProduct?.variants.find(v => v.id === variantId);
  const selectedUnitPrice = safeNumber(selectedVariant?.salePrice ?? selectedProduct?.salePrice, 0);
  const selectedTotal = selectedUnitPrice * safeNumber(quantity, 0);

  const getProductImage = (product: any) => {
    const image = Array.isArray(product?.images) ? product.images[0] : product?.image;
    return typeof image === 'string' && image ? image : '';
  };

  const productCards = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return products
      .filter(product => {
        const searchable = `${product.name || ''} ${product.brand?.name || ''} ${product.category?.name || ''}`.toLowerCase();
        return !normalizedSearch || searchable.includes(normalizedSearch);
      })
      .map(product => ({
        product,
        variants: product.variants || [],
        quantity: product.variants?.length
          ? product.variants.reduce((acc, variant) => acc + safeNumber(variant.quantity, 0), 0)
          : safeNumber(product.totalQuantity, 0),
        price: safeNumber(product.salePrice, 0),
      }))
      .filter(item => item.quantity > 0);
  }, [products, searchTerm]);

  const getSelectedVariantForProduct = (product: any) => {
    const variants = product?.variants || [];
    if (!variants.length) return undefined;
    const selectedId = selectedVariantsByProduct[product.id];
    const selected = variants.find((variant: any) => variant.id === selectedId && safeNumber(variant.quantity, 0) > 0);
    return selected || variants.find((variant: any) => safeNumber(variant.quantity, 0) > 0);
  };

  const addProductToCart = (product: any) => {
    const variant = getSelectedVariantForProduct(product);
    const stockAvailable = safeNumber(variant?.quantity ?? product.totalQuantity, 0);
    if (stockAvailable <= 0) {
      toast.error('Produto sem estoque disponivel');
      return;
    }
    const nextVariantId = variant?.id;
    const cartItemId = `${product.id}:${nextVariantId || 'default'}`;
    const unitPrice = safeNumber(variant?.salePrice ?? product.salePrice, 0);
    const unitCost = safeNumber(variant?.costPrice ?? product.costPrice, 0);
    const variantName = variant ? [variant.size, variant.color].filter(Boolean).join(' - ') : 'Produto padrão';
    const variantLabel = variant ? [variant.size, variant.color, product.name].filter(Boolean).join(' - ') : '';

    setProductId(product.id);
    setVariantId(nextVariantId);
    setQuantity(1);
    setCartItems(currentItems => {
      const existing = currentItems.find(item => item.cartItemId === cartItemId);
      if (existing) {
        if (existing.quantity >= existing.stockAvailable) {
          toast.error('Quantidade maior que o estoque disponivel');
          return currentItems;
        }
        return currentItems.map(item => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [
        ...currentItems,
        {
          cartItemId,
          productId: product.id,
          variantId: nextVariantId,
          productName: product.name,
          variantName,
          size: variant?.size || '',
          color: variant?.color || '',
          variantLabel,
          imageUrl: getProductImage(product),
          quantity: 1,
          unitPrice,
          unitCost,
          stockAvailable,
        },
      ];
    });
  };

  const clearSale = () => {
    setCartItems([]);
    setProductId('');
    setVariantId(undefined);
    setQuantity(1);
    setCustomerName('');
  };

  const updateCartItemQuantity = (cartItemId: string, nextQuantity: number) => {
    setCartItems(currentItems => {
      const item = currentItems.find(cartItem => cartItem.cartItemId === cartItemId);
      if (!item) return currentItems;
      if (nextQuantity <= 0) return currentItems.filter(cartItem => cartItem.cartItemId !== cartItemId);
      if (nextQuantity > item.stockAvailable) {
        toast.error('Quantidade maior que o estoque disponivel');
        return currentItems;
      }
      return currentItems.map(cartItem => cartItem.cartItemId === cartItemId ? { ...cartItem, quantity: nextQuantity } : cartItem);
    });
  };

  const removeCartItem = (cartItemId: string) => {
    setCartItems(currentItems => currentItems.filter(item => item.cartItemId !== cartItemId));
  };

  const cartTotals = useMemo(() => {
    const totalAmount = cartItems.reduce((acc, item) => acc + safeNumber(item.quantity, 0) * safeNumber(item.unitPrice, 0), 0);
    const totalCost = cartItems.reduce((acc, item) => acc + safeNumber(item.quantity, 0) * safeNumber(item.unitCost, 0), 0);
    const totalProfit = totalAmount - totalCost;
    const totalItems = cartItems.reduce((acc, item) => acc + safeNumber(item.quantity, 0), 0);
    return { totalAmount, totalCost, totalProfit, totalItems };
  }, [cartItems]);

  const handleCreateSale = async (status: 'paid' | 'pending' = 'paid') => {
    if (cartItems.length === 0) return toast.error('Adicione pelo menos um produto ao carrinho');
    const saleCustomerName = customerName.trim();
    if (status === 'pending' && !saleCustomerName) {
      toast.error('Informe o nome do cliente para registrar uma venda pendente.');
      return;
    }
    setLoading(true);
    try {
      let catalogSyncError = '';
      const saleGroupId = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      for (const item of cartItems) {
        const currentProduct = getProducts().find(product => product.id === item.productId) || products.find(product => product.id === item.productId);
        if (!currentProduct) throw new Error(`Produto nao encontrado: ${item.productName}`);

        const currentVariant = item.variantId ? currentProduct.variants.find(variant => variant.id === item.variantId) : undefined;
        const availableStock = safeNumber(currentVariant?.quantity ?? currentProduct.totalQuantity, 0);
        const itemQuantity = safeNumber(item.quantity, 0);
        const unitPrice = safeNumber(currentVariant?.salePrice ?? currentProduct.salePrice ?? item.unitPrice, 0);
        const unitCost = safeNumber(currentVariant?.costPrice ?? currentProduct.costPrice ?? item.unitCost, 0);

        if (itemQuantity <= 0) throw new Error(`Quantidade invalida: ${item.productName}`);
        if (itemQuantity > availableStock) throw new Error(`Estoque insuficiente: ${item.productName}`);
        if (unitPrice <= 0) throw new Error(`Preco de venda invalido: ${item.productName}`);
        if (unitCost < 0) throw new Error(`Custo invalido: ${item.productName}`);

        const saved = await registerSale({
          productId: item.productId,
          variantId: item.variantId,
          quantity: itemQuantity,
          userId: user?.id,
          reason: 'Venda',
          notes: '',
          customerName: saleCustomerName,
          paymentStatus: status,
          paymentMethod: status === 'paid' ? paymentMethod : null,
          saleGroupId,
        });

        if (!saved) throw new Error(`Falha ao registrar venda: ${item.productName}`);

        const updatedProduct = getProducts().find(product => product.id === item.productId) || currentProduct;
        const updatedVariant = item.variantId ? updatedProduct.variants.find(variant => variant.id === item.variantId) : undefined;

        if (shouldSyncCatalogStock(updatedProduct)) {
          try {
            await syncCatalogStockAfterSale(updatedProduct, updatedVariant, itemQuantity, saved);
          } catch (syncError: any) {
            catalogSyncError = syncError?.message || CATALOG_STOCK_SYNC_WARNING;
            console.error('[CATALOG STOCK SYNC ERROR]', {
              productId: updatedProduct.id,
              productName: updatedProduct.name,
              variantId: updatedVariant?.id || item.variantId || null,
              size: updatedVariant?.size || item.size || null,
              color: updatedVariant?.color || item.color || null,
              message: catalogSyncError,
              details: syncError?.details || null,
            });
          }
        }
      }

      if (catalogSyncError) {
        toast.error(`${CATALOG_STOCK_SYNC_WARNING} Motivo: ${catalogSyncError}`);
      } else {
        toast.success(status === 'pending' ? 'Venda pendente registrada' : 'Venda registrada');
      }
      clearSale();
      useStore.setState({
        products: getProducts(),
        movements: getMovements(),
        alerts: getAlerts(),
      });
    } catch (err: any) {
      console.error('Erro ao registrar venda', { cartItems, err });
      toast.error(err?.message || 'Nao foi possivel registrar a venda no banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const paymentOptions = [
    { id: 'card' as const, label: 'Cartao', icon: <CreditCard size={16} /> },
    { id: 'pix' as const, label: 'Pix', icon: <QrCode size={16} /> },
    { id: 'cash' as const, label: 'Dinheiro', icon: <Banknote size={16} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#080912]">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[
            { label: 'Vendas Hoje', value: formatBRL(totals.total), icon: <DollarSign size={18} />, accent: 'from-violet-500 to-fuchsia-500', width: 'w-4/5' },
            { label: 'Lucro Hoje', value: formatBRL(totals.profit), icon: <ShoppingBag size={18} />, accent: 'from-emerald-400 to-teal-500', width: 'w-3/5' },
            { label: 'Ticket Medio', value: formatBRL(totals.transactions > 0 ? (totals.total / totals.transactions) : 0), icon: <CreditCard size={18} />, accent: 'from-sky-400 to-indigo-500', width: 'w-2/5' },
          ].map(metric => (
            <Card key={metric.label} className="overflow-hidden border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">{metric.label}</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/70">
                  {metric.icon}
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold text-white">{metric.value}</p>
              <div className="mt-5 h-1.5 rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full bg-gradient-to-r ${metric.accent} ${metric.width}`} />
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/70">Produtos frequentes</p>
                <h2 className="text-lg font-semibold text-white">Escolha um produto</h2>
              </div>
              <div className="relative w-full md:max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar produto" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/60 focus:bg-white/[0.06]" />
              </div>
            </div>

            <div className="max-h-[72vh] overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(139,92,246,0.35)_transparent] [scrollbar-width:thin] xl:max-h-[calc(100vh-22rem)]">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {productCards.map(({ product, variants, quantity: stock, price }) => {
                  const selectedVariantId = selectedVariantsByProduct[product.id];
                  const active = productId === product.id;
                  const image = getProductImage(product);
                  const availableVariants = variants.filter((variant: any) => safeNumber(variant.quantity, 0) > 0);
                  const selectedCardVariant = getSelectedVariantForProduct(product);
                  const displayPrice = safeNumber(selectedCardVariant?.salePrice ?? price, 0);
                  return (
                    <div key={product.id} className={`group overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-300/50 hover:bg-white/[0.07] ${active ? 'border-violet-400/70 bg-violet-500/10' : 'border-white/10 bg-white/[0.035]'}`}>
                      <button type="button" onClick={() => addProductToCart(product)} className="block w-full text-left">
                        <div className="aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                          {image ? <img src={image} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/15">{(product.name || 'P').slice(0, 1)}</div>}
                        </div>
                        <div className="mt-3 space-y-1">
                          <p className="line-clamp-1 text-sm font-semibold text-white">{product.name}</p>
                          <p className="line-clamp-1 text-xs text-white/40">{selectedCardVariant ? `${selectedCardVariant.size} - ${selectedCardVariant.color}` : product.brand?.name || 'Produto padrao'}</p>
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-sm font-bold text-violet-200">{formatBRL(displayPrice)}</span>
                            <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/40">{stock} un.</span>
                          </div>
                        </div>
                      </button>
                      {variants.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {variants.map((variant: any) => {
                            const disabled = safeNumber(variant.quantity, 0) <= 0;
                            const selected = (selectedVariantId || availableVariants[0]?.id) === variant.id;
                            return (
                              <button key={variant.id} type="button" disabled={disabled} onClick={() => setSelectedVariantsByProduct(current => ({ ...current, [product.id]: variant.id }))} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${selected ? 'border-violet-300/70 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.035] text-white/45 hover:bg-white/[0.07]'} ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}>
                                {[variant.size, variant.color].filter(Boolean).join(' - ') || 'Padrao'}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {productCards.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/35">Nenhum produto disponivel para venda.</div>}
              </div>
            </div>
          </Card>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <Card className="border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/70">Resumo</p>
                  <h2 className="text-lg font-semibold text-white">Checkout</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/40">{cartTotals.totalItems} itens</span>
              </div>

              <div className="max-h-[360px] min-h-[156px] space-y-3 overflow-y-auto pr-1">
                {cartItems.length > 0 ? cartItems.map(item => (
                  <div key={item.cartItemId} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white/20">{item.productName.slice(0, 1)}</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{item.productName}</p>
                            <p className="text-xs text-white/35">{item.variantName}</p>
                            <p className="mt-1 text-sm font-semibold text-violet-200">{formatBRL(item.unitPrice)}</p>
                          </div>
                          <button type="button" onClick={() => removeCartItem(item.cartItemId)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/15"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1">
                        <button type="button" onClick={() => updateCartItemQuantity(item.cartItemId, item.quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"><Minus size={14} /></button>
                        <span className="w-9 text-center text-sm font-semibold text-white">{item.quantity}</span>
                        <button type="button" onClick={() => updateCartItemQuantity(item.cartItemId, item.quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"><Plus size={14} /></button>
                      </div>
                      <p className="text-sm font-semibold text-white">{formatBRL(item.quantity * item.unitPrice)}</p>
                    </div>
                  </div>
                )) : <div className="flex min-h-[156px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-sm text-white/35">Adicione produtos ao carrinho.</div>}
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Valor total</span>
                  <span className="text-2xl font-bold text-white">{formatBRL(cartTotals.totalAmount)}</span>
                </div>
                <label className="mb-4 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Cliente</span>
                  <input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/60 focus:bg-white/[0.06]"
                  />
                </label>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  {paymentOptions.map(option => <button key={option.id} type="button" onClick={() => setPaymentMethod(option.id)} className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${paymentMethod === option.id ? 'border-violet-400/70 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.06]'}`}>{option.icon}{option.label}</button>)}
                </div>
                <Button variant="primary" className="mt-5 w-full justify-center bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold uppercase tracking-[0.12em]" onClick={() => handleCreateSale('paid')} loading={loading}>Finalizar venda</Button>
                <Button variant="secondary" className="mt-3 w-full justify-center py-3 text-sm font-bold uppercase tracking-[0.12em]" onClick={() => handleCreateSale('pending')} loading={loading}>Registrar como pendente</Button>
                <Button variant="outline" className="mt-3 w-full justify-center border-white/15 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/70" onClick={clearSale}>Limpar venda</Button>
              </div>
            </Card>
          </aside>
        </div>

        <Card className="border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/70">Historico</p>
              <h3 className="text-lg font-semibold text-white">Vendas de hoje</h3>
            </div>
            <p className="text-xs text-white/35">{todaysSales.length} registros</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[0.8fr_1.4fr_1fr_0.8fr_1fr_48px] gap-3 bg-white/[0.04] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">
              <span>Tempo</span><span>Cliente</span><span>Total</span><span>Itens</span><span>Status</span><span />
            </div>
            <div className="divide-y divide-white/10">
              {todaysSales.map((sale: any) => {
                const values = movementTotals(sale);
                return (
                  <div key={sale.id} className="grid grid-cols-[0.8fr_1.4fr_1fr_0.8fr_1fr_48px] items-center gap-3 px-4 py-3 text-sm text-white/70">
                    <span className="text-white/45">{format(new Date(sale.createdAt), 'HH:mm')}</span>
                    <span className="truncate">{displayCustomerName(sale.customerName ?? sale.customer_name)}</span>
                    <span className="font-semibold text-white">{formatBRL(values.totalAmount)}</span>
                    <span>{values.qty}</span>
                    <span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(sale.paymentStatus || 'paid') === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{(sale.paymentStatus || 'paid') === 'pending' ? 'PENDENTE' : 'PAGO'}</span></span>
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl text-red-300 transition hover:bg-red-500/15" onClick={async () => { try { const removed = await removeMovement(sale.id); if (removed) toast.success('Movimentacao removida'); } catch (error) { console.error('[SUPABASE MOVEMENT DELETE ERROR]', error); toast.error('Nao foi possivel remover a movimentacao no banco de dados.'); } }}><Trash2 size={15} /></button>
                  </div>
                );
              })}
              {todaysSales.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/35">Nenhuma venda registrada hoje.</div>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default CashierPage;




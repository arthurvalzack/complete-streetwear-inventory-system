import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { DollarSign, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { registerSale } from '../lib/database';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';

export function CashierPage() {
  const { products, movements, addMovement, removeMovement, user } = useStore();
  const [productId, setProductId] = useState<string>('');
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);

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
        return m.createdAt.startsWith(today) && isSale(m);
      }
    });
  }, [movements]);

  const totals = useMemo(() => {
    let total = 0;
    let profit = 0;
    let items = 0;
    todaysSales.forEach((m: any) => {
      const qty = Number(m.quantity) || 0;
      const salePrice = Number(m.unitPrice ?? m.variant?.salePrice ?? m.product?.salePrice ?? 0) || 0;
      const costPrice = Number(m.costPrice ?? m.variant?.costPrice ?? m.product?.costPrice ?? 0) || 0;
      const movementTotal = Number(m.totalValue ?? (salePrice * qty)) || 0;
      total += movementTotal;
      profit += (movementTotal - (costPrice * qty));
      items += qty;
    });
    return { total, profit, items, transactions: todaysSales.length };
  }, [todaysSales]);

  const selectedProduct = products.find(p => p.id === productId);

  const handleCreateSale = async () => {
    if (!productId) return toast.error('Selecione um produto');
    if (!quantity || quantity <= 0) return toast.error('Quantidade inválida');
    setLoading(true);
    try {
      // validate stock availability and pricing
      const prod = products.find(p => p.id === productId);
      if (!prod) { toast.error('Produto não encontrado'); setLoading(false); return; }
      const variant = variantId ? prod.variants.find(v => v.id === variantId) : undefined;
      const availableStock = variant ? Number(variant.quantity || 0) : Number(prod.totalQuantity || 0);
      if (quantity > availableStock) { toast.error('Quantidade maior que o estoque disponível'); setLoading(false); return; }
      const unitPrice = variant?.salePrice ?? prod.salePrice ?? 0;
      const costPrice = variant?.costPrice ?? prod.costPrice ?? 0;
      if (!unitPrice || Number(unitPrice) <= 0) { toast.error('Preço de venda inválido'); setLoading(false); return; }

      // call central registerSale which ensures transactional consistency with Supabase
      try {
        const saved = await registerSale({ productId, variantId, quantity, userId: user?.id, reason: 'Venda', notes: '' });
        if (saved) {
          toast.success('Venda registrada');
          setQuantity(1);
          setProductId('');
          setVariantId(undefined);
          // refresh local state from storage/remote
          try { useStore.getState().loadData(); } catch (_) { /* ignore */ }
        } else {
          toast.error('Falha ao registrar venda');
        }
      } catch (err: any) {
        // detailed debug
        console.error('Erro ao registrar venda', { selectedProduct: prod, selectedVariant: variant, quantity, availableStock, unitPrice, totalValue: (unitPrice * quantity), movementPayload: { productId, variantId, quantity, unitPrice, costPrice }, err });
        toast.error('Não foi possível registrar a venda no banco de dados.');
      }
    } catch (e) {
      toast.error('Erro ao processar venda');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'date', header: 'Data', render: (m: any) => format(new Date(m.createdAt), "dd/MM/yyyy HH:mm") },
    { key: 'product', header: 'Produto', render: (m: any) => m.product?.name || '—' },
    { key: 'qty', header: 'Qtd', render: (m: any) => m.quantity },
    { key: 'sale', header: 'Valor unit.', render: (m: any) => `R$ ${(Number(m.unitPrice || (m.variant?.salePrice ?? m.product?.salePrice) )).toFixed(2).replace('.', ',')}` },
    { key: 'cost', header: 'Valor custo', render: (m: any) => `R$ ${(Number(m.costPrice || (m.variant?.costPrice ?? m.product?.costPrice) )).toFixed(2).replace('.', ',')}` },
    { key: 'total', header: 'Total', render: (m: any) => `R$ ${((Number(m.totalValue) || (Number(m.unitPrice || 0) * m.quantity))).toFixed(2).replace('.', ',')}` },
    { key: 'actions', header: '', render: (m: any) => (
      <div className="flex items-center gap-2">
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => { removeMovement(m.id); toast.success('Movimentação removida'); }}>
          Remover
        </Button>
      </div>
    ), width: '200px' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Caixa</h1>
            <p className="text-sm text-white/40">Controle rápido de vendas do dia</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/40 uppercase">Vendas hoje</p>
              <DollarSign size={18} className="text-white/20" />
            </div>
            <p className="text-2xl font-bold text-white">R$ {totals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/30 mt-2">Total vendido hoje</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/40 uppercase">Lucro hoje</p>
              <ShoppingBag size={18} className="text-white/20" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">R$ {totals.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/30 mt-2">Lucro gerado hoje</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/40 uppercase">Ticket médio</p>
              <ShoppingBag size={18} className="text-white/20" />
            </div>
            <p className="text-2xl font-bold text-white">R$ {(totals.transactions > 0 ? (totals.total / totals.transactions) : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/30 mt-2">Valor médio por venda</p>
          </Card>
        </div>

        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Registrar venda</h3>
            <p className="text-xs text-white/30">Selecione produto, variante e quantidade</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-white/40">Produto</label>
              <select value={productId} onChange={e => { setProductId(e.target.value); setVariantId(undefined); }} className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm text-white/70 bg-white/5">
                <option value="">-- selecione --</option>
                {products.map(p => (<option key={p.id} value={p.id}>{p.name} — {p.brand?.name || ''}</option>))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/40">Variante</label>
              <select value={variantId} onChange={e => setVariantId(e.target.value || undefined)} className="input-dark w-full rounded-xl px-3.5 py-2.5 text-sm text-white/70 bg-white/5">
                <option value="">-- padrão --</option>
                {selectedProduct?.variants.map(v => (
                  <option key={v.id} value={v.id}>{v.size} · {v.color} · {v.quantity} un.</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/40">Quantidade</label>
              <Input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleCreateSale} loading={loading}>Registrar venda</Button>
            <Button variant="outline" onClick={() => { setProductId(''); setVariantId(undefined); setQuantity(1); }}>Limpar</Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Vendas de hoje</h3>
            <p className="text-xs text-white/30">{todaysSales.length} movimentações</p>
          </div>
          <Table
            columns={columns}
            data={todaysSales}
            keyExtractor={(m: any) => m.id}
            emptyMessage="Nenhuma venda hoje"
          />
        </Card>
      </div>
    </div>
  );
}

export default CashierPage;

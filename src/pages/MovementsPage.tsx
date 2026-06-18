import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, ArrowUpRight, ArrowDownRight, Activity,
  ArrowLeftRight, Trash2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select, Input } from '../components/ui/Input';
import { Table, Pagination } from '../components/ui/Table';
import { StockMovement } from '../types';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 15;

function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function displayCustomerName(value: any): string {
  const name = String(value || '').trim();
  return name || 'Cliente n�o informado';
}

const movementTypeConfig = {
  entry: { label: 'Entrada', variant: 'success' as const, icon: <ArrowUpRight size={14} />, color: 'rgba(16,185,129,0.15)', textColor: '#34d399' },
  exit: { label: 'Saída', variant: 'danger' as const, icon: <ArrowDownRight size={14} />, color: 'rgba(239,68,68,0.15)', textColor: '#f87171' },
  adjustment: { label: 'Ajuste', variant: 'warning' as const, icon: <Activity size={14} />, color: 'rgba(245,158,11,0.15)', textColor: '#fbbf24' },
  transfer: { label: 'Transferência', variant: 'info' as const, icon: <ArrowLeftRight size={14} />, color: 'rgba(59,130,246,0.15)', textColor: '#60a5fa' },
  return: { label: 'Devolução', variant: 'purple' as const, icon: <ArrowUpRight size={14} />, color: 'rgba(168,85,247,0.15)', textColor: '#c084fc' },
};

export function MovementsPage() {
  const { products, movements, addMovement, user, currentPage, setCurrentPage } = useStore();

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  const [form, setForm] = useState({
    productId: '',
    variantId: '',
    type: 'entry' as StockMovement['type'],
    quantity: 1,
    reason: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.productId),
    [products, form.productId]
  );

  const filteredMovements = useMemo(() => {
    let result = [...movements];
    if (typeFilter) result = result.filter(m => m.type === typeFilter);
    if (productFilter) result = result.filter(m => m.productId === productFilter);
    return result;
  }, [movements, typeFilter, productFilter]);

  const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE);
  const paginated = filteredMovements.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.productId) errors.productId = 'Selecione um produto';
    if (form.quantity <= 0) errors.quantity = 'Quantidade deve ser maior que zero';
    if (!form.reason.trim()) errors.reason = 'Motivo é obrigatório';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const result = addMovement({
      productId: form.productId,
      variantId: form.variantId || undefined,
      type: form.type,
      quantity: Number(form.quantity),
      reason: form.reason,
      notes: form.notes,
      userId: user?.id || '',
      product: selectedProduct,
      variant: selectedProduct?.variants.find(v => v.id === form.variantId),
    });
    setLoading(false);
    if (result) {
      toast.success(`Movimentação de ${movementTypeConfig[form.type].label} registrada!`);
      setShowModal(false);
      setForm({ productId: '', variantId: '', type: 'entry', quantity: 1, reason: '', notes: '' });
    } else {
      toast.error('Erro ao registrar movimentação');
    }
  };

  const columns = [
    {
      key: 'type',
      header: 'Tipo',
      render: (m: StockMovement) => {
        const config = movementTypeConfig[m.type] || movementTypeConfig.exit;
        return (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: config.color }}>
              <span style={{ color: config.textColor }}>{config.icon}</span>
            </div>
            <Badge variant={config.variant} size="sm">{config.label}</Badge>
          </div>
        );
      },
    },
    {
      key: 'product',
      header: 'Produto',
      render: (m: StockMovement) => (
        <div>
          <p className="text-sm text-white/80 font-medium">{m.product?.name || m.productName || 'Produto nao encontrado'}</p>
          <p className="text-xs text-white/35">Cliente: {displayCustomerName(m.customerName ?? (m as any).customer_name)}</p>
          {m.variant && (
            <p className="text-xs text-white/30">{m.variant.size} · {m.variant.color}</p>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantidade',
      render: (m: StockMovement) => {
        const sign = m.type === 'exit' ? '-' : m.type === 'entry' || m.type === 'return' ? '+' : '±';
        const color = m.type === 'exit' ? 'text-red-400' : m.type === 'entry' ? 'text-emerald-400' : 'text-amber-400';
        return (
          <div>
            <span className={`font-semibold text-sm ${color}`}>
              {sign}{m.quantity}
            </span>
            <p className="text-xs text-white/25">
              {m.previousQuantity} → {m.newQuantity}
            </p>
          </div>
        );
      },
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (m: StockMovement) => (
        <div>
          <p className="text-sm text-white/70">{m.reason}</p>
          {m.notes && <p className="text-xs text-white/25 truncate max-w-[200px]">{m.notes}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Data',
      render: (m: StockMovement) => (
        <div className="text-right">
          <p className="text-xs text-white/50">
            {format(parseISO(m.createdAt), 'dd/MM/yyyy')}
          </p>
          <p className="text-xs text-white/25">
            {format(parseISO(m.createdAt), 'HH:mm')}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (m: StockMovement) => (
        <button
          onClick={async () => {
            if (confirm('Tem certeza que deseja excluir esta movimentação?')) {
              try {
                const removed = await useStore.getState().removeMovement(m.id);
                if (removed) toast.success('Movimentação excluída com sucesso!');
              } catch (error) {
                console.error('[SUPABASE MOVEMENT DELETE ERROR]', error);
                toast.error('Não foi possível excluir a movimentação no banco de dados.');
              }
            }
          }}
          className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
          title="Excluir movimentação"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  // Summary stats
  const stats = useMemo(() => {
    const total = movements.length;
    const entries = movements.filter(m => m.type === 'entry').reduce((acc, m) => acc + safeNumber(m.quantity, 0), 0);
    const exits = movements.filter(m => m.type === 'exit').reduce((acc, m) => acc + safeNumber(m.quantity, 0), 0);
    const adjustments = movements.filter(m => m.type === 'adjustment').length;
    return { total, entries, exits, adjustments };
  }, [movements]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total de Movimentações', value: stats.total, color: '#818cf8' },
          { label: 'Unidades Entradas', value: stats.entries, color: '#34d399' },
          { label: 'Unidades Saídas', value: stats.exits, color: '#f87171' },
          { label: 'Ajustes Realizados', value: stats.adjustments, color: '#fbbf24' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-4"
          >
            <p className="text-xs text-white/30 font-medium">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
          </motion.div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="input-dark text-sm rounded-xl px-3 py-2"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(movementTypeConfig).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            className="input-dark text-sm rounded-xl px-3 py-2 max-w-[200px]"
          >
            <option value="">Todos os produtos</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setShowModal(true)}
        >
          Nova Movimentação
        </Button>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <Table
          columns={columns}
          data={paginated}
          keyExtractor={m => m.id}
          emptyMessage="Nenhuma movimentação registrada"
          emptyIcon={<ArrowLeftRight size={32} />}
        />
        {filteredMovements.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredMovements.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        )}
      </motion.div>

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Nova Movimentação"
        subtitle="Registre entrada, saída ou ajuste de estoque"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={handleSubmit}>
              Registrar Movimentação
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">
              Tipo de Movimentação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(movementTypeConfig).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setForm(prev => ({ ...prev, type: key as StockMovement['type'] }))}
                  className={`p-3 rounded-xl border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                    form.type === key
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/70'
                  }`}
                >
                  <span style={{ color: config.textColor }}>{config.icon}</span>
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Produto"
            value={form.productId}
            onChange={e => setForm(prev => ({ ...prev, productId: e.target.value, variantId: '' }))}
            options={products.map(p => ({ value: p.id, label: `${p.name} (${p.totalQuantity} un.)` }))}
            placeholder="Selecione o produto"
            error={formErrors.productId}
          />

          {selectedProduct && selectedProduct.variants.length > 0 && (
            <Select
              label="Variação (opcional)"
              value={form.variantId}
              onChange={e => setForm(prev => ({ ...prev, variantId: e.target.value }))}
              options={selectedProduct.variants.map(v => ({
                value: v.id,
                label: `${v.size} / ${v.color} — ${v.quantity} un.`
              }))}
              placeholder="Todas as variações"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Quantidade"
              type="number"
              value={form.quantity}
              onChange={e => setForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
              min="1"
              error={formErrors.quantity}
            />
            <div />
          </div>

          <Input
            label="Motivo"
            value={form.reason}
            onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="Ex: Compra fornecedor, Venda balcão..."
            error={formErrors.reason}
          />

          <Input
            label="Observações (opcional)"
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Informações adicionais..."
          />

          {/* Preview */}
          {selectedProduct && form.quantity > 0 && (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-xs text-white/30 mb-1">Preview da movimentação</p>
              <p className="text-sm text-white/70">
                <span className="font-medium text-white">{selectedProduct.name}</span>
                {' → '}
                <span className="text-white/40">{selectedProduct.totalQuantity} un.</span>
                {' '}
                {form.type === 'entry' || form.type === 'return' ? (
                  <span className="text-emerald-400 font-semibold">+{form.quantity} = {selectedProduct.totalQuantity + form.quantity}</span>
                ) : form.type === 'exit' ? (
                  <span className="text-red-400 font-semibold">-{form.quantity} = {Math.max(0, selectedProduct.totalQuantity - form.quantity)}</span>
                ) : (
                  <span className="text-amber-400 font-semibold">= {form.quantity}</span>
                )}
                {' un.'}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}


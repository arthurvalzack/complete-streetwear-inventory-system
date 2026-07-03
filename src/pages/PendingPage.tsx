import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, isValid, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { Banknote, CheckCircle2, Clock3, CreditCard, Package, QrCode, User } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useStore } from '../store/useStore';
import { StockMovement } from '../types';

function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatBRL(value: any): string {
  return safeNumber(value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function displayField(value: any, fallback = 'Nao informado'): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function getMovementDate(movement: StockMovement): Date {
  const raw = movement.createdAt || (movement as any).created_at;
  try {
    const parsed = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
    return isValid(parsed) ? parsed : new Date();
  } catch {
    return new Date();
  }
}

function movementAmounts(movement: StockMovement) {
  const quantity = safeNumber(movement.quantity, 0);
  const unitPrice = safeNumber(movement.unitPrice ?? (movement as any).unit_price ?? movement.variant?.salePrice ?? movement.product?.salePrice, 0);
  const subtotal = safeNumber(movement.subtotalAmount ?? (movement as any).subtotal_amount, unitPrice * quantity);
  const discount = safeNumber(movement.discountAmount ?? (movement as any).discount_amount, 0);
  const final = safeNumber(movement.finalAmount ?? (movement as any).final_amount ?? movement.totalAmount ?? (movement as any).total_amount ?? movement.totalValue, subtotal - discount);
  return { subtotal, discount, final };
}

function getVariantLabel(movement: StockMovement): string {
  return displayField(
    movement.variantLabel ||
    (movement as any).variant_label ||
    movement.variantName ||
    (movement as any).variant_name ||
    (movement.variant ? [movement.variant.size, movement.variant.color].filter(Boolean).join(' - ') : ''),
    ''
  );
}

const paymentOptions = [
  { id: 'Pix', label: 'Pix', icon: <QrCode size={16} /> },
  { id: 'Cartao', label: 'Cartao', icon: <CreditCard size={16} /> },
  { id: 'Dinheiro', label: 'Dinheiro', icon: <Banknote size={16} /> },
];

export function PendingPage() {
  const { movements, markMovementPaid } = useStore();
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [loading, setLoading] = useState(false);

  const pendingMovements = useMemo(() => {
    return movements
      .filter((movement: any) => (movement.paymentStatus ?? movement.payment_status ?? 'paid') === 'pending')
      .sort((a, b) => getMovementDate(b).getTime() - getMovementDate(a).getTime());
  }, [movements]);

  const pendingTotal = useMemo(() => {
    return pendingMovements.reduce((acc, movement) => acc + movementAmounts(movement).final, 0);
  }, [pendingMovements]);

  const handleConfirmPayment = async () => {
    if (!selectedMovement) return;
    setLoading(true);
    try {
      await markMovementPaid(selectedMovement.id, paymentMethod);
      toast.success('Venda marcada como paga!');
      setSelectedMovement(null);
    } catch (error: any) {
      console.error('[PENDING PAYMENT UPDATE ERROR]', error);
      toast.error(error?.message || 'Nao foi possivel marcar a venda como paga.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#080912] p-6">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: 'Vendas pendentes', value: pendingMovements.length.toLocaleString('pt-BR'), color: '#f59e0b' },
            { label: 'Valor aguardando', value: formatBRL(pendingTotal), color: '#818cf8' },
            { label: 'Status', value: pendingMovements.length > 0 ? 'A receber' : 'Em dia', color: pendingMovements.length > 0 ? '#fbbf24' : '#34d399' },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass rounded-2xl border border-white/10 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {pendingMovements.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-white/10 p-8 text-center"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 size={26} />
            </div>
            <h2 className="text-lg font-semibold text-white">Nenhuma venda pendente no momento.</h2>
            <p className="mt-2 max-w-md text-sm text-white/35">Vendas registradas como pendentes no Caixa aparecerao aqui para baixa de pagamento.</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {pendingMovements.map((movement, index) => {
              const amounts = movementAmounts(movement);
              const variantLabel = getVariantLabel(movement);
              const movementDate = getMovementDate(movement);
              return (
                <motion.div
                  key={movement.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-lg shadow-black/15 backdrop-blur-xl"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant="warning" size="sm">PENDENTE</Badge>
                        <span className="inline-flex items-center gap-1.5 text-xs text-white/35">
                          <Clock3 size={12} />
                          {format(movementDate, 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1.1fr_1.4fr_0.8fr]">
                        <div className="min-w-0">
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">
                            <User size={12} />
                            Cliente
                          </p>
                          <p className="truncate text-sm font-semibold text-white">{displayField(movement.customerName ?? (movement as any).customer_name, 'Cliente nao informado')}</p>
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">
                            <Package size={12} />
                            Produto
                          </p>
                          <p className="truncate text-sm font-semibold text-white">{movement.product?.name || movement.productName || (movement as any).product_name || movement.productId}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/35">
                            <span>Tamanho: {displayField(movement.size || movement.variant?.size)}</span>
                            <span>Cor: {displayField(movement.color || movement.variant?.color)}</span>
                            {variantLabel && <span>Variacao: {variantLabel}</span>}
                          </div>
                        </div>

                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/30">Quantidade</p>
                          <p className="text-sm font-semibold text-white">{safeNumber(movement.quantity, 0).toLocaleString('pt-BR')} un.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:flex-shrink-0">
                      <div className="min-w-[180px] rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between text-xs text-white/35">
                          <span>Desconto</span>
                          <span>{amounts.discount > 0 ? formatBRL(amounts.discount) : 'Sem desconto'}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Valor final</span>
                          <span className="text-lg font-bold text-white">{formatBRL(amounts.final)}</span>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        icon={<CheckCircle2 size={16} />}
                        className="h-12 whitespace-nowrap"
                        onClick={() => {
                          setPaymentMethod('Pix');
                          setSelectedMovement(movement);
                        }}
                      >
                        Marcar como pago
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!selectedMovement}
        onClose={() => setSelectedMovement(null)}
        title="Marcar como pago"
        subtitle="Selecione a forma de pagamento recebida."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedMovement(null)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={handleConfirmPayment}>Confirmar pagamento</Button>
          </>
        }
      >
        <div className="space-y-2">
          {paymentOptions.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPaymentMethod(option.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                paymentMethod === option.id
                  ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {option.icon}
              <span className="text-sm font-semibold">{option.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default PendingPage;

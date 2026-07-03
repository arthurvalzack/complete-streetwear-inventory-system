import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, isValid, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Download, Edit2, ExternalLink, FileText, Plus, Receipt, Settings, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { CashOutflow } from '../types';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';

type PeriodFilter = 'general' | 'date' | 'month';

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartao', 'Transferencia', 'Outro'];

function safeNumber(value: any, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatBRL(value: any): string {
  return safeNumber(value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toDateInput(value: string): string {
  const parsed = value ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime()) ? format(parsed, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
}

function parseOutflowDate(outflow: CashOutflow): Date | null {
  const parsed = typeof outflow.outflowDate === 'string' ? parseISO(outflow.outflowDate) : new Date(outflow.outflowDate);
  return isValid(parsed) ? parsed : null;
}

const emptyForm = {
  description: '',
  amount: '',
  categoryId: '',
  paymentMethod: 'Pix',
  outflowDate: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
  removeReceipt: false,
};

export function CashOutflowsPage() {
  const {
    cashOutflows,
    cashOutflowCategories,
    addCashOutflow,
    editCashOutflow,
    removeCashOutflow,
    addCashOutflowCategory,
    editCashOutflowCategory,
    removeCashOutflowCategory,
    uploadOutflowReceipt,
  } = useStore();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('general');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CashOutflow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<CashOutflow | null>(null);

  const activeCategories = useMemo(
    () => cashOutflowCategories.filter(category => category.isActive),
    [cashOutflowCategories]
  );

  const activePeriod = useMemo(() => {
    if (periodFilter === 'date') {
      const parsed = parseISO(selectedDate);
      if (!isValid(parsed)) return null;
      return { start: startOfDay(parsed), end: endOfDay(parsed), label: format(parsed, 'dd/MM/yyyy') };
    }
    if (periodFilter === 'month') {
      const parsed = parseISO(`${selectedMonth}-01`);
      if (!isValid(parsed)) return null;
      return { start: startOfMonth(parsed), end: endOfMonth(parsed), label: format(parsed, 'MM/yyyy') };
    }
    return { start: null, end: null, label: 'Geral' };
  }, [periodFilter, selectedDate, selectedMonth]);

  const filteredOutflows = useMemo(() => {
    if (!activePeriod?.start || !activePeriod?.end) return cashOutflows;
    return cashOutflows.filter(outflow => {
      const date = parseOutflowDate(outflow);
      return !!date && date >= activePeriod.start! && date <= activePeriod.end!;
    });
  }, [activePeriod, cashOutflows]);

  const summary = useMemo(() => {
    const total = filteredOutflows.reduce((acc, outflow) => acc + safeNumber(outflow.amount, 0), 0);
    const largest = filteredOutflows.reduce<CashOutflow | null>((max, outflow) => {
      if (!max || safeNumber(outflow.amount, 0) > safeNumber(max.amount, 0)) return outflow;
      return max;
    }, null);
    return { total, count: filteredOutflows.length, largest };
  }, [filteredOutflows]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setReceiptFile(null);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (outflow: CashOutflow) => {
    setEditing(outflow);
    setForm({
      description: outflow.description,
      amount: String(outflow.amount),
      categoryId: outflow.categoryId || '',
      paymentMethod: outflow.paymentMethod || 'Outro',
      outflowDate: toDateInput(outflow.outflowDate),
      notes: outflow.notes || '',
      removeReceipt: false,
    });
    setReceiptFile(null);
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const amount = safeNumber(form.amount, NaN);
    if (!form.description.trim()) errors.description = 'Descricao obrigatoria';
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Valor precisa ser maior que zero';
    if (!form.categoryId) errors.categoryId = 'Categoria obrigatoria';
    if (!form.paymentMethod) errors.paymentMethod = 'Forma obrigatoria';
    if (!form.outflowDate || !isValid(parseISO(form.outflowDate))) errors.outflowDate = 'Data invalida';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    const category = cashOutflowCategories.find(item => item.id === form.categoryId);
    if (!category) {
      setFormErrors({ categoryId: 'Categoria invalida' });
      return;
    }
    setSaving(true);
    try {
      const receipt = receiptFile ? await uploadOutflowReceipt(receiptFile) : {};
      const receiptRemoval = form.removeReceipt
        ? { receiptUrl: null, receiptFileName: null, receiptMimeType: null, receiptSize: null }
        : {};
      const payload = {
        description: form.description.trim(),
        amount: safeNumber(form.amount, 0),
        categoryId: category.id,
        categoryName: category.name,
        paymentMethod: form.paymentMethod,
        outflowDate: startOfDay(parseISO(form.outflowDate)).toISOString(),
        notes: form.notes.trim() || null,
        ...receiptRemoval,
        ...receipt,
      };
      if (editing) {
        await editCashOutflow(editing.id, payload);
        toast.success('Saida atualizada.');
      } else {
        await addCashOutflow(payload);
        toast.success('Saida registrada.');
      }
      setModalOpen(false);
    } catch (error: any) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      toast.error(error?.message || 'Nao foi possivel salvar a saida.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (outflow: CashOutflow) => {
    if (!confirm(`Excluir a saida "${outflow.description}"? Isso nao altera estoque.`)) return;
    try {
      await removeCashOutflow(outflow.id);
      toast.success('Saida excluida.');
    } catch (error: any) {
      console.error('[CASH OUTFLOW DELETE ERROR]', error);
      toast.error(error?.message || 'Nao foi possivel excluir a saida.');
    }
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategoryId) {
        await editCashOutflowCategory(editingCategoryId, { name: categoryName.trim() });
        setEditingCategoryId(null);
        toast.success('Categoria atualizada.');
      } else {
        await addCashOutflowCategory(categoryName);
        toast.success('Categoria adicionada.');
      }
      setCategoryName('');
    } catch (error: any) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      toast.error(error?.message || 'Nao foi possivel salvar a categoria.');
    }
  };

  const formatFileSize = (size?: number | null) => {
    const bytes = safeNumber(size, 0);
    if (bytes <= 0) return 'Tamanho nao informado';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageReceipt = (outflow: CashOutflow | null) => {
    const mime = String(outflow?.receiptMimeType || '').toLowerCase();
    const url = String(outflow?.receiptUrl || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)(\?|$)/.test(url);
  };

  const exportOutflowsCSV = () => {
    const headers = ['Data', 'Descricao', 'Categoria', 'Valor', 'Forma de pagamento', 'Observacao', 'Comprovante'];
    const rows = filteredOutflows.map(outflow => [
      parseOutflowDate(outflow) ? format(parseOutflowDate(outflow)!, 'dd/MM/yyyy') : '',
      outflow.description,
      outflow.categoryName,
      formatBRL(outflow.amount),
      outflow.paymentMethod,
      outflow.notes || '',
      outflow.receiptUrl || '',
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saidas-${activePeriod?.label || 'geral'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300/70">Financeiro</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Saídas</h1>
          <p className="text-sm text-white/35">Controle de dinheiro que saiu da loja</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Periodo"
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
            options={[
              { value: 'general', label: 'Geral' },
              { value: 'date', label: 'Data especifica' },
              { value: 'month', label: 'Mes inteiro' },
            ]}
          />
          {periodFilter === 'date' && <Input label="Data" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />}
          {periodFilter === 'month' && <Input label="Mes" type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />}
          <Button variant="outline" icon={<Download size={14} />} onClick={exportOutflowsCSV}>CSV</Button>
          <Button variant="outline" size="icon" icon={<Settings size={16} />} onClick={() => setSettingsOpen(true)} title="Configurações de Saídas" />
          <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>Nova saída</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: 'Total de saídas', value: formatBRL(summary.total), icon: <Wallet size={18} />, color: '#f87171' },
          { label: 'Quantidade', value: String(summary.count), icon: <Receipt size={18} />, color: '#818cf8' },
          { label: 'Maior saída', value: summary.largest ? formatBRL(summary.largest.amount) : 'R$ 0,00', icon: <Receipt size={18} />, color: '#fbbf24' },
        ].map((item, index) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${item.color}20`, color: item.color }}>{item.icon}</div>
              <div>
                <p className="text-xs text-white/35">{item.label}</p>
                <p className="text-lg font-bold text-white">{item.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Saídas cadastradas</h2>
              <p className="text-xs text-white/30">{filteredOutflows.length} registros no periodo</p>
            </div>
            <Badge variant="outline" size="sm">{activePeriod?.label || 'Geral'}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Data', 'Descricao', 'Categoria', 'Valor', 'Pagamento', 'Comprovante', ''].map(header => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-white/30">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOutflows.map(outflow => {
                  const date = parseOutflowDate(outflow);
                  return (
                    <tr key={outflow.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-3 text-sm text-white/45">{date ? format(date, 'dd/MM/yyyy') : '-'}</td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate text-sm font-medium text-white/80">{outflow.description}</p>
                        {outflow.notes && <p className="truncate text-xs text-white/30">{outflow.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60">{outflow.categoryName}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-300">{formatBRL(outflow.amount)}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{outflow.paymentMethod}</td>
                      <td className="px-4 py-3 text-sm">
                        {outflow.receiptUrl ? (
                          <button onClick={() => setReceiptPreview(outflow)} className="text-indigo-300 hover:text-indigo-200">Ver comprovante</button>
                        ) : (
                          <span className="text-white/25">Sem comprovante</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(outflow)} className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white" title="Editar"><Edit2 size={15} /></button>
                          <button onClick={() => handleDelete(outflow)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300" title="Excluir"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredOutflows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-white/35">Nenhuma saída encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Configurações de Saídas"
        subtitle="Gerencie categorias sem alterar o histórico financeiro"
        size="lg"
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="Nova categoria" className="h-10" />
            <Button variant="primary" onClick={handleSaveCategory}>{editingCategoryId ? 'Salvar' : 'Adicionar'}</Button>
            {editingCategoryId && (
              <Button variant="secondary" onClick={() => { setEditingCategoryId(null); setCategoryName(''); }}>Cancelar</Button>
            )}
          </div>
          <div className="space-y-2">
            {cashOutflowCategories.map(category => (
              <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <p className={`text-sm font-medium ${category.isActive ? 'text-white/75' : 'text-white/30'}`}>{category.name}</p>
                  {!category.isActive && <p className="text-xs text-white/25">Inativa no formulário, preservada no histórico</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white" title="Editar categoria"><Edit2 size={14} /></button>
                  {category.isActive && <button onClick={() => removeCashOutflowCategory(category.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10" title="Inativar categoria"><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!receiptPreview}
        onClose={() => setReceiptPreview(null)}
        title="Comprovante"
        size="xl"
      >
        {receiptPreview ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{receiptPreview.receiptFileName || 'Comprovante'}</p>
              <p className="mt-1 text-xs text-white/35">Tipo: {receiptPreview.receiptMimeType || 'Nao informado'}</p>
              <p className="text-xs text-white/35">Tamanho: {formatFileSize(receiptPreview.receiptSize)}</p>
            </div>
            {isImageReceipt(receiptPreview) ? (
              <div className="max-h-[62vh] overflow-auto rounded-xl border border-white/[0.06] bg-black/30 p-2">
                <img src={receiptPreview.receiptUrl || ''} alt={receiptPreview.receiptFileName || 'Comprovante'} className="mx-auto max-h-[58vh] max-w-full rounded-lg object-contain" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
                <FileText size={34} className="text-indigo-300" />
                <p className="mt-3 text-sm font-medium text-white">PDF anexado</p>
                <p className="mt-1 text-xs text-white/35">Abra ou baixe o PDF pelo botão abaixo.</p>
              </div>
            )}
            {receiptPreview.receiptUrl && (
              <div className="flex justify-end">
                <a href={receiptPreview.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/70 hover:border-white/30 hover:text-white">
                  <ExternalLink size={14} />
                  {isImageReceipt(receiptPreview) ? 'Abrir em nova guia' : 'Abrir PDF'}
                </a>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar saída' : 'Nova saída'}
        subtitle="Registre apenas o dinheiro que saiu, sem alterar estoque"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={handleSubmit}>Salvar saída</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Descricao" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} error={formErrors.description} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Valor" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} error={formErrors.amount} />
            <Input label="Data" type="date" value={form.outflowDate} onChange={e => setForm(prev => ({ ...prev, outflowDate: e.target.value }))} error={formErrors.outflowDate} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="Categoria" value={form.categoryId} onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value }))} options={activeCategories.map(category => ({ value: category.id, label: category.name }))} placeholder="Selecione" error={formErrors.categoryId} />
            <Select label="Forma de pagamento" value={form.paymentMethod} onChange={e => setForm(prev => ({ ...prev, paymentMethod: e.target.value }))} options={PAYMENT_METHODS.map(method => ({ value: method, label: method }))} error={formErrors.paymentMethod} />
          </div>
          <Textarea label="Observacao" rows={3} value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/50">Comprovante</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-200"
            />
            <p className="mt-1 text-xs text-white/25">JPG, PNG, WEBP ou PDF ate 5MB.</p>
            {editing?.receiptUrl && (
              <label className="mt-3 flex items-center gap-2 text-xs text-white/45">
                <input type="checkbox" checked={form.removeReceipt} onChange={e => setForm(prev => ({ ...prev, removeReceipt: e.target.checked }))} />
                Remover comprovante atual
              </label>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CashOutflowsPage;

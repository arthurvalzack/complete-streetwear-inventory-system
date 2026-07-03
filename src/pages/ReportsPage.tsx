import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download, FileText, FileSpreadsheet,
  TrendingUp, Package, DollarSign, BarChart3, Receipt
} from 'lucide-react';
import { endOfDay, endOfMonth, format, isValid, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import toast from 'react-hot-toast';
import { CashOutflow } from '../types';

type PeriodFilter = 'general' | 'date' | 'month';

function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function movementTotals(m: any) {
  const qty = safeNumber(m?.quantity, 0);
  const unitPrice = safeNumber(m?.unitPrice ?? m?.unit_price ?? m?.variant?.salePrice ?? m?.product?.salePrice, 0);
  const unitCost = safeNumber(m?.unitCost ?? m?.unit_cost ?? m?.costPrice ?? m?.cost_price ?? m?.variant?.costPrice ?? m?.variant?.cost ?? m?.product?.costPrice, 0);
  const subtotalAmount = safeNumber(m?.subtotalAmount ?? m?.subtotal_amount, unitPrice * qty);
  const discountAmount = safeNumber(m?.discountAmount ?? m?.discount_amount, 0);
  const totalAmount = safeNumber(m?.finalAmount ?? m?.final_amount ?? m?.totalAmount ?? m?.total_amount ?? m?.totalValue ?? m?.total_value, subtotalAmount - discountAmount);
  const totalCost = safeNumber(m?.totalCost ?? m?.total_cost, unitCost * qty);
  const totalProfit = safeNumber(m?.totalProfit ?? m?.total_profit ?? m?.profit, totalAmount - totalCost);
  return { qty, unitPrice, unitCost, subtotalAmount, discountAmount, totalAmount, totalCost, totalProfit };
}

function formatMoney(value: any): string {
  return safeNumber(value, 0).toFixed(2).replace('.', ',');
}

function formatBRL(value: any): string {
  return safeNumber(value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function displayCustomerName(value: any): string {
  const name = String(value || '').trim();
  return name || 'Cliente não informado';
}

function displayReportField(value: any): string {
  const text = String(value || '').trim();
  return text || 'Nao informado';
}

function getPaymentStatusLabel(movement: any): string {
  const status = movement?.paymentStatus ?? movement?.payment_status ?? 'paid';
  if (status === 'pending') return 'Pendente';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pago';
}

function getVariantLabel(movement: any): string {
  return displayReportField(
    movement?.variantLabel ||
    movement?.variant_label ||
    movement?.variantName ||
    movement?.variant_name ||
    (movement?.variant ? [movement.variant.size, movement.variant.color].filter(Boolean).join(' - ') : '')
  );
}

function parseMovementDate(movement: any): Date | null {
  const rawDate = movement?.createdAt ?? movement?.created_at;
  if (!rawDate) return null;
  const parsed = typeof rawDate === 'string' ? parseISO(rawDate) : new Date(rawDate);
  return isValid(parsed) ? parsed : null;
}

function parseFinancialMovementDate(movement: any): Date | null {
  const status = movement?.paymentStatus ?? movement?.payment_status ?? 'paid';
  const rawDate = status === 'paid'
    ? (movement?.paidAt ?? movement?.paid_at ?? movement?.createdAt ?? movement?.created_at)
    : (movement?.createdAt ?? movement?.created_at);
  if (!rawDate) return null;
  const parsed = typeof rawDate === 'string' ? parseISO(rawDate) : new Date(rawDate);
  return isValid(parsed) ? parsed : null;
}

function parseOutflowDate(outflow: CashOutflow): Date | null {
  const parsed = outflow.outflowDate ? parseISO(outflow.outflowDate) : null;
  return parsed && isValid(parsed) ? parsed : null;
}

function isSaleMovement(movement: any): boolean {
  const type = String(movement?.type || '').toLowerCase();
  const reason = String(movement?.reason || '').toLowerCase();
  return type === 'exit' || reason.includes('venda');
}

const typeMap: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  adjustment: 'Ajuste',
  transfer: 'Transferência',
  return: 'Devolução',
};

export function ReportsPage() {
  const { products, movements, cashOutflows } = useStore();
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('general');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const activePeriod = useMemo(() => {
    if (periodFilter === 'date') {
      const parsed = parseISO(selectedDate);
      if (!isValid(parsed)) return null;
      return {
        start: startOfDay(parsed),
        end: endOfDay(parsed),
        fileSuffix: selectedDate,
        label: `Data específica: ${format(parsed, 'dd/MM/yyyy')}`,
        pdfTitle: `Relatório de Vendas - ${format(parsed, 'dd/MM/yyyy')}`,
      };
    }

    if (periodFilter === 'month') {
      const parsed = parseISO(`${selectedMonth}-01`);
      if (!isValid(parsed)) return null;
      return {
        start: startOfMonth(parsed),
        end: endOfMonth(parsed),
        fileSuffix: `mes-${selectedMonth}`,
        label: `Mês inteiro: ${format(parsed, 'MM/yyyy')}`,
        pdfTitle: `Relatório Mensal de Vendas - ${format(parsed, 'MM/yyyy')}`,
      };
    }

    return {
      start: null,
      end: null,
      fileSuffix: 'geral',
      label: 'Geral',
      pdfTitle: 'Relatório Geral de Vendas',
    };
  }, [periodFilter, selectedDate, selectedMonth]);

  const filteredMovements = useMemo(() => {
    if (!activePeriod || !activePeriod.start || !activePeriod.end) return movements;
    return movements.filter(movement => {
      const movementDate = parseMovementDate(movement);
      if (!movementDate) return false;
      return movementDate >= activePeriod.start! && movementDate <= activePeriod.end!;
    });
  }, [activePeriod, movements]);

  const filteredSales = useMemo(
    () => filteredMovements.filter(isSaleMovement),
    [filteredMovements]
  );

  const paidSalesInPeriod = useMemo(() => {
    return movements.filter(movement => {
      if (!isSaleMovement(movement)) return false;
      const status = (movement as any).paymentStatus ?? (movement as any).payment_status ?? 'paid';
      if (status !== 'paid') return false;
      if (!activePeriod || !activePeriod.start || !activePeriod.end) return true;
      const date = parseFinancialMovementDate(movement);
      return !!date && date >= activePeriod.start && date <= activePeriod.end;
    });
  }, [activePeriod, movements]);

  const pendingSalesInPeriod = useMemo(() => {
    return movements.filter(movement => {
      if (!isSaleMovement(movement)) return false;
      const status = (movement as any).paymentStatus ?? (movement as any).payment_status ?? 'paid';
      if (status !== 'pending') return false;
      if (!activePeriod || !activePeriod.start || !activePeriod.end) return true;
      const date = parseMovementDate(movement);
      return !!date && date >= activePeriod.start && date <= activePeriod.end;
    });
  }, [activePeriod, movements]);

  const filteredOutflows = useMemo(() => {
    if (!activePeriod || !activePeriod.start || !activePeriod.end) return cashOutflows;
    return cashOutflows.filter(outflow => {
      const date = parseOutflowDate(outflow);
      return !!date && date >= activePeriod.start! && date <= activePeriod.end!;
    });
  }, [activePeriod, cashOutflows]);

  const filteredTotals = useMemo(() => {
    return paidSalesInPeriod.reduce(
      (acc, movement) => {
        const values = movementTotals(movement);
        acc.total += values.totalAmount;
        acc.cost += values.totalCost;
        acc.profit += values.totalProfit;
        acc.discount += values.discountAmount;
        acc.items += values.qty;
        return acc;
      },
      { total: 0, cost: 0, profit: 0, discount: 0, items: 0 }
    );
  }, [paidSalesInPeriod]);

  const totalPending = useMemo(
    () => pendingSalesInPeriod.reduce((acc, movement) => acc + movementTotals(movement).totalAmount, 0),
    [pendingSalesInPeriod]
  );

  const totalOutflows = useMemo(
    () => filteredOutflows.reduce((acc, outflow) => acc + safeNumber(outflow.amount, 0), 0),
    [filteredOutflows]
  );

  const finalBalance = filteredTotals.total - totalOutflows;

  const totalStock = products.reduce((acc, p) => acc + safeNumber(p.totalQuantity, 0), 0);

  const reportFilename = (base: string) => `${base}-${activePeriod?.fileSuffix || 'geral'}`;

  const generateCSV = (filename: string, headers: string[], rows: string[][]) => {
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSectionedCSV = (filename: string, sections: { title: string; headers: string[]; rows: string[][] }[]) => {
    const bom = '\uFEFF';
    const csv = bom + sections
      .flatMap(section => [[section.title], section.headers, ...section.rows, []])
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const outflowExportRows = () => filteredOutflows.map(outflow => {
    const date = parseOutflowDate(outflow);
    return [
      date ? format(date, 'dd/MM/yyyy') : '',
      outflow.description,
      outflow.categoryName,
      `R$ ${formatMoney(outflow.amount)}`,
      outflow.paymentMethod,
      outflow.notes || '',
      outflow.receiptUrl || '',
    ];
  });

  const exportProductsCSV = async () => {
    setLoadingReport('products_csv');
    await new Promise(r => setTimeout(r, 600));
    const headers = ['SKU', 'Nome', 'Marca', 'Categoria', 'Subcategoria', 'Estoque Total', 'Preço Custo', 'Preço Venda', 'Status', 'Tags', 'Criado em'];
    const rows = products.map(p => [
      p.sku,
      p.name,
      p.brand?.name || '',
      p.category?.name || '',
      p.subcategory?.name || '',
      String(p.totalQuantity),
      formatMoney(p.costPrice),
      formatMoney(p.salePrice),
      p.status,
      p.tags.join(', '),
      format(new Date(p.createdAt), 'dd/MM/yyyy HH:mm'),
    ]);
    generateCSV('produtos', headers, rows);
    setLoadingReport(null);
    toast.success('Relatório de produtos exportado!');
  };

  const exportVariantsCSV = async () => {
    setLoadingReport('variants_csv');
    await new Promise(r => setTimeout(r, 600));
    const headers = ['SKU Variação', 'SKU Produto', 'Produto', 'Marca', 'Tamanho', 'Cor', 'Quantidade', 'Preço Custo', 'Preço Venda'];
    const rows: string[][] = [];
    products.forEach(p => {
      p.variants.forEach(v => {
        rows.push([
          v.sku,
          p.sku,
          p.name,
          p.brand?.name || '',
          v.size,
          v.color,
          String(v.quantity),
          formatMoney(v.costPrice),
          formatMoney(v.salePrice),
        ]);
      });
    });
    generateCSV('variacoes', headers, rows);
    setLoadingReport(null);
    toast.success('Relatório de variações exportado!');
  };

  const exportMovementsCSV = async () => {
    setLoadingReport('movements_csv');
    await new Promise(r => setTimeout(r, 600));
    const movementHeaders = ['ID', 'Produto', 'Cliente', 'Tamanho', 'Cor', 'Variacao', 'Tipo', 'Quantidade', 'Preco Unit.', 'Subtotal', 'Desconto', 'Total Final', 'Custo Total', 'Lucro', 'Status Pagamento', 'Forma Pagamento', 'Data Pagamento', 'Estoque Anterior', 'Estoque Novo', 'Motivo', 'Observacoes', 'Data'];
    const rows = filteredMovements.map(m => {
      const values = movementTotals(m);
      const movementDate = parseMovementDate(m);
      const paidAt = (m as any).paidAt ?? (m as any).paid_at;
      return [
        m.id,
        m.product?.name || m.productName || m.productId,
        displayCustomerName(m.customerName ?? (m as any).customer_name),
        displayReportField((m as any).size ?? m.variant?.size),
        displayReportField((m as any).color ?? m.variant?.color),
        getVariantLabel(m),
        typeMap[m.type] || m.type,
        String(values.qty),
        `R$ ${formatMoney(values.unitPrice)}`,
        `R$ ${formatMoney(values.subtotalAmount)}`,
        `R$ ${formatMoney(values.discountAmount)}`,
        `R$ ${formatMoney(values.totalAmount)}`,
        `R$ ${formatMoney(values.totalCost)}`,
        `R$ ${formatMoney(values.totalProfit)}`,
        getPaymentStatusLabel(m),
        displayReportField((m as any).paymentMethod ?? (m as any).payment_method),
        paidAt ? format(new Date(paidAt), 'dd/MM/yyyy HH:mm') : '',
        String(safeNumber(m.previousQuantity, 0)),
        String(safeNumber(m.newQuantity, 0)),
        m.reason,
        m.notes || '',
        movementDate ? format(movementDate, 'dd/MM/yyyy HH:mm') : '',
      ];
    });
    downloadSectionedCSV(reportFilename('relatorio-completo'), [
      {
        title: 'Resumo financeiro',
        headers: ['Total vendido pago', 'Total pendente', 'Saidas', 'Descontos', 'Saldo final'],
        rows: [[formatBRL(filteredTotals.total), formatBRL(totalPending), formatBRL(totalOutflows), formatBRL(filteredTotals.discount), formatBRL(finalBalance)]],
      },
      { title: 'Vendas e movimentacoes', headers: movementHeaders, rows },
      {
        title: 'Saidas',
        headers: ['Data', 'Descricao', 'Categoria', 'Valor', 'Forma de pagamento', 'Observacao', 'Comprovante URL'],
        rows: outflowExportRows(),
      },
    ]);
    setLoadingReport(null);
    toast.success('Relatório completo exportado!');
  };

  const exportOutflowsCSV = async () => {
    setLoadingReport('outflows_csv');
    await new Promise(r => setTimeout(r, 400));
    generateCSV(reportFilename('saidas'), ['Data', 'Descricao', 'Categoria', 'Valor', 'Forma de pagamento', 'Observacao', 'Comprovante URL'], outflowExportRows());
    setLoadingReport(null);
    toast.success('Relatório de saídas exportado!');
  };

  const exportStockSummaryCSV = async () => {
    setLoadingReport('summary_csv');
    await new Promise(r => setTimeout(r, 600));
    const catSummary: Record<string, { qty: number; costVal: number; saleVal: number; count: number }> = {};
    products.forEach(p => {
      const cat = p.category?.name || 'Outros';
      if (!catSummary[cat]) catSummary[cat] = { qty: 0, costVal: 0, saleVal: 0, count: 0 };
      catSummary[cat].qty += safeNumber(p.totalQuantity, 0);
      catSummary[cat].costVal += safeNumber(p.costPrice, 0) * safeNumber(p.totalQuantity, 0);
      catSummary[cat].saleVal += safeNumber(p.salePrice, 0) * safeNumber(p.totalQuantity, 0);
      catSummary[cat].count++;
    });
    const headers = ['Categoria', 'Qtd Produtos', 'Estoque Total', 'Valor Custo', 'Valor Venda', 'Margem'];
    const rows = Object.entries(catSummary).map(([cat, data]) => [
      cat,
      String(data.count),
      String(data.qty),
      `R$ ${formatMoney(data.costVal)}`,
      `R$ ${formatMoney(data.saleVal)}`,
      `R$ ${formatMoney(data.saleVal - data.costVal)}`,
    ]);
    generateCSV('resumo_estoque', headers, rows);
    setLoadingReport(null);
    toast.success('Resumo de estoque exportado!');
  };

  const exportPDF = async (type: string) => {
    setLoadingReport(`${type}_pdf`);
    await new Promise(r => setTimeout(r, 800));
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFillColor(10, 10, 20);
      doc.rect(0, 0, 297, 297, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('FRAZON STORE - Sistema de Estoque Streetwear', 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 180);
      doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 26);

      if (type === 'products') {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Relatório de Produtos', 14, 38);

        autoTable(doc, {
          startY: 44,
          head: [['SKU', 'Nome', 'Marca', 'Categoria', 'Estoque', 'Custo', 'Venda', 'Status']],
          body: products.map(p => [
            p.sku,
            p.name.substring(0, 30),
            p.brand?.name || '',
            p.category?.name || '',
            safeNumber(p.totalQuantity, 0),
            `R$ ${safeNumber(p.costPrice, 0).toFixed(2)}`,
            `R$ ${safeNumber(p.salePrice, 0).toFixed(2)}`,
            p.status === 'active' ? 'Ativo' : p.status === 'inactive' ? 'Inativo' : 'Arquivado',
          ]),
          headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: [200, 200, 220] },
          alternateRowStyles: { fillColor: [20, 20, 35] },
          tableLineColor: [50, 50, 80],
          tableLineWidth: 0.1,
        });

        doc.save(`produtos_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      } else if (type === 'movements') {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(activePeriod?.pdfTitle || 'Relatório Geral de Vendas', 14, 38);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 180);
        doc.text(`Período: ${activePeriod?.label || 'Geral'}`, 14, 45);

        autoTable(doc, {
          startY: 51,
          head: [['Total vendido pago', 'Total pendente', 'Saidas', 'Descontos', 'Saldo final']],
          body: [[formatBRL(filteredTotals.total), formatBRL(totalPending), formatBRL(totalOutflows), formatBRL(filteredTotals.discount), formatBRL(finalBalance)]],
          headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8, textColor: [230, 230, 240] },
          alternateRowStyles: { fillColor: [20, 20, 35] },
        });

        autoTable(doc, {
          startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 70,
          head: [['Produto', 'Cliente', 'Tipo', 'Qtd', 'Subtotal', 'Desconto', 'Final', 'Custo', 'Lucro', 'Data']],
          body: filteredMovements.map(m => {
            const values = movementTotals(m);
            const movementDate = parseMovementDate(m);
            return [
              (m.product?.name || m.productName || m.productId).substring(0, 25),
              displayCustomerName(m.customerName ?? (m as any).customer_name).substring(0, 24),
              typeMap[m.type] || m.type,
              values.qty,
              `R$ ${safeNumber(values.subtotalAmount, 0).toFixed(2)}`,
              `R$ ${safeNumber(values.discountAmount, 0).toFixed(2)}`,
              `R$ ${safeNumber(values.totalAmount, 0).toFixed(2)}`,
              `R$ ${safeNumber(values.totalCost, 0).toFixed(2)}`,
              `R$ ${safeNumber(values.totalProfit, 0).toFixed(2)}`,
              movementDate ? format(movementDate, 'dd/MM/yyyy HH:mm') : '',
            ];
          }),
          headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7, textColor: [200, 200, 220] },
          alternateRowStyles: { fillColor: [20, 20, 35] },
        });
        autoTable(doc, {
          startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 130,
          head: [['Data', 'Descricao', 'Categoria', 'Valor', 'Pagamento', 'Comprovante']],
          body: filteredOutflows.map(outflow => {
            const date = parseOutflowDate(outflow);
            return [
              date ? format(date, 'dd/MM/yyyy') : '',
              outflow.description.substring(0, 32),
              outflow.categoryName,
              `R$ ${safeNumber(outflow.amount, 0).toFixed(2)}`,
              outflow.paymentMethod,
              outflow.receiptUrl ? 'Sim' : 'Nao',
            ];
          }),
          headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7, textColor: [200, 200, 220] },
          alternateRowStyles: { fillColor: [20, 20, 35] },
        });
        doc.save(`${reportFilename('relatorio')}.pdf`);
      }

      toast.success('PDF gerado com sucesso!');
    } catch (err) {
      console.error('[REPORT PDF EXPORT ERROR]', err);
      toast.error('Erro ao gerar PDF. Tente o CSV.');
    }
    setLoadingReport(null);
  };

  const exportXLSX = async (type: string) => {
    setLoadingReport(`${type}_xlsx`);
    await new Promise(r => setTimeout(r, 700));
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      if (type === 'products') {
        const data = products.map(p => ({
          'SKU': p.sku,
          'Nome': p.name,
          'Marca': p.brand?.name || '',
          'Categoria': p.category?.name || '',
          'Subcategoria': p.subcategory?.name || '',
          'Estoque Total': safeNumber(p.totalQuantity, 0),
          'Preço Custo': safeNumber(p.costPrice, 0),
          'Preço Venda': safeNumber(p.salePrice, 0),
          'Status': p.status,
          'Tags': p.tags.join(', '),
          'Criado em': format(new Date(p.createdAt), 'dd/MM/yyyy'),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Produtos');

        const varData: object[] = [];
        products.forEach(p => {
          p.variants.forEach(v => {
            varData.push({
              'SKU Variação': v.sku,
              'Produto': p.name,
              'Tamanho': v.size,
              'Cor': v.color,
              'Quantidade': safeNumber(v.quantity, 0),
              'Preço Custo': safeNumber(v.costPrice, 0),
              'Preço Venda': safeNumber(v.salePrice, 0),
            });
          });
        });
        const ws2 = XLSX.utils.json_to_sheet(varData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Variações');
        XLSX.writeFile(wb, `produtos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      } else if (type === 'movements') {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
          'Total vendido pago': safeNumber(filteredTotals.total, 0),
          'Total pendente': safeNumber(totalPending, 0),
          'Saidas': safeNumber(totalOutflows, 0),
          'Descontos': safeNumber(filteredTotals.discount, 0),
          'Saldo final': safeNumber(finalBalance, 0),
        }]), 'Resumo financeiro');
        const data = filteredMovements.map(m => {
          const values = movementTotals(m);
          const movementDate = parseMovementDate(m);
          const paidAt = (m as any).paidAt ?? (m as any).paid_at;
          return {
            'ID': m.id,
            'Produto': m.product?.name || m.productName || m.productId,
            'Cliente': displayCustomerName(m.customerName ?? (m as any).customer_name),
            'Tamanho': displayReportField((m as any).size ?? m.variant?.size),
            'Cor': displayReportField((m as any).color ?? m.variant?.color),
            'Variacao': getVariantLabel(m),
            'Tipo': typeMap[m.type] || m.type,
            'Quantidade': values.qty,
            'Subtotal': safeNumber(values.subtotalAmount, 0).toFixed(2),
            'Desconto': safeNumber(values.discountAmount, 0).toFixed(2),
            'Total Final': safeNumber(values.totalAmount, 0).toFixed(2),
            'Preço Unit.': safeNumber(values.unitPrice, 0).toFixed(2),
            'Valor Total': safeNumber(values.totalAmount, 0).toFixed(2),
            'Custo Total': safeNumber(values.totalCost, 0).toFixed(2),
            'Lucro': safeNumber(values.totalProfit, 0).toFixed(2),
            'Status Pagamento': getPaymentStatusLabel(m),
            'Forma Pagamento': displayReportField((m as any).paymentMethod ?? (m as any).payment_method),
            'Data Pagamento': paidAt ? format(new Date(paidAt), 'dd/MM/yyyy HH:mm') : '',
            'Estoque Anterior': safeNumber(m.previousQuantity, 0),
            'Estoque Novo': safeNumber(m.newQuantity, 0),
            'Motivo': m.reason,
            'Observações': m.notes || '',
            'Data': movementDate ? format(movementDate, 'dd/MM/yyyy HH:mm') : '',
          };
        });
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredOutflows.map(outflow => {
          const date = parseOutflowDate(outflow);
          return {
            'Data': date ? format(date, 'dd/MM/yyyy') : '',
            'Descricao': outflow.description,
            'Categoria': outflow.categoryName,
            'Valor': safeNumber(outflow.amount, 0),
            'Forma de pagamento': outflow.paymentMethod,
            'Observacao': outflow.notes || '',
            'Comprovante URL': outflow.receiptUrl || '',
          };
        })), 'Saidas');
        XLSX.writeFile(wb, `${reportFilename('relatorio')}.xlsx`);
      }

      toast.success('Excel exportado com sucesso!');
    } catch (err) {
      console.error('[REPORT XLSX EXPORT ERROR]', err);
      toast.error('Erro ao exportar Excel.');
    }
    setLoadingReport(null);
  };

  const reportCards = [
    {
      id: 'products',
      title: 'Relatório de Produtos',
      description: 'Todos os produtos cadastrados com SKU, marca, categoria, preços e status.',
      icon: <Package size={20} />,
      color: '#818cf8',
      stats: `${products.length} produtos · ${totalStock} unidades`,
    },
    {
      id: 'movements',
      title: 'Relatório de Movimentações',
      description: 'Histórico de entradas, saídas, ajustes e devoluções dentro do período selecionado.',
      icon: <BarChart3 size={20} />,
      color: '#34d399',
      stats: `${filteredMovements.length} movimentações no período`,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300/70">Período do relatório</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{activePeriod?.label || 'Geral'}</h2>
            <p className="mt-1 text-xs text-white/35">Os totais e exports de movimentações usam apenas o período selecionado.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_180px] lg:grid-cols-[180px_180px_180px]">
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Tipo</span>
              <select
                value={periodFilter}
                onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
                className="input-dark w-full rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="general">Geral</option>
                <option value="date">Data específica</option>
                <option value="month">Mês inteiro</option>
              </select>
            </label>
            {periodFilter === 'date' && (
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Data</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="input-dark w-full rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
            )}
            {periodFilter === 'month' && (
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Mês</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="input-dark w-full rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: 'Total vendido pago', value: formatBRL(filteredTotals.total), icon: <TrendingUp size={18} />, color: '#34d399' },
          { label: 'Saidas', value: formatBRL(totalOutflows), icon: <Receipt size={18} />, color: '#f87171' },
          { label: 'Saldo Final', value: formatBRL(finalBalance), icon: <BarChart3 size={18} />, color: '#818cf8' },
          { label: 'Descontos', value: formatBRL(filteredTotals.discount), icon: <DollarSign size={18} />, color: '#f59e0b' },
          { label: 'Pendente', value: formatBRL(totalPending), icon: <Package size={18} />, color: '#c084fc' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass rounded-2xl p-5 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}20` }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <p className="text-xs text-white/30">{s.label}</p>
              <p className="text-lg font-bold text-white">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Movimentações do período</h3>
            <p className="text-xs text-white/30">{filteredMovements.length} registros encontrados</p>
          </div>
          <Badge variant="outline" size="sm">{activePeriod?.label || 'Geral'}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Data', 'Produto', 'Cliente', 'Tipo', 'Subtotal', 'Desconto', 'Total Final', 'Lucro'].map(header => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-white/30">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMovements.slice(0, 10).map(movement => {
                const values = movementTotals(movement);
                const movementDate = parseMovementDate(movement);
                return (
                  <tr key={movement.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 text-sm text-white/45">{movementDate ? format(movementDate, 'dd/MM/yyyy HH:mm') : '-'}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-sm text-white/80">{movement.product?.name || movement.productName || movement.productId}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-sm text-white/60">{displayCustomerName(movement.customerName ?? (movement as any).customer_name)}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{typeMap[movement.type] || movement.type}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{formatBRL(values.subtotalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-amber-200">{formatBRL(values.discountAmount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{formatBRL(values.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-300">{formatBRL(values.totalProfit)}</td>
                  </tr>
                );
              })}
              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-white/35">Nenhuma movimentação encontrada para o período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {reportCards.map((report, i) => (
          <motion.div
            key={report.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${report.color}20` }}>
                <span style={{ color: report.color }}>{report.icon}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white">{report.title}</h3>
                <p className="text-xs text-white/40 mt-0.5">{report.description}</p>
                <p className="text-xs text-white/25 mt-1">{report.stats}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider font-medium mb-3">Exportar como:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => report.id === 'products' ? exportProductsCSV() : exportMovementsCSV()}
                  disabled={loadingReport !== null}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03] transition-all disabled:opacity-50"
                >
                  {loadingReport === `${report.id}_csv` || (report.id === 'products' && loadingReport === 'products_csv') || (report.id === 'movements' && loadingReport === 'movements_csv') ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileText size={20} className="text-emerald-400" />
                  )}
                  <span className="text-xs text-white/50 font-medium">CSV</span>
                </button>

                <button
                  onClick={() => exportXLSX(report.id)}
                  disabled={loadingReport !== null}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03] transition-all disabled:opacity-50"
                >
                  {loadingReport === `${report.id}_xlsx` ? (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileSpreadsheet size={20} className="text-blue-400" />
                  )}
                  <span className="text-xs text-white/50 font-medium">Excel</span>
                </button>

                <button
                  onClick={() => exportPDF(report.id)}
                  disabled={loadingReport !== null}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03] transition-all disabled:opacity-50"
                >
                  {loadingReport === `${report.id}_pdf` ? (
                    <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileText size={20} className="text-red-400" />
                  )}
                  <span className="text-xs text-white/50 font-medium">PDF</span>
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-2xl p-6"
        >
          <h3 className="text-sm font-semibold text-white mb-1">Exportações Rápidas</h3>
          <p className="text-xs text-white/30 mb-5">Relatórios prontos para uso imediato</p>

          <div className="space-y-2.5">
            {[
              {
                label: 'Variações de Estoque',
                desc: 'Todos os SKUs individuais por tamanho e cor',
                action: exportVariantsCSV,
                id: 'variants_csv',
                color: '#c084fc',
              },
              {
                label: 'Resumo por Categoria',
                desc: 'Totais agrupados por categoria',
                action: exportStockSummaryCSV,
                id: 'summary_csv',
                color: '#fb923c',
              },
            ].map(item => (
              <button
                key={item.id}
                onClick={item.action}
                disabled={loadingReport !== null}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.02] transition-all disabled:opacity-50 text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}20` }}>
                  {loadingReport === item.id ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download size={14} style={{ color: item.color }} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white/80 font-medium">{item.label}</p>
                  <p className="text-xs text-white/30">{item.desc}</p>
                </div>
                <Badge variant="outline" size="sm">CSV</Badge>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-6"
          style={{ borderColor: 'rgba(99,102,241,0.15)' }}
        >
          <h3 className="text-sm font-semibold text-white mb-1">Informações</h3>
          <p className="text-xs text-white/30 mb-4">Detalhes do sistema de relatórios</p>
          <div className="space-y-3">
            {[
              { label: 'Formato CSV', desc: 'Compatível com Excel, Google Sheets e LibreOffice. Encoding UTF-8 com BOM.' },
              { label: 'Formato Excel', desc: 'Arquivo .xlsx com múltiplas planilhas quando aplicável.' },
              { label: 'Formato PDF', desc: 'Layout profissional com tema dark. Ideal para impressão e envio.' },
              { label: 'Atualização', desc: 'Dados em tempo real. Exportação reflete o período selecionado.' },
            ].map(item => (
              <div key={item.label} className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
                <p className="text-xs font-semibold text-white/60">{item.label}</p>
                <p className="text-xs text-white/30 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default ReportsPage;

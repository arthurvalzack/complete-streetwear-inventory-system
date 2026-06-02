import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download, FileText, FileSpreadsheet,
  TrendingUp, Package, DollarSign, BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import toast from 'react-hot-toast';

export function ReportsPage() {
  const { products, movements } = useStore();
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  const generateCSV = (filename: string, headers: string[], rows: string[][]) => {
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      p.costPrice.toFixed(2).replace('.', ','),
      p.salePrice.toFixed(2).replace('.', ','),
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
          v.costPrice.toFixed(2).replace('.', ','),
          v.salePrice.toFixed(2).replace('.', ','),
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
    const headers = ['ID', 'Produto', 'Tipo', 'Quantidade', 'Preço Unit.', 'Valor Total', 'Estoque Anterior', 'Estoque Novo', 'Motivo', 'Observações', 'Data'];
    const typeMap: Record<string, string> = {
      entry: 'Entrada', exit: 'Saída', adjustment: 'Ajuste', transfer: 'Transferência', return: 'Devolução'
    };
    const rows = movements.map(m => [
      m.id,
      m.product?.name || m.productId,
      typeMap[m.type] || m.type,
      String(m.quantity),
      `R$ ${Number(m.unitPrice || 0).toFixed(2).replace('.', ',')}`,
      `R$ ${Number(m.totalValue || (Number(m.unitPrice || 0) * m.quantity)).toFixed(2).replace('.', ',')}`,
      String(m.previousQuantity),
      String(m.newQuantity),
      m.reason,
      m.notes || '',
      format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm'),
    ]);
    generateCSV('movimentacoes', headers, rows);
    setLoadingReport(null);
    toast.success('Relatório de movimentações exportado!');
  };

  const exportStockSummaryCSV = async () => {
    setLoadingReport('summary_csv');
    await new Promise(r => setTimeout(r, 600));
    // Category summary
    const catSummary: Record<string, { qty: number; costVal: number; saleVal: number; count: number }> = {};
    products.forEach(p => {
      const cat = p.category?.name || 'Outros';
      if (!catSummary[cat]) catSummary[cat] = { qty: 0, costVal: 0, saleVal: 0, count: 0 };
      catSummary[cat].qty += p.totalQuantity;
      catSummary[cat].costVal += p.costPrice * p.totalQuantity;
      catSummary[cat].saleVal += p.salePrice * p.totalQuantity;
      catSummary[cat].count++;
    });
    const headers = ['Categoria', 'Qtd Produtos', 'Estoque Total', 'Valor Custo', 'Valor Venda', 'Margem'];
    const rows = Object.entries(catSummary).map(([cat, data]) => [
      cat,
      String(data.count),
      String(data.qty),
      `R$ ${data.costVal.toFixed(2).replace('.', ',')}`,
      `R$ ${data.saleVal.toFixed(2).replace('.', ',')}`,
      `R$ ${(data.saleVal - data.costVal).toFixed(2).replace('.', ',')}`,
    ]);
    generateCSV('resumo_estoque', headers, rows);
    setLoadingReport(null);
    toast.success('Resumo de estoque exportado!');
  };

  const exportPDF = async (type: string) => {
    setLoadingReport(`${type}_pdf`);
    await new Promise(r => setTimeout(r, 800));
    // Use jsPDF
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'landscape' });

      // Header
      doc.setFillColor(10, 10, 20);
      doc.rect(0, 0, 297, 297, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('FRAZON STORE — Sistema de Estoque Streetwear', 14, 18);
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
            p.totalQuantity,
            `R$ ${p.costPrice.toFixed(2)}`,
            `R$ ${p.salePrice.toFixed(2)}`,
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
        doc.text('Relatório de Movimentações', 14, 38);
        const typeMap: Record<string, string> = {
          entry: 'Entrada', exit: 'Saída', adjustment: 'Ajuste', transfer: 'Transferência', return: 'Devolução'
        };
        autoTable(doc, {
          startY: 44,
          head: [['Produto', 'Tipo', 'Quantidade', 'Preço Unit.', 'Valor Total', 'Anterior', 'Novo', 'Motivo', 'Data']],
          body: movements.slice(0, 100).map(m => [
            (m.product?.name || m.productId).substring(0, 25),
            typeMap[m.type] || m.type,
            m.quantity,
            `R$ ${Number(m.unitPrice || 0).toFixed(2)}`,
            `R$ ${Number(m.totalValue || (Number(m.unitPrice || 0) * m.quantity)).toFixed(2)}`,
            m.previousQuantity,
            m.newQuantity,
            m.reason.substring(0, 30),
            format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm'),
          ]),
          headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: [200, 200, 220] },
          alternateRowStyles: { fillColor: [20, 20, 35] },
        });
        doc.save(`movimentacoes_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      }

      toast.success('PDF gerado com sucesso!');
    } catch (err) {
      toast.error('Erro ao gerar PDF. Tente o CSV.');
    }
    setLoadingReport(null);
  };

  const exportXLSX = async (type: string) => {
    setLoadingReport(`${type}_xlsx`);
    await new Promise(r => setTimeout(r, 700));
    try {
      const XLSX = await import('xlsx');

      let wb = XLSX.utils.book_new();
      if (type === 'products') {
        const data = products.map(p => ({
          'SKU': p.sku,
          'Nome': p.name,
          'Marca': p.brand?.name || '',
          'Categoria': p.category?.name || '',
          'Subcategoria': p.subcategory?.name || '',
          'Estoque Total': p.totalQuantity,
          'Preço Custo': p.costPrice,
          'Preço Venda': p.salePrice,
          'Status': p.status,
          'Tags': p.tags.join(', '),
          'Criado em': format(new Date(p.createdAt), 'dd/MM/yyyy'),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Produtos');

        // Variants sheet
        const varData: object[] = [];
        products.forEach(p => {
          p.variants.forEach(v => {
            varData.push({
              'SKU Variação': v.sku,
              'Produto': p.name,
              'Tamanho': v.size,
              'Cor': v.color,
              'Quantidade': v.quantity,
              'Preço Custo': v.costPrice,
              'Preço Venda': v.salePrice,
            });
          });
        });
        const ws2 = XLSX.utils.json_to_sheet(varData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Variações');

        XLSX.writeFile(wb, `produtos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      } else if (type === 'movements') {
        const typeMap: Record<string, string> = {
          entry: 'Entrada', exit: 'Saída', adjustment: 'Ajuste', transfer: 'Transferência', return: 'Devolução'
        };
        const data = movements.map(m => ({
          'ID': m.id,
          'Produto': m.product?.name || m.productId,
          'Tipo': typeMap[m.type] || m.type,
          'Quantidade': m.quantity,
          'Preço Unit.': Number(m.unitPrice || 0).toFixed(2),
          'Valor Total': Number(m.totalValue || (Number(m.unitPrice || 0) * m.quantity)).toFixed(2),
          'Estoque Anterior': m.previousQuantity,
          'Estoque Novo': m.newQuantity,
          'Motivo': m.reason,
          'Observações': m.notes || '',
          'Data': format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm'),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');
        XLSX.writeFile(wb, `movimentacoes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      }
      toast.success('Excel exportado com sucesso!');
    } catch (err) {
      toast.error('Erro ao exportar Excel.');
    }
    setLoadingReport(null);
  };

  const totalStock = products.reduce((acc, p) => acc + p.totalQuantity, 0);
  const totalCost = products.reduce((acc, p) => acc + p.costPrice * p.totalQuantity, 0);
  const totalSale = products.reduce((acc, p) => acc + p.salePrice * p.totalQuantity, 0);

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
      description: 'Histórico completo de entradas, saídas, ajustes e devoluções.',
      icon: <BarChart3 size={20} />,
      color: '#34d399',
      stats: `${movements.length} movimentações`,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Produtos Cadastrados', value: products.length, icon: <Package size={18} />, color: '#818cf8' },
          { label: 'Valor em Custo', value: `R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: <DollarSign size={18} />, color: '#fbbf24' },
          { label: 'Valor em Venda', value: `R$ ${totalSale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: <TrendingUp size={18} />, color: '#34d399' },
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

      {/* Report Cards */}
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
                {/* CSV */}
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

                {/* XLSX */}
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

                {/* PDF */}
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

        {/* Quick Exports */}
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

        {/* Info card */}
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
              { label: 'Atualização', desc: 'Dados em tempo real. Exportação reflete o estado atual do estoque.' },
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

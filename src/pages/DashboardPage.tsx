import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Package, TrendingUp, AlertTriangle, XCircle,
  DollarSign, ArrowUpRight, ArrowDownRight, ShoppingBag, Activity
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useStore } from '../store/useStore';
import { StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-xl p-3 border border-white/10" style={{ background: '#1a1a2e' }}>
        <p className="text-xs text-white/50 mb-2">{label}</p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-white/60">{entry.name}:</span>
            <span className="text-white font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const movementTypeLabel: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  adjustment: 'Ajuste',
  transfer: 'Transferência',
  return: 'Devolução',
};

const movementTypeBadge: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  entry: 'success',
  exit: 'danger',
  adjustment: 'warning',
  transfer: 'info',
  return: 'purple' as 'info',
};

export function DashboardPage() {
  const { products, movements } = useStore();

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = products.reduce((acc, p) => acc + p.totalQuantity, 0);
    const lowStockProducts = products.filter(p => p.totalQuantity > 0 && p.totalQuantity <= 5).length;
    const outOfStockProducts = products.filter(p => p.totalQuantity === 0).length;
    const totalCostValue = products.reduce((acc, p) => acc + p.costPrice * p.totalQuantity, 0);
    const totalSaleValue = products.reduce((acc, p) => acc + p.salePrice * p.totalQuantity, 0);
    const activeProducts = products.filter(p => p.status === 'active').length;
    return { totalProducts, totalStock, lowStockProducts, outOfStockProducts, totalCostValue, totalSaleValue, activeProducts };
  }, [products]);

  // Financial stats: Vendas do dia, Lucro do dia, Ticket médio
  const financial = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    const isSale = (m: any) => {
      // Considerar movimentos do tipo 'exit' como vendas; também checar reason contendo 'venda'
      if (!m) return false;
      if (m.type === 'exit') return true;
      if (typeof m.reason === 'string' && /venda/i.test(m.reason)) return true;
      return false;
    };

    const calcForDate = (dateStr: string) => {
      const dayMovs = movements.filter((m: any) => typeof m.createdAt === 'string' && m.createdAt.startsWith(dateStr) && isSale(m));
      let total = 0;
      let profit = 0;
      let transactions = 0;
      let itemsCount = 0;
      dayMovs.forEach((m: any) => {
        const qty = Number(m.quantity) || 0;
        const salePrice = Number(m.unitPrice ?? m.variant?.salePrice ?? m.product?.salePrice ?? 0) || 0;
        const costPrice = Number(m.costPrice ?? m.variant?.costPrice ?? m.product?.costPrice ?? 0) || 0;
        const movementTotal = Number(m.totalValue ?? (salePrice * qty)) || 0;
        total += movementTotal;
        profit += (movementTotal - (costPrice * qty));
        transactions += 1;
        itemsCount += qty;
      });
      return { total, profit, transactions, itemsCount };
    };

    const todayVals = calcForDate(today);
    const yesterdayVals = calcForDate(yesterday);

    const pctChange = (todayVals.total && yesterdayVals.total)
      ? ((todayVals.total - yesterdayVals.total) / yesterdayVals.total) * 100
      : null;

    const ticket = todayVals.transactions > 0 ? todayVals.total / todayVals.transactions : 0;

    return {
      salesTotal: todayVals.total,
      profitTotal: todayVals.profit,
      ticketAverage: ticket,
      salesTransactions: todayVals.transactions,
      salesItems: todayVals.itemsCount,
      pctChange,
      hasHistory: yesterdayVals.transactions > 0 || yesterdayVals.itemsCount > 0 || (yesterdayVals.total > 0),
    };
  }, [movements, products]);

  // Movement chart data (last 7 days)
  const movementChartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayMovements = movements.filter(m => typeof m.createdAt === 'string' && m.createdAt.startsWith(dateStr));
      return {
        date: format(date, 'EEE', { locale: ptBR }),
        Entradas: dayMovements.filter(m => m.type === 'entry').reduce((acc, m) => acc + m.quantity, 0),
        Saídas: dayMovements.filter(m => m.type === 'exit').reduce((acc, m) => acc + m.quantity, 0),
      };
    });
    return days;
  }, [movements]);

  // Stock by category
  const stockByCategory = useMemo(() => {
    const catMap: Record<string, { qty: number; value: number }> = {};
    products.forEach(p => {
      const catName = p.category?.name || 'Outros';
      if (!catMap[catName]) catMap[catName] = { qty: 0, value: 0 };
      catMap[catName].qty += p.totalQuantity;
      catMap[catName].value += p.salePrice * p.totalQuantity;
    });
    return Object.entries(catMap).map(([name, data]) => ({
      name,
      Estoque: data.qty,
      Valor: Math.round(data.value),
    })).sort((a, b) => b.Estoque - a.Estoque);
  }, [products]);

  // Stock by brand
  const stockByBrand = useMemo(() => {
    const brandMap: Record<string, number> = {};
    products.forEach(p => {
      const brandName = p.brand?.name || 'Outros';
      brandMap[brandName] = (brandMap[brandName] || 0) + p.totalQuantity;
    });
    return Object.entries(brandMap).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [products]);

  // Recent movements
  const recentMovements = movements.slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard
          title="Total de Produtos"
          value={stats.totalProducts}
          subtitle={`${stats.activeProducts} ativos`}
          icon={<Package size={20} />}
          color="indigo"
          delay={0}
        />
        <StatCard
          title="Total em Estoque"
          value={stats.totalStock.toLocaleString()}
          subtitle="unidades"
          icon={<ShoppingBag size={20} />}
          color="blue"
          delay={0.05}
        />
        <StatCard
          title="Estoque Baixo"
          value={stats.lowStockProducts}
          subtitle="≤5 unidades"
          icon={<AlertTriangle size={20} />}
          color="amber"
          delay={0.1}
        />
        <StatCard
          title="Esgotados"
          value={stats.outOfStockProducts}
          subtitle="sem estoque"
          icon={<XCircle size={20} />}
          color="red"
          delay={0.15}
        />
        <StatCard
          title="Vendas do Dia"
          value={financial.salesTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          subtitle={
            financial.salesTransactions > 0
              ? `Total vendido hoje${!financial.hasHistory ? ' · Sem histórico para comparação' : ''}`
              : 'R$ 0,00'
          }
          icon={<DollarSign size={20} />}
          color="purple"
          delay={0.2}
          trend={financial.pctChange !== null && financial.hasHistory ? { value: Number(financial.pctChange.toFixed(1)), label: 'em relação a ontem' } : undefined}
        />
        <StatCard
          title="Lucro do Dia"
          value={financial.profitTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          subtitle="Lucro gerado hoje"
          icon={<TrendingUp size={20} />}
          color="emerald"
          delay={0.25}
        />
        <StatCard
          title="Ticket Médio"
          value={financial.ticketAverage.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          subtitle="Valor médio por venda"
          icon={<ShoppingBag size={20} />}
          color="blue"
          delay={0.3}
        />
      </div>

      {/* Value Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5 col-span-1"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Valor em Custo</p>
            <DollarSign size={16} className="text-white/20" />
          </div>
          <p className="text-2xl font-bold text-white">
            R$ {stats.totalCostValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <ArrowUpRight size={14} className="text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">Preço de custo total</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-2xl p-5 col-span-1"
          style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Valor em Venda</p>
            <TrendingUp size={16} className="text-indigo-400" />
          </div>
          <p className="text-2xl font-bold gradient-text">
            R$ {stats.totalSaleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <ArrowUpRight size={14} className="text-indigo-400" />
            <span className="text-xs text-indigo-400 font-medium">Potencial de receita</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-5 col-span-1"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Margem Potencial</p>
            <Activity size={16} className="text-white/20" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            R$ {(stats.totalSaleValue - stats.totalCostValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <ArrowUpRight size={14} className="text-emerald-400" />
            <span className="text-xs text-white/30 font-medium">
              {stats.totalCostValue > 0
                ? `${(((stats.totalSaleValue - stats.totalCostValue) / stats.totalCostValue) * 100).toFixed(1)}% de margem`
                : '—'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Movement chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-2xl p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-white">Movimentações (7 dias)</h3>
              <p className="text-xs text-white/30 mt-0.5">Entradas vs Saídas</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={movementChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="entradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="saidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#55557a' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#55557a' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="Entradas" stroke="#6366f1" fill="url(#entradas)" strokeWidth={2} />
              <Area type="monotone" dataKey="Saídas" stroke="#ef4444" fill="url(#saidas)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Brand Pie */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Estoque por Marca</h3>
            <p className="text-xs text-white/30 mt-0.5">Distribuição de unidades</p>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={stockByBrand}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                paddingAngle={3}
              >
                {stockByBrand.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: 11 }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {stockByBrand.slice(0, 4).map((brand, i) => (
              <div key={brand.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i] }} />
                  <span className="text-white/50 truncate max-w-[80px]">{brand.name}</span>
                </div>
                <span className="text-white/70 font-medium">{brand.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Category Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Estoque por Categoria</h3>
            <p className="text-xs text-white/30 mt-0.5">Unidades em estoque</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stockByCategory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#55557a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#55557a' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Estoque" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Low Stock Alert */}
      {stats.lowStockProducts + stats.outOfStockProducts > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="rounded-2xl overflow-hidden border"
          style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}
        >
          <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: 'rgba(245,158,11,0.1)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Atenção ao Estoque</h3>
              <p className="text-xs text-amber-400/70">
                {stats.outOfStockProducts} esgotado{stats.outOfStockProducts !== 1 ? 's' : ''} ·{' '}
                {stats.lowStockProducts} com estoque baixo
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {products
                .filter(p => p.totalQuantity <= 5)
                .slice(0, 6)
                .map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.totalQuantity === 0 ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate font-medium">{p.name}</p>
                      <p className="text-xs text-white/30">{p.brand?.name}</p>
                    </div>
                    <span className={`text-sm font-bold flex-shrink-0 ${p.totalQuantity === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {p.totalQuantity === 0 ? 'Esgotado' : `${p.totalQuantity} un.`}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent Movements */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-white">Movimentações Recentes</h3>
            <p className="text-xs text-white/30 mt-0.5">Últimas {recentMovements.length} movimentações</p>
          </div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {recentMovements.map((movement) => (
            <div key={movement.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: movement.type === 'entry' ? 'rgba(16,185,129,0.15)' :
                              movement.type === 'exit' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                }}
              >
                {movement.type === 'entry' ? (
                  <ArrowUpRight size={14} className="text-emerald-400" />
                ) : movement.type === 'exit' ? (
                  <ArrowDownRight size={14} className="text-red-400" />
                ) : (
                  <Activity size={14} className="text-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 font-medium truncate">
                  {movement.product?.name || 'Produto'}
                </p>
                <p className="text-xs text-white/30 truncate">{movement.reason}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <Badge variant={movementTypeBadge[movement.type] || 'default'} size="sm">
                  {movementTypeLabel[movement.type]}
                </Badge>
                <p className="text-xs text-white/30 mt-1">
                  {movement.quantity > 0 ? '+' : ''}{movement.quantity === 0 ? '=' : ''}{movement.quantity} un.
                </p>
              </div>
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="text-xs text-white/25">
                  {format(parseISO(movement.createdAt), "dd/MM HH:mm")}
                </p>
              </div>
            </div>
          ))}

          {recentMovements.length === 0 && (
            <div className="py-12 text-center text-white/20 text-sm">
              Nenhuma movimentação registrada
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

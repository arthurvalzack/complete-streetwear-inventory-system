import { motion } from 'framer-motion';
import { AlertTriangle, XCircle, Info, Bell, CheckCheck, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';


const alertConfig = {
  out_of_stock: {
    icon: <XCircle size={16} />,
    variant: 'danger' as const,
    label: 'Esgotado',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.15)',
    iconBg: 'rgba(239,68,68,0.15)',
    iconColor: '#f87171',
  },
  low_stock: {
    icon: <AlertTriangle size={16} />,
    variant: 'warning' as const,
    label: 'Estoque Baixo',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.15)',
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#fbbf24',
  },
  info: {
    icon: <Info size={16} />,
    variant: 'info' as const,
    label: 'Info',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.15)',
    iconBg: 'rgba(59,130,246,0.15)',
    iconColor: '#60a5fa',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    variant: 'warning' as const,
    label: 'Aviso',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.15)',
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#fbbf24',
  },
};

export function AlertsPage() {
  const { alerts, readAlert, readAllAlerts, products } = useStore();

  const unread = alerts.filter(a => !a.read).length;
  const outOfStock = alerts.filter(a => a.type === 'out_of_stock').length;
  const lowStock = alerts.filter(a => a.type === 'low_stock').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Não lidos', value: unread, color: '#818cf8' },
          { label: 'Esgotados', value: outOfStock, color: '#f87171' },
          { label: 'Estoque Baixo', value: lowStock, color: '#fbbf24' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-4"
          >
            <p className="text-xs text-white/30">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/30">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} no total</p>
        {unread > 0 && (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCheck size={14} />}
            onClick={readAllAlerts}
          >
            Marcar todos como lidos
          </Button>
        )}
      </div>

      {/* Alerts List */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        {alerts.length === 0 && (
          <div className="glass rounded-2xl py-16 flex flex-col items-center gap-3 text-white/20">
            <Bell size={32} />
            <p className="text-sm">Nenhum alerta no momento</p>
          </div>
        )}

        {alerts.map((alert, i) => {
          const config = alertConfig[alert.type];
          const product = alert.productId ? products.find(p => p.id === alert.productId) : null;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-4 p-4 rounded-xl border transition-all"
              style={{
                background: alert.read ? 'rgba(255,255,255,0.02)' : config.bg,
                borderColor: alert.read ? 'rgba(255,255,255,0.06)' : config.border,
                opacity: alert.read ? 0.6 : 1,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: config.iconBg }}
              >
                <span style={{ color: config.iconColor }}>{config.icon}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant={config.variant} size="sm">{config.label}</Badge>
                  {!alert.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  )}
                </div>
                <p className="text-sm text-white/80">{alert.message}</p>
                {product && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Package size={11} className="text-white/20" />
                    <span className="text-xs text-white/30">{product.totalQuantity} un. em estoque</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="text-xs text-white/25">
                  {format(parseISO(alert.createdAt), 'dd/MM HH:mm')}
                </p>
                {!alert.read && (
                  <button
                    onClick={() => readAlert(alert.id)}
                    className="text-xs text-white/30 hover:text-white/70 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                  >
                    Marcar lido
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

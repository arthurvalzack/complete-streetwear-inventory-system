import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Package, ArrowLeftRight, BarChart3,
  Bell, LogOut, ChevronLeft, ChevronRight,
  Zap, ShoppingBag, AlertTriangle, DollarSign, Settings
} from 'lucide-react';
import { useStore } from '../../store/useStore';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'products', label: 'Produtos', icon: <Package size={18} /> },
  { id: 'movements', label: 'Movimentações', icon: <ArrowLeftRight size={18} /> },
  { id: 'alerts', label: 'Alertas', icon: <AlertTriangle size={18} /> },
  { id: 'reports', label: 'Relatórios', icon: <BarChart3 size={18} /> },
  { id: 'settings', label: 'Configurações', icon: <Settings size={18} /> },
  { id: 'cashier', label: 'Caixa', icon: <DollarSign size={18} /> },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { user, logout, sidebarOpen, setSidebarOpen, alerts, storeConfig } = useStore();
  const unreadAlerts = alerts.filter(a => !a.read).length;

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 72 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-white/[0.06] flex-shrink-0">
          {storeConfig.logoUrl ? (
            <img src={storeConfig.logoUrl} alt="Logo" className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
            >
              <Zap size={16} className="text-white" />
            </div>
          )}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="ml-3 overflow-hidden"
              >
                <span className="font-bold text-white tracking-wider text-sm">{storeConfig.storeName}</span>
                <span className="block text-[10px] text-white/30 font-medium tracking-widest">ADMIN</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          {navItems.map(item => {
            const isActive = currentPage === item.id;
            const badgeCount = item.id === 'alerts' ? unreadAlerts : 0;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 text-left ${isActive ? 'active' : 'text-white/40 hover:text-white/70'}`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="text-sm font-medium whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {badgeCount > 0 && (
                  <AnimatePresence>
                    {sidebarOpen ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"
                      />
                    )}
                  </AnimatePresence>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/[0.06] p-3 space-y-1 flex-shrink-0">
          {/* Catalog shortcut */}
          <button
            onClick={() => onNavigate('admin_catalog')}
            className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 ${currentPage === 'admin_catalog' ? 'active' : 'text-white/30 hover:text-white/60'}`}
          >
            <ShoppingBag size={18} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
                  Catálogo
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={() => onNavigate('notifications')}
            className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 relative ${currentPage === 'notifications' ? 'active' : 'text-white/30 hover:text-white/60'}`}
          >
            <Bell size={18} className="flex-shrink-0" />
            {unreadAlerts > 0 && !sidebarOpen && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
                  Notificações
                  {unreadAlerts > 0 && (
                    <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5">{unreadAlerts}</span>
                  )}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0">
              <span className="text-white font-bold text-xs">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-white/30 truncate">{user?.role === 'admin' ? 'Administrador' : user?.role}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={logout}
                  className="text-white/20 hover:text-red-400 transition-colors"
                  title="Sair"
                >
                  <LogOut size={14} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full border border-white/10 bg-[#13131f] flex items-center justify-center text-white/40 hover:text-white transition-colors z-10"
        >
          {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>
      </motion.aside>
    </>
  );
}

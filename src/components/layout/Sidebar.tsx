import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Package, ArrowLeftRight, BarChart3,
  Bell, LogOut, ChevronLeft, ChevronRight,
  ShoppingBag, AlertTriangle, DollarSign, Settings
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
        <div className="flex h-20 flex-shrink-0 items-center border-b border-gray-800/80 px-3">
          <img
            src={storeConfig.logoUrl || '/logo.jpeg'}
            alt="Frazon Store"
            className="h-12 w-12 flex-shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] object-cover shadow-lg shadow-black/30"
          />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="ml-3 overflow-hidden"
              >
                <span className="block truncate text-sm font-bold tracking-wide text-white">FRAZON STORE</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">ADMIN</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-5">
          {navItems.map(item => {
            const isActive = currentPage === item.id;
            const badgeCount = item.id === 'alerts' ? unreadAlerts : 0;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`nav-item group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                  isActive
                    ? 'active bg-indigo-500/15 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/20'
                    : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={`flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                  {item.icon}
                </span>
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="overflow-hidden whitespace-nowrap text-sm font-medium"
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
                        className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold leading-none text-white shadow-lg shadow-red-500/25"
                      >
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                      />
                    )}
                  </AnimatePresence>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="flex-shrink-0 space-y-1.5 border-t border-gray-800/80 p-3">
          {/* Catalog shortcut */}
          <button
            onClick={() => onNavigate('admin_catalog')}
            className={`nav-item group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${currentPage === 'admin_catalog' ? 'active bg-indigo-500/15 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/20' : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}
          >
            <ShoppingBag size={18} className={`flex-shrink-0 transition-colors duration-200 ${currentPage === 'admin_catalog' ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap text-sm font-medium">
                  Catálogo
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={() => onNavigate('notifications')}
            className={`nav-item group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${currentPage === 'notifications' ? 'active bg-indigo-500/15 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/20' : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Bell size={18} className={`flex-shrink-0 transition-colors duration-200 ${currentPage === 'notifications' ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
            {unreadAlerts > 0 && !sidebarOpen && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            )}
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 items-center whitespace-nowrap text-sm font-medium">
                  Notificações
                  {unreadAlerts > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold leading-none text-white shadow-lg shadow-red-500/25">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>
                  )}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* User info */}
          <div className="group mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 shadow-lg shadow-black/20 transition-all duration-200 hover:border-indigo-400/25 hover:bg-white/[0.055]">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
              <span className="text-sm font-bold text-white">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                  <p className="truncate text-xs text-gray-400">{user?.role === 'admin' ? 'Administrador' : user?.role}</p>
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
                  className="rounded-lg p-1.5 text-gray-500 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 group-hover:text-gray-300"
                  title="Sair"
                >
                  <LogOut size={16} />
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

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Bell, Menu, X } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuToggle: () => void;
  actions?: React.ReactNode;
  onNavigate?: (page: string) => void;
}

export function TopBar({ title, subtitle, onMenuToggle, actions, onNavigate }: TopBarProps) {
  const { searchQuery, setSearchQuery, alerts } = useStore();
  const unreadAlerts = alerts.filter(a => !a.read).length;
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header
      className="h-16 flex items-center gap-4 px-6 border-b flex-shrink-0"
      style={{
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {/* Mobile menu */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-white/40 hover:text-white transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {!showSearch ? (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-base font-semibold text-white truncate">{title}</h1>
            {subtitle && <p className="text-xs text-white/30 truncate">{subtitle}</p>}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <Search size={16} className="text-white/30 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar produtos, SKU, marca..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/25"
            />
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="text-white/30 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {!showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <Search size={16} />
          </button>
        )}

        <button
          onClick={() => onNavigate?.('alerts')}
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-all relative"
        >
          <Bell size={16} />
          {unreadAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </button>

        {actions}
      </div>
    </header>
  );
}

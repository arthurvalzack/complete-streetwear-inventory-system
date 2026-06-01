import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  gradient?: string;
  delay?: number;
}

export function Card({ children, className = '', hover = false, onClick, delay = 0 }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      onClick={onClick}
      className={`
        glass rounded-2xl
        ${hover ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  color?: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue' | 'purple';
  delay?: number;
}

const colors = {
  indigo: { bg: 'rgba(99,102,241,0.1)', icon: 'rgba(99,102,241,0.2)', text: '#818cf8', border: 'rgba(99,102,241,0.15)' },
  emerald: { bg: 'rgba(16,185,129,0.1)', icon: 'rgba(16,185,129,0.2)', text: '#34d399', border: 'rgba(16,185,129,0.15)' },
  amber: { bg: 'rgba(245,158,11,0.1)', icon: 'rgba(245,158,11,0.2)', text: '#fbbf24', border: 'rgba(245,158,11,0.15)' },
  red: { bg: 'rgba(239,68,68,0.1)', icon: 'rgba(239,68,68,0.2)', text: '#f87171', border: 'rgba(239,68,68,0.15)' },
  blue: { bg: 'rgba(59,130,246,0.1)', icon: 'rgba(59,130,246,0.2)', text: '#60a5fa', border: 'rgba(59,130,246,0.15)' },
  purple: { bg: 'rgba(168,85,247,0.1)', icon: 'rgba(168,85,247,0.2)', text: '#c084fc', border: 'rgba(168,85,247,0.15)' },
};

export function StatCard({ title, value, subtitle, icon, trend, color = 'indigo', delay = 0 }: StatCardProps) {
  const c = colors[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-2xl p-5 relative overflow-hidden"
      style={{ borderColor: c.border }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-30"
        style={{ background: c.text }}
      />

      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {title}
          </p>
          <p className="text-2xl font-bold text-white mt-2 mb-1">{value}</p>
          {subtitle && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{subtitle}</p>}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-semibold ${trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-white/30">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className="p-3 rounded-xl flex items-center justify-center"
          style={{ background: c.icon }}
        >
          <span style={{ color: c.text }}>{icon}</span>
        </div>
      </div>
    </motion.div>
  );
}

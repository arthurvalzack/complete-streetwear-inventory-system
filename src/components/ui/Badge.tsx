import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-white/8 text-white/70 border border-white/10',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  outline: 'bg-transparent text-white/50 border border-white/15',
};

const sizes = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-[11px] px-2.5 py-1',
};

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  return (
    <span className={`badge font-semibold tracking-wide ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}

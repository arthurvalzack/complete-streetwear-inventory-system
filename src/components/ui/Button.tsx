import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const variants = {
  primary: 'btn-primary text-white font-semibold',
  secondary: 'btn-secondary font-medium',
  danger: 'btn-danger font-medium',
  ghost: 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 font-medium transition-all',
  outline: 'bg-transparent border border-white/15 text-white/70 hover:border-white/30 hover:text-white font-medium transition-all',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
  icon: 'p-2 rounded-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 
        ${variants[variant]} ${sizes[size]} ${className}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
        transition-all duration-150 active:scale-95
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

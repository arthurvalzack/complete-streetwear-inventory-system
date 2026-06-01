import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, Shield } from 'lucide-react';
import { useStore } from '../store/useStore';
import toast from 'react-hot-toast';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { login } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email inválido';
    if (!password) newErrors.password = 'Senha é obrigatória';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    // Simulate async auth
    await new Promise(r => setTimeout(r, 800));
    const result = login(email, password);
    setLoading(false);
    if (result.success) {
      toast.success('Bem-vindo à FRAZON STORE!');
      onLogin();
    } else {
      toast.error(result.error || 'Erro ao fazer login');
      setErrors({ password: result.error });
    }
  };

  const fillAdmin = () => {
    setEmail('admin@admin.com');
    setPassword('admin123@');
    setErrors({});
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a0a14 0%, #0d0d1f 50%, #0a0a14 100%)' }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'url(/login-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/5 rounded-full blur-3xl" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 0 30px rgba(99,102,241,0.4)',
              }}
            >
              <Zap size={24} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">FRAZON STORE</h1>
          <p className="text-white/30 text-sm mt-1 tracking-widest uppercase font-medium">Sistema de Estoque Premium</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="glass-bright rounded-2xl overflow-hidden"
          style={{ background: 'rgba(19,19,31,0.95)' }}
        >
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Entrar na plataforma</h2>
              <p className="text-white/30 text-sm mt-1">Acesso restrito a usuários autorizados</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })); }}
                    placeholder="admin@admin.com"
                    className={`input-dark w-full pl-10 pr-4 py-3 rounded-xl text-sm ${errors.email ? 'border-red-500/50' : ''}`}
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }}
                    placeholder="••••••••"
                    className={`input-dark w-full pl-10 pr-11 py-3 rounded-xl text-sm ${errors.password ? 'border-red-500/50' : ''}`}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full btn-primary py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-6"
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight size={16} />
                  </>
                )}
              </motion.button>
            </form>
          </div>

          {/* Quick access */}
          <div
            className="px-8 py-4 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
          >
            <button
              onClick={fillAdmin}
              className="w-full flex items-center gap-2 text-xs text-white/30 hover:text-indigo-400 transition-colors"
            >
              <Shield size={13} />
              <span>Acesso rápido: admin@admin.com / admin123@</span>
            </button>
          </div>
        </motion.div>

        {/* Info */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-white/15 mt-6"
        >
          FRAZON STORE™ — Sistema de Gestão de Estoque Streetwear · v1.0
        </motion.p>
      </div>
    </div>
  );
}

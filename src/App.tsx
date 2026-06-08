import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { initializeAuth } from './lib/auth';
import { seedDatabase, loadRemoteToLocal, getProducts, ensureBaseTaxonomy } from './lib/database';
import { isSupabaseConfigured } from './lib/supabase';
import { useStore } from './store/useStore';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { MovementsPage } from './pages/MovementsPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { BrandsPage } from './pages/BrandsPage';
import { PublicCatalogPage } from './pages/PublicCatalogPage';
import { AdminCatalogPage } from './pages/AdminCatalogPage';
import { CashierPage } from './pages/CashierPage';
import { SettingsPage } from './pages/SettingsPage';

import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';

type Page = 'dashboard' | 'products' | 'movements' | 'alerts' | 'reports' | 'brands' | 'notifications' | 'admin_catalog' | 'cashier' | 'settings';

function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error('[LOCAL STORAGE READ ERROR]', error);
    return null;
  }
}

const pageConfig: Record<Page, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Visão geral do estoque' },
  products: { title: 'Produtos', subtitle: 'Gerencie seu catálogo completo' },
  movements: { title: 'Movimentações', subtitle: 'Entradas, saídas e ajustes de estoque' },
  alerts: { title: 'Alertas', subtitle: 'Notificações de estoque crítico' },
  reports: { title: 'Relatórios', subtitle: 'Exporte dados em PDF, CSV ou Excel' },
  settings: { title: 'Configurações', subtitle: 'Backup e sincronização' },
  brands: { title: 'Catálogo', subtitle: 'Marcas e categorias' },
  notifications: { title: 'Notificações', subtitle: 'Central de alertas' },
  admin_catalog: { title: 'Catálogo', subtitle: 'Gerencie o catálogo público' },
  cashier: { title: 'Caixa', subtitle: 'Registrar vendas do dia' },
};

function getPageFromPath(pathname: string): Page {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'dashboard';
  const page = segments[0];
  if (page === 'caixa') return 'cashier';
  if (page === 'settings' || page === 'configuracoes') return 'settings';
  if (['dashboard', 'products', 'movements', 'alerts', 'reports', 'brands', 'notifications', 'cashier'].includes(page)) {
    return page as Page;
  }
  if (page === 'admin' && segments[1] === 'catalogo') {
    return 'admin_catalog';
  }
  return 'dashboard';
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function PrivateLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen } = useStore();
  const currentPage = useMemo(() => getPageFromPath(location.pathname), [location.pathname]);
  const config = pageConfig[currentPage] || pageConfig.dashboard;

  const handleNavigate = (page: string) => {
    if (page === 'settings') { navigate('/settings'); return; }
    if (page === 'admin_catalog') {
      navigate('/admin/catalogo');
      return;
    }
    if (page === 'cashier') {
      navigate('/caixa');
      return;
    }
    const target = page === 'dashboard' ? '/dashboard' : `/${page}`;
    navigate(target);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />

      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? 240 : 72 }}
      >
        <TopBar
          title={config.title}
          subtitle={config.subtitle}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          onNavigate={handleNavigate}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoginWrapper() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useStore();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard';

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage onLogin={() => navigate(from, { replace: true })} />;
}

function App() {
  const { initSession } = useStore();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    initializeAuth();

    (async () => {
      // If Supabase is configured, prefer loading remote state first.
      if (isSupabaseConfigured) {
        await loadRemoteToLocal();
        // Ensure base taxonomy exists even if seed is disabled in production
        await ensureBaseTaxonomy();
        // If after loading remote there is still no local data, seed demo data only in dev.
        const initialized = !!safeGetLocalStorage('stck_db_initialized');
        const hasLocal = getProducts().length > 0 || initialized;
        if (!hasLocal && import.meta.env.DEV) seedDatabase();
      } else {
        await ensureBaseTaxonomy();
        // Offline/local dev: run seed only in development environment
        if (import.meta.env.DEV) seedDatabase();
      }

      initSession();
      setAppReady(true);
    })();
  }, []);

  if (!appReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a14' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/30 text-sm">Iniciando FRAZON STORE...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginWrapper />} />
        <Route path="/catalogo" element={<PublicCatalogPage />} />
        <Route path="/" element={<RequireAuth><PrivateLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="notifications" element={<AlertsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="brands" element={<BrandsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/catalogo" element={<AdminCatalogPage />} />
          <Route path="caixa" element={<CashierPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/catalogo" replace />} />
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a2e',
            color: '#f0f0ff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </>
  );
}

export default App;

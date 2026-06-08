import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  User, Product, StockMovement, Brand, Category, Alert, FilterOptions, StoreConfig
} from '../types';
import { getSession, login as authLogin, logout as authLogout } from '../lib/auth';
import {
  getProducts, getBrands, getCategories, getMovements, getAlerts,
  createProduct, updateProduct, deleteProduct,
  createMovement, deleteMovement, markAlertRead, markAllAlertsRead,
  getStoreConfig, updateStoreConfig, loadRemoteToLocal
} from '../lib/database';

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Data
  products: Product[];
  movements: StockMovement[];
  brands: Brand[];
  categories: Category[];
  alerts: Alert[];
  storeConfig: StoreConfig;

  // UI
  sidebarOpen: boolean;
  filters: FilterOptions;
  searchQuery: string;
  currentPage: number;
  loading: boolean;

  // Auth actions
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  initSession: () => void;

  // Data actions
  loadData: () => void;
  addProduct: (data: Omit<Product, 'id' | 'sku' | 'createdAt' | 'updatedAt' | 'totalQuantity'>) => Product;
  editProduct: (id: string, data: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  addMovement: (data: Omit<StockMovement, 'id' | 'createdAt' | 'previousQuantity' | 'newQuantity'>) => StockMovement | null;
  removeMovement: (id: string) => Promise<boolean>;
  readAlert: (id: string) => void;
  readAllAlerts: () => void;
  updateStoreConfig: (data: Partial<StoreConfig>) => void;

  // UI actions
  setSidebarOpen: (open: boolean) => void;
  setFilters: (filters: Partial<FilterOptions>) => void;
  resetFilters: () => void;
  setSearchQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
}

const defaultFilters: FilterOptions = {
  search: '',
  brandId: '',
  categoryId: '',
  subcategoryId: '',
  size: '',
  color: '',
  status: '',
  minPrice: '',
  maxPrice: '',
  stockStatus: 'all',
};

export const useStore = create<AppState>()(
  immer((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    products: [],
    movements: [],
    brands: [],
    categories: [],
    alerts: [],
    storeConfig: getStoreConfig(),
    sidebarOpen: true,
    filters: defaultFilters,
    searchQuery: '',
    currentPage: 1,
    loading: false,

    initSession: () => {
      const { user, token } = getSession();
      set(state => {
        state.user = user;
        state.token = token;
        state.isAuthenticated = !!user;
      });
      if (user) get().loadData();
    },

    login: (email, password) => {
      const result = authLogin(email, password);
      if (result.success && result.user && result.token) {
        set(state => {
          state.user = result.user!;
          state.token = result.token!;
          state.isAuthenticated = true;
        });
        get().loadData();
      }
      return { success: result.success, error: result.error };
    },

    logout: () => {
      authLogout();
      set(state => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.products = [];
        state.movements = [];
        state.alerts = [];
      });
    },

    loadData: () => {
        // Try to load remote data first (background). localStorage will be updated if remote exists.
        loadRemoteToLocal().then(() => {
          const products = getProducts();
          const movements = getMovements();
          const brands = getBrands();
          const categories = getCategories();
          const alerts = getAlerts();
          const storeConfig = getStoreConfig();
          set(state => {
            state.products = products;
            state.movements = movements;
            state.brands = brands;
            state.categories = categories;
            state.alerts = alerts;
            state.storeConfig = storeConfig;
          });
        }).catch((error) => {
          console.error('[SUPABASE LOAD ERROR]', error);
          const products = getProducts();
          const movements = getMovements();
          const brands = getBrands();
          const categories = getCategories();
          const alerts = getAlerts();
          const storeConfig = getStoreConfig();
          set(state => {
            state.products = products;
            state.movements = movements;
            state.brands = brands;
            state.categories = categories;
            state.alerts = alerts;
            state.storeConfig = storeConfig;
          });
        });
    },

    addProduct: (data) => {
      const product = createProduct(data);
      set(state => {
        state.products.push(product);
        state.alerts = getAlerts();
      });
      return product;
    },

    editProduct: (id, data) => {
      const updated = updateProduct(id, data);
      if (updated) {
        set(state => {
          const index = state.products.findIndex(p => p.id === id);
          if (index !== -1) state.products[index] = updated;
          state.alerts = getAlerts();
        });
      }
    },

    removeProduct: (id) => {
      deleteProduct(id);
      set(state => {
        state.products = state.products.filter(p => p.id !== id);
      });
    },

    addMovement: (data) => {
      const movement = createMovement(data);
      if (movement) {
        const products = getProducts();
        set(state => {
          state.movements.unshift(movement);
          state.products = products;
          state.alerts = getAlerts();
        });
      }
      return movement;
    },

    removeMovement: async (id) => {
      const removed = await deleteMovement(id);
      if (removed) {
        const products = getProducts();
        const movements = getMovements();
        set(state => {
          state.movements = movements;
          state.products = products;
          state.alerts = getAlerts();
        });
      }
      return removed;
    },

    readAlert: (id) => {
      markAlertRead(id);
      set(state => {
        const alert = state.alerts.find(a => a.id === id);
        if (alert) alert.read = true;
      });
    },

    readAllAlerts: () => {
      markAllAlertsRead();
      set(state => {
        state.alerts.forEach(a => { a.read = true; });
      });
    },

    updateStoreConfig: (data) => {
      const updated = updateStoreConfig(data);
      set(state => {
        state.storeConfig = updated;
      });
    },

    setSidebarOpen: (open) => set(state => { state.sidebarOpen = open; }),
    setFilters: (filters) => set(state => { Object.assign(state.filters, filters); state.currentPage = 1; }),
    resetFilters: () => set(state => { state.filters = defaultFilters; state.currentPage = 1; }),
    setSearchQuery: (query) => set(state => { state.searchQuery = query; state.currentPage = 1; }),
    setCurrentPage: (page) => set(state => { state.currentPage = page; }),
  }))
);

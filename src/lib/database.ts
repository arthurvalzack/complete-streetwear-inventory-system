import { Product, StockMovement, Brand, Category, Alert, StoreConfig } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

// Database keys
const PRODUCTS_KEY = 'stck_products';
const MOVEMENTS_KEY = 'stck_movements';
const BRANDS_KEY = 'stck_brands';
const CATEGORIES_KEY = 'stck_categories';
const ALERTS_KEY = 'stck_alerts';
const STORE_CONFIG_KEY = 'stck_store_config';
const INITIALIZED_KEY = 'stck_db_initialized';

// When true, avoid syncing local changes up to remote (used during initial seeding)
let suppressRemoteSync = false;
// Utility functions
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSKU(brandSlug: string, categorySlug: string, index: number): string {
  const brand = brandSlug.toUpperCase().slice(0, 3);
  const cat = categorySlug.toUpperCase().slice(0, 3);
  const num = String(index).padStart(4, '0');
  return `${brand}-${cat}-${num}`;
}

// Data retrieval
export function getProducts(): Product[] {
  const raw = localStorage.getItem(PRODUCTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getMovements(): StockMovement[] {
  const raw = localStorage.getItem(MOVEMENTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getBrands(): Brand[] {
  const raw = localStorage.getItem(BRANDS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getCategories(): Category[] {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getAlerts(): Alert[] {
  const raw = localStorage.getItem(ALERTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Data saving
function saveProducts(products: Product[]): void {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  // try sync to remote
  if (isSupabaseConfigured && !suppressRemoteSync) syncAllToRemote().catch(() => {});
}

function saveMovements(movements: StockMovement[]): void {
  localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements));
  if (isSupabaseConfigured && !suppressRemoteSync) syncAllToRemote().catch(() => {});
}

function saveBrands(brands: Brand[]): void {
  localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
  if (isSupabaseConfigured && !suppressRemoteSync) syncAllToRemote().catch(() => {});
}

function saveCategories(categories: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  if (isSupabaseConfigured && !suppressRemoteSync) syncAllToRemote().catch(() => {});
}

function saveAlerts(alerts: Alert[]): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  if (isSupabaseConfigured && !suppressRemoteSync) syncAllToRemote().catch(() => {});
}

// Product operations
export function createProduct(data: Omit<Product, 'id' | 'sku' | 'createdAt' | 'updatedAt' | 'totalQuantity'>): Product {
  const products = getProducts();
  const brands = getBrands();
  const categories = getCategories();
  const brand = brands.find(b => b.id === data.brandId);
  const category = categories.find(c => c.id === data.categoryId);
  const skuIndex = products.length + 1;
  const sku = generateSKU(brand?.slug || 'PRD', category?.slug || 'GEN', skuIndex);
  const totalQuantity = data.variants.reduce((acc, v) => acc + v.quantity, 0);
  const now = new Date().toISOString();
  const product: Product = {
    ...data,
    id: generateId('prod'),
    sku,
    totalQuantity,
    createdAt: now,
    updatedAt: now,
  };
  product.variants = product.variants.map((v, i) => ({
    ...v,
    id: generateId('var'),
    productId: product.id,
    sku: `${sku}-${v.size.toUpperCase()}-${v.color.toUpperCase().slice(0, 3)}-${i + 1}`,
  }));
  products.push(product);
  saveProducts(products);
  checkStockAlerts(product);
  return product;
}

export function updateProduct(id: string, data: Partial<Product>): Product | null {
  const products = getProducts();
  const index = products.findIndex(p => p.id === id);
  if (index === -1) return null;
  const totalQuantity = data.variants
    ? data.variants.reduce((acc, v) => acc + v.quantity, 0)
    : products[index].totalQuantity;
  const updated: Product = {
    ...products[index],
    ...data,
    totalQuantity,
    updatedAt: new Date().toISOString(),
  };
  products[index] = updated;
  saveProducts(products);
  checkStockAlerts(updated);
  return updated;
}

export function deleteProduct(id: string): boolean {
  const products = getProducts();
  const filtered = products.filter(p => p.id !== id);
  if (filtered.length === products.length) return false;
  saveProducts(filtered);
  return true;
}

export function deleteMovement(id: string): boolean {
  const movements = getMovements();
  const filtered = movements.filter(m => m.id !== id);
  if (filtered.length === movements.length) return false;
  saveMovements(filtered);
  return true;
}

export function getProductById(id: string): Product | null {
  return getProducts().find(p => p.id === id) || null;
}

// Movement operations
export function createMovement(data: Omit<StockMovement, 'id' | 'createdAt' | 'previousQuantity' | 'newQuantity'>): StockMovement | null {
  const products = getProducts();
  const productIndex = products.findIndex(p => p.id === data.productId);
  if (productIndex === -1) return null;

  const product = products[productIndex];
  let previousQuantity = 0;
  let newQuantity = 0;
  // determine pricing info
  let unitPrice = product.salePrice || 0;
  let costPrice = product.costPrice || 0;
  if (data.variantId) {
    const variant = product.variants.find(v => v.id === data.variantId);
    if (variant) {
      unitPrice = variant.salePrice ?? unitPrice;
      costPrice = variant.costPrice ?? costPrice;
    }
  }

  // validations
  if (data.quantity <= 0) return null;

  if (data.variantId) {
    const variantIndex = product.variants.findIndex(v => v.id === data.variantId);
    if (variantIndex === -1) return null;
    previousQuantity = product.variants[variantIndex].quantity;

    if (data.type === 'entry' || data.type === 'return') {
      newQuantity = previousQuantity + data.quantity;
    } else if (data.type === 'exit') {
      // prevent selling more than available
      if (data.quantity > previousQuantity) return null;
      newQuantity = previousQuantity - data.quantity;
    } else if (data.type === 'adjustment') {
      newQuantity = data.quantity;
    }

    product.variants[variantIndex].quantity = newQuantity;
  } else {
    previousQuantity = product.totalQuantity;
    if (data.type === 'entry' || data.type === 'return') {
      newQuantity = previousQuantity + data.quantity;
    } else if (data.type === 'exit') {
      // prevent selling more than total stock
      if (data.quantity > previousQuantity) return null;
      newQuantity = previousQuantity - data.quantity;
    } else if (data.type === 'adjustment') {
      newQuantity = data.quantity;
    }
    // Distribute proportionally across variants
    if (product.variants.length > 0) {
      const diff = newQuantity - previousQuantity;
      const perVariant = Math.floor(Math.abs(diff) / product.variants.length);
      product.variants.forEach((v, i) => {
        if (diff > 0) {
          product.variants[i].quantity += perVariant;
        } else {
          product.variants[i].quantity = Math.max(0, v.quantity - perVariant);
        }
      });
    }
  }

  product.totalQuantity = product.variants.reduce((acc, v) => acc + v.quantity, 0);
  product.updatedAt = new Date().toISOString();
  products[productIndex] = product;
  saveProducts(products);

  const movement: StockMovement = {
    ...data,
    id: generateId('mov'),
    previousQuantity,
    newQuantity,
    createdAt: new Date().toISOString(),
    unitPrice,
    costPrice,
    totalValue: Number((unitPrice * data.quantity).toFixed(2)),
    productName: product.name,
    product: product,
    variant: data.variantId ? product.variants.find(v => v.id === data.variantId) : undefined,
  };

  const movements = getMovements();
  movements.unshift(movement);
  saveMovements(movements);
  checkStockAlerts(product);
  return movement;
}

// Alert operations
function checkStockAlerts(product: Product): void {
  const alerts = getAlerts().filter(a => a.productId !== product.id);
  const LOW_STOCK_THRESHOLD = 5;

  if (product.totalQuantity === 0) {
    alerts.push({
      id: generateId('alert'),
      type: 'out_of_stock',
      message: `Produto "${product.name}" está ESGOTADO`,
      productId: product.id,
      createdAt: new Date().toISOString(),
      read: false,
    });
  } else if (product.totalQuantity <= LOW_STOCK_THRESHOLD) {
    alerts.push({
      id: generateId('alert'),
      type: 'low_stock',
      message: `Estoque baixo: "${product.name}" — ${product.totalQuantity} unidades restantes`,
      productId: product.id,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }
  saveAlerts(alerts);
}

export function markAlertRead(id: string): void {
  const alerts = getAlerts().map(a => a.id === id ? { ...a, read: true } : a);
  saveAlerts(alerts);
}

export function markAllAlertsRead(): void {
  const alerts = getAlerts().map(a => ({ ...a, read: true }));
  saveAlerts(alerts);
}

// Store config operations
export function getStoreConfig(): StoreConfig {
  const raw = localStorage.getItem(STORE_CONFIG_KEY);
  if (!raw) {
    return {
      storeName: 'FRAZON STORE',
      logoUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  try { return JSON.parse(raw); } catch { 
    return {
      storeName: 'FRAZON STORE',
      logoUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export function updateStoreConfig(data: Partial<StoreConfig>): StoreConfig {
  const config = getStoreConfig();
  const updated: StoreConfig = {
    ...config,
    ...data,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORE_CONFIG_KEY, JSON.stringify(updated));
  if (isSupabaseConfigured) syncAllToRemote().catch(() => {});
  return updated;
}

// Remote sync helpers (simple single-row JSON storage)
async function syncAllToRemote(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const payload = {
      products: getProducts(),
      movements: getMovements(),
      brands: getBrands(),
      categories: getCategories(),
      alerts: getAlerts(),
      storeConfig: getStoreConfig(),
    };
    await supabase.from('app_state').upsert([{ id: 'global', data: payload }], { returning: 'minimal' });
  } catch (e) {
    // fail silently — keep working offline
  }
}

export async function loadRemoteToLocal(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data, error } = await supabase.from('app_state').select('data').eq('id', 'global').single();
    if (error || !data) return;
    const remote = data.data as Record<string, unknown> | undefined;
    if (!remote) return;
    // If local already has data (or was initialized), do not overwrite it with remote demo data.
    // This prevents losing local edits when a remote seed exists.
    const localProducts = getProducts();
    if (localProducts && localProducts.length > 0) return;
    if (localStorage.getItem(INITIALIZED_KEY)) return;

    if (remote.products) saveProducts(remote.products as Product[]);
    if (remote.movements) saveMovements(remote.movements as StockMovement[]);
    if (remote.brands) saveBrands(remote.brands as Brand[]);
    if (remote.categories) saveCategories(remote.categories as Category[]);
    if (remote.alerts) saveAlerts(remote.alerts as Alert[]);
    if (remote.storeConfig) localStorage.setItem(STORE_CONFIG_KEY, JSON.stringify(remote.storeConfig));
  } catch (e) {
    // ignore
  }
}

// Brand & Category operations
export function createBrand(data: Omit<Brand, 'id'>): Brand {
  const brands = getBrands();
  const brand: Brand = { ...data, id: generateId('brand') };
  brands.push(brand);
  saveBrands(brands);
  return brand;
}

export function getOrCreateBrand(name: string): Brand {
  const brands = getBrands();
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  
  // Check if brand exists
  const existing = brands.find(b => b.slug === slug || b.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  
  // Create new brand
  const brand: Brand = {
    id: generateId('brand'),
    name: name.trim(),
    slug: slug,
  };
  brands.push(brand);
  saveBrands(brands);
  return brand;
}

export function createCategory(data: Omit<Category, 'id'>): Category {
  const categories = getCategories();
  const category: Category = { ...data, id: generateId('cat') };
  categories.push(category);
  saveCategories(categories);
  return category;
}

// Seed data
export function seedDatabase(): void {
  if (localStorage.getItem(INITIALIZED_KEY)) return;

  // Avoid pushing demo data to remote during initial seeding
  suppressRemoteSync = true;

  // Brands
  const brands: Brand[] = [
    { id: 'brand_001', name: 'Supreme', slug: 'supreme' },
    { id: 'brand_002', name: 'Off-White', slug: 'off-white' },
    { id: 'brand_003', name: 'Stüssy', slug: 'stussy' },
    { id: 'brand_004', name: 'Palace', slug: 'palace' },
    { id: 'brand_005', name: 'BAPE', slug: 'bape' },
    { id: 'brand_006', name: 'Nike SB', slug: 'nike-sb' },
    { id: 'brand_007', name: 'Carhartt WIP', slug: 'carhartt-wip' },
    { id: 'brand_008', name: 'Pleasures', slug: 'pleasures' },
  ];
  saveBrands(brands);

  // Categories
  const categories: Category[] = [
    {
      id: 'cat_001', name: 'Camisetas', slug: 'camisetas',
      subcategories: [
        { id: 'sub_001', name: 'Manga Curta', slug: 'manga-curta', categoryId: 'cat_001' },
        { id: 'sub_002', name: 'Manga Longa', slug: 'manga-longa', categoryId: 'cat_001' },
        { id: 'sub_009', name: 'Regata', slug: 'regata', categoryId: 'cat_001' },
      ]
    },
    {
      id: 'cat_002', name: 'Hoodies & Moletons', slug: 'hoodies',
      subcategories: [
        { id: 'sub_004', name: 'Pullover', slug: 'pullover', categoryId: 'cat_002' },
        { id: 'sub_005', name: 'Zip-Up', slug: 'zip-up', categoryId: 'cat_002' },
      ]
    },
    {
      id: 'cat_003', name: 'Calças', slug: 'calcas',
      subcategories: [
        { id: 'sub_006', name: 'Cargo', slug: 'cargo', categoryId: 'cat_003' },
        { id: 'sub_007', name: 'Jeans', slug: 'jeans', categoryId: 'cat_003' },
        { id: 'sub_008', name: 'Sweatpants', slug: 'sweatpants', categoryId: 'cat_003' },
      ]
    },
    {
      id: 'cat_004', name: 'Bermudas e Shorts', slug: 'bermudas-shorts',
      subcategories: [
        { id: 'sub_010', name: 'Tactel', slug: 'tactel', categoryId: 'cat_004' },
        { id: 'sub_011', name: 'Drifit', slug: 'drifit', categoryId: 'cat_004' },
        { id: 'sub_012', name: 'Jeans', slug: 'jeans-bermuda', categoryId: 'cat_004' },
      ]
    },
    {
      id: 'cat_005', name: 'Jaquetas', slug: 'jaquetas',
      subcategories: [
        { id: 'sub_013', name: 'Bomber', slug: 'bomber', categoryId: 'cat_005' },
        { id: 'sub_014', name: 'Coach Jacket', slug: 'coach-jacket', categoryId: 'cat_005' },
        { id: 'sub_015', name: 'Puffer', slug: 'puffer', categoryId: 'cat_005' },
      ]
    },
    {
      id: 'cat_006', name: 'Tênis & Sneakers', slug: 'tenis',
      subcategories: [
        { id: 'sub_016', name: 'Low Top', slug: 'low-top', categoryId: 'cat_006' },
        { id: 'sub_017', name: 'High Top', slug: 'high-top', categoryId: 'cat_006' },
        { id: 'sub_018', name: 'Chunky', slug: 'chunky', categoryId: 'cat_006' },
      ]
    },
    {
      id: 'cat_007', name: 'Acessórios', slug: 'acessorios',
      subcategories: [
        { id: 'sub_019', name: 'Bonés', slug: 'bones', categoryId: 'cat_007' },
        { id: 'sub_020', name: 'Meias', slug: 'meias', categoryId: 'cat_007' },
        { id: 'sub_021', name: 'Bags', slug: 'bags', categoryId: 'cat_007' },
      ]
    },
  ];
  saveCategories(categories);

  // Seed products
  const now = new Date().toISOString();

  const productsData: Omit<Product, 'id' | 'sku' | 'totalQuantity'>[] = [
    {
      name: 'Supreme Box Logo Tee',
      brandId: 'brand_001', brand: brands[0],
      categoryId: 'cat_001', category: categories[0],
      subcategoryId: 'sub_001', subcategory: categories[0].subcategories[0],
      description: 'Camiseta clássica Supreme com Box Logo bordado. 100% algodão premium.',
      tags: ['logo', 'classic', 'hype', 'collab'],
      images: ['https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 180, salePrice: 450,
      variants: [
        { id: 'v1', productId: '', sku: '', size: 'P', color: 'Preto', colorHex: '#000000', quantity: 15, costPrice: 180, salePrice: 450 },
        { id: 'v2', productId: '', sku: '', size: 'M', color: 'Preto', colorHex: '#000000', quantity: 22, costPrice: 180, salePrice: 450 },
        { id: 'v3', productId: '', sku: '', size: 'G', color: 'Preto', colorHex: '#000000', quantity: 18, costPrice: 180, salePrice: 450 },
        { id: 'v4', productId: '', sku: '', size: 'M', color: 'Branco', colorHex: '#FFFFFF', quantity: 12, costPrice: 180, salePrice: 450 },
        { id: 'v5', productId: '', sku: '', size: 'G', color: 'Branco', colorHex: '#FFFFFF', quantity: 8, costPrice: 180, salePrice: 450 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Off-White Industrial Belt Tee',
      brandId: 'brand_002', brand: brands[1],
      categoryId: 'cat_001', category: categories[0],
      subcategoryId: 'sub_001', subcategory: categories[0].subcategories[0],
      description: 'Tee Off-White com faixa industrial característica. Algodão 100%.',
      tags: ['virgil', 'industrial', 'luxury', 'streetwear'],
      images: ['https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 320, salePrice: 890,
      variants: [
        { id: 'v6', productId: '', sku: '', size: 'P', color: 'Branco', colorHex: '#FFFFFF', quantity: 5, costPrice: 320, salePrice: 890 },
        { id: 'v7', productId: '', sku: '', size: 'M', color: 'Branco', colorHex: '#FFFFFF', quantity: 3, costPrice: 320, salePrice: 890 },
        { id: 'v8', productId: '', sku: '', size: 'G', color: 'Preto', colorHex: '#000000', quantity: 4, costPrice: 320, salePrice: 890 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Stüssy 8 Ball Hoodie',
      brandId: 'brand_003', brand: brands[2],
      categoryId: 'cat_002', category: categories[1],
      subcategoryId: 'sub_004', subcategory: categories[1].subcategories[0],
      description: 'Moletom icônico Stüssy com estampa 8 Ball. Fleece premium.',
      tags: ['8ball', 'hoodie', 'iconic', 'fleece'],
      images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 250, salePrice: 620,
      variants: [
        { id: 'v9', productId: '', sku: '', size: 'M', color: 'Preto', colorHex: '#000000', quantity: 20, costPrice: 250, salePrice: 620 },
        { id: 'v10', productId: '', sku: '', size: 'G', color: 'Preto', colorHex: '#000000', quantity: 25, costPrice: 250, salePrice: 620 },
        { id: 'v11', productId: '', sku: '', size: 'GG', color: 'Cinza', colorHex: '#6B7280', quantity: 15, costPrice: 250, salePrice: 620 },
        { id: 'v12', productId: '', sku: '', size: 'M', color: 'Cinza', colorHex: '#6B7280', quantity: 10, costPrice: 250, salePrice: 620 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Palace Tri-Ferg Logo Tee',
      brandId: 'brand_004', brand: brands[3],
      categoryId: 'cat_001', category: categories[0],
      subcategoryId: 'sub_001', subcategory: categories[0].subcategories[0],
      description: 'Camiseta Palace com o icônico logo Tri-Ferg. UK Streetwear.',
      tags: ['tri-ferg', 'uk', 'skate', 'hype'],
      images: ['https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 150, salePrice: 380,
      variants: [
        { id: 'v13', productId: '', sku: '', size: 'P', color: 'Azul', colorHex: '#3B82F6', quantity: 8, costPrice: 150, salePrice: 380 },
        { id: 'v14', productId: '', sku: '', size: 'M', color: 'Azul', colorHex: '#3B82F6', quantity: 12, costPrice: 150, salePrice: 380 },
        { id: 'v15', productId: '', sku: '', size: 'G', color: 'Vermelho', colorHex: '#EF4444', quantity: 6, costPrice: 150, salePrice: 380 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'BAPE Shark Full-Zip Hoodie',
      brandId: 'brand_005', brand: brands[4],
      categoryId: 'cat_002', category: categories[1],
      subcategoryId: 'sub_005', subcategory: categories[1].subcategories[1],
      description: 'Hoodie zip BAPE Shark Face com camo. 100% algodão Japonês.',
      tags: ['shark', 'camo', 'japan', 'bape', 'luxury'],
      images: ['https://images.unsplash.com/photo-1520975910227-e4d662da5755?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 580, salePrice: 1850,
      variants: [
        { id: 'v16', productId: '', sku: '', size: 'M', color: 'Verde', colorHex: '#10B981', quantity: 3, costPrice: 580, salePrice: 1850 },
        { id: 'v17', productId: '', sku: '', size: 'G', color: 'Verde', colorHex: '#10B981', quantity: 2, costPrice: 580, salePrice: 1850 },
        { id: 'v18', productId: '', sku: '', size: 'GG', color: 'Preto', colorHex: '#000000', quantity: 1, costPrice: 580, salePrice: 1850 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Nike SB Dunk Low Pro',
      brandId: 'brand_006', brand: brands[5],
      categoryId: 'cat_005', category: categories[4],
      subcategoryId: 'sub_012', subcategory: categories[4].subcategories[0],
      description: 'Dunk Low Pro SB. Sola de borracha, palmilha Zoom Air.',
      tags: ['dunk', 'nike', 'sb', 'skateboarding'],
      images: ['https://images.unsplash.com/photo-1517960464808-5bc2175a58a4?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 280, salePrice: 750,
      variants: [
        { id: 'v19', productId: '', sku: '', size: '40', color: 'Preto', colorHex: '#000000', quantity: 4, costPrice: 280, salePrice: 750 },
        { id: 'v20', productId: '', sku: '', size: '41', color: 'Preto', colorHex: '#000000', quantity: 6, costPrice: 280, salePrice: 750 },
        { id: 'v21', productId: '', sku: '', size: '42', color: 'Branco', colorHex: '#FFFFFF', quantity: 5, costPrice: 280, salePrice: 750 },
        { id: 'v22', productId: '', sku: '', size: '43', color: 'Branco', colorHex: '#FFFFFF', quantity: 3, costPrice: 280, salePrice: 750 },
        { id: 'v23', productId: '', sku: '', size: '44', color: 'Vermelho', colorHex: '#EF4444', quantity: 2, costPrice: 280, salePrice: 750 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Carhartt WIP Michigan Chore Coat',
      brandId: 'brand_007', brand: brands[6],
      categoryId: 'cat_004', category: categories[3],
      subcategoryId: 'sub_009', subcategory: categories[3].subcategories[0],
      description: 'Michigan Chore Coat em duck canvas. Workwear clássico.',
      tags: ['workwear', 'canvas', 'classic', 'chore-coat'],
      images: ['https://images.unsplash.com/photo-1531627154092-787c9ee6e9f4?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 340, salePrice: 820,
      variants: [
        { id: 'v24', productId: '', sku: '', size: 'M', color: 'Bege', colorHex: '#D4B896', quantity: 7, costPrice: 340, salePrice: 820 },
        { id: 'v25', productId: '', sku: '', size: 'G', color: 'Bege', colorHex: '#D4B896', quantity: 9, costPrice: 340, salePrice: 820 },
        { id: 'v26', productId: '', sku: '', size: 'G', color: 'Preto', colorHex: '#000000', quantity: 5, costPrice: 340, salePrice: 820 },
        { id: 'v27', productId: '', sku: '', size: 'GG', color: 'Preto', colorHex: '#000000', quantity: 3, costPrice: 340, salePrice: 820 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Pleasures Sinner Cargo Pant',
      brandId: 'brand_008', brand: brands[7],
      categoryId: 'cat_003', category: categories[2],
      subcategoryId: 'sub_006', subcategory: categories[2].subcategories[0],
      description: 'Cargo pant Pleasures com múltiplos bolsos. Ripstop fabric.',
      tags: ['cargo', 'pants', 'ripstop', 'utility'],
      images: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 220, salePrice: 560,
      variants: [
        { id: 'v28', productId: '', sku: '', size: 'P', color: 'Preto', colorHex: '#000000', quantity: 0, costPrice: 220, salePrice: 560 },
        { id: 'v29', productId: '', sku: '', size: 'M', color: 'Preto', colorHex: '#000000', quantity: 14, costPrice: 220, salePrice: 560 },
        { id: 'v30', productId: '', sku: '', size: 'G', color: 'Cinza', colorHex: '#6B7280', quantity: 11, costPrice: 220, salePrice: 560 },
        { id: 'v31', productId: '', sku: '', size: 'GG', color: 'Cinza', colorHex: '#6B7280', quantity: 6, costPrice: 220, salePrice: 560 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Supreme Camp Cap',
      brandId: 'brand_001', brand: brands[0],
      categoryId: 'cat_006', category: categories[5],
      subcategoryId: 'sub_015', subcategory: categories[5].subcategories[0],
      description: 'Boné 6 panel Supreme Camp Cap. Logo bordado. Ajuste de metal.',
      tags: ['cap', 'logo', '6panel', 'camp'],
      images: ['https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 90, salePrice: 280,
      variants: [
        { id: 'v32', productId: '', sku: '', size: 'Único', color: 'Preto', colorHex: '#000000', quantity: 30, costPrice: 90, salePrice: 280 },
        { id: 'v33', productId: '', sku: '', size: 'Único', color: 'Vermelho', colorHex: '#EF4444', quantity: 20, costPrice: 90, salePrice: 280 },
        { id: 'v34', productId: '', sku: '', size: 'Único', color: 'Azul', colorHex: '#3B82F6', quantity: 4, costPrice: 90, salePrice: 280 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Stüssy World Tour Crewneck',
      brandId: 'brand_003', brand: brands[2],
      categoryId: 'cat_002', category: categories[1],
      subcategoryId: 'sub_004', subcategory: categories[1].subcategories[0],
      description: 'Crewneck Stüssy World Tour. Fleece de alta gramatura.',
      tags: ['world-tour', 'crewneck', 'fleece', 'classic'],
      images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 200, salePrice: 490,
      variants: [
        { id: 'v35', productId: '', sku: '', size: 'M', color: 'Laranja', colorHex: '#F97316', quantity: 2, costPrice: 200, salePrice: 490 },
        { id: 'v36', productId: '', sku: '', size: 'G', color: 'Laranja', colorHex: '#F97316', quantity: 1, costPrice: 200, salePrice: 490 },
        { id: 'v37', productId: '', sku: '', size: 'GG', color: 'Preto', colorHex: '#000000', quantity: 0, costPrice: 200, salePrice: 490 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Off-White Diag Zip Hoodie',
      brandId: 'brand_002', brand: brands[1],
      categoryId: 'cat_002', category: categories[1],
      subcategoryId: 'sub_005', subcategory: categories[1].subcategories[1],
      description: 'Zip Hoodie Off-White com estampa diagonal iconic.',
      tags: ['diagonal', 'zip', 'virgil', 'luxury'],
      images: ['https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80'],
      status: 'inactive',
      costPrice: 450, salePrice: 1200,
      variants: [
        { id: 'v38', productId: '', sku: '', size: 'M', color: 'Preto', colorHex: '#000000', quantity: 1, costPrice: 450, salePrice: 1200 },
        { id: 'v39', productId: '', sku: '', size: 'G', color: 'Preto', colorHex: '#000000', quantity: 0, costPrice: 450, salePrice: 1200 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Carhartt WIP Chase Sweatpant',
      brandId: 'brand_007', brand: brands[6],
      categoryId: 'cat_003', category: categories[2],
      subcategoryId: 'sub_008', subcategory: categories[2].subcategories[2],
      description: 'Sweatpant Carhartt WIP Chase. Moletom premium.',
      tags: ['sweatpant', 'jogger', 'essentials'],
      images: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80'],
      status: 'active',
      costPrice: 180, salePrice: 420,
      variants: [
        { id: 'v40', productId: '', sku: '', size: 'P', color: 'Preto', colorHex: '#000000', quantity: 16, costPrice: 180, salePrice: 420 },
        { id: 'v41', productId: '', sku: '', size: 'M', color: 'Preto', colorHex: '#000000', quantity: 19, costPrice: 180, salePrice: 420 },
        { id: 'v42', productId: '', sku: '', size: 'G', color: 'Cinza', colorHex: '#6B7280', quantity: 13, costPrice: 180, salePrice: 420 },
      ],
      createdAt: now, updatedAt: now,
    },
  ];

  // Save products with proper IDs and SKUs
  const products: Product[] = productsData.map((p, i) => {
    const brand = brands.find(b => b.id === p.brandId);
    const category = categories.find(c => c.id === p.categoryId);
    const sku = generateSKU(brand?.slug || 'PRD', category?.slug || 'GEN', i + 1);
    const id = `prod_${String(i + 1).padStart(3, '0')}`;
    const totalQuantity = p.variants.reduce((acc, v) => acc + v.quantity, 0);
    return {
      ...p,
      id,
      sku,
      totalQuantity,
      variants: p.variants.map((v, j) => ({
        ...v,
        id: `var_${String(i + 1).padStart(3, '0')}_${j + 1}`,
        productId: id,
        sku: `${sku}-${v.size.toUpperCase()}-${v.color.toUpperCase().slice(0, 3)}-${j + 1}`,
      })),
    };
  });
  saveProducts(products);

  // Seed some movements
  const movements: StockMovement[] = [];
  const movementTypes: StockMovement['type'][] = ['entry', 'exit', 'exit', 'entry', 'adjustment'];
  const reasons = ['Compra fornecedor', 'Venda balcão', 'Venda online', 'Reposição estoque', 'Ajuste inventário'];

  for (let i = 0; i < 30; i++) {
    const product = products[Math.floor(Math.random() * products.length)];
    const variant = product.variants[Math.floor(Math.random() * product.variants.length)];
    const type = movementTypes[Math.floor(Math.random() * movementTypes.length)];
    const qty = Math.floor(Math.random() * 10) + 1;
    const date = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    movements.push({
      id: `mov_${String(i + 1).padStart(3, '0')}`,
      productId: product.id,
      product,
      variantId: variant.id,
      variant,
      type,
      quantity: qty,
      previousQuantity: variant.quantity,
      newQuantity: type === 'entry' ? variant.quantity + qty : Math.max(0, variant.quantity - qty),
      reason: reasons[Math.floor(Math.random() * reasons.length)],
      notes: '',
      userId: 'user_admin_001',
      createdAt: date.toISOString(),
    });
  }
  movements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  saveMovements(movements);

  // Initial alerts
  const initialAlerts: Alert[] = [];
  products.forEach(p => {
    if (p.totalQuantity === 0) {
      initialAlerts.push({
        id: generateId('alert'),
        type: 'out_of_stock',
        message: `Produto "${p.name}" está ESGOTADO`,
        productId: p.id,
        createdAt: now,
        read: false,
      });
    } else if (p.totalQuantity <= 5) {
      initialAlerts.push({
        id: generateId('alert'),
        type: 'low_stock',
        message: `Estoque baixo: "${p.name}" — ${p.totalQuantity} unidades restantes`,
        productId: p.id,
        createdAt: now,
        read: false,
      });
    }
  });
  saveAlerts(initialAlerts);

  // Re-enable remote sync after seeding
  suppressRemoteSync = false;
  localStorage.setItem(INITIALIZED_KEY, 'true');
}

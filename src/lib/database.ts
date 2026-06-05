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
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProduct);
  } catch { return []; }
}


// Normalize product fields to a consistent shape
export function normalizeProduct(p: any): Product {
  if (!p) return p;
  const prod: any = { ...p };
  // normalize price fields -> salePrice
  if (prod.salePrice === undefined && prod.price !== undefined) prod.salePrice = Number(prod.price);
  if (prod.salePrice === undefined && prod.sellingPrice !== undefined) prod.salePrice = Number(prod.sellingPrice);
  prod.salePrice = prod.salePrice ? Number(prod.salePrice) : 0;
  prod.costPrice = prod.costPrice ? Number(prod.costPrice) : 0;
  prod.variants = Array.isArray(prod.variants) ? prod.variants.map((v: any) => ({
    ...v,
    quantity: Number(v.quantity) || 0,
    costPrice: v.costPrice !== undefined ? Number(v.costPrice) : prod.costPrice,
    salePrice: v.salePrice !== undefined ? Number(v.salePrice) : prod.salePrice,
  })) : [];
  prod.totalQuantity = prod.variants.reduce((acc: number, v: any) => acc + (Number(v.quantity) || 0), 0);
  // ensure id and slug exist
  prod.id = prod.id || generateId('prod');
  prod.slug = prod.slug || (prod.name ? prod.name.toLowerCase().replace(/\s+/g, '-') : 'product');
  return prod as Product;
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

// Conversion helpers between frontend model and Supabase schema
export function productToSupabase(p: Product): any {
  return {
    id: p.id,
    name: p.name,
    brand_id: p.brandId,
    brand_name: p.brand?.name || p.brand?.name || null,
    category_id: p.categoryId,
    category_name: p.category?.name || null,
    subcategory_id: p.subcategoryId,
    subcategory_name: p.subcategory?.name || null,
    sku: p.sku,
    image: (p.images && p.images[0]) || null,
    cost_price: p.costPrice ?? 0,
    sale_price: p.salePrice ?? 0,
    status: p.status,
    variants: JSON.stringify(p.variants || []),
    tags: JSON.stringify(p.tags || []),
    total_quantity: p.totalQuantity ?? 0,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function productFromSupabase(row: any): Product {
  if (!row) return row;
  const variants = (() => {
    try {
      if (row.variants && typeof row.variants === 'string') return JSON.parse(row.variants);
      if (row.variants && Array.isArray(row.variants)) return row.variants;
      return [];
    } catch (e) { return []; }
  })();
  const prod: any = {
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    brandId: row.brand_id || row.brandId || '',
    brand: row.brand_name ? { id: row.brand_id || '', name: row.brand_name, slug: '' } : undefined,
    categoryId: row.category_id || row.categoryId || '',
    category: row.category_name ? { id: row.category_id || '', name: row.category_name, slug: '' } : undefined,
    subcategoryId: row.subcategory_id || row.subcategoryId || '',
    subcategory: row.subcategory_name ? { id: row.subcategory_id || '', name: row.subcategory_name, slug: '' } : undefined,
    description: row.description || '',
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
    images: row.image ? [row.image] : [],
    status: row.status || 'active',
    variants: (variants || []).map((v: any) => ({
      id: v.id || generateId('var'),
      productId: row.id,
      size: v.size || v.s || '',
      color: v.color || '',
      colorHex: v.colorHex || v.color_hex || '',
      sku: v.sku || '',
      quantity: Number(v.quantity || 0),
      costPrice: Number(v.costPrice ?? v.cost_price ?? row.cost_price ?? 0),
      salePrice: Number(v.salePrice ?? v.sale_price ?? row.sale_price ?? 0),
    })),
    totalQuantity: Number(row.total_quantity ?? 0),
    costPrice: Number(row.cost_price ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
  return normalizeProduct(prod as any);
}

export function movementToSupabase(m: any): any {
  return {
    id: m.id,
    type: m.type || 'sale',
    product_id: m.productId || m.product_id,
    product_name: m.productName || m.product_name,
    brand_name: m.brand || m.brand_name || null,
    category_name: m.category || m.category_name || null,
    subcategory_name: m.subcategory || m.subcategory_name || null,
    variant_id: m.variantId || m.variant_id || null,
    size: m.size || null,
    color: m.color || null,
    quantity: m.quantity,
    unit_price: m.unitPrice ?? m.unit_price ?? 0,
    cost_price: m.costPrice ?? m.cost_price ?? 0,
    total_value: m.totalValue ?? m.total_value ?? 0,
    profit: m.profit ?? 0,
    product_snapshot: JSON.stringify(m.product_snapshot || m.product || null),
    reason: m.reason || null,
    notes: m.notes || null,
    user_id: m.userId || m.user_id || null,
    created_at: m.createdAt || new Date().toISOString(),
    date: m.date || new Date().toISOString(),
  };
}

export function movementFromSupabase(row: any): StockMovement {
  const prodSnapshot = (() => {
    try {
      if (!row.product_snapshot) return undefined;
      if (typeof row.product_snapshot === 'string') return JSON.parse(row.product_snapshot);
      return row.product_snapshot;
    } catch (e) { return undefined; }
  })();
  const mv: any = {
    id: row.id,
    type: row.type,
    productId: row.product_id,
    productName: row.product_name,
    brand: row.brand_name,
    category: row.category_name,
    subcategory: row.subcategory_name,
    variantId: row.variant_id,
    size: row.size,
    color: row.color,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    costPrice: Number(row.cost_price || 0),
    totalValue: Number(row.total_value || 0),
    profit: Number(row.profit || 0),
    product_snapshot: prodSnapshot,
    reason: row.reason,
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at,
  };
  return mv as StockMovement;
}

// Fetch helpers
export async function fetchProductsFromSupabase(): Promise<Product[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('products').select('*');
  if (error) throw error;
  return (data || []).map(productFromSupabase);
}

export async function fetchMovementsFromSupabase(): Promise<StockMovement[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('movements').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(movementFromSupabase);
}

export async function fetchCategoriesFromSupabase(): Promise<Category[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('categories').select('*');
  if (error) throw error;
  return data || [];
}

export async function fetchBrandsFromSupabase(): Promise<Brand[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('brands').select('*');
  if (error) throw error;
  return data || [];
}

export async function saveProductToSupabase(p: Product) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const row = productToSupabase(p);
  const { data, error } = await supabase.from('products').upsert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function updateProductInSupabase(productId: string, p: Partial<Product>) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  // fetch existing, merge and upsert
  const existing = await fetchProductRemote(productId);
  if (!existing) throw new Error('product not found remote');
  const merged: any = { ...productToSupabase(existing), ...productToSupabase({ ...existing, ...p as any }) };
  const { data, error } = await supabase.from('products').upsert([merged]).select().single();
  if (error) throw error;
  return data;
}
// --- Supabase-backed helpers and transactional sale flow ---
async function fetchProductRemote(productId: string): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('products').select('*').eq('id', productId).limit(1).single();
    if (error || !data) return null;
    // normalize variants if needed
    try { return normalizeProduct(data as any); } catch { return data as Product; }
  } catch (e) {
    return null;
  }
}

async function createMovementInSupabase(mov: any) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const payload = { ...mov };
  const { data, error } = await supabase.from('movements').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

async function deleteMovementInSupabase(movementId: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('movements').delete().eq('id', movementId);
  if (error) throw error;
  return true;
}

async function updateProductStockInSupabase(productId: string, updatedProduct: Product) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  // Upsert the whole product row (server schema should accept jsonb variants)
  const { data, error } = await supabase.from('products').upsert([updatedProduct]).select().single();
  if (error) throw error;
  return data;
}

// registerSale: primary sale entrypoint. Attempts a server-side RPC first, falls back to manual flow with rollback.
export async function registerSale(params: {
  productId: string;
  variantId?: string;
  quantity: number;
  userId?: string;
  reason?: string;
  notes?: string;
}): Promise<StockMovement | null> {
  const { productId, variantId, quantity, userId, reason = 'Venda', notes = '' } = params;
  // validations (local cache source-of-truth when supabase not available)
  if (!productId) throw new Error('productId required');
  if (!quantity || Number(quantity) <= 0) throw new Error('quantity must be > 0');

  // get authoritative product (prefer remote)
  let product: Product | null = null;
  if (isSupabaseConfigured && supabase) {
    product = await fetchProductRemote(productId);
  }
  if (!product) product = getProductById(productId);
  if (!product) throw new Error('Produto não encontrado');

  // find variant and available stock
  const variant = variantId ? (product.variants || []).find(v => v.id === variantId) : undefined;
  const availableStock = variant ? Number(variant.quantity || 0) : Number(product.totalQuantity || 0);
  if (quantity > availableStock) throw new Error('Quantidade maior que o estoque disponível');

  // determine pricing
  const unitPrice = variant?.salePrice ?? product.salePrice ?? 0;
  const costPrice = variant?.costPrice ?? product.costPrice ?? 0;
  const totalValue = Number((unitPrice * quantity).toFixed(2));
  const profit = Number((totalValue - (costPrice * quantity)).toFixed(2));

  // build movement payload
  const movementPayload: any = {
    id: generateId('mov'),
    type: 'sale',
    productId: product.id,
    productName: product.name,
    brand: product.brand?.name || product.brandName || null,
    category: product.category?.name || product.categoryName || null,
    subcategory: product.subcategory?.name || product.subcategoryName || null,
    variantId: variant?.id || null,
    size: variant?.size || null,
    color: variant?.color || null,
    quantity: Number(quantity),
    unitPrice: Number(unitPrice),
    costPrice: Number(costPrice),
    totalValue,
    profit,
    product_snapshot: { ...product },
    createdAt: new Date().toISOString(),
    date: new Date().toISOString(),
    reason,
    notes,
    userId: userId || 'system',
  };

  if (isSupabaseConfigured && supabase) {
    // Try RPC first (recommended). If RPC exists on server it should perform transactional update.
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('register_sale', {
        p_product_id: movementPayload.productId,
        p_variant_id: movementPayload.variantId,
        p_quantity: movementPayload.quantity,
        p_unit_price: movementPayload.unitPrice,
        p_cost_price: movementPayload.costPrice,
        p_movement_id: movementPayload.id,
        p_user_id: movementPayload.userId,
        p_payload: movementPayload,
      });
      if (rpcErr) throw rpcErr;
      // RPC returned success and canonical movement
      const savedMovement = rpcData as any;
      // refresh local cache from remote
      await loadRemoteToLocal();
      return savedMovement as StockMovement;
    } catch (rpcError) {
      // RPC not available or failed — fallback to manual sequence with rollback
      try {
        // 1) create movement row remotely
        const created = await createMovementInSupabase(movementPayload);
        // 2) compute updated product with reduced stock
        const updatedProduct = { ...product } as Product;
        if (variant) {
          updatedProduct.variants = (updatedProduct.variants || []).map(v => v.id === variant.id ? { ...v, quantity: Number(v.quantity || 0) - Number(quantity) } : v);
        } else {
          // distribute reduction across variants (take from first variants)
          let remaining = Number(quantity);
          updatedProduct.variants = (updatedProduct.variants || []).map(v => {
            if (remaining <= 0) return v;
            const avail = Number(v.quantity || 0);
            const take = Math.min(avail, remaining);
            remaining -= take;
            return { ...v, quantity: avail - take };
          });
        }
        updatedProduct.totalQuantity = updatedProduct.variants.reduce((acc, v) => acc + (Number(v.quantity) || 0), 0);
        updatedProduct.updatedAt = new Date().toISOString();

        // 3) update product remotely
        try {
          await updateProductStockInSupabase(product.id, updatedProduct);
        } catch (updErr) {
          // rollback: delete created movement
          try { await deleteMovementInSupabase(movementPayload.id); } catch (delErr) {
            console.error('registerSale rollback failed: could not delete movement after product update failure', { movementId: movementPayload.id, productId: product.id, err: delErr });
          }
          throw updErr;
        }

        // 4) on success, refresh local cache and return movement
        await loadRemoteToLocal();
        // find movement in local cache
        const localMov = getMovements().find(m => m.id === movementPayload.id) || created;
        return localMov as StockMovement;
      } catch (manualErr) {
        console.error('registerSale manual flow failed', manualErr, { movementPayload, product, variant, quantity });
        throw manualErr;
      }
    }
  } else {
    // Offline/local-only flow: create movement locally (existing behavior)
    const created = createMovement({
      productId: movementPayload.productId,
      variantId: movementPayload.variantId,
      type: 'exit',
      quantity: movementPayload.quantity,
      reason: movementPayload.reason,
      notes: movementPayload.notes,
      userId: movementPayload.userId,
    } as any);
    return created;
  }
}

// Movement operations
export function createMovement(data: Omit<StockMovement, 'id' | 'createdAt' | 'previousQuantity' | 'newQuantity'>): StockMovement | null {
  try {
    const products = getProducts();
    const productIndex = products.findIndex(p => p.id === data.productId);
    if (productIndex === -1) {
      console.error('createMovement failed: product not found', { productId: data.productId, data });
      return null;
    }

    let product = products[productIndex];
    // ensure normalized
    product = normalizeProduct(product);
    let previousQuantity = 0;
    let newQuantity = 0;
    // determine pricing info
    let unitPrice = Number(product.salePrice) || 0;
    let costPrice = Number(product.costPrice) || 0;
  if (data.variantId) {
    const variant = product.variants.find(v => v.id === data.variantId);
    if (variant) {
      unitPrice = variant.salePrice ?? unitPrice;
      costPrice = variant.costPrice ?? costPrice;
    }
  }

  // validations
    const qty = Number(data.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      console.error('createMovement failed: invalid quantity', { productId: data.productId, variantId: data.variantId, quantity: data.quantity });
      return null;
    }

    if (data.variantId) {
      const variantIndex = product.variants.findIndex(v => v.id === data.variantId);
      if (variantIndex === -1) {
        console.error('createMovement failed: variant not found', { productId: data.productId, variantId: data.variantId });
        return null;
      }
      const variant = product.variants[variantIndex];
      previousQuantity = Number(variant.quantity) || 0;
      // pricing from variant if present
      unitPrice = Number(variant.salePrice) || unitPrice;
      costPrice = Number(variant.costPrice) || costPrice;

      if (data.type === 'entry' || data.type === 'return') {
        newQuantity = previousQuantity + qty;
      } else if (data.type === 'exit') {
        // prevent selling more than available
        if (qty > previousQuantity) {
          console.error('createMovement failed: insufficient stock', { productId: data.productId, variantId: data.variantId, requested: qty, available: previousQuantity });
          return null;
        }
        newQuantity = previousQuantity - qty;
      } else if (data.type === 'adjustment') {
        newQuantity = qty;
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
        const perVariant = Math.floor(Math.abs(diff) / product.variants.length || 0);
        product.variants.forEach((v, i) => {
          if (diff > 0) {
            product.variants[i].quantity = Number(v.quantity || 0) + perVariant;
          } else {
            product.variants[i].quantity = Math.max(0, Number(v.quantity || 0) - perVariant);
          }
        });
      }
  }

    product.totalQuantity = product.variants.reduce((acc, v) => acc + (Number(v.quantity) || 0), 0);
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
      totalValue: Number((unitPrice * qty).toFixed(2)),
      productName: product.name,
      product: product,
      variant: data.variantId ? product.variants.find(v => v.id === data.variantId) : undefined,
    };

  const movements = getMovements();
    movements.unshift(movement);
    saveMovements(movements);
    checkStockAlerts(product);
    return movement;
  } catch (err) {
    console.error('createMovement unexpected error', err, { data });
    return null;
  }
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
export async function syncAllToRemote(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    // Upsert products and movements into dedicated tables when available
    const products = getProducts();
    const movements = getMovements();
    const brands = getBrands();
    const categories = getCategories();

    // Upsert brands and categories as small helpers
    if (brands.length > 0) {
      try { await supabase.from('brands').upsert(brands); } catch (_) { }
    }
    if (categories.length > 0) {
      try { await supabase.from('categories').upsert(categories); } catch (_) { }
    }

    if (products.length > 0) {
      // remove nested fields not intended for product table columns
      const rows = products.map(p => ({ ...p }));
      try { await supabase.from('products').upsert(rows); } catch (_) { }
    }

    if (movements.length > 0) {
      const rows = movements.map(m => ({ ...m }));
      try { await supabase.from('movements').upsert(rows); } catch (_) { }
    }
    // record last sync time for UI
    try { localStorage.setItem('stck_last_sync', new Date().toISOString()); } catch (_) { }
  } catch (e) {
    // fail silently — keep working offline
  }
}

export async function loadRemoteToLocal(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    // Check remote products table
    let remoteProducts = null;
    let remoteMovements = null;
    let remoteBrands = null;
    let remoteCategories = null;
    try { ({ data: remoteProducts } = await supabase.from('products').select('*')); } catch (_) { remoteProducts = null; }
    try { ({ data: remoteMovements } = await supabase.from('movements').select('*')); } catch (_) { remoteMovements = null; }
    try { ({ data: remoteBrands } = await supabase.from('brands').select('*')); } catch (_) { remoteBrands = null; }
    try { ({ data: remoteCategories } = await supabase.from('categories').select('*')); } catch (_) { remoteCategories = null; }

    const hasRemoteProducts = Array.isArray(remoteProducts) && remoteProducts.length > 0;
    const hasRemoteMovements = Array.isArray(remoteMovements) && remoteMovements.length > 0;

    // If remote has data, prefer it and write to local cache
    if (hasRemoteProducts) {
      // normalize remote products before saving locally
      try { saveProducts((remoteProducts || []).map(normalizeProduct)); } catch (_) { saveProducts(remoteProducts as Product[]); }
    }
    if (hasRemoteMovements) {
      saveMovements(remoteMovements as StockMovement[]);
    }
    if (remoteBrands) saveBrands(remoteBrands as Brand[]);
    if (remoteCategories) saveCategories(remoteCategories as Category[]);

    // Do NOT auto-push local -> remote when remote is empty. Manual migration only.
  } catch (e) {
    // ignore
  }
}

// Export full state as JSON (local cache + remote metadata)
export async function exportState(): Promise<Record<string, any>> {
  const state: Record<string, any> = {
    products: getProducts(),
    movements: getMovements(),
    brands: getBrands(),
    categories: getCategories(),
    alerts: getAlerts(),
    storeConfig: getStoreConfig(),
  };
  // include remote snapshot if available
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: remoteProducts } = await supabase.from('products').select('*');
      const { data: remoteMovements } = await supabase.from('movements').select('*');
      state.remote = { products: remoteProducts || null, movements: remoteMovements || null };
    } catch (_) { /* ignore */ }
  }
  return state;
}

// Import full state JSON: writes to local cache and to remote (if configured).
export async function importState(state: Record<string, any>, options?: { overwriteRemote?: boolean }): Promise<void> {
  if (!state) return;
  const { products, movements, brands, categories, alerts, storeConfig } = state as any;

  if (Array.isArray(products)) saveProducts(products as Product[]);
  if (Array.isArray(movements)) saveMovements(movements as StockMovement[]);
  if (Array.isArray(brands)) saveBrands(brands as Brand[]);
  if (Array.isArray(categories)) saveCategories(categories as Category[]);
  if (Array.isArray(alerts)) saveAlerts(alerts as Alert[]);
  if (storeConfig) localStorage.setItem(STORE_CONFIG_KEY, JSON.stringify(storeConfig));

  if (isSupabaseConfigured && supabase) {
    if (options?.overwriteRemote) {
      try { await supabase.from('brands').upsert(brands || []); } catch (_) {}
      try { await supabase.from('categories').upsert(categories || []); } catch (_) {}
      try { await supabase.from('products').upsert(products || []); } catch (_) {}
      try { await supabase.from('movements').upsert(movements || []); } catch (_) {}
    } else {
      // Merge: only insert when remote empty
      try {
        const { data: remoteProducts } = await supabase.from('products').select('*');
        if (!remoteProducts || remoteProducts.length === 0) {
          await supabase.from('products').upsert(products || []);
        }
      } catch (_) {}
      try {
        const { data: remoteMovements } = await supabase.from('movements').select('*');
        if (!remoteMovements || remoteMovements.length === 0) {
          await supabase.from('movements').upsert(movements || []);
        }
      } catch (_) {}
    }
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

export async function addSubcategory(categoryId: string, name: string): Promise<Category | null> {
  const categories = getCategories();
  const idx = categories.findIndex(c => c.id === categoryId);
  if (idx === -1) return null;
  const cat = categories[idx];
  const slug = slugify(name);
  const sub = { id: generateId('sub'), name: name.trim(), slug, categoryId };
  cat.subcategories = cat.subcategories || [];
  // avoid duplicates
  if (cat.subcategories.find(s => s.slug === slug || s.name.toLowerCase() === name.toLowerCase())) return cat;
  cat.subcategories.push(sub);
  categories[idx] = cat;
  saveCategories(categories);
  if (isSupabaseConfigured && supabase) {
    try { await supabase.from('categories').upsert([cat]); } catch (_) { }
  }
  return cat;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const categories = getCategories();
  const category = categories.find(c => c.id === id);
  if (!category) return false;
  // prevent deletion if any product linked to this category
  const products = getProducts();
  const linked = products.some(p => p.categoryId === id);
  if (linked) return false;
  const filtered = categories.filter(c => c.id !== id);
  saveCategories(filtered);
  if (isSupabaseConfigured && supabase) {
    try { await supabase.from('categories').upsert(filtered); } catch (_) { }
  }
  return true;
}

export async function deleteSubcategory(categoryId: string, subId: string): Promise<boolean> {
  const categories = getCategories();
  const idx = categories.findIndex(c => c.id === categoryId);
  if (idx === -1) return false;
  // prevent deletion if any product linked to this subcategory
  const products = getProducts();
  const linked = products.some(p => p.subcategoryId === subId);
  if (linked) return false;
  const cat = categories[idx];
  cat.subcategories = (cat.subcategories || []).filter(s => s.id !== subId);
  categories[idx] = cat;
  saveCategories(categories);
  if (isSupabaseConfigured && supabase) {
    try { await supabase.from('categories').upsert([cat]); } catch (_) { }
  }
  return true;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export async function ensureBaseTaxonomy(): Promise<void> {
  // Ensure base categories/subcategories and optional brands exist for app to function
  try {
    const existingCategories = getCategories();
    const existingBrands = getBrands();

    const base = [
      { name: 'Blusas', subs: ['Moletom', 'Manga longa', 'Básica'] },
      { name: 'Camisetas', subs: ['Oversized', 'Streetwear', 'Básica', 'Estampada'] },
      { name: 'Jaquetas', subs: ['Corta vento', 'Jeans', 'Puffer'] },
      { name: 'Bermudas', subs: ['Jeans', 'Sarja', 'Tactel'] },
      { name: 'Calças', subs: ['Jeans', 'Cargo', 'Moletom'] },
      { name: 'Dry Fit', subs: ['Camisa dry fit', 'Regata dry fit'] },
      { name: 'Acessórios', subs: ['Boné', 'Meia', 'Bolsa'] },
      { name: 'Outros', subs: [] },
    ];

    const toCreateCats: Category[] = [];
    base.forEach((b, idx) => {
      const slug = slugify(b.name);
      const exists = existingCategories.find(c => c.slug === slug || c.name.toLowerCase() === b.name.toLowerCase());
      if (exists) return;
      const catId = `cat_base_${idx + 1}`;
      const cat: Category = {
        id: catId,
        name: b.name,
        slug,
        subcategories: b.subs.map((s, si) => ({ id: `sub_base_${idx + 1}_${si + 1}`, name: s, slug: slugify(s), categoryId: catId }))
      };
      toCreateCats.push(cat);
    });

    // Optional default brands (lightweight)
    const defaultBrands = ['Generic', 'Local'];
    const toCreateBrands: Brand[] = [];
    defaultBrands.forEach((bn, i) => {
      const slug = slugify(bn);
      const exists = existingBrands.find(b => b.slug === slug || b.name.toLowerCase() === bn.toLowerCase());
      if (exists) return;
      toCreateBrands.push({ id: `brand_base_${i + 1}`, name: bn, slug });
    });

    if (toCreateCats.length > 0) {
      const merged = [...existingCategories, ...toCreateCats];
      saveCategories(merged);
    }
    if (toCreateBrands.length > 0) {
      const merged = [...existingBrands, ...toCreateBrands];
      saveBrands(merged);
    }

    // If supabase available, upsert new items
    if (isSupabaseConfigured && supabase) {
      try { if (toCreateBrands.length > 0) await supabase.from('brands').upsert(toCreateBrands); } catch (_) {}
      try { if (toCreateCats.length > 0) await supabase.from('categories').upsert(toCreateCats); } catch (_) {}
    }
  } catch (e) {
    // ignore
  }
}

export function seedDatabase(): void {
  // Never run seed in production builds
  if (import.meta.env.PROD) return;

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

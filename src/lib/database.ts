import { Product, StockMovement, Brand, Category, Alert, StoreConfig, CashOutflow, CashOutflowCategory } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { shouldSyncCatalogStock, syncCatalogStockAfterRestore } from './catalogStockSync';

// Database keys
const PRODUCTS_KEY = 'stck_products';
const MOVEMENTS_KEY = 'stck_movements';
const BRANDS_KEY = 'stck_brands';
const CATEGORIES_KEY = 'stck_categories';
const ALERTS_KEY = 'stck_alerts';
const STORE_CONFIG_KEY = 'stck_store_config';
const CASH_OUTFLOWS_KEY = 'stck_cash_outflows';
const CASH_OUTFLOW_CATEGORIES_KEY = 'stck_cash_outflow_categories';
const INITIALIZED_KEY = 'stck_db_initialized';
const CATALOG_ITEMS_KEY = 'frazon_catalogo_items';
const CATALOG_CONFIG_KEY = 'catalogoConfig';
const APP_STATE_ID = 'global';
const CASH_OUTFLOW_RECEIPTS_BUCKET = 'expense-receipts';
const DEFAULT_CASH_OUTFLOW_CATEGORIES = [
  'Compra de mercadoria',
  'Sacolas',
  'Tags',
  'Frete',
  'Marketing',
  'Aluguel',
  'Funcionário',
  'Outros',
];

// When true, avoid syncing local changes up to remote (used during initial seeding)
let suppressRemoteSync = false;
const memoryCache: Record<string, string> = {};

function safeGetLocalStorage(key: string): string | null {
  try {
    return memoryCache[key] ?? localStorage.getItem(key) ?? null;
  } catch (error) {
    console.error('[LOCAL STORAGE READ ERROR]', error);
    return memoryCache[key] ?? null;
  }
}

function safeSetLocalStorage(key: string, value: string): boolean {
  memoryCache[key] = value;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[LOCAL STORAGE WRITE ERROR]', { key, error });
    return false;
  }
}

function safeSetLocalStorageOnly(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[LOCAL STORAGE WRITE ERROR]', { key, error });
    return false;
  }
}

function stripLargeBase64Images(products: Product[]): Product[] {
  return products.map(product => ({
    ...product,
    images: (product.images || []).filter(image => typeof image === 'string' && !image.startsWith('data:')),
  }));
}
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

function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getMovementUnitCost(m: any, product?: Product | null): number {
  const productFromMovement = m?.product || product;
  const variantFromMovement = m?.variant || productFromMovement?.variants?.find((v: any) => v.id === (m?.variantId || m?.variant_id));
  return safeNumber(
    m?.unitCost ??
    m?.unit_cost ??
    m?.costPrice ??
    m?.cost_price ??
    variantFromMovement?.costPrice ??
    variantFromMovement?.cost ??
    productFromMovement?.costPrice ??
    productFromMovement?.cost_price,
    0
  );
}

function getMovementUnitPrice(m: any, product?: Product | null): number {
  const productFromMovement = m?.product || product;
  const variantFromMovement = m?.variant || productFromMovement?.variants?.find((v: any) => v.id === (m?.variantId || m?.variant_id));
  return safeNumber(
    m?.unitPrice ??
    m?.unit_price ??
    variantFromMovement?.salePrice ??
    variantFromMovement?.sale_price ??
    productFromMovement?.salePrice ??
    productFromMovement?.sale_price,
    0
  );
}

function getMovementTotals(m: any, product?: Product | null) {
  const quantity = safeNumber(m?.quantity, 0);
  const unitPrice = getMovementUnitPrice(m, product);
  const unitCost = getMovementUnitCost(m, product);
  const rawSubtotal = safeNumber(m?.subtotalAmount ?? m?.subtotal_amount, unitPrice * quantity);
  const discountAmount = Math.max(0, safeNumber(m?.discountAmount ?? m?.discount_amount, 0));
  const totalAmount = safeNumber(
    m?.finalAmount ?? m?.final_amount ?? m?.totalAmount ?? m?.total_amount ?? m?.totalValue ?? m?.total_value,
    Math.max(0, rawSubtotal - discountAmount)
  );
  const totalCost = safeNumber(m?.totalCost ?? m?.total_cost, unitCost * quantity);
  const totalProfit = safeNumber(m?.totalProfit ?? m?.total_profit ?? m?.profit, totalAmount - totalCost);
  const subtotalAmount = safeNumber(m?.subtotalAmount ?? m?.subtotal_amount, totalAmount + discountAmount);
  return { quantity, unitPrice, unitCost, subtotalAmount, discountAmount, totalAmount, totalCost, totalProfit };
}

// Data retrieval
export function getProducts(): Product[] {
  const raw = safeGetLocalStorage(PRODUCTS_KEY);
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
  prod.salePrice = safeNumber(prod.salePrice, 0);
  prod.costPrice = safeNumber(prod.costPrice, 0);
  prod.images = Array.isArray(prod.images) ? prod.images.filter((image: any) => typeof image === 'string') : (prod.image ? [String(prod.image)] : []);
  prod.tags = Array.isArray(prod.tags) ? prod.tags : [];
  prod.variants = Array.isArray(prod.variants) ? prod.variants.map((v: any) => ({
    ...v,
    quantity: safeNumber(v.quantity, 0),
    costPrice: v.costPrice !== undefined ? safeNumber(v.costPrice, prod.costPrice) : prod.costPrice,
    salePrice: v.salePrice !== undefined ? safeNumber(v.salePrice, prod.salePrice) : prod.salePrice,
  })) : [];
  prod.totalQuantity = prod.variants.reduce((acc: number, v: any) => acc + (Number(v.quantity) || 0), 0);
  // ensure id and slug exist
  prod.id = prod.id || generateId('prod');
  prod.name = prod.name || 'Produto';
  prod.sku = prod.sku || '';
  prod.status = prod.status || 'active';
  prod.createdAt = prod.createdAt || new Date().toISOString();
  prod.updatedAt = prod.updatedAt || new Date().toISOString();
  prod.slug = prod.slug || (prod.name ? prod.name.toLowerCase().replace(/\s+/g, '-') : 'product');
  return prod as Product;
}

export function getMovements(): StockMovement[] {
  const raw = safeGetLocalStorage(MOVEMENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((movement: any) => {
      const totals = getMovementTotals(movement);
      return {
        ...movement,
        customerName: movement.customerName ?? movement.customer_name ?? '',
        variantLabel: movement.variantLabel ?? movement.variant_label ?? movement.variantName ?? movement.variant_name ?? '',
        size: movement.size ?? movement.variant?.size ?? '',
        color: movement.color ?? movement.variant?.color ?? '',
        paymentStatus: movement.paymentStatus ?? movement.payment_status ?? 'paid',
        paymentMethod: movement.paymentMethod ?? movement.payment_method ?? '',
        paidAt: movement.paidAt ?? movement.paid_at ?? null,
        saleGroupId: movement.saleGroupId ?? movement.sale_group_id ?? '',
        discountType: movement.discountType ?? movement.discount_type ?? (totals.discountAmount > 0 ? 'fixed' : 'none'),
        discountAmount: totals.discountAmount,
        discountPercent: safeNumber(movement.discountPercent ?? movement.discount_percent, 0),
        subtotalAmount: totals.subtotalAmount,
        finalAmount: totals.totalAmount,
        saleSubtotal: safeNumber(movement.saleSubtotal ?? movement.sale_subtotal, totals.subtotalAmount),
        saleDiscountTotal: safeNumber(movement.saleDiscountTotal ?? movement.sale_discount_total, totals.discountAmount),
        saleFinalTotal: safeNumber(movement.saleFinalTotal ?? movement.sale_final_total, totals.totalAmount),
      };
    });
  } catch { return []; }
}

function normalizeCashOutflowCategory(category: any, index = 0): CashOutflowCategory {
  const now = new Date().toISOString();
  return {
    id: category?.id || generateId('outcat'),
    name: String(category?.name || '').trim() || 'Outros',
    isActive: category?.isActive ?? category?.is_active ?? true,
    sortOrder: safeNumber(category?.sortOrder ?? category?.sort_order, index),
    createdAt: category?.createdAt || category?.created_at || now,
    updatedAt: category?.updatedAt || category?.updated_at || now,
  };
}

function getDefaultCashOutflowCategories(): CashOutflowCategory[] {
  const now = new Date().toISOString();
  return DEFAULT_CASH_OUTFLOW_CATEGORIES.map((name, index) => ({
    id: `outcat_${String(index + 1).padStart(3, '0')}`,
    name,
    isActive: true,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }));
}

export function getCashOutflows(): CashOutflow[] {
  const raw = safeGetLocalStorage(CASH_OUTFLOWS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cashOutflowFromAny).sort((a, b) => new Date(b.outflowDate).getTime() - new Date(a.outflowDate).getTime());
  } catch (error) {
    console.error('[CASH OUTFLOW LOAD ERROR]', error);
    return [];
  }
}

export function getCashOutflowCategories(): CashOutflowCategory[] {
  const raw = safeGetLocalStorage(CASH_OUTFLOW_CATEGORIES_KEY);
  if (!raw) return getDefaultCashOutflowCategories();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultCashOutflowCategories();
    return parsed.map(normalizeCashOutflowCategory).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  } catch (error) {
    console.error('[CASH OUTFLOW LOAD ERROR]', error);
    return getDefaultCashOutflowCategories();
  }
}

export function getBrands(): Brand[] {
  const raw = safeGetLocalStorage(BRANDS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getCategories(): Category[] {
  const raw = safeGetLocalStorage(CATEGORIES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getAlerts(): Alert[] {
  const raw = safeGetLocalStorage(ALERTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Data saving
function saveProducts(products: Product[]): void {
  const serialized = JSON.stringify(products);
  memoryCache[PRODUCTS_KEY] = serialized;
  safeSetLocalStorageOnly(PRODUCTS_KEY, JSON.stringify(stripLargeBase64Images(products)));
}

function saveMovements(movements: StockMovement[]): void {
  safeSetLocalStorage(MOVEMENTS_KEY, JSON.stringify(movements));
}

function saveBrands(brands: Brand[]): void {
  safeSetLocalStorage(BRANDS_KEY, JSON.stringify(brands));
}

function saveCategories(categories: Category[]): void {
  safeSetLocalStorage(CATEGORIES_KEY, JSON.stringify(categories));
}

function saveAlerts(alerts: Alert[]): void {
  safeSetLocalStorage(ALERTS_KEY, JSON.stringify(alerts));
}

function saveCashOutflows(outflows: CashOutflow[]): void {
  safeSetLocalStorage(CASH_OUTFLOWS_KEY, JSON.stringify(outflows));
}

function saveCashOutflowCategories(categories: CashOutflowCategory[]): void {
  safeSetLocalStorage(CASH_OUTFLOW_CATEGORIES_KEY, JSON.stringify(categories));
}

async function upsertAlertsToSupabase(alerts: Alert[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const rows = alerts.map(alert => ({
    id: alert.id,
    type: alert.type,
    message: alert.message,
    product_id: alert.productId || null,
    created_at: alert.createdAt,
    read: alert.read,
  }));
  const { error } = await supabase.from('alerts').upsert(rows);
  if (error) throw error;
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
  if (isSupabaseConfigured && !suppressRemoteSync) {
    upsertProductToSupabase(product).catch((error) => console.error('[SUPABASE PRODUCTS ERROR]', error));
  }
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
  if (isSupabaseConfigured && !suppressRemoteSync) {
    upsertProductToSupabase(updated).catch((error) => console.error('[SUPABASE PRODUCTS ERROR]', error));
  }
  return updated;
}

export function deleteProduct(id: string): boolean {
  const products = getProducts();
  const filtered = products.filter(p => p.id !== id);
  if (filtered.length === products.length) return false;
  saveProducts(filtered);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    deleteProductInSupabase(id).catch((error) => console.error('[SUPABASE PRODUCTS ERROR]', error));
  }
  return true;
}

function shouldRestoreStockForMovement(movement: StockMovement): boolean {
  const type = String(movement.type || '').toLowerCase();
  const reason = String(movement.reason || '').toLowerCase();
  return ['exit', 'out', 'sale'].includes(type) || reason.includes('venda');
}

function shouldReverseEntryForMovement(movement: StockMovement): boolean {
  const type = String(movement.type || '').toLowerCase();
  return ['entry', 'return'].includes(type);
}

function applyMovementRemovalToProduct(product: Product, movement: StockMovement): Product {
  const updated = normalizeProduct(product);
  const quantity = safeNumber(movement.quantity, 0);
  const restoreExit = shouldRestoreStockForMovement(movement);
  const reverseEntry = shouldReverseEntryForMovement(movement);
  const isAdjustment = String(movement.type || '').toLowerCase() === 'adjustment';

  if (!restoreExit && !reverseEntry && !isAdjustment) return updated;

  const applyQuantity = (current: number) => {
    if (isAdjustment) return safeNumber(movement.previousQuantity, current);
    if (restoreExit) return current + quantity;
    return Math.max(0, current - quantity);
  };

  if (movement.variantId) {
    const variantIndex = updated.variants.findIndex(v => v.id === movement.variantId);
    if (variantIndex !== -1) {
      const currentQuantity = safeNumber(updated.variants[variantIndex].quantity, 0);
      updated.variants[variantIndex] = {
        ...updated.variants[variantIndex],
        quantity: applyQuantity(currentQuantity),
      };
    }
  } else if (updated.variants.length > 0) {
    if (isAdjustment) {
      updated.variants[0] = { ...updated.variants[0], quantity: safeNumber(movement.previousQuantity, 0) };
      updated.variants = updated.variants.map((v, index) => index === 0 ? v : { ...v, quantity: 0 });
    } else {
      const currentQuantity = safeNumber(updated.variants[0].quantity, 0);
      updated.variants[0] = {
        ...updated.variants[0],
        quantity: applyQuantity(currentQuantity),
      };
    }
  } else {
    updated.totalQuantity = applyQuantity(safeNumber(updated.totalQuantity, 0));
  }

  if (updated.variants.length > 0) {
    updated.totalQuantity = updated.variants.reduce((acc, variant) => acc + safeNumber(variant.quantity, 0), 0);
  }
  updated.updatedAt = new Date().toISOString();
  return updated;
}

export async function deleteMovement(id: string): Promise<boolean> {
  const movements = getMovements();
  const movement = movements.find(m => m.id === id);
  if (!movement) return false;

  const products = getProducts();
  const productIndex = products.findIndex(p => p.id === movement.productId);
  const updatedProduct = productIndex !== -1 ? applyMovementRemovalToProduct(products[productIndex], movement) : null;

  if (isSupabaseConfigured && supabase) {
    try {
      await deleteMovementInSupabase(id);
    } catch (error) {
      console.error('[SUPABASE MOVEMENT DELETE ERROR]', error);
      throw error;
    }

    if (updatedProduct) {
      try {
        await updateProductInventoryInSupabase(updatedProduct);
      } catch (error) {
        console.error('[SUPABASE SALE STOCK UPDATE ERROR]', error);
        throw error;
      }
    }
  }

  if (updatedProduct && productIndex !== -1) {
    products[productIndex] = updatedProduct;
    saveProducts(products);
    checkStockAlerts(updatedProduct);
    if (shouldSyncCatalogStock(updatedProduct)) {
      try {
        await syncCatalogStockAfterRestore(updatedProduct, movement);
      } catch (error: any) {
        console.error('[CATALOG STOCK SYNC ERROR]', {
          action: 'restore',
          productId: updatedProduct.id,
          productName: updatedProduct.name,
          variantId: movement.variantId || null,
          size: movement.size || movement.variant?.size || null,
          color: movement.color || movement.variant?.color || null,
          message: error?.message || error,
          details: error?.details || null,
        });
      }
    }
  }

  const filtered = movements.filter(m => m.id !== id);
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
    description: p.description || '',
    image: (p.images && p.images[0]) || null,
    images: p.images || [],
    cost_price: safeNumber(p.costPrice, 0),
    sale_price: safeNumber(p.salePrice, 0),
    status: p.status,
    variants: p.variants || [],
    tags: p.tags || [],
    min_stock: safeNumber((p as any).minStock ?? (p as any).min_stock, 0),
    total_quantity: safeNumber(p.totalQuantity, 0),
    external_source: (p as any).externalSource || (p as any).external_source || null,
    external_id: (p as any).externalId || (p as any).external_id || null,
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
    images: Array.isArray(row.images) ? row.images : (row.image ? [row.image] : []),
    status: row.status || 'active',
    variants: (variants || []).map((v: any) => ({
      id: v.id || generateId('var'),
      productId: row.id,
      size: v.size || v.s || '',
      color: v.color || '',
      colorHex: v.colorHex || v.color_hex || '',
      sku: v.sku || '',
      quantity: safeNumber(v.quantity, 0),
      costPrice: safeNumber(v.costPrice ?? v.cost_price, safeNumber(row.cost_price, 0)),
      salePrice: safeNumber(v.salePrice ?? v.sale_price, safeNumber(row.sale_price, 0)),
    })),
    totalQuantity: safeNumber(row.total_quantity, 0),
    minStock: safeNumber(row.min_stock, 0),
    costPrice: safeNumber(row.cost_price, 0),
    salePrice: safeNumber(row.sale_price, 0),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    externalSource: row.external_source || row.externalSource || undefined,
    externalId: row.external_id || row.externalId || undefined,
    external_source: row.external_source || undefined,
    external_id: row.external_id || undefined,
  };
  return normalizeProduct(prod as any);
}

export function movementToSupabase(m: any): any {
  const totals = getMovementTotals(m);
  const variantName = m.variantName || m.variant_name || m.variantLabel || m.variant_label || (m.variant ? [m.variant.size, m.variant.color].filter(Boolean).join(' ') : null);
  const variantLabel = m.variantLabel || m.variant_label || variantName || null;
  const customerName = String(m.customerName ?? m.customer_name ?? '').trim();
  const paymentStatus = m.paymentStatus || m.payment_status || 'paid';
  const discountType = m.discountType || m.discount_type || (totals.discountAmount > 0 ? 'fixed' : 'none');
  const discountPercent = safeNumber(m.discountPercent ?? m.discount_percent, 0);
  const saleSubtotal = safeNumber(m.saleSubtotal ?? m.sale_subtotal, totals.subtotalAmount);
  const saleDiscountTotal = safeNumber(m.saleDiscountTotal ?? m.sale_discount_total, totals.discountAmount);
  const saleFinalTotal = safeNumber(m.saleFinalTotal ?? m.sale_final_total, totals.totalAmount);
  return {
    id: m.id,
    type: m.type || 'exit',
    product_id: m.productId || m.product_id,
    product_name: m.productName || m.product_name,
    customer_name: customerName || null,
    variant_id: m.variantId || m.variant_id || null,
    variant_name: variantName || null,
    size: m.size || m.variant?.size || null,
    color: m.color || m.variant?.color || null,
    variant_label: variantLabel || null,
    payment_status: paymentStatus,
    payment_method: m.paymentMethod ?? m.payment_method ?? null,
    paid_at: m.paidAt ?? m.paid_at ?? (paymentStatus === 'paid' ? (m.createdAt || m.created_at || new Date().toISOString()) : null),
    sale_group_id: m.saleGroupId || m.sale_group_id || null,
    quantity: totals.quantity,
    unit_price: totals.unitPrice,
    unit_cost: totals.unitCost,
    discount_type: discountType,
    discount_amount: totals.discountAmount,
    discount_percent: discountPercent,
    subtotal_amount: totals.subtotalAmount,
    final_amount: totals.totalAmount,
    sale_subtotal: saleSubtotal,
    sale_discount_total: saleDiscountTotal,
    sale_final_total: saleFinalTotal,
    total_amount: totals.totalAmount,
    total_cost: totals.totalCost,
    total_profit: totals.totalProfit,
    reason: m.reason || null,
    notes: m.notes || null,
    user_id: m.userId || m.user_id || null,
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || m.createdAt || new Date().toISOString(),
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
  const localProduct = row.product_id ? getProductById(row.product_id) : null;
  const totals = getMovementTotals(row, localProduct);
  const mv: any = {
    id: row.id,
    type: row.type || 'exit',
    productId: row.product_id,
    productName: row.product_name || prodSnapshot?.name || localProduct?.name || 'Produto nao encontrado',
    customerName: row.customer_name || '',
    brand: row.brand_name,
    category: row.category_name,
    subcategory: row.subcategory_name,
    variantId: row.variant_id,
    variantName: row.variant_name,
    variantLabel: row.variant_label || row.variant_name || '',
    size: row.size || '',
    color: row.color || '',
    paymentStatus: row.payment_status || 'paid',
    paymentMethod: row.payment_method || '',
    paidAt: row.paid_at || null,
    saleGroupId: row.sale_group_id || '',
    quantity: totals.quantity,
    unitPrice: totals.unitPrice,
    costPrice: totals.unitCost,
    unitCost: totals.unitCost,
    discountType: row.discount_type || (totals.discountAmount > 0 ? 'fixed' : 'none'),
    discountAmount: totals.discountAmount,
    discountPercent: safeNumber(row.discount_percent, 0),
    subtotalAmount: totals.subtotalAmount,
    finalAmount: totals.totalAmount,
    saleSubtotal: safeNumber(row.sale_subtotal, totals.subtotalAmount),
    saleDiscountTotal: safeNumber(row.sale_discount_total, totals.discountAmount),
    saleFinalTotal: safeNumber(row.sale_final_total, totals.totalAmount),
    totalValue: totals.totalAmount,
    totalAmount: totals.totalAmount,
    totalCost: totals.totalCost,
    totalProfit: totals.totalProfit,
    profit: totals.totalProfit,
    product_snapshot: prodSnapshot,
    reason: row.reason,
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || row.createdAt || new Date().toISOString(),
  };
  return mv as StockMovement;
}

export function cashOutflowToSupabase(outflow: CashOutflow): any {
  return {
    id: outflow.id,
    description: outflow.description,
    amount: safeNumber(outflow.amount, 0),
    category_id: outflow.categoryId || null,
    category_name: outflow.categoryName,
    payment_method: outflow.paymentMethod,
    outflow_date: outflow.outflowDate,
    notes: outflow.notes || null,
    receipt_url: outflow.receiptUrl || null,
    receipt_file_name: outflow.receiptFileName || null,
    receipt_mime_type: outflow.receiptMimeType || null,
    receipt_size: outflow.receiptSize || null,
    created_at: outflow.createdAt,
    updated_at: outflow.updatedAt,
  };
}

export function cashOutflowFromAny(row: any): CashOutflow {
  const now = new Date().toISOString();
  return {
    id: row?.id || generateId('outflow'),
    description: String(row?.description || '').trim(),
    amount: safeNumber(row?.amount, 0),
    categoryId: row?.categoryId ?? row?.category_id ?? null,
    categoryName: String(row?.categoryName ?? row?.category_name ?? 'Outros').trim() || 'Outros',
    paymentMethod: String(row?.paymentMethod ?? row?.payment_method ?? '').trim() || 'Outro',
    outflowDate: row?.outflowDate || row?.outflow_date || now,
    notes: row?.notes || null,
    receiptUrl: row?.receiptUrl ?? row?.receipt_url ?? null,
    receiptFileName: row?.receiptFileName ?? row?.receipt_file_name ?? null,
    receiptMimeType: row?.receiptMimeType ?? row?.receipt_mime_type ?? null,
    receiptSize: row?.receiptSize ?? row?.receipt_size ?? null,
    createdAt: row?.createdAt || row?.created_at || now,
    updatedAt: row?.updatedAt || row?.updated_at || now,
  };
}

export function cashOutflowCategoryToSupabase(category: CashOutflowCategory): any {
  return {
    id: category.id,
    name: category.name,
    is_active: category.isActive,
    sort_order: safeNumber(category.sortOrder, 0),
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  };
}

export function cashOutflowCategoryFromAny(row: any, index = 0): CashOutflowCategory {
  return normalizeCashOutflowCategory(row, index);
}

async function upsertCashOutflowToSupabase(outflow: CashOutflow): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('cash_outflows').upsert([cashOutflowToSupabase(outflow)]);
  if (error) throw error;
}

async function deleteCashOutflowInSupabase(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('cash_outflows').delete().eq('id', id);
  if (error) throw error;
}

async function upsertCashOutflowCategoryToSupabase(category: CashOutflowCategory): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('cash_outflow_categories').upsert([cashOutflowCategoryToSupabase(category)]);
  if (error) throw error;
}

function getCatalogItemsLocal(): string[] {
  const raw = safeGetLocalStorage(CATALOG_ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCatalogConfigLocal(): Record<string, any> | null {
  const raw = safeGetLocalStorage(CATALOG_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getFullLocalState(): Record<string, any> {
  return {
    products: getProducts(),
    movements: getMovements(),
    brands: getBrands(),
    categories: getCategories(),
    alerts: getAlerts(),
    storeConfig: getStoreConfig(),
    catalog: {
      items: getCatalogItemsLocal(),
      config: getCatalogConfigLocal(),
    },
  };
}

function applyRemoteStateToLocal(state: Record<string, any>): void {
  suppressRemoteSync = true;
  try {
    if (Array.isArray(state.products)) saveProducts(state.products.map(normalizeProduct));
    if (Array.isArray(state.movements)) saveMovements(state.movements as StockMovement[]);
    if (Array.isArray(state.brands)) saveBrands(state.brands as Brand[]);
    if (Array.isArray(state.categories)) saveCategories(state.categories as Category[]);
    if (Array.isArray(state.alerts)) saveAlerts(state.alerts as Alert[]);
    if (state.storeConfig) safeSetLocalStorage(STORE_CONFIG_KEY, JSON.stringify(state.storeConfig));
    if (state.catalog?.items) safeSetLocalStorage(CATALOG_ITEMS_KEY, JSON.stringify(state.catalog.items));
    if (state.catalog?.config) safeSetLocalStorage(CATALOG_CONFIG_KEY, JSON.stringify(state.catalog.config));
  } finally {
    suppressRemoteSync = false;
  }
}

function hasPersistedAppState(state: Record<string, any> | null): state is Record<string, any> {
  if (!state) return false;
  return ['products', 'movements', 'brands', 'categories', 'alerts', 'storeConfig', 'catalog']
    .some(key => Object.prototype.hasOwnProperty.call(state, key));
}

async function loadAppStateFromSupabase(): Promise<Record<string, any> | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from('app_state').select('data').eq('id', APP_STATE_ID).maybeSingle();
  if (error) {
    console.error('[SUPABASE LOAD ERROR]', error);
    return null;
  }
  const state = data?.data && typeof data.data === 'object' ? data.data as Record<string, any> : null;
  return hasPersistedAppState(state) ? state : null;
}

async function saveAppStateToSupabase(state = getFullLocalState()): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('app_state').upsert({
    id: APP_STATE_ID,
    data: state,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('[SUPABASE SYNC ERROR]', error);
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
    if (error) {
      console.error('[SUPABASE PRODUCTS ERROR]', error);
      return null;
    }
    if (!data) return null;
    // normalize variants if needed
    try { return productFromSupabase(data as any); } catch { return normalizeProduct(data as any); }
  } catch (e) {
    console.error('[SUPABASE PRODUCTS ERROR]', e);
    return null;
  }
}

async function createMovementInSupabase(mov: any) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const payload = movementToSupabase(mov);
  const { data, error } = await supabase.from('movements').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

async function upsertMovementToSupabase(movement: StockMovement): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('movements').upsert([movementToSupabase(movement)]);
  if (error) throw error;
}

export async function updateMovementPaymentStatusInSupabase(
  movementId: string,
  status: StockMovement['paymentStatus'],
  paymentMethod: string,
  paidAt: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from('movements')
    .update({
      payment_status: status,
      payment_method: paymentMethod || null,
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', movementId);
  if (error) throw error;
}

async function upsertProductToSupabase(product: Product): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('products').upsert([productToSupabase(product)]);
  if (error) throw error;
}

async function deleteProductInSupabase(productId: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw error;
  return true;
}

async function deleteMovementInSupabase(movementId: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('movements').delete().eq('id', movementId);
  if (error) throw error;
  return true;
}

async function updateProductInventoryInSupabase(updatedProduct: Product): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('products')
    .update({
      variants: updatedProduct.variants || [],
      total_quantity: safeNumber(updatedProduct.totalQuantity, 0),
      updated_at: updatedProduct.updatedAt || new Date().toISOString(),
    })
    .eq('id', updatedProduct.id);
  if (error) throw error;
}

// registerSale: cashier sale entrypoint. Local state is updated first; configured Supabase must persist the sale before success.
export async function registerSale(params: {
  productId: string;
  variantId?: string;
  quantity: number;
  userId?: string;
  reason?: string;
  notes?: string;
  customerName?: string;
  paymentStatus?: 'paid' | 'pending';
  paymentMethod?: string | null;
  saleGroupId?: string;
  discountType?: 'fixed' | 'percent' | 'none';
  discountAmount?: number;
  discountPercent?: number;
  subtotalAmount?: number;
  finalAmount?: number;
  saleSubtotal?: number;
  saleDiscountTotal?: number;
  saleFinalTotal?: number;
}): Promise<StockMovement | null> {
  const {
    productId,
    variantId,
    quantity,
    userId,
    reason = 'Venda',
    notes = '',
    customerName = '',
    paymentStatus = 'paid',
    paymentMethod = null,
    saleGroupId,
    discountType = 'none',
    discountAmount = 0,
    discountPercent = 0,
    subtotalAmount,
    finalAmount,
    saleSubtotal,
    saleDiscountTotal,
    saleFinalTotal,
  } = params;
  if (!productId) throw new Error('productId required');
  if (!quantity || Number(quantity) <= 0) throw new Error('quantity must be > 0');
  if (paymentStatus === 'pending' && !customerName.trim()) {
    throw new Error('Informe o nome do cliente para registrar uma venda pendente.');
  }

  const localProduct = getProductById(productId);
  if (!localProduct) throw new Error('Produto nao encontrado');

  const localVariant = variantId ? (localProduct.variants || []).find(v => v.id === variantId) : undefined;
  const variantLabel = localVariant ? [localVariant.size, localVariant.color, localProduct.name].filter(Boolean).join(' - ') : '';
  const availableStock = localVariant ? Number(localVariant.quantity || 0) : Number(localProduct.totalQuantity || 0);
  if (quantity > availableStock) throw new Error('Quantidade maior que o estoque disponivel');

  const previousSuppressRemoteSync = suppressRemoteSync;
  suppressRemoteSync = true;
  let created: StockMovement | null = null;
  try {
    created = createMovement({
      productId,
      variantId,
      type: 'exit',
      quantity: Number(quantity),
      reason,
      notes,
      customerName: customerName.trim(),
      size: localVariant?.size || '',
      color: localVariant?.color || '',
      variantLabel,
      paymentStatus,
      paymentMethod: paymentStatus === 'paid' ? (paymentMethod || '') : '',
      paidAt: paymentStatus === 'paid' ? new Date().toISOString() : null,
      saleGroupId: saleGroupId || generateId('sale'),
      discountType,
      discountAmount,
      discountPercent,
      subtotalAmount,
      finalAmount,
      saleSubtotal,
      saleDiscountTotal,
      saleFinalTotal,
      userId: userId || 'system',
    } as any);
  } finally {
    suppressRemoteSync = previousSuppressRemoteSync;
  }

  if (created && isSupabaseConfigured) {
    const updatedProduct = getProductById(productId);
    if (!updatedProduct) {
      const error = new Error('Updated product not found locally after sale');
      console.error('[SUPABASE SALE STOCK UPDATE ERROR]', { productId, error });
      throw error;
    }

    try {
      await upsertMovementToSupabase(created);
    } catch (error) {
      console.error('[SUPABASE SALE MOVEMENT INSERT ERROR]', error);
      throw error;
    }

    try {
      await updateProductInventoryInSupabase(updatedProduct);
    } catch (error) {
      console.error('[SUPABASE SALE STOCK UPDATE ERROR]', error);
      throw error;
    }
  }

  return created;
}

export async function markMovementAsPaid(
  movementId: string,
  paymentMethod: string
): Promise<StockMovement> {
  const movements = getMovements();
  const index = movements.findIndex(m => m.id === movementId);
  if (index === -1) throw new Error('Movimentação não encontrada.');

  const current = movements[index];
  if ((current.paymentStatus || 'paid') !== 'pending') {
    throw new Error('Somente vendas pendentes podem ser marcadas como pagas.');
  }

  const paidAt = new Date().toISOString();
  const updated: StockMovement = {
    ...current,
    paymentStatus: 'paid',
    paymentMethod,
    paidAt,
  };

  if (isSupabaseConfigured && supabase) {
    await updateMovementPaymentStatusInSupabase(movementId, 'paid', paymentMethod, paidAt);
  }

  movements[index] = updated;
  saveMovements(movements);
  return updated;
}

export function loadCashOutflows(): CashOutflow[] {
  return getCashOutflows();
}

export function loadCashOutflowCategories(): CashOutflowCategory[] {
  const categories = getCashOutflowCategories();
  if (!safeGetLocalStorage(CASH_OUTFLOW_CATEGORIES_KEY)) {
    saveCashOutflowCategories(categories);
  }
  return categories;
}

export async function createCashOutflow(data: Omit<CashOutflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<CashOutflow> {
  const description = String(data.description || '').trim();
  const amount = safeNumber(data.amount, 0);
  if (!description) throw new Error('Descricao obrigatoria.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor precisa ser maior que zero.');
  if (!data.categoryName) throw new Error('Categoria obrigatoria.');
  if (!data.outflowDate || !Number.isFinite(new Date(data.outflowDate).getTime())) throw new Error('Data invalida.');

  const now = new Date().toISOString();
  const outflow: CashOutflow = {
    ...data,
    id: generateId('outflow'),
    description,
    amount,
    paymentMethod: String(data.paymentMethod || 'Outro'),
    createdAt: now,
    updatedAt: now,
  };
  const outflows = getCashOutflows();
  outflows.unshift(outflow);
  saveCashOutflows(outflows);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    try {
      await upsertCashOutflowToSupabase(outflow);
    } catch (error) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      throw error;
    }
  }
  return outflow;
}

export async function updateCashOutflow(id: string, data: Partial<CashOutflow>): Promise<CashOutflow> {
  const outflows = getCashOutflows();
  const index = outflows.findIndex(outflow => outflow.id === id);
  if (index === -1) throw new Error('Saida nao encontrada.');
  const updated = cashOutflowFromAny({
    ...outflows[index],
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  });
  if (!updated.description.trim()) throw new Error('Descricao obrigatoria.');
  if (!Number.isFinite(updated.amount) || updated.amount <= 0) throw new Error('Valor precisa ser maior que zero.');
  if (!updated.categoryName) throw new Error('Categoria obrigatoria.');
  if (!updated.outflowDate || !Number.isFinite(new Date(updated.outflowDate).getTime())) throw new Error('Data invalida.');
  outflows[index] = updated;
  saveCashOutflows(outflows);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    try {
      await upsertCashOutflowToSupabase(updated);
    } catch (error) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      throw error;
    }
  }
  return updated;
}

export async function deleteCashOutflow(id: string): Promise<boolean> {
  const outflows = getCashOutflows();
  const filtered = outflows.filter(outflow => outflow.id !== id);
  if (filtered.length === outflows.length) return false;
  saveCashOutflows(filtered);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    try {
      await deleteCashOutflowInSupabase(id);
    } catch (error) {
      console.error('[CASH OUTFLOW DELETE ERROR]', error);
      throw error;
    }
  }
  return true;
}

export async function createCashOutflowCategory(name: string): Promise<CashOutflowCategory> {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nome da categoria obrigatorio.');
  const categories = getCashOutflowCategories();
  const existing = categories.find(category => category.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    if (!existing.isActive) return updateCashOutflowCategory(existing.id, { isActive: true, name: trimmed });
    throw new Error('Categoria ja existe.');
  }
  const now = new Date().toISOString();
  const category: CashOutflowCategory = {
    id: generateId('outcat'),
    name: trimmed,
    isActive: true,
    sortOrder: categories.length,
    createdAt: now,
    updatedAt: now,
  };
  categories.push(category);
  saveCashOutflowCategories(categories);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    try {
      await upsertCashOutflowCategoryToSupabase(category);
    } catch (error) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      throw error;
    }
  }
  return category;
}

export async function updateCashOutflowCategory(id: string, data: Partial<CashOutflowCategory>): Promise<CashOutflowCategory> {
  const categories = getCashOutflowCategories();
  const index = categories.findIndex(category => category.id === id);
  if (index === -1) throw new Error('Categoria nao encontrada.');
  const updated = normalizeCashOutflowCategory({
    ...categories[index],
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  }, index);
  categories[index] = updated;
  saveCashOutflowCategories(categories);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    try {
      await upsertCashOutflowCategoryToSupabase(updated);
    } catch (error) {
      console.error('[CASH OUTFLOW SAVE ERROR]', error);
      throw error;
    }
  }
  return updated;
}

export async function deleteCashOutflowCategory(id: string): Promise<boolean> {
  const categories = getCashOutflowCategories();
  const category = categories.find(item => item.id === id);
  if (!category) return false;
  await updateCashOutflowCategory(id, { isActive: false });
  return true;
}

export async function uploadCashOutflowReceipt(file: File): Promise<Pick<CashOutflow, 'receiptUrl' | 'receiptFileName' | 'receiptMimeType' | 'receiptSize'>> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) throw new Error('Comprovante deve ser JPG, PNG, WEBP ou PDF.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Comprovante deve ter no maximo 5MB.');
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase Storage nao configurado.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${new Date().toISOString().slice(0, 10)}/${generateId('receipt')}_${safeName}`;
  try {
    const { error } = await supabase.storage.from(CASH_OUTFLOW_RECEIPTS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(CASH_OUTFLOW_RECEIPTS_BUCKET).getPublicUrl(path);
    return {
      receiptUrl: data.publicUrl,
      receiptFileName: file.name,
      receiptMimeType: file.type,
      receiptSize: file.size,
    };
  } catch (error) {
    console.error('[CASH OUTFLOW RECEIPT UPLOAD ERROR]', error);
    throw error;
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
    let unitPrice = safeNumber(product.salePrice, 0);
    let unitCost = safeNumber(product.costPrice, 0);
  let selectedVariant: Product['variants'][number] | undefined;
  if (data.variantId) {
    const variant = product.variants.find(v => v.id === data.variantId);
    if (variant) {
      selectedVariant = variant;
      unitPrice = safeNumber(variant.salePrice, unitPrice);
      unitCost = safeNumber((variant as any).costPrice ?? (variant as any).cost, unitCost);
    }
  }

  // validations
    const qty = safeNumber(data.quantity, 0);
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
      selectedVariant = variant;
      previousQuantity = Number(variant.quantity) || 0;
      // pricing from variant if present
      unitPrice = safeNumber(variant.salePrice, unitPrice);
      unitCost = safeNumber((variant as any).costPrice ?? (variant as any).cost, unitCost);

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
    // Apply the total change across variants without losing small quantities.
      if (product.variants.length > 0) {
        if (data.type === 'entry' || data.type === 'return') {
          product.variants[0].quantity = Number(product.variants[0].quantity || 0) + qty;
        } else if (data.type === 'exit') {
          let remaining = qty;
          product.variants = product.variants.map(v => {
            if (remaining <= 0) return v;
            const available = Number(v.quantity || 0);
            const taken = Math.min(available, remaining);
            remaining -= taken;
            return { ...v, quantity: available - taken };
          });
        } else if (data.type === 'adjustment') {
          product.variants[0].quantity = qty;
          product.variants = product.variants.map((v, i) => i === 0 ? v : { ...v, quantity: 0 });
        }
      }
  }

    product.totalQuantity = product.variants.reduce((acc, v) => acc + safeNumber(v.quantity, 0), 0);
  product.updatedAt = new Date().toISOString();
  products[productIndex] = product;
  saveProducts(products);

    const subtotalAmount = safeNumber((data as any).subtotalAmount ?? (unitPrice * qty), 0);
    const discountAmount = Math.min(subtotalAmount, Math.max(0, safeNumber((data as any).discountAmount, 0)));
    const finalAmount = Math.max(0, safeNumber((data as any).finalAmount ?? (subtotalAmount - discountAmount), subtotalAmount - discountAmount));
    const discountType = (data as any).discountType ?? (discountAmount > 0 ? 'fixed' : 'none');
    const discountPercent = safeNumber((data as any).discountPercent, 0);
    const saleSubtotal = safeNumber((data as any).saleSubtotal, subtotalAmount);
    const saleDiscountTotal = safeNumber((data as any).saleDiscountTotal, discountAmount);
    const saleFinalTotal = safeNumber((data as any).saleFinalTotal, finalAmount);
    const totalAmount = finalAmount;
    const totalCost = safeNumber(unitCost * qty, 0);
    const totalProfit = safeNumber(totalAmount - totalCost, 0);

    const movement: StockMovement = {
      ...data,
      id: generateId('mov'),
      previousQuantity,
      newQuantity,
      createdAt: new Date().toISOString(),
      unitPrice,
      costPrice: unitCost,
      unitCost,
      discountType,
      discountAmount,
      discountPercent,
      subtotalAmount,
      finalAmount,
      saleSubtotal,
      saleDiscountTotal,
      saleFinalTotal,
      totalValue: totalAmount,
      totalAmount,
      totalCost,
      totalProfit,
      profit: totalProfit,
      productName: product.name,
      product: product,
      variant: data.variantId ? product.variants.find(v => v.id === data.variantId) : undefined,
      size: (data as any).size ?? selectedVariant?.size ?? '',
      color: (data as any).color ?? selectedVariant?.color ?? '',
      variantLabel: (data as any).variantLabel ?? (selectedVariant ? [selectedVariant.size, selectedVariant.color, product.name].filter(Boolean).join(' - ') : ''),
      paymentStatus: (data as any).paymentStatus ?? 'paid',
      paymentMethod: (data as any).paymentMethod ?? '',
      paidAt: (data as any).paidAt ?? ((data as any).paymentStatus === 'pending' ? null : new Date().toISOString()),
      saleGroupId: (data as any).saleGroupId ?? '',
    };

  const movements = getMovements();
    movements.unshift(movement);
    saveMovements(movements);
    checkStockAlerts(product);
    if (isSupabaseConfigured && !suppressRemoteSync) {
      upsertMovementToSupabase(movement)
        .catch((error) => console.error('[SUPABASE SALE MOVEMENT INSERT ERROR]', error));
      updateProductInventoryInSupabase(product)
        .catch((error) => console.error('[SUPABASE SALE STOCK UPDATE ERROR]', error));
    }
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
  if (isSupabaseConfigured && !suppressRemoteSync) {
    upsertAlertsToSupabase(alerts).catch((error) => console.error('[SUPABASE ALERTS ERROR]', error));
  }
}

export function markAlertRead(id: string): void {
  const alerts = getAlerts().map(a => a.id === id ? { ...a, read: true } : a);
  saveAlerts(alerts);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    upsertAlertsToSupabase(alerts).catch((error) => console.error('[SUPABASE ALERTS ERROR]', error));
  }
}

export function markAllAlertsRead(): void {
  const alerts = getAlerts().map(a => ({ ...a, read: true }));
  saveAlerts(alerts);
  if (isSupabaseConfigured && !suppressRemoteSync) {
    upsertAlertsToSupabase(alerts).catch((error) => console.error('[SUPABASE ALERTS ERROR]', error));
  }
}

// Store config operations
export function getStoreConfig(): StoreConfig {
  const raw = safeGetLocalStorage(STORE_CONFIG_KEY);
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
  safeSetLocalStorage(STORE_CONFIG_KEY, JSON.stringify(updated));
  if (isSupabaseConfigured) {
    upsertStoreConfigToSupabase(updated).catch((error) => console.error('[SUPABASE STORE CONFIG ERROR]', error));
  }
  return updated;
}

export async function upsertStoreConfigToSupabase(storeConfig: StoreConfig): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('store_config').upsert({
    id: 'default',
    store_name: storeConfig.storeName,
    logo_url: storeConfig.logoUrl || null,
    created_at: storeConfig.createdAt,
    updated_at: storeConfig.updatedAt,
  });
  if (error) throw error;
}

export async function syncCatalogToSupabase(items = getCatalogItemsLocal(), config = getCatalogConfigLocal()): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('catalog_config').upsert({
    id: 'default',
    items,
    config: config || {},
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
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
    const alerts = getAlerts();
    const storeConfig = getStoreConfig();
    const catalogItems = getCatalogItemsLocal();
    const catalogConfig = getCatalogConfigLocal();

    // Upsert brands and categories as small helpers
    if (brands.length > 0) {
      try {
        const { error } = await supabase.from('brands').upsert(brands);
        if (error) console.error('[SUPABASE SYNC ERROR]', error);
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
    }
    if (categories.length > 0) {
      try {
        const { error } = await supabase.from('categories').upsert(categories);
        if (error) console.error('[SUPABASE SYNC ERROR]', error);
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
    }

    if (products.length > 0) {
      const rows = products.map(productToSupabase);
      try {
        const { error } = await supabase.from('products').upsert(rows);
        if (error) console.error('[SUPABASE PRODUCTS ERROR]', error);
      } catch (error) { console.error('[SUPABASE PRODUCTS ERROR]', error); }
    }

    if (movements.length > 0) {
      const rows = movements.map(movementToSupabase);
      try {
        const { error } = await supabase.from('movements').upsert(rows);
        if (error) console.error('[SUPABASE MOVEMENTS ERROR]', error);
      } catch (error) { console.error('[SUPABASE MOVEMENTS ERROR]', error); }
    }

    if (alerts.length > 0) {
      try {
        const rows = alerts.map(alert => ({
          id: alert.id,
          type: alert.type,
          message: alert.message,
          product_id: alert.productId || null,
          created_at: alert.createdAt,
          read: alert.read,
        }));
        const { error } = await supabase.from('alerts').upsert(rows);
        if (error) console.error('[SUPABASE SYNC ERROR]', error);
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
    }

    try {
      const { error } = await supabase.from('store_config').upsert({
        id: 'default',
        store_name: storeConfig.storeName,
        logo_url: storeConfig.logoUrl || null,
        created_at: storeConfig.createdAt,
        updated_at: storeConfig.updatedAt,
      });
      if (error) console.error('[SUPABASE SYNC ERROR]', error);
    } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }

    try {
      await syncCatalogToSupabase(catalogItems, catalogConfig);
    } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }

    await saveAppStateToSupabase({
      products,
      movements,
      brands,
      categories,
      alerts,
      storeConfig,
      catalog: {
        items: catalogItems,
        config: catalogConfig,
      },
    });

    // record last sync time for UI
    safeSetLocalStorage('stck_last_sync', new Date().toISOString());
  } catch (e) {
    console.error('[SUPABASE SYNC ERROR]', e);
    // fail silently — keep working offline
  }
}

export async function loadRemoteToLocal(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    let remoteProducts = null;
    let remoteMovements = null;
    let remoteBrands = null;
    let remoteCategories = null;
    let remoteAlerts = null;
    let remoteStoreConfig = null;
    let remoteCatalogConfig = null;
    let remoteCashOutflows = null;
    let remoteCashOutflowCategories = null;
    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) console.error('[SUPABASE PRODUCTS ERROR]', error);
      remoteProducts = data;
    } catch (error) { console.error('[SUPABASE PRODUCTS ERROR]', error); remoteProducts = null; }
    try {
      const { data, error } = await supabase.from('movements').select('*');
      if (error) console.error('[SUPABASE MOVEMENTS ERROR]', error);
      remoteMovements = data;
    } catch (error) { console.error('[SUPABASE MOVEMENTS ERROR]', error); remoteMovements = null; }
    try {
      const { data, error } = await supabase.from('brands').select('*');
      if (error) console.error('[SUPABASE LOAD ERROR]', error);
      remoteBrands = data;
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); remoteBrands = null; }
    try {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) console.error('[SUPABASE LOAD ERROR]', error);
      remoteCategories = data;
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); remoteCategories = null; }
    try {
      const { data, error } = await supabase.from('alerts').select('*');
      if (error) console.error('[SUPABASE LOAD ERROR]', error);
      remoteAlerts = data;
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); remoteAlerts = null; }
    try {
      const { data, error } = await supabase.from('cash_outflows').select('*').order('outflow_date', { ascending: false });
      if (error) console.error('[CASH OUTFLOW LOAD ERROR]', error);
      remoteCashOutflows = data;
    } catch (error) { console.error('[CASH OUTFLOW LOAD ERROR]', error); remoteCashOutflows = null; }
    try {
      const { data, error } = await supabase.from('cash_outflow_categories').select('*').order('sort_order', { ascending: true });
      if (error) console.error('[CASH OUTFLOW LOAD ERROR]', error);
      remoteCashOutflowCategories = data;
    } catch (error) { console.error('[CASH OUTFLOW LOAD ERROR]', error); remoteCashOutflowCategories = null; }
    try {
      const { data, error } = await supabase.from('store_config').select('*').eq('id', 'default').maybeSingle();
      if (error) console.error('[SUPABASE LOAD ERROR]', error);
      remoteStoreConfig = data;
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); remoteStoreConfig = null; }
    try {
      const { data, error } = await supabase.from('catalog_config').select('*').eq('id', 'default').maybeSingle();
      if (error) console.error('[SUPABASE LOAD ERROR]', error);
      remoteCatalogConfig = data;
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); remoteCatalogConfig = null; }

    suppressRemoteSync = true;
    if (Array.isArray(remoteProducts)) {
      try { saveProducts((remoteProducts || []).map(productFromSupabase)); } catch (error) {
        console.error('[SUPABASE LOAD ERROR]', error);
        saveProducts(remoteProducts as Product[]);
      }
    }
    if (Array.isArray(remoteMovements)) {
      saveMovements((remoteMovements || []).map(movementFromSupabase));
    }
    if (Array.isArray(remoteBrands)) saveBrands(remoteBrands as Brand[]);
    if (Array.isArray(remoteCategories)) saveCategories(remoteCategories as Category[]);
    if (Array.isArray(remoteAlerts)) {
      saveAlerts((remoteAlerts || []).map((alert: any) => ({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        productId: alert.product_id || undefined,
        createdAt: alert.created_at || new Date().toISOString(),
        read: !!alert.read,
      })));
    }
    if (Array.isArray(remoteCashOutflows)) {
      saveCashOutflows((remoteCashOutflows || []).map(cashOutflowFromAny));
    }
    if (Array.isArray(remoteCashOutflowCategories) && remoteCashOutflowCategories.length > 0) {
      saveCashOutflowCategories((remoteCashOutflowCategories || []).map(cashOutflowCategoryFromAny));
    } else if (!safeGetLocalStorage(CASH_OUTFLOW_CATEGORIES_KEY)) {
      saveCashOutflowCategories(getDefaultCashOutflowCategories());
    }
    if (remoteStoreConfig) {
      safeSetLocalStorage(STORE_CONFIG_KEY, JSON.stringify({
        storeName: remoteStoreConfig.store_name || 'FRAZON STORE',
        logoUrl: remoteStoreConfig.logo_url || undefined,
        createdAt: remoteStoreConfig.created_at || new Date().toISOString(),
        updatedAt: remoteStoreConfig.updated_at || new Date().toISOString(),
      }));
    }
    if (remoteCatalogConfig) {
      safeSetLocalStorage(CATALOG_ITEMS_KEY, JSON.stringify(remoteCatalogConfig.items || []));
      safeSetLocalStorage(CATALOG_CONFIG_KEY, JSON.stringify(remoteCatalogConfig.config || {}));
    }
    suppressRemoteSync = false;

    // Do NOT auto-push local -> remote when remote is empty. Manual migration only.
  } catch (e) {
    suppressRemoteSync = false;
    console.error('[SUPABASE LOAD ERROR]', e);
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
    cashOutflows: getCashOutflows(),
    cashOutflowCategories: getCashOutflowCategories(),
    storeConfig: getStoreConfig(),
    catalog: {
      items: getCatalogItemsLocal(),
      config: getCatalogConfigLocal(),
    },
  };
  // include remote snapshot if available
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: remoteProducts, error: productsError } = await supabase.from('products').select('*');
      if (productsError) console.error('[SUPABASE PRODUCTS ERROR]', productsError);
      const { data: remoteMovements, error: movementsError } = await supabase.from('movements').select('*');
      if (movementsError) console.error('[SUPABASE MOVEMENTS ERROR]', movementsError);
      const { data: remoteCashOutflows, error: cashOutflowsError } = await supabase.from('cash_outflows').select('*');
      if (cashOutflowsError) console.error('[CASH OUTFLOW LOAD ERROR]', cashOutflowsError);
      state.remote = { products: remoteProducts || null, movements: remoteMovements || null, cashOutflows: remoteCashOutflows || null };
    } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); }
  }
  return state;
}

// Import full state JSON: writes to local cache and to remote (if configured).
export async function importState(state: Record<string, any>, options?: { overwriteRemote?: boolean }): Promise<void> {
  if (!state) return;
  const { products, movements, brands, categories, alerts, cashOutflows, cashOutflowCategories, storeConfig, catalog } = state as any;

  if (Array.isArray(products)) saveProducts(products as Product[]);
  if (Array.isArray(movements)) saveMovements(movements as StockMovement[]);
  if (Array.isArray(brands)) saveBrands(brands as Brand[]);
  if (Array.isArray(categories)) saveCategories(categories as Category[]);
  if (Array.isArray(alerts)) saveAlerts(alerts as Alert[]);
  if (Array.isArray(cashOutflows)) saveCashOutflows((cashOutflows || []).map(cashOutflowFromAny));
  if (Array.isArray(cashOutflowCategories)) saveCashOutflowCategories((cashOutflowCategories || []).map(cashOutflowCategoryFromAny));
  if (storeConfig) safeSetLocalStorage(STORE_CONFIG_KEY, JSON.stringify(storeConfig));
  if (catalog?.items) safeSetLocalStorage(CATALOG_ITEMS_KEY, JSON.stringify(catalog.items));
  if (catalog?.config) safeSetLocalStorage(CATALOG_CONFIG_KEY, JSON.stringify(catalog.config));

  if (isSupabaseConfigured && supabase) {
    if (options?.overwriteRemote) {
      try {
        const { error } = await supabase.from('brands').upsert(brands || []);
        if (error) console.error('[SUPABASE SYNC ERROR]', error);
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
      try {
        const { error } = await supabase.from('categories').upsert(categories || []);
        if (error) console.error('[SUPABASE SYNC ERROR]', error);
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
      try {
        const { error } = await supabase.from('products').upsert((products || []).map(productToSupabase));
        if (error) console.error('[SUPABASE PRODUCTS ERROR]', error);
      } catch (error) { console.error('[SUPABASE PRODUCTS ERROR]', error); }
      try {
        const { error } = await supabase.from('movements').upsert((movements || []).map(movementToSupabase));
        if (error) console.error('[SUPABASE MOVEMENTS ERROR]', error);
      } catch (error) { console.error('[SUPABASE MOVEMENTS ERROR]', error); }
      try {
        const { error } = await supabase.from('cash_outflows').upsert((cashOutflows || []).map(cashOutflowFromAny).map(cashOutflowToSupabase));
        if (error) console.error('[CASH OUTFLOW SAVE ERROR]', error);
      } catch (error) { console.error('[CASH OUTFLOW SAVE ERROR]', error); }
      try {
        const localOutflowCategories = (cashOutflowCategories || getCashOutflowCategories()).map(cashOutflowCategoryFromAny);
        const { error } = await supabase.from('cash_outflow_categories').upsert(localOutflowCategories.map(cashOutflowCategoryToSupabase));
        if (error) console.error('[CASH OUTFLOW SAVE ERROR]', error);
      } catch (error) { console.error('[CASH OUTFLOW SAVE ERROR]', error); }
      await saveAppStateToSupabase(getFullLocalState());
    } else {
      // Merge: only insert when remote empty
      try {
        const { data: remoteProducts, error: productsLoadError } = await supabase.from('products').select('*');
        if (productsLoadError) console.error('[SUPABASE PRODUCTS ERROR]', productsLoadError);
        if (!remoteProducts || remoteProducts.length === 0) {
          const { error: productsUpsertError } = await supabase.from('products').upsert((products || []).map(productToSupabase));
          if (productsUpsertError) console.error('[SUPABASE PRODUCTS ERROR]', productsUpsertError);
        }
      } catch (error) { console.error('[SUPABASE PRODUCTS ERROR]', error); }
      try {
        const { data: remoteMovements, error: movementsLoadError } = await supabase.from('movements').select('*');
        if (movementsLoadError) console.error('[SUPABASE MOVEMENTS ERROR]', movementsLoadError);
        if (!remoteMovements || remoteMovements.length === 0) {
          const { error: movementsUpsertError } = await supabase.from('movements').upsert((movements || []).map(movementToSupabase));
          if (movementsUpsertError) console.error('[SUPABASE MOVEMENTS ERROR]', movementsUpsertError);
        }
      } catch (error) { console.error('[SUPABASE MOVEMENTS ERROR]', error); }
      await saveAppStateToSupabase(getFullLocalState());
    }
  }
}

// Brand & Category operations
export function createBrand(data: Omit<Brand, 'id'>): Brand {
  const brands = getBrands();
  const brand: Brand = { ...data, id: generateId('brand') };
  brands.push(brand);
  saveBrands(brands);
  if (isSupabaseConfigured && !suppressRemoteSync && supabase) {
    supabase.from('brands').upsert([brand]).then(({ error }) => {
      if (error) console.error('[SUPABASE BRANDS ERROR]', error);
    }).catch((error) => console.error('[SUPABASE BRANDS ERROR]', error));
  }
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
  if (isSupabaseConfigured && !suppressRemoteSync && supabase) {
    supabase.from('brands').upsert([brand]).then(({ error }) => {
      if (error) console.error('[SUPABASE BRANDS ERROR]', error);
    }).catch((error) => console.error('[SUPABASE BRANDS ERROR]', error));
  }
  return brand;
}

export function createCategory(data: Omit<Category, 'id'>): Category {
  const categories = getCategories();
  const category: Category = { ...data, id: generateId('cat') };
  categories.push(category);
  saveCategories(categories);
  if (isSupabaseConfigured && !suppressRemoteSync && supabase) {
    supabase.from('categories').upsert([category]).then(({ error }) => {
      if (error) console.error('[SUPABASE CATEGORIES ERROR]', error);
    }).catch((error) => console.error('[SUPABASE CATEGORIES ERROR]', error));
  }
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
    try {
      const { error } = await supabase.from('categories').upsert([cat]);
      if (error) console.error('[SUPABASE CATEGORIES ERROR]', error);
    } catch (error) { console.error('[SUPABASE CATEGORIES ERROR]', error); }
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
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) console.error('[SUPABASE CATEGORIES ERROR]', error);
    } catch (error) { console.error('[SUPABASE CATEGORIES ERROR]', error); }
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
    try {
      const { error } = await supabase.from('categories').upsert([cat]);
      if (error) console.error('[SUPABASE CATEGORIES ERROR]', error);
    } catch (error) { console.error('[SUPABASE CATEGORIES ERROR]', error); }
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
      try {
        if (toCreateBrands.length > 0) {
          const { error } = await supabase.from('brands').upsert(toCreateBrands);
          if (error) console.error('[SUPABASE SYNC ERROR]', error);
        }
      } catch (error) { console.error('[SUPABASE SYNC ERROR]', error); }
      try {
        if (toCreateCats.length > 0) {
          const { error } = await supabase.from('categories').upsert(toCreateCats);
          if (error) console.error('[SUPABASE LOAD ERROR]', error);
        }
      } catch (error) { console.error('[SUPABASE LOAD ERROR]', error); }
    }
  } catch (e) {
    console.error('[SUPABASE LOAD ERROR]', e);
  }
}

export function seedDatabase(): void {
  // Never run seed in production builds
  if (import.meta.env.PROD) return;

  if (safeGetLocalStorage(INITIALIZED_KEY)) return;

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
  safeSetLocalStorage(INITIALIZED_KEY, 'true');
}


export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'viewer';
  avatar?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subcategories: Subcategory[];
}

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
}

export type ProductStatus = 'active' | 'inactive' | 'archived';

export interface Product {
  id: string;
  name: string;
  sku: string;
  brandId: string;
  brand?: Brand;
  categoryId: string;
  category?: Category;
  subcategoryId: string;
  subcategory?: Subcategory;
  description: string;
  tags: string[];
  images: string[];
  status: ProductStatus;
  variants: ProductVariant[];
  totalQuantity: number;
  costPrice: number;
  salePrice: number;
  createdAt: string;
  updatedAt: string;
  externalSource?: string;
  externalId?: string;
  external_source?: string;
  external_id?: string;
}

export type MovementType = 'entry' | 'exit' | 'adjustment' | 'transfer' | 'return';

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  variantId?: string;
  variantName?: string;
  variantLabel?: string;
  variant?: ProductVariant;
  size?: string;
  color?: string;
  type: MovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  // Unit price applied for this movement (sale price per unit)
  unitPrice?: number;
  // Cost price per unit at time of movement
  costPrice?: number;
  unitCost?: number;
  // Total value for this movement after discounts
  totalValue?: number;
  totalAmount?: number;
  totalCost?: number;
  totalProfit?: number;
  profit?: number;
  discountType?: 'fixed' | 'percent' | 'none';
  discountAmount?: number;
  discountPercent?: number;
  subtotalAmount?: number;
  finalAmount?: number;
  saleSubtotal?: number;
  saleDiscountTotal?: number;
  saleFinalTotal?: number;
  // Snapshot of product name to avoid lookup later
  productName?: string;
  customerName?: string;
  paymentStatus?: 'paid' | 'pending' | 'cancelled';
  paymentMethod?: string;
  paidAt?: string | null;
  saleGroupId?: string;
  reason: string;
  notes?: string;
  userId: string;
  user?: User;
  createdAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  totalStock: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalValue: number;
  totalSaleValue: number;
  recentMovements: StockMovement[];
  topProducts: { product: Product; quantity: number }[];
  stockByCategory: { category: string; quantity: number; value: number }[];
  movementsByDay: { date: string; entries: number; exits: number }[];
}

export interface FilterOptions {
  search: string;
  brandId: string;
  categoryId: string;
  subcategoryId: string;
  size: string;
  color: string;
  status: ProductStatus | '';
  minPrice: string;
  maxPrice: string;
  stockStatus: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface Alert {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'info' | 'warning';
  message: string;
  productId?: string;
  product?: Product;
  createdAt: string;
  read: boolean;
}

export interface StoreConfig {
  storeName: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashOutflow {
  id: string;
  description: string;
  amount: number;
  categoryId?: string | null;
  categoryName: string;
  paymentMethod: string;
  outflowDate: string;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  receiptMimeType?: string | null;
  receiptSize?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashOutflowCategory {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}


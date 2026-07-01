import { supabase } from './supabase';
import type { Product, ProductVariant, StockMovement } from '../types';

export const CATALOG_STOCK_SYNC_WARNING = 'Venda registrada e estoque interno atualizado, mas o catalogo nao foi sincronizado.';

type CatalogLinkedProduct = Product & {
  externalSource?: string;
  externalId?: string;
  external_source?: string;
  external_id?: string;
};

type CatalogStockSyncContext = {
  action: 'sale' | 'restore';
  movementId?: string;
  variant?: ProductVariant;
  endpoint?: string;
};

export class CatalogStockSyncError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'CatalogStockSyncError';
    this.details = details;
  }
}

export function shouldSyncCatalogStock(product: Product | null | undefined): product is CatalogLinkedProduct {
  const linked = product as CatalogLinkedProduct | null | undefined;
  return Boolean(
    linked &&
    (linked.externalSource === 'frazon_catalog' || linked.external_source === 'frazon_catalog' || linked.externalId || linked.external_id)
  );
}

export async function syncCatalogStockAfterSale(
  product: Product,
  variant: ProductVariant | undefined,
  _quantity: number,
  movement: StockMovement
): Promise<void> {
  await syncCatalogStockProduct(product, {
    action: 'sale',
    movementId: movement.id,
    variant,
  });
}

export async function syncCatalogStockAfterRestore(product: Product, movement: StockMovement): Promise<void> {
  const variant = movement.variantId ? product.variants.find(item => item.id === movement.variantId) : undefined;
  await syncCatalogStockProduct(product, {
    action: 'restore',
    movementId: movement.id,
    variant,
  });
}

export async function syncCatalogStockProduct(product: Product, context: CatalogStockSyncContext): Promise<void> {
  const linked = product as CatalogLinkedProduct;
  const endpoint = context.endpoint || '/api/sync-catalog-stock';
  const accessToken = await getInventoryAccessToken();
  const environment = getRuntimeEnvironment();
  const selectedVariant = context.variant;
  const details = {
    productId: product.id,
    productName: product.name,
    externalProductId: linked.externalId || linked.external_id || null,
    variantId: selectedVariant?.id || null,
    size: selectedVariant?.size || null,
    color: selectedVariant?.color || null,
    endpoint,
    environment,
    action: context.action,
  };

  if (!accessToken) {
    throw new CatalogStockSyncError('Sessao Supabase ausente. Faca login novamente para sincronizar o catalogo.', details);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product.id,
        externalProductId: linked.externalId || linked.external_id || null,
        variants: (product.variants || []).map(item => ({
          id: item.id,
          size: item.size,
          color: item.color,
          quantity: Number(item.quantity) || 0,
        })),
        totalQuantity: Number(product.totalQuantity) || 0,
        updatedAt: product.updatedAt || new Date().toISOString(),
        movementId: context.movementId || null,
        context: {
          variantId: selectedVariant?.id || null,
          size: selectedVariant?.size || null,
          color: selectedVariant?.color || null,
        },
      }),
    });
  } catch (error: any) {
    throw new CatalogStockSyncError(
      getLocalApiMessage(error?.message || 'Falha de rede ao chamar API de catalogo.', endpoint, environment),
      { ...details, message: error?.message || String(error) }
    );
  }

  const parsed = await parseSyncResponse(response);
  if (!response.ok || !parsed.ok) {
    throw new CatalogStockSyncError(parsed.error || CATALOG_STOCK_SYNC_WARNING, {
      ...details,
      status: response.status,
      response: parsed,
    });
  }
}

async function parseSyncResponse(response: Response): Promise<{ ok?: boolean; error?: string; [key: string]: unknown }> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text().catch(() => '');
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      error: getLocalApiMessage('A API de catalogo nao retornou JSON.', '/api/sync-catalog-stock', getRuntimeEnvironment()),
      contentType,
      bodyPreview: body.slice(0, 160),
    };
  }

  try {
    return JSON.parse(body || '{}');
  } catch (error: any) {
    return { ok: false, error: `Resposta invalida da API de catalogo: ${error?.message || error}` };
  }
}

function getLocalApiMessage(message: string, endpoint: string, environment: string): string {
  if (environment === 'local-vite' && endpoint.startsWith('/api/')) {
    return `${message} Sync de catalogo requer Vercel API. Rode com npx vercel dev --listen 3001 ou teste em producao.`;
  }
  return message;
}

function getRuntimeEnvironment(): string {
  if (typeof window === 'undefined') return 'server';
  const host = window.location.host;
  if (/localhost|127\.0\.0\.1/.test(host)) return 'local-vite';
  return 'prod';
}

async function getInventoryAccessToken(): Promise<string> {
  if (!supabase) return '';
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[CATALOG STOCK SYNC ERROR]', { message: error.message });
    return '';
  }
  return data.session?.access_token || '';
}

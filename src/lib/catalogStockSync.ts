import { supabase } from './supabase';
import type { Product, ProductVariant, StockMovement } from '../types';

export const CATALOG_STOCK_SYNC_WARNING = 'Venda registrada, mas o estoque do catálogo não foi sincronizado.';

type CatalogLinkedProduct = Product & {
  externalSource?: string;
  externalId?: string;
  external_source?: string;
  external_id?: string;
};

export function shouldSyncCatalogStock(product: Product | null | undefined): product is CatalogLinkedProduct {
  const linked = product as CatalogLinkedProduct | null | undefined;
  return Boolean(
    linked &&
    (linked.externalSource === 'frazon_catalog' || linked.external_source === 'frazon_catalog') &&
    (linked.externalId || linked.external_id)
  );
}

export async function syncCatalogStockAfterSale(product: Product, variant: ProductVariant | undefined, quantity: number, movement: StockMovement): Promise<void> {
  const linked = product as CatalogLinkedProduct;
  const externalProductId = linked.externalId || linked.external_id;
  if (!externalProductId) return;

  const accessToken = await getInventoryAccessToken();
  if (!accessToken) throw new Error(CATALOG_STOCK_SYNC_WARNING);

  const response = await fetch('/api/sync-catalog-stock', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      externalProductId,
      variantId: variant?.id,
      color: variant?.color || '',
      size: variant?.size || '',
      quantity,
      movementId: movement.id,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || CATALOG_STOCK_SYNC_WARNING);
  }
}

async function getInventoryAccessToken(): Promise<string> {
  if (!supabase) return '';
  const { data, error } = await supabase.auth.getSession();
  if (error) return '';
  return data.session?.access_token || '';
}

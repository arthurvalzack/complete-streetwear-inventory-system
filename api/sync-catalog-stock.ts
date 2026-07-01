type StockSyncPayload = {
  productId?: string;
  externalProductId?: string;
  variants?: Array<{
    id?: string;
    size?: string;
    color?: string;
    quantity?: number;
    stock?: number;
  }>;
  totalQuantity?: number;
  updatedAt?: string;
  movementId?: string;
  context?: {
    variantId?: string;
    size?: string;
    color?: string;
  };
};

type CatalogVariant = {
  id?: string;
  color?: { name?: string; hex?: string } | string;
  size?: string;
  stock?: number;
  [key: string]: unknown;
};

type CatalogProductRow = {
  id: string;
  variants: CatalogVariant[] | string | null;
  total_quantity?: number;
};

type CatalogLookupResult = {
  product: CatalogProductRow;
  matchedBy: 'id' | 'external_id' | 'legacy_id';
};

class CatalogFetchError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(details || `Catalog Supabase error ${status}`);
    this.name = 'CatalogFetchError';
    this.status = status;
    this.details = details;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const inventoryUrl = process.env.INVENTORY_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const inventoryAnonKey = process.env.INVENTORY_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const catalogUrl = process.env.CATALOG_SUPABASE_URL;
  const catalogServiceRoleKey = process.env.CATALOG_SUPABASE_SERVICE_ROLE_KEY;
  const missingEnv = [
    !inventoryUrl ? 'VITE_SUPABASE_URL or INVENTORY_SUPABASE_URL' : '',
    !inventoryAnonKey ? 'VITE_SUPABASE_ANON_KEY or INVENTORY_SUPABASE_ANON_KEY' : '',
    !catalogUrl ? 'CATALOG_SUPABASE_URL' : '',
    !catalogServiceRoleKey ? 'CATALOG_SUPABASE_SERVICE_ROLE_KEY' : '',
  ].filter(Boolean);

  if (missingEnv.length > 0) {
    return res.status(500).json({
      error: `Faltando ${missingEnv.join(', ')}`,
      missingEnv,
    });
  }

  const token = getBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Sessao Supabase ausente. Faca login novamente antes de sincronizar o catalogo.' });

  const validUser = await validateInventoryUser(inventoryUrl!, inventoryAnonKey!, token);
  if (!validUser) return res.status(401).json({ error: 'Sessao Supabase invalida para sincronizar o catalogo.' });

  const payload = parseBody(req.body) as StockSyncPayload | null;
  if (!isValidPayload(payload)) {
    return res.status(400).json({ error: 'Payload invalido para sincronizacao de estoque do catalogo.' });
  }

  try {
    const lookup = await findCatalogProduct(catalogUrl!, catalogServiceRoleKey!, payload);
    if (!lookup) {
      return res.status(404).json({
        error: 'Produto do catalogo nao encontrado.',
        productId: payload.productId,
        externalProductId: payload.externalProductId || null,
      });
    }

    const catalogVariants = parseVariants(lookup.product.variants);
    const updatedVariants = mergeCatalogVariantStock(catalogVariants, payload.variants);
    await updateCatalogProductStock(catalogUrl!, catalogServiceRoleKey!, lookup.product.id, {
      variants: updatedVariants,
      totalQuantity: Number(payload.totalQuantity),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      productId: lookup.product.id,
      matchedBy: lookup.matchedBy,
      movementId: payload.movementId || null,
    });
  } catch (error: any) {
    console.error('[CATALOG STOCK SYNC API ERROR]', {
      productId: payload.productId,
      externalProductId: payload.externalProductId,
      movementId: payload.movementId,
      error: error?.message || error,
    });
    return res.status(500).json({ error: error?.message || 'Erro ao sincronizar estoque do catalogo.' });
  }
}

function getBearerToken(authorization?: string): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function validateInventoryUser(inventoryUrl: string, anonKey: string, token: string): Promise<boolean> {
  const response = await fetch(`${trimSlash(inventoryUrl)}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });
  return response.ok;
}

function parseBody(body: unknown): any {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return body;
}

function isValidPayload(payload: StockSyncPayload | null): payload is Required<Pick<StockSyncPayload, 'productId' | 'variants' | 'totalQuantity'>> & StockSyncPayload {
  return Boolean(
    payload?.productId &&
    Array.isArray(payload.variants) &&
    Number.isFinite(Number(payload.totalQuantity))
  );
}

async function findCatalogProduct(catalogUrl: string, serviceRoleKey: string, payload: StockSyncPayload): Promise<CatalogLookupResult | null> {
  const primaryId = payload.productId!;
  const product = await fetchCatalogProductByColumn(catalogUrl, serviceRoleKey, 'id', primaryId);
  if (product) return { product, matchedBy: 'id' };

  const byExternalId = await fetchCatalogProductByColumn(catalogUrl, serviceRoleKey, 'external_id', primaryId);
  if (byExternalId) return { product: byExternalId, matchedBy: 'external_id' };

  const ids = [payload.externalProductId, `catalog_${primaryId}`]
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

  for (const id of ids) {
    const fallbackProduct = await fetchCatalogProductByColumn(catalogUrl, serviceRoleKey, 'id', id);
    if (fallbackProduct) return { product: fallbackProduct, matchedBy: id === `catalog_${primaryId}` ? 'legacy_id' : 'id' };
  }

  return null;
}

async function fetchCatalogProductByColumn(catalogUrl: string, serviceRoleKey: string, column: 'id' | 'external_id', value: string): Promise<CatalogProductRow | null> {
  const params = new URLSearchParams({ select: 'id,variants', [column]: `eq.${value}`, limit: '1' });
  const response = await catalogFetch(catalogUrl, serviceRoleKey, `/rest/v1/products?${params.toString()}`, {}, column === 'external_id');
  if (!response) return null;
  const rows = await response.json() as CatalogProductRow[];
  return rows[0] || null;
}

function parseVariants(variants: CatalogProductRow['variants']): CatalogVariant[] {
  if (typeof variants === 'string') {
    try {
      const parsed = JSON.parse(variants);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(variants) ? variants : [];
}

function mergeCatalogVariantStock(catalogVariants: CatalogVariant[], inventoryVariants: StockSyncPayload['variants']): CatalogVariant[] {
  const inventory = inventoryVariants || [];
  if (catalogVariants.length === 0) {
    return inventory.map(inventoryVariant => ({
      id: inventoryVariant.id,
      size: inventoryVariant.size,
      color: inventoryVariant.color,
      stock: safeNumber(inventoryVariant.quantity ?? inventoryVariant.stock, 0),
    }));
  }
  return catalogVariants.map(catalogVariant => {
    const match = inventory.find(inventoryVariant => sameVariant(catalogVariant, inventoryVariant));
    if (!match) return catalogVariant;
    const nextStock = safeNumber(match.quantity ?? match.stock, safeNumber(catalogVariant.stock, 0));
    return { ...catalogVariant, stock: nextStock };
  });
}

function sameVariant(catalogVariant: CatalogVariant, inventoryVariant: NonNullable<StockSyncPayload['variants']>[number]): boolean {
  const catalogId = String(catalogVariant.id || '');
  const inventoryId = String(inventoryVariant.id || '');
  if (catalogId && inventoryId && (catalogId === inventoryId || `inv_${catalogId}` === inventoryId || catalogId === inventoryId.replace(/^inv_/, ''))) {
    return true;
  }

  return normalizeText(getCatalogColorName(catalogVariant.color)) === normalizeText(inventoryVariant.color || '') &&
    normalizeText(catalogVariant.size || '') === normalizeText(inventoryVariant.size || '');
}

function getCatalogColorName(color: CatalogVariant['color']): string {
  if (!color) return '';
  if (typeof color === 'string') return color;
  return color.name || '';
}

async function updateCatalogProductStock(
  catalogUrl: string,
  serviceRoleKey: string,
  productId: string,
  data: { variants: CatalogVariant[]; totalQuantity: number; updatedAt: string }
): Promise<void> {
  const path = `/rest/v1/products?id=eq.${encodeURIComponent(productId)}`;
  const basePatch = {
    variants: data.variants,
    updated_at: data.updatedAt,
  };

  try {
    await catalogFetch(catalogUrl, serviceRoleKey, path, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        ...basePatch,
        total_quantity: data.totalQuantity,
      }),
    });
  } catch (error: any) {
    if (!isMissingTotalQuantityColumnError(error)) throw error;

    console.warn('[CATALOG STOCK SYNC WARNING] total_quantity column missing, synced variants only.', {
      productId,
      status: error.status,
    });

    await catalogFetch(catalogUrl, serviceRoleKey, path, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(basePatch),
    });
  }
}

async function catalogFetch(catalogUrl: string, serviceRoleKey: string, path: string, init: RequestInit = {}, allowMissingColumn = false): Promise<Response | null> {
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${trimSlash(catalogUrl)}${path}`, { ...init, headers });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    if (allowMissingColumn && (response.status === 400 || /external_id/i.test(details))) return null;
    throw new CatalogFetchError(response.status, details);
  }
  return response;
}

function isMissingTotalQuantityColumnError(error: any): boolean {
  const details = String(error?.details || error?.message || '');
  return details.includes('42703') && /total_quantity/i.test(details);
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function safeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, '');
}

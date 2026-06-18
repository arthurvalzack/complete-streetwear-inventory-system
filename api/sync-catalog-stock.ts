type StockSyncPayload = {
  externalProductId?: string;
  variantId?: string;
  color?: string;
  size?: string;
  quantity?: number;
  movementId?: string;
};

type CatalogProductRow = {
  id: string;
  variants: Array<{
    id?: string;
    color?: { name?: string; hex?: string };
    size?: string;
    stock?: number;
  }> | string | null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const inventoryUrl = process.env.INVENTORY_SUPABASE_URL;
  const inventoryAnonKey = process.env.INVENTORY_SUPABASE_ANON_KEY;
  const catalogUrl = process.env.CATALOG_SUPABASE_URL;
  const catalogServiceRoleKey = process.env.CATALOG_SUPABASE_SERVICE_ROLE_KEY;

  if (!inventoryUrl || !inventoryAnonKey || !catalogUrl || !catalogServiceRoleKey) {
    return res.status(500).json({ error: 'Catalog stock sync is not configured' });
  }

  const token = getBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const validUser = await validateInventoryUser(inventoryUrl, inventoryAnonKey, token);
  if (!validUser) return res.status(401).json({ error: 'Unauthorized' });

  const payload = parseBody(req.body) as StockSyncPayload | null;
  if (!isValidPayload(payload)) return res.status(400).json({ error: 'Invalid stock sync payload' });

  const product = await fetchCatalogProduct(catalogUrl, catalogServiceRoleKey, payload.externalProductId);
  if (!product) return res.status(404).json({ error: 'Produto do catálogo não encontrado.' });

  const variants = parseVariants(product.variants);
  const variantIndex = findCatalogVariantIndex(variants, payload);
  if (variantIndex === -1) return res.status(404).json({ error: 'Variação do catálogo não encontrada.' });

  const currentStock = safeNumber(variants[variantIndex].stock, 0);
  if (currentStock < payload.quantity) {
    return res.status(409).json({ error: 'Estoque divergente no catálogo. Venda registrada, mas a baixa não foi aplicada.' });
  }

  const updatedVariants = variants.map((variant, index) => index === variantIndex
    ? { ...variant, stock: currentStock - payload.quantity! }
    : variant);

  await updateCatalogProductVariants(catalogUrl, catalogServiceRoleKey, payload.externalProductId, updatedVariants);

  return res.status(200).json({ ok: true, movementId: payload.movementId || null });
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

function isValidPayload(payload: StockSyncPayload | null): payload is Required<Pick<StockSyncPayload, 'externalProductId' | 'color' | 'size' | 'quantity'>> & StockSyncPayload {
  return Boolean(
    payload?.externalProductId &&
    payload.color &&
    payload.size &&
    Number.isFinite(Number(payload.quantity)) &&
    Number(payload.quantity) > 0
  );
}

async function fetchCatalogProduct(catalogUrl: string, serviceRoleKey: string, productId: string): Promise<CatalogProductRow | null> {
  const params = new URLSearchParams({ select: 'id,variants', id: `eq.${productId}`, limit: '1' });
  const response = await catalogFetch(catalogUrl, serviceRoleKey, `/rest/v1/products?${params.toString()}`);
  const rows = await response.json() as CatalogProductRow[];
  return rows[0] || null;
}

function parseVariants(variants: CatalogProductRow['variants']): NonNullable<Exclude<CatalogProductRow['variants'], string>> {
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

function findCatalogVariantIndex(variants: ReturnType<typeof parseVariants>, payload: StockSyncPayload): number {
  const catalogVariantId = payload.variantId?.startsWith('inv_') ? payload.variantId.slice(4) : '';
  if (catalogVariantId) {
    const byId = variants.findIndex(variant => variant.id === catalogVariantId);
    if (byId !== -1) return byId;
  }

  const wantedColor = normalizeText(payload.color || '');
  const wantedSize = normalizeText(payload.size || '');
  return variants.findIndex(variant =>
    normalizeText(variant.color?.name || '') === wantedColor &&
    normalizeText(variant.size || '') === wantedSize
  );
}

async function updateCatalogProductVariants(catalogUrl: string, serviceRoleKey: string, productId: string, variants: ReturnType<typeof parseVariants>): Promise<void> {
  await catalogFetch(catalogUrl, serviceRoleKey, `/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ variants, updated_at: new Date().toISOString() }),
  });
}

async function catalogFetch(catalogUrl: string, serviceRoleKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${trimSlash(catalogUrl)}${path}`, { ...init, headers });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Catalog Supabase error ${response.status}`);
  }
  return response;
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

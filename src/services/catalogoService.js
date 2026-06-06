import { syncAllToRemote } from '../lib/database';

const CATALOG_ITEMS_KEY = 'frazon_catalogo_items';
const CATALOG_CONFIG_KEY = 'catalogoConfig';

function syncCatalogRemote() {
  syncAllToRemote().catch(error => console.error('[SUPABASE SYNC ERROR]', error));
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error('[LOCAL STORAGE READ ERROR]', { key, error });
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[LOCAL STORAGE WRITE ERROR]', { key, error });
    return false;
  }
}

function parseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function encodeCatalogoPayload(payload) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return '';
  }
}

function decodeCatalogoPayload(encoded) {
  if (!encoded) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

export function getCatalogoItems() {
  return parseJSON(safeGetItem(CATALOG_ITEMS_KEY), []);
}

export function saveCatalogoItems(items) {
  safeSetItem(CATALOG_ITEMS_KEY, JSON.stringify(items));
  syncCatalogRemote();
  return items;
}

export function getCatalogoConfig() {
  const defaultConfig = {
    title: 'Catálogo FRAZON STORE',
    description: 'Confira a seleção oficial de peças disponíveis para venda.',
    whatsapp: '',
    mensagem: 'Oi! Vi o catálogo da Frazon Store e tenho interesse em: {produto}. Pode me passar o valor e disponibilidade? 😊',
    updatedAt: new Date().toISOString(),
  };

  const stored = parseJSON(safeGetItem(CATALOG_CONFIG_KEY), defaultConfig);
  return {
    ...defaultConfig,
    ...stored,
    updatedAt: stored.updatedAt || defaultConfig.updatedAt,
  };
}

export function updateCatalogoConfig(data) {
  const config = {
    ...getCatalogoConfig(),
    ...data,
    updatedAt: new Date().toISOString(),
  };
  safeSetItem(CATALOG_CONFIG_KEY, JSON.stringify(config));
  syncCatalogRemote();
  return config;
}

export function createCatalogoShareLink(baseUrl, catalogProducts = [], config = {}) {
  const payload = {
    ids: catalogProducts.map(product => product.id),
    products: catalogProducts,
    config: {
      ...getCatalogoConfig(),
      ...config,
    },
  };
  const encoded = encodeCatalogoPayload(payload);
  return `${baseUrl}/catalogo?catalogo=${encodeURIComponent(encoded)}`;
}

export function parseCatalogoShareParam(search) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const encoded = params.get('catalogo');
  const decoded = decodeCatalogoPayload(encoded);
  if (!decoded || !Array.isArray(decoded.ids)) return null;
  return decoded;
}

export function addProductToCatalog(productId) {
  const items = getCatalogoItems();
  if (!items.includes(productId)) {
    items.push(productId);
    saveCatalogoItems(items);
  }
  return items;
}

export function removeProductFromCatalog(productId) {
  const items = getCatalogoItems();
  const nextItems = items.filter(id => id !== productId);
  saveCatalogoItems(nextItems);
  return nextItems;
}

export function toggleCatalogoProduct(productId) {
  const items = getCatalogoItems();
  if (items.includes(productId)) {
    return removeProductFromCatalog(productId);
  }
  return addProductToCatalog(productId);
}

export function isProductPublished(productId) {
  return getCatalogoItems().includes(productId);
}

// Thin TypeScript wrapper around the existing JS service to provide basic typings
// This file forwards calls to the JS implementation and exposes `any`-typed exports
// to satisfy TypeScript imports used across the codebase.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const svc: any = require('./catalogoService.js');

export const createCatalogoShareLink = (...args: any[]) => svc.createCatalogoShareLink?.(...args);
export const getCatalogoConfig = (...args: any[]) => svc.getCatalogoConfig?.(...args);
export const getCatalogoItems = (...args: any[]) => svc.getCatalogoItems?.(...args);
export const toggleCatalogoProduct = (...args: any[]) => svc.toggleCatalogoProduct?.(...args);
export const removeProductFromCatalog = (...args: any[]) => svc.removeProductFromCatalog?.(...args);
export const updateCatalogoConfig = (...args: any[]) => svc.updateCatalogoConfig?.(...args);
export const parseCatalogoShareParam = (...args: any[]) => svc.parseCatalogoShareParam?.(...args);

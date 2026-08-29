/* =========================================================
   Onion Support - Facturas API · Raw Alias Reconciliation

   La frontera principal vive en facturas.api.alias-core.js. Este adaptador
   reconcilia aliases técnicos antes de que la normalización histórica pueda
   descartarlos, y vuelve a delegar todo el resto sin duplicar transporte.
========================================================= */

import AliasCoreDefault, * as AliasCore from "./facturas.api.alias-core.js";

export * from "./facturas.api.alias-core.js";

export const FACTURA_RAW_ALIAS_RECONCILIATION_VERSION =
  "facturas.api.raw-alias-reconciliation.v1";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function reconcileArray(items = []) {
  const output = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = AliasCore.canonicalizeFacturaListItem(raw);
    if (!item) continue;

    const id = String(
      item.id ||
      item.facturaId ||
      item.invoiceId ||
      item.numeroFacturaLegal ||
      ""
    ).trim();

    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    output.push(item);
  }

  return output;
}

function reconcilePayload(value = null, depth = 0, seen = new WeakSet()) {
  if (Array.isArray(value)) return reconcileArray(value);
  if (!isObject(value) || depth > 4 || seen.has(value)) return value;
  seen.add(value);

  let output = value;
  let changed = false;

  for (const name of [
    "items",
    "facturas",
    "invoices",
    "rows",
    "records",
    "results",
    "docs",
    "documents",
    "value",
    "list",
  ]) {
    if (!Array.isArray(value[name])) continue;
    if (!changed) output = { ...value };
    output[name] = reconcileArray(value[name]);
    changed = true;
  }

  if (Array.isArray(value.data)) {
    if (!changed) output = { ...value };
    output.data = reconcileArray(value.data);
    changed = true;
  }

  for (const name of ["data", "payload", "result"]) {
    if (!isObject(value[name])) continue;
    const nested = reconcilePayload(value[name], depth + 1, seen);
    if (nested === value[name]) continue;
    if (!changed) output = { ...value };
    output[name] = nested;
    changed = true;
  }

  if (changed) {
    output.meta = {
      ...(isObject(value.meta) ? value.meta : {}),
      rawAliasReconciliationVersion:
        FACTURA_RAW_ALIAS_RECONCILIATION_VERSION,
    };
  }

  return output;
}

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  return AliasCore.normalizeFacturasListResponse(
    reconcilePayload(payload),
    requestMeta
  );
}

export const FacturasApi = Object.freeze({
  ...AliasCoreDefault,
  ...AliasCore,
  FACTURA_RAW_ALIAS_RECONCILIATION_VERSION,
  normalizeFacturasListResponse,
});

export default FacturasApi;

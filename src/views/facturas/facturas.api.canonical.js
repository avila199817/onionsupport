/* =========================================================
   Onion Support - Facturas API · Raw Alias Reconciliation

   La frontera principal vive en facturas.api.alias-core.js. Este adaptador
   reconcilia aliases técnicos antes de que la normalización histórica pueda
   descartarlos, y vuelve a delegar todo el resto sin duplicar transporte.
========================================================= */

import AliasCoreDefault, * as AliasCore from "./facturas.api.alias-core.js";

export * from "./facturas.api.alias-core.js";

export const FACTURA_RAW_ALIAS_RECONCILIATION_VERSION =
  "facturas.api.raw-alias-reconciliation.v4";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "") {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function technicalVersion(value = "") {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");

  return normalized.includes("idempotency") ||
    normalized.includes("idempotencia");
}

function stripTechnicalProjection(value = null, depth = 0, seen = new WeakSet()) {
  if (!isObject(value) || depth > 3 || seen.has(value)) return value;
  seen.add(value);

  const output = { ...value };

  delete output.responseSnapshot;
  delete output.resultSnapshot;
  delete output.snapshot;
  delete output.operation;
  delete output.operationType;
  delete output.operationHash;
  delete output.payloadHash;
  delete output.idempotencyVersion;
  delete output.ttl;
  delete output.ownerToken;
  delete output.leaseUntil;
  delete output.lastHeartbeatAt;

  if (technicalVersion(output.version)) delete output.version;

  if (isObject(output.meta)) {
    output.meta = { ...output.meta };
    delete output.meta.technicalAliasId;
    delete output.meta.operationHash;
    delete output.meta.payloadHash;
    delete output.meta.idempotencyVersion;
  }

  if (isObject(output.raw)) {
    output.raw = stripTechnicalProjection(output.raw, depth + 1, seen);
  }

  return output;
}

function withCanonicalRecoveredRaw(value = null) {
  if (!isObject(value) || value.meta?.technicalAliasRecovered !== true) {
    return value;
  }

  const canonical = stripTechnicalProjection(value);
  const raw = stripTechnicalProjection({ ...canonical });
  delete raw.raw;

  return {
    ...canonical,
    raw,
  };
}

function reconcileArray(items = []) {
  const output = [];
  const seen = new Set();
  let removed = 0;

  for (const raw of Array.isArray(items) ? items : []) {
    const technical = AliasCore.isFacturaTechnicalRecord(raw) === true;
    const resolved = AliasCore.canonicalizeFacturaListItem(raw);
    const item = technical
      ? stripTechnicalProjection(resolved)
      : resolved;

    if (!item) {
      removed += 1;
      continue;
    }

    const id = text(
      item.id ||
      item.facturaId ||
      item.invoiceId ||
      item.numeroFacturaLegal ||
      ""
    );

    if (id && seen.has(id)) {
      removed += 1;
      continue;
    }

    if (id) seen.add(id);
    output.push(item);
  }

  return { items: output, removed };
}

function primaryItems(value = {}) {
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
    "data",
  ]) {
    if (Array.isArray(value?.[name])) return value[name];
  }

  return [];
}

function adjustCountFields(value = {}, removed = 0, minimum = 0) {
  if (!isObject(value) || removed <= 0) return value;

  let output = value;
  let changed = false;

  for (const name of [
    "count",
    "returned",
    "total",
    "totalCount",
    "remoteCount",
    "totalMatched",
  ]) {
    const current = finiteNumber(value[name]);
    if (current === null) continue;

    if (!changed) output = { ...value };
    output[name] = Math.max(minimum, current - removed);
    changed = true;
  }

  return changed ? output : value;
}

function reconcilePayload(value = null, depth = 0, seen = new WeakSet()) {
  if (Array.isArray(value)) return reconcileArray(value).items;
  if (!isObject(value) || depth > 4 || seen.has(value)) return value;
  seen.add(value);

  let output = value;
  let changed = false;
  let removed = 0;

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

    const reconciled = reconcileArray(value[name]);
    if (!changed) output = { ...value };
    output[name] = reconciled.items;
    changed = true;
    removed = Math.max(removed, reconciled.removed);
  }

  if (Array.isArray(value.data)) {
    const reconciled = reconcileArray(value.data);
    if (!changed) output = { ...value };
    output.data = reconciled.items;
    changed = true;
    removed = Math.max(removed, reconciled.removed);
  }

  for (const name of ["data", "payload", "result"]) {
    if (!isObject(value[name])) continue;
    const nested = reconcilePayload(value[name], depth + 1, seen);
    if (nested === value[name]) continue;

    if (!changed) output = { ...value };
    output[name] = nested;
    changed = true;
  }

  if (!changed) return value;

  const minimum = primaryItems(output).length;
  if (removed > 0) {
    output = adjustCountFields(output, removed, minimum);

    for (const name of ["meta", "paging", "pagination", "page"]) {
      if (!isObject(output[name])) continue;
      output[name] = adjustCountFields(output[name], removed, minimum);
    }
  }

  output.meta = {
    ...(isObject(output.meta) ? output.meta : {}),
    rawAliasReconciliationVersion:
      FACTURA_RAW_ALIAS_RECONCILIATION_VERSION,
    rawAliasRecordsReconciled: removed,
  };

  return output;
}

function restoreCanonicalRaw(response = null) {
  if (Array.isArray(response)) {
    return response.map(withCanonicalRecoveredRaw);
  }

  if (!isObject(response) || !Array.isArray(response.items)) {
    return response;
  }

  const items = response.items.map(withCanonicalRecoveredRaw);

  return {
    ...response,
    items,
    facturas: items,
    invoices: items,
    data: items,
    count: items.length,
    meta: {
      ...(isObject(response.meta) ? response.meta : {}),
      rawAliasReconciliationVersion:
        FACTURA_RAW_ALIAS_RECONCILIATION_VERSION,
    },
  };
}

export function normalizeFacturasListResponse(payload = null, requestMeta = {}) {
  return restoreCanonicalRaw(
    AliasCore.normalizeFacturasListResponse(
      reconcilePayload(payload),
      requestMeta
    )
  );
}

export const FacturasApi = Object.freeze({
  ...AliasCoreDefault,
  ...AliasCore,
  FACTURA_RAW_ALIAS_RECONCILIATION_VERSION,
  normalizeFacturasListResponse,
});

export default FacturasApi;

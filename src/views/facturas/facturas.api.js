/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   RESPONSABILIDADES:
   - centralizar las llamadas HTTP del módulo de facturas
   - exponer operaciones de listado, detalle, pdf y envío
   - aislar la vista del acceso directo al apiClient
   - mantener endpoints y timeouts en un único punto
   - tolerar distintos shapes del cliente HTTP
   - mantener paridad operativa con incidencias.api

   HARDENING PRO:
   - validación defensiva de ids y disposición
   - helpers comunes para requests GET/POST
   - endpoints centralizados y extensibles
   - soporte inline / attachment robusto
   - surface pública estable
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const FACTURAS_ENDPOINT = "/api/facturas";

export const FACTURAS_TIMEOUT = 15000;
export const FACTURAS_SEND_TIMEOUT = 20000;

export const FACTURAS_DISPOSITIONS = Object.freeze({
  INLINE: "inline",
  ATTACHMENT: "attachment",
});

export const FACTURAS_ENDPOINTS = Object.freeze({
  collection: FACTURAS_ENDPOINT,
  detail: (id) => `${getFacturaEndpoint(id)}`,
  pdf: (id, disposition = FACTURAS_DISPOSITIONS.ATTACHMENT) =>
    buildFacturaPdfEndpoint(id, disposition),
  send: (id) => `${getFacturaEndpoint(id)}/enviar`,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

/* =========================================================
   CLIENT RESOLUTION
========================================================= */

export function getApiClient() {
  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null;

  if (!client) {
    throw new Error("FACTURAS_API_CLIENT_UNAVAILABLE");
  }

  return client;
}

function assertMethod(client, method = "") {
  const name = safeText(method, "").toLowerCase();

  if (!name || typeof client?.[name] !== "function") {
    throw new Error(`FACTURAS_API_METHOD_UNAVAILABLE:${name || "unknown"}`);
  }

  return client[name].bind(client);
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function normalizeFacturaId(id = "") {
  const facturaId = safeText(id, "");

  if (!facturaId) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return facturaId;
}

export function getFacturaEndpoint(id = "") {
  const facturaId = normalizeFacturaId(id);
  return `${FACTURAS_ENDPOINT}/${encodeURIComponent(facturaId)}`;
}

export function normalizeFacturaPdfDisposition(disposition = "") {
  const value = safeText(disposition, FACTURAS_DISPOSITIONS.ATTACHMENT).toLowerCase();

  if (value === FACTURAS_DISPOSITIONS.INLINE) {
    return FACTURAS_DISPOSITIONS.INLINE;
  }

  return FACTURAS_DISPOSITIONS.ATTACHMENT;
}

export function buildFacturaPdfEndpoint(
  id = "",
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT
) {
  const facturaId = normalizeFacturaId(id);
  const finalDisposition = normalizeFacturaPdfDisposition(disposition);

  if (finalDisposition === FACTURAS_DISPOSITIONS.INLINE) {
    return `${getFacturaEndpoint(facturaId)}/pdf?disposition=inline`;
  }

  return `${getFacturaEndpoint(facturaId)}/descargar?disposition=attachment`;
}

/* =========================================================
   REQUEST HELPERS
========================================================= */

function buildRequestOptions({
  timeout = FACTURAS_TIMEOUT,
  auth = true,
  extra = null,
} = {}) {
  return {
    timeout,
    auth,
    ...safeObject(extra),
  };
}

async function apiGet(endpoint = "", options = {}) {
  const client = getApiClient();
  const request = assertMethod(client, "get");

  return request(endpoint, buildRequestOptions(options));
}

async function apiPost(endpoint = "", body = {}, options = {}) {
  const client = getApiClient();

  if (typeof client?.post === "function") {
    return client.post(
      endpoint,
      body,
      buildRequestOptions(options)
    );
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "POST",
      body,
      ...buildRequestOptions(options),
    });
  }

  throw new Error("FACTURAS_API_METHOD_UNAVAILABLE:post");
}

/* =========================================================
   PUBLIC REQUESTS
========================================================= */

export async function fetchFacturasRequest({
  timeout = FACTURAS_TIMEOUT,
  auth = true,
} = {}) {
  return apiGet(FACTURAS_ENDPOINTS.collection, {
    timeout,
    auth,
  });
}

export async function fetchFacturaDetailRequest(
  id,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
  } = {}
) {
  return apiGet(FACTURAS_ENDPOINTS.detail(id), {
    timeout,
    auth,
  });
}

export async function fetchFacturaPdfUrlRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
  } = {}
) {
  return apiGet(
    FACTURAS_ENDPOINTS.pdf(id, disposition),
    {
      timeout,
      auth,
    }
  );
}

export async function sendFacturaRequest(
  id,
  payload = {},
  {
    timeout = FACTURAS_SEND_TIMEOUT,
    auth = true,
  } = {}
) {
  return apiPost(
    FACTURAS_ENDPOINTS.send(id),
    safeObject(payload),
    {
      timeout,
      auth,
    }
  );
}

/* =========================================================
   OPTIONAL HELPERS
========================================================= */

export function resolveFacturaPdfUrl(response = null) {
  const obj = safeObject(response);

  return safeText(
    first(
      obj?.file?.url,
      obj?.url,
      obj?.data?.file?.url,
      obj?.data?.url,
      obj?.result?.file?.url,
      obj?.result?.url,
      obj?.payload?.file?.url,
      obj?.payload?.url
    ),
    ""
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  FACTURAS_ENDPOINT,
  FACTURAS_TIMEOUT,
  FACTURAS_SEND_TIMEOUT,
  FACTURAS_DISPOSITIONS,
  FACTURAS_ENDPOINTS,

  getApiClient,
  normalizeFacturaId,
  getFacturaEndpoint,
  normalizeFacturaPdfDisposition,
  buildFacturaPdfEndpoint,
  resolveFacturaPdfUrl,

  fetchFacturasRequest,
  fetchFacturaDetailRequest,
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
};

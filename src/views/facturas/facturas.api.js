/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   RESPONSABILIDADES:
   - centralizar las llamadas HTTP del módulo de facturas
   - exponer operaciones de listado, detalle, pdf y envío
   - aislar la vista del acceso directo al apiClient
   - reutilizar shared/api/collectionApi para collection/detail
   - mantener endpoints y timeouts en un único punto
   - tolerar distintos shapes del cliente HTTP
   - mantener surface pública estable y clara

   HARDENING PRO:
   - validación defensiva de ids y disposition
   - helpers comunes para requests GET/POST
   - endpoints centralizados y extensibles
   - soporte inline / attachment robusto
   - normalización ligera de respuestas
   - integración limpia con AppCore.apiClient
========================================================= */

import { AppCore } from "../../core/index.js";
import { createCollectionApi } from "../../shared/api/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const FACTURAS_RESOURCE = "facturas";
export const FACTURAS_ENDPOINT = "/api/facturas";

export const FACTURAS_TIMEOUT = 15000;
export const FACTURAS_SEND_TIMEOUT = 20000;

export const FACTURAS_DISPOSITIONS = Object.freeze({
  INLINE: "inline",
  ATTACHMENT: "attachment",
});

export const FACTURAS_ENDPOINTS = Object.freeze({
  collection: FACTURAS_ENDPOINT,
  detail: (id) => getFacturaEndpoint(id),
  pdf: (id, disposition = FACTURAS_DISPOSITIONS.ATTACHMENT) =>
    buildFacturaPdfEndpoint(id, disposition),
  send: (id) => `${getFacturaEndpoint(id)}/enviar`,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeObject(
  value,
  fallback = {}
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

function first(
  ...values
) {
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

/* =========================================================
   DOMAIN NORMALIZATION
========================================================= */

export function normalizeFactura(
  item = {}
) {
  const raw = safeObject(item);

  return {
    id: safeText(
      first(
        raw.id,
        raw._id
      ),
      ""
    ),
    numero: safeText(
      first(
        raw.numero,
        raw.number,
        raw.invoiceNumber
      ),
      ""
    ),
    clienteId: safeText(
      first(
        raw.clienteId,
        raw.clientId,
        raw.customerId
      ),
      ""
    ),
    clienteNombre: safeText(
      first(
        raw.clienteNombre,
        raw.clientName,
        raw.customerName
      ),
      ""
    ),
    total: safeNumber(
      first(
        raw.total,
        raw.amount,
        raw.importeTotal
      ),
      0
    ),
    moneda: safeText(
      first(
        raw.moneda,
        raw.currency
      ),
      "EUR"
    ),
    estado: safeText(
      first(
        raw.estado,
        raw.status
      ),
      "emitida"
    ),
    estadoPago: safeText(
      first(
        raw.estadoPago,
        raw.paymentStatus
      ),
      "pendiente"
    ),
    fecha: first(
      raw.fecha,
      raw.issueDate,
      raw.createdAt,
      null
    ),
    vencimiento: first(
      raw.vencimiento,
      raw.dueDate,
      raw.fechaVencimiento,
      null
    ),
    email: safeText(
      first(
        raw.email,
        raw.clientEmail,
        raw.customerEmail
      ),
      ""
    ),
    pdfUrl: safeText(
      first(
        raw.pdfUrl,
        raw.file?.url,
        raw.url
      ),
      ""
    ),
    raw,
  };
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
    throw new Error(
      "FACTURAS_API_CLIENT_UNAVAILABLE"
    );
  }

  return client;
}

function assertMethod(
  client,
  method = ""
) {
  const name = safeText(
    method,
    ""
  ).toLowerCase();

  if (
    !name ||
    typeof client?.[name] !== "function"
  ) {
    throw new Error(
      `FACTURAS_API_METHOD_UNAVAILABLE:${name || "unknown"}`
    );
  }

  return client[name].bind(client);
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function normalizeFacturaId(
  id = ""
) {
  const facturaId = safeText(
    id,
    ""
  );

  if (!facturaId) {
    throw new Error(
      "FACTURA_ID_REQUIRED"
    );
  }

  return facturaId;
}

export function getFacturaEndpoint(
  id = ""
) {
  const facturaId =
    normalizeFacturaId(id);

  return `${FACTURAS_ENDPOINT}/${encodeURIComponent(facturaId)}`;
}

export function normalizeFacturaPdfDisposition(
  disposition = ""
) {
  const value = safeText(
    disposition,
    FACTURAS_DISPOSITIONS.ATTACHMENT
  ).toLowerCase();

  if (
    value === FACTURAS_DISPOSITIONS.INLINE
  ) {
    return FACTURAS_DISPOSITIONS.INLINE;
  }

  return FACTURAS_DISPOSITIONS.ATTACHMENT;
}

export function buildFacturaPdfEndpoint(
  id = "",
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT
) {
  const facturaId =
    normalizeFacturaId(id);

  const finalDisposition =
    normalizeFacturaPdfDisposition(
      disposition
    );

  if (
    finalDisposition === FACTURAS_DISPOSITIONS.INLINE
  ) {
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
  responseType = "auto",
  raw = false,
  extra = null,
} = {}) {
  return {
    timeout,
    auth,
    responseType,
    raw,
    ...safeObject(extra),
  };
}

async function apiGet(
  endpoint = "",
  options = {}
) {
  const client =
    getApiClient();

  const request =
    assertMethod(
      client,
      "get"
    );

  return request(
    endpoint,
    buildRequestOptions(options)
  );
}

async function apiPost(
  endpoint = "",
  body = {},
  options = {}
) {
  const client =
    getApiClient();

  if (
    typeof client?.post ===
    "function"
  ) {
    return client.post(
      endpoint,
      body,
      buildRequestOptions(options)
    );
  }

  if (
    typeof client?.request ===
    "function"
  ) {
    return client.request(
      endpoint,
      {
        method: "POST",
        body,
        ...buildRequestOptions(options),
      }
    );
  }

  throw new Error(
    "FACTURAS_API_METHOD_UNAVAILABLE:post"
  );
}

/* =========================================================
   COLLECTION API BASE
========================================================= */

const baseCollectionApi =
  createCollectionApi(
    FACTURAS_RESOURCE,
    {
      client: {
        get: (...args) =>
          getApiClient().get(...args),
        post: (...args) =>
          getApiClient().post(...args),
        put: (...args) =>
          getApiClient().put(...args),
        patch: (...args) =>
          getApiClient().patch(...args),
        delete: (...args) =>
          getApiClient().delete(...args),
      },

      basePath: FACTURAS_ENDPOINT,

      mapItem: normalizeFactura,
      mapDetail: normalizeFactura,

      listQueryConfig: {
        pageParam: "page",
        limitParam: "limit",
        searchParam: "search",
        sortByParam: "sortBy",
        sortDirParam: "sortDir",
        defaultPage: 1,
        defaultLimit: 20,
        includeDefaults: false,
      },

      buildListOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),

      buildDetailOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),

      buildCreateOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),

      buildUpdateOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),

      buildPatchOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),

      buildRemoveOptions: ({
        requestOptions,
      }) => ({
        timeout: FACTURAS_TIMEOUT,
        auth: true,
        ...safeObject(requestOptions),
      }),
    }
  );

/* =========================================================
   PUBLIC REQUESTS
========================================================= */

export async function fetchFacturasRequest(
  {
    page = 1,
    limit = 20,
    search = "",
    sortBy = "",
    sortDir = "",
    filters = {},
  } = {},
  requestOptions = {}
) {
  return baseCollectionApi.list(
    {
      page,
      limit,
      search,
      sortBy,
      sortDir,
      filters,
    },
    {
      timeout: FACTURAS_TIMEOUT,
      auth: true,
      ...safeObject(requestOptions),
    }
  );
}

export async function fetchFacturaDetailRequest(
  id,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return baseCollectionApi.detail(
    id,
    {
      timeout,
      auth,
      ...rest,
    }
  );
}

export async function fetchFacturaPdfUrlRequest(
  id,
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  {
    timeout = FACTURAS_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return apiGet(
    FACTURAS_ENDPOINTS.pdf(
      id,
      disposition
    ),
    {
      timeout,
      auth,
      ...rest,
    }
  );
}

export async function sendFacturaRequest(
  id,
  payload = {},
  {
    timeout = FACTURAS_SEND_TIMEOUT,
    auth = true,
    ...rest
  } = {}
) {
  return apiPost(
    FACTURAS_ENDPOINTS.send(id),
    safeObject(payload),
    {
      timeout,
      auth,
      ...rest,
    }
  );
}

/* =========================================================
   OPTIONAL HELPERS
========================================================= */

export function resolveFacturaPdfUrl(
  response = null
) {
  const obj =
    safeObject(response);

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
   PUBLIC API
========================================================= */

export const FacturasApi = Object.freeze({
  resource:
    FACTURAS_RESOURCE,

  endpoint:
    FACTURAS_ENDPOINT,

  timeouts: Object.freeze({
    default:
      FACTURAS_TIMEOUT,
    send:
      FACTURAS_SEND_TIMEOUT,
  }),

  dispositions:
    FACTURAS_DISPOSITIONS,

  endpoints:
    FACTURAS_ENDPOINTS,

  getApiClient,

  normalizeFactura,
  normalizeFacturaId,
  getFacturaEndpoint,
  normalizeFacturaPdfDisposition,
  buildFacturaPdfEndpoint,
  resolveFacturaPdfUrl,

  list: fetchFacturasRequest,
  detail:
    fetchFacturaDetailRequest,

  create:
    baseCollectionApi.create,
  update:
    baseCollectionApi.update,
  patch:
    baseCollectionApi.patch,
  remove:
    baseCollectionApi.remove,

  fetchFacturasRequest,
  fetchFacturaDetailRequest,
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
});

export default FacturasApi;

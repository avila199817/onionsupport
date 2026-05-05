/* =========================================================
   Onion SPA - Facturas Incidencias Bridge
   Archivo: src/views/facturas/facturas.incidencias.js

   FINAL PRO SYSTEM · FACTURAS ↔ INCIDENCIAS BRIDGE · 10/10
   PATCH · NO ROUTE NAVIGATION · MODAL ONLY
   PATCH · MODEL ALIGNED · NO DUPLICATE RELATION LOGIC
   PATCH · FALLBACK FIRST · REMOTE DETAIL AFTER
   PATCH · API LEGACY/NORMALIZED COMPAT
   PATCH · FACTURA CONTEXT PRESERVER

   RESPONSABILIDADES:
   - abrir el modal de incidencias desde la tabla/detalle de facturas
   - evitar navegación a rutas inexistentes
   - importar lazy incidencias.modal.js
   - abrir modal con fallback inmediato basado en factura
   - cargar detalle real desde API y actualizar modal
   - preservar relación factura ↔ incidencia
   - preservar contexto de factura dentro del detalle de incidencia
   - delegar extracción de relación en facturas.model.js
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeFactura,
  getFacturaIncidenciaId,
  buildFacturaIncidenciaPayload,
  getFacturaPrimaryId,
  getFacturaNumero,
  getFacturaClienteNombre,
  getFacturaClienteEmpresa,
  getFacturaClienteEmail,
  getFacturaClienteObject,
  getFacturaTotal,
  getFacturaCurrency,
  formatMoney,
} from "./facturas.model.js";

import {
  getFacturaByIdStore,
} from "./facturas.store.js";

/* =========================================================
   CONSTANTS
========================================================= */

const INCIDENCIA_DETAIL_TIMEOUT = 90000;

const INCIDENCIA_DETAIL_ENDPOINTS = Object.freeze([
  "/api/tickets",
  "/api/incidencias",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function encodeSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function normalizeFacturaSafe(item = {}) {
  try {
    return normalizeFactura(item);
  } catch {
    return safeObject(item);
  }
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return true;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return true;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(text);
    return true;
  } catch {}

  return false;
}

/* =========================================================
   API HELPERS
========================================================= */

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

function getStorageValue(key = "") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) return "";

  try {
    const value = localStorage.getItem(cleanKey);
    if (value) return value;
  } catch {}

  try {
    const value = sessionStorage.getItem(cleanKey);
    if (value) return value;
  } catch {}

  return "";
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      window?.Auth?.getToken?.(),

      getStorageValue("token"),
      getStorageValue("accessToken"),
      getStorageValue("authToken"),
      getStorageValue("onion.token")
    ),
    ""
  );
}

function resolveApiUrl(path = "") {
  const value = safeText(path, "");

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  ).replace(/\/+$/, "");

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (!apiBase) {
    return normalizedPath;
  }

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

function createTimeoutController(timeoutMs = INCIDENCIA_DETAIL_TIMEOUT) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

function getHttpStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status
    ),
    0
  );
}

function isRecoverableDetailError(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [404, 405, 409, 422, 500, 502, 503, 504].includes(status);
}

async function apiGet(path = "") {
  const client = getApiClient();

  if (typeof client?.get === "function") {
    return client.get(path, {
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  if (typeof client?.request === "function") {
    return client.request(path, {
      method: "GET",
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  const finalUrl = resolveApiUrl(path);
  const token = getAuthToken();
  const timeout = createTimeoutController(INCIDENCIA_DETAIL_TIMEOUT);

  try {
    const response = await fetch(finalUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: timeout.signal,
    });

    const text = await response.text();

    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(payload?.message, payload?.error, payload?.code, `HTTP ${response.status}`),
          `HTTP ${response.status}`
        )
      );

      error.status = response.status;
      error.statusCode = response.status;
      error.response = payload;
      error.data = payload;

      throw error;
    }

    return payload;
  } finally {
    timeout.clear();
  }
}

/* =========================================================
   MODAL RESOLUTION
========================================================= */

async function getIncidenciasModal() {
  const module = await import("../incidencias/incidencias.modal.js");

  const modal =
    module?.OnionIncidenciasModal ||
    module?.default ||
    window?.OnionIncidenciasModal ||
    null;

  if (!modal || typeof modal.open !== "function") {
    throw new Error("INCIDENCIAS_MODAL_UNAVAILABLE");
  }

  return modal;
}

function openModal(modal, detail = {}) {
  if (typeof modal?.open === "function") {
    modal.open(detail);
    return true;
  }

  return false;
}

function updateModal(modal, detail = {}) {
  if (typeof modal?.update === "function") {
    modal.update(detail);
    return true;
  }

  if (typeof modal?.setData === "function") {
    modal.setData(detail);
    return true;
  }

  if (typeof modal?.open === "function") {
    modal.open(detail);
    return true;
  }

  return false;
}

function setModalFeedback(modal, message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (typeof modal?.setFeedback === "function") {
      modal.setFeedback(text, type);
      return true;
    }
  } catch {}

  try {
    if (typeof modal?.feedback === "function") {
      modal.feedback(text, type);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function extractDetailPayload(response = null) {
  if (!response) return null;

  const obj = safeObject(response);

  return (
    obj.detail ||
    obj.ticket ||
    obj.incidencia ||
    obj.item ||
    obj.record ||

    obj.data?.detail ||
    obj.data?.ticket ||
    obj.data?.incidencia ||
    obj.data?.item ||
    obj.data?.record ||
    obj.data ||

    obj.result?.detail ||
    obj.result?.ticket ||
    obj.result?.incidencia ||
    obj.result?.item ||
    obj.result?.record ||
    obj.result ||

    obj.payload?.detail ||
    obj.payload?.ticket ||
    obj.payload?.incidencia ||
    obj.payload?.item ||
    obj.payload?.record ||
    obj.payload ||

    obj.raw?.detail ||
    obj.raw?.ticket ||
    obj.raw?.incidencia ||
    obj.raw?.item ||
    obj.raw?.record ||

    obj ||
    null
  );
}

async function fetchIncidenciaDetail(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  const encodedId = encodeSegment(id);
  const candidates = INCIDENCIA_DETAIL_ENDPOINTS.map((base) => `${base}/${encodedId}`);

  let lastError = null;

  for (const path of candidates) {
    try {
      const response = await apiGet(path);
      const detail = extractDetailPayload(response);

      if (hasOwnKeys(detail)) {
        return detail;
      }

      throw new Error("INCIDENCIA_DETAIL_EMPTY");
    } catch (error) {
      lastError = error;

      if (!isRecoverableDetailError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("INCIDENCIA_DETAIL_NOT_FOUND");
}

/* =========================================================
   FACTURA RESOLUTION
========================================================= */

function getFacturaFromStore(facturaId = "") {
  const id = safeText(facturaId, "");

  if (!id) return null;

  try {
    const item = getFacturaByIdStore(id);

    if (item) {
      return normalizeFacturaSafe(item);
    }
  } catch {}

  return null;
}

function resolveFactura({
  factura = null,
  facturaId = "",
} = {}) {
  if (hasOwnKeys(factura)) {
    return normalizeFacturaSafe(factura);
  }

  const stored = getFacturaFromStore(facturaId);

  if (stored) {
    return stored;
  }

  return {};
}

function resolveFacturaId(factura = {}, fallback = "") {
  const item = safeObject(factura);

  return safeText(
    first(
      getFacturaPrimaryId(item),
      item.id,
      item.facturaId,
      item.invoiceId,
      item.numero,
      fallback
    ),
    ""
  );
}

function resolveTicketId({
  ticketId = "",
  incidenciaId = "",
  factura = {},
} = {}) {
  return safeText(
    first(
      ticketId,
      incidenciaId,
      getFacturaIncidenciaId(factura)
    ),
    ""
  );
}

/* =========================================================
   FALLBACK DETAIL
========================================================= */

function getFacturaContext(factura = {}) {
  const item = normalizeFacturaSafe(factura);
  const cliente = getFacturaClienteObject(item);

  const facturaId = resolveFacturaId(item);
  const numero = getFacturaNumero(item);
  const clienteNombre = getFacturaClienteNombre(item);
  const clienteEmpresa = getFacturaClienteEmpresa(item);
  const clienteEmail = getFacturaClienteEmail(item);
  const total = getFacturaTotal(item);
  const currency = getFacturaCurrency(item);

  return {
    factura: item,

    facturaId,
    invoiceId: facturaId,
    numero,
    numeroFactura: numero,
    invoiceCode: numero || facturaId,

    clienteId: safeText(
      first(
        item.clienteId,
        cliente.id,
        cliente.clienteId,
        item.raw?.clienteId,
        item.raw?.cliente?.id
      ),
      ""
    ),

    clienteNombre,
    clienteEmpresa,
    clienteEmail,

    clienteAvatar: safeText(
      first(
        item.cliente?.avatar,
        item.cliente?.avatarUrl,
        item.cliente?.logo,
        item.raw?.cliente?.avatar,
        item.raw?.cliente?.avatarUrl,
        item.raw?.cliente?.logo
      ),
      ""
    ),

    total,
    currency,
    totalFormatted: formatMoney(total, currency),
  };
}

function buildFallbackDetail({
  ticketId = "",
  factura = {},
} = {}) {
  const item = normalizeFacturaSafe(factura);
  const relation = safeObject(buildFacturaIncidenciaPayload(item));
  const ctx = getFacturaContext(item);

  const id = safeText(
    first(
      ticketId,
      relation.ticketId,
      relation.incidenciaId,
      relation.id,
      getFacturaIncidenciaId(item)
    ),
    ""
  );

  const subject = safeText(
    first(
      relation.subject,
      relation.asunto,
      relation.title,
      ctx.numero
        ? `Incidencia vinculada a factura ${ctx.numero}`
        : `Incidencia ${id}`
    ),
    `Incidencia ${id}`
  );

  const description = safeText(
    first(
      relation.description,
      relation.descripcion,
      relation.message,
      relation.preview,
      ctx.numero
        ? `Incidencia relacionada con la factura ${ctx.numero}.`
        : "Incidencia relacionada con una factura."
    ),
    "Incidencia relacionada con una factura."
  );

  return {
    ...relation,

    id,
    ticketId: id,
    incidenciaId: id,
    code: safeText(first(relation.code, id), id),
    ticketCode: safeText(first(relation.ticketCode, relation.code, id), id),

    title: subject,
    subject,
    asunto: subject,

    description,
    descripcion: description,
    message: safeText(first(relation.message, description), description),
    preview: safeText(first(relation.preview, description), description),

    status: safeText(first(relation.status, relation.estado, "open"), "open"),
    estado: safeText(first(relation.estado, relation.status, "open"), "open"),

    priority: safeText(first(relation.priority, relation.prioridad, "medium"), "medium"),
    prioridad: safeText(first(relation.prioridad, relation.priority, "medium"), "medium"),

    category: safeText(first(relation.category, relation.categoria, "facturacion"), "facturacion"),
    categoria: safeText(first(relation.categoria, relation.category, "Facturación"), "Facturación"),

    clienteId: safeText(first(relation.clienteId, ctx.clienteId), ""),
    clienteNombre: safeText(first(relation.clienteNombre, ctx.clienteNombre), "Cliente"),
    clientName: safeText(first(relation.clienteNombre, ctx.clienteNombre), "Cliente"),

    cliente: {
      ...safeObject(relation.cliente),
      id: safeText(first(relation.clienteId, ctx.clienteId), "") || null,
      clienteId: safeText(first(relation.clienteId, ctx.clienteId), ""),
      nombre: safeText(first(relation.clienteNombre, ctx.clienteNombre), "Cliente"),
      name: safeText(first(relation.clienteNombre, ctx.clienteNombre), "Cliente"),
      empresa: ctx.clienteEmpresa,
      razonSocial: ctx.clienteEmpresa || ctx.clienteNombre,
      email: ctx.clienteEmail,
      avatar: ctx.clienteAvatar || null,
    },

    client: {
      id: safeText(first(relation.clienteId, ctx.clienteId), "") || null,
      name: safeText(first(relation.clienteNombre, ctx.clienteNombre), "Cliente"),
      email: ctx.clienteEmail,
      avatar: ctx.clienteAvatar || null,
    },

    facturaId: ctx.facturaId,
    invoiceId: ctx.invoiceId,
    factura: ctx.numero || ctx.facturaId,
    facturaRelacionada: ctx.numero || ctx.facturaId,
    invoiceCode: ctx.invoiceCode,

    linkedInvoices: {
      total: ctx.total,
      amount: ctx.total,
      importe: ctx.total,
      currency: ctx.currency,
      items: [
        {
          id: ctx.facturaId,
          facturaId: ctx.facturaId,
          invoiceId: ctx.invoiceId,
          numero: ctx.numero,
          code: ctx.invoiceCode,
          total: ctx.total,
          amount: ctx.total,
          importe: ctx.total,
          currency: ctx.currency,
        },
      ].filter((invoice) => invoice.id || invoice.numero),
    },

    facturasRelacionadas: [
      {
        id: ctx.facturaId,
        facturaId: ctx.facturaId,
        invoiceId: ctx.invoiceId,
        numero: ctx.numero,
        code: ctx.invoiceCode,
        total: ctx.total,
        amount: ctx.total,
        importe: ctx.total,
        currency: ctx.currency,
      },
    ].filter((invoice) => invoice.id || invoice.numero),

    billing: {
      hasLinkedInvoices: Boolean(ctx.facturaId || ctx.numero),
      invoiceId: ctx.facturaId,
      facturaId: ctx.facturaId,
      invoiceCode: ctx.invoiceCode,
      numeroFacturaLegal: ctx.numero,
      invoiceTotal: ctx.total,
      total: ctx.total,
      amount: ctx.total,
      currency: ctx.currency,
      totalFormatted: ctx.totalFormatted,
    },

    meta: {
      ...safeObject(relation.meta),
      fromFacturaBridge: true,
      hasFactura: Boolean(ctx.facturaId || ctx.numero),
      hasLinkedInvoices: Boolean(ctx.facturaId || ctx.numero),
      facturaId: ctx.facturaId,
      invoiceId: ctx.invoiceId,
      invoiceCode: ctx.invoiceCode,
      numeroFacturaLegal: ctx.numero,
      invoiceTotal: ctx.total,
      currency: ctx.currency,
    },

    raw: {
      ...safeObject(relation.raw),
      ...relation,

      id,
      ticketId: id,
      incidenciaId: id,

      facturaId: ctx.facturaId,
      invoiceId: ctx.invoiceId,
      factura: {
        ...safeObject(item.raw?.factura),
        ...ctx.factura,
        id: ctx.facturaId,
        facturaId: ctx.facturaId,
        invoiceId: ctx.invoiceId,
        numero: ctx.numero,
        total: ctx.total,
        currency: ctx.currency,
      },

      invoice: {
        ...safeObject(item.raw?.invoice),
        id: ctx.facturaId,
        facturaId: ctx.facturaId,
        invoiceId: ctx.invoiceId,
        code: ctx.invoiceCode,
        numero: ctx.numero,
        total: ctx.total,
        currency: ctx.currency,
      },

      billing: {
        hasLinkedInvoices: Boolean(ctx.facturaId || ctx.numero),
        invoiceId: ctx.facturaId,
        facturaId: ctx.facturaId,
        invoiceCode: ctx.invoiceCode,
        invoiceTotal: ctx.total,
        total: ctx.total,
        amount: ctx.total,
        currency: ctx.currency,
      },
    },
  };
}

/* =========================================================
   DETAIL MERGE
========================================================= */

function normalizeRemoteDetail(detail = {}) {
  const item = safeObject(detail);

  const id = safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.ticketCode,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.id
    ),
    ""
  );

  if (!id && !hasOwnKeys(item)) {
    return {};
  }

  return {
    ...item,

    id: id || item.id,
    ticketId: id || item.ticketId,
    incidenciaId: id || item.incidenciaId,
    code: safeText(first(item.code, item.ticketCode, id), id),
    ticketCode: safeText(first(item.ticketCode, item.code, id), id),
  };
}

function mergeDetailWithFallback(fallback = {}, remoteDetail = {}) {
  const base = safeObject(fallback);
  const remote = normalizeRemoteDetail(remoteDetail);

  if (!hasOwnKeys(remote)) {
    return base;
  }

  const id = safeText(
    first(
      remote.ticketId,
      remote.incidenciaId,
      remote.id,
      remote.code,
      base.ticketId,
      base.incidenciaId,
      base.id
    ),
    ""
  );

  const facturaId = safeText(
    first(
      remote.facturaId,
      remote.invoiceId,
      remote.billing?.facturaId,
      remote.billing?.invoiceId,
      remote.meta?.facturaId,
      remote.meta?.invoiceId,
      base.facturaId,
      base.invoiceId
    ),
    ""
  );

  const invoiceCode = safeText(
    first(
      remote.invoiceCode,
      remote.factura,
      remote.facturaRelacionada,
      remote.billing?.invoiceCode,
      remote.billing?.numeroFacturaLegal,
      remote.meta?.invoiceCode,
      remote.meta?.numeroFacturaLegal,
      base.invoiceCode,
      base.factura,
      base.facturaRelacionada
    ),
    ""
  );

  return {
    ...base,
    ...remote,

    id,
    ticketId: id,
    incidenciaId: id,

    code: safeText(first(remote.code, remote.ticketCode, base.code, id), id),
    ticketCode: safeText(first(remote.ticketCode, remote.code, base.ticketCode, id), id),

    facturaId,
    invoiceId: safeText(first(remote.invoiceId, remote.facturaId, base.invoiceId, facturaId), facturaId),

    factura: safeText(first(remote.factura, remote.facturaRelacionada, base.factura, invoiceCode), invoiceCode),
    facturaRelacionada: safeText(first(remote.facturaRelacionada, remote.factura, base.facturaRelacionada, invoiceCode), invoiceCode),
    invoiceCode,

    linkedInvoices: {
      ...safeObject(base.linkedInvoices),
      ...safeObject(remote.linkedInvoices),
      total: safeNumber(
        first(
          remote.linkedInvoices?.total,
          remote.linkedInvoices?.amount,
          remote.linkedInvoices?.importe,
          base.linkedInvoices?.total,
          base.linkedInvoices?.amount,
          base.linkedInvoices?.importe
        ),
        0
      ),
      currency: safeText(
        first(
          remote.linkedInvoices?.currency,
          base.linkedInvoices?.currency,
          remote.currency,
          base.currency
        ),
        "EUR"
      ),
      items: safeArray(
        first(
          remote.linkedInvoices?.items,
          remote.facturasRelacionadas,
          remote.facturas,
          remote.invoices,
          base.linkedInvoices?.items
        )
      ),
    },

    billing: {
      ...safeObject(base.billing),
      ...safeObject(remote.billing),
      hasLinkedInvoices: Boolean(
        first(
          remote.billing?.hasLinkedInvoices,
          remote.meta?.hasLinkedInvoices,
          base.billing?.hasLinkedInvoices,
          facturaId,
          invoiceCode
        )
      ),
      facturaId,
      invoiceId: safeText(first(remote.invoiceId, remote.facturaId, base.invoiceId, facturaId), facturaId),
      invoiceCode,
    },

    meta: {
      ...safeObject(base.meta),
      ...safeObject(remote.meta),
      hasFactura: Boolean(
        first(
          remote.meta?.hasFactura,
          remote.meta?.hasLinkedInvoices,
          base.meta?.hasFactura,
          facturaId,
          invoiceCode
        )
      ),
      hasLinkedInvoices: Boolean(
        first(
          remote.meta?.hasLinkedInvoices,
          remote.billing?.hasLinkedInvoices,
          base.meta?.hasLinkedInvoices,
          facturaId,
          invoiceCode
        )
      ),
      facturaId,
      invoiceId: safeText(first(remote.invoiceId, remote.facturaId, base.invoiceId, facturaId), facturaId),
      invoiceCode,
    },

    raw: {
      ...safeObject(base.raw),
      ...safeObject(remote.raw || remote),

      id,
      ticketId: id,
      incidenciaId: id,

      facturaId,
      invoiceId: safeText(first(remote.invoiceId, remote.facturaId, base.invoiceId, facturaId), facturaId),
      invoiceCode,
    },
  };
}

/* =========================================================
   PUBLIC ACTION
========================================================= */

export async function openFacturaIncidenciaModal({
  ticketId = "",
  incidenciaId = "",
  facturaId = "",
  factura = null,
} = {}) {
  const resolvedFactura = resolveFactura({
    factura,
    facturaId,
  });

  const resolvedFacturaId = resolveFacturaId(resolvedFactura, facturaId);

  const finalTicketId = resolveTicketId({
    ticketId,
    incidenciaId,
    factura: resolvedFactura,
  });

  if (!finalTicketId) {
    showToast("No se pudo identificar la incidencia vinculada.", "error");

    safeEmit("facturas:incidencia:open:error", {
      reason: "INCIDENCIA_ID_REQUIRED",
      facturaId: resolvedFacturaId || facturaId,
      factura: resolvedFactura,
    });

    return false;
  }

  let modal = null;

  try {
    modal = await getIncidenciasModal();
  } catch (error) {
    showToast("No se pudo abrir el modal de incidencias.", "error");

    safeEmit("facturas:incidencia:modal:error", {
      ticketId: finalTicketId,
      facturaId: resolvedFacturaId || facturaId,
      error,
    });

    return false;
  }

  const fallbackDetail = buildFallbackDetail({
    ticketId: finalTicketId,
    factura: resolvedFactura,
  });

  openModal(modal, fallbackDetail);

  safeEmit("facturas:incidencia:opening", {
    ticketId: finalTicketId,
    incidenciaId: finalTicketId,
    facturaId: resolvedFacturaId || facturaId,
    factura: resolvedFactura,
    fallbackDetail,
  });

  try {
    const remoteDetail = await fetchIncidenciaDetail(finalTicketId);

    const nextDetail = mergeDetailWithFallback(
      fallbackDetail,
      remoteDetail
    );

    updateModal(modal, nextDetail);

    safeEmit("facturas:incidencia:open:success", {
      ticketId: finalTicketId,
      incidenciaId: finalTicketId,
      facturaId: resolvedFacturaId || facturaId,
      detail: nextDetail,
      remoteDetail,
    });

    safeEmit("incidencias:open:success", {
      ticketId: finalTicketId,
      detail: nextDetail,
    });

    return true;
  } catch (error) {
    setModalFeedback(
      modal,
      "La incidencia se ha abierto con los datos vinculados a la factura, pero no se pudo cargar el detalle completo desde la API.",
      "info"
    );

    safeEmit("facturas:incidencia:open:fallback", {
      ticketId: finalTicketId,
      incidenciaId: finalTicketId,
      facturaId: resolvedFacturaId || facturaId,
      detail: fallbackDetail,
      error,
    });

    return true;
  }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  openFacturaIncidenciaModal,
};

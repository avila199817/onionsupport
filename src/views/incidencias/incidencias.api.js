/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   EXTREME PRO SYSTEM · API LAYER · FULL PATCH 12/10
   TICKETS BACKEND CONTRACT · FACTURAS PRESERVER · SAS READY
   LIST/DETAIL/CREATE/UPDATE/UPLOAD · CACHE · RACE SAFE

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo incidencias
   - adaptar contrato backend /api/tickets al frontend
   - soportar fallback /api/incidencias legacy
   - exponer listado + stats + detalle + create + update
   - subir adjuntos en incidencias existentes
   - comentar / reabrir incidencias con fallback PATCH real
   - resolver URLs seguras de visualización / descarga de adjuntos
   - hidratar state/store de forma coherente
   - normalizar payloads backend heterogéneos
   - preservar facturación asociada para tabla/modal
   - preservar numeroFacturaLegal / facturaTotal / linkedInvoices
   - preservar adjuntos enriquecidos con SAS temporal
   - soportar múltiples adapters de request
   - prevenir race conditions blandas en cargas de listado
   - registrar API pública en AppCore.modules/window

   BACKEND CONTRACT:
   - GET    /api/tickets
   - GET    /api/tickets/stats
   - GET    /api/tickets/:id
   - POST   /api/tickets
   - PATCH  /api/tickets/:id
   - PUT    /api/tickets/:id
   - POST   /api/tickets/:id/attachments
   - GET    /api/tickets/:id/attachments/:attachmentId/view
   - GET    /api/tickets/:id/attachments/:attachmentId/download

   HARDENING EXTREME:
   - get detalle devuelve objeto limpio y rico
   - soporta envelopes heterogéneos:
       tickets/items/data/incidencias/results/rows
       ticket/item/detail/incidencia/result/payload
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - fetch soporta JSON, FormData, Blob, texto
   - FormData prioriza fetch nativo para no romper multipart
   - query params reales
   - Content-Type seguro para FormData
   - comment / reopen tienen fallback PATCH real
   - persistencia coherente en store/state/cache
   - errores con mensaje consistente
   - surface pública estable
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  setLoading,
  setRefreshing,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  setLoaded,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const INCIDENCIAS_RESOURCE = "tickets";

export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const INCIDENCIAS_ALT_ENDPOINT = "/api/incidencias";

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 90000;

const CACHE_KEY = "onion:incidencias:cache:v12";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6;

const DEFAULT_CURRENCY = "EUR";

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = normalizeText(value);

  if (["true", "1", "yes", "y", "si", "sí", "on"].includes(key)) {
    return true;
  }

  if (["false", "0", "no", "n", "off"].includes(key)) {
    return false;
  }

  return fallback;
}

function normalizeMoney(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const normalized = String(value)
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : fallback;
}

function roundMoney(value) {
  const amount = normalizeMoney(value, null);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function normalizePathPart(value = "") {
  return safeText(value, "").replace(/^\/+|\/+$/g, "");
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function callSafe(fn, ...args) {
  try {
    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

/* =========================================================
   LOAD TOKEN
========================================================= */

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   URL / AUTH HELPERS
========================================================= */

function getApiBase() {
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      typeof window !== "undefined" ? window.ONION_API_BASE : "",
      typeof window !== "undefined" ? window.API_BASE : ""
    ),
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function appendQueryParams(url = "", query = {}) {
  const cleanUrl = safeText(url, "");
  const params = safeObject(query);
  const pairs = [];

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) return;
        if (typeof item === "string" && item.trim() === "") return;

        pairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
        );
      });

      return;
    }

    pairs.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );
  });

  if (!pairs.length) return cleanUrl;

  const separator = cleanUrl.includes("?") ? "&" : "?";
  return `${cleanUrl}${separator}${pairs.join("&")}`;
}

function buildAbsoluteUrl(path = "", query = {}) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return appendQueryParams(getApiBase(), query);
  }

  if (isAbsoluteUrl(cleanPath)) {
    return appendQueryParams(cleanPath, query);
  }

  const apiBase = getApiBase();
  const finalPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  if (!apiBase) {
    return appendQueryParams(finalPath, query);
  }

  return appendQueryParams(`${apiBase}${finalPath}`, query);
}

function getStorageValue(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return "";

  try {
    const localValue = localStorage.getItem(cleanKey);
    if (localValue) return localValue;
  } catch {}

  try {
    const sessionValue = sessionStorage.getItem(cleanKey);
    if (sessionValue) return sessionValue;
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
      typeof window !== "undefined" ? window.Auth?.getToken?.() : "",
      getStorageValue("token"),
      getStorageValue("accessToken"),
      getStorageValue("access_token"),
      getStorageValue("onion:token")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}, body = null) {
  const token = getAuthToken();

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...safeObject(extraHeaders),
  };

  if (isFormData(body)) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return headers;
}

function getApiClient() {
  return AppCore?.apiClient || null;
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    (typeof window !== "undefined" ? window.Http : null) ||
    null
  );
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function normalizeIncidenciaId(id = "") {
  const ticketId = safeText(id, "");

  if (!ticketId) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return ticketId;
}

export function getIncidenciasStatsEndpoint() {
  return `${INCIDENCIAS_ENDPOINT}/stats`;
}

export function getIncidenciaEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}`;
}

export function getIncidenciaAltEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ALT_ENDPOINT}/${encodeUrlPathSegment(ticketId)}`;
}

export function getIncidenciaAttachmentsEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/attachments`;
}

export function getIncidenciaFilesEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/files`;
}

export function getIncidenciaAdjuntosEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/adjuntos`;
}

export function getIncidenciaCommentsEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/comments`;
}

export function getIncidenciaMessagesEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/messages`;
}

export function getIncidenciaReopenEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/reopen`;
}

export function getIncidenciaAttachmentFileEndpoint({
  ticketId = "",
  attachmentId = "",
  mode = "view",
  kind = "attachments",
} = {}) {
  const id = normalizeIncidenciaId(ticketId);
  const attId = safeText(attachmentId, "");

  if (!attId) {
    throw new Error("ATTACHMENT_ID_REQUIRED");
  }

  const safeMode = mode === "download" ? "download" : "view";

  const safeKind = ["attachments", "files", "adjuntos"].includes(kind)
    ? kind
    : "attachments";

  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(id)}/${safeKind}/${encodeUrlPathSegment(attId)}/${safeMode}`;
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.response?.error,
      error?.data?.error,
      error?.error,
      error?.detail,
      fallback
    ),
    fallback
  );
}

function getErrorStatus(error = null) {
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

function shouldTryNextEndpoint(error = null) {
  const status = getErrorStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   STATUS / PRIORITY NORMALIZATION
========================================================= */

function normalizeStatus(value = "open") {
  const raw = normalizeKey(value || "open");

  const map = {
    open: "open",
    abierta: "open",
    abierto: "open",

    pending: "pending",
    pendiente: "pending",
    new: "pending",
    nueva: "pending",
    nuevo: "pending",

    in_progress: "in_progress",
    inprogress: "in_progress",
    progress: "in_progress",
    proceso: "in_progress",
    en_proceso: "in_progress",
    working: "in_progress",
    assigned: "in_progress",
    asignada: "in_progress",
    asignado: "in_progress",

    resolved: "resolved",
    resuelta: "resolved",
    resuelto: "resolved",
    solved: "resolved",

    closed: "closed",
    cerrada: "closed",
    cerrado: "closed",
    cancelled: "closed",
    cancelada: "closed",
    cancelado: "closed",
    archived: "closed",
  };

  return map[raw] || raw || "open";
}

function normalizePriority(value = "medium") {
  const raw = normalizeKey(value || "medium");

  const map = {
    low: "low",
    baja: "low",
    minor: "low",
    p3: "low",

    medium: "medium",
    media: "medium",
    normal: "medium",
    p2: "medium",

    high: "high",
    alta: "high",

    urgent: "urgent",
    urgente: "urgent",
    p1: "urgent",

    critical: "urgent",
    critica: "urgent",
    crítico: "urgent",
    critico: "urgent",
    p0: "urgent",
  };

  return map[raw] || raw || "medium";
}

function normalizeCategory(value = "general") {
  return safeLower(value, "general") || "general";
}

/* =========================================================
   ATTACHMENTS NORMALIZATION
========================================================= */

function normalizeAttachment(item = {}, index = 0) {
  const raw = safeObject(item);

  const path = safeText(
    first(
      raw.path,
      raw.storageKey,
      raw.storagePath,
      raw.blobPath,
      raw.blobName,
      raw.key
    ),
    ""
  );

  const name = safeText(
    first(
      raw.name,
      raw.filename,
      raw.fileName,
      raw.originalname,
      raw.originalName,
      raw.title,
      path.split("/").filter(Boolean).pop()
    ),
    `archivo_${index + 1}`
  );

  const id = safeText(
    first(
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.storageKey,
      raw.path,
      raw.blobName,
      raw.key
    ),
    path || `attachment-${index + 1}`
  );

  const viewUrl = safeText(
    first(
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    ""
  );

  const downloadUrl = safeText(
    first(
      raw.downloadUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    ""
  );

  const contentType = safeText(
    first(
      raw.contentType,
      raw.mimetype,
      raw.mimeType,
      raw.mime,
      raw.type
    ),
    ""
  );

  const size = safeNumber(
    first(
      raw.size,
      raw.sizeBytes,
      raw.contentLength,
      raw.length,
      0
    ),
    0
  );

  return {
    ...raw,

    id,
    attachmentId: safeText(first(raw.attachmentId, id), id),
    fileId: safeText(first(raw.fileId, id), id),

    name,
    filename: safeText(first(raw.filename, raw.fileName, raw.name, name), name),
    fileName: safeText(first(raw.fileName, raw.filename, raw.name, name), name),
    originalName: safeText(
      first(raw.originalName, raw.originalname, raw.name, name),
      name
    ),

    url: safeText(
      first(
        raw.url,
        viewUrl,
        downloadUrl,
        raw.signedUrl,
        raw.blobUrl,
        raw.publicUrl
      ),
      ""
    ),

    viewUrl,
    openUrl: safeText(first(raw.openUrl, viewUrl), viewUrl),
    downloadUrl,
    signedUrl: safeText(raw.signedUrl, ""),
    blobUrl: safeText(raw.blobUrl, ""),
    publicUrl: safeText(raw.publicUrl, ""),

    path,
    storageKey: safeText(first(raw.storageKey, path), path),
    storagePath: safeText(first(raw.storagePath, path), path),
    blobPath: safeText(first(raw.blobPath, path), path),
    blobName: safeText(first(raw.blobName, path), path),

    size,
    sizeBytes: size,

    type: safeText(first(raw.type, contentType), contentType),
    contentType,
    mimetype: safeText(first(raw.mimetype, contentType), contentType),
    mimeType: safeText(first(raw.mimeType, contentType), contentType),

    extension: safeText(raw.extension, ""),
    sha256: safeText(first(raw.sha256, raw.hash), ""),

    uploadedAt: first(raw.uploadedAt, raw.createdAt, raw.date, null),
    uploadedAtES: first(raw.uploadedAtES, null),
    createdAt: first(raw.createdAt, raw.uploadedAt, null),

    uploadedBy: safeObject(raw.uploadedBy, null),

    meta: {
      ...safeObject(raw.meta),
      hasBlobPath: Boolean(path),
      hasViewUrl: Boolean(viewUrl),
      hasDownloadUrl: Boolean(downloadUrl),
      sasSigned: Boolean(raw.meta?.sasSigned || raw.signedUrl || viewUrl),
      blobExists: Boolean(raw.meta?.blobExists ?? true),
    },

    raw,
  };
}

/* =========================================================
   FACTURAS / INVOICE PRESERVER
========================================================= */

function collectInvoiceObjects(source = {}, raw = {}) {
  const output = [];

  const candidates = [
    source?.factura,
    source?.invoice,
    source?.billing,
    source?.linkedInvoices,

    raw?.factura,
    raw?.invoice,
    raw?.billing,
    raw?.linkedInvoices,

    ...safeArray(source?.facturas),
    ...safeArray(source?.invoices),
    ...safeArray(source?.facturasRelacionadas),
    ...safeArray(source?.linkedInvoices?.invoices),

    ...safeArray(raw?.facturas),
    ...safeArray(raw?.invoices),
    ...safeArray(raw?.facturasRelacionadas),
    ...safeArray(raw?.linkedInvoices?.invoices),
  ];

  candidates.forEach((candidate) => {
    if (hasOwnKeys(candidate)) {
      output.push(candidate);
    }
  });

  return output;
}

function resolveInvoiceNumber(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.numeroFacturaLegal,
      source.numeroFactura,
      source.invoiceNumber,
      source.legalInvoiceNumber,
      source.facturaNumeroLegal,

      source.billing?.numeroFacturaLegal,
      source.billing?.numeroFactura,
      source.billing?.invoiceNumber,

      source.factura?.numeroFacturaLegal,
      source.factura?.numeroFactura,
      source.factura?.invoiceNumber,
      source.factura?.legalNumber,
      source.factura?.number,

      source.invoice?.numeroFacturaLegal,
      source.invoice?.numeroFactura,
      source.invoice?.invoiceNumber,
      source.invoice?.legalNumber,
      source.invoice?.number,

      source.linkedInvoices?.numeroFacturaLegal,
      source.linkedInvoices?.numeroFactura,
      source.linkedInvoices?.invoiceNumber,

      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.legalInvoiceNumber,
      raw.facturaNumeroLegal,

      raw.billing?.numeroFacturaLegal,
      raw.billing?.numeroFactura,
      raw.billing?.invoiceNumber,

      raw.factura?.numeroFacturaLegal,
      raw.factura?.numeroFactura,
      raw.factura?.invoiceNumber,
      raw.factura?.legalNumber,
      raw.factura?.number,

      raw.invoice?.numeroFacturaLegal,
      raw.invoice?.numeroFactura,
      raw.invoice?.invoiceNumber,
      raw.invoice?.legalNumber,
      raw.invoice?.number,

      raw.linkedInvoices?.numeroFacturaLegal,
      raw.linkedInvoices?.numeroFactura,
      raw.linkedInvoices?.invoiceNumber,

      ...invoices.map((invoice) => invoice?.numeroFacturaLegal),
      ...invoices.map((invoice) => invoice?.numeroFactura),
      ...invoices.map((invoice) => invoice?.invoiceNumber),
      ...invoices.map((invoice) => invoice?.legalNumber),
      ...invoices.map((invoice) => invoice?.number)
    ),
    ""
  );
}

function resolvePrimaryInvoiceId(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.facturaId,
      source.invoiceId,
      source.linkedFacturaId,
      source.linkedInvoiceId,

      source.billing?.facturaId,
      source.billing?.invoiceId,

      source.factura?.id,
      source.factura?.facturaId,
      source.factura?.invoiceId,

      source.invoice?.id,
      source.invoice?.facturaId,
      source.invoice?.invoiceId,

      source.linkedInvoices?.primaryInvoiceId,

      raw.facturaId,
      raw.invoiceId,
      raw.linkedFacturaId,
      raw.linkedInvoiceId,

      raw.billing?.facturaId,
      raw.billing?.invoiceId,

      raw.factura?.id,
      raw.factura?.facturaId,
      raw.factura?.invoiceId,

      raw.invoice?.id,
      raw.invoice?.facturaId,
      raw.invoice?.invoiceId,

      raw.linkedInvoices?.primaryInvoiceId,

      ...safeArray(source.facturaIds),
      ...safeArray(source.invoiceIds),
      ...safeArray(source.linkedInvoices?.ids),

      ...safeArray(raw.facturaIds),
      ...safeArray(raw.invoiceIds),
      ...safeArray(raw.linkedInvoices?.ids),

      ...invoices.map((invoice) => invoice?.id),
      ...invoices.map((invoice) => invoice?.facturaId),
      ...invoices.map((invoice) => invoice?.invoiceId)
    ),
    ""
  );
}

function resolveInvoiceIds(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return uniqueStrings([
    source.facturaId,
    source.invoiceId,
    source.linkedFacturaId,
    source.linkedInvoiceId,

    raw.facturaId,
    raw.invoiceId,
    raw.linkedFacturaId,
    raw.linkedInvoiceId,

    source.linkedInvoices?.primaryInvoiceId,
    raw.linkedInvoices?.primaryInvoiceId,

    ...safeArray(source.facturaIds),
    ...safeArray(source.invoiceIds),
    ...safeArray(source.linkedInvoices?.ids),

    ...safeArray(raw.facturaIds),
    ...safeArray(raw.invoiceIds),
    ...safeArray(raw.linkedInvoices?.ids),

    ...invoices.flatMap((invoice) => [
      invoice?.id,
      invoice?.facturaId,
      invoice?.invoiceId,
      invoice?.numeroFacturaLegal,
      invoice?.numeroFactura,
      invoice?.invoiceNumber,
    ]),
  ]);
}

function resolveInvoiceCount(source = {}, raw = {}, invoiceIds = []) {
  const invoices = collectInvoiceObjects(source, raw);

  return Math.max(
    0,
    safeNumber(
      first(
        source.facturasCount,
        source.invoicesCount,
        source.linkedInvoices?.count,

        source.meta?.linkedInvoiceCount,
        source.meta?.invoiceCount,

        raw.facturasCount,
        raw.invoicesCount,
        raw.linkedInvoices?.count,

        raw.meta?.linkedInvoiceCount,
        raw.meta?.invoiceCount,

        invoiceIds.length,
        invoices.length
      ),
      Math.max(invoiceIds.length, invoices.length)
    )
  );
}

function resolveInvoiceCurrency(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  return safeText(
    first(
      source.facturaCurrency,
      source.facturaMoneda,
      source.currency,
      source.moneda,

      source.linkedInvoices?.currency,
      source.linkedInvoices?.moneda,

      source.meta?.invoiceCurrency,
      source.meta?.currency,
      source.meta?.moneda,

      source.billing?.currency,
      source.billing?.moneda,

      source.factura?.currency,
      source.factura?.moneda,

      source.invoice?.currency,
      source.invoice?.moneda,

      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.currency,
      raw.moneda,

      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,

      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,

      raw.billing?.currency,
      raw.billing?.moneda,

      raw.factura?.currency,
      raw.factura?.moneda,

      raw.invoice?.currency,
      raw.invoice?.moneda,

      ...invoices.map((invoice) => invoice?.currency),
      ...invoices.map((invoice) => invoice?.moneda),

      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function resolveInvoiceAmount(source = {}, raw = {}) {
  const invoices = collectInvoiceObjects(source, raw);

  const strongCandidates = [
    source.facturaTotal,
    source.facturaImporte,
    source.importeFactura,
    source.totalFactura,
    source.invoiceAmount,

    source.facturasTotal,
    source.invoicesTotal,
    source.importeFacturas,
    source.invoiceTotal,

    source.linkedInvoices?.total,
    source.linkedInvoices?.amount,
    source.linkedInvoices?.importe,

    source.meta?.invoicesTotal,
    source.meta?.invoiceTotal,

    source.billing?.total,
    source.billing?.amount,
    source.billing?.importe,

    source.factura?.total,
    source.factura?.amount,
    source.factura?.importe,
    source.factura?.importeTotal,
    source.factura?.totalFactura,

    source.invoice?.total,
    source.invoice?.amount,
    source.invoice?.importe,
    source.invoice?.importeTotal,
    source.invoice?.totalFactura,

    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura,
    raw.totalFactura,
    raw.invoiceAmount,

    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,

    raw.linkedInvoices?.total,
    raw.linkedInvoices?.amount,
    raw.linkedInvoices?.importe,

    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal,

    raw.billing?.total,
    raw.billing?.amount,
    raw.billing?.importe,

    raw.factura?.total,
    raw.factura?.amount,
    raw.factura?.importe,
    raw.factura?.importeTotal,
    raw.factura?.totalFactura,

    raw.invoice?.total,
    raw.invoice?.amount,
    raw.invoice?.importe,
    raw.invoice?.importeTotal,
    raw.invoice?.totalFactura,

    ...invoices.map((invoice) => invoice?.total),
    ...invoices.map((invoice) => invoice?.amount),
    ...invoices.map((invoice) => invoice?.importe),
    ...invoices.map((invoice) => invoice?.importeTotal),
    ...invoices.map((invoice) => invoice?.totalFactura),
  ];

  for (const candidate of strongCandidates) {
    const amount = roundMoney(candidate);

    if (amount !== null) {
      return amount;
    }
  }

  const invoiceNumber = resolveInvoiceNumber(source, raw);
  const invoiceIds = resolveInvoiceIds(source, raw);

  const hasInvoiceEvidence = Boolean(
    invoiceNumber ||
      invoiceIds.length ||
      collectInvoiceObjects(source, raw).length ||
      source.meta?.hasLinkedInvoices ||
      raw.meta?.hasLinkedInvoices ||
      source.linkedInvoices?.count ||
      raw.linkedInvoices?.count
  );

  if (!hasInvoiceEvidence) {
    return null;
  }

  const generic = roundMoney(
    first(
      source.total,
      source.amount,
      source.importe,
      source.price,
      raw.total,
      raw.amount,
      raw.importe,
      raw.price
    )
  );

  return generic === null ? 0 : generic;
}

function normalizeInvoiceLite(invoice = {}) {
  if (!hasOwnKeys(invoice)) return null;

  const raw = safeObject(invoice);

  const total = resolveInvoiceAmount(raw, {});
  const id = resolvePrimaryInvoiceId(raw, {});
  const numeroFacturaLegal = resolveInvoiceNumber(raw, {});
  const currency = resolveInvoiceCurrency(raw, {});

  if (!id && !numeroFacturaLegal && total === null) {
    return null;
  }

  const finalTotal = total === null ? 0 : total;

  return {
    ...raw,

    id,
    facturaId: safeText(first(raw.facturaId, id), id),
    invoiceId: safeText(first(raw.invoiceId, id), id),

    numeroFacturaLegal,
    numeroFactura: safeText(first(raw.numeroFactura, numeroFacturaLegal), numeroFacturaLegal),
    invoiceNumber: safeText(first(raw.invoiceNumber, numeroFacturaLegal), numeroFacturaLegal),
    number: safeText(first(raw.number, numeroFacturaLegal), numeroFacturaLegal),

    total: finalTotal,
    amount: finalTotal,
    importe: finalTotal,
    totalFactura: finalTotal,
    importeTotal: finalTotal,

    currency,
    moneda: currency,
  };
}

function normalizeInvoiceArray(source = {}, raw = {}) {
  const byKey = new Map();

  collectInvoiceObjects(source, raw)
    .map(normalizeInvoiceLite)
    .filter(Boolean)
    .forEach((invoice) => {
      const key =
        invoice.id ||
        invoice.facturaId ||
        invoice.invoiceId ||
        invoice.numeroFacturaLegal ||
        `invoice-${byKey.size}`;

      if (!byKey.has(key)) {
        byKey.set(key, invoice);
      }
    });

  return [...byKey.values()];
}

function buildInvoicePatch(source = {}, fallbackRaw = {}) {
  const item = safeObject(source);
  const embeddedRaw = safeObject(item.raw);
  const raw = hasOwnKeys(embeddedRaw) ? embeddedRaw : safeObject(fallbackRaw);

  const invoiceIds = resolveInvoiceIds(item, raw);
  const primaryInvoiceId = resolvePrimaryInvoiceId(item, raw) || invoiceIds[0] || "";
  const invoiceNumber = resolveInvoiceNumber(item, raw);
  const invoices = normalizeInvoiceArray(item, raw);
  const count = resolveInvoiceCount(item, raw, invoiceIds);
  const currency = resolveInvoiceCurrency(item, raw);
  const amount = resolveInvoiceAmount(item, raw);

  const hasInvoiceEvidence = Boolean(
    primaryInvoiceId ||
      invoiceNumber ||
      invoiceIds.length ||
      invoices.length ||
      count ||
      amount !== null ||
      item.meta?.hasLinkedInvoices ||
      raw.meta?.hasLinkedInvoices ||
      item.meta?.hasFactura ||
      raw.meta?.hasFactura
  );

  const finalAmount = amount === null
    ? hasInvoiceEvidence
      ? 0
      : null
    : amount;

  const linkedInvoicesBase = {
    ...safeObject(raw.linkedInvoices),
    ...safeObject(item.linkedInvoices),
  };

  const linkedInvoices = {
    ...linkedInvoicesBase,

    count: Math.max(
      safeNumber(linkedInvoicesBase.count, 0),
      count,
      invoiceIds.length,
      invoices.length,
      hasInvoiceEvidence ? 1 : 0
    ),

    ids: uniqueStrings(first(linkedInvoicesBase.ids, invoiceIds)),

    primaryInvoiceId: safeText(
      first(linkedInvoicesBase.primaryInvoiceId, primaryInvoiceId),
      primaryInvoiceId
    ),

    numeroFacturaLegal: safeText(
      first(linkedInvoicesBase.numeroFacturaLegal, invoiceNumber),
      invoiceNumber
    ),

    numeroFactura: safeText(
      first(linkedInvoicesBase.numeroFactura, invoiceNumber),
      invoiceNumber
    ),

    invoiceNumber: safeText(
      first(linkedInvoicesBase.invoiceNumber, invoiceNumber),
      invoiceNumber
    ),

    total: finalAmount,
    amount: finalAmount,
    importe: finalAmount,

    currency,
    moneda: currency,

    invoices: safeArray(first(linkedInvoicesBase.invoices, invoices)),
  };

  return {
    facturaId: safeText(first(item.facturaId, raw.facturaId, primaryInvoiceId), ""),
    invoiceId: safeText(first(item.invoiceId, raw.invoiceId, primaryInvoiceId), ""),

    linkedFacturaId: safeText(first(item.linkedFacturaId, raw.linkedFacturaId, primaryInvoiceId), ""),
    linkedInvoiceId: safeText(first(item.linkedInvoiceId, raw.linkedInvoiceId, primaryInvoiceId), ""),

    facturaIds: uniqueStrings(first(item.facturaIds, raw.facturaIds, invoiceIds)),
    invoiceIds: uniqueStrings(first(item.invoiceIds, raw.invoiceIds, invoiceIds)),

    numeroFacturaLegal: invoiceNumber,
    numeroFactura: safeText(first(item.numeroFactura, raw.numeroFactura, invoiceNumber), invoiceNumber),
    invoiceNumber: safeText(first(item.invoiceNumber, raw.invoiceNumber, invoiceNumber), invoiceNumber),

    facturasCount: Math.max(count, safeNumber(item.facturasCount, 0), safeNumber(raw.facturasCount, 0)),
    invoicesCount: Math.max(count, safeNumber(item.invoicesCount, 0), safeNumber(raw.invoicesCount, 0)),

    linkedInvoices,

    factura: first(item.factura, raw.factura, invoices[0], null),
    invoice: first(item.invoice, raw.invoice, invoices[0], null),

    billing: first(
      item.billing,
      raw.billing,
      hasInvoiceEvidence
        ? {
            facturaId: primaryInvoiceId,
            invoiceId: primaryInvoiceId,
            numeroFacturaLegal: invoiceNumber,
            numeroFactura: invoiceNumber,
            invoiceNumber,
            total: finalAmount,
            amount: finalAmount,
            importe: finalAmount,
            currency,
            moneda: currency,
          }
        : null
    ),

    facturas: safeArray(first(item.facturas, raw.facturas, invoices)),
    invoices: safeArray(first(item.invoices, raw.invoices, invoices)),
    facturasRelacionadas: safeArray(
      first(item.facturasRelacionadas, raw.facturasRelacionadas, invoices)
    ),

    facturaRelacionada: safeText(
      first(
        item.facturaRelacionada,
        raw.facturaRelacionada,
        hasInvoiceEvidence
          ? `${Math.max(count, invoices.length, 1)} factura${Math.max(count, invoices.length, 1) === 1 ? "" : "s"} vinculada${Math.max(count, invoices.length, 1) === 1 ? "" : "s"}`
          : ""
      ),
      ""
    ),

    facturasTotal: finalAmount,
    invoicesTotal: finalAmount,
    importeFacturas: finalAmount,
    invoiceTotal: finalAmount,

    facturaTotal: finalAmount,
    facturaImporte: finalAmount,
    importeFactura: finalAmount,
    totalFactura: finalAmount,
    invoiceAmount: finalAmount,

    total: finalAmount,
    amount: finalAmount,
    importe: finalAmount,
    price: finalAmount,

    currency,
    moneda: currency,
    facturaCurrency: currency,
    facturaMoneda: currency,

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(item.meta),

      hasLinkedInvoices: Boolean(
        item.meta?.hasLinkedInvoices ||
          raw.meta?.hasLinkedInvoices ||
          hasInvoiceEvidence
      ),

      hasFactura: Boolean(
        item.meta?.hasFactura ||
          raw.meta?.hasFactura ||
          hasInvoiceEvidence
      ),

      hasInvoice: Boolean(
        item.meta?.hasInvoice ||
          raw.meta?.hasInvoice ||
          hasInvoiceEvidence
      ),

      linkedInvoiceCount: Math.max(
        safeNumber(item.meta?.linkedInvoiceCount, 0),
        safeNumber(raw.meta?.linkedInvoiceCount, 0),
        linkedInvoices.count
      ),

      invoicesTotal: finalAmount,
      invoiceTotal: finalAmount,
      invoiceCurrency: currency,
      numeroFacturaLegal: invoiceNumber,
    },
  };
}

/* =========================================================
   DOMAIN NORMALIZATION
========================================================= */

export function normalizeIncidencia(item = {}) {
  const raw = safeObject(item);

  const cliente = safeObject(
    first(
      raw.cliente,
      raw.client,
      raw.customer
    )
  );

  const tecnico = safeObject(
    first(
      raw.tecnico,
      raw.assignedTo,
      raw.assignee
    )
  );

  const createdBy = safeObject(raw.createdBy);
  const receptor = safeObject(raw.receptor);

  const attachments = safeArray(
    first(
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  ).map(normalizeAttachment);

  const history = safeArray(
    first(
      raw.history,
      raw.timeline,
      raw.logs
    )
  );

  const comments = safeArray(
    first(
      raw.comments,
      raw.notes,
      raw.messages
    )
  );

  const ticketId = safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw._id,
      raw.code,
      raw.ticketCode
    ),
    ""
  );

  const id = safeText(
    first(
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw._id,
      ticketId
    ),
    ticketId
  );

  const status = normalizeStatus(first(raw.status, raw.estado));
  const priority = normalizePriority(first(raw.priority, raw.prioridad));
  const categoria = normalizeCategory(first(raw.categoria, raw.category, raw.tipo));

  const subject = safeText(
    first(
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview
    ),
    ticketId ? `Incidencia ${ticketId}` : "Incidencia sin asunto"
  );

  const message = safeText(
    first(
      raw.message,
      raw.descripcion,
      raw.description,
      raw.body,
      raw.preview,
      subject
    ),
    ""
  );

  const clientName = safeText(
    first(
      raw.clientName,
      raw.clienteNombre,
      raw.name,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      cliente?.nombreContacto,
      cliente?.nombre,
      cliente?.name,
      cliente?.displayName,
      receptor?.name,
      receptor?.nombre,
      createdBy?.name,
      createdBy?.nombre
    ),
    "Cliente"
  );

  const clientEmail = safeLower(
    first(
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.userEmail,
      raw.requesterSnapshot?.email,
      cliente?.email,
      receptor?.email,
      createdBy?.email
    ),
    ""
  );

  const clientAvatar = safeText(
    first(
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,
      cliente?.avatar,
      cliente?.avatarUrl,
      receptor?.avatar
    ),
    ""
  );

  const invoicePatch = buildInvoicePatch(raw, raw.raw || raw);

  const timestampMs =
    safeNumber(raw.meta?.timestampMs, 0) ||
    safeNumber(raw.meta?.updatedAtMs, 0) ||
    toTimestamp(first(raw.lastActivityAt, raw.updatedAt, raw.closedAt, raw.createdAt)) ||
    safeNumber(raw._ts, 0) * 1000 ||
    0;

  return {
    ...raw,
    ...invoicePatch,

    id,
    ticketId,
    incidenciaId: safeText(first(raw.incidenciaId, ticketId), ticketId),

    code: safeText(first(raw.code, raw.ticketCode, ticketId, id), ticketId),
    ticketCode: safeText(first(raw.ticketCode, raw.code, ticketId, id), ticketId),

    subject,
    title: safeText(first(raw.title, subject), subject),
    asunto: safeText(first(raw.asunto, subject), subject),

    message,
    description: safeText(first(raw.description, raw.descripcion, message), message),
    descripcion: safeText(first(raw.descripcion, raw.message, raw.description, message), message),
    preview: safeText(first(raw.preview, message, subject), subject),

    status,
    estado: status,

    priority,
    prioridad: priority,

    category: categoria,
    categoria,
    tipo: safeText(first(raw.tipo, categoria), categoria),

    source: safeText(first(raw.source, raw.origen, raw.channel), "panel"),
    origen: safeText(first(raw.origen, raw.source, raw.channel), "panel"),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.created_at, null),
    createdAtES: first(raw.createdAtES, null),

    updatedAt: first(
      raw.updatedAt,
      raw.lastActivityAt,
      raw.fechaActualizacion,
      raw.updated_at,
      raw.modifiedAt,
      raw.lastUpdate,
      raw.closedAt,
      raw.createdAt,
      null
    ),

    updatedAtES: first(raw.updatedAtES, raw.lastActivityAtES, null),
    lastActivityAt: first(raw.lastActivityAt, raw.updatedAt, raw.closedAt, raw.createdAt, null),
    lastActivityAtES: first(raw.lastActivityAtES, raw.updatedAtES, null),

    closedAt: first(raw.closedAt, raw.closed_at, null),
    closedAtES: first(raw.closedAtES, null),

    assignedTo: first(raw.assignedTo, raw.assignee, raw.asignadoA, tecnico, null),

    assignedToName: safeText(
      first(
        tecnico?.name,
        tecnico?.nombre,
        raw.assignedToName,
        typeof raw.assignedTo === "string" ? raw.assignedTo : null,
        typeof raw.assignee === "string" ? raw.assignee : null
      ),
      ""
    ),

    requester: first(raw.requester, raw.user, raw.usuario, cliente, createdBy, receptor, null),

    clientName,
    clienteNombre: safeText(first(raw.clienteNombre, clientName), clientName),
    clientEmail,
    clienteEmail: safeText(first(raw.clienteEmail, clientEmail), clientEmail),
    clientAvatar,

    name: safeText(first(raw.name, clientName), clientName),
    email: safeText(first(raw.email, clientEmail), clientEmail),

    cliente: {
      ...cliente,
      nombre: safeText(first(cliente.nombre, cliente.name, clientName), clientName),
      name: safeText(first(cliente.name, cliente.nombre, clientName), clientName),
      email: safeText(first(cliente.email, clientEmail), clientEmail),
      avatar: first(cliente.avatar, cliente.avatarUrl, clientAvatar, null),
    },

    tecnico,
    createdBy,
    receptor,

    userId: safeText(first(raw.userId, receptor?.userId, createdBy?.userId, raw.cliente?.userId), ""),
    clienteId: safeText(first(raw.clienteId, receptor?.clienteId, cliente?.clienteId, cliente?.id), ""),

    attachments,
    files: attachments,
    adjuntos: attachments,

    attachmentsCount: safeNumber(first(raw.attachmentsCount, raw.filesCount, attachments.length), attachments.length),
    filesCount: safeNumber(first(raw.filesCount, raw.attachmentsCount, attachments.length), attachments.length),

    history,
    historyCount: safeNumber(first(raw.historyCount, history.length), history.length),

    comments,
    commentsCount: safeNumber(first(raw.commentsCount, comments.length), comments.length),

    fechaProgramada: first(raw.fechaProgramada, null),
    ip: safeText(raw.ip, ""),

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(invoicePatch.meta),

      timestampMs,

      isClosed: ["closed", "resolved"].includes(status),
      isActive: !["closed", "resolved"].includes(status),

      hasAttachments: attachments.length > 0,
      hasComments: comments.length > 0,
      hasHistory: history.length > 0,
    },

    raw,
  };
}

function looksLikeTicket(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticketId ||
      obj.incidenciaId ||
      obj.id ||
      obj._id ||
      obj.code ||
      obj.ticketCode ||
      obj.title ||
      obj.subject ||
      obj.asunto ||
      obj.message ||
      obj.descripcion ||
      obj.description
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function unwrapResponseEnvelope(payload = null) {
  if (payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) return payload;

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) return payload;

  if (Array.isArray(obj.tickets)) return obj.tickets;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.incidencias)) return obj.incidencias;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.list)) return obj.list;

  if (obj.ticket) return obj.ticket;
  if (obj.item) return obj.item;
  if (obj.detail) return obj.detail;
  if (obj.incidencia) return obj.incidencia;
  if (obj.result) return obj.result;

  if (obj.payload) return unwrapResponseEnvelope(obj.payload);

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  return obj;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  const obj = safeObject(payload);

  const direct = first(
    obj.tickets,
    obj.items,
    obj.data,
    obj.incidencias,
    obj.results,
    obj.rows,
    obj.list,
    obj.payload?.tickets,
    obj.payload?.items,
    obj.payload?.data,
    obj.payload?.incidencias,
    obj.data?.tickets,
    obj.data?.items,
    obj.data?.data,
    obj.data?.incidencias,
    obj.result?.tickets,
    obj.result?.items,
    obj.result?.data,
    obj.result?.incidencias
  );

  if (Array.isArray(direct)) return direct;

  const unwrapped = unwrapResponseEnvelope(payload);

  return Array.isArray(unwrapped) ? unwrapped : [];
}

function pickTotal(payload = null, fallback = 0) {
  const obj = safeObject(payload);

  const candidates = [
    obj.total,
    obj.count,
    obj.remoteCount,
    obj.totalCount,
    obj.pagination?.total,
    obj.meta?.total,
    obj.meta?.count,
    obj.data?.total,
    obj.data?.count,
    obj.payload?.total,
    obj.payload?.count,
    fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return fallback;
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (looksLikeTicket(payload)) return payload;

  const obj = safeObject(payload);

  if (looksLikeTicket(obj.ticket)) return obj.ticket;
  if (looksLikeTicket(obj.item)) return obj.item;
  if (looksLikeTicket(obj.detail)) return obj.detail;
  if (looksLikeTicket(obj.incidencia)) return obj.incidencia;
  if (looksLikeTicket(obj.result)) return obj.result;
  if (looksLikeTicket(obj.payload)) return obj.payload;
  if (looksLikeTicket(obj.data)) return obj.data;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function pickCreatedTicket(payload = null) {
  return pickDetail(payload);
}

function pickFile(payload = null) {
  const obj = safeObject(payload);

  return safeObject(
    first(
      obj.file,
      obj.attachment,
      obj.adjunto,
      obj.data?.file,
      obj.data?.attachment,
      obj.data?.adjunto,
      obj.payload?.file,
      obj.payload?.attachment,
      obj.payload?.adjunto,
      obj.result?.file,
      obj.result?.attachment,
      obj.result?.adjunto,
      obj
    )
  );
}

function normalizeIncidenciasListResponse(response = null) {
  const rawItems = safeArray(pickItems(response));
  const items = rawItems.map(normalizeIncidencia);
  const total = pickTotal(response, items.length);

  return {
    ok: true,
    items,
    total,
    count: items.length,
    raw: response,
  };
}

function normalizeIncidenciaDetailResponse(response = null) {
  const detail = pickDetail(response);

  return {
    ok: true,
    item: detail ? normalizeIncidencia(detail) : null,
    raw: response,
  };
}

function normalizeIncidenciaStatsResponse(response = null) {
  const obj = safeObject(response);

  return {
    ok: obj.ok !== false,
    total: safeNumber(obj.total, 0),
    active: safeNumber(obj.active, 0),
    open: safeNumber(obj.open, 0),
    pending: safeNumber(obj.pending, 0),
    inProgress: safeNumber(first(obj.inProgress, obj.in_progress), 0),
    resolved: safeNumber(obj.resolved, 0),
    closed: safeNumber(obj.closed, 0),
    urgent: safeNumber(obj.urgent, 0),
    assigned: safeNumber(obj.assigned, 0),
    unassigned: safeNumber(obj.unassigned, 0),
    withAttachments: safeNumber(obj.withAttachments, 0),
    scope: safeText(obj.scope, ""),
    raw: response,
  };
}

function normalizeIncidenciaFileResponse(response = null, fallback = {}) {
  const file = pickFile(response);

  const source = {
    ...safeObject(fallback),
    ...file,
  };

  const url = safeText(
    first(
      source.url,
      source.viewUrl,
      source.openUrl,
      source.downloadUrl,
      source.signedUrl,
      source.blobUrl,
      source.publicUrl,
      source.href
    ),
    ""
  );

  return {
    ...source,

    url,
    viewUrl: safeText(first(source.viewUrl, source.openUrl, url), url),
    openUrl: safeText(first(source.openUrl, source.viewUrl, url), url),
    downloadUrl: safeText(first(source.downloadUrl, url), url),
    signedUrl: safeText(first(source.signedUrl, url), url),

    filename: safeText(first(source.filename, source.fileName, source.name), "archivo"),
    fileName: safeText(first(source.fileName, source.filename, source.name), "archivo"),
    name: safeText(first(source.name, source.filename, source.fileName), "archivo"),

    contentType: safeText(
      first(source.contentType, source.mimetype, source.mimeType, source.mime),
      ""
    ),

    raw: response,
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("INCIDENCIAS_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "patch" && typeof client.patch === "function") {
    return client.patch(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "put" && typeof client.put === "function") {
    return client.put(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
      body: options.body,
    });
  }

  throw new Error("INCIDENCIAS_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    timeout: options.timeout,
    headers: options.headers,
    query: options.query,
    params: options.params,
    body: options.body,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "put" && typeof Http.put === "function") {
    return Http.put(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
    });
  }

  throw new Error("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  const body = options.body;
  const url = buildAbsoluteUrl(path, options.query || options.params || {});
  const controller = new AbortController();

  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  const headers = getRequestHeaders(options.headers, body);

  const finalOptions = {
    method: method.toUpperCase(),
    headers,
    credentials: "include",
    signal: controller.signal,
  };

  if (body !== undefined && body !== null) {
    if (isFormData(body)) {
      finalOptions.body = body;
    } else if (
      typeof body === "string" ||
      isBlob(body) ||
      isArrayBuffer(body)
    ) {
      finalOptions.body = body;
    } else {
      finalOptions.headers = {
        ...headers,
        "Content-Type": headers["Content-Type"] || "application/json",
      };

      finalOptions.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, finalOptions);
    const contentType = safeText(response.headers.get("content-type"), "");

    let data = null;

    if (response.status !== 204) {
      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        const text = await response.text();

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text ? { raw: text } : null;
        }
      }
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          data,
          `HTTP ${response.status} en ${method.toUpperCase()} ${path}`
        )
      );

      error.response = data;
      error.status = response.status;
      error.statusCode = response.status;
      error.url = url;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const body = options.body;

  const requestOptions = {
    timeout: safeNumber(options.timeout, INCIDENCIAS_TIMEOUT),
    query: safeObject(options.query),
    params: safeObject(options.params),
    body,
    headers: getRequestHeaders(
      {
        ...(!isFormData(body) &&
        body !== undefined &&
        body !== null &&
        !isBlob(body) &&
        !isArrayBuffer(body)
          ? { "Content-Type": "application/json" }
          : {}),
        ...safeObject(options.headers),
      },
      body
    ),
  };

  const adapters = isFormData(body)
    ? [
        requestViaFetch,
        requestViaApiClient,
        requestViaAppCoreRequest,
        requestViaHttpModule,
      ]
    : [
        requestViaApiClient,
        requestViaAppCoreRequest,
        requestViaHttpModule,
        requestViaFetch,
      ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("INCIDENCIAS_REQUEST_FAILED");
}

async function requestFirst(method = "GET", paths = [], options = {}) {
  const candidates = safeArray(paths)
    .map((path) => safeText(path, ""))
    .filter(Boolean);

  let lastError = null;

  for (const path of candidates) {
    try {
      return await request(method, path, options);
    } catch (error) {
      lastError = error;

      if (!shouldTryNextEndpoint(error)) {
        break;
      }
    }
  }

  throw lastError || new Error("INCIDENCIAS_REQUEST_CANDIDATES_FAILED");
}

/* =========================================================
   FORM DATA HELPERS
========================================================= */

function extractFilesFromPayload(payload = {}) {
  const source = safeObject(payload);

  return safeArray(
    first(
      source.files,
      source.attachments,
      source.adjuntos,
      source.uploads
    )
  ).filter((file) => isFile(file) || isBlob(file));
}

function buildFormDataFromPayload(payload = {}) {
  const source = safeObject(payload);
  const formData = new FormData();

  const files = extractFilesFromPayload(source);

  Object.entries(source).forEach(([key, value]) => {
    if (["files", "attachments", "adjuntos", "uploads"].includes(key)) {
      return;
    }

    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === "object" && !isFile(value) && !isBlob(value)) {
      formData.append(key, JSON.stringify(value));
      return;
    }

    formData.append(key, value);
  });

  files.forEach((file) => {
    const filename = file?.name || "archivo";
    formData.append("attachments", file, filename);
  });

  return formData;
}

function buildAttachmentsFormData(files = [], extra = {}) {
  const formData = new FormData();

  safeArray(files).forEach((file) => {
    if (isFile(file) || isBlob(file)) {
      formData.append("attachments", file, file?.name || "archivo");
    }
  });

  Object.entries(safeObject(extra)).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (typeof value === "object" && !isFile(value) && !isBlob(value)) {
      formData.append(key, JSON.stringify(value));
      return;
    }

    formData.append(key, value);
  });

  return formData;
}

/* =========================================================
   RAW REQUESTS - LIST / STATS / DETAIL / CREATE
========================================================= */

export async function fetchIncidenciasRequest({
  timeout = INCIDENCIAS_TIMEOUT,
  query = {},
} = {}) {
  return request("GET", INCIDENCIAS_ENDPOINT, {
    timeout,
    query,
  });
}

export async function fetchIncidenciasStatsRequest({
  timeout = INCIDENCIAS_TIMEOUT,
} = {}) {
  const response = await request("GET", getIncidenciasStatsEndpoint(), {
    timeout,
  });

  return normalizeIncidenciaStatsResponse(response);
}

export async function getIncidenciaByIdRequest(
  id = "",
  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const response = await requestFirst(
    "GET",
    [
      getIncidenciaEndpoint(ticketId),
      getIncidenciaAltEndpoint(ticketId),
    ],
    {
      timeout,
    }
  );

  return normalizeIncidenciaDetailResponse(response).item;
}

export async function createIncidenciaRequest(
  payload = {},
  {
    timeout = INCIDENCIAS_UPLOAD_TIMEOUT,
  } = {}
) {
  const source = safeObject(payload);
  const files = extractFilesFromPayload(source);

  const body = files.length
    ? buildFormDataFromPayload(source)
    : source;

  const response = await request("POST", INCIDENCIAS_ENDPOINT, {
    timeout: files.length ? INCIDENCIAS_UPLOAD_TIMEOUT : timeout,
    body,
    headers: files.length ? {} : undefined,
  });

  const created = pickCreatedTicket(response);

  return created
    ? normalizeIncidencia(created)
    : response;
}

/* =========================================================
   RAW REQUESTS - UPDATE / COMMENT / REOPEN
========================================================= */

export async function updateIncidenciaRequest(
  id = "",
  payload = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
    method = "PATCH",
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);
  const httpMethod = safeText(method, "PATCH").toUpperCase() === "PUT" ? "PUT" : "PATCH";

  const response = await requestFirst(
    httpMethod,
    [
      getIncidenciaEndpoint(ticketId),
      getIncidenciaAltEndpoint(ticketId),
    ],
    {
      timeout,
      body: safeObject(payload),
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function commentIncidenciaRequest(
  id = "",
  message = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
    status = "open",
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);
  const text = safeText(message, "").replace(/\s+/g, " ").trim();

  if (!text) {
    throw new Error("INCIDENCIA_COMMENT_REQUIRED");
  }

  const finalStatus = normalizeStatus(status || "open");

  const payload = {
    message: text,
    comment: text,
    body: text,
    text,
    status: finalStatus,
    estado: finalStatus,
  };

  const postCandidates = [
    getIncidenciaCommentsEndpoint(ticketId),
    getIncidenciaMessagesEndpoint(ticketId),
    `${getIncidenciaAltEndpoint(ticketId)}/comments`,
    `${getIncidenciaAltEndpoint(ticketId)}/messages`,
  ];

  let response = null;
  let postError = null;

  try {
    response = await requestFirst("POST", postCandidates, {
      timeout,
      body: payload,
    });
  } catch (error) {
    postError = error;
  }

  if (!response) {
    try {
      response = await requestFirst(
        "PATCH",
        [
          getIncidenciaEndpoint(ticketId),
          getIncidenciaAltEndpoint(ticketId),
        ],
        {
          timeout,
          body: payload,
        }
      );
    } catch (patchError) {
      throw patchError || postError;
    }
  }

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function reopenIncidenciaRequest(
  id = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const payload = {
    status: "open",
    estado: "open",
  };

  let response = null;
  let postError = null;

  try {
    response = await requestFirst(
      "POST",
      [
        getIncidenciaReopenEndpoint(ticketId),
        `${getIncidenciaAltEndpoint(ticketId)}/reopen`,
      ],
      {
        timeout,
        body: payload,
      }
    );
  } catch (error) {
    postError = error;
  }

  if (!response) {
    try {
      response = await requestFirst(
        "PATCH",
        [
          getIncidenciaEndpoint(ticketId),
          getIncidenciaAltEndpoint(ticketId),
        ],
        {
          timeout,
          body: payload,
        }
      );
    } catch (patchError) {
      throw patchError || postError;
    }
  }

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

/* =========================================================
   RAW REQUESTS - ATTACHMENTS
========================================================= */

export async function uploadIncidenciaAttachmentsRequest(
  id = "",
  files = [],
  {
    timeout = INCIDENCIAS_UPLOAD_TIMEOUT,
    status = "open",
    extra = {},
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const list = safeArray(files).filter((file) => isFile(file) || isBlob(file));

  if (!list.length) {
    throw new Error("INCIDENCIA_ATTACHMENTS_REQUIRED");
  }

  const finalStatus = normalizeStatus(status || "open");

  const formData = buildAttachmentsFormData(list, {
    status: finalStatus,
    estado: finalStatus,
    ...safeObject(extra),
  });

  const response = await requestFirst(
    "POST",
    [
      getIncidenciaAttachmentsEndpoint(ticketId),
      getIncidenciaFilesEndpoint(ticketId),
      getIncidenciaAdjuntosEndpoint(ticketId),
      `${getIncidenciaAltEndpoint(ticketId)}/attachments`,
      `${getIncidenciaAltEndpoint(ticketId)}/files`,
      `${getIncidenciaAltEndpoint(ticketId)}/adjuntos`,
    ],
    {
      timeout,
      body: formData,
      headers: {},
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function getIncidenciaAttachmentFileRequest(
  {
    ticketId = "",
    attachmentId = "",
    mode = "view",
    kind = "attachments",
  } = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const id = normalizeIncidenciaId(ticketId);
  const attId = safeText(attachmentId, "");

  if (!attId) {
    throw new Error("ATTACHMENT_ID_REQUIRED");
  }

  const safeMode = mode === "download" ? "download" : "view";

  const kinds = [
    kind,
    kind === "files" ? "attachments" : "files",
    "adjuntos",
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  const paths = [
    ...uniqueStrings(kinds).map((currentKind) =>
      getIncidenciaAttachmentFileEndpoint({
        ticketId: id,
        attachmentId: attId,
        mode: safeMode,
        kind: currentKind,
      })
    ),

    ...uniqueStrings(kinds).map(
      (currentKind) =>
        `${getIncidenciaAltEndpoint(id)}/${currentKind}/${encodeUrlPathSegment(attId)}/${safeMode}`
    ),
  ];

  const response = await requestFirst("GET", paths, {
    timeout,
  });

  return normalizeIncidenciaFileResponse(response);
}

/* =========================================================
   CACHE
========================================================= */

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const createdAt = safeNumber(parsed?.createdAt, 0);

    if (!createdAt || Date.now() - createdAt > CACHE_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items = [], total = 0) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        createdAt: Date.now(),
        items: safeArray(items),
        total: safeNumber(total, safeArray(items).length),
      })
    );

    return true;
  } catch {
    return false;
  }
}

export function hydrateFromCache() {
  const stateItems = safeArray(incidenciasState?.items);

  if (stateItems.length) {
    callSafe(replaceIncidenciasStore, stateItems);
    return stateItems;
  }

  const cached = readCache();
  const cachedItems = safeArray(cached?.items).map(normalizeIncidencia);

  if (!cachedItems.length) {
    return [];
  }

  callSafe(replaceIncidenciasStore, cachedItems);
  callSafe(setItems, cachedItems);
  callSafe(setRemoteCount, safeNumber(cached?.total, cachedItems.length));
  callSafe(setLoaded, true);

  return cachedItems;
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedListToState(normalized = { items: [], total: 0 }) {
  const items = safeArray(normalized?.items);
  const total = safeNumber(normalized?.total, items.length);

  callSafe(replaceIncidenciasStore, items);
  callSafe(setItems, items);
  callSafe(setRemoteCount, total);
  callSafe(setLastSyncAt, Date.now());
  callSafe(setLoaded, true);
  callSafe(setError, null);

  writeCache(items, total);

  return items;
}

function upsertLoadedDetail(detail = null) {
  if (!detail) return null;

  callSafe(upsertIncidenciaStore, detail);

  return detail;
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
  query = {},
  silent = false,
} = {}) {
  const loadToken = nextLoadToken();

  const hydratedItems = safeArray(incidenciasState?.items);
  const firstLoad = !hydratedItems.length && !Boolean(incidenciasState?.hydrated);
  const shouldShowLoading = firstLoad && !force && !silent;

  try {
    callSafe(setError, null);

    if (shouldShowLoading) {
      callSafe(setLoading, true);
    } else if (!silent) {
      callSafe(setRefreshing, true);
    }

    const response = await fetchIncidenciasRequest({
      timeout: INCIDENCIAS_TIMEOUT,
      query,
    });

    const normalized = normalizeIncidenciasListResponse(response);

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    return applyLoadedListToState(normalized);
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudieron cargar las incidencias."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    console.error("❌ INCIDENCIAS LOAD:", error);

    callSafe(setError, message);
    callSafe(setLoaded, true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      callSafe(setLoading, false);
      callSafe(setRefreshing, false);
    }
  }
}

/* =========================================================
   LOAD DETAIL / MUTATIONS
========================================================= */

export async function loadIncidenciaDetail(ticketId = "") {
  try {
    const detail = await getIncidenciaByIdRequest(ticketId);

    return upsertLoadedDetail(detail);
  } catch (error) {
    console.error("❌ INCIDENCIA DETAIL:", error);
    throw error;
  }
}

export async function createIncidencia(payload = {}) {
  try {
    const created = await createIncidenciaRequest(payload);

    return upsertLoadedDetail(created);
  } catch (error) {
    console.error("❌ INCIDENCIA CREATE:", error);
    throw error;
  }
}

export async function updateIncidencia(ticketId = "", payload = {}, options = {}) {
  try {
    const updated = await updateIncidenciaRequest(ticketId, payload, options);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA UPDATE:", error);
    throw error;
  }
}

export async function commentIncidencia(ticketId = "", message = "", options = {}) {
  try {
    const updated = await commentIncidenciaRequest(ticketId, message, options);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA COMMENT:", error);
    throw error;
  }
}

export async function reopenIncidencia(ticketId = "", options = {}) {
  try {
    const updated = await reopenIncidenciaRequest(ticketId, options);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA REOPEN:", error);
    throw error;
  }
}

export async function uploadIncidenciaAttachments(
  ticketId = "",
  files = [],
  options = {}
) {
  try {
    const updated = await uploadIncidenciaAttachmentsRequest(
      ticketId,
      files,
      options
    );

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA ATTACHMENTS UPLOAD:", error);
    throw error;
  }
}

export async function loadIncidenciasStats(options = {}) {
  try {
    return await fetchIncidenciasStatsRequest(options);
  } catch (error) {
    console.error("❌ INCIDENCIAS STATS:", error);
    throw error;
  }
}

/* =========================================================
   PUBLIC BRIDGE
========================================================= */

function registerIncidenciasApiBridge(api) {
  try {
    if (!AppCore.modules || typeof AppCore.modules !== "object") {
      AppCore.modules = {};
    }

    AppCore.modules.IncidenciasApi = api;
    AppCore.modules.TicketsApi = api;
    AppCore.modules.OnionIncidenciasApi = api;
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.OnionIncidenciasApi = api;
      window.IncidenciasApi = api;
      window.TicketsApi = api;
    }
  } catch {}

  return api;
}

/* =========================================================
   PUBLIC API
========================================================= */

export const IncidenciasApi = Object.freeze({
  resource: INCIDENCIAS_RESOURCE,
  endpoint: INCIDENCIAS_ENDPOINT,
  altEndpoint: INCIDENCIAS_ALT_ENDPOINT,
  timeout: INCIDENCIAS_TIMEOUT,
  detailTimeout: INCIDENCIAS_DETAIL_TIMEOUT,
  uploadTimeout: INCIDENCIAS_UPLOAD_TIMEOUT,

  normalizeIncidenciaId,

  getIncidenciasStatsEndpoint,
  getIncidenciaEndpoint,
  getIncidenciaAltEndpoint,
  getIncidenciaAttachmentsEndpoint,
  getIncidenciaFilesEndpoint,
  getIncidenciaAdjuntosEndpoint,
  getIncidenciaCommentsEndpoint,
  getIncidenciaMessagesEndpoint,
  getIncidenciaReopenEndpoint,
  getIncidenciaAttachmentFileEndpoint,

  normalizeIncidencia,

  fetchIncidenciasRequest,
  fetchIncidenciasStatsRequest,
  getIncidenciaByIdRequest,
  createIncidenciaRequest,
  updateIncidenciaRequest,
  commentIncidenciaRequest,
  reopenIncidenciaRequest,
  uploadIncidenciaAttachmentsRequest,
  getIncidenciaAttachmentFileRequest,

  hydrateFromCache,
  loadIncidencias,
  loadIncidenciasStats,
  loadIncidenciaDetail,
  createIncidencia,
  updateIncidencia,
  commentIncidencia,
  reopenIncidencia,
  uploadIncidenciaAttachments,
});

registerIncidenciasApiBridge(IncidenciasApi);

export default IncidenciasApi;

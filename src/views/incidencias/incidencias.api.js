/* =========================================================
   Onion Support - Incidencias API
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - Centralizar llamadas HTTP del módulo Incidencias.
   - Adaptar contrato backend /api/tickets al frontend.
   - Hidratar State/Store tras cargas y mutaciones.
   - Delegar normalización de incidencias a incidencias.model.js.
   - Delegar cache a incidencias.state.js.
   - No tocar DOM.
   - No registrar globals.
   - No crear bridges.
   - No leer Router.
   - No abrir modales.
   - No duplicar lógica de View/Store/Model.
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
  clearError,
  getItems as getStateItems,
  upsertItem as upsertStateItem,
  hydrateStateFromCache,
  writeCachePayload,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

import {
  normalizeIncidenciaModel,
  normalizeIncidenciasCollection,
  normalizeStatus as normalizeModelStatus,
} from "./incidencias.model.js";

/* =========================================================
   CONFIG
========================================================= */

export const INCIDENCIAS_API_VERSION = "incidencias.api.v2.optimized.1";

export const INCIDENCIAS_RESOURCE = "tickets";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const INCIDENCIAS_ALT_ENDPOINT = "/api/incidencias";

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 90000;

let lastLoadToken = 0;
let inflightListPromise = null;
let inflightListKey = "";

/* =========================================================
   SAFE HELPERS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
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

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function callSafe(fn, ...args) {
  try {
    if (isFn(fn)) return fn(...args);
  } catch {}

  return undefined;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[IncidenciasApi]", ...args);
  } catch {}

  try {
    console.warn("[IncidenciasApi]", ...args);
  } catch {}
}

function stableStringify(value = null) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
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

function clearInflightList(promise = null) {
  if (!promise || inflightListPromise === promise) {
    inflightListPromise = null;
    inflightListKey = "";
  }
}

/* =========================================================
   ENDPOINTS
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

export function getIncidenciasAltStatsEndpoint() {
  return `${INCIDENCIAS_ALT_ENDPOINT}/stats`;
}

export function getIncidenciaEndpoint(id = "") {
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(normalizeIncidenciaId(id))}`;
}

export function getIncidenciaAltEndpoint(id = "") {
  return `${INCIDENCIAS_ALT_ENDPOINT}/${encodeUrlPathSegment(normalizeIncidenciaId(id))}`;
}

export function getIncidenciaAttachmentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/attachments`;
}

export function getIncidenciaFilesEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/files`;
}

export function getIncidenciaAdjuntosEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/adjuntos`;
}

export function getIncidenciaCommentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/comments`;
}

export function getIncidenciaMessagesEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/messages`;
}

export function getIncidenciaReopenEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/reopen`;
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

  return `${getIncidenciaEndpoint(id)}/${safeKind}/${encodeUrlPathSegment(attId)}/${safeMode}`;
}

/* =========================================================
   ERRORS / STATUS
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

function normalizeStatus(value = "open") {
  try {
    return normalizeModelStatus(value || "open");
  } catch {
    const key = normalizeKey(value || "open");

    const fallbackMap = {
      open: "open",
      opened: "open",
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

    return fallbackMap[key] || key || "open";
  }
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function unwrapResponseEnvelope(payload = null) {
  if (payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) return payload;
  if (isBlob(payload)) return payload;

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
  if (isObject(obj.data)) return unwrapResponseEnvelope(obj.data);

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
    obj.data?.pagination?.total,
    obj.data?.meta?.total,
    obj.payload?.total,
    obj.payload?.count,
    obj.payload?.pagination?.total,
    obj.payload?.meta?.total,
    obj.result?.total,
    obj.result?.count,
    fallback,
  ];

  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return Math.max(0, number);
  }

  return Math.max(0, fallback);
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

function getDetailId(value = null) {
  const obj = safeObject(value);

  return safeText(
    first(
      obj.ticketId,
      obj.incidenciaId,
      obj.id,
      obj._id,
      obj.code,
      obj.ticketCode,
      obj.raw?.ticketId,
      obj.raw?.incidenciaId,
      obj.raw?.id,
      obj.raw?._id,
      obj.raw?.code,
      obj.raw?.ticketCode
    ),
    ""
  );
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

  if (isObject(obj.data)) return pickDetail(obj.data);
  if (isObject(obj.payload)) return pickDetail(obj.payload);

  return null;
}

function pickFile(payload = null) {
  if (isBlob(payload)) {
    return {
      blob: payload,
      size: payload.size,
      contentType: payload.type,
    };
  }

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

export function normalizeIncidencia(item = {}) {
  const source = safeObject(item);

  try {
    return normalizeIncidenciaModel(source);
  } catch {
    return source;
  }
}

function normalizeList(items = []) {
  try {
    return normalizeIncidenciasCollection(items, {
      sort: true,
      dedupe: true,
    });
  } catch {
    return safeArray(items).map(normalizeIncidencia);
  }
}

function normalizeIncidenciasListResponse(response = null) {
  const rawItems = pickItems(response);
  const items = normalizeList(rawItems);
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
  const obj = safeObject(unwrapResponseEnvelope(response));

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
    withInvoices: safeNumber(obj.withInvoices, 0),
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
    contentType: safeText(first(source.contentType, source.mimetype, source.mimeType, source.mime), ""),
    raw: response,
  };
}

/* =========================================================
   REQUEST ADAPTER
========================================================= */

function getHttpModule() {
  return (
    AppCore?.request ||
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.modules?.Http ||
    null
  );
}

function normalizeRequestOptions(method = "GET", options = {}) {
  const body = options.body;

  const headers = {
    ...safeObject(options.headers),
  };

  if (
    body !== undefined &&
    body !== null &&
    !isFormData(body) &&
    !isBlob(body) &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (isFormData(body)) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return {
    method: safeText(method, "GET").toUpperCase(),
    timeout: safeNumber(options.timeout, INCIDENCIAS_TIMEOUT),
    query: safeObject(options.query),
    params: safeObject(options.params),
    headers,
    body,
  };
}

async function callRequestObject(client, method = "GET", path = "", options = {}) {
  const verb = safeText(method, "GET").toLowerCase();

  if (isFn(client?.request)) return client.request(path, options);
  if (verb === "get" && isFn(client?.get)) return client.get(path, options);
  if (verb === "post" && isFn(client?.post)) return client.post(path, options.body, options);
  if (verb === "patch" && isFn(client?.patch)) return client.patch(path, options.body, options);
  if (verb === "put" && isFn(client?.put)) return client.put(path, options.body, options);
  if (verb === "delete" && isFn(client?.delete)) return client.delete(path, options);
  if (verb === "delete" && isFn(client?.del)) return client.del(path, options);

  throw new Error("INCIDENCIAS_HTTP_METHOD_UNAVAILABLE");
}

async function request(method = "GET", path = "", options = {}) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    throw new Error("INCIDENCIAS_REQUEST_PATH_REQUIRED");
  }

  const client = getHttpModule();
  const requestOptions = normalizeRequestOptions(method, options);

  if (isFn(client)) {
    return client(cleanPath, requestOptions);
  }

  if (client && typeof client === "object") {
    return callRequestObject(client, method, cleanPath, requestOptions);
  }

  throw new Error("INCIDENCIAS_HTTP_CLIENT_UNAVAILABLE");
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
    if (["files", "attachments", "adjuntos", "uploads"].includes(key)) return;
    if (value === undefined || value === null) return;

    if (typeof value === "object" && !isFile(value) && !isBlob(value)) {
      formData.append(key, JSON.stringify(value));
      return;
    }

    formData.append(key, value);
  });

  files.forEach((file) => {
    formData.append("attachments", file, file?.name || "archivo");
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

  const response = await request("GET", getIncidenciaEndpoint(ticketId), {
    timeout,
  });

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
  const body = files.length ? buildFormDataFromPayload(source) : source;

  const response = await request("POST", INCIDENCIAS_ENDPOINT, {
    timeout: files.length ? INCIDENCIAS_UPLOAD_TIMEOUT : timeout,
    body,
    headers: files.length ? {} : undefined,
  });

  const created = pickDetail(response);

  return created ? normalizeIncidencia(created) : null;
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

  const response = await request(httpMethod, getIncidenciaEndpoint(ticketId), {
    timeout,
    body: safeObject(payload),
  });

  const detail = pickDetail(response);

  return detail ? normalizeIncidencia(detail) : null;
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

  if (!text) throw new Error("INCIDENCIA_COMMENT_REQUIRED");

  const finalStatus = normalizeStatus(status || "open");
  const payload = {
    message: text,
    status: finalStatus,
  };

  const response = await request("POST", getIncidenciaCommentsEndpoint(ticketId), {
    timeout,
    body: payload,
  });

  const detail = pickDetail(response);

  return detail ? normalizeIncidencia(detail) : null;
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
  };

  const response = await request("POST", getIncidenciaReopenEndpoint(ticketId), {
    timeout,
    body: payload,
  });

  const detail = pickDetail(response);

  return detail ? normalizeIncidencia(detail) : null;
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

  if (!list.length) throw new Error("INCIDENCIA_ATTACHMENTS_REQUIRED");

  const finalStatus = normalizeStatus(status || "open");
  const formData = buildAttachmentsFormData(list, {
    status: finalStatus,
    ...safeObject(extra),
  });

  const response = await request("POST", getIncidenciaAttachmentsEndpoint(ticketId), {
    timeout,
    body: formData,
    headers: {},
  });

  const detail = pickDetail(response);

  return detail ? normalizeIncidencia(detail) : null;
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

  if (!attId) throw new Error("ATTACHMENT_ID_REQUIRED");

  const safeMode = mode === "download" ? "download" : "view";
  const safeKind = ["attachments", "files", "adjuntos"].includes(kind)
    ? kind
    : "attachments";

  const response = await request(
    "GET",
    getIncidenciaAttachmentFileEndpoint({
      ticketId: id,
      attachmentId: attId,
      mode: safeMode,
      kind: safeKind,
    }),
    {
      timeout,
    }
  );

  return normalizeIncidenciaFileResponse(response, {
    ticketId: id,
    attachmentId: attId,
    mode: safeMode,
    kind: safeKind,
  });
}

/* =========================================================
   STATE / STORE HYDRATION
========================================================= */

export function hydrateFromCache() {
  const restored = callSafe(hydrateStateFromCache, {
    freshOnly: true,
  });

  const items = normalizeList(safeArray(getStateItems?.()));

  if (items.length) {
    callSafe(replaceIncidenciasStore, items);
  }

  return restored || items.length ? items : [];
}

function applyLoadedListToState(normalized = { items: [], total: 0 }) {
  const items = safeArray(normalized?.items);
  const total = Math.max(
    items.length,
    safeNumber(normalized?.total, items.length)
  );

  callSafe(replaceIncidenciasStore, items);
  callSafe(setItems, items, {
    remoteCount: total,
  });
  callSafe(setRemoteCount, total);
  callSafe(setLastSyncAt, Date.now());
  callSafe(setLoaded, true);
  callSafe(clearError);
  callSafe(writeCachePayload);

  return items;
}

function upsertLoadedDetail(detail = null) {
  if (!detail) return null;

  const normalized = normalizeIncidencia(detail);

  if (!looksLikeTicket(normalized) || !getDetailId(normalized)) {
    return null;
  }

  callSafe(upsertIncidenciaStore, normalized);
  callSafe(upsertStateItem, normalized);
  callSafe(setLastSyncAt, Date.now());
  callSafe(clearError);
  callSafe(writeCachePayload);

  return normalized;
}

function getCurrentStateItems() {
  return normalizeList(safeArray(getStateItems?.() || incidenciasState?.items));
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
  query = {},
  silent = false,
} = {}) {
  const queryKey = stableStringify(query || {});

  if (!force && inflightListPromise && inflightListKey === queryKey) {
    return inflightListPromise;
  }

  const loadToken = nextLoadToken();
  const hydratedItems = safeArray(incidenciasState?.items);
  const firstLoad = !hydratedItems.length && !Boolean(incidenciasState?.hydrated);
  const shouldShowLoading = firstLoad && !silent;

  const task = (async () => {
    try {
      callSafe(clearError);

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
        return getCurrentStateItems();
      }

      return applyLoadedListToState(normalized);
    } catch (error) {
      const message = normalizeErrorMessage(error, "No se pudieron cargar las incidencias.");

      if (!isActiveLoadToken(loadToken)) {
        return getCurrentStateItems();
      }

      safeWarn("loadIncidencias falló.", error);
      callSafe(setError, message);
      callSafe(setLoaded, true);

      throw error;
    } finally {
      if (isActiveLoadToken(loadToken)) {
        callSafe(setLoading, false);
        callSafe(setRefreshing, false);
      }

      clearInflightList(task);
    }
  })();

  inflightListPromise = task;
  inflightListKey = queryKey;

  return task;
}

/* =========================================================
   LOAD DETAIL / MUTATIONS
========================================================= */

export async function loadIncidenciaDetail(ticketId = "") {
  const detail = await getIncidenciaByIdRequest(ticketId);
  return upsertLoadedDetail(detail);
}

export async function createIncidencia(payload = {}) {
  const created = await createIncidenciaRequest(payload);
  return upsertLoadedDetail(created);
}

async function hydrateMutationResult(ticketId = "", detail = null) {
  const normalized = upsertLoadedDetail(detail);

  if (normalized) return normalized;

  if (!safeText(ticketId, "")) return null;

  try {
    return await loadIncidenciaDetail(ticketId);
  } catch {
    return null;
  }
}

export async function updateIncidencia(ticketId = "", payload = {}, options = {}) {
  const updated = await updateIncidenciaRequest(ticketId, payload, options);
  return hydrateMutationResult(ticketId, updated);
}

export async function commentIncidencia(ticketId = "", message = "", options = {}) {
  const updated = await commentIncidenciaRequest(ticketId, message, options);
  return hydrateMutationResult(ticketId, updated);
}

export async function reopenIncidencia(ticketId = "", options = {}) {
  const updated = await reopenIncidenciaRequest(ticketId, options);
  return hydrateMutationResult(ticketId, updated);
}

export async function uploadIncidenciaAttachments(
  ticketId = "",
  files = [],
  options = {}
) {
  const updated = await uploadIncidenciaAttachmentsRequest(ticketId, files, options);
  return hydrateMutationResult(ticketId, updated);
}

export async function loadIncidenciasStats(options = {}) {
  return fetchIncidenciasStatsRequest(options);
}

/* =========================================================
   PUBLIC API
========================================================= */

export const IncidenciasApi = Object.freeze({
  version: INCIDENCIAS_API_VERSION,

  resource: INCIDENCIAS_RESOURCE,
  endpoint: INCIDENCIAS_ENDPOINT,
  altEndpoint: INCIDENCIAS_ALT_ENDPOINT,
  timeout: INCIDENCIAS_TIMEOUT,
  detailTimeout: INCIDENCIAS_DETAIL_TIMEOUT,
  uploadTimeout: INCIDENCIAS_UPLOAD_TIMEOUT,

  normalizeIncidenciaId,

  getIncidenciasStatsEndpoint,
  getIncidenciasAltStatsEndpoint,
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

export default IncidenciasApi;

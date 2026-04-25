/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   CLIENT EXPERIENCE PRO · ACTIONS REAL · 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de incidencias
   - resolver detalle ticket desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar referencia de ticket
   - exportar colección a CSV
   - abrir modal de creación
   - añadir comentarios / actualizaciones al ticket
   - subir adjuntos a tickets existentes
   - abrir / descargar adjuntos mediante endpoint seguro
   - reabrir incidencias cerradas o resueltas
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con incidenciasView.js y incidencias.modal.js

   HARDENING PRO:
   - evita recursión entre modal/actions
   - tolerancia a payloads heterogéneos
   - fallback store -> backend en lecturas
   - sin fallback local falso en escrituras
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
   - create modal bridge multi-entorno
   - upload / comment / reopen / download con fetch directo
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getIncidenciaByIdRequest,
} from "./incidencias.api.js";

import {
  getIncidenciaByIdStore,
  getSortedIncidenciasStore,
} from "./incidencias.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "incidencias.csv";

const REQUEST_TIMEOUT_MS = 25000;
const UPLOAD_TIMEOUT_MS = 90000;

const TICKET_API_PREFIXES = [
  "/api/tickets",
  "/api/incidencias",
];

/* =========================================================
   CORE HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    return true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    return true;
  } catch {}

  return false;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTicketId(value = "") {
  return safeText(value, "");
}

function normalizeCommentMessage(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function normalizeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function normalizePathPart(value = "") {
  return safeText(value, "").replace(/^\/+|\/+$/g, "");
}

function joinApiPath(...parts) {
  return parts
    .map((part) => normalizePathPart(part))
    .filter(Boolean)
    .join("/");
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function buildUrl(base = "", path = "") {
  const cleanBase = safeText(base, "").replace(/\/+$/, "");
  const cleanPath = safeText(path, "").replace(/^\/+/, "");

  if (!cleanBase && cleanPath) return `/${cleanPath}`;
  if (!cleanPath) return cleanBase;

  return `${cleanBase}/${cleanPath}`;
}

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  ).replace(/\/+$/, "");
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      window?.Auth?.getToken?.(),
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : "",
      typeof localStorage !== "undefined" ? localStorage.getItem("accessToken") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("accessToken") : ""
    ),
    ""
  );
}

function createAbortController(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  return {
    controller,
    clear() {
      clearTimeout(timer);
    },
  };
}

function getUrl(path = "") {
  const target = safeText(path, "");

  if (isAbsoluteUrl(target)) {
    return target;
  }

  const apiBase = getApiBase();

  if (!apiBase) {
    return target.startsWith("/") ? target : `/${target}`;
  }

  return buildUrl(apiBase, target);
}

function getHttpStatus(error = null) {
  return Number(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status
    )
  ) || 0;
}

function getErrorMessage(error = null, fallback = "No se pudo completar la acción.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.data?.error,
      error?.error,
      fallback
    ),
    fallback
  );
}

function shouldTryNextCandidate(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [
    404,
    405,
    409,
    415,
    422,
    500,
    502,
    503,
    504,
  ].includes(status);
}

/* =========================================================
   FETCH HELPERS
========================================================= */

async function parseResponsePayload(response) {
  const contentType = safeText(response.headers.get("content-type"), "");

  if (response.status === 204) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

async function requestJson(path = "", options = {}) {
  const url = getUrl(path);
  const method = safeText(options.method, "GET").toUpperCase();
  const token = getAuthToken();

  const body = options.body ?? null;
  const isFormData = body instanceof FormData;

  const timeoutMs = safeNumber(
    options.timeoutMs,
    isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  );

  const { controller, clear } = createAbortController(timeoutMs);

  const headers = {
    Accept: "application/json",
    ...(safeObject(options.headers)),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchOptions = {
    method,
    headers,
    credentials: "include",
    signal: controller.signal,
  };

  if (body !== null && body !== undefined) {
    if (isFormData) {
      fetchOptions.body = body;
    } else if (
      typeof body === "string" ||
      body instanceof Blob ||
      body instanceof ArrayBuffer
    ) {
      fetchOptions.body = body;
    } else {
      fetchOptions.headers = {
        "Content-Type": "application/json",
        ...headers,
      };

      fetchOptions.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, fetchOptions);
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(
            safeObject(payload)?.message,
            safeObject(payload)?.error,
            `HTTP ${response.status}`
          ),
          `HTTP ${response.status}`
        )
      );

      error.status = response.status;
      error.statusCode = response.status;
      error.response = payload;
      error.url = url;

      throw error;
    }

    return payload;
  } finally {
    clear();
  }
}

async function requestFirstJsonCandidate(candidates = [], options = {}) {
  let lastError = null;

  for (const candidate of safeArray(candidates)) {
    const path = safeText(candidate?.path || candidate, "");
    if (!path) continue;

    try {
      const body =
        typeof candidate?.bodyFactory === "function"
          ? candidate.bodyFactory()
          : candidate?.body ?? options.body ?? null;

      return await requestJson(path, {
        ...options,
        ...safeObject(candidate),
        path: undefined,
        bodyFactory: undefined,
        body,
        method: safeText(candidate?.method || options.method, "GET"),
      });
    } catch (error) {
      lastError = error;

      if (!shouldTryNextCandidate(error)) {
        break;
      }
    }
  }

  throw lastError || new Error("REQUEST_CANDIDATES_FAILED");
}

/* =========================================================
   ENVELOPE / DETAIL PICKERS
========================================================= */

function isLikelyTicket(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.ticketId ||
      value.id ||
      value.code ||
      value.ticketCode ||
      value.title ||
      value.subject ||
      value.asunto ||
      value.message ||
      value.descripcion
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticket ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload ||
      obj.incidencia ||
      obj.detail
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyTicket(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyTicket(obj.ticket)) return obj.ticket;
  if (isLikelyTicket(obj.detail)) return obj.detail;
  if (isLikelyTicket(obj.item)) return obj.item;
  if (isLikelyTicket(obj.result)) return obj.result;
  if (isLikelyTicket(obj.payload)) return obj.payload;
  if (isLikelyTicket(obj.incidencia)) return obj.incidencia;
  if (isLikelyTicket(obj.data)) return obj.data;

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

function pickFilePayload(payload = null) {
  const obj = safeObject(payload);

  const file = safeObject(
    first(
      obj.file,
      obj.attachment,
      obj.data?.file,
      obj.data?.attachment,
      obj.payload?.file,
      obj.payload?.attachment,
      obj.result?.file,
      obj.result?.attachment
    )
  );

  if (Object.keys(file).length) {
    return file;
  }

  return obj;
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.id,
      item.code,
      item.ticketCode,
      item.raw?.ticketId,
      item.raw?.id
    ),
    ""
  );
}

function getTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.name,
      item.raw?.title,
      item.raw?.subject,
      item.raw?.asunto
    ),
    "Incidencia"
  );
}

function getDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.preview,
      item.body,
      item.raw?.description,
      item.raw?.descripcion,
      item.raw?.message,
      item.raw?.preview
    ),
    "Sin descripción."
  );
}

function getClient(item = {}) {
  const clientObject = first(
    item.client,
    item.cliente,
    item.customer,
    item.receptor,
    item.createdBy,
    item.raw?.client,
    item.raw?.cliente,
    item.raw?.customer,
    item.raw?.receptor,
    item.raw?.createdBy
  );

  if (isObject(clientObject)) {
    return safeText(
      first(
        clientObject.name,
        clientObject.nombre,
        clientObject.company,
        clientObject.empresa,
        clientObject.displayName
      ),
      "Cliente"
    );
  }

  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.company,
      item.empresa,
      item.name,
      clientObject
    ),
    "Cliente"
  );
}

function getEmail(item = {}) {
  const clientObject = first(
    item.client,
    item.cliente,
    item.customer,
    item.receptor,
    item.createdBy,
    item.raw?.client,
    item.raw?.cliente,
    item.raw?.customer,
    item.raw?.receptor,
    item.raw?.createdBy
  );

  if (isObject(clientObject)) {
    return safeText(
      first(
        clientObject.email,
        clientObject.mail
      ),
      ""
    );
  }

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.raw?.clientEmail,
      item.raw?.clienteEmail,
      item.raw?.email
    ),
    ""
  );
}

function getAssigned(item = {}) {
  const assignedObject = first(
    item.assignedTo,
    item.assignee,
    item.tecnico,
    item.raw?.assignedTo,
    item.raw?.assignee,
    item.raw?.tecnico
  );

  if (isObject(assignedObject)) {
    return safeText(
      first(
        assignedObject.name,
        assignedObject.nombre,
        assignedObject.displayName
      ),
      "Equipo de soporte"
    );
  }

  return safeText(assignedObject, "Equipo de soporte");
}

function getStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.raw?.status,
      item.raw?.estado
    ),
    "open"
  );
}

function getPriority(item = {}) {
  return safeText(
    first(
      item.priority,
      item.prioridad,
      item.raw?.priority,
      item.raw?.prioridad
    ),
    "medium"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.createdAtES,
    item.fechaCreacion,
    item.date,
    item.raw?.createdAt,
    item.raw?.createdAtES
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.closedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt,
    item.raw?.updatedAt,
    item.raw?.closedAt,
    item.raw?.createdAt
  );
}

function getAttachmentUrl(entry = {}) {
  return safeText(
    first(
      entry.viewUrl,
      entry.openUrl,
      entry.downloadUrl,
      entry.signedUrl,
      entry.url,
      entry.blobUrl,
      entry.publicUrl,
      entry.href
    ),
    ""
  );
}

function getAttachments(item = {}) {
  return safeArray(
    first(
      item.attachments,
      item.files,
      item.adjuntos,
      item.raw?.attachments,
      item.raw?.files,
      item.raw?.adjuntos
    )
  ).map((file, index) => {
    const entry = safeObject(file);

    const name = safeText(
      first(
        entry.name,
        entry.filename,
        entry.fileName,
        entry.originalname,
        entry.title
      ),
      `archivo_${index + 1}`
    );

    return {
      ...entry,
      id: safeText(
        first(
          entry.id,
          entry.fileId,
          entry.attachmentId,
          entry.storageKey,
          entry.path,
          entry.blobName,
          entry.key
        ),
        `attachment-${index + 1}`
      ),
      name,
      filename: safeText(
        first(
          entry.filename,
          entry.fileName,
          entry.name,
          entry.originalname
        ),
        name
      ),
      url: getAttachmentUrl(entry),
      viewUrl: safeText(first(entry.viewUrl, entry.openUrl, entry.url), ""),
      openUrl: safeText(first(entry.openUrl, entry.viewUrl, entry.url), ""),
      downloadUrl: safeText(first(entry.downloadUrl, entry.url), ""),
      signedUrl: safeText(entry.signedUrl, ""),
      blobUrl: safeText(entry.blobUrl, ""),
      publicUrl: safeText(entry.publicUrl, ""),
      path: safeText(
        first(
          entry.path,
          entry.storageKey,
          entry.storagePath,
          entry.blobPath,
          entry.blobName,
          entry.key
        ),
        ""
      ),
      storageKey: safeText(
        first(
          entry.storageKey,
          entry.path,
          entry.storagePath,
          entry.blobPath,
          entry.blobName,
          entry.key
        ),
        ""
      ),
      size: safeNumber(entry.size, 0),
      type: safeText(
        first(
          entry.type,
          entry.contentType,
          entry.mimetype,
          entry.mimeType,
          entry.mime
        ),
        ""
      ),
      contentType: safeText(
        first(
          entry.contentType,
          entry.mimetype,
          entry.mimeType,
          entry.mime
        ),
        ""
      ),
      uploadedAt: first(
        entry.uploadedAt,
        entry.createdAt,
        entry.date,
        null
      ),
      raw: entry,
    };
  });
}

function getHistory(item = {}) {
  return safeArray(
    first(
      item.history,
      item.timeline,
      item.logs,
      item.raw?.history,
      item.raw?.timeline,
      item.raw?.logs
    )
  ).map((row) => safeObject(row));
}

function getComments(item = {}) {
  return safeArray(
    first(
      item.comments,
      item.notes,
      item.messages,
      item.raw?.comments,
      item.raw?.notes,
      item.raw?.messages
    )
  ).map((row) => safeObject(row));
}

function getCategory(item = {}) {
  return safeText(
    first(
      item.category,
      item.categoria,
      item.raw?.category,
      item.raw?.categoria
    ),
    "General"
  );
}

function getSource(item = {}) {
  return safeText(
    first(
      item.source,
      item.origen,
      item.channel,
      item.raw?.source,
      item.raw?.origen,
      item.raw?.channel
    ),
    "panel"
  );
}

function getTags(item = {}) {
  const raw = first(
    item.tags,
    item.labels,
    item.raw?.tags,
    item.raw?.labels
  );

  if (Array.isArray(raw)) {
    return raw.map((tag) => safeText(tag, "")).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  return [];
}

function normalizeTicketDetail(detail = {}) {
  const raw = safeObject(detail);

  const ticketId = getId(raw);
  const attachments = getAttachments(raw);
  const history = getHistory(raw);
  const comments = getComments(raw);

  return {
    ...raw,

    raw,

    id: safeText(first(raw.id, ticketId), ticketId),
    ticketId,
    ticketCode: safeText(first(raw.ticketCode, raw.code, ticketId), ticketId),

    title: getTitle(raw),
    subject: safeText(first(raw.subject, raw.asunto, getTitle(raw)), getTitle(raw)),
    description: getDescription(raw),
    message: safeText(first(raw.message, raw.descripcion, getDescription(raw)), ""),

    clientName: getClient(raw),
    clientEmail: getEmail(raw),

    assignedToName: getAssigned(raw),

    status: getStatus(raw),
    estado: getStatus(raw),

    priority: getPriority(raw),
    prioridad: getPriority(raw),

    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),

    attachments,
    attachmentsCount: attachments.length,

    history,
    historyCount: history.length,

    comments,
    commentsCount: comments.length,

    category: getCategory(raw),
    categoria: safeText(first(raw.categoria, getCategory(raw)), "general"),

    source: getSource(raw),
    tags: getTags(raw),
  };
}

/* =========================================================
   API ROUTE BUILDERS
========================================================= */

function buildTicketPath(prefix = "/api/tickets", ticketId = "") {
  return `/${joinApiPath(prefix, encodeUrlPathSegment(ticketId))}`;
}

function buildAttachmentPath({
  prefix = "/api/tickets",
  ticketId = "",
  attachmentId = "",
  mode = "view",
} = {}) {
  return `/${joinApiPath(
    prefix,
    encodeUrlPathSegment(ticketId),
    "attachments",
    encodeUrlPathSegment(attachmentId),
    mode
  )}`;
}

function buildFilePath({
  prefix = "/api/tickets",
  ticketId = "",
  attachmentId = "",
  mode = "view",
} = {}) {
  return `/${joinApiPath(
    prefix,
    encodeUrlPathSegment(ticketId),
    "files",
    encodeUrlPathSegment(attachmentId),
    mode
  )}`;
}

function buildCommentCandidates(ticketId = "", payload = {}) {
  const id = normalizeTicketId(ticketId);

  return [
    ...TICKET_API_PREFIXES.flatMap((prefix) => [
      {
        method: "POST",
        path: `/${joinApiPath(prefix, encodeUrlPathSegment(id), "comments")}`,
        body: payload,
      },
      {
        method: "POST",
        path: `/${joinApiPath(prefix, encodeUrlPathSegment(id), "messages")}`,
        body: payload,
      },
      {
        method: "PATCH",
        path: buildTicketPath(prefix, id),
        body: payload,
      },
    ]),
  ];
}

function buildReopenCandidates(ticketId = "", payload = {}) {
  const id = normalizeTicketId(ticketId);

  return [
    ...TICKET_API_PREFIXES.flatMap((prefix) => [
      {
        method: "POST",
        path: `/${joinApiPath(prefix, encodeUrlPathSegment(id), "reopen")}`,
        body: payload,
      },
      {
        method: "PATCH",
        path: buildTicketPath(prefix, id),
        body: payload,
      },
    ]),
  ];
}

function buildDetailCandidates(ticketId = "") {
  const id = normalizeTicketId(ticketId);

  return TICKET_API_PREFIXES.map((prefix) => ({
    method: "GET",
    path: buildTicketPath(prefix, id),
  }));
}

function buildAttachmentCandidates({
  ticketId = "",
  attachmentId = "",
  mode = "view",
} = {}) {
  const id = normalizeTicketId(ticketId);
  const attId = safeText(attachmentId, "");
  const finalMode = mode === "download" ? "download" : "view";

  return TICKET_API_PREFIXES.flatMap((prefix) => [
    {
      method: "GET",
      path: buildAttachmentPath({
        prefix,
        ticketId: id,
        attachmentId: attId,
        mode: finalMode,
      }),
    },
    {
      method: "GET",
      path: buildFilePath({
        prefix,
        ticketId: id,
        attachmentId: attId,
        mode: finalMode,
      }),
    },
  ]);
}

/* =========================================================
   CSV
========================================================= */

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "ticketId",
    "title",
    "description",
    "status",
    "priority",
    "client",
    "email",
    "assignedTo",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getTitle(item),
    getDescription(item),
    getStatus(item),
    getPriority(item),
    getClient(item),
    getEmail(item),
    getAssigned(item),
    getCreatedAt(item) || "",
    getUpdatedAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 30000);

  return true;
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getTicketDetailFromStoreAction({
  ticketId = "",
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) return null;

  try {
    const detail = getIncidenciaByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeTicketDetail(picked);
  } catch {
    return null;
  }
}

export async function getTicketDetailAction({
  ticketId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver la incidencia.", "error");
    }

    return null;
  }

  const fallbackStoreDetail = getTicketDetailFromStoreAction({
    ticketId: id,
  });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("incidencias:detail:request", {
      ticketId: id,
      source: "backend",
    });

    let response = null;

    try {
      response = await getIncidenciaByIdRequest(id);
    } catch {
      response = await requestFirstJsonCandidate(buildDetailCandidates(id), {
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    }

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("incidencias:detail:fallback", {
          ticketId: id,
          source: "store",
        });

        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_TICKET_DETAIL");
    }

    const normalized = normalizeTicketDetail(detail);

    safeEmit("incidencias:detail:success", {
      ticketId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("incidencias:detail:fallback", {
        ticketId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("incidencias:detail:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo cargar el detalle de la incidencia.", "error");
    }

    return null;
  }
}

export async function openTicketAction({
  ticketId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) {
      showToast("Incidencia inválida.", "error");
    }

    return null;
  }

  safeEmit("incidencias:open", {
    ticketId: id,
  });

  const detail = await getTicketDetailAction({
    ticketId: id,
    preferFresh,
    silent,
  });

  if (!detail) return null;

  safeEmit("incidencias:open:success", {
    ticketId: id,
    detail,
  });

  return detail;
}

export async function refreshTicketDetailAction({
  ticketId = "",
  silent = true,
} = {}) {
  const id = normalizeTicketId(ticketId);

  const detail = await getTicketDetailAction({
    ticketId: id,
    preferFresh: true,
    silent,
  });

  if (detail) {
    safeEmit("incidencias:modal:update", {
      detail,
      ticketId: id,
    });
  }

  return detail;
}

/* =========================================================
   COMMENT / REOPEN
========================================================= */

function canReopenStatus(value = "") {
  const key = normalizeLower(value);

  return [
    "resolved",
    "resuelta",
    "resuelto",
    "closed",
    "cerrada",
    "cerrado",
  ].includes(key);
}

export async function commentTicketAction({
  ticketId = "",
  message = "",
  detail = null,
  status = "open",
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const normalizedMessage = normalizeCommentMessage(message);

  if (!id) {
    if (!silent) {
      showToast("No se pudo identificar la incidencia.", "error");
    }

    return null;
  }

  if (!normalizedMessage) {
    if (!silent) {
      showToast("Escribe un comentario antes de enviarlo.", "error");
    }

    return null;
  }

  const finalStatus = safeText(status, "open") || "open";

  const payload = {
    message: normalizedMessage,
    comment: normalizedMessage,
    body: normalizedMessage,
    text: normalizedMessage,
    status: finalStatus,
    estado: finalStatus,
  };

  safeEmit("incidencias:comment:start", {
    ticketId: id,
    message: normalizedMessage,
  });

  try {
    const response = await requestFirstJsonCandidate(
      buildCommentCandidates(id, payload),
      {
        timeoutMs: REQUEST_TIMEOUT_MS,
      }
    );

    let picked = pickDetail(response);

    if (!picked) {
      const fresh = await getTicketDetailAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      picked = fresh;
    }

    if (!picked) {
      throw new Error("COMMENT_RESPONSE_EMPTY");
    }

    const normalized = normalizeTicketDetail(picked);

    safeEmit("incidencias:comment:success", {
      ticketId: id,
      message: normalizedMessage,
      detail: normalized,
      source: "backend",
    });

    if (!silent) {
      showToast("Actualización añadida.", "success");
    }

    return normalized;
  } catch (error) {
    safeEmit("incidencias:comment:error", {
      ticketId: id,
      message: normalizedMessage,
      error,
    });

    if (!silent) {
      showToast("No se pudo añadir la actualización.", "error");
    }

    return null;
  }
}

export async function reopenTicketAction({
  ticketId = "",
  detail = null,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo identificar la incidencia.", "error");
    }

    return null;
  }

  const current =
    normalizeTicketDetail(
      detail ||
        getTicketDetailFromStoreAction({
          ticketId: id,
        }) ||
        {
          ticketId: id,
        }
    );

  if (!canReopenStatus(current.status)) {
    return current;
  }

  const payload = {
    status: "open",
    estado: "open",
  };

  safeEmit("incidencias:reopen:start", {
    ticketId: id,
  });

  try {
    const response = await requestFirstJsonCandidate(
      buildReopenCandidates(id, payload),
      {
        timeoutMs: REQUEST_TIMEOUT_MS,
      }
    );

    let picked = pickDetail(response);

    if (!picked) {
      const fresh = await getTicketDetailAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      picked = fresh;
    }

    if (!picked) {
      throw new Error("REOPEN_RESPONSE_EMPTY");
    }

    const normalized = normalizeTicketDetail(picked);

    safeEmit("incidencias:reopen:success", {
      ticketId: id,
      detail: normalized,
      source: "backend",
    });

    if (!silent) {
      showToast("Incidencia reabierta.", "success");
    }

    return normalized;
  } catch (error) {
    safeEmit("incidencias:reopen:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo reabrir la incidencia.", "error");
    }

    return null;
  }
}

/* =========================================================
   ATTACHMENTS UPLOAD
========================================================= */

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file) => {
    if (!(file instanceof File)) return;

    const key = [
      safeText(file.name, ""),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

function buildUploadFormData(files = []) {
  const formData = new FormData();

  dedupeFiles(files).forEach((file) => {
    formData.append("attachments", file, file.name);
  });

  return formData;
}

function buildUploadCandidates(ticketId = "", files = []) {
  const id = normalizeTicketId(ticketId);

  return TICKET_API_PREFIXES.flatMap((prefix) => [
    {
      method: "POST",
      path: `/${joinApiPath(prefix, encodeUrlPathSegment(id), "attachments")}`,
      bodyFactory: () => buildUploadFormData(files),
    },
    {
      method: "POST",
      path: `/${joinApiPath(prefix, encodeUrlPathSegment(id), "files")}`,
      bodyFactory: () => buildUploadFormData(files),
    },
  ]);
}

export async function uploadTicketAttachmentsAction({
  ticketId = "",
  files = [],
  detail = null,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const finalFiles = dedupeFiles(files);

  if (!id) {
    if (!silent) {
      showToast("No se pudo identificar la incidencia.", "error");
    }

    return null;
  }

  if (!finalFiles.length) {
    if (!silent) {
      showToast("Selecciona al menos un archivo.", "info");
    }

    return normalizeTicketDetail(
      detail ||
        getTicketDetailFromStoreAction({
          ticketId: id,
        }) ||
        {
          ticketId: id,
        }
    );
  }

  safeEmit("incidencias:upload:start", {
    ticketId: id,
    files: finalFiles,
    total: finalFiles.length,
  });

  try {
    const response = await requestFirstJsonCandidate(
      buildUploadCandidates(id, finalFiles),
      {
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }
    );

    let picked = pickDetail(response);

    if (!picked) {
      const fresh = await getTicketDetailAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      picked = fresh;
    }

    if (!picked) {
      throw new Error("UPLOAD_RESPONSE_EMPTY");
    }

    const normalized = normalizeTicketDetail(picked);

    safeEmit("incidencias:upload:success", {
      ticketId: id,
      files: finalFiles,
      detail: normalized,
      response,
    });

    if (!silent) {
      showToast("Archivos añadidos.", "success");
    }

    return normalized;
  } catch (error) {
    safeEmit("incidencias:upload:error", {
      ticketId: id,
      files: finalFiles,
      error,
    });

    if (!silent) {
      showToast(
        getErrorMessage(error, "No se pudieron subir los archivos."),
        "error"
      );
    }

    return null;
  }
}

/* =========================================================
   ATTACHMENTS OPEN / DOWNLOAD
========================================================= */

function getAttachmentId(attachment = {}) {
  const item = safeObject(attachment);

  return safeText(
    first(
      item.id,
      item.fileId,
      item.attachmentId,
      item.storageKey,
      item.path,
      item.blobName,
      item.key,
      item.raw?.id,
      item.raw?.fileId,
      item.raw?.attachmentId,
      item.raw?.storageKey,
      item.raw?.path,
      item.raw?.blobName,
      item.raw?.key
    ),
    ""
  );
}

function getAttachmentName(attachment = {}) {
  const item = safeObject(attachment);

  return safeText(
    first(
      item.name,
      item.filename,
      item.fileName,
      item.originalname,
      item.raw?.name,
      item.raw?.filename,
      item.raw?.fileName,
      item.raw?.originalname
    ),
    "archivo"
  );
}

function getDirectAttachmentUrl(attachment = {}, mode = "view") {
  const item = safeObject(attachment);
  const raw = safeObject(item.raw);

  if (mode === "download") {
    return safeText(
      first(
        item.downloadUrl,
        item.signedUrl,
        item.url,
        item.viewUrl,
        item.openUrl,
        item.blobUrl,
        item.publicUrl,
        raw.downloadUrl,
        raw.signedUrl,
        raw.url,
        raw.viewUrl,
        raw.openUrl,
        raw.blobUrl,
        raw.publicUrl
      ),
      ""
    );
  }

  return safeText(
    first(
      item.viewUrl,
      item.openUrl,
      item.signedUrl,
      item.url,
      item.downloadUrl,
      item.blobUrl,
      item.publicUrl,
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.downloadUrl,
      raw.blobUrl,
      raw.publicUrl
    ),
    ""
  );
}

function normalizeAttachmentFileResponse(payload = {}, fallback = {}) {
  const file = pickFilePayload(payload);
  const fallbackObj = safeObject(fallback);

  const url = safeText(
    first(
      file.url,
      file.viewUrl,
      file.openUrl,
      file.downloadUrl,
      file.signedUrl,
      file.blobUrl,
      file.publicUrl,
      fallbackObj.url,
      fallbackObj.viewUrl,
      fallbackObj.openUrl,
      fallbackObj.downloadUrl,
      fallbackObj.signedUrl,
      fallbackObj.blobUrl,
      fallbackObj.publicUrl
    ),
    ""
  );

  return {
    ...fallbackObj,
    ...file,
    url,
    viewUrl: safeText(first(file.viewUrl, file.openUrl, url), url),
    openUrl: safeText(first(file.openUrl, file.viewUrl, url), url),
    downloadUrl: safeText(first(file.downloadUrl, url), url),
    signedUrl: safeText(first(file.signedUrl, url), url),
    filename: safeText(
      first(
        file.filename,
        file.fileName,
        file.name,
        fallbackObj.filename,
        fallbackObj.fileName,
        fallbackObj.name
      ),
      getAttachmentName(fallbackObj)
    ),
    name: safeText(
      first(
        file.name,
        file.filename,
        file.fileName,
        fallbackObj.name,
        fallbackObj.filename,
        fallbackObj.fileName
      ),
      getAttachmentName(fallbackObj)
    ),
    contentType: safeText(
      first(
        file.contentType,
        file.mimeType,
        file.mimetype,
        fallbackObj.contentType,
        fallbackObj.mimeType,
        fallbackObj.mimetype
      ),
      ""
    ),
  };
}

export async function getTicketAttachmentFileAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  mode = "view",
  silent = true,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const finalAttachmentId = safeText(
    first(
      attachmentId,
      getAttachmentId(attachment)
    ),
    ""
  );

  const finalMode = mode === "download" ? "download" : "view";
  const directUrl = getDirectAttachmentUrl(attachment, finalMode);

  if (!id || !finalAttachmentId) {
    if (directUrl) {
      return normalizeAttachmentFileResponse(
        {
          url: directUrl,
        },
        attachment
      );
    }

    if (!silent) {
      showToast("No se pudo identificar el adjunto.", "error");
    }

    return null;
  }

  try {
    const response = await requestFirstJsonCandidate(
      buildAttachmentCandidates({
        ticketId: id,
        attachmentId: finalAttachmentId,
        mode: finalMode,
      }),
      {
        timeoutMs: REQUEST_TIMEOUT_MS,
      }
    );

    const file = normalizeAttachmentFileResponse(response, attachment);

    if (!file.url) {
      throw new Error("ATTACHMENT_URL_EMPTY");
    }

    safeEmit("incidencias:attachment:file", {
      ticketId: id,
      attachmentId: finalAttachmentId,
      mode: finalMode,
      file,
    });

    return file;
  } catch (error) {
    if (directUrl) {
      return normalizeAttachmentFileResponse(
        {
          url: directUrl,
        },
        attachment
      );
    }

    safeEmit("incidencias:attachment:file:error", {
      ticketId: id,
      attachmentId: finalAttachmentId,
      mode: finalMode,
      error,
    });

    if (!silent) {
      showToast("No se pudo resolver el adjunto.", "error");
    }

    return null;
  }
}

export async function openTicketAttachmentAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  detail = null,
  mode = "view",
  silent = true,
} = {}) {
  const file = await getTicketAttachmentFileAction({
    ticketId,
    attachment,
    attachmentId,
    mode: "view",
    silent,
  });

  if (!file?.url) {
    return null;
  }

  safeEmit("incidencias:attachment:open", {
    ticketId: normalizeTicketId(ticketId),
    attachment,
    detail,
    file,
    mode,
  });

  return file;
}

export async function downloadTicketAttachmentAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  detail = null,
  mode = "download",
  silent = true,
} = {}) {
  const file = await getTicketAttachmentFileAction({
    ticketId,
    attachment,
    attachmentId,
    mode: "download",
    silent,
  });

  if (!file?.url) {
    return null;
  }

  safeEmit("incidencias:attachment:download", {
    ticketId: normalizeTicketId(ticketId),
    attachment,
    detail,
    file,
    mode,
  });

  return file;
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyTicketIdAction({
  ticketId = "",
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) {
      showToast("No hay referencia para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar la referencia.", "error");
    }

    return false;
  }

  safeEmit("incidencias:copy-id", {
    ticketId: id,
  });

  if (!silent) {
    showToast("Referencia copiada", "success");
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportIncidenciasCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedIncidenciasStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay incidencias para exportar.", "info");
    }

    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("incidencias:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) {
      showToast("Historial exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("incidencias:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el historial.", "error");
    }

    return false;
  }
}

/* =========================================================
   CREATE
========================================================= */

function openCreateModalBridge(payload = {}) {
  const modal =
    window?.OnionIncidenciasCreateModal ||
    window?.OnionIncidencias?.createModal ||
    null;

  if (typeof modal?.open === "function") {
    modal.open(payload);
    return true;
  }

  if (typeof window?.renderIncidenciasCreateModal === "function") {
    window.renderIncidenciasCreateModal(payload);
    return true;
  }

  return false;
}

export async function createIncidenciaAction({
  route = "/incidencias/nueva",
  fallbackEvent = "incidencias:create",
  silent = false,
  draft = {},
} = {}) {
  const targetRoute = safeText(route, "/incidencias/nueva");

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
      draft,
    });

    const opened = openCreateModalBridge(draft);

    if (opened) {
      safeEmit("incidencias:create:opened", {
        mode: "modal",
      });

      return true;
    }

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    safeEmit("incidencias:create:error", {
      error,
    });

    if (!silent) {
      showToast("No se pudo abrir el formulario de nueva incidencia.", "error");
    }

    return false;
  }
}

/* =========================================================
   MODAL ACTION BRIDGE EXPORT
========================================================= */

export const OnionIncidenciasActions = {
  getTicketDetail: getTicketDetailAction,
  openTicket: openTicketAction,
  refreshTicketDetail: refreshTicketDetailAction,

  uploadTicketAttachments: uploadTicketAttachmentsAction,

  commentTicket: commentTicketAction,
  reopenTicket: reopenTicketAction,

  getTicketAttachmentFile: getTicketAttachmentFileAction,
  openTicketAttachment: openTicketAttachmentAction,
  downloadTicketAttachment: downloadTicketAttachmentAction,

  copyTicketId: copyTicketIdAction,
  exportCsv: exportIncidenciasCsvAction,
  createIncidencia: createIncidenciaAction,
};

try {
  window.OnionIncidenciasActions = {
    ...(window.OnionIncidenciasActions || {}),
    ...OnionIncidenciasActions,
  };
} catch {}

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getId as getIncidenciaIdAction,
  getTitle as getIncidenciaTitleAction,
  getDescription as getIncidenciaDescriptionAction,
  getClient as getIncidenciaClientAction,
  getEmail as getIncidenciaEmailAction,
  getAssigned as getIncidenciaAssignedAction,
  getStatus as getIncidenciaStatusAction,
  getPriority as getIncidenciaPriorityAction,
  getCreatedAt as getIncidenciaCreatedAtAction,
  getUpdatedAt as getIncidenciaUpdatedAtAction,
  getAttachments as getIncidenciaAttachmentsAction,
  getHistory as getIncidenciaHistoryAction,
  getComments as getIncidenciaCommentsAction,
  getCategory as getIncidenciaCategoryAction,
  getSource as getIncidenciaSourceAction,
  getTags as getIncidenciaTagsAction,
  normalizeTicketDetail as normalizeIncidenciaDetailAction,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasActions;

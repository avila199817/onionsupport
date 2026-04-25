/* =========================================================
   Onion SPA - Incidencias Modal
   Archivo: src/views/incidencias/incidencias.modal.js

   CLIENT EXPERIENCE PRO · DETAIL MODAL · 10/10
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeIncidenciaModel,
  getStatusLabel,
  getPriorityLabel,
  getAvatarTheme,
  getInitials,
} from "./incidencias.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-detail-modal-root";
const PANEL_ID = "incidencias-detail-modal-panel";

const REQUEST_TIMEOUT_MS = 90000;
const ATTACHMENT_TIMEOUT_MS = 90000;

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isSubmitting: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
  commentDraft: "",
  feedbackMessage: "",
  feedbackType: "info",
  pendingFiles: [],
  openingAttachmentId: "",
  downloadingAttachmentId: "",
};

/* =========================================================
   HELPERS CORE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeOff(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function showToast(message = "", type = "info") {
  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
  } catch {}
}

function setFeedback(message = "", type = "info") {
  modalState.feedbackMessage = safeText(message, "");
  modalState.feedbackType = safeText(type, "info");
}

function clearFeedback() {
  modalState.feedbackMessage = "";
  modalState.feedbackType = "info";
}

function clearAttachmentBusyState() {
  modalState.openingAttachmentId = "";
  modalState.downloadingAttachmentId = "";
}

function formatBytes(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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

/* =========================================================
   URL / API HELPERS
========================================================= */

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function buildUrl(base = "", path = "") {
  const cleanBase = safeText(base, "").replace(/\/+$/, "");
  const cleanPath = safeText(path, "").replace(/^\/+/, "");

  if (!cleanBase || !cleanPath) return "";
  return `${cleanBase}/${cleanPath}`;
}

function joinApiPath(...parts) {
  return parts
    .map((part) => safeText(part, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase
    ),
    ""
  ).replace(/\/+$/, "");
}

function resolveApiUrl(path = "") {
  const value = safeText(path, "");

  if (!value) return "";
  if (isAbsoluteUrl(value)) return value;

  const apiBase = getApiBase();

  if (!apiBase) {
    return value.startsWith("/") ? value : `/${value}`;
  }

  return `${apiBase}${value.startsWith("/") ? value : `/${value}`}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : "",
      typeof localStorage !== "undefined"
        ? localStorage.getItem("accessToken")
        : "",
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("token")
        : "",
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("accessToken")
        : ""
    ),
    ""
  );
}

function isAzureBlobUrl(value = "") {
  try {
    const url = new URL(value);
    return /\.blob\.core\.windows\.net$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function getApiOrigin() {
  const apiBase = getApiBase();

  if (!apiBase) {
    return window.location.origin;
  }

  try {
    return new URL(apiBase, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function looksLikeProtectedApiUrl(value = "") {
  const text = safeText(value, "");
  if (!text) return false;

  if (isAzureBlobUrl(text)) {
    return false;
  }

  try {
    const url = new URL(text, window.location.origin);
    const pathname = safeText(url.pathname, "").toLowerCase();
    const apiOrigin = getApiOrigin();

    const sameAppOrigin = url.origin === window.location.origin;
    const sameApiOrigin = url.origin === apiOrigin;

    return (
      (sameAppOrigin || sameApiOrigin) &&
      (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/tickets/") ||
        pathname.startsWith("/incidencias/")
      )
    );
  } catch {
    return text.startsWith("/api/");
  }
}

function createTimeoutSignal(timeoutMs = REQUEST_TIMEOUT_MS) {
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

function getFilenameFromContentDisposition(value = "", fallback = "archivo") {
  const text = safeText(value, "");
  if (!text) return fallback;

  const utf8Match = text.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ""));
    } catch {}
  }

  const plainMatch = text.match(/filename\s*=\s*("?)([^";]+)\1/i);

  if (plainMatch?.[2]) {
    return safeText(plainMatch[2], fallback);
  }

  return fallback;
}

function safeErrorMessage(
  error = null,
  fallback = "No se pudo completar la acción."
) {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      fallback
    ),
    fallback
  );
}

/* =========================================================
   FETCH HELPERS
========================================================= */

async function readResponsePayload(response, fallbackFilename = "archivo") {
  const contentType = safeText(response.headers.get("content-type"), "");

  if (contentType.includes("application/json")) {
    return {
      kind: "json",
      payload: await response.json(),
      contentType,
      filename: getFilenameFromContentDisposition(
        response.headers.get("content-disposition"),
        fallbackFilename
      ),
    };
  }

  if (
    contentType.includes("application/pdf") ||
    contentType.includes("image/") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/zip") ||
    contentType.includes("text/plain")
  ) {
    const blob = await response.blob();

    return {
      kind: "blob",
      blob,
      contentType: contentType || blob?.type || "",
      filename: getFilenameFromContentDisposition(
        response.headers.get("content-disposition"),
        fallbackFilename
      ),
      responseUrl: safeText(response.url, ""),
    };
  }

  const text = await response.text();

  try {
    return {
      kind: "json",
      payload: text ? JSON.parse(text) : null,
      contentType,
      filename: fallbackFilename,
    };
  } catch {
    return {
      kind: "text",
      text,
      contentType,
      filename: fallbackFilename,
    };
  }
}

async function requestJson(path = "", options = {}) {
  const finalUrl = resolveApiUrl(path);
  const token = getAuthToken();

  if (!finalUrl) {
    throw new Error("API_URL_REQUIRED");
  }

  const method = safeText(options?.method, "GET").toUpperCase();
  const body = options?.body ?? null;
  const isFormData = body instanceof FormData;

  const timeout = createTimeoutSignal(
    safeNumber(options?.timeoutMs, REQUEST_TIMEOUT_MS)
  );

  const headers = {
    ...(safeObject(options?.headers)),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (body !== null && body !== undefined && !isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  try {
    const response = await fetch(finalUrl, {
      method,
      headers,
      credentials: "include",
      signal: timeout.signal,
      ...(body !== null && body !== undefined
        ? {
            body: isFormData
              ? body
              : typeof body === "string" ||
                  body instanceof Blob ||
                  body instanceof ArrayBuffer
                ? body
                : JSON.stringify(body),
          }
        : {}),
    });

    const parsed = await readResponsePayload(response);

    if (!response.ok) {
      const message = safeText(
        first(
          parsed?.payload?.message,
          parsed?.payload?.error,
          parsed?.text,
          `HTTP ${response.status}`
        ),
        `HTTP ${response.status}`
      );

      const error = new Error(message);
      error.status = response.status;
      error.response = parsed?.payload || parsed?.text || null;
      throw error;
    }

    if (parsed.kind === "json") {
      return parsed.payload;
    }

    return {
      ok: true,
      raw: parsed.text || "",
    };
  } finally {
    timeout.clear();
  }
}

async function fetchAttachmentResource(url = "", fallbackFilename = "archivo") {
  const finalUrl = resolveApiUrl(url);
  const protectedApiUrl = looksLikeProtectedApiUrl(finalUrl);
  const token = protectedApiUrl ? getAuthToken() : "";

  if (!finalUrl) {
    throw new Error("No hay URL para obtener el adjunto.");
  }

  const timeout = createTimeoutSignal(ATTACHMENT_TIMEOUT_MS);

  try {
    const response = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Accept: "*/*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(protectedApiUrl ? { credentials: "include" } : {}),
      signal: timeout.signal,
    });

    const parsed = await readResponsePayload(response, fallbackFilename);

    if (!response.ok) {
      const message = safeText(
        first(
          parsed?.payload?.message,
          parsed?.payload?.error,
          parsed?.text,
          `HTTP ${response.status} al obtener el adjunto.`
        ),
        `HTTP ${response.status} al obtener el adjunto.`
      );

      const error = new Error(message);
      error.status = response.status;
      error.response = parsed?.payload || parsed?.text || null;
      throw error;
    }

    return parsed;
  } finally {
    timeout.clear();
  }
}

/* =========================================================
   BLOB OPEN / DOWNLOAD
========================================================= */

function downloadBlob(blob, filename = "archivo") {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeText(filename, "archivo");
    anchor.rel = "noopener";
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 60000);
  }
}

function openBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  const newWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");

  if (!newWindow) {
    throw new Error("El navegador bloqueó la apertura del archivo.");
  }

  setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {}
  }, 60000);

  return true;
}

function openUrlDirect(url = "") {
  const finalUrl = safeText(url, "");

  if (!finalUrl) {
    throw new Error("No hay URL disponible para abrir el archivo.");
  }

  const newWindow = window.open(finalUrl, "_blank", "noopener,noreferrer");

  if (!newWindow) {
    throw new Error("El navegador bloqueó la apertura del archivo.");
  }

  return true;
}

function downloadUrlDirect(url = "", filename = "archivo") {
  const finalUrl = safeText(url, "");

  if (!finalUrl) {
    throw new Error("No hay URL disponible para descargar el archivo.");
  }

  const anchor = document.createElement("a");
  anchor.href = finalUrl;
  anchor.download = safeText(filename, "archivo");
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  return true;
}

function extractFileUrlFromPayload(payload = {}, mode = "open") {
  const obj = safeObject(payload);
  const file = safeObject(obj.file);
  const data = safeObject(obj.data);

  if (mode === "download") {
    return safeText(
      first(
        file.downloadUrl,
        file.url,
        file.signedUrl,
        data.downloadUrl,
        data.url,
        data.signedUrl,
        obj.downloadUrl,
        obj.url,
        obj.signedUrl
      ),
      ""
    );
  }

  return safeText(
    first(
      file.viewUrl,
      file.openUrl,
      file.url,
      file.signedUrl,
      data.viewUrl,
      data.openUrl,
      data.url,
      data.signedUrl,
      obj.viewUrl,
      obj.openUrl,
      obj.url,
      obj.signedUrl
    ),
    ""
  );
}

function extractFilenameFromPayload(payload = {}, fallback = "archivo") {
  const obj = safeObject(payload);
  const file = safeObject(obj.file);
  const data = safeObject(obj.data);

  return safeText(
    first(
      file.filename,
      file.name,
      data.filename,
      data.name,
      obj.filename,
      obj.name
    ),
    fallback
  );
}

async function openOrDownloadPayload(payload, attachment = {}, mode = "open") {
  const fallbackFilename = safeText(
    first(attachment?.filename, attachment?.name),
    "archivo"
  );

  if (payload?.blob instanceof Blob) {
    if (mode === "download") {
      downloadBlob(payload.blob, payload.filename || fallbackFilename);
    } else {
      openBlob(payload.blob);
    }

    return true;
  }

  if (payload?.kind === "blob" && payload?.blob instanceof Blob) {
    if (mode === "download") {
      downloadBlob(payload.blob, payload.filename || fallbackFilename);
    } else {
      openBlob(payload.blob);
    }

    return true;
  }

  if (payload?.kind === "json") {
    const url = extractFileUrlFromPayload(payload.payload, mode);
    const filename = extractFilenameFromPayload(payload.payload, fallbackFilename);

    if (url) {
      if (mode === "download") {
        downloadUrlDirect(url, filename);
      } else {
        openUrlDirect(url);
      }

      return true;
    }
  }

  const obj = safeObject(payload);
  const directUrl = extractFileUrlFromPayload(obj, mode);
  const filename = extractFilenameFromPayload(obj, fallbackFilename);

  if (directUrl) {
    if (mode === "download") {
      downloadUrlDirect(directUrl, filename);
    } else {
      openUrlDirect(directUrl);
    }

    return true;
  }

  return false;
}

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function getDetail(detail = {}) {
  return normalizeIncidenciaModel(safeObject(detail));
}

function pickDetailPayload(response = null) {
  const obj = safeObject(response);

  return (
    obj.detail ||
    obj.ticket ||
    obj.item ||
    obj.data ||
    obj.result ||
    obj.payload ||
    obj.incidencia ||
    obj
  );
}

function coerceDetailResponse(response = null, fallback = {}) {
  const payload = safeObject(pickDetailPayload(response));

  if (!Object.keys(payload).length) {
    return getDetail(fallback);
  }

  return getDetail({
    ...safeObject(fallback),
    ...payload,
    raw: {
      ...safeObject(fallback?.raw || fallback),
      ...safeObject(payload?.raw || payload),
    },
  });
}

function getTicketId(detail = {}) {
  return safeText(
    first(
      detail.ticketId,
      detail.id,
      detail.code,
      detail.ticketCode,
      detail?.raw?.ticketId,
      detail?.raw?.id,
      detail?.raw?.code,
      detail?.raw?.ticketCode
    ),
    "—"
  );
}

function getClientAvatar(detail = {}) {
  return safeText(
    first(
      detail.clientAvatar,
      detail.avatar,
      detail.avatarUrl,
      detail?.cliente?.avatar,
      detail?.cliente?.avatarUrl,
      detail?.client?.avatar,
      detail?.client?.avatarUrl,
      detail?.raw?.clientAvatar,
      detail?.raw?.avatar,
      detail?.raw?.avatarUrl,
      detail?.raw?.client?.avatar,
      detail?.raw?.client?.avatarUrl,
      detail?.raw?.cliente?.avatar,
      detail?.raw?.cliente?.avatarUrl
    ),
    ""
  );
}

function getClientName(detail = {}) {
  return safeText(
    first(
      detail.clientName,
      detail.name,
      detail?.cliente?.nombre,
      detail?.cliente?.name,
      detail?.client?.name,
      detail?.receptor?.name,
      detail?.createdBy?.name,
      detail?.raw?.clientName,
      detail?.raw?.name,
      detail?.raw?.cliente?.nombre,
      detail?.raw?.cliente?.name,
      detail?.raw?.client?.name,
      detail?.raw?.receptor?.name,
      detail?.raw?.createdBy?.name
    ),
    "Cliente"
  );
}

function getDisplayDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.message,
      detail.preview,
      detail?.raw?.description,
      detail?.raw?.descripcion,
      detail?.raw?.message,
      detail?.raw?.preview
    ),
    "Sin descripción."
  );
}

function getTecnico(detail = {}) {
  return safeText(
    first(
      detail.tecnico?.name,
      detail.assignedToName,
      detail?.raw?.tecnico?.name,
      detail?.raw?.assignedTo?.name,
      detail?.raw?.assignedToName
    ),
    "No asignado"
  );
}

function getFacturaRelacionada(detail = {}) {
  return safeText(
    first(
      detail.invoiceId,
      detail.facturaId,
      detail.factura,
      detail.invoiceCode,
      detail?.raw?.invoiceId,
      detail?.raw?.facturaId,
      detail?.raw?.factura,
      detail?.raw?.invoiceCode,
      detail?.raw?.facturaRelacionada,
      detail?.raw?.invoice?.id,
      detail?.raw?.factura?.id,
      detail?.raw?.invoice?.code,
      detail?.raw?.factura?.code
    ),
    "No vinculada"
  );
}

/* =========================================================
   ATTACHMENTS / URL RESOLVE
========================================================= */

function pickAttachmentUrlByMode(item = {}, mode = "open") {
  const file = safeObject(item);
  const raw = safeObject(file.raw);

  if (mode === "download") {
    return safeText(
      first(
        file.downloadUrl,
        file.signedUrl,
        file.url,
        file.blobUrl,
        file.publicUrl,
        file.viewUrl,
        file.openUrl,

        raw.downloadUrl,
        raw.signedUrl,
        raw.url,
        raw.blobUrl,
        raw.publicUrl,
        raw.viewUrl,
        raw.openUrl,

        file?.links?.download,
        raw?.links?.download,
        file?.links?.view,
        raw?.links?.view
      ),
      ""
    );
  }

  return safeText(
    first(
      file.viewUrl,
      file.openUrl,
      file.signedUrl,
      file.url,
      file.blobUrl,
      file.publicUrl,
      file.downloadUrl,

      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.downloadUrl,

      file?.links?.view,
      raw?.links?.view,
      file?.links?.download,
      raw?.links?.download
    ),
    ""
  );
}

function resolveAttachmentUrl(item = {}, detail = {}, mode = "open") {
  const file = safeObject(item);
  const raw = safeObject(detail?.raw);

  const directUrl = pickAttachmentUrlByMode(file, mode);

  if (isAbsoluteUrl(directUrl)) {
    return directUrl;
  }

  const apiBase = getApiBase();
  const ticketId = getTicketId(detail);

  const candidatePath = safeText(
    first(
      file.path,
      file.storageKey,
      file.storagePath,
      file.blobPath,
      file.blobName,
      file.key,
      file.filename,
      file.fileName,
      file.name,
      file?.raw?.path,
      file?.raw?.storageKey,
      file?.raw?.storagePath,
      file?.raw?.blobPath,
      file?.raw?.blobName,
      file?.raw?.key
    ),
    ""
  );

  if (isAbsoluteUrl(candidatePath)) {
    return candidatePath;
  }

  const blobBaseUrl = safeText(
    first(
      raw.blobBaseUrl,
      raw.attachmentsBlobBaseUrl,
      raw.filesBlobBaseUrl,
      raw.storageBaseUrl,
      raw.cdnBaseUrl,
      raw.attachmentsBaseUrl
    ),
    ""
  );

  if (blobBaseUrl && candidatePath) {
    return buildUrl(blobBaseUrl, candidatePath);
  }

  if (apiBase) {
    const attachmentId = safeText(
      first(
        file.id,
        file.fileId,
        file.attachmentId,
        file.storageKey,
        file.path
      ),
      ""
    );

    const encodedTicketId = encodeUrlPathSegment(ticketId);
    const encodedAttachmentId = encodeUrlPathSegment(attachmentId);

    const routeCandidates = [
      joinApiPath(
        "api",
        "tickets",
        encodedTicketId,
        "attachments",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
      joinApiPath(
        "api",
        "incidencias",
        encodedTicketId,
        "attachments",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
    ].filter(Boolean);

    if (routeCandidates.length) {
      return buildUrl(apiBase, routeCandidates[0]);
    }
  }

  return "";
}

function getAttachments(detail = {}) {
  const attachments = first(
    detail.attachments,
    detail?.raw?.attachments,
    detail?.raw?.files,
    detail?.raw?.adjuntos
  );

  return safeArray(attachments).map((file, index) => {
    const item = safeObject(file);
    const raw = safeObject(item.raw);

    const name = safeText(
      first(
        item.name,
        item.filename,
        item.fileName,
        item.title,
        raw.name,
        raw.filename,
        raw.fileName,
        raw.title
      ),
      `archivo_${index + 1}`
    );

    const attachment = {
      id: safeText(
        first(
          item.id,
          item.fileId,
          item.attachmentId,
          item.blobName,
          item.storageKey,
          item.path,
          item.key,
          raw.id,
          raw.fileId,
          raw.attachmentId,
          raw.blobName,
          raw.storageKey,
          raw.path,
          raw.key
        ),
        `attachment-${index + 1}`
      ),

      name,

      filename: safeText(
        first(
          item.filename,
          item.fileName,
          item.name,
          raw.filename,
          raw.fileName,
          raw.name
        ),
        name
      ),

      url: "",
      viewUrl: "",
      openUrl: "",
      downloadUrl: "",
      signedUrl: "",
      blobUrl: "",
      publicUrl: "",

      path: safeText(
        first(
          item.path,
          item.storageKey,
          item.storagePath,
          item.blobPath,
          item.blobName,
          item.key,
          raw.path,
          raw.storageKey,
          raw.storagePath,
          raw.blobPath,
          raw.blobName,
          raw.key
        ),
        ""
      ),

      size: safeNumber(first(item.size, raw.size), 0),

      type: safeText(
        first(
          item.type,
          item.contentType,
          item.mimetype,
          item.mimeType,
          item.mime,
          raw.type,
          raw.contentType,
          raw.mimetype,
          raw.mimeType,
          raw.mime
        ),
        ""
      ),

      contentType: safeText(
        first(
          item.contentType,
          item.mimetype,
          item.mimeType,
          item.mime,
          raw.contentType,
          raw.mimetype,
          raw.mimeType,
          raw.mime
        ),
        ""
      ),

      uploadedAt: first(
        item.uploadedAt,
        item.createdAt,
        item.date,
        raw.uploadedAt,
        raw.createdAt,
        raw.date,
        null
      ),

      raw: {
        ...raw,
        ...item,
      },
    };

    attachment.viewUrl = resolveAttachmentUrl(item, detail, "open");
    attachment.openUrl = attachment.viewUrl;
    attachment.downloadUrl = resolveAttachmentUrl(item, detail, "download");

    attachment.signedUrl = safeText(
      first(item.signedUrl, raw.signedUrl, attachment.viewUrl),
      ""
    );

    attachment.blobUrl = safeText(first(item.blobUrl, raw.blobUrl), "");
    attachment.publicUrl = safeText(first(item.publicUrl, raw.publicUrl), "");

    attachment.url = safeText(
      first(
        attachment.viewUrl,
        attachment.signedUrl,
        attachment.downloadUrl,
        attachment.blobUrl,
        attachment.publicUrl
      ),
      ""
    );

    return attachment;
  });
}

function buildAttachmentCandidates(detail = {}, attachment = {}, mode = "open") {
  const file = safeObject(attachment);
  const raw = safeObject(file.raw);
  const rawDetail = safeObject(detail?.raw);

  const apiBase = getApiBase();
  const ticketId = safeText(getTicketId(detail), "");

  const attachmentId = safeText(
    first(
      file.id,
      raw.id,
      raw.attachmentId,
      raw.fileId,
      raw.storageKey,
      raw.path
    ),
    ""
  );

  const path = safeText(
    first(
      file.path,
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
    first(file.name, raw.name, raw.filename, raw.fileName),
    "archivo"
  );

  const blobBaseUrl = safeText(
    first(
      rawDetail.blobBaseUrl,
      rawDetail.attachmentsBlobBaseUrl,
      rawDetail.filesBlobBaseUrl,
      rawDetail.storageBaseUrl,
      rawDetail.cdnBaseUrl,
      rawDetail.attachmentsBaseUrl
    ),
    ""
  );

  const direct =
    mode === "download"
      ? [
          file.downloadUrl,
          file.signedUrl,
          file.url,
          file.viewUrl,
          file.openUrl,
          file.blobUrl,
          file.publicUrl,

          raw.downloadUrl,
          raw.signedUrl,
          raw.url,
          raw.viewUrl,
          raw.openUrl,
          raw.blobUrl,
          raw.publicUrl,
          raw.href,
          raw.previewUrl,

          raw?.links?.download,
          raw?.links?.view,
        ]
      : [
          file.viewUrl,
          file.openUrl,
          file.signedUrl,
          file.url,
          file.blobUrl,
          file.publicUrl,
          file.downloadUrl,

          raw.viewUrl,
          raw.openUrl,
          raw.signedUrl,
          raw.url,
          raw.blobUrl,
          raw.publicUrl,
          raw.downloadUrl,
          raw.href,
          raw.previewUrl,

          raw?.links?.view,
          raw?.links?.download,
        ];

  const absoluteCandidates = [];
  const relativeCandidates = [];

  direct
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .forEach((candidate) => {
      if (isAbsoluteUrl(candidate)) {
        absoluteCandidates.push(candidate);
      } else {
        relativeCandidates.push(candidate);
      }
    });

  if (blobBaseUrl && path) {
    absoluteCandidates.push(buildUrl(blobBaseUrl, path));
  }

  if (apiBase && ticketId) {
    const encodedTicketId = encodeUrlPathSegment(ticketId);
    const encodedAttachmentId = encodeUrlPathSegment(attachmentId);
    const encodedName = encodeUrlPathSegment(name);

    const routes = [
      joinApiPath(
        "api",
        "tickets",
        encodedTicketId,
        "attachments",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
      joinApiPath(
        "api",
        "tickets",
        encodedTicketId,
        "files",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
      joinApiPath(
        "api",
        "incidencias",
        encodedTicketId,
        "attachments",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
      joinApiPath(
        "api",
        "incidencias",
        encodedTicketId,
        "files",
        encodedAttachmentId,
        mode === "download" ? "download" : "view"
      ),
      joinApiPath(
        "api",
        "tickets",
        encodedTicketId,
        "attachments",
        encodedName,
        mode === "download" ? "download" : "view"
      ),
      ...relativeCandidates.map((candidate) => joinApiPath("api", candidate)),
      ...relativeCandidates,
    ].filter(Boolean);

    routes.forEach((route) => {
      const built = buildUrl(apiBase, route);
      if (built) {
        absoluteCandidates.push(built);
      }
    });
  }

  const unique = [];
  const seen = new Set();

  absoluteCandidates
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .forEach((candidate) => {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        unique.push(candidate);
      }
    });

  return unique;
}

/* =========================================================
   INTERNAL API ACTIONS
========================================================= */

async function uploadTicketAttachmentsInternal({
  ticketId = "",
  files = [],
} = {}) {
  const id = safeText(ticketId, "");
  const list = dedupeFiles(files);

  if (!id || !list.length) {
    throw new Error("Faltan ticketId o archivos para subir.");
  }

  const formData = new FormData();

  list.forEach((file) => {
    if (file instanceof File) {
      formData.append("attachments", file, file.name);
    }
  });

  const encodedTicketId = encodeUrlPathSegment(id);

  const candidates = [
    `/api/tickets/${encodedTicketId}/attachments`,
    `/api/incidencias/${encodedTicketId}/attachments`,
    `/api/tickets/${encodedTicketId}/files`,
    `/api/incidencias/${encodedTicketId}/files`,
  ];

  let lastError = null;

  for (const path of candidates) {
    try {
      return await requestJson(path, {
        method: "POST",
        body: formData,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudieron subir los adjuntos.");
}

async function commentTicketInternal({ ticketId = "", message = "" } = {}) {
  const id = safeText(ticketId, "");
  const text = normalizeWhitespace(message);

  if (!id || !text) {
    throw new Error("Faltan datos para comentar la incidencia.");
  }

  const encodedTicketId = encodeUrlPathSegment(id);

  const payload = {
    message: text,
    comment: text,
    body: text,
    text,
    status: "open",
    estado: "open",
  };

  const candidates = [
    {
      method: "POST",
      path: `/api/tickets/${encodedTicketId}/comments`,
    },
    {
      method: "POST",
      path: `/api/incidencias/${encodedTicketId}/comments`,
    },
    {
      method: "POST",
      path: `/api/tickets/${encodedTicketId}/messages`,
    },
    {
      method: "POST",
      path: `/api/incidencias/${encodedTicketId}/messages`,
    },
    {
      method: "PATCH",
      path: `/api/tickets/${encodedTicketId}`,
    },
    {
      method: "PATCH",
      path: `/api/incidencias/${encodedTicketId}`,
    },
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await requestJson(candidate.path, {
        method: candidate.method,
        body: payload,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo añadir la actualización.");
}

async function reopenTicketInternal(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    throw new Error("No se pudo identificar la incidencia.");
  }

  const encodedTicketId = encodeUrlPathSegment(id);

  const payload = {
    status: "open",
    estado: "open",
  };

  const candidates = [
    {
      method: "POST",
      path: `/api/tickets/${encodedTicketId}/reopen`,
    },
    {
      method: "POST",
      path: `/api/incidencias/${encodedTicketId}/reopen`,
    },
    {
      method: "PATCH",
      path: `/api/tickets/${encodedTicketId}`,
    },
    {
      method: "PATCH",
      path: `/api/incidencias/${encodedTicketId}`,
    },
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await requestJson(candidate.path, {
        method: candidate.method,
        body: payload,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo reabrir la incidencia.");
}

async function fetchTicketDetailInternal(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    throw new Error("No se pudo identificar la incidencia.");
  }

  const encodedTicketId = encodeUrlPathSegment(id);

  const candidates = [
    `/api/tickets/${encodedTicketId}`,
    `/api/incidencias/${encodedTicketId}`,
  ];

  let lastError = null;

  for (const path of candidates) {
    try {
      return await requestJson(path, {
        method: "GET",
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo cargar la incidencia.");
}

/* =========================================================
   EXTERNAL ACTION BRIDGE
========================================================= */

async function callExternalAction(action = "", payload = {}) {
  const actionName = safeText(action, "");
  if (!actionName) return null;

  const candidates = [
    AppCore?.modules?.IncidenciasModalActions?.[actionName],
    AppCore?.modules?.IncidenciasActions?.[actionName],
    AppCore?.modules?.Incidencias?.[actionName],
    window?.OnionIncidenciasModalActions?.[actionName],
    window?.OnionIncidenciasActions?.[actionName],
    window?.IncidenciasActions?.[actionName],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "function") continue;
    return await candidate(payload);
  }

  return null;
}

async function refreshCurrentDetail(ticketId = "", fallback = {}) {
  const id = safeText(ticketId, "");

  if (!id) {
    return getDetail(fallback);
  }

  try {
    const external =
      (await callExternalAction("getTicketDetail", {
        ticketId: id,
        detail: fallback,
      })) ||
      (await callExternalAction("openTicket", {
        ticketId: id,
        silent: true,
        detail: fallback,
      }));

    if (external && typeof external === "object") {
      return coerceDetailResponse(external, fallback);
    }
  } catch {}

  try {
    const internal = await fetchTicketDetailInternal(id);
    return coerceDetailResponse(internal, fallback);
  } catch {}

  return getDetail(fallback);
}

function mergeDetailWithOpenStatus(detail = {}, response = null) {
  const currentDetail = getDetail(detail);
  const responseDetail = coerceDetailResponse(response, currentDetail);

  return getDetail({
    ...currentDetail,
    ...responseDetail,
    status: "open",
    estado: "open",
    raw: {
      ...safeObject(currentDetail.raw),
      ...safeObject(responseDetail?.raw || responseDetail),
      status: "open",
      estado: "open",
    },
  });
}

/* =========================================================
   TIMELINE NORMALIZATION / CLEANUP
========================================================= */

function formatChange(change = {}) {
  const item = safeObject(change);
  const field = safeText(item.field, "").toLowerCase();
  const action = safeText(item.action, "").toLowerCase();

  if (field === "attachments") {
    const added = safeNumber(item.added, 0);
    const removed = safeNumber(item.removed, 0);

    if (action === "remove" || removed > 0) {
      return removed === 1
        ? "Se eliminó 1 adjunto."
        : `Se eliminaron ${removed} adjuntos.`;
    }

    if (added > 0) {
      return added === 1
        ? "Se añadió 1 adjunto."
        : `Se añadieron ${added} adjuntos.`;
    }

    return "Adjuntos actualizados.";
  }

  if (field === "status" || field === "estado") {
    return `Estado actualizado: ${safeText(item.from, "—")} → ${safeText(item.to, "—")}.`;
  }

  if (field === "priority" || field === "prioridad") {
    return `Prioridad actualizada: ${safeText(item.from, "—")} → ${safeText(item.to, "—")}.`;
  }

  if (field === "message" || field === "descripcion" || field === "description") {
    const from = normalizeWhitespace(item.from);
    const to = normalizeWhitespace(item.to);

    if (from && to && from === to) {
      return "";
    }

    return "Descripción actualizada.";
  }

  if (field === "categoria" || field === "category") {
    return `Categoría actualizada: ${safeText(item.from, "—")} → ${safeText(item.to, "—")}.`;
  }

  if (field) {
    return `${field} actualizado.`;
  }

  return "";
}

function normalizeTimelineEntries(detail = {}) {
  const history = safeArray(
    first(
      detail.history,
      detail?.raw?.history,
      detail?.raw?.timeline,
      detail?.raw?.events
    )
  );

  const comments = safeArray(
    first(
      detail.comments,
      detail?.raw?.comments,
      detail?.raw?.notes,
      detail?.raw?.messages
    )
  );

  const normalizedHistory = history
    .map((entry, index) => {
      const item = safeObject(entry);
      const type = safeText(first(item.type, item.action), "update");
      const changes = safeArray(item.changes);

      let title = safeText(
        first(item.title, item.action, item.type),
        "Actualización"
      );

      let body = safeText(
        first(item.description, item.detail, item.body, item.message, item.text),
        ""
      );

      if (type === "created") {
        title = "Incidencia creada";
        body = safeText(body, "La incidencia fue registrada.");
      }

      if (type === "update") {
        const changeLines = changes.map(formatChange).filter(Boolean);

        title = "Actualización";
        body = changeLines.join("\n");
      }

      return {
        id: safeText(first(item.id, item.eventId), `h-${index + 1}`),
        kind: "event",
        type,
        title,
        body,
        author: safeText(
          first(item.byName, item.user, item.author, item.name),
          "Sistema"
        ),
        createdAt: first(item.createdAt, item.date, item.timestamp),
      };
    })
    .filter((entry) => {
      const title = safeText(entry.title, "").toLowerCase();
      const body = safeText(entry.body, "").toLowerCase();

      if (entry.type === "update" && !body) return false;
      if (title === "update" && body === "update") return false;
      if (title === "actualización" && body === "update") return false;

      return true;
    });

  const normalizedComments = comments
    .map((entry, index) => {
      const item = safeObject(entry);

      return {
        id: safeText(first(item.id, item.commentId), `c-${index + 1}`),
        kind: "comment",
        type: "comment",
        title: "Comentario",
        body: safeText(
          first(item.message, item.text, item.body, item.comment),
          ""
        ),
        author: safeText(
          first(item.byName, item.user, item.author, item.name),
          "Usuario"
        ),
        createdAt: first(item.createdAt, item.date, item.timestamp),
      };
    })
    .filter((entry) => Boolean(safeText(entry.body, "")));

  return [...normalizedHistory, ...normalizedComments].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });
}

function getTimeline(detail = {}) {
  return normalizeTimelineEntries(detail);
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["open", "abierta", "abierto"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["pending", "pendiente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (
    ["progress", "in_progress", "in-progress", "en_proceso", "en proceso"].includes(
      key
    )
  ) {
    return `
      color:#7dd3fc;
      background:color-mix(in srgb, #7dd3fc 14%, transparent);
      border:1px solid color-mix(in srgb, #7dd3fc 26%, transparent);
    `;
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["closed", "cerrada", "cerrado"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getPriorityChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["low", "baja"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["medium", "media", "normal"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["high", "alta"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["urgent", "urgente", "critical", "critica", "crítica"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getFeedbackStyle(type = "info") {
  const key = safeText(type, "info").toLowerCase();

  if (key === "success") {
    return `
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft));
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
        var(--surface-1, var(--surface-glass));
    `;
  }

  if (key === "error") {
    return `
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 30%, var(--border-soft));
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
        var(--surface-1, var(--surface-glass));
    `;
  }

  return `
    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 85%),
      var(--surface-1, var(--surface-glass));
  `;
}

function renderChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
        height:24px;
        min-height:24px;
        padding:0 10px;
        border-radius:999px;
        font-size:11px;
        line-height:1;
        font-weight:var(--weight-bold, 700);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}) {
  const initials = safeText(
    detail.initials,
    getInitials(getClientName(detail) || "ON")
  );

  const avatarUrl = getClientAvatar(detail);

  const theme = getAvatarTheme(
    safeText(first(detail.ticketId, getClientName(detail)), "onion")
  );

  const themeMap = {
    violet: {
      bg: "linear-gradient(135deg, rgba(124,92,255,.36), rgba(88,72,200,.18))",
      border: "rgba(124,92,255,.32)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.18)",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(54,198,144,.36), rgba(35,131,95,.18))",
      border: "rgba(54,198,144,.32)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.18)",
    },
    blue: {
      bg: "linear-gradient(135deg, rgba(96,165,250,.36), rgba(37,99,235,.18))",
      border: "rgba(96,165,250,.32)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.18)",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(255,188,66,.36), rgba(217,119,6,.18))",
      border: "rgba(255,188,66,.32)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.18)",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(255,107,107,.36), rgba(190,24,93,.18))",
      border: "rgba(255,107,107,.32)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.18)",
    },
    purple: {
      bg: "linear-gradient(135deg, rgba(179,136,255,.36), rgba(109,40,217,.18))",
      border: "rgba(179,136,255,.32)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.18)",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(34,211,238,.36), rgba(8,145,178,.18))",
      border: "rgba(34,211,238,.32)",
      text: "#e6fcff",
      glow: "rgba(34,211,238,.18)",
    },
    orange: {
      bg: "linear-gradient(135deg, rgba(251,146,60,.36), rgba(194,65,12,.18))",
      border: "rgba(251,146,60,.32)",
      text: "#fff0e4",
      glow: "rgba(251,146,60,.18)",
    },
  };

  const palette = themeMap[theme] || themeMap.violet;

  if (avatarUrl) {
    return `
      <div
        class="incidencias-modal-avatar"
        style="
          position:relative;
          flex:0 0 76px;
          width:76px;
          height:76px;
          border-radius:22px;
          overflow:hidden;
          border:1px solid var(--border-soft);
          background:transparent;
          box-shadow:none;
        "
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          style="
            display:block;
            width:100%;
            height:100%;
            object-fit:cover;
          "
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-modal-avatar-fallback','true');"
        />
        <span
          style="
            position:absolute;
            inset:0;
            display:none;
            place-items:center;
            background:${palette.bg};
            border:1px solid ${palette.border};
            color:${palette.text};
            font-size:22px;
            font-weight:var(--weight-black, 800);
            letter-spacing:.03em;
            box-shadow:0 12px 28px ${palette.glow};
          "
        >
          ${escapeHtml(initials)}
        </span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-modal-avatar"
      style="
        position:relative;
        flex:0 0 76px;
        width:76px;
        height:76px;
        border-radius:22px;
        display:grid;
        place-items:center;
        background:${palette.bg};
        border:1px solid ${palette.border};
        color:${palette.text};
        font-size:22px;
        font-weight:var(--weight-black, 800);
        letter-spacing:.03em;
        box-shadow:0 12px 28px ${palette.glow};
      "
    >
      ${escapeHtml(initials)}
    </div>
  `;
}

/* =========================================================
   RENDER PARTIALS
========================================================= */

function renderMetaField(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:5px;
        padding:12px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:10px;
          color:var(--text-faint, #8b8b8b);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:var(--weight-bold, 700);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong, #fff);
          font-size:13px;
          line-height:1.35;
          word-break:break-word;
        "
      >
        ${escapeHtml(safeText(value, "—"))}
      </strong>
    </div>
  `;
}

function renderFeedbackBox() {
  const message = safeText(modalState.feedbackMessage, "");
  if (!message) return "";

  const type = safeText(modalState.feedbackType, "info");

  return `
    <div
      style="
        display:grid;
        gap:5px;
        padding:12px 14px;
        border-radius:14px;
        ${getFeedbackStyle(type)}
      "
    >
      <strong style="color:var(--text-strong); font-size:13px;">
        ${
          type === "error"
            ? "No se ha podido completar la acción"
            : type === "success"
              ? "Acción completada"
              : "Información"
        }
      </strong>

      <span
        style="
          color:var(--text-dim);
          font-size:12px;
          line-height:1.5;
        "
      >
        ${escapeHtml(message)}
      </span>
    </div>
  `;
}

function renderPendingFiles() {
  const files = safeArray(modalState.pendingFiles);

  if (!files.length) {
    return `
      <div
        style="
          color:var(--text-dim);
          font-size:12px;
          line-height:1.45;
        "
      >
        No has seleccionado archivos nuevos.
      </div>
    `;
  }

  return `
    <div style="display:grid; gap:8px;">
      ${files
        .map(
          (file, index) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:12px;
                padding:10px 12px;
                border-radius:12px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <div style="display:grid; gap:4px; min-width:0;">
                <strong
                  style="
                    color:var(--text-strong);
                    font-size:12px;
                    line-height:1.35;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(file.name || `archivo_${index + 1}`)}
                </strong>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:11px;
                  "
                >
                  ${escapeHtml(
                    [
                      safeText(file.type, ""),
                      formatBytes(file.size),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Archivo preparado"
                  )}
                </span>
              </div>

              <button
                type="button"
                data-modal-action="remove-pending-file"
                data-file-index="${index}"
                style="
                  min-height:32px;
                  padding:0 10px;
                  border-radius:10px;
                  border:1px solid var(--border-soft);
                  background:transparent;
                  color:var(--text-dim);
                  font-size:12px;
                  font-weight:var(--weight-bold, 700);
                  cursor:pointer;
                  flex:0 0 auto;
                "
              >
                Quitar
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function getAttachmentBusyMeta(file = {}) {
  const attachmentId = safeText(file.id, "");

  return {
    attachmentId,
    isOpening: Boolean(
      attachmentId && modalState.openingAttachmentId === attachmentId
    ),
    isDownloading: Boolean(
      attachmentId && modalState.downloadingAttachmentId === attachmentId
    ),
  };
}

function renderInlineSpinner(label = "") {
  return `
    <span style="display:inline-flex; align-items:center; gap:8px;">
      <span
        aria-hidden="true"
        style="
          width:14px;
          height:14px;
          border-radius:999px;
          border:2px solid color-mix(in srgb, currentColor 22%, transparent);
          border-top-color:currentColor;
          animation:incidenciasModalSpin .8s linear infinite;
        "
      ></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAttachmentActionButtons(file = {}) {
  const busy = getAttachmentBusyMeta(file);

  return `
    <div
      style="
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
        flex:0 0 auto;
      "
    >
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${busy.isOpening || modalState.isSubmitting ? "disabled" : ""}
        style="
          min-height:34px;
          padding:0 12px;
          border-radius:10px;
          border:1px solid var(--border-soft);
          background:transparent;
          color:var(--text-soft);
          font-size:12px;
          font-weight:var(--weight-bold, 700);
          cursor:${busy.isOpening || modalState.isSubmitting ? "wait" : "pointer"};
          opacity:${busy.isOpening ? ".82" : "1"};
        "
      >
        ${busy.isOpening ? renderInlineSpinner("Abriendo...") : "Visualizar"}
      </button>

      <button
        type="button"
        data-modal-action="download-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${busy.isDownloading || modalState.isSubmitting ? "disabled" : ""}
        style="
          min-height:34px;
          padding:0 12px;
          border-radius:10px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
          background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          color:var(--text-strong);
          font-size:12px;
          font-weight:var(--weight-bold, 700);
          cursor:${busy.isDownloading || modalState.isSubmitting ? "wait" : "pointer"};
          opacity:${busy.isDownloading ? ".82" : "1"};
        "
      >
        ${busy.isDownloading ? renderInlineSpinner("Bajando...") : "Descargar"}
      </button>
    </div>
  `;
}

function renderAttachments(detail = {}) {
  const files = getAttachments(detail);

  return `
    <div style="display:grid; gap:12px;">
      <div
        style="
          display:grid;
          gap:10px;
          padding:14px;
          border-radius:16px;
          border:1px dashed var(--border-soft);
          background:var(--surface-1, var(--surface-glass));
        "
      >
        <div style="display:grid; gap:5px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:13px;
              line-height:1.35;
            "
          >
            Añadir documentos
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.5;
            "
          >
            Puedes adjuntar capturas, PDFs u otros archivos útiles. Se enviarán cuando pulses “Actualizar incidencia”.
          </span>
        </div>

        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-modal-field="attachments"
          multiple
          ${modalState.isSubmitting ? "disabled" : ""}
          style="
            width:100%;
            color:var(--text-soft);
          "
        />

        ${renderPendingFiles()}
      </div>

      <div style="display:grid; gap:8px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:18px;
            letter-spacing:-.02em;
          "
        >
          Documentos actuales
        </h3>

        ${
          !files.length
            ? `
              <div
                style="
                  padding:12px 14px;
                  border-radius:14px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-dim);
                  font-size:12px;
                "
              >
                No hay archivos adjuntos en esta incidencia.
              </div>
            `
            : `
              <div style="display:grid; gap:8px;">
                ${files
                  .map(
                    (file) => `
                      <article
                        style="
                          width:100%;
                          display:grid;
                          gap:10px;
                          padding:12px 14px;
                          border-radius:14px;
                          border:1px solid var(--border-soft);
                          background:var(--surface-glass);
                        "
                      >
                        <div
                          class="incidencias-modal-attachment-row"
                          style="
                            display:grid;
                            grid-template-columns:minmax(0, 1fr) auto;
                            gap:12px;
                            align-items:center;
                          "
                        >
                          <div style="display:grid; gap:4px; min-width:0;">
                            <strong
                              style="
                                min-width:0;
                                font-weight:var(--weight-semibold, 600);
                                font-size:13px;
                                line-height:1.35;
                                word-break:break-word;
                                color:var(--text-strong);
                              "
                            >
                              ${escapeHtml(file.name)}
                            </strong>

                            <span
                              style="
                                color:var(--text-dim);
                                font-size:11px;
                                line-height:1.4;
                              "
                            >
                              ${escapeHtml(
                                [
                                  file.contentType || file.type,
                                  formatBytes(file.size),
                                  file.uploadedAt ? formatDate(file.uploadedAt) : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Archivo adjunto"
                              )}
                            </span>
                          </div>

                          ${renderAttachmentActionButtons(file)}
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderTimeline(detail = {}) {
  const timeline = getTimeline(detail);

  if (!timeline.length) {
    return `
      <div
        style="
          padding:12px 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-dim);
          font-size:12px;
        "
      >
        Sin actividad
      </div>
    `;
  }

  return `
    <div style="display:grid; gap:8px;">
      ${timeline
        .map((entry) => {
          const kind = safeText(entry.kind, "event");
          const rawTitle = safeText(entry.title, "");
          const rawBody = safeText(entry.body, "");

          return `
            <article
              style="
                display:grid;
                gap:8px;
                padding:12px 14px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:10px;
                  align-items:flex-start;
                  flex-wrap:wrap;
                "
              >
                <div style="display:grid; gap:4px; min-width:0; flex:1 1 240px;">
                  ${
                    rawTitle
                      ? `
                        <strong
                          style="
                            color:var(--text-strong);
                            font-size:13px;
                            line-height:1.35;
                            word-break:break-word;
                          "
                        >
                          ${escapeHtml(rawTitle)}
                        </strong>
                      `
                      : ""
                  }

                  <p
                    style="
                      margin:0;
                      color:${kind === "comment" ? "var(--text-soft)" : "var(--text-dim)"};
                      font-size:12px;
                      line-height:1.55;
                      white-space:pre-wrap;
                      word-break:break-word;
                    "
                  >
                    ${escapeHtml(rawBody || "Actualización registrada.")}
                  </p>
                </div>

                <div
                  style="
                    display:grid;
                    gap:3px;
                    justify-items:end;
                    flex:0 0 auto;
                  "
                >
                  <span
                    style="
                      color:var(--text-soft);
                      font-size:11px;
                      font-weight:var(--weight-semibold, 600);
                    "
                  >
                    ${escapeHtml(safeText(entry.author, "Sistema"))}
                  </span>

                  <span
                    style="
                      color:var(--text-dim);
                      font-size:11px;
                    "
                  >
                    ${escapeHtml(formatDate(entry.createdAt))}
                  </span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderComposer() {
  const draft = safeText(modalState.commentDraft, "");

  return `
    <section style="display:grid; gap:10px;">
      <div style="display:grid; gap:4px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:18px;
            letter-spacing:-.02em;
          "
        >
          Añadir más información
        </h3>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
            line-height:1.5;
          "
        >
          Puedes escribir una actualización, adjuntar archivos o hacer ambas cosas a la vez.
        </span>
      </div>

      <textarea
        id="incidencias-modal-comment-input"
        data-modal-field="comment"
        placeholder="Escribe aquí nuevos detalles, contexto adicional o cualquier actualización que quieras añadir..."
        ${modalState.isSubmitting ? "disabled" : ""}
        style="
          width:100%;
          min-height:120px;
          padding:12px 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-1, var(--surface-glass));
          color:var(--text-strong);
          outline:none;
          resize:vertical;
          line-height:1.55;
          font-size:13px;
        "
      >${escapeHtml(draft)}</textarea>

      <div>
        <span
          style="
            color:var(--text-dim);
            font-size:11px;
            line-height:1.5;
          "
        >
          Al actualizar, la incidencia volverá a abierta y se procesarán también los documentos pendientes.
        </span>
      </div>
    </section>
  `;
}

function renderLoadingOverlay(label = "Procesando...") {
  return `
    <div
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:20px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 76%, transparent);
        backdrop-filter:blur(4px);
        z-index:5;
      "
    >
      <div
        style="
          display:grid;
          justify-items:center;
          gap:10px;
          min-width:min(100%, 220px);
          padding:16px 18px;
          border-radius:16px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
          box-shadow:0 20px 40px rgba(0,0,0,.22);
        "
      >
        <span
          aria-hidden="true"
          style="
            width:24px;
            height:24px;
            border-radius:999px;
            border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
            border-top-color:var(--accent, #7c5cff);
            animation:incidenciasModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:13px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(label)}
        </strong>
      </div>
    </div>
  `;
}

function renderFooter(detail = {}) {
  const ticketId = getTicketId(detail);

  return `
    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        padding-top:2px;
      "
    >
      <button
        type="button"
        data-modal-action="submit-update"
        data-ticket-id="${escapeHtml(ticketId)}"
        ${modalState.isSubmitting ? "disabled" : ""}
        style="
          min-height:42px;
          padding:0 16px;
          border-radius:12px;
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-size:13px;
          font-weight:var(--weight-bold, 700);
          cursor:${modalState.isSubmitting ? "wait" : "pointer"};
          opacity:${modalState.isSubmitting ? ".82" : "1"};
          box-shadow:0 12px 28px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
        "
      >
        ${
          modalState.isSubmitting
            ? `
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span
                  aria-hidden="true"
                  style="
                    width:14px;
                    height:14px;
                    border-radius:999px;
                    border:2px solid rgba(255,255,255,.28);
                    border-top-color:#fff;
                    animation:incidenciasModalSpin .8s linear infinite;
                  "
                ></span>
                Actualizando...
              </span>
            `
            : "Actualizar incidencia"
        }
      </button>
    </div>
  `;
}

/* =========================================================
   MODAL RENDER
========================================================= */

function renderModalInner(detail = {}) {
  const item = getDetail(detail);

  const ticketId = getTicketId(item);

  const title = safeText(
    first(
      item.title,
      item.subject,
      item?.raw?.title,
      item?.raw?.subject,
      item?.raw?.asunto
    ),
    "Incidencia"
  );

  const description = getDisplayDescription(item);
  const tecnico = getTecnico(item);
  const facturaRelacionada = getFacturaRelacionada(item);
  const createdAt = formatDate(first(item.createdAt, item?.raw?.createdAt));

  const updatedAgo = formatRelativeDate(
    first(item.updatedAt, item?.raw?.updatedAt, item?.raw?.createdAt)
  );

  const attachments = getAttachments(item);

  const statusRaw = safeText(
    first(item.status, item?.raw?.status, item?.raw?.estado),
    "open"
  );

  const priorityRaw = safeText(
    first(item.priority, item?.raw?.priority, item?.raw?.prioridad),
    "medium"
  );

  const statusLabel = getStatusLabel(statusRaw);
  const priorityLabel = getPriorityLabel(priorityRaw);

  const busyLabel = modalState.isSubmitting ? "Actualizando incidencia..." : "";

  return `
    <div
      data-incidencias-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:20px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.64);
        backdrop-filter:blur(8px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1080px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:24px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 34px 84px rgba(0,0,0,.40);
        "
      >
        ${busyLabel ? renderLoadingOverlay(busyLabel) : ""}

        <div
          style="
            padding:22px 22px 18px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:16px;
            flex-wrap:wrap;
          "
        >
          <div
            class="incidencias-modal-hero"
            style="
              display:flex;
              gap:16px;
              align-items:center;
              min-width:min(100%, 620px);
            "
          >
            ${renderAvatar(item)}

            <div
              class="incidencias-modal-hero-content"
              style="
                display:grid;
                grid-template-rows:auto auto auto;
                align-content:center;
                gap:5px;
                min-width:0;
                flex:1 1 auto;
                min-height:76px;
                max-height:76px;
                overflow:hidden;
              "
            >
              <div
                class="incidencias-modal-hero-chips"
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  flex-wrap:nowrap;
                  min-width:0;
                  overflow:hidden;
                  height:24px;
                "
              >
                <button
                  type="button"
                  data-modal-action="copy"
                  data-ticket-id="${escapeHtml(ticketId)}"
                  title="Copiar ID"
                  style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    flex:0 1 auto;
                    min-width:0;
                    max-width:220px;
                    height:24px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:11px;
                    line-height:1;
                    font-weight:var(--weight-bold, 700);
                    letter-spacing:.045em;
                    text-transform:uppercase;
                    cursor:pointer;
                    white-space:nowrap;
                    overflow:hidden;
                    text-overflow:ellipsis;
                  "
                >
                  ${escapeHtml(ticketId)}
                </button>

                ${renderChip(statusLabel, getStatusChipStyle(statusRaw))}
                ${renderChip(priorityLabel, getPriorityChipStyle(priorityRaw))}
              </div>

              <h2
                id="incidencias-modal-title"
                class="incidencias-modal-title"
                style="
                  margin:0;
                  min-width:0;
                  color:var(--text-strong);
                  font-size:clamp(22px, 2.35vw, 32px);
                  line-height:.98;
                  letter-spacing:-.055em;
                  font-weight:var(--weight-black, 850);
                  white-space:nowrap;
                  overflow:hidden;
                  text-overflow:ellipsis;
                "
              >
                ${escapeHtml(title)}
              </h2>

              <span
                class="incidencias-modal-updated"
                style="
                  display:block;
                  min-width:0;
                  color:var(--text-dim);
                  font-size:13px;
                  line-height:1.15;
                  white-space:nowrap;
                  overflow:hidden;
                  text-overflow:ellipsis;
                "
              >
                Última actualización ${escapeHtml(updatedAgo)}
              </span>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:8px;
              flex-wrap:wrap;
              align-items:flex-start;
            "
          >
            <button
              type="button"
              data-modal-close="true"
              aria-label="Cerrar modal"
              ${modalState.isSubmitting ? "disabled" : ""}
              style="
                width:42px;
                height:42px;
                border:none;
                border-radius:14px;
                cursor:${modalState.isSubmitting ? "not-allowed" : "pointer"};
                font-size:18px;
                background:var(--surface-glass);
                color:var(--text-strong);
                border:1px solid var(--border-soft);
                opacity:${modalState.isSubmitting ? ".72" : "1"};
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style="
            padding:16px 18px 18px;
            display:grid;
            gap:16px;
          "
        >
          ${renderFeedbackBox()}

          <div
            class="incidencias-modal-meta-grid"
            style="
              display:grid;
              grid-template-columns:repeat(4, minmax(0, 1fr));
              gap:10px;
            "
          >
            ${renderMetaField("Técnico", tecnico)}
            ${renderMetaField("Factura", facturaRelacionada)}
            ${renderMetaField("Creada", createdAt)}
            ${renderMetaField("Adjuntos", String(attachments.length))}
          </div>

          <section style="display:grid; gap:8px;">
            <h3
              style="
                margin:0;
                color:var(--text-strong);
                font-size:18px;
                letter-spacing:-.02em;
              "
            >
              Descripción de la incidencia
            </h3>

            <div
              style="
                padding:14px;
                border-radius:16px;
                background:var(--surface-glass);
                border:1px solid var(--border-soft);
                color:var(--text-soft);
                font-size:13px;
                line-height:1.65;
                white-space:pre-wrap;
                word-break:break-word;
              "
            >
              ${escapeHtml(description)}
            </div>
          </section>

          ${renderComposer(item)}

          <section style="display:grid; gap:8px;">
            ${renderAttachments(item)}
          </section>

          <section style="display:grid; gap:8px;">
            <h3
              style="
                margin:0;
                color:var(--text-strong);
                font-size:18px;
                letter-spacing:-.02em;
              "
            >
              Historial y actividad
            </h3>

            ${renderTimeline(item)}
          </section>

          ${renderFooter(item)}
        </div>

        <style>
          @keyframes incidenciasModalSpin {
            to { transform: rotate(360deg); }
          }

          .incidencias-modal-hero {
            min-height:76px;
          }

          .incidencias-modal-hero-content {
            transform:translateY(-1px);
          }

          #${PANEL_ID} [data-modal-avatar-fallback="true"] > img {
            display:none !important;
          }

          #${PANEL_ID} [data-modal-avatar-fallback="true"] > span {
            display:grid !important;
          }

          [data-theme="light"] #${PANEL_ID}{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(250,251,255,.94));
            box-shadow:
              0 30px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          [data-theme="light"] #${PANEL_ID} [style*="background:var(--surface-glass)"]{
            backdrop-filter:none;
          }

          @media (max-width: 980px) {
            .incidencias-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .incidencias-modal-attachment-row {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 720px) {
            .incidencias-modal-avatar {
              flex-basis:64px !important;
              width:64px !important;
              height:64px !important;
              border-radius:19px !important;
            }

            .incidencias-modal-hero {
              gap:12px !important;
              min-height:64px !important;
              align-items:center !important;
            }

            .incidencias-modal-hero-content {
              min-height:64px !important;
              max-height:64px !important;
              gap:4px !important;
            }

            .incidencias-modal-hero-chips {
              height:22px !important;
            }

            .incidencias-modal-title {
              font-size:clamp(20px, 6vw, 25px) !important;
              line-height:.98 !important;
            }

            .incidencias-modal-updated {
              font-size:12px !important;
            }
          }

          @media (max-width: 640px) {
            .incidencias-modal-meta-grid {
              grid-template-columns: 1fr !important;
            }
          }
        </style>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  let root = getRoot();

  if (root) return root;

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    document.body.classList.add("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "";
  } catch {}
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

function detachEscHandler() {
  if (!modalState.escHandler) return;

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape" && !modalState.isSubmitting) {
      closeIncidenciasModal();
    }
  };

  try {
    document.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!modalState.detail) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();
  root.innerHTML = renderModalInner(modalState.detail);
  modalState.bindingsAttached = false;

  return root;
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openIncidenciasModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = getDetail(detail);
  modalState.isOpen = true;
  modalState.isSubmitting = false;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];

  clearFeedback();
  clearAttachmentBusyState();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:modal:opened", {
    detail: modalState.detail,
    ticketId: getTicketId(modalState.detail),
  });

  return true;
}

export function closeIncidenciasModal() {
  if (modalState.isSubmitting) {
    return false;
  }

  const root = getRoot();

  modalState.isOpen = false;
  modalState.isSubmitting = false;
  modalState.detail = null;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];

  clearFeedback();
  clearAttachmentBusyState();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("incidencias:modal:closed", {});

  return true;
}

export function updateIncidenciasModal(detail = {}) {
  if (!modalState.isOpen) {
    return openIncidenciasModal(detail);
  }

  modalState.detail = getDetail(detail);
  modalState.isSubmitting = false;

  clearAttachmentBusyState();

  renderModal();
  attachRootBindings();
  focusPanel();

  return true;
}

/* =========================================================
   ACTIONS
========================================================= */

async function handleCopy(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    setFeedback("No hay ID disponible para copiar.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  let copied = false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(id);
      copied = true;
    }
  } catch {}

  safeEmit("incidencias:modal:copy", {
    ticketId: id,
  });

  if (copied) {
    setFeedback(`ID ${id} copiado al portapapeles.`, "success");
    showToast("ID copiado", "success");
  } else {
    setFeedback(`Se ha solicitado copiar el ID ${id}.`, "info");
    showToast("No se pudo copiar automáticamente el ID.", "info");
  }

  renderModal();
  attachRootBindings();

  return true;
}

async function handleSubmitUpdate(ticketId = "") {
  const id = safeText(ticketId, "");
  const message = normalizeWhitespace(modalState.commentDraft);
  const files = dedupeFiles(modalState.pendingFiles);

  if (!id) {
    setFeedback("No se ha podido identificar la incidencia.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (!message && !files.length) {
    setFeedback(
      "Añade una actualización o selecciona al menos un archivo antes de continuar.",
      "error"
    );
    renderModal();
    attachRootBindings();
    return false;
  }

  if (message && message.length < 4) {
    setFeedback(
      "Añade un poco más de detalle antes de enviar la actualización.",
      "error"
    );
    renderModal();
    attachRootBindings();
    return false;
  }

  modalState.isSubmitting = true;
  clearFeedback();

  renderModal();
  attachRootBindings();
  focusPanel();

  try {
    let nextDetail = getDetail(modalState.detail);

    if (files.length) {
      let uploadResponse = null;

      try {
        uploadResponse = await callExternalAction("uploadTicketAttachments", {
          ticketId: id,
          files,
          detail: nextDetail,
        });
      } catch {
        uploadResponse = null;
      }

      if (!uploadResponse) {
        uploadResponse = await uploadTicketAttachmentsInternal({
          ticketId: id,
          files,
        });
      }

      safeEmit("incidencias:modal:upload", {
        ticketId: id,
        files,
      });

      nextDetail = coerceDetailResponse(uploadResponse, nextDetail);

      try {
        const reopenResponse = await reopenTicketInternal(id);
        nextDetail = mergeDetailWithOpenStatus(nextDetail, reopenResponse);
      } catch {
        nextDetail = mergeDetailWithOpenStatus(nextDetail, null);
      }
    }

    if (message) {
      let commentResponse = null;

      try {
        commentResponse = await callExternalAction("commentTicket", {
          ticketId: id,
          message,
          detail: nextDetail,
          status: "open",
        });
      } catch {
        commentResponse = null;
      }

      if (!commentResponse) {
        commentResponse = await commentTicketInternal({
          ticketId: id,
          message,
        });
      }

      safeEmit("incidencias:modal:comment", {
        ticketId: id,
        message,
        status: "open",
      });

      nextDetail = mergeDetailWithOpenStatus(nextDetail, commentResponse);
    }

    nextDetail = await refreshCurrentDetail(id, nextDetail);

    modalState.detail = nextDetail;
    modalState.commentDraft = "";
    modalState.pendingFiles = [];

    if (message && files.length) {
      setFeedback(
        "La actualización y los documentos se han enviado correctamente. La incidencia vuelve a abierta.",
        "success"
      );
    } else if (message) {
      setFeedback(
        "Tu actualización se ha añadido correctamente y la incidencia vuelve a abierta.",
        "success"
      );
    } else {
      setFeedback(
        "Los documentos se han añadido correctamente y la incidencia vuelve a abierta.",
        "success"
      );
    }

    showToast("Incidencia actualizada", "success");

    safeEmit("incidencias:modal:updated", {
      ticketId: id,
      detail: nextDetail,
    });

    return true;
  } catch (error) {
    setFeedback(
      safeErrorMessage(error, "No se pudo actualizar la incidencia."),
      "error"
    );

    showToast("No se pudo actualizar la incidencia.", "error");

    return false;
  } finally {
    modalState.isSubmitting = false;
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

function getAttachmentById(attachmentId = "") {
  const files = getAttachments(modalState.detail);

  return files.find(
    (file) => safeText(file.id, "") === safeText(attachmentId, "")
  );
}

async function handleAttachmentAction(attachmentId = "", mode = "open") {
  const attachment = getAttachmentById(attachmentId);
  const ticketId = getTicketId(modalState.detail);

  if (!attachment) {
    setFeedback("No se ha encontrado el adjunto solicitado.", "error");
    showToast("Adjunto no encontrado.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (mode === "download") {
    modalState.downloadingAttachmentId = safeText(attachment.id, "");
  } else {
    modalState.openingAttachmentId = safeText(attachment.id, "");
  }

  renderModal();
  attachRootBindings();

  try {
    const externalActionName =
      mode === "download" ? "downloadTicketAttachment" : "openTicketAttachment";

    try {
      const externalResponse = await callExternalAction(externalActionName, {
        ticketId,
        attachment,
        detail: modalState.detail,
        mode,
      });

      if (
        externalResponse &&
        (await openOrDownloadPayload(externalResponse, attachment, mode))
      ) {
        safeEmit("incidencias:modal:attachment", {
          ticketId,
          attachment,
          mode,
          source: "external",
        });

        showToast(
          mode === "download"
            ? "Descarga iniciada."
            : "Abriendo documento.",
          "success"
        );

        return true;
      }
    } catch {}

    const candidates = buildAttachmentCandidates(
      modalState.detail,
      attachment,
      mode
    );

    if (!candidates.length) {
      throw new Error(
        "Este adjunto no tiene URL resoluble todavía. Falta viewUrl / downloadUrl / signedUrl / blobUrl."
      );
    }

    let lastError = null;

    for (const candidate of candidates) {
      try {
        if (looksLikeProtectedApiUrl(candidate)) {
          const payload = await fetchAttachmentResource(
            candidate,
            safeText(attachment.name, "archivo")
          );

          if (await openOrDownloadPayload(payload, attachment, mode)) {
            safeEmit("incidencias:modal:attachment", {
              ticketId,
              attachment,
              mode,
              source: "api-json-or-blob",
              url: candidate,
            });

            showToast(
              mode === "download"
                ? "Descarga iniciada."
                : "Abriendo documento.",
              "success"
            );

            return true;
          }
        } else {
          if (mode === "download") {
            downloadUrlDirect(candidate, attachment.name || "archivo");
          } else {
            openUrlDirect(candidate);
          }

          safeEmit("incidencias:modal:attachment", {
            ticketId,
            attachment,
            mode,
            source: "direct-url",
            url: candidate,
          });

          showToast(
            mode === "download"
              ? "Descarga iniciada."
              : "Abriendo documento.",
            "success"
          );

          return true;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("No se pudo resolver el adjunto.");
  } catch (error) {
    setFeedback(
      safeErrorMessage(
        error,
        mode === "download"
          ? "No se pudo descargar el adjunto."
          : "No se pudo abrir el adjunto."
      ),
      "error"
    );

    showToast(
      mode === "download"
        ? "No se pudo descargar el adjunto."
        : "No se pudo abrir el adjunto.",
      "error"
    );

    return false;
  } finally {
    clearAttachmentBusyState();
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function attachRootBindings() {
  if (modalState.bindingsAttached) return;

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "comment") {
      modalState.commentDraft = field.value || "";
    }
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "attachments") {
      modalState.pendingFiles = dedupeFiles([
        ...safeArray(modalState.pendingFiles),
        ...Array.from(field.files || []),
      ]);

      renderModal();
      attachRootBindings();
      focusPanel();
    }
  };

  const onClick = async (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();

      if (!modalState.isSubmitting) {
        closeIncidenciasModal();
      }

      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');

    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.ticketId || "");
      return;
    }

    const submitBtn = event.target.closest(
      '[data-modal-action="submit-update"]'
    );

    if (submitBtn) {
      event.preventDefault();
      await handleSubmitUpdate(submitBtn.dataset.ticketId || "");
      return;
    }

    const openAttachmentBtn = event.target.closest(
      '[data-modal-action="open-attachment"]'
    );

    if (openAttachmentBtn) {
      event.preventDefault();

      await handleAttachmentAction(
        openAttachmentBtn.dataset.attachmentId || "",
        "open"
      );

      return;
    }

    const downloadAttachmentBtn = event.target.closest(
      '[data-modal-action="download-attachment"]'
    );

    if (downloadAttachmentBtn) {
      event.preventDefault();

      await handleAttachmentAction(
        downloadAttachmentBtn.dataset.attachmentId || "",
        "download"
      );

      return;
    }

    const removePendingBtn = event.target.closest(
      '[data-modal-action="remove-pending-file"]'
    );

    if (removePendingBtn) {
      event.preventDefault();

      const index = safeNumber(removePendingBtn.dataset.fileIndex, -1);

      if (index >= 0) {
        modalState.pendingFiles = safeArray(modalState.pendingFiles).filter(
          (_, i) => i !== index
        );

        renderModal();
        attachRootBindings();
        focusPanel();
      }

      return;
    }

    const overlay = event.target.closest(
      "[data-incidencias-modal-overlay='true']"
    );

    const panel = event.target.closest(
      "[data-incidencias-modal-panel='true']"
    );

    if (
      overlay &&
      !panel &&
      event.target === overlay &&
      !modalState.isSubmitting
    ) {
      closeIncidenciasModal();
    }
  };

  root.__incidenciasModalInputHandler = onInput;
  root.__incidenciasModalChangeHandler = onChange;
  root.__incidenciasModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();

  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__incidenciasModalInputHandler) {
    try {
      root.removeEventListener("input", root.__incidenciasModalInputHandler);
    } catch {}

    delete root.__incidenciasModalInputHandler;
  }

  if (root.__incidenciasModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__incidenciasModalChangeHandler);
    } catch {}

    delete root.__incidenciasModalChangeHandler;
  }

  if (root.__incidenciasModalClickHandler) {
    try {
      root.removeEventListener("click", root.__incidenciasModalClickHandler);
    } catch {}

    delete root.__incidenciasModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  openIncidenciasModal(detail);
}

function handleCloseEvent() {
  closeIncidenciasModal();
}

function handleOpenedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateIncidenciasModal(detail);
  }
}

function handleUpdateEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  updateIncidenciasModal(detail);
}

function handleCommentSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;

  if (!detail || !modalState.isOpen) return;

  modalState.commentDraft = "";
  modalState.detail = getDetail({
    ...detail,
    status: "open",
    raw: {
      ...safeObject(detail?.raw || detail),
      status: "open",
      estado: "open",
    },
  });

  setFeedback(
    "Tu actualización se ha registrado correctamente y la incidencia vuelve a abierta.",
    "success"
  );

  renderModal();
  attachRootBindings();
  focusPanel();
}

function handleUploadSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;

  if (!detail || !modalState.isOpen) return;

  modalState.pendingFiles = [];
  modalState.detail = getDetail(detail);

  setFeedback("Los documentos se han añadido correctamente.", "success");

  renderModal();
  attachRootBindings();
  focusPanel();
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:modal:open", handleOpenEvent);
  safeOn("incidencias:modal:close", handleCloseEvent);
  safeOn("incidencias:modal:update", handleUpdateEvent);
  safeOn("incidencias:open:success", handleOpenedDetailEvent);
  safeOn("incidencias:comment:success", handleCommentSuccess);
  safeOn("incidencias:upload:success", handleUploadSuccess);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:modal:open", handleOpenEvent);
  safeOff("incidencias:modal:close", handleCloseEvent);
  safeOff("incidencias:modal:update", handleUpdateEvent);
  safeOff("incidencias:open:success", handleOpenedDetailEvent);
  safeOff("incidencias:comment:success", handleCommentSuccess);
  safeOff("incidencias:upload:success", handleUploadSuccess);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasModal = {
  open(detail = {}) {
    return openIncidenciasModal(detail);
  },

  close() {
    return closeIncidenciasModal();
  },

  update(detail = {}) {
    return updateIncidenciasModal(detail);
  },

  setFeedback(message = "", type = "info") {
    setFeedback(message, type);

    if (modalState.isOpen) {
      renderModal();
      attachRootBindings();
    }

    return true;
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
      pendingFiles: [...safeArray(modalState.pendingFiles)],
    };
  },

  destroy() {
    closeIncidenciasModal();
    detachEscHandler();
    detachRootBindings();
    detachBus();

    const root = getRoot();

    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionIncidenciasModal = OnionIncidenciasModal;
  window.renderIncidenciaTicketModal = OnionIncidenciasModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasModal;

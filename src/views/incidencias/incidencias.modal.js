/* =========================================================
   Onion SPA - Incidencias Modal
   Archivo: src/views/incidencias/incidencias.modal.js

   CLIENT EXPERIENCE PRO · DETAIL MODAL · EXTREME GOD MODE
   CSP CLEAN · NO CSS IN JS · NO INLINE STYLE · NO INLINE EVENTS
   PATCH · SINGLETON · DEDUPE OPEN · NO DOUBLE MODAL · NO FLICKER
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

const MODAL_VERSION = "incidencias-modal-dedupe-2026-05-06";
const INSTANCE_KEY = "__ONION_INCIDENCIAS_MODAL_SINGLETON__";

const REQUEST_TIMEOUT_MS = 90000;
const ATTACHMENT_TIMEOUT_MS = 90000;
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const DUPLICATE_OPEN_WINDOW_MS = 900;

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isSubmitting: false,

  bindingsAttached: false,
  rootAbortController: null,

  busAttached: false,
  busDisposers: [],

  lastActiveElement: null,
  escHandler: null,

  commentDraft: "",
  feedbackMessage: "",
  feedbackType: "info",

  pendingFiles: [],

  uploadProgress: {
    active: false,
    percent: 0,
    loaded: 0,
    total: 0,
    label: "",
  },

  openingAttachmentId: "",
  downloadingAttachmentId: "",
  attachmentActionKey: "",

  previewFile: null,
  previewObjectUrl: "",

  bodyLocked: false,
  bodyOverflowBeforeLock: "",

  thumbnailObjectUrls: new Map(),
  thumbnailLoadingIds: new Set(),
  thumbnailFailedIds: new Set(),

  openTicketId: "",
  lastOpenAt: 0,
  lastOpenHash: "",
  lastRenderedHash: "",
  renderQueued: false,
};

/* =========================================================
   BASIC HELPERS
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
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
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
  return safeText(value, "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const key = normalizeKey(value);

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function tooltipAttrs(tooltip = "", ariaLabel = "") {
  const cleanTooltip = safeText(tooltip, "");
  const cleanAria = safeText(ariaLabel, cleanTooltip);

  return htmlAttrs({
    "aria-label": cleanAria || false,
    "data-tooltip": cleanTooltip || false,
  });
}

function getObjectHash(value = {}) {
  try {
    const obj = safeObject(value);

    return JSON.stringify({
      id: first(obj.ticketId, obj.id, obj.raw?.ticketId, obj.raw?.id),
      status: first(obj.status, obj.estado, obj.raw?.status, obj.raw?.estado),
      updatedAt: first(obj.updatedAt, obj.raw?.updatedAt, obj.raw?._ts),
      attachmentsCount: safeArray(first(obj.attachments, obj.raw?.attachments)).length,
      commentsCount: safeArray(first(obj.comments, obj.raw?.comments)).length,
    });
  } catch {
    return String(Date.now());
  }
}

/* =========================================================
   EVENT HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  try {
    if (AppCore?.events?.emit) {
      AppCore.events.emit(eventName, payload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      return true;
    }
  } catch {}

  return false;
}

function safeOn(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return () => {};

  const disposers = [];

  try {
    if (AppCore?.events?.on) {
      AppCore.events.on(eventName, handler);

      disposers.push(() => {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.addEventListener(eventName, handler);

      disposers.push(() => {
        try {
          window.removeEventListener(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  return () => {
    disposers.forEach((dispose) => {
      try {
        dispose();
      } catch {}
    });
  };
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
   STATE HELPERS
========================================================= */

function setFeedback(message = "", type = "info") {
  modalState.feedbackMessage = safeText(message, "");
  modalState.feedbackType = safeText(type, "info");
}

function clearFeedback() {
  modalState.feedbackMessage = "";
  modalState.feedbackType = "info";
}

function clearUploadProgress() {
  modalState.uploadProgress = {
    active: false,
    percent: 0,
    loaded: 0,
    total: 0,
    label: "",
  };
}

function clearAttachmentBusyState() {
  modalState.openingAttachmentId = "";
  modalState.downloadingAttachmentId = "";
}

function clearAttachmentActionKey() {
  modalState.attachmentActionKey = "";
}

function revokePreviewObjectUrl() {
  const url = safeText(modalState.previewObjectUrl, "");
  if (!url) return;

  try {
    URL.revokeObjectURL(url);
  } catch {}

  modalState.previewObjectUrl = "";
}

function clearAttachmentPreview() {
  revokePreviewObjectUrl();
  modalState.previewFile = null;
}

function setAttachmentPreview(file = {}) {
  const next = safeObject(file);

  if (!safeText(next.url, "")) {
    clearAttachmentPreview();
    return false;
  }

  revokePreviewObjectUrl();

  modalState.previewFile = next;

  if (next.managedObjectUrl) {
    modalState.previewObjectUrl = safeText(next.url, "");
  }

  return true;
}

function revokeAttachmentThumbnails() {
  try {
    modalState.thumbnailObjectUrls.forEach((entry) => {
      const item = safeObject(entry);

      if (item.managed && item.url) {
        try {
          URL.revokeObjectURL(item.url);
        } catch {}
      }
    });
  } catch {}

  modalState.thumbnailObjectUrls = new Map();
  modalState.thumbnailLoadingIds = new Set();
  modalState.thumbnailFailedIds = new Set();
}

function getStoredThumbnailUrl(attachmentId = "") {
  const id = safeText(attachmentId, "");
  if (!id) return "";

  try {
    return safeText(modalState.thumbnailObjectUrls.get(id)?.url, "");
  } catch {
    return "";
  }
}

function setStoredThumbnailUrl(attachmentId = "", url = "", managed = false) {
  const id = safeText(attachmentId, "");
  const finalUrl = safeText(url, "");

  if (!id || !finalUrl) return false;

  try {
    const previous = modalState.thumbnailObjectUrls.get(id);

    if (previous?.managed && previous?.url && previous.url !== finalUrl) {
      try {
        URL.revokeObjectURL(previous.url);
      } catch {}
    }

    modalState.thumbnailObjectUrls.set(id, {
      url: finalUrl,
      managed: Boolean(managed),
    });

    return true;
  } catch {
    return false;
  }
}

function resetTransientStateForNewTicket() {
  modalState.isSubmitting = false;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];

  clearUploadProgress();
  clearAttachmentPreview();
  clearFeedback();
  clearAttachmentBusyState();
  clearAttachmentActionKey();
  revokeAttachmentThumbnails();
}

/* =========================================================
   FORMAT HELPERS
========================================================= */

function formatBytes(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeText(currency, "EUR"),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${safeText(currency, "EUR")}`;
  }
}

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

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file) => {
    if (!isFile(file)) return;

    const key = [
      safeText(file.name, ""),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) map.set(key, file);
  });

  return Array.from(map.values());
}

function safeErrorMessage(error = null, fallback = "No se pudo completar la acción.") {
  const rawMessage = safeText(
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

  const lower = rawMessage.toLowerCase();

  if (
    rawMessage === "AbortError" ||
    lower.includes("aborted") ||
    lower.includes("abort")
  ) {
    return "La operación ha tardado demasiado y se ha cancelado. Revisa si el archivo es muy pesado o si el servidor sigue procesando la subida.";
  }

  return rawMessage;
}

/* =========================================================
   API HELPERS
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
      AppCore?.state?.apiBase,
      isBrowser() ? window.ONION_API_BASE : "",
      isBrowser() ? window.API_BASE : ""
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

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      isBrowser() ? window.Auth?.getToken?.() : "",
      isBrowser() ? localStorage.getItem("token") : "",
      isBrowser() ? localStorage.getItem("accessToken") : "",
      isBrowser() ? sessionStorage.getItem("token") : "",
      isBrowser() ? sessionStorage.getItem("accessToken") : ""
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
  if (!isBrowser()) return "";

  const apiBase = getApiBase();

  if (!apiBase) return window.location.origin;

  try {
    return new URL(apiBase, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function looksLikeProtectedApiUrl(value = "") {
  const text = safeText(value, "");
  if (!text || !isBrowser()) return false;

  if (isAzureBlobUrl(text)) return false;

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

  if (!finalUrl) throw new Error("API_URL_REQUIRED");

  const method = safeText(options?.method, "GET").toUpperCase();
  const body = options?.body ?? null;
  const formDataBody = isFormData(body);

  const timeout = createTimeoutSignal(
    safeNumber(options?.timeoutMs, REQUEST_TIMEOUT_MS)
  );

  const headers = {
    ...(safeObject(options?.headers)),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (body !== null && body !== undefined && !formDataBody) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (formDataBody) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  try {
    const response = await fetch(finalUrl, {
      method,
      headers,
      credentials: "include",
      signal: timeout.signal,
      ...(body !== null && body !== undefined
        ? {
            body: formDataBody
              ? body
              : typeof body === "string" || isBlob(body) || isArrayBuffer(body)
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
      error.statusCode = response.status;
      error.response = parsed?.payload || parsed?.text || null;
      throw error;
    }

    if (parsed.kind === "json") return parsed.payload;

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

  if (!finalUrl) throw new Error("No hay URL para obtener el adjunto.");

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
      error.statusCode = response.status;
      error.response = parsed?.payload || parsed?.text || null;
      throw error;
    }

    return parsed;
  } finally {
    timeout.clear();
  }
}

function requestMultipartWithProgress(path = "", formData = null, options = {}) {
  return new Promise((resolve, reject) => {
    const finalUrl = resolveApiUrl(path);
    const token = getAuthToken();

    if (!finalUrl) {
      reject(new Error("API_URL_REQUIRED"));
      return;
    }

    if (!isFormData(formData)) {
      reject(new Error("FORM_DATA_REQUIRED"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const timeoutMs = safeNumber(options?.timeoutMs, UPLOAD_TIMEOUT_MS);

    xhr.open(safeText(options?.method, "POST").toUpperCase(), finalUrl, true);
    xhr.timeout = timeoutMs;
    xhr.withCredentials = true;

    xhr.setRequestHeader("Accept", "application/json, text/plain, */*");

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!modalState.isOpen) return;

      if (!event.lengthComputable) {
        modalState.uploadProgress = {
          active: true,
          percent: 0,
          loaded: safeNumber(event.loaded, 0),
          total: 0,
          label: "Subiendo archivos...",
        };

        scheduleModalRender();
        return;
      }

      const loaded = safeNumber(event.loaded, 0);
      const total = safeNumber(event.total, 0);
      const percent = total > 0
        ? Math.min(100, Math.round((loaded / total) * 100))
        : 0;

      modalState.uploadProgress = {
        active: true,
        percent,
        loaded,
        total,
        label: `Subiendo archivos... ${percent}%`,
      };

      scheduleModalRender();
    };

    xhr.onload = () => {
      const status = safeNumber(xhr.status, 0);
      const contentType = safeText(xhr.getResponseHeader("content-type"), "");
      const raw = xhr.responseText || "";

      let payload = raw;

      if (contentType.includes("application/json")) {
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch {
          payload = raw;
        }
      } else {
        try {
          payload = raw ? JSON.parse(raw) : raw;
        } catch {
          payload = raw;
        }
      }

      if (status < 200 || status >= 300) {
        const message = safeText(
          first(payload?.message, payload?.error, raw, `HTTP ${status}`),
          `HTTP ${status}`
        );

        const error = new Error(message);
        error.status = status;
        error.statusCode = status;
        error.response = payload;
        reject(error);
        return;
      }

      resolve(payload);
    };

    xhr.onerror = () => {
      reject(new Error("No se pudo conectar con el servidor durante la subida."));
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          "La subida ha tardado demasiado. El archivo puede ser muy pesado o la conexión demasiado lenta."
        )
      );
    };

    xhr.onabort = () => {
      reject(new Error("La subida se ha cancelado."));
    };

    xhr.send(formData);
  });
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function preserveRawDetailFields(input = {}, normalized = {}) {
  const source = safeObject(input);
  const sourceRaw = safeObject(source.raw);
  const normalizedRaw = safeObject(normalized.raw);

  const raw = {
    ...sourceRaw,
    ...source,
    ...normalizedRaw,
  };

  return {
    ...normalized,
    raw,

    facturaId: first(normalized.facturaId, source.facturaId, raw.facturaId),
    invoiceId: first(normalized.invoiceId, source.invoiceId, raw.invoiceId),

    facturaIds: safeArray(first(normalized.facturaIds, source.facturaIds, raw.facturaIds)),
    invoiceIds: safeArray(first(normalized.invoiceIds, source.invoiceIds, raw.invoiceIds)),

    facturasCount: safeNumber(
      first(normalized.facturasCount, source.facturasCount, raw.facturasCount),
      0
    ),

    invoicesCount: safeNumber(
      first(normalized.invoicesCount, source.invoicesCount, raw.invoicesCount),
      0
    ),

    linkedInvoices: {
      ...safeObject(raw.linkedInvoices),
      ...safeObject(source.linkedInvoices),
      ...safeObject(normalized.linkedInvoices),
    },

    invoices: safeArray(first(normalized.invoices, source.invoices, raw.invoices)),
    facturas: safeArray(first(normalized.facturas, source.facturas, raw.facturas)),

    total: first(normalized.total, source.total, raw.total),
    amount: first(normalized.amount, source.amount, raw.amount),
    importe: first(normalized.importe, source.importe, raw.importe),
    price: first(normalized.price, source.price, raw.price),

    facturasTotal: first(normalized.facturasTotal, source.facturasTotal, raw.facturasTotal),
    invoicesTotal: first(normalized.invoicesTotal, source.invoicesTotal, raw.invoicesTotal),
    importeFacturas: first(normalized.importeFacturas, source.importeFacturas, raw.importeFacturas),
    invoiceTotal: first(normalized.invoiceTotal, source.invoiceTotal, raw.invoiceTotal),

    currency: safeText(first(normalized.currency, source.currency, raw.currency, "EUR"), "EUR"),
    moneda: safeText(first(normalized.moneda, source.moneda, raw.moneda, "EUR"), "EUR"),

    meta: {
      ...safeObject(raw.meta),
      ...safeObject(source.meta),
      ...safeObject(normalized.meta),
    },
  };
}

function getDetail(detail = {}) {
  const source = safeObject(detail);
  const normalized = normalizeIncidenciaModel(source);

  return preserveRawDetailFields(source, normalized);
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
  const base = safeObject(fallback);

  if (!Object.keys(payload).length) {
    return getDetail(base);
  }

  return getDetail({
    ...base,
    ...payload,
    raw: {
      ...safeObject(base?.raw || base),
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
      detail.incidenciaId,
      detail?.raw?.ticketId,
      detail?.raw?.id,
      detail?.raw?.code,
      detail?.raw?.ticketCode,
      detail?.raw?.incidenciaId
    ),
    ""
  );
}

function getDisplayTicketId(detail = {}) {
  return safeText(getTicketId(detail), "—");
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
      detail?.requesterSnapshot?.avatar,
      detail?.requesterSnapshot?.avatarUrl,
      detail?.raw?.clientAvatar,
      detail?.raw?.avatar,
      detail?.raw?.avatarUrl,
      detail?.raw?.client?.avatar,
      detail?.raw?.client?.avatarUrl,
      detail?.raw?.cliente?.avatar,
      detail?.raw?.cliente?.avatarUrl,
      detail?.raw?.requesterSnapshot?.avatar,
      detail?.raw?.requesterSnapshot?.avatarUrl
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
      detail?.requesterSnapshot?.name,
      detail?.raw?.clientName,
      detail?.raw?.name,
      detail?.raw?.cliente?.nombre,
      detail?.raw?.cliente?.name,
      detail?.raw?.client?.name,
      detail?.raw?.receptor?.name,
      detail?.raw?.createdBy?.name,
      detail?.raw?.requesterSnapshot?.name
    ),
    "Cliente"
  );
}

function getDisplayDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.descripcion,
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
      detail.assignedTo?.name,
      detail.assignment?.agentName,
      detail?.raw?.tecnico?.name,
      detail?.raw?.assignedTo?.name,
      detail?.raw?.assignedToName,
      detail?.raw?.assignment?.agentName
    ),
    "No asignado"
  );
}

/* =========================================================
   FACTURA DATA
========================================================= */

function collectInvoiceObjects(detail = {}) {
  const raw = safeObject(detail.raw);
  const linked = safeObject(first(detail.linkedInvoices, raw.linkedInvoices));
  const rawLinked = safeObject(raw.linkedInvoices);

  return [
    ...safeArray(detail.invoices),
    ...safeArray(detail.facturas),
    ...safeArray(detail.facturasRelacionadas),
    ...safeArray(linked.invoices),
    ...safeArray(linked.facturas),

    safeObject(detail.invoice),
    safeObject(detail.factura),

    ...safeArray(raw.invoices),
    ...safeArray(raw.facturas),
    ...safeArray(raw.facturasRelacionadas),
    ...safeArray(rawLinked.invoices),
    ...safeArray(rawLinked.facturas),

    safeObject(raw.invoice),
    safeObject(raw.factura),
  ].filter((item) => Object.keys(safeObject(item)).length > 0);
}

function extractInvoiceCodeFromObject(invoice = {}) {
  const item = safeObject(invoice);

  return safeText(
    first(
      item.numeroFacturaLegal,
      item.legalInvoiceNumber,
      item.numeroFacturaSistema,
      item.systemInvoiceNumber,
      item.facturaId,
      item.invoiceId,
      item.id,
      item.numero,
      item.code,
      item.reference,
      item.ref
    ),
    ""
  );
}

function extractInvoiceAmountFromObject(invoice = {}) {
  const item = safeObject(invoice);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.totalFactura,
    item.importeTotal,
    item.grandTotal,
    item.price
  );
}

function extractInvoiceCurrencyFromObject(invoice = {}) {
  const item = safeObject(invoice);

  return safeText(first(item.currency, item.moneda, item.divisa, "EUR"), "EUR");
}

function getFacturaRelacionada(detail = {}) {
  const raw = safeObject(detail.raw);
  const linked = safeObject(first(detail.linkedInvoices, raw.linkedInvoices));
  const rawLinked = safeObject(raw.linkedInvoices);

  const invoiceObjects = collectInvoiceObjects(detail);

  const primaryInvoice = invoiceObjects.find((invoice) =>
    Boolean(extractInvoiceCodeFromObject(invoice) || extractInvoiceAmountFromObject(invoice))
  );

  const invoiceCode = safeText(
    first(
      primaryInvoice ? extractInvoiceCodeFromObject(primaryInvoice) : "",

      detail.numeroFacturaLegal,
      detail.numeroFacturaSistema,
      detail.invoiceCode,
      detail.invoiceId,
      detail.facturaId,

      detail?.invoice?.numeroFacturaLegal,
      detail?.invoice?.numeroFacturaSistema,
      detail?.invoice?.code,
      detail?.invoice?.id,

      detail?.factura?.numeroFacturaLegal,
      detail?.factura?.numeroFacturaSistema,
      detail?.factura?.code,
      detail?.factura?.id,

      linked.numeroFacturaLegal,
      linked.numeroFacturaSistema,
      linked.primaryInvoiceId,
      linked.invoiceId,
      linked.facturaId,
      linked.code,
      linked.id,

      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceCode,
      raw.invoiceId,
      raw.facturaId,
      raw.facturaRelacionada,

      raw?.invoice?.numeroFacturaLegal,
      raw?.invoice?.numeroFacturaSistema,
      raw?.invoice?.code,
      raw?.invoice?.id,

      raw?.factura?.numeroFacturaLegal,
      raw?.factura?.numeroFacturaSistema,
      raw?.factura?.code,
      raw?.factura?.id,

      rawLinked.numeroFacturaLegal,
      rawLinked.numeroFacturaSistema,
      rawLinked.primaryInvoiceId,
      rawLinked.invoiceId,
      rawLinked.facturaId,
      rawLinked.code,
      rawLinked.id
    ),
    ""
  );

  const amount = first(
    primaryInvoice ? extractInvoiceAmountFromObject(primaryInvoice) : null,

    detail.total,
    detail.amount,
    detail.importe,
    detail.price,

    detail.facturasTotal,
    detail.invoicesTotal,
    detail.importeFacturas,
    detail.invoiceTotal,

    linked.total,
    linked.amount,
    linked.importe,

    detail.meta?.invoicesTotal,
    detail.meta?.invoiceTotal,

    raw.total,
    raw.amount,
    raw.importe,
    raw.price,

    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,

    rawLinked.total,
    rawLinked.amount,
    rawLinked.importe,

    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal
  );

  const currency = safeText(
    first(
      primaryInvoice ? extractInvoiceCurrencyFromObject(primaryInvoice) : "",

      detail.currency,
      detail.moneda,
      linked.currency,
      linked.moneda,
      detail.meta?.invoiceCurrency,
      detail.meta?.currency,

      raw.currency,
      raw.moneda,
      rawLinked.currency,
      rawLinked.moneda,
      raw.meta?.invoiceCurrency,
      raw.meta?.currency,

      "EUR"
    ),
    "EUR"
  );

  const numericAmount = Number(amount);
  const safeInvoiceCode = invoiceCode === "[object Object]" ? "" : invoiceCode;

  if (safeInvoiceCode && Number.isFinite(numericAmount)) {
    return `${safeInvoiceCode} · ${formatMoney(numericAmount, currency)}`;
  }

  if (safeInvoiceCode) return safeInvoiceCode;
  if (Number.isFinite(numericAmount)) return formatMoney(numericAmount, currency);

  const paymentStatus = normalizeKey(
    first(
      detail.paymentStatus,
      detail.estadoPago,
      linked.paymentStatus,
      linked.estadoPago,
      raw.paymentStatus,
      raw.estadoPago,
      rawLinked.paymentStatus,
      rawLinked.estadoPago
    )
  );

  if (["paid", "pagada", "pagado", "cobrada"].includes(paymentStatus)) return "Pagado";
  if (["pending", "pendiente"].includes(paymentStatus)) return "Pendiente";
  if (["partial", "parcial"].includes(paymentStatus)) return "Parcial";
  if (["overdue", "vencida"].includes(paymentStatus)) return "Vencido";

  return "No vinculada";
}

/* =========================================================
   ATTACHMENTS
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

  if (isAbsoluteUrl(directUrl)) return directUrl;

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

  if (isAbsoluteUrl(candidatePath)) return candidatePath;

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

  if (blobBaseUrl && candidatePath) return buildUrl(blobBaseUrl, candidatePath);

  const attachmentId = safeText(
    first(
      file.id,
      file.fileId,
      file.attachmentId,
      file.storageKey,
      file.path,
      file.blobName,
      file.key
    ),
    ""
  );

  if (ticketId && attachmentId) {
    return resolveApiUrl(
      joinApiPath(
        "api",
        "tickets",
        encodeUrlPathSegment(ticketId),
        "attachments",
        encodeUrlPathSegment(attachmentId),
        mode === "download" ? "download" : "view"
      )
    );
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

    attachment.viewUrl = resolveAttachmentUrl(attachment, detail, "open");
    attachment.openUrl = attachment.viewUrl;
    attachment.downloadUrl = resolveAttachmentUrl(attachment, detail, "download");

    attachment.signedUrl = safeText(first(item.signedUrl, raw.signedUrl, attachment.viewUrl), "");
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

  const ticketId = safeText(getTicketId(detail), "");

  const attachmentId = safeText(
    first(
      file.id,
      raw.id,
      raw.attachmentId,
      raw.fileId,
      raw.storageKey,
      raw.path,
      raw.blobName,
      raw.key
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

  const name = safeText(first(file.name, raw.name, raw.filename, raw.fileName), "archivo");

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

  if (ticketId) {
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
      const built = resolveApiUrl(route);
      if (built) absoluteCandidates.push(built);
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

function getAttachmentPreviewType(file = {}) {
  return safeText(
    first(
      file.contentType,
      file.type,
      file.mimeType,
      file.mimetype,
      file.raw?.contentType,
      file.raw?.type,
      file.raw?.mimeType,
      file.raw?.mimetype
    ),
    ""
  ).toLowerCase();
}

function isPreviewImage(file = {}) {
  return getAttachmentPreviewType(file).startsWith("image/");
}

function isPreviewPdf(file = {}) {
  const type = getAttachmentPreviewType(file);
  const name = safeText(first(file.filename, file.name), "").toLowerCase();

  return type.includes("application/pdf") || name.endsWith(".pdf");
}

function isImageLikeAttachment(file = {}) {
  const item = safeObject(file);

  const type = safeText(
    first(
      item.contentType,
      item.type,
      item.mimeType,
      item.mimetype,
      item.raw?.contentType,
      item.raw?.type,
      item.raw?.mimeType,
      item.raw?.mimetype
    ),
    ""
  ).toLowerCase();

  const name = safeText(
    first(
      item.filename,
      item.fileName,
      item.name,
      item.raw?.filename,
      item.raw?.fileName,
      item.raw?.name
    ),
    ""
  ).toLowerCase();

  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
  );
}

function getBestThumbnailCandidate(file = {}) {
  return safeText(
    first(
      file.viewUrl,
      file.openUrl,
      file.signedUrl,
      file.url,
      file.blobUrl,
      file.publicUrl,
      file.downloadUrl,
      file?.raw?.viewUrl,
      file?.raw?.openUrl,
      file?.raw?.signedUrl,
      file?.raw?.url,
      file?.raw?.blobUrl,
      file?.raw?.publicUrl,
      file?.raw?.downloadUrl
    ),
    ""
  );
}

async function hydrateAttachmentThumbnails() {
  if (!modalState.isOpen || !modalState.detail) return false;

  const files = getAttachments(modalState.detail).filter(isImageLikeAttachment);
  if (!files.length) return false;

  files.forEach(async (file) => {
    const attachmentId = safeText(file.id, "");
    if (!attachmentId) return;

    if (getStoredThumbnailUrl(attachmentId)) return;

    try {
      if (modalState.thumbnailLoadingIds.has(attachmentId)) return;
      if (modalState.thumbnailFailedIds.has(attachmentId)) return;
    } catch {}

    const candidate = getBestThumbnailCandidate(file);

    if (!candidate) {
      modalState.thumbnailFailedIds.add(attachmentId);
      return;
    }

    if (!looksLikeProtectedApiUrl(candidate)) {
      setStoredThumbnailUrl(attachmentId, candidate, false);
      scheduleModalRender();
      return;
    }

    try {
      modalState.thumbnailLoadingIds.add(attachmentId);

      const payload = await fetchAttachmentResource(
        candidate,
        safeText(first(file.filename, file.name), "imagen")
      );

      if (!modalState.isOpen) return;

      if (payload?.kind === "blob" && isBlob(payload.blob)) {
        const type = safeText(first(payload.contentType, payload.blob.type), "");

        if (type && !type.startsWith("image/")) {
          modalState.thumbnailFailedIds.add(attachmentId);
          return;
        }

        const objectUrl = URL.createObjectURL(payload.blob);
        setStoredThumbnailUrl(attachmentId, objectUrl, true);
        scheduleModalRender();
        return;
      }
    } catch {
      modalState.thumbnailFailedIds.add(attachmentId);
    } finally {
      modalState.thumbnailLoadingIds.delete(attachmentId);
    }
  });

  return true;
}

/* =========================================================
   DOWNLOAD / PREVIEW
========================================================= */

function downloadBlob(blob, filename = "archivo") {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeText(filename, "archivo");
    anchor.rel = "noopener";
    anchor.className = "incidencias-modal-hidden-download-link";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } finally {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 60000);
  }
}

function downloadUrlDirect(url = "", filename = "archivo") {
  const finalUrl = safeText(url, "");
  if (!finalUrl) throw new Error("No hay URL disponible para descargar el archivo.");

  const anchor = document.createElement("a");
  anchor.href = finalUrl;
  anchor.download = safeText(filename, "archivo");
  anchor.rel = "noopener noreferrer";
  anchor.className = "incidencias-modal-hidden-download-link";

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
    first(file.filename, file.name, data.filename, data.name, obj.filename, obj.name),
    fallback
  );
}

function extractContentTypeFromPayload(payload = {}, fallback = "") {
  const obj = safeObject(payload);
  const file = safeObject(obj.file);
  const data = safeObject(obj.data);

  return safeText(
    first(
      file.contentType,
      file.mimeType,
      file.mimetype,
      file.type,
      data.contentType,
      data.mimeType,
      data.mimetype,
      data.type,
      obj.contentType,
      obj.mimeType,
      obj.mimetype,
      obj.type,
      fallback
    ),
    fallback
  );
}

function normalizeAttachmentActionFile(payload = null, attachment = {}, mode = "open") {
  const fallbackFilename = safeText(
    first(attachment?.filename, attachment?.name),
    "archivo"
  );

  const blob =
    isBlob(payload?.blob)
      ? payload.blob
      : payload?.kind === "blob" && isBlob(payload?.blob)
        ? payload.blob
        : null;

  if (blob) {
    const objectUrl = URL.createObjectURL(blob);

    return {
      ...safeObject(attachment),
      url: objectUrl,
      filename: safeText(payload?.filename, fallbackFilename),
      name: safeText(payload?.filename, fallbackFilename),
      contentType: safeText(
        first(payload?.contentType, blob.type, attachment?.contentType, attachment?.type),
        ""
      ),
      size: safeNumber(first(blob.size, attachment?.size), 0),
      blob,
      managedObjectUrl: true,
      source: "blob",
    };
  }

  const source = payload?.kind === "json" ? payload.payload : payload;
  const sourceObj = safeObject(source);

  const url = safeText(
    first(
      extractFileUrlFromPayload(sourceObj, mode),
      sourceObj.url,
      sourceObj.viewUrl,
      sourceObj.openUrl,
      sourceObj.downloadUrl,
      sourceObj.signedUrl
    ),
    ""
  );

  if (!url) return null;

  const filename = extractFilenameFromPayload(sourceObj, fallbackFilename);

  return {
    ...safeObject(attachment),
    ...sourceObj,
    url,
    viewUrl: safeText(first(sourceObj.viewUrl, sourceObj.openUrl, url), url),
    openUrl: safeText(first(sourceObj.openUrl, sourceObj.viewUrl, url), url),
    downloadUrl: safeText(first(sourceObj.downloadUrl, url), url),
    signedUrl: safeText(first(sourceObj.signedUrl, url), url),
    filename,
    name: safeText(first(sourceObj.name, filename), filename),
    contentType: extractContentTypeFromPayload(
      sourceObj,
      safeText(first(attachment?.contentType, attachment?.type), "")
    ),
    size: safeNumber(first(sourceObj.size, attachment?.size), 0),
    managedObjectUrl: false,
    source: "url",
  };
}

function downloadResolvedAttachmentFile(file = {}) {
  const item = safeObject(file);
  const filename = safeText(first(item.filename, item.name), "archivo");

  if (isBlob(item.blob)) return downloadBlob(item.blob, filename);

  return downloadUrlDirect(item.downloadUrl || item.url, filename);
}

async function openOrDownloadPayload(payload, attachment = {}, mode = "open") {
  const finalMode = mode === "download" ? "download" : "open";
  const file = normalizeAttachmentActionFile(payload, attachment, finalMode);

  if (!file?.url) return false;

  if (finalMode === "download") {
    return downloadResolvedAttachmentFile(file);
  }

  return setAttachmentPreview(file);
}

/* =========================================================
   API ACTIONS
========================================================= */

async function fetchTicketDetailInternal(ticketId = "") {
  const id = safeText(ticketId, "");
  if (!id) throw new Error("No se pudo identificar la incidencia.");

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
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status || error?.statusCode))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo cargar la incidencia.");
}

async function uploadTicketAttachmentsInternal({ ticketId = "", files = [] } = {}) {
  const id = safeText(ticketId, "");
  const list = dedupeFiles(files);

  if (!id || !list.length) {
    throw new Error("Faltan ticketId o archivos para subir.");
  }

  const encodedTicketId = encodeUrlPathSegment(id);

  const candidates = [
    `/api/tickets/${encodedTicketId}/attachments`,
    `/api/incidencias/${encodedTicketId}/attachments`,
    `/api/tickets/${encodedTicketId}/files`,
    `/api/incidencias/${encodedTicketId}/files`,
  ];

  let lastError = null;

  for (const path of candidates) {
    const formData = new FormData();

    list.forEach((file) => {
      if (isFile(file)) {
        formData.append("attachments", file, file.name);
      }
    });

    try {
      modalState.uploadProgress = {
        active: true,
        percent: 0,
        loaded: 0,
        total: list.reduce((sum, file) => sum + safeNumber(file.size, 0), 0),
        label: "Preparando subida...",
      };

      scheduleModalRender();

      return await requestMultipartWithProgress(path, formData, {
        method: "POST",
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status || error?.statusCode))) {
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
    { method: "POST", path: `/api/tickets/${encodedTicketId}/comments` },
    { method: "POST", path: `/api/incidencias/${encodedTicketId}/comments` },
    { method: "POST", path: `/api/tickets/${encodedTicketId}/messages` },
    { method: "POST", path: `/api/incidencias/${encodedTicketId}/messages` },
    { method: "PATCH", path: `/api/tickets/${encodedTicketId}` },
    { method: "PATCH", path: `/api/incidencias/${encodedTicketId}` },
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await requestJson(candidate.path, {
        method: candidate.method,
        body: payload,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status || error?.statusCode))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo añadir la actualización.");
}

async function reopenTicketInternal(ticketId = "") {
  const id = safeText(ticketId, "");
  if (!id) throw new Error("No se pudo identificar la incidencia.");

  const encodedTicketId = encodeUrlPathSegment(id);

  const payload = {
    status: "open",
    estado: "open",
  };

  const candidates = [
    { method: "POST", path: `/api/tickets/${encodedTicketId}/reopen` },
    { method: "POST", path: `/api/incidencias/${encodedTicketId}/reopen` },
    { method: "PATCH", path: `/api/tickets/${encodedTicketId}` },
    { method: "PATCH", path: `/api/incidencias/${encodedTicketId}` },
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await requestJson(candidate.path, {
        method: candidate.method,
        body: payload,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;

      if (![404, 405].includes(Number(error?.status || error?.statusCode))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo reabrir la incidencia.");
}

async function refreshCurrentDetail(ticketId = "", fallback = {}) {
  const id = safeText(ticketId, "");

  if (!id) return getDetail(fallback);

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

async function callExternalAction(action = "", payload = {}) {
  const actionName = safeText(action, "");
  if (!actionName) return null;

  const candidates = [
    AppCore?.modules?.IncidenciasModalActions?.[actionName],
    AppCore?.modules?.IncidenciasActions?.[actionName],
    AppCore?.modules?.Incidencias?.[actionName],
    isBrowser() ? window.OnionIncidenciasModalActions?.[actionName] : null,
    isBrowser() ? window.OnionIncidenciasActions?.[actionName] : null,
    isBrowser() ? window.IncidenciasActions?.[actionName] : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "function") continue;
    return await candidate(payload);
  }

  return null;
}

/* =========================================================
   TIMELINE
========================================================= */

function cleanTimelineText(value = "") {
  return safeText(value, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatChange(change = {}) {
  const item = safeObject(change);
  const field = safeText(item.field, "").toLowerCase();
  const action = safeText(item.action, "").toLowerCase();

  if (["comments", "comment", "messages", "message", "notes", "note"].includes(field)) {
    return "";
  }

  if (field === "attachments") {
    const added = safeNumber(item.added, 0);
    const removed = safeNumber(item.removed, 0);

    if (action === "remove" || removed > 0) {
      return removed === 1 ? "Se eliminó 1 adjunto." : `Se eliminaron ${removed} adjuntos.`;
    }

    if (added > 0) {
      return added === 1 ? "Se añadió 1 adjunto." : `Se añadieron ${added} adjuntos.`;
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
    return "Descripción actualizada.";
  }

  if (field === "categoria" || field === "category") {
    return `Categoría actualizada: ${safeText(item.from, "—")} → ${safeText(item.to, "—")}.`;
  }

  if (field) return `${field} actualizado.`;

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

      let title = safeText(first(item.title, item.action, item.type), "Actualización");
      let body = cleanTimelineText(
        first(item.description, item.detail, item.body, item.message, item.text, "")
      );

      if (type === "created") {
        title = "Incidencia creada";
        body = safeText(body, "La incidencia fue registrada.");
      }

      if (type === "attachments_added") {
        title = "Adjuntos añadidos";
        const changeLines = changes.map(formatChange).filter(Boolean);
        body = cleanTimelineText(body || changeLines.join("\n"));
        body = safeText(body, "Se añadieron adjuntos.");
      }

      if (type === "update") {
        const changeLines = changes.map(formatChange).filter(Boolean);
        const changesBody = cleanTimelineText(changeLines.join("\n"));

        title = "Actualización";
        body = cleanTimelineText(changesBody || body);
      }

      return {
        id: safeText(first(item.id, item.eventId), `h-${index + 1}`),
        kind: "event",
        type,
        title,
        body,
        author: safeText(first(item.byName, item.user, item.author, item.name), "Sistema"),
        createdAt: first(item.createdAt, item.date, item.timestamp),
      };
    })
    .filter((entry) => {
      const title = safeText(entry.title, "").toLowerCase();
      const body = normalizeWhitespace(entry.body).toLowerCase();

      if (entry.type === "update" && !body) return false;
      if (title === "update" && body === "update") return false;
      if (title === "actualización" && body === "update") return false;

      if (
        entry.type === "update" &&
        /^(comments|comment|messages|message|notes|note)\s+actualizado\.?$/i.test(body)
      ) {
        return false;
      }

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
        body: cleanTimelineText(first(item.message, item.text, item.body, item.comment, "")),
        author: safeText(first(item.byName, item.user, item.author, item.name), "Usuario"),
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
   VISUAL CLASS HELPERS
========================================================= */

function getStatusClassKey(value = "") {
  const key = normalizeKey(value);

  if (["open", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente"].includes(key)) return "pending";

  if (
    ["progress", "in_progress", "inprogress", "en_proceso", "proceso", "working", "trabajando"]
      .includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado", "archived", "archivada"].includes(key)) return "closed";

  return "neutral";
}

function getPriorityClassKey(value = "") {
  const key = normalizeKey(value);

  if (["low", "baja", "minor", "p3"].includes(key)) return "low";
  if (["medium", "media", "normal", "p2"].includes(key)) return "medium";
  if (["high", "alta", "urgent", "urgente", "p1"].includes(key)) return "high";

  if (["critical", "critica", "critico", "crítica", "crítico", "p0"].includes(key)) {
    return "critical";
  }

  return "medium";
}

function getFeedbackClassKey(value = "info") {
  const key = normalizeKey(value);

  if (["success", "ok", "done"].includes(key)) return "success";
  if (["error", "danger", "fail", "failed"].includes(key)) return "error";
  if (["warning", "warn"].includes(key)) return "warning";

  return "info";
}

function renderChip(label = "", modifier = "neutral") {
  const key = normalizeKey(modifier) || "neutral";

  return `
    <span class="incidencias-modal-chip incidencias-modal-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   SVG ICONS
========================================================= */

function getAttachmentDownloadIconSvg() {
  return `
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      class="incidencias-modal-svg-icon"
    >
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function getAttachmentViewIconSvg() {
  return `
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      class="incidencias-modal-svg-icon"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        stroke-width="2"
      />
    </svg>
  `;
}

/* =========================================================
   RENDER PARTIALS
========================================================= */

function renderAvatar(detail = {}) {
  const clientName = getClientName(detail);
  const initials = safeText(detail.initials, getInitials(clientName || "ON"));
  const avatarUrl = getClientAvatar(detail);
  const theme = safeText(
    getAvatarTheme(safeText(first(detail.ticketId, clientName), "onion")),
    "violet"
  );

  if (avatarUrl) {
    return `
      <div
        class="incidencias-modal-avatar incidencias-modal-avatar--${escapeHtml(theme)}"
        ${tooltipAttrs(clientName, clientName)}
      >
        <div
          class="incidencias-modal-avatar-frame"
          data-modal-avatar-frame="true"
          data-fallback="false"
        >
          <img
            src="${escapeHtml(avatarUrl)}"
            alt="${escapeHtml(clientName)}"
            loading="lazy"
            referrerpolicy="no-referrer"
            data-modal-avatar-img="true"
          />

          <span class="incidencias-modal-avatar-fallback">
            ${escapeHtml(initials)}
          </span>
        </div>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-modal-avatar incidencias-modal-avatar--${escapeHtml(theme)}"
      ${tooltipAttrs(clientName, clientName)}
    >
      <div
        class="incidencias-modal-avatar-frame incidencias-modal-avatar-frame--fallback"
        data-modal-avatar-frame="true"
        data-fallback="true"
      >
        <span class="incidencias-modal-avatar-fallback">
          ${escapeHtml(initials)}
        </span>
      </div>
    </div>
  `;
}

function renderMetaField(label = "", value = "") {
  return `
    <div class="incidencias-modal-meta-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(safeText(value, "—"))}</strong>
    </div>
  `;
}

function renderFeedbackBox() {
  const message = safeText(modalState.feedbackMessage, "");
  if (!message) return "";

  const type = getFeedbackClassKey(modalState.feedbackType);

  return `
    <div class="incidencias-modal-feedback incidencias-modal-feedback--${escapeHtml(type)}">
      <strong>
        ${
          type === "error"
            ? "No se ha podido completar la acción"
            : type === "success"
              ? "Acción completada"
              : type === "warning"
                ? "Aviso"
                : "Información"
        }
      </strong>

      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderInlineSpinner(label = "") {
  return `
    <span class="incidencias-modal-inline-spinner">
      <span aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderUploadProgress() {
  const progress = safeObject(modalState.uploadProgress);

  if (!progress.active) return "";

  const percent = Math.max(0, Math.min(100, safeNumber(progress.percent, 0)));
  const loaded = formatBytes(progress.loaded);
  const total = formatBytes(progress.total);

  return `
    <div
      class="incidencias-modal-upload-progress"
      aria-live="polite"
      data-progress="${escapeHtml(String(percent))}"
    >
      <div class="incidencias-modal-upload-progress-head">
        <strong>${escapeHtml(safeText(progress.label, "Subiendo archivos..."))}</strong>
        <span>${escapeHtml(percent ? `${percent}%` : "Procesando")}</span>
      </div>

      <progress
        class="incidencias-modal-upload-progress-native"
        value="${escapeHtml(String(percent))}"
        max="100"
        aria-label="${escapeHtml(safeText(progress.label, "Subiendo archivos"))}"
      ></progress>

      ${
        loaded || total
          ? `
            <div class="incidencias-modal-upload-progress-meta">
              ${escapeHtml([loaded, total ? `de ${total}` : ""].filter(Boolean).join(" "))}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderPendingFiles() {
  const files = safeArray(modalState.pendingFiles);

  if (!files.length) {
    return `
      <div class="incidencias-modal-pending-empty">
        No has seleccionado archivos nuevos.
      </div>
    `;
  }

  return `
    <div class="incidencias-modal-pending-list">
      ${files
        .map(
          (file, index) => `
            <div class="incidencias-modal-pending-file">
              <div>
                <strong>${escapeHtml(file.name || `archivo_${index + 1}`)}</strong>
                <span>
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

function renderComposer() {
  const draft = safeText(modalState.commentDraft, "");

  return `
    <section class="incidencias-modal-composer">
      <div class="incidencias-modal-composer-head">
        <div class="incidencias-modal-composer-icon" aria-hidden="true">
          +
        </div>

        <div class="incidencias-modal-composer-copy">
          <h3>Añadir comentario y adjuntos</h3>
          <span>
            Redacta la actualización y adjunta archivos en este mismo bloque.
          </span>
        </div>
      </div>

      <textarea
        id="incidencias-modal-comment-input"
        data-modal-field="comment"
        placeholder="Ejemplo: He probado de nuevo, el error sigue apareciendo al iniciar sesión. Adjunto captura..."
        ${modalState.isSubmitting ? "disabled" : ""}
        class="incidencias-modal-comment-textarea"
      >${escapeHtml(draft)}</textarea>

      <div class="incidencias-modal-composer-foot">
        <span>
          Al pulsar “Actualizar incidencia”, se enviará esta información y la incidencia volverá a estado abierta.
        </span>
      </div>

      ${renderUploadProgress()}

      <label
        for="incidencias-modal-attachments-input"
        class="incidencias-modal-dropzone"
      >
        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-modal-field="attachments"
          multiple
          ${modalState.isSubmitting ? "disabled" : ""}
        />

        <span>Seleccionar archivos</span>
        <small>Imágenes, PDFs y documentos de soporte</small>
      </label>

      ${renderPendingFiles()}
    </section>
  `;
}

function getAttachmentBusyMeta(file = {}) {
  const attachmentId = safeText(file.id, "");

  return {
    attachmentId,
    isOpening: Boolean(attachmentId && modalState.openingAttachmentId === attachmentId),
    isDownloading: Boolean(attachmentId && modalState.downloadingAttachmentId === attachmentId),
  };
}

function renderAttachmentActionButtons(file = {}) {
  const busy = getAttachmentBusyMeta(file);
  const isImage = isImageLikeAttachment(file);

  return `
    <div class="incidencias-modal-attachment-actions">
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${busy.isOpening || modalState.isSubmitting ? "disabled" : ""}
        class="incidencias-modal-view-btn"
        ${tooltipAttrs(isImage ? "Ampliar imagen" : "Ver documento", `${isImage ? "Ampliar imagen" : "Ver documento"} ${file.name || file.filename || "archivo"}`)}
      >
        ${
          busy.isOpening
            ? renderInlineSpinner("Abriendo...")
            : `
              <span class="incidencias-modal-action-icon">
                ${getAttachmentViewIconSvg()}
              </span>
              <span>${isImage ? "Ampliar" : "Ver"}</span>
            `
        }
      </button>

      <button
        type="button"
        data-modal-action="download-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${busy.isDownloading || modalState.isSubmitting ? "disabled" : ""}
        class="incidencias-modal-download-btn"
        ${tooltipAttrs("Descargar", `Descargar ${file.name || file.filename || "archivo"}`)}
      >
        ${
          busy.isDownloading
            ? renderInlineSpinner("Bajando...")
            : `
              <span class="incidencias-modal-action-icon">
                ${getAttachmentDownloadIconSvg()}
              </span>
              <span>Descargar</span>
            `
        }
      </button>
    </div>
  `;
}

function renderAttachmentPreviewSquare(file = {}) {
  const isImage = isImageLikeAttachment(file);

  if (!isImage) {
    return `
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        class="incidencias-modal-file-square"
        aria-label="Ver ${escapeHtml(file.name || file.filename || "archivo")}"
      >
        <span>DOC</span>
      </button>
    `;
  }

  const storedUrl = getStoredThumbnailUrl(file.id);

  const directUrl = safeText(
    first(
      storedUrl,
      !looksLikeProtectedApiUrl(file.viewUrl) ? file.viewUrl : "",
      !looksLikeProtectedApiUrl(file.openUrl) ? file.openUrl : "",
      !looksLikeProtectedApiUrl(file.signedUrl) ? file.signedUrl : "",
      !looksLikeProtectedApiUrl(file.url) ? file.url : "",
      !looksLikeProtectedApiUrl(file.blobUrl) ? file.blobUrl : "",
      !looksLikeProtectedApiUrl(file.publicUrl) ? file.publicUrl : ""
    ),
    ""
  );

  const loading = (() => {
    try {
      return modalState.thumbnailLoadingIds.has(safeText(file.id, ""));
    } catch {
      return false;
    }
  })();

  if (!directUrl) {
    return `
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        class="incidencias-modal-file-square incidencias-modal-file-square--image"
        aria-label="Ampliar ${escapeHtml(file.name || file.filename || "imagen")}"
      >
        <span>${loading ? "..." : "IMG"}</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-modal-action="open-attachment"
      data-attachment-id="${escapeHtml(file.id)}"
      class="incidencias-modal-image-thumb-wrap"
      aria-label="Ampliar ${escapeHtml(file.name || file.filename || "imagen adjunta")}"
      data-modal-thumb-frame="true"
      data-thumb-error="false"
    >
      <img
        src="${escapeHtml(directUrl)}"
        alt="${escapeHtml(file.name || file.filename || "Imagen adjunta")}"
        loading="lazy"
        referrerpolicy="no-referrer"
        class="incidencias-modal-image-thumb"
        data-modal-thumb-img="true"
      />

      <span class="incidencias-modal-image-thumb-fallback">IMG</span>

      <span class="incidencias-modal-image-open-badge">
        Ampliar
      </span>
    </button>
  `;
}

function renderAttachments(detail = {}) {
  const files = getAttachments(detail);

  return `
    <div class="incidencias-modal-files-block incidencias-modal-files-block--compact">
      <section class="incidencias-modal-current-files">
        <div class="incidencias-modal-section-head">
          <h3>Documentos actuales</h3>
          <span>${escapeHtml(String(files.length))} adjunto${files.length === 1 ? "" : "s"}</span>
        </div>

        ${
          !files.length
            ? `
              <div class="incidencias-modal-empty-box">
                No hay archivos adjuntos en esta incidencia.
              </div>
            `
            : `
              <div class="incidencias-modal-attachments-grid">
                ${files
                  .map(
                    (file) => `
                      <article class="incidencias-modal-attachment-card">
                        <div class="incidencias-modal-attachment-row">
                          ${renderAttachmentPreviewSquare(file)}

                          <div class="incidencias-modal-attachment-copy">
                            <strong>${escapeHtml(file.name)}</strong>

                            <span>
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
      </section>
    </div>
  `;
}

function renderAttachmentPreview() {
  const file = safeObject(modalState.previewFile);
  const url = safeText(file.url, "");

  if (!url) return "";

  const filename = safeText(first(file.filename, file.name), "Documento");
  const type = getAttachmentPreviewType(file);
  const size = formatBytes(file.size);
  const image = isPreviewImage(file);
  const pdf = isPreviewPdf(file);
  const meta = [type || "Vista previa", size].filter(Boolean).join(" · ");

  return `
    <section class="incidencias-modal-preview">
      <div class="incidencias-modal-preview-head">
        <div class="incidencias-modal-preview-copy">
          <strong>${escapeHtml(filename)}</strong>
          <span>${escapeHtml(meta || "Documento preparado")}</span>
        </div>

        <div class="incidencias-modal-preview-actions">
          ${
            !image
              ? `
                <button
                  type="button"
                  data-modal-action="download-preview"
                  class="incidencias-modal-preview-btn"
                >
                  Descargar
                </button>
              `
              : ""
          }

          <button
            type="button"
            data-modal-action="close-preview"
            class="incidencias-modal-preview-btn"
            aria-label="Cerrar vista previa"
          >
            Cerrar vista
          </button>
        </div>
      </div>

      <div class="incidencias-modal-preview-frame ${image ? "is-image" : ""}">
        ${
          image
            ? `
              <img
                src="${escapeHtml(url)}"
                alt="${escapeHtml(filename)}"
                class="incidencias-modal-preview-image"
              />
            `
            : `
              <iframe
                src="${escapeHtml(url)}"
                title="${escapeHtml(filename)}"
                class="incidencias-modal-preview-iframe"
                loading="lazy"
                referrerpolicy="no-referrer"
              ></iframe>
            `
        }
      </div>

      ${
        !image && !pdf
          ? `
            <p class="incidencias-modal-preview-note">
              Si el navegador no puede previsualizar este tipo de archivo, usa “Descargar”.
            </p>
          `
          : ""
      }
    </section>
  `;
}

function renderTimeline(detail = {}) {
  const timeline = getTimeline(detail);

  if (!timeline.length) {
    return `
      <div class="incidencias-timeline-empty">
        Sin actividad
      </div>
    `;
  }

  return `
    <div class="incidencias-timeline-list">
      ${timeline
        .map((entry) => {
          const kind = safeText(entry.kind, "event");
          const type = safeText(entry.type, "update");
          const rawTitle = safeText(entry.title, "");
          const rawBody = cleanTimelineText(entry.body);

          const isComment = kind === "comment";
          const isCreated = type === "created";

          const title =
            rawTitle ||
            (isComment
              ? "Comentario"
              : isCreated
                ? "Incidencia creada"
                : "Actualización");

          return `
            <article class="incidencias-timeline-card ${isComment ? "is-comment" : ""} ${isCreated ? "is-created" : ""}">
              <div class="incidencias-timeline-accent"></div>

              <div class="incidencias-timeline-main">
                <div class="incidencias-timeline-title-row">
                  <strong class="incidencias-timeline-title">
                    ${escapeHtml(title)}
                  </strong>

                  <span class="incidencias-timeline-kind">
                    ${escapeHtml(isComment ? "Comentario" : isCreated ? "Sistema" : "Cambio")}
                  </span>
                </div>

                <p class="incidencias-timeline-body">
                  ${escapeHtml(rawBody || "Actualización registrada.")}
                </p>
              </div>

              <div class="incidencias-timeline-meta">
                <strong>${escapeHtml(safeText(entry.author, "Sistema"))}</strong>
                <span>${escapeHtml(formatDate(entry.createdAt))}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLoadingOverlay(label = "Procesando...") {
  return `
    <div class="incidencias-modal-loading-overlay">
      <div class="incidencias-modal-loading-box">
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

function renderFooter(detail = {}) {
  const ticketId = getDisplayTicketId(detail);

  return `
    <footer class="incidencias-modal-footer">
      <button
        type="button"
        data-modal-action="submit-update"
        data-ticket-id="${escapeHtml(ticketId)}"
        ${modalState.isSubmitting ? "disabled" : ""}
        class="incidencias-modal-submit-btn"
      >
        ${
          modalState.isSubmitting
            ? renderInlineSpinner("Actualizando...")
            : "Actualizar incidencia"
        }
      </button>
    </footer>
  `;
}

/* =========================================================
   MODAL RENDER
========================================================= */

function renderModalInner(detail = {}) {
  const item = getDetail(detail);
  const ticketId = getDisplayTicketId(item);

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

  const statusClass = getStatusClassKey(statusRaw);
  const priorityClass = getPriorityClassKey(priorityRaw);

  const busyLabel = modalState.isSubmitting ? "Actualizando incidencia..." : "";

  return `
    <div
      data-incidencias-modal-overlay="true"
      class="incidencias-modal-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-modal-title"
        tabindex="-1"
        class="incidencias-modal-panel"
      >
        ${busyLabel ? renderLoadingOverlay(busyLabel) : ""}

        <header class="incidencias-modal-header">
          <div class="incidencias-modal-hero">
            ${renderAvatar(item)}

            <div class="incidencias-modal-hero-content">
              <div class="incidencias-modal-hero-chips">
                <button
                  type="button"
                  data-modal-action="copy"
                  data-ticket-id="${escapeHtml(ticketId)}"
                  class="incidencias-modal-id-chip"
                  ${tooltipAttrs("Copiar ID", "Copiar ID")}
                >
                  ${escapeHtml(ticketId)}
                </button>

                ${renderChip(statusLabel, `status-${statusClass}`)}
                ${renderChip(priorityLabel, `priority-${priorityClass}`)}
              </div>

              <h2
                id="incidencias-modal-title"
                class="incidencias-modal-title"
              >
                ${escapeHtml(title)}
              </h2>

              <span class="incidencias-modal-updated">
                Última actualización ${escapeHtml(updatedAgo)}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${modalState.isSubmitting ? "disabled" : ""}
            class="incidencias-modal-close-btn"
          >
            ✕
          </button>
        </header>

        <main class="incidencias-modal-body">
          ${renderFeedbackBox()}

          ${renderAttachmentPreview()}

          <div class="incidencias-modal-meta-grid">
            ${renderMetaField("Técnico", tecnico)}
            ${renderMetaField("Factura", facturaRelacionada)}
            ${renderMetaField("Creada", createdAt)}
            ${renderMetaField("Adjuntos", String(attachments.length))}
          </div>

          <section class="incidencias-modal-description-section">
            <div class="incidencias-modal-section-head">
              <h3>Descripción de la incidencia</h3>
            </div>

            <div class="incidencias-modal-description-box">
              ${escapeHtml(description)}
            </div>
          </section>

          ${renderComposer(item)}

          ${renderAttachments(item)}

          <section class="incidencias-modal-history-section">
            <div class="incidencias-modal-section-head">
              <h3>Historial y actividad</h3>
            </div>

            ${renderTimeline(item)}
          </section>

          ${renderFooter(item)}
        </main>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  if (!isBrowser()) return null;
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const existing = Array.from(document.querySelectorAll(`#${MODAL_ID}`));
  let root = existing[0];

  existing.slice(1).forEach((duplicate) => {
    try {
      duplicate.remove();
    } catch {}
  });

  if (root) return root;

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  if (!isBrowser() || !document.body) return false;
  if (modalState.bodyLocked) return true;

  try {
    modalState.bodyOverflowBeforeLock = safeText(document.body.style?.overflow, "");
  } catch {
    modalState.bodyOverflowBeforeLock = "";
  }

  try {
    document.body.classList.add("modal-open");
    document.body.classList.add("incidencias-modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}

  modalState.bodyLocked = true;

  return true;
}

function unlockBody() {
  if (!isBrowser() || !document.body) return false;
  if (!modalState.bodyLocked) return true;

  try {
    document.body.classList.remove("modal-open");
    document.body.classList.remove("incidencias-modal-open");
  } catch {}

  try {
    document.body.style.overflow = safeText(modalState.bodyOverflowBeforeLock, "");
  } catch {}

  modalState.bodyOverflowBeforeLock = "";
  modalState.bodyLocked = false;

  return true;
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

function detachEscHandler() {
  if (!modalState.escHandler || !isBrowser()) return;

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  if (!isBrowser()) return;

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

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal({ preserveFocus = true } = {}) {
  const root = ensureRoot();

  if (!root) return null;

  if (!modalState.detail) {
    detachRootBindings();
    root.innerHTML = "";
    modalState.lastRenderedHash = "";
    return root;
  }

  const detailHash = getObjectHash(modalState.detail);
  const renderHash = [
    detailHash,
    modalState.isSubmitting ? "submitting" : "idle",
    modalState.feedbackType,
    modalState.feedbackMessage,
    modalState.commentDraft,
    modalState.pendingFiles.length,
    modalState.uploadProgress.active,
    modalState.uploadProgress.percent,
    modalState.openingAttachmentId,
    modalState.downloadingAttachmentId,
    safeText(modalState.previewFile?.url, ""),
    Array.from(modalState.thumbnailObjectUrls.keys()).join("|"),
  ].join("::");

  if (renderHash === modalState.lastRenderedHash && root.innerHTML) {
    attachRootBindings();
    return root;
  }

  const activeId = preserveFocus ? safeText(document.activeElement?.id, "") : "";

  detachRootBindings();
  root.innerHTML = renderModalInner(modalState.detail);
  modalState.lastRenderedHash = renderHash;
  modalState.bindingsAttached = false;

  attachRootBindings();

  if (activeId) {
    try {
      document.getElementById(activeId)?.focus?.();
    } catch {}
  }

  return root;
}

function scheduleModalRender() {
  if (modalState.renderQueued) return;

  modalState.renderQueued = true;

  const run = () => {
    modalState.renderQueued = false;

    if (!modalState.isOpen) return;

    renderModal({
      preserveFocus: true,
    });
  };

  try {
    requestAnimationFrame(run);
  } catch {
    setTimeout(run, 0);
  }
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

function shouldIgnoreDuplicateOpen(ticketId = "", detail = {}) {
  const id = safeText(ticketId, "");
  if (!id || !modalState.isOpen) return false;

  const now = Date.now();
  const hash = getObjectHash(detail);

  const sameTicket = id === modalState.openTicketId;
  const sameHash = hash === modalState.lastOpenHash;
  const tooSoon = now - safeNumber(modalState.lastOpenAt, 0) < DUPLICATE_OPEN_WINDOW_MS;

  return sameTicket && (sameHash || tooSoon);
}

export function openIncidenciasModal(detail = {}, options = {}) {
  if (!isBrowser()) return false;

  const nextDetail = getDetail(detail);
  const ticketId = getTicketId(nextDetail);
  const now = Date.now();
  const hash = getObjectHash(nextDetail);

  if (shouldIgnoreDuplicateOpen(ticketId, nextDetail)) {
    if (modalState.isOpen && ticketId === modalState.openTicketId) {
      updateIncidenciasModal(nextDetail, {
        silent: true,
        preserveTransient: true,
        preserveFocus: true,
      });
    }

    return true;
  }

  const wasOpen = modalState.isOpen;
  const previousTicketId = modalState.openTicketId;

  if (!wasOpen) {
    modalState.lastActiveElement = document.activeElement || null;
  }

  const newTicket = ticketId && ticketId !== previousTicketId;

  modalState.detail = nextDetail;
  modalState.isOpen = true;
  modalState.openTicketId = ticketId;
  modalState.lastOpenAt = now;
  modalState.lastOpenHash = hash;

  if (!wasOpen || newTicket) {
    resetTransientStateForNewTicket();
  }

  renderModal({
    preserveFocus: wasOpen,
  });

  lockBody();
  attachEscHandler();

  if (!wasOpen) {
    focusPanel();
  }

  if (!options.silent && !wasOpen) {
    safeEmit("incidencias:modal:opened", {
      detail: modalState.detail,
      ticketId,
    });
  }

  return true;
}

export function closeIncidenciasModal(options = {}) {
  if (modalState.isSubmitting && !options.force) return false;

  const root = getRoot();

  modalState.isOpen = false;
  modalState.isSubmitting = false;
  modalState.detail = null;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];
  modalState.openTicketId = "";
  modalState.lastOpenHash = "";
  modalState.lastRenderedHash = "";

  clearUploadProgress();
  clearAttachmentPreview();
  clearFeedback();
  clearAttachmentBusyState();
  clearAttachmentActionKey();
  revokeAttachmentThumbnails();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();

  if (!options.skipFocusRestore) {
    restoreFocus();
  }

  if (!options.silent) {
    safeEmit("incidencias:modal:closed", {});
  }

  return true;
}

export function updateIncidenciasModal(detail = {}, options = {}) {
  const nextDetail = getDetail(detail);
  const ticketId = getTicketId(nextDetail);

  if (!modalState.isOpen) {
    return openIncidenciasModal(nextDetail, options);
  }

  const sameTicket = ticketId && ticketId === modalState.openTicketId;

  modalState.detail = nextDetail;
  modalState.openTicketId = ticketId || modalState.openTicketId;
  modalState.lastOpenHash = getObjectHash(nextDetail);

  if (!options.preserveTransient && !sameTicket) {
    resetTransientStateForNewTicket();
  } else {
    clearAttachmentBusyState();
    clearAttachmentActionKey();
  }

  if (!sameTicket) {
    revokeAttachmentThumbnails();
  }

  renderModal({
    preserveFocus: options.preserveFocus !== false,
  });

  if (options.focus !== false) {
    focusPanel();
  }

  return true;
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function waitForPaint() {
  return new Promise((resolve) => {
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    } catch {
      setTimeout(resolve, 0);
    }
  });
}

async function handleCopy(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    setFeedback("No hay ID disponible para copiar.", "error");
    renderModal();
    return false;
  }

  let copied = false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(id);
      copied = true;
    }
  } catch {}

  safeEmit("incidencias:modal:copy", { ticketId: id });

  if (copied) {
    setFeedback(`ID ${id} copiado al portapapeles.`, "success");
    showToast("ID copiado", "success");
  } else {
    setFeedback(`Se ha solicitado copiar el ID ${id}.`, "info");
    showToast("No se pudo copiar automáticamente el ID.", "info");
  }

  renderModal();
  return true;
}

async function handleSubmitUpdate(ticketId = "") {
  if (modalState.isSubmitting) return false;

  const id = safeText(ticketId, "");
  const message = normalizeWhitespace(modalState.commentDraft);
  const files = dedupeFiles(modalState.pendingFiles);

  if (!id) {
    setFeedback("No se ha podido identificar la incidencia.", "error");
    renderModal();
    return false;
  }

  if (!message && !files.length) {
    setFeedback(
      "Añade una actualización o selecciona al menos un archivo antes de continuar.",
      "error"
    );
    renderModal();
    return false;
  }

  if (message && message.length < 4) {
    setFeedback("Añade un poco más de detalle antes de enviar la actualización.", "error");
    renderModal();
    return false;
  }

  modalState.isSubmitting = true;
  clearFeedback();
  renderModal();

  await waitForPaint();

  try {
    let nextDetail = getDetail(modalState.detail);

    if (files.length) {
      const uploadResponse = await uploadTicketAttachmentsInternal({
        ticketId: id,
        files,
      });

      safeEmit("incidencias:modal:upload", {
        ticketId: id,
        files,
      });

      nextDetail = coerceDetailResponse(uploadResponse, nextDetail);
    }

    if (message) {
      const commentResponse = await commentTicketInternal({
        ticketId: id,
        message,
      });

      safeEmit("incidencias:modal:comment", {
        ticketId: id,
        message,
        status: "open",
      });

      nextDetail = mergeDetailWithOpenStatus(nextDetail, commentResponse);
    } else if (files.length) {
      try {
        const reopenResponse = await reopenTicketInternal(id);
        nextDetail = mergeDetailWithOpenStatus(nextDetail, reopenResponse);
      } catch {
        nextDetail = mergeDetailWithOpenStatus(nextDetail, null);
      }
    }

    nextDetail = await refreshCurrentDetail(id, nextDetail);

    modalState.detail = nextDetail;
    modalState.commentDraft = "";
    modalState.pendingFiles = [];

    revokeAttachmentThumbnails();

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
    clearUploadProgress();
    renderModal();
    focusPanel();
  }
}

function getAttachmentById(attachmentId = "") {
  const files = getAttachments(modalState.detail);

  return files.find((file) => safeText(file.id, "") === safeText(attachmentId, ""));
}

async function handleAttachmentAction(attachmentId = "", mode = "download") {
  const finalMode = mode === "open" ? "open" : "download";
  const attachment = getAttachmentById(attachmentId);
  const ticketId = getTicketId(modalState.detail);

  if (!attachment) {
    setFeedback("No se ha encontrado el adjunto solicitado.", "error");
    showToast("Adjunto no encontrado.", "error");
    renderModal();
    return false;
  }

  const actionKey = [
    safeText(ticketId, ""),
    safeText(attachment.id, ""),
    finalMode,
  ].join("::");

  if (modalState.attachmentActionKey === actionKey) return false;

  modalState.attachmentActionKey = actionKey;

  if (finalMode === "download") {
    modalState.downloadingAttachmentId = safeText(attachment.id, "");
  } else {
    modalState.openingAttachmentId = safeText(attachment.id, "");
  }

  renderModal();

  try {
    const externalActionName =
      finalMode === "download"
        ? "downloadTicketAttachment"
        : "openTicketAttachment";

    try {
      const externalResponse = await callExternalAction(externalActionName, {
        ticketId,
        attachment,
        detail: modalState.detail,
        mode: finalMode,
      });

      if (
        externalResponse &&
        (await openOrDownloadPayload(externalResponse, attachment, finalMode))
      ) {
        safeEmit("incidencias:modal:attachment", {
          ticketId,
          attachment,
          mode: finalMode,
          source: "external",
        });

        showToast(
          finalMode === "download"
            ? "Descarga iniciada."
            : "Documento cargado en la vista.",
          "success"
        );

        return true;
      }
    } catch {}

    const candidates = buildAttachmentCandidates(modalState.detail, attachment, finalMode);

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

          if (await openOrDownloadPayload(payload, attachment, finalMode)) {
            safeEmit("incidencias:modal:attachment", {
              ticketId,
              attachment,
              mode: finalMode,
              source: "api-json-or-blob",
              url: candidate,
            });

            showToast(
              finalMode === "download"
                ? "Descarga iniciada."
                : "Documento cargado en la vista.",
              "success"
            );

            return true;
          }
        } else {
          const file = normalizeAttachmentActionFile(
            {
              url: candidate,
              viewUrl: candidate,
              openUrl: candidate,
              downloadUrl: candidate,
              filename: attachment.name || attachment.filename,
              name: attachment.name || attachment.filename,
              contentType: attachment.contentType || attachment.type,
              size: attachment.size,
            },
            attachment,
            finalMode
          );

          if (!file?.url) throw new Error("ATTACHMENT_URL_EMPTY");

          if (finalMode === "download") {
            downloadResolvedAttachmentFile(file);
          } else {
            setAttachmentPreview(file);
          }

          safeEmit("incidencias:modal:attachment", {
            ticketId,
            attachment,
            mode: finalMode,
            source: "direct-url",
            url: candidate,
          });

          showToast(
            finalMode === "download"
              ? "Descarga iniciada."
              : "Documento cargado en la vista.",
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
        finalMode === "download"
          ? "No se pudo descargar el adjunto."
          : "No se pudo cargar el adjunto en la vista."
      ),
      "error"
    );

    showToast(
      finalMode === "download"
        ? "No se pudo descargar el adjunto."
        : "No se pudo cargar el adjunto.",
      "error"
    );

    return false;
  } finally {
    clearAttachmentBusyState();
    clearAttachmentActionKey();
    renderModal();
    focusPanel();
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function bindImageFallbacks(root) {
  root.querySelectorAll("[data-modal-avatar-img='true']").forEach((img) => {
    if (img.dataset.modalFallbackBound === "true") return;

    img.dataset.modalFallbackBound = "true";

    const frame = img.closest("[data-modal-avatar-frame='true']");

    const setFallback = () => {
      if (frame) {
        frame.setAttribute("data-fallback", "true");
        frame.classList.add("incidencias-modal-avatar-frame--fallback");
      }

      try {
        img.hidden = true;
      } catch {}
    };

    img.addEventListener("error", setFallback, {
      passive: true,
      signal: modalState.rootAbortController?.signal,
    });

    if (img.complete && img.naturalWidth === 0) {
      setFallback();
    }
  });

  root.querySelectorAll("[data-modal-thumb-img='true']").forEach((img) => {
    if (img.dataset.modalThumbFallbackBound === "true") return;

    img.dataset.modalThumbFallbackBound = "true";

    const frame = img.closest("[data-modal-thumb-frame='true']");

    const setFallback = () => {
      if (frame) {
        frame.setAttribute("data-thumb-error", "true");
      }

      try {
        img.hidden = true;
      } catch {}
    };

    img.addEventListener("error", setFallback, {
      passive: true,
      signal: modalState.rootAbortController?.signal,
    });

    if (img.complete && img.naturalWidth === 0) {
      setFallback();
    }
  });
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    const root = getRoot();
    if (root) bindImageFallbacks(root);
    hydrateAttachmentThumbnails();
    return;
  }

  const root = ensureRoot();
  if (!root) return;

  detachRootBindings();

  const controller = new AbortController();
  modalState.rootAbortController = controller;

  const onInput = (event) => {
    const target = event.target;
    if (!target?.closest) return;

    const field = target.closest("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "comment") {
      modalState.commentDraft = field.value || "";
    }
  };

  const onChange = (event) => {
    const target = event.target;
    if (!target?.closest) return;

    const field = target.closest("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "attachments") {
      modalState.pendingFiles = dedupeFiles([
        ...safeArray(modalState.pendingFiles),
        ...Array.from(field.files || []),
      ]);

      renderModal();
      focusPanel();
    }
  };

  const onClick = async (event) => {
    const target = event.target;
    if (!target?.closest) return;

    const closeBtn = target.closest("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();

      if (!modalState.isSubmitting) {
        closeIncidenciasModal();
      }

      return;
    }

    const copyBtn = target.closest('[data-modal-action="copy"]');

    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.ticketId || "");
      return;
    }

    const submitBtn = target.closest('[data-modal-action="submit-update"]');

    if (submitBtn) {
      event.preventDefault();
      await handleSubmitUpdate(submitBtn.dataset.ticketId || "");
      return;
    }

    const openAttachmentBtn = target.closest('[data-modal-action="open-attachment"]');

    if (openAttachmentBtn) {
      event.preventDefault();

      await handleAttachmentAction(
        openAttachmentBtn.dataset.attachmentId || "",
        "open"
      );

      return;
    }

    const downloadAttachmentBtn = target.closest('[data-modal-action="download-attachment"]');

    if (downloadAttachmentBtn) {
      event.preventDefault();

      await handleAttachmentAction(
        downloadAttachmentBtn.dataset.attachmentId || "",
        "download"
      );

      return;
    }

    const closePreviewBtn = target.closest('[data-modal-action="close-preview"]');

    if (closePreviewBtn) {
      event.preventDefault();

      clearAttachmentPreview();
      renderModal();
      focusPanel();

      return;
    }

    const downloadPreviewBtn = target.closest('[data-modal-action="download-preview"]');

    if (downloadPreviewBtn) {
      event.preventDefault();

      try {
        const file = safeObject(modalState.previewFile);

        if (!file?.url) throw new Error("PREVIEW_FILE_EMPTY");

        downloadResolvedAttachmentFile(file);
        showToast("Descarga iniciada.", "success");
      } catch {
        showToast("No se pudo descargar el documento.", "error");
      }

      return;
    }

    const removePendingBtn = target.closest('[data-modal-action="remove-pending-file"]');

    if (removePendingBtn) {
      event.preventDefault();

      const index = safeNumber(removePendingBtn.dataset.fileIndex, -1);

      if (index >= 0) {
        modalState.pendingFiles = safeArray(modalState.pendingFiles).filter(
          (_, i) => i !== index
        );

        renderModal();
        focusPanel();
      }

      return;
    }

    const overlay = target.closest("[data-incidencias-modal-overlay='true']");
    const panel = target.closest("[data-incidencias-modal-panel='true']");

    if (
      overlay &&
      !panel &&
      target === overlay &&
      !modalState.isSubmitting
    ) {
      closeIncidenciasModal();
    }
  };

  root.addEventListener("input", onInput, {
    signal: controller.signal,
  });

  root.addEventListener("change", onChange, {
    signal: controller.signal,
  });

  root.addEventListener("click", onClick, {
    signal: controller.signal,
  });

  modalState.bindingsAttached = true;

  bindImageFallbacks(root);
  hydrateAttachmentThumbnails();
}

function detachRootBindings() {
  try {
    modalState.rootAbortController?.abort?.();
  } catch {}

  modalState.rootAbortController = null;
  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function extractEventPayload(event) {
  return event?.detail || event || null;
}

function extractDetailFromEvent(event) {
  const payload = extractEventPayload(event);

  return (
    payload?.detail ||
    payload?.ticket ||
    payload?.item ||
    payload?.data ||
    payload?.incidencia ||
    payload
  );
}

async function handleOpenEvent(event) {
  const detail = extractDetailFromEvent(event);
  if (!detail) return;

  const normalized = getDetail(detail);
  const ticketId = getTicketId(normalized);

  openIncidenciasModal(normalized, {
    source: "event",
  });

  const hasUsefulDetail = Boolean(
    first(
      normalized.subject,
      normalized.title,
      normalized.description,
      normalized.descripcion,
      normalized.message,
      normalized.raw?.subject,
      normalized.raw?.title,
      normalized.raw?.description,
      normalized.raw?.message
    )
  );

  if (ticketId && !hasUsefulDetail) {
    try {
      const response = await fetchTicketDetailInternal(ticketId);
      const nextDetail = coerceDetailResponse(response, normalized);

      updateIncidenciasModal(nextDetail, {
        silent: true,
        preserveTransient: true,
        preserveFocus: true,
        focus: false,
      });
    } catch {}
  }
}

function handleCloseEvent() {
  closeIncidenciasModal();
}

function handleOpenedDetailEvent(event) {
  if (modalState.isSubmitting) return;

  const detail = extractDetailFromEvent(event);
  if (!detail) return;

  const normalized = getDetail(detail);
  const ticketId = getTicketId(normalized);

  if (!ticketId) return;

  if (!modalState.isOpen) {
    openIncidenciasModal(normalized, {
      source: "open-success",
      silent: true,
    });
    return;
  }

  updateIncidenciasModal(normalized, {
    silent: true,
    preserveTransient: ticketId === modalState.openTicketId,
    preserveFocus: true,
    focus: false,
  });
}

function handleUpdateEvent(event) {
  if (modalState.isSubmitting) return;

  const detail = extractDetailFromEvent(event);
  if (!detail) return;

  updateIncidenciasModal(detail, {
    preserveTransient: true,
    preserveFocus: true,
    focus: false,
  });
}

function handleCommentSuccess(event) {
  if (modalState.isSubmitting) return;

  const detail = extractDetailFromEvent(event);
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

  revokeAttachmentThumbnails();

  setFeedback(
    "Tu actualización se ha registrado correctamente y la incidencia vuelve a abierta.",
    "success"
  );

  renderModal();
  focusPanel();
}

function handleUploadSuccess(event) {
  if (modalState.isSubmitting) return;

  const detail = extractDetailFromEvent(event);
  if (!detail || !modalState.isOpen) return;

  modalState.pendingFiles = [];
  modalState.detail = getDetail(detail);

  revokeAttachmentThumbnails();

  setFeedback("Los documentos se han añadido correctamente.", "success");

  renderModal();
  focusPanel();
}

function attachBus() {
  if (modalState.busAttached) return;

  modalState.busDisposers = [
    safeOn("incidencias:modal:open", handleOpenEvent),
    safeOn("incidencias:modal:close", handleCloseEvent),
    safeOn("incidencias:modal:update", handleUpdateEvent),
    safeOn("incidencias:open:success", handleOpenedDetailEvent),
    safeOn("incidencias:comment:success", handleCommentSuccess),
    safeOn("incidencias:upload:success", handleUploadSuccess),
  ];

  modalState.busAttached = true;
}

function detachBus() {
  if (!modalState.busAttached) return;

  safeArray(modalState.busDisposers).forEach((dispose) => {
    try {
      dispose();
    } catch {}
  });

  modalState.busDisposers = [];
  modalState.busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasModal = {
  version: MODAL_VERSION,

  open(detail = {}, options = {}) {
    return openIncidenciasModal(detail, options);
  },

  close(options = {}) {
    return closeIncidenciasModal(options);
  },

  update(detail = {}, options = {}) {
    return updateIncidenciasModal(detail, options);
  },

  setFeedback(message = "", type = "info") {
    setFeedback(message, type);

    if (modalState.isOpen) {
      renderModal();
    }

    return true;
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
      pendingFiles: [...safeArray(modalState.pendingFiles)],
      previewFile: modalState.previewFile ? { ...modalState.previewFile } : null,
      uploadProgress: { ...safeObject(modalState.uploadProgress) },
      thumbnailObjectUrls: Array.from(modalState.thumbnailObjectUrls?.keys?.() || []),
      thumbnailLoadingIds: Array.from(modalState.thumbnailLoadingIds?.values?.() || []),
      thumbnailFailedIds: Array.from(modalState.thumbnailFailedIds?.values?.() || []),
    };
  },

  destroy(options = {}) {
    closeIncidenciasModal({
      force: true,
      silent: Boolean(options.silent),
      skipFocusRestore: true,
    });

    clearAttachmentPreview();
    revokeAttachmentThumbnails();
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

/* =========================================================
   SINGLETON BOOT
========================================================= */

try {
  if (isBrowser()) {
    const previous = window[INSTANCE_KEY];

    if (
      previous &&
      previous.version !== MODAL_VERSION &&
      typeof previous.destroy === "function"
    ) {
      previous.destroy({
        silent: true,
      });
    }

    window[INSTANCE_KEY] = OnionIncidenciasModal;
    window.OnionIncidenciasModal = OnionIncidenciasModal;
    window.renderIncidenciaTicketModal = OnionIncidenciasModal.open;
  }
} catch {}

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasModal;

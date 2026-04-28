/* =========================================================
   Onion SPA - Incidencias Create Modal
   Archivo: src/views/incidencias/incidencias.create.modal.js

   INCIDENCIAS EXPERIENCE PRO · CREATE MODAL · FINAL DEFINITIVO
   PATCH · MODAL ALIGNED · BUTTON HOVER ELEVATION · TOKENS 10/10
   PATCH · USER SEARCH NO FLICKER · SLOT PATCHING 10/10

   RESPONSABILIDADES:
   - abrir/cerrar modal de creación de incidencia
   - crear incidencia normal para usuario autenticado
   - crear incidencia para usuario objetivo si el usuario tiene permisos
   - buscar usuarios de forma segura y desacoplada
   - validar campos obligatorios
   - validar adjuntos iniciales
   - enviar multipart/form-data real
   - emitir incidencias:create:success para refrescar la vista
   - persistir draft mínimo mientras el modal está abierto
   - evitar doble submit y doble binding
   - mostrar loader overlay premium al crear incidencia
   - alinear visualmente modal con variables.css / ui.css
   - aplicar hover/elevación/active fino en botones y acciones
   - evitar parpadeo del modal al buscar usuarios
   - actualizar búsqueda por slots sin reconstruir el panel completo
========================================================= */

import { AppCore } from "../../core/index.js";
import { incidenciasState } from "./incidencias.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";

const TICKETS_CREATE_ENDPOINT = "/api/tickets";
const TICKETS_ADMIN_CREATE_ENDPOINT = "/api/tickets/admin";
const INCIDENCIAS_CREATE_ENDPOINT = "/api/incidencias";

const USER_SEARCH_ENDPOINT = "/api/search/users";

const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE = 240;

const CREATE_TIMEOUT_MS = 90000;
const USER_SEARCH_TIMEOUT_MS = 15000;

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
  "owner",
]);

const ALLOWED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",

  "application/pdf",

  "text/plain",
  "text/csv",

  "application/zip",
  "application/x-zip-compressed",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetUserName: "",
  targetUserEmail: "",
  subject: "",
  description: "",
  priority: "medium",
  status: "open",
  category: "general",
  source: "panel",
  attachments: [],
});

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  isOpen: false,
  bindingsAttached: false,
  escHandler: null,
  lastActiveElement: null,

  submitting: false,
  dragActive: false,

  userSearchQuery: "",
  userSearchResults: [],
  userSearchLoading: false,
  userSearchError: "",
  userSearchDebounce: null,
  userSearchSeq: 0,

  errors: {},
  serverError: "",
  successMessage: "",
  createdTicketId: "",

  form: {
    ...DEFAULT_FORM,
    attachments: [],
  },
};

/* =========================================================
   HELPERS CORE
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function safeOn(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let attached = false;

  try {
    AppCore?.events?.on?.(eventName, handler);
    attached = true;
  } catch {}

  try {
    window.addEventListener(eventName, handler);
    attached = true;
  } catch {}

  return attached;
}

function safeOff(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let detached = false;

  try {
    AppCore?.events?.off?.(eventName, handler);
    detached = true;
  } catch {}

  try {
    window.removeEventListener(eventName, handler);
    detached = true;
  } catch {}

  return detached;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(text);
  } catch {}
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function getApiBase() {
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function buildFetchUrl(endpoint = "") {
  const path = safeText(endpoint, "");
  if (!path) return "";

  if (isAbsoluteUrl(path)) {
    return path;
  }

  const apiBase = getApiBase();

  if (!apiBase) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  if (apiBase.endsWith("/api") && path.startsWith("/api/")) {
    return `${apiBase}${path.slice(4)}`;
  }

  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
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
      typeof localStorage !== "undefined"
        ? localStorage.getItem("accessToken")
        : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : "",
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("accessToken")
        : ""
    ),
    ""
  );
}

function safeErrorMessage(
  error = null,
  fallback = "No se pudo completar la operación."
) {
  if (!error) return fallback;

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.data?.error,
      error?.response?.error,
      error?.error,
      error?.detail,
      fallback
    ),
    fallback
  );
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

function shouldTryNextCandidate(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

function getFileListFromInput(target) {
  try {
    return Array.from(target?.files || []);
  } catch {
    return [];
  }
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function dedupeFiles(files = []) {
  const input = safeArray(files);
  const map = new Map();

  input.forEach((file) => {
    if (!isFile(file)) return;

    const key = [
      safeText(file.name, ""),
      Number(file.size) || 0,
      Number(file.lastModified) || 0,
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

function getFileExtension(filename = "") {
  const clean = safeLower(filename);
  const index = clean.lastIndexOf(".");

  if (index === -1) return "";

  return clean.slice(index + 1);
}

function isAllowedFile(file = null) {
  if (!isFile(file)) return false;

  const mimetype = safeLower(file.type, "");
  const ext = getFileExtension(file.name);

  if (mimetype && ALLOWED_MIME_TYPES.includes(mimetype)) {
    return true;
  }

  return [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "pdf",
    "txt",
    "csv",
    "zip",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
  ].includes(ext);
}

function validateFiles(files = []) {
  const list = dedupeFiles(files);
  const errors = [];

  if (list.length > MAX_FILES) {
    errors.push(`No puedes adjuntar más de ${MAX_FILES} archivos.`);
  }

  for (const file of list) {
    if (!isAllowedFile(file)) {
      errors.push(`Tipo de archivo no permitido: ${safeText(file.name, "archivo")}.`);
      continue;
    }

    if (safeNumber(file.size, 0) > MAX_FILE_SIZE) {
      errors.push(
        `El archivo ${safeText(file.name, "archivo")} supera el máximo de ${formatFileSize(MAX_FILE_SIZE)}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    files: list.slice(0, MAX_FILES),
  };
}

function createTimeoutController(timeoutMs = 15000) {
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

/* =========================================================
   PERMISSIONS / TARGET USER
========================================================= */

function normalizeTokenList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => safeLower(item, ""))
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => safeLower(key, ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|;]+/g)
      .map((item) => safeLower(item, ""))
      .filter(Boolean);
  }

  return [];
}

function getCurrentRole() {
  return safeLower(
    first(
      AppCore?.state?.user?.role,
      AppCore?.state?.user?.rol,
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.auth?.getRole?.(),
      AppCore?.Auth?.getRole?.()
    ),
    ""
  );
}

function canSelectTargetUser() {
  const role = getCurrentRole();

  if (ADMIN_ROLE_KEYS.includes(role)) {
    return true;
  }

  const permissions = [
    ...normalizeTokenList(AppCore?.state?.permissions),
    ...normalizeTokenList(AppCore?.state?.user?.permissions),
    ...normalizeTokenList(AppCore?.auth?.getPermissions?.()),
    ...normalizeTokenList(AppCore?.Auth?.getPermissions?.()),
  ];

  return permissions.some((permission) =>
    [
      "admin",
      "users:read",
      "users:search",
      "tickets:create:any",
      "tickets:write:any",
      "incidencias:create:any",
      "incidencias:write:any",
    ].includes(permission)
  );
}

function normalizeUserCandidate(raw = null) {
  const obj = safeObject(raw);
  const nestedUser = safeObject(obj.user);
  const nestedProfile = safeObject(obj.profile);

  const id = safeText(
    first(
      obj.userId,
      obj.id,
      obj.uid,
      obj._id,
      obj.code,
      nestedUser.userId,
      nestedUser.id,
      nestedUser.uid,
      nestedUser._id
    ),
    ""
  );

  if (!id) return null;

  const email = safeText(
    first(
      obj.email,
      nestedUser.email,
      nestedProfile.email
    ),
    ""
  );

  const username = safeText(
    first(
      obj.username,
      nestedUser.username,
      nestedProfile.username
    ),
    ""
  );

  const phone = safeText(
    first(
      obj.phone,
      obj.telefono,
      nestedUser.phone,
      nestedProfile.phone
    ),
    ""
  );

  const role = safeText(
    first(
      obj.role,
      obj.rol,
      nestedUser.role,
      nestedUser.rol
    ),
    ""
  );

  const name = safeText(
    first(
      obj.name,
      obj.nombre,
      obj.fullName,
      obj.displayName,
      nestedUser.name,
      nestedUser.nombre,
      nestedUser.fullName,
      nestedUser.displayName,
      nestedProfile.name,
      username,
      email,
      obj.label,
      `Usuario ${id}`
    ),
    `Usuario ${id}`
  );

  const label = safeText(
    first(
      obj.label,
      `${name}${email ? ` · ${email}` : ""}`
    ),
    name
  );

  const subtitle = safeText(
    first(
      obj.subtitle,
      email,
      username ? `@${username}` : "",
      phone,
      id
    ),
    ""
  );

  return {
    id,
    userId: id,
    name,
    email,
    username,
    phone,
    role,
    label,
    subtitle,
  };
}

function dedupeUsers(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const user = normalizeUserCandidate(item);
    if (!user?.id) return;

    if (!map.has(user.id)) {
      map.set(user.id, user);
    }
  });

  return Array.from(map.values());
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getInitialForm() {
  const draft = safeObject(incidenciasState?.createDraft);

  return {
    targetUserId: safeText(first(draft.targetUserId, draft.userId), ""),
    targetUserName: safeText(first(draft.targetUserName, draft.userName), ""),
    targetUserEmail: safeText(first(draft.targetUserEmail, draft.userEmail), ""),

    subject: safeText(draft.subject, ""),
    description: safeText(first(draft.description, draft.descripcion, draft.message), ""),

    priority: safeText(first(draft.priority, draft.prioridad, "medium"), "medium"),
    status: safeText(first(draft.status, draft.estado, "open"), "open"),
    category: safeText(first(draft.category, draft.categoria, "general"), "general"),
    source: safeText(first(draft.source, draft.origen, "panel"), "panel"),

    attachments: [],
  };
}

function syncCreateViewState(patch = {}) {
  try {
    incidenciasState.createView = {
      ...safeObject(incidenciasState.createView),
      ...safeObject(patch),
      form: {
        ...safeObject(incidenciasState.createView?.form),
        ...safeObject(patch.form),
      },
    };
  } catch {}
}

function persistDraft() {
  const form = safeObject(modalState.form);

  incidenciasState.createDraft = {
    targetUserId: safeText(form.targetUserId, ""),
    targetUserName: safeText(form.targetUserName, ""),
    targetUserEmail: safeText(form.targetUserEmail, ""),

    userId: safeText(form.targetUserId, ""),
    userName: safeText(form.targetUserName, ""),
    userEmail: safeText(form.targetUserEmail, ""),

    subject: safeText(form.subject, ""),
    description: safeText(form.description, ""),
    priority: safeText(form.priority, "medium"),
    status: safeText(form.status, "open"),
    category: safeText(form.category, "general"),
    source: safeText(form.source, "panel"),
  };

  syncCreateViewState({
    form: incidenciasState.createDraft,
  });
}

function clearDraft() {
  incidenciasState.createDraft = {
    targetUserId: "",
    targetUserName: "",
    targetUserEmail: "",
    userId: "",
    userName: "",
    userEmail: "",
    subject: "",
    description: "",
    priority: "medium",
    status: "open",
    category: "general",
    source: "panel",
  };

  syncCreateViewState({
    form: incidenciasState.createDraft,
  });
}

function setFormPatch(patch = {}) {
  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(patch),
  };

  modalState.form.attachments = dedupeFiles(modalState.form.attachments);

  persistDraft();

  return modalState.form;
}

function resetFeedbackState() {
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";

  syncCreateViewState({
    errors: {},
    serverError: "",
    createdTicketId: "",
    successMessage: "",
  });
}

function resetFormState() {
  modalState.form = {
    ...DEFAULT_FORM,
    attachments: [],
  };
}

function clearUserSearchTimer() {
  if (!modalState.userSearchDebounce) return;

  try {
    clearTimeout(modalState.userSearchDebounce);
  } catch {}

  modalState.userSearchDebounce = null;
}

function resetUserSearchState({ preserveQuery = false } = {}) {
  clearUserSearchTimer();

  modalState.userSearchResults = [];
  modalState.userSearchLoading = false;
  modalState.userSearchError = "";
  modalState.userSearchSeq += 1;

  if (!preserveQuery) {
    modalState.userSearchQuery = "";
  }
}

function clearTargetUserSelection() {
  setFormPatch({
    targetUserId: "",
    targetUserName: "",
    targetUserEmail: "",
  });

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const targetUserId = safeText(current.targetUserId, "");
  const subject = normalizeWhitespace(current.subject);
  const description = normalizeWhitespace(current.description);

  if (canSelectTargetUser() && !targetUserId) {
    errors.targetUserId = "Selecciona un usuario.";
  }

  if (!subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (subject.length < 4) {
    errors.subject = "Mínimo 4 caracteres.";
  }

  if (!description) {
    errors.description = "La descripción es obligatoria.";
  } else if (description.length < 8) {
    errors.description = "Mínimo 8 caracteres.";
  }

  const fileValidation = validateFiles(current.attachments);

  if (!fileValidation.valid) {
    errors.attachments = fileValidation.errors[0] || "Adjuntos no válidos.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    files: fileValidation.files,
  };
}

function appendIfValue(fd, key, value) {
  const text = safeText(value, "");
  if (!text) return;

  fd.append(key, text);
}

function buildPayload(form = {}) {
  const current = safeObject(form);
  const fd = new FormData();

  const subject = normalizeWhitespace(current.subject);
  const description = normalizeWhitespace(current.description);

  const priority = safeText(current.priority, "medium");
  const status = safeText(current.status, "open");
  const category = safeText(current.category, "general");
  const source = safeText(current.source, "panel");

  fd.append("subject", subject);
  fd.append("asunto", subject);
  fd.append("title", subject);

  fd.append("description", description);
  fd.append("descripcion", description);
  fd.append("message", description);
  fd.append("body", description);

  fd.append("priority", priority);
  fd.append("prioridad", priority);

  fd.append("status", status);
  fd.append("estado", status);

  fd.append("category", category);
  fd.append("categoria", category);

  fd.append("source", source);
  fd.append("origen", source);

  if (canSelectTargetUser()) {
    const targetUserId = safeText(current.targetUserId, "");
    const targetUserName = safeText(current.targetUserName, "");
    const targetUserEmail = safeText(current.targetUserEmail, "");

    if (targetUserId) {
      fd.append("userId", targetUserId);
      fd.append("targetUserId", targetUserId);
      fd.append("receptorUserId", targetUserId);
    }

    appendIfValue(fd, "targetUserName", targetUserName);
    appendIfValue(fd, "targetUserEmail", targetUserEmail);
    appendIfValue(fd, "clienteNombre", targetUserName);
    appendIfValue(fd, "clienteEmail", targetUserEmail);
    appendIfValue(fd, "name", targetUserName);
    appendIfValue(fd, "email", targetUserEmail);
  }

  dedupeFiles(current.attachments).forEach((file) => {
    if (isFile(file)) {
      fd.append("attachments", file, file.name);
    }
  });

  return fd;
}

function shouldUseAdminEndpoint() {
  return canSelectTargetUser() && Boolean(safeText(modalState.form?.targetUserId, ""));
}

/* =========================================================
   CREATE ADAPTERS
========================================================= */

function buildCreateEndpoints() {
  if (shouldUseAdminEndpoint()) {
    return [
      TICKETS_ADMIN_CREATE_ENDPOINT,
      TICKETS_CREATE_ENDPOINT,
      INCIDENCIAS_CREATE_ENDPOINT,
    ];
  }

  return [
    TICKETS_CREATE_ENDPOINT,
    INCIDENCIAS_CREATE_ENDPOINT,
  ];
}

async function createViaApiClient(endpoint = "", payload = null) {
  const client = AppCore?.apiClient || null;

  if (!client) {
    throw new Error("API_CLIENT_UNAVAILABLE");
  }

  if (typeof client.post === "function") {
    return client.post(endpoint, payload, {
      timeout: CREATE_TIMEOUT_MS,
      auth: true,
      headers: {},
    });
  }

  if (typeof client.request === "function") {
    return client.request(endpoint, {
      method: "POST",
      timeout: CREATE_TIMEOUT_MS,
      auth: true,
      headers: {},
      body: payload,
    });
  }

  throw new Error("API_CLIENT_POST_UNAVAILABLE");
}

async function createViaAppCoreRequest(endpoint = "", payload = null) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(endpoint, {
    method: "POST",
    timeout: CREATE_TIMEOUT_MS,
    body: payload,
    headers: {},
  });
}

async function createViaHttpModule(endpoint = "", payload = null) {
  const Http = AppCore?.modules?.Http || AppCore?.Http || window?.Http || null;

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  if (typeof Http.post === "function") {
    return Http.post(endpoint, payload, {
      timeout: CREATE_TIMEOUT_MS,
      headers: {},
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(endpoint, {
      method: "POST",
      timeout: CREATE_TIMEOUT_MS,
      body: payload,
      headers: {},
    });
  }

  throw new Error("HTTP_POST_UNAVAILABLE");
}

async function createViaFetch(endpoint = "", payload = null) {
  const token = getAuthToken();
  const url = buildFetchUrl(endpoint);
  const timeout = createTimeoutController(CREATE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      body: payload,
      signal: timeout.signal,
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(
            data?.message,
            data?.error,
            `HTTP ${response.status} al crear incidencia.`
          ),
          "No se pudo crear la incidencia."
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
    timeout.clear();
  }
}

function pickCreatedTicket(response = null) {
  if (!response) return null;

  if (Array.isArray(response)) {
    return response[0] || null;
  }

  const obj = safeObject(response);

  return (
    obj.ticket ||
    obj.item ||
    obj.data?.ticket ||
    obj.data?.item ||
    obj.data ||
    obj.result?.ticket ||
    obj.result?.item ||
    obj.result ||
    obj.payload?.ticket ||
    obj.payload?.item ||
    obj.payload ||
    obj.incidencia ||
    obj
  );
}

function resolveCreatedTicketId(response = null) {
  const ticket = safeObject(pickCreatedTicket(response));

  return safeText(
    first(
      ticket.ticketId,
      ticket.id,
      ticket.code,
      ticket.ticketCode,
      response?.ticketId,
      response?.id,
      response?.code,
      response?.ticketCode
    ),
    ""
  );
}

async function createIncidenciaRequest(payload = null) {
  const endpoints = buildCreateEndpoints();

  const adapters = [
    createViaApiClient,
    createViaAppCoreRequest,
    createViaHttpModule,
    createViaFetch,
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    for (const adapter of adapters) {
      try {
        return await adapter(endpoint, payload);
      } catch (error) {
        lastError = error;

        if (!shouldTryNextCandidate(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error("CREATE_ADAPTERS_FAILED");
}

/* =========================================================
   USER SEARCH ADAPTERS
========================================================= */

function buildUserSearchUrls(query = "") {
  const params = new URLSearchParams();

  params.set("q", safeText(query, ""));
  params.set("mode", "incidencias");
  params.set("limit", String(USER_SEARCH_LIMIT));

  return [
    `${USER_SEARCH_ENDPOINT}?${params.toString()}`,
    `/api/users/search?${params.toString()}`,
    `/api/usuarios/search?${params.toString()}`,
    `/search/users?${params.toString()}`,
  ];
}

function readUsersCollection(response = null) {
  if (Array.isArray(response)) {
    return {
      recognized: true,
      items: response,
    };
  }

  const obj = safeObject(response);
  const data = safeObject(obj.data);
  const payload = safeObject(obj.payload);
  const result = safeObject(obj.result);

  const candidates = [
    obj.users,
    obj.usuarios,
    obj.items,
    obj.results,
    obj.list,
    obj.rows,
    obj.records,

    data.users,
    data.usuarios,
    data.items,
    data.results,
    data.list,
    data.rows,
    data.records,

    payload.users,
    payload.usuarios,
    payload.items,
    payload.results,
    payload.list,
    payload.rows,
    payload.records,

    result.users,
    result.usuarios,
    result.items,
    result.results,
    result.list,
    result.rows,
    result.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return {
        recognized: true,
        items: candidate,
      };
    }
  }

  return {
    recognized: false,
    items: [],
  };
}

function extractUsersFromSearchResponse(response = null) {
  const collection = readUsersCollection(response);

  if (!collection.recognized) {
    return {
      recognized: false,
      items: [],
    };
  }

  return {
    recognized: true,
    items: dedupeUsers(collection.items).slice(0, USER_SEARCH_LIMIT),
  };
}

async function searchUsersViaAppCore(url = "") {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(url, {
    method: "GET",
    timeout: USER_SEARCH_TIMEOUT_MS,
  });
}

async function searchUsersViaHttpModule(url = "") {
  const Http = AppCore?.modules?.Http || AppCore?.Http || window?.Http || null;

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  if (typeof Http.get === "function") {
    return Http.get(url, {
      timeout: USER_SEARCH_TIMEOUT_MS,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(url, {
      method: "GET",
      timeout: USER_SEARCH_TIMEOUT_MS,
    });
  }

  throw new Error("HTTP_GET_UNAVAILABLE");
}

async function searchUsersViaFetch(url = "") {
  const token = getAuthToken();
  const finalUrl = buildFetchUrl(url);
  const timeout = createTimeoutController(USER_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      signal: timeout.signal,
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(
            data?.message,
            data?.error,
            `HTTP ${response.status} al buscar usuarios.`
          ),
          "No se pudieron cargar usuarios."
        )
      );

      error.response = data;
      error.status = response.status;
      error.statusCode = response.status;

      throw error;
    }

    return data;
  } finally {
    timeout.clear();
  }
}

async function searchUsersRequest(query = "") {
  const urls = buildUserSearchUrls(query);

  const adapters = [
    searchUsersViaAppCore,
    searchUsersViaHttpModule,
    searchUsersViaFetch,
  ];

  let lastError = null;

  for (const url of urls) {
    for (const adapter of adapters) {
      try {
        const response = await adapter(url);
        const parsed = extractUsersFromSearchResponse(response);

        if (parsed.recognized) {
          return parsed.items;
        }
      } catch (error) {
        lastError = error;

        if (!shouldTryNextCandidate(error)) {
          throw error;
        }
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

/* =========================================================
   TEMPLATE HELPERS
========================================================= */

function renderFieldError(message = "") {
  const text = safeText(message, "");
  if (!text) return "";

  return `<span class="inc-create-error">${escapeHtml(text)}</span>`;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  type = "text",
  placeholder = "",
  required = false,
  error = "",
  autocomplete = "off",
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        class="inc-create-input ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="${escapeHtml(autocomplete)}"
        ${modalState.submitting ? "disabled" : ""}
      />

      ${renderFieldError(error)}
    </label>
  `;
}

function renderTextarea({
  label = "",
  name = "",
  value = "",
  placeholder = "",
  required = false,
  error = "",
  rows = 5,
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <textarea
        class="inc-create-textarea ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="${Number(rows) || 5}"
        placeholder="${escapeHtml(placeholder)}"
        ${modalState.submitting ? "disabled" : ""}
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) return "";

  return `
    <div class="inc-create-files-list">
      ${items
        .map(
          (file, index) => `
            <div class="inc-create-file-row">
              <div class="inc-create-file-meta">
                <strong class="inc-create-file-name">
                  ${escapeHtml(safeText(file?.name, `Adjunto ${index + 1}`))}
                </strong>
                <span class="inc-create-file-size">
                  ${escapeHtml(
                    [
                      safeText(file?.type, ""),
                      formatFileSize(file?.size),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )}
                </span>
              </div>

              <button
                type="button"
                data-remove-attachment="${index}"
                class="inc-create-file-remove"
                ${modalState.submitting ? "disabled" : ""}
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

function renderFileInput({ files = [], dragActive = false, error = "" } = {}) {
  const items = safeArray(files);

  const countText =
    items.length === 0
      ? "Opcional"
      : items.length === 1
        ? "1 archivo"
        : `${items.length} archivos`;

  return `
    <section class="inc-create-files-card">
      <div class="inc-create-files-head">
        <strong>Adjuntos</strong>
        <span>${escapeHtml(countText)}</span>
      </div>

      <label
        data-dropzone="attachments"
        class="inc-create-dropzone ${dragActive ? "is-active" : ""} ${error ? "is-error" : ""}"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          class="inc-create-hidden-input"
          ${modalState.submitting ? "disabled" : ""}
        />

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra o pulsa</strong>
          <span>Máximo ${MAX_FILES} archivos · ${formatFileSize(MAX_FILE_SIZE)} por archivo.</span>
        </div>
      </label>

      ${renderFieldError(error)}

      ${renderFilesSummary(items)}
    </section>
  `;
}

function renderSelectedUserCard() {
  const form = safeObject(modalState.form);
  const targetUserId = safeText(form.targetUserId, "");

  if (!targetUserId) return "";

  const targetUserName = safeText(form.targetUserName, "Usuario seleccionado");
  const targetUserEmail = safeText(form.targetUserEmail, "");

  return `
    <div class="inc-create-target-user-card">
      <div class="inc-create-target-user-copy">
        <strong>${escapeHtml(targetUserName)}</strong>
        <span>
          ${
            targetUserEmail
              ? escapeHtml(targetUserEmail)
              : `ID ${escapeHtml(targetUserId)}`
          }
        </span>
      </div>

      <button
        type="button"
        data-clear-selected-user="true"
        class="inc-create-target-user-clear"
        ${modalState.submitting ? "disabled" : ""}
      >
        Cambiar
      </button>
    </div>
  `;
}

function renderUserSearchResults() {
  const query = safeText(modalState.userSearchQuery, "");
  const results = safeArray(modalState.userSearchResults);
  const loading = Boolean(modalState.userSearchLoading);
  const error = safeText(modalState.userSearchError, "");

  if (!query) return "";

  if (loading) {
    return `
      <div class="inc-create-search-state">
        Buscando...
      </div>
    `;
  }

  if (error) {
    return `
      <div class="inc-create-search-state is-error">
        ${escapeHtml(error)}
      </div>
    `;
  }

  if (query.length < 2) {
    return `
      <div class="inc-create-search-state">
        Mínimo 2 caracteres.
      </div>
    `;
  }

  if (!results.length) {
    return `
      <div class="inc-create-search-state">
        Sin resultados.
      </div>
    `;
  }

  return `
    <div class="inc-create-search-results">
      ${results
        .map(
          (user, index) => `
            <button
              type="button"
              data-select-target-user="${index}"
              class="inc-create-search-item"
              ${modalState.submitting ? "disabled" : ""}
            >
              <div class="inc-create-search-item-copy">
                <strong>
                  ${escapeHtml(safeText(user?.name, `Usuario ${index + 1}`))}
                </strong>

                <span>
                  ${escapeHtml(
                    safeText(
                      first(
                        user?.subtitle,
                        user?.email,
                        user?.username ? `@${user.username}` : "",
                        user?.phone,
                        user?.id
                      ),
                      "Sin datos secundarios"
                    )
                  )}
                </span>
              </div>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTargetUserBlock() {
  if (!canSelectTargetUser()) return "";

  const targetUserId = safeText(modalState.form?.targetUserId, "");
  const queryValue = safeText(modalState.userSearchQuery, "");
  const error = safeText(modalState.errors?.targetUserId, "");

  return `
    <section class="inc-create-block" data-target-user-block="true">
      <div class="inc-create-mini-title">
        Usuario
      </div>

      <label class="inc-create-field">
        <input
          class="inc-create-input ${error ? "is-error" : ""}"
          data-field="targetUserSearch"
          name="targetUserSearch"
          type="text"
          value="${escapeHtml(queryValue)}"
          placeholder="${
            targetUserId
              ? "Buscar otro usuario..."
              : "Buscar por nombre, email, username, teléfono..."
          }"
          autocomplete="off"
          ${modalState.submitting ? "disabled" : ""}
        />

        <div
          class="inc-create-target-error-slot"
          data-target-user-error-slot="true"
        >
          ${renderFieldError(error)}
        </div>
      </label>

      <div
        class="inc-create-user-search-slot"
        data-user-search-results-slot="true"
      >
        ${renderUserSearchResults()}
      </div>

      <div
        class="inc-create-selected-user-slot"
        data-selected-user-slot="true"
      >
        ${renderSelectedUserCard()}
      </div>
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${escapeHtml(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
    </div>
  `;
}

function renderCreateLoadingOverlay(label = "Creando incidencia...") {
  return `
    <div class="inc-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="inc-create-loading-card">
        <span class="inc-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

/* =========================================================
   MODAL TEMPLATE
========================================================= */

function renderModalInner() {
  const form = safeObject(modalState.form);
  const errors = safeObject(modalState.errors);
  const submitting = Boolean(modalState.submitting);
  const serverError = safeText(modalState.serverError, "");
  const successMessage = safeText(modalState.successMessage, "");
  const createdTicketId = safeText(modalState.createdTicketId, "");
  const targetMode = canSelectTargetUser();

  return `
    <div
      data-incidencias-create-modal-overlay="true"
      class="inc-create-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-create-modal-title"
        tabindex="-1"
        class="inc-create-panel${submitting ? " is-submitting" : ""}"
      >
        ${submitting ? renderCreateLoadingOverlay("Creando incidencia...") : ""}

        <div class="inc-create-header">
          <div class="inc-create-header-copy">
            <h2 id="incidencias-create-modal-title">
              Crear incidencia
            </h2>

            <p>
              ${
                targetMode
                  ? "Selecciona usuario, define el asunto, describe el caso y adjunta documentos si hace falta."
                  : "Define el asunto, describe el caso y adjunta documentos si hace falta."
              }
            </p>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${submitting ? "disabled" : ""}
            class="inc-create-close"
          >
            ✕
          </button>
        </div>

        <div class="inc-create-body">
          ${
            successMessage
              ? renderAlert(
                  "success",
                  "Incidencia creada.",
                  createdTicketId ? `Referencia: ${createdTicketId}` : successMessage
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear la incidencia.",
                  serverError
                )
              : ""
          }

          <form id="incidencias-create-form" novalidate class="inc-create-form">
            ${renderTargetUserBlock()}

            ${renderInput({
              label: "Asunto",
              name: "subject",
              value: form.subject,
              placeholder: "Ej. Error al pagar, acceso bloqueado, factura incorrecta...",
              required: true,
              error: errors.subject,
            })}

            ${renderTextarea({
              label: "Descripción",
              name: "description",
              value: form.description,
              placeholder: "Describe qué ocurre, desde cuándo pasa y qué necesita soporte revisar.",
              required: true,
              error: errors.description,
              rows: 5,
            })}

            ${renderFileInput({
              files: safeArray(form.attachments),
              dragActive: Boolean(modalState.dragActive),
              error: errors.attachments,
            })}

            <div class="inc-create-actions">
              <button
                id="incidencias-create-submit-btn"
                type="submit"
                ${submitting ? "disabled" : ""}
                class="inc-create-submit"
              >
                ${
                  submitting
                    ? `
                      <span class="inc-create-submit-inner">
                        <span class="inc-create-spinner" aria-hidden="true"></span>
                        Creando...
                      </span>
                    `
                    : "Crear incidencia"
                }
              </button>
            </div>
          </form>
        </div>

        <style>
          @keyframes incidenciasCreateSpin {
            to { transform: rotate(360deg); }
          }

          @keyframes incidenciasCreatePanelIn {
            from {
              opacity:0;
              transform:translateY(12px) scale(.982);
            }

            to {
              opacity:1;
              transform:translateY(0) scale(1);
            }
          }

          .inc-create-overlay{
            position:fixed;
            inset:0;
            z-index:var(--z-modal, 9999);
            display:grid;
            place-items:center;
            padding:var(--space-md, 16px);
            background:var(--overlay-bg, var(--backdrop-bg, rgba(10,10,12,.68)));
            backdrop-filter:var(--overlay-blur, blur(10px));
            -webkit-backdrop-filter:var(--overlay-blur, blur(10px));
          }

          .inc-create-panel{
            position:relative;
            inline-size:min(800px, calc(100vw - 24px));
            max-block-size:min(92dvh, 920px);
            overflow:auto;

            border:1px solid var(--modal-border, var(--panel-border, var(--border-default, rgba(255,255,255,.082))));
            border-radius:var(--modal-radius, var(--radius-2xl, 22px));

            background:
              var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
              var(--modal-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));

            box-shadow:var(--shadow-modal, var(--shadow-xl, 0 28px 72px rgba(0,0,0,.36)));
            color:var(--text, #f5f5f5);

            outline:none;
            scrollbar-width:thin;
            scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent;

            animation:incidenciasCreatePanelIn var(--duration-normal, .20s) var(--ease-out, ease-out);
          }

          .inc-create-panel::-webkit-scrollbar{
            inline-size:var(--scrollbar-size, 10px);
          }

          .inc-create-panel::-webkit-scrollbar-track{
            background:transparent;
          }

          .inc-create-panel::-webkit-scrollbar-thumb{
            border:2px solid transparent;
            border-radius:var(--radius-pill, 999px);
            background:var(--scrollbar-thumb, rgba(255,255,255,.12));
            background-clip:padding-box;
          }

          .inc-create-panel::-webkit-scrollbar-thumb:hover{
            background:var(--scrollbar-thumb-hover, rgba(255,255,255,.18));
            background-clip:padding-box;
          }

          .inc-create-panel.is-submitting{
            overflow:hidden;
          }

          .inc-create-loading-overlay{
            position:absolute;
            inset:0;
            z-index:30;
            display:grid;
            place-items:center;
            padding:var(--space-xl, 22px);
            background:color-mix(in srgb, var(--modal-bg, var(--surface-2, #171717)) 76%, transparent);
            backdrop-filter:var(--blur-md, blur(12px));
            -webkit-backdrop-filter:var(--blur-md, blur(12px));
          }

          .inc-create-loading-card{
            display:grid;
            justify-items:center;
            gap:var(--space-sm, 12px);

            inline-size:min(100%, 275px);
            padding:var(--space-xl, 24px) var(--space-2xl, 28px);

            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--card-border, rgba(255,255,255,.08)));
            border-radius:var(--radius-xl, 18px);

            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 100%),
              var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));

            box-shadow:
              var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28)),
              var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
          }

          .inc-create-loading-card strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-base, 14px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
            letter-spacing:var(--letter-tight, -.015em);
          }

          .inc-create-loading-spinner{
            inline-size:30px;
            block-size:30px;
            border-radius:var(--radius-pill, 999px);
            border:3px solid var(--loader-ring, rgba(255,255,255,.12));
            border-block-start-color:var(--loader-ring-active, var(--accent, #7c5cff));
            border-inline-end-color:color-mix(in srgb, var(--loader-ring-active, var(--accent, #7c5cff)) 40%, transparent);
            animation:incidenciasCreateSpin .78s linear infinite;
          }

          .inc-create-header{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:var(--space-md, 14px);
            padding:var(--space-lg, 18px) var(--space-lg, 18px) var(--space-md, 14px);
            border-block-end:1px solid var(--border-soft, rgba(255,255,255,.05));
          }

          .inc-create-header-copy{
            display:grid;
            gap:var(--space-2xs, 5px);
            min-inline-size:0;
          }

          .inc-create-header-copy h2{
            margin:0;
            color:var(--text-strong, #ffffff);
            font-size:clamp(var(--font-3xl, 24px), 3.6vw, var(--font-4xl, 32px));
            line-height:var(--line-tight, 1.08);
            letter-spacing:var(--letter-tight, -.045em);
            font-weight:var(--weight-black, 800);
          }

          .inc-create-header-copy p{
            margin:0;
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-sm, 12px);
            line-height:var(--line-normal, 1.42);
            max-inline-size:68ch;
          }

          .inc-create-close{
            position:relative;
            display:grid;
            place-items:center;
            inline-size:40px;
            block-size:40px;
            flex:0 0 auto;

            border:1px solid var(--btn-ghost-border, var(--border-soft, rgba(255,255,255,.07)));
            border-radius:var(--radius-md, 13px);

            background:var(--btn-ghost-bg, rgba(255,255,255,.022));
            color:var(--text-muted, rgba(245,245,245,.70));

            cursor:pointer;
            font-size:17px;
            line-height:1;

            transition:
              transform var(--duration-fast, .12s) var(--ease-out, ease),
              background var(--duration-fast, .12s) var(--ease-standard, ease),
              border-color var(--duration-fast, .12s) var(--ease-standard, ease),
              color var(--duration-fast, .12s) var(--ease-standard, ease),
              box-shadow var(--duration-fast, .12s) var(--ease-standard, ease),
              opacity var(--duration-fast, .12s) var(--ease-standard, ease);
          }

          .inc-create-close:hover{
            transform:translateY(var(--ui-hover-lift, -1px));
            background:var(--btn-ghost-bg-hover, rgba(255,255,255,.046));
            border-color:var(--border-strong, rgba(255,255,255,.12));
            color:var(--text-strong, #ffffff);
            box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
          }

          .inc-create-close:active{
            transform:translateY(0) scale(var(--ui-active-scale, .985));
            background:var(--btn-ghost-bg-active, rgba(255,255,255,.062));
          }

          .inc-create-close:focus-visible{
            outline:none;
            box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
          }

          .inc-create-close:disabled{
            opacity:.58;
            cursor:not-allowed;
            transform:none;
            box-shadow:none;
          }

          .inc-create-body{
            display:grid;
            gap:var(--space-md, 14px);
            padding:var(--space-md, 16px) var(--space-lg, 18px) var(--space-lg, 18px);
          }

          .inc-create-alert{
            display:grid;
            gap:var(--space-2xs, 4px);
            padding:var(--space-sm, 11px) var(--space-md, 13px);
            border:1px solid var(--panel-border, var(--border-soft, rgba(255,255,255,.05)));
            border-radius:var(--radius-md, 14px);
            background:
              var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
              var(--surface-glass, rgba(255,255,255,.030));
          }

          .inc-create-alert strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-md, 13px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
          }

          .inc-create-alert span{
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-sm, 12px);
            line-height:var(--line-normal, 1.42);
          }

          .inc-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success, #22c55e) 36%, var(--panel-border, rgba(255,255,255,.08)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 72%, transparent), transparent 100%),
              var(--surface-glass, rgba(255,255,255,.030));
          }

          .inc-create-alert.is-error{
            border-color:color-mix(in srgb, var(--error, #ef4444) 38%, var(--panel-border, rgba(255,255,255,.08)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 74%, transparent), transparent 100%),
              var(--surface-glass, rgba(255,255,255,.030));
          }

          .inc-create-form{
            display:grid;
            gap:var(--space-md, 14px);
          }

          .inc-create-block,
          .inc-create-files-card{
            display:grid;
            gap:var(--space-xs, 10px);
            padding:var(--space-md, 13px);
            border:1px solid var(--block-border, var(--border-soft, rgba(255,255,255,.052)));
            border-radius:var(--radius-lg, 16px);
            background:
              var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
              var(--block-bg, rgba(255,255,255,.022));
            transition:
              border-color var(--duration-normal, .20s) var(--ease-standard, ease),
              background var(--duration-normal, .20s) var(--ease-standard, ease),
              box-shadow var(--duration-normal, .20s) var(--ease-standard, ease);
          }

          .inc-create-block:hover,
          .inc-create-files-card:hover{
            border-color:var(--block-border-hover, var(--border-default, rgba(255,255,255,.082)));
            background:
              var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
              var(--block-bg-hover, rgba(255,255,255,.036));
          }

          .inc-create-mini-title{
            color:var(--text-soft, rgba(245,245,245,.88));
            font-size:var(--font-xs, 11px);
            font-weight:var(--weight-bold, 700);
            letter-spacing:var(--letter-wider, .08em);
            text-transform:uppercase;
          }

          .inc-create-field{
            display:grid;
            gap:var(--space-xs, 7px);
            min-inline-size:0;
          }

          .inc-create-label{
            color:var(--form-label-color, var(--text-soft, rgba(245,245,245,.88)));
            font-size:var(--form-label-size, var(--font-sm, 12px));
            font-weight:var(--form-label-weight, var(--weight-semibold, 600));
            letter-spacing:.045em;
            text-transform:uppercase;
          }

          .inc-create-input,
          .inc-create-textarea{
            inline-size:100%;
            min-inline-size:0;

            outline:none;
            color:var(--input-text, var(--text, #f5f5f5));
            background:var(--input-bg, rgba(255,255,255,.028));
            border:1px solid var(--input-border, rgba(255,255,255,.09));
            box-shadow:var(--input-shadow, inset 0 1px 0 rgba(255,255,255,.018));

            font:inherit;
            font-size:var(--font-base, 14px);

            transition:
              border-color var(--duration-normal, .20s) var(--ease-standard, ease),
              box-shadow var(--duration-normal, .20s) var(--ease-standard, ease),
              background var(--duration-normal, .20s) var(--ease-standard, ease),
              color var(--duration-normal, .20s) var(--ease-standard, ease),
              opacity var(--duration-normal, .20s) var(--ease-standard, ease);
          }

          .inc-create-input{
            min-block-size:var(--input-height, 44px);
            padding-inline:14px;
            border-radius:var(--input-radius, 13px);
          }

          .inc-create-textarea{
            min-block-size:132px;
            padding:12px 14px;
            border-radius:var(--input-radius, 13px);
            resize:vertical;
            line-height:var(--line-relaxed, 1.62);
          }

          .inc-create-input::placeholder,
          .inc-create-textarea::placeholder{
            color:var(--input-placeholder, rgba(245,245,245,.34));
          }

          .inc-create-input:hover,
          .inc-create-textarea:hover{
            background:var(--input-bg-hover, rgba(255,255,255,.040));
            border-color:var(--input-border-hover, rgba(255,255,255,.14));
            box-shadow:var(--input-shadow-hover, inset 0 1px 0 rgba(255,255,255,.025));
          }

          .inc-create-input:focus,
          .inc-create-textarea:focus{
            background:var(--input-bg-focus, rgba(255,255,255,.046));
            border-color:var(--input-border-focus, rgba(113,113,122,.50));
            box-shadow:var(--input-shadow-focus, 0 0 0 4px rgba(113,113,122,.14));
          }

          .inc-create-input.is-error,
          .inc-create-textarea.is-error{
            border-color:var(--input-border-error, rgba(239,68,68,.52));
            box-shadow:var(--ui-ring-error, 0 0 0 4px color-mix(in srgb, var(--error, #ef4444), transparent 88%));
          }

          .inc-create-input:disabled,
          .inc-create-textarea:disabled{
            background:var(--input-disabled-bg, rgba(255,255,255,.016));
            opacity:.68;
            cursor:not-allowed;
          }

          .inc-create-error{
            color:var(--form-error-color, var(--error, #ef4444));
            font-size:var(--form-error-size, var(--font-xs, 11px));
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-semibold, 600);
          }

          .inc-create-target-error-slot:empty,
          .inc-create-user-search-slot:empty,
          .inc-create-selected-user-slot:empty{
            display:none;
          }

          .inc-create-user-search-slot,
          .inc-create-selected-user-slot{
            display:grid;
            gap:var(--space-xs, 8px);
          }

          .inc-create-target-user-card{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:var(--space-sm, 12px);
            padding:var(--space-sm, 11px) var(--space-md, 13px);
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 30%, var(--panel-border, rgba(255,255,255,.08)));
            border-radius:var(--radius-md, 14px);
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent-soft, rgba(63,63,70,.18)) 70%, transparent), transparent 120%),
              var(--surface-glass, rgba(255,255,255,.030));
            box-shadow:var(--shadow-xs, 0 2px 8px rgba(0,0,0,.12));
          }

          .inc-create-target-user-copy{
            display:grid;
            gap:var(--space-3xs, 3px);
            min-inline-size:0;
          }

          .inc-create-target-user-copy strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-md, 13px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
            word-break:break-word;
          }

          .inc-create-target-user-copy span{
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-xs, 11px);
            line-height:var(--line-normal, 1.42);
            word-break:break-word;
          }

          .inc-create-target-user-clear,
          .inc-create-file-remove{
            min-block-size:var(--btn-height-sm, 34px);
            padding-inline:12px;
            border:1px solid var(--btn-ghost-border, var(--border-soft, rgba(255,255,255,.07)));
            border-radius:var(--radius-md, 10px);

            background:var(--btn-ghost-bg, rgba(255,255,255,.022));
            color:var(--btn-ghost-text, var(--text-muted, rgba(245,245,245,.70)));

            font:inherit;
            font-size:var(--font-sm, 12px);
            font-weight:var(--weight-bold, 700);
            line-height:1;
            white-space:nowrap;

            cursor:pointer;
            flex:0 0 auto;

            transition:
              transform var(--duration-fast, .12s) var(--ease-out, ease),
              box-shadow var(--duration-fast, .12s) var(--ease-standard, ease),
              background var(--duration-fast, .12s) var(--ease-standard, ease),
              border-color var(--duration-fast, .12s) var(--ease-standard, ease),
              color var(--duration-fast, .12s) var(--ease-standard, ease),
              opacity var(--duration-fast, .12s) var(--ease-standard, ease);
          }

          .inc-create-target-user-clear:hover,
          .inc-create-file-remove:hover{
            transform:translateY(var(--ui-hover-lift, -1px));
            background:var(--btn-ghost-bg-hover, rgba(255,255,255,.046));
            border-color:var(--border-strong, rgba(255,255,255,.12));
            color:var(--text-strong, #ffffff);
            box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
          }

          .inc-create-target-user-clear:active,
          .inc-create-file-remove:active{
            transform:translateY(0) scale(var(--ui-active-scale, .985));
            background:var(--btn-ghost-bg-active, rgba(255,255,255,.062));
          }

          .inc-create-target-user-clear:focus-visible,
          .inc-create-file-remove:focus-visible{
            outline:none;
            box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
          }

          .inc-create-target-user-clear:disabled,
          .inc-create-file-remove:disabled{
            opacity:.58;
            cursor:not-allowed;
            transform:none;
            box-shadow:none;
          }

          .inc-create-search-state{
            padding:var(--space-xs, 10px) var(--space-sm, 12px);
            border:1px solid var(--panel-border, var(--border-soft, rgba(255,255,255,.05)));
            border-radius:var(--radius-md, 13px);
            background:var(--surface-glass, rgba(255,255,255,.030));
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-sm, 12px);
            line-height:var(--line-normal, 1.42);
          }

          .inc-create-search-state.is-error{
            border-color:color-mix(in srgb, var(--error, #ef4444) 34%, var(--panel-border, rgba(255,255,255,.08)));
            color:var(--error, #ef4444);
          }

          .inc-create-search-results{
            display:grid;
            gap:var(--space-xs, 7px);
          }

          .inc-create-search-item{
            display:flex;
            inline-size:100%;
            padding:var(--space-sm, 11px) var(--space-md, 13px);
            border:1px solid var(--panel-border, var(--border-soft, rgba(255,255,255,.05)));
            border-radius:var(--radius-md, 13px);

            background:var(--surface-glass, rgba(255,255,255,.030));
            color:inherit;

            text-align:left;
            cursor:pointer;

            transition:
              transform var(--duration-fast, .12s) var(--ease-out, ease),
              box-shadow var(--duration-fast, .12s) var(--ease-standard, ease),
              border-color var(--duration-fast, .12s) var(--ease-standard, ease),
              background var(--duration-fast, .12s) var(--ease-standard, ease),
              opacity var(--duration-fast, .12s) var(--ease-standard, ease);
          }

          .inc-create-search-item:hover{
            transform:translateY(var(--ui-hover-lift, -1px));
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--panel-border, rgba(255,255,255,.08)));
            background:var(--surface-hover, rgba(255,255,255,.034));
            box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
          }

          .inc-create-search-item:active{
            transform:translateY(0) scale(var(--ui-active-scale, .985));
            background:var(--surface-active, rgba(255,255,255,.066));
          }

          .inc-create-search-item:focus-visible{
            outline:none;
            box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
          }

          .inc-create-search-item:disabled{
            opacity:.58;
            cursor:not-allowed;
            transform:none;
            box-shadow:none;
          }

          .inc-create-search-item-copy{
            display:grid;
            gap:var(--space-3xs, 3px);
            min-inline-size:0;
          }

          .inc-create-search-item-copy strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-md, 13px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
            word-break:break-word;
          }

          .inc-create-search-item-copy span{
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-xs, 11px);
            line-height:var(--line-normal, 1.42);
            word-break:break-word;
          }

          .inc-create-files-head{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:var(--space-xs, 10px);
          }

          .inc-create-files-head strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-md, 13px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
          }

          .inc-create-files-head span{
            display:inline-flex;
            align-items:center;
            min-block-size:var(--chip-height-sm, 22px);
            padding-inline:10px;
            border:1px solid var(--badge-border, var(--border-soft, rgba(255,255,255,.07)));
            border-radius:var(--radius-pill, 999px);
            background:var(--badge-bg, rgba(255,255,255,.048));
            color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
            font-size:var(--font-xs, 11px);
            font-weight:var(--weight-bold, 700);
            letter-spacing:.04em;
            text-transform:uppercase;
            white-space:nowrap;
          }

          .inc-create-dropzone{
            display:grid;
            min-block-size:104px;
            align-content:center;
            padding:var(--space-md, 14px);
            border:1px dashed var(--border-default, rgba(255,255,255,.082));
            border-radius:var(--radius-md, 14px);
            background:var(--surface-glass, rgba(255,255,255,.030));

            cursor:pointer;

            transition:
              transform var(--duration-fast, .12s) var(--ease-out, ease),
              box-shadow var(--duration-fast, .12s) var(--ease-standard, ease),
              border-color var(--duration-normal, .20s) var(--ease-standard, ease),
              background var(--duration-normal, .20s) var(--ease-standard, ease);
          }

          .inc-create-dropzone:hover{
            transform:translateY(var(--ui-hover-lift, -1px));
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--border-default, rgba(255,255,255,.082)));
            background:var(--surface-hover, rgba(255,255,255,.034));
            box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
          }

          .inc-create-dropzone:active{
            transform:translateY(0) scale(var(--ui-active-scale, .985));
          }

          .inc-create-dropzone.is-active{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 46%, var(--border-default, rgba(255,255,255,.082)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent-soft, rgba(63,63,70,.18)) 78%, transparent), transparent),
              var(--surface-glass, rgba(255,255,255,.030));
            box-shadow:
              0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent),
              var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
          }

          .inc-create-dropzone.is-error{
            border-color:color-mix(in srgb, var(--error, #ef4444) 46%, var(--border-default, rgba(255,255,255,.082)));
            box-shadow:var(--ui-ring-error, 0 0 0 4px color-mix(in srgb, var(--error, #ef4444), transparent 88%));
          }

          .inc-create-dropzone-copy{
            display:grid;
            gap:var(--space-2xs, 4px);
          }

          .inc-create-dropzone-copy strong{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-md, 13px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
          }

          .inc-create-dropzone-copy span{
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-xs, 11px);
            line-height:var(--line-normal, 1.42);
          }

          .inc-create-hidden-input{
            display:none;
          }

          .inc-create-files-list{
            display:grid;
            gap:var(--space-xs, 8px);
          }

          .inc-create-file-row{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:var(--space-xs, 10px);
            padding:var(--space-xs, 10px) var(--space-sm, 12px);
            border:1px solid var(--panel-border, var(--border-soft, rgba(255,255,255,.05)));
            border-radius:var(--radius-md, 12px);
            background:var(--surface-glass, rgba(255,255,255,.030));
          }

          .inc-create-file-meta{
            display:grid;
            gap:var(--space-3xs, 3px);
            min-inline-size:0;
          }

          .inc-create-file-name{
            color:var(--text-strong, #ffffff);
            font-size:var(--font-sm, 12px);
            line-height:var(--line-normal, 1.42);
            font-weight:var(--weight-bold, 700);
            word-break:break-word;
          }

          .inc-create-file-size{
            color:var(--text-dim, rgba(245,245,245,.50));
            font-size:var(--font-xs, 11px);
            line-height:var(--line-normal, 1.42);
          }

          .inc-create-actions{
            display:flex;
            justify-content:flex-end;
            padding-block-start:var(--space-3xs, 2px);
          }

          .inc-create-submit{
            position:relative;
            isolation:isolate;

            min-block-size:var(--btn-height, 42px);
            padding-inline:18px;

            border:1px solid var(--btn-primary-border, rgba(255,255,255,.05));
            border-radius:var(--btn-radius, 13px);

            background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
            color:var(--btn-primary-text, var(--text-on-accent, #ffffff));

            font:inherit;
            font-size:var(--font-md, 13px);
            font-weight:var(--weight-bold, 700);
            line-height:1;
            white-space:nowrap;

            cursor:pointer;
            user-select:none;
            -webkit-tap-highlight-color:transparent;

            box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));

            transition:
              transform var(--duration-fast, .12s) var(--ease-out, ease),
              box-shadow var(--duration-normal, .20s) var(--ease-standard, ease),
              background var(--duration-normal, .20s) var(--ease-standard, ease),
              border-color var(--duration-normal, .20s) var(--ease-standard, ease),
              color var(--duration-normal, .20s) var(--ease-standard, ease),
              opacity var(--duration-fast, .12s) var(--ease-standard, ease),
              filter var(--duration-fast, .12s) var(--ease-standard, ease);
          }

          .inc-create-submit::before{
            content:"";
            position:absolute;
            inset:0;
            z-index:-1;
            border-radius:inherit;
            background:
              linear-gradient(
                180deg,
                color-mix(in srgb, var(--text-strong, #ffffff), transparent 90%),
                transparent 46%
              );
            opacity:.58;
            pointer-events:none;
            transition:opacity var(--duration-fast, .12s) var(--ease-standard, ease);
          }

          .inc-create-submit:hover{
            transform:translateY(var(--ui-hover-lift, -1px));
            background:var(--btn-primary-bg-hover, var(--btn-primary-bg, var(--accent, #7c5cff)));
            box-shadow:
              var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22)),
              var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
            filter:brightness(1.02);
          }

          .inc-create-submit:hover::before{
            opacity:.80;
          }

          .inc-create-submit:active{
            transform:translateY(0) scale(var(--ui-active-scale, .985));
            background:var(--btn-primary-bg-active, var(--btn-primary-bg, var(--accent, #7c5cff)));
          }

          .inc-create-submit:focus-visible{
            outline:none;
            box-shadow:
              var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22)),
              var(--focus-ring-strong, 0 0 0 4px rgba(113,113,122,.24));
          }

          .inc-create-submit:disabled{
            opacity:.68;
            cursor:wait;
            transform:none;
            filter:none;
            box-shadow:none;
          }

          .inc-create-submit-inner{
            display:inline-flex;
            align-items:center;
            gap:var(--space-xs, 8px);
          }

          .inc-create-spinner{
            inline-size:14px;
            block-size:14px;
            border-radius:var(--radius-pill, 999px);
            border:2px solid rgba(255,255,255,.28);
            border-block-start-color:#fff;
            animation:incidenciasCreateSpin .8s linear infinite;
          }

          [data-theme="light"] .inc-create-panel{
            background:
              var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
              var(--modal-bg, rgba(255,255,255,.955));
            border-color:var(--panel-border, rgba(23,32,51,.074));
            box-shadow:
              var(--shadow-xl, 0 28px 64px rgba(15,23,42,.12)),
              0 0 0 1px rgba(255,255,255,.56) inset;
          }

          [data-theme="light"] .inc-create-overlay{
            background:var(--overlay-bg, rgba(15,23,42,.25));
          }

          [data-theme="light"] .inc-create-loading-overlay{
            background:color-mix(in srgb, var(--modal-bg, rgba(255,255,255,.955)) 78%, transparent);
          }

          [data-theme="light"] .inc-create-loading-card{
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #6f59d9) 8%, transparent), transparent 100%),
              var(--popover-bg, rgba(255,255,255,.975));
            box-shadow:
              var(--shadow-lg, 0 18px 40px rgba(15,23,42,.10)),
              0 0 0 1px rgba(255,255,255,.56) inset;
          }

          @media (max-width: 640px){
            .inc-create-overlay{
              padding:10px;
            }

            .inc-create-panel{
              inline-size:calc(100vw - 20px);
              max-block-size:94dvh;
              border-radius:var(--radius-xl, 18px);
            }

            .inc-create-header{
              padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
            }

            .inc-create-body{
              padding:var(--space-md, 14px);
            }

            .inc-create-header-copy h2{
              font-size:27px;
            }

            .inc-create-target-user-card,
            .inc-create-file-row{
              flex-direction:column;
              align-items:flex-start;
            }

            .inc-create-actions{
              justify-content:stretch;
            }

            .inc-create-submit{
              inline-size:100%;
            }
          }

          @media (prefers-reduced-motion: reduce){
            .inc-create-panel,
            .inc-create-close,
            .inc-create-submit,
            .inc-create-search-item,
            .inc-create-dropzone,
            .inc-create-target-user-clear,
            .inc-create-file-remove,
            .inc-create-loading-spinner,
            .inc-create-spinner{
              animation:none !important;
              transition:none !important;
            }

            .inc-create-close:hover,
            .inc-create-submit:hover,
            .inc-create-search-item:hover,
            .inc-create-dropzone:hover,
            .inc-create-target-user-clear:hover,
            .inc-create-file-remove:hover{
              transform:none !important;
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

  if (root) {
    return root;
  }

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

/* =========================================================
   ESC HANDLER
========================================================= */

function detachEscHandler() {
  if (!modalState.escHandler) {
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape" && !modalState.submitting) {
      closeIncidenciasCreateModal();
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

  if (!modalState.isOpen) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();
  root.innerHTML = renderModalInner();
  modalState.bindingsAttached = false;

  return root;
}

function queryRoot(selector = "") {
  try {
    return getRoot()?.querySelector?.(selector) || null;
  } catch {
    return null;
  }
}

function updateUserSearchResultsSlot() {
  const slot = queryRoot("[data-user-search-results-slot='true']");
  if (!slot) return false;

  slot.innerHTML = renderUserSearchResults();

  return true;
}

function updateSelectedUserSlot() {
  const slot = queryRoot("[data-selected-user-slot='true']");
  if (!slot) return false;

  slot.innerHTML = renderSelectedUserCard();

  return true;
}

function updateTargetUserErrorSlot() {
  const slot = queryRoot("[data-target-user-error-slot='true']");
  const input = queryRoot("[data-field='targetUserSearch']");
  const error = safeText(modalState.errors?.targetUserId, "");

  if (slot) {
    slot.innerHTML = renderFieldError(error);
  }

  if (input) {
    input.classList.toggle("is-error", Boolean(error));
  }

  return Boolean(slot || input);
}

function updateTargetUserInputState({ syncValue = false } = {}) {
  const input = queryRoot("[data-field='targetUserSearch']");
  if (!input) return false;

  const targetUserId = safeText(modalState.form?.targetUserId, "");

  input.placeholder = targetUserId
    ? "Buscar otro usuario..."
    : "Buscar por nombre, email, username, teléfono...";

  if (syncValue) {
    input.value = safeText(modalState.userSearchQuery, "");
  }

  return true;
}

function updateUserSearchUI({ syncInput = false } = {}) {
  if (!modalState.isOpen) return false;

  const updatedInput = updateTargetUserInputState({ syncValue: syncInput });
  const updatedError = updateTargetUserErrorSlot();
  const updatedResults = updateUserSearchResultsSlot();
  const updatedSelected = updateSelectedUserSlot();

  return Boolean(
    updatedInput ||
      updatedError ||
      updatedResults ||
      updatedSelected
  );
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

function focusField(fieldName = "") {
  try {
    const root = getRoot();
    const field = root?.querySelector?.(`[data-field="${fieldName}"]`);
    field?.focus?.();

    if (
      field &&
      typeof field.setSelectionRange === "function" &&
      typeof field.value === "string"
    ) {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }

    return Boolean(field);
  } catch {
    return false;
  }
}

function focusUserSearchInput() {
  if (!canSelectTargetUser()) return false;
  return focusField("targetUserSearch");
}

function focusFirstInvalidField() {
  const errors = safeObject(modalState.errors);

  if (errors.targetUserId) {
    if (focusUserSearchInput()) return true;
  }

  if (errors.subject) {
    if (focusField("subject")) return true;
  }

  if (errors.description) {
    if (focusField("description")) return true;
  }

  return false;
}

function focusPreferredField() {
  if (canSelectTargetUser() && !safeText(modalState.form?.targetUserId, "")) {
    if (focusUserSearchInput()) return true;
  }

  if (!safeText(modalState.form?.subject, "")) {
    if (focusField("subject")) return true;
  }

  if (!safeText(modalState.form?.description, "")) {
    if (focusField("description")) return true;
  }

  focusPanel();
  return true;
}

/* =========================================================
   USER SEARCH FLOW · NO FULL RERENDER
========================================================= */

async function performUserSearch(query = "") {
  if (!canSelectTargetUser()) {
    return [];
  }

  const normalized = normalizeWhitespace(query);
  const currentSeq = ++modalState.userSearchSeq;

  if (normalized.length < 2) {
    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = [];

    updateUserSearchUI({
      syncInput: false,
    });

    return [];
  }

  modalState.userSearchLoading = true;
  modalState.userSearchError = "";
  modalState.userSearchResults = [];

  updateUserSearchUI({
    syncInput: false,
  });

  try {
    const items = await searchUsersRequest(normalized);

    if (currentSeq !== modalState.userSearchSeq) {
      return [];
    }

    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = safeArray(items);

    updateUserSearchUI({
      syncInput: false,
    });

    return items;
  } catch (error) {
    if (currentSeq !== modalState.userSearchSeq) {
      return [];
    }

    modalState.userSearchLoading = false;
    modalState.userSearchResults = [];
    modalState.userSearchError = safeErrorMessage(
      error,
      "No se pudieron cargar usuarios."
    );

    updateUserSearchUI({
      syncInput: false,
    });

    return [];
  }
}

function scheduleUserSearch(query = "") {
  clearUserSearchTimer();

  const normalized = normalizeWhitespace(query);

  if (normalized.length < 2) {
    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = [];

    updateUserSearchUI({
      syncInput: false,
    });

    return;
  }

  modalState.userSearchDebounce = setTimeout(() => {
    performUserSearch(normalized);
  }, USER_SEARCH_DEBOUNCE);
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openIncidenciasCreateModal(draft = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;
  modalState.dragActive = false;

  resetFeedbackState();
  resetUserSearchState();

  modalState.form = {
    ...getInitialForm(),
    ...safeObject(draft),
    attachments: [],
  };

  modalState.form.attachments = [];

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPreferredField();

  safeEmit("incidencias:create-modal:opened", {
    draft: {
      targetUserId: modalState.form.targetUserId,
      targetUserName: modalState.form.targetUserName,
      targetUserEmail: modalState.form.targetUserEmail,
      subject: modalState.form.subject,
      description: modalState.form.description,
    },
    targetMode: canSelectTargetUser(),
  });

  return true;
}

export function closeIncidenciasCreateModal() {
  if (modalState.submitting) {
    return false;
  }

  const root = getRoot();

  modalState.isOpen = false;
  modalState.submitting = false;
  modalState.dragActive = false;

  resetFeedbackState();
  resetFormState();
  resetUserSearchState();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("incidencias:create-modal:closed", {});

  return true;
}

export function updateIncidenciasCreateModal(draft = {}) {
  if (!modalState.isOpen) {
    return openIncidenciasCreateModal(draft);
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(draft),
    attachments: safeArray(modalState.form.attachments),
  };

  persistDraft();
  renderModal();
  attachRootBindings();
  focusPreferredField();

  return true;
}

/* =========================================================
   SUBMIT FLOW
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) {
    return false;
  }

  modalState.successMessage = "";
  modalState.createdTicketId = "";
  modalState.serverError = "";

  const validation = validateForm(modalState.form);

  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    focusFirstInvalidField();

    showToast("Revisa los campos obligatorios.", "warning");

    return false;
  }

  modalState.form.attachments = validation.files;

  const payload = buildPayload(modalState.form);

  modalState.submitting = true;

  syncCreateViewState({
    submitting: true,
    serverError: "",
    errors: {},
  });

  renderModal();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:create:submit", {
    userId: safeText(modalState.form.targetUserId, ""),
    userName: safeText(modalState.form.targetUserName, ""),
    subject: safeText(modalState.form.subject, ""),
    description: safeText(modalState.form.description, ""),
    attachmentsCount: safeArray(modalState.form.attachments).length,
    targetMode: canSelectTargetUser(),
  });

  try {
    const response = await createIncidenciaRequest(payload);
    const createdTicketId = resolveCreatedTicketId(response);
    const detail = pickCreatedTicket(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "Incidencia creada.";
    modalState.createdTicketId = createdTicketId;

    syncCreateViewState({
      submitting: false,
      errors: {},
      serverError: "",
      createdTicketId,
      successMessage: "Incidencia creada.",
    });

    clearDraft();
    resetFormState();
    resetUserSearchState();

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast("Incidencia creada correctamente.", "success");

    safeEmit("incidencias:create:success", {
      ticketId: createdTicketId,
      response,
      detail,
    });

    setTimeout(() => {
      if (modalState.isOpen && !modalState.submitting) {
        closeIncidenciasCreateModal();
      }
    }, 380);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(
      error,
      "No se pudo crear la incidencia."
    );

    syncCreateViewState({
      submitting: false,
      serverError: modalState.serverError,
    });

    safeEmit("incidencias:create:error", {
      error,
      message: modalState.serverError,
    });

    renderModal();
    attachRootBindings();
    focusPreferredField();

    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function addAttachments(files = []) {
  const merged = dedupeFiles([
    ...safeArray(modalState.form.attachments),
    ...safeArray(files),
  ]);

  const validation = validateFiles(merged);

  setFormPatch({
    attachments: validation.files,
  });

  if (!validation.valid) {
    modalState.errors = {
      ...safeObject(modalState.errors),
      attachments: validation.errors[0] || "Adjuntos no válidos.",
    };
  } else if (modalState.errors.attachments) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.attachments;
    modalState.errors = nextErrors;
  }

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";
}

function handleTargetUserSearchInput(target) {
  const value = safeText(target?.value, "");

  modalState.userSearchQuery = value;
  modalState.userSearchResults = [];
  modalState.userSearchLoading = false;
  modalState.userSearchError = "";

  if (safeText(modalState.form?.targetUserId, "")) {
    clearTargetUserSelection();
  }

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdTicketId) {
    modalState.successMessage = "";
    modalState.createdTicketId = "";
  }

  updateUserSearchUI({
    syncInput: false,
  });

  scheduleUserSearch(value);
}

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");
  if (!field) return;

  if (field === "targetUserSearch") {
    handleTargetUserSearchInput(target);
    return;
  }

  if (field === "attachments") {
    const files = getFileListFromInput(target);
    addAttachments(files);
  } else {
    setFormPatch({
      [field]: target?.value,
    });
  }

  if (modalState.errors[field]) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors[field];
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdTicketId) {
    modalState.successMessage = "";
    modalState.createdTicketId = "";
  }

  if (field === "attachments") {
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

function selectTargetUserByIndex(index = -1) {
  const user = safeArray(modalState.userSearchResults)[Number(index)];

  if (!user?.id) return false;

  setFormPatch({
    targetUserId: safeText(user.id, ""),
    targetUserName: safeText(user.name, ""),
    targetUserEmail: safeText(user.email, ""),
  });

  modalState.userSearchQuery = "";
  modalState.userSearchResults = [];
  modalState.userSearchLoading = false;
  modalState.userSearchError = "";

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }

  updateUserSearchUI({
    syncInput: true,
  });

  focusField("subject");

  return true;
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.field, "");

    if (fieldName === "targetUserSearch") {
      handleTargetUserSearchInput(field);
      return;
    }

    if (field.type === "file") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("#incidencias-create-form");
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onDragEnter = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone || modalState.submitting) return;

    event.preventDefault();

    modalState.dragActive = true;

    renderModal();
    attachRootBindings();
  };

  const onDragOver = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone || modalState.submitting) return;

    event.preventDefault();

    if (!modalState.dragActive) {
      modalState.dragActive = true;
      renderModal();
      attachRootBindings();
    }
  };

  const onDragLeave = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone || modalState.submitting) return;

    const related = event.relatedTarget;

    if (related && dropzone.contains(related)) {
      return;
    }

    event.preventDefault();

    modalState.dragActive = false;

    renderModal();
    attachRootBindings();
  };

  const onDrop = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone || modalState.submitting) return;

    event.preventDefault();

    modalState.dragActive = false;

    const files = Array.from(event.dataTransfer?.files || []);
    addAttachments(files);

    renderModal();
    attachRootBindings();
    focusPanel();
  };

  const onClick = (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();
      closeIncidenciasCreateModal();
      return;
    }

    const overlay = event.target.closest(
      "[data-incidencias-create-modal-overlay='true']"
    );

    const panel = event.target.closest(
      "[data-incidencias-create-modal-panel='true']"
    );

    if (
      overlay &&
      !panel &&
      event.target === overlay &&
      !modalState.submitting
    ) {
      closeIncidenciasCreateModal();
      return;
    }

    const removeAttachmentBtn = event.target.closest("[data-remove-attachment]");

    if (removeAttachmentBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      const index = Number(removeAttachmentBtn.dataset.removeAttachment);

      const files = safeArray(modalState.form.attachments).filter(
        (_, i) => i !== index
      );

      setFormPatch({
        attachments: files,
      });

      if (modalState.errors.attachments) {
        const nextErrors = { ...modalState.errors };
        delete nextErrors.attachments;
        modalState.errors = nextErrors;
      }

      renderModal();
      attachRootBindings();
      focusPanel();
      return;
    }

    const selectUserBtn = event.target.closest("[data-select-target-user]");

    if (selectUserBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      selectTargetUserByIndex(selectUserBtn.dataset.selectTargetUser);
      return;
    }

    const clearUserBtn = event.target.closest("[data-clear-selected-user='true']");

    if (clearUserBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      clearTargetUserSelection();

      modalState.userSearchQuery = "";
      modalState.userSearchResults = [];
      modalState.userSearchLoading = false;
      modalState.userSearchError = "";

      updateUserSearchUI({
        syncInput: true,
      });

      focusUserSearchInput();
    }
  };

  root.__incidenciasCreateModalInputHandler = onInput;
  root.__incidenciasCreateModalChangeHandler = onChange;
  root.__incidenciasCreateModalSubmitHandler = onSubmit;
  root.__incidenciasCreateModalDragEnterHandler = onDragEnter;
  root.__incidenciasCreateModalDragOverHandler = onDragOver;
  root.__incidenciasCreateModalDragLeaveHandler = onDragLeave;
  root.__incidenciasCreateModalDropHandler = onDrop;
  root.__incidenciasCreateModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("dragenter", onDragEnter);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("drop", onDrop);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();

  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__incidenciasCreateModalInputHandler) {
    try {
      root.removeEventListener("input", root.__incidenciasCreateModalInputHandler);
    } catch {}

    delete root.__incidenciasCreateModalInputHandler;
  }

  if (root.__incidenciasCreateModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__incidenciasCreateModalChangeHandler);
    } catch {}

    delete root.__incidenciasCreateModalChangeHandler;
  }

  if (root.__incidenciasCreateModalSubmitHandler) {
    try {
      root.removeEventListener("submit", root.__incidenciasCreateModalSubmitHandler);
    } catch {}

    delete root.__incidenciasCreateModalSubmitHandler;
  }

  if (root.__incidenciasCreateModalDragEnterHandler) {
    try {
      root.removeEventListener("dragenter", root.__incidenciasCreateModalDragEnterHandler);
    } catch {}

    delete root.__incidenciasCreateModalDragEnterHandler;
  }

  if (root.__incidenciasCreateModalDragOverHandler) {
    try {
      root.removeEventListener("dragover", root.__incidenciasCreateModalDragOverHandler);
    } catch {}

    delete root.__incidenciasCreateModalDragOverHandler;
  }

  if (root.__incidenciasCreateModalDragLeaveHandler) {
    try {
      root.removeEventListener("dragleave", root.__incidenciasCreateModalDragLeaveHandler);
    } catch {}

    delete root.__incidenciasCreateModalDragLeaveHandler;
  }

  if (root.__incidenciasCreateModalDropHandler) {
    try {
      root.removeEventListener("drop", root.__incidenciasCreateModalDropHandler);
    } catch {}

    delete root.__incidenciasCreateModalDropHandler;
  }

  if (root.__incidenciasCreateModalClickHandler) {
    try {
      root.removeEventListener("click", root.__incidenciasCreateModalClickHandler);
    } catch {}

    delete root.__incidenciasCreateModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function unwrapEventDetail(event) {
  return event?.detail?.draft || event?.detail || event || {};
}

function handleOpenEvent(event) {
  const draft = unwrapEventDetail(event);
  openIncidenciasCreateModal(safeObject(draft));
}

function handleCloseEvent() {
  closeIncidenciasCreateModal();
}

function handleUpdateEvent(event) {
  const draft = unwrapEventDetail(event);
  updateIncidenciasCreateModal(safeObject(draft));
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:create-modal:open", handleOpenEvent);
  safeOn("incidencias:create-modal:close", handleCloseEvent);
  safeOn("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:create-modal:open", handleOpenEvent);
  safeOff("incidencias:create-modal:close", handleCloseEvent);
  safeOff("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasCreateModal = {
  open(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  close() {
    return closeIncidenciasCreateModal();
  },

  update(draft = {}) {
    return updateIncidenciasCreateModal(draft);
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },
      userSearchResults: [...safeArray(modalState.userSearchResults)],
      form: {
        ...safeObject(modalState.form),
        attachments: [...safeArray(modalState.form.attachments)],
      },
    };
  },

  destroy() {
    detachRootBindings();
    closeIncidenciasCreateModal();
    detachEscHandler();
    detachBus();
    clearUserSearchTimer();

    const root = getRoot();

    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionIncidenciasCreateModal = OnionIncidenciasCreateModal;

  window.renderIncidenciasCreateModal = OnionIncidenciasCreateModal.open;
  window.renderIncidenciaCreateModal = OnionIncidenciasCreateModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasCreateModal;

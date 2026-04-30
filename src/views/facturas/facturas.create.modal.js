/* =========================================================
   Onion SPA - Facturas Create Modal
   Archivo: src/views/facturas/facturas.create.modal.js

   FACTURAS EXPERIENCE PRO · CREATE MODAL · COSMOS/BLOB ALIGNED · GOD MODE

   Responsabilidades:
   - abrir/cerrar modal premium de creación de factura
   - buscar cliente/usuario objetivo
   - buscar incidencia/ticket vinculado obligatorio
   - crear factura desde panel admin alineada con backend v3
   - enviar payload compatible con /router/facturas/factura_create_admin.js
   - soportar factura con:
       clienteId
       ticketId / incidenciaId
       fechaEmision / fechaFacturaLegal / fechaServicio
       lineas
       sendEmail
   - emitir facturas:create:success para refrescar vista
   - evitar doble submit y doble binding
   - exponer bridge global para abrir desde cualquier vista
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "facturas-create-modal-root";
const PANEL_ID = "facturas-create-modal-panel";

const FACTURAS_CREATE_ENDPOINT = "/api/facturas";

const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/clientes",
  "/api/clientes/search",
  "/api/search/users",
  "/api/users/search",
  "/api/usuarios/search",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/tickets",
  "/api/search/incidencias",
  "/api/tickets/search",
  "/api/incidencias/search",
  "/api/tickets",
  "/api/incidencias",
]);

const SEARCH_LIMIT = 8;
const SEARCH_DEBOUNCE = 240;

const CREATE_TIMEOUT_MS = 90000;
const SEARCH_TIMEOUT_MS = 15000;

const DEFAULT_FORM = Object.freeze({
  clienteId: "",
  clienteNombre: "",
  clienteEmail: "",

  ticketId: "",
  incidenciaId: "",
  incidenciaSubject: "",

  concepto: "Servicios de soporte y asistencia técnica informática",
  descripcion: "",
  cantidad: 1,
  precioUnitario: 20,

  fechaFactura: "",
  fechaServicio: "",

  formaPago: "transferencia bancaria",
  cuentaPago: "",
  moneda: "EUR",
  estadoPago: "pendiente",

  sendEmail: true,
});

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  isOpen: false,
  submitting: false,
  bindingsAttached: false,
  escHandler: null,
  lastActiveElement: null,

  clienteSearchQuery: "",
  clienteSearchResults: [],
  clienteSearchLoading: false,
  clienteSearchError: "",
  clienteSearchDebounce: null,
  clienteSearchSeq: 0,

  ticketSearchQuery: "",
  ticketSearchResults: [],
  ticketSearchLoading: false,
  ticketSearchError: "",
  ticketSearchDebounce: null,
  ticketSearchSeq: 0,

  errors: {},
  serverError: "",
  successMessage: "",
  createdFacturaId: "",

  form: {
    ...DEFAULT_FORM,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function round2(value) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);

    if (["true", "1", "yes", "si", "sí", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function todayInputValue() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = safeNumber(value, 0);

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

  try {
    AppCore?.events?.off?.(eventName, handler);
  } catch {}

  try {
    window.removeEventListener(eventName, handler);
  } catch {}

  return true;
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

function buildUrl(endpoint = "") {
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
      typeof localStorage !== "undefined" ? localStorage.getItem("accessToken") : "",
      typeof localStorage !== "undefined" ? localStorage.getItem("authToken") : "",
      typeof localStorage !== "undefined" ? localStorage.getItem("onion.token") : "",

      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("accessToken") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("authToken") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("onion.token") : ""
    ),
    ""
  );
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

function safeErrorMessage(error = null, fallback = "No se pudo completar la operación.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.data?.error,
      error?.response?.error,
      error?.error,
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

function shouldTryNext(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   API HELPERS
========================================================= */

async function requestJsonFetch(endpoint = "", options = {}) {
  const url = buildUrl(endpoint);
  const token = getAuthToken();
  const timeout = createTimeoutController(
    safeNumber(options.timeoutMs, SEARCH_TIMEOUT_MS)
  );

  try {
    const response = await fetch(url, {
      method: safeText(options.method, "GET").toUpperCase(),
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...safeObject(options.headers),
      },
      credentials: "include",
      signal: timeout.signal,
      ...(options.body
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
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
          first(data?.message, data?.error, data?.code, `HTTP ${response.status}`),
          `HTTP ${response.status}`
        )
      );

      error.status = response.status;
      error.statusCode = response.status;
      error.response = data;

      throw error;
    }

    return data;
  } finally {
    timeout.clear();
  }
}

async function apiGet(endpoint = "") {
  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http;

  if (typeof client?.get === "function") {
    return client.get(endpoint, {
      timeout: SEARCH_TIMEOUT_MS,
      auth: true,
    });
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "GET",
      timeout: SEARCH_TIMEOUT_MS,
      auth: true,
    });
  }

  return requestJsonFetch(endpoint, {
    method: "GET",
    timeoutMs: SEARCH_TIMEOUT_MS,
  });
}

async function apiPost(endpoint = "", body = {}) {
  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http;

  if (typeof client?.post === "function") {
    return client.post(endpoint, body, {
      timeout: CREATE_TIMEOUT_MS,
      auth: true,
    });
  }

  if (typeof client?.request === "function") {
    return client.request(endpoint, {
      method: "POST",
      timeout: CREATE_TIMEOUT_MS,
      auth: true,
      body,
    });
  }

  return requestJsonFetch(endpoint, {
    method: "POST",
    body,
    timeoutMs: CREATE_TIMEOUT_MS,
  });
}

/* =========================================================
   CLIENT SEARCH
========================================================= */

function buildClientSearchUrls(query = "") {
  const params = new URLSearchParams();

  params.set("q", safeText(query, ""));
  params.set("search", safeText(query, ""));
  params.set("limit", String(SEARCH_LIMIT));

  return CLIENT_SEARCH_ENDPOINTS.map((endpoint) => `${endpoint}?${params.toString()}`);
}

function normalizeClientCandidate(raw = null) {
  const obj = safeObject(raw);
  const user = safeObject(obj.user);
  const cliente = safeObject(obj.cliente);
  const contacto = safeObject(obj.contacto);

  const clienteId = safeText(
    first(
      obj.clienteId,
      obj.id,
      obj._id,

      cliente.clienteId,
      cliente.id,
      cliente.clienteIdInterno,

      obj.clienteIdInterno
    ),
    ""
  );

  const userId = safeText(
    first(
      obj.userId,
      obj.usuarioId,
      obj.uid,

      cliente.userId,
      cliente.usuarioId,

      user.userId,
      user.id,
      user._id
    ),
    ""
  );

  const id = clienteId || userId;
  if (!id) return null;

  const name = safeText(
    first(
      obj.nombreFiscal,
      obj.razonSocial,
      obj.nombreContacto,
      obj.nombre,
      obj.name,
      obj.fullName,
      obj.displayName,

      cliente.nombreFiscal,
      cliente.razonSocial,
      cliente.nombreContacto,
      cliente.nombre,
      cliente.name,
      cliente.displayName,

      contacto.nombre,
      contacto.name,

      user.name,
      user.nombre,
      user.fullName,
      user.displayName
    ),
    `Cliente ${id}`
  );

  const email = safeText(
    first(
      obj.email,
      obj.emailCliente,
      obj.clienteEmail,
      obj.mail,
      obj.emailLower,

      cliente.email,
      cliente.emailCliente,
      cliente.clienteEmail,
      cliente.emailLower,

      contacto.email,
      contacto.mail,

      user.email,
      user.mail
    ),
    ""
  ).toLowerCase();

  const empresa = safeText(
    first(
      obj.razonSocial,
      obj.nombreFiscal,
      obj.empresa,
      cliente.razonSocial,
      cliente.nombreFiscal,
      cliente.empresa,
      ""
    ),
    ""
  );

  const subtitle = safeText(
    first(
      empresa && empresa !== name ? empresa : "",
      email,
      obj.telefono,
      obj.phone,
      contacto.telefono,
      contacto.phone,
      clienteId || userId
    ),
    id
  );

  return {
    id,
    clienteId: clienteId || id,
    userId: userId || "",
    name,
    nombre: name,
    email,
    empresa,
    subtitle,
    raw: obj,
  };
}

function extractItems(payload = null) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.clientes,
    obj.users,
    obj.usuarios,
    obj.tickets,
    obj.incidencias,
    obj.items,
    obj.results,
    obj.rows,
    obj.records,
    obj.list,

    obj.data?.clientes,
    obj.data?.users,
    obj.data?.usuarios,
    obj.data?.tickets,
    obj.data?.incidencias,
    obj.data?.items,
    obj.data?.results,
    obj.data?.rows,
    obj.data?.records,

    obj.payload?.clientes,
    obj.payload?.users,
    obj.payload?.usuarios,
    obj.payload?.tickets,
    obj.payload?.incidencias,
    obj.payload?.items,
    obj.payload?.results,

    obj.result?.clientes,
    obj.result?.users,
    obj.result?.usuarios,
    obj.result?.tickets,
    obj.result?.incidencias,
    obj.result?.items,
    obj.result?.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function dedupeClients(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const normalized = normalizeClientCandidate(item);
    if (!normalized?.id) return;

    const key = normalized.clienteId || normalized.userId || normalized.id;

    if (!map.has(key)) {
      map.set(key, normalized);
    }
  });

  return Array.from(map.values()).slice(0, SEARCH_LIMIT);
}

async function searchClientesRequest(query = "") {
  const urls = buildClientSearchUrls(query);

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await apiGet(url);
      const items = dedupeClients(extractItems(response));

      if (items.length) {
        return items;
      }
    } catch (error) {
      lastError = error;

      if (!shouldTryNext(error)) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

function clearClientSearchTimer() {
  if (!modalState.clienteSearchDebounce) return;

  try {
    clearTimeout(modalState.clienteSearchDebounce);
  } catch {}

  modalState.clienteSearchDebounce = null;
}

async function performClientSearch(query = "") {
  const normalized = normalizeWhitespace(query);
  const seq = ++modalState.clienteSearchSeq;

  if (normalized.length < 2) {
    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = [];

    renderModal();
    attachRootBindings();
    focusField("clienteSearch");

    return [];
  }

  modalState.clienteSearchLoading = true;
  modalState.clienteSearchError = "";
  modalState.clienteSearchResults = [];

  renderModal();
  attachRootBindings();
  focusField("clienteSearch");

  try {
    const results = await searchClientesRequest(normalized);

    if (seq !== modalState.clienteSearchSeq) {
      return [];
    }

    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = results;

    renderModal();
    attachRootBindings();
    focusField("clienteSearch");

    return results;
  } catch (error) {
    if (seq !== modalState.clienteSearchSeq) {
      return [];
    }

    modalState.clienteSearchLoading = false;
    modalState.clienteSearchResults = [];
    modalState.clienteSearchError = safeErrorMessage(error, "No se pudo buscar cliente.");

    renderModal();
    attachRootBindings();
    focusField("clienteSearch");

    return [];
  }
}

function scheduleClientSearch(query = "") {
  clearClientSearchTimer();

  const normalized = normalizeWhitespace(query);

  if (normalized.length < 2) {
    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = [];

    renderModal();
    attachRootBindings();
    focusField("clienteSearch");

    return;
  }

  modalState.clienteSearchDebounce = setTimeout(() => {
    performClientSearch(normalized);
  }, SEARCH_DEBOUNCE);
}

/* =========================================================
   TICKET SEARCH
========================================================= */

function buildTicketSearchUrls(query = "") {
  const params = new URLSearchParams();

  params.set("q", safeText(query, ""));
  params.set("search", safeText(query, ""));
  params.set("limit", String(SEARCH_LIMIT));

  const clienteId = safeText(modalState.form?.clienteId, "");

  if (clienteId) {
    params.set("clienteId", clienteId);
  }

  return TICKET_SEARCH_ENDPOINTS.map((endpoint) => `${endpoint}?${params.toString()}`);
}

function normalizeTicketCandidate(raw = null) {
  const obj = safeObject(raw);
  const ticket = safeObject(obj.ticket);
  const incidencia = safeObject(obj.incidencia);
  const cliente = safeObject(obj.cliente);
  const requesterSnapshot = safeObject(obj.requesterSnapshot);

  const id = safeText(
    first(
      obj.ticketId,
      obj.incidenciaId,
      obj.id,
      obj.caseId,
      obj.supportTicketId,

      ticket.ticketId,
      ticket.incidenciaId,
      ticket.id,

      incidencia.ticketId,
      incidencia.incidenciaId,
      incidencia.id
    ),
    ""
  );

  if (!id) return null;

  const subject = safeText(
    first(
      obj.subject,
      obj.asunto,
      obj.title,
      obj.preview,
      obj.description,

      ticket.subject,
      ticket.asunto,
      ticket.title,

      incidencia.subject,
      incidencia.asunto,
      incidencia.title
    ),
    id
  );

  const clienteId = safeText(
    first(
      obj.clienteId,
      ticket.clienteId,
      incidencia.clienteId,
      cliente.id,
      cliente.clienteId,
      requesterSnapshot.clienteId
    ),
    ""
  );

  const userId = safeText(
    first(
      obj.userId,
      ticket.userId,
      incidencia.userId,
      requesterSnapshot.userId,
      cliente.userId
    ),
    ""
  );

  const status = safeText(
    first(
      obj.status,
      obj.estado,
      ticket.status,
      ticket.estado,
      incidencia.status,
      incidencia.estado
    ),
    ""
  );

  const category = safeText(
    first(
      obj.category,
      obj.categoria,
      obj.tipoLabel,
      obj.tipo,
      ticket.category,
      ticket.categoria,
      incidencia.category,
      incidencia.categoria
    ),
    ""
  );

  const date = safeText(
    first(
      obj.createdAtES,
      obj.createdAt,
      obj.updatedAtES,
      obj.updatedAt,
      ticket.createdAtES,
      ticket.createdAt,
      incidencia.createdAtES,
      incidencia.createdAt
    ),
    ""
  );

  const subtitle = [status, category, date].filter(Boolean).join(" · ") || id;

  return {
    id,
    ticketId: id,
    incidenciaId: id,
    subject,
    asunto: subject,
    clienteId,
    userId,
    status,
    category,
    date,
    subtitle,
    raw: obj,
  };
}

function dedupeTickets(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const normalized = normalizeTicketCandidate(item);
    if (!normalized?.id) return;

    if (!map.has(normalized.id)) {
      map.set(normalized.id, normalized);
    }
  });

  return Array.from(map.values()).slice(0, SEARCH_LIMIT);
}

async function searchTicketsRequest(query = "") {
  const urls = buildTicketSearchUrls(query);

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await apiGet(url);
      const items = dedupeTickets(extractItems(response));

      if (items.length) {
        return items;
      }
    } catch (error) {
      lastError = error;

      if (!shouldTryNext(error)) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

function clearTicketSearchTimer() {
  if (!modalState.ticketSearchDebounce) return;

  try {
    clearTimeout(modalState.ticketSearchDebounce);
  } catch {}

  modalState.ticketSearchDebounce = null;
}

async function performTicketSearch(query = "") {
  const normalized = normalizeWhitespace(query);
  const seq = ++modalState.ticketSearchSeq;

  if (normalized.length < 2) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];

    renderModal();
    attachRootBindings();
    focusField("ticketSearch");

    return [];
  }

  modalState.ticketSearchLoading = true;
  modalState.ticketSearchError = "";
  modalState.ticketSearchResults = [];

  renderModal();
  attachRootBindings();
  focusField("ticketSearch");

  try {
    const results = await searchTicketsRequest(normalized);

    if (seq !== modalState.ticketSearchSeq) {
      return [];
    }

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = results;

    renderModal();
    attachRootBindings();
    focusField("ticketSearch");

    return results;
  } catch (error) {
    if (seq !== modalState.ticketSearchSeq) {
      return [];
    }

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchResults = [];
    modalState.ticketSearchError = safeErrorMessage(error, "No se pudo buscar incidencia.");

    renderModal();
    attachRootBindings();
    focusField("ticketSearch");

    return [];
  }
}

function scheduleTicketSearch(query = "") {
  clearTicketSearchTimer();

  const normalized = normalizeWhitespace(query);

  if (normalized.length < 2) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];

    renderModal();
    attachRootBindings();
    focusField("ticketSearch");

    return;
  }

  modalState.ticketSearchDebounce = setTimeout(() => {
    performTicketSearch(normalized);
  }, SEARCH_DEBOUNCE);
}

/* =========================================================
   FORM / PAYLOAD
========================================================= */

function resetForm() {
  modalState.form = {
    ...DEFAULT_FORM,
    fechaFactura: todayInputValue(),
    fechaServicio: todayInputValue(),
  };
}

function setFormPatch(patch = {}) {
  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(patch),
  };

  return modalState.form;
}

function clearFeedback() {
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdFacturaId = "";
}

function getFormTotal(form = {}) {
  return round2(safeNumber(form.cantidad, 0) * safeNumber(form.precioUnitario, 0));
}

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const clienteId = safeText(current.clienteId, "");
  const incidenciaId = safeText(first(current.incidenciaId, current.ticketId), "");
  const concepto = normalizeWhitespace(current.concepto);
  const descripcion = normalizeWhitespace(current.descripcion);

  const cantidad = safeNumber(current.cantidad, 0);
  const precioUnitario = safeNumber(current.precioUnitario, 0);

  if (!clienteId) {
    errors.clienteId = "Selecciona un cliente.";
  }

  if (!incidenciaId) {
    errors.incidenciaId = "Selecciona una incidencia. La factura debe quedar vinculada.";
  }

  if (!concepto || concepto.length < 3) {
    errors.concepto = "Indica un concepto válido.";
  }

  if (!descripcion || descripcion.length < 4) {
    errors.descripcion = "Indica una descripción mínima.";
  }

  if (cantidad <= 0) {
    errors.cantidad = "Cantidad inválida.";
  }

  if (precioUnitario <= 0) {
    errors.precioUnitario = "Precio inválido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function buildCreatePayload(form = {}) {
  const current = safeObject(form);

  const cantidad = safeNumber(current.cantidad, 1);
  const precioUnitario = safeNumber(current.precioUnitario, 0);
  const totalLinea = round2(cantidad * precioUnitario);

  const clienteId = safeText(current.clienteId, "");
  const clienteNombre = safeText(current.clienteNombre, "");
  const clienteEmail = safeText(current.clienteEmail, "").toLowerCase();

  const ticketId = safeText(first(current.ticketId, current.incidenciaId), "");
  const incidenciaSubject = safeText(current.incidenciaSubject, ticketId);

  const fechaFactura = safeText(current.fechaFactura, todayInputValue());
  const fechaServicio = safeText(current.fechaServicio, fechaFactura);

  const concepto = normalizeWhitespace(current.concepto);
  const descripcion = normalizeWhitespace(current.descripcion);

  return {
    tipoDocumento: "factura",
    entityType: "invoice",
    schemaVersion: 3,
    versionEsquema: 3,

    source: "panel_admin",
    origen: "panel_admin",
    createdFrom: "facturas_create_modal",

    clienteId,

    clienteNombre,
    clienteEmail,
    emailCliente: clienteEmail || undefined,

    cliente: {
      id: clienteId,
      clienteId,
      clienteIdInterno: clienteId,
      nombre: clienteNombre,
      name: clienteNombre,
      displayName: clienteNombre,
      nombreContacto: clienteNombre,
      razonSocial: clienteNombre,
      email: clienteEmail || undefined,
      emailLower: clienteEmail || undefined,
    },

    ticketId,
    incidenciaId: ticketId,
    supportTicketId: ticketId,
    incidenciaSubject,
    ticketSubject: incidenciaSubject,
    asunto: incidenciaSubject,

    fechaFactura,
    fechaFacturaLegal: fechaFactura,
    fechaEmision: fechaFactura,
    invoiceDate: fechaFactura,

    fechaServicio,
    fechaTrabajo: fechaServicio,
    serviceDate: fechaServicio,

    moneda: safeText(current.moneda, "EUR"),
    currency: safeText(current.moneda, "EUR"),

    formaPago: safeText(current.formaPago, "transferencia bancaria"),
    metodoPago: safeText(current.formaPago, "transferencia bancaria"),

    cuentaPago: safeText(current.cuentaPago, "") || undefined,

    estadoPago: safeText(current.estadoPago, "pendiente"),
    estado: "emitida",

    sendEmail: parseBoolean(current.sendEmail, true),

    concepto,
    descripcion,
    description: descripcion,
    preview: descripcion || concepto,

    cantidad,
    horas: cantidad,
    precioUnitario,

    lineas: [
      {
        id: "linea-1",
        lineNumber: 1,
        concepto,
        descripcion,
        cantidad,
        horas: cantidad,
        unidad: "h",
        precioUnitario,
        totalLinea,
        subtotal: totalLinea,
        base: totalLinea,
        baseImponible: totalLinea,
        total: totalLinea,
        importe: totalLinea,
      },
    ],

    baseImponible: totalLinea,
    subtotal: totalLinea,
    total: totalLinea,
    amount: totalLinea,
    importe: totalLinea,
    importeTotal: totalLinea,
  };
}

function pickCreatedFactura(payload = null) {
  if (!payload) return null;

  const obj = safeObject(payload);

  return (
    obj.factura ||
    obj.item ||
    obj.data?.factura ||
    obj.data?.item ||
    obj.data ||
    obj.result?.factura ||
    obj.result?.item ||
    obj.result ||
    obj.payload?.factura ||
    obj.payload?.item ||
    obj.payload ||
    obj
  );
}

function getCreatedFacturaId(payload = null) {
  const item = safeObject(pickCreatedFactura(payload));

  return safeText(
    first(
      item.id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      payload?.id,
      payload?.facturaId,
      payload?.invoiceId
    ),
    ""
  );
}

/* =========================================================
   RENDER HELPERS
========================================================= */

function renderFieldError(message = "") {
  const text = safeText(message, "");
  if (!text) return "";

  return `<span class="fac-create-error">${escapeHtml(text)}</span>`;
}

function renderAlert(type = "info", title = "", text = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="fac-create-alert is-${escapeHtml(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
    </div>
  `;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  type = "text",
  placeholder = "",
  error = "",
  required = false,
  step = "",
  min = "",
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <input
        class="fac-create-input ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${step ? `step="${escapeHtml(step)}"` : ""}
        ${min ? `min="${escapeHtml(min)}"` : ""}
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
  error = "",
  required = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <textarea
        class="fac-create-textarea ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="4"
        placeholder="${escapeHtml(placeholder)}"
        ${modalState.submitting ? "disabled" : ""}
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderCheckbox({
  label = "",
  name = "",
  checked = false,
  help = "",
} = {}) {
  return `
    <label class="fac-create-check">
      <input
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="checkbox"
        ${checked ? "checked" : ""}
        ${modalState.submitting ? "disabled" : ""}
      />

      <span>
        <strong>${escapeHtml(label)}</strong>
        ${help ? `<small>${escapeHtml(help)}</small>` : ""}
      </span>
    </label>
  `;
}

function renderSelectedCliente() {
  const form = safeObject(modalState.form);

  if (!safeText(form.clienteId, "")) return "";

  return `
    <div class="fac-create-selected">
      <div class="fac-create-selected-copy">
        <strong>${escapeHtml(safeText(form.clienteNombre, "Cliente seleccionado"))}</strong>
        <span>${escapeHtml(safeText(form.clienteEmail, form.clienteId))}</span>
      </div>

      <button
        type="button"
        class="fac-create-selected-clear"
        data-clear-cliente="true"
        ${modalState.submitting ? "disabled" : ""}
      >
        Cambiar
      </button>
    </div>
  `;
}

function renderClientSearchResults() {
  const query = safeText(modalState.clienteSearchQuery, "");
  const loading = Boolean(modalState.clienteSearchLoading);
  const error = safeText(modalState.clienteSearchError, "");
  const results = safeArray(modalState.clienteSearchResults);

  if (!query) return "";

  if (loading) {
    return `<div class="fac-create-search-state">Buscando cliente...</div>`;
  }

  if (error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(error)}</div>`;
  }

  if (query.length < 2) {
    return `<div class="fac-create-search-state">Mínimo 2 caracteres.</div>`;
  }

  if (!results.length) {
    return `<div class="fac-create-search-state">Sin resultados.</div>`;
  }

  return `
    <div class="fac-create-search-results">
      ${results
        .map(
          (item, index) => `
            <button
              type="button"
              class="fac-create-search-item"
              data-select-cliente="${index}"
              ${modalState.submitting ? "disabled" : ""}
            >
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.subtitle || item.email || item.id)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderClienteSearchBlock() {
  const error = safeText(modalState.errors?.clienteId, "");

  return `
    <section class="fac-create-block">
      <div class="fac-create-mini-title">Cliente</div>

      <label class="fac-create-field">
        <input
          class="fac-create-input ${error ? "is-error" : ""}"
          data-field="clienteSearch"
          name="clienteSearch"
          type="text"
          value="${escapeHtml(modalState.clienteSearchQuery)}"
          placeholder="Buscar cliente por nombre, email, usuario..."
          autocomplete="off"
          ${modalState.submitting ? "disabled" : ""}
        />

        ${renderFieldError(error)}
      </label>

      ${renderClientSearchResults()}
      ${renderSelectedCliente()}
    </section>
  `;
}

function renderSelectedTicket() {
  const form = safeObject(modalState.form);
  const ticketId = safeText(first(form.ticketId, form.incidenciaId), "");

  if (!ticketId) return "";

  return `
    <div class="fac-create-selected">
      <div class="fac-create-selected-copy">
        <strong>${escapeHtml(ticketId)}</strong>
        <span>${escapeHtml(safeText(form.incidenciaSubject, "Incidencia vinculada"))}</span>
      </div>

      <button
        type="button"
        class="fac-create-selected-clear"
        data-clear-ticket="true"
        ${modalState.submitting ? "disabled" : ""}
      >
        Cambiar
      </button>
    </div>
  `;
}

function renderTicketSearchResults() {
  const query = safeText(modalState.ticketSearchQuery, "");
  const loading = Boolean(modalState.ticketSearchLoading);
  const error = safeText(modalState.ticketSearchError, "");
  const results = safeArray(modalState.ticketSearchResults);

  if (!query) return "";

  if (loading) {
    return `<div class="fac-create-search-state">Buscando incidencia...</div>`;
  }

  if (error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(error)}</div>`;
  }

  if (query.length < 2) {
    return `<div class="fac-create-search-state">Mínimo 2 caracteres.</div>`;
  }

  if (!results.length) {
    return `<div class="fac-create-search-state">Sin incidencias.</div>`;
  }

  return `
    <div class="fac-create-search-results">
      ${results
        .map(
          (item, index) => `
            <button
              type="button"
              class="fac-create-search-item"
              data-select-ticket="${index}"
              ${modalState.submitting ? "disabled" : ""}
            >
              <strong>${escapeHtml(item.id)} · ${escapeHtml(item.subject)}</strong>
              <span>${escapeHtml(item.subtitle || item.clienteId || item.id)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTicketSearchBlock() {
  const error = safeText(modalState.errors?.incidenciaId, "");
  const clienteSelected = Boolean(safeText(modalState.form?.clienteId, ""));

  return `
    <section class="fac-create-block">
      <div class="fac-create-mini-title">Incidencia vinculada</div>

      <label class="fac-create-field">
        <input
          class="fac-create-input ${error ? "is-error" : ""}"
          data-field="ticketSearch"
          name="ticketSearch"
          type="text"
          value="${escapeHtml(modalState.ticketSearchQuery)}"
          placeholder="${
            clienteSelected
              ? "Buscar incidencia por código, asunto..."
              : "Selecciona primero un cliente"
          }"
          autocomplete="off"
          ${modalState.submitting || !clienteSelected ? "disabled" : ""}
        />

        ${renderFieldError(error)}
      </label>

      ${renderTicketSearchResults()}
      ${renderSelectedTicket()}
    </section>
  `;
}

function renderTotalsPreview() {
  const form = safeObject(modalState.form);
  const total = getFormTotal(form);
  const currency = safeText(form.moneda, "EUR");

  return `
    <div class="fac-create-preview">
      <div>
        <span>Base estimada</span>
        <strong>${escapeHtml(formatMoney(total, currency))}</strong>
      </div>

      <div>
        <span>IVA/IRPF</span>
        <strong>Lo calcula backend</strong>
      </div>

      <div>
        <span>PDF</span>
        <strong>Blob canónico</strong>
      </div>
    </div>
  `;
}

function renderLoadingOverlay() {
  return `
    <div class="fac-create-loading-overlay">
      <div class="fac-create-loading-card">
        <span class="fac-create-loading-spinner" aria-hidden="true"></span>
        <strong>Creando factura...</strong>
        <small>Generando PDF, subiendo blob y preparando email</small>
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

  return `
    <div class="fac-create-overlay" data-facturas-create-modal-overlay="true">
      <div
        id="${PANEL_ID}"
        class="fac-create-panel${modalState.submitting ? " is-submitting" : ""}"
        data-facturas-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facturas-create-modal-title"
        tabindex="-1"
      >
        ${modalState.submitting ? renderLoadingOverlay() : ""}

        <div class="fac-create-header">
          <div class="fac-create-header-copy">
            <span>Facturación · Onion Support</span>
            <h2 id="facturas-create-modal-title">Crear factura</h2>
            <p>
              Crea factura vinculada a incidencia. El backend generará PDF, blob canónico,
              numeración legal y auditoría.
            </p>
          </div>

          <button
            type="button"
            class="fac-create-close"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${modalState.submitting ? "disabled" : ""}
          >
            ✕
          </button>
        </div>

        <div class="fac-create-body">
          ${
            modalState.successMessage
              ? renderAlert(
                  "success",
                  "Factura creada.",
                  modalState.createdFacturaId
                    ? `Referencia: ${modalState.createdFacturaId}`
                    : modalState.successMessage
                )
              : ""
          }

          ${
            modalState.serverError
              ? renderAlert("error", "No se pudo crear la factura.", modalState.serverError)
              : ""
          }

          <form id="facturas-create-form" class="fac-create-form" novalidate>
            ${renderClienteSearchBlock()}
            ${renderTicketSearchBlock()}

            <div class="fac-create-grid fac-create-grid--2">
              ${renderInput({
                label: "Fecha factura",
                name: "fechaFactura",
                type: "date",
                value: form.fechaFactura,
              })}

              ${renderInput({
                label: "Fecha servicio",
                name: "fechaServicio",
                type: "date",
                value: form.fechaServicio,
              })}
            </div>

            ${renderInput({
              label: "Concepto",
              name: "concepto",
              value: form.concepto,
              placeholder: "Ej. Servicios de soporte técnico",
              required: true,
              error: errors.concepto,
            })}

            ${renderTextarea({
              label: "Descripción",
              name: "descripcion",
              value: form.descripcion,
              placeholder: "Detalle de la factura...",
              required: true,
              error: errors.descripcion,
            })}

            <div class="fac-create-grid fac-create-grid--3">
              ${renderInput({
                label: "Cantidad / horas",
                name: "cantidad",
                type: "number",
                value: form.cantidad,
                min: "0.01",
                step: "0.01",
                required: true,
                error: errors.cantidad,
              })}

              ${renderInput({
                label: "Precio unitario",
                name: "precioUnitario",
                type: "number",
                value: form.precioUnitario,
                min: "0.01",
                step: "0.01",
                required: true,
                error: errors.precioUnitario,
              })}

              ${renderInput({
                label: "Moneda",
                name: "moneda",
                value: form.moneda,
              })}
            </div>

            <div class="fac-create-grid fac-create-grid--2">
              ${renderInput({
                label: "Forma de pago",
                name: "formaPago",
                value: form.formaPago,
                placeholder: "transferencia bancaria",
              })}

              ${renderInput({
                label: "Cuenta de pago",
                name: "cuentaPago",
                value: form.cuentaPago,
                placeholder: "Vacío = backend default",
              })}
            </div>

            ${renderTotalsPreview()}

            ${renderCheckbox({
              label: "Enviar email al cliente",
              name: "sendEmail",
              checked: parseBoolean(form.sendEmail, true),
              help: "Adjunta el PDF y usa el template de factura si el backend lo tiene disponible.",
            })}

            <div class="fac-create-actions">
              <button
                type="button"
                class="fac-create-secondary"
                data-modal-close="true"
                ${modalState.submitting ? "disabled" : ""}
              >
                Cancelar
              </button>

              <button
                type="submit"
                class="fac-create-submit"
                ${modalState.submitting ? "disabled" : ""}
              >
                ${
                  modalState.submitting
                    ? `
                      <span class="fac-create-submit-inner">
                        <span class="fac-create-spinner" aria-hidden="true"></span>
                        Creando...
                      </span>
                    `
                    : "Crear factura"
                }
              </button>
            </div>
          </form>
        </div>

        <style>
          @keyframes facturasCreateSpin {
            to { transform: rotate(360deg); }
          }

          .fac-create-overlay{
            position:fixed;
            inset:0;
            z-index:9999;
            display:grid;
            place-items:center;
            padding:16px;
            background:rgba(0,0,0,.62);
            backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px);
          }

          .fac-create-panel{
            position:relative;
            width:min(840px, 100%);
            max-height:92vh;
            overflow:auto;
            border-radius:24px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 34%),
              linear-gradient(180deg, var(--surface-2, #171717), var(--surface-1, #111));
            box-shadow:0 34px 84px rgba(0,0,0,.45);
          }

          .fac-create-panel.is-submitting{
            overflow:hidden;
          }

          .fac-create-loading-overlay{
            position:absolute;
            inset:0;
            z-index:20;
            display:grid;
            place-items:center;
            padding:22px;
            background:color-mix(in srgb, var(--surface-1, #111) 82%, transparent);
            backdrop-filter:blur(6px);
            -webkit-backdrop-filter:blur(6px);
          }

          .fac-create-loading-card{
            display:grid;
            justify-items:center;
            gap:10px;
            padding:24px 28px;
            border-radius:20px;
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent),
              var(--surface-2, #171717);
            box-shadow:0 30px 70px rgba(0,0,0,.35);
          }

          .fac-create-loading-card strong{
            color:var(--text-strong, #fff);
            font-size:14px;
          }

          .fac-create-loading-card small{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
          }

          .fac-create-loading-spinner,
          .fac-create-spinner{
            border-radius:999px;
            border:2px solid rgba(255,255,255,.28);
            border-top-color:#fff;
            animation:facturasCreateSpin .8s linear infinite;
          }

          .fac-create-loading-spinner{
            width:32px;
            height:32px;
            border-width:3px;
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
            border-top-color:var(--accent, #7c5cff);
          }

          .fac-create-header{
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:14px;
            padding:20px 20px 15px;
            border-bottom:1px solid var(--border-soft, rgba(255,255,255,.10));
          }

          .fac-create-header-copy{
            display:grid;
            gap:6px;
            min-width:0;
          }

          .fac-create-header-copy > span{
            color:var(--accent, #7c5cff);
            font-size:11px;
            font-weight:800;
            letter-spacing:.08em;
            text-transform:uppercase;
          }

          .fac-create-header-copy h2{
            margin:0;
            color:var(--text-strong, #fff);
            font-size:clamp(25px, 3.7vw, 34px);
            line-height:1;
            letter-spacing:-.05em;
          }

          .fac-create-header-copy p{
            max-width:680px;
            margin:0;
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            line-height:1.5;
          }

          .fac-create-close{
            width:40px;
            height:40px;
            flex:0 0 auto;
            border-radius:14px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-strong, #fff);
            cursor:pointer;
            font-size:17px;
          }

          .fac-create-body{
            display:grid;
            gap:14px;
            padding:17px 20px 20px;
          }

          .fac-create-form{
            display:grid;
            gap:14px;
          }

          .fac-create-block{
            display:grid;
            gap:10px;
            padding:13px;
            border-radius:18px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-1, rgba(255,255,255,.04));
          }

          .fac-create-mini-title,
          .fac-create-label{
            color:var(--text-soft, rgba(255,255,255,.74));
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .fac-create-field{
            display:grid;
            gap:7px;
            min-width:0;
          }

          .fac-create-grid{
            display:grid;
            gap:12px;
          }

          .fac-create-grid--2{
            grid-template-columns:repeat(2, minmax(0, 1fr));
          }

          .fac-create-grid--3{
            grid-template-columns:repeat(3, minmax(0, 1fr));
          }

          .fac-create-input,
          .fac-create-textarea{
            width:100%;
            outline:none;
            color:var(--text-strong, #fff);
            background:var(--surface-1, rgba(255,255,255,.04));
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            font-size:14px;
            transition:
              border-color .18s ease,
              box-shadow .18s ease,
              background .18s ease;
          }

          .fac-create-input{
            min-height:44px;
            padding:0 13px;
            border-radius:14px;
          }

          .fac-create-textarea{
            min-height:112px;
            padding:12px 13px;
            border-radius:14px;
            resize:vertical;
            line-height:1.55;
          }

          .fac-create-input::placeholder,
          .fac-create-textarea::placeholder{
            color:var(--text-faint, rgba(255,255,255,.36));
          }

          .fac-create-input:focus,
          .fac-create-textarea:focus{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 34%, var(--border-soft, rgba(255,255,255,.12)));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          }

          .fac-create-input.is-error,
          .fac-create-textarea.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 42%, var(--border-soft, rgba(255,255,255,.12)));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
          }

          .fac-create-error{
            color:var(--danger-strong, #ff6b6b);
            font-size:11px;
            line-height:1.35;
            font-weight:var(--weight-semibold, 600);
          }

          .fac-create-alert{
            display:grid;
            gap:4px;
            padding:11px 13px;
            border-radius:14px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
          }

          .fac-create-alert strong{
            color:var(--text-strong, #fff);
            font-size:13px;
          }

          .fac-create-alert span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
          }

          .fac-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft, rgba(255,255,255,.12)));
          }

          .fac-create-alert.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 34%, var(--border-soft, rgba(255,255,255,.12)));
          }

          .fac-create-search-state{
            padding:10px 12px;
            border-radius:13px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
          }

          .fac-create-search-state.is-error{
            color:var(--danger-strong, #ff6b6b);
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 30%, var(--border-soft, rgba(255,255,255,.12)));
          }

          .fac-create-search-results{
            display:grid;
            gap:7px;
          }

          .fac-create-search-item{
            display:grid;
            gap:3px;
            width:100%;
            padding:11px 13px;
            border-radius:13px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            text-align:left;
            cursor:pointer;
            transition:
              transform .18s ease,
              border-color .18s ease,
              background .18s ease;
          }

          .fac-create-search-item:hover{
            transform:translateY(-1px);
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 26%, var(--border-soft, rgba(255,255,255,.12)));
          }

          .fac-create-search-item strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.35;
          }

          .fac-create-search-item span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.35;
          }

          .fac-create-selected{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:11px 13px;
            border-radius:14px;
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
              var(--surface-glass, rgba(255,255,255,.05));
          }

          .fac-create-selected-copy{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .fac-create-selected-copy strong{
            color:var(--text-strong, #fff);
            font-size:13px;
          }

          .fac-create-selected-copy span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            word-break:break-word;
          }

          .fac-create-selected-clear{
            min-height:32px;
            padding:0 11px;
            border-radius:10px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:transparent;
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
          }

          .fac-create-preview{
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:10px;
          }

          .fac-create-preview > div{
            display:grid;
            gap:4px;
            padding:12px 13px;
            border-radius:15px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
          }

          .fac-create-preview span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
          }

          .fac-create-preview strong{
            color:var(--text-strong, #fff);
            font-size:13px;
          }

          .fac-create-check{
            display:flex;
            align-items:flex-start;
            gap:10px;
            padding:12px 13px;
            border-radius:15px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            cursor:pointer;
          }

          .fac-create-check input{
            margin-top:2px;
            accent-color:var(--accent, #7c5cff);
          }

          .fac-create-check span{
            display:grid;
            gap:3px;
          }

          .fac-create-check strong{
            color:var(--text-strong, #fff);
            font-size:13px;
          }

          .fac-create-check small{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.35;
          }

          .fac-create-actions{
            display:flex;
            justify-content:flex-end;
            gap:10px;
            padding-top:2px;
          }

          .fac-create-secondary,
          .fac-create-submit{
            min-height:43px;
            padding:0 18px;
            border-radius:13px;
            font-size:13px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
          }

          .fac-create-secondary{
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-soft, rgba(255,255,255,.78));
          }

          .fac-create-submit{
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            box-shadow:0 12px 26px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
          }

          .fac-create-submit:disabled,
          .fac-create-secondary:disabled{
            opacity:.82;
            cursor:wait;
          }

          .fac-create-submit-inner{
            display:inline-flex;
            align-items:center;
            gap:8px;
          }

          .fac-create-spinner{
            width:14px;
            height:14px;
          }

          [data-theme="light"] .fac-create-panel{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,255,.96));
            box-shadow:
              0 28px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.68) inset;
          }

          [data-theme="light"] .fac-create-header-copy h2,
          [data-theme="light"] .fac-create-alert strong,
          [data-theme="light"] .fac-create-input,
          [data-theme="light"] .fac-create-textarea,
          [data-theme="light"] .fac-create-search-item strong,
          [data-theme="light"] .fac-create-selected-copy strong,
          [data-theme="light"] .fac-create-preview strong,
          [data-theme="light"] .fac-create-check strong{
            color:var(--text-strong, #111827);
          }

          [data-theme="light"] .fac-create-header-copy p,
          [data-theme="light"] .fac-create-alert span,
          [data-theme="light"] .fac-create-label,
          [data-theme="light"] .fac-create-mini-title,
          [data-theme="light"] .fac-create-search-state,
          [data-theme="light"] .fac-create-search-item span,
          [data-theme="light"] .fac-create-selected-copy span,
          [data-theme="light"] .fac-create-preview span,
          [data-theme="light"] .fac-create-check small{
            color:var(--text-dim, #6b7280);
          }

          [data-theme="light"] .fac-create-close,
          [data-theme="light"] .fac-create-block,
          [data-theme="light"] .fac-create-alert,
          [data-theme="light"] .fac-create-input,
          [data-theme="light"] .fac-create-textarea,
          [data-theme="light"] .fac-create-search-state,
          [data-theme="light"] .fac-create-search-item,
          [data-theme="light"] .fac-create-selected,
          [data-theme="light"] .fac-create-preview > div,
          [data-theme="light"] .fac-create-check,
          [data-theme="light"] .fac-create-secondary{
            background:rgba(255,255,255,.68);
            border-color:rgba(15,23,42,.08);
          }

          @media (max-width: 720px){
            .fac-create-grid--2,
            .fac-create-grid--3,
            .fac-create-preview{
              grid-template-columns:1fr;
            }

            .fac-create-actions{
              justify-content:stretch;
              flex-direction:column-reverse;
            }

            .fac-create-submit,
            .fac-create-secondary{
              width:100%;
            }

            .fac-create-selected{
              align-items:flex-start;
              flex-direction:column;
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
    if (event.key === "Escape" && !modalState.submitting) {
      closeFacturasCreateModal();
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

function focusPanel() {
  try {
    document.getElementById(PANEL_ID)?.focus?.();
  } catch {}
}

function focusField(fieldName = "") {
  try {
    const field = getRoot()?.querySelector?.(`[data-field="${fieldName}"]`);
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

function focusFirstInvalidField() {
  const errors = safeObject(modalState.errors);

  if (errors.clienteId && focusField("clienteSearch")) return true;
  if (errors.incidenciaId && focusField("ticketSearch")) return true;
  if (errors.concepto && focusField("concepto")) return true;
  if (errors.descripcion && focusField("descripcion")) return true;
  if (errors.cantidad && focusField("cantidad")) return true;
  if (errors.precioUnitario && focusField("precioUnitario")) return true;

  focusPanel();
  return false;
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openFacturasCreateModal(draft = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;

  clearFeedback();
  clearClientSearchTimer();
  clearTicketSearchTimer();

  modalState.clienteSearchQuery = "";
  modalState.clienteSearchResults = [];
  modalState.clienteSearchLoading = false;
  modalState.clienteSearchError = "";

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchResults = [];
  modalState.ticketSearchLoading = false;
  modalState.ticketSearchError = "";

  resetForm();

  const normalizedDraft = safeObject(draft);

  const draftTicketId = safeText(
    first(
      normalizedDraft.ticketId,
      normalizedDraft.incidenciaId,
      normalizedDraft.supportTicketId,
      normalizedDraft.ticket?.ticketId,
      normalizedDraft.ticket?.id,
      normalizedDraft.incidencia?.ticketId,
      normalizedDraft.incidencia?.id
    ),
    ""
  );

  const draftTicketSubject = safeText(
    first(
      normalizedDraft.incidenciaSubject,
      normalizedDraft.ticketSubject,
      normalizedDraft.subject,
      normalizedDraft.asunto,
      normalizedDraft.ticket?.subject,
      normalizedDraft.ticket?.asunto,
      normalizedDraft.incidencia?.subject,
      normalizedDraft.incidencia?.asunto
    ),
    ""
  );

  modalState.form = {
    ...modalState.form,
    ...normalizedDraft,
    ticketId: draftTicketId || safeText(normalizedDraft.ticketId, ""),
    incidenciaId: draftTicketId || safeText(normalizedDraft.incidenciaId, ""),
    incidenciaSubject: draftTicketSubject || safeText(normalizedDraft.incidenciaSubject, ""),
  };

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();

  if (!safeText(modalState.form.clienteId, "")) {
    focusField("clienteSearch");
  } else if (!safeText(first(modalState.form.ticketId, modalState.form.incidenciaId), "")) {
    focusField("ticketSearch");
  } else {
    focusField("descripcion");
  }

  safeEmit("facturas:create-modal:opened", {
    draft: modalState.form,
  });

  return true;
}

export function closeFacturasCreateModal() {
  if (modalState.submitting) {
    return false;
  }

  modalState.isOpen = false;
  modalState.submitting = false;

  clearFeedback();
  clearClientSearchTimer();
  clearTicketSearchTimer();

  detachRootBindings();

  const root = getRoot();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("facturas:create-modal:closed", {});

  return true;
}

export function updateFacturasCreateModal(draft = {}) {
  if (!modalState.isOpen) {
    return openFacturasCreateModal(draft);
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(draft),
  };

  renderModal();
  attachRootBindings();
  focusPanel();

  return true;
}

/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) {
    return false;
  }

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdFacturaId = "";

  const validation = validateForm(modalState.form);

  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    focusFirstInvalidField();

    showToast("Revisa los campos obligatorios.", "warning");

    return false;
  }

  const payload = buildCreatePayload(modalState.form);

  modalState.submitting = true;

  renderModal();
  attachRootBindings();
  focusPanel();

  safeEmit("facturas:create:submit", {
    payload,
  });

  try {
    const response = await apiPost(FACTURAS_CREATE_ENDPOINT, payload);

    const createdFacturaId = getCreatedFacturaId(response);
    const detail = pickCreatedFactura(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "Factura creada.";
    modalState.createdFacturaId = createdFacturaId;

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast("Factura creada correctamente.", "success");

    safeEmit("facturas:create:success", {
      facturaId: createdFacturaId,
      response,
      detail,
      payload,
    });

    setTimeout(() => {
      if (modalState.isOpen && !modalState.submitting) {
        closeFacturasCreateModal();
      }
    }, 420);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(error, "No se pudo crear la factura.");

    safeEmit("facturas:create:error", {
      error,
      message: modalState.serverError,
    });

    renderModal();
    attachRootBindings();
    focusFirstInvalidField();

    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   BINDINGS
========================================================= */

function selectCliente(index = -1) {
  const item = safeArray(modalState.clienteSearchResults)[Number(index)];

  if (!item?.id) {
    return false;
  }

  setFormPatch({
    clienteId: item.clienteId || item.id,
    clienteNombre: item.name,
    clienteEmail: item.email,

    ticketId: "",
    incidenciaId: "",
    incidenciaSubject: "",
  });

  modalState.clienteSearchQuery = "";
  modalState.clienteSearchResults = [];
  modalState.clienteSearchLoading = false;
  modalState.clienteSearchError = "";

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchResults = [];
  modalState.ticketSearchLoading = false;
  modalState.ticketSearchError = "";

  if (modalState.errors.clienteId || modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.clienteId;
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  renderModal();
  attachRootBindings();
  focusField("ticketSearch");

  return true;
}

function clearCliente() {
  setFormPatch({
    clienteId: "",
    clienteNombre: "",
    clienteEmail: "",

    ticketId: "",
    incidenciaId: "",
    incidenciaSubject: "",
  });

  modalState.clienteSearchQuery = "";
  modalState.clienteSearchResults = [];
  modalState.clienteSearchLoading = false;
  modalState.clienteSearchError = "";

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchResults = [];
  modalState.ticketSearchLoading = false;
  modalState.ticketSearchError = "";

  renderModal();
  attachRootBindings();
  focusField("clienteSearch");

  return true;
}

function selectTicket(index = -1) {
  const item = safeArray(modalState.ticketSearchResults)[Number(index)];

  if (!item?.id) {
    return false;
  }

  setFormPatch({
    ticketId: item.ticketId || item.id,
    incidenciaId: item.incidenciaId || item.id,
    incidenciaSubject: item.subject || item.asunto || item.id,
  });

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchResults = [];
  modalState.ticketSearchLoading = false;
  modalState.ticketSearchError = "";

  if (modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  renderModal();
  attachRootBindings();
  focusField("descripcion");

  return true;
}

function clearTicket() {
  setFormPatch({
    ticketId: "",
    incidenciaId: "",
    incidenciaSubject: "",
  });

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchResults = [];
  modalState.ticketSearchLoading = false;
  modalState.ticketSearchError = "";

  renderModal();
  attachRootBindings();
  focusField("ticketSearch");

  return true;
}

function handleFieldInput(field) {
  const fieldName = safeText(field?.dataset?.field, "");

  if (!fieldName) return;

  if (fieldName === "clienteSearch") {
    const value = safeText(field.value, "");

    modalState.clienteSearchQuery = value;

    if (safeText(modalState.form.clienteId, "")) {
      setFormPatch({
        clienteId: "",
        clienteNombre: "",
        clienteEmail: "",
        ticketId: "",
        incidenciaId: "",
        incidenciaSubject: "",
      });
    }

    if (modalState.errors.clienteId) {
      const nextErrors = { ...safeObject(modalState.errors) };
      delete nextErrors.clienteId;
      modalState.errors = nextErrors;
    }

    scheduleClientSearch(value);
    return;
  }

  if (fieldName === "ticketSearch") {
    const value = safeText(field.value, "");

    modalState.ticketSearchQuery = value;

    if (safeText(first(modalState.form.ticketId, modalState.form.incidenciaId), "")) {
      setFormPatch({
        ticketId: "",
        incidenciaId: "",
        incidenciaSubject: "",
      });
    }

    if (modalState.errors.incidenciaId) {
      const nextErrors = { ...safeObject(modalState.errors) };
      delete nextErrors.incidenciaId;
      modalState.errors = nextErrors;
    }

    scheduleTicketSearch(value);
    return;
  }

  if (field.type === "checkbox") {
    setFormPatch({
      [fieldName]: Boolean(field.checked),
    });
  } else {
    setFormPatch({
      [fieldName]: field.value,
    });
  }

  if (modalState.errors[fieldName]) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors[fieldName];
    modalState.errors = nextErrors;
  }

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdFacturaId = "";
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    if (field.type === "checkbox") return;

    handleFieldInput(field);
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    handleFieldInput(field);
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("#facturas-create-form");
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onClick = (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();
      closeFacturasCreateModal();
      return;
    }

    const overlay = event.target.closest("[data-facturas-create-modal-overlay='true']");
    const panel = event.target.closest("[data-facturas-create-modal-panel='true']");

    if (
      overlay &&
      !panel &&
      event.target === overlay &&
      !modalState.submitting
    ) {
      closeFacturasCreateModal();
      return;
    }

    const selectClienteBtn = event.target.closest("[data-select-cliente]");

    if (selectClienteBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      selectCliente(selectClienteBtn.dataset.selectCliente);
      return;
    }

    const selectTicketBtn = event.target.closest("[data-select-ticket]");

    if (selectTicketBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      selectTicket(selectTicketBtn.dataset.selectTicket);
      return;
    }

    const clearClienteBtn = event.target.closest("[data-clear-cliente='true']");

    if (clearClienteBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      clearCliente();
      return;
    }

    const clearTicketBtn = event.target.closest("[data-clear-ticket='true']");

    if (clearTicketBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      clearTicket();
    }
  };

  root.__facturasCreateModalInputHandler = onInput;
  root.__facturasCreateModalChangeHandler = onChange;
  root.__facturasCreateModalSubmitHandler = onSubmit;
  root.__facturasCreateModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();

  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__facturasCreateModalInputHandler) {
    try {
      root.removeEventListener("input", root.__facturasCreateModalInputHandler);
    } catch {}

    delete root.__facturasCreateModalInputHandler;
  }

  if (root.__facturasCreateModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__facturasCreateModalChangeHandler);
    } catch {}

    delete root.__facturasCreateModalChangeHandler;
  }

  if (root.__facturasCreateModalSubmitHandler) {
    try {
      root.removeEventListener("submit", root.__facturasCreateModalSubmitHandler);
    } catch {}

    delete root.__facturasCreateModalSubmitHandler;
  }

  if (root.__facturasCreateModalClickHandler) {
    try {
      root.removeEventListener("click", root.__facturasCreateModalClickHandler);
    } catch {}

    delete root.__facturasCreateModalClickHandler;
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
  openFacturasCreateModal(safeObject(unwrapEventDetail(event)));
}

function handleCloseEvent() {
  closeFacturasCreateModal();
}

function handleUpdateEvent(event) {
  updateFacturasCreateModal(safeObject(unwrapEventDetail(event)));
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("facturas:create-modal:open", handleOpenEvent);
  safeOn("facturas:create-modal:close", handleCloseEvent);
  safeOn("facturas:create-modal:update", handleUpdateEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("facturas:create-modal:open", handleOpenEvent);
  safeOff("facturas:create-modal:close", handleCloseEvent);
  safeOff("facturas:create-modal:update", handleUpdateEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionFacturasCreateModal = {
  open(draft = {}) {
    return openFacturasCreateModal(draft);
  },

  close() {
    return closeFacturasCreateModal();
  },

  update(draft = {}) {
    return updateFacturasCreateModal(draft);
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },

      clienteSearchResults: [...safeArray(modalState.clienteSearchResults)],
      ticketSearchResults: [...safeArray(modalState.ticketSearchResults)],

      form: { ...safeObject(modalState.form) },
    };
  },

  buildPayload() {
    return buildCreatePayload(modalState.form);
  },

  destroy() {
    detachRootBindings();
    closeFacturasCreateModal();
    detachEscHandler();
    detachBus();
    clearClientSearchTimer();
    clearTicketSearchTimer();

    const root = getRoot();

    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionFacturasCreateModal = OnionFacturasCreateModal;
  window.renderFacturasCreateModal = OnionFacturasCreateModal.open;
  window.renderFacturaCreateModal = OnionFacturasCreateModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionFacturasCreateModal;

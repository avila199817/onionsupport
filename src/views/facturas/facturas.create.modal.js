/* =========================================================
   Onion SPA - Facturas Create Modal
   Archivo: src/views/facturas/facturas.create.modal.js

   FACTURAS EXPERIENCE PRO · CREATE MODAL · COSMOS/BLOB ALIGNED · GOD MODE
   PATCH · CLIENT + INCIDENCIA CARDS REDESIGN
   PATCH · CLIENT SEARCH AVATAR REAL + FALLBACK
   PATCH · NO CANCEL BUTTON
   PATCH · ONLY TOTAL CARD / NO TOTAL INPUT FIELD

   Responsabilidades:
   - abrir/cerrar modal premium de creación de factura
   - buscar cliente/usuario objetivo
   - pintar avatar real del cliente/usuario si backend lo entrega
   - fallback de avatar con iniciales si no hay imagen
   - al seleccionar cliente, cargar incidencias vinculadas a ese cliente/usuario
   - seleccionar automáticamente la incidencia más reciente
   - permitir cambiar incidencia desde desplegable
   - crear factura desde panel admin alineada con backend v3
   - enviar payload compatible con /router/facturas/factura_create_admin.js
   - NO pedir fecha factura: el backend usa fecha de creación real
   - NO pedir moneda: EUR fija
   - NO pedir cuenta bancaria: no se solicita en UI
   - unificar bloque cliente + incidencia
   - total estimado calculado en tiempo real
   - forma de pago mediante select
   - emitir facturas:create:success para refrescar la vista
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
const TICKET_LIMIT = 40;
const SEARCH_DEBOUNCE = 240;

const CREATE_TIMEOUT_MS = 90000;
const SEARCH_TIMEOUT_MS = 15000;

const PAYMENT_OPTIONS = Object.freeze([
  {
    value: "transferencia bancaria",
    label: "Transferencia bancaria",
  },
  {
    value: "efectivo",
    label: "Efectivo",
  },
]);

const DEFAULT_FORM = Object.freeze({
  clienteId: "",
  clienteUserId: "",
  clienteNombre: "",
  clienteEmail: "",
  clienteAvatar: "",

  ticketId: "",
  incidenciaId: "",
  incidenciaSubject: "",

  concepto: "Servicios de soporte y asistencia técnica informática",
  descripcion: "",

  cantidad: 1,
  precioUnitario: 20,

  fechaServicio: "",
  formaPago: "transferencia bancaria",
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
  previousBodyOverflow: "",

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
  ticketAutoSelected: false,

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

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let text = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "");

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      text = text.replace(/,/g, ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function formatMoney(value = 0) {
  const amount = safeNumber(value, 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function getSortableDate(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function getInitials(value = "", fallback = "CL") {
  const text = normalizeWhitespace(value);

  if (!text) return fallback;

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || fallback;
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
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

  if (isAbsoluteUrl(path)) return path;

  const apiBase = getApiBase();

  if (!apiBase) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  if (apiBase.endsWith("/api") && path.startsWith("/api/")) {
    return `${apiBase}${path.slice(4)}`;
  }

  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
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
      error.data = data;

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
   GENERIC RESPONSE HELPERS
========================================================= */

function extractItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  const obj = safeObject(payload);

  const candidates = [
    obj.clientes,
    obj.clients,
    obj.customers,
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
    obj.data?.clients,
    obj.data?.customers,
    obj.data?.users,
    obj.data?.usuarios,
    obj.data?.tickets,
    obj.data?.incidencias,
    obj.data?.items,
    obj.data?.results,
    obj.data?.rows,
    obj.data?.records,

    obj.payload?.clientes,
    obj.payload?.clients,
    obj.payload?.customers,
    obj.payload?.users,
    obj.payload?.usuarios,
    obj.payload?.tickets,
    obj.payload?.incidencias,
    obj.payload?.items,
    obj.payload?.results,

    obj.result?.clientes,
    obj.result?.clients,
    obj.result?.customers,
    obj.result?.users,
    obj.result?.usuarios,
    obj.result?.tickets,
    obj.result?.incidencias,
    obj.result?.items,
    obj.result?.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

/* =========================================================
   AVATAR HELPERS
========================================================= */

function getAvatarUrlFromObject(raw = null) {
  const obj = safeObject(raw);
  const cliente = safeObject(obj.cliente);
  const user = safeObject(obj.user);
  const usuario = safeObject(obj.usuario);
  const profile = safeObject(obj.profile);
  const contacto = safeObject(obj.contacto);
  const avatar = safeObject(obj.avatar);
  const photo = safeObject(obj.photo);

  return safeText(
    first(
      obj.avatarUrl,
      obj.avatarURL,
      obj.avatar_url,
      obj.avatar,
      obj.logoUrl,
      obj.logoURL,
      obj.logo_url,
      obj.logo,
      obj.photoUrl,
      obj.photoURL,
      obj.photo_url,
      obj.photo,
      obj.imageUrl,
      obj.imageURL,
      obj.image_url,
      obj.image,
      obj.picture,
      obj.pictureUrl,
      obj.profilePicture,
      obj.profilePictureUrl,
      obj.clienteAvatar,
      obj.clienteAvatarUrl,
      obj.clientAvatar,
      obj.clientAvatarUrl,
      obj.userAvatar,
      obj.userAvatarUrl,

      cliente.avatarUrl,
      cliente.avatarURL,
      cliente.avatar_url,
      cliente.avatar,
      cliente.logoUrl,
      cliente.logo,
      cliente.photoUrl,
      cliente.photo,
      cliente.imageUrl,
      cliente.image,
      cliente.picture,
      cliente.pictureUrl,
      cliente.profilePicture,
      cliente.profilePictureUrl,

      user.avatarUrl,
      user.avatarURL,
      user.avatar_url,
      user.avatar,
      user.photoUrl,
      user.photoURL,
      user.photo_url,
      user.photo,
      user.imageUrl,
      user.imageURL,
      user.image_url,
      user.image,
      user.picture,
      user.pictureUrl,
      user.profilePicture,
      user.profilePictureUrl,

      usuario.avatarUrl,
      usuario.avatar,
      usuario.photoUrl,
      usuario.photo,
      usuario.imageUrl,
      usuario.image,
      usuario.picture,
      usuario.pictureUrl,

      profile.avatarUrl,
      profile.avatar,
      profile.photoUrl,
      profile.photo,
      profile.imageUrl,
      profile.image,
      profile.picture,
      profile.pictureUrl,

      contacto.avatarUrl,
      contacto.avatar,
      contacto.photoUrl,
      contacto.photo,
      contacto.imageUrl,
      contacto.image,

      avatar.url,
      avatar.src,
      photo.url,
      photo.src
    ),
    ""
  );
}

function renderAvatar({
  name = "",
  email = "",
  avatarUrl = "",
  fallback = "CL",
  className = "fac-create-avatar",
} = {}) {
  const displayName = safeText(first(name, email, "Cliente"), "Cliente");
  const initials = getInitials(displayName, fallback);
  const url = safeText(avatarUrl, "");

  return `
    <span
      class="${escapeHtml(className)}${url ? " has-image" : ""}"
      title="${escapeHtml(displayName)}"
      aria-label="${escapeHtml(displayName)}"
      data-tooltip="${escapeHtml(displayName)}"
    >
      ${
        url
          ? `
            <img
              src="${escapeHtml(url)}"
              alt="${escapeHtml(displayName)}"
              loading="lazy"
              referrerpolicy="no-referrer"
              onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
            />
          `
          : ""
      }

      <span class="fac-create-avatar-fallback">
        ${escapeHtml(initials)}
      </span>
    </span>
  `;
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
  const usuario = safeObject(obj.usuario);
  const cliente = safeObject(obj.cliente);
  const contacto = safeObject(obj.contacto);
  const profile = safeObject(obj.profile);

  const clienteId = safeText(
    first(
      obj.clienteId,
      obj.clientId,
      obj.customerId,
      obj.id,
      obj._id,
      obj.clienteIdInterno,

      cliente.clienteId,
      cliente.clientId,
      cliente.customerId,
      cliente.id,
      cliente._id,
      cliente.clienteIdInterno
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
      user._id,

      usuario.userId,
      usuario.id,
      usuario._id
    ),
    ""
  );

  const id = clienteId || userId;
  if (!id) return null;

  const name = safeText(
    first(
      obj.nombreFiscal,
      obj.razonSocial,
      obj.empresa,
      obj.company,
      obj.businessName,
      obj.nombreContacto,
      obj.nombre,
      obj.name,
      obj.fullName,
      obj.displayName,

      cliente.nombreFiscal,
      cliente.razonSocial,
      cliente.empresa,
      cliente.company,
      cliente.businessName,
      cliente.nombreContacto,
      cliente.nombre,
      cliente.name,
      cliente.fullName,
      cliente.displayName,

      contacto.nombre,
      contacto.name,
      contacto.fullName,
      contacto.displayName,

      user.name,
      user.nombre,
      user.fullName,
      user.displayName,

      usuario.name,
      usuario.nombre,
      usuario.fullName,
      usuario.displayName,

      profile.name,
      profile.nombre,
      profile.fullName,
      profile.displayName
    ),
    `Cliente ${id}`
  );

  const email = safeText(
    first(
      obj.email,
      obj.emailCliente,
      obj.clienteEmail,
      obj.clientEmail,
      obj.customerEmail,
      obj.mail,
      obj.emailLower,

      cliente.email,
      cliente.emailCliente,
      cliente.clienteEmail,
      cliente.clientEmail,
      cliente.emailLower,

      contacto.email,
      contacto.mail,

      user.email,
      user.mail,

      usuario.email,
      usuario.mail,

      profile.email
    ),
    ""
  ).toLowerCase();

  const empresa = safeText(
    first(
      obj.razonSocial,
      obj.nombreFiscal,
      obj.empresa,
      obj.company,
      obj.businessName,
      cliente.razonSocial,
      cliente.nombreFiscal,
      cliente.empresa,
      cliente.company,
      cliente.businessName,
      ""
    ),
    ""
  );

  const avatarUrl = getAvatarUrlFromObject(obj);

  const subtitle = safeText(
    first(
      email,
      empresa && empresa !== name ? empresa : "",
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
    avatarUrl,
    avatar: avatarUrl,
    initials: getInitials(name, "CL"),
    subtitle,
    raw: obj,
  };
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

      if (items.length) return items;
    } catch (error) {
      lastError = error;

      if (!shouldTryNext(error)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;

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

    if (seq !== modalState.clienteSearchSeq) return [];

    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = results;

    renderModal();
    attachRootBindings();
    focusField("clienteSearch");

    return results;
  } catch (error) {
    if (seq !== modalState.clienteSearchSeq) return [];

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

function getSelectedClienteId() {
  return safeText(modalState.form?.clienteId, "");
}

function getSelectedClienteUserId() {
  return safeText(modalState.form?.clienteUserId, "");
}

function buildTicketSearchUrls(query = "") {
  const clienteId = getSelectedClienteId();
  const userId = getSelectedClienteUserId();
  const q = normalizeWhitespace(query);

  return TICKET_SEARCH_ENDPOINTS.map((endpoint) => {
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
      params.set("search", q);
    }

    params.set("limit", String(TICKET_LIMIT));

    if (clienteId) params.set("clienteId", clienteId);
    if (userId) params.set("userId", userId);

    params.set("includeClosed", "true");
    params.set("includeAll", "true");
    params.set("onlyMine", "false");

    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}${params.toString()}`;
  });
}

function normalizeTicketCandidate(raw = null) {
  const obj = safeObject(raw);
  const ticket = safeObject(obj.ticket);
  const incidencia = safeObject(obj.incidencia);
  const cliente = safeObject(obj.cliente);
  const receptor = safeObject(obj.receptor);
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
      obj.descripcion,
      obj.message,

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

      receptor.clienteId,
      requesterSnapshot.clienteId
    ),
    ""
  );

  const userId = safeText(
    first(
      obj.userId,
      ticket.userId,
      incidencia.userId,

      receptor.userId,
      receptor.id,

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

  const createdAt = safeText(
    first(
      obj.createdAt,
      ticket.createdAt,
      incidencia.createdAt
    ),
    ""
  );

  const createdAtES = safeText(
    first(
      obj.createdAtES,
      ticket.createdAtES,
      incidencia.createdAtES
    ),
    ""
  );

  const updatedAt = safeText(
    first(
      obj.lastActivityAt,
      obj.updatedAt,
      ticket.updatedAt,
      incidencia.updatedAt
    ),
    ""
  );

  const updatedAtES = safeText(
    first(
      obj.lastActivityAtES,
      obj.updatedAtES,
      ticket.updatedAtES,
      incidencia.updatedAtES
    ),
    ""
  );

  const sortDate = Math.max(
    getSortableDate(updatedAt),
    getSortableDate(createdAt)
  );

  const dateLabel = safeText(
    first(updatedAtES, createdAtES, updatedAt, createdAt),
    ""
  );

  const facturaLinked = Boolean(
    obj.facturaLinked ||
      obj.meta?.facturaLinked ||
      obj.meta?.hasFactura ||
      obj.facturaId ||
      obj.invoiceId ||
      obj.numeroFacturaLegal
  );

  const subtitle = [
    status ? `Estado: ${status}` : "",
    category ? `Tipo: ${category}` : "",
    facturaLinked ? "Ya facturada" : "",
    dateLabel,
  ]
    .filter(Boolean)
    .join(" · ") || id;

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
    createdAt,
    createdAtES,
    updatedAt,
    updatedAtES,
    sortDate,
    facturaLinked,
    subtitle,
    raw: obj,
  };
}

function ticketBelongsToSelectedClient(ticket = {}) {
  const selectedClienteId = getSelectedClienteId();
  const selectedUserId = getSelectedClienteUserId();

  const ticketClienteId = safeText(ticket?.clienteId, "");
  const ticketUserId = safeText(ticket?.userId, "");

  if (selectedClienteId && ticketClienteId === selectedClienteId) return true;
  if (selectedUserId && ticketUserId === selectedUserId) return true;

  if (!ticketClienteId && !ticketUserId && (selectedClienteId || selectedUserId)) {
    return true;
  }

  return false;
}

function sortTicketsByLatest(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const dateA = safeNumber(a?.sortDate, 0);
    const dateB = safeNumber(b?.sortDate, 0);

    if (dateA !== dateB) return dateB - dateA;

    return safeText(b?.id, "").localeCompare(safeText(a?.id, ""));
  });
}

function dedupeAndFilterTickets(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const normalized = normalizeTicketCandidate(item);
    if (!normalized?.id) return;

    if (!ticketBelongsToSelectedClient(normalized)) return;

    if (!map.has(normalized.id)) {
      map.set(normalized.id, normalized);
    }
  });

  return sortTicketsByLatest(Array.from(map.values())).slice(0, TICKET_LIMIT);
}

async function searchTicketsRequest(query = "") {
  const urls = buildTicketSearchUrls(query);

  let lastError = null;
  let collected = [];

  for (const url of urls) {
    try {
      const response = await apiGet(url);
      const items = extractItems(response);

      if (items.length) {
        collected = collected.concat(items);
      }
    } catch (error) {
      lastError = error;

      if (!shouldTryNext(error)) {
        throw error;
      }
    }
  }

  const normalized = dedupeAndFilterTickets(collected);

  if (normalized.length) return normalized;

  if (lastError && collected.length === 0) throw lastError;

  return [];
}

function clearTicketSearchTimer() {
  if (!modalState.ticketSearchDebounce) return;

  try {
    clearTimeout(modalState.ticketSearchDebounce);
  } catch {}

  modalState.ticketSearchDebounce = null;
}

function setSelectedTicketFromItem(item = null, { auto = false } = {}) {
  if (!item?.id) return false;

  setFormPatch({
    ticketId: item.ticketId || item.id,
    incidenciaId: item.incidenciaId || item.id,
    incidenciaSubject: item.subject || item.asunto || item.id,
  });

  modalState.ticketAutoSelected = Boolean(auto);

  if (modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  return true;
}

function autoSelectLatestTicketIfPossible({ force = false } = {}) {
  const currentTicketId = safeText(
    first(modalState.form?.ticketId, modalState.form?.incidenciaId),
    ""
  );

  if (currentTicketId && !force) return false;

  const latest = safeArray(modalState.ticketSearchResults)[0];

  if (!latest?.id) {
    setFormPatch({
      ticketId: "",
      incidenciaId: "",
      incidenciaSubject: "",
    });

    return false;
  }

  return setSelectedTicketFromItem(latest, {
    auto: true,
  });
}

async function loadTicketsForSelectedClient({
  query = "",
  autoSelectLatest = true,
  focus = "ticketSelect",
} = {}) {
  const clienteId = getSelectedClienteId();

  if (!clienteId) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];
    modalState.ticketAutoSelected = false;

    setFormPatch({
      ticketId: "",
      incidenciaId: "",
      incidenciaSubject: "",
    });

    renderModal();
    attachRootBindings();

    return [];
  }

  const seq = ++modalState.ticketSearchSeq;

  modalState.ticketSearchLoading = true;
  modalState.ticketSearchError = "";
  modalState.ticketSearchResults = [];
  modalState.ticketAutoSelected = false;

  if (autoSelectLatest) {
    setFormPatch({
      ticketId: "",
      incidenciaId: "",
      incidenciaSubject: "",
    });
  }

  renderModal();
  attachRootBindings();

  if (focus) focusField(focus);

  try {
    const results = await searchTicketsRequest(query);

    if (seq !== modalState.ticketSearchSeq) return [];

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = results;

    if (autoSelectLatest) {
      autoSelectLatestTicketIfPossible({
        force: true,
      });
    }

    renderModal();
    attachRootBindings();

    if (focus) focusField(focus);

    return results;
  } catch (error) {
    if (seq !== modalState.ticketSearchSeq) return [];

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchResults = [];
    modalState.ticketSearchError = safeErrorMessage(
      error,
      "No se pudieron cargar las incidencias del cliente."
    );
    modalState.ticketAutoSelected = false;

    setFormPatch({
      ticketId: "",
      incidenciaId: "",
      incidenciaSubject: "",
    });

    renderModal();
    attachRootBindings();

    if (focus) focusField(focus);

    return [];
  }
}

async function performTicketSearch(query = "") {
  return loadTicketsForSelectedClient({
    query: normalizeWhitespace(query),
    autoSelectLatest: false,
    focus: "ticketSearch",
  });
}

function scheduleTicketSearch(query = "") {
  clearTicketSearchTimer();

  const clienteId = getSelectedClienteId();

  if (!clienteId) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];
    modalState.ticketAutoSelected = false;

    renderModal();
    attachRootBindings();

    return;
  }

  modalState.ticketSearchDebounce = setTimeout(() => {
    performTicketSearch(query);
  }, SEARCH_DEBOUNCE);
}

/* =========================================================
   FORM / PAYLOAD
========================================================= */

function resetForm() {
  modalState.form = {
    ...DEFAULT_FORM,
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
  const userId = safeText(current.clienteUserId, "");
  const clienteNombre = safeText(current.clienteNombre, "");
  const clienteEmail = safeText(current.clienteEmail, "").toLowerCase();
  const clienteAvatar = safeText(current.clienteAvatar, "");

  const ticketId = safeText(first(current.ticketId, current.incidenciaId), "");
  const incidenciaSubject = safeText(current.incidenciaSubject, ticketId);

  const fechaServicio = safeText(current.fechaServicio, todayInputValue());

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
    userId: userId || undefined,

    clienteNombre,
    clienteEmail,
    emailCliente: clienteEmail || undefined,
    clienteAvatar: clienteAvatar || undefined,
    avatarUrl: clienteAvatar || undefined,

    cliente: {
      id: clienteId,
      clienteId,
      clienteIdInterno: clienteId,
      userId: userId || undefined,
      nombre: clienteNombre,
      name: clienteNombre,
      displayName: clienteNombre,
      nombreContacto: clienteNombre,
      razonSocial: clienteNombre,
      email: clienteEmail || undefined,
      emailLower: clienteEmail || undefined,
      avatar: clienteAvatar || undefined,
      avatarUrl: clienteAvatar || undefined,
      logo: clienteAvatar || undefined,
      logoUrl: clienteAvatar || undefined,
    },

    ticketId,
    incidenciaId: ticketId,
    supportTicketId: ticketId,
    incidenciaSubject,
    ticketSubject: incidenciaSubject,
    asunto: incidenciaSubject,

    fechaServicio,
    fechaTrabajo: fechaServicio,
    serviceDate: fechaServicio,

    formaPago: safeText(current.formaPago, "transferencia bancaria"),
    metodoPago: safeText(current.formaPago, "transferencia bancaria"),

    estadoPago: safeText(current.estadoPago, "pendiente"),
    estado: "emitida",

    moneda: "EUR",
    currency: "EUR",

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
   DERIVED UI SYNC
========================================================= */

function syncDerivedUi() {
  const root = getRoot();
  if (!root) return false;

  const total = formatMoney(getFormTotal(modalState.form));

  const totalInline = root.querySelector('[data-role="total-preview-inline"]');
  if (totalInline) {
    totalInline.textContent = total;
  }

  return true;
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
  readonly = false,
  inputmode = "",
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <input
        class="fac-create-input ${error ? "is-error" : ""}${readonly ? " is-readonly" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${step ? `step="${escapeHtml(step)}"` : ""}
        ${min ? `min="${escapeHtml(min)}"` : ""}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ""}
        ${readonly ? "readonly" : ""}
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

function renderSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  error = "",
  required = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <select
        class="fac-create-select ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        ${modalState.submitting ? "disabled" : ""}
      >
        ${safeArray(options)
          .map((option) => {
            const optionValue = safeText(option?.value, "");
            const optionLabel = safeText(option?.label, optionValue);

            return `
              <option
                value="${escapeHtml(optionValue)}"
                ${optionValue === safeText(value, "") ? "selected" : ""}
              >
                ${escapeHtml(optionLabel)}
              </option>
            `;
          })
          .join("")}
      </select>

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
              class="fac-create-search-item fac-create-search-item--client"
              data-select-cliente="${index}"
              ${modalState.submitting ? "disabled" : ""}
            >
              ${renderAvatar({
                name: item.name,
                email: item.email,
                avatarUrl: item.avatarUrl,
                fallback: "CL",
                className: "fac-create-avatar fac-create-avatar--search",
              })}

              <span class="fac-create-search-copy">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.subtitle || item.email || item.id)}</span>
              </span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSelectedCliente() {
  const form = safeObject(modalState.form);

  if (!safeText(form.clienteId, "")) return "";

  const name = safeText(form.clienteNombre, "Cliente seleccionado");
  const email = safeText(form.clienteEmail, "");
  const clienteId = safeText(form.clienteId, "");
  const avatarUrl = safeText(form.clienteAvatar, "");

  return `
    <div class="fac-create-selected fac-create-selected--client">
      <div class="fac-create-selected-main">
        ${renderAvatar({
          name,
          email,
          avatarUrl,
          fallback: "CL",
          className: "fac-create-avatar fac-create-avatar--selected",
        })}

        <div class="fac-create-selected-copy">
          <span>Cliente seleccionado</span>
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(email || clienteId)}</small>
        </div>
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

function getCurrentSelectedTicket() {
  const selectedId = safeText(
    first(modalState.form?.ticketId, modalState.form?.incidenciaId),
    ""
  );

  if (!selectedId) return null;

  return (
    safeArray(modalState.ticketSearchResults).find((ticket) => {
      return ticket.id === selectedId;
    }) || {
      id: selectedId,
      ticketId: selectedId,
      incidenciaId: selectedId,
      subject: safeText(modalState.form?.incidenciaSubject, selectedId),
      subtitle: "",
    }
  );
}

function renderSelectedTicket() {
  const ticket = getCurrentSelectedTicket();

  if (!ticket?.id) return "";

  const label = modalState.ticketAutoSelected
    ? "Incidencia más reciente"
    : "Incidencia seleccionada";

  return `
    <div class="fac-create-selected fac-create-selected--ticket">
      <div class="fac-create-selected-main">
        <div class="fac-create-ticket-badge" aria-hidden="true">
          <span>I</span>
        </div>

        <div class="fac-create-selected-copy">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(ticket.id)}</strong>
          <small>${escapeHtml(ticket.subject || ticket.id)}</small>
        </div>
      </div>

      <button
        type="button"
        class="fac-create-selected-clear"
        data-clear-ticket="true"
        ${modalState.submitting ? "disabled" : ""}
      >
        Limpiar
      </button>
    </div>
  `;
}

function renderTicketOptions() {
  const results = safeArray(modalState.ticketSearchResults);
  const selectedId = safeText(
    first(modalState.form?.ticketId, modalState.form?.incidenciaId),
    ""
  );

  if (!results.length) {
    return `<option value="">Sin incidencias relacionadas</option>`;
  }

  return `
    <option value="">Selecciona una incidencia...</option>

    ${results
      .map((ticket, index) => {
        const label = `${ticket.id} · ${ticket.subject || ticket.id}`;

        return `
          <option
            value="${escapeHtml(ticket.id)}"
            data-ticket-index="${index}"
            ${selectedId === ticket.id ? "selected" : ""}
          >
            ${escapeHtml(label)}
          </option>
        `;
      })
      .join("")}
  `;
}

function renderTicketSearchResults() {
  const query = safeText(modalState.ticketSearchQuery, "");
  const loading = Boolean(modalState.ticketSearchLoading);
  const error = safeText(modalState.ticketSearchError, "");
  const results = safeArray(modalState.ticketSearchResults);

  if (!query) return "";

  if (loading) {
    return `<div class="fac-create-search-state">Filtrando incidencias...</div>`;
  }

  if (error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(error)}</div>`;
  }

  if (!results.length) {
    return `<div class="fac-create-search-state">Sin incidencias para ese filtro.</div>`;
  }

  return `
    <div class="fac-create-search-results">
      ${results
        .map(
          (item, index) => `
            <button
              type="button"
              class="fac-create-search-item fac-create-search-item--ticket"
              data-select-ticket="${index}"
              ${modalState.submitting ? "disabled" : ""}
            >
              <span class="fac-create-ticket-mini-badge" aria-hidden="true">I</span>

              <span class="fac-create-search-copy">
                <strong>${escapeHtml(item.id)} · ${escapeHtml(item.subject)}</strong>
                <span>${escapeHtml(item.subtitle || item.clienteId || item.id)}</span>
              </span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTargetBlock() {
  const errors = safeObject(modalState.errors);

  const clienteSelected = Boolean(getSelectedClienteId());
  const ticketLoading = Boolean(modalState.ticketSearchLoading);
  const ticketList = safeArray(modalState.ticketSearchResults);
  const selectedTicket = getCurrentSelectedTicket();

  return `
    <section class="fac-create-target">
      <div class="fac-create-target-head">
        <div>
          <span>Destino de facturación</span>
          <h3>Cliente e incidencia</h3>
          <p>
            Selecciona el cliente y vincula la factura a una incidencia real.
            La numeración, el PDF y la auditoría se resuelven automáticamente al crearla.
          </p>
        </div>
      </div>

      <div class="fac-create-target-grid">
        <div class="fac-create-target-column">
          <div class="fac-create-column-title">Cliente</div>

          ${
            clienteSelected
              ? renderSelectedCliente()
              : `
                <label class="fac-create-field">
                  <input
                    class="fac-create-input ${errors.clienteId ? "is-error" : ""}"
                    data-field="clienteSearch"
                    name="clienteSearch"
                    type="text"
                    value="${escapeHtml(modalState.clienteSearchQuery)}"
                    placeholder="Buscar por nombre, email o usuario..."
                    autocomplete="off"
                    ${modalState.submitting ? "disabled" : ""}
                  />

                  ${renderFieldError(errors.clienteId)}
                </label>

                ${renderClientSearchResults()}
              `
          }
        </div>

        <div class="fac-create-target-column">
          <div class="fac-create-column-title">Incidencia vinculada</div>

          ${
            !clienteSelected
              ? `
                <div class="fac-create-locked">
                  <strong>Primero selecciona un cliente</strong>
                  <span>Después podrás cargar y elegir una incidencia asociada.</span>
                  ${renderFieldError(errors.incidenciaId)}
                </div>
              `
              : `
                <div class="fac-create-ticket-toolbar">
                  <label class="fac-create-field">
                    <select
                      class="fac-create-select ${errors.incidenciaId ? "is-error" : ""}"
                      data-field="ticketSelect"
                      name="ticketSelect"
                      ${modalState.submitting || ticketLoading || !ticketList.length ? "disabled" : ""}
                    >
                      ${renderTicketOptions()}
                    </select>

                    ${renderFieldError(errors.incidenciaId)}
                  </label>

                  <button
                    type="button"
                    class="fac-create-mini-button"
                    data-refresh-tickets="true"
                    ${modalState.submitting || ticketLoading ? "disabled" : ""}
                  >
                    ${ticketLoading ? "Cargando..." : "Recargar"}
                  </button>
                </div>

                ${
                  ticketLoading
                    ? `<div class="fac-create-search-state">Cargando incidencias del cliente...</div>`
                    : ""
                }

                ${
                  !ticketLoading && modalState.ticketSearchError
                    ? `<div class="fac-create-search-state is-error">${escapeHtml(modalState.ticketSearchError)}</div>`
                    : ""
                }

                ${
                  !ticketLoading && !modalState.ticketSearchError && !ticketList.length
                    ? `<div class="fac-create-search-state">Este cliente no tiene incidencias disponibles.</div>`
                    : ""
                }

                ${selectedTicket?.id ? renderSelectedTicket() : ""}

                <label class="fac-create-field">
                  <input
                    class="fac-create-input"
                    data-field="ticketSearch"
                    name="ticketSearch"
                    type="text"
                    value="${escapeHtml(modalState.ticketSearchQuery)}"
                    placeholder="Filtrar por código, asunto o estado..."
                    autocomplete="off"
                    ${modalState.submitting || ticketLoading ? "disabled" : ""}
                  />
                </label>

                ${renderTicketSearchResults()}
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderLoadingOverlay() {
  return `
    <div class="fac-create-loading-overlay">
      <div class="fac-create-loading-card">
        <span class="fac-create-loading-spinner" aria-hidden="true"></span>
        <strong>Creando factura...</strong>
        <small>Generando documento y preparando el envío</small>
      </div>
    </div>
  `;
}

function renderStyles() {
  return `
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
        background:rgba(10,14,24,.48);
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
      }

      .fac-create-panel{
        position:relative;
        width:min(940px, 100%);
        max-height:92vh;
        overflow:auto;
        border-radius:26px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 34%),
          radial-gradient(circle at 95% 0%, rgba(255,255,255,.14), transparent 30%),
          linear-gradient(180deg, var(--surface-2, #171717), var(--surface-1, #111));
        box-shadow:
          0 36px 90px rgba(0,0,0,.42),
          0 1px 0 rgba(255,255,255,.05) inset;
        color:var(--text, #f5f5f5);
      }

      .fac-create-panel *,
      .fac-create-panel *::before,
      .fac-create-panel *::after{
        box-sizing:border-box;
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
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      }

      .fac-create-loading-card{
        display:grid;
        justify-items:center;
        gap:10px;
        padding:24px 28px;
        border-radius:20px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
          var(--surface-2, #171717);
        box-shadow:0 28px 70px rgba(0,0,0,.34);
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
        padding:24px 24px 18px;
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.10));
      }

      .fac-create-header-copy{
        display:grid;
        gap:8px;
        min-width:0;
      }

      .fac-create-header-copy h2{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:clamp(30px, 4vw, 42px);
        line-height:0.95;
        letter-spacing:-.06em;
      }

      .fac-create-header-copy p{
        max-width:720px;
        margin:0;
        color:var(--text-dim, rgba(255,255,255,.64));
        font-size:13px;
        line-height:1.6;
      }

      .fac-create-close{
        width:44px;
        height:44px;
        flex:0 0 auto;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:var(--text-strong, #fff);
        cursor:pointer;
        font-size:18px;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease;
      }

      .fac-create-close:hover{
        transform:translateY(-1px);
        background:color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 26%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
      }

      .fac-create-body{
        display:grid;
        gap:14px;
        padding:18px 24px 24px;
      }

      .fac-create-form{
        display:grid;
        gap:14px;
      }

      .fac-create-alert{
        display:grid;
        gap:4px;
        padding:12px 14px;
        border-radius:15px;
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

      .fac-create-target{
        display:grid;
        gap:14px;
        padding:16px;
        border-radius:22px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 15%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-glass, rgba(255,255,255,.04));
      }

      .fac-create-target-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }

      .fac-create-target-head > div{
        display:grid;
        gap:5px;
        min-width:0;
      }

      .fac-create-target-head span,
      .fac-create-column-title,
      .fac-create-label{
        color:var(--text-soft, rgba(255,255,255,.74));
        font-size:11px;
        font-weight:800;
        letter-spacing:.06em;
        text-transform:uppercase;
      }

      .fac-create-target-head h3{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:20px;
        line-height:1.1;
        letter-spacing:-.035em;
      }

      .fac-create-target-head p{
        max-width:680px;
        margin:0;
        color:var(--text-dim, rgba(255,255,255,.60));
        font-size:12px;
        line-height:1.55;
      }

      .fac-create-target-grid{
        display:grid;
        grid-template-columns:minmax(0, .92fr) minmax(0, 1.08fr);
        gap:12px;
      }

      .fac-create-target-column{
        display:grid;
        align-content:start;
        gap:10px;
        min-width:0;
        padding:14px;
        border-radius:18px;
        border:1px solid var(--border-soft, rgba(255,255,255,.10));
        background:color-mix(in srgb, var(--surface-1, #111) 72%, transparent);
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
      }

      .fac-create-target-column:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft, rgba(255,255,255,.10)));
        box-shadow:0 14px 32px rgba(0,0,0,.12);
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
      .fac-create-textarea,
      .fac-create-select{
        width:100%;
        outline:none;
        color:var(--text-strong, #fff);
        background:var(--surface-1, rgba(255,255,255,.04));
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        font-size:14px;
        transition:
          transform .16s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
      }

      .fac-create-input:hover,
      .fac-create-textarea:hover,
      .fac-create-select:hover{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft, rgba(255,255,255,.12)));
      }

      .fac-create-input,
      .fac-create-select{
        min-height:46px;
        padding:0 14px;
        border-radius:15px;
      }

      .fac-create-select{
        appearance:auto;
      }

      .fac-create-textarea{
        min-height:116px;
        padding:13px 14px;
        border-radius:15px;
        resize:vertical;
        line-height:1.55;
      }

      .fac-create-input::placeholder,
      .fac-create-textarea::placeholder{
        color:var(--text-faint, rgba(255,255,255,.36));
      }

      .fac-create-input:focus,
      .fac-create-textarea:focus,
      .fac-create-select:focus{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 34%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
      }

      .fac-create-input.is-error,
      .fac-create-textarea.is-error,
      .fac-create-select.is-error{
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 42%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
      }

      .fac-create-input.is-readonly{
        opacity:.92;
        cursor:default;
        font-weight:800;
      }

      .fac-create-error{
        color:var(--danger-strong, #ff6b6b);
        font-size:11px;
        line-height:1.35;
        font-weight:700;
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
        width:100%;
        min-width:0;
        padding:11px 13px;
        border-radius:15px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:inherit;
        text-align:left;
        cursor:pointer;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease;
      }

      .fac-create-search-item--client,
      .fac-create-search-item--ticket{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr);
        align-items:center;
        gap:11px;
      }

      .fac-create-search-item:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 26%, var(--border-soft, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass, rgba(255,255,255,.05)));
        box-shadow:0 12px 26px rgba(0,0,0,.08);
      }

      .fac-create-search-copy{
        display:grid;
        gap:3px;
        min-width:0;
      }

      .fac-create-search-item strong{
        color:var(--text-strong, #fff);
        font-size:13px;
        line-height:1.35;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-search-item span{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:11px;
        line-height:1.35;
      }

      .fac-create-search-copy > span{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-avatar{
        position:relative;
        display:grid;
        place-items:center;
        overflow:hidden;
        border-radius:999px;
        background:linear-gradient(135deg, var(--accent, #7c5cff), color-mix(in srgb, var(--accent, #7c5cff) 45%, #ec4899));
        color:#fff;
        font-weight:900;
        letter-spacing:-.03em;
        isolation:isolate;
        transform:translateZ(0);
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent),
          0 0 0 3px color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      }

      .fac-create-avatar--search{
        width:42px;
        height:42px;
        min-width:42px;
        min-height:42px;
        font-size:13px;
      }

      .fac-create-avatar--selected{
        width:50px;
        height:50px;
        min-width:50px;
        min-height:50px;
        font-size:15px;
      }

      .fac-create-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:2;
        pointer-events:none;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.11), rgba(0,0,0,.10));
        mix-blend-mode:screen;
      }

      .fac-create-avatar img{
        position:absolute;
        inset:0;
        z-index:1;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .fac-create-avatar-fallback{
        position:relative;
        z-index:3;
        display:grid;
        place-items:center;
        width:100%;
        height:100%;
        color:#fff;
        text-shadow:
          0 1px 2px rgba(0,0,0,.24),
          0 0 18px rgba(255,255,255,.20);
      }

      .fac-create-avatar.has-image .fac-create-avatar-fallback{
        display:none;
      }

      .fac-create-avatar[data-fallback="true"] .fac-create-avatar-fallback{
        display:grid;
      }

      .fac-create-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .fac-create-selected{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        align-items:center;
        gap:12px;
        min-width:0;
        padding:14px;
        border-radius:18px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 44%),
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-glass, rgba(255,255,255,.05));
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent),
          inset 0 1px 0 rgba(255,255,255,.045);
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
      }

      .fac-create-selected:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 36%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:
          0 18px 38px color-mix(in srgb, var(--accent, #7c5cff) 11%, transparent),
          inset 0 1px 0 rgba(255,255,255,.055);
      }

      .fac-create-selected-main{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr);
        align-items:center;
        gap:12px;
        min-width:0;
      }

      .fac-create-ticket-badge{
        display:grid;
        place-items:center;
        width:50px;
        height:50px;
        min-width:50px;
        min-height:50px;
        border-radius:16px;
        color:#fff;
        background:
          radial-gradient(circle at 26% 22%, rgba(255,255,255,.34), transparent 34%),
          linear-gradient(135deg, var(--accent, #7c5cff), color-mix(in srgb, var(--accent, #7c5cff) 44%, #111827));
        box-shadow:
          0 12px 28px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent),
          0 0 0 3px color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      }

      .fac-create-ticket-badge span{
        color:#fff;
        font-size:15px;
        line-height:1;
        font-weight:900;
        letter-spacing:-.03em;
      }

      .fac-create-ticket-mini-badge{
        display:grid;
        place-items:center;
        width:38px;
        height:38px;
        min-width:38px;
        min-height:38px;
        border-radius:14px;
        color:#fff !important;
        font-size:13px !important;
        font-weight:900;
        background:linear-gradient(135deg, var(--accent, #7c5cff), color-mix(in srgb, var(--accent, #7c5cff) 50%, #111827));
        box-shadow:0 10px 22px color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      }

      .fac-create-selected-copy{
        display:grid;
        gap:4px;
        min-width:0;
      }

      .fac-create-selected-copy span{
        color:var(--text-dim, rgba(255,255,255,.56));
        font-size:10px;
        font-weight:900;
        letter-spacing:.065em;
        text-transform:uppercase;
      }

      .fac-create-selected-copy strong{
        color:var(--text-strong, #fff);
        font-size:14px;
        line-height:1.25;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-selected-copy small{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:12px;
        line-height:1.35;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-selected-clear{
        min-height:36px;
        padding:0 13px;
        border-radius:12px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:rgba(255,255,255,.04);
        color:var(--text-soft, rgba(255,255,255,.78));
        font-size:12px;
        font-weight:800;
        cursor:pointer;
        white-space:nowrap;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease;
      }

      .fac-create-selected-clear:hover{
        transform:translateY(-1px);
        background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
      }

      .fac-create-ticket-toolbar{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:8px;
        align-items:start;
      }

      .fac-create-mini-button{
        min-height:46px;
        padding:0 12px;
        border-radius:14px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:var(--text-soft, rgba(255,255,255,.74));
        font-size:11px;
        font-weight:900;
        cursor:pointer;
        white-space:nowrap;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease;
      }

      .fac-create-mini-button:hover{
        transform:translateY(-1px);
        background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
      }

      .fac-create-locked{
        display:grid;
        gap:4px;
        padding:14px;
        border-radius:15px;
        border:1px dashed var(--border-soft, rgba(255,255,255,.14));
        background:color-mix(in srgb, var(--surface-1, #111) 70%, transparent);
      }

      .fac-create-locked strong{
        color:var(--text-soft, rgba(255,255,255,.78));
        font-size:13px;
      }

      .fac-create-locked span{
        color:var(--text-dim, rgba(255,255,255,.58));
        font-size:12px;
        line-height:1.4;
      }

      .fac-create-check{
        display:flex;
        align-items:flex-start;
        gap:10px;
        padding:14px 14px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        cursor:pointer;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease;
      }

      .fac-create-check:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 12px 28px rgba(0,0,0,.08);
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
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding-top:2px;
      }

      .fac-create-submit-summary{
        display:grid;
        gap:4px;
        min-width:180px;
        padding:13px 15px;
        border-radius:17px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 14%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #7c5cff) 9%, transparent), transparent 42%),
          var(--surface-glass, rgba(255,255,255,.045));
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:11px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
      }

      .fac-create-submit-summary span{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:11px;
        line-height:1.25;
      }

      .fac-create-submit-summary strong{
        color:var(--text-strong, #fff);
        font-size:18px;
        line-height:1.1;
        letter-spacing:-.035em;
      }

      .fac-create-action-buttons{
        display:flex;
        justify-content:flex-end;
        gap:10px;
      }

      .fac-create-submit{
        min-height:46px;
        padding:0 22px;
        border-radius:14px;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease,
          opacity .18s ease;
        border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent));
        background:var(--btn-primary-bg, var(--accent, #7c5cff));
        color:var(--btn-primary-text, #fff);
        box-shadow:0 12px 26px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .fac-create-submit:hover{
        transform:translateY(-1px);
        filter:saturate(1.03) brightness(1.02);
        box-shadow:0 16px 32px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
      }

      .fac-create-submit:disabled,
      .fac-create-mini-button:disabled,
      .fac-create-selected-clear:disabled,
      .fac-create-search-item:disabled,
      .fac-create-close:disabled{
        opacity:.82;
        cursor:wait;
        transform:none;
        box-shadow:none;
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
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 34%),
          radial-gradient(circle at 95% 0%, rgba(255,255,255,.66), transparent 30%),
          linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,255,.96));
        box-shadow:
          0 28px 70px rgba(15,23,42,.14),
          0 0 0 1px rgba(255,255,255,.68) inset;
      }

      [data-theme="light"] .fac-create-header-copy h2,
      [data-theme="light"] .fac-create-target-head h3,
      [data-theme="light"] .fac-create-alert strong,
      [data-theme="light"] .fac-create-input,
      [data-theme="light"] .fac-create-textarea,
      [data-theme="light"] .fac-create-select,
      [data-theme="light"] .fac-create-search-item strong,
      [data-theme="light"] .fac-create-selected-copy strong,
      [data-theme="light"] .fac-create-check strong,
      [data-theme="light"] .fac-create-submit-summary strong,
      [data-theme="light"] .fac-create-locked strong{
        color:var(--text-strong, #111827);
      }

      [data-theme="light"] .fac-create-header-copy p,
      [data-theme="light"] .fac-create-target-head p,
      [data-theme="light"] .fac-create-alert span,
      [data-theme="light"] .fac-create-label,
      [data-theme="light"] .fac-create-target-head span,
      [data-theme="light"] .fac-create-column-title,
      [data-theme="light"] .fac-create-search-state,
      [data-theme="light"] .fac-create-search-item span,
      [data-theme="light"] .fac-create-selected-copy span,
      [data-theme="light"] .fac-create-selected-copy small,
      [data-theme="light"] .fac-create-check small,
      [data-theme="light"] .fac-create-submit-summary,
      [data-theme="light"] .fac-create-submit-summary span,
      [data-theme="light"] .fac-create-locked span{
        color:var(--text-dim, #6b7280);
      }

      [data-theme="light"] .fac-create-close,
      [data-theme="light"] .fac-create-target,
      [data-theme="light"] .fac-create-target-column,
      [data-theme="light"] .fac-create-alert,
      [data-theme="light"] .fac-create-input,
      [data-theme="light"] .fac-create-textarea,
      [data-theme="light"] .fac-create-select,
      [data-theme="light"] .fac-create-search-state,
      [data-theme="light"] .fac-create-search-item,
      [data-theme="light"] .fac-create-selected,
      [data-theme="light"] .fac-create-check,
      [data-theme="light"] .fac-create-mini-button,
      [data-theme="light"] .fac-create-selected-clear,
      [data-theme="light"] .fac-create-submit-summary,
      [data-theme="light"] .fac-create-locked{
        background:rgba(255,255,255,.72);
        border-color:rgba(15,23,42,.08);
      }

      [data-theme="light"] .fac-create-target-column{
        background:rgba(255,255,255,.54);
      }

      @media (max-width: 820px){
        .fac-create-target-grid,
        .fac-create-grid--2,
        .fac-create-grid--3{
          grid-template-columns:1fr;
        }

        .fac-create-target-head{
          flex-direction:column;
        }

        .fac-create-ticket-toolbar{
          grid-template-columns:1fr;
        }

        .fac-create-actions{
          align-items:stretch;
          flex-direction:column;
        }

        .fac-create-action-buttons{
          flex-direction:column;
          width:100%;
        }

        .fac-create-submit{
          width:100%;
        }

        .fac-create-submit-summary{
          width:100%;
        }

        .fac-create-selected{
          grid-template-columns:1fr;
        }

        .fac-create-selected-clear{
          width:100%;
        }
      }

      @media (prefers-reduced-motion: reduce){
        .fac-create-panel *,
        .fac-create-panel *::before,
        .fac-create-panel *::after{
          animation:none !important;
          transition:none !important;
        }
      }
    </style>
  `;
}

/* =========================================================
   MODAL TEMPLATE
========================================================= */

function renderModalInner() {
  const form = safeObject(modalState.form);
  const errors = safeObject(modalState.errors);
  const total = getFormTotal(form);

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
            <h2 id="facturas-create-modal-title">Crear factura</h2>
            <p>
              Crea una factura vinculada a una incidencia.
              La fecha de factura se toma automáticamente al crearla.
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
            ${renderTargetBlock()}

            <div class="fac-create-grid fac-create-grid--2">
              ${renderInput({
                label: "Fecha servicio",
                name: "fechaServicio",
                type: "date",
                value: form.fechaServicio,
              })}

              ${renderSelect({
                label: "Forma de pago",
                name: "formaPago",
                value: form.formaPago,
                options: PAYMENT_OPTIONS,
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
              placeholder: "Detalle del trabajo facturable...",
              required: true,
              error: errors.descripcion,
            })}

            <div class="fac-create-grid fac-create-grid--2">
              ${renderInput({
                label: "Cantidad / horas",
                name: "cantidad",
                type: "number",
                value: form.cantidad,
                min: "0.01",
                step: "0.01",
                inputmode: "decimal",
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
                inputmode: "decimal",
                required: true,
                error: errors.precioUnitario,
              })}
            </div>

            ${renderCheckbox({
              label: "Enviar email al cliente",
              name: "sendEmail",
              checked: parseBoolean(form.sendEmail, true),
              help: "Adjunta el PDF generado y utiliza el envío configurado para facturas.",
            })}

            <div class="fac-create-actions">
              <div class="fac-create-submit-summary">
                <span>Total estimado</span>
                <strong data-role="total-preview-inline">${escapeHtml(formatMoney(total))}</strong>
              </div>

              <div class="fac-create-action-buttons">
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
            </div>
          </form>
        </div>

        ${renderStyles()}
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
    modalState.previousBodyOverflow = document.body.style.overflow || "";
  } catch {}

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
    document.body.style.overflow = modalState.previousBodyOverflow || "";
    modalState.previousBodyOverflow = "";
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
  if (errors.incidenciaId && focusField("ticketSelect")) return true;
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
  modalState.ticketAutoSelected = false;

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

  const draftClienteUserId = safeText(
    first(
      normalizedDraft.clienteUserId,
      normalizedDraft.userId,
      normalizedDraft.usuarioId,
      normalizedDraft.cliente?.userId,
      normalizedDraft.user?.userId
    ),
    ""
  );

  const draftClienteAvatar = safeText(
    first(
      normalizedDraft.clienteAvatar,
      normalizedDraft.avatarUrl,
      normalizedDraft.avatar,
      normalizedDraft.logoUrl,
      normalizedDraft.logo,
      normalizedDraft.cliente?.avatarUrl,
      normalizedDraft.cliente?.avatar,
      normalizedDraft.cliente?.logoUrl,
      normalizedDraft.user?.avatarUrl,
      normalizedDraft.user?.avatar,
      getAvatarUrlFromObject(normalizedDraft)
    ),
    ""
  );

  modalState.form = {
    ...modalState.form,
    ...normalizedDraft,
    clienteUserId: draftClienteUserId || safeText(normalizedDraft.clienteUserId, ""),
    clienteAvatar: draftClienteAvatar || safeText(normalizedDraft.clienteAvatar, ""),
    ticketId: draftTicketId || safeText(normalizedDraft.ticketId, ""),
    incidenciaId: draftTicketId || safeText(normalizedDraft.incidenciaId, ""),
    incidenciaSubject: draftTicketSubject || safeText(normalizedDraft.incidenciaSubject, ""),
    fechaServicio: safeText(normalizedDraft.fechaServicio, modalState.form.fechaServicio),
    formaPago: safeText(normalizedDraft.formaPago, modalState.form.formaPago),
  };

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  syncDerivedUi();

  if (!safeText(modalState.form.clienteId, "")) {
    focusField("clienteSearch");
  } else if (!safeText(first(modalState.form.ticketId, modalState.form.incidenciaId), "")) {
    focusField("ticketSelect");

    loadTicketsForSelectedClient({
      query: "",
      autoSelectLatest: true,
      focus: "ticketSelect",
    });
  } else {
    focusField("descripcion");
  }

  safeEmit("facturas:create-modal:opened", {
    draft: modalState.form,
  });

  return true;
}

export function closeFacturasCreateModal() {
  if (modalState.submitting) return false;

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

  const normalizedDraft = safeObject(draft);

  modalState.form = {
    ...safeObject(modalState.form),
    ...normalizedDraft,
    clienteAvatar: safeText(
      first(
        normalizedDraft.clienteAvatar,
        normalizedDraft.avatarUrl,
        normalizedDraft.avatar,
        getAvatarUrlFromObject(normalizedDraft),
        modalState.form.clienteAvatar
      ),
      ""
    ),
  };

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusPanel();

  return true;
}

/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) return false;

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdFacturaId = "";

  const validation = validateForm(modalState.form);
  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    syncDerivedUi();
    focusFirstInvalidField();

    showToast("Revisa los campos obligatorios.", "warning");

    return false;
  }

  const payload = buildCreatePayload(modalState.form);

  modalState.submitting = true;

  renderModal();
  attachRootBindings();
  syncDerivedUi();
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
    syncDerivedUi();
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
    syncDerivedUi();
    focusFirstInvalidField();

    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   BINDINGS
========================================================= */

async function selectCliente(index = -1) {
  const item = safeArray(modalState.clienteSearchResults)[Number(index)];

  if (!item?.id) return false;

  setFormPatch({
    clienteId: item.clienteId || item.id,
    clienteUserId: item.userId || "",
    clienteNombre: item.name,
    clienteEmail: item.email,
    clienteAvatar: safeText(first(item.avatarUrl, item.avatar), ""),

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
  modalState.ticketAutoSelected = false;

  if (modalState.errors.clienteId || modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.clienteId;
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSelect");

  await loadTicketsForSelectedClient({
    query: "",
    autoSelectLatest: true,
    focus: "ticketSelect",
  });

  return true;
}

function clearCliente() {
  setFormPatch({
    clienteId: "",
    clienteUserId: "",
    clienteNombre: "",
    clienteEmail: "",
    clienteAvatar: "",

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
  modalState.ticketAutoSelected = false;

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("clienteSearch");

  return true;
}

function selectTicket(index = -1) {
  const item = safeArray(modalState.ticketSearchResults)[Number(index)];

  if (!item?.id) return false;

  setSelectedTicketFromItem(item, {
    auto: false,
  });

  modalState.ticketSearchQuery = "";

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("descripcion");

  return true;
}

function selectTicketById(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    clearTicket();
    return false;
  }

  const item = safeArray(modalState.ticketSearchResults).find((ticket) => {
    return ticket.id === id || ticket.ticketId === id || ticket.incidenciaId === id;
  });

  if (!item) return false;

  setSelectedTicketFromItem(item, {
    auto: false,
  });

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSelect");

  return true;
}

function clearTicket() {
  setFormPatch({
    ticketId: "",
    incidenciaId: "",
    incidenciaSubject: "",
  });

  modalState.ticketAutoSelected = false;

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSelect");

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
        clienteUserId: "",
        clienteNombre: "",
        clienteEmail: "",
        clienteAvatar: "",
        ticketId: "",
        incidenciaId: "",
        incidenciaSubject: "",
      });

      modalState.ticketSearchQuery = "";
      modalState.ticketSearchResults = [];
      modalState.ticketSearchLoading = false;
      modalState.ticketSearchError = "";
      modalState.ticketAutoSelected = false;
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

    scheduleTicketSearch(value);
    return;
  }

  if (fieldName === "ticketSelect") {
    selectTicketById(field.value);
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

  syncDerivedUi();
}

function attachRootBindings() {
  if (modalState.bindingsAttached) return;

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    if (field.type === "checkbox") return;
    if (field.tagName === "SELECT") return;

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

  const onClick = async (event) => {
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

      await selectCliente(selectClienteBtn.dataset.selectCliente);
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
      return;
    }

    const refreshTicketsBtn = event.target.closest("[data-refresh-tickets='true']");

    if (refreshTicketsBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      await loadTicketsForSelectedClient({
        query: modalState.ticketSearchQuery,
        autoSelectLatest: !safeText(
          first(modalState.form.ticketId, modalState.form.incidenciaId),
          ""
        ),
        focus: "ticketSelect",
      });
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

  async reloadTickets() {
    return loadTicketsForSelectedClient({
      query: modalState.ticketSearchQuery,
      autoSelectLatest: false,
      focus: "ticketSelect",
    });
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

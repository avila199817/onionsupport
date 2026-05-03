/* =========================================================
   Onion SPA - Facturas Create Modal
   Archivo: src/views/facturas/facturas.create.modal.js

   FACTURAS EXPERIENCE PRO · CREATE MODAL · COSMOS/BLOB ALIGNED · GOD MODE
   PATCH FINAL · CLIENT + INCIDENCIA CARDS REDESIGN EXTREME
   PATCH FINAL · MULTI CLIENTE + MULTI INCIDENCIA READY
   PATCH FINAL · TARGET BLOCK MOVED ABOVE SEND EMAIL CHECK
   PATCH FINAL · JSON v3/v2 COMPATIBLE PAYLOAD
   PATCH FINAL · REAL AVATAR + FALLBACK INITIALS
   PATCH FINAL · ONLY TOTAL CARD / NO TOTAL INPUT FIELD
   PATCH FINAL · BACKEND SAFE PRIMARY CLIENT/TICKET + ARRAYS

   Responsabilidades:
   - abrir/cerrar modal premium de creación de factura
   - buscar cliente/usuario objetivo
   - permitir seleccionar uno o varios clientes destino
   - pintar avatar real del cliente/usuario si backend lo entrega
   - fallback de avatar con iniciales si no hay imagen
   - al seleccionar cliente, cargar incidencias vinculadas a ese cliente/usuario
   - seleccionar automáticamente la incidencia más reciente
   - permitir seleccionar una o varias incidencias
   - mantener cliente/ticket primario para compatibilidad backend
   - enviar arrays clienteIds/userIds/clientes/ticketIds/incidenciaIds/incidencias
   - crear factura desde panel admin alineada con backend v3
   - enviar payload compatible con /router/facturas/factura_create_admin.js
   - NO pedir fecha factura: el backend usa fecha de creación real
   - NO pedir moneda: EUR fija
   - NO pedir cuenta bancaria: no se solicita en UI
   - total estimado calculado en tiempo real con IVA/IRPF
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

const SEARCH_LIMIT = 10;
const TICKET_LIMIT = 60;
const SEARCH_DEBOUNCE = 240;

const CREATE_TIMEOUT_MS = 90000;
const SEARCH_TIMEOUT_MS = 15000;

const DEFAULT_IVA_RATE = 21;
const DEFAULT_IRPF_RATE = 7;

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

  selectedClientes: [],
  selectedTickets: [],

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

function compactUnique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
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
   CLIENT NORMALIZATION / SELECTION
========================================================= */

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

  const razonSocial = safeText(
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

  const nombreContacto = safeText(
    first(
      obj.nombreContacto,
      obj.contactName,
      obj.contactoNombre,
      obj.nombre,
      obj.name,
      obj.fullName,
      obj.displayName,

      cliente.nombreContacto,
      cliente.contactName,
      cliente.contactoNombre,
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
    razonSocial || `Cliente ${id}`
  );

  const displayName = safeText(first(nombreContacto, razonSocial), `Cliente ${id}`);

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

  const telefono = safeText(
    first(
      obj.telefono,
      obj.phone,
      obj.mobile,
      obj.movil,

      cliente.telefono,
      cliente.phone,
      cliente.mobile,
      cliente.movil,

      contacto.telefono,
      contacto.phone,
      contacto.mobile,

      user.telefono,
      user.phone,
      usuario.telefono,
      usuario.phone
    ),
    ""
  );

  const nif = safeText(
    first(
      obj.nif,
      obj.cif,
      obj.taxId,
      obj.vatId,

      cliente.nif,
      cliente.cif,
      cliente.taxId,
      cliente.vatId
    ),
    ""
  );

  const username = safeText(
    first(
      obj.username,
      obj.slug,
      obj.handle,

      cliente.username,
      cliente.slug,

      user.username,
      user.slug,

      usuario.username,
      usuario.slug,

      email ? email.split("@")[0] : ""
    ),
    ""
  );

  const direccion = safeObject(
    first(
      obj.direccion,
      obj.address,
      cliente.direccion,
      cliente.address,
      contacto.direccion,
      contacto.address
    ),
    {}
  );

  const avatarUrl = getAvatarUrlFromObject(obj);

  const subtitle = safeText(
    first(
      email,
      razonSocial && razonSocial !== displayName ? razonSocial : "",
      telefono,
      nif,
      clienteId || userId
    ),
    id
  );

  return {
    id,
    clienteId: clienteId || id,
    userId: userId || "",
    name: displayName,
    nombre: displayName,
    nombreContacto: displayName,
    razonSocial: razonSocial || displayName,
    email,
    telefono,
    phone: telefono,
    nif,
    username,
    direccion,
    empresa: razonSocial || "",
    avatarUrl,
    avatar: avatarUrl,
    initials: getInitials(displayName, "CL"),
    subtitle,
    raw: obj,
  };
}

function getSelectedClientes() {
  return safeArray(modalState.selectedClientes);
}

function getPrimaryCliente() {
  return getSelectedClientes()[0] || null;
}

function getSelectedClienteIds() {
  return compactUnique(getSelectedClientes().map((item) => item.clienteId || item.id));
}

function getSelectedUserIds() {
  return compactUnique(getSelectedClientes().map((item) => item.userId));
}

function hasSelectedCliente(cliente = {}) {
  const item = normalizeClientCandidate(cliente) || safeObject(cliente);
  const clienteId = safeText(item.clienteId || item.id, "");
  const userId = safeText(item.userId, "");

  return getSelectedClientes().some((selected) => {
    return (
      (clienteId && (selected.clienteId === clienteId || selected.id === clienteId)) ||
      (userId && selected.userId === userId)
    );
  });
}

function syncPrimaryClientToForm() {
  const primary = getPrimaryCliente();

  if (!primary) {
    setFormPatch({
      clienteId: "",
      clienteUserId: "",
      clienteNombre: "",
      clienteEmail: "",
      clienteAvatar: "",
    });

    return null;
  }

  setFormPatch({
    clienteId: primary.clienteId || primary.id,
    clienteUserId: primary.userId || "",
    clienteNombre: primary.name || primary.nombreContacto || primary.razonSocial || "",
    clienteEmail: primary.email || "",
    clienteAvatar: safeText(first(primary.avatarUrl, primary.avatar), ""),
  });

  return primary;
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
   TICKET NORMALIZATION / SELECTION
========================================================= */

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

function getSelectedTickets() {
  return safeArray(modalState.selectedTickets);
}

function getPrimaryTicket() {
  return getSelectedTickets()[0] || null;
}

function getSelectedTicketIds() {
  return compactUnique(getSelectedTickets().map((item) => item.ticketId || item.id));
}

function hasSelectedTicket(ticket = {}) {
  const item = normalizeTicketCandidate(ticket) || safeObject(ticket);
  const id = safeText(first(item.id, item.ticketId, item.incidenciaId), "");

  return Boolean(
    id &&
      getSelectedTickets().some((selected) => {
        return selected.id === id || selected.ticketId === id || selected.incidenciaId === id;
      })
  );
}

function syncPrimaryTicketToForm() {
  const primary = getPrimaryTicket();

  if (!primary) {
    setFormPatch({
      ticketId: "",
      incidenciaId: "",
      incidenciaSubject: "",
    });

    return null;
  }

  setFormPatch({
    ticketId: primary.ticketId || primary.id,
    incidenciaId: primary.incidenciaId || primary.id,
    incidenciaSubject: primary.subject || primary.asunto || primary.id,
  });

  return primary;
}

/* =========================================================
   TICKET SEARCH
========================================================= */

function buildTicketSearchUrlsForClient(query = "", cliente = null) {
  const q = normalizeWhitespace(query);
  const selected = safeObject(cliente || getPrimaryCliente());

  const clienteId = safeText(first(selected.clienteId, selected.id), "");
  const userId = safeText(selected.userId, "");

  return TICKET_SEARCH_ENDPOINTS.map((endpoint) => {
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
      params.set("search", q);
    }

    params.set("limit", String(TICKET_LIMIT));

    if (clienteId) params.set("clienteId", clienteId);
    if (userId) params.set("userId", userId);

    const allClienteIds = getSelectedClienteIds();
    const allUserIds = getSelectedUserIds();

    if (allClienteIds.length) params.set("clienteIds", allClienteIds.join(","));
    if (allUserIds.length) params.set("userIds", allUserIds.join(","));

    params.set("includeClosed", "true");
    params.set("includeAll", "true");
    params.set("onlyMine", "false");

    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}${params.toString()}`;
  });
}

function ticketBelongsToSelectedClients(ticket = {}) {
  const selectedClientes = getSelectedClientes();

  if (!selectedClientes.length) return true;

  const ticketClienteId = safeText(ticket?.clienteId, "");
  const ticketUserId = safeText(ticket?.userId, "");

  if (!ticketClienteId && !ticketUserId) return true;

  return selectedClientes.some((client) => {
    const clienteId = safeText(first(client.clienteId, client.id), "");
    const userId = safeText(client.userId, "");

    return (
      (clienteId && ticketClienteId === clienteId) ||
      (userId && ticketUserId === userId)
    );
  });
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

    if (!ticketBelongsToSelectedClients(normalized)) return;

    if (!map.has(normalized.id)) {
      map.set(normalized.id, normalized);
    }
  });

  return sortTicketsByLatest(Array.from(map.values())).slice(0, TICKET_LIMIT);
}

async function searchTicketsRequest(query = "") {
  const selectedClientes = getSelectedClientes();
  const searchTargets = selectedClientes.length ? selectedClientes : [null];

  let lastError = null;
  let collected = [];

  for (const cliente of searchTargets) {
    const urls = buildTicketSearchUrlsForClient(query, cliente);

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

function setSelectedTicketFromItem(item = null, { auto = false, append = true } = {}) {
  const normalized = normalizeTicketCandidate(item) || safeObject(item);
  const id = safeText(first(normalized.id, normalized.ticketId, normalized.incidenciaId), "");

  if (!id) return false;

  if (append) {
    const exists = hasSelectedTicket(normalized);

    if (!exists) {
      modalState.selectedTickets = [
        ...getSelectedTickets(),
        {
          ...normalized,
          id,
          ticketId: normalized.ticketId || id,
          incidenciaId: normalized.incidenciaId || id,
        },
      ];
    }
  } else {
    modalState.selectedTickets = [
      {
        ...normalized,
        id,
        ticketId: normalized.ticketId || id,
        incidenciaId: normalized.incidenciaId || id,
      },
    ];
  }

  modalState.ticketAutoSelected = Boolean(auto);
  syncPrimaryTicketToForm();

  if (modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  return true;
}

function autoSelectLatestTicketIfPossible({ force = false } = {}) {
  if (getSelectedTickets().length && !force) return false;

  const latest = safeArray(modalState.ticketSearchResults)[0];

  if (!latest?.id) {
    modalState.selectedTickets = [];
    syncPrimaryTicketToForm();
    return false;
  }

  modalState.selectedTickets = [];

  return setSelectedTicketFromItem(latest, {
    auto: true,
    append: true,
  });
}

async function loadTicketsForSelectedClient({
  query = "",
  autoSelectLatest = true,
  focus = "ticketSearch",
} = {}) {
  if (!getSelectedClientes().length) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];
    modalState.ticketAutoSelected = false;
    modalState.selectedTickets = [];

    syncPrimaryTicketToForm();

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
    modalState.selectedTickets = [];
    syncPrimaryTicketToForm();
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
    modalState.selectedTickets = [];

    syncPrimaryTicketToForm();

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

  if (!getSelectedClientes().length) {
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

  modalState.selectedClientes = [];
  modalState.selectedTickets = [];
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

function getInvoiceBreakdown(form = {}) {
  const current = safeObject(form);

  const cantidad = safeNumber(current.cantidad, 0);
  const precioUnitario = safeNumber(current.precioUnitario, 0);

  const base = round2(cantidad * precioUnitario);

  const ivaRate = safeNumber(current.porcentajeIVA, DEFAULT_IVA_RATE);
  const irpfRate = safeNumber(current.porcentajeIRPF, DEFAULT_IRPF_RATE);

  const ivaTotal = round2(base * (ivaRate / 100));
  const irpfTotal = round2(-(base * (irpfRate / 100)));
  const totalFactura = round2(base + ivaTotal + irpfTotal);

  return {
    cantidad,
    precioUnitario,
    base,
    ivaRate,
    irpfRate,
    ivaTotal,
    irpfTotal,
    totalFactura,
  };
}

function getFormTotal(form = {}) {
  return getInvoiceBreakdown(form).totalFactura;
}

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const selectedClientes = getSelectedClientes();
  const selectedTickets = getSelectedTickets();

  const concepto = normalizeWhitespace(current.concepto);
  const descripcion = normalizeWhitespace(current.descripcion);

  const cantidad = safeNumber(current.cantidad, 0);
  const precioUnitario = safeNumber(current.precioUnitario, 0);

  if (!selectedClientes.length) {
    errors.clienteId = "Selecciona al menos un cliente.";
  }

  if (!selectedTickets.length) {
    errors.incidenciaId = "Selecciona al menos una incidencia vinculada.";
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

function buildClientePayload(cliente = null) {
  const item = normalizeClientCandidate(cliente) || safeObject(cliente);

  const clienteId = safeText(first(item.clienteId, item.id), "");
  const userId = safeText(item.userId, "");

  const name = safeText(first(item.name, item.nombreContacto, item.nombre), "");
  const razonSocial = safeText(first(item.razonSocial, item.empresa, name), name);
  const email = safeText(item.email, "").toLowerCase();
  const telefono = safeText(first(item.telefono, item.phone), "");
  const nif = safeText(item.nif, "");
  const username = safeText(first(item.username, email ? email.split("@")[0] : ""), "");
  const avatarUrl = safeText(first(item.avatarUrl, item.avatar), "");

  return {
    clienteIdInterno: clienteId,
    numeroCliente: clienteId.replace(/^CON-/i, ""),
    numeroClienteLegacy: clienteId,
    id: clienteId,
    clienteId,
    userId,

    tipo: "empresa",

    razonSocial,
    empresa: razonSocial,
    nombreFiscal: razonSocial,

    nombreContacto: name,
    nombre: name,
    name,
    displayName: name,

    email: email || undefined,
    emailLower: email || undefined,
    username: username || undefined,

    phone: telefono || undefined,
    telefono: telefono || undefined,

    nif: nif || undefined,

    avatar: avatarUrl || undefined,
    avatarUrl: avatarUrl || undefined,
    logo: avatarUrl || undefined,
    logoUrl: avatarUrl || undefined,

    direccion: safeObject(item.direccion, {}),
  };
}

function buildCreatePayload(form = {}) {
  const current = safeObject(form);
  const breakdown = getInvoiceBreakdown(current);

  const selectedClientes = getSelectedClientes();
  const selectedTickets = getSelectedTickets();

  const primaryCliente = selectedClientes[0] || normalizeClientCandidate({
    clienteId: current.clienteId,
    userId: current.clienteUserId,
    name: current.clienteNombre,
    nombreContacto: current.clienteNombre,
    email: current.clienteEmail,
    avatarUrl: current.clienteAvatar,
  });

  const primaryTicket = selectedTickets[0] || normalizeTicketCandidate({
    id: first(current.ticketId, current.incidenciaId),
    ticketId: first(current.ticketId, current.incidenciaId),
    incidenciaId: first(current.ticketId, current.incidenciaId),
    subject: current.incidenciaSubject,
  });

  const clientePayloads = selectedClientes.length
    ? selectedClientes.map(buildClientePayload)
    : [buildClientePayload(primaryCliente)].filter((item) => item?.clienteId);

  const primaryClientePayload = buildClientePayload(primaryCliente);

  const clienteId = safeText(primaryClientePayload.clienteId, "");
  const userId = safeText(primaryClientePayload.userId, "");
  const clienteNombre = safeText(primaryClientePayload.name, "");
  const clienteEmail = safeText(primaryClientePayload.email, "").toLowerCase();
  const clienteAvatar = safeText(first(primaryClientePayload.avatarUrl, primaryClientePayload.avatar), "");

  const clienteIds = compactUnique(clientePayloads.map((item) => item.clienteId));
  const userIds = compactUnique(clientePayloads.map((item) => item.userId));

  const ticketId = safeText(first(primaryTicket?.ticketId, primaryTicket?.incidenciaId, primaryTicket?.id), "");
  const incidenciaSubject = safeText(first(primaryTicket?.subject, primaryTicket?.asunto, current.incidenciaSubject, ticketId), ticketId);

  const ticketIds = compactUnique(
    selectedTickets.length
      ? selectedTickets.map((item) => first(item.ticketId, item.incidenciaId, item.id))
      : [ticketId]
  );

  const ticketsPayload = selectedTickets.length
    ? selectedTickets.map((ticket) => ({
        id: ticket.id,
        ticketId: ticket.ticketId || ticket.id,
        incidenciaId: ticket.incidenciaId || ticket.id,
        subject: ticket.subject || ticket.asunto || ticket.id,
        asunto: ticket.subject || ticket.asunto || ticket.id,
        clienteId: ticket.clienteId || clienteId,
        userId: ticket.userId || userId,
        relationType: "linked_ticket",
      }))
    : [
        {
          id: ticketId,
          ticketId,
          incidenciaId: ticketId,
          subject: incidenciaSubject,
          asunto: incidenciaSubject,
          clienteId,
          userId,
          relationType: "linked_ticket",
        },
      ].filter((item) => item.id);

  const fechaServicio = safeText(current.fechaServicio, todayInputValue());

  const concepto = normalizeWhitespace(current.concepto);
  const descripcion = normalizeWhitespace(current.descripcion);

  const estadoPago = safeText(current.estadoPago, "pendiente");
  const paymentStatus = normalizeText(estadoPago) === "pagada" ? "paid" : "pending";

  const paidAmount = paymentStatus === "paid" ? breakdown.totalFactura : 0;
  const pendingAmount = paymentStatus === "paid" ? 0 : breakdown.totalFactura;

  const direccionServicio = safeObject(primaryClientePayload.direccion, {});

  return {
    entityType: "invoice",
    tipoDocumento: "factura",
    schemaVersion: 3,
    versionEsquema: 3,

    source: "admin_panel",
    origen: "admin_panel",
    createdFrom: "facturas_create_modal",

    clienteId,
    userId,

    clienteIds,
    userIds,
    clientes: clientePayloads,

    clienteRef: {
      container: "clientes",
      id: clienteId,
      clienteId,
      partitionKey: clienteId,
    },

    clienteRefs: clientePayloads.map((cliente) => ({
      container: "clientes",
      id: cliente.clienteId,
      clienteId: cliente.clienteId,
      partitionKey: cliente.clienteId,
    })),

    userRef: {
      container: "usuarios",
      id: userId,
      userId,
      partitionKey: userId,
    },

    userRefs: userIds.map((id) => ({
      container: "usuarios",
      id,
      userId: id,
      partitionKey: id,
    })),

    tipoFactura: "ordinaria",
    clienteTipo: "empresa",

    estado: "emitida",
    estadoFactura: "emitida",
    estadoPago,
    paymentStatus,

    fechaServicio,
    fechaTrabajo: fechaServicio,
    serviceDate: fechaServicio,

    moneda: "EUR",
    currency: "EUR",

    aplicaIVA: true,
    porcentajeIVA: breakdown.ivaRate,
    aplicaIRPF: true,
    porcentajeIRPF: breakdown.irpfRate,

    formaPago: safeText(current.formaPago, "transferencia bancaria"),
    metodoPago: safeText(current.formaPago, "transferencia bancaria"),

    clienteNombre,
    clienteEmail,
    emailCliente: clienteEmail || undefined,
    clienteAvatar: clienteAvatar || undefined,
    avatarUrl: clienteAvatar || undefined,

    cliente: primaryClientePayload,

    clienteSnapshot: {
      id: clienteId,
      clienteId,
      userId,
      name: clienteNombre,
      razonSocial: primaryClientePayload.razonSocial,
      email: clienteEmail || undefined,
      phone: primaryClientePayload.phone || undefined,
      telefono: primaryClientePayload.telefono || undefined,
      tipo: "empresa",
      nif: primaryClientePayload.nif || undefined,
    },

    clientesSnapshot: clientePayloads.map((cliente) => ({
      id: cliente.clienteId,
      clienteId: cliente.clienteId,
      userId: cliente.userId,
      name: cliente.name,
      razonSocial: cliente.razonSocial,
      email: cliente.email,
      phone: cliente.phone,
      telefono: cliente.telefono,
      tipo: "empresa",
      nif: cliente.nif,
    })),

    direccionServicio,

    ticketId,
    incidenciaId: ticketId,
    supportTicketId: ticketId,
    relatedTicketId: ticketId,
    relatedIncidentId: ticketId,

    ticketIds,
    incidenciaIds: ticketIds,
    supportTicketIds: ticketIds,
    relatedTicketIds: ticketIds,
    relatedIncidentIds: ticketIds,

    relationType: "linked_ticket",

    incidenciaSubject,
    ticketSubject: incidenciaSubject,
    asunto: incidenciaSubject,

    incidencia: ticketsPayload[0] || null,
    ticket: ticketsPayload[0] || null,
    incidencias: ticketsPayload,
    tickets: ticketsPayload,

    relations: {
      user: {
        container: "usuarios",
        id: userId,
        userId,
        partitionKey: userId,
      },
      cliente: {
        container: "clientes",
        id: clienteId,
        clienteId,
        partitionKey: clienteId,
      },
      ticket: {
        container: "tickets",
        id: ticketId,
        ticketId,
        partitionKey: ticketId,
      },
      incidencia: {
        container: "tickets",
        id: ticketId,
        ticketId,
        partitionKey: ticketId,
      },
      users: userIds.map((id) => ({
        container: "usuarios",
        id,
        userId: id,
        partitionKey: id,
      })),
      clientes: clienteIds.map((id) => ({
        container: "clientes",
        id,
        clienteId: id,
        partitionKey: id,
      })),
      tickets: ticketIds.map((id) => ({
        container: "tickets",
        id,
        ticketId: id,
        partitionKey: id,
      })),
      incidencias: ticketIds.map((id) => ({
        container: "tickets",
        id,
        ticketId: id,
        partitionKey: id,
      })),
    },

    concepto,
    descripcion,
    description: descripcion,
    preview: descripcion || concepto,

    cantidad: breakdown.cantidad,
    horas: breakdown.cantidad,
    precioUnitario: breakdown.precioUnitario,

    lineas: [
      {
        id: "linea-1",
        lineNumber: 1,
        concepto,
        descripcion,
        cantidad: breakdown.cantidad,
        horas: breakdown.cantidad,
        unidad: "h",
        precioUnitario: breakdown.precioUnitario,

        subtotal: breakdown.base,
        base: breakdown.base,
        baseImponible: breakdown.base,
        totalLinea: breakdown.base,
        total: breakdown.base,
        importe: breakdown.base,

        iva: {
          porcentaje: breakdown.ivaRate,
          importe: breakdown.ivaTotal,
        },

        irpf: {
          porcentaje: breakdown.irpfRate,
          importe: breakdown.irpfTotal,
        },

        totalConImpuestos: breakdown.totalFactura,
      },
    ],

    baseImponible: breakdown.base,
    subtotal: breakdown.base,
    descuentoTotal: 0,

    impuestos: [
      {
        tipo: "IVA",
        nombre: "IVA",
        porcentaje: breakdown.ivaRate,
        base: breakdown.base,
        importe: breakdown.ivaTotal,
      },
      {
        tipo: "IRPF",
        nombre: "IRPF",
        porcentaje: breakdown.irpfRate,
        base: breakdown.base,
        importe: breakdown.irpfTotal,
      },
    ],

    retenciones: [
      {
        tipo: "IRPF",
        nombre: "IRPF",
        porcentaje: breakdown.irpfRate,
        base: breakdown.base,
        importe: Math.abs(breakdown.irpfTotal),
      },
    ],

    iva: breakdown.ivaTotal,
    ivaTotal: breakdown.ivaTotal,

    irpf: Math.abs(breakdown.irpfTotal),
    irpfTotal: breakdown.irpfTotal,

    retencionesTotal: Math.abs(breakdown.irpfTotal),
    retencionesImporte: breakdown.irpfTotal,

    impuestosTotal: round2(breakdown.ivaTotal + breakdown.irpfTotal),

    total: breakdown.totalFactura,
    totalFactura: breakdown.totalFactura,
    amount: breakdown.totalFactura,
    importe: breakdown.totalFactura,
    importeTotal: breakdown.totalFactura,

    paidAmount,
    pendingAmount,

    payment: {
      status: paymentStatus,
      estadoPago,
      method: safeText(current.formaPago, "transferencia bancaria"),
      formaPago: safeText(current.formaPago, "transferencia bancaria"),
      paidAt: null,
      paidAtES: null,
      paidDateKnown: false,
      paidAmount,
      pendingAmount,
      currency: "EUR",
    },

    delivery: {
      sent: parseBoolean(current.sendEmail, true),
      sentAt: null,
      sentAtES: null,
      sentTo: clienteEmail || undefined,
      sentToAll: clientePayloads.map((cliente) => cliente.email).filter(Boolean),
      channel: "email",
    },

    sendEmail: parseBoolean(current.sendEmail, true),

    search: {
      text: [
        clienteId,
        userId,
        ...clienteIds,
        ...userIds,
        ticketId,
        ...ticketIds,
        clienteNombre,
        primaryClientePayload.razonSocial,
        clienteEmail,
        primaryClientePayload.nif,
        concepto,
        descripcion,
        estadoPago,
        safeText(current.formaPago, "transferencia bancaria"),
        `${breakdown.totalFactura.toFixed(2)} EUR`,
      ]
        .filter(Boolean)
        .join(" "),
      normalizedEmail: clienteEmail,
      normalizedName: normalizeText(clienteNombre),
      normalizedRazonSocial: normalizeText(primaryClientePayload.razonSocial),
      normalizedClienteId: clienteId,
      normalizedUserId: userId,
      normalizedTicketId: ticketId,
      normalizedClienteIds: clienteIds.map(normalizeText),
      normalizedUserIds: userIds.map(normalizeText),
      normalizedTicketIds: ticketIds.map(normalizeText),
    },

    meta: {
      schemaVersion: 3,
      isInvoice: true,
      isPaid: paymentStatus === "paid",
      isPending: paymentStatus !== "paid",
      isSent: parseBoolean(current.sendEmail, true),
      isLinkedToTicket: Boolean(ticketId),
      hasIRPF: true,
      hasIVA: true,
      ivaRate: breakdown.ivaRate,
      irpfRate: breakdown.irpfRate,
      paymentDateMissing: true,
      visibleInInvoiceList: true,
      doNotShowInInvoiceList: false,
      source: "facturas_create_modal",
      linkedTicketSubject: incidenciaSubject,
      systemNumberGenerated: true,
      hasTicket: Boolean(ticketId),
      hasIncidencia: Boolean(ticketId),
      hasLinkedTicket: Boolean(ticketId),
      ticketId,
      incidenciaId: ticketId,
      ticketIds,
      incidenciaIds: ticketIds,
      hasMultipleClients: clienteIds.length > 1,
      hasMultipleTickets: ticketIds.length > 1,
      selectedClientsCount: clienteIds.length,
      selectedTicketsCount: ticketIds.length,
    },
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

  const breakdown = getInvoiceBreakdown(modalState.form);

  const totalInline = root.querySelector('[data-role="total-preview-inline"]');
  if (totalInline) {
    totalInline.textContent = formatMoney(breakdown.totalFactura);
  }

  const baseInline = root.querySelector('[data-role="base-preview-inline"]');
  if (baseInline) {
    baseInline.textContent = formatMoney(breakdown.base);
  }

  const taxInline = root.querySelector('[data-role="tax-preview-inline"]');
  if (taxInline) {
    taxInline.textContent = `${formatMoney(breakdown.ivaTotal)} / ${formatMoney(breakdown.irpfTotal)}`;
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

/* =========================================================
   TARGET BLOCK RENDER
========================================================= */

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
        .map((item, index) => {
          const alreadySelected = hasSelectedCliente(item);

          return `
            <button
              type="button"
              class="fac-create-search-item fac-create-search-item--client ${alreadySelected ? "is-selected" : ""}"
              data-select-cliente="${index}"
              ${modalState.submitting || alreadySelected ? "disabled" : ""}
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

              <span class="fac-create-add-pill">
                ${alreadySelected ? "Añadido" : "Añadir"}
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSelectedClientes() {
  const selected = getSelectedClientes();

  if (!selected.length) {
    return `
      <div class="fac-create-empty-pro">
        <strong>Sin clientes seleccionados</strong>
        <span>Busca y añade uno o varios clientes destino para esta factura.</span>
      </div>
    `;
  }

  return `
    <div class="fac-create-selected-stack">
      ${selected
        .map((item, index) => {
          const name = safeText(first(item.name, item.nombreContacto, item.razonSocial), "Cliente");
          const email = safeText(item.email, "");
          const clienteId = safeText(first(item.clienteId, item.id), "");
          const avatarUrl = safeText(first(item.avatarUrl, item.avatar), "");
          const isPrimary = index === 0;

          return `
            <div class="fac-create-selected-card fac-create-selected-card--client ${isPrimary ? "is-primary" : ""}">
              <div class="fac-create-selected-main">
                ${renderAvatar({
                  name,
                  email,
                  avatarUrl,
                  fallback: "CL",
                  className: "fac-create-avatar fac-create-avatar--selected",
                })}

                <div class="fac-create-selected-copy">
                  <span>${isPrimary ? "Cliente principal" : "Cliente adicional"}</span>
                  <strong>${escapeHtml(name)}</strong>
                  <small>${escapeHtml(email || clienteId)}</small>
                </div>
              </div>

              <div class="fac-create-selected-actions">
                ${
                  !isPrimary
                    ? `
                      <button
                        type="button"
                        class="fac-create-icon-button"
                        data-primary-cliente="${index}"
                        ${modalState.submitting ? "disabled" : ""}
                      >
                        Principal
                      </button>
                    `
                    : ""
                }

                <button
                  type="button"
                  class="fac-create-icon-button is-danger"
                  data-remove-cliente="${index}"
                  ${modalState.submitting ? "disabled" : ""}
                  aria-label="Quitar cliente"
                >
                  Quitar
                </button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSelectedTickets() {
  const selected = getSelectedTickets();

  if (!getSelectedClientes().length) {
    return `
      <div class="fac-create-empty-pro is-locked">
        <strong>Selecciona primero cliente</strong>
        <span>Después se cargarán incidencias compatibles automáticamente.</span>
      </div>
    `;
  }

  if (!selected.length) {
    return `
      <div class="fac-create-empty-pro">
        <strong>Sin incidencias seleccionadas</strong>
        <span>Selecciona una o varias incidencias para vincularlas a la factura.</span>
      </div>
    `;
  }

  return `
    <div class="fac-create-selected-stack">
      ${selected
        .map((item, index) => {
          const id = safeText(first(item.id, item.ticketId, item.incidenciaId), "");
          const subject = safeText(first(item.subject, item.asunto), id);
          const isPrimary = index === 0;

          return `
            <div class="fac-create-selected-card fac-create-selected-card--ticket ${isPrimary ? "is-primary" : ""}">
              <div class="fac-create-selected-main">
                <div class="fac-create-ticket-badge" aria-hidden="true">
                  <span>I</span>
                </div>

                <div class="fac-create-selected-copy">
                  <span>${isPrimary ? "Incidencia principal" : "Incidencia adicional"}</span>
                  <strong>${escapeHtml(id)}</strong>
                  <small>${escapeHtml(subject)}</small>
                </div>
              </div>

              <div class="fac-create-selected-actions">
                ${
                  !isPrimary
                    ? `
                      <button
                        type="button"
                        class="fac-create-icon-button"
                        data-primary-ticket="${index}"
                        ${modalState.submitting ? "disabled" : ""}
                      >
                        Principal
                      </button>
                    `
                    : ""
                }

                <button
                  type="button"
                  class="fac-create-icon-button is-danger"
                  data-remove-ticket="${index}"
                  ${modalState.submitting ? "disabled" : ""}
                  aria-label="Quitar incidencia"
                >
                  Quitar
                </button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTicketSearchResults() {
  const query = safeText(modalState.ticketSearchQuery, "");
  const loading = Boolean(modalState.ticketSearchLoading);
  const error = safeText(modalState.ticketSearchError, "");
  const results = safeArray(modalState.ticketSearchResults);

  if (!getSelectedClientes().length) return "";

  if (loading) {
    return `<div class="fac-create-search-state">Cargando incidencias...</div>`;
  }

  if (error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(error)}</div>`;
  }

  if (!results.length) {
    return `<div class="fac-create-search-state">Sin incidencias disponibles para los clientes seleccionados.</div>`;
  }

  const visibleResults = query
    ? results
    : results.slice(0, 6);

  return `
    <div class="fac-create-ticket-list">
      ${visibleResults
        .map((item, index) => {
          const realIndex = results.findIndex((ticket) => ticket.id === item.id);
          const safeIndex = realIndex >= 0 ? realIndex : index;
          const selected = hasSelectedTicket(item);

          return `
            <button
              type="button"
              class="fac-create-ticket-option ${selected ? "is-selected" : ""}"
              data-select-ticket="${safeIndex}"
              ${modalState.submitting || selected ? "disabled" : ""}
            >
              <span class="fac-create-ticket-mini-badge" aria-hidden="true">I</span>

              <span class="fac-create-ticket-option-copy">
                <strong>${escapeHtml(item.id)} · ${escapeHtml(item.subject)}</strong>
                <small>${escapeHtml(item.subtitle || item.clienteId || item.id)}</small>
              </span>

              <span class="fac-create-add-pill">
                ${selected ? "Vinculada" : "Vincular"}
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTargetBlock() {
  const errors = safeObject(modalState.errors);

  const clienteCount = getSelectedClientes().length;
  const ticketCount = getSelectedTickets().length;

  const ticketLoading = Boolean(modalState.ticketSearchLoading);

  return `
    <section class="fac-create-target fac-create-target--pro">
      <div class="fac-create-target-head fac-create-target-head--pro">
        <div class="fac-create-target-title-block">
          <span>Destino de facturación</span>
          <h3>Clientes e incidencias</h3>
          <p>
            Puedes facturar contra un cliente principal, añadir clientes destino extra
            y vincular una o varias incidencias reales.
          </p>
        </div>

        <div class="fac-create-target-metrics">
          <div>
            <strong>${escapeHtml(String(clienteCount))}</strong>
            <span>Clientes</span>
          </div>
          <div>
            <strong>${escapeHtml(String(ticketCount))}</strong>
            <span>Incidencias</span>
          </div>
        </div>
      </div>

      <div class="fac-create-pro-grid">
        <article class="fac-create-pro-card fac-create-pro-card--clients">
          <div class="fac-create-pro-card-head">
            <div>
              <span>Clientes destino</span>
              <strong>Selecciona uno o varios</strong>
            </div>
            ${
              clienteCount
                ? `
                  <button
                    type="button"
                    class="fac-create-mini-button"
                    data-clear-clientes="true"
                    ${modalState.submitting ? "disabled" : ""}
                  >
                    Limpiar clientes
                  </button>
                `
                : ""
            }
          </div>

          ${renderSelectedClientes()}

          ${renderFieldError(errors.clienteId)}

          <label class="fac-create-field fac-create-field--search">
            <span class="fac-create-label">${clienteCount ? "Añadir otro cliente" : "Buscar cliente"}</span>
            <input
              class="fac-create-input ${errors.clienteId ? "is-error" : ""}"
              data-field="clienteSearch"
              name="clienteSearch"
              type="text"
              value="${escapeHtml(modalState.clienteSearchQuery)}"
              placeholder="Buscar por nombre, email, empresa o usuario..."
              autocomplete="off"
              ${modalState.submitting ? "disabled" : ""}
            />
          </label>

          ${renderClientSearchResults()}
        </article>

        <article class="fac-create-pro-card fac-create-pro-card--tickets">
          <div class="fac-create-pro-card-head">
            <div>
              <span>Incidencias vinculadas</span>
              <strong>Una o varias referencias</strong>
            </div>

            <button
              type="button"
              class="fac-create-mini-button"
              data-refresh-tickets="true"
              ${modalState.submitting || ticketLoading || !clienteCount ? "disabled" : ""}
            >
              ${ticketLoading ? "Cargando..." : "Recargar"}
            </button>
          </div>

          ${renderSelectedTickets()}

          ${renderFieldError(errors.incidenciaId)}

          <label class="fac-create-field fac-create-field--search">
            <span class="fac-create-label">Filtrar incidencias</span>
            <input
              class="fac-create-input"
              data-field="ticketSearch"
              name="ticketSearch"
              type="text"
              value="${escapeHtml(modalState.ticketSearchQuery)}"
              placeholder="Filtrar por código, asunto, estado..."
              autocomplete="off"
              ${modalState.submitting || ticketLoading || !clienteCount ? "disabled" : ""}
            />
          </label>

          ${renderTicketSearchResults()}
        </article>
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
        <small>Generando documento, relación, PDF y envío</small>
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
  const breakdown = getInvoiceBreakdown(form);

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
            <span class="fac-create-kicker">Facturación admin</span>
            <h2 id="facturas-create-modal-title">Crear factura</h2>
            <p>
              Genera una factura vinculada a clientes e incidencias reales.
              El backend resolverá numeración legal, PDF, Blob, auditoría y envío.
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

            <div class="fac-create-total-strip">
              <div>
                <span>Base imponible</span>
                <strong data-role="base-preview-inline">${escapeHtml(formatMoney(breakdown.base))}</strong>
              </div>
              <div>
                <span>IVA / IRPF</span>
                <strong data-role="tax-preview-inline">${escapeHtml(`${formatMoney(breakdown.ivaTotal)} / ${formatMoney(breakdown.irpfTotal)}`)}</strong>
              </div>
              <div class="is-total">
                <span>Total estimado</span>
                <strong data-role="total-preview-inline">${escapeHtml(formatMoney(breakdown.totalFactura))}</strong>
              </div>
            </div>

            ${renderTargetBlock()}

            ${renderCheckbox({
              label: "Enviar email al cliente",
              name: "sendEmail",
              checked: parseBoolean(form.sendEmail, true),
              help: "Adjunta el PDF generado y utiliza el envío configurado para facturas.",
            })}

            <div class="fac-create-actions">
              <div class="fac-create-submit-summary">
                <span>Factura preparada</span>
                <strong data-role="total-preview-inline">${escapeHtml(formatMoney(breakdown.totalFactura))}</strong>
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
   STYLES
========================================================= */

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
        background:rgba(10,14,24,.42);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
      }

      .fac-create-panel{
        position:relative;
        width:min(1040px, 100%);
        max-height:92vh;
        overflow:auto;
        border-radius:30px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),
          radial-gradient(circle at 92% 3%, rgba(255,255,255,.13), transparent 30%),
          linear-gradient(180deg, var(--surface-2, #171717), var(--surface-1, #111));
        box-shadow:
          0 38px 96px rgba(0,0,0,.44),
          0 1px 0 rgba(255,255,255,.055) inset;
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
        background:color-mix(in srgb, var(--surface-1, #111) 84%, transparent);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
      }

      .fac-create-loading-card{
        display:grid;
        justify-items:center;
        gap:10px;
        padding:25px 30px;
        border-radius:22px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
          var(--surface-2, #171717);
        box-shadow:0 30px 76px rgba(0,0,0,.36);
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
        width:34px;
        height:34px;
        border-width:3px;
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
        border-top-color:var(--accent, #7c5cff);
      }

      .fac-create-header{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        padding:26px 26px 19px;
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.10));
      }

      .fac-create-header-copy{
        display:grid;
        gap:8px;
        min-width:0;
      }

      .fac-create-kicker{
        width:max-content;
        padding:6px 10px;
        border-radius:999px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
        color:var(--text-soft, rgba(255,255,255,.76));
        font-size:10px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .fac-create-header-copy h2{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:clamp(32px, 4vw, 46px);
        line-height:.94;
        letter-spacing:-.065em;
      }

      .fac-create-header-copy p{
        max-width:760px;
        margin:0;
        color:var(--text-dim, rgba(255,255,255,.64));
        font-size:13px;
        line-height:1.62;
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
        gap:15px;
        padding:19px 26px 26px;
      }

      .fac-create-form{
        display:grid;
        gap:15px;
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

      .fac-create-field{
        display:grid;
        gap:7px;
        min-width:0;
      }

      .fac-create-field--search{
        margin-top:2px;
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

      .fac-create-label{
        color:var(--text-soft, rgba(255,255,255,.74));
        font-size:11px;
        font-weight:900;
        letter-spacing:.07em;
        text-transform:uppercase;
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
        font-weight:800;
      }

      .fac-create-total-strip{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:10px;
        padding:12px;
        border-radius:22px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 13%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #7c5cff) 9%, transparent), transparent 38%),
          var(--surface-glass, rgba(255,255,255,.045));
      }

      .fac-create-total-strip > div{
        display:grid;
        gap:5px;
        padding:13px 14px;
        border-radius:17px;
        border:1px solid var(--border-soft, rgba(255,255,255,.10));
        background:color-mix(in srgb, var(--surface-1, #111) 68%, transparent);
      }

      .fac-create-total-strip span{
        color:var(--text-dim, rgba(255,255,255,.58));
        font-size:10px;
        font-weight:900;
        letter-spacing:.07em;
        text-transform:uppercase;
      }

      .fac-create-total-strip strong{
        color:var(--text-strong, #fff);
        font-size:15px;
        line-height:1.1;
        letter-spacing:-.03em;
      }

      .fac-create-total-strip .is-total{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.10)));
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 13%, transparent), transparent),
          color-mix(in srgb, var(--surface-1, #111) 72%, transparent);
      }

      .fac-create-total-strip .is-total strong{
        font-size:19px;
      }

      .fac-create-target{
        display:grid;
        gap:15px;
        padding:16px;
        border-radius:26px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 17%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 42%),
          radial-gradient(circle at 100% 4%, rgba(255,255,255,.08), transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 5%, transparent), transparent),
          var(--surface-glass, rgba(255,255,255,.04));
        box-shadow:
          0 18px 42px rgba(0,0,0,.10),
          inset 0 1px 0 rgba(255,255,255,.045);
      }

      .fac-create-target-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }

      .fac-create-target-title-block{
        display:grid;
        gap:5px;
        min-width:0;
      }

      .fac-create-target-title-block > span,
      .fac-create-pro-card-head span{
        color:var(--text-soft, rgba(255,255,255,.74));
        font-size:11px;
        font-weight:900;
        letter-spacing:.07em;
        text-transform:uppercase;
      }

      .fac-create-target-title-block h3{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:22px;
        line-height:1.08;
        letter-spacing:-.04em;
      }

      .fac-create-target-title-block p{
        max-width:700px;
        margin:0;
        color:var(--text-dim, rgba(255,255,255,.60));
        font-size:12px;
        line-height:1.56;
      }

      .fac-create-target-metrics{
        display:flex;
        gap:8px;
        flex:0 0 auto;
      }

      .fac-create-target-metrics > div{
        display:grid;
        justify-items:center;
        gap:2px;
        min-width:82px;
        padding:10px 12px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.10));
        background:color-mix(in srgb, var(--surface-1, #111) 70%, transparent);
      }

      .fac-create-target-metrics strong{
        color:var(--text-strong, #fff);
        font-size:18px;
        line-height:1;
      }

      .fac-create-target-metrics span{
        color:var(--text-dim, rgba(255,255,255,.58));
        font-size:10px;
        font-weight:900;
        letter-spacing:.06em;
        text-transform:uppercase;
      }

      .fac-create-pro-grid{
        display:grid;
        grid-template-columns:minmax(0, 1fr) minmax(0, 1.05fr);
        gap:12px;
      }

      .fac-create-pro-card{
        display:grid;
        align-content:start;
        gap:12px;
        min-width:0;
        min-height:360px;
        padding:15px;
        border-radius:22px;
        border:1px solid var(--border-soft, rgba(255,255,255,.11));
        background:
          linear-gradient(180deg, rgba(255,255,255,.045), transparent),
          color-mix(in srgb, var(--surface-1, #111) 74%, transparent);
        box-shadow:
          0 16px 34px rgba(0,0,0,.10),
          inset 0 1px 0 rgba(255,255,255,.035);
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
      }

      .fac-create-pro-card:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft, rgba(255,255,255,.11)));
        box-shadow:
          0 20px 42px rgba(0,0,0,.12),
          inset 0 1px 0 rgba(255,255,255,.045);
      }

      .fac-create-pro-card-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10px;
        min-width:0;
      }

      .fac-create-pro-card-head > div{
        display:grid;
        gap:4px;
        min-width:0;
      }

      .fac-create-pro-card-head strong{
        color:var(--text-strong, #fff);
        font-size:15px;
        line-height:1.2;
        letter-spacing:-.025em;
      }

      .fac-create-empty-pro{
        display:grid;
        gap:4px;
        min-height:82px;
        padding:15px;
        border-radius:18px;
        border:1px dashed color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft, rgba(255,255,255,.13)));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 42%),
          color-mix(in srgb, var(--surface-1, #111) 62%, transparent);
      }

      .fac-create-empty-pro strong{
        color:var(--text-soft, rgba(255,255,255,.82));
        font-size:13px;
      }

      .fac-create-empty-pro span{
        color:var(--text-dim, rgba(255,255,255,.58));
        font-size:12px;
        line-height:1.42;
      }

      .fac-create-empty-pro.is-locked{
        opacity:.88;
      }

      .fac-create-selected-stack{
        display:grid;
        gap:8px;
      }

      .fac-create-selected-card{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        align-items:center;
        gap:12px;
        min-width:0;
        padding:12px;
        border-radius:19px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 17%, var(--border-soft, rgba(255,255,255,.12)));
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 44%),
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 5%, transparent), transparent),
          var(--surface-glass, rgba(255,255,255,.05));
        box-shadow:
          0 14px 30px color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent),
          inset 0 1px 0 rgba(255,255,255,.04);
      }

      .fac-create-selected-card.is-primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 34%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent),
          inset 0 1px 0 rgba(255,255,255,.05);
      }

      .fac-create-selected-main{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr);
        align-items:center;
        gap:12px;
        min-width:0;
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

      .fac-create-selected-actions{
        display:flex;
        align-items:center;
        gap:7px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .fac-create-icon-button,
      .fac-create-mini-button{
        min-height:34px;
        padding:0 11px;
        border-radius:13px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:var(--text-soft, rgba(255,255,255,.76));
        font-size:11px;
        font-weight:900;
        cursor:pointer;
        white-space:nowrap;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease,
          opacity .18s ease;
      }

      .fac-create-mini-button{
        min-height:38px;
      }

      .fac-create-icon-button:hover,
      .fac-create-mini-button:hover{
        transform:translateY(-1px);
        background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
      }

      .fac-create-icon-button.is-danger:hover{
        background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 9%, transparent);
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft, rgba(255,255,255,.12)));
        box-shadow:0 10px 24px color-mix(in srgb, var(--danger-strong, #ff6b6b) 9%, transparent);
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

      .fac-create-search-results,
      .fac-create-ticket-list{
        display:grid;
        gap:7px;
        max-height:260px;
        overflow:auto;
        padding-right:2px;
      }

      .fac-create-search-item,
      .fac-create-ticket-option{
        width:100%;
        min-width:0;
        padding:11px 12px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:inherit;
        text-align:left;
        cursor:pointer;
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease,
          box-shadow .18s ease,
          opacity .18s ease;
      }

      .fac-create-search-item--client,
      .fac-create-ticket-option{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr) auto;
        align-items:center;
        gap:11px;
      }

      .fac-create-search-item:hover,
      .fac-create-ticket-option:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 26%, var(--border-soft, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass, rgba(255,255,255,.05)));
        box-shadow:0 12px 26px rgba(0,0,0,.08);
      }

      .fac-create-search-item.is-selected,
      .fac-create-ticket-option.is-selected{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--success-strong, #36c690) 8%, var(--surface-glass, rgba(255,255,255,.05)));
      }

      .fac-create-search-copy,
      .fac-create-ticket-option-copy{
        display:grid;
        gap:3px;
        min-width:0;
      }

      .fac-create-search-item strong,
      .fac-create-ticket-option strong{
        color:var(--text-strong, #fff);
        font-size:13px;
        line-height:1.35;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-search-item span,
      .fac-create-ticket-option small{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:11px;
        line-height:1.35;
      }

      .fac-create-search-copy > span{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .fac-create-add-pill{
        display:inline-grid;
        place-items:center;
        min-height:28px;
        padding:0 10px;
        border-radius:999px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent);
        color:var(--text-soft, rgba(255,255,255,.78)) !important;
        font-size:10px !important;
        font-weight:900;
        letter-spacing:.04em;
        text-transform:uppercase;
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
        min-width:190px;
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
        font-weight:900;
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
      .fac-create-icon-button:disabled,
      .fac-create-search-item:disabled,
      .fac-create-ticket-option:disabled,
      .fac-create-close:disabled{
        opacity:.78;
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
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          radial-gradient(circle at 95% 0%, rgba(255,255,255,.70), transparent 30%),
          linear-gradient(180deg, rgba(255,255,255,.99), rgba(248,250,255,.97));
        box-shadow:
          0 28px 72px rgba(15,23,42,.14),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .fac-create-header-copy h2,
      [data-theme="light"] .fac-create-target-title-block h3,
      [data-theme="light"] .fac-create-pro-card-head strong,
      [data-theme="light"] .fac-create-alert strong,
      [data-theme="light"] .fac-create-input,
      [data-theme="light"] .fac-create-textarea,
      [data-theme="light"] .fac-create-select,
      [data-theme="light"] .fac-create-search-item strong,
      [data-theme="light"] .fac-create-ticket-option strong,
      [data-theme="light"] .fac-create-selected-copy strong,
      [data-theme="light"] .fac-create-check strong,
      [data-theme="light"] .fac-create-submit-summary strong,
      [data-theme="light"] .fac-create-total-strip strong,
      [data-theme="light"] .fac-create-empty-pro strong,
      [data-theme="light"] .fac-create-target-metrics strong{
        color:var(--text-strong, #111827);
      }

      [data-theme="light"] .fac-create-header-copy p,
      [data-theme="light"] .fac-create-target-title-block p,
      [data-theme="light"] .fac-create-alert span,
      [data-theme="light"] .fac-create-label,
      [data-theme="light"] .fac-create-kicker,
      [data-theme="light"] .fac-create-target-title-block > span,
      [data-theme="light"] .fac-create-pro-card-head span,
      [data-theme="light"] .fac-create-search-state,
      [data-theme="light"] .fac-create-search-item span,
      [data-theme="light"] .fac-create-ticket-option small,
      [data-theme="light"] .fac-create-selected-copy span,
      [data-theme="light"] .fac-create-selected-copy small,
      [data-theme="light"] .fac-create-check small,
      [data-theme="light"] .fac-create-submit-summary,
      [data-theme="light"] .fac-create-submit-summary span,
      [data-theme="light"] .fac-create-total-strip span,
      [data-theme="light"] .fac-create-empty-pro span,
      [data-theme="light"] .fac-create-target-metrics span{
        color:var(--text-dim, #6b7280);
      }

      [data-theme="light"] .fac-create-close,
      [data-theme="light"] .fac-create-target,
      [data-theme="light"] .fac-create-pro-card,
      [data-theme="light"] .fac-create-alert,
      [data-theme="light"] .fac-create-input,
      [data-theme="light"] .fac-create-textarea,
      [data-theme="light"] .fac-create-select,
      [data-theme="light"] .fac-create-search-state,
      [data-theme="light"] .fac-create-search-item,
      [data-theme="light"] .fac-create-ticket-option,
      [data-theme="light"] .fac-create-selected-card,
      [data-theme="light"] .fac-create-check,
      [data-theme="light"] .fac-create-mini-button,
      [data-theme="light"] .fac-create-icon-button,
      [data-theme="light"] .fac-create-submit-summary,
      [data-theme="light"] .fac-create-empty-pro,
      [data-theme="light"] .fac-create-total-strip,
      [data-theme="light"] .fac-create-total-strip > div,
      [data-theme="light"] .fac-create-target-metrics > div{
        background:rgba(255,255,255,.76);
        border-color:rgba(15,23,42,.08);
      }

      [data-theme="light"] .fac-create-pro-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.86), rgba(255,255,255,.62));
      }

      [data-theme="light"] .fac-create-total-strip .is-total{
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent),
          rgba(255,255,255,.82);
      }

      @media (max-width: 920px){
        .fac-create-pro-grid,
        .fac-create-grid--2,
        .fac-create-grid--3,
        .fac-create-total-strip{
          grid-template-columns:1fr;
        }

        .fac-create-target-head{
          flex-direction:column;
        }

        .fac-create-target-metrics{
          width:100%;
        }

        .fac-create-target-metrics > div{
          flex:1;
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

        .fac-create-selected-card{
          grid-template-columns:1fr;
        }

        .fac-create-selected-actions{
          justify-content:flex-start;
        }
      }

      @media (max-width: 560px){
        .fac-create-overlay{
          padding:8px;
        }

        .fac-create-panel{
          border-radius:24px;
          max-height:96vh;
        }

        .fac-create-header,
        .fac-create-body{
          padding-inline:16px;
        }

        .fac-create-search-item--client,
        .fac-create-ticket-option{
          grid-template-columns:auto minmax(0, 1fr);
        }

        .fac-create-add-pill{
          grid-column:1 / -1;
          justify-self:start;
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
  if (errors.incidenciaId && focusField("ticketSearch")) return true;
  if (errors.concepto && focusField("concepto")) return true;
  if (errors.descripcion && focusField("descripcion")) return true;
  if (errors.cantidad && focusField("cantidad")) return true;
  if (errors.precioUnitario && focusField("precioUnitario")) return true;

  focusPanel();
  return false;
}

/* =========================================================
   DRAFT NORMALIZATION
========================================================= */

function buildDraftClientes(draft = {}) {
  const normalizedDraft = safeObject(draft);
  const collected = [];

  safeArray(normalizedDraft.clientes).forEach((item) => {
    const normalized = normalizeClientCandidate(item);
    if (normalized?.id) collected.push(normalized);
  });

  safeArray(normalizedDraft.clientesSnapshot).forEach((item) => {
    const normalized = normalizeClientCandidate(item);
    if (normalized?.id) collected.push(normalized);
  });

  if (normalizedDraft.cliente) {
    const normalized = normalizeClientCandidate(normalizedDraft.cliente);
    if (normalized?.id) collected.push(normalized);
  }

  const fallback = normalizeClientCandidate({
    clienteId: first(
      normalizedDraft.clienteId,
      normalizedDraft.clientId,
      normalizedDraft.customerId
    ),
    userId: first(
      normalizedDraft.clienteUserId,
      normalizedDraft.userId,
      normalizedDraft.usuarioId
    ),
    name: first(
      normalizedDraft.clienteNombre,
      normalizedDraft.nombreContacto,
      normalizedDraft.name,
      normalizedDraft.displayName,
      normalizedDraft.razonSocial
    ),
    nombreContacto: first(
      normalizedDraft.nombreContacto,
      normalizedDraft.clienteNombre,
      normalizedDraft.name,
      normalizedDraft.displayName
    ),
    razonSocial: first(
      normalizedDraft.razonSocial,
      normalizedDraft.empresa,
      normalizedDraft.clienteNombre
    ),
    email: first(
      normalizedDraft.clienteEmail,
      normalizedDraft.emailCliente,
      normalizedDraft.email
    ),
    avatarUrl: first(
      normalizedDraft.clienteAvatar,
      normalizedDraft.avatarUrl,
      normalizedDraft.avatar,
      normalizedDraft.logoUrl,
      getAvatarUrlFromObject(normalizedDraft)
    ),
    telefono: first(
      normalizedDraft.telefono,
      normalizedDraft.phone
    ),
    nif: first(
      normalizedDraft.nif,
      normalizedDraft.clienteNif
    ),
    direccion: first(
      normalizedDraft.direccion,
      normalizedDraft.direccionServicio
    ),
  });

  if (fallback?.id) collected.push(fallback);

  return dedupeClients(collected);
}

function buildDraftTickets(draft = {}) {
  const normalizedDraft = safeObject(draft);
  const collected = [];

  safeArray(normalizedDraft.tickets).forEach((item) => {
    const normalized = normalizeTicketCandidate(item);
    if (normalized?.id) collected.push(normalized);
  });

  safeArray(normalizedDraft.incidencias).forEach((item) => {
    const normalized = normalizeTicketCandidate(item);
    if (normalized?.id) collected.push(normalized);
  });

  if (normalizedDraft.ticket) {
    const normalized = normalizeTicketCandidate(normalizedDraft.ticket);
    if (normalized?.id) collected.push(normalized);
  }

  if (normalizedDraft.incidencia) {
    const normalized = normalizeTicketCandidate(normalizedDraft.incidencia);
    if (normalized?.id) collected.push(normalized);
  }

  safeArray(normalizedDraft.ticketIds).forEach((id) => {
    const normalized = normalizeTicketCandidate({
      id,
      ticketId: id,
      incidenciaId: id,
      subject: id,
    });
    if (normalized?.id) collected.push(normalized);
  });

  safeArray(normalizedDraft.incidenciaIds).forEach((id) => {
    const normalized = normalizeTicketCandidate({
      id,
      ticketId: id,
      incidenciaId: id,
      subject: id,
    });
    if (normalized?.id) collected.push(normalized);
  });

  const draftTicketId = safeText(
    first(
      normalizedDraft.ticketId,
      normalizedDraft.incidenciaId,
      normalizedDraft.supportTicketId
    ),
    ""
  );

  if (draftTicketId) {
    const normalized = normalizeTicketCandidate({
      id: draftTicketId,
      ticketId: draftTicketId,
      incidenciaId: draftTicketId,
      subject: first(
        normalizedDraft.incidenciaSubject,
        normalizedDraft.ticketSubject,
        normalizedDraft.subject,
        normalizedDraft.asunto,
        draftTicketId
      ),
      clienteId: normalizedDraft.clienteId,
      userId: normalizedDraft.userId,
    });

    if (normalized?.id) collected.push(normalized);
  }

  const map = new Map();

  collected.forEach((item) => {
    if (!item?.id) return;
    if (!map.has(item.id)) map.set(item.id, item);
  });

  return sortTicketsByLatest(Array.from(map.values()));
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

  const draftClientes = buildDraftClientes(normalizedDraft);
  const draftTickets = buildDraftTickets(normalizedDraft);

  modalState.selectedClientes = draftClientes;
  modalState.selectedTickets = draftTickets;

  syncPrimaryClientToForm();
  syncPrimaryTicketToForm();

  modalState.form = {
    ...modalState.form,
    ...normalizedDraft,
    clienteId: modalState.form.clienteId || safeText(normalizedDraft.clienteId, ""),
    clienteUserId: modalState.form.clienteUserId || safeText(normalizedDraft.clienteUserId, ""),
    clienteNombre: modalState.form.clienteNombre || safeText(normalizedDraft.clienteNombre, ""),
    clienteEmail: modalState.form.clienteEmail || safeText(normalizedDraft.clienteEmail, ""),
    clienteAvatar: modalState.form.clienteAvatar || safeText(
      first(
        normalizedDraft.clienteAvatar,
        normalizedDraft.avatarUrl,
        normalizedDraft.avatar,
        getAvatarUrlFromObject(normalizedDraft)
      ),
      ""
    ),
    ticketId: modalState.form.ticketId || safeText(first(normalizedDraft.ticketId, normalizedDraft.incidenciaId), ""),
    incidenciaId: modalState.form.incidenciaId || safeText(first(normalizedDraft.incidenciaId, normalizedDraft.ticketId), ""),
    incidenciaSubject: modalState.form.incidenciaSubject || safeText(
      first(
        normalizedDraft.incidenciaSubject,
        normalizedDraft.ticketSubject,
        normalizedDraft.subject,
        normalizedDraft.asunto
      ),
      ""
    ),
    fechaServicio: safeText(normalizedDraft.fechaServicio, modalState.form.fechaServicio),
    formaPago: safeText(normalizedDraft.formaPago, modalState.form.formaPago),
  };

  syncPrimaryClientToForm();
  syncPrimaryTicketToForm();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  syncDerivedUi();

  if (!getSelectedClientes().length) {
    focusField("clienteSearch");
  } else if (!getSelectedTickets().length) {
    focusField("ticketSearch");

    loadTicketsForSelectedClient({
      query: "",
      autoSelectLatest: true,
      focus: "ticketSearch",
    });
  } else {
    loadTicketsForSelectedClient({
      query: "",
      autoSelectLatest: false,
      focus: "descripcion",
    });

    focusField("descripcion");
  }

  safeEmit("facturas:create-modal:opened", {
    draft: modalState.form,
    selectedClientes: getSelectedClientes(),
    selectedTickets: getSelectedTickets(),
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

  const draftClientes = buildDraftClientes(normalizedDraft);
  const draftTickets = buildDraftTickets(normalizedDraft);

  if (draftClientes.length) {
    const existing = new Map();

    getSelectedClientes().forEach((item) => {
      existing.set(item.clienteId || item.id, item);
    });

    draftClientes.forEach((item) => {
      existing.set(item.clienteId || item.id, item);
    });

    modalState.selectedClientes = Array.from(existing.values());
  }

  if (draftTickets.length) {
    const existing = new Map();

    getSelectedTickets().forEach((item) => {
      existing.set(item.id, item);
    });

    draftTickets.forEach((item) => {
      existing.set(item.id, item);
    });

    modalState.selectedTickets = Array.from(existing.values());
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...normalizedDraft,
  };

  syncPrimaryClientToForm();
  syncPrimaryTicketToForm();

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

  syncPrimaryClientToForm();
  syncPrimaryTicketToForm();

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
   SELECTION ACTIONS
========================================================= */

async function selectCliente(index = -1) {
  const item = safeArray(modalState.clienteSearchResults)[Number(index)];

  if (!item?.id) return false;

  if (!hasSelectedCliente(item)) {
    modalState.selectedClientes = [
      ...getSelectedClientes(),
      item,
    ];
  }

  syncPrimaryClientToForm();

  modalState.clienteSearchQuery = "";
  modalState.clienteSearchResults = [];
  modalState.clienteSearchLoading = false;
  modalState.clienteSearchError = "";

  if (modalState.errors.clienteId || modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.clienteId;
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  modalState.ticketSearchQuery = "";
  modalState.ticketSearchError = "";
  modalState.ticketSearchLoading = false;

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSearch");

  await loadTicketsForSelectedClient({
    query: "",
    autoSelectLatest: getSelectedTickets().length === 0,
    focus: "ticketSearch",
  });

  return true;
}

async function removeCliente(index = -1) {
  const idx = Number(index);
  const selected = getSelectedClientes();

  if (!Number.isInteger(idx) || idx < 0 || idx >= selected.length) return false;

  modalState.selectedClientes = selected.filter((_, itemIndex) => itemIndex !== idx);

  syncPrimaryClientToForm();

  if (!getSelectedClientes().length) {
    modalState.selectedTickets = [];
    modalState.ticketSearchResults = [];
    modalState.ticketSearchQuery = "";
    modalState.ticketSearchError = "";
    modalState.ticketAutoSelected = false;

    syncPrimaryTicketToForm();

    renderModal();
    attachRootBindings();
    syncDerivedUi();
    focusField("clienteSearch");

    return true;
  }

  modalState.selectedTickets = getSelectedTickets().filter((ticket) => {
    return ticketBelongsToSelectedClients(ticket);
  });

  syncPrimaryTicketToForm();

  renderModal();
  attachRootBindings();
  syncDerivedUi();

  await loadTicketsForSelectedClient({
    query: modalState.ticketSearchQuery,
    autoSelectLatest: getSelectedTickets().length === 0,
    focus: "ticketSearch",
  });

  return true;
}

async function makeClientePrimary(index = -1) {
  const idx = Number(index);
  const selected = getSelectedClientes();

  if (!Number.isInteger(idx) || idx <= 0 || idx >= selected.length) return false;

  const item = selected[idx];

  modalState.selectedClientes = [
    item,
    ...selected.filter((_, itemIndex) => itemIndex !== idx),
  ];

  syncPrimaryClientToForm();

  renderModal();
  attachRootBindings();
  syncDerivedUi();

  await loadTicketsForSelectedClient({
    query: modalState.ticketSearchQuery,
    autoSelectLatest: getSelectedTickets().length === 0,
    focus: "ticketSearch",
  });

  return true;
}

function clearClientes() {
  modalState.selectedClientes = [];
  modalState.selectedTickets = [];

  syncPrimaryClientToForm();
  syncPrimaryTicketToForm();

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
    append: true,
  });

  modalState.ticketSearchQuery = "";

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSearch");

  return true;
}

function removeTicket(index = -1) {
  const idx = Number(index);
  const selected = getSelectedTickets();

  if (!Number.isInteger(idx) || idx < 0 || idx >= selected.length) return false;

  modalState.selectedTickets = selected.filter((_, itemIndex) => itemIndex !== idx);
  modalState.ticketAutoSelected = false;

  syncPrimaryTicketToForm();

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSearch");

  return true;
}

function makeTicketPrimary(index = -1) {
  const idx = Number(index);
  const selected = getSelectedTickets();

  if (!Number.isInteger(idx) || idx <= 0 || idx >= selected.length) return false;

  const item = selected[idx];

  modalState.selectedTickets = [
    item,
    ...selected.filter((_, itemIndex) => itemIndex !== idx),
  ];

  modalState.ticketAutoSelected = false;

  syncPrimaryTicketToForm();

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSearch");

  return true;
}

function clearTickets() {
  modalState.selectedTickets = [];
  modalState.ticketAutoSelected = false;

  syncPrimaryTicketToForm();

  renderModal();
  attachRootBindings();
  syncDerivedUi();
  focusField("ticketSearch");

  return true;
}

/* =========================================================
   FIELD HANDLERS
========================================================= */

function handleFieldInput(field) {
  const fieldName = safeText(field?.dataset?.field, "");
  if (!fieldName) return;

  if (fieldName === "clienteSearch") {
    const value = safeText(field.value, "");

    modalState.clienteSearchQuery = value;

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

  syncDerivedUi();
}

/* =========================================================
   BINDINGS
========================================================= */

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

    const removeClienteBtn = event.target.closest("[data-remove-cliente]");

    if (removeClienteBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      await removeCliente(removeClienteBtn.dataset.removeCliente);
      return;
    }

    const primaryClienteBtn = event.target.closest("[data-primary-cliente]");

    if (primaryClienteBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      await makeClientePrimary(primaryClienteBtn.dataset.primaryCliente);
      return;
    }

    const clearClientesBtn = event.target.closest("[data-clear-clientes='true']");

    if (clearClientesBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      clearClientes();
      return;
    }

    const selectTicketBtn = event.target.closest("[data-select-ticket]");

    if (selectTicketBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      selectTicket(selectTicketBtn.dataset.selectTicket);
      return;
    }

    const removeTicketBtn = event.target.closest("[data-remove-ticket]");

    if (removeTicketBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      removeTicket(removeTicketBtn.dataset.removeTicket);
      return;
    }

    const primaryTicketBtn = event.target.closest("[data-primary-ticket]");

    if (primaryTicketBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      makeTicketPrimary(primaryTicketBtn.dataset.primaryTicket);
      return;
    }

    const clearTicketsBtn = event.target.closest("[data-clear-tickets='true']");

    if (clearTicketsBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      clearTickets();
      return;
    }

    const refreshTicketsBtn = event.target.closest("[data-refresh-tickets='true']");

    if (refreshTicketsBtn) {
      event.preventDefault();

      if (modalState.submitting) return;

      await loadTicketsForSelectedClient({
        query: modalState.ticketSearchQuery,
        autoSelectLatest: getSelectedTickets().length === 0,
        focus: "ticketSearch",
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
      focus: "ticketSearch",
    });
  },

  clearClientes() {
    return clearClientes();
  },

  clearTickets() {
    return clearTickets();
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },

      selectedClientes: [...getSelectedClientes()],
      selectedTickets: [...getSelectedTickets()],

      clienteSearchResults: [...safeArray(modalState.clienteSearchResults)],
      ticketSearchResults: [...safeArray(modalState.ticketSearchResults)],

      form: { ...safeObject(modalState.form) },
    };
  },

  buildPayload() {
    syncPrimaryClientToForm();
    syncPrimaryTicketToForm();

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

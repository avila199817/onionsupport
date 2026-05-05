/* =========================================================
   Onion SPA - Facturas Create Modal
   Archivo: src/views/facturas/facturas.create.modal.js

   FACTURAS EXPERIENCE PRO · CREATE MODAL · CSS ALIGNED · 10/10
   CSP CLEAN · NO CSS IN JS · NO INLINE EVENTS · TOKEN SYSTEM READY

   PATCH:
   - Sin kicker "Facturación admin".
   - Sin bloque visible "Factura preparada".
   - Sin re-render completo al buscar cliente/incidencia.
   - Sin parpadeo agresivo en input/search/select.
   - Slots dinámicos para clientes/incidencias/resultados/errores.
   - data-facturas-scope aplicado al root del modal para consumir tokens.
   - Compatible con facturas.css .fac-create-*.

   RESPONSABILIDADES:
   - abrir/cerrar modal premium de creación de factura
   - buscar cliente/usuario objetivo
   - permitir selección multi-cliente
   - cargar y seleccionar incidencias/tickets vinculados
   - permitir selección multi-incidencia
   - mantener cliente/ticket primario para compatibilidad backend
   - crear payload v3/v2 compatible para Cosmos/backend
   - calcular total en tiempo real con IVA/IRPF
   - emitir eventos de éxito/error para refrescar la vista
   - exponer bridge global OnionFacturasCreateModal

   CSS:
   - Todo el estilo vive en /src/css/views/facturas.css
   - Este módulo solo emite clases y atributos de estado
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "facturas-create-modal-root";
const PANEL_ID = "facturas-create-modal-panel";
const FORM_ID = "facturas-create-form";

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
const SEARCH_DEBOUNCE = 260;

const CREATE_TIMEOUT_MS = 90000;
const SEARCH_TIMEOUT_MS = 15000;

const DEFAULT_IVA_RATE = 21;
const DEFAULT_IRPF_RATE = 7;

const PAYMENT_OPTIONS = Object.freeze([
  { value: "transferencia bancaria", label: "Transferencia bancaria" },
  { value: "efectivo", label: "Efectivo" },
]);

const DEFAULT_FORM = Object.freeze({
  concepto: "Servicios de soporte y asistencia técnica informática",
  descripcion: "",
  cantidad: 1,
  precioUnitario: 20,
  fechaServicio: "",
  formaPago: "transferencia bancaria",
  estadoPago: "pendiente",
  sendEmail: true,

  clienteId: "",
  clienteUserId: "",
  clienteNombre: "",
  clienteEmail: "",
  clienteAvatar: "",

  ticketId: "",
  incidenciaId: "",
  incidenciaSubject: "",
});

/* =========================================================
   STATE
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

  errors: {},
  serverError: "",
  successMessage: "",
  createdFacturaId: "",

  form: {
    ...DEFAULT_FORM,
  },
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function getGlobal() {
  try {
    return typeof window !== "undefined" ? window : null;
  } catch {
    return null;
  }
}

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
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

function compactUnique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function round2(value) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function todayInputValue() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);

    if (["true", "1", "yes", "si", "sí", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }

  return fallback;
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

function getInitials(value = "", fallback = "CL") {
  const text = normalizeWhitespace(value);

  if (!text) return fallback;

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || fallback;
}

function getSortableDate(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  const win = getGlobal();

  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    win?.dispatchEvent?.(
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
  const win = getGlobal();

  if (!eventName || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(eventName, handler);
  } catch {}

  try {
    win?.addEventListener?.(eventName, handler);
  } catch {}

  return true;
}

function safeOff(event = "", handler = null) {
  const eventName = safeText(event, "");
  const win = getGlobal();

  if (!eventName || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(eventName, handler);
  } catch {}

  try {
    win?.removeEventListener?.(eventName, handler);
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

function shouldTryNextEndpoint(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   API HELPERS
========================================================= */

function getApiBase() {
  const win = getGlobal();

  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      win?.ONION_API_BASE,
      win?.API_BASE
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
  const win = getGlobal();

  if (!cleanKey || !win) return "";

  try {
    const value = win.localStorage?.getItem?.(cleanKey);
    if (value) return value;
  } catch {}

  try {
    const value = win.sessionStorage?.getItem?.(cleanKey);
    if (value) return value;
  } catch {}

  return "";
}

function getAuthToken() {
  const win = getGlobal();

  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      win?.Auth?.getToken?.(),

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
  const win = getGlobal();

  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    win?.Http;

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
  const win = getGlobal();

  const client =
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    win?.Http;

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
   RESPONSE HELPERS
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
   AVATAR / CLIENT NORMALIZATION
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
      cliente.businessName
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

/* =========================================================
   TICKET NORMALIZATION
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

  const createdAt = safeText(first(obj.createdAt, ticket.createdAt, incidencia.createdAt), "");
  const createdAtES = safeText(first(obj.createdAtES, ticket.createdAtES, incidencia.createdAtES), "");
  const updatedAt = safeText(first(obj.lastActivityAt, obj.updatedAt, ticket.updatedAt, incidencia.updatedAt), "");
  const updatedAtES = safeText(first(obj.lastActivityAtES, obj.updatedAtES, ticket.updatedAtES, incidencia.updatedAtES), "");

  const sortDate = Math.max(getSortableDate(updatedAt), getSortableDate(createdAt));
  const dateLabel = safeText(first(updatedAtES, createdAtES, updatedAt, createdAt), "");

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

/* =========================================================
   SELECTED HELPERS
========================================================= */

function getSelectedClientes() {
  return safeArray(modalState.selectedClientes);
}

function getSelectedTickets() {
  return safeArray(modalState.selectedTickets);
}

function getPrimaryCliente() {
  return getSelectedClientes()[0] || null;
}

function getPrimaryTicket() {
  return getSelectedTickets()[0] || null;
}

function getSelectedClienteIds() {
  return compactUnique(getSelectedClientes().map((item) => item.clienteId || item.id));
}

function getSelectedUserIds() {
  return compactUnique(getSelectedClientes().map((item) => item.userId));
}

function getSelectedTicketIds() {
  return compactUnique(getSelectedTickets().map((item) => item.ticketId || item.id));
}

function hasSelectedCliente(cliente = {}) {
  const item = normalizeClientCandidate(cliente) || safeObject(cliente);
  const clienteId = safeText(item.clienteId || item.id, "");
  const userId = safeText(item.userId, "");

  return getSelectedClientes().some((selected) => (
    (clienteId && (selected.clienteId === clienteId || selected.id === clienteId)) ||
    (userId && selected.userId === userId)
  ));
}

function hasSelectedTicket(ticket = {}) {
  const item = normalizeTicketCandidate(ticket) || safeObject(ticket);
  const id = safeText(first(item.id, item.ticketId, item.incidenciaId), "");

  return Boolean(
    id &&
      getSelectedTickets().some((selected) => (
        selected.id === id ||
        selected.ticketId === id ||
        selected.incidenciaId === id
      ))
  );
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
   SEARCH HELPERS
========================================================= */

function buildClientSearchUrls(query = "") {
  const params = new URLSearchParams();

  params.set("q", safeText(query, ""));
  params.set("search", safeText(query, ""));
  params.set("limit", String(SEARCH_LIMIT));

  return CLIENT_SEARCH_ENDPOINTS.map((endpoint) => `${endpoint}?${params.toString()}`);
}

function buildTicketSearchUrls(query = "", cliente = null) {
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

    return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params.toString()}`;
  });
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

function dedupeTickets(items = []) {
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

      if (!shouldTryNextEndpoint(error)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;

  return [];
}

async function searchTicketsRequest(query = "") {
  const selectedClientes = getSelectedClientes();
  const searchTargets = selectedClientes.length ? selectedClientes : [null];

  let lastError = null;
  let collected = [];

  for (const cliente of searchTargets) {
    const urls = buildTicketSearchUrls(query, cliente);

    for (const url of urls) {
      try {
        const response = await apiGet(url);
        const items = extractItems(response);

        if (items.length) {
          collected = collected.concat(items);
        }
      } catch (error) {
        lastError = error;

        if (!shouldTryNextEndpoint(error)) {
          throw error;
        }
      }
    }
  }

  const normalized = dedupeTickets(collected);

  if (normalized.length) return normalized;
  if (lastError && collected.length === 0) throw lastError;

  return [];
}

function clearClientSearchTimer() {
  if (!modalState.clienteSearchDebounce) return;

  try {
    clearTimeout(modalState.clienteSearchDebounce);
  } catch {}

  modalState.clienteSearchDebounce = null;
}

function clearTicketSearchTimer() {
  if (!modalState.ticketSearchDebounce) return;

  try {
    clearTimeout(modalState.ticketSearchDebounce);
  } catch {}

  modalState.ticketSearchDebounce = null;
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

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const concepto = normalizeWhitespace(current.concepto);
  const descripcion = normalizeWhitespace(current.descripcion);

  const cantidad = safeNumber(current.cantidad, 0);
  const precioUnitario = safeNumber(current.precioUnitario, 0);

  if (!getSelectedClientes().length) {
    errors.clienteId = "Selecciona al menos un cliente.";
  }

  if (!getSelectedTickets().length) {
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
  const incidenciaSubject = safeText(
    first(primaryTicket?.subject, primaryTicket?.asunto, current.incidenciaSubject, ticketId),
    ticketId
  );

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

    direccionServicio: safeObject(primaryClientePayload.direccion, {}),

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
   RENDER HELPERS
========================================================= */

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
      aria-label="${escapeHtml(displayName)}"
      data-tooltip="${escapeHtml(displayName)}"
      ${url ? 'data-has-avatar="true"' : 'data-fallback="true"'}
    >
      ${
        url
          ? `
            <img
              class="fac-create-avatar-img"
              src="${escapeHtml(url)}"
              alt="${escapeHtml(displayName)}"
              loading="lazy"
              referrerpolicy="no-referrer"
              data-avatar-img="true"
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
   DYNAMIC RENDER BLOCKS
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

  const visibleResults = query ? results : results.slice(0, 6);

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
            <strong data-client-count="true">${escapeHtml(String(clienteCount))}</strong>
            <span>Clientes</span>
          </div>
          <div>
            <strong data-ticket-count="true">${escapeHtml(String(ticketCount))}</strong>
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

            <button
              type="button"
              class="fac-create-mini-button"
              data-clear-clientes="true"
              ${modalState.submitting || !clienteCount ? "disabled" : ""}
            >
              Limpiar clientes
            </button>
          </div>

          <div data-slot="selected-clientes">
            ${renderSelectedClientes()}
          </div>

          <div data-error-slot="clienteId">
            ${renderFieldError(errors.clienteId)}
          </div>

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

          <div data-slot="client-search-results">
            ${renderClientSearchResults()}
          </div>
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

          <div data-slot="selected-tickets">
            ${renderSelectedTickets()}
          </div>

          <div data-error-slot="incidenciaId">
            ${renderFieldError(errors.incidenciaId)}
          </div>

          <label class="fac-create-field fac-create-field--search">
            <span class="fac-create-label">Filtrar incidencias</span>
            <input
              class="fac-create-input ${errors.incidenciaId ? "is-error" : ""}"
              data-field="ticketSearch"
              name="ticketSearch"
              type="text"
              value="${escapeHtml(modalState.ticketSearchQuery)}"
              placeholder="Filtrar por código, asunto, estado..."
              autocomplete="off"
              ${modalState.submitting || ticketLoading || !clienteCount ? "disabled" : ""}
            />
          </label>

          <div data-slot="ticket-search-results">
            ${renderTicketSearchResults()}
          </div>
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

          <form id="${FORM_ID}" class="fac-create-form" novalidate>
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

            <div class="fac-create-actions fac-create-actions--compact">
              <div aria-hidden="true"></div>

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
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT / RENDER CONTROL
========================================================= */

function getRoot() {
  try {
    return document.getElementById(MODAL_ID);
  } catch {
    return null;
  }
}

function ensureRoot() {
  let root = getRoot();

  if (root) {
    try {
      root.setAttribute("data-facturas-scope", "true");
      root.setAttribute("data-facturas-create-root", "true");
    } catch {}

    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  root.setAttribute("data-facturas-scope", "true");
  root.setAttribute("data-facturas-create-root", "true");
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    modalState.previousBodyOverflow = document.body.style.overflow || "";
  } catch {}

  try {
    document.body.classList.add("modal-open", "facturas-create-modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open", "facturas-create-modal-open");
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

function setSlotHtml(selector = "", html = "") {
  const root = getRoot();
  if (!root || !selector) return false;

  const node = root.querySelector(selector);
  if (!node) return false;

  node.innerHTML = html;
  return true;
}

function syncDerivedUi() {
  const root = getRoot();
  if (!root) return false;

  const breakdown = getInvoiceBreakdown(modalState.form);

  root
    .querySelectorAll('[data-role="total-preview-inline"]')
    .forEach((node) => {
      node.textContent = formatMoney(breakdown.totalFactura);
    });

  root
    .querySelectorAll('[data-role="base-preview-inline"]')
    .forEach((node) => {
      node.textContent = formatMoney(breakdown.base);
    });

  root
    .querySelectorAll('[data-role="tax-preview-inline"]')
    .forEach((node) => {
      node.textContent = `${formatMoney(breakdown.ivaTotal)} / ${formatMoney(breakdown.irpfTotal)}`;
    });

  return true;
}

function syncDynamicAreas() {
  const root = getRoot();
  if (!root) return false;

  const clienteCount = getSelectedClientes().length;
  const ticketCount = getSelectedTickets().length;
  const errors = safeObject(modalState.errors);

  root.querySelectorAll("[data-client-count='true']").forEach((node) => {
    node.textContent = String(clienteCount);
  });

  root.querySelectorAll("[data-ticket-count='true']").forEach((node) => {
    node.textContent = String(ticketCount);
  });

  setSlotHtml('[data-slot="selected-clientes"]', renderSelectedClientes());
  setSlotHtml('[data-slot="selected-tickets"]', renderSelectedTickets());
  setSlotHtml('[data-slot="client-search-results"]', renderClientSearchResults());
  setSlotHtml('[data-slot="ticket-search-results"]', renderTicketSearchResults());

  setSlotHtml('[data-error-slot="clienteId"]', renderFieldError(errors.clienteId));
  setSlotHtml('[data-error-slot="incidenciaId"]', renderFieldError(errors.incidenciaId));

  const clienteInput = root.querySelector('[data-field="clienteSearch"]');
  if (clienteInput) {
    clienteInput.classList.toggle("is-error", Boolean(errors.clienteId));
    clienteInput.disabled = Boolean(modalState.submitting);
  }

  const ticketInput = root.querySelector('[data-field="ticketSearch"]');
  if (ticketInput) {
    ticketInput.classList.toggle("is-error", Boolean(errors.incidenciaId));
    ticketInput.disabled = Boolean(
      modalState.submitting ||
      modalState.ticketSearchLoading ||
      !clienteCount
    );
  }

  const clearClientesBtn = root.querySelector("[data-clear-clientes='true']");
  if (clearClientesBtn) {
    clearClientesBtn.disabled = Boolean(modalState.submitting || !clienteCount);
  }

  const refreshTicketsBtn = root.querySelector("[data-refresh-tickets='true']");
  if (refreshTicketsBtn) {
    refreshTicketsBtn.disabled = Boolean(
      modalState.submitting ||
      modalState.ticketSearchLoading ||
      !clienteCount
    );
    refreshTicketsBtn.textContent = modalState.ticketSearchLoading ? "Cargando..." : "Recargar";
  }

  syncDerivedUi();

  return true;
}

function rerenderAndRefocus(fieldName = "") {
  renderModal();
  attachRootBindings();
  syncDerivedUi();

  if (fieldName) {
    focusField(fieldName);
  }

  return true;
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
   SEARCH EXECUTION · NO FULL RERENDER
========================================================= */

async function performClientSearch(query = "") {
  const normalized = normalizeWhitespace(query);
  const seq = ++modalState.clienteSearchSeq;

  if (normalized.length < 2) {
    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = [];

    syncDynamicAreas();
    return [];
  }

  modalState.clienteSearchLoading = true;
  modalState.clienteSearchError = "";
  modalState.clienteSearchResults = [];

  syncDynamicAreas();

  try {
    const results = await searchClientesRequest(normalized);

    if (seq !== modalState.clienteSearchSeq) return [];

    modalState.clienteSearchLoading = false;
    modalState.clienteSearchError = "";
    modalState.clienteSearchResults = results;

    syncDynamicAreas();

    return results;
  } catch (error) {
    if (seq !== modalState.clienteSearchSeq) return [];

    modalState.clienteSearchLoading = false;
    modalState.clienteSearchResults = [];
    modalState.clienteSearchError = safeErrorMessage(error, "No se pudo buscar cliente.");

    syncDynamicAreas();

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

    syncDynamicAreas();
    return;
  }

  modalState.clienteSearchDebounce = setTimeout(() => {
    performClientSearch(normalized);
  }, SEARCH_DEBOUNCE);
}

async function loadTicketsForSelectedClient({
  query = "",
  autoSelectLatest = true,
} = {}) {
  if (!getSelectedClientes().length) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];
    modalState.selectedTickets = [];

    syncPrimaryTicketToForm();
    syncDynamicAreas();

    return [];
  }

  const seq = ++modalState.ticketSearchSeq;

  modalState.ticketSearchLoading = true;
  modalState.ticketSearchError = "";
  modalState.ticketSearchResults = [];

  if (autoSelectLatest) {
    modalState.selectedTickets = [];
    syncPrimaryTicketToForm();
  }

  syncDynamicAreas();

  try {
    const results = await searchTicketsRequest(query);

    if (seq !== modalState.ticketSearchSeq) return [];

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = results;

    if (autoSelectLatest && results[0]?.id) {
      setSelectedTicketFromItem(results[0], {
        auto: true,
        append: true,
      });
    }

    syncDynamicAreas();

    return results;
  } catch (error) {
    if (seq !== modalState.ticketSearchSeq) return [];

    modalState.ticketSearchLoading = false;
    modalState.ticketSearchResults = [];
    modalState.ticketSearchError = safeErrorMessage(
      error,
      "No se pudieron cargar las incidencias del cliente."
    );
    modalState.selectedTickets = [];

    syncPrimaryTicketToForm();
    syncDynamicAreas();

    return [];
  }
}

function scheduleTicketSearch(query = "") {
  clearTicketSearchTimer();

  if (!getSelectedClientes().length) {
    modalState.ticketSearchLoading = false;
    modalState.ticketSearchError = "";
    modalState.ticketSearchResults = [];

    syncDynamicAreas();
    return;
  }

  modalState.ticketSearchDebounce = setTimeout(() => {
    loadTicketsForSelectedClient({
      query,
      autoSelectLatest: false,
    });
  }, SEARCH_DEBOUNCE);
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

  resetForm();

  const normalizedDraft = safeObject(draft);

  modalState.selectedClientes = buildDraftClientes(normalizedDraft);
  modalState.selectedTickets = buildDraftTickets(normalizedDraft);

  setFormPatch({
    ...normalizedDraft,
    fechaServicio: safeText(normalizedDraft.fechaServicio, modalState.form.fechaServicio),
    formaPago: safeText(normalizedDraft.formaPago, modalState.form.formaPago),
  });

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
    });
  } else {
    loadTicketsForSelectedClient({
      query: "",
      autoSelectLatest: false,
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

  setFormPatch(normalizedDraft);

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
    syncDynamicAreas();
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
   SELECTION ACTIONS · NO FULL RERENDER
========================================================= */

function setSelectedTicketFromItem(item = null, { auto = false, append = true } = {}) {
  const normalized = normalizeTicketCandidate(item) || safeObject(item);
  const id = safeText(first(normalized.id, normalized.ticketId, normalized.incidenciaId), "");

  if (!id) return false;

  const nextTicket = {
    ...normalized,
    id,
    ticketId: normalized.ticketId || id,
    incidenciaId: normalized.incidenciaId || id,
    autoSelected: Boolean(auto),
  };

  if (append) {
    if (!hasSelectedTicket(nextTicket)) {
      modalState.selectedTickets = [
        ...getSelectedTickets(),
        nextTicket,
      ];
    }
  } else {
    modalState.selectedTickets = [nextTicket];
  }

  syncPrimaryTicketToForm();

  if (modalState.errors.incidenciaId) {
    const nextErrors = { ...safeObject(modalState.errors) };
    delete nextErrors.incidenciaId;
    modalState.errors = nextErrors;
  }

  return true;
}

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

  const clienteInput = getRoot()?.querySelector?.('[data-field="clienteSearch"]');
  if (clienteInput) clienteInput.value = "";

  const ticketInput = getRoot()?.querySelector?.('[data-field="ticketSearch"]');
  if (ticketInput) ticketInput.value = "";

  syncDynamicAreas();

  await loadTicketsForSelectedClient({
    query: "",
    autoSelectLatest: getSelectedTickets().length === 0,
  });

  focusField("ticketSearch");

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

    syncPrimaryTicketToForm();

    const ticketInput = getRoot()?.querySelector?.('[data-field="ticketSearch"]');
    if (ticketInput) ticketInput.value = "";

    syncDynamicAreas();
    focusField("clienteSearch");

    return true;
  }

  modalState.selectedTickets = getSelectedTickets().filter((ticket) => (
    ticketBelongsToSelectedClients(ticket)
  ));

  syncPrimaryTicketToForm();
  syncDynamicAreas();

  await loadTicketsForSelectedClient({
    query: modalState.ticketSearchQuery,
    autoSelectLatest: getSelectedTickets().length === 0,
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
  syncDynamicAreas();

  await loadTicketsForSelectedClient({
    query: modalState.ticketSearchQuery,
    autoSelectLatest: getSelectedTickets().length === 0,
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

  const clienteInput = getRoot()?.querySelector?.('[data-field="clienteSearch"]');
  if (clienteInput) clienteInput.value = "";

  const ticketInput = getRoot()?.querySelector?.('[data-field="ticketSearch"]');
  if (ticketInput) ticketInput.value = "";

  syncDynamicAreas();
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

  const ticketInput = getRoot()?.querySelector?.('[data-field="ticketSearch"]');
  if (ticketInput) ticketInput.value = "";

  syncDynamicAreas();
  focusField("ticketSearch");

  return true;
}

function removeTicket(index = -1) {
  const idx = Number(index);
  const selected = getSelectedTickets();

  if (!Number.isInteger(idx) || idx < 0 || idx >= selected.length) return false;

  modalState.selectedTickets = selected.filter((_, itemIndex) => itemIndex !== idx);

  syncPrimaryTicketToForm();
  syncDynamicAreas();
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

  syncPrimaryTicketToForm();
  syncDynamicAreas();
  focusField("ticketSearch");

  return true;
}

function clearTickets() {
  modalState.selectedTickets = [];

  syncPrimaryTicketToForm();
  syncDynamicAreas();
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

function handleAvatarImageError(img = null) {
  if (!img) return false;

  const avatar = img.closest?.(".fac-create-avatar");

  if (!avatar) return false;

  try {
    img.hidden = true;
  } catch {}

  try {
    avatar.classList.remove("has-image");
    avatar.setAttribute("data-fallback", "true");
    avatar.removeAttribute("data-has-avatar");
  } catch {}

  return true;
}

/* =========================================================
   BINDINGS
========================================================= */

function attachRootBindings() {
  if (modalState.bindingsAttached) return;

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field) return;

    if (field.type === "checkbox") return;
    if (field.tagName === "SELECT") return;

    handleFieldInput(field);
  };

  const onChange = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field) return;

    handleFieldInput(field);
  };

  const onSubmit = async (event) => {
    const form = event.target?.closest?.(`#${FORM_ID}`);
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onClick = async (event) => {
    const closeBtn = event.target?.closest?.("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();
      closeFacturasCreateModal();
      return;
    }

    const overlay = event.target?.closest?.("[data-facturas-create-modal-overlay='true']");
    const panel = event.target?.closest?.("[data-facturas-create-modal-panel='true']");

    if (
      overlay &&
      !panel &&
      event.target === overlay &&
      !modalState.submitting
    ) {
      closeFacturasCreateModal();
      return;
    }

    const selectClienteBtn = event.target?.closest?.("[data-select-cliente]");

    if (selectClienteBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      await selectCliente(selectClienteBtn.dataset.selectCliente);
      return;
    }

    const removeClienteBtn = event.target?.closest?.("[data-remove-cliente]");

    if (removeClienteBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      await removeCliente(removeClienteBtn.dataset.removeCliente);
      return;
    }

    const primaryClienteBtn = event.target?.closest?.("[data-primary-cliente]");

    if (primaryClienteBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      await makeClientePrimary(primaryClienteBtn.dataset.primaryCliente);
      return;
    }

    const clearClientesBtn = event.target?.closest?.("[data-clear-clientes='true']");

    if (clearClientesBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      clearClientes();
      return;
    }

    const selectTicketBtn = event.target?.closest?.("[data-select-ticket]");

    if (selectTicketBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      selectTicket(selectTicketBtn.dataset.selectTicket);
      return;
    }

    const removeTicketBtn = event.target?.closest?.("[data-remove-ticket]");

    if (removeTicketBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      removeTicket(removeTicketBtn.dataset.removeTicket);
      return;
    }

    const primaryTicketBtn = event.target?.closest?.("[data-primary-ticket]");

    if (primaryTicketBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      makeTicketPrimary(primaryTicketBtn.dataset.primaryTicket);
      return;
    }

    const clearTicketsBtn = event.target?.closest?.("[data-clear-tickets='true']");

    if (clearTicketsBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      clearTickets();
      return;
    }

    const refreshTicketsBtn = event.target?.closest?.("[data-refresh-tickets='true']");

    if (refreshTicketsBtn) {
      event.preventDefault();
      if (modalState.submitting) return;

      await loadTicketsForSelectedClient({
        query: modalState.ticketSearchQuery,
        autoSelectLatest: getSelectedTickets().length === 0,
      });
    }
  };

  const onError = (event) => {
    const img = event.target?.closest?.("[data-avatar-img='true']");
    if (!img) return;

    handleAvatarImageError(img);
  };

  root.__facturasCreateModalInputHandler = onInput;
  root.__facturasCreateModalChangeHandler = onChange;
  root.__facturasCreateModalSubmitHandler = onSubmit;
  root.__facturasCreateModalClickHandler = onClick;
  root.__facturasCreateModalErrorHandler = onError;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  root.addEventListener("error", onError, true);

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

  if (root.__facturasCreateModalErrorHandler) {
    try {
      root.removeEventListener("error", root.__facturasCreateModalErrorHandler, true);
    } catch {}

    delete root.__facturasCreateModalErrorHandler;
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
  const win = getGlobal();

  if (win) {
    win.OnionFacturasCreateModal = OnionFacturasCreateModal;
    win.renderFacturasCreateModal = OnionFacturasCreateModal.open;
    win.renderFacturaCreateModal = OnionFacturasCreateModal.open;
  }
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionFacturasCreateModal;

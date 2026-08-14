/* =========================================================
   Onion Support - Clientes Index
   Archivo: /src/views/clientes/index.js

   PRODUCTIVO · CONTROLADOR PURO · API BOUNDARY · BACKEND CONTRACT V3

   Responsabilidad:
   - Controlar la vista /clientes y su ciclo de vida SPA.
   - Delegar TODA la API de Clientes a clientes.api.js.
   - Delegar la búsqueda remota de usuarios a usuarios.api.js.
   - No tener fetch/Http/localStorage/paginación backend propios.
   - Mantener únicamente estado de presentación:
     búsqueda, filtros, orden, visibleLimit y modales.
   - No convertir ACKs de creación en clientes falsos.
   - Evitar doble refresh tras crear cliente.
   - Mantener compatibilidad con el bridge público ClientesView.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  renderClientesTemplate,
  renderClientesLoadingState,
  renderClientesErrorState,
  CLIENTES_ACTIONS,
} from "./clientes.template.js";

import {
  CLIENTES_API_VERSION,
  CLIENTES_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
  hydrateClientesFromCache,
  loadClientes as loadClientesRequest,
  refreshClientes as refreshClientesRequest,
  loadClienteDetail as loadClienteDetailRequest,
  createCliente as createClienteRequest,
  normalizeClienteModel,
  normalizeClientesCollection,
  findClienteById as findClienteByIdApi,
} from "./clientes.api.js";

import {
  renderClientesCreateModal,
  renderClientesCreateModalClosed,
  CREATE_ACTIONS,
  getCreateFormDefaults,
  validateCreateForm,
  buildClienteCreatePayload,
} from "./clientes.template.create.js";

import {
  openClientesDetailModal,
  closeClientesDetailModal,
} from "./clientes.template.modal.js";

import {
  fetchUsuariosRequest,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
} from "../usuarios/usuarios.api.js";

/* =========================================================
   META / COMPAT EXPORTS
========================================================= */

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";

export const CLIENTES_INDEX_VERSION =
  "clientes.index.api-boundary.v5.backend-contract-v3";

export const CLIENTES_VIEW_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_MODULE_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_INDEX_SOURCE = "views.clientes.index";

export {
  CLIENTES_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
};

const DEFAULT_VISIBLE_LIMIT = 20;
const VISIBLE_STEP = 20;
const DEFAULT_SORT_ORDER = "desc";
const SEARCH_DEBOUNCE_MS = 220;

const MODAL_HOST_SELECTOR = "[data-clientes-modal-host='true']";
const CREATE_MODAL_PANEL_SELECTOR =
  "[data-clientes-create-modal-panel='true']";
const CREATE_MODAL_OVERLAY_SELECTOR =
  "[data-clientes-create-modal-overlay='true']";

const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const INSTANCES = new WeakMap();

const CLIENTES_GLOBAL_CONTROLLER_KEY = Symbol.for(
  "onion.support.clientes.active-controller"
);

const CREATE_SUCCESS_EVENTS = Object.freeze([
  "clientes:create:success",
  "clientes:create:created",
  "clientes:created",
  "cliente:created",
]);

const CREATE_CLOSE_EVENTS = Object.freeze([
  "clientes:create:closed",
  "clientes:create:close",
]);

const DETAIL_CLOSE_EVENTS = Object.freeze([
  "clientes:modal:closed",
]);

let lastInstance = null;
let controllerSequence = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isDomNode(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.nodeType === 1 &&
    "innerHTML" in value &&
    isFunction(value.addEventListener)
  );
}

function isElementNode(value = null) {
  return Boolean(
    typeof Element !== "undefined" &&
    value &&
    value instanceof Element
  );
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  No aplanar arrays.
  En esta vista hay envelopes con items/results y deben conservarse.
*/
function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!normalized || normalized === "-" || normalized === "+") {
      return fallback;
    }

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(
    Math.max(number(value, min), min),
    max
  );
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "sin_email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function normalizeSortOrder(value = "") {
  const order = normalizeKey(
    value || DEFAULT_SORT_ORDER
  );

  if (
    [
      "asc",
      "ascending",
      "oldest",
      "antiguos",
      "menor",
      "menor_mayor",
      "menor_a_mayor",
    ].includes(order)
  ) {
    return "asc";
  }

  return "desc";
}

function getNextSortOrder(value = DEFAULT_SORT_ORDER) {
  return normalizeSortOrder(value) === "asc"
    ? "desc"
    : "asc";
}

function safeError(
  error = null,
  fallback = "No se pudieron cargar los clientes."
) {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function toTimestamp(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) {
      return 0;
    }

    return value > 9_999_999_999
      ? value
      : value * 1000;
  }

  const text =
    cleanText(value, "");

  if (!text) return 0;

  if (/^[+\-]?\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);

    if (!Number.isFinite(numeric) || numeric === 0) {
      return 0;
    }

    return numeric > 9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsedDate =
    Date.parse(text);

  return Number.isFinite(parsedDate)
    ? parsedDate
    : 0;
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nextFrame(callback = null) {
  if (!isBrowser() || !isFunction(callback)) {
    return 0;
  }

  try {
    return window.requestAnimationFrame(callback);
  } catch {
    return window.setTimeout(callback, 0);
  }
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    window.cancelAnimationFrame?.(id);
    window.clearTimeout?.(id);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CANONICAL CLIENT VIEW HELPERS
========================================================= */

function canonicalCliente(item = {}) {
  try {
    return normalizeClienteModel(
      safeObject(item, {})
    );
  } catch {
    return safeObject(item, {});
  }
}

function cloneItems(items = []) {
  return normalizeClientesCollection(
    safeArray(items)
  ).map((item) => ({
    ...item,
  }));
}

function getClienteId(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.clienteId,
      current.clientId,
      current.customerId,
      current.id,
      current._id,
      current.uid,
      ""
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.code,
      current.codigo,
      current.clienteId,
      current.nif,
      current.email,
      "CLI-SIN-ID"
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.nombreFiscal,
      current.razonSocial,
      current.businessName,
      current.companyName,
      current.displayName,
      current.fullName,
      current.name,
      current.nombre,
      current.email,
      current.clienteId,
      "Cliente"
    ),
    "Cliente"
  );
}

function getClienteEmail(item = {}) {
  const current = canonicalCliente(item);

  return normalizeEmail(
    first(
      current.email,
      current.emailLower,
      current.mail,
      current.contactEmail,
      current.billingEmail,
      ""
    )
  );
}

function getClientePhone(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.phone,
      current.telefono,
      current.mobile,
      current.movil,
      ""
    ),
    ""
  );
}

function getClienteCity(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.city,
      current.ciudad,
      current.address?.city,
      current.address?.ciudad,
      current.direccion?.city,
      current.direccion?.ciudad,
      ""
    ),
    ""
  );
}

function getClienteNif(item = {}) {
  const current = canonicalCliente(item);

  return cleanText(
    first(
      current.nif,
      current.cif,
      current.taxId,
      ""
    ),
    ""
  ).toUpperCase();
}

function getClienteType(item = {}) {
  const current = canonicalCliente(item);

  return normalizeKey(
    first(
      current.tipo,
      current.type,
      current.clienteTipo,
      current.segment,
      "cliente"
    )
  );
}

function getClienteStatus(item = {}) {
  const current = canonicalCliente(item);

  return normalizeKey(
    first(
      current.status,
      current.estado,
      current.state,
      "active"
    )
  );
}

/*
  El template visual trata VIP como activo.
  Mantenemos la misma semántica en stats/export para no tener
  contadores distintos entre controlador y tabla.
*/
function viewStatusBucket(item = {}) {
  const status = getClienteStatus(item);

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "inactive",
      "inactivo",
      "disabled",
      "suspended",
      "deleted",
      "archived",
    ].includes(status)
  ) {
    return "blocked";
  }

  return "active";
}

function getClienteUpdatedAt(item = {}) {
  const current = canonicalCliente(item);

  return first(
    current.lastActivityAt,
    current.updatedAt,
    current.lastInvoiceAt,
    current.lastTicketAt,
    current.lastContactAt,
    current.createdAt,
    0
  );
}

function clienteSortTime(item = {}) {
  return toTimestamp(
    getClienteUpdatedAt(item)
  );
}

function getClienteAmount(item = {}) {
  const current = canonicalCliente(item);

  return number(
    first(
      current.totalAmount,
      current.totalImporte,
      current.facturasTotal,
      0
    ),
    0
  );
}

function clienteSearchText(item = {}) {
  const current = canonicalCliente(item);

  return normalizeSearch(
    [
      getClienteId(current),
      getClienteCode(current),
      getClienteName(current),
      getClienteEmail(current),
      getClientePhone(current),
      getClienteCity(current),
      getClienteNif(current),
      getClienteStatus(current),
      getClienteType(current),
    ].join(" ")
  );
}

function filterClientesForView(
  items = [],
  {
    filter = "all",
    search = "",
    sortOrder = DEFAULT_SORT_ORDER,
  } = {}
) {
  const bucket =
    normalizeKey(filter || "all") || "all";

  const query = normalizeSearch(search);
  const terms = query
    .split(/\s+/)
    .filter(Boolean);

  const order =
    normalizeSortOrder(sortOrder);

  return normalizeClientesCollection(items)
    .filter((item) => {
      if (
        bucket !== "all" &&
        viewStatusBucket(item) !== bucket
      ) {
        return false;
      }

      if (!terms.length) return true;

      const haystack =
        clienteSearchText(item);

      return terms.every((term) =>
        haystack.includes(term)
      );
    })
    .sort((a, b) => {
      const aTime = clienteSortTime(a);
      const bTime = clienteSortTime(b);

      const diff =
        order === "asc"
          ? aTime - bTime
          : bTime - aTime;

      if (diff !== 0) {
        return diff;
      }

      return getClienteName(a).localeCompare(
        getClienteName(b),
        "es",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    });
}

export function computeClientesStats(
  items = []
) {
  return normalizeClientesCollection(items)
    .reduce(
      (acc, item) => {
        const status =
          getClienteStatus(item);

        const bucket =
          viewStatusBucket(item);

        acc.total += 1;

        if (bucket === "active") {
          acc.activeCount += 1;
        }

        if (bucket === "pending") {
          acc.pendingCount += 1;
        }

        if (bucket === "blocked") {
          acc.blockedCount += 1;
        }

        if (
          status === "vip" ||
          canonicalCliente(item).vip === true ||
          canonicalCliente(item).isVip === true
        ) {
          acc.vipCount += 1;
        }

        acc.totalAmount +=
          getClienteAmount(item);

        acc.invoiceTotal =
          acc.totalAmount;

        acc.lastUpdateTs =
          Math.max(
            acc.lastUpdateTs,
            clienteSortTime(item)
          );

        return acc;
      },
      {
        total: 0,
        activeCount: 0,
        pendingCount: 0,
        blockedCount: 0,
        vipCount: 0,
        totalAmount: 0,
        invoiceTotal: 0,
        lastUpdateTs: 0,
      }
    );
}

/* =========================================================
   CSV SAFETY
========================================================= */

function protectCsvFormula(value = "") {
  const text = String(value ?? "");

  if (/^\s*[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function escapeCsv(value = "") {
  return `"${protectCsvFormula(value)
    .replace(/"/g, '""')}"`;
}

/* =========================================================
   APP / AUTH / ROUTE
========================================================= */

function getAppState() {
  try {
    return (
      AppCore.getState?.() ||
      AppCore.state ||
      {}
    );
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getAppState();

  try {
    return (
      AppCore.getCurrentUser?.() ||
      state.user ||
      state.currentUser ||
      null
    );
  } catch {
    return (
      state.user ||
      state.currentUser ||
      null
    );
  }
}

function getCoreRole() {
  try {
    return AppCore.getCurrentRole?.() || "";
  } catch {
    return "";
  }
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value
      .map(normalizeRole)
      .filter(Boolean);

    if (roles.includes("admin")) {
      return "admin";
    }

    if (roles.includes("user")) {
      return "user";
    }

    return roles[0] || "";
  }

  const role = normalizeKey(value);

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(role)
  ) {
    return "admin";
  }

  if (
    [
      "user",
      "usuario",
      "client",
      "cliente",
    ].includes(role)
  ) {
    return "user";
  }

  return role || "user";
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(
    getCurrentUser(),
    {}
  );

  return (
    normalizeRole(
      first(
        context.role,
        context.rol,
        context.user?.role,
        context.user?.rol,
        getCoreRole(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) || "user"
  );
}

function isAdminContext(context = {}) {
  return (
    context.admin === true ||
    getCurrentRole(context) === "admin"
  );
}

function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .split("?")[0]
      .split("#")[0] || "/";

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  const segments = value
    .split("/")
    .filter(Boolean);

  if (
    segments[0]?.startsWith("@")
  ) {
    value =
      `/${segments
        .slice(1)
        .join("/")}` || "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash =
      window.location.hash || "";

    if (hash.startsWith("#/")) {
      return normalizePathname(
        hash.slice(1)
      );
    }

    if (hash.startsWith("#!/")) {
      return normalizePathname(
        hash.slice(2)
      );
    }

    return normalizePathname(
      window.location.pathname || "/"
    );
  } catch {
    return "";
  }
}

function routePathFromContext(
  context = {}
) {
  return cleanText(
    first(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.publicPath,
      context.requestedPath,
      context.path,
      context.options?.canonicalPath,
      context.options?.routePath,
      context.options?.path,
      ""
    ),
    ""
  );
}

function isClientesRoute(
  context = {}
) {
  const browserPath =
    getBrowserPath();

  /*
    Si el navegador ya está en una ruta real distinta de "/",
    manda sobre un context antiguo que el router aún no haya limpiado.
  */
  if (
    browserPath &&
    browserPath !== "/"
  ) {
    return (
      browserPath ===
      CLIENTES_CANONICAL_PATH
    );
  }

  const explicit =
    routePathFromContext(context);

  if (explicit) {
    return (
      normalizePathname(explicit) ===
      CLIENTES_CANONICAL_PATH
    );
  }

  if (browserPath) {
    return (
      browserPath ===
      CLIENTES_CANONICAL_PATH
    );
  }

  return true;
}

function resolveHost(
  host = null,
  context = {}
) {
  if (isDomNode(host)) return host;
  if (isDomNode(context.host)) {
    return context.host;
  }
  if (isDomNode(context.root)) {
    return context.root;
  }
  if (isDomNode(context.container)) {
    return context.container;
  }

  if (!isBrowser()) return null;

  return (
    document.querySelector(
      "[data-view-host='clientes']"
    ) ||
    document.querySelector(
      "[data-clientes-host='true']"
    ) ||
    document.querySelector(
      "#app-content"
    ) ||
    document.querySelector("main") ||
    null
  );
}

function getRoutes() {
  return {
    incidencias:
      ROUTES?.incidencias ||
      "/incidencias",

    facturas:
      ROUTES?.facturas ||
      "/facturas",

    clientes:
      ROUTES?.clientes ||
      "/clientes",

    usuarios:
      ROUTES?.usuarios ||
      "/usuarios",

    servidor:
      ROUTES?.servidor ||
      "/servidor",
  };
}

/* =========================================================
   TOAST / EVENTS
========================================================= */

function showToast(
  message = "",
  type = "info"
) {
  const text =
    cleanText(message, "");

  if (!text) return false;

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ];

  for (const toast of candidates) {
    try {
      if (
        isFunction(toast?.[type])
      ) {
        toast[type](text);
        return true;
      }

      if (
        isFunction(toast?.show)
      ) {
        toast.show(text, type);
        return true;
      }
    } catch {
      // siguiente candidato
    }
  }

  return false;
}

function subscribeEvent(
  eventName = "",
  handler = null
) {
  const name =
    cleanText(eventName, "");

  if (
    !name ||
    !isFunction(handler)
  ) {
    return () => {};
  }

  let appBound = false;
  let windowBound = false;

  try {
    if (
      isFunction(
        AppCore?.events?.on
      )
    ) {
      AppCore.events.on(
        name,
        handler
      );

      appBound = true;
    }
  } catch {
    // noop
  }

  try {
    if (isBrowser()) {
      window.addEventListener(
        name,
        handler
      );

      windowBound = true;
    }
  } catch {
    // noop
  }

  return () => {
    try {
      if (
        appBound &&
        isFunction(
          AppCore?.events?.off
        )
      ) {
        AppCore.events.off(
          name,
          handler
        );
      }
    } catch {
      // noop
    }

    try {
      if (
        windowBound &&
        isBrowser()
      ) {
        window.removeEventListener(
          name,
          handler
        );
      }
    } catch {
      // noop
    }
  };
}

function emitEvent(
  eventName = "",
  payload = {}
) {
  const name =
    cleanText(eventName, "");

  if (!name) return false;

  try {
    if (
      isFunction(
        AppCore?.events?.emit
      )
    ) {
      AppCore.events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {
    // fallback DOM
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail: payload,
          }
        )
      );

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function eventPayload(
  event = null
) {
  return safeObject(
    first(
      event?.detail?.detail,
      event?.detail?.payload,
      event?.detail,
      event?.payload,
      event,
      {}
    ),
    {}
  );
}

/* =========================================================
   USER SEARCH ADAPTER
   HTTP sigue viviendo en usuarios.api.js
========================================================= */

function hasSensitiveQuery(
  value = ""
) {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(
  value = ""
) {
  const raw =
    cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  if (
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (hasSensitiveQuery(raw)) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstImageSrc(
  ...values
) {
  const queue = [...values];

  while (queue.length) {
    const value =
      queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (isObject(value)) {
      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.picture,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture
      );

      continue;
    }

    const src =
      safeImageSrc(value);

    if (src) return src;
  }

  return "";
}

function normalizeSearchUser(
  user = {}
) {
  const raw =
    safeObject(user, {});

  let normalized = raw;

  try {
    normalized =
      normalizeUsuarioModel(raw);
  } catch {
    normalized = raw;
  }

  const nested =
    safeObject(raw.raw, {});

  const userId = cleanText(
    first(
      normalized.userId,
      normalized.id,
      normalized.uid,
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.lookup?.userId,
      raw.lookup?.id,
      nested.userId,
      nested.id,
      nested.uid,
      ""
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      normalized.clienteId,
      normalized.clientId,
      normalized.customerId,
      raw.targetClienteId,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.lookup?.clienteId,
      raw.lookup?.clientId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      nested.targetClienteId,
      nested.clienteId,
      nested.clientId,
      nested.customerId,
      ""
    ),
    ""
  );

  const name = cleanText(
    first(
      normalized.displayName,
      normalized.fullName,
      normalized.name,
      normalized.nombre,
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.publicName,
      raw.username,
      userId,
      "Usuario"
    ),
    "Usuario"
  );

  const email =
    normalizeEmail(
      first(
        normalized.email,
        normalized.emailLower,
        raw.email,
        raw.emailLower,
        raw.userEmail,
        raw.lookup?.email,
        nested.email,
        nested.emailLower,
        ""
      )
    );

  const phone =
    cleanText(
      first(
        normalized.phone,
        normalized.telefono,
        normalized.mobile,
        raw.phone,
        raw.telefono,
        raw.mobile,
        raw.movil,
        nested.phone,
        nested.telefono,
        ""
      ),
      ""
    );

  const username =
    cleanText(
      first(
        normalized.username,
        normalized.usernameLower,
        raw.username,
        raw.usernameLower,
        raw.userName,
        nested.username,
        nested.usernameLower,
        ""
      ),
      ""
    );

  const role =
    normalizeRole(
      first(
        normalized.role,
        normalized.rol,
        raw.role,
        raw.rol,
        nested.role,
        nested.rol,
        "user"
      )
    );

  const avatarUrl =
    firstImageSrc(
      normalized,
      raw,
      nested
    );

  return {
    ...raw,
    ...normalized,

    raw,

    id: userId,
    userId,
    uid: userId,
    targetUserId: userId,

    clienteId,
    targetClienteId: clienteId,
    clientId: clienteId,
    customerId: clienteId,

    name,
    nombre: name,
    fullName: name,
    displayName: name,

    email,
    emailLower: email,

    phone,
    telefono: phone,

    username,
    usernameLower:
      username.toLowerCase(),

    role,
    rol: role,

    avatarUrl,
    avatar: avatarUrl || null,
  };
}

function usersListFromPayload(
  payload = null,
  maxDepth = 6
) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const queue = [
    {
      value: payload,
      depth: 0,
    },
  ];

  const seen = new Set();

  while (queue.length) {
    const {
      value,
      depth,
    } = queue.shift();

    if (
      !isObject(value) ||
      seen.has(value) ||
      depth > maxDepth
    ) {
      continue;
    }

    seen.add(value);

    for (const key of [
      "items",
      "results",
      "users",
      "usuarios",
      "rows",
      "records",
      "docs",
      "documents",
      "list",
      "value",
    ]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }

    for (const key of [
      "data",
      "payload",
      "response",
      "result",
      "body",
      "value",
    ]) {
      if (isObject(value[key])) {
        queue.push({
          value: value[key],
          depth: depth + 1,
        });
      }
    }
  }

  return [];
}

function normalizeSearchUsers(
  payload = null
) {
  const rawItems =
    usersListFromPayload(payload);

  let normalizedItems =
    rawItems;

  try {
    normalizedItems =
      normalizeUsuariosCollection(
        rawItems
      );
  } catch {
    normalizedItems =
      rawItems;
  }

  return safeArray(normalizedItems)
    .map(normalizeSearchUser)
    .filter(
      (user) =>
        Boolean(
          user.userId ||
          user.id
        )
    );
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function storeInstance(
  host = null,
  controller = null
) {
  if (!host || !controller) {
    return false;
  }

  INSTANCES.set(
    host,
    controller
  );

  lastInstance =
    controller;

  try {
    getGlobalObject()[
      CLIENTES_GLOBAL_CONTROLLER_KEY
    ] = controller;
  } catch {
    // noop
  }

  return true;
}

function clearInstance(
  host = null,
  controller = null
) {
  if (
    host &&
    INSTANCES.get(host) ===
      controller
  ) {
    INSTANCES.delete(host);
  }

  if (
    lastInstance ===
    controller
  ) {
    lastInstance = null;
  }

  try {
    const global =
      getGlobalObject();

    if (
      global[
        CLIENTES_GLOBAL_CONTROLLER_KEY
      ] === controller
    ) {
      delete global[
        CLIENTES_GLOBAL_CONTROLLER_KEY
      ];
    }
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createClientesController(
  host = null,
  context = {}
) {
  const id =
    ++controllerSequence;

  const cached =
    hydrateClientesFromCache({
      freshOnly: true,
    });

  let destroyed = false;
  let mounted = false;

  let root =
    resolveHost(
      host,
      context
    );

  let currentContext =
    safeObject(context);

  let items =
    normalizeClientesCollection(
      safeArray(cached?.items)
    );

  let total =
    items.length;

  let lastSyncAt =
    number(
      cached?.lastSyncAt,
      0
    );

  let loading = false;
  let refreshing = false;
  let creating = false;
  let loadingMore = false;

  let error = "";
  let filter = "all";
  let search = "";
  let sortOrder =
    DEFAULT_SORT_ORDER;

  let visibleLimit =
    DEFAULT_VISIBLE_LIMIT;

  let openingClienteId = "";

  let renderFrame = 0;
  let modalFrame = 0;
  let loadSeq = 0;
  let searchTimer = 0;
  let userSearchTimer = 0;
  let userSearchSeq = 0;

  let modalHost = null;
  let modalHostBound = false;

  const createModal = {
    open: false,
    submitting: false,
    serverError: "",
    successMessage: "",
    createdClienteId: "",
    errors: {},
    form:
      getCreateFormDefaults(),

    userSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    },
  };

  const disposers = [];

  function assertAlive() {
    return (
      !destroyed &&
      isClientesRoute(
        currentContext
      )
    );
  }

  function setHost(
    nextHost = null
  ) {
    const resolved =
      resolveHost(
        nextHost,
        currentContext
      );

    if (resolved) {
      root = resolved;
    }

    return root;
  }

  function payload(
    extra = {}
  ) {
    return {
      id,
      user:
        getCurrentUser(),

      role:
        getCurrentRole(
          currentContext
        ),

      admin:
        isAdminContext(
          currentContext
        ),

      routes: getRoutes(),
      route:
        getRoutes().clientes,

      context:
        currentContext,

      items,
      clientes: items,
      clients: items,
      rows: items,

      total,
      remoteCount: total,
      count: items.length,

      stats:
        computeClientesStats(
          items
        ),

      lastSyncAt,

      loading,
      refreshing,
      creating,
      loadingMore,
      error,

      filter,
      search,
      sortOrder,
      visibleLimit,
      openingClienteId,

      createModal,

      modals: {
        create:
          createModal,
      },

      apiVersion:
        CLIENTES_API_VERSION,

      indexVersion:
        CLIENTES_INDEX_VERSION,

      ...extra,
    };
  }

  function getSnapshot() {
    return {
      ...payload(),

      items:
        cloneItems(items),

      clientes:
        cloneItems(items),

      clients:
        cloneItems(items),

      rows:
        cloneItems(items),

      mounted,
      destroyed,
    };
  }

  function renderNow() {
    if (
      !root ||
      destroyed
    ) {
      return false;
    }

    cancelFrame(
      renderFrame
    );

    const data =
      payload();

    const initialLoading =
      loading &&
      !items.length;

    const hardError =
      Boolean(error) &&
      !items.length;

    try {
      root.innerHTML =
        initialLoading
          ? renderClientesLoadingState(
              data
            )
          : hardError
            ? renderClientesErrorState(
                data
              )
            : renderClientesTemplate(
                data
              );

      root.dataset.view =
        "clientes";

      root.dataset.controllerId =
        String(id);

      root.dataset.clientesVersion =
        CLIENTES_INDEX_VERSION;

      root.dataset.clientesApiVersion =
        CLIENTES_API_VERSION;

      return true;
    } catch (renderError) {
      error = safeError(
        renderError,
        "No se pudo renderizar la vista de clientes."
      );

      try {
        root.innerHTML =
          renderClientesErrorState({
            ...data,
            error,
          });
      } catch {
        /*
          Boundary final XSS-safe:
          no interpolamos el mensaje en innerHTML.
        */
        root.textContent = error;
      }

      return false;
    }
  }

  function scheduleRender() {
    cancelFrame(
      renderFrame
    );

    renderFrame =
      nextFrame(() =>
        renderNow()
      );

    return renderFrame;
  }

  function setItems(
    nextItems = [],
    {
      syncedAt = Date.now(),
    } = {}
  ) {
    items =
      normalizeClientesCollection(
        nextItems
      );

    total =
      items.length;

    lastSyncAt =
      number(
        syncedAt,
        Date.now()
      );

    error = "";

    return items;
  }

  async function load({
    force = false,
    silent = false,
  } = {}) {
    if (!assertAlive()) {
      return getSnapshot();
    }

    /*
      Un único load por controlador. La API ya tiene dedupe,
      pero aquí evitamos que refresh manual / eventos de UI
      creen carreras visuales innecesarias.
    */
    if (
      loading ||
      refreshing
    ) {
      return getSnapshot();
    }

    const seq =
      ++loadSeq;

    const hadItems =
      items.length > 0;

    loading =
      !silent &&
      !hadItems;

    refreshing =
      Boolean(
        silent ||
        hadItems
      );

    error = "";

    renderNow();

    try {
      const response =
        force
          ? await refreshClientesRequest({
              source:
                "views.clientes.index.refresh",
            })
          : await loadClientesRequest({
              force: false,
              source:
                "views.clientes.index.load",
            });

      if (
        seq !== loadSeq ||
        destroyed
      ) {
        return getSnapshot();
      }

      setItems(
        safeArray(
          response?.items
        ),
        {
          syncedAt:
            response?.lastSyncAt ||
            Date.now(),
        }
      );

      const snapshot =
        getSnapshot();

      emitEvent(
        "clientes:loaded",
        {
          ...snapshot,
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId: id,
        }
      );

      emitEvent(
        "clientes:list:success",
        {
          ...snapshot,
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId: id,
        }
      );

      return snapshot;
    } catch (loadError) {
      if (
        seq !== loadSeq ||
        destroyed
      ) {
        return getSnapshot();
      }

      error =
        safeError(loadError);

      emitEvent(
        "clientes:error",
        {
          error: loadError,
          message: error,
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId: id,
        }
      );

      return getSnapshot();
    } finally {
      if (
        seq === loadSeq &&
        !destroyed
      ) {
        loading = false;
        refreshing = false;
        renderNow();
      }
    }
  }

  async function refresh() {
    return load({
      force: true,
      silent: true,
    });
  }

  function setSearch(
    value = ""
  ) {
    search =
      cleanText(value, "");

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return search;
  }

  function setFilter(
    value = "all"
  ) {
    const next =
      normalizeKey(
        value || "all"
      ) || "all";

    filter =
      [
        "all",
        "active",
        "pending",
        "blocked",
      ].includes(next)
        ? next
        : "all";

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return filter;
  }

  function setSortOrder(
    value = DEFAULT_SORT_ORDER
  ) {
    sortOrder =
      normalizeSortOrder(value);

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return sortOrder;
  }

  function toggleSortOrder() {
    return setSortOrder(
      getNextSortOrder(
        sortOrder
      )
    );
  }

  function clearSearch() {
    return setSearch("");
  }

  function clearFilters() {
    search = "";
    filter = "all";
    sortOrder =
      DEFAULT_SORT_ORDER;

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return true;
  }

  function loadMore(
    limit = null
  ) {
    loadingMore = true;

    visibleLimit =
      clamp(
        number(
          limit,
          visibleLimit +
            VISIBLE_STEP
        ),
        1,
        1000
      );

    scheduleRender();

    if (isBrowser()) {
      window.setTimeout?.(
        () => {
          if (destroyed) return;

          loadingMore = false;
          scheduleRender();
        },
        120
      );
    } else {
      loadingMore = false;
    }

    return visibleLimit;
  }

  /* =======================================================
     CREATE MODAL
  ======================================================= */

  function createModalPayload(
    extra = {}
  ) {
    return {
      ...createModal,

      admin:
        isAdminContext(
          currentContext
        ),

      role:
        getCurrentRole(
          currentContext
        ),

      user:
        getCurrentUser(),

      routes:
        getRoutes(),

      ...extra,
    };
  }

  function modalsOpen() {
    return Boolean(
      createModal.open
    );
  }

  function syncBodyModalClass() {
    if (!isBrowser()) {
      return false;
    }

    try {
      document.body?.classList.toggle(
        "modal-open",
        modalsOpen()
      );

      document.body?.classList.toggle(
        "clientes-modal-open",
        modalsOpen()
      );

      document.body?.classList.toggle(
        "clientes-create-open",
        createModal.open
      );

      return true;
    } catch {
      return false;
    }
  }

  function ensureModalHost() {
    if (!isBrowser()) {
      return null;
    }

    if (
      modalHost?.isConnected
    ) {
      return modalHost;
    }

    modalHost =
      document.querySelector(
        MODAL_HOST_SELECTOR
      ) ||
      document.createElement(
        "div"
      );

    modalHost.setAttribute(
      "data-clientes-modal-host",
      "true"
    );

    modalHost.setAttribute(
      "data-owner",
      CLIENTES_INDEX_VERSION
    );

    if (!modalHost.isConnected) {
      document.body.appendChild(
        modalHost
      );
    }

    if (!modalHostBound) {
      modalHost.addEventListener(
        "click",
        handleModalClick,
        true
      );

      modalHost.addEventListener(
        "submit",
        handleModalSubmit,
        true
      );

      modalHost.addEventListener(
        "input",
        handleModalInput,
        true
      );

      modalHost.addEventListener(
        "change",
        handleModalInput,
        true
      );

      modalHost.addEventListener(
        "keydown",
        handleModalKeydown,
        true
      );

      modalHostBound = true;
    }

    return modalHost;
  }

  function readCreateForm(
    formNode = null
  ) {
    const output = {
      ...safeObject(
        createModal.form
      ),
    };

    if (!formNode) {
      return output;
    }

    const fields =
      Array.from(
        formNode.querySelectorAll(
          "[data-field][name], [data-field]"
        ) || []
      );

    for (const field of fields) {
      const name =
        cleanText(
          field.getAttribute?.(
            "data-field"
          ) ||
            field.getAttribute?.(
              "name"
            ) ||
            "",
          ""
        );

      if (!name) continue;

      const tagName =
        cleanText(
          field.tagName,
          ""
        ).toLowerCase();

      const type =
        cleanText(
          field.type,
          ""
        ).toLowerCase();

      if (
        tagName === "input" &&
        type === "checkbox"
      ) {
        output[name] =
          Boolean(
            field.checked
          );

        continue;
      }

      if (
        tagName === "input" &&
        type === "radio"
      ) {
        if (field.checked) {
          output[name] =
            field.value;
        }

        continue;
      }

      if ("value" in field) {
        output[name] =
          field.value;
      }
    }

    output.userId =
      cleanText(
        first(
          output.userId,
          output.targetUserId
        ),
        ""
      );

    output.targetUserId =
      cleanText(
        first(
          output.targetUserId,
          output.userId
        ),
        ""
      );

    output.clienteTipo =
      normalizeKey(
        first(
          output.clienteTipo,
          output.tipo,
          "empresa"
        )
      );

    output.segmento =
      normalizeKey(
        first(
          output.segmento,
          output.tipo,
          "empresa"
        )
      );

    output.status =
      normalizeKey(
        first(
          output.status,
          "active"
        )
      );

    output.estado =
      normalizeKey(
        first(
          output.estado,
          "activo"
        )
      );

    output.active =
      output.active === true ||
      output.active === "true" ||
      output.active === "1" ||
      output.active === 1;

    for (const key of [
      "porcentajeIVA",
      "porcentajeIRPF",
      "paymentTermsDays",
    ]) {
      output[key] =
        number(
          output[key],
          key ===
            "paymentTermsDays"
            ? 30
            : 0
        );
    }

    return output;
  }

  function patchCreateForm(
    patch = {}
  ) {
    createModal.form = {
      ...safeObject(
        createModal.form
      ),
      ...safeObject(patch),
    };

    return createModal.form;
  }

  function captureModalFocus(
    hostNode = null
  ) {
    if (
      !hostNode ||
      !isBrowser()
    ) {
      return null;
    }

    const active =
      document.activeElement;

    if (
      !active ||
      !hostNode.contains(active)
    ) {
      return null;
    }

    const field =
      cleanText(
        active.getAttribute?.(
          "data-field"
        ),
        ""
      );

    if (!field) {
      return null;
    }

    return {
      field,
      start:
        Number.isInteger(
          active.selectionStart
        )
          ? active.selectionStart
          : null,

      end:
        Number.isInteger(
          active.selectionEnd
        )
          ? active.selectionEnd
          : null,
    };
  }

  function restoreModalFocus(
    hostNode = null,
    snapshot = null
  ) {
    if (
      !hostNode ||
      !snapshot?.field
    ) {
      return false;
    }

    const candidates =
      hostNode.querySelectorAll?.(
        "[data-field]"
      ) || [];

    const target =
      Array.from(candidates)
        .find(
          (node) =>
            cleanText(
              node.getAttribute?.(
                "data-field"
              ),
              ""
            ) ===
            snapshot.field
        );

    if (!target) {
      return false;
    }

    try {
      target.focus?.({
        preventScroll: true,
      });

      if (
        snapshot.start !== null &&
        snapshot.end !== null &&
        isFunction(
          target.setSelectionRange
        )
      ) {
        target.setSelectionRange(
          snapshot.start,
          snapshot.end
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function renderCreateModalNow() {
    const hostNode =
      ensureModalHost();

    if (!hostNode) {
      return false;
    }

    const focusSnapshot =
      captureModalFocus(
        hostNode
      );

    try {
      hostNode.innerHTML =
        createModal.open
          ? renderClientesCreateModal(
              createModalPayload()
            )
          : renderClientesCreateModalClosed();

      syncBodyModalClass();

      if (
        createModal.open &&
        !restoreModalFocus(
          hostNode,
          focusSnapshot
        )
      ) {
        try {
          hostNode
            .querySelector(
              CREATE_MODAL_PANEL_SELECTOR
            )
            ?.focus?.({
              preventScroll: true,
            });
        } catch {
          // noop
        }
      }

      return true;
    } catch (renderError) {
      createModal.serverError =
        safeError(
          renderError,
          "No se pudo renderizar el formulario de cliente."
        );

      /*
        Boundary final seguro si el template falla.
      */
      hostNode.textContent =
        createModal.serverError;

      syncBodyModalClass();

      return false;
    }
  }

  function scheduleCreateModalRender() {
    cancelFrame(
      modalFrame
    );

    modalFrame =
      nextFrame(() =>
        renderCreateModalNow()
      );

    return modalFrame;
  }

  function resetCreateModalForm() {
    createModal.submitting = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdClienteId = "";
    createModal.errors = {};

    createModal.form =
      getCreateFormDefaults();

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    return createModal;
  }

  function openCreate() {
    if (
      !isAdminContext(
        currentContext
      )
    ) {
      showToast(
        "No tienes permisos para crear clientes.",
        "error"
      );

      return false;
    }

    resetCreateModalForm();

    createModal.open = true;
    creating = true;

    scheduleRender();
    renderCreateModalNow();

    creating = false;
    scheduleRender();

    emitEvent(
      "clientes:create:open",
      {
        source:
          CLIENTES_INDEX_SOURCE,
        controllerId: id,
      }
    );

    return true;
  }

  function closeCreate({
    reset = true,
    emit = true,
    renderView = true,
  } = {}) {
    createModal.open = false;
    createModal.submitting = false;

    if (reset) {
      resetCreateModalForm();
    }

    if (isBrowser()) {
      window.clearTimeout?.(
        userSearchTimer
      );
    }

    scheduleCreateModalRender();

    if (renderView) {
      scheduleRender();
    }

    if (emit) {
      emitEvent(
        "clientes:create:closed",
        {
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId: id,
        }
      );
    }

    return true;
  }

  function autoReplace(
    current = "",
    previous = "",
    next = ""
  ) {
    const currentText =
      cleanText(current, "");

    const previousText =
      cleanText(previous, "");

    if (
      !currentText ||
      (
        previousText &&
        currentText ===
          previousText
      )
    ) {
      return next;
    }

    return current;
  }

  function selectCreateUserFromNode(
    node = null
  ) {
    if (!node) return false;

    const previous =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
          {}
      );

    const selectedUser =
      normalizeSearchUser({
        userId:
          node.dataset.userId ||
          "",

        clienteId:
          node.dataset
            .userClienteId ||
          node.dataset
            .clienteId ||
          "",

        displayName:
          node.dataset.userName ||
          "",

        email:
          node.dataset.userEmail ||
          node.dataset.email ||
          "",

        phone:
          node.dataset.userPhone ||
          "",

        username:
          node.dataset
            .userUsername ||
          "",

        avatarUrl:
          node.dataset.userAvatar ||
          "",
      });

    const name =
      cleanText(
        selectedUser.displayName ||
          selectedUser.name,
        ""
      );

    const email =
      normalizeEmail(
        selectedUser.email
      );

    const phone =
      cleanText(
        selectedUser.phone ||
          selectedUser.telefono,
        ""
      );

    const username =
      cleanText(
        selectedUser.username ||
          selectedUser.usernameLower,
        ""
      ).toLowerCase();

    patchCreateForm({
      targetUserId:
        selectedUser.userId ||
        selectedUser.id,

      userId:
        selectedUser.userId ||
        selectedUser.id,

      targetClienteId:
        selectedUser.clienteId ||
        selectedUser.targetClienteId ||
        "",

      targetUserName: name,
      targetUserEmail: email,
      targetUserPhone: phone,
      targetUsername: username,

      targetUserAvatar:
        selectedUser.avatarUrl ||
        selectedUser.avatar ||
        "",

      contactoNombre:
        autoReplace(
          createModal.form
            .contactoNombre,
          previous.displayName ||
            previous.name,
          name
        ),

      contactoEmail:
        autoReplace(
          normalizeEmail(
            createModal.form
              .contactoEmail
          ),
          normalizeEmail(
            previous.email
          ),
          email
        ),

      contactoPhone:
        autoReplace(
          createModal.form
            .contactoPhone,
          previous.phone ||
            previous.telefono,
          phone
        ),

      emailFacturacion:
        autoReplace(
          normalizeEmail(
            createModal.form
              .emailFacturacion
          ),
          normalizeEmail(
            previous.email
          ),
          email
        ),

      username:
        autoReplace(
          createModal.form
            .username,
          previous.username,
          username
        ),

      slug:
        autoReplace(
          createModal.form.slug,
          previous.username,
          username
        ),
    });

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser,
      empty: false,
    };

    createModal.errors = {
      ...safeObject(
        createModal.errors
      ),
      userId: "",
      targetUserId: "",
      targetUser: "",
    };

    scheduleCreateModalRender();

    return true;
  }

  function clearCreateUser() {
    const selected =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
          {}
      );

    const patch = {
      targetUserId: "",
      userId: "",
      targetClienteId: "",
      targetUserName: "",
      targetUserEmail: "",
      targetUserPhone: "",
      targetUsername: "",
      targetUserAvatar: "",
    };

    /*
      Si un dato fue autocompletado desde el usuario seleccionado,
      lo limpiamos. Si el admin lo editó manualmente, se conserva.
    */
    if (
      cleanText(
        createModal.form
          .contactoNombre,
        ""
      ) ===
      cleanText(
        selected.displayName ||
          selected.name,
        ""
      )
    ) {
      patch.contactoNombre = "";
    }

    if (
      normalizeEmail(
        createModal.form
          .contactoEmail
      ) ===
      normalizeEmail(
        selected.email
      )
    ) {
      patch.contactoEmail = "";
      patch.email = "";
      patch.emailCliente = "";
    }

    if (
      cleanText(
        createModal.form
          .contactoPhone,
        ""
      ) ===
      cleanText(
        selected.phone ||
          selected.telefono,
        ""
      )
    ) {
      patch.contactoPhone = "";
      patch.phone = "";
      patch.telefono = "";
    }

    if (
      normalizeEmail(
        createModal.form
          .emailFacturacion
      ) ===
      normalizeEmail(
        selected.email
      )
    ) {
      patch.emailFacturacion = "";
    }

    if (
      cleanText(
        createModal.form.username,
        ""
      ) ===
      cleanText(
        selected.username,
        ""
      )
    ) {
      patch.username = "";
    }

    if (
      cleanText(
        createModal.form.slug,
        ""
      ) ===
      cleanText(
        selected.username,
        ""
      )
    ) {
      patch.slug = "";
    }

    patchCreateForm(patch);

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    scheduleCreateModalRender();

    return true;
  }

  function copySelectedUserContact() {
    const user =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
          {}
      );

    if (
      !user.userId &&
      !user.id
    ) {
      return false;
    }

    patchCreateForm({
      contactoNombre:
        cleanText(
          first(
            user.displayName,
            user.name,
            createModal.form
              .contactoNombre
          ),
          createModal.form
            .contactoNombre
        ),

      contactoEmail:
        normalizeEmail(
          first(
            user.email,
            createModal.form
              .contactoEmail
          )
        ),

      contactoPhone:
        cleanText(
          first(
            user.phone,
            user.telefono,
            createModal.form
              .contactoPhone
          ),
          createModal.form
            .contactoPhone
        ),

      emailFacturacion:
        normalizeEmail(
          first(
            user.email,
            createModal.form
              .emailFacturacion
          )
        ),

      username:
        cleanText(
          first(
            user.username,
            createModal.form
              .username
          ),
          createModal.form
            .username
        ).toLowerCase(),

      slug:
        cleanText(
          first(
            user.username,
            createModal.form.slug
          ),
          createModal.form.slug
        ).toLowerCase(),
    });

    scheduleCreateModalRender();

    return true;
  }

  async function searchCreateUsers(
    query = ""
  ) {
    const q =
      cleanText(query, "");

    const seq =
      ++userSearchSeq;

    createModal.userSearch.query =
      q;

    createModal.userSearch.error =
      "";

    createModal.userSearch.empty =
      false;

    if (
      q.length <
      USER_SEARCH_MIN_LENGTH
    ) {
      createModal.userSearch.loading =
        false;

      createModal.userSearch.results =
        [];

      scheduleCreateModalRender();

      return [];
    }

    createModal.userSearch.loading =
      true;

    scheduleCreateModalRender();

    try {
      /*
        Importante:
        index.js NO toca Http.
        La red de Usuarios vive en usuarios.api.js.
      */
      const response =
        await fetchUsuariosRequest({
          all: false,
          limit:
            USER_SEARCH_LIMIT,
          includeTotal: false,
          search: q,
          q,
          timeout: 15_000,
        });

      if (
        seq !==
          userSearchSeq ||
        destroyed
      ) {
        return [];
      }

      const results =
        normalizeSearchUsers(
          response
        ).slice(
          0,
          USER_SEARCH_LIMIT
        );

      createModal.userSearch.loading =
        false;

      createModal.userSearch.error =
        "";

      createModal.userSearch.results =
        results;

      createModal.userSearch.empty =
        results.length === 0;

      scheduleCreateModalRender();

      return results;
    } catch (searchError) {
      if (
        seq !==
          userSearchSeq ||
        destroyed
      ) {
        return [];
      }

      createModal.userSearch.loading =
        false;

      createModal.userSearch.error =
        safeError(
          searchError,
          "No se pudieron buscar usuarios."
        );

      createModal.userSearch.results =
        [];

      createModal.userSearch.empty =
        false;

      scheduleCreateModalRender();

      return [];
    }
  }

  async function submitCreate(
    formNode = null
  ) {
    if (
      createModal.submitting
    ) {
      return false;
    }

    if (
      !isAdminContext(
        currentContext
      )
    ) {
      createModal.serverError =
        "No tienes permisos para crear clientes.";

      scheduleCreateModalRender();

      return false;
    }

    const form =
      readCreateForm(formNode);

    const validation =
      validateCreateForm(form);

    createModal.form =
      validation.form ||
      form;

    createModal.errors =
      safeObject(
        validation.errors
      );

    createModal.serverError =
      "";

    createModal.successMessage =
      "";

    if (!validation.valid) {
      scheduleCreateModalRender();
      return false;
    }

    createModal.submitting =
      true;

    scheduleCreateModalRender();

    try {
      const payloadToCreate =
        validation.payload ||
        buildClienteCreatePayload(
          validation.form ||
          form
        );

      /*
        clientes.api.js v3 reduce este VM al payload real
        que admite POST /api/clientes.
      */
      const created =
        await createClienteRequest(
          payloadToCreate,
          {
            source:
              "views.clientes.index.create",
          }
        );

      const createdId =
        cleanText(
          first(
            created?.clienteId,
            created?.id,
            created?.data
              ?.clienteId,
            created?.data?.id,
            ""
          ),
          ""
        );

      if (!createdId) {
        throw new Error(
          "CLIENTE_CREATE_ID_MISSING"
        );
      }

      /*
        MUY IMPORTANTE:
        `created` es un ACK, no un cliente.
        Nunca lo normalizamos ni lo insertamos en la tabla.
      */
      let finalDetail = null;

      try {
        finalDetail =
          await loadClienteDetailRequest(
            createdId,
            {
              dedupe: true,
            }
          );
      } catch {
        /*
          Cosmos puede tardar un instante en quedar disponible.
          El refresh posterior será la fuente de verdad.
        */
        finalDetail = null;
      }

      if (finalDetail) {
        setItems(
          [
            finalDetail,
            ...items,
          ],
          {
            syncedAt:
              Date.now(),
          }
        );
      }

      createModal.submitting =
        false;

      createModal.createdClienteId =
        createdId;

      createModal.successMessage =
        `Cliente ${createdId} creado correctamente.`;

      createModal.serverError =
        "";

      createModal.errors = {};

      emitEvent(
        "clientes:create:success",
        {
          cliente:
            finalDetail,

          detail:
            finalDetail,

          clienteId:
            createdId,

          response:
            created,

          draft:
            payloadToCreate,

          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );

      showToast(
        createModal.successMessage,
        "success"
      );

      /*
        El handler global ignora nuestros propios eventos,
        por tanto aquí hay UN solo refresh.
      */
      closeCreate({
        reset: true,
        emit: true,
      });

      await refresh();

      return true;
    } catch (submitError) {
      createModal.submitting =
        false;

      createModal.serverError =
        safeError(
          submitError,
          "No se pudo crear el cliente."
        );

      createModal.successMessage =
        "";

      scheduleCreateModalRender();

      showToast(
        createModal.serverError,
        "error"
      );

      return false;
    }
  }

  function createActionFromTarget(
    target = null
  ) {
    if (!isElementNode(target)) {
      return null;
    }

    const actionable =
      target.closest(
        "[data-create-action]"
      );

    if (
      !actionable ||
      !modalHost?.contains?.(
        actionable
      )
    ) {
      return null;
    }

    return {
      element:
        actionable,

      action:
        cleanText(
          actionable.getAttribute(
            "data-create-action"
          ) || "",
          ""
        ),
    };
  }

  async function handleModalClick(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const overlay =
      event.target?.closest?.(
        CREATE_MODAL_OVERLAY_SELECTOR
      );

    if (
      overlay &&
      event.target === overlay &&
      createModal.open &&
      !createModal.submitting
    ) {
      event.preventDefault();
      closeCreate();
      return;
    }

    const info =
      createActionFromTarget(
        event.target
      );

    if (!info?.action) {
      return;
    }

    const {
      element,
      action,
    } = info;

    if (
      Object.values(
        CREATE_ACTIONS
      ).includes(action)
    ) {
      event.preventDefault();
    }

    if (
      action ===
      CREATE_ACTIONS.CLOSE
    ) {
      if (
        !createModal.submitting
      ) {
        closeCreate();
      }

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.SUBMIT
    ) {
      const form =
        element.closest("form") ||
        modalHost.querySelector(
          "[data-clientes-create-form='true']"
        );

      await submitCreate(form);

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.USER_SELECT
    ) {
      selectCreateUserFromNode(
        element
      );

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.USER_CLEAR
    ) {
      clearCreateUser();
      return;
    }

    if (
      action ===
      CREATE_ACTIONS.COPY_USER_CONTACT
    ) {
      copySelectedUserContact();
      return;
    }

    /*
      BILLING_TOGGLE queda cubierto por el change/input
      de los checkboxes; no se dispara una mutación HTTP.
    */
  }

  function handleModalSubmit(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const form =
      event.target?.closest?.(
        "[data-clientes-create-form='true']"
      );

    if (!form) return;

    event.preventDefault();

    void submitCreate(form);
  }

  function handleModalInput(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const target =
      event.target;

    if (
      !isElementNode(target)
    ) {
      return;
    }

    const field =
      cleanText(
        target.getAttribute(
          "data-field"
        ) ||
          target.getAttribute(
            "name"
          ) ||
          "",
        ""
      );

    if (!field) return;

    if (
      field ===
      "targetUserSearch"
    ) {
      const query =
        target.value || "";

      createModal.userSearch.query =
        query;

      if (isBrowser()) {
        window.clearTimeout?.(
          userSearchTimer
        );

        userSearchTimer =
          window.setTimeout?.(
            () =>
              searchCreateUsers(
                query
              ),
            USER_SEARCH_DEBOUNCE_MS
          );
      }

      return;
    }

    const type =
      cleanText(
        target.type,
        ""
      ).toLowerCase();

    const value =
      type === "checkbox"
        ? Boolean(
            target.checked
          )
        : target.value;

    patchCreateForm({
      [field]: value,
    });

    if (field === "tipo") {
      patchCreateForm({
        clienteTipo: value,
        segmento: value,
      });

      /*
        Cambian labels y defaults visuales.
        Restauramos el foco tras el repaint.
      */
      scheduleCreateModalRender();
    }

    if (
      field ===
      "contactoEmail"
    ) {
      patchCreateForm({
        email: value,
        emailCliente: value,

        emailFacturacion:
          createModal.form
            .emailFacturacion ||
          value,
      });
    }

    if (
      field ===
      "contactoPhone"
    ) {
      patchCreateForm({
        phone: value,
        telefono: value,
      });
    }
  }

  function handleModalKeydown(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    if (
      event.key === "Escape" &&
      createModal.open &&
      !createModal.submitting
    ) {
      event.preventDefault();
      closeCreate();
    }
  }

  /* =======================================================
     DETAIL
  ======================================================= */

  async function openCliente(
    idValue = "",
    detail = null
  ) {
    const clienteId =
      cleanText(
        idValue ||
          getClienteId(detail),
        ""
      );

    let current =
      detail ||
      findClienteByIdApi(
        items,
        clienteId
      );

    openingClienteId =
      clienteId;

    scheduleRender();

    try {
      /*
        El backend actual marca GET /api/clientes/:id como detalle admin.
        Un usuario normal abre el snapshot que ya tiene en la tabla
        y no provoca un 403 innecesario.
      */
      if (
        clienteId &&
        isAdminContext(
          currentContext
        )
      ) {
        try {
          current =
            await loadClienteDetailRequest(
              clienteId,
              {
                dedupe: true,
              }
            );
        } catch {
          // fallback al dato visible
        }
      }

      if (!current) {
        showToast(
          "No se pudo abrir el cliente.",
          "error"
        );

        return false;
      }

      const normalized =
        canonicalCliente(current);

      try {
        const opened =
          openClientesDetailModal(
            normalized
          );

        if (opened !== false) {
          return true;
        }
      } catch {
        // fallback por evento
      }

      emitEvent(
        "clientes:modal:open",
        {
          detail:
            normalized,

          cliente:
            normalized,

          client:
            normalized,

          clienteId:
            getClienteId(
              normalized
            ),

          id:
            getClienteId(
              normalized
            ),

          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );

      return true;
    } finally {
      openingClienteId = "";
      scheduleRender();
    }
  }

  /* =======================================================
     CSV
  ======================================================= */

  function exportCsv() {
    const rows =
      filterClientesForView(
        items,
        {
          filter,
          search,
          sortOrder,
        }
      );

    const headers = [
      "ID",
      "Código",
      "Nombre",
      "Email",
      "Teléfono",
      "Ciudad",
      "NIF",
      "Estado",
      "Tipo",
      "Importe",
    ];

    const csvRows = [
      headers,
    ];

    for (const item of rows) {
      csvRows.push([
        getClienteId(item),
        getClienteCode(item),
        getClienteName(item),
        getClienteEmail(item),
        getClientePhone(item),
        getClienteCity(item),
        getClienteNif(item),
        getClienteStatus(item),
        getClienteType(item),
        String(
          getClienteAmount(item)
        ).replace(".", ","),
      ]);
    }

    const csv =
      csvRows
        .map((row) =>
          row
            .map(escapeCsv)
            .join(";")
        )
        .join("\n");

    if (!isBrowser()) {
      return csv;
    }

    try {
      const blob =
        new Blob(
          [`\ufeff${csv}`],
          {
            type:
              "text/csv;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;

      link.download =
        `clientes-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;

      link.rel = "noopener";

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        1000
      );

      showToast(
        "Clientes exportados.",
        "success"
      );

      return true;
    } catch {
      return csv;
    }
  }

  /* =======================================================
     ROOT EVENTS
  ======================================================= */

  function actionFromTarget(
    target = null
  ) {
    if (!isElementNode(target)) {
      return null;
    }

    const actionable =
      target.closest(
        "[data-clientes-action], [data-action]"
      );

    if (
      !actionable ||
      !root?.contains?.(
        actionable
      )
    ) {
      return null;
    }

    return {
      element:
        actionable,

      action:
        cleanText(
          actionable.getAttribute(
            "data-clientes-action"
          ) ||
            actionable.getAttribute(
              "data-action"
            ) ||
            "",
          ""
        ),
    };
  }

  async function handleClick(
    event
  ) {
    const info =
      actionFromTarget(
        event.target
      );

    if (!info?.action) {
      return;
    }

    const {
      element,
      action,
    } = info;

    const managedActions = [
      CLIENTES_ACTIONS.OPEN_DETAIL,
      "detail",
      "open-client",
      "open-cliente",

      CLIENTES_ACTIONS.CREATE_OPEN,
      "create",
      "create-client",
      "create-cliente",

      CLIENTES_ACTIONS.REFRESH,
      "retry",

      CLIENTES_ACTIONS.EXPORT,
      "export-csv",

      CLIENTES_ACTIONS.FILTER,
      CLIENTES_ACTIONS.SORT_TOGGLE,
      CLIENTES_ACTIONS.CLEAR_SEARCH,
      CLIENTES_ACTIONS.CLEAR_FILTERS,
      CLIENTES_ACTIONS.LOAD_MORE,
    ];

    if (
      managedActions.includes(
        action
      )
    ) {
      event.preventDefault();
    }

    if (
      [
        CLIENTES_ACTIONS.OPEN_DETAIL,
        "detail",
        "open-client",
        "open-cliente",
      ].includes(action)
    ) {
      const row =
        element.closest(
          "[data-client-id], [data-cliente-id]"
        );

      const idTarget =
        element.getAttribute(
          "data-client-id"
        ) ||
        element.getAttribute(
          "data-cliente-id"
        ) ||
        row?.getAttribute(
          "data-client-id"
        ) ||
        row?.getAttribute(
          "data-cliente-id"
        ) ||
        "";

      await openCliente(
        idTarget
      );

      return;
    }

    if (
      [
        CLIENTES_ACTIONS.CREATE_OPEN,
        "create",
        "create-client",
        "create-cliente",
      ].includes(action)
    ) {
      openCreate();
      return;
    }

    if (
      [
        CLIENTES_ACTIONS.REFRESH,
        "retry",
      ].includes(action)
    ) {
      await refresh();
      return;
    }

    if (
      [
        CLIENTES_ACTIONS.EXPORT,
        "export-csv",
      ].includes(action)
    ) {
      exportCsv();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS.FILTER
    ) {
      setFilter(
        element.getAttribute(
          "data-filter"
        ) || "all"
      );

      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS.SORT_TOGGLE
    ) {
      setSortOrder(
        element.getAttribute(
          "data-next-sort-order"
        ) ||
          getNextSortOrder(
            sortOrder
          )
      );

      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS.CLEAR_SEARCH
    ) {
      clearSearch();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS.CLEAR_FILTERS
    ) {
      clearFilters();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS.LOAD_MORE
    ) {
      loadMore(
        element.getAttribute(
          "data-visible-limit"
        )
      );
    }
  }

  function handleInput(
    event
  ) {
    const target =
      event.target;

    if (
      !isElementNode(target)
    ) {
      return;
    }

    const isSearch =
      target.matches?.(
        "[data-clientes-search-input]"
      ) ||
      target.matches?.(
        "[data-clientes-search-input='true']"
      ) ||
      target.matches?.(
        "[data-clientes-field='search']"
      ) ||
      target.matches?.(
        "[data-search-input='clientes']"
      );

    if (!isSearch) return;

    if (isBrowser()) {
      window.clearTimeout?.(
        searchTimer
      );

      searchTimer =
        window.setTimeout?.(
          () =>
            setSearch(
              target.value
            ),
          SEARCH_DEBOUNCE_MS
        );
    } else {
      setSearch(
        target.value
      );
    }
  }

  function handleKeydown(
    event
  ) {
    const target =
      event.target;

    if (
      !isElementNode(target)
    ) {
      return;
    }

    if (
      event.key === "Enter"
    ) {
      const row =
        target.closest(
          "[data-client-row='true'], [data-cliente-row='true']"
        );

      if (row) {
        event.preventDefault();

        const idTarget =
          row.getAttribute(
            "data-client-id"
          ) ||
          row.getAttribute(
            "data-cliente-id"
          ) ||
          "";

        void openCliente(
          idTarget
        );
      }
    }
  }

  function handleExternalCreateSuccess(
    event = null
  ) {
    const data =
      eventPayload(event);

    /*
      Evita el doble refresh que tenía el controlador anterior:
      submitCreate() refresca una vez y su propio evento no vuelve
      a disparar otra petición.
    */
    if (
      data.source ===
        CLIENTES_INDEX_SOURCE &&
      data.controllerId === id
    ) {
      return;
    }

    void refresh();
  }

  function handleRouteEvent(
    event = null
  ) {
    const data =
      eventPayload(event);

    if (
      isObject(data) &&
      (
        data.path ||
        data.routePath ||
        data.canonicalPath
      )
    ) {
      currentContext = {
        ...currentContext,
        ...data,
      };
    }

    if (
      !isClientesRoute(
        currentContext
      )
    ) {
      if (createModal.open) {
        closeCreate({
          reset: true,
          emit: false,
          renderView: false,
        });
      }

      return;
    }

    scheduleRender();
  }

  function attach() {
    if (
      !root ||
      mounted
    ) {
      return false;
    }

    root.addEventListener(
      "click",
      handleClick
    );

    root.addEventListener(
      "input",
      handleInput
    );

    root.addEventListener(
      "keydown",
      handleKeydown
    );

    for (
      const eventName of
      CREATE_SUCCESS_EVENTS
    ) {
      disposers.push(
        subscribeEvent(
          eventName,
          handleExternalCreateSuccess
        )
      );
    }

    for (
      const eventName of
      CREATE_CLOSE_EVENTS
    ) {
      disposers.push(
        subscribeEvent(
          eventName,
          () =>
            scheduleRender()
        )
      );
    }

    for (
      const eventName of
      DETAIL_CLOSE_EVENTS
    ) {
      disposers.push(
        subscribeEvent(
          eventName,
          () =>
            scheduleRender()
        )
      );
    }

    disposers.push(
      subscribeEvent(
        "route:changed",
        handleRouteEvent
      )
    );

    disposers.push(
      subscribeEvent(
        "router:navigated",
        handleRouteEvent
      )
    );

    mounted = true;

    return true;
  }

  function detach() {
    if (!root) {
      mounted = false;
      return false;
    }

    try {
      root.removeEventListener(
        "click",
        handleClick
      );

      root.removeEventListener(
        "input",
        handleInput
      );

      root.removeEventListener(
        "keydown",
        handleKeydown
      );
    } catch {
      // noop
    }

    for (
      const dispose of
      disposers.splice(0)
    ) {
      try {
        dispose?.();
      } catch {
        // noop
      }
    }

    if (isBrowser()) {
      window.clearTimeout?.(
        searchTimer
      );

      window.clearTimeout?.(
        userSearchTimer
      );
    }

    try {
      if (
        modalHost &&
        modalHostBound
      ) {
        modalHost.removeEventListener(
          "click",
          handleModalClick,
          true
        );

        modalHost.removeEventListener(
          "submit",
          handleModalSubmit,
          true
        );

        modalHost.removeEventListener(
          "input",
          handleModalInput,
          true
        );

        modalHost.removeEventListener(
          "change",
          handleModalInput,
          true
        );

        modalHost.removeEventListener(
          "keydown",
          handleModalKeydown,
          true
        );

        modalHostBound = false;
      }
    } catch {
      // noop
    }

    mounted = false;

    return true;
  }

  async function mount(
    nextHost = null,
    nextContext = {}
  ) {
    if (destroyed) {
      return getSnapshot();
    }

    currentContext = {
      ...currentContext,
      ...safeObject(
        nextContext
      ),
    };

    setHost(nextHost);

    if (!root) {
      throw new Error(
        "CLIENTES_HOST_NOT_FOUND"
      );
    }

    if (
      !isClientesRoute(
        currentContext
      )
    ) {
      return getSnapshot();
    }

    attach();
    renderNow();

    if (!items.length) {
      await load({
        force: false,
        silent: false,
      });
    } else {
      /*
        Paint inmediato desde cache API y refresh silencioso.
      */
      void load({
        force: false,
        silent: true,
      });
    }

    return getSnapshot();
  }

  async function render(
    nextHost = null,
    nextContext = {}
  ) {
    return mount(
      nextHost,
      nextContext
    );
  }

  async function destroy({
    clear = true,
  } = {}) {
    if (destroyed) {
      return true;
    }

    destroyed = true;

    loadSeq += 1;
    userSearchSeq += 1;

    cancelFrame(
      renderFrame
    );

    cancelFrame(
      modalFrame
    );

    detach();

    try {
      closeClientesDetailModal();
    } catch {
      // noop
    }

    try {
      if (modalHost) {
        modalHost.innerHTML = "";
        modalHost.remove?.();
      }

      createModal.open = false;
      syncBodyModalClass();
    } catch {
      // noop
    }

    if (
      clear &&
      root
    ) {
      root.innerHTML = "";
    }

    clearInstance(
      root,
      controller
    );

    return true;
  }

  const controller = {
    id,

    get state() {
      return {
        id,
        host: root,
        context:
          currentContext,

        items,
        total,
        remoteCount: total,
        lastSyncAt,

        loading,
        refreshing,
        creating,
        loadingMore,
        error,

        search,
        filter,
        sortOrder,
        visibleLimit,
        openingClienteId,

        mounted,
        destroyed,

        apiVersion:
          CLIENTES_API_VERSION,

        indexVersion:
          CLIENTES_INDEX_VERSION,
      };
    },

    getSnapshot,
    getState:
      getSnapshot,

    mount,
    render,
    init: mount,
    bootstrap: mount,

    load,
    reload: refresh,
    refresh,

    setSearch,
    setFilter,
    setSortOrder,
    toggleSortOrder,
    clearSearch,
    clearFilters,
    loadMore,

    openCliente,
    openClient:
      openCliente,

    openCreate,
    createCliente:
      openCreate,

    createClient:
      openCreate,

    exportCsv,

    destroy,
    unmount: destroy,
    dispose: destroy,
  };

  return controller;
}

/* =========================================================
   PUBLIC API
========================================================= */

function ensureController(
  host = null,
  context = {}
) {
  const resolvedHost =
    resolveHost(
      host,
      context
    );

  if (resolvedHost) {
    const existing =
      INSTANCES.get(
        resolvedHost
      );

    if (
      existing &&
      !existing.state.destroyed
    ) {
      return existing;
    }

    /*
      Si el Router ha reemplazado el host DOM, no dejamos
      un controlador antiguo vivo con listeners/modales propios.
    */
    if (
      lastInstance &&
      !lastInstance.state.destroyed &&
      lastInstance.state.host &&
      lastInstance.state.host !==
        resolvedHost
    ) {
      void lastInstance
        .destroy({
          clear: false,
        })
        .catch?.(
          () => {}
        );
    }
  }

  if (
    lastInstance &&
    !lastInstance.state.destroyed &&
    !host
  ) {
    return lastInstance;
  }

  const controller =
    createClientesController(
      resolvedHost,
      context
    );

  if (resolvedHost) {
    storeInstance(
      resolvedHost,
      controller
    );
  } else {
    lastInstance =
      controller;
  }

  return controller;
}

function parseInitArgs(
  hostOrContext = null,
  maybeContext = {}
) {
  const host =
    isDomNode(hostOrContext)
      ? hostOrContext
      : null;

  const context =
    isDomNode(hostOrContext)
      ? safeObject(
          maybeContext
        )
      : safeObject(
          hostOrContext
        );

  return {
    host,
    context,
  };
}

export async function init(
  hostOrContext = null,
  maybeContext = {}
) {
  const {
    host,
    context,
  } = parseInitArgs(
    hostOrContext,
    maybeContext
  );

  const controller =
    ensureController(
      host,
      context
    );

  return controller.mount(
    host,
    context
  );
}

export async function mount(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function bootstrap(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function render(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function reload() {
  return ensureController()
    .refresh();
}

export async function refresh() {
  return ensureController()
    .refresh();
}

export async function destroy(
  options = {}
) {
  if (!lastInstance) {
    return true;
  }

  return lastInstance.destroy(
    options
  );
}

export async function unmount(
  options = {}
) {
  return destroy(options);
}

export async function dispose(
  options = {}
) {
  return destroy(options);
}

export function getClientes() {
  return cloneItems(
    ensureController()
      .state.items
  );
}

export function getItems() {
  return getClientes();
}

export function getClientesCount() {
  return ensureController()
    .state.items.length;
}

export function hasClientes() {
  return (
    getClientesCount() > 0
  );
}

export function getState() {
  return ensureController()
    .getSnapshot();
}

export function getSnapshot() {
  return getState();
}

export function getClienteById(
  id = ""
) {
  return findClienteByIdApi(
    ensureController()
      .state.items,
    id
  );
}

export function setClientesSearch(
  value = ""
) {
  return ensureController()
    .setSearch(value);
}

export function setClientesFilter(
  value = "all"
) {
  return ensureController()
    .setFilter(value);
}

export function setClientesSortOrder(
  value = DEFAULT_SORT_ORDER
) {
  return ensureController()
    .setSortOrder(value);
}

export function toggleClientesSortOrder() {
  return ensureController()
    .toggleSortOrder();
}

export function loadMoreClientes(
  limit = null
) {
  return ensureController()
    .loadMore(limit);
}

export async function openCliente(
  id = ""
) {
  return ensureController()
    .openCliente(id);
}

export async function openCreate() {
  return ensureController()
    .openCreate();
}

export async function createCliente() {
  return openCreate();
}

export function exportCsv() {
  return ensureController()
    .exportCsv();
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const ClientesView = {
  version:
    CLIENTES_INDEX_VERSION,

  apiVersion:
    CLIENTES_API_VERSION,

  init,
  mount,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,

  getState,
  getSnapshot,

  getClientes,
  getItems,
  getClientesCount,
  hasClientes,
  getClienteById,

  setSearch:
    setClientesSearch,

  setFilter:
    setClientesFilter,

  setSortOrder:
    setClientesSortOrder,

  toggleSortOrder:
    toggleClientesSortOrder,

  loadMore:
    loadMoreClientes,

  openCliente,
  openClient:
    openCliente,

  openCreate,
  createCliente,

  exportCsv,
};

try {
  const global =
    getGlobalObject();

  global.ClientesView =
    ClientesView;

  global.OnionClientesView =
    ClientesView;

  global.OnionClientes =
    ClientesView;

  if (
    AppCore?.modules &&
    typeof AppCore.modules ===
      "object"
  ) {
    AppCore.modules.Clientes =
      ClientesView;

    AppCore.modules.clientes =
      ClientesView;
  }
} catch {
  // noop
}

export default ClientesView;

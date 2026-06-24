/* =========================================================
   Onion Support - Clientes Index
   Archivo: /src/views/clientes/index.js

   PRODUCTIVO · CONTROLADOR CLIENTES · 1:1 INCIDENCIAS

   Contrato productivo:
   - Controlador único de la vista Clientes.
   - Sin window.fetch propio.
   - Usa clientes.api.js si está disponible y carga correctamente.
   - Si clientes.api.js no carga, cae a Http core contra /api/clientes.
   - Render principal 1:1 con clientes.template.js.
   - Compatible con /clientes y /@usuario/clientes.
   - Sin duplicar controladores.
   - Sin paginación clásica: visibleLimit + load-more.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  renderClientesTemplate,
  renderClientesLoadingState,
  renderClientesErrorState,
  CLIENTES_ACTIONS,
  normalizeClientesCollection,
} from "./clientes.template.js";

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";
export const CLIENTES_INDEX_VERSION = "clientes.index.incidencias-aligned.v2";
export const CLIENTES_VIEW_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_MODULE_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_INDEX_SOURCE = "views.clientes.index";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_FETCH_LIMIT = 250;
export const CLIENTES_MAX_LIMIT = 500;
export const CLIENTES_MAX_PAGES = 20;
export const CLIENTES_CACHE_KEY = "onion.support.clientes.cache.v2";
export const CLIENTES_CACHE_TTL_MS = 60_000;

const DEFAULT_VISIBLE_LIMIT = 20;
const VISIBLE_STEP = 20;
const DEFAULT_SORT_ORDER = "desc";
const SEARCH_DEBOUNCE_MS = 220;

const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";
const INSTANCES = new WeakMap();
const CLIENTES_GLOBAL_CONTROLLER_KEY = Symbol.for("onion.support.clientes.active-controller");

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
let apiImportPromise = null;
let apiImportError = null;
let createModalImportPromise = null;
let detailModalImportPromise = null;

let memoryCache = {
  items: [],
  remoteCount: 0,
  lastSyncAt: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDomNode(value = null) {
  return Boolean(typeof Node !== "undefined" && value && value instanceof Node);
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
  Importante: no se aplanan arrays.
  Si el backend devuelve items: [..], aplanarlo rompería el listado.
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
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");
      normalized = lastComma > lastDot
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
  return Math.min(Math.max(number(value, min), min), max);
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

function normalizeSortOrder(value = "") {
  const order = normalizeKey(value || DEFAULT_SORT_ORDER);

  if (["asc", "ascending", "oldest", "antiguos", "menor", "menor_mayor", "menor_a_mayor"].includes(order)) {
    return "asc";
  }

  return "desc";
}

function getNextSortOrder(value = DEFAULT_SORT_ORDER) {
  return normalizeSortOrder(value) === "asc" ? "desc" : "asc";
}

function safeError(error = null, fallback = "No se pudieron cargar los clientes.") {
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

function escapeCsv(value = "") {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nextFrame(callback = null) {
  if (!isBrowser() || !isFunction(callback)) return 0;

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
   APP / AUTH / ROUTE
========================================================= */

function getAppState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getAppState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";
    return roles[0] || "";
  }

  const role = normalizeKey(value);

  if (["admin", "administrator", "administrador", "superadmin", "super_admin", "root", "owner"].includes(role)) return "admin";
  if (["user", "usuario", "client", "cliente"].includes(role)) return "user";

  return role || "user";
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(getCurrentUser(), {});

  return normalizeRole(
    first(
      context.role,
      context.rol,
      context.user?.role,
      context.user?.rol,
      AppCore.getCurrentRole?.(),
      state.role,
      state.rol,
      state.roles,
      user.role,
      user.rol,
      user.roles,
      ""
    )
  ) || "user";
}

function isAdminContext(context = {}) {
  return context.admin === true || getCurrentRole(context) === "admin";
}

function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  const segments = value.split("/").filter(Boolean);

  if (segments[0]?.startsWith("@")) {
    value = `/${segments.slice(1).join("/")}` || "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/")) return normalizePathname(hash.slice(1));
    if (hash.startsWith("#!/")) return normalizePathname(hash.slice(2));

    return normalizePathname(window.location.pathname || "/");
  } catch {
    return "";
  }
}

function routePathFromContext(context = {}) {
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

function isClientesRoute(context = {}) {
  const explicit = routePathFromContext(context);

  if (explicit) return normalizePathname(explicit) === CLIENTES_CANONICAL_PATH;

  const browserPath = getBrowserPath();
  if (browserPath) return browserPath === CLIENTES_CANONICAL_PATH;

  return true;
}

function resolveHost(host = null, context = {}) {
  if (isDomNode(host)) return host;
  if (isDomNode(context.host)) return context.host;
  if (isDomNode(context.root)) return context.root;
  if (isDomNode(context.container)) return context.container;

  if (!isBrowser()) return null;

  return (
    document.querySelector("[data-view-host='clientes']") ||
    document.querySelector("[data-clientes-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}

function getRoutes() {
  return {
    incidencias: ROUTES?.incidencias || "/incidencias",
    facturas: ROUTES?.facturas || "/facturas",
    clientes: ROUTES?.clientes || "/clientes",
    usuarios: ROUTES?.usuarios || "/usuarios",
    servidor: ROUTES?.servidor || "/servidor",
  };
}

/* =========================================================
   TOAST / EVENTS
========================================================= */

function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;

  const candidates = [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast];

  for (const toast of candidates) {
    try {
      if (isFunction(toast?.[type])) {
        toast[type](text);
        return true;
      }

      if (isFunction(toast?.show)) {
        toast.show(text, type);
        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

function subscribeEvent(eventName = "", handler = null) {
  const name = cleanText(eventName, "");
  if (!name || !isFunction(handler)) return () => {};

  let appBound = false;
  let windowBound = false;

  try {
    if (isFunction(AppCore?.events?.on)) {
      AppCore.events.on(name, handler);
      appBound = true;
    }
  } catch {
    // noop
  }

  try {
    if (isBrowser()) {
      window.addEventListener(name, handler);
      windowBound = true;
    }
  } catch {
    // noop
  }

  return () => {
    try {
      if (appBound && isFunction(AppCore?.events?.off)) AppCore.events.off(name, handler);
    } catch {
      // noop
    }

    try {
      if (windowBound && isBrowser()) window.removeEventListener(name, handler);
    } catch {
      // noop
    }
  };
}

function emitEvent(eventName = "", payload = {}) {
  const name = cleanText(eventName, "");
  if (!name) return false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch {
    // fallback
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

/* =========================================================
   MODEL LOCAL
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw, {});
}

function getClienteId(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item.uid,
      item._id,
      item.code,
      item.codigo,
      item.nif,
      item.cif,
      item.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw.uid,
      raw._id,
      raw.code,
      raw.codigo,
      raw.nif,
      raw.cif,
      raw.email,
      ""
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.code,
      item.codigo,
      item.clienteCode,
      item.clienteId,
      item.clientId,
      item.id,
      item.nif,
      item.cif,
      raw.code,
      raw.codigo,
      raw.clienteCode,
      raw.clienteId,
      raw.clientId,
      raw.id,
      raw.nif,
      raw.cif,
      "CLI-SIN-ID"
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  const raw = getRaw(item);
  const firstName = cleanText(first(item.firstName, item.nombre, raw.firstName, raw.nombre), "");
  const lastName = cleanText(first(item.lastName, item.apellidos, raw.lastName, raw.apellidos), "");
  const composed = cleanText(`${firstName} ${lastName}`, "");

  return cleanText(
    first(
      item.razonSocial,
      item.businessName,
      item.companyName,
      item.empresa,
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      composed,
      item.email,
      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      raw.empresa,
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.email,
      "Cliente"
    ),
    "Cliente"
  );
}

function getClienteEmail(item = {}) {
  const raw = getRaw(item);
  return cleanText(first(item.email, item.mail, item.emailLower, item.contactEmail, item.billingEmail, item.facturacionEmail, raw.email, raw.mail, raw.emailLower, raw.contactEmail, raw.billingEmail, raw.facturacionEmail, ""), "").toLowerCase();
}

function getClientePhone(item = {}) {
  const raw = getRaw(item);
  return cleanText(first(item.phone, item.telefono, item.mobile, item.movil, item.phoneNumber, raw.phone, raw.telefono, raw.mobile, raw.movil, raw.phoneNumber, ""), "");
}

function getClienteCity(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.city,
      item.ciudad,
      item.location?.city,
      item.location?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      raw.city,
      raw.ciudad,
      raw.location?.city,
      raw.location?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad,
      ""
    ),
    ""
  );
}

function getClienteNif(item = {}) {
  const raw = getRaw(item);
  return cleanText(first(item.nif, item.cif, item.taxId, item.vat, item.documentId, raw.nif, raw.cif, raw.taxId, raw.vat, raw.documentId, ""), "").toUpperCase();
}

function getClienteType(item = {}) {
  const raw = getRaw(item);
  return normalizeKey(first(item.tipo, item.type, item.kind, item.segment, item.category, raw.tipo, raw.type, raw.kind, raw.segment, raw.category, "cliente"));
}

function getClienteStatus(item = {}) {
  const raw = getRaw(item);
  const explicit = first(item.status, item.estado, item.state, raw.status, raw.estado, raw.state);

  if (explicit !== null && explicit !== undefined && explicit !== "") return normalizeKey(explicit);

  const active = first(item.active, item.isActive, item.enabled, raw.active, raw.isActive, raw.enabled);
  if (active === false) return "blocked";
  if (active === true) return "active";

  return "active";
}

function statusBucket(item = {}) {
  const status = getClienteStatus(item);

  if (["pending", "pendiente", "new", "nuevo", "invited", "invitation_pending", "unverified", "sin_validar"].includes(status)) return "pending";
  if (["blocked", "bloqueado", "bloqueada", "inactive", "inactivo", "inactiva", "disabled", "suspended", "deleted", "archived", "banned"].includes(status)) return "blocked";
  if (["vip", "premium"].includes(status)) return "vip";
  if (getClienteType(item) === "vip" || item.vip === true || item.isVip === true) return "vip";

  return "active";
}

function getClienteUpdatedAt(item = {}) {
  const raw = getRaw(item);
  return first(item.lastActivityAt, item.updatedAt, item.modifiedAt, item.lastInvoiceAt, item.lastTicketAt, item.lastContactAt, item.createdAt, raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.lastContactAt, raw.createdAt, 0);
}

function clienteSortTime(item = {}) {
  const timestamp = Date.parse(getClienteUpdatedAt(item));
  if (Number.isFinite(timestamp)) return timestamp;

  const numeric = Number(getClienteUpdatedAt(item));
  if (Number.isFinite(numeric)) return numeric > 9_999_999_999 ? numeric : numeric * 1000;

  return 0;
}

function getClienteAmount(item = {}) {
  const raw = getRaw(item);
  return number(first(item.totalAmount, item.totalImporte, item.facturasTotal, item.invoicesTotal, item.amount, item.importe, raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.invoicesTotal, raw.amount, raw.importe, 0), 0);
}

function normalizeClienteModel(item = {}) {
  const raw = safeObject(item, {});
  const id = getClienteId(raw);
  const email = getClienteEmail(raw);
  const name = getClienteName(raw);
  const status = getClienteStatus(raw);
  const type = getClienteType(raw);

  return {
    ...raw,
    raw,

    id: id || email,
    uid: first(raw.uid, id, email, ""),
    clienteId: first(raw.clienteId, raw.clientId, id, email, ""),
    clientId: first(raw.clientId, raw.clienteId, id, email, ""),
    customerId: first(raw.customerId, id, email, ""),

    code: getClienteCode(raw),
    codigo: getClienteCode(raw),

    fullName: name,
    displayName: cleanText(first(raw.displayName, raw.fullName, raw.name, raw.nombre, name), name),
    name,
    nombre: cleanText(first(raw.nombre, raw.name, name), name),
    razonSocial: cleanText(first(raw.razonSocial, raw.businessName, raw.companyName, name), name),

    email,
    phone: getClientePhone(raw),
    telefono: getClientePhone(raw),
    city: getClienteCity(raw),
    ciudad: getClienteCity(raw),
    nif: getClienteNif(raw),
    cif: getClienteNif(raw),

    status,
    estado: status,
    type,
    tipo: type,

    createdAt: first(raw.createdAt, raw.created, raw.registeredAt, raw.altaAt, raw.fechaAlta, ""),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.lastActivityAt, raw.lastContactAt, raw.createdAt, ""),
    lastActivityAt: first(raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.lastContactAt, raw.createdAt, ""),

    totalAmount: getClienteAmount(raw),
  };
}

function normalizeCollection(items = []) {
  try {
    return normalizeClientesCollection(items);
  } catch {
    const map = new Map();

    for (const item of safeArray(items)) {
      if (!isObject(item)) continue;
      const normalized = normalizeClienteModel(item);
      const id = getClienteId(normalized) || getClienteEmail(normalized) || getClienteCode(normalized);
      if (!id) continue;
      map.set(id, { ...(map.get(id) || {}), ...normalized });
    }

    return [...map.values()].sort((a, b) => clienteSortTime(b) - clienteSortTime(a));
  }
}

function findClienteById(items = [], id = "") {
  const target = cleanText(id, "");
  if (!target) return null;

  const normalizedTarget = normalizeSearch(target);

  return normalizeCollection(items).find((item) => {
    return [
      getClienteId(item),
      getClienteCode(item),
      item.uid,
      item._id,
      getClienteEmail(item),
      getClienteNif(item),
    ].some((candidate) => normalizeSearch(candidate) === normalizedTarget);
  }) || null;
}

function clienteSearchText(item = {}) {
  return normalizeSearch([
    getClienteId(item),
    getClienteCode(item),
    getClienteName(item),
    getClienteEmail(item),
    getClientePhone(item),
    getClienteCity(item),
    getClienteNif(item),
    getClienteStatus(item),
    getClienteType(item),
  ].join(" "));
}

function filterClientes(items = [], { filter = "all", search = "", sortOrder = DEFAULT_SORT_ORDER } = {}) {
  const bucket = normalizeKey(filter || "all") || "all";
  const query = normalizeSearch(search);
  const order = normalizeSortOrder(sortOrder);

  return normalizeCollection(items)
    .filter((item) => {
      const matchesFilter = bucket === "all" || statusBucket(item) === bucket;
      if (!matchesFilter) return false;

      if (!query) return true;
      const haystack = clienteSearchText(item);
      return query.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
    })
    .sort((a, b) => {
      const diff = order === "asc" ? clienteSortTime(a) - clienteSortTime(b) : clienteSortTime(b) - clienteSortTime(a);
      if (diff !== 0) return diff;

      return getClienteName(a).localeCompare(getClienteName(b), "es", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export function computeClientesStats(items = []) {
  return normalizeCollection(items).reduce((acc, item) => {
    const bucket = statusBucket(item);

    acc.total += 1;
    acc.totalAmount += getClienteAmount(item);
    acc.lastUpdateTs = Math.max(acc.lastUpdateTs, clienteSortTime(item));

    if (bucket === "active") acc.activeCount += 1;
    if (bucket === "pending") acc.pendingCount += 1;
    if (bucket === "blocked") acc.blockedCount += 1;
    if (bucket === "vip") acc.vipCount += 1;

    return acc;
  }, {
    total: 0,
    activeCount: 0,
    pendingCount: 0,
    blockedCount: 0,
    vipCount: 0,
    totalAmount: 0,
    invoiceTotal: 0,
    lastUpdateTs: 0,
  });
}

function cloneItems(items = []) {
  return normalizeCollection(items).map((item) => ({ ...item }));
}

/* =========================================================
   RESPONSE NORMALIZATION / CACHE
========================================================= */

function envelopeObjects(payload = null, maxDepth = 8) {
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();
  const output = [];

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const key of ["data", "payload", "response", "result", "results", "body"]) {
      if (isObject(value[key])) queue.push({ value: value[key], depth: depth + 1 });
    }
  }

  return output;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    const candidate = first(
      source.items,
      source.clientes,
      source.clients,
      source.customers,
      source.rows,
      source.results,
      source.documents,
      source.resources,
      source.data?.items,
      source.data?.clientes,
      source.data?.clients,
      source.data?.rows,
      source.data?.results
    );

    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  for (const source of envelopeObjects(payload)) {
    const candidate = first(
      source.total,
      source.remoteCount,
      source.totalCount,
      source.count,
      source.totalItems,
      source.totalResults,
      source.data?.total,
      source.data?.remoteCount,
      source.data?.totalCount,
      source.data?.count
    );

    const parsed = number(candidate, -1);
    if (parsed >= 0) return parsed;
  }

  return number(fallback, 0);
}

function pickContinuationToken(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const token = cleanText(first(source.ct, source.continuationToken, source.nextContinuationToken, source.nextToken, source.cursor, source.nextCursor, source.data?.ct, source.data?.continuationToken, source.data?.nextToken, source.data?.cursor), "");
    if (token) return token;
  }

  return "";
}

function pickHasMore(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const candidate = first(source.hasMore, source.more, source.next, source.hasNextPage, source.data?.hasMore, source.data?.hasNextPage);

    if (candidate === true) return true;
    if (candidate === false) return false;
  }

  return Boolean(pickContinuationToken(payload));
}

function pickDetail(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const candidate = first(source.cliente, source.client, source.customer, source.item, source.detail, source.data?.cliente, source.data?.client, source.data?.customer, source.data?.item, source.data);
    if (isObject(candidate)) return candidate;
  }

  return isObject(payload) ? payload : null;
}

function mergeListResponses(responses = []) {
  const items = [];
  let total = 0;
  let lastPayload = null;

  for (const response of safeArray(responses)) {
    const currentItems = pickItems(response);
    items.push(...currentItems);
    total = Math.max(total, pickTotal(response, currentItems.length));
    lastPayload = response;
  }

  return {
    ...(isObject(lastPayload) ? lastPayload : {}),
    items,
    clientes: items,
    clients: items,
    total: Math.max(total, items.length),
    remoteCount: Math.max(total, items.length),
  };
}

function normalizeListResponse(response = null) {
  const items = normalizeCollection(pickItems(response));
  const total = Math.max(items.length, pickTotal(response, items.length));

  return {
    raw: response,
    items,
    clientes: items,
    clients: items,
    rows: items,
    results: items,
    total,
    remoteCount: total,
    totalCount: total,
  };
}

function normalizeDetailResponse(response = null) {
  const detail = pickDetail(response);
  return detail ? normalizeClienteModel(detail) : null;
}

function readCache() {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage?.getItem?.(CLIENTES_CACHE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw);
    if (!isObject(payload)) return null;

    const cachedAt = number(payload.cachedAt || payload.lastSyncAt, 0);
    const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

    if (age > CLIENTES_CACHE_TTL_MS) return null;

    const items = normalizeCollection(payload.items);
    if (!items.length) return null;

    return {
      items,
      remoteCount: Math.max(items.length, number(payload.remoteCount, items.length)),
      lastSyncAt: number(payload.lastSyncAt, cachedAt),
    };
  } catch {
    return null;
  }
}

function writeCache(items = [], remoteCount = 0) {
  if (!isBrowser()) return false;

  try {
    const list = normalizeCollection(items);
    const payload = {
      version: CLIENTES_INDEX_VERSION,
      items: cloneItems(list),
      remoteCount: Math.max(list.length, number(remoteCount, list.length)),
      lastSyncAt: Date.now(),
      cachedAt: Date.now(),
    };

    window.localStorage?.setItem?.(CLIENTES_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function hydrateClientesFromCache() {
  const cached = readCache();

  if (cached) {
    memoryCache = cached;
    return cached;
  }

  return memoryCache;
}

/* =========================================================
   API
========================================================= */

async function importClientesApi() {
  if (apiImportPromise) return apiImportPromise;

  apiImportPromise = import("./clientes.api.js")
    .then((module) => {
      apiImportError = null;
      return module;
    })
    .catch((error) => {
      apiImportError = error;
      return null;
    });

  return apiImportPromise;
}

function cleanQueryValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const text = cleanText(value, "");
  return text || undefined;
}

function buildClientesListQuery({
  limit = CLIENTES_FETCH_LIMIT,
  ct = "",
  continuationToken = "",
  includeTotal = true,
  sortBy = "updatedAt",
  sortDir = "DESC",
  search = "",
  q = "",
  filters = {},
} = {}) {
  const query = {
    limit: clamp(limit, 1, CLIENTES_MAX_LIMIT),
    includeTotal: Boolean(includeTotal),
    sortBy: cleanText(sortBy, "updatedAt"),
    sortDir: cleanText(sortDir, "DESC").toUpperCase(),
  };

  const token = cleanText(first(ct, continuationToken), "");
  const finalSearch = cleanText(first(search, q), "");

  if (token) query.ct = token;
  if (finalSearch) {
    query.search = finalSearch;
    query.q = finalSearch;
  }

  for (const [key, value] of Object.entries(safeObject(filters))) {
    const cleanKey = cleanText(key, "");
    const cleanValue = cleanQueryValue(value);

    if (!cleanKey || cleanValue === undefined) continue;
    query[cleanKey] = cleanValue;
  }

  return query;
}

async function httpRequest(method = "GET", endpoint = "", body = null, options = {}) {
  const verb = cleanText(method, "GET").toUpperCase();
  const path = cleanText(endpoint, "");

  if (!path) throw new Error("CLIENTES_ENDPOINT_REQUIRED");

  const timeout = number(options.timeout, 15000);
  const query = safeObject(options.query || options.params);
  const headers = safeObject(options.headers);
  const source = cleanText(options.source, "views.clientes");

  if (verb === "GET" && isFunction(Http?.get)) return Http.get(path, { timeout, query, headers, source });
  if (verb === "POST" && isFunction(Http?.post)) return Http.post(path, body, { timeout, query, headers, source });
  if (verb === "PUT" && isFunction(Http?.put)) return Http.put(path, body, { timeout, query, headers, source });
  if (verb === "PATCH" && isFunction(Http?.patch)) return Http.patch(path, body, { timeout, query, headers, source });

  if (verb === "DELETE") {
    const remove = Http?.delete || Http?.del;
    if (isFunction(remove)) return remove.call(Http, path, { timeout, query, headers, source });
  }

  if (isFunction(Http?.request)) {
    return Http.request(path, {
      method: verb,
      body,
      data: body,
      timeout,
      query,
      headers,
      source,
    });
  }

  if (verb === "PUT") return httpRequest("PATCH", path, body, options);
  if (verb === "PATCH") return httpRequest("POST", path, body, options);

  throw new Error(`CLIENTES_HTTP_${verb}_UNAVAILABLE`);
}

async function fetchClientesPageRequest(options = {}) {
  return httpRequest("GET", CLIENTES_ENDPOINT, null, {
    timeout: number(options.timeout, 20000),
    query: buildClientesListQuery(options),
    source: "views.clientes.list.page",
  });
}

async function fetchClientesFallback(options = {}) {
  const pages = [];
  const seenTokens = new Set();
  let continuationToken = cleanText(first(options.ct, options.continuationToken), "");
  let page = 0;

  do {
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) break;
      seenTokens.add(continuationToken);
    }

    page += 1;

    const response = await fetchClientesPageRequest({
      ...options,
      ct: continuationToken,
      includeTotal: page === 1 ? options.includeTotal !== false : false,
    });

    pages.push(response);

    const nextToken = pickContinuationToken(response);
    const hasMore = pickHasMore(response);

    if (!hasMore || !nextToken || nextToken === continuationToken) break;

    continuationToken = nextToken;
  } while (page < clamp(options.maxPages || CLIENTES_MAX_PAGES, 1, CLIENTES_MAX_PAGES));

  return normalizeListResponse(mergeListResponses(pages));
}

async function listClientesRequest(options = {}) {
  const api = await importClientesApi();

  if (api) {
    const methods = [
      "listClientes",
      "loadClientes",
      "fetchClientes",
      "getClientes",
      "fetchClientesRequest",
    ];

    for (const method of methods) {
      if (!isFunction(api?.[method])) continue;

      const response = await api[method](options);
      return normalizeListResponse(response);
    }
  }

  return fetchClientesFallback(options);
}

async function loadClienteDetail(id = "", options = {}) {
  const clienteId = cleanText(id, "");
  if (!clienteId) throw new Error("CLIENTE_ID_REQUIRED");

  const api = await importClientesApi();

  if (api) {
    const methods = [
      "getClienteById",
      "getClienteByIdRequest",
      "fetchClienteById",
      "fetchClienteDetail",
      "loadClienteDetail",
      "getCliente",
    ];

    for (const method of methods) {
      if (!isFunction(api?.[method])) continue;

      const response = await api[method](clienteId, options);
      const detail = normalizeDetailResponse(response) || normalizeClienteModel(response);
      if (detail) return detail;
    }
  }

  const response = await httpRequest("GET", `${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`, null, {
    timeout: number(options.timeout, 18000),
    source: "views.clientes.detail",
  });

  const detail = normalizeDetailResponse(response);
  if (!detail) throw new Error("CLIENTE_DETAIL_INVALID_RESPONSE");

  return detail;
}

/* =========================================================
   MODALS
========================================================= */

async function importClientesCreateModal() {
  if (createModalImportPromise) return createModalImportPromise;

  createModalImportPromise = (async () => {
    const candidates = [
      "./clientes.template.create.js",
      "./clientes.create.modal.js",
    ];

    for (const path of candidates) {
      try {
        return await import(path);
      } catch {
        // next candidate
      }
    }

    return null;
  })();

  return createModalImportPromise;
}

async function importClientesDetailModal() {
  if (detailModalImportPromise) return detailModalImportPromise;

  detailModalImportPromise = (async () => {
    const candidates = [
      "./clientes.template.modal.js",
      "./clientes.modal.js",
    ];

    for (const path of candidates) {
      try {
        return await import(path);
      } catch {
        // next candidate
      }
    }

    return null;
  })();

  return detailModalImportPromise;
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function storeInstance(host = null, controller = null) {
  if (!host || !controller) return false;

  INSTANCES.set(host, controller);
  lastInstance = controller;

  try {
    getGlobalObject()[CLIENTES_GLOBAL_CONTROLLER_KEY] = controller;
  } catch {
    // noop
  }

  return true;
}

function clearInstance(host = null, controller = null) {
  if (host && INSTANCES.get(host) === controller) INSTANCES.delete(host);
  if (lastInstance === controller) lastInstance = null;

  try {
    const global = getGlobalObject();
    if (global[CLIENTES_GLOBAL_CONTROLLER_KEY] === controller) delete global[CLIENTES_GLOBAL_CONTROLLER_KEY];
  } catch {
    // noop
  }

  return true;
}

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (previous?.destroy) {
    try {
      previous.destroy();
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createClientesController(host = null, context = {}) {
  const id = ++controllerSequence;
  const cached = hydrateClientesFromCache();

  let destroyed = false;
  let mounted = false;

  let root = resolveHost(host, context);
  let currentContext = safeObject(context);

  let items = normalizeCollection(cached.items);
  let total = number(cached.remoteCount || items.length, items.length);
  let lastSyncAt = number(cached.lastSyncAt, 0);

  let loading = false;
  let refreshing = false;
  let creating = false;
  let loadingMore = false;

  let error = "";
  let filter = "all";
  let search = "";
  let sortOrder = DEFAULT_SORT_ORDER;
  let visibleLimit = DEFAULT_VISIBLE_LIMIT;
  let openingClienteId = "";

  let renderFrame = 0;
  let loadSeq = 0;
  let searchTimer = 0;

  const disposers = [];

  function assertAlive() {
    return !destroyed && isClientesRoute(currentContext);
  }

  function setHost(nextHost = null) {
    const resolved = resolveHost(nextHost, currentContext);
    if (resolved) root = resolved;
    return root;
  }

  function payload(extra = {}) {
    return {
      id,
      user: getCurrentUser(),
      role: getCurrentRole(currentContext),
      admin: isAdminContext(currentContext),
      routes: getRoutes(),
      route: getRoutes().clientes,
      context: currentContext,

      items,
      clientes: items,
      clients: items,
      rows: items,
      total,
      remoteCount: total,
      count: items.length,
      stats: computeClientesStats(items),
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

      apiImportError: apiImportError ? safeError(apiImportError, "") : "",

      ...extra,
    };
  }

  function getSnapshot() {
    return {
      ...payload(),
      items: cloneItems(items),
      clientes: cloneItems(items),
      clients: cloneItems(items),
      rows: cloneItems(items),
      mounted,
      destroyed,
    };
  }

  function renderNow() {
    if (!root || destroyed) return false;

    cancelFrame(renderFrame);

    const data = payload();
    const initialLoading = loading && !items.length;
    const hardError = error && !items.length;

    try {
      root.innerHTML = initialLoading
        ? renderClientesLoadingState(data)
        : hardError
          ? renderClientesErrorState(data)
          : renderClientesTemplate(data);

      root.dataset.view = "clientes";
      root.dataset.controllerId = String(id);
      root.dataset.clientesVersion = CLIENTES_INDEX_VERSION;

      return true;
    } catch (renderError) {
      error = safeError(renderError, "No se pudo renderizar la vista de clientes.");

      try {
        root.innerHTML = renderClientesErrorState({ ...data, error });
      } catch {
        root.innerHTML = `<section class="clientes-view-root clientes-view-root--error"><pre>${error}</pre></section>`;
      }

      return false;
    }
  }

  function scheduleRender() {
    cancelFrame(renderFrame);
    renderFrame = nextFrame(() => renderNow());
    return renderFrame;
  }

  function setItems(nextItems = [], { remoteCount = null, write = true } = {}) {
    const list = normalizeCollection(nextItems);

    items = list;
    total = Math.max(list.length, number(remoteCount, total || list.length));
    lastSyncAt = Date.now();
    error = "";

    memoryCache = {
      items: cloneItems(list),
      remoteCount: total,
      lastSyncAt,
    };

    if (write) writeCache(list, total);

    return list;
  }

  async function load({ force = false, silent = false } = {}) {
    if (!assertAlive()) return getSnapshot();
    if (loading && !force) return getSnapshot();

    const seq = ++loadSeq;
    const hadItems = items.length > 0;

    loading = !silent && !hadItems;
    refreshing = silent || hadItems;
    error = "";

    renderNow();

    try {
      const response = await listClientesRequest({
        force,
        all: true,
        limit: CLIENTES_FETCH_LIMIT,
        maxPages: CLIENTES_MAX_PAGES,
        sortBy: "updatedAt",
        sortDir: sortOrder === "asc" ? "ASC" : "DESC",
      });

      if (seq !== loadSeq || destroyed) return getSnapshot();

      setItems(response.items, {
        remoteCount: response.remoteCount || response.totalCount || response.total,
        write: true,
      });

      emitEvent("clientes:loaded", getSnapshot());
      emitEvent("clientes:list:success", getSnapshot());

      return getSnapshot();
    } catch (loadError) {
      if (seq !== loadSeq || destroyed) return getSnapshot();

      error = safeError(loadError);

      emitEvent("clientes:error", {
        error: loadError,
        message: error,
      });

      return getSnapshot();
    } finally {
      if (seq === loadSeq && !destroyed) {
        loading = false;
        refreshing = false;
        renderNow();
      }
    }
  }

  async function refresh() {
    return load({ force: true, silent: true });
  }

  function setSearch(value = "") {
    search = cleanText(value, "");
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    scheduleRender();
    return search;
  }

  function setFilter(value = "all") {
    const next = normalizeKey(value || "all") || "all";
    filter = ["all", "active", "pending", "blocked", "vip"].includes(next) ? next : "all";
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    scheduleRender();
    return filter;
  }

  function setSortOrder(value = DEFAULT_SORT_ORDER) {
    sortOrder = normalizeSortOrder(value);
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    scheduleRender();
    return sortOrder;
  }

  function toggleSortOrder() {
    return setSortOrder(getNextSortOrder(sortOrder));
  }

  function clearSearch() {
    return setSearch("");
  }

  function clearFilters() {
    search = "";
    filter = "all";
    sortOrder = DEFAULT_SORT_ORDER;
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    scheduleRender();
    return true;
  }

  function loadMore(limit = null) {
    loadingMore = true;
    visibleLimit = clamp(number(limit, visibleLimit + VISIBLE_STEP), 1, 1000);
    scheduleRender();

    window.setTimeout?.(() => {
      loadingMore = false;
      scheduleRender();
    }, 120);

    return visibleLimit;
  }

  async function openCreate() {
    creating = true;
    scheduleRender();

    try {
      const module = await importClientesCreateModal();
      const target = module?.default || module?.ClientesCreateModal || module?.OnionClientesCreateModal || module;

      if (isFunction(target?.open)) return target.open();
      if (isFunction(target?.show)) return target.show();
      if (isFunction(target?.mount)) return target.mount();

      emitEvent("clientes:create:open", { source: CLIENTES_INDEX_SOURCE });
      return true;
    } catch {
      emitEvent("clientes:create:open", { source: CLIENTES_INDEX_SOURCE });
      return true;
    } finally {
      creating = false;
      scheduleRender();
    }
  }

  async function openCliente(idValue = "", detail = null) {
    const clienteId = cleanText(idValue || getClienteId(detail), "");
    let current = detail || findClienteById(items, clienteId);

    openingClienteId = clienteId;
    scheduleRender();

    try {
      if (clienteId) {
        try {
          current = await loadClienteDetail(clienteId, { dedupe: true });
        } catch {
          // usamos el dato de tabla si el detalle no está disponible
        }
      }

      if (!current) {
        showToast("No se pudo abrir el cliente.", "error");
        return false;
      }

      const normalized = normalizeClienteModel(current);

      try {
        const module = await importClientesDetailModal();
        const target = module?.default || module?.ClientesModal || module?.OnionClientesModal || module;

        if (isFunction(target?.open)) return target.open(normalized);
        if (isFunction(target?.show)) return target.show(normalized);
        if (isFunction(target?.render)) return target.render(normalized);
      } catch {
        // Event fallback
      }

      emitEvent("clientes:modal:open", {
        detail: normalized,
        cliente: normalized,
        client: normalized,
        clienteId: getClienteId(normalized),
        id: getClienteId(normalized),
      });

      return true;
    } finally {
      openingClienteId = "";
      scheduleRender();
    }
  }

  function exportCsv() {
    const rows = filterClientes(items, { filter, search, sortOrder });
    const headers = ["ID", "Código", "Nombre", "Email", "Teléfono", "Ciudad", "NIF", "Estado", "Tipo", "Importe"];
    const csvRows = [headers];

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
        String(getClienteAmount(item)).replace(".", ","),
      ]);
    }

    const csv = csvRows.map((row) => row.map(escapeCsv).join(";")).join("\n");

    if (!isBrowser()) return csv;

    try {
      const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
      link.rel = "noopener";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Clientes exportados.", "success");

      return true;
    } catch {
      return csv;
    }
  }

  function actionFromTarget(target = null) {
    if (!(target instanceof Element)) return null;

    const actionable = target.closest("[data-clientes-action], [data-action]");
    if (!actionable || !root?.contains?.(actionable)) return null;

    return {
      element: actionable,
      action: cleanText(actionable.getAttribute("data-clientes-action") || actionable.getAttribute("data-action") || "", ""),
    };
  }

  async function handleClick(event) {
    const info = actionFromTarget(event.target);
    if (!info?.action) return;

    const { element, action } = info;

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

    if (managedActions.includes(action)) event.preventDefault();

    if ([CLIENTES_ACTIONS.OPEN_DETAIL, "detail", "open-client", "open-cliente"].includes(action)) {
      const row = element.closest("[data-client-id], [data-cliente-id]");
      const idTarget = element.getAttribute("data-client-id") || element.getAttribute("data-cliente-id") || row?.getAttribute("data-client-id") || row?.getAttribute("data-cliente-id") || "";
      await openCliente(idTarget);
      return;
    }

    if ([CLIENTES_ACTIONS.CREATE_OPEN, "create", "create-client", "create-cliente"].includes(action)) {
      await openCreate();
      return;
    }

    if ([CLIENTES_ACTIONS.REFRESH, "retry"].includes(action)) {
      await refresh();
      return;
    }

    if ([CLIENTES_ACTIONS.EXPORT, "export-csv"].includes(action)) {
      exportCsv();
      return;
    }

    if (action === CLIENTES_ACTIONS.FILTER) {
      setFilter(element.getAttribute("data-filter") || "all");
      return;
    }

    if (action === CLIENTES_ACTIONS.SORT_TOGGLE) {
      setSortOrder(element.getAttribute("data-next-sort-order") || getNextSortOrder(sortOrder));
      return;
    }

    if (action === CLIENTES_ACTIONS.CLEAR_SEARCH) {
      clearSearch();
      return;
    }

    if (action === CLIENTES_ACTIONS.CLEAR_FILTERS) {
      clearFilters();
      return;
    }

    if (action === CLIENTES_ACTIONS.LOAD_MORE) {
      loadMore(element.getAttribute("data-visible-limit"));
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const isSearch =
      target.matches("[data-clientes-search-input]") ||
      target.matches("[data-clientes-search-input='true']") ||
      target.matches("[data-clientes-field='search']") ||
      target.matches("[data-search-input='clientes']");

    if (!isSearch) return;

    window.clearTimeout?.(searchTimer);
    searchTimer = window.setTimeout?.(() => setSearch(target.value), SEARCH_DEBOUNCE_MS);
  }

  function handleKeydown(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (event.key === "Enter") {
      const row = target.closest("[data-client-row='true'], [data-cliente-row='true']");
      if (row) {
        event.preventDefault();
        const idTarget = row.getAttribute("data-client-id") || row.getAttribute("data-cliente-id") || "";
        openCliente(idTarget);
      }
    }
  }

  function handleRouteEvent(event = null) {
    if (!event || event[ROUTER_EVENT_HANDLED_KEY]) return;
    if (!isClientesRoute(currentContext)) return;

    try {
      event[ROUTER_EVENT_HANDLED_KEY] = true;
    } catch {
      // noop
    }

    scheduleRender();
  }

  function attach() {
    if (!root || mounted) return false;

    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("keydown", handleKeydown);

    for (const eventName of CREATE_SUCCESS_EVENTS) {
      disposers.push(subscribeEvent(eventName, () => refresh()));
    }

    for (const eventName of CREATE_CLOSE_EVENTS) {
      disposers.push(subscribeEvent(eventName, () => scheduleRender()));
    }

    for (const eventName of DETAIL_CLOSE_EVENTS) {
      disposers.push(subscribeEvent(eventName, () => scheduleRender()));
    }

    disposers.push(subscribeEvent("route:changed", handleRouteEvent));
    disposers.push(subscribeEvent("router:navigated", handleRouteEvent));

    mounted = true;
    return true;
  }

  function detach() {
    if (!root) {
      mounted = false;
      return false;
    }

    try {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleInput);
      root.removeEventListener("keydown", handleKeydown);
    } catch {
      // noop
    }

    for (const dispose of disposers.splice(0)) {
      try {
        dispose?.();
      } catch {
        // noop
      }
    }

    window.clearTimeout?.(searchTimer);
    mounted = false;
    return true;
  }

  async function mount(nextHost = null, nextContext = {}) {
    if (destroyed) return getSnapshot();

    currentContext = {
      ...currentContext,
      ...safeObject(nextContext),
    };

    setHost(nextHost);

    if (!root) throw new Error("CLIENTES_HOST_NOT_FOUND");
    if (!isClientesRoute(currentContext)) return getSnapshot();

    attach();
    renderNow();

    if (!items.length) {
      await load({ force: false, silent: false });
    } else {
      load({ force: false, silent: true });
    }

    return getSnapshot();
  }

  async function render(nextHost = null, nextContext = {}) {
    return mount(nextHost, nextContext);
  }

  async function destroy({ clear = true } = {}) {
    destroyed = true;
    loadSeq += 1;

    cancelFrame(renderFrame);
    detach();

    if (clear && root) root.innerHTML = "";
    clearInstance(root, controller);

    return true;
  }

  const controller = {
    id,

    get state() {
      return {
        id,
        host: root,
        context: currentContext,
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
      };
    },

    getSnapshot,
    getState: getSnapshot,

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
    openClient: openCliente,
    openCreate,
    createCliente: openCreate,
    createClient: openCreate,

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

function ensureController(host = null, context = {}) {
  const resolvedHost = resolveHost(host, context);

  if (resolvedHost) {
    const existing = INSTANCES.get(resolvedHost);

    if (existing && !existing.state.destroyed) {
      return existing;
    }

    destroyPrevious(resolvedHost);
  }

  if (lastInstance && !lastInstance.state.destroyed && !host) {
    return lastInstance;
  }

  const controller = createClientesController(resolvedHost, context);

  if (resolvedHost) storeInstance(resolvedHost, controller);
  else lastInstance = controller;

  return controller;
}

function parseInitArgs(hostOrContext = null, maybeContext = {}) {
  const host = isDomNode(hostOrContext) ? hostOrContext : null;
  const context = isDomNode(hostOrContext)
    ? safeObject(maybeContext)
    : safeObject(hostOrContext);

  return { host, context };
}

export async function init(hostOrContext = null, maybeContext = {}) {
  const { host, context } = parseInitArgs(hostOrContext, maybeContext);
  const controller = ensureController(host, context);
  return controller.mount(host, context);
}

export async function mount(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function bootstrap(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function render(hostOrContext = null, maybeContext = {}) {
  return init(hostOrContext, maybeContext);
}

export async function reload() {
  return ensureController().refresh();
}

export async function refresh() {
  return ensureController().refresh();
}

export async function destroy(options = {}) {
  if (!lastInstance) return true;
  return lastInstance.destroy(options);
}

export async function unmount(options = {}) {
  return destroy(options);
}

export async function dispose(options = {}) {
  return destroy(options);
}

export function getClientes() {
  return cloneItems(ensureController().state.items);
}

export function getItems() {
  return getClientes();
}

export function getClientesCount() {
  return ensureController().state.items.length;
}

export function hasClientes() {
  return getClientesCount() > 0;
}

export function getState() {
  return ensureController().getSnapshot();
}

export function getSnapshot() {
  return getState();
}

export function getClienteById(id = "") {
  return findClienteById(ensureController().state.items, id);
}

export function setClientesSearch(value = "") {
  return ensureController().setSearch(value);
}

export function setClientesFilter(value = "all") {
  return ensureController().setFilter(value);
}

export function setClientesSortOrder(value = DEFAULT_SORT_ORDER) {
  return ensureController().setSortOrder(value);
}

export function toggleClientesSortOrder() {
  return ensureController().toggleSortOrder();
}

export function loadMoreClientes(limit = null) {
  return ensureController().loadMore(limit);
}

export async function openCliente(id = "") {
  return ensureController().openCliente(id);
}

export async function openCreate() {
  return ensureController().openCreate();
}

export async function createCliente() {
  return openCreate();
}

export function exportCsv() {
  return ensureController().exportCsv();
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const ClientesView = {
  version: CLIENTES_INDEX_VERSION,

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

  setSearch: setClientesSearch,
  setFilter: setClientesFilter,
  setSortOrder: setClientesSortOrder,
  toggleSortOrder: toggleClientesSortOrder,
  loadMore: loadMoreClientes,

  openCliente,
  openClient: openCliente,
  openCreate,
  createCliente,

  exportCsv,
};

try {
  const global = getGlobalObject();

  global.ClientesView = ClientesView;
  global.OnionClientesView = ClientesView;
  global.OnionClientes = ClientesView;

  if (AppCore?.modules && typeof AppCore.modules === "object") {
    AppCore.modules.Clientes = ClientesView;
    AppCore.modules.clientes = ClientesView;
  }
} catch {
  // noop
}

export default ClientesView;

/* =========================================================
   Onion Support - Clientes Index
   Archivo: /src/views/clientes/index.js

   PRODUCTIVO · CONTROLADOR ÚNICO · VISTA CLIENTES · 10/10

   Punto cerrado:
   - No depende de clientesView.js.
   - No depende de clientes.state.js / clientes.store.js.
   - No rompe el render si clientes.api.js tiene imports ESM inexistentes.
   - Usa clientes.api.js si está disponible y carga correctamente.
   - Si clientes.api.js no carga, cae a Http core contra /api/clientes.
   - Sin window.fetch propio.
   - Sin duplicar controladores.
   - Compatible con /clientes y /@usuario/clientes.
   - Compatible con clientes.template.js.
   - Compatible de transición con clientes.table.template.js.
   - Sin páginas: visibleLimit + load-more 1:1 incidencias.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";
export const CLIENTES_INDEX_VERSION =
  "clientes.index.productive.v1.controller-single.no-pages";
export const CLIENTES_VIEW_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_MODULE_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_INDEX_SOURCE = "views.clientes.index";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_FETCH_LIMIT = 250;
export const CLIENTES_MAX_LIMIT = 500;
export const CLIENTES_MAX_PAGES = 20;
export const CLIENTES_CACHE_KEY = "onion.support.clientes.cache.v1";
export const CLIENTES_CACHE_TTL_MS = 60_000;

const DEFAULT_VISIBLE_LIMIT = 20;
const VISIBLE_STEP = 20;
const SEARCH_DEBOUNCE_MS = 220;

const CLIENTES_CONTROLLER_KEY = Symbol.for(
  "onion.support.clientes.controller"
);

const CLIENTES_GLOBAL_CONTROLLER_KEY = Symbol.for(
  "onion.support.clientes.active-controller"
);

const DETAIL_ACTION = "detail";
const CREATE_ACTION = "create";
const REFRESH_ACTION = "refresh";
const RETRY_ACTION = "retry";
const EXPORT_ACTION = "export";
const FILTER_ACTION = "filter";
const CLEAR_SEARCH_ACTION = "clear-search";
const CLEAR_FILTERS_ACTION = "clear-filters";
const LOAD_MORE_ACTION = "load-more";

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

let controllerSequence = 0;
let lastController = null;

let apiImportPromise = null;
let apiImportError = null;

let templateImportPromise = null;
let templateImportError = null;

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

function isNode(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  IMPORTANTE:
  No aplanar arrays en first().
  Si el backend devuelve items: [..], aplanar convertiría el array
  en el primer cliente y dejaría la tabla vacía o corrupta.
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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
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

  return role || "user";
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(getCurrentUser(), {});

  return (
    normalizeRole(
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
    ) || "user"
  );
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

  if (explicit) {
    return normalizePathname(explicit) === CLIENTES_CANONICAL_PATH;
  }

  const browserPath = getBrowserPath();
  if (browserPath) return browserPath === CLIENTES_CANONICAL_PATH;

  return true;
}

function resolveHost(host = null, context = {}) {
  if (isNode(host)) return host;
  if (isNode(context.host)) return context.host;
  if (isNode(context.root)) return context.root;
  if (isNode(context.container)) return context.container;

  if (!isBrowser()) return null;

  return (
    document.querySelector("[data-view-host='clientes']") ||
    document.querySelector("[data-clientes-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
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
      if (appBound && isFunction(AppCore?.events?.off)) {
        AppCore.events.off(name, handler);
      }
    } catch {
      // noop
    }

    try {
      if (windowBound && isBrowser()) {
        window.removeEventListener(name, handler);
      }
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

function eventPayload(event = null) {
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

  return cleanText(
    first(
      item.email,
      item.mail,
      item.emailLower,
      item.contactEmail,
      item.billingEmail,
      item.facturacionEmail,
      raw.email,
      raw.mail,
      raw.emailLower,
      raw.contactEmail,
      raw.billingEmail,
      raw.facturacionEmail,
      ""
    ),
    ""
  ).toLowerCase();
}

function getClientePhone(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.movil,
      item.phoneNumber,
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.movil,
      raw.phoneNumber,
      ""
    ),
    ""
  );
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

  return cleanText(
    first(
      item.nif,
      item.cif,
      item.taxId,
      item.vat,
      item.documentId,
      raw.nif,
      raw.cif,
      raw.taxId,
      raw.vat,
      raw.documentId,
      ""
    ),
    ""
  ).toUpperCase();
}

function getClienteType(item = {}) {
  const raw = getRaw(item);

  return normalizeKey(
    first(
      item.tipo,
      item.type,
      item.kind,
      item.segment,
      item.category,
      raw.tipo,
      raw.type,
      raw.kind,
      raw.segment,
      raw.category,
      "cliente"
    )
  );
}

function getClienteStatus(item = {}) {
  const raw = getRaw(item);
  const explicit = first(item.status, item.estado, item.state, raw.status, raw.estado, raw.state);

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return normalizeKey(explicit);
  }

  const active = first(
    item.active,
    item.isActive,
    item.enabled,
    raw.active,
    raw.isActive,
    raw.enabled
  );

  if (active === false) return "blocked";
  if (active === true) return "active";

  return "active";
}

function statusBucket(item = {}) {
  const status = getClienteStatus(item);

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
      "invitation_pending",
      "unverified",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "inactive",
      "inactivo",
      "inactiva",
      "disabled",
      "suspended",
      "deleted",
      "archived",
    ].includes(status)
  ) {
    return "blocked";
  }

  if (["vip", "premium"].includes(status)) return "vip";

  if (getClienteType(item) === "vip" || item.vip === true || item.isVip === true) {
    return "vip";
  }

  return "active";
}

function getClienteUpdatedAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.lastActivityAt,
    item.updatedAt,
    item.modifiedAt,
    item.lastInvoiceAt,
    item.lastTicketAt,
    item.lastContactAt,
    item.createdAt,
    raw.lastActivityAt,
    raw.updatedAt,
    raw.modifiedAt,
    raw.lastInvoiceAt,
    raw.lastTicketAt,
    raw.lastContactAt,
    raw.createdAt,
    0
  );
}

function clienteSortTime(item = {}) {
  const timestamp = Date.parse(getClienteUpdatedAt(item));
  if (Number.isFinite(timestamp)) return timestamp;

  const numeric = Number(getClienteUpdatedAt(item));
  if (Number.isFinite(numeric)) return numeric > 9_999_999_999 ? numeric : numeric * 1000;

  return 0;
}

export function normalizeClienteModel(item = {}) {
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
    emailLower: email,
    mail: email,

    phone: getClientePhone(raw),
    telefono: getClientePhone(raw),
    city: getClienteCity(raw),
    ciudad: getClienteCity(raw),
    nif: getClienteNif(raw),
    cif: getClienteNif(raw),

    type,
    tipo: type,
    segment: normalizeKey(first(raw.segment, type, "")),
    status,
    estado: status,
    state: status,
    active: statusBucket({ ...raw, status }) !== "blocked",

    createdAt: first(raw.createdAt, raw.created_at, raw.created, raw.fechaAlta, raw.altaAt, ""),
    updatedAt: first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.createdAt, ""),
    lastActivityAt: first(raw.lastActivityAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.updatedAt, ""),
    invoicesCount: number(first(raw.invoicesCount, raw.facturasCount, raw.invoiceCount), 0),
    ticketsCount: number(first(raw.ticketsCount, raw.incidenciasCount, raw.ticketCount), 0),
    totalAmount: number(first(raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.invoicesTotal, raw.amount), 0),
    avatarUrl: cleanText(first(raw.avatarUrl, raw.avatar, raw.picture, raw.photoUrl, raw.photoURL, ""), ""),
  };
}

export function normalizeClientesCollection(items = []) {
  const map = new Map();
  let anonymousIndex = 0;

  for (const value of safeArray(items)) {
    if (!isObject(value)) continue;

    const normalized = normalizeClienteModel(value);
    const id = getClienteId(normalized) || `anonymous:${anonymousIndex++}`;

    if (map.has(id)) {
      map.set(id, {
        ...map.get(id),
        ...normalized,
        raw: {
          ...safeObject(map.get(id)?.raw),
          ...safeObject(normalized.raw),
        },
      });
      continue;
    }

    map.set(id, normalized);
  }

  return [...map.values()].sort((a, b) => {
    const diff = clienteSortTime(b) - clienteSortTime(a);
    if (diff !== 0) return diff;

    return getClienteId(a).localeCompare(getClienteId(b), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function findClienteById(items = [], id = "") {
  const target = cleanText(id, "");
  if (!target) return null;

  const targetLower = target.toLowerCase();

  return safeArray(items).find((item) => {
    const candidates = [
      getClienteId(item),
      item.id,
      item.uid,
      item.clienteId,
      item.clientId,
      item.customerId,
      item.code,
      item.codigo,
      item.email,
      item.nif,
      item.cif,
      item.raw?.id,
      item.raw?.uid,
      item.raw?.clienteId,
      item.raw?.clientId,
      item.raw?.customerId,
      item.raw?.code,
      item.raw?.codigo,
      item.raw?.email,
      item.raw?.nif,
      item.raw?.cif,
    ].map((value) => cleanText(value, "").toLowerCase());

    return candidates.includes(targetLower);
  }) || null;
}

function clienteSearchText(item = {}) {
  return normalizeSearch(
    [
      getClienteId(item),
      getClienteCode(item),
      getClienteName(item),
      getClienteEmail(item),
      getClientePhone(item),
      getClienteCity(item),
      getClienteNif(item),
      getClienteType(item),
      getClienteStatus(item),
      item.segment,
      item.raw?.segment,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function filterClientes(items = [], { filter = "all", search = "" } = {}) {
  const normalizedFilter = normalizeKey(filter || "all");
  const query = normalizeSearch(search);
  const terms = query.split(" ").filter(Boolean);

  return safeArray(items).filter((item) => {
    if (normalizedFilter !== "all" && statusBucket(item) !== normalizedFilter) {
      return false;
    }

    if (!terms.length) return true;

    const haystack = clienteSearchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

export function computeClientesStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      acc.total += 1;

      const bucket = statusBucket(item);
      if (bucket === "active") acc.activeCount += 1;
      if (bucket === "pending") acc.pendingCount += 1;
      if (bucket === "blocked") acc.blockedCount += 1;
      if (bucket === "vip") acc.vipCount += 1;

      acc.invoicesCount += number(item.invoicesCount, 0);
      acc.ticketsCount += number(item.ticketsCount, 0);
      acc.totalAmount += number(item.totalAmount, 0);

      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      vipCount: 0,
      invoicesCount: 0,
      ticketsCount: 0,
      totalAmount: 0,
    }
  );
}

function cloneItems(items = []) {
  return safeArray(items).map((item) => ({ ...safeObject(item, {}) }));
}

/* =========================================================
   ENVELOPE / CACHE
========================================================= */

function envelopeObjects(payload = null, maxDepth = 8) {
  const output = [];
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (isObject(value[key])) queue.push({ value: value[key], depth: depth + 1 });
    }
  }

  return output;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of [
      "items",
      "rows",
      "clients",
      "clientes",
      "customers",
      "results",
      "records",
      "docs",
      "documents",
      "list",
    ]) {
      if (Array.isArray(source[key])) return source[key];
    }
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  const candidates = [];

  for (const source of envelopeObjects(payload)) {
    candidates.push(
      source.total,
      source.totalCount,
      source.remoteCount,
      source.count,
      source.pagination?.total,
      source.pagination?.totalCount,
      source.meta?.total,
      source.meta?.totalCount,
      source.pageInfo?.total,
      source.pageInfo?.totalCount
    );
  }

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return Math.max(0, number(fallback, 0));
}

function pickContinuationToken(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const token = cleanText(
      first(
        source.continuationToken,
        source.nextContinuationToken,
        source.nextToken,
        source.ct,
        source.pagination?.continuationToken,
        source.pagination?.nextContinuationToken,
        source.pagination?.nextToken,
        source.pagination?.ct,
        source.pageInfo?.continuationToken,
        source.pageInfo?.nextContinuationToken,
        source.pageInfo?.nextToken,
        source.pageInfo?.ct
      ),
      ""
    );

    if (token) return token;
  }

  return "";
}

function pickHasMore(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const value = first(source.hasMore, source.more, source.pagination?.hasMore, source.pageInfo?.hasMore);

    if (value === true || value === false) return value;
    if (typeof value === "string") return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }

  return Boolean(pickContinuationToken(payload));
}

function looksLikeCliente(value = null) {
  const item = safeObject(value, null);
  if (!item) return false;

  return Boolean(
    item.clienteId ||
      item.clientId ||
      item.customerId ||
      item.id ||
      item._id ||
      item.uid ||
      item.code ||
      item.codigo ||
      item.nif ||
      item.cif ||
      item.email ||
      item.name ||
      item.nombre ||
      item.razonSocial ||
      item.businessName ||
      item.companyName
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find(looksLikeCliente) || payload[0] || null;
  if (looksLikeCliente(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of ["client", "cliente", "customer", "item", "detail", "data"]) {
      if (looksLikeCliente(source[key])) return source[key];
    }
  }

  return null;
}

function mergeListResponses(responses = []) {
  const pages = safeArray(responses).filter((page) => page !== null && page !== undefined);
  const items = normalizeClientesCollection(pages.flatMap(pickItems));
  const total = Math.max(items.length, ...pages.map((page) => pickTotal(page, 0)), 0);
  const last = pages.at(-1) || {};

  return {
    ...safeObject(last),
    ok: true,
    success: true,
    total,
    totalCount: total,
    remoteCount: total,
    count: items.length,
    returned: items.length,
    items,
    clients: items,
    clientes: items,
    customers: items,
    rows: items,
    results: items,
    hasMore: pickHasMore(last),
    continuationToken: pickContinuationToken(last) || null,
    nextContinuationToken: pickContinuationToken(last) || null,
  };
}

function normalizeListResponse(response = null) {
  const items = normalizeClientesCollection(pickItems(response));
  const remoteCount = Math.max(items.length, pickTotal(response, items.length));

  return {
    ...safeObject(response),
    ok: true,
    total: remoteCount,
    totalCount: remoteCount,
    remoteCount,
    count: items.length,
    items,
    clients: items,
    clientes: items,
    customers: items,
    rows: items,
    results: items,
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

    const items = normalizeClientesCollection(payload.items);
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
    const payload = {
      version: CLIENTES_INDEX_VERSION,
      items: cloneItems(items),
      remoteCount: Math.max(safeArray(items).length, number(remoteCount, safeArray(items).length)),
      lastSyncAt: Date.now(),
      cachedAt: Date.now(),
    };

    window.localStorage?.setItem?.(CLIENTES_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function hydrateMemoryCache() {
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

  if (!path) {
    throw new Error("CLIENTES_ENDPOINT_REQUIRED");
  }

  const timeout = number(options.timeout, 15000);
  const query = safeObject(options.query || options.params);
  const headers = safeObject(options.headers);
  const source = cleanText(options.source, "views.clientes");

  if (verb === "GET" && isFunction(Http?.get)) {
    return Http.get(path, { timeout, query, headers, source });
  }

  if (verb === "POST" && isFunction(Http?.post)) {
    return Http.post(path, body, { timeout, query, headers, source });
  }

  if (verb === "PUT" && isFunction(Http?.put)) {
    return Http.put(path, body, { timeout, query, headers, source });
  }

  if (verb === "PATCH" && isFunction(Http?.patch)) {
    return Http.patch(path, body, { timeout, query, headers, source });
  }

  if (verb === "DELETE") {
    const remove = Http?.delete || Http?.del;

    if (isFunction(remove)) {
      return remove.call(Http, path, { timeout, query, headers, source });
    }
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

  if (verb === "PUT") {
    return httpRequest("PATCH", path, body, options);
  }

  if (verb === "PATCH") {
    return httpRequest("POST", path, body, options);
  }

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

async function loadClientesFromApi(options = {}) {
  const api = await importClientesApi();

  if (api) {
    const methods = [
      "loadClientes",
      "fetchClientes",
      "listClientes",
      "getClientes",
      "fetchClientesRequest",
    ];

    for (const method of methods) {
      if (!isFunction(api?.[method])) continue;

      try {
        const response = await api[method](options);
        return normalizeListResponse(response);
      } catch (error) {
        // Si el API carga pero el método falla, sí propagamos error.
        throw error;
      }
    }
  }

  return fetchClientesFallback(options);
}

async function getClienteDetailFromApi(id = "", options = {}) {
  const clienteId = cleanText(id, "");
  if (!clienteId) throw new Error("CLIENTE_ID_REQUIRED");

  const api = await importClientesApi();

  if (api) {
    const methods = [
      "getClienteById",
      "getClienteByIdRequest",
      "fetchClienteById",
      "fetchClienteDetail",
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

  if (!detail) {
    throw new Error("CLIENTE_DETAIL_INVALID_RESPONSE");
  }

  return detail;
}

/* =========================================================
   TEMPLATE
========================================================= */

async function importClientesTemplate() {
  if (templateImportPromise) return templateImportPromise;

  templateImportPromise = (async () => {
    const candidates = [
      "./clientes.template.js",
      "./clientes.table.template.js",
    ];

    for (const path of candidates) {
      try {
        const module = await import(path);
        templateImportError = null;
        return module;
      } catch (error) {
        templateImportError = error;
      }
    }

    return null;
  })();

  return templateImportPromise;
}

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="16"',
    'height="16"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h10"/><path d="M19 5.5A7 7 0 1 0 19 18.5"/></svg>`,
  };

  return icons[name] || "";
}

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatAmount(value = 0) {
  const amount = number(value, 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} €`;
  }
}

function getStatusLabel(status = "") {
  const bucket = statusBucket({ status });

  if (bucket === "active") return "Activa";
  if (bucket === "pending") return "Pendiente";
  if (bucket === "blocked") return "Bloqueada";
  if (bucket === "vip") return "VIP";

  return cleanText(status, "Activa");
}

function getInitials(value = "") {
  const text = cleanText(value, "CL");
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || "CL";

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "CL";
}

function renderFallbackAvatar(item = {}) {
  const name = getClienteName(item);
  const avatar = cleanText(item.avatarUrl || item.avatar, "");

  return `
    <span class="clientes-avatar" data-has-avatar="${avatar ? "true" : "false"}">
      ${
        avatar
          ? `<img src="${attr(avatar)}" alt="" width="42" height="42" loading="lazy" decoding="async">`
          : `<span class="clientes-avatar-fallback">${escapeHtml(getInitials(name))}</span>`
      }
    </span>
  `;
}

function renderFallbackRow(item = {}, state = {}) {
  const id = getClienteId(item);
  const bucket = statusBucket(item);
  const name = getClienteName(item);
  const email = getClienteEmail(item);
  const city = getClienteCity(item);
  const nif = getClienteNif(item);

  return `
    <tr
      class="clientes-row clientes-row--${attr(bucket)}"
      data-client-row="true"
      data-cliente-row="true"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      data-clientes-action="detail"
      data-action="detail"
      tabindex="0"
    >
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderFallbackAvatar(item)}
          <div class="clientes-main-copy">
            <span class="clientes-code">${escapeHtml(getClienteCode(item))}</span>
            <strong class="clientes-name">${escapeHtml(name)}</strong>
            <span class="clientes-description">
              ${escapeHtml([email, nif].filter(Boolean).join(" · ") || "Sin datos fiscales")}
            </span>
          </div>
        </div>
      </td>
      <td class="clientes-cell clientes-cell--status">
        <span class="clientes-status-chip clientes-status-chip--${attr(bucket)}">
          <span class="clientes-status-dot" aria-hidden="true"></span>
          ${escapeHtml(getStatusLabel(bucket))}
        </span>
      </td>
      <td class="clientes-cell clientes-cell--date">${escapeHtml(formatDate(item.createdAt))}</td>
      <td class="clientes-cell clientes-cell--email">${escapeHtml(email || "Sin email")}</td>
      <td class="clientes-cell clientes-cell--location">${escapeHtml(city || "Sin ciudad")}</td>
      <td class="clientes-cell clientes-cell--amount">${escapeHtml(formatAmount(item.totalAmount))}</td>
      <td class="clientes-cell clientes-cell--actions">
        <button class="clientes-detail-btn" type="button" data-clientes-action="detail" data-action="detail" data-client-id="${attr(id)}" data-cliente-id="${attr(id)}">
          ${icon("eye")}
          <span>Ver</span>
        </button>
      </td>
    </tr>
  `;
}

function renderFallbackTemplate(viewState = {}) {
  const state = safeObject(viewState);
  const items = normalizeClientesCollection(state.items);
  const filtered = filterClientes(items, state);
  const visibleLimit = clamp(state.visibleLimit, 1, 500);
  const visibleItems = filtered.slice(0, visibleLimit);
  const stats = computeClientesStats(items);
  const hasMore = visibleItems.length < filtered.length;
  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const search = cleanText(state.search, "");
  const filter = normalizeKey(state.filter || "all");

  const filterButtons = [
    ["all", "Todos", items.length],
    ["active", "Activos", stats.activeCount],
    ["pending", "Pendientes", stats.pendingCount],
    ["blocked", "Bloqueados", stats.blockedCount],
    ["vip", "VIP", stats.vipCount],
  ]
    .map(([key, label, count]) => `
      <button
        class="clientes-filter-pill ${filter === key ? "is-active" : ""}"
        type="button"
        data-clientes-action="filter"
        data-action="filter"
        data-filter="${attr(key)}"
        aria-pressed="${filter === key ? "true" : "false"}"
      >
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(count))}</strong>
      </button>
    `)
    .join("");

  if (state.error) {
    return `
      <section class="clientes-view-root" data-clientes-scope="true" data-view="clientes">
        <div class="clientes-error" role="alert">
          <h1>Error de clientes</h1>
          <p>${escapeHtml(state.error)}</p>
          <button class="clientes-btn" type="button" data-clientes-action="retry" data-action="retry">
            ${icon("refresh")}
            <span>Reintentar</span>
          </button>
        </div>
      </section>
    `;
  }

  return `
    <section
      class="clientes-view-root"
      data-clientes-scope="true"
      data-view="clientes"
      data-loading="${loading ? "true" : "false"}"
      data-refreshing="${refreshing ? "true" : "false"}"
      data-visible="${attr(String(visibleItems.length))}"
      data-total="${attr(String(filtered.length))}"
      data-visible-limit="${attr(String(visibleLimit))}"
      data-has-more="${hasMore ? "true" : "false"}"
    >
      <section class="clientes-hero">
        <div class="clientes-hero-top">
          <div class="clientes-hero-copy">
            <h1 class="clientes-title clientes-page-title">Tus clientes</h1>
            <p class="clientes-subtitle clientes-page-subtitle">
              Consulta clientes, revisa actividad y gestiona contactos desde un único panel.
            </p>
          </div>

          <div class="clientes-hero-actions">
            <button id="clientes-create-btn" class="clientes-btn clientes-btn--create" type="button" data-clientes-action="create" data-action="create">
              ${icon("plus")}
              <span>Nuevo cliente</span>
            </button>
            <button id="clientes-refresh-btn" class="clientes-btn" type="button" data-clientes-action="refresh" data-action="refresh" ${refreshing ? 'disabled aria-disabled="true"' : ""}>
              ${icon("refresh")}
              <span>${refreshing ? "Actualizando" : "Actualizar"}</span>
            </button>
          </div>
        </div>

        <div class="clientes-hero-meta">
          <span class="clientes-meta-pill">${icon("users")} ${escapeHtml(`${items.length} clientes registrados`)}</span>
          <span class="clientes-meta-pill">${icon("clock")} ${state.lastSyncAt ? `Última actualización · ${escapeHtml(formatDate(state.lastSyncAt))}` : "Pendiente de sincronizar"}</span>
          <span class="clientes-meta-pill">${icon("euro")} ${escapeHtml(formatAmount(stats.totalAmount))}</span>
        </div>

        <div class="clientes-stats">
          <article class="clientes-stat-card clientes-stat-card--total">
            <span class="clientes-stat-label">Clientes</span>
            <strong class="clientes-stat-value">${escapeHtml(String(stats.total))}</strong>
            <span class="clientes-stat-text">Registros totales visibles.</span>
          </article>
          <article class="clientes-stat-card clientes-stat-card--active">
            <span class="clientes-stat-label">Activos</span>
            <strong class="clientes-stat-value">${escapeHtml(String(stats.activeCount))}</strong>
            <span class="clientes-stat-text">Clientes operativos.</span>
          </article>
          <article class="clientes-stat-card clientes-stat-card--pending">
            <span class="clientes-stat-label">Pendientes</span>
            <strong class="clientes-stat-value">${escapeHtml(String(stats.pendingCount))}</strong>
            <span class="clientes-stat-text">Altas o validaciones pendientes.</span>
          </article>
          <article class="clientes-stat-card clientes-stat-card--blocked">
            <span class="clientes-stat-label">Bloqueados</span>
            <strong class="clientes-stat-value">${escapeHtml(String(stats.blockedCount))}</strong>
            <span class="clientes-stat-text">Cuentas restringidas o inactivas.</span>
          </article>
        </div>
      </section>

      <section class="clientes-history">
        <header class="clientes-history-head">
          <div class="clientes-history-copy">
            <h2 class="clientes-history-title">Historial de clientes</h2>
            <p class="clientes-history-subtitle">
              ${escapeHtml(`Mostrando ${visibleItems.length} de ${filtered.length}`)}
            </p>
          </div>

          <button class="clientes-btn" type="button" data-clientes-action="export" data-action="export">
            ${icon("export")}
            <span>Exportar</span>
          </button>

          <div class="clientes-filters">
            <div class="clientes-filter-pills" role="toolbar" aria-label="Filtros de clientes">
              ${filterButtons}
            </div>

            <label class="clientes-search">
              <span class="clientes-search-icon">${icon("search")}</span>
              <input
                class="clientes-search-input"
                type="search"
                value="${attr(search)}"
                placeholder="Buscar cliente, email, NIF..."
                data-clientes-search-input="true"
                data-search-input="clientes"
                autocomplete="off"
                spellcheck="false"
              >
              <button
                class="clientes-search-clear"
                type="button"
                data-clientes-action="clear-search"
                data-action="clear-search"
                ${search ? "" : "hidden"}
                aria-label="Limpiar búsqueda"
              >
                ${icon("close")}
              </button>
            </label>
          </div>
        </header>

        <div class="clientes-table-wrap ${refreshing ? "is-refreshing" : ""}">
          ${
            loading && !items.length
              ? `<div class="clientes-loading" role="status"><span class="clientes-spinner"></span><span>Cargando clientes…</span></div>`
              : `
                <div class="clientes-table-shell">
                  <table class="clientes-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Estado</th>
                        <th>Alta</th>
                        <th>Email</th>
                        <th>Ciudad</th>
                        <th>Importe</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        visibleItems.length
                          ? visibleItems.map((item) => renderFallbackRow(item, state)).join("")
                          : `
                            <tr class="clientes-empty-row">
                              <td colspan="7">
                                <div class="clientes-empty">
                                  <strong>No hay clientes para mostrar.</strong>
                                  <span>${search || filter !== "all" ? "Prueba a limpiar filtros o búsqueda." : "Todavía no hay registros."}</span>
                                </div>
                              </td>
                            </tr>
                          `
                      }
                    </tbody>
                  </table>
                </div>

                ${
                  hasMore
                    ? `
                      <div class="clientes-load-more">
                        <button
                          type="button"
                          class="clientes-load-more-btn"
                          data-clientes-action="load-more"
                          data-action="load-more"
                          data-visible-limit="${attr(String(visibleLimit + VISIBLE_STEP))}"
                        >
                          Cargar más
                        </button>
                        <span class="clientes-load-more-status">Mostrando ${escapeHtml(String(visibleItems.length))} de ${escapeHtml(String(filtered.length))}</span>
                      </div>
                    `
                    : ""
                }
              `
          }

          ${
            refreshing && items.length
              ? `<div class="clientes-refresh-overlay" role="status"><span class="clientes-spinner"></span><span>Actualizando…</span></div>`
              : ""
          }
        </div>
      </section>
    </section>
  `;
}

async function renderTemplate(viewState = {}) {
  const module = await importClientesTemplate();

  const payload = {
    ...viewState,
    clientes: viewState.items,
    clients: viewState.items,
    rows: viewState.items,
    visibleLimit: viewState.visibleLimit,
    state: {
      ...viewState,
      visibleLimit: viewState.visibleLimit,
    },
  };

  if (module) {
    const renderers = [
      module.renderClientesTemplate,
      module.renderClientesTableTemplate,
      module.renderTemplate,
      module.default,
    ].filter(isFunction);

    for (const renderer of renderers) {
      try {
        return renderer(payload);
      } catch {
        // fallback local
      }
    }
  }

  return renderFallbackTemplate(payload);
}

/* =========================================================
   CONTROLLER
========================================================= */

function createController(host = null, context = {}) {
  const id = ++controllerSequence;
  const initialCache = hydrateMemoryCache();

  const state = {
    id,
    host: resolveHost(host, context),
    context: safeObject(context),

    items: normalizeClientesCollection(initialCache.items),
    remoteCount: number(initialCache.remoteCount, 0),
    lastSyncAt: number(initialCache.lastSyncAt, 0),

    loading: false,
    refreshing: false,
    loaded: Boolean(initialCache.items?.length),
    hydrated: Boolean(initialCache.items?.length),
    error: "",

    search: "",
    filter: "all",
    visibleLimit: DEFAULT_VISIBLE_LIMIT,

    mounted: false,
    destroyed: false,

    renderFrame: 0,
    loadToken: 0,
    disposers: [],
  };

  function assertAlive() {
    return !state.destroyed && isClientesRoute(state.context);
  }

  function setHost(nextHost = null) {
    const resolved = resolveHost(nextHost, state.context);

    if (resolved) {
      state.host = resolved;
    }

    return state.host;
  }

  function getSnapshot() {
    return {
      id: state.id,
      items: cloneItems(state.items),
      clientes: cloneItems(state.items),
      clients: cloneItems(state.items),
      remoteCount: state.remoteCount,
      total: state.remoteCount,
      count: state.items.length,
      loading: state.loading,
      refreshing: state.refreshing,
      loaded: state.loaded,
      hydrated: state.hydrated,
      error: state.error,
      search: state.search,
      filter: state.filter,
      visibleLimit: state.visibleLimit,
      lastSyncAt: state.lastSyncAt,
      admin: isAdminContext(state.context),
      context: state.context,
    };
  }

  async function paint() {
    if (!state.host || state.destroyed) return false;

    cancelFrame(state.renderFrame);

    const snapshot = getSnapshot();
    const html = await renderTemplate(snapshot);

    if (!state.host || state.destroyed) return false;

    state.host.innerHTML = html;

    try {
      state.host.dataset.view = "clientes";
      state.host.dataset.controllerId = String(state.id);
    } catch {
      // noop
    }

    return true;
  }

  function schedulePaint() {
    cancelFrame(state.renderFrame);

    state.renderFrame = nextFrame(() => {
      paint();
    });

    return state.renderFrame;
  }

  function setItems(items = [], { remoteCount = null, write = true } = {}) {
    const list = normalizeClientesCollection(items);

    state.items = list;
    state.remoteCount = Math.max(list.length, number(remoteCount, state.remoteCount || list.length));
    state.lastSyncAt = Date.now();
    state.loaded = true;
    state.hydrated = true;
    state.error = "";

    memoryCache = {
      items: cloneItems(list),
      remoteCount: state.remoteCount,
      lastSyncAt: state.lastSyncAt,
    };

    if (write) {
      writeCache(list, state.remoteCount);
    }

    return list;
  }

  async function load({ force = false, silent = false } = {}) {
    if (!assertAlive()) return getSnapshot();

    if (state.loading && !force) return getSnapshot();

    const token = ++state.loadToken;
    const hadItems = state.items.length > 0;

    state.loading = !silent && !hadItems;
    state.refreshing = silent || hadItems;
    state.error = "";

    await paint();

    try {
      const response = await loadClientesFromApi({
        force,
        all: true,
        limit: CLIENTES_FETCH_LIMIT,
        maxPages: CLIENTES_MAX_PAGES,
      });

      if (token !== state.loadToken || state.destroyed) return getSnapshot();

      setItems(response.items, {
        remoteCount: response.remoteCount || response.totalCount || response.total,
        write: true,
      });

      emitEvent("clientes:loaded", getSnapshot());
      emitEvent("clientes:list:success", getSnapshot());

      return getSnapshot();
    } catch (error) {
      if (token !== state.loadToken || state.destroyed) return getSnapshot();

      state.error = safeError(error);
      state.loaded = false;

      emitEvent("clientes:error", {
        error,
        message: state.error,
      });

      return getSnapshot();
    } finally {
      if (token === state.loadToken && !state.destroyed) {
        state.loading = false;
        state.refreshing = false;
        await paint();
      }
    }
  }

  async function refresh() {
    return load({ force: true, silent: true });
  }

  function setSearch(value = "") {
    state.search = cleanText(value, "");
    state.visibleLimit = DEFAULT_VISIBLE_LIMIT;
    schedulePaint();

    return state.search;
  }

  function setFilter(value = "all") {
    state.filter = normalizeKey(value || "all") || "all";
    state.visibleLimit = DEFAULT_VISIBLE_LIMIT;
    schedulePaint();

    return state.filter;
  }

  function clearSearch() {
    return setSearch("");
  }

  function clearFilters() {
    state.search = "";
    state.filter = "all";
    state.visibleLimit = DEFAULT_VISIBLE_LIMIT;
    schedulePaint();

    return true;
  }

  function loadMore(limit = null) {
    const nextLimit = number(limit, state.visibleLimit + VISIBLE_STEP);
    state.visibleLimit = clamp(nextLimit, 1, 1000);
    schedulePaint();

    return state.visibleLimit;
  }

  async function openCreate() {
    try {
      const module = await importClientesCreateModal();

      const target = module?.default || module?.ClientesCreateModal || module?.OnionClientesCreateModal || module;

      if (isFunction(target?.open)) return target.open();
      if (isFunction(target?.show)) return target.show();
      if (isFunction(target?.mount)) return target.mount();

      emitEvent("clientes:create:open", {
        source: CLIENTES_INDEX_SOURCE,
      });

      return true;
    } catch {
      emitEvent("clientes:create:open", {
        source: CLIENTES_INDEX_SOURCE,
      });

      return true;
    }
  }

  async function openCliente(id = "", detail = null) {
    const clienteId = cleanText(id || getClienteId(detail), "");
    let current = detail || findClienteById(state.items, clienteId);

    try {
      if (clienteId) {
        current = await getClienteDetailFromApi(clienteId, { dedupe: true });
      }
    } catch {
      // Usamos el dato de tabla si el detalle no está disponible.
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
      // Event fallback.
    }

    emitEvent("clientes:modal:open", {
      detail: normalized,
      cliente: normalized,
      client: normalized,
      clienteId: getClienteId(normalized),
      id: getClienteId(normalized),
    });

    return true;
  }

  function exportCsv() {
    const rows = filterClientes(state.items, state);
    const headers = ["ID", "Nombre", "Email", "Teléfono", "Ciudad", "NIF", "Estado", "Tipo", "Importe"];
    const csvRows = [headers];

    for (const item of rows) {
      csvRows.push([
        getClienteId(item),
        getClienteName(item),
        getClienteEmail(item),
        getClientePhone(item),
        getClienteCity(item),
        getClienteNif(item),
        getClienteStatus(item),
        getClienteType(item),
        String(number(item.totalAmount, 0)).replace(".", ","),
      ]);
    }

    const csv = csvRows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    if (!isBrowser()) return csv;

    try {
      const blob = new Blob([`\ufeff${csv}`], {
        type: "text/csv;charset=utf-8",
      });

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
    if (!actionable) return null;

    return {
      element: actionable,
      action: cleanText(
        actionable.getAttribute("data-clientes-action") ||
          actionable.getAttribute("data-action") ||
          "",
        ""
      ),
    };
  }

  async function handleClick(event) {
    const info = actionFromTarget(event.target);
    if (!info?.action) return;

    const { element, action } = info;

    if (
      [
        DETAIL_ACTION,
        CREATE_ACTION,
        REFRESH_ACTION,
        RETRY_ACTION,
        EXPORT_ACTION,
        FILTER_ACTION,
        CLEAR_SEARCH_ACTION,
        CLEAR_FILTERS_ACTION,
        LOAD_MORE_ACTION,
      ].includes(action)
    ) {
      event.preventDefault();
    }

    if (action === DETAIL_ACTION || action === "open-client" || action === "open-cliente") {
      const row = element.closest("[data-client-id], [data-cliente-id]");
      const id =
        element.getAttribute("data-client-id") ||
        element.getAttribute("data-cliente-id") ||
        row?.getAttribute("data-client-id") ||
        row?.getAttribute("data-cliente-id") ||
        "";

      await openCliente(id);
      return;
    }

    if (action === CREATE_ACTION || action === "create-client" || action === "create-cliente") {
      await openCreate();
      return;
    }

    if (action === REFRESH_ACTION || action === RETRY_ACTION) {
      await refresh();
      return;
    }

    if (action === EXPORT_ACTION || action === "export-csv") {
      exportCsv();
      return;
    }

    if (action === FILTER_ACTION) {
      setFilter(element.getAttribute("data-filter") || "all");
      return;
    }

    if (action === CLEAR_SEARCH_ACTION) {
      clearSearch();
      return;
    }

    if (action === CLEAR_FILTERS_ACTION) {
      clearFilters();
      return;
    }

    if (action === LOAD_MORE_ACTION) {
      loadMore(element.getAttribute("data-visible-limit"));
    }
  }

  function handleInput(event) {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) return;

    const isSearch =
      target.matches("[data-clientes-search-input]") ||
      target.matches("[data-clientes-search-input='true']") ||
      target.matches("[data-search-input='clientes']");

    if (!isSearch) return;

    window.clearTimeout?.(target.__clientesSearchTimer);

    target.__clientesSearchTimer = window.setTimeout?.(() => {
      setSearch(target.value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleKeydown(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    if (event.key === "Enter") {
      const row = target.closest("[data-client-row='true'], [data-cliente-row='true']");
      if (row) {
        event.preventDefault();
        const id = row.getAttribute("data-client-id") || row.getAttribute("data-cliente-id") || "";
        openCliente(id);
      }
    }
  }

  function attach() {
    if (!state.host || state.mounted) return false;

    state.host.addEventListener("click", handleClick);
    state.host.addEventListener("input", handleInput);
    state.host.addEventListener("keydown", handleKeydown);

    for (const eventName of CREATE_SUCCESS_EVENTS) {
      state.disposers.push(
        subscribeEvent(eventName, () => {
          refresh();
        })
      );
    }

    for (const eventName of CREATE_CLOSE_EVENTS) {
      state.disposers.push(
        subscribeEvent(eventName, () => {
          schedulePaint();
        })
      );
    }

    for (const eventName of DETAIL_CLOSE_EVENTS) {
      state.disposers.push(
        subscribeEvent(eventName, () => {
          schedulePaint();
        })
      );
    }

    state.mounted = true;
    return true;
  }

  function detach() {
    if (!state.host) {
      state.mounted = false;
      return false;
    }

    try {
      state.host.removeEventListener("click", handleClick);
      state.host.removeEventListener("input", handleInput);
      state.host.removeEventListener("keydown", handleKeydown);
    } catch {
      // noop
    }

    for (const dispose of state.disposers.splice(0)) {
      try {
        dispose?.();
      } catch {
        // noop
      }
    }

    state.mounted = false;
    return true;
  }

  async function mount(nextHost = null, nextContext = {}) {
    if (state.destroyed) return getSnapshot();

    state.context = {
      ...state.context,
      ...safeObject(nextContext),
    };

    setHost(nextHost);

    if (!state.host) {
      throw new Error("CLIENTES_HOST_NOT_FOUND");
    }

    if (!isClientesRoute(state.context)) {
      return getSnapshot();
    }

    attach();
    await paint();

    if (!state.loaded || !state.items.length) {
      await load({ force: false, silent: Boolean(state.items.length) });
    }

    return getSnapshot();
  }

  async function render(nextHost = null, nextContext = {}) {
    return mount(nextHost, nextContext);
  }

  async function destroy({ clear = true } = {}) {
    state.destroyed = true;
    state.loadToken += 1;

    cancelFrame(state.renderFrame);
    detach();

    if (clear && state.host) {
      state.host.innerHTML = "";
    }

    if (lastController === controller) {
      lastController = null;
    }

    const global = getGlobalObject();

    try {
      if (global[CLIENTES_GLOBAL_CONTROLLER_KEY] === controller) {
        delete global[CLIENTES_GLOBAL_CONTROLLER_KEY];
      }
    } catch {
      // noop
    }

    return true;
  }

  const controller = {
    id,
    state,

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
   OPTIONAL MODALS
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
   PUBLIC API
========================================================= */

function ensureController(host = null, context = {}) {
  if (lastController && !lastController.state.destroyed) {
    if (host) {
      lastController.state.host = resolveHost(host, context) || lastController.state.host;
    }

    lastController.state.context = {
      ...lastController.state.context,
      ...safeObject(context),
    };

    return lastController;
  }

  lastController = createController(host, context);

  const global = getGlobalObject();

  try {
    global[CLIENTES_GLOBAL_CONTROLLER_KEY] = lastController;
  } catch {
    // noop
  }

  return lastController;
}

export async function init(hostOrContext = null, maybeContext = {}) {
  const host = isNode(hostOrContext) ? hostOrContext : null;
  const context = isNode(hostOrContext)
    ? safeObject(maybeContext)
    : safeObject(hostOrContext);

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
  if (!lastController) return true;
  return lastController.destroy(options);
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default ClientesView;

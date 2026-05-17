/* =========================================================
   Onion SPA - Topbar Search
   Archivo: src/ui/topbar/topbar.search.js

   TOPBAR SEARCH · SIMPLE
   - cache de búsqueda
   - índice local mínimo
   - búsqueda API /api/search vía cliente Core
   - normalización tolerante de resultados
   - render agrupado
   - navegación segura al resultado
   - search focus por clases/data attrs
   - sin CSS inline, sin overlays, sin imports dinámicos
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  normalizeText,
  normalizeQuery,
  uniqBy,
  safeNormalizePath,
  getTypeLabel,
  getTypeIcon,
  scoreTextMatch,
  scoreResult,
  groupResults,
} from "./topbar.helpers.js";

export const TOPBAR_SEARCH_VERSION = "topbar-search-v16-simple";

export const SEARCH_ACTIONS = Object.freeze({
  NAVIGATE: "navigate",
  OPEN_USUARIO: "open_usuario",
  OPEN_CLIENTE: "open_cliente",
  OPEN_INCIDENCIA: "open_incidencia",
  OPEN_FACTURA: "open_factura",
});

export const ENTITY_TYPES = Object.freeze({
  NAV: "nav",
  USUARIO: "usuario",
  CLIENTE: "cliente",
  INCIDENCIA: "incidencia",
  FACTURA: "factura",
  GENERAL: "general",
});

const SOURCE = "topbar-search";

const DEFAULT_CONFIG = Object.freeze({
  minQueryLength: 2,
  maxResultsTotal: 24,
  maxResultsPerGroup: 8,
  cacheTtlMs: 30_000,
  timeoutMs: 12_000,
});

const TYPE_ALIASES = Object.freeze({
  nav: ENTITY_TYPES.NAV,
  route: ENTITY_TYPES.NAV,
  routes: ENTITY_TYPES.NAV,
  ruta: ENTITY_TYPES.NAV,
  rutas: ENTITY_TYPES.NAV,
  navigation: ENTITY_TYPES.NAV,
  navegacion: ENTITY_TYPES.NAV,
  navegación: ENTITY_TYPES.NAV,

  user: ENTITY_TYPES.USUARIO,
  users: ENTITY_TYPES.USUARIO,
  usuario: ENTITY_TYPES.USUARIO,
  usuarios: ENTITY_TYPES.USUARIO,
  account: ENTITY_TYPES.USUARIO,
  profile: ENTITY_TYPES.USUARIO,
  perfil: ENTITY_TYPES.USUARIO,
  cuenta: ENTITY_TYPES.USUARIO,

  client: ENTITY_TYPES.CLIENTE,
  clients: ENTITY_TYPES.CLIENTE,
  cliente: ENTITY_TYPES.CLIENTE,
  clientes: ENTITY_TYPES.CLIENTE,
  customer: ENTITY_TYPES.CLIENTE,
  customers: ENTITY_TYPES.CLIENTE,

  ticket: ENTITY_TYPES.INCIDENCIA,
  tickets: ENTITY_TYPES.INCIDENCIA,
  incidencia: ENTITY_TYPES.INCIDENCIA,
  incidencias: ENTITY_TYPES.INCIDENCIA,
  issue: ENTITY_TYPES.INCIDENCIA,
  issues: ENTITY_TYPES.INCIDENCIA,
  support: ENTITY_TYPES.INCIDENCIA,
  soporte: ENTITY_TYPES.INCIDENCIA,

  factura: ENTITY_TYPES.FACTURA,
  facturas: ENTITY_TYPES.FACTURA,
  invoice: ENTITY_TYPES.FACTURA,
  invoices: ENTITY_TYPES.FACTURA,
  bill: ENTITY_TYPES.FACTURA,
  billing: ENTITY_TYPES.FACTURA,
  recibo: ENTITY_TYPES.FACTURA,
  recibos: ENTITY_TYPES.FACTURA,
});

const searchFocusRuntime = {
  runtime: null,
  getDom: null,
  active: false,
};

const delegatedResultNodes = new WeakSet();

/* =========================================================
   BASICS
========================================================= */

function configValue(key = "", fallback = null) {
  const value = TOPBAR_SEARCH_CONFIG?.[key];
  return value === undefined || value === null ? fallback : value;
}

function minQueryLength() {
  return Number(configValue("minQueryLength", DEFAULT_CONFIG.minQueryLength)) || DEFAULT_CONFIG.minQueryLength;
}

function maxResultsTotal() {
  return Number(configValue("maxResultsTotal", DEFAULT_CONFIG.maxResultsTotal)) || DEFAULT_CONFIG.maxResultsTotal;
}

function maxResultsPerGroup() {
  return Number(configValue("maxResultsPerGroup", DEFAULT_CONFIG.maxResultsPerGroup)) || DEFAULT_CONFIG.maxResultsPerGroup;
}

function cacheTtlMs() {
  return Number(configValue("cacheTtlMs", DEFAULT_CONFIG.cacheTtlMs)) || DEFAULT_CONFIG.cacheTtlMs;
}

function timeoutMs() {
  return Number(configValue("timeoutMs", DEFAULT_CONFIG.timeoutMs)) || DEFAULT_CONFIG.timeoutMs;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function html(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodePathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[TopbarSearch]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[TopbarSearch]", ...args);
  } catch {}
}

function safeAbortController() {
  try {
    if (typeof AbortController === "function") return new AbortController();
  } catch {}

  return null;
}

/* =========================================================
   TYPE / URL / IDS
========================================================= */

function normalizeSearchType(value = "") {
  const raw = safeText(value, ENTITY_TYPES.GENERAL).toLowerCase();
  const compact = normalizeText(raw).replace(/[^a-z0-9_-]/gi, "");
  return TYPE_ALIASES[compact] || compact || ENTITY_TYPES.GENERAL;
}

function displayText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" || typeof value === "number") return safeText(value, fallback);

  if (typeof value === "object" && !Array.isArray(value)) {
    return safeText(
      first(
        value.title,
        value.name,
        value.nombre,
        value.nombreFiscal,
        value.razonSocial,
        value.displayName,
        value.email,
        value.subject,
        value.asunto,
        value.numeroFacturaLegal,
        value.numeroFacturaSistema,
        value.numeroFactura,
        value.facturaId,
        value.invoiceId,
        value.invoiceNumber,
        value.ticketId,
        value.incidenciaId,
        value.clienteId,
        value.userId,
        value.id
      ),
      fallback
    );
  }

  return safeText(value, fallback);
}

function unsafeHref(value = "") {
  const href = safeText(value, "").toLowerCase();
  return href.startsWith("javascript:") || href.startsWith("data:") || href.startsWith("vbscript:") || href.startsWith("file:");
}

function normalizeResultUrl(AppCore, value = "") {
  const raw = safeText(value, "");
  if (!raw || unsafeHref(raw)) return null;

  if (/^https?:\/\//i.test(raw)) {
    if (!isBrowser()) return null;

    try {
      const url = new URL(raw);
      if (window.location?.origin && url.origin !== window.location.origin) return null;
      return safeNormalizePath(AppCore, `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`);
    } catch {
      return null;
    }
  }

  return safeNormalizePath(AppCore, raw.startsWith("/") ? raw : `/${raw}`);
}

function rawType(raw = {}) {
  const item = safeObject(raw);
  return first(item.type, item.entity, item.kind, item.group, item.category, item.collection, item.module, item.resource, item.scope, ENTITY_TYPES.GENERAL);
}

function rawTitle(raw = {}) {
  const item = safeObject(raw);

  return displayText(
    first(
      item.title,
      item.name,
      item.nombre,
      item.displayName,
      item.fullName,
      item.label,
      item.username,
      item.email,
      item.subject,
      item.asunto,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numeroFactura,
      item.facturaId,
      item.invoiceId,
      item.invoiceNumber,
      item.ticketId,
      item.incidenciaId,
      item.clienteId,
      item.userId,
      item.numero,
      item.number,
      item.code,
      item.codigo,
      item.id,
      item._id,
      "Resultado"
    ),
    "Resultado"
  );
}

function rawSubtitle(raw = {}) {
  const item = safeObject(raw);
  const clienteText = displayText(first(item.cliente, item.client, item.customer, item.clienteNombre, item.clientName, item.customerName), "");

  return displayText(
    first(
      item.subtitle,
      item.description,
      item.descripcion,
      item.preview,
      clienteText,
      item.email,
      item.role,
      item.rol,
      item.estado,
      item.status,
      item.priority,
      item.prioridad,
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.numero,
      item.code,
      item.codigo,
      item.total,
      item.amount,
      ""
    ),
    ""
  );
}

function rawUrl(raw = {}) {
  const item = safeObject(raw);
  return safeText(first(item.url, item.path, item.href, item.route, item.to, item.link, item.publicPath, item.spaPath, ""), "");
}

function entityIdByType(type = "", raw = {}, fallback = "") {
  const item = safeObject(raw);
  const normalizedType = normalizeSearchType(type);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return safeText(first(item.userId, item.usuarioId, item.uid, item.id, item._id, item.uuid, item.username, item.email, item.key, fallback), "");
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return safeText(first(item.clienteId, item.clientId, item.customerId, item.id, item._id, item.uuid, item.email, item.key, fallback), "");
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return safeText(first(item.ticketId, item.incidenciaId, item.issueId, item.id, item._id, item.uuid, item.ticketCode, item.code, item.codigo, item.numero, item.key, fallback), "");
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return safeText(first(item.facturaId, item.invoiceId, item.id, item._id, item.uuid, item.numeroFacturaLegal, item.numeroFacturaSistema, item.numeroFactura, item.invoiceNumber, item.numero, item.number, item.code, item.codigo, item.key, fallback), "");
  }

  return safeText(first(item.entityId, item.id, item._id, item.uuid, item.key, fallback), "");
}

function fallbackUrl(AppCore, type = "", entityId = "", raw = {}) {
  const direct = normalizeResultUrl(AppCore, rawUrl(raw));
  if (direct) return direct;

  const id = safeText(entityId, "");
  if (!id) return null;

  const encoded = encodePathSegment(id);
  const normalizedType = normalizeSearchType(type);

  if (normalizedType === ENTITY_TYPES.USUARIO) return safeNormalizePath(AppCore, `/usuarios?id=${encoded}`);
  if (normalizedType === ENTITY_TYPES.CLIENTE) return safeNormalizePath(AppCore, `/clientes?id=${encoded}`);
  if (normalizedType === ENTITY_TYPES.INCIDENCIA) return safeNormalizePath(AppCore, `/incidencias?id=${encoded}`);
  if (normalizedType === ENTITY_TYPES.FACTURA) return safeNormalizePath(AppCore, `/facturas?id=${encoded}`);

  return null;
}

function actionForType(type = "", raw = {}) {
  const item = safeObject(raw);
  const explicit = safeText(first(item.action, item.openAction, item.searchAction), "").toLowerCase();

  if ([SEARCH_ACTIONS.OPEN_USUARIO, "usuario", "user", "open_user", "open_usuario"].includes(explicit)) return SEARCH_ACTIONS.OPEN_USUARIO;
  if ([SEARCH_ACTIONS.OPEN_CLIENTE, "cliente", "client", "open_client", "open_cliente"].includes(explicit)) return SEARCH_ACTIONS.OPEN_CLIENTE;
  if ([SEARCH_ACTIONS.OPEN_INCIDENCIA, "ticket", "incidencia", "issue", "open_ticket", "open_incidencia"].includes(explicit)) return SEARCH_ACTIONS.OPEN_INCIDENCIA;
  if ([SEARCH_ACTIONS.OPEN_FACTURA, "factura", "invoice", "open_factura", "open_invoice"].includes(explicit)) return SEARCH_ACTIONS.OPEN_FACTURA;
  if (["navigate", "nav", "route", "go"].includes(explicit)) return SEARCH_ACTIONS.NAVIGATE;

  const normalizedType = normalizeSearchType(type);
  if (normalizedType === ENTITY_TYPES.USUARIO) return SEARCH_ACTIONS.OPEN_USUARIO;
  if (normalizedType === ENTITY_TYPES.CLIENTE) return SEARCH_ACTIONS.OPEN_CLIENTE;
  if (normalizedType === ENTITY_TYPES.INCIDENCIA) return SEARCH_ACTIONS.OPEN_INCIDENCIA;
  if (normalizedType === ENTITY_TYPES.FACTURA) return SEARCH_ACTIONS.OPEN_FACTURA;

  return SEARCH_ACTIONS.NAVIGATE;
}

function actionLabel(item = {}) {
  const action = safeText(item.action, SEARCH_ACTIONS.NAVIGATE);

  if (action === SEARCH_ACTIONS.OPEN_USUARIO) return "Abrir ficha";
  if (action === SEARCH_ACTIONS.OPEN_CLIENTE) return "Abrir cliente";
  if (action === SEARCH_ACTIONS.OPEN_INCIDENCIA) return "Abrir incidencia";
  if (action === SEARCH_ACTIONS.OPEN_FACTURA) return "Abrir factura";

  return "";
}

/* =========================================================
   EVENTS / TOAST
========================================================= */

function emitSearchEvent(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: TOPBAR_SEARCH_VERSION,
    ...safeObject(payload),
  };

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function showToast(AppCore, message = "", type = "info") {
  const text = safeText(message, "");
  const level = safeText(type, "info");
  if (!text) return false;

  try {
    if (isFn(AppCore?.toast?.[level])) {
      AppCore.toast[level](text);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore?.Toast?.[level])) {
      AppCore.Toast[level](text);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore?.showToast)) {
      AppCore.showToast(text, level);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DOM CLASSES / FOCUS MODE
========================================================= */

function setAttr(element, name = "", value = "") {
  if (!element || !name) return false;

  try {
    if (value === null || value === undefined || value === false) element.removeAttribute(name);
    else element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === false || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function cleanupLegacySearchGlass() {
  if (!isBrowser()) return false;

  let removed = false;

  for (const selector of ["#topbar-search-glass-overlay", ".topbar-search-glass", "[data-topbar-search-glass]"]) {
    try {
      document.querySelectorAll(selector).forEach((node) => {
        try {
          node.remove();
          removed = true;
        } catch {}
      });
    } catch {}
  }

  return removed;
}

function searchFocusNodes(getDom) {
  const dom = isFn(getDom) ? safeObject(getDom()) : {};

  const searchInput = dom.searchInput || null;
  const searchResults = dom.searchResults || null;
  const searchWrap = dom.searchWrap || searchInput?.closest?.(".topbar-search-wrap") || searchResults?.closest?.(".topbar-search-wrap") || null;
  const topbar = dom.topbar || searchWrap?.closest?.(".topbar") || searchInput?.closest?.(".topbar") || searchResults?.closest?.(".topbar") || null;
  const topbarLeft = dom.topbarLeft || topbar?.querySelector?.(".topbar-left") || null;
  const topbarRight = dom.topbarRight || topbar?.querySelector?.(".topbar-right") || null;
  const mainContent = dom.mainContent || (isBrowser() ? document.querySelector?.(".main-content") || document.getElementById?.("main-content") : null);
  const appContent = dom.appContent || (isBrowser() ? document.getElementById?.("app-content") : null);
  const viewContainer = dom.viewContainer || (isBrowser() ? document.getElementById?.("view-container") : null);
  const mutedNodes = topbarRight ? [...topbarRight.children].filter((node) => node !== searchWrap) : [];

  return { topbar, searchWrap, searchInput, searchResults, topbarLeft, topbarRight, mainContent, appContent, viewContainer, mutedNodes };
}

function setGlobalSearchLock(active = false) {
  if (!isBrowser()) return false;

  const enabled = Boolean(active);
  const htmlEl = document.documentElement;
  const body = document.body;

  for (const node of [htmlEl, body]) {
    toggleClass(node, "topbar-search-active", enabled);
    toggleClass(node, "search-active", enabled);
    setDataset(node, "topbarSearchOpen", enabled ? "true" : false);
    setDataset(node, "searchActive", enabled ? "true" : false);
  }

  toggleClass(body, "search-open", enabled);
  toggleClass(body, "has-topbar-search-glass", enabled);

  return true;
}

function setContentSearchState(nodes = {}, active = false) {
  const enabled = Boolean(active);

  [nodes.mainContent, nodes.appContent, nodes.viewContainer].filter(Boolean).forEach((node) => {
    toggleClass(node, "topbar-search-active", enabled);
    toggleClass(node, "search-active", enabled);
    toggleClass(node, "has-topbar-search-glass", enabled);
    setDataset(node, "topbarSearchOpen", enabled ? "true" : false);
    setDataset(node, "searchActive", enabled ? "true" : false);
  });

  return true;
}

function setMuted(node = null, active = false) {
  if (!node) return false;

  const enabled = Boolean(active);
  toggleClass(node, "is-search-muted", enabled);
  setDataset(node, "searchMuted", enabled ? "true" : false);
  setAttr(node, "aria-hidden", enabled ? "true" : false);

  return true;
}

function applySearchFocusMode(runtime, getDom) {
  cleanupLegacySearchGlass();

  const nodes = searchFocusNodes(getDom);
  const { topbar, searchWrap, searchInput, searchResults, topbarLeft, mutedNodes } = nodes;

  searchFocusRuntime.runtime = runtime || null;
  searchFocusRuntime.getDom = isFn(getDom) ? getDom : null;
  searchFocusRuntime.active = true;

  setGlobalSearchLock(true);
  setContentSearchState(nodes, true);

  toggleClass(topbar, "is-search-focused", true);
  toggleClass(searchWrap, "is-search-focused", true);
  toggleClass(searchWrap, "is-search-open", true);
  toggleClass(searchResults, "is-search-open", true);

  setDataset(topbar, "searchFocus", "true");
  setDataset(topbar, "searchOpen", "true");
  setDataset(searchWrap, "searchFocus", "true");
  setDataset(searchWrap, "searchOpen", "true");
  setDataset(searchResults, "searchOpen", "true");
  setDataset(searchInput, "searchOpen", "true");
  setAttr(searchInput, "aria-expanded", "true");

  setMuted(topbarLeft, true);
  mutedNodes.forEach((node) => setMuted(node, true));

  emitSearchEvent(runtime?.AppCore || null, "topbar:search:focus-open", { active: true });
  return true;
}

function clearSearchFocusMode(getDom) {
  const nodes = searchFocusNodes(getDom);
  const { topbar, searchWrap, searchInput, searchResults, topbarLeft, mutedNodes } = nodes;

  searchFocusRuntime.runtime = null;
  searchFocusRuntime.getDom = null;
  searchFocusRuntime.active = false;

  setGlobalSearchLock(false);
  setContentSearchState(nodes, false);
  cleanupLegacySearchGlass();

  toggleClass(topbar, "is-search-focused", false);
  toggleClass(searchWrap, "is-search-focused", false);
  toggleClass(searchWrap, "is-search-open", false);
  toggleClass(searchResults, "is-search-open", false);

  setDataset(topbar, "searchFocus", false);
  setDataset(topbar, "searchOpen", false);
  setDataset(searchWrap, "searchFocus", false);
  setDataset(searchWrap, "searchOpen", false);
  setDataset(searchResults, "searchOpen", false);
  setDataset(searchInput, "searchOpen", false);
  setAttr(searchInput, "aria-expanded", "false");

  setMuted(topbarLeft, false);
  mutedNodes.forEach((node) => setMuted(node, false));

  return true;
}

export function isSearchFocusActive() {
  return Boolean(searchFocusRuntime.active);
}

/* =========================================================
   CONTROL / CACHE
========================================================= */

export function clearSearchDebounce(runtime) {
  if (!runtime?.searchDebounceTimer) return false;

  try {
    if (isBrowser()) window.clearTimeout(runtime.searchDebounceTimer);
    else clearTimeout(runtime.searchDebounceTimer);
  } catch {}

  runtime.searchDebounceTimer = null;
  return true;
}

export function abortSearch(runtime) {
  if (!runtime?.searchController) return false;

  try {
    runtime.searchController.abort();
  } catch {}

  runtime.searchController = null;
  return true;
}

export function clearSearchState(runtime, getDom = searchFocusRuntime.getDom) {
  if (!runtime) return false;

  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;

  clearSearchFocusMode(getDom);
  return true;
}

export function getCacheKey(query = "") {
  return normalizeText(query);
}

export function getCached(runtime, query = "") {
  if (!runtime?.cache) return null;

  const key = getCacheKey(query);
  const found = runtime.cache.get(key);
  if (!found) return null;

  if (Date.now() - found.createdAt > cacheTtlMs()) {
    runtime.cache.delete(key);
    return null;
  }

  return found.value;
}

export function setCached(runtime, query = "", value = []) {
  if (!runtime) return false;
  if (!runtime.cache) runtime.cache = new Map();

  runtime.cache.set(getCacheKey(query), {
    value,
    createdAt: Date.now(),
  });

  return true;
}

/* =========================================================
   LOCAL SEARCH
========================================================= */

function userIsAdmin(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const user = safeObject(state.user || state.currentUser || state.authUser || state.sessionUser || state.profile);
  const roles = safeArray(state.roles || user.roles).map((role) => normalizeText(role));
  const role = normalizeText(state.role || state.rol || user.role || user.rol || "");

  return Boolean(state.isAdmin === true || state.admin === true || user.isAdmin === true || user.admin === true || role === "admin" || roles.includes("admin"));
}

export function getLocalIndex(AppCore = null) {
  const items = [
    { id: "nav:/", type: ENTITY_TYPES.NAV, title: "Inicio", subtitle: "Panel principal", url: "/", action: SEARCH_ACTIONS.NAVIGATE },
    { id: "nav:/incidencias", type: ENTITY_TYPES.NAV, title: "Incidencias", subtitle: "Gestión de tickets e incidencias", url: "/incidencias", action: SEARCH_ACTIONS.NAVIGATE },
    { id: "nav:/facturas", type: ENTITY_TYPES.NAV, title: "Facturas", subtitle: "Facturación y documentos", url: "/facturas", action: SEARCH_ACTIONS.NAVIGATE },
    { id: "nav:/cuenta", type: ENTITY_TYPES.NAV, title: "Cuenta", subtitle: "Perfil y seguridad", url: "/cuenta", action: SEARCH_ACTIONS.NAVIGATE },
    { id: "nav:/ajustes", type: ENTITY_TYPES.NAV, title: "Ajustes", subtitle: "Configuración general", url: "/ajustes", action: SEARCH_ACTIONS.NAVIGATE },
    { id: "nav:/usuarios", type: ENTITY_TYPES.NAV, title: "Usuarios", subtitle: "Gestión de usuarios", url: "/usuarios", action: SEARCH_ACTIONS.NAVIGATE, adminOnly: true },
    { id: "nav:/clientes", type: ENTITY_TYPES.NAV, title: "Clientes", subtitle: "Gestión de clientes", url: "/clientes", action: SEARCH_ACTIONS.NAVIGATE, adminOnly: true },
    { id: "nav:/servidor", type: ENTITY_TYPES.NAV, title: "Servidor", subtitle: "Estado del servidor", url: "/servidor", action: SEARCH_ACTIONS.NAVIGATE, adminOnly: true },
  ];

  return items.filter((item) => !item.adminOnly || userIsAdmin(AppCore));
}

export function searchLocal(query = "", AppCore = null) {
  const q = normalizeQuery(query);
  if (!q) return [];

  return getLocalIndex(AppCore)
    .map((item) => {
      const score = scoreTextMatch(item.title, q) + scoreTextMatch(item.subtitle, q) + scoreTextMatch(item.url, q);
      return { ...item, entityId: "", raw: item, score, source: "local" };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* =========================================================
   API NORMALIZATION / SEARCH
========================================================= */

export function normalizeApiItem(AppCore, raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;

  const type = normalizeSearchType(rawType(raw));
  const title = rawTitle(raw);
  const subtitle = rawSubtitle(raw);
  const entityId = entityIdByType(type, raw, "");
  const action = actionForType(type, raw);
  const url = rawUrl(raw) ? normalizeResultUrl(AppCore, rawUrl(raw)) : fallbackUrl(AppCore, type, entityId, raw);
  const id = safeText(first(raw.searchId, raw.resultId, raw.id, raw._id, raw.uuid, entityId ? `${type}:${entityId}` : "", `${type}:${url || title}:${index}`), `${type}:${index}`);

  if (!title && !url && !entityId) return null;

  return {
    id: String(id),
    entityId: String(entityId || ""),
    type,
    title: String(title || "Resultado"),
    subtitle: String(subtitle || ""),
    url: url || null,
    action,
    raw,
    source: "api",
  };
}

function extractArray(data = null) {
  if (Array.isArray(data)) return data;

  const obj = safeObject(data);

  return first(
    Array.isArray(obj.results) ? obj.results : null,
    Array.isArray(obj.items) ? obj.items : null,
    Array.isArray(obj.data) ? obj.data : null,
    Array.isArray(obj.payload) ? obj.payload : null,
    Array.isArray(obj.searchResults) ? obj.searchResults : null,
    null
  );
}

export function normalizeApiPayload(AppCore, data) {
  if (!data) return [];

  const direct = extractArray(data);

  if (direct) {
    return direct.map((item, index) => normalizeApiItem(AppCore, item, index)).filter(Boolean);
  }

  const groupedKeys = ["clientes", "clients", "usuarios", "users", "facturas", "invoices", "tickets", "incidencias", "issues", "nav", "routes", "recientes", "recentes"];
  const out = [];

  for (const key of groupedKeys) {
    if (!Array.isArray(data?.[key])) continue;

    data[key].forEach((item, index) => {
      const normalized = normalizeApiItem(AppCore, { ...safeObject(item), type: item?.type || key }, index);
      if (normalized) out.push(normalized);
    });
  }

  return out;
}

async function requestGet(AppCore, path = "", options = {}) {
  const clients = [AppCore?.apiClient, AppCore?.Http, AppCore?.http].filter(Boolean);
  let lastError = null;

  for (const client of clients) {
    if (!isFn(client?.get)) continue;

    try {
      return await client.get(path, options);
    } catch (error) {
      lastError = error;
    }
  }

  try {
    if (isFn(AppCore?.request)) return await AppCore.request(path, { ...options, method: "GET" });
  } catch (error) {
    lastError = error;
  }

  try {
    if (isFn(AppCore?.http?.request)) return await AppCore.http.request(path, { ...options, method: "GET" });
  } catch (error) {
    lastError = error;
  }

  if (lastError) throw lastError;
  return null;
}

export async function searchAPI({ AppCore, runtime, query = "" }) {
  const cached = getCached(runtime, query);
  if (cached) return cached;

  abortSearch(runtime);

  const controller = safeAbortController();
  if (runtime) runtime.searchController = controller;

  const options = {
    query: { q: query },
    auth: true,
    timeout: timeoutMs(),
  };

  if (controller?.signal) options.signal = controller.signal;

  try {
    let data = null;

    try {
      data = await requestGet(AppCore, "/api/search", options);
    } catch (firstError) {
      if (firstError?.aborted || firstError?.name === "AbortError") return [];
      data = await requestGet(AppCore, `/api/search?q=${encodeURIComponent(query)}`, { auth: true, timeout: timeoutMs(), signal: controller?.signal });
    }

    const normalized = normalizeApiPayload(AppCore, data);
    setCached(runtime, query, normalized);

    return normalized;
  } catch (error) {
    if (error?.aborted || error?.name === "AbortError") return [];
    warn(AppCore, "Fallo búsqueda API.", error);
    throw error;
  } finally {
    if (runtime?.searchController === controller) runtime.searchController = null;
  }
}

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged = uniqBy(
    [...safeArray(apiResults), ...safeArray(localResults)].map((item) => ({
      ...item,
      score: scoreResult(item, query),
    })),
    (item) => [item.type || "", item.entityId || "", item.url || "", item.title || "", item.subtitle || ""].join("|")
  );

  return merged
    .filter((item) => item.score > 0 || item.source === "api")
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResultsTotal());
}

/* =========================================================
   VISUAL STATE
========================================================= */

export function setSearchExpanded(input, expanded = false) {
  setAttr(input, "aria-expanded", String(Boolean(expanded)));
}

export function showResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = isFn(getDom) ? getDom() : {};
  if (!searchResults) return false;

  try {
    searchResults.hidden = false;
    searchResults.classList.add("active", "is-open", "is-search-open");
    searchResults.setAttribute("aria-hidden", "false");
    searchResults.setAttribute("role", "listbox");
    searchResults.dataset.searchOpen = "true";
  } catch {}

  setSearchExpanded(searchInput, true);
  applySearchFocusMode(runtime, getDom);
  return true;
}

export function hideResultsContainer(runtime, getDom) {
  if (!runtime) return false;

  const { searchResults, searchInput } = isFn(getDom) ? getDom() : {};

  if (searchResults) {
    try {
      searchResults.classList.remove("active", "is-open", "is-search-open");
      searchResults.hidden = true;
      searchResults.setAttribute("aria-hidden", "true");
      searchResults.removeAttribute("data-search-open");
      searchResults.innerHTML = "";
    } catch {}
  }

  try {
    searchInput?.removeAttribute?.("aria-activedescendant");
  } catch {}

  runtime.activeIndex = -1;
  runtime.currentItems = [];

  setSearchExpanded(searchInput, false);
  clearSearchFocusMode(getDom);

  return true;
}

function renderSearchState({ runtime, getDom, state = "empty", title = "", text = "", query = "" }) {
  if (!isBrowser()) return false;

  const { searchResults } = getDom();
  if (!searchResults) return false;

  searchResults.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = `search-state search-state-${state}`;
  wrapper.setAttribute("aria-live", "polite");
  if (query) wrapper.dataset.query = query;

  const titleEl = document.createElement("div");
  titleEl.className = "search-state-title";
  titleEl.textContent = title;

  const textEl = document.createElement("div");
  textEl.className = "search-state-text";
  textEl.textContent = text;

  wrapper.appendChild(titleEl);
  wrapper.appendChild(textEl);
  searchResults.appendChild(wrapper);

  showResultsContainer(runtime, getDom);
  return true;
}

export function setLoadingState(AppCore, runtime, getDom, query = "") {
  return renderSearchState({
    runtime,
    getDom,
    state: "loading",
    title: "Buscando",
    text: query ? `Buscando “${query}”...` : "Buscando...",
    query,
  });
}

export function setEmptyState(AppCore, runtime, getDom, query = "") {
  return renderSearchState({
    runtime,
    getDom,
    state: "empty",
    title: "Sin resultados",
    text: query ? `No encontramos coincidencias para “${query}”.` : "No hay resultados.",
    query,
  });
}

export function setErrorState(runtime, getDom) {
  return renderSearchState({
    runtime,
    getDom,
    state: "error",
    title: "No se pudo completar la búsqueda",
    text: "Revisa la conexión o inténtalo de nuevo.",
  });
}

export function updateActiveItem(runtime, items = []) {
  safeArray(items).forEach((el) => {
    try { el.classList.remove("active"); } catch {}
  });

  if (runtime?.activeIndex >= 0 && items[runtime.activeIndex]) {
    try {
      items[runtime.activeIndex].classList.add("active");
      items[runtime.activeIndex].scrollIntoView({ block: "nearest" });
    } catch {}
  }
}

export function updateActiveVisuals(runtime, getDom) {
  const { searchResults, searchInput } = getDom();
  if (!searchResults) return;

  const items = [...searchResults.querySelectorAll(".search-result")];

  items.forEach((el, index) => {
    const active = index === runtime.activeIndex;

    try {
      el.classList.toggle("active", active);
      el.setAttribute("aria-selected", String(active));

      if (active && searchInput && el.id) searchInput.setAttribute("aria-activedescendant", el.id);
    } catch {}
  });

  if (runtime.activeIndex < 0) {
    try { searchInput?.removeAttribute?.("aria-activedescendant"); } catch {}
  }

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    try { items[runtime.activeIndex].scrollIntoView({ block: "nearest" }); } catch {}
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateToPath(AppCore, Router, path = "", options = {}) {
  const target = normalizeResultUrl(AppCore, path || "/");
  if (!target) return false;

  if (isFn(Router?.navigate)) {
    const result = Router.navigate(target, {
      force: options.force !== false,
      replaceState: Boolean(options.replaceState),
      source: options.source || SOURCE,
    });

    if (result && isFn(result.then)) await result;
    return true;
  }

  if (isFn(Router?.go)) {
    const result = Router.go(target, { source: options.source || SOURCE });
    if (result && isFn(result.then)) await result;
    return true;
  }

  if (isBrowser()) {
    window.location.href = target;
    return true;
  }

  return false;
}

function openEventNames(action = "", type = "") {
  if (action === SEARCH_ACTIONS.OPEN_USUARIO || type === ENTITY_TYPES.USUARIO) return ["topbar:search:open-usuario", "usuarios:ficha:open"];
  if (action === SEARCH_ACTIONS.OPEN_CLIENTE || type === ENTITY_TYPES.CLIENTE) return ["topbar:search:open-cliente", "clientes:ficha:open"];
  if (action === SEARCH_ACTIONS.OPEN_INCIDENCIA || type === ENTITY_TYPES.INCIDENCIA) return ["topbar:search:open-incidencia", "incidencias:detail:open"];
  if (action === SEARCH_ACTIONS.OPEN_FACTURA || type === ENTITY_TYPES.FACTURA) return ["topbar:search:open-factura", "facturas:detail:open"];
  return ["topbar:search:navigate"];
}

function openPayload(item = {}) {
  const type = normalizeSearchType(item.type);
  const id = safeText(item.entityId, "");
  const payload = {
    source: SOURCE,
    item,
    raw: item.raw || null,
    detail: item.raw || null,
    entityId: id,
    id,
    type,
  };

  if (type === ENTITY_TYPES.USUARIO) Object.assign(payload, { userId: id, usuarioId: id, user: item.raw, usuario: item.raw });
  if (type === ENTITY_TYPES.CLIENTE) Object.assign(payload, { clientId: id, clienteId: id, client: item.raw, cliente: item.raw });
  if (type === ENTITY_TYPES.INCIDENCIA) Object.assign(payload, { ticketId: id, incidenciaId: id, ticket: item.raw, incidencia: item.raw });
  if (type === ENTITY_TYPES.FACTURA) Object.assign(payload, { facturaId: id, invoiceId: id, factura: item.raw, invoice: item.raw });

  return payload;
}

export async function goToResult({ AppCore, Router, runtime, getDom, closeSidebarMobile, item = null }) {
  if (!item) return false;

  const { searchInput } = getDom();
  hideResultsContainer(runtime, getDom);

  try { searchInput?.blur?.(); } catch {}
  try { closeSidebarMobile?.(); } catch {}

  const action = safeText(item.action || actionForType(item.type, item.raw), SEARCH_ACTIONS.NAVIGATE);
  const type = normalizeSearchType(item.type);
  const payload = openPayload(item);
  const events = openEventNames(action, type);

  try {
    events.forEach((eventName) => emitSearchEvent(AppCore, eventName, payload));

    const target = safeText(item.url || fallbackUrl(AppCore, item.type, item.entityId, item.raw), "");
    if (!target) return true;

    return await navigateToPath(AppCore, Router, target, { force: true });
  } catch (error) {
    warn(AppCore, "No se pudo abrir resultado de búsqueda.", { item, error });
    showToast(AppCore, "No se pudo abrir el resultado.", "error");

    const fallback = safeText(item.url || fallbackUrl(AppCore, item.type, item.entityId, item.raw), "");
    return fallback ? navigateToPath(AppCore, Router, fallback, { force: true }) : false;
  }
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function actionPill(item = {}) {
  const label = actionLabel(item);
  if (!label) return "";
  return `<span class="search-action-pill" aria-hidden="true">${html(label)}</span>`;
}

function highlightSafe(value = "", query = "") {
  const text = safeText(value, "");
  const q = safeText(query, "");
  if (!text || !q) return html(text);

  try {
    const normalized = normalizeText(text);
    const normalizedQuery = normalizeText(q);
    const index = normalized.indexOf(normalizedQuery);

    if (index < 0) return html(text);

    const before = text.slice(0, index);
    const match = text.slice(index, index + q.length);
    const after = text.slice(index + q.length);

    return `${html(before)}<mark>${html(match)}</mark>${html(after)}`;
  } catch {
    return html(text);
  }
}

function resultFromEvent(event, runtime) {
  const node = event?.target?.closest?.(".search-result");
  if (!node) return { node: null, item: null, index: -1 };

  const index = Number(node.dataset.index);
  if (!Number.isFinite(index) || index < 0) return { node, item: null, index: -1 };

  return {
    node,
    item: Array.isArray(runtime?.currentItems) ? runtime.currentItems[index] || null : null,
    index,
  };
}

function ensureResultsDelegation({ runtime, getDom }) {
  const { searchResults } = getDom();
  if (!runtime || !searchResults || delegatedResultNodes.has(searchResults)) return;

  searchResults.addEventListener("click", async (event) => {
    const { item } = resultFromEvent(event, runtime);
    if (!item) return;

    await goToResult({
      AppCore: runtime.AppCore,
      Router: runtime.Router,
      runtime,
      getDom,
      closeSidebarMobile: runtime.closeSidebarMobile,
      item,
    });
  });

  searchResults.addEventListener("mouseenter", (event) => {
    const { index } = resultFromEvent(event, runtime);
    if (index < 0) return;

    runtime.activeIndex = index;
    updateActiveVisuals(runtime, getDom);
  }, true);

  delegatedResultNodes.add(searchResults);
}

export function renderResults({ AppCore, Router, runtime, getDom, closeSidebarMobile, results = [], query = "" }) {
  if (!isBrowser()) return false;

  const { searchResults } = getDom();
  if (!searchResults) return false;

  ensureResultsDelegation({ runtime, getDom });

  searchResults.innerHTML = "";
  runtime.activeIndex = -1;
  runtime.currentItems = [];

  if (!results.length) {
    setEmptyState(AppCore, runtime, getDom, query);
    return true;
  }

  const groups = groupResults(results);
  const fragment = document.createDocumentFragment();

  groups.forEach(([type, items]) => {
    const section = document.createElement("section");
    section.className = "search-group-block";
    section.dataset.group = type;

    const header = document.createElement("div");
    header.className = "search-group";
    header.textContent = getTypeLabel(type);
    section.appendChild(header);

    items.slice(0, maxResultsPerGroup()).forEach((item) => {
      const index = runtime.currentItems.length;
      const button = document.createElement("button");

      button.type = "button";
      button.id = `topbar-search-result-${index}`;
      button.className = "search-result";
      button.dataset.type = item.type || ENTITY_TYPES.GENERAL;
      button.dataset.url = item.url || "";
      button.dataset.action = item.action || SEARCH_ACTIONS.NAVIGATE;
      button.dataset.entityId = item.entityId || "";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-label", `${item.title || "Resultado"}${item.subtitle ? `, ${item.subtitle}` : ""}`);

      button.innerHTML = `
        <span class="search-icon" aria-hidden="true">${html(getTypeIcon(item.type))}</span>
        <span class="search-text">
          <span class="search-title">
            <span class="search-title-main">${highlightSafe(item.title || "", query)}</span>
            ${actionPill(item)}
          </span>
          ${item.subtitle ? `<span class="search-subtitle">${highlightSafe(item.subtitle || "", query)}</span>` : ""}
        </span>
      `;

      runtime.currentItems.push(item);
      section.appendChild(button);
    });

    fragment.appendChild(section);
  });

  searchResults.appendChild(fragment);
  showResultsContainer(runtime, getDom);

  return true;
}

/* =========================================================
   RUN SEARCH
========================================================= */

export async function runSearch({ AppCore, Router, runtime, getDom, closeSidebarMobile, query = "" }) {
  if (!runtime) return false;

  const q = normalizeQuery(query);

  runtime.AppCore = AppCore;
  runtime.Router = Router;
  runtime.closeSidebarMobile = closeSidebarMobile;
  runtime.currentQuery = q;
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;

  const seq = runtime.searchSeq;

  if (!q || q.length < minQueryLength()) {
    abortSearch(runtime);
    hideResultsContainer(runtime, getDom);
    return true;
  }

  setLoadingState(AppCore, runtime, getDom, q);

  try {
    const local = searchLocal(q, AppCore);

    if (local.length && runtime.currentQuery === q && runtime.searchSeq === seq) {
      renderResults({ AppCore, Router, runtime, getDom, closeSidebarMobile, results: local, query: q });
    }

    const remote = await searchAPI({ AppCore, runtime, query: q });
    if (runtime.currentQuery !== q || runtime.searchSeq !== seq) return true;

    const merged = mergeResults(remote, local, q);
    renderResults({ AppCore, Router, runtime, getDom, closeSidebarMobile, results: merged, query: q });

    return true;
  } catch {
    if (runtime.currentQuery !== q || runtime.searchSeq !== seq) return true;

    const local = searchLocal(q, AppCore);

    if (local.length) {
      renderResults({ AppCore, Router, runtime, getDom, closeSidebarMobile, results: local, query: q });
      return true;
    }

    setErrorState(runtime, getDom);
    return false;
  }
}

export default {
  TOPBAR_SEARCH_VERSION,
  SEARCH_ACTIONS,
  ENTITY_TYPES,

  clearSearchDebounce,
  abortSearch,
  clearSearchState,

  getCacheKey,
  getCached,
  setCached,

  getLocalIndex,
  searchLocal,

  normalizeApiItem,
  normalizeApiPayload,
  searchAPI,
  mergeResults,

  setSearchExpanded,
  showResultsContainer,
  hideResultsContainer,
  setLoadingState,
  setEmptyState,
  setErrorState,
  updateActiveItem,
  updateActiveVisuals,

  goToResult,
  renderResults,
  runSearch,

  isSearchFocusActive,
};

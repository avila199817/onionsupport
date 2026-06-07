/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   FULL PRO SAAS PANEL · BACKEND SEARCH · GOD MODE

   Responsabilidad:
   - Montar topbar en #topbar-mount / #app-topbar.
   - Mostrar título de ruta.
   - Ocultarse en rutas públicas/auth.
   - Consumir /api/search del backend.
   - Pintar resultados remotos: facturas, tickets, clientes, usuarios y rutas.
   - Mantener fallback local de navegación.
   - Debounce, AbortController, cache corta y control anti-race.
   - Navegación SPA segura.
   - Sin exponer tokens, secretos ni rutas externas.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  createTopbarTemplate,
  getTopbarTemplateRefs,
  setTopbarTemplateTitle,
  setTopbarTemplateVisible,
  clearTopbarSearchResults,
  setTopbarSearchExpanded,
  renderTopbarSearchResults,
  setTopbarSearchActiveIndex,
} from "./template.js";

export const TOPBAR_VERSION = "topbar.controller.backend-search.v4";

const TOPBAR_ROOT_ID = "app-topbar";
const TOPBAR_MOUNT_ID = "topbar-mount";
const APP_TITLE_PREFIX = "Onion";

const SOURCE = "topbar.search";

const SEARCH_ENDPOINT_DEFAULT = "/api/search";
const SEARCH_LIMIT = 10;
const BACKEND_LIMIT = 12;
const BACKEND_DEBOUNCE_MS = 150;
const BACKEND_TIMEOUT_MS = 9000;
const BACKEND_CACHE_TTL_MS = 25_000;
const BACKEND_CACHE_MAX = 80;

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

const SEARCH_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  ERROR: "error",
});

const RESULT_TYPES = Object.freeze({
  NAV: "nav",
  SETTINGS: "settings",
  CLIENTE: "cliente",
  USER: "user",
  INCIDENCIA: "incidencia",
  FACTURA: "factura",
  HARDWARE: "hardware",
  GENERAL: "general",
});

const TYPE_ICON = Object.freeze({
  [RESULT_TYPES.NAV]: "→",
  [RESULT_TYPES.SETTINGS]: "AJ",
  [RESULT_TYPES.CLIENTE]: "CL",
  [RESULT_TYPES.USER]: "US",
  [RESULT_TYPES.INCIDENCIA]: "IN",
  [RESULT_TYPES.FACTURA]: "FA",
  [RESULT_TYPES.HARDWARE]: "HW",
  [RESULT_TYPES.GENERAL]: "⌕",
});

const SEARCH_ROUTES = Object.freeze([
  {
    key: "home",
    label: "Home",
    description: "Panel principal",
    route: "/",
    icon: "HM",
    keywords: ["inicio", "dashboard", "panel", "principal", "home"],
  },
  {
    key: "incidencias",
    label: "Incidencias",
    description: "Tickets y solicitudes de soporte",
    route: "/incidencias",
    icon: "IN",
    keywords: [
      "incidencias",
      "incidencia",
      "ticket",
      "tickets",
      "soporte",
      "solicitudes",
      "casos",
      "crear incidencia",
      "nueva incidencia",
      "mis tickets",
      "mis incidencias",
    ],
  },
  {
    key: "facturas",
    label: "Facturas",
    description: "Facturación, importes, PDFs y pagos",
    route: "/facturas",
    icon: "FA",
    keywords: [
      "factura",
      "facturas",
      "billing",
      "pagos",
      "importe",
      "facturacion",
      "facturación",
      "invoice",
      "pdf",
      "mis facturas",
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    description: "Administración de clientes",
    route: "/clientes",
    icon: "CL",
    adminOnly: true,
    keywords: [
      "cliente",
      "clientes",
      "clients",
      "empresas",
      "cuentas",
      "administracion",
      "administración",
      "perfil cliente",
      "ficha cliente",
    ],
  },
  {
    key: "usuarios",
    label: "Usuarios",
    description: "Administración de usuarios",
    route: "/usuarios",
    icon: "US",
    adminOnly: true,
    keywords: [
      "usuario",
      "usuarios",
      "users",
      "miembros",
      "permisos",
      "roles",
      "buscar usuario",
    ],
  },
  {
    key: "servidor",
    label: "Servidor",
    description: "Estado y configuración del servidor",
    route: "/servidor",
    icon: "SV",
    adminOnly: true,
    keywords: ["server", "servidor", "estado", "sistema", "infraestructura"],
  },
  {
    key: "cuenta",
    label: "Cuenta",
    description: "Perfil y datos de cuenta",
    route: "/cuenta",
    icon: "CU",
    keywords: [
      "perfil",
      "profile",
      "mi cuenta",
      "mi perfil",
      "account",
      "usuario",
      "mi usuario",
    ],
  },
  {
    key: "ajustes",
    label: "Ajustes",
    description: "Preferencias y configuración",
    route: "/ajustes",
    icon: "AJ",
    keywords: [
      "settings",
      "ajustes",
      "configuracion",
      "configuración",
      "preferencias",
    ],
  },
]);

let initialized = false;
let mounted = false;
let root = null;
let cleanupEvents = null;
let lastOptions = {};

let latestSearchResults = [];
let activeSearchIndex = -1;
let lastSearchQuery = "";
let lastSearchStatus = SEARCH_STATUS.IDLE;
let lastSearchError = "";

let backendTimer = null;
let backendSeq = 0;
let backendAbort = null;

const backendCache = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function normalizeText(value = "") {
  return cleanText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeCompact(value = "") {
  return normalizeText(value).replace(/[^a-z0-9@._\-/#]/gi, "");
}

function titleCase(value = "") {
  const clean = cleanText(value, "");

  if (!clean) return "";

  return clean
    .replace(/^\/+/, "")
    .replace(/^@[^/]+\/?/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueBy(list = [], keyFn = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(list)) {
    const key = cleanText(keyFn(item), "");

    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;

  return Math.min(Math.max(n, min), max);
}

function truncate(value = "", max = 180) {
  const text = cleanText(value, "");

  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function callMaybe(fn, ...args) {
  if (!isFunction(fn)) return null;

  try {
    return fn(...args);
  } catch {
    return null;
  }
}

/* =========================================================
   SECURITY / PATHS
========================================================= */

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function safeInternalPath(value = "", fallback = "") {
  const raw = cleanText(value, "");

  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;

  if (
    raw === "/api" ||
    raw.startsWith("/api/") ||
    raw === "/.auth" ||
    raw.startsWith("/.auth/") ||
    raw === "/docs" ||
    raw.startsWith("/docs/")
  ) {
    return fallback;
  }

  return raw;
}

function safeFetchUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";

  if (raw.startsWith("/")) return raw;

  try {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (hasSensitiveQuery(parsed.search)) return "";

    return parsed.toString();
  } catch {
    return "";
  }
}

function directRouteFromQuery(value = "") {
  const query = cleanText(value, "");

  if (!query.startsWith("/")) return "";

  return safeInternalPath(query, "");
}

function encodeParam(value = "") {
  return encodeURIComponent(cleanText(value, ""));
}

/* =========================================================
   CORE / ROLE / ROUTER
========================================================= */

function getCoreState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getCoreState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function normalizeRole(value = "") {
  const role = cleanText(value, "").toLowerCase();

  if (["admin", "superadmin", "owner", "root"].includes(role)) return ROLE_ADMIN;
  if (["user", "usuario", "client", "cliente"].includes(role)) return ROLE_USER;

  return "";
}

function normalizeRoleList(value = []) {
  const raw = Array.isArray(value)
    ? value.flat(Infinity)
    : cleanText(value, "").split(/[,\s|;]+/);

  return [
    ...new Set(
      raw
        .map(normalizeRole)
        .filter(Boolean)
    ),
  ];
}

function getCurrentRole() {
  const state = getCoreState();
  const user = getCurrentUser() || {};

  const roles = normalizeRoleList([
    callMaybe(AppCore.getCurrentRole?.bind?.(AppCore) || AppCore.getCurrentRole),
    state.role,
    state.rol,
    state.roles,
    user.role,
    user.rol,
    user.roles,
  ]);

  if (user.isAdmin === true || roles.includes(ROLE_ADMIN)) return ROLE_ADMIN;
  if (roles.includes(ROLE_USER)) return ROLE_USER;

  return ROLE_USER;
}

function isAdmin() {
  return getCurrentRole() === ROLE_ADMIN;
}

function getCurrentUserId() {
  const state = getCoreState();
  const user = getCurrentUser() || {};

  return cleanText(
    first(
      user.userId,
      user.uid,
      user.id,
      user.sub,
      state.userId,
      state.uid
    ),
    ""
  );
}

function getRouter(context = {}) {
  return (
    context.Router ||
    context.router ||
    AppCore.router ||
    AppCore.Router ||
    callMaybe(AppCore.getModule?.bind?.(AppCore), "router") ||
    null
  );
}

async function navigateTo(path = "", meta = {}) {
  const route = safeInternalPath(path, "");

  if (!route) return false;

  const Router = getRouter(lastOptions);

  if (isFunction(Router?.navigate)) {
    await Router.navigate(route, {
      source: SOURCE,
      ...meta,
    });

    return true;
  }

  if (isFunction(AppCore.navigate)) {
    await AppCore.navigate(route, {
      source: SOURCE,
      ...meta,
    });

    return true;
  }

  if (isFunction(Router?.go)) {
    await Router.go(route, {
      source: SOURCE,
      ...meta,
    });

    return true;
  }

  if (isBrowser()) {
    try {
      window.dispatchEvent(
        new CustomEvent("app:navigate", {
          detail: {
            route,
            source: SOURCE,
            ...meta,
          },
        })
      );

      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  return document.getElementById(id);
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    node.textContent = "";
    return true;
  }
}

function eventElement(target = null) {
  if (!target) return null;

  return target.nodeType === 3 ? target.parentElement : target;
}

function contains(parent = null, child = null) {
  try {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  } catch {
    return false;
  }
}

function getMount() {
  if (!isBrowser()) return null;

  return (
    byId(TOPBAR_MOUNT_ID) ||
    byId(TOPBAR_ROOT_ID) ||
    document.querySelector?.("[data-topbar-mount]") ||
    document.querySelector?.("[data-topbar-root]") ||
    null
  );
}

function getRefs() {
  return getTopbarTemplateRefs(root);
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");

    if (node.dataset) {
      node.dataset.topbarVisible = value ? "false" : "true";
    }

    return true;
  } catch {
    return false;
  }
}

function syncMountVisibility(hidden = false) {
  const mount = byId(TOPBAR_MOUNT_ID);

  if (!mount || mount === root) return false;

  return setHidden(mount, hidden);
}

function mountRoot(nextRoot) {
  const mount = getMount();

  if (!mount || !nextRoot) return null;

  unbindEvents();

  if (mount.matches?.("[data-topbar-root], #app-topbar")) {
    clear(mount);

    for (const child of [...nextRoot.childNodes]) {
      mount.appendChild(child);
    }

    mount.className = nextRoot.className;

    for (const [key, value] of Object.entries(nextRoot.dataset || {})) {
      mount.dataset[key] = value;
    }

    mount.setAttribute("role", nextRoot.getAttribute("role") || "banner");
    mount.setAttribute("aria-label", nextRoot.getAttribute("aria-label") || "Barra superior");
    mount.setAttribute("aria-hidden", nextRoot.getAttribute("aria-hidden") || "false");

    mount.hidden = nextRoot.hidden === true;

    root = mount;
  } else {
    clear(mount);
    mount.appendChild(nextRoot);
    root = nextRoot;
  }

  bindEvents();
  cacheDom();
  mounted = true;

  return root;
}

function ensureRoot(options = {}) {
  if (!isBrowser()) return null;

  const current =
    root ||
    byId(TOPBAR_ROOT_ID) ||
    document.querySelector?.("[data-topbar-root]") ||
    null;

  if (current) {
    const refs = getTopbarTemplateRefs(current);

    if (refs.title && refs.searchInput && refs.searchResults) {
      root = current;
      bindEvents();
      cacheDom();
      mounted = true;
      return root;
    }
  }

  const topbar = createTopbarTemplate({
    id: TOPBAR_ROOT_ID,
    title: resolveRouteTitle(options),
    visible: options.visible === true,
    search: options.search !== false,
    searchOptions: {
      placeholder: "Buscar facturas, tickets, clientes…",
      ...(options.searchOptions || {}),
    },
  });

  return mountRoot(topbar);
}

/* =========================================================
   DOM CACHE
========================================================= */

function cacheDom() {
  const refs = getRefs();

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.topbar = refs.root;
    AppCore.dom.appTopbar = refs.root;
    AppCore.dom.topbarRoot = refs.root;
    AppCore.dom.topbarMount =
      byId(TOPBAR_MOUNT_ID) ||
      (refs.root?.parentElement?.id === TOPBAR_MOUNT_ID ? refs.root.parentElement : null);

    AppCore.dom.topbarTitle = refs.title;

    AppCore.dom.search = refs.search;
    AppCore.dom.searchForm = refs.search;
    AppCore.dom.searchInput = refs.searchInput;
    AppCore.dom.searchSubmit = refs.searchSubmit;
    AppCore.dom.searchResults = refs.searchResults;

    return true;
  } catch {
    return false;
  }
}

function clearDomCache() {
  try {
    if (!isObject(AppCore.dom)) return false;

    delete AppCore.dom.topbar;
    delete AppCore.dom.appTopbar;
    delete AppCore.dom.topbarRoot;
    delete AppCore.dom.topbarMount;
    delete AppCore.dom.topbarTitle;

    delete AppCore.dom.search;
    delete AppCore.dom.searchForm;
    delete AppCore.dom.searchInput;
    delete AppCore.dom.searchSubmit;
    delete AppCore.dom.searchResults;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROUTE TITLE
========================================================= */

function currentPath() {
  const state = getCoreState();

  if (state.canonicalPath || state.route || state.path) {
    return cleanText(state.canonicalPath || state.route || state.path, "/");
  }

  if (!isBrowser()) return "/";

  return cleanText(window.location.pathname || "/", "/");
}

function resolveTitleFromPath(path = "/") {
  const clean = cleanText(path, "/").split("?")[0].split("#")[0];

  if (clean === "/" || clean.startsWith("/@")) {
    const parts = clean.split("/").filter(Boolean);

    if (parts.length <= 1) return "Home";

    return titleCase(parts[1]) || "Home";
  }

  return titleCase(clean) || "Home";
}

function resolveRouteTitle(options = {}) {
  const route = options.route || null;

  if (route?.title) return `${APP_TITLE_PREFIX} ${cleanText(route.title)}`;
  if (route?.name) return `${APP_TITLE_PREFIX} ${titleCase(route.name)}`;

  const path =
    options.canonicalPath ||
    options.path ||
    options.publicPath ||
    currentPath();

  return `${APP_TITLE_PREFIX} ${resolveTitleFromPath(path)}`;
}

function syncTitle(options = {}) {
  ensureRoot(options);

  if (!root) return false;

  return setTopbarTemplateTitle(root, resolveRouteTitle(options));
}

/* =========================================================
   VISIBILITY
========================================================= */

function shouldHide(options = {}) {
  const route = options.route || null;
  const state = getCoreState();

  return Boolean(
    route?.public === true ||
      route?.hideShell === true ||
      route?.layout === "auth" ||
      options.routeMode === "auth" ||
      options.chrome === "hidden" ||
      state.routeMode === "auth" ||
      state.chromeHidden === true ||
      state.chrome === "hidden"
  );
}

function syncVisibility(options = {}) {
  ensureRoot(options);

  if (!root) return false;

  const hidden = shouldHide(options);

  setTopbarTemplateVisible(root, !hidden);
  syncMountVisibility(hidden);

  if (hidden) {
    clearSearch({
      input: true,
      focus: false,
    });
  }

  return true;
}

/* =========================================================
   BACKEND CONFIG
========================================================= */

function readWindowConfig(...names) {
  if (!isBrowser()) return "";

  const buckets = [
    window.ONION_CONFIG,
    window.__ONION_CONFIG__,
    window.APP_CONFIG,
    window.__APP_CONFIG__,
    window.__ENV__,
    window.env,
  ].filter(isObject);

  for (const name of names) {
    if (!name) continue;

    if (window[name] !== undefined && window[name] !== null) {
      return window[name];
    }

    for (const bucket of buckets) {
      if (bucket[name] !== undefined && bucket[name] !== null) {
        return bucket[name];
      }
    }
  }

  return "";
}

function stripTrailingSlash(value = "") {
  return cleanText(value, "").replace(/\/+$/, "");
}

function getCoreConfig() {
  const state = getCoreState();

  return {
    ...(isObject(AppCore.config) ? AppCore.config : {}),
    ...(isObject(AppCore.env) ? AppCore.env : {}),
    ...(isObject(state.config) ? state.config : {}),
    ...(isObject(state.env) ? state.env : {}),
  };
}

function resolveApiBase(options = {}) {
  const config = getCoreConfig();

  const base = cleanText(
    first(
      options.apiBaseUrl,
      options.apiBase,
      options.baseUrl,
      options.backendUrl,
      config.apiBaseUrl,
      config.apiBase,
      config.backendUrl,
      readWindowConfig(
        "ONION_API_BASE_URL",
        "API_BASE_URL",
        "VITE_API_BASE_URL",
        "apiBaseUrl",
        "apiBase",
        "backendUrl"
      )
    ),
    ""
  );

  if (!base) return "";

  if (base.startsWith("/")) {
    return stripTrailingSlash(base);
  }

  try {
    const parsed = new URL(base);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return stripTrailingSlash(parsed.toString());
  } catch {
    return "";
  }
}

function resolveSearchEndpoint(options = {}) {
  const config = getCoreConfig();

  const endpoint = cleanText(
    first(
      options.searchEndpoint,
      options.searchUrl,
      options.searchApiUrl,
      config.searchEndpoint,
      config.searchUrl,
      config.searchApiUrl,
      readWindowConfig(
        "SEARCH_ENDPOINT",
        "SEARCH_URL",
        "searchEndpoint",
        "searchUrl"
      ),
      SEARCH_ENDPOINT_DEFAULT
    ),
    SEARCH_ENDPOINT_DEFAULT
  );

  const safeEndpoint = safeFetchUrl(endpoint) || SEARCH_ENDPOINT_DEFAULT;
  const apiBase = resolveApiBase(options);

  if (/^https?:\/\//i.test(safeEndpoint)) {
    return safeEndpoint;
  }

  if (apiBase && safeEndpoint.startsWith("/")) {
    return `${apiBase}${safeEndpoint}`;
  }

  return safeEndpoint.startsWith("/") ? safeEndpoint : `/${safeEndpoint}`;
}

function getAuthToken(options = {}) {
  const state = getCoreState();

  return cleanText(
    first(
      options.accessToken,
      options.token,
      callMaybe(AppCore.auth?.getAccessToken?.bind?.(AppCore.auth)),
      callMaybe(AppCore.auth?.getToken?.bind?.(AppCore.auth)),
      callMaybe(AppCore.getAccessToken?.bind?.(AppCore)),
      callMaybe(AppCore.getToken?.bind?.(AppCore)),
      state.accessToken,
      state.authToken,
      state.token
    ),
    ""
  );
}

function buildSearchHeaders(options = {}) {
  const headers = new Headers();

  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "XMLHttpRequest");
  headers.set("X-Search-Source", SOURCE);

  const token = getAuthToken(options);

  if (token) {
    headers.set(
      "Authorization",
      /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
    );
  }

  return headers;
}

function buildSearchUrl(query = "", options = {}) {
  const endpoint = resolveSearchEndpoint(options);

  let url;

  try {
    url = new URL(
      endpoint,
      isBrowser() ? window.location.origin : "http://localhost"
    );
  } catch {
    url = new URL(
      SEARCH_ENDPOINT_DEFAULT,
      isBrowser() ? window.location.origin : "http://localhost"
    );
  }

  url.searchParams.set("q", cleanText(query, ""));
  url.searchParams.set("limit", String(clampNumber(options.limit, 1, 20, BACKEND_LIMIT)));
  url.searchParams.set("includeClosed", "true");
  url.searchParams.set("source", SOURCE);

  const extraParams = isObject(options.searchParams)
    ? options.searchParams
    : isObject(options.params)
      ? options.params
      : {};

  for (const [key, value] of Object.entries(extraParams)) {
    if (!key || value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/* =========================================================
   CACHE
========================================================= */

function buildCacheKey(query = "", options = {}) {
  return [
    normalizeText(query),
    resolveSearchEndpoint(options),
    getCurrentRole(),
    getCurrentUserId(),
  ].join("|");
}

function getCachedResults(query = "", options = {}) {
  const key = buildCacheKey(query, options);
  const entry = backendCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.at > BACKEND_CACHE_TTL_MS) {
    backendCache.delete(key);
    return null;
  }

  return safeArray(entry.results);
}

function setCachedResults(query = "", results = [], options = {}) {
  const key = buildCacheKey(query, options);

  backendCache.set(key, {
    at: Date.now(),
    results: safeArray(results),
  });

  while (backendCache.size > BACKEND_CACHE_MAX) {
    const firstKey = backendCache.keys().next().value;
    backendCache.delete(firstKey);
  }

  return true;
}

function clearSearchCache() {
  backendCache.clear();
  return true;
}

/* =========================================================
   LOCAL SEARCH INDEX
========================================================= */

function normalizeResultType(value = "") {
  const raw = normalizeCompact(value);

  const map = {
    nav: RESULT_TYPES.NAV,
    route: RESULT_TYPES.NAV,
    ruta: RESULT_TYPES.NAV,

    settings: RESULT_TYPES.SETTINGS,
    setting: RESULT_TYPES.SETTINGS,
    ajustes: RESULT_TYPES.SETTINGS,
    ajuste: RESULT_TYPES.SETTINGS,

    cliente: RESULT_TYPES.CLIENTE,
    clientes: RESULT_TYPES.CLIENTE,
    client: RESULT_TYPES.CLIENTE,
    clients: RESULT_TYPES.CLIENTE,
    empresa: RESULT_TYPES.CLIENTE,

    user: RESULT_TYPES.USER,
    users: RESULT_TYPES.USER,
    usuario: RESULT_TYPES.USER,
    usuarios: RESULT_TYPES.USER,
    profile: RESULT_TYPES.USER,
    perfil: RESULT_TYPES.USER,
    cuenta: RESULT_TYPES.USER,

    factura: RESULT_TYPES.FACTURA,
    facturas: RESULT_TYPES.FACTURA,
    invoice: RESULT_TYPES.FACTURA,
    invoices: RESULT_TYPES.FACTURA,
    bill: RESULT_TYPES.FACTURA,
    billing: RESULT_TYPES.FACTURA,

    incidencia: RESULT_TYPES.INCIDENCIA,
    incidencias: RESULT_TYPES.INCIDENCIA,
    ticket: RESULT_TYPES.INCIDENCIA,
    tickets: RESULT_TYPES.INCIDENCIA,
    issue: RESULT_TYPES.INCIDENCIA,
    support: RESULT_TYPES.INCIDENCIA,
    soporte: RESULT_TYPES.INCIDENCIA,

    hardware: RESULT_TYPES.HARDWARE,
    device: RESULT_TYPES.HARDWARE,
    devices: RESULT_TYPES.HARDWARE,
  };

  return map[raw] || RESULT_TYPES.GENERAL;
}

function normalizeSearchItem(item = {}, order = 0) {
  const source = isObject(item) ? item : {};
  const route = safeInternalPath(source.route || source.href || source.path || "", "");

  return {
    key: cleanText(source.key || source.id || source.label || route, route),
    label: cleanText(source.label || source.title || source.name, route),
    description: cleanText(source.description || source.subtitle || source.text, ""),
    route,
    icon: cleanText(source.icon, "").slice(0, 2).toUpperCase(),
    type: normalizeResultType(source.type || RESULT_TYPES.NAV),
    keywords: safeArray(source.keywords).map((value) => cleanText(value, "")).filter(Boolean),
    adminOnly: source.adminOnly === true || source.requiresAdmin === true,
    hidden: source.hidden === true || !route,
    order,
    source: "local",
  };
}

function coreSearchItems(options = {}) {
  const state = getCoreState();
  const router = getRouter(options);

  return [
    ...safeArray(options.searchItems),
    ...safeArray(options.topbarSearchItems),
    ...safeArray(state.searchItems),
    ...safeArray(state.topbarSearchItems),
    ...safeArray(AppCore.searchItems),
    ...safeArray(AppCore.topbarSearchItems),
    ...safeArray(router?.searchItems),
    ...safeArray(router?.topbarSearchItems),
  ];
}

function buildSearchIndex(options = {}) {
  const admin = isAdmin();

  const defaults = SEARCH_ROUTES.map((item, index) => normalizeSearchItem(item, index));
  const custom = coreSearchItems(options).map((item, index) =>
    normalizeSearchItem(item, SEARCH_ROUTES.length + index)
  );

  return uniqueBy([...defaults, ...custom], (item) => `${item.route}:${item.label}`)
    .filter((item) => {
      if (item.hidden) return false;
      if (item.adminOnly && !admin) return false;
      return true;
    });
}

function scoreSearchItem(item = {}, query = "") {
  const q = normalizeText(query);

  if (!q) return 0;

  const tokens = q.split(/\s+/).filter(Boolean);

  const label = normalizeText(item.label);
  const route = normalizeText(item.route);
  const description = normalizeText(item.description);
  const keywords = normalizeText(safeArray(item.keywords).join(" "));

  const haystack = [label, route, description, keywords].join(" ");

  let score = 0;

  if (label === q) score += 160;
  if (route === q) score += 150;
  if (label.startsWith(q)) score += 100;
  if (route.startsWith(q)) score += 82;
  if (label.includes(q)) score += 64;
  if (route.includes(q)) score += 46;
  if (keywords.includes(q)) score += 42;
  if (description.includes(q)) score += 22;

  const tokenHits = tokens.filter((token) => haystack.includes(token)).length;

  if (tokens.length && tokenHits === tokens.length) {
    score += 34;
  } else {
    score += tokenHits * 11;
  }

  return score;
}

function directRouteResult(query = "") {
  const route = directRouteFromQuery(query);

  if (!route) return null;

  return {
    key: `route:${route}`,
    id: `route:${route}`,
    label: `Ir a ${route}`,
    title: `Ir a ${route}`,
    description: "Ruta directa",
    route,
    href: route,
    icon: "→",
    type: RESULT_TYPES.NAV,
    keywords: [],
    adminOnly: false,
    hidden: false,
    order: -1,
    score: 999,
    source: "local",
  };
}

function searchLocalTopbar(query = "", options = {}) {
  const q = cleanText(query, "");

  if (!q) return [];

  const direct = directRouteResult(q);

  const index = buildSearchIndex(options)
    .map((item) => ({
      ...item,
      score: scoreSearchItem(item, q),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    });

  const results = direct ? [direct, ...index] : index;

  return uniqueBy(results, (item) => item.route).slice(0, SEARCH_LIMIT);
}

/* =========================================================
   BACKEND RESULT NORMALIZATION
========================================================= */

function extractBackendResults(payload) {
  if (Array.isArray(payload)) return payload;

  const data = isObject(payload) ? payload : {};
  const nested = isObject(data.data) ? data.data : {};

  return safeArray(
    first(
      data.results,
      data.items,
      data.resources,
      data.matches,
      data.searchResults,
      nested.results,
      nested.items,
      nested.resources,
      nested.matches,
      nested.searchResults,
      []
    )
  );
}

function getResultId(item = {}) {
  return cleanText(
    first(
      item.entityId,
      item.facturaId,
      item.invoiceId,
      item.ticketId,
      item.incidenciaId,
      item.clienteId,
      item.clientId,
      item.userId,
      item.usuarioId,
      item.id,
      item.key
    ),
    ""
  );
}

function iconForResult(item = {}, type = RESULT_TYPES.GENERAL) {
  const icon = cleanText(item.icon || item.avatarInitials || "", "")
    .slice(0, 2)
    .toUpperCase();

  if (icon) return icon;

  return TYPE_ICON[type] || TYPE_ICON[RESULT_TYPES.GENERAL];
}

function routeFromBackendResult(item = {}) {
  const type = normalizeResultType(
    first(item.type, item.entity, item.kind, item.entityType)
  );

  const direct = safeInternalPath(
    first(item.route, item.href, item.url, item.path, item.to),
    ""
  );

  if (direct) {
    if (!isAdmin() && type === RESULT_TYPES.USER && direct.startsWith("/usuarios")) {
      return "/cuenta";
    }

    return direct;
  }

  const action = normalizeCompact(item.action || item.openAction || item.searchAction);
  const entityId = getResultId(item);
  const raw = isObject(item.raw) ? item.raw : {};
  const payload = isObject(item.payload) ? item.payload : {};

  const currentUserId = getCurrentUserId();

  const facturaId = cleanText(
    first(
      item.facturaId,
      item.invoiceId,
      raw.facturaId,
      raw.invoiceId,
      payload.facturaId,
      payload.invoiceId,
      entityId
    ),
    ""
  );

  const ticketId = cleanText(
    first(
      item.ticketId,
      item.incidenciaId,
      raw.ticketId,
      raw.incidenciaId,
      payload.ticketId,
      payload.incidenciaId,
      entityId
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      item.clienteId,
      item.clientId,
      raw.clienteId,
      raw.clientId,
      payload.clienteId,
      payload.clientId,
      entityId
    ),
    ""
  );

  const userId = cleanText(
    first(
      item.userId,
      item.usuarioId,
      raw.userId,
      raw.usuarioId,
      payload.userId,
      payload.usuarioId,
      entityId
    ),
    ""
  );

  if (type === RESULT_TYPES.FACTURA || action.includes("factura")) {
    return facturaId ? `/facturas?factura=${encodeParam(facturaId)}` : "/facturas";
  }

  if (
    type === RESULT_TYPES.INCIDENCIA ||
    action.includes("incidencia") ||
    action.includes("ticket")
  ) {
    return ticketId ? `/incidencias?ticket=${encodeParam(ticketId)}` : "/incidencias";
  }

  if (type === RESULT_TYPES.CLIENTE || action.includes("cliente")) {
    return clienteId ? `/clientes?cliente=${encodeParam(clienteId)}` : "/clientes";
  }

  if (
    type === RESULT_TYPES.USER ||
    action.includes("usuario") ||
    action.includes("user")
  ) {
    if (!isAdmin()) return "/cuenta";

    if (userId && currentUserId && normalizeCompact(userId) === normalizeCompact(currentUserId)) {
      return "/cuenta";
    }

    return userId ? `/usuarios?usuario=${encodeParam(userId)}` : "/usuarios";
  }

  if (type === RESULT_TYPES.SETTINGS) {
    return "/ajustes";
  }

  return "/";
}

function normalizeBackendResult(item = {}, order = 0) {
  const source = isObject(item) ? item : {};
  const raw = isObject(source.raw) ? source.raw : {};
  const payload = isObject(source.payload) ? source.payload : {};

  const type = normalizeResultType(
    first(source.type, source.entity, source.kind, source.entityType, raw.type, raw.entity)
  );

  const entityId = getResultId(source);

  const label = cleanText(
    first(
      source.label,
      source.title,
      source.name,
      source.displayName,
      raw.title,
      raw.name,
      raw.displayName,
      entityId
    ),
    "Resultado"
  );

  const description = truncate(
    cleanText(
      first(
        source.description,
        source.subtitle,
        source.text,
        raw.subtitle,
        raw.description,
        raw.status,
        payload.status
      ),
      ""
    ),
    180
  );

  const route = routeFromBackendResult(source);

  const id = cleanText(
    first(source.id, source.key, `${type}:${entityId || label}:${order}`),
    `${type}:${entityId || label}:${order}`
  );

  const score = Number.isFinite(Number(source.score))
    ? Number(source.score)
    : Number.isFinite(Number(source._score))
      ? Number(source._score)
      : 0;

  return {
    key: id,
    id,

    label,
    title: label,

    description,
    subtitle: description,

    route,
    href: route,
    path: route,

    icon: iconForResult(source, type),
    type,
    kind: type,

    entityId,

    action: cleanText(source.action || source.openAction || source.searchAction, ""),
    score,
    order,
    source: "backend",

    payload,
    raw,
    backend: source,
  };
}

function mergeResults(query = "", backendResults = [], localResults = []) {
  const direct = directRouteResult(query);

  const combined = [
    ...(direct ? [direct] : []),
    ...safeArray(backendResults),
    ...safeArray(localResults),
  ];

  return uniqueBy(combined, (item) => {
    const route = safeInternalPath(item.route, "");
    const entityKey = [
      normalizeResultType(item.type),
      normalizeCompact(item.entityId || item.id || item.key || ""),
    ].join(":");

    return route || entityKey || normalizeText(item.label || item.title || "");
  }).slice(0, SEARCH_LIMIT);
}

/* =========================================================
   REMOTE SEARCH
========================================================= */

function abortBackendSearch() {
  if (backendTimer) {
    clearTimeout(backendTimer);
    backendTimer = null;
  }

  if (backendAbort) {
    try {
      backendAbort.abort();
    } catch {
      // noop
    }
  }

  backendAbort = null;
}

async function fetchBackendResults(query = "", options = {}) {
  const clean = cleanText(query, "");

  if (!clean) return [];

  const controller = new AbortController();
  const timeoutMs = clampNumber(
    options.timeoutMs,
    1500,
    30_000,
    BACKEND_TIMEOUT_MS
  );

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // noop
    }
  }, timeoutMs);

  backendAbort = controller;

  try {
    const response = await fetch(buildSearchUrl(clean, options), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: buildSearchHeaders(options),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message =
        response.status === 401
          ? "Sesión no autorizada para buscar."
          : `Search backend HTTP ${response.status}`;

      throw new Error(message);
    }

    const payload = await response.json();
    const rawItems = extractBackendResults(payload);

    return rawItems
      .map((item, index) => normalizeBackendResult(item, index))
      .filter((item) => item.label || item.route);
  } finally {
    clearTimeout(timer);

    if (backendAbort === controller) {
      backendAbort = null;
    }
  }
}

/* =========================================================
   SEARCH RENDER STATE
========================================================= */

function setActiveSearch(index = 0) {
  if (!latestSearchResults.length) {
    activeSearchIndex = -1;
    getRefs().searchInput?.removeAttribute?.("aria-activedescendant");
    return false;
  }

  activeSearchIndex = Math.max(
    0,
    Math.min(Number(index) || 0, latestSearchResults.length - 1)
  );

  setTopbarSearchActiveIndex(root, activeSearchIndex);

  return true;
}

function renderSearchState(query = "", results = [], options = {}) {
  const clean = cleanText(query, "");
  const status = cleanText(options.status, SEARCH_STATUS.READY);
  const error = cleanText(options.error, "");

  latestSearchResults = clean ? safeArray(results) : [];
  activeSearchIndex = latestSearchResults.length ? Math.max(0, activeSearchIndex) : -1;
  lastSearchQuery = clean;
  lastSearchStatus = status;
  lastSearchError = error;

  if (!clean) {
    clearTopbarSearchResults(root);
    return true;
  }

  renderTopbarSearchResults(root, latestSearchResults, {
    query: clean,
    activeIndex: activeSearchIndex >= 0 ? activeSearchIndex : 0,
    status,
    error,
    source: SOURCE,
  });

  if (latestSearchResults.length) {
    setActiveSearch(activeSearchIndex >= 0 ? activeSearchIndex : 0);
  }

  return true;
}

async function executeSearch(query = "", options = {}) {
  const clean = cleanText(query, "");
  const seq = ++backendSeq;

  if (!clean) {
    abortBackendSearch();
    renderSearchState("", [], {
      status: SEARCH_STATUS.IDLE,
    });

    return [];
  }

  const localResults = searchLocalTopbar(clean, lastOptions);
  const cached = options.force !== true ? getCachedResults(clean, lastOptions) : null;

  if (cached) {
    const mergedCached = mergeResults(clean, cached, localResults);

    renderSearchState(clean, mergedCached, {
      status: SEARCH_STATUS.READY,
    });

    return mergedCached;
  }

  abortBackendSearch();

  renderSearchState(clean, mergeResults(clean, [], localResults), {
    status: SEARCH_STATUS.LOADING,
  });

  try {
    const remoteResults = await fetchBackendResults(clean, {
      ...lastOptions,
      ...options,
    });

    if (seq !== backendSeq) return [];
    if (cleanText(getRefs().searchInput?.value || "", "") !== clean && options.force !== true) {
      return [];
    }

    setCachedResults(clean, remoteResults, lastOptions);

    const merged = mergeResults(clean, remoteResults, localResults);

    renderSearchState(clean, merged, {
      status: merged.length ? SEARCH_STATUS.READY : SEARCH_STATUS.EMPTY,
    });

    return merged;
  } catch (error) {
    if (seq !== backendSeq) return [];

    const message = cleanText(
      error?.message || "No se pudo completar la búsqueda.",
      "No se pudo completar la búsqueda."
    );

    const fallback = mergeResults(clean, [], localResults);

    renderSearchState(clean, fallback, {
      status: fallback.length ? SEARCH_STATUS.READY : SEARCH_STATUS.ERROR,
      error: message,
    });

    return latestSearchResults;
  }
}

function scheduleSearch(query = "", options = {}) {
  const clean = cleanText(query, "");

  lastSearchQuery = clean;

  if (backendTimer) {
    clearTimeout(backendTimer);
    backendTimer = null;
  }

  if (!clean) {
    abortBackendSearch();

    renderSearchState("", [], {
      status: SEARCH_STATUS.IDLE,
    });

    return true;
  }

  const localResults = searchLocalTopbar(clean, lastOptions);
  const cached = getCachedResults(clean, lastOptions);

  if (cached) {
    renderSearchState(clean, mergeResults(clean, cached, localResults), {
      status: SEARCH_STATUS.READY,
    });
  } else {
    renderSearchState(clean, mergeResults(clean, [], localResults), {
      status: SEARCH_STATUS.LOADING,
    });
  }

  backendTimer = setTimeout(() => {
    backendTimer = null;
    void executeSearch(clean, options);
  }, options.immediate === true ? 0 : BACKEND_DEBOUNCE_MS);

  return true;
}

function moveActiveSearch(delta = 0) {
  if (!latestSearchResults.length) return false;

  return setActiveSearch(activeSearchIndex + delta);
}

async function openSearchResult(result = null) {
  const item = result || latestSearchResults[activeSearchIndex] || latestSearchResults[0];

  if (!item?.route) return false;

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent("topbar:search:open", {
          detail: {
            source: SOURCE,
            query: lastSearchQuery,
            result: item,
          },
        })
      );
    }
  } catch {
    // noop
  }

  const ok = await navigateTo(item.route, {
    query: lastSearchQuery,
    result: item.key || item.label || item.route,
    resultType: item.type || "",
    entityId: item.entityId || "",
    action: item.action || "",
  });

  if (ok) {
    clearSearch({
      input: true,
      focus: false,
    });

    getRefs().searchInput?.blur?.();
  }

  return ok;
}

function clearSearch(options = {}) {
  const opts = isObject(options) ? options : {};
  const refs = getRefs();

  abortBackendSearch();

  backendSeq += 1;
  latestSearchResults = [];
  activeSearchIndex = -1;
  lastSearchQuery = "";
  lastSearchStatus = SEARCH_STATUS.IDLE;
  lastSearchError = "";

  clearTopbarSearchResults(root);

  refs.search?.classList?.remove?.("is-search-open");
  refs.root?.classList?.remove?.("is-search-focused");

  if (opts.input === true && refs.searchInput) {
    refs.searchInput.value = "";
  }

  if (opts.focus === true) {
    try {
      refs.searchInput?.focus?.({
        preventScroll: true,
      });
    } catch {
      refs.searchInput?.focus?.();
    }
  }

  return true;
}

/* =========================================================
   LOCAL EVENTS
========================================================= */

async function onSubmit(event) {
  event.preventDefault();

  const refs = getRefs();
  const query = cleanText(refs.searchInput?.value || "", "");

  if (!query) {
    clearSearch({
      input: true,
      focus: true,
    });

    return;
  }

  if (
    !latestSearchResults.length ||
    query !== lastSearchQuery ||
    lastSearchStatus === SEARCH_STATUS.LOADING
  ) {
    await executeSearch(query, {
      force: true,
      immediate: true,
    });
  }

  void openSearchResult();
}

function onInput(event) {
  scheduleSearch(event.target?.value || "");
}

function onFocus() {
  const refs = getRefs();
  const value = cleanText(refs.searchInput?.value || "", "");

  if (value) {
    scheduleSearch(value);
  } else {
    setTopbarSearchExpanded(root, false);
  }
}

function onKeydown(event) {
  const refs = getRefs();

  if (event.key === "Escape") {
    event.preventDefault();

    clearSearch({
      input: false,
      focus: true,
    });

    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();

    if (!latestSearchResults.length) {
      scheduleSearch(refs.searchInput?.value || "", {
        immediate: true,
      });
    } else {
      moveActiveSearch(1);
    }

    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();

    if (!latestSearchResults.length) {
      scheduleSearch(refs.searchInput?.value || "", {
        immediate: true,
      });
    } else {
      moveActiveSearch(-1);
    }

    return;
  }

  if (event.key === "Home" && latestSearchResults.length) {
    event.preventDefault();
    setActiveSearch(0);
    return;
  }

  if (event.key === "End" && latestSearchResults.length) {
    event.preventDefault();
    setActiveSearch(latestSearchResults.length - 1);
    return;
  }

  if (event.key === "Enter" && latestSearchResults.length) {
    event.preventDefault();
    void openSearchResult();
  }
}

function onResultsClick(event) {
  const target = eventElement(event.target);
  const resultNode = target?.closest?.("[data-topbar-search-result='true']");

  if (!resultNode || !root?.contains?.(resultNode)) return;

  event.preventDefault();

  const index = Number(resultNode.dataset.topbarSearchResultIndex);

  if (Number.isFinite(index)) {
    setActiveSearch(index);
  }

  void openSearchResult(latestSearchResults[activeSearchIndex]);
}

function onResultsPointerMove(event) {
  const target = eventElement(event.target);
  const resultNode = target?.closest?.("[data-topbar-search-result='true']");

  if (!resultNode || !root?.contains?.(resultNode)) return;

  const index = Number(resultNode.dataset.topbarSearchResultIndex);

  if (Number.isFinite(index)) {
    setActiveSearch(index);
  }
}

function onDocumentPointerDown(event) {
  const target = eventElement(event.target);
  const refs = getRefs();

  if (!refs.search || contains(refs.search, target)) return;

  clearTopbarSearchResults(root);
  refs.search?.classList?.remove?.("is-search-open");
  refs.root?.classList?.remove?.("is-search-focused");
}

function bindEvents() {
  if (!root || cleanupEvents) return false;

  const refs = getRefs();

  try {
    refs.search?.addEventListener?.("submit", onSubmit);
    refs.searchInput?.addEventListener?.("keydown", onKeydown);
    refs.searchInput?.addEventListener?.("input", onInput);
    refs.searchInput?.addEventListener?.("focus", onFocus);
    refs.searchResults?.addEventListener?.("click", onResultsClick);
    refs.searchResults?.addEventListener?.("pointermove", onResultsPointerMove);

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
  } catch {
    cleanupEvents = null;
    return false;
  }

  cleanupEvents = () => {
    try {
      refs.search?.removeEventListener?.("submit", onSubmit);
      refs.searchInput?.removeEventListener?.("keydown", onKeydown);
      refs.searchInput?.removeEventListener?.("input", onInput);
      refs.searchInput?.removeEventListener?.("focus", onFocus);
      refs.searchResults?.removeEventListener?.("click", onResultsClick);
      refs.searchResults?.removeEventListener?.("pointermove", onResultsPointerMove);

      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    } catch {
      // noop
    }

    cleanupEvents = null;
    return true;
  };

  return true;
}

function unbindEvents() {
  try {
    cleanupEvents?.();
  } catch {
    cleanupEvents = null;
  }

  cleanupEvents = null;

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.topbar = TopbarUI;

    AppCore.topbar = TopbarUI;
    AppCore.Topbar = TopbarUI;

    AppCore.registerModule?.("topbar", TopbarUI, {
      overwrite: true,
    });

    AppCore.modules?.register?.("topbar", TopbarUI, {
      overwrite: true,
    });

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (AppCore.ui?.topbar === TopbarUI) {
      delete AppCore.ui.topbar;
    }

    if (AppCore.topbar === TopbarUI) {
      delete AppCore.topbar;
    }

    if (AppCore.Topbar === TopbarUI) {
      delete AppCore.Topbar;
    }

    AppCore.modules?.remove?.("topbar");

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync(options = {}) {
  lastOptions = {
    ...lastOptions,
    ...options,
  };

  ensureRoot(lastOptions);

  if (!root) return false;

  syncTitle(lastOptions);
  syncVisibility(lastOptions);
  cacheDom();

  mounted = true;

  return true;
}

function init(options = {}) {
  initialized = true;

  lastOptions = {
    ...options,
  };

  registerModule();

  /*
    App inicializa UI antes de que Router resuelva la ruta.
    Por eso el topbar se monta oculto hasta que Router haga sync(route).
  */
  ensureRoot({
    ...lastOptions,
    visible: false,
  });

  if (root) {
    setTopbarTemplateVisible(root, false);
    setTopbarSearchExpanded(root, false);
  }

  syncMountVisibility(true);
  cacheDom();

  return TopbarUI;
}

function render(options = {}) {
  return sync(options);
}

function refresh(options = {}) {
  return sync(options);
}

function destroy(options = {}) {
  unbindEvents();
  abortBackendSearch();
  clearSearchCache();

  if (root) {
    clearSearch({
      input: true,
      focus: false,
    });
  }

  if (options.unmount === true && root) {
    try {
      root.remove();
    } catch {
      clear(root);
    }
  } else if (root) {
    setHidden(root, true);
  }

  root = null;
  mounted = false;
  initialized = false;
  lastOptions = {};

  clearDomCache();
  unregisterModule();

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const refs = getRefs();

  return {
    version: TOPBAR_VERSION,

    initialized,
    mounted,

    visible: Boolean(refs.root && refs.root.hidden !== true),
    title: refs.title?.textContent || "",
    hasRoot: Boolean(refs.root),

    backend: {
      endpoint: resolveSearchEndpoint(lastOptions),
      cacheSize: backendCache.size,
      active: Boolean(backendAbort),
      debounceActive: Boolean(backendTimer),
    },

    search: {
      enabled: Boolean(refs.search),
      hasInput: Boolean(refs.searchInput),
      hasSubmit: Boolean(refs.searchSubmit),
      hasResults: Boolean(refs.searchResults),
      expanded: refs.searchInput?.getAttribute?.("aria-expanded") || null,
      resultsHidden: refs.searchResults ? refs.searchResults.hidden === true : null,
      query: refs.searchInput?.value || "",
      lastSearchQuery,
      status: lastSearchStatus,
      error: lastSearchError,
      resultCount: latestSearchResults.length,
      activeSearchIndex,
      results: latestSearchResults.map((item) => ({
        label: item.label,
        route: item.route,
        type: item.type,
        source: item.source,
        score: item.score,
      })),
    },
  };
}

/* =========================================================
   API
========================================================= */

export const TopbarUI = {
  version: TOPBAR_VERSION,

  init,
  render,
  refresh,
  sync,
  destroy,

  mountTopbar: ensureRoot,

  unmountTopbar: (options = {}) =>
    destroy({
      ...options,
      unmount: true,
    }),

  syncTitle,
  resolveRouteTitle,

  search: (query = "", options = {}) => {
    ensureRoot(lastOptions);
    scheduleSearch(query, {
      ...options,
      immediate: options.immediate === true,
    });
    return latestSearchResults;
  },

  searchAsync: async (query = "", options = {}) => {
    ensureRoot(lastOptions);
    return executeSearch(query, {
      ...options,
      force: true,
      immediate: true,
    });
  },

  clearSearch,
  clearSearchCache,

  getSearchIndex: (options = {}) =>
    buildSearchIndex({
      ...lastOptions,
      ...options,
    }),

  getDom: () => {
    const refs = getRefs();

    return {
      topbar: refs.root,
      title: refs.title,

      search: refs.search,
      searchForm: refs.search,
      searchInput: refs.searchInput,
      searchSubmit: refs.searchSubmit,
      searchResults: refs.searchResults,
    };
  },

  getState: getSnapshot,
  getSnapshot,
  getDebugSnapshot: getSnapshot,

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },
};

export default TopbarUI;

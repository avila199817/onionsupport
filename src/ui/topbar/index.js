/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Controlador mínimo del topbar.
   - Montar en #topbar-mount / #app-topbar.
   - Consumir template.js para TODO el DOM visual.
   - Mostrar título de ruta.
   - Ocultarse en rutas públicas/auth.
   - Cachear refs en AppCore.dom.
   - Registrarse en AppCore.
   - Activar búsqueda local del topbar.
   - Navegar por SPA delegando en Router/AppCore.
   - Sin Auth real.
   - Sin Router propio.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin logout.
   - Sin sidebar bridge.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute,
  buildUserScopedRoute,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
} from "../../core/config.js";

import {
  createTopbarTemplate,
  getTopbarTemplateRefs,
  setTopbarTemplateTitle,
  setTopbarTemplateVisible,
  clearTopbarSearchResults,
  renderTopbarSearchResults,
  setTopbarSearchActiveIndex,
  setTopbarSearchExpanded,
} from "./template.js";

export const TOPBAR_VERSION = "topbar.controller.v2.search";

const TOPBAR_ROOT_ID = "app-topbar";
const TOPBAR_MOUNT_ID = "topbar-mount";
const APP_TITLE_PREFIX = "Onion";
const SOURCE = "topbar.search";

const SEARCH_LIMIT = 8;

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

const DEFAULT_SEARCH_ROUTES = Object.freeze([
  {
    key: "home",
    label: "Home",
    description: "Panel principal",
    routeKey: "home",
    route: "/",
    icon: "home",
    keywords: ["inicio", "dashboard", "panel", "principal"],
  },
  {
    key: "incidencias",
    label: "Incidencias",
    description: "Tickets y solicitudes de soporte",
    routeKey: "incidencias",
    route: "/incidencias",
    icon: "incidencias",
    keywords: ["tickets", "soporte", "solicitudes", "casos", "crear incidencia", "nueva incidencia"],
  },
  {
    key: "facturas",
    label: "Facturas",
    description: "Facturación, importes y pagos",
    routeKey: "facturas",
    route: "/facturas",
    icon: "facturas",
    keywords: ["billing", "pagos", "importe", "facturacion", "invoice"],
  },
  {
    key: "clientes",
    label: "Clientes",
    description: "Administración de clientes",
    routeKey: "clientes",
    route: "/clientes",
    icon: "clientes",
    adminOnly: true,
    keywords: ["clients", "empresas", "cuentas", "administracion"],
  },
  {
    key: "usuarios",
    label: "Usuarios",
    description: "Administración de usuarios",
    routeKey: "usuarios",
    route: "/usuarios",
    icon: "usuarios",
    adminOnly: true,
    keywords: ["users", "miembros", "permisos", "roles"],
  },
  {
    key: "servidor",
    label: "Servidor",
    description: "Estado y configuración del servidor",
    routeKey: "servidor",
    route: "/servidor",
    icon: "servidor",
    adminOnly: true,
    keywords: ["server", "estado", "sistema", "infraestructura"],
  },
  {
    key: "cuenta",
    label: "Cuenta",
    description: "Perfil y datos de cuenta",
    routeKey: "cuenta",
    route: "/cuenta",
    icon: "cuenta",
    keywords: ["perfil", "profile", "mi cuenta", "account"],
  },
  {
    key: "ajustes",
    label: "Ajustes",
    description: "Preferencias y configuración",
    routeKey: "ajustes",
    route: "/ajustes",
    icon: "ajustes",
    keywords: ["settings", "configuracion", "preferencias"],
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

  let normalized = raw;

  try {
    normalized = normalizeRoutePath(raw) || raw;
  } catch {
    normalized = raw;
  }

  if (!normalized.startsWith("/")) return fallback;
  if (normalized.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return fallback;
  if (/[\r\n\t\\]/.test(normalized)) return fallback;
  if (hasSensitiveQuery(normalized)) return fallback;

  try {
    if (isBlockedRoutePath(normalized)) return fallback;
  } catch {
    return fallback;
  }

  return normalized;
}

function routeFromQuery(value = "") {
  const raw = cleanText(value, "");

  if (!raw.startsWith("/")) return "";

  return safeInternalPath(raw, "");
}

/* =========================================================
   CORE / USER / ROUTER
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

  if (role === ROLE_ADMIN) return ROLE_ADMIN;
  if (role === ROLE_USER) return ROLE_USER;

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
    AppCore.getCurrentRole?.(),
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

function currentPath() {
  const state = getCoreState();

  if (typeof state.canonicalPath === "string" && state.canonicalPath) {
    return cleanText(state.canonicalPath, "/");
  }

  if (typeof state.route === "string" && state.route) {
    return cleanText(state.route, "/");
  }

  if (typeof state.path === "string" && state.path) {
    return cleanText(state.path, "/");
  }

  if (!isBrowser()) return "/";

  return cleanText(window.location.pathname || "/", "/");
}

function currentUserSlug() {
  const user = getCurrentUser() || {};
  const path = currentPath();
  const pathMatch = path.match(/^\/@([^/]+)/);

  return normalizeUserSlug(
    first(
      pathMatch?.[1],
      user.slug,
      user.publicSlug,
      user.lookup?.slug,
      user.profile?.slug,
      user.username,
      user.userId,
      user.id,
      ""
    )
  );
}

function scopedPrivateHref(path = "") {
  const canonical = safeInternalPath(path, "");

  if (!canonical) return "";
  if (canonical.startsWith(`${USER_HOME_PREFIX}`)) return canonical;

  const slug = currentUserSlug();

  if (!slug) return canonical;

  try {
    if (canonical === "/") {
      return buildUserHomeRoute(slug) || `${USER_HOME_PREFIX}${slug}`;
    }

    return buildUserScopedRoute(slug, canonical);
  } catch {
    return canonical === "/"
      ? `${USER_HOME_PREFIX}${slug}`
      : `${USER_HOME_PREFIX}${slug}${canonical}`;
  }
}

function getRouter(context = {}) {
  return (
    context.Router ||
    context.router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
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
    root = current;
    bindEvents();
    cacheDom();
    mounted = true;
    return root;
  }

  const topbar = createTopbarTemplate({
    id: TOPBAR_ROOT_ID,
    title: resolveRouteTitle(options),
    visible: options.visible === true,
    search: options.search !== false,
    searchOptions: options.searchOptions || {},
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
   SEARCH INDEX
========================================================= */

function defaultRouteFor(item = {}) {
  const routeKey = cleanText(item.routeKey || item.key, "");

  return safeInternalPath(
    first(
      routeKey ? ROUTES?.[routeKey] : "",
      item.route,
      item.href,
      item.path,
      ""
    ),
    ""
  );
}

function normalizeSearchItem(item = {}, source = "default", order = 0) {
  const raw = isObject(item) ? item : {};

  const baseRoute = defaultRouteFor(raw);
  const scoped = raw.scoped === false ? baseRoute : scopedPrivateHref(baseRoute);

  const label = cleanText(raw.label || raw.title || raw.name, "");
  const key = cleanText(raw.key || raw.id || raw.routeKey || label || scoped, "");

  const requiredRoles = normalizeRoleList(
    first(raw.requiredRoles, raw.roles, raw.requiredRole, raw.role, [])
  );

  const adminOnly = Boolean(
    raw.adminOnly === true ||
      raw.requiresAdmin === true ||
      raw.admin === true ||
      (
        requiredRoles.includes(ROLE_ADMIN) &&
        !requiredRoles.includes(ROLE_USER)
      )
  );

  return {
    key,
    label: label || titleCase(scoped),
    description: cleanText(raw.description || raw.subtitle || raw.text, ""),
    route: scoped,
    icon: cleanText(raw.icon || raw.viewKey || raw.routeKey || key, ""),
    type: cleanText(raw.type || "route", "route"),
    keywords: safeArray(raw.keywords).map((value) => cleanText(value, "")).filter(Boolean),
    adminOnly,
    requiredRoles,
    hidden: raw.hidden === true || !scoped,
    source,
    order,
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

  const defaults = DEFAULT_SEARCH_ROUTES.map((item, index) =>
    normalizeSearchItem(item, "default", index)
  );

  const custom = coreSearchItems(options).map((item, index) =>
    normalizeSearchItem(item, "core", DEFAULT_SEARCH_ROUTES.length + index)
  );

  return uniqueBy([...defaults, ...custom], (item) => `${item.route}:${item.label}`)
    .filter((item) => {
      if (item.hidden) return false;
      if (item.adminOnly && !admin) return false;
      if (!item.route) return false;

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
  const route = routeFromQuery(query);

  if (!route) return null;

  return {
    key: `route:${route}`,
    label: `Ir a ${route}`,
    description: "Ruta directa",
    route,
    icon: "route",
    type: "direct",
    keywords: [],
    source: "direct",
    order: -1,
    score: 999,
  };
}

function searchTopbar(query = "", options = {}) {
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
   SEARCH UI / ACTIONS
========================================================= */

function renderSearch(query = "") {
  if (!root) return false;

  const clean = cleanText(query, "");

  lastSearchQuery = clean;

  if (!clean) {
    latestSearchResults = [];
    activeSearchIndex = -1;
    clearTopbarSearchResults(root);
    return true;
  }

  latestSearchResults = searchTopbar(clean, lastOptions);
  activeSearchIndex = latestSearchResults.length ? 0 : -1;

  renderTopbarSearchResults(root, latestSearchResults, {
    query: clean,
    activeIndex: activeSearchIndex,
  });

  return true;
}

function moveActiveSearch(delta = 0) {
  if (!latestSearchResults.length) return false;

  const max = latestSearchResults.length - 1;
  const next = Math.max(0, Math.min(activeSearchIndex + delta, max));

  activeSearchIndex = next;
  setTopbarSearchActiveIndex(root, next);

  return true;
}

function setActiveSearch(index = 0) {
  if (!latestSearchResults.length) return false;

  activeSearchIndex = Math.max(0, Math.min(Number(index) || 0, latestSearchResults.length - 1));
  setTopbarSearchActiveIndex(root, activeSearchIndex);

  return true;
}

async function openSearchResult(result = null) {
  const item = result || latestSearchResults[activeSearchIndex] || latestSearchResults[0];

  if (!item?.route) return false;

  const ok = await navigateTo(item.route, {
    query: lastSearchQuery,
    result: item.key || item.label || item.route,
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

  latestSearchResults = [];
  activeSearchIndex = -1;
  lastSearchQuery = "";

  clearTopbarSearchResults(root, {
    input: opts.input === true,
  });

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

function onSubmit(event) {
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

  if (!latestSearchResults.length || query !== lastSearchQuery) {
    renderSearch(query);
  }

  void openSearchResult();
}

function onInput(event) {
  const value = cleanText(event.target?.value || "", "");

  renderSearch(value);
}

function onFocus() {
  const refs = getRefs();
  const value = cleanText(refs.searchInput?.value || "", "");

  if (value) {
    renderSearch(value);
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
      renderSearch(refs.searchInput?.value || "");
    } else {
      moveActiveSearch(1);
    }

    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();

    if (!latestSearchResults.length) {
      renderSearch(refs.searchInput?.value || "");
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

  setTopbarTemplateVisible(root, false);
  setTopbarSearchExpanded(root, false);
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

    search: {
      enabled: Boolean(refs.search),
      hasInput: Boolean(refs.searchInput),
      hasSubmit: Boolean(refs.searchSubmit),
      hasResults: Boolean(refs.searchResults),
      expanded: refs.searchInput?.getAttribute?.("aria-expanded") || null,
      resultsHidden: refs.searchResults ? refs.searchResults.hidden === true : null,
      query: refs.searchInput?.value || "",
      resultCount: latestSearchResults.length,
      activeSearchIndex,
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

  search: (query = "") => {
    ensureRoot(lastOptions);
    renderSearch(query);
    return latestSearchResults;
  },

  clearSearch,

  getSearchIndex: (options = {}) => buildSearchIndex({
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

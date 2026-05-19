/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Topbar mínimo del panel.
   - Montar en #topbar-mount / #app-topbar.
   - Pintar título de ruta en formato Onion {Vista}.
   - Resolver /@{user.slug} como Onion Home visual.
   - Renderizar search del topbar.
   - Conectar buscador local delegado en topbar.search.js.
   - No renderizar saludo, usuario ni salida.
   - No renderizar botón hamburguesa.
   - Sin Store.
   - Sin HTTP.
   - Sin Toast.
   - Sin Auth.
   - Sin logout.
   - Sin sidebar bridge activo.
   - Sin rebind storms.
   - Sin CustomEvent.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

import {
  getImmutableRoutes,
  resolveRouteLookupPath,
} from "../../router/routes.js";

import {
  clearSearchDebounce,
  clearSearchState,
  handleSearchKeydown,
  hideResultsContainer,
  runSearch,
} from "./topbar.search.js";

export const TOPBAR_UI_VERSION = "topbar.ui.v4";

const SOURCE = "topbar.ui";
const APP_NAME = "Onion Support";
const ONION_PREFIX = "Onion";
const DEFAULT_VIEW_TITLE = "Home";
const SEARCH_DEBOUNCE_MS = 110;

let initialized = false;
let mounted = false;
let bound = false;
let root = null;
let boundRoot = null;
let cleanupEvents = null;
let searchValue = "";

const searchRuntime = {
  cache: new Map(),
  activeIndex: -1,
  currentItems: [],
  currentQuery: "",
  searchSeq: 0,
  searchDebounceTimer: null,
  searchController: null,
  AppCore: null,
  Router: null,
  closeSidebarMobile: null,
};

/* =========================================================
   SVG ICONS
========================================================= */

const ICONS = Object.freeze({
  search:
    "M21 21l-4.35-4.35 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
});

function icon(name = "search", className = "topbar-svg") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", ICONS[name] || ICONS.search);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: TOPBAR_UI_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
}

function routeLookupPath(path = "/") {
  try {
    if (isFunction(resolveRouteLookupPath)) {
      return canonicalPath(resolveRouteLookupPath(path));
    }
  } catch {
    // fallback abajo
  }

  return canonicalPath(path);
}

function currentPath() {
  try {
    return (
      Router?.getCurrentCanonicalPath?.() ||
      AppCore?.state?.canonicalPath ||
      AppCore?.state?.route ||
      (isBrowser() ? window.location.pathname : "/") ||
      "/"
    );
  } catch {
    return "/";
  }
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    if (selector.startsWith("#")) {
      return document.getElementById(selector.slice(1));
    }

    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function create(
  tag = "div",
  { className = "", textContent = "", attrs = {}, dataset = {} } = {}
) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
  }

  return node;
}

function clear(node) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function setHidden(node, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function getMount() {
  return (
    query("#topbar-mount") ||
    query("#app-topbar") ||
    query("#topbar") ||
    query("[data-topbar-mount]") ||
    query("[data-topbar-root]")
  );
}

function cacheRoot(node) {
  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    AppCore.dom.topbar = node;
    AppCore.dom.topbarRoot = node;
    AppCore.dom.topbarMount = query("#topbar-mount") || node;
  } catch {
    // noop
  }

  return node;
}

function renderRootContent(header) {
  if (!header) return false;

  header.id = header.id || "app-topbar";
  header.className = "topbar app-topbar";
  header.setAttribute("data-topbar-root", "true");
  header.setAttribute("aria-label", "Barra superior");

  clear(header);

  const left = create("div", {
    className: "topbar-left",
  });

  const title = create("h1", {
    className: "topbar-title",
    textContent: `${ONION_PREFIX} ${DEFAULT_VIEW_TITLE}`,
    attrs: {
      "data-topbar-title": "true",
    },
  });

  left.appendChild(title);

  const right = create("div", {
    className: "topbar-right",
    attrs: {
      "data-topbar-search-shell": "true",
    },
  });

  const search = create("form", {
    className: "topbar-search",
    attrs: {
      role: "search",
      action: "#",
      novalidate: "true",
      autocomplete: "off",
      "aria-label": "Buscar",
      "data-topbar-search": "true",
    },
  });

  const input = create("input", {
    className: "topbar-search-input",
    attrs: {
      type: "search",
      inputmode: "search",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "Buscar",
      "aria-label": "Buscar",
      "data-topbar-search-input": "true",
    },
  });

  const button = create("button", {
    className: "topbar-search-submit",
    attrs: {
      type: "submit",
      "aria-label": "Buscar",
      "data-topbar-search-submit": "true",
    },
  });

  button.appendChild(icon("search", "topbar-search-svg"));
  search.append(input, button);
  right.appendChild(search);
  header.append(left, right);

  return true;
}

function rootHasRequiredStructure(node) {
  return Boolean(
    node?.querySelector?.("[data-topbar-title]") &&
      node?.querySelector?.("[data-topbar-search]") &&
      node?.querySelector?.("[data-topbar-search-input]")
  );
}

function buildRoot() {
  const header = create("header", {
    className: "topbar app-topbar",
    attrs: {
      id: "app-topbar",
      "data-topbar-root": "true",
      "aria-label": "Barra superior",
    },
  });

  renderRootContent(header);
  return header;
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const mount = getMount();

  if (!mount) return null;

  if (mount.matches?.("[data-topbar-root], #app-topbar, #topbar")) {
    root = mount;
  } else {
    root = mount.querySelector("[data-topbar-root]");

    if (!root) {
      root = buildRoot();
      clear(mount);
      mount.appendChild(root);
    }
  }

  if (!rootHasRequiredStructure(root)) {
    renderRootContent(root);
  }

  return cacheRoot(root);
}

function getDom() {
  ensureRoot();

  const searchResults =
    query("#topbar-search-results") ||
    query("[data-topbar-search-results]") ||
    query(".topbar-search-results");

  return {
    topbar: root,
    title: root?.querySelector?.("[data-topbar-title]") || null,
    search: root?.querySelector?.("[data-topbar-search]") || null,
    searchInput: root?.querySelector?.("[data-topbar-search-input]") || null,
    searchSubmit: root?.querySelector?.("[data-topbar-search-submit]") || null,
    searchResults,
  };
}

/* =========================================================
   TITLE
========================================================= */

const VIEW_TITLES = Object.freeze({
  "/": "Home",
  "/incidencias": "Incidencias",
  "/tickets": "Incidencias",
  "/facturas": "Facturas",
  "/clientes": "Clientes",
  "/usuarios": "Usuarios",
  "/cuenta": "Cuenta",
  "/ajustes": "Ajustes",
  "/servidor": "Servidor",
  "/login": "Acceso",
  "/activate-account": "Activar cuenta",
  "/password-request": "Recuperar acceso",
  "/password-reset": "Nueva contraseña",
});

const SECTION_TITLES = Object.freeze([
  ["/incidencias", "Incidencias"],
  ["/tickets", "Incidencias"],
  ["/facturas", "Facturas"],
  ["/clientes", "Clientes"],
  ["/usuarios", "Usuarios"],
  ["/cuenta", "Cuenta"],
  ["/ajustes", "Ajustes"],
  ["/servidor", "Servidor"],
]);

function routeTitle(route = null) {
  return text(route?.title || route?.label || route?.name || "", "");
}

function decodeURIComponentSafe(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeViewLabel(value = "") {
  let output = text(value, "");

  if (!output) return "";

  if (output.toLowerCase() === APP_NAME.toLowerCase()) return "";

  output = output.replace(/^onion\s+/i, "").trim();

  return output || "";
}

function formatViewTitle(value = DEFAULT_VIEW_TITLE) {
  const label = normalizeViewLabel(value) || DEFAULT_VIEW_TITLE;
  return `${ONION_PREFIX} ${label}`;
}

function startsWithSection(path = "/", section = "/") {
  return path === section || path.startsWith(`${section}/`);
}

function sectionTitle(path = "/") {
  const clean = canonicalPath(path);

  for (const [section, title] of SECTION_TITLES) {
    if (startsWithSection(clean, section)) return title;
  }

  return "";
}

function prettyTitleFromPath(path = "/") {
  const clean = canonicalPath(path);

  if (clean === "/") return DEFAULT_VIEW_TITLE;

  return clean
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const decoded = decodeURIComponentSafe(part).replace(/[-_]+/g, " ").trim();
      return decoded ? decoded.charAt(0).toUpperCase() + decoded.slice(1) : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function resolveRouteTitle(path = currentPath()) {
  const raw = canonicalPath(path);

  if (/^\/@[^/]+/.test(raw)) {
    return formatViewTitle(DEFAULT_VIEW_TITLE);
  }

  const clean = routeLookupPath(path);

  const directTitle = VIEW_TITLES[raw] || VIEW_TITLES[clean];

  if (directTitle) return formatViewTitle(directTitle);

  const knownSectionTitle = sectionTitle(raw) || sectionTitle(clean);

  if (knownSectionTitle) return formatViewTitle(knownSectionTitle);

  try {
    const route = getImmutableRoutes().find((item) => {
      return canonicalPath(item.path) === clean;
    });

    const title = normalizeViewLabel(routeTitle(route));

    if (title) return formatViewTitle(title);
  } catch {
    // noop
  }

  return formatViewTitle(prettyTitleFromPath(raw || clean));
}

function syncTitle(path = currentPath()) {
  const { title } = getDom();

  if (!title) return false;

  const next = resolveRouteTitle(path);

  try {
    title.textContent = next;
    title.dataset.routeTitle = next;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SEARCH
========================================================= */

function normalizeSearchValue(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getSearchValue() {
  const { searchInput } = getDom();
  return normalizeSearchValue(searchInput?.value || searchValue);
}

function runCurrentSearch(value = getSearchValue()) {
  const query = normalizeSearchValue(value);

  void runSearch({
    AppCore,
    Router,
    runtime: searchRuntime,
    getDom,
    closeSidebarMobile,
    query,
  });

  return true;
}

function queueSearch(value = getSearchValue()) {
  const query = normalizeSearchValue(value);

  clearSearchDebounce(searchRuntime);

  if (!query) {
    clearSearchState(searchRuntime, getDom);
    return true;
  }

  const runner = () => {
    searchRuntime.searchDebounceTimer = null;
    runCurrentSearch(query);
  };

  try {
    searchRuntime.searchDebounceTimer = window.setTimeout(
      runner,
      SEARCH_DEBOUNCE_MS
    );
  } catch {
    searchRuntime.searchDebounceTimer = setTimeout(
      runner,
      SEARCH_DEBOUNCE_MS
    );
  }

  return true;
}

function setSearchValue(value = "") {
  const next = String(value ?? "");
  const { searchInput } = getDom();

  searchValue = next;

  if (searchInput && searchInput.value !== next) {
    searchInput.value = next;
  }

  return true;
}

function clearSearch() {
  setSearchValue("");
  clearSearchState(searchRuntime, getDom);

  emit("topbar:search:clear", {
    query: null,
  });

  return true;
}

function focusSearch() {
  const { searchInput } = getDom();

  if (!searchInput) return false;

  try {
    searchInput.focus();
    return true;
  } catch {
    return false;
  }
}

function submitSearch(value = getSearchValue()) {
  const query = normalizeSearchValue(value);

  if (!query) {
    clearSearch();
    focusSearch();
    return false;
  }

  setSearchValue(query);

  emit("topbar:search", {
    query,
  });

  runCurrentSearch(query);

  return true;
}

function syncSearch() {
  const { search, searchInput } = getDom();

  if (!search || !searchInput) return false;

  try {
    searchInput.value = String(searchValue ?? "");
    return true;
  } catch {
    return false;
  }
}

function hideSearchResults() {
  return hideResultsContainer(searchRuntime, getDom);
}

function clearSearchCache() {
  try {
    searchRuntime.cache?.clear?.();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   API EXISTENTE SIN RENDER ACTIVO
========================================================= */

function renderUser() {
  return true;
}

function openSidebarMobile() {
  return false;
}

function closeSidebarMobile() {
  return false;
}

function toggleSidebarMobile() {
  return false;
}

function setMobileToggleState() {
  return false;
}

function syncFixedTopbarOffset() {
  return true;
}

function handleViewportResize() {
  return true;
}

/* =========================================================
   EVENTS
========================================================= */

function onSubmit(event) {
  const form = event.target?.closest?.("[data-topbar-search]");

  if (!form) return;

  event.preventDefault();
  submitSearch();
}

function onInput(event) {
  if (!event.target?.matches?.("[data-topbar-search-input]")) return;

  searchValue = String(event.target.value ?? "");
  queueSearch(searchValue);
}

function onKeydown(event) {
  if (!event.target?.matches?.("[data-topbar-search-input]")) return;

  handleSearchKeydown({
    event,
    AppCore,
    Router,
    runtime: searchRuntime,
    getDom,
    closeSidebarMobile,
  });
}

function onFocusIn(event) {
  if (!event.target?.matches?.("[data-topbar-search-input]")) return;

  const query = getSearchValue();

  if (query) {
    runCurrentSearch(query);
  }
}

function onDocumentPointerDown(event) {
  const target = event.target;
  const dom = getDom();

  if (!target) return;

  if (dom.topbar?.contains?.(target)) return;
  if (dom.searchResults?.contains?.(target)) return;

  hideSearchResults();
}

function bind() {
  if (!root) return true;

  if (bound && boundRoot === root) return true;

  if (bound && boundRoot !== root) {
    unbind();
  }

  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("focusin", onFocusIn);

  if (isBrowser()) {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
  }

  boundRoot = root;

  cleanupEvents = () => {
    const targetRoot = boundRoot;

    try {
      targetRoot?.removeEventListener?.("submit", onSubmit);
      targetRoot?.removeEventListener?.("input", onInput);
      targetRoot?.removeEventListener?.("keydown", onKeydown);
      targetRoot?.removeEventListener?.("focusin", onFocusIn);
    } catch {
      // noop
    }

    try {
      document?.removeEventListener?.("pointerdown", onDocumentPointerDown, true);
    } catch {
      // noop
    }

    boundRoot = null;
    cleanupEvents = null;
  };

  bound = true;
  return true;
}

function unbind() {
  try {
    cleanupEvents?.();
  } catch {
    cleanupEvents = null;
    boundRoot = null;
  }

  clearSearchDebounce(searchRuntime);
  bound = false;

  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync(options = {}) {
  ensureRoot();

  if (!root) return false;

  const path =
    options.canonicalPath ||
    options.path ||
    options.publicPath ||
    currentPath();

  syncTitle(path);
  syncSearch();

  setHidden(
    root,
    Boolean(AppCore?.state?.chromeHidden || AppCore?.state?.routeMode === "auth")
  );

  mounted = true;

  return true;
}

function init(options = {}) {
  registerPublicApi();

  initialized = true;

  ensureRoot();
  sync(options);
  bind();

  emit("topbar:ready", {
    initialized: true,
    mounted,
    bound,
  });

  return true;
}

function render(options = {}) {
  return sync(options);
}

function refresh(options = {}) {
  return sync(options);
}

function destroy(options = {}) {
  unbind();
  clearSearchState(searchRuntime, getDom);

  if (options.unmount === true && root) {
    clear(root);
  }

  initialized = false;
  mounted = false;

  unregisterWindowApi();

  emit("topbar:destroyed");
  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerPublicApi() {
  try {
    AppCore.Topbar = api;
    AppCore.TopbarUI = api;
    AppCore.topbar = api;
    AppCore.topbarUI = api;

    AppCore.modules?.register?.("Topbar", api);
    AppCore.modules?.register?.("TopbarUI", api);
    AppCore.modules?.register?.("topbar", api);
    AppCore.modules?.register?.("topbarUI", api);
  } catch {
    // noop
  }

  if (isBrowser()) {
    try {
      window.TopbarUI = api;
      window.OnionTopbarUI = api;
    } catch {
      // noop
    }
  }

  return true;
}

function unregisterWindowApi() {
  if (!isBrowser()) return false;

  try {
    if (window.TopbarUI === api) delete window.TopbarUI;
    if (window.OnionTopbarUI === api) delete window.OnionTopbarUI;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getDomSnapshot() {
  const dom = getDom();

  return {
    topbar: Boolean(dom.topbar),
    title: Boolean(dom.title),
    search: Boolean(dom.search),
    searchInput: Boolean(dom.searchInput),
    searchSubmit: Boolean(dom.searchSubmit),
    searchResults: Boolean(dom.searchResults),
    sidebarToggle: false,
    user: false,
  };
}

function getSearchSnapshot() {
  return {
    activeIndex: Number(searchRuntime.activeIndex || -1),
    resultCount: Array.isArray(searchRuntime.currentItems)
      ? searchRuntime.currentItems.length
      : 0,
    queryLength: String(searchValue || "").length,
    currentQueryLength: String(searchRuntime.currentQuery || "").length,
    cacheSize: searchRuntime.cache instanceof Map ? searchRuntime.cache.size : 0,
    hasDebounce: Boolean(searchRuntime.searchDebounceTimer),
  };
}

function getState() {
  return {
    version: TOPBAR_UI_VERSION,

    initialized,
    mounted,
    bound,

    title: root?.querySelector?.("[data-topbar-title]")?.textContent || "",
    route: routeLookupPath(currentPath()),

    search: getSearchSnapshot(),

    dom: {
      ...getDomSnapshot(),
      hasSvg: Boolean(root?.querySelector?.("svg")),
    },

    policy: {
      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      ownToast: false,
      noUserChrome: true,
      noLogout: true,
      noSidebarToggle: true,
      searchUi: true,
      searchRuntime: true,
      searchLocalOnly: true,
      svgIcons: true,
      canonicalizesUserHomePath: true,
      roles: ["admin", "user"],
    },
  };
}

function getSnapshot() {
  return getState();
}

/* =========================================================
   API
========================================================= */

const api = {
  version: TOPBAR_UI_VERSION,

  init,
  render,
  refresh,
  sync,

  renderUser,
  refreshUser: renderUser,
  updateUser: renderUser,
  syncUser: renderUser,

  bind,
  rebind: sync,
  hardRebind: sync,
  queueRebind: sync,
  destroy,

  mountTopbar: ensureRoot,

  unmountTopbar: (options = {}) => {
    destroy({
      ...options,
      unmount: true,
    });
    return true;
  },

  syncDomCache: getDom,
  getDom,

  syncTitle,
  resolveRouteTitle,

  getSearchValue,
  setSearchValue,
  submitSearch,
  runSearch: runCurrentSearch,
  queueSearch,
  hideSearchResults,
  clearSearch,
  focusSearch,
  clearSearchCache,

  openSidebarMobile,
  closeSidebarMobile,
  toggleSidebarMobile,
  syncFixedTopbarOffset,
  setMobileToggleState,
  handleViewportResize,

  getState,
  getSnapshot,
  getDebugSnapshot: getSnapshot,

  get runtime() {
    return searchRuntime;
  },

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },

  get bound() {
    return bound;
  },

  get binding() {
    return false;
  },

  get rebinding() {
    return false;
  },
};

registerPublicApi();

export const TopbarUI = api;

export default TopbarUI;

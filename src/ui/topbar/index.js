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
   - No exponer API falsa de sidebar.
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
  clearSearchDebounce,
  clearSearchState,
  handleSearchKeydown,
  hideResultsContainer,
  runSearch,
} from "./topbar.search.js";

import {
  TOPBAR_DEFAULT_VIEW_TITLE,
  TOPBAR_SEARCH_CONFIG,
  TOPBAR_TITLE_PREFIX,
  normalizeQuery,
  resolveTopbarRouteTitle,
  safeNormalizeCanonicalPath,
  safeNormalizePath,
} from "./topbar.helpers.js";

export const TOPBAR_UI_VERSION = "topbar.ui.v6";

const SOURCE = "topbar.ui";
const SEARCH_DEBOUNCE_MS = TOPBAR_SEARCH_CONFIG.debounceMs;

let initialized = false;
let mounted = false;
let bound = false;

let root = null;
let boundRoot = null;
let cleanupEvents = null;

let searchValue = "";
let lastRoutePath = "";

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
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");

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

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   PATHS
========================================================= */

function currentPublicPath() {
  const candidate =
    Router?.getCurrentPublicPath?.() ||
    Router?.getCurrentCanonicalPath?.() ||
    AppCore?.state?.publicPath ||
    AppCore?.state?.canonicalPath ||
    AppCore?.state?.route ||
    (isBrowser()
      ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
      : "/");

  return safeNormalizePath(AppCore, candidate || "/");
}

function currentPath() {
  return safeNormalizeCanonicalPath(AppCore, currentPublicPath());
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
  {
    className = "",
    textContent = "",
    attrs = {},
    dataset = {},
  } = {}
) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    if (!key) continue;
    if (value === false || value === null || value === undefined) continue;

    node.setAttribute(key, value === true ? "true" : String(value));
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    if (!key) continue;
    if (value === false || value === null || value === undefined) continue;

    node.dataset[key] = String(value);
  }

  return node;
}

function clear(node = null) {
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

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");
    node.setAttribute("aria-busy", "false");
    node.dataset.topbarVisible = value ? "false" : "true";
    return true;
  } catch {
    return false;
  }
}

function getMount() {
  return (
    query("#topbar-mount") ||
    query("[data-topbar-mount]") ||
    query("#app-topbar") ||
    query("[data-topbar-root]")
  );
}

function cacheRoot(node = null) {
  if (!node) return node;

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.topbar = node;
    AppCore.dom.appTopbar = node;
    AppCore.dom.topbarRoot = node;

    AppCore.dom.topbarMount =
      query("#topbar-mount") ||
      (
        node?.parentElement?.id === "topbar-mount"
          ? node.parentElement
          : null
      );

    AppCore.dom.topbarTitle =
      node?.querySelector?.("[data-topbar-title]") || null;

    AppCore.dom.search =
      node?.querySelector?.("[data-topbar-search]") || null;
    AppCore.dom.searchForm = AppCore.dom.search;
    AppCore.dom.searchInput =
      node?.querySelector?.("[data-topbar-search-input]") || null;
    AppCore.dom.searchSubmit =
      node?.querySelector?.("[data-topbar-search-submit]") || null;

    AppCore.dom.searchResults =
      query("#topbar-search-results") ||
      query("[data-topbar-search-results]") ||
      query(".topbar-search-results") ||
      null;

    /*
      Contrato actual:
      Topbar no controla sidebar ni mobile toggle.
    */
    delete AppCore.dom.mobileSidebarToggle;
    delete AppCore.dom.toggleSidebarMobile;
  } catch {
    // noop
  }

  return node;
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

    delete AppCore.dom.mobileSidebarToggle;
    delete AppCore.dom.toggleSidebarMobile;

    return true;
  } catch {
    return false;
  }
}

function renderRootContent(header = null) {
  if (!header) return false;

  header.id = "app-topbar";
  header.className = "topbar app-topbar";
  header.setAttribute("data-topbar-root", "true");
  header.setAttribute("data-topbar", "root");
  header.setAttribute("role", "banner");
  header.setAttribute("aria-label", "Barra superior");

  clear(header);

  const left = create("div", {
    className: "topbar-left",
    attrs: {
      "data-topbar-left": "true",
    },
  });

  const title = create("h1", {
    className: "topbar-title",
    textContent: `${TOPBAR_TITLE_PREFIX} ${TOPBAR_DEFAULT_VIEW_TITLE}`,
    attrs: {
      id: "topbar-title",
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
      id: "topbar-search-form",
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
      id: "topbar-search-input",
      type: "search",
      inputmode: "search",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "Buscar",
      "aria-label": "Buscar",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "data-topbar-search-input": "true",
    },
  });

  const button = create("button", {
    className: "topbar-search-submit",
    attrs: {
      id: "topbar-search-submit",
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

function rootHasRequiredStructure(node = null) {
  return Boolean(
    node?.querySelector?.("[data-topbar-title]") &&
      node?.querySelector?.("[data-topbar-search]") &&
      node?.querySelector?.("[data-topbar-search-input]") &&
      node?.querySelector?.("[data-topbar-search-submit]")
  );
}

function rootHasLegacyChrome(node = null) {
  return Boolean(
    node?.querySelector?.("[data-topbar-sidebar-toggle]") ||
      node?.querySelector?.("[data-topbar-user]") ||
      node?.querySelector?.("[data-topbar-logout]") ||
      node?.querySelector?.(".topbar-sidebar-toggle") ||
      node?.querySelector?.(".topbar-mobile-toggle") ||
      node?.querySelector?.(".topbar-user") ||
      node?.querySelector?.(".topbar-logout")
  );
}

function buildRoot() {
  const header = create("header", {
    className: "topbar app-topbar",
    attrs: {
      id: "app-topbar",
      "data-topbar-root": "true",
      "data-topbar": "root",
      role: "banner",
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

  if (mount.matches?.("[data-topbar-root], #app-topbar")) {
    root = mount;
  } else {
    root = mount.querySelector("[data-topbar-root]");

    if (!root) {
      root = buildRoot();
      clear(mount);
      mount.appendChild(root);
    }
  }

  if (!rootHasRequiredStructure(root) || rootHasLegacyChrome(root)) {
    renderRootContent(root);
  }

  return cacheRoot(root);
}

function getDom() {
  ensureRoot();

  const searchResults =
    query("#topbar-search-results") ||
    query("[data-topbar-search-results]") ||
    query(".topbar-search-results") ||
    null;

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

function resolveRouteTitle(path = currentPath()) {
  return resolveTopbarRouteTitle(AppCore, path);
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
  return normalizeQuery(value);
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
    query,
  });

  return true;
}

function queueSearch(value = getSearchValue()) {
  const query = normalizeSearchValue(value);

  clearSearchDebounce(searchRuntime);

  if (!query || query.length < TOPBAR_SEARCH_CONFIG.minQueryLength) {
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

  return true;
}

function focusSearch(options = {}) {
  const { searchInput } = getDom();

  if (!searchInput) return false;

  try {
    searchInput.focus({
      preventScroll: true,
    });

    if (options.select === true) {
      searchInput.select?.();
    }

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

  if (event.isComposing === true) return;

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
  });
}

function onFocusIn(event) {
  if (!event.target?.matches?.("[data-topbar-search-input]")) return;

  const query = getSearchValue();

  if (query) {
    runCurrentSearch(query);
  }
}

function onDocumentKeydown(event) {
  const key = String(event?.key || "").toLowerCase();

  if (!((event?.ctrlKey || event?.metaKey) && key === "k")) return;

  try {
    event.preventDefault();
  } catch {
    // noop
  }

  focusSearch({
    select: true,
  });
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
  if (!root) return false;

  if (bound && boundRoot === root) return true;

  if (bound && boundRoot !== root) {
    unbind();
  }

  try {
    root.addEventListener("submit", onSubmit);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKeydown);
    root.addEventListener("focusin", onFocusIn);
  } catch {
    return false;
  }

  if (isBrowser()) {
    try {
      document.addEventListener("keydown", onDocumentKeydown, false);
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
    } catch {
      // noop
    }
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

    if (isBrowser()) {
      try {
        document.removeEventListener("keydown", onDocumentKeydown, false);
        document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      } catch {
        // noop
      }
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

function resolveSyncPath(options = {}) {
  return safeNormalizeCanonicalPath(
    AppCore,
    options.canonicalPath ||
      options.path ||
      options.publicPath ||
      currentPath()
  );
}

function sync(options = {}) {
  ensureRoot();

  if (!root) return false;

  const path = resolveSyncPath(options);

  if (lastRoutePath && lastRoutePath !== path) {
    hideSearchResults();
  }

  lastRoutePath = path;

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
  registerModule();

  searchRuntime.AppCore = AppCore;
  searchRuntime.Router = Router;

  initialized = true;

  ensureRoot();
  sync(options);
  bind();

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
  clearSearchDebounce(searchRuntime);

  if (options.unmount === true && root) {
    try {
      root.remove();
    } catch {
      clear(root);
    }

    clearDomCache();
    root = null;
  }

  initialized = false;
  mounted = false;
  lastRoutePath = "";

  unregisterModule();

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.topbar = api;

    AppCore.modules?.register?.("topbar", api);

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (AppCore.ui?.topbar === api) {
      delete AppCore.ui.topbar;
    }

    AppCore.modules?.remove?.("topbar");

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
    logout: false,
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

    cacheSize: searchRuntime.cache instanceof Map
      ? searchRuntime.cache.size
      : 0,

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
    route: redact(currentPath()),

    search: getSearchSnapshot(),

    dom: {
      ...getDomSnapshot(),
      hasSvg: Boolean(root?.querySelector?.("svg")),
    },

    policy: {
      topbarOnly: true,

      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      ownToast: false,
      ownEvents: false,

      noUserChrome: true,
      noLogout: true,
      noSidebarToggle: true,
      noSidebarBridge: true,

      noWindowGlobal: true,
      noImportSideEffectRegistration: true,

      searchUi: true,
      searchRuntime: true,
      searchLocalOnly: true,

      svgIcons: true,

      canonicalizesUserHomePath: true,

      roles: ["admin", "user"],
      snapshotRedacted: true,
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
  destroy,

  bind,

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
};

export const TopbarUI = api;

export default TopbarUI;

/* =========================================================
   Onion Support - Topbar Search
   Archivo: /src/ui/topbar/topbar.search.js

   Responsabilidad:
   - Motor local del buscador del topbar.
   - Render opcional de resultados locales.
   - Navegación segura delegada en Router.
   - Resolver Home como /@{user.slug} sólo cuando exista slug real.
   - Respetar rutas adminOnly.
   - Constantes/rutas/helpers desde core/config.js y topbar.helpers.js.
   - Sin API /api/search.
   - Sin HTTP.
   - Sin Toast.
   - Sin overlays globales.
   - Sin focus mode global.
   - Sin runtime complejo.
   - Sin CustomEvent.
   - Sin eventos AppCore.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

import {
  ROUTES,
} from "../../core/config.js";

import {
  TOPBAR_SEARCH_CONFIG,
  TOPBAR_RESULT_TYPES,
  getTypeIcon,
  getTypeLabel,
  groupResults,
  normalizeQuery,
  normalizeResultType,
  redactSensitiveText,
  resolveHomePath,
  safeNormalizePath,
  scoreResult,
} from "./topbar.helpers.js";

export const TOPBAR_SEARCH_VERSION = "topbar.search.v3";

export const SEARCH_ACTIONS = Object.freeze({
  NAVIGATE: "navigate",
});

export const ENTITY_TYPES = TOPBAR_RESULT_TYPES;

const SOURCE = "topbar.search";
const RESULTS_ID = "topbar-search-results";

const MAX_RESULTS = TOPBAR_SEARCH_CONFIG.maxResultsTotal || 20;

const HOME_ROUTE = ROUTES.home || ROUTES.root || "/";
const INCIDENCIAS_ROUTE = ROUTES.incidencias || "/incidencias";
const FACTURAS_ROUTE = ROUTES.facturas || "/facturas";
const CLIENTES_ROUTE = ROUTES.clientes || "/clientes";
const CUENTA_ROUTE = ROUTES.cuenta || "/cuenta";
const AJUSTES_ROUTE = ROUTES.ajustes || "/ajustes";
const USUARIOS_ROUTE = ROUTES.usuarios || "/usuarios";
const SERVIDOR_ROUTE = ROUTES.servidor || "/servidor";

let searchFocusActive = false;

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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

/* =========================================================
   PATH SAFETY
========================================================= */

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

function isUnsafeHref(value = "") {
  const raw = text(value, "").toLowerCase();

  return Boolean(
    !raw ||
      raw.startsWith("//") ||
      raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:") ||
      raw.startsWith("file:") ||
      raw.startsWith("blob:") ||
      raw.startsWith("about:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:") ||
      /[\r\n\t\\]/.test(raw) ||
      hasSensitiveQuery(raw)
  );
}

function safePath(AppCore = null, path = HOME_ROUTE) {
  const raw = text(path, "");

  if (isUnsafeHref(raw)) return "";

  const normalized = safeNormalizePath(AppCore, raw);

  if (
    !normalized ||
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    /[\r\n\t\\]/.test(normalized) ||
    hasSensitiveQuery(normalized)
  ) {
    return "";
  }

  return normalized;
}

/* =========================================================
   ROLE / VISIBILITY
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

function getStateUser(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return (
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    null
  );
}

function userIsAdmin(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const user = getStateUser(AppCore) || {};

  const roles = [
    state.role,
    state.rol,
    user.role,
    user.rol,
    ...(Array.isArray(state.roles) ? state.roles : []),
    ...(Array.isArray(user.roles) ? user.roles : []),
  ];

  return roles.some((role) => normalizeRole(role) === "admin");
}

/* =========================================================
   DOM
========================================================= */

function domFrom(getDom = null) {
  let dom = {};

  try {
    dom = isFunction(getDom) ? getDom() || {} : {};
  } catch {
    dom = {};
  }

  if (!isBrowser()) return dom;

  const topbar =
    dom.topbar ||
    document.querySelector("[data-topbar-root]") ||
    document.querySelector("#app-topbar") ||
    null;

  const search =
    dom.search ||
    topbar?.querySelector?.("[data-topbar-search]") ||
    document.querySelector("[data-topbar-search]") ||
    null;

  const searchInput =
    dom.searchInput ||
    search?.querySelector?.("[data-topbar-search-input]") ||
    document.querySelector("[data-topbar-search-input]") ||
    null;

  const searchResults =
    dom.searchResults ||
    search?.querySelector?.(`#${RESULTS_ID}`) ||
    search?.querySelector?.("[data-topbar-search-results]") ||
    topbar?.querySelector?.(`#${RESULTS_ID}`) ||
    topbar?.querySelector?.("[data-topbar-search-results]") ||
    null;

  return {
    ...dom,
    topbar,
    search,
    searchInput,
    searchResults,
  };
}

function ensureResultsContainer(getDom = null) {
  if (!isBrowser()) return null;

  const dom = domFrom(getDom);

  if (dom.searchResults) return dom.searchResults;
  if (!dom.search && !dom.topbar) return null;

  const results = document.createElement("div");

  results.id = RESULTS_ID;
  results.className = "topbar-search-results";
  results.hidden = true;
  results.dataset.topbarSearchResults = "true";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Resultados de búsqueda");
  results.setAttribute("aria-hidden", "true");

  try {
    (dom.search || dom.topbar).appendChild(results);
  } catch {
    return null;
  }

  if (dom.searchInput) {
    try {
      dom.searchInput.setAttribute("aria-controls", RESULTS_ID);
      dom.searchInput.setAttribute("aria-autocomplete", "list");
      dom.searchInput.setAttribute("aria-expanded", "false");
      dom.searchInput.setAttribute("role", "combobox");
    } catch {
      // noop
    }
  }

  return results;
}

function setSearchVisualState(getDom = null, active = false) {
  const { topbar, search } = domFrom(getDom);
  const value = Boolean(active);

  try {
    topbar?.classList?.toggle?.("is-search-focused", value);

    if (value) {
      topbar?.setAttribute?.("data-search-focus", "true");
    } else {
      topbar?.removeAttribute?.("data-search-focus");
    }
  } catch {
    // noop
  }

  try {
    search?.classList?.toggle?.("is-search-open", value);

    if (value) {
      search?.setAttribute?.("data-search-open", "true");
    } else {
      search?.removeAttribute?.("data-search-open");
    }
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   CACHE / CONTROL
========================================================= */

export function clearSearchDebounce(runtime = null) {
  if (!runtime?.searchDebounceTimer) return false;

  try {
    window.clearTimeout(runtime.searchDebounceTimer);
  } catch {
    try {
      clearTimeout(runtime.searchDebounceTimer);
    } catch {
      // noop
    }
  }

  runtime.searchDebounceTimer = null;
  return true;
}

export function clearSearchState(runtime = null, getDom = null) {
  if (!runtime) return false;

  clearSearchDebounce(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;
  runtime.searchController = null;

  hideResultsContainer(runtime, getDom);

  return true;
}

export function getCacheKey(query = "") {
  return normalizeQuery(query).toLowerCase();
}

export function getCached(runtime = null, query = "") {
  const key = getCacheKey(query);

  if (!runtime?.cache || !key) return null;

  try {
    return runtime.cache.get(key) || null;
  } catch {
    return null;
  }
}

export function setCached(runtime = null, query = "", value = []) {
  const key = getCacheKey(query);

  if (!runtime || !key) return false;

  try {
    runtime.cache = runtime.cache instanceof Map ? runtime.cache : new Map();
    runtime.cache.set(key, value);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LOCAL INDEX
========================================================= */

function navItem({
  id = "",
  title = "",
  subtitle = "",
  url = HOME_ROUTE,
  adminOnly = false,
} = {}) {
  return {
    id,
    type: ENTITY_TYPES.NAV,
    title,
    subtitle,
    url,
    action: SEARCH_ACTIONS.NAVIGATE,
    adminOnly,
  };
}

export function getLocalIndex(AppCore = null) {
  const items = [
    navItem({
      id: "nav:home",
      title: "Home",
      subtitle: "Panel principal",
      url: resolveHomePath(AppCore),
    }),
    navItem({
      id: "nav:incidencias",
      title: "Incidencias",
      subtitle: "Tickets e incidencias",
      url: INCIDENCIAS_ROUTE,
    }),
    navItem({
      id: "nav:facturas",
      title: "Facturas",
      subtitle: "Facturación",
      url: FACTURAS_ROUTE,
    }),
    navItem({
      id: "nav:clientes",
      title: "Clientes",
      subtitle: "Gestión de clientes",
      url: CLIENTES_ROUTE,
    }),
    navItem({
      id: "nav:cuenta",
      title: "Cuenta",
      subtitle: "Perfil de usuario",
      url: CUENTA_ROUTE,
    }),
    navItem({
      id: "nav:ajustes",
      title: "Ajustes",
      subtitle: "Configuración",
      url: AJUSTES_ROUTE,
    }),
    navItem({
      id: "nav:usuarios",
      title: "Usuarios",
      subtitle: "Gestión de usuarios",
      url: USUARIOS_ROUTE,
      adminOnly: true,
    }),
    navItem({
      id: "nav:servidor",
      title: "Servidor",
      subtitle: "Estado del servidor",
      url: SERVIDOR_ROUTE,
      adminOnly: true,
    }),
  ];

  const isAdmin = userIsAdmin(AppCore);

  return items
    .filter((item) => !item.adminOnly || isAdmin)
    .map((item) => ({
      ...item,
      url: safePath(AppCore, item.url),
    }))
    .filter((item) => item.url);
}

export function searchLocal(query = "", AppCore = null) {
  const q = normalizeQuery(query);

  if (!q) return [];

  return getLocalIndex(AppCore)
    .map((item) => {
      return {
        ...item,
        entityId: "",
        raw: null,
        source: "local",
        score: scoreResult(item, q),
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      return Number(right.score || 0) - Number(left.score || 0);
    });
}

export function mergeResults(localResults = [], query = "") {
  const seen = new Set();
  const output = [];

  for (const item of asArray(localResults)) {
    if (!item) continue;

    const url = safePath(null, item.url || "");

    if (!url) continue;

    const type = normalizeResultType(item.type);

    const key = [
      type,
      item.entityId || "",
      url,
      item.title || "",
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);

    output.push({
      ...item,
      type,
      url,
      score: Number(item.score || 0) || scoreResult(item, query),
    });
  }

  return output
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, MAX_RESULTS);
}

/* =========================================================
   VISUAL STATE
========================================================= */

export function setSearchExpanded(input = null, expanded = false) {
  if (!input) return false;

  try {
    input.setAttribute("aria-expanded", expanded ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

export function showResultsContainer(_runtime = null, getDom = null) {
  const searchResults = ensureResultsContainer(getDom);
  const { searchInput } = domFrom(getDom);

  if (!searchResults) return false;

  try {
    searchResults.hidden = false;
    searchResults.classList.add("active");
    searchResults.dataset.searchOpen = "true";
    searchResults.setAttribute("aria-hidden", "false");
  } catch {
    // noop
  }

  setSearchExpanded(searchInput, true);
  setSearchVisualState(getDom, true);

  searchFocusActive = true;

  return true;
}

export function hideResultsContainer(runtime = null, getDom = null) {
  const { searchResults, searchInput } = domFrom(getDom);

  if (searchResults) {
    try {
      searchResults.hidden = true;
      searchResults.classList.remove("active");
      delete searchResults.dataset.searchOpen;
      searchResults.setAttribute("aria-hidden", "true");
      searchResults.replaceChildren();
    } catch {
      // noop
    }
  }

  if (searchInput) {
    try {
      searchInput.removeAttribute("aria-activedescendant");
    } catch {
      // noop
    }
  }

  if (runtime) {
    runtime.activeIndex = -1;
    runtime.currentItems = [];
  }

  setSearchExpanded(searchInput, false);
  setSearchVisualState(getDom, false);

  searchFocusActive = false;

  return true;
}

function renderState(runtime = null, getDom = null, title = "", message = "", stateClass = "") {
  if (!isBrowser()) return false;

  const searchResults = ensureResultsContainer(getDom);

  if (!searchResults) return false;

  searchResults.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = `search-state ${stateClass}`.trim();

  const titleNode = document.createElement("div");
  titleNode.className = "search-state-title";
  titleNode.textContent = title;

  const messageNode = document.createElement("div");
  messageNode.className = "search-state-text";
  messageNode.textContent = message;

  wrapper.append(titleNode, messageNode);
  searchResults.appendChild(wrapper);

  return showResultsContainer(runtime, getDom);
}

export function setLoadingState(_AppCore = null, runtime = null, getDom = null, query = "") {
  return renderState(
    runtime,
    getDom,
    "Buscando",
    query ? `Buscando “${query}”...` : "Buscando...",
    "search-state-loading"
  );
}

export function setEmptyState(_AppCore = null, runtime = null, getDom = null, query = "") {
  return renderState(
    runtime,
    getDom,
    "Sin resultados",
    query ? `No hay coincidencias para “${query}”.` : "No hay resultados.",
    "search-state-empty"
  );
}

export function setErrorState(runtime = null, getDom = null) {
  return renderState(
    runtime,
    getDom,
    "Error",
    "No se pudo completar la búsqueda.",
    "search-state-error"
  );
}

/* =========================================================
   ACTIVE ITEM
========================================================= */

export function updateActiveItem(runtime = null, items = []) {
  const list = asArray(items);

  list.forEach((node, index) => {
    const active = index === runtime?.activeIndex;

    try {
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", active ? "true" : "false");
    } catch {
      // noop
    }
  });

  return true;
}

export function updateActiveVisuals(runtime = null, getDom = null) {
  const { searchResults, searchInput } = domFrom(getDom);

  if (!searchResults) return false;

  const items = [...searchResults.querySelectorAll(".search-result")];

  items.forEach((node, index) => {
    const active = index === runtime?.activeIndex;

    try {
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", active ? "true" : "false");

      if (active && searchInput && node.id) {
        searchInput.setAttribute("aria-activedescendant", node.id);
      }
    } catch {
      // noop
    }
  });

  if (runtime?.activeIndex < 0 && searchInput) {
    try {
      searchInput.removeAttribute("aria-activedescendant");
    } catch {
      // noop
    }
  }

  return true;
}

export function moveActive(runtime = null, getDom = null, direction = 1) {
  if (!runtime?.currentItems?.length) return false;

  const length = runtime.currentItems.length;
  const current = Number(runtime.activeIndex || -1);
  const next = (current + direction + length) % length;

  runtime.activeIndex = next;

  updateActiveVisuals(runtime, getDom);

  return true;
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateTo(AppCore = null, Router = null, path = HOME_ROUTE) {
  const target = safePath(AppCore, path);

  if (!target) return false;

  try {
    if (isFunction(Router?.navigate)) {
      const result = await Router.navigate(target, {
        source: SOURCE,
      });

      return result !== false && result?.ok !== false;
    }

    if (isFunction(Router?.replace)) {
      const result = await Router.replace(target, {
        source: SOURCE,
      });

      return result !== false && result?.ok !== false;
    }

    if (isFunction(AppCore?.router?.navigate)) {
      const result = await AppCore.router.navigate(target, {
        source: SOURCE,
      });

      return result !== false && result?.ok !== false;
    }
  } catch {
    return false;
  }

  return false;
}

export async function goToResult({
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
  item = null,
} = {}) {
  if (!item) return false;

  hideResultsContainer(runtime, getDom);

  const target = safePath(AppCore, item.url || "");

  if (!target) return false;

  return navigateTo(AppCore, Router, target);
}

export function activateCurrent({
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
} = {}) {
  if (!runtime?.currentItems?.length) return false;

  const index = Math.max(0, Number(runtime.activeIndex || 0));
  const item = runtime.currentItems[index];

  if (!item) return false;

  void goToResult({
    AppCore,
    Router,
    runtime,
    getDom,
    item,
  });

  return true;
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function createResultNode({
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
  item = null,
  index = 0,
} = {}) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "search-result";
  button.id = `topbar-search-result-${index}`;
  button.dataset.index = String(index);
  button.dataset.type = normalizeResultType(item.type);
  button.dataset.url = safePath(AppCore, item.url || "");
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", "false");

  const iconNode = document.createElement("span");
  iconNode.className = "search-icon";
  iconNode.setAttribute("aria-hidden", "true");
  iconNode.textContent = getTypeIcon(item.type);

  const textNode = document.createElement("span");
  textNode.className = "search-text";

  const title = document.createElement("span");
  title.className = "search-title";

  const titleMain = document.createElement("span");
  titleMain.className = "search-title-main";
  titleMain.textContent = item.title || "Resultado";

  title.appendChild(titleMain);

  const subtitle = document.createElement("span");
  subtitle.className = "search-subtitle";
  subtitle.textContent = item.subtitle || getTypeLabel(item.type);

  textNode.append(title, subtitle);

  const pill = document.createElement("span");
  pill.className = "search-action-pill";
  pill.textContent = getTypeLabel(item.type);

  button.append(iconNode, textNode, pill);

  button.addEventListener("click", () => {
    void goToResult({
      AppCore,
      Router,
      runtime,
      getDom,
      item,
    });
  });

  return button;
}

export function renderResults({
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
  results = [],
  query = "",
} = {}) {
  if (!isBrowser()) return false;

  const searchResults = ensureResultsContainer(getDom);

  if (!searchResults) return false;

  searchResults.replaceChildren();

  const list = asArray(results).slice(0, MAX_RESULTS);

  if (!list.length) {
    if (runtime) {
      runtime.currentItems = [];
      runtime.activeIndex = -1;
    }

    return setEmptyState(AppCore, runtime, getDom, query);
  }

  const groups = groupResults(list);
  const ordered = groups.flatMap(([, items]) => items).slice(0, MAX_RESULTS);

  if (runtime) {
    runtime.currentItems = ordered;
    runtime.activeIndex = -1;
  }

  let index = 0;

  for (const [type, items] of groups) {
    const group = document.createElement("div");
    group.className = "search-group-block";

    const heading = document.createElement("div");
    heading.className = "search-group";
    heading.textContent = getTypeLabel(type);

    group.appendChild(heading);

    for (const item of items) {
      if (index >= ordered.length) break;

      const node = createResultNode({
        AppCore,
        Router,
        runtime,
        getDom,
        item,
        index,
      });

      group.appendChild(node);
      index += 1;
    }

    searchResults.appendChild(group);
  }

  return showResultsContainer(runtime, getDom);
}

/* =========================================================
   KEYBOARD
========================================================= */

export function handleSearchKeydown({
  event = null,
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
} = {}) {
  if (!event || !runtime) return false;

  if (event.key === "Escape") {
    event.preventDefault();
    clearSearchState(runtime, getDom);
    return true;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(runtime, getDom, 1);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(runtime, getDom, -1);
    return true;
  }

  if (event.key === "Enter" && runtime.currentItems?.length) {
    event.preventDefault();

    activateCurrent({
      AppCore,
      Router,
      runtime,
      getDom,
    });

    return true;
  }

  return false;
}

/* =========================================================
   RUN SEARCH
========================================================= */

export async function runSearch({
  AppCore = null,
  Router = null,
  runtime = null,
  getDom = null,
  query = "",
} = {}) {
  if (!runtime) return false;

  const q = normalizeQuery(query);

  runtime.AppCore = AppCore;
  runtime.Router = Router;
  runtime.currentQuery = q;
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;

  if (!q) {
    clearSearchState(runtime, getDom);
    return true;
  }

  const cached = getCached(runtime, q);

  if (cached) {
    renderResults({
      AppCore,
      Router,
      runtime,
      getDom,
      results: cached,
      query: q,
    });

    return true;
  }

  const localResults = mergeResults(searchLocal(q, AppCore), q);

  setCached(runtime, q, localResults);

  renderResults({
    AppCore,
    Router,
    runtime,
    getDom,
    results: localResults,
    query: q,
  });

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function isSearchFocusActive() {
  return searchFocusActive;
}

export function getTopbarSearchSnapshot(runtime = null) {
  return {
    version: TOPBAR_SEARCH_VERSION,

    focusActive: searchFocusActive,

    activeIndex: Number(runtime?.activeIndex || -1),
    currentItems: Array.isArray(runtime?.currentItems)
      ? runtime.currentItems.length
      : 0,

    currentQueryLength: String(runtime?.currentQuery || "").length,

    cacheSize: runtime?.cache instanceof Map
      ? runtime.cache.size
      : 0,

    hasDebounce: Boolean(runtime?.searchDebounceTimer),

    routes: {
      home: redactSensitiveText(resolveHomePath(runtime?.AppCore || null)),
      incidencias: INCIDENCIAS_ROUTE,
      facturas: FACTURAS_ROUTE,
      clientes: CLIENTES_ROUTE,
      cuenta: CUENTA_ROUTE,
      ajustes: AJUSTES_ROUTE,
      usuarios: USUARIOS_ROUTE,
      servidor: SERVIDOR_ROUTE,
    },

    policy: {
      localSearchOnly: true,
      noApiSearch: true,
      noHttp: true,
      noToast: true,
      noCustomEvent: true,
      noAppCoreEvents: true,

      noBrowserNavigation: true,
      noAppCoreNavigate: true,
      navigationDelegatedToRouter: true,

      homeUsesRealSlugOnly: true,
      noUsernameHomeFallback: true,

      clientesNotAdminOnly: true,
      adminOnlyRoutes: [USUARIOS_ROUTE, SERVIDOR_ROUTE],

      resultsContainerInsideTopbar: true,
      noGlobalOverlay: true,

      rejectsSensitiveTargets: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOPBAR_SEARCH_VERSION,
  SEARCH_ACTIONS,
  ENTITY_TYPES,

  clearSearchDebounce,
  clearSearchState,

  getCacheKey,
  getCached,
  setCached,

  getLocalIndex,
  searchLocal,
  mergeResults,

  setSearchExpanded,
  showResultsContainer,
  hideResultsContainer,
  setLoadingState,
  setEmptyState,
  setErrorState,
  updateActiveItem,
  updateActiveVisuals,
  moveActive,

  goToResult,
  activateCurrent,
  renderResults,
  handleSearchKeydown,
  runSearch,

  isSearchFocusActive,
  getTopbarSearchSnapshot,
};

/* =========================================================
   Onion Support - Topbar Search
   Archivo: /src/ui/topbar/topbar.search.js

   Responsabilidad:
   - Compat mínima del antiguo buscador del topbar.
   - Sin imports.
   - Sin API /api/search.
   - Sin HTTP.
   - Sin Toast.
   - Sin overlays.
   - Sin focus mode global.
   - Sin runtime complejo.
   - Sin CustomEvent.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_SEARCH_VERSION = "simple";

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

const SOURCE = "topbar.search";

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

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: TOPBAR_SEARCH_VERSION,
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
   TEXT / TYPE
========================================================= */

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuery(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeType(value = ENTITY_TYPES.GENERAL) {
  const type = normalizeText(value).replace(/[^a-z0-9_-]/g, "");

  if (["incidencia", "incidencias", "ticket", "tickets"].includes(type)) return ENTITY_TYPES.INCIDENCIA;
  if (["factura", "facturas", "invoice", "invoices"].includes(type)) return ENTITY_TYPES.FACTURA;
  if (["cliente", "clientes", "client", "clients"].includes(type)) return ENTITY_TYPES.CLIENTE;
  if (["usuario", "usuarios", "user", "users"].includes(type)) return ENTITY_TYPES.USUARIO;
  if (["nav", "route", "ruta", "rutas"].includes(type)) return ENTITY_TYPES.NAV;

  return ENTITY_TYPES.GENERAL;
}

function typeLabel(type = ENTITY_TYPES.GENERAL) {
  const labels = {
    [ENTITY_TYPES.NAV]: "Navegación",
    [ENTITY_TYPES.USUARIO]: "Usuarios",
    [ENTITY_TYPES.CLIENTE]: "Clientes",
    [ENTITY_TYPES.INCIDENCIA]: "Incidencias",
    [ENTITY_TYPES.FACTURA]: "Facturas",
    [ENTITY_TYPES.GENERAL]: "Resultados",
  };

  return labels[normalizeType(type)] || labels.general;
}

/* =========================================================
   PATHS
========================================================= */

function safePath(path = "/") {
  let value = text(path, "");

  if (!value) return "";
  if (/^(javascript:|data:|vbscript:|file:|mailto:|tel:)/i.test(value)) return "";
  if (value.startsWith("//")) return "";

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");
  if (value.startsWith("#")) return "";

  try {
    if (/^https?:\/\//i.test(value) && isBrowser()) {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return "";
      value = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
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

export function abortSearch(runtime = null) {
  if (!runtime?.searchController) return false;

  try {
    runtime.searchController.abort();
  } catch {
    // noop
  }

  runtime.searchController = null;
  return true;
}

export function clearSearchState(runtime = null, getDom = null) {
  if (!runtime) return false;

  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;

  hideResultsContainer(runtime, getDom);

  return true;
}

export function getCacheKey(query = "") {
  return normalizeText(query);
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

function userIsAdmin(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    {};

  const role = String(state.role || user.role || user.rol || "").toLowerCase();

  return role === "admin";
}

export function getLocalIndex(AppCore = null) {
  const items = [
    {
      id: "nav:/",
      type: ENTITY_TYPES.NAV,
      title: "Inicio",
      subtitle: "Panel principal",
      url: "/",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/incidencias",
      type: ENTITY_TYPES.NAV,
      title: "Incidencias",
      subtitle: "Tickets e incidencias",
      url: "/incidencias",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/facturas",
      type: ENTITY_TYPES.NAV,
      title: "Facturas",
      subtitle: "Facturación",
      url: "/facturas",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/cuenta",
      type: ENTITY_TYPES.NAV,
      title: "Cuenta",
      subtitle: "Perfil de usuario",
      url: "/cuenta",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/ajustes",
      type: ENTITY_TYPES.NAV,
      title: "Ajustes",
      subtitle: "Configuración",
      url: "/ajustes",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/usuarios",
      type: ENTITY_TYPES.NAV,
      title: "Usuarios",
      subtitle: "Gestión de usuarios",
      url: "/usuarios",
      action: SEARCH_ACTIONS.NAVIGATE,
      adminOnly: true,
    },
    {
      id: "nav:/clientes",
      type: ENTITY_TYPES.NAV,
      title: "Clientes",
      subtitle: "Gestión de clientes",
      url: "/clientes",
      action: SEARCH_ACTIONS.NAVIGATE,
      adminOnly: true,
    },
    {
      id: "nav:/servidor",
      type: ENTITY_TYPES.NAV,
      title: "Servidor",
      subtitle: "Estado del servidor",
      url: "/servidor",
      action: SEARCH_ACTIONS.NAVIGATE,
      adminOnly: true,
    },
  ];

  return items.filter((item) => !item.adminOnly || userIsAdmin(AppCore));
}

function scoreText(value = "", query = "") {
  const haystack = normalizeText(value);
  const needle = normalizeText(query);

  if (!haystack || !needle) return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 70;
  if (haystack.includes(needle)) return 40;

  return 0;
}

export function searchLocal(query = "", AppCore = null) {
  const q = normalizeQuery(query);

  if (!q) return [];

  return getLocalIndex(AppCore)
    .map((item) => {
      const score =
        scoreText(item.title, q) +
        scoreText(item.subtitle, q) +
        scoreText(item.url, q);

      return {
        ...item,
        entityId: "",
        raw: item,
        source: "local",
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

/* =========================================================
   API COMPAT
========================================================= */

export function normalizeApiItem(AppCore = null, raw = null, index = 0) {
  if (!isObject(raw)) return null;

  const type = normalizeType(raw.type || raw.entity || raw.collection || raw.module);
  const title = text(
    first(
      raw.title,
      raw.name,
      raw.nombre,
      raw.displayName,
      raw.subject,
      raw.asunto,
      raw.numeroFactura,
      raw.numeroFacturaLegal,
      raw.id
    ),
    "Resultado"
  );

  const subtitle = text(
    first(
      raw.subtitle,
      raw.description,
      raw.descripcion,
      raw.email,
      raw.status,
      raw.estado,
      ""
    ),
    ""
  );

  const entityId = text(
    first(
      raw.entityId,
      raw.userId,
      raw.clienteId,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.id,
      raw._id
    ),
    ""
  );

  const url = safePath(raw.url || raw.path || raw.href || raw.route || raw.to || "");

  return {
    id: text(raw.searchId || raw.resultId || raw.id || raw._id || `${type}:${index}`, `${type}:${index}`),
    entityId,
    type,
    title,
    subtitle,
    url: url || null,
    action: SEARCH_ACTIONS.NAVIGATE,
    raw,
    source: "api",
  };
}

export function normalizeApiPayload(AppCore = null, data = null) {
  if (!data) return [];

  const direct = Array.isArray(data)
    ? data
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.data)
          ? data.data
          : [];

  return direct
    .map((item, index) => normalizeApiItem(AppCore, item, index))
    .filter(Boolean);
}

export async function searchAPI({ runtime = null, query = "" } = {}) {
  const cached = getCached(runtime, query);

  if (cached) return cached;

  setCached(runtime, query, []);

  return [];
}

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged = [...asArray(apiResults), ...asArray(localResults)];
  const seen = new Set();
  const output = [];

  for (const item of merged) {
    const key = [
      item.type || "",
      item.entityId || "",
      item.url || "",
      item.title || "",
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);

    output.push({
      ...item,
      score: Number(item.score || 0) || scoreText(item.title, query),
    });
  }

  return output
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 20);
}

/* =========================================================
   VISUAL COMPAT
========================================================= */

function domFrom(getDom = null) {
  try {
    return isFunction(getDom) ? getDom() || {} : {};
  } catch {
    return {};
  }
}

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
  const { searchResults, searchInput } = domFrom(getDom);

  if (!searchResults) return false;

  try {
    searchResults.hidden = false;
    searchResults.setAttribute("aria-hidden", "false");
  } catch {
    // noop
  }

  setSearchExpanded(searchInput, true);
  searchFocusActive = true;

  return true;
}

export function hideResultsContainer(runtime = null, getDom = null) {
  const { searchResults, searchInput } = domFrom(getDom);

  if (searchResults) {
    try {
      searchResults.hidden = true;
      searchResults.setAttribute("aria-hidden", "true");
      searchResults.replaceChildren();
    } catch {
      // noop
    }
  }

  if (runtime) {
    runtime.activeIndex = -1;
    runtime.currentItems = [];
  }

  setSearchExpanded(searchInput, false);
  searchFocusActive = false;

  return true;
}

function renderState(runtime = null, getDom = null, title = "", message = "") {
  if (!isBrowser()) return false;

  const { searchResults } = domFrom(getDom);

  if (!searchResults) return false;

  searchResults.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "search-state";

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
  return renderState(runtime, getDom, "Buscando", query ? `Buscando “${query}”...` : "Buscando...");
}

export function setEmptyState(_AppCore = null, runtime = null, getDom = null, query = "") {
  return renderState(runtime, getDom, "Sin resultados", query ? `No hay coincidencias para “${query}”.` : "No hay resultados.");
}

export function setErrorState(runtime = null, getDom = null) {
  return renderState(runtime, getDom, "Error", "No se pudo completar la búsqueda.");
}

export function updateActiveItem(runtime = null, items = []) {
  const list = asArray(items);

  list.forEach((node) => {
    try {
      node.classList.remove("active");
      node.setAttribute("aria-selected", "false");
    } catch {
      // noop
    }
  });

  if (runtime?.activeIndex >= 0 && list[runtime.activeIndex]) {
    try {
      list[runtime.activeIndex].classList.add("active");
      list[runtime.activeIndex].setAttribute("aria-selected", "true");
    } catch {
      // noop
    }
  }

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

  return true;
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateTo(AppCore = null, Router = null, path = "/") {
  const target = safePath(path);

  if (!target) return false;

  try {
    if (isFunction(Router?.navigate)) {
      await Router.navigate(target, {
        source: SOURCE,
      });
      return true;
    }

    if (isFunction(Router?.replace)) {
      await Router.replace(target, {
        source: SOURCE,
      });
      return true;
    }

    if (isFunction(AppCore?.Router?.navigate)) {
      await AppCore.Router.navigate(target, {
        source: SOURCE,
      });
      return true;
    }
  } catch {
    return false;
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

export async function goToResult({ AppCore = null, Router = null, runtime = null, getDom = null, closeSidebarMobile = null, item = null } = {}) {
  if (!item) return false;

  hideResultsContainer(runtime, getDom);

  try {
    closeSidebarMobile?.();
  } catch {
    // noop
  }

  const target = safePath(item.url || "");

  if (!target) return false;

  emit(AppCore, "topbar:search:navigate", {
    target,
    type: item.type || ENTITY_TYPES.GENERAL,
    entityId: item.entityId || "",
  });

  return navigateTo(AppCore, Router, target);
}

/* =========================================================
   RENDER RESULTS
========================================================= */

export function renderResults({ AppCore = null, Router = null, runtime = null, getDom = null, closeSidebarMobile = null, results = [], query = "" } = {}) {
  if (!isBrowser()) return false;

  const { searchResults } = domFrom(getDom);

  if (!searchResults) return false;

  searchResults.replaceChildren();

  const list = asArray(results);

  runtime.currentItems = list;
  runtime.activeIndex = -1;

  if (!list.length) {
    return setEmptyState(AppCore, runtime, getDom, query);
  }

  list.forEach((item, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "search-result";
    button.id = `topbar-search-result-${index}`;
    button.dataset.index = String(index);
    button.dataset.type = item.type || ENTITY_TYPES.GENERAL;
    button.dataset.url = item.url || "";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");

    const title = document.createElement("span");
    title.className = "search-title";
    title.textContent = item.title || "Resultado";

    const subtitle = document.createElement("span");
    subtitle.className = "search-subtitle";
    subtitle.textContent = item.subtitle || typeLabel(item.type);

    button.append(title, subtitle);

    button.addEventListener("click", () => {
      goToResult({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        item,
      });
    });

    searchResults.appendChild(button);
  });

  return showResultsContainer(runtime, getDom);
}

/* =========================================================
   RUN SEARCH
========================================================= */

export async function runSearch({ AppCore = null, Router = null, runtime = null, getDom = null, closeSidebarMobile = null, query = "" } = {}) {
  if (!runtime) return false;

  const q = normalizeQuery(query);

  runtime.AppCore = AppCore;
  runtime.Router = Router;
  runtime.closeSidebarMobile = closeSidebarMobile;
  runtime.currentQuery = q;
  runtime.searchSeq = Number(runtime.searchSeq || 0) + 1;

  if (!q || q.length < 1) {
    clearSearchState(runtime, getDom);
    return true;
  }

  const local = searchLocal(q, AppCore);

  renderResults({
    AppCore,
    Router,
    runtime,
    getDom,
    closeSidebarMobile,
    results: local,
    query: q,
  });

  return true;
}

export function isSearchFocusActive() {
  return searchFocusActive;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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

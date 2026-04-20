/* =========================================================
   Onion SPA - Topbar Search
   Archivo: src/ui/topbar.search.js

   Responsabilidades:
   - gestionar cache de búsqueda
   - construir índice local
   - normalizar payloads remotos
   - ejecutar búsqueda API
   - fusionar resultados locales + remotos
   - renderizar resultados del buscador
   - gestionar navegación a resultados
   - actualizar estados visuales del panel search
   - activar overlay glass global desde JS
   - centrar la atención visual en el buscador
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  escapeHtml,
  normalizeText,
  normalizeQuery,
  uniqBy,
  safeNormalizePath,
  getTypeLabel,
  getTypeIcon,
  highlight,
  scoreTextMatch,
  scoreResult,
  groupResults,
} from "./topbar.helpers.js";

/* =========================================================
   SEARCH FOCUS OVERLAY (JS)
   - SOLO cubre el área de contenido
   - NO tapa sidebar
   - NO tapa topbar
   - NO tapa toda la página
========================================================= */

const SEARCH_GLASS_ID = "topbar-search-glass-overlay";

const searchGlassRuntime = {
  runtime: null,
  getDom: null,
};

function getCssNumberVar(name = "", fallback = 0) {
  try {
    const value = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(name);

    const parsed = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getSearchGlassHost() {
  return (
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.getElementById("app-shell") ||
    document.body
  );
}

function getSearchGlass() {
  return document.getElementById(SEARCH_GLASS_ID);
}

function ensureHostPosition(host) {
  if (!host || host === document.body || host === document.documentElement) {
    return;
  }

  try {
    const computed = window.getComputedStyle(host).position;

    if (!computed || computed === "static") {
      host.style.position = "relative";
    }
  } catch {
    /* noop */
  }
}

function buildSearchGlassStyles(glass, host) {
  const isBodyHost =
    host === document.body || host === document.documentElement;

  Object.assign(glass.style, {
    position: isBodyHost ? "fixed" : "absolute",
    inset: "0",
    opacity: "0",
    visibility: "hidden",
    pointerEvents: "none",

    /* dentro de #app-content basta con estar por encima del view */
    zIndex: isBodyHost ? String(getCssNumberVar("--z-overlay", 60) - 1) : "2",

    background: [
      "radial-gradient(circle at calc(100% - 220px) 54px, rgba(124,92,255,.06), transparent 18%)",
      "linear-gradient(180deg, rgba(15,18,28,.05), rgba(15,18,28,.12))",
    ].join(", "),

    backdropFilter: "blur(4px) saturate(108%)",
    WebkitBackdropFilter: "blur(4px) saturate(108%)",

    transition:
      "opacity .16s cubic-bezier(.2,.8,.2,1), visibility .16s cubic-bezier(.2,.8,.2,1)",
  });
}

function ensureSearchGlass() {
  const host = getSearchGlassHost();
  ensureHostPosition(host);

  let glass = getSearchGlass();

  if (!glass) {
    glass = document.createElement("div");
    glass.id = SEARCH_GLASS_ID;
    glass.setAttribute("aria-hidden", "true");

    glass.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      const runtime = searchGlassRuntime.runtime;
      const getDom = searchGlassRuntime.getDom;

      if (!runtime || typeof getDom !== "function") return;

      const { searchInput } = getDom();

      hideResultsContainer(runtime, getDom);

      try {
        searchInput?.blur?.();
      } catch {
        /* noop */
      }
    });
  }

  buildSearchGlassStyles(glass, host);

  if (glass.parentNode !== host) {
    host.appendChild(glass);
  }

  return glass;
}

function showSearchGlass(runtime, getDom) {
  const glass = ensureSearchGlass();

  searchGlassRuntime.runtime = runtime || null;
  searchGlassRuntime.getDom = typeof getDom === "function" ? getDom : null;

  glass.style.opacity = "1";
  glass.style.visibility = "visible";
  glass.style.pointerEvents = "auto";
}

function hideSearchGlass() {
  const glass = getSearchGlass();

  searchGlassRuntime.runtime = null;
  searchGlassRuntime.getDom = null;

  if (!glass) return;

  glass.style.opacity = "0";
  glass.style.visibility = "hidden";
  glass.style.pointerEvents = "none";
}

function getSearchFocusNodes(getDom) {
  if (typeof getDom !== "function") {
    return {
      topbar: null,
      searchWrap: null,
      searchResults: null,
      topbarLeft: null,
      topbarRight: null,
      mutedNodes: [],
    };
  }

  const { searchInput, searchResults } = getDom();

  const searchWrap =
    searchInput?.closest?.(".topbar-search-wrap") ||
    searchResults?.closest?.(".topbar-search-wrap") ||
    null;

  const topbar =
    searchInput?.closest?.(".topbar") ||
    searchResults?.closest?.(".topbar") ||
    null;

  const topbarLeft = topbar?.querySelector?.(".topbar-left") || null;
  const topbarRight = topbar?.querySelector?.(".topbar-right") || null;

  const mutedNodes = topbarRight
    ? Array.from(topbarRight.children).filter((node) => node !== searchWrap)
    : [];

  return {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    topbarRight,
    mutedNodes,
  };
}

function muteNode(node) {
  if (!node) return;

  node.style.opacity = ".34";
  node.style.pointerEvents = "none";
  node.style.transition = "opacity .16s cubic-bezier(.2,.8,.2,1)";
}

function unmuteNode(node) {
  if (!node) return;

  node.style.opacity = "";
  node.style.pointerEvents = "";
  node.style.transition = "";
}

function applySearchFocusMode(getDom) {
  const topbarZ = getCssNumberVar("--z-topbar", 30);
  const dropdownZ = getCssNumberVar("--z-dropdown", 50);

  const {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    mutedNodes,
  } = getSearchFocusNodes(getDom);

  if (topbar) {
    topbar.dataset.searchFocus = "true";
    topbar.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 1);
  }

  if (searchWrap) {
    searchWrap.dataset.searchFocus = "true";
    searchWrap.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 2);
  }

  if (searchResults) {
    searchResults.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 3);
  }

  muteNode(topbarLeft);
  mutedNodes.forEach(muteNode);
}

function clearSearchFocusMode(getDom) {
  const {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    mutedNodes,
  } = getSearchFocusNodes(getDom);

  if (topbar) {
    delete topbar.dataset.searchFocus;
    topbar.style.zIndex = "";
  }

  if (searchWrap) {
    delete searchWrap.dataset.searchFocus;
    searchWrap.style.zIndex = "";
  }

  if (searchResults) {
    searchResults.style.zIndex = "";
  }

  unmuteNode(topbarLeft);
  mutedNodes.forEach(unmuteNode);
}

function activateSearchFocus(runtime, getDom) {
  showSearchGlass(runtime, getDom);
  applySearchFocusMode(getDom);
}

function deactivateSearchFocus(getDom) {
  hideSearchGlass();
  clearSearchFocusMode(getDom);
}

/* =========================================================
   CONTROL
========================================================= */

export function clearSearchDebounce(runtime) {
  if (runtime.searchDebounceTimer) {
    window.clearTimeout(runtime.searchDebounceTimer);
    runtime.searchDebounceTimer = null;
  }
}

export function abortSearch(runtime) {
  if (runtime.searchController) {
    try {
      runtime.searchController.abort();
    } catch {
      /* noop */
    }

    runtime.searchController = null;
  }
}

export function clearSearchState(runtime, getDom = searchGlassRuntime.getDom) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";

  deactivateSearchFocus(getDom);
}

export function getCacheKey(query = "") {
  return normalizeText(query);
}

export function getCached(runtime, query = "") {
  const key = getCacheKey(query);
  const found = runtime.cache.get(key);

  if (!found) return null;

  if (Date.now() - found.createdAt > TOPBAR_SEARCH_CONFIG.cacheTtlMs) {
    runtime.cache.delete(key);
    return null;
  }

  return found.value;
}

export function setCached(runtime, query = "", value = []) {
  const key = getCacheKey(query);

  runtime.cache.set(key, {
    value,
    createdAt: Date.now(),
  });
}

/* =========================================================
   LOCAL INDEX
========================================================= */

export function getLocalIndex() {
  return [
    {
      id: "nav:/",
      type: "nav",
      title: "Inicio",
      subtitle: "Panel principal",
      url: "/",
    },
    {
      id: "nav:/incidencias",
      type: "nav",
      title: "Incidencias",
      subtitle: "Gestión de tickets e incidencias",
      url: "/incidencias",
    },
    {
      id: "nav:/facturas",
      type: "nav",
      title: "Facturas",
      subtitle: "Facturación y documentos",
      url: "/facturas",
    },
    {
      id: "nav:/usuarios",
      type: "nav",
      title: "Usuarios",
      subtitle: "Gestión de usuarios",
      url: "/usuarios",
    },
    {
      id: "nav:/clientes",
      type: "nav",
      title: "Clientes",
      subtitle: "Gestión de clientes",
      url: "/clientes",
    },
    {
      id: "nav:/cuenta",
      type: "nav",
      title: "Cuenta",
      subtitle: "Perfil y datos personales",
      url: "/cuenta",
    },
    {
      id: "nav:/ajustes",
      type: "nav",
      title: "Ajustes",
      subtitle: "Configuración del sistema",
      url: "/ajustes",
    },
    {
      id: "nav:/servidor",
      type: "nav",
      title: "Servidor",
      subtitle: "Estado del servidor",
      url: "/servidor",
    },
  ];
}

export function searchLocal(query = "") {
  const q = normalizeQuery(query);
  if (!q) return [];

  return getLocalIndex()
    .map((item) => {
      const score =
        scoreTextMatch(item.title, q) +
        scoreTextMatch(item.subtitle, q) +
        scoreTextMatch(item.url, q);

      return {
        ...item,
        score,
        source: "local",
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* =========================================================
   API NORMALIZATION
========================================================= */

export function normalizeApiItem(AppCore, raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;

  const type =
    raw.type ||
    raw.entity ||
    raw.kind ||
    raw.group ||
    raw.category ||
    "general";

  const title =
    raw.title ||
    raw.name ||
    raw.nombre ||
    raw.label ||
    raw.username ||
    raw.email ||
    raw.id ||
    "Resultado";

  const subtitle =
    raw.subtitle ||
    raw.description ||
    raw.descripcion ||
    raw.cliente ||
    raw.email ||
    raw.role ||
    raw.estado ||
    raw.status ||
    raw.numero ||
    raw.code ||
    "";

  const url =
    raw.url ||
    raw.path ||
    raw.href ||
    raw.route ||
    raw.to ||
    raw.link ||
    null;

  const id =
    raw.id ||
    raw._id ||
    raw.uuid ||
    `${String(type)}:${String(url || title)}:${index}`;

  if (!title && !url) return null;

  return {
    id: String(id),
    type: String(type || "general").toLowerCase(),
    title: String(title || "Resultado"),
    subtitle: String(subtitle || ""),
    url: url ? safeNormalizePath(AppCore, url) : null,
    raw,
    source: "api",
  };
}

export function normalizeApiPayload(AppCore, data) {
  if (!data) return [];

  const directArray = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : null;

  if (directArray) {
    return directArray
      .map((item, index) => normalizeApiItem(AppCore, item, index))
      .filter(Boolean);
  }

  const groupedKeys = [
    "clientes",
    "usuarios",
    "users",
    "facturas",
    "tickets",
    "incidencias",
    "nav",
    "routes",
    "recentes",
    "recientes",
  ];

  const collected = [];

  groupedKeys.forEach((key) => {
    if (Array.isArray(data?.[key])) {
      data[key].forEach((item, index) => {
        const normalized = normalizeApiItem(
          AppCore,
          { ...item, type: item?.type || key },
          index
        );

        if (normalized) {
          collected.push(normalized);
        }
      });
    }
  });

  return collected;
}

/* =========================================================
   API SEARCH
========================================================= */

export async function searchAPI({
  AppCore,
  runtime,
  query = "",
}) {
  const cached = getCached(runtime, query);
  if (cached) {
    return cached;
  }

  if (!AppCore?.apiClient?.get) {
    return [];
  }

  abortSearch(runtime);
  runtime.searchController = new AbortController();

  try {
    const data = await AppCore.apiClient.get("/api/search", {
      query: { q: query },
      signal: runtime.searchController.signal,
      auth: true,
      timeout: 12000,
    });

    const normalized = normalizeApiPayload(AppCore, data);
    setCached(runtime, query, normalized);

    return normalized;
  } catch (error) {
    if (error?.aborted || error?.name === "AbortError") {
      return [];
    }

    AppCore?.utils?.warn?.("TopbarUI: fallo búsqueda API", error);
    throw error;
  } finally {
    runtime.searchController = null;
  }
}

/* =========================================================
   MERGE
========================================================= */

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged = uniqBy(
    [...apiResults, ...localResults].map((item) => ({
      ...item,
      score: scoreResult(item, query),
    })),
    (item) =>
      `${item.type}|${item.url || ""}|${item.title || ""}|${item.subtitle || ""}`
  );

  return merged
    .filter((item) => item.score > 0 || item.source === "api")
    .sort((a, b) => b.score - a.score)
    .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsTotal);
}

/* =========================================================
   VISUAL STATE
========================================================= */

export function setSearchExpanded(input, expanded = false) {
  if (!input) return;
  input.setAttribute("aria-expanded", String(Boolean(expanded)));
}

export function showResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (!searchResults) return;

  searchResults.hidden = false;
  searchResults.classList.add("active");
  searchResults.setAttribute("aria-hidden", "false");

  setSearchExpanded(searchInput, true);
  activateSearchFocus(runtime, getDom);
}

export function hideResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (searchResults) {
    searchResults.classList.remove("active");
    searchResults.hidden = true;
    searchResults.setAttribute("aria-hidden", "true");
    searchResults.innerHTML = "";
  }

  runtime.activeIndex = -1;
  runtime.currentItems = [];

  setSearchExpanded(searchInput, false);
  deactivateSearchFocus(getDom);
}

export function setLoadingState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-loading" aria-live="polite">
      <div class="search-state-title">Buscando</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query ? `Buscando “${query}”...` : "Buscando..."
        )}
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function setEmptyState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-empty" aria-live="polite">
      <div class="search-state-title">Sin resultados</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query
            ? `No encontramos coincidencias para “${query}”.`
            : "No hay resultados."
        )}
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function setErrorState(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-error" aria-live="polite">
      <div class="search-state-title">No se pudo completar la búsqueda</div>
      <div class="search-state-text">
        Revisa la conexión o inténtalo de nuevo.
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function updateActiveItem(runtime, items = []) {
  items.forEach((el) => el.classList.remove("active"));

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].classList.add("active");
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }
}

export function updateActiveVisuals(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  const items = Array.from(searchResults.querySelectorAll(".search-result"));

  items.forEach((el, index) => {
    const isActive = index === runtime.activeIndex;
    el.classList.toggle("active", isActive);
    el.setAttribute("aria-selected", String(isActive));
  });

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

export function goToResult({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  item = null,
}) {
  if (!item?.url) return;

  const { searchInput } = getDom();

  hideResultsContainer(runtime, getDom);

  if (searchInput) {
    searchInput.blur();
  }

  closeSidebarMobile();

  const target = safeNormalizePath(AppCore, item.url);

  if (typeof Router.navigate === "function") {
    Router.navigate(target, {
      force: true,
    });
    return;
  }

  window.location.href = target;
}

/* =========================================================
   RENDER RESULTS
========================================================= */

export function renderResults({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  results = [],
  query = "",
}) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = "";
  runtime.activeIndex = -1;
  runtime.currentItems = [];

  if (!results.length) {
    setEmptyState(AppCore, runtime, getDom, query);
    return;
  }

  const groups = groupResults(results);
  const fragment = document.createDocumentFragment();

  groups.forEach(([type, items]) => {
    const groupEl = document.createElement("section");
    groupEl.className = "search-group-block";
    groupEl.dataset.group = type;

    const header = document.createElement("div");
    header.className = "search-group";
    header.textContent = getTypeLabel(type);
    groupEl.appendChild(header);

    items
      .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsPerGroup)
      .forEach((item) => {
        const resultEl = document.createElement("button");
        resultEl.type = "button";
        resultEl.className = "search-result";
        resultEl.dataset.type = item.type || "general";
        resultEl.dataset.url = item.url || "";
        resultEl.dataset.index = String(runtime.currentItems.length);
        resultEl.setAttribute("role", "option");
        resultEl.setAttribute("aria-selected", "false");

        resultEl.innerHTML = `
          <span class="search-icon" aria-hidden="true">${escapeHtml(
            AppCore,
            getTypeIcon(item.type)
          )}</span>
          <span class="search-text">
            <span class="search-title">${highlight(
              AppCore,
              item.title || "",
              query
            )}</span>
            ${
              item.subtitle
                ? `<span class="search-subtitle">${highlight(
                    AppCore,
                    item.subtitle || "",
                    query
                  )}</span>`
                : ""
            }
          </span>
        `;

        resultEl.addEventListener("click", () => {
          goToResult({
            AppCore,
            Router,
            runtime,
            getDom,
            closeSidebarMobile,
            item,
          });
        });

        resultEl.addEventListener("mouseenter", () => {
          const idx = Number(resultEl.dataset.index);

          if (!Number.isNaN(idx)) {
            runtime.activeIndex = idx;
            updateActiveVisuals(runtime, getDom);
          }
        });

        runtime.currentItems.push(item);
        groupEl.appendChild(resultEl);
      });

    fragment.appendChild(groupEl);
  });

  searchResults.appendChild(fragment);
  showResultsContainer(runtime, getDom);
}

/* =========================================================
   RUN SEARCH
========================================================= */

export async function runSearch({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  query = "",
}) {
  const q = normalizeQuery(query);
  runtime.currentQuery = q;

  if (!q || q.length < TOPBAR_SEARCH_CONFIG.minQueryLength) {
    hideResultsContainer(runtime, getDom);
    return;
  }

  setLoadingState(AppCore, runtime, getDom, q);

  try {
    const [remote, local] = await Promise.all([
      searchAPI({
        AppCore,
        runtime,
        query: q,
      }),
      Promise.resolve(searchLocal(q)),
    ]);

    if (runtime.currentQuery !== q) {
      return;
    }

    const merged = mergeResults(remote, local, q);

    renderResults({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      results: merged,
      query: q,
    });
  } catch (error) {
    if (runtime.currentQuery !== q) {
      return;
    }

    const local = searchLocal(q);

    if (local.length) {
      renderResults({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        results: local,
        query: q,
      });
      return;
    }

    setErrorState(runtime, getDom);
  }
}
